# Piezas compartidas por respaldar.ps1 y restaurar.ps1: el camino de Windows.
#
# Se carga con punto (`. respaldo-comun.ps1`), no se ejecuta. Vive aparte para
# que el volcado y la restauracion compartan UNA sola comprobacion de que un
# archivo sirve: si cada guion tuviera la suya, el dia que una se afina la otra
# sigue dando por bueno lo que la primera ya rechaza.
#
# Los tres .ps1 van SIN tildes ni enes, igual que los .sh, y no es descuido.
# PowerShell 5.1 lee un .ps1 sin BOM como si fuera ANSI: cualquier caracter
# fuera de ASCII llega roto a las cadenas, y de ahi al registro y a la pantalla.
# Basta un editor que guarde sin BOM -- casi todos, y git al clonar -- para que
# pase sin que nadie haya tocado el guion.
#
# PowerShell 5.1 y nada mas: sin modulos de la galeria. El servidor es un
# Windows de casa sin acceso de administrador por escritorio, y cada dependencia
# que haya que instalar a mano es un respaldo que un dia no corre.

# --- el contrato con el panel --------------------------------------------------
# El nombre del archivo no es cosmetico. `src/lib/respaldos.ts` solo lista lo
# que casa con su PATRON_NOMBRE, y la fecha que ensena la saca de la marca del
# nombre, no del disco. Un nombre que se separe de alli no rompe nada que se
# vea: los respaldos se siguen haciendo cada noche y el panel dice que no hay
# ninguno. tests/unit/respaldoEnWindows.test.ts lee estas lineas y las compara
# con la funcion del panel.
$FORMATO_MARCA = 'yyyyMMdd-HHmmss'
$PLANTILLA_BASE = 'base-{0}.sql.gz'
$PLANTILLA_MEDIOS = 'medios-{0}.tar.gz'
$PATRON_RESPALDO = '^(base|medios)-\d{8}-\d{6}\.(sql\.gz|tar\.gz)$'
# El nombre mientras se escribe y se comprueba; el panel no lo lista.
$PATRON_PARCIAL = '^(base|medios)-\d{8}-\d{6}\.(sql\.gz|tar\.gz)\.parcial$'

# La retencion de scripts/respaldar.sh: `DIAS_A_CONSERVAR:-30` y `find -mtime`.
$DIAS_A_CONSERVAR_POR_DEFECTO = 30

# Lo mismo que respaldar.sh y respaldosServidor.ts: un volcado de verdad nunca
# baja de 1 KB comprimido; menos es un fallo que pg_dump no dijo.
$MINIMO_BASE_BYTES = 1024

# Lo que pg_dump escribe al principio y al final de un volcado en texto plano.
$CABECERA_VOLCADO = '-- PostgreSQL database dump'
$PIE_VOLCADO = '-- PostgreSQL database dump complete'

function Leer-ValorDeEnv {
  param([string]$Archivo, [string]$Clave)
  if (-not (Test-Path -LiteralPath $Archivo -PathType Leaf)) { return $null }
  $valor = $null
  $patron = '^\s*(?:export\s+)?' + [regex]::Escape($Clave) + '\s*=(.*)$'
  foreach ($linea in [IO.File]::ReadAllLines($Archivo)) {
    $m = [regex]::Match($linea, $patron)
    if (-not $m.Success) { continue }
    $v = $m.Groups[1].Value.Trim()
    if ($v.Length -ge 2 -and (($v[0] -eq '"' -and $v[$v.Length - 1] -eq '"') -or
        ($v[0] -eq "'" -and $v[$v.Length - 1] -eq "'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    # Se queda la ultima, no la primera: es la que ve la aplicacion, porque
    # dotenv va pisando las claves repetidas segun las lee.
    $valor = $v
  }
  return $valor
}

function Resolver-Configuracion {
  param([string]$DirectorioApp)
  $archivoEnv = Join-Path $DirectorioApp '.env'
  if (-not (Test-Path -LiteralPath $archivoEnv -PathType Leaf)) {
    throw "No existe $archivoEnv. Sin el no se sabe a que base conectarse."
  }

  # DATABASE_URI sale del .env y de ningun otro sitio. Una DATABASE_URI olvidada
  # en la consola de quien lo lanza a mano -- apuntando a su base de pruebas --
  # no debe poder desviar el respaldo del servidor a otra base.
  $uri = Leer-ValorDeEnv $archivoEnv 'DATABASE_URI'
  if (-not $uri) { throw "Falta DATABASE_URI en $archivoEnv." }

  # RESPALDOS_DIR, en cambio, se resuelve EXACTAMENTE como la resuelve la
  # aplicacion (`directorioDeRespaldos()` en src/lib/respaldosServidor.ts): el
  # entorno del proceso primero, porque Next no pisa lo que ya viene puesto, y
  # despues el .env. Si aqui se leyera en otro orden, los respaldos se escribirian
  # en una carpeta y el panel miraria otra.
  $dir = $env:RESPALDOS_DIR
  if (-not $dir) { $dir = Leer-ValorDeEnv $archivoEnv 'RESPALDOS_DIR' }
  if (-not $dir) { $dir = 'backups' }
  # Relativa a la carpeta de la aplicacion, que es el directorio de trabajo del
  # servicio (AppDirectory en NSSM): el mismo `process.cwd()` que usa el panel.
  if (-not [IO.Path]::IsPathRooted($dir)) { $dir = Join-Path $DirectorioApp $dir }

  $copia = $env:RESPALDOS_COPIA_DIR
  if (-not $copia) { $copia = Leer-ValorDeEnv $archivoEnv 'RESPALDOS_COPIA_DIR' }
  # Relativa, igual que RESPALDOS_DIR. Si no se anclara aqui, Copy-Item la
  # resolveria contra la carpeta de PowerShell y [IO.Path] contra la del
  # proceso, que no tienen por que ser la misma: la copia iria a un sitio y la
  # comprobacion de disco miraria otro.
  if ($copia -and -not [IO.Path]::IsPathRooted($copia)) { $copia = Join-Path $DirectorioApp $copia }
  if ($copia) { $copia = [IO.Path]::GetFullPath($copia) }

  # DIAS_A_CONSERVAR sigue el orden de respaldar.sh, que hace `. ./.env` y por
  # tanto deja que el .env pise al entorno.
  $dias = Leer-ValorDeEnv $archivoEnv 'DIAS_A_CONSERVAR'
  if (-not $dias) { $dias = $env:DIAS_A_CONSERVAR }
  if (-not $dias) { $dias = [string]$DIAS_A_CONSERVAR_POR_DEFECTO }
  # Un valor raro no se interpreta: `find -mtime +3O` falla y el .sh no borra
  # nada, y aqui tampoco. Interpretar mal un numero de dias es borrar respaldos.
  if ($dias -notmatch '^[1-9][0-9]*$') {
    throw "DIAS_A_CONSERVAR vale '$dias' y tiene que ser un numero entero de dias."
  }

  return @{
    ArchivoEnv   = $archivoEnv
    Uri          = $uri
    RespaldosDir = [IO.Path]::GetFullPath($dir)
    CopiaDir     = $copia
    Dias         = [int]$dias
  }
}

function Separar-Uri {
  # Parte la URI en dos: lo que puede ir en la linea de ordenes y la clave, que
  # viaja aparte en PGPASSWORD. La linea de ordenes de un proceso la puede leer
  # cualquiera que liste procesos en la maquina; el entorno, solo su dueno.
  param([string]$Uri)
  $m = [regex]::Match($Uri, '^(postgres(?:ql)?://)(.*)$')
  # El mensaje no repite la URI: con clave dentro, iria a parar al registro.
  if (-not $m.Success) { throw 'DATABASE_URI no tiene la forma postgresql://usuario:clave@maquina:puerto/base.' }
  $esquema = $m.Groups[1].Value
  $resto = $m.Groups[2].Value

  $usuario = ''
  $clave = ''
  # La ULTIMA arroba separa las credenciales de la maquina: una clave generada
  # puede traer arrobas sin escapar, y el nombre de una maquina no.
  $arroba = $resto.LastIndexOf('@')
  if ($arroba -ge 0) {
    $credenciales = $resto.Substring(0, $arroba)
    $resto = $resto.Substring($arroba + 1)
    $dosPuntos = $credenciales.IndexOf(':')
    if ($dosPuntos -ge 0) {
      $usuario = $credenciales.Substring(0, $dosPuntos)
      $clave = [Uri]::UnescapeDataString($credenciales.Substring($dosPuntos + 1))
    } else {
      $usuario = $credenciales
    }
  }

  $sinClave = $esquema + $(if ($usuario) { $usuario + '@' } else { '' }) + $resto
  if ($sinClave.Contains('"')) { throw 'DATABASE_URI contiene comillas dobles fuera de la clave; no se puede pasar a pg_dump con seguridad.' }

  $base = ''
  $mb = [regex]::Match($resto, '/([^/?]+)')
  if ($mb.Success) { $base = [Uri]::UnescapeDataString($mb.Groups[1].Value) }

  return @{ SinClave = $sinClave; Clave = $clave; Base = $base }
}

function Entorno-DePostgres {
  param([hashtable]$Uri)
  $entorno = @{
    # Sin esto, a un pg_dump al que le falta la clave le da por preguntarla, y
    # una tarea programada no tiene a nadie delante: se queda esperando para
    # siempre, sin escribir nada y con la tarea en "En ejecucion". La misma
    # forma del arranque colgado de D-061. `--no-password` lo refuerza.
    PGCONNECT_TIMEOUT = '30'
    PGAPPNAME         = 'respaldo-traumahub'
  }
  if ($Uri.Clave) { $entorno['PGPASSWORD'] = $Uri.Clave }
  return $entorno
}

function Ocultar-Secretos {
  # Todo texto que llegue a la pantalla o al registro pasa por aqui. pg_dump no
  # suele repetir la clave en sus errores, pero "no suele" no es una garantia, y
  # un registro se copia, se pega en un chat y se manda por correo.
  param([string]$Texto, [string[]]$Secretos)
  if (-not $Texto) { return '' }
  foreach ($s in $Secretos) {
    if (-not $s) { continue }
    $Texto = $Texto.Replace($s, '***')
    $escapado = [Uri]::EscapeDataString($s)
    if ($escapado -ne $s) { $Texto = $Texto.Replace($escapado, '***') }
  }
  # Y cualquier otra URI con credenciales, venga de donde venga.
  $Texto = [regex]::Replace($Texto, '(://[^:/@\s]*:)[^\s]*@', '$1***@')
  # Una ejecucion, una linea: el registro se lee con Get-Content -Tail.
  return ([regex]::Replace($Texto, '\s*[\r\n]+\s*', ' | ')).Trim()
}

function ConvertTo-ArgumentoWindows {
  # Las reglas de comillas con las que un programa de Windows parte su linea de
  # ordenes: las barras solo cuentan delante de una comilla o al final.
  param([string]$Valor)
  $v = [regex]::Replace($Valor, '(\\*)"', '$1$1\"')
  $v = [regex]::Replace($v, '(\\+)$', '$1$1')
  return '"' + $v + '"'
}

function Invocar-Proceso {
  # Se lanza con System.Diagnostics.Process y no con `&` por dos razones. La
  # primera: PowerShell 5.1 hace pasar la salida de un programa por su tuberia
  # de texto, que la recodifica, y un volcado con tildes llega con signos de
  # interrogacion. La segunda: con $ErrorActionPreference = 'Stop', cualquier
  # linea en stderr de un programa se convierte en excepcion aunque termine bien.
  param(
    [string]$Ruta,
    [string[]]$Argumentos = @(),
    [hashtable]$Entorno = @{},
    [IO.Stream]$Salida = $null,
    [IO.Stream]$Entrada = $null
  )
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $Ruta
  $info.Arguments = (@($Argumentos | ForEach-Object { ConvertTo-ArgumentoWindows $_ })) -join ' '
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.RedirectStandardInput = ($null -ne $Entrada)
  # Solo en el entorno del hijo: nada de esto queda en el de este proceso ni en
  # ningun archivo.
  foreach ($k in $Entorno.Keys) { $info.EnvironmentVariables[$k] = [string]$Entorno[$k] }

  $proceso = [Diagnostics.Process]::Start($info)
  # stderr se lee en paralelo desde el primer momento. Si se leyera al final,
  # un programa que escribe mucho en stderr llena el conducto y se bloquea
  # esperando a que alguien lo vacie, mientras aqui se espera a que termine.
  $errores = $proceso.StandardError.ReadToEndAsync()
  $texto = $null
  if ($null -ne $Salida) {
    $proceso.StandardOutput.BaseStream.CopyTo($Salida)
  } else {
    $texto = $proceso.StandardOutput.ReadToEndAsync()
  }
  if ($null -ne $Entrada) {
    try { $Entrada.CopyTo($proceso.StandardInput.BaseStream) }
    finally { $proceso.StandardInput.Close() }
  }
  $proceso.WaitForExit()
  return @{
    Codigo  = $proceso.ExitCode
    Errores = $errores.Result
    Texto   = $(if ($texto) { $texto.Result } else { '' })
  }
}

function Resolver-Binario {
  # Primero el .exe de la instalacion. Si no esta, un .cmd con el mismo nombre:
  # es como se envuelve un pg_dump que vive en un contenedor (`docker exec`), y
  # es como se prueban estos guiones en una maquina sin PostgreSQL instalado.
  param([string]$Directorio, [string]$Nombre)
  foreach ($extension in '.exe', '.cmd') {
    $ruta = Join-Path $Directorio ($Nombre + $extension)
    if (Test-Path -LiteralPath $ruta -PathType Leaf) { return $ruta }
  }
  throw "No se encuentra $Nombre.exe en $Directorio. Si PostgreSQL cambio de version o de carpeta, pase -BinPostgres."
}

function Ruta-DeTar {
  # El tar.exe de Windows (bsdtar), que viene con el sistema desde Windows 10
  # 1803. Se pide por ruta completa: en una maquina con Git instalado, el `tar`
  # del PATH puede ser el de Git Bash, que no entiende `C:\` como ruta.
  $tar = Join-Path $env:SystemRoot 'System32\tar.exe'
  if (-not (Test-Path -LiteralPath $tar -PathType Leaf)) { throw "No se encuentra $tar." }
  return $tar
}

function Probar-Volcado {
  # Descomprime el volcado ENTERO y exige tres cosas: la cabecera y el pie de
  # pg_dump, el pie del gzip, y que la clave de \restrict se cierre al final.
  #
  # No vale `pg_restore --list`: el volcado es texto plano, el mismo formato de
  # respaldar.sh, porque es el que restaurar.sh sabe cargar con psql, y
  # pg_restore solo lee los formatos propios de pg_dump. Y no vale fiarse de que
  # la descompresion no falle: el GZipStream de .NET Framework SI detecta un
  # byte cambiado (comprueba el CRC cuando lo encuentra), pero un archivo
  # CORTADO lo lee hasta donde llega y termina sin error, porque si falta el pie
  # del gzip no lo exige. Comprobado: un .gz truncado al 70 % se leyo "entero"
  # sin una sola excepcion. Justo el caso de un disco que se llena a mitad, o de
  # una copia a RESPALDOS_COPIA_DIR que se interrumpe.
  #
  # El pie de pg_dump no basta para cazarlo, y esto tambien se comprobo con un
  # volcado real de PostgreSQL 17.11. Desde 17.6, pg_dump escribe DETRAS del
  # pie la linea `\unrestrict CLAVE`, asi que cortar los ultimos bytes se lleva
  # la clave y deja el pie intacto: el archivo pasaba esta comprobacion, llegaba
  # a psql y fallaba al final con "\unrestrict: wrong key". Y cortar solo los 8
  # bytes del pie del gzip no se lleva ni eso: .NET devuelve el SQL completo.
  # `gzip -t` rechaza los dos; de ahi las dos comprobaciones de abajo.
  param([string]$Ruta)
  $archivo = [IO.File]::OpenRead($Ruta)
  $gzip = New-Object IO.Compression.GZipStream($archivo, [IO.Compression.CompressionMode]::Decompress)
  $tamCola = 8192
  $bufer = New-Object byte[] 65536
  $cabeza = New-Object IO.MemoryStream
  $cola = New-Object byte[] 0
  $total = [long]0
  try {
    while (($leidos = $gzip.Read($bufer, 0, $bufer.Length)) -gt 0) {
      $total += $leidos
      if ($cabeza.Length -lt 4096) { $cabeza.Write($bufer, 0, [Math]::Min($leidos, 4096)) }
      # La cola son los ultimos 8 KB, aunque caigan a caballo de dos lecturas.
      $juntos = New-Object byte[] ($cola.Length + $leidos)
      [Array]::Copy($cola, 0, $juntos, 0, $cola.Length)
      [Array]::Copy($bufer, 0, $juntos, $cola.Length, $leidos)
      $n = [Math]::Min($tamCola, $juntos.Length)
      $cola = New-Object byte[] $n
      [Array]::Copy($juntos, $juntos.Length - $n, $cola, 0, $n)
    }
  } catch {
    throw "El volcado esta danado y no se puede descomprimir: $(Mensaje-DeFondo $_.Exception)"
  } finally {
    $gzip.Dispose()
    $archivo.Dispose()
  }
  # El pie del gzip, a mano, ya que .NET no lo exige: sus 4 ultimos bytes son
  # ISIZE, el tamano descomprimido modulo 2^32 en little-endian (RFC 1952). En
  # un archivo cortado esos 4 bytes son otra cosa -- el CRC, o datos
  # comprimidos -- y no cuadran. El CRC32 no se recalcula: en PowerShell puro
  # seria un bucle byte a byte sobre cientos de megas, y el tamano ya delata el
  # corte. Tambien rechaza un gzip de varios miembros concatenados, y hace
  # bien: .NET Framework solo lee el primero, asi que restaurar.ps1 cargaria
  # la base a medias. gzip -9 y este guion escriben siempre un miembro solo.
  #
  # Va ANTES que la cabecera y el pie de pg_dump porque es el diagnostico mas
  # preciso. Con un volcado pequeno, .NET no entrega nada de un bloque deflate
  # cortado, y un archivo al que le faltaban 20 bytes salia como "no empieza
  # como un volcado de PostgreSQL": verdad a medias que manda a buscar el
  # problema donde no esta.
  $flujoPie = [IO.File]::OpenRead($Ruta)
  try {
    # 10 de cabecera y 8 de pie: menos no es un gzip, y Seek(-4) fallaria.
    if ($flujoPie.Length -lt 18) { throw 'El volcado esta cortado: no llega ni al tamano de un gzip vacio.' }
    $pie = New-Object byte[] 4
    [void]$flujoPie.Seek(-4, [IO.SeekOrigin]::End)
    $leidosPie = 0
    while ($leidosPie -lt 4) {
      $n = $flujoPie.Read($pie, $leidosPie, 4 - $leidosPie)
      if ($n -le 0) { break }
      $leidosPie += $n
    }
  } finally {
    $flujoPie.Dispose()
  }
  if ([BitConverter]::ToUInt32($pie, 0) -ne [uint32]($total % 4294967296)) {
    throw 'El volcado esta cortado: el pie del gzip no cuadra con lo descomprimido.'
  }

  $textoCabeza = [Text.Encoding]::UTF8.GetString($cabeza.ToArray())
  $textoCola = [Text.Encoding]::UTF8.GetString($cola)
  if (-not $textoCabeza.Contains($CABECERA_VOLCADO)) {
    throw 'El archivo no empieza como un volcado de PostgreSQL.'
  }
  if (-not $textoCola.Contains($PIE_VOLCADO)) {
    throw 'El volcado esta incompleto: no termina con el pie que escribe pg_dump al acabar.'
  }

  # La clave de \restrict. Un volcado de pg_dump 17.6 o posterior abre con
  # `\restrict CLAVE` y cierra con `\unrestrict CLAVE`, la misma. Si el cierre
  # falta o no casa, psql lo descubre en la ULTIMA linea, despues de haber
  # borrado y recargado la base entera dentro de la transaccion: revierte, pero
  # con la aplicacion ya parada y el operador creyendo que tenia un respaldo.
  # Aqui se descubre antes de tocar nada. Si la cabecera no trae \restrict, es
  # de un pg_dump anterior a 17.6, y no se exige.
  $mRestrict = [regex]::Match($textoCabeza, '(?m)^\\restrict (\S+)')
  if ($mRestrict.Success) {
    $cierre = '(?m)^\\unrestrict ' + [regex]::Escape($mRestrict.Groups[1].Value) + '\s*$'
    if ($textoCola -notmatch $cierre) {
      throw 'El volcado esta cortado: falta el \unrestrict con la clave del \restrict del principio.'
    }
  }
  return $total
}

function Probar-Medios {
  # `tar -t` recorre el archivo entero; a diferencia de .NET, bsdtar si protesta
  # ante uno cortado ("Truncated input file") y sale con codigo distinto de cero.
  param([string]$Ruta, [string]$Tar)
  $r = Invocar-Proceso -Ruta $Tar -Argumentos @('-tzf', $Ruta)
  if ($r.Codigo -ne 0) { throw "El archivo de medios no se puede leer: $($r.Errores)" }
}

function Aplicar-Retencion {
  # La regla de respaldar.sh, traducida con cuidado: `find -mtime +30` cuenta
  # los dias enteros desde la ultima escritura TIRANDO la fraccion, y borra si
  # ese numero pasa de 30. Es decir, a partir de los 31 dias cumplidos, no de
  # los 30 y un minuto. Se cuenta por la fecha del archivo y no por la del
  # nombre, igual que find.
  #
  # Solo toca lo que casa con el patron del panel: el directorio de respaldos
  # puede ser una carpeta compartida, y un `*.gz` a secas se llevaria lo ajeno.
  # Devuelve los nombres retirados.
  param([string]$Directorio, [int]$Dias)
  $ahora = Get-Date
  foreach ($f in @(Get-ChildItem -LiteralPath $Directorio -File)) {
    if ($f.Name -notmatch $PATRON_RESPALDO) { continue }
    $diasEnteros = [Math]::Floor(($ahora - $f.LastWriteTime).TotalDays)
    if ($diasEnteros -gt $Dias) {
      Remove-Item -LiteralPath $f.FullName -Force
      $f.Name
    }
  }
}

function Disco-DeRuta {
  # Una etiqueta que es la misma para dos rutas del mismo disco FISICO. No basta
  # comparar la letra: el Windows de un portatil de casa suele traer un solo
  # disco partido en C: y D:, y una copia en D: muere con el mismo disco que la
  # base en C:. Win32_DiskPartition dice a que disco pertenece cada particion,
  # sin modulos, sin administrador y en menos de un segundo; Get-Partition dice
  # lo mismo pero tardo 19 s en cargar la primera vez, en esta misma maquina.
  #
  # Si no se puede averiguar (un subst, un disco dinamico, una unidad que
  # SYSTEM no ve), se queda con la letra: entonces solo distingue letras, y
  # puede dar por buena una particion hermana. Es el caso menos probable, y
  # no avisar nunca por eso seria peor que avisar a veces de menos.
  param([string]$Ruta)
  $raiz = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Ruta))
  # \\maquina\recurso: otra maquina, otro disco.
  if ($raiz.StartsWith('\\')) { return 'red ' + $raiz.TrimEnd('\').ToLowerInvariant() }
  $letra = $raiz.Substring(0, 2).ToUpperInvariant()
  try {
    $logico = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='$letra'" -ErrorAction Stop
    if ($logico) {
      $indices = @(Get-CimAssociatedInstance -InputObject $logico -ResultClassName Win32_DiskPartition -ErrorAction Stop |
        ForEach-Object { $_.DiskIndex } | Sort-Object -Unique)
      if ($indices.Count -gt 0) { return 'disco ' + ($indices -join '+') }
    }
  } catch { }
  return 'unidad ' + $letra
}

function Riesgo-DeLaCopia {
  # Devuelve $null si hay copia en otro disco, o por que no la hay, en una
  # frase que cabe en la linea del registro.
  #
  # Existe porque "si el disco falla, no hay copia" era el problema que habia
  # que resolver, y RESPALDOS_DIR vive por defecto en la carpeta de la
  # aplicacion, en el mismo disco que la base. Sin este aviso, la tarea escribe
  # OK cada noche, el instalador dice "Funciona", y la unica copia muere con el
  # disco que se queria proteger. Un aviso en la documentacion no lo lee nadie
  # a las 03:00; uno en cada linea del registro, si.
  #
  # Se comparan con la copia la carpeta de respaldos, la de la aplicacion (los
  # medios) y la de PostgreSQL (la base vive junto a sus binarios).
  param([hashtable]$Conf, [string]$DirectorioApp, [string]$BinPostgres)
  if (-not $Conf.CopiaDir) {
    return 'sin copia fuera del disco: RESPALDOS_COPIA_DIR no esta puesta en .env'
  }
  $discoCopia = Disco-DeRuta $Conf.CopiaDir
  foreach ($ruta in @($Conf.RespaldosDir, $DirectorioApp, $BinPostgres)) {
    if (-not $ruta) { continue }
    if ((Disco-DeRuta $ruta) -eq $discoCopia) {
      return "sin copia fuera del disco: RESPALDOS_COPIA_DIR ($([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Conf.CopiaDir)))) esta en el mismo $discoCopia que $ruta"
    }
  }
  return $null
}

function Mensaje-DeFondo {
  # PowerShell envuelve la excepcion de un metodo de .NET en otra que solo dice
  # "Excepcion al llamar a Read"; la causa esta en la mas interna.
  param([Exception]$Excepcion)
  while ($null -ne $Excepcion.InnerException) { $Excepcion = $Excepcion.InnerException }
  return $Excepcion.Message
}

function Escribir-Registro {
  param([string]$DirectorioApp, [string]$Linea)
  try {
    $carpeta = Join-Path $DirectorioApp 'registros'
    New-Item -ItemType Directory -Force -Path $carpeta | Out-Null
    # UTF-8 sin BOM y anadiendo: Add-Content -Encoding UTF8 de PowerShell 5.1
    # mete un BOM al crear el archivo, y el primer renglon sale con basura.
    [IO.File]::AppendAllText((Join-Path $carpeta 'respaldos.log'), $Linea + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
  } catch {
    [Console]::Error.WriteLine("No se pudo escribir en registros\respaldos.log: $($_.Exception.Message)")
  }
}

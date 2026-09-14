<#
Respaldo de la base y de los archivos subidos en el servidor Windows.

El gemelo de scripts/respaldar.sh para la maquina que no tiene Docker
(docs/SERVIDOR-WINDOWS.md). Produce los mismos dos archivos, con el mismo
nombre, en el mismo formato y con la misma retencion, para que el panel los
liste sin saber de donde vienen y para que un volcado hecho aqui se pueda
restaurar alli y al reves.

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\respaldar.ps1

Lo lanza cada noche la tarea que registra instalar-respaldo-programado.ps1,
pero tambien sirve a mano antes de una maniobra arriesgada: cada ejecucion
crea sus propios archivos fechados.

Que hace, en orden:
  1. Lee DATABASE_URI del .env de la aplicacion en el momento de ejecutarse.
  2. Vuelca la base con pg_dump (texto plano, --clean --if-exists) comprimido
     en gzip: base-AAAAMMDD-HHMMSS.sql.gz.
  3. Lo descomprime entero y exige cabecera y pie de pg_dump. Si no los tiene,
     lo borra y termina con error.
  4. Empaqueta la carpeta medios (staticDir de Medios y de Modelos3D):
     medios-AAAAMMDD-HHMMSS.tar.gz, y comprueba que se lee.
  5. Si RESPALDOS_COPIA_DIR esta puesta, copia los dos alli. Si no lo esta, o
     esta en el mismo disco fisico que la base, lo avisa en la linea del
     registro: ese respaldo no sobrevive a que el disco falle.
  6. Descarta los respaldos de mas de DIAS_A_CONSERVAR dias (30).
  7. Deja una linea en registros\respaldos.log, sin secretos.

Codigo de salida: 0 si todo salio bien, 1 si algo fallo. La linea del registro
dice que.

Variables (en el .env de la aplicacion, o en el entorno):
  RESPALDOS_DIR        donde se escriben; la misma que lee el panel
  DIAS_A_CONSERVAR     cuantos dias se guardan (30)
  RESPALDOS_COPIA_DIR  segunda carpeta, idealmente en OTRO disco
#>
[CmdletBinding()]
param(
  # La carpeta de la aplicacion. Por defecto, la que contiene a scripts\.
  [string]$DirectorioApp,
  # Donde estan pg_dump y compania. Cambia con cada version mayor de PostgreSQL.
  [string]$BinPostgres = 'C:\PostgreSQL\17\bin',
  # Lo usa restaurar.ps1 para su respaldo previo: la retencion podria llevarse
  # el mismo archivo antiguo que se esta a punto de restaurar.
  [switch]$SinRetencion
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'respaldo-comun.ps1')

if (-not $DirectorioApp) { $DirectorioApp = Split-Path -Parent $PSScriptRoot }
$DirectorioApp = [IO.Path]::GetFullPath($DirectorioApp)

$inicio = Get-Date
$marca = $inicio.ToString($FORMATO_MARCA)
$nombreBase = $PLANTILLA_BASE -f $marca
$nombreMedios = $PLANTILLA_MEDIOS -f $marca

$secretos = @()
$hechos = New-Object System.Collections.Generic.List[string]
$avisos = New-Object System.Collections.Generic.List[string]
$parciales = New-Object System.Collections.Generic.List[string]
$publicados = New-Object System.Collections.Generic.List[string]
$estado = 'ERROR'
$detalle = ''

function Paso([string]$Texto) { Write-Host "==> $Texto" }

try {
  $conf = Resolver-Configuracion $DirectorioApp
  $uri = Separar-Uri $conf.Uri
  # Se apuntan antes de hacer nada que pueda fallar: desde aqui, cualquier
  # mensaje que salga pasa por Ocultar-Secretos con estas dos cadenas.
  $secretos = @($conf.Uri, $uri.Clave)

  $pgDump = Resolver-Binario $BinPostgres 'pg_dump'
  $tar = Ruta-DeTar
  $dir = $conf.RespaldosDir
  New-Item -ItemType Directory -Force -Path $dir | Out-Null

  # Se escribe con un nombre que el panel NO lista y se renombra solo cuando el
  # archivo esta comprobado. respaldar.sh escribe directamente con el nombre
  # bueno y lo borra si falla, pero si lo que falla es la luz, la trampa no
  # llega a correr y queda un volcado cortado con nombre de respaldo valido. Un
  # .parcial huerfano no engana a nadie, y el siguiente respaldo lo retira.
  # Solo si tiene mas de un dia: uno reciente puede ser de otra ejecucion que
  # sigue en marcha, lanzada a mano mientras corria la tarea.
  foreach ($f in @(Get-ChildItem -LiteralPath $dir -File -Filter '*.parcial')) {
    if ($f.Name -match $PATRON_PARCIAL -and $f.LastWriteTime -lt $inicio.AddDays(-1)) {
      Remove-Item -LiteralPath $f.FullName -Force
    }
  }

  # --- la base -----------------------------------------------------------------
  Paso 'Volcando la base de datos'
  $parcialBase = Join-Path $dir ($nombreBase + '.parcial')
  $parciales.Add($parcialBase)

  $archivo = [IO.File]::Create($parcialBase)
  $gzip = New-Object IO.Compression.GZipStream($archivo, [IO.Compression.CompressionLevel]::Optimal)
  try {
    # --clean --if-exists: el mismo volcado de respaldar.sh, que al cargarse
    # borra lo que haya y lo rehace, y por eso restaurar.sh y restaurar.ps1 lo
    # aceptan tal cual. --no-password: ver Entorno-DePostgres.
    $r = Invocar-Proceso -Ruta $pgDump `
      -Argumentos @('--clean', '--if-exists', '--no-password', "--dbname=$($uri.SinClave)") `
      -Entorno (Entorno-DePostgres $uri) -Salida $gzip
  } finally {
    # Cerrar el gzip es lo que escribe su pie; sin esto el archivo queda cortado.
    $gzip.Dispose()
    $archivo.Dispose()
  }
  if ($r.Codigo -ne 0) {
    throw "pg_dump termino con codigo $($r.Codigo): $($r.Errores)"
  }

  $bytesBase = (Get-Item -LiteralPath $parcialBase).Length
  if ($bytesBase -lt $MINIMO_BASE_BYTES) {
    throw "El volcado pesa $bytesBase bytes: demasiado poco para ser correcto."
  }

  Paso 'Comprobando que el volcado se puede leer'
  # Un respaldo que no restaura es peor que ninguno: da la tranquilidad de
  # tenerlo hasta el dia en que hace falta.
  $bytesSql = Probar-Volcado $parcialBase
  Move-Item -LiteralPath $parcialBase -Destination (Join-Path $dir $nombreBase)
  $parciales.Remove($parcialBase) | Out-Null
  $publicados.Add((Join-Path $dir $nombreBase))
  $hechos.Add("$nombreBase ($bytesBase bytes)")
  Write-Host "    $nombreBase ($bytesBase bytes, $bytesSql sin comprimir)"

  # --- los archivos subidos ----------------------------------------------------
  Paso 'Respaldando los archivos subidos'
  # Es lo unico irreemplazable: la base se puede volver a escribir, las
  # imagenes y los modelos 3D que subio el traumatologo no. `staticDir` es
  # 'medios' en Medios y 'medios/modelos' en Modelos3D, relativos al directorio
  # de trabajo del servicio: con uno basta para los dos.
  $carpetaMedios = Join-Path $DirectorioApp 'medios'
  if (-not (Test-Path -LiteralPath $carpetaMedios -PathType Container)) {
    # El repositorio trae medios\.gitkeep, asi que la carpeta existe desde el
    # primer clon. Si falta, lo que esta mal es la ruta, no el contenido, y
    # respaldar.sh tampoco sale en silencio de este caso.
    throw "No existe $carpetaMedios. La base SI quedo respaldada ($nombreBase); los medios NO."
  }
  # Lo que decide si hay medios es si hay archivos, no el peso del .tar.gz:
  # respaldar.sh mira que pese menos de 200 bytes, y una sola miniatura SVG
  # puede quedar por debajo.
  $alguno = Get-ChildItem -LiteralPath $carpetaMedios -Recurse -File -Force |
    Where-Object { $_.Name -ne '.gitkeep' } | Select-Object -First 1
  if (-not $alguno) {
    Write-Host '    sin archivos subidos todavia'
    $hechos.Add('sin medios todavia')
  } else {
    $parcialMedios = Join-Path $dir ($nombreMedios + '.parcial')
    $parciales.Add($parcialMedios)
    # -C y 'medios': dentro del archivo las rutas quedan como medios/..., igual
    # que el `tar czf - -C /app medios` de respaldar.sh, y se restauran con -C
    # sobre la carpeta de la aplicacion.
    $r = Invocar-Proceso -Ruta $tar -Argumentos @('-czf', $parcialMedios, '-C', $DirectorioApp, 'medios')
    if ($r.Codigo -ne 0) {
      throw "tar termino con codigo $($r.Codigo): $($r.Errores) La base SI quedo respaldada ($nombreBase); los medios NO."
    }
    try { Probar-Medios $parcialMedios $tar }
    catch { throw "$($_.Exception.Message) La base SI quedo respaldada ($nombreBase); los medios NO." }
    Move-Item -LiteralPath $parcialMedios -Destination (Join-Path $dir $nombreMedios)
    $parciales.Remove($parcialMedios) | Out-Null
    $publicados.Add((Join-Path $dir $nombreMedios))
    $bytesMedios = (Get-Item -LiteralPath (Join-Path $dir $nombreMedios)).Length
    $hechos.Add("$nombreMedios ($bytesMedios bytes)")
    Write-Host "    $nombreMedios ($bytesMedios bytes)"
  }

  # --- la copia fuera del disco ------------------------------------------------
  if ($conf.CopiaDir) {
    Paso 'Copiando a la segunda carpeta'
    # Un respaldo en el mismo disco que la base protege del error, no de que el
    # disco muera. Como el COPIA_REMOTA de respaldar.sh, que falle no invalida
    # el respaldo local, que existe y esta comprobado: se avisa y se sigue.
    try {
      New-Item -ItemType Directory -Force -Path $conf.CopiaDir | Out-Null
      # Los .parcial de una copia a la que se le fue la luz, con la misma regla
      # del dia que arriba. Aqui dentro y no con los de RESPALDOS_DIR: si el USB
      # no esta, listar su carpeta falla, y eso no puede tumbar el respaldo.
      foreach ($f in @(Get-ChildItem -LiteralPath $conf.CopiaDir -File -Filter '*.parcial')) {
        if ($f.Name -match $PATRON_PARCIAL -and $f.LastWriteTime -lt $inicio.AddDays(-1)) {
          Remove-Item -LiteralPath $f.FullName -Force
        }
      }
      foreach ($p in $publicados) {
        # Con .parcial y renombrando, por lo mismo que en RESPALDOS_DIR: un USB
        # que se desenchufa a mitad dejaba alli un archivo cortado con nombre de
        # respaldo bueno, y esa carpeta es justo la que se usa el dia que el
        # disco principal ya no esta. Se compara el tamano antes de renombrar,
        # que es lo que se pierde al cortar; el contenido ya se comprobo.
        $destino = Join-Path $conf.CopiaDir (Split-Path -Leaf $p)
        $parcialCopia = $destino + '.parcial'
        $parciales.Add($parcialCopia)
        Copy-Item -LiteralPath $p -Destination $parcialCopia -Force
        $esperado = (Get-Item -LiteralPath $p).Length
        $copiado = (Get-Item -LiteralPath $parcialCopia).Length
        if ($copiado -ne $esperado) { throw "la copia de $(Split-Path -Leaf $p) quedo con $copiado bytes de $esperado" }
        Move-Item -LiteralPath $parcialCopia -Destination $destino -Force
        $parciales.Remove($parcialCopia) | Out-Null
      }
      # La misma retencion alli: sin ella, la segunda carpeta se llena y la
      # copia empieza a fallar justo cuando mas tiempo lleva sin mirarse.
      $retiradosCopia = @()
      if (-not $SinRetencion) { $retiradosCopia = @(Aplicar-Retencion $conf.CopiaDir $conf.Dias) }
      $hechos.Add("copia en $($conf.CopiaDir) (retirados $($retiradosCopia.Count))")
      Write-Host "    copiado a $($conf.CopiaDir)"
    } catch {
      $avisos.Add("AVISO la copia a $($conf.CopiaDir) fallo: $($_.Exception.Message)")
      Write-Host "    no se pudo copiar a $($conf.CopiaDir); el respaldo local si esta"
    }
  }
  # Con o sin copia, se dice cada noche si hay algo fuera del disco. No hace
  # fallar el respaldo, que es bueno y protege del borrado; pero sin esta linea
  # el registro diria OK durante anos a quien cree estar protegido de que el
  # disco muera, y no lo esta.
  $riesgo = Riesgo-DeLaCopia $conf $DirectorioApp $BinPostgres
  if ($riesgo) {
    $avisos.Add("AVISO $riesgo")
    Write-Host "    AVISO: $riesgo"
  }

  # --- retencion ---------------------------------------------------------------
  # Solo despues de un respaldo bueno, igual que en respaldar.sh, donde `morir`
  # sale antes de llegar aqui. Si los respaldos llevaran un mes fallando, una
  # retencion que corriera igual se llevaria el ultimo que sirve.
  if ($SinRetencion) {
    $hechos.Add('sin retencion')
  } else {
    Paso "Descartando respaldos de mas de $($conf.Dias) dias"
    $retirados = @(Aplicar-Retencion $dir $conf.Dias)
    foreach ($n in $retirados) { Write-Host "    $n" }
    $hechos.Add("retirados $($retirados.Count)")
  }

  $estado = 'OK'
} catch {
  $detalle = Ocultar-Secretos $_.Exception.Message $secretos
  [Console]::Error.WriteLine("ERROR: $detalle")
} finally {
  # Lo que se quedo a medias no se deja: ni siquiera con nombre .parcial.
  foreach ($p in $parciales) {
    if (Test-Path -LiteralPath $p) { Remove-Item -LiteralPath $p -Force -ErrorAction SilentlyContinue }
  }
}

$segundos = [int]((Get-Date) - $inicio).TotalSeconds
$partes = @($inicio.ToString('yyyy-MM-dd HH:mm:ss'), $estado, "como $([Environment]::UserName)") +
  @($hechos) + @($avisos | ForEach-Object { Ocultar-Secretos $_ $secretos }) + @("$segundos s")
if ($detalle) { $partes += $detalle }
Escribir-Registro $DirectorioApp ($partes -join '  ')

if ($estado -eq 'OK') {
  Write-Host ''
  Write-Host "Respaldo completado en $segundos s."
  exit 0
}
exit 1

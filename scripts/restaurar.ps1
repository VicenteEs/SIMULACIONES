<#
Restauracion de un respaldo en el servidor Windows.

ESTE GUION SOBRESCRIBE LA BASE DE DATOS. Pide confirmacion escrita y, antes de
tocar nada, respalda el estado actual con respaldar.ps1: si la restauracion no
era la que se queria, todavia hay a donde volver.

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restaurar.ps1 base-20260914-030000.sql.gz

El archivo se busca tal cual y, si no esta, en RESPALDOS_DIR. Si junto a el hay
un medios-<misma marca>.tar.gz, se restauran tambien los archivos subidos.

Es el gemelo de scripts/restaurar.sh y hace lo mismo en el mismo orden:
comprobar el archivo, confirmar, respaldar lo actual, parar la aplicacion,
cargar el volcado en UNA transaccion, contar cuentas, restaurar medios y volver
a levantar la aplicacion pase lo que pase.

Un respaldo que nunca se restauro no es un respaldo.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Archivo,
  [string]$DirectorioApp,
  [string]$BinPostgres = 'C:\PostgreSQL\17\bin',
  # El servicio NSSM de la aplicacion (docs/SERVIDOR-WINDOWS.md).
  [string]$Servicio = 'traumahub',
  # Para una copia sin servicio, como la de las pruebas. En el servidor no se usa:
  # restaurar con la aplicacion escribiendo encima deja la base entre dos versiones.
  [switch]$SinServicio,
  # Cuando lo actual no merece guardarse o no se puede volcar -- una base
  # destrozada es justo cuando se restaura --, y el respaldo previo fallaria.
  [switch]$SinRespaldoPrevio,
  # No pregunta. Para quien lo lanza desde otro guion sabiendo lo que hace.
  [switch]$Confirmado
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'respaldo-comun.ps1')

if (-not $DirectorioApp) { $DirectorioApp = Split-Path -Parent $PSScriptRoot }
$DirectorioApp = [IO.Path]::GetFullPath($DirectorioApp)

function Paso([string]$Texto) { Write-Host "==> $Texto" }

$inicio = Get-Date
$secretos = @()
$detenido = $false
$estado = 'RESTAURACION-ERROR'
$detalle = ''
$hechos = New-Object System.Collections.Generic.List[string]
$avisos = New-Object System.Collections.Generic.List[string]

try {
  $conf = Resolver-Configuracion $DirectorioApp
  $uri = Separar-Uri $conf.Uri
  $secretos = @($conf.Uri, $uri.Clave)
  $psql = Resolver-Binario $BinPostgres 'psql'
  $tar = Ruta-DeTar

  $ruta = $Archivo
  if (-not (Test-Path -LiteralPath $ruta -PathType Leaf)) { $ruta = Join-Path $conf.RespaldosDir $Archivo }
  if (-not (Test-Path -LiteralPath $ruta -PathType Leaf)) {
    throw "No existe $Archivo, ni tal cual ni en $($conf.RespaldosDir)."
  }
  $ruta = (Resolve-Path -LiteralPath $ruta).ProviderPath
  $nombre = Split-Path -Leaf $ruta
  $hechos.Add($nombre)

  Paso 'Comprobando el archivo antes de tocar nada'
  $bytesSql = Probar-Volcado $ruta
  Write-Host "    el volcado es valido ($bytesSql bytes sin comprimir)"

  # Los medios de la MISMA marca, como en restaurar.sh: los de otro dia junto a
  # esta base dejan fichas apuntando a archivos que no existen.
  $medios = $null
  $m = [regex]::Match($nombre, '^base-(\d{8}-\d{6})\.sql\.gz$')
  if ($m.Success) {
    $candidato = Join-Path (Split-Path -Parent $ruta) ($PLANTILLA_MEDIOS -f $m.Groups[1].Value)
    if (Test-Path -LiteralPath $candidato -PathType Leaf) {
      Probar-Medios $candidato $tar
      $medios = $candidato
      Write-Host "    y sus medios: $(Split-Path -Leaf $candidato)"
    }
  }

  Write-Host ''
  Write-Host "Se va a SOBRESCRIBIR la base '$($uri.Base)' con el contenido de:"
  Write-Host "    $ruta  ($((Get-Item -LiteralPath $ruta).Length) bytes)"
  if ($medios) { Write-Host "y a escribir encima de $DirectorioApp\medios lo que traiga $(Split-Path -Leaf $medios)." }
  Write-Host ''
  if (-not $Confirmado) {
    $respuesta = Read-Host 'Escriba RESTAURAR para continuar'
    if ($respuesta -cne 'RESTAURAR') { throw 'Cancelado: no se escribio RESTAURAR.' }
  }

  if (-not $SinRespaldoPrevio) {
    Paso 'Respaldando el estado actual por si acaso'
    # Con respaldar.ps1 entero y no con un pg_dump suelto: los medios se van a
    # pisar, y el estado previo son la base Y los archivos. Sin retencion,
    # porque podria llevarse el mismo archivo que se esta restaurando si tiene
    # mas de treinta dias.
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    & $powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass `
      -File (Join-Path $PSScriptRoot 'respaldar.ps1') `
      -DirectorioApp $DirectorioApp -BinPostgres $BinPostgres -SinRetencion
    if ($LASTEXITCODE -ne 0) {
      throw ('No se pudo respaldar el estado actual, y sin eso no se sobrescribe nada. ' +
        'Si lo actual no merece guardarse, repita con -SinRespaldoPrevio.')
    }
  }

  if (-not $SinServicio) {
    Paso 'Deteniendo la aplicacion mientras se restaura'
    $svc = Get-Service -Name $Servicio -ErrorAction SilentlyContinue
    if (-not $svc) {
      throw "No existe el servicio '$Servicio'. Si no hay aplicacion que parar, repita con -SinServicio."
    }
    if ($svc.Status -ne 'Stopped') {
      Stop-Service -Name $Servicio
      $detenido = $true
      Write-Host '    aplicacion detenida'
    }
  }

  Paso 'Restaurando'
  # El volcado entra en psql como bytes, descomprimido al vuelo y sin pasar
  # por la tuberia de PowerShell. `Get-Content | psql` parece lo mismo y no lo
  # es: PowerShell 5.1 recodifica lo que manda a un programa, y cada tilde del
  # contenido llega como un signo de interrogacion. Restaura "bien" y estropea
  # todas las fichas a la vez.
  #
  # --single-transaction con ON_ERROR_STOP es lo que hace esto todo o nada: el
  # volcado empieza borrando (--clean), y sin transaccion un error a mitad deja
  # el esquema viejo borrado y el nuevo a medio hacer.
  #
  # El flujo NO se llama $archivo: PowerShell no distingue mayusculas, esa
  # variable es el parametro -Archivo, que es [string], y el FileStream se
  # convertia en texto al asignarlo. Paso en la primera prueba de este guion.
  $flujo = [IO.File]::OpenRead($ruta)
  $gzip = New-Object IO.Compression.GZipStream($flujo, [IO.Compression.CompressionMode]::Decompress)
  try {
    $r = Invocar-Proceso -Ruta $psql `
      -Argumentos @('--no-password', '--single-transaction', '-v', 'ON_ERROR_STOP=1', '--quiet', "--dbname=$($uri.SinClave)") `
      -Entorno (Entorno-DePostgres $uri) -Entrada $gzip
  } finally {
    $gzip.Dispose()
    $flujo.Dispose()
  }
  if ($r.Codigo -ne 0) {
    throw ("psql termino con codigo $($r.Codigo): $($r.Errores) " +
      'La base NO quedo a medias: se restaura dentro de una transaccion, asi que sigue como estaba.')
  }

  Paso 'Comprobando el resultado'
  $c = Invocar-Proceso -Ruta $psql `
    -Argumentos @('--no-password', '-tAc', 'select count(*) from usuarios', "--dbname=$($uri.SinClave)") `
    -Entorno (Entorno-DePostgres $uri)
  if ($c.Codigo -eq 0) {
    $cuentas = $c.Texto.Trim()
    Write-Host "    cuentas restauradas: $cuentas"
    $hechos.Add("cuentas $cuentas")
  } else {
    $avisos.Add('AVISO no se pudieron contar las cuentas restauradas')
    Write-Host '    no se pudieron contar las cuentas; revise la plataforma a mano'
  }

  if ($medios) {
    Paso 'Restaurando los archivos subidos'
    # Se extrae ENCIMA de la carpeta: lo que haya y no venga en el respaldo se
    # queda. Es lo que hace restaurar.sh, y lo prudente: borrar antes seria
    # perder lo subido despues del respaldo sin que nadie lo haya pedido.
    $t = Invocar-Proceso -Ruta $tar -Argumentos @('-xzf', $medios, '-C', $DirectorioApp)
    if ($t.Codigo -eq 0) {
      $hechos.Add((Split-Path -Leaf $medios))
      Write-Host "    $(Split-Path -Leaf $medios)"
    } else {
      $avisos.Add("AVISO los medios no se restauraron: $($t.Errores)")
      Write-Host '    no se pudieron restaurar los medios; la base SI quedo restaurada'
      Write-Host "    Reintente a mano:  tar -xzf `"$medios`" -C `"$DirectorioApp`""
    }
  } else {
    Write-Host '    no hay respaldo de medios de esa misma marca; los archivos subidos no se tocan'
  }

  $estado = 'RESTAURACION-OK'
} catch {
  $detalle = Ocultar-Secretos $_.Exception.Message $secretos
  [Console]::Error.WriteLine("ERROR: $detalle")
} finally {
  # Pase lo que pase, la plataforma no se queda apagada: un error de psql ya no
  # deja al operador delante de un 502 sin saber que hacer.
  if ($detenido) {
    try {
      Start-Service -Name $Servicio
      Write-Host 'La aplicacion se volvio a levantar.'
    } catch {
      [Console]::Error.WriteLine("No se pudo volver a levantar '$Servicio': Start-Service $Servicio")
      $avisos.Add("AVISO el servicio $Servicio no volvio a arrancar")
    }
  }
}

$segundos = [int]((Get-Date) - $inicio).TotalSeconds
$partes = @($inicio.ToString('yyyy-MM-dd HH:mm:ss'), $estado, "como $([Environment]::UserName)") +
  @($hechos) + @($avisos | ForEach-Object { Ocultar-Secretos $_ $secretos }) + @("$segundos s")
if ($detalle) { $partes += $detalle }
Escribir-Registro $DirectorioApp ($partes -join '  ')

if ($estado -eq 'RESTAURACION-OK') {
  Write-Host ''
  Write-Host 'Restauracion completada.'
  exit 0
}
exit 1

<#
Registra la tarea programada de Windows que ejecuta respaldar.ps1 cada noche.

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\instalar-respaldo-programado.ps1
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\instalar-respaldo-programado.ps1 -Hora 04:30
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\instalar-respaldo-programado.ps1 -WhatIf

Se puede repetir: si la tarea ya existe, la reescribe con lo que diga este
guion (hora, ruta, cuenta), y no queda una segunda.

Al terminar la ejecuta UNA vez y espera a que acabe (se salta con -SinProbar).
No es cortesia: es la unica forma de saber que la cuenta de la tarea puede leer
el .env y escribir en la carpeta de respaldos. Instalarla sin probarla es
repetir el fallo de siempre en este repositorio -- declarar algo y no cablearlo
--, con el agravante de que aqui se descubre la noche que hace falta el
respaldo.

-- Por que como SYSTEM, y por que no pide ninguna contrasena --------------------

Una tarea que corre sin sesion abierta necesita una identidad, y Windows ofrece
tres formas:

  1. Una cuenta de usuario con "ejecutar tanto si el usuario inicio sesion como
     si no". Windows GUARDA su contrasena, y hay que teclearla al registrar la
     tarea y otra vez cada vez que se cambia. Descartada: la contrasena la pone
     el dueno, y una tarea que deja de correr en silencio el dia que alguien
     cambia la clave de su cuenta es justo lo que se quiere evitar.

  2. S4U ("no almacenar contrasena") con la cuenta del dueno. No pide clave,
     pero exige el derecho "Iniciar sesion como proceso por lotes" y el perfil
     del usuario no se carga igual. Funcionaria, y es la alternativa si algun
     dia no se quiere SYSTEM.

  3. SYSTEM (LocalSystem), que es la elegida. No tiene contrasena que guardar
     ni que caducar, y es la cuenta con la que YA corren las dos piezas de las
     que depende el respaldo: el servicio postgresql-17 (`pg_ctl register`) y
     el servicio traumahub (NSSM, sin ObjectName). El .env esta restringido a
     su dueno y a SYSTEM (docs/SERVIDOR-WINDOWS.md), asi que SYSTEM lo lee sin
     tocar permisos; y los archivos que crea la tarea tienen el mismo dueno que
     los que crea el boton del panel, que corre dentro del servicio, de modo
     que el panel puede descargarlos y borrarlos.

Lo que cuesta SYSTEM, dicho claro: quien pueda modificar scripts\respaldar.ps1
ejecuta codigo como SYSTEM esa noche. No abre nada nuevo: quien puede
modificar la carpeta de la aplicacion ya ejecuta codigo como SYSTEM en el
siguiente arranque del servicio. Pero es la razon para no darle a nadie mas
escritura sobre esa carpeta.

Registrar una tarea como SYSTEM exige una consola de administrador. No hace
falta ninguna contrasena para eso: una sesion SSH de un administrador en
Windows ya es elevada.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  # A las 03:00, que es lo que promete el panel de respaldos.
  [string]$Hora = '03:00',
  [string]$DirectorioApp,
  [string]$BinPostgres = 'C:\PostgreSQL\17\bin',
  [switch]$SinProbar
)

$ErrorActionPreference = 'Stop'

$RUTA_TAREA = '\TraumaHub\'
$NOMBRE_TAREA = 'respaldo-nocturno'

if (-not $DirectorioApp) { $DirectorioApp = Split-Path -Parent $PSScriptRoot }
$DirectorioApp = [IO.Path]::GetFullPath($DirectorioApp)
$guion = Join-Path $DirectorioApp 'scripts\respaldar.ps1'
if (-not (Test-Path -LiteralPath $guion -PathType Leaf)) { throw "No existe $guion." }
if (-not (Test-Path -LiteralPath (Join-Path $DirectorioApp '.env') -PathType Leaf)) {
  throw "No existe $DirectorioApp\.env: la tarea no tendria de donde leer la base."
}

. (Join-Path $PSScriptRoot 'respaldo-comun.ps1')

# Donde queda la copia se mira ANTES de registrar nada, para que -WhatIf y
# -SinProbar tambien lo digan. El dueno describio el problema como "si el disco
# falla o alguien borra algo, no hay copia", y una instalacion que termina en
# "Funciona" con la unica copia en el disco de la base solo resuelve la mitad.
# Es la misma funcion que escribe el AVISO en cada linea del registro, asi que
# el instalador y la tarea no pueden discrepar.
$riesgoDeDisco = $null
$confApp = $null
try {
  $confApp = Resolver-Configuracion $DirectorioApp
  $riesgoDeDisco = Riesgo-DeLaCopia $confApp $DirectorioApp $BinPostgres
} catch {
  # Resolver-Configuracion no repite la URI en sus errores; lo que falle aqui
  # lo volvera a decir, con mas detalle, la ejecucion de prueba.
  $riesgoDeDisco = "no se pudo comprobar donde queda la copia: $($_.Exception.Message)"
}

function Avisar-DelDisco {
  if (-not $riesgoDeDisco) { return }
  Write-Host ''
  Write-Host "AVISO: $riesgoDeDisco."
  Write-Host 'Estos respaldos protegen de un borrado, NO de que ese disco falle. Para eso,'
  Write-Host 'ponga en .env una carpeta en OTRO disco -- uno USB que se quede enchufado vale --:'
  Write-Host '    RESPALDOS_COPIA_DIR=E:\respaldos-traumahub'
  Write-Host 'No sirve una letra de red: la tarea corre como SYSTEM y no la ve. La siguiente'
  Write-Host 'ejecucion lo recoge sin reinstalar nada.'
}

$momento = [datetime]::MinValue
if (-not [datetime]::TryParseExact($Hora, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture, 'None', [ref]$momento)) {
  throw "La hora '$Hora' tiene que ir como HH:mm, por ejemplo 03:00."
}

# powershell.exe por ruta completa: es el 5.1 que viene con Windows, el que
# tiene la maquina seguro, y no el pwsh que pueda aparecer antes en el PATH.
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
# -ExecutionPolicy Bypass vale solo para ESE proceso; no cambia la politica de
# la maquina. Hace falta porque la de un Windows de escritorio es Restricted, y
# con ella -File se niega a correr cualquier .ps1. Si una directiva de grupo
# fijara la politica (MachinePolicy), mandaria sobre esto y la primera
# ejecucion de prueba lo diria.
$argumentos = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$guion`" -BinPostgres `"$BinPostgres`""

$accion = New-ScheduledTaskAction -Execute $powershell -Argument $argumentos -WorkingDirectory $DirectorioApp
$disparador = New-ScheduledTaskTrigger -Daily -At $momento
$cuenta = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$ajustes = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 4) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
# -StartWhenAvailable: un equipo de casa se apaga. Sin esto, si a las 03:00
# estaba apagado, esa noche no hay respaldo, y la siguiente tampoco si se
# repite. Con esto corre en cuanto vuelve.
# -MultipleInstances IgnoreNew: dos respaldos a la vez escribirian los mismos
# medios dos veces y competirian por el disco; el segundo sobra.
# -ExecutionTimeLimit: un pg_dump colgado no puede quedarse "En ejecucion"
# para siempre, que es la forma en que un respaldo deja de hacerse sin fallar.

$descripcion = 'Respaldo nocturno de TraumaHub: base y archivos subidos, con retencion. ' +
  "Registro en $DirectorioApp\registros\respaldos.log. Lo instala scripts\instalar-respaldo-programado.ps1."
$tarea = New-ScheduledTask -Action $accion -Trigger $disparador -Principal $cuenta -Settings $ajustes -Description $descripcion

Write-Host "Tarea:     $RUTA_TAREA$NOMBRE_TAREA"
Write-Host "Cuenta:    SYSTEM (sin contrasena)"
Write-Host "Cuando:    cada dia a las $($momento.ToString('HH:mm')), o al encender si estaba apagado"
Write-Host "Ejecuta:   $powershell $argumentos"
Write-Host "Registro:  $DirectorioApp\registros\respaldos.log"
Write-Host "Copia:     $(if ($riesgoDeDisco) { "AVISO, $riesgoDeDisco" } else { "en otro disco ($($confApp.CopiaDir))" })"

if (-not $PSCmdlet.ShouldProcess("$RUTA_TAREA$NOMBRE_TAREA", 'Registrar la tarea programada como SYSTEM')) {
  return
}

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
  [Console]::Error.WriteLine(@'

Esta consola no es de administrador, y registrar una tarea que corre como
SYSTEM lo exige. No se ha tocado nada.

No hace falta ninguna contrasena: abra PowerShell con "Ejecutar como
administrador" -- o entre por SSH con una cuenta de administrador, que ya es
una sesion elevada -- y repita la misma orden.
'@)
  exit 1
}

$existia = $null -ne (Get-ScheduledTask -TaskPath $RUTA_TAREA -TaskName $NOMBRE_TAREA -ErrorAction SilentlyContinue)
# -Force sustituye la definicion entera. Es lo que la hace idempotente: con
# Set-ScheduledTask habria que reconciliar campo a campo, y lo que se olvide
# reconciliar se queda con el valor viejo sin que nadie lo vea.
Register-ScheduledTask -TaskPath $RUTA_TAREA -TaskName $NOMBRE_TAREA -InputObject $tarea -Force | Out-Null
$registrada = Get-ScheduledTask -TaskPath $RUTA_TAREA -TaskName $NOMBRE_TAREA
Write-Host ''
Write-Host $(if ($existia) { 'Tarea actualizada.' } else { 'Tarea creada.' })
Write-Host "Cuenta registrada: $($registrada.Principal.UserId)"

# El panel borra y descarga respaldos desde dentro del servicio. Si el servicio
# no corre como LocalSystem, puede que no pueda con lo que crea la tarea.
$servicio = Get-CimInstance -ClassName Win32_Service -Filter "Name='traumahub'" -ErrorAction SilentlyContinue
if ($servicio -and $servicio.StartName -ne 'LocalSystem') {
  Write-Host ''
  Write-Host "AVISO: el servicio traumahub corre como '$($servicio.StartName)', no como LocalSystem."
  Write-Host 'Compruebe desde el panel que puede descargar y borrar un respaldo creado por la tarea.'
}

if ($SinProbar) {
  Write-Host ''
  Write-Host 'Sin probar (-SinProbar). La primera ejecucion sera la de esta noche.'
  Avisar-DelDisco
  exit 0
}

Write-Host ''
Write-Host 'Ejecutandola una vez para comprobar que funciona como SYSTEM...'
$registro = Join-Path $DirectorioApp 'registros\respaldos.log'
$lineasAntes = 0
if (Test-Path -LiteralPath $registro) { $lineasAntes = @(Get-Content -LiteralPath $registro).Count }

Start-ScheduledTask -TaskPath $RUTA_TAREA -TaskName $NOMBRE_TAREA
# La tarea tarda un momento en pasar a "Running"; si se mira enseguida aun
# figura "Ready" y parece que ya termino.
Start-Sleep -Seconds 3
$limite = (Get-Date).AddHours(4)
while ((Get-ScheduledTask -TaskPath $RUTA_TAREA -TaskName $NOMBRE_TAREA).State -eq 'Running') {
  if ((Get-Date) -gt $limite) { break }
  Start-Sleep -Seconds 5
}

$info = Get-ScheduledTaskInfo -TaskPath $RUTA_TAREA -TaskName $NOMBRE_TAREA
$ultima = $null
if (Test-Path -LiteralPath $registro) {
  $todas = @(Get-Content -LiteralPath $registro)
  if ($todas.Count -gt $lineasAntes) { $ultima = $todas[$todas.Count - 1] }
}

Write-Host "Resultado de la tarea: $($info.LastTaskResult)"
if ($ultima) { Write-Host "Registro: $ultima" }

if ($info.LastTaskResult -eq 0 -and $ultima -match '^\S+ \S+  OK  ') {
  Write-Host ''
  Write-Host 'Funciona. Los respaldos apareceran en el panel, en Respaldos.'
  # Una copia que fallo (el USB no estaba, SYSTEM sin permiso) no hace fallar
  # el respaldo, pero tampoco puede quedar debajo de un "Funciona" sin mas.
  if ($ultima -match '  AVISO la copia') {
    Write-Host 'Pero la copia a RESPALDOS_COPIA_DIR FALLO como SYSTEM: lo dice la linea del registro de arriba.'
  }
  Avisar-DelDisco
  exit 0
}

Write-Host ''
if (-not $ultima) {
  # Sin linea nueva, el guion ni siquiera llego a escribir: lo mas probable es
  # la politica de ejecucion, o que SYSTEM no pueda escribir en registros\.
  Write-Host 'La tarea NO dejo linea en el registro: el guion no llego a correr o no pudo escribir.'
  Write-Host 'Pruebe a lanzar a mano, en esta misma consola, la orden de "Ejecuta" de arriba.'
} else {
  Write-Host 'La tarea quedo registrada, pero el respaldo de prueba FALLO. Lo dice la linea de arriba.'
}
exit 1

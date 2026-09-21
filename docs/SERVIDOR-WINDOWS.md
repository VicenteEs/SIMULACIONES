# La plataforma en un Windows, sin Docker

Guía del despliegue que hoy corre en un Windows 11 de casa al que se llega por
Tailscale. La máquina tiene tres nombres y conviene no confundirlos: en Windows
sigue siendo `FARADAY`, el alias de SSH es `blanco`, y en Tailscale es
`traumahub`, que es el único que aparece en la dirección pública. `docs/SERVIDOR.md` describe el
camino de Ubuntu con Docker, que es el recomendado; este describe el otro, el
que hubo que abrir porque la máquina no tenía Docker ni WSL y no había por qué
instalarlos solo para esto.

La dirección pública de este despliegue era
**https://traumahub.tailc2094f.ts.net/simulaciones**.

> **Esa dirección ya no responde.** La plataforma se trasladó al Ubuntu `ved` y
> hoy se entra por **https://ved.tailc2094f.ts.net:10000/traumahub**. Allí, lo
> que no empieza por `/traumahub` lo atiende otra página del mismo dominio: un
> enlace viejo con `/simulaciones` no da un error de TraumaHub, sino el 404 de
> APCE, que no explica nada (pasó el 2026-09-21 con un enlace ya repartido).
> Esta guía se conserva por si hay que volver a levantar el Windows.

---

## Lo que quedó montado

| Pieza | Dónde | Cómo se mantiene |
|---|---|---|
| La aplicación | `C:\Users\vicen\simulaciones` | Servicio `traumahub`, arranque automático |
| PostgreSQL 17.11 | `C:\PostgreSQL\17` | Servicio `postgresql-17`, arranque automático |
| El túnel | Tailscale Funnel | Guardado en el estado de `tailscaled` |
| Registros | `C:\Users\vicen\simulaciones\registros\servidor.log` | Rota solo a los 10 MB |
| Secretos | `.env` y `C:\Users\vicen\.clave-postgres.txt` | Generados en la máquina, no salen de ahí |
| Respaldos | `RESPALDOS_DIR`, registro en `registros\respaldos.log` | Tarea `\TraumaHub\respaldo-nocturno`, que hay que [instalar una vez](#instalarlo-una-vez) |

Ni la aplicación ni la base se asoman a la red: las dos escuchan solo en
`127.0.0.1`. Lo único que entra desde fuera es el túnel, y entra por localhost.

---

## El detalle que decide todo: dónde se monta el túnel

Tailscale Funnel **recorta el prefijo** del `--set-path` antes de reenviar la
petición. Comprobado con un servidor de prueba que solo devuelve la ruta que
recibe:

```
tailscale funnel --bg --set-path /simulaciones http://localhost:3000
GET https://traumahub.tailc2094f.ts.net/simulaciones/api/salud  →  llega /api/salud
```

Eso deja las dos mitades sin encajar. Con `basePath` puesto, la aplicación
espera `/simulaciones/...` y recibe `/...`, y devuelve 404 en todo. Sin
`basePath`, los enlaces que Next genera salen sin prefijo, el navegador pide
`https://host/algo` y ahí no hay nada montado.

La combinación que sí funciona es montar el túnel **en la raíz** y dejar que el
prefijo lo ponga la aplicación, que es la única pieza que puede ponerlo también
en los enlaces que escribe:

```
tailscale funnel --bg --yes http://localhost:3000
GET https://traumahub.tailc2094f.ts.net/simulaciones/api/salud  →  llega /simulaciones/api/salud
```

El prefijo se fija **al compilar**, en `.env`:

```
NEXT_PUBLIC_BASE_PATH=/simulaciones
NEXT_PUBLIC_SERVER_URL=https://traumahub.tailc2094f.ts.net/simulaciones
```

Cambiar cualquiera de las dos obliga a reconstruir. Se comprueba después en
`.next/required-server-files.json`, que guarda el `basePath` con el que se
construyó.

---

## Cambiar el nombre de la dirección

El nombre público tiene dos mitades y solo una se elige. La máquina —`traumahub`—
es libre. El tailnet —`tailc2094f`— no: Tailscale solo ofrece cambiarlo por otro
aleatorio pero pronunciable, de dos palabras, y una vez usado para emitir
certificados ya no se puede pedir otro. Funnel no admite dominios propios de
ninguna forma; para eso hacen falta Cloudflare Tunnel y un dominio delegado, que
están en `docs/CLOUDFLARE.md`.

Renombrar la máquina son tres pasos, y saltarse cualquiera deja el sitio a medias:

```powershell
# 1. El nombre que Tailscale reporta. No toca el nombre de Windows, que
#    obligaria a reiniciar la maquina para nada.
& "C:\Program Files\Tailscale\tailscale.exe" set --hostname=traumahub

# 2. El tunel guarda el nombre viejo dentro y no se entera del cambio. Hay que
#    rehacerlo para que pida certificado sobre el nombre nuevo.
& "C:\Program Files\Tailscale\tailscale.exe" funnel reset
& "C:\Program Files\Tailscale\tailscale.exe" funnel --bg --yes http://localhost:3000

# 3. La direccion vive dentro de la construccion, no del proceso. Sin esto el
#    servidor sigue escribiendo la direccion vieja en cada enlace absoluto.
#    Editar NEXT_PUBLIC_SERVER_URL en .env y despues:
Set-Location C:\Users\vicen\simulaciones
npm run build
Restart-Service traumahub
```

Los enlaces al nombre anterior dejan de funcionar. Es lo esperado, pero conviene
avisarlo antes de repartir la dirección.

---

## Instalar PostgreSQL sin escritorio

El instalador de EnterpriseDB **no funciona por SSH**: es un BitRock, necesita
una sesión de escritorio y sale con código 1 sin dejar registro. Tampoco sirve
`winget install` con `--custom`, porque winget ya pasa sus propios argumentos
silenciosos y el instalador rechaza el juego duplicado.

Lo que sí funciona son los binarios en ZIP, que no instalan nada:

```powershell
curl.exe -L -o pg.zip https://get.enterprisedb.com/postgresql/postgresql-17.11-3-windows-x64-binaries.zip
Expand-Archive pg.zip -DestinationPath C:\tmp
Move-Item C:\tmp\pgsql C:\PostgreSQL\17
C:\PostgreSQL\17\bin\initdb.exe -D C:\PostgreSQL\17\data -U postgres --pwfile=clave.txt -E UTF8 --locale=C --auth-local=scram-sha-256 --auth-host=scram-sha-256
C:\PostgreSQL\17\bin\pg_ctl.exe register -N postgresql-17 -D C:\PostgreSQL\17\data -S auto
```

`pg_ctl register` crea el servicio como LocalSystem y PostgreSQL deja caer los
privilegios por su cuenta, así que no hace falta una cuenta aparte.

---

## El servicio de la aplicación

Lo sostiene NSSM, que reinicia el proceso si se cae. Se registra así:

```powershell
nssm install traumahub "C:\Program Files\nodejs\node.exe" `
  C:\Users\vicen\simulaciones\node_modules\next\dist\bin\next start -H 127.0.0.1 -p 3000
nssm set traumahub AppDirectory C:\Users\vicen\simulaciones
nssm set traumahub AppExit Default Restart
```

**`-H 127.0.0.1` no es decorativo.** Sin eso, `next start` escucha en todas las
interfaces y la plataforma queda además abierta en la red local, sin cifrado y
sin que nadie lo haya pedido.

El esquema no se crea a mano: `prodMigrations` aplica las migraciones pendientes
al arrancar el servicio.

---

## Operación diaria

**Ver si está en pie.** Es lo único que responde sin sesión:

```bash
curl https://traumahub.tailc2094f.ts.net/simulaciones/api/salud
```

Devuelve `{"estado":"ok","base":"ok"}` cuando la aplicación y la base responden,
y un 503 con `degradado` cuando el proceso vive pero no alcanza PostgreSQL.

**Reiniciar.**

```powershell
Restart-Service traumahub
```

**Ver los registros.**

```powershell
Get-Content C:\Users\vicen\simulaciones\registros\servidor.log -Tail 50 -Wait
```

**Actualizar a la última versión.** El orden importa, y no es el de Linux:

```powershell
Set-Location C:\Users\vicen\simulaciones
Stop-Service traumahub
git pull
npm ci
npm run build
Start-Service traumahub
```

**El servicio se para antes, no al final.** En Windows un archivo abierto no se
puede borrar, y el servicio tiene medio `node_modules` abierto. `npm ci` empieza
borrándolo entero, se queda a medias y deja la instalación rota: el `npm run
build` siguiente falla y el servicio ya no encuentra el binario de Next. Pasó, y
dejó el sitio caído hasta reinstalar con el servicio parado. En Linux la misma
secuencia funciona, porque ahí un archivo abierto sí se puede reemplazar, y por
eso el orden equivocado parece el correcto.

La señal, en el registro, es `Cannot find module ...\node_modules\next\dist\bin\next`.
La salida es repetir la secuencia entera con el servicio parado.

El `npm run build` tampoco es opcional: el prefijo y la dirección pública viven
dentro de la construcción, no del proceso.

**Estado del túnel.**

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" funnel status
```

---

## Respaldos

### Cómo funciona

Cada noche a las 03:00 la tarea programada `\TraumaHub\respaldo-nocturno`
ejecuta `scripts\respaldar.ps1` como SYSTEM. Es el gemelo de
`scripts/respaldar.sh`, y deja lo mismo en el mismo sitio:

| Archivo | Qué es |
|---|---|
| `base-AAAAMMDD-HHMMSS.sql.gz` | `pg_dump --clean --if-exists` en texto plano, comprimido |
| `medios-AAAAMMDD-HHMMSS.tar.gz` | La carpeta `medios`, que incluye `medios\modelos` |

Los dos van a `RESPALDOS_DIR`, la carpeta que dice `.env`, que es la misma que
lee el panel. Por eso aparecen en **Respaldos** sin hacer nada más: el panel lista
cualquier archivo con ese nombre, venga de la tarea o de su propio botón.

Lo que hace cada noche, y por qué:

- **Lee `DATABASE_URI` de `.env` al ejecutarse.** La clave no se copia a ningún
  archivo: viaja a `pg_dump` en la variable `PGPASSWORD` del propio proceso, y
  todo mensaje que llega a la pantalla o al registro pasa antes por un filtro que
  la tapa. Cambiar la clave en `.env` basta; la tarea no guarda nada.
- **Comprueba el volcado antes de darlo por bueno.** Lo descomprime entero y exige
  tres cosas: que el tamaño que declara el pie del gzip cuadre con lo
  descomprimido, la cabecera y el pie que escribe `pg_dump`, y que la clave del
  `\restrict` del principio se cierre con el `\unrestrict` del final. No basta con
  que descomprima: .NET lee un `.gz` cortado —un disco que se llena a mitad, un
  USB que se desenchufa— hasta donde llega y no protesta. Y el pie de `pg_dump`
  tampoco basta: desde PostgreSQL 17.6 detrás va `\unrestrict CLAVE`, y un corte
  de pocos bytes se lleva la clave y deja el pie. Se comprobó con un volcado real
  cortado 20 bytes: pasaba, llegaba a `psql` y fallaba en la última línea. Si no
  pasa, se borra y la ejecución falla: un respaldo que no restaura es peor que
  ninguno.
- **Escribe con otro nombre hasta el final.** Mientras se hace, el archivo se
  llama `….parcial` y el panel no lo ve. Si se va la luz a mitad, lo que queda no
  parece un respaldo.
- **Conserva 30 días** (`DIAS_A_CONSERVAR`), con la regla de `respaldar.sh`: se
  borra a partir de los 31 días cumplidos. Y solo tras un respaldo bueno: si
  llevara un mes fallando, la retención no se lleva el último que sirve.
- **Si fallan los medios, la base se queda.** El volcado ya comprobado no se tira;
  la ejecución sale con error y el registro dice «la base SÍ quedó respaldada,
  los medios NO».

**Sin más, todo esto vive en el mismo disco que la base.** Protege del error —un
borrado, una migración que sale mal—, no de que el disco muera, que es la otra
mitad de lo que se quería resolver. Para eso está `RESPALDOS_COPIA_DIR` en `.env`:
una segunda carpeta en **otro disco**, uno USB que se quede enchufado vale, adonde
se copian los dos archivos después de comprobarlos, con la misma retención:

```
RESPALDOS_COPIA_DIR=E:\respaldos-traumahub
```

Mientras no esté puesta, o esté en el mismo disco físico que la base, la carpeta
de respaldos o la aplicación, **cada línea del registro lo dice**
(`AVISO sin copia fuera del disco: …`) y el instalador lo repite al terminar. No
hace fallar el respaldo, que es bueno; impide que el registro diga OK durante
años a quien cree estar protegido. Se compara el disco físico y no la letra: un
`D:` que es otra partición del disco de `C:` muere con él, y el aviso lo sabe.

La copia también se escribe como `….parcial` y solo se renombra si pesa lo mismo
que el original: un USB que se desenchufa a mitad no deja allí un archivo cortado
con nombre de respaldo bueno. Si la copia falla, el respaldo local vale igual y
el registro lo avisa. No sirve una letra de red (`Z:`), que SYSTEM no ve, y una
carpeta compartida por `\\equipo\recurso` tampoco suele servir: SYSTEM se presenta
ante otra máquina como la cuenta del equipo, y un recurso compartido de casa no
le da permiso.

### Instalarlo (una vez)

Con el código ya actualizado (ver «Actualizar a la última versión»), desde una
consola de **administrador**, o por SSH con una cuenta de administrador, que en
Windows ya es una sesión elevada:

```powershell
Set-Location C:\Users\vicen\simulaciones
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\instalar-respaldo-programado.ps1
```

Registra la tarea y **la ejecuta una vez** esperando a que acabe. Si sale
«Funciona», los dos primeros archivos ya están en el panel. Si debajo sale
`AVISO: sin copia fuera del disco`, falta `RESPALDOS_COPIA_DIR` (ver arriba); se
pone en `.env` y la siguiente ejecución la recoge, sin reinstalar. Esa primera
ejecución no es opcional: es lo único que demuestra que SYSTEM puede leer `.env`
y escribir en `RESPALDOS_DIR`, y sin ella el primer aviso de que no podía llega
la noche en que hace falta el respaldo.

Se puede repetir sin miedo: si la tarea ya existe, la reescribe. `-Hora 04:30`
cambia la hora, `-SinProbar` se salta la ejecución de prueba y `-WhatIf` enseña
lo que registraría sin registrar nada.

**No pide ninguna contraseña**, y es a propósito. Una tarea que corre sin nadie
conectado necesita una identidad, y la de una cuenta de usuario obliga a Windows
a guardar su contraseña: hay que teclearla al instalar y deja de funcionar en
silencio el día que se cambia. S4U («no almacenar contraseña») con la cuenta del
dueño funcionaría, y es la alternativa. Se eligió **SYSTEM** porque es la cuenta
con la que ya corren `postgresql-17` y `traumahub`: `.env` está restringido a su
dueño y a SYSTEM, así que lo lee sin tocar permisos, y los archivos que crea
tienen el mismo dueño que los que crea el botón del panel, que corre dentro del
servicio. El precio: quien pueda modificar `scripts\respaldar.ps1` ejecuta código
como SYSTEM esa noche. No abre nada que no estuviera abierto —quien puede
modificar la carpeta ya ejecuta código como SYSTEM en el siguiente arranque del
servicio—, pero es la razón para no dar escritura sobre ella a nadie más.

Si el servicio `traumahub` no corriera como LocalSystem, el instalador lo avisa:
entonces hay que comprobar desde el panel que se puede descargar y borrar un
respaldo creado por la tarea.

### Dónde mirar si falló

**El registro**, una línea por ejecución y sin secretos:

```powershell
Get-Content C:\Users\vicen\simulaciones\registros\respaldos.log -Tail 10
```

```
2026-09-14 03:00:02  OK  como SYSTEM  base-20260914-030000.sql.gz (7413 bytes)  medios-20260914-030000.tar.gz (50534 bytes)  retirados 1  AVISO sin copia fuera del disco: RESPALDOS_COPIA_DIR no esta puesta en .env  12 s
2026-09-15 03:00:02  OK  como SYSTEM  base-20260915-030000.sql.gz (7420 bytes)  medios-20260915-030000.tar.gz (50534 bytes)  copia en E:\respaldos-traumahub (retirados 0)  retirados 0  13 s
2026-09-16 03:00:01  ERROR  como SYSTEM  3 s  pg_dump termino con codigo 1: ... password authentication failed for user "trauma"
```

**La tarea**, cuando no hay línea de esa noche:

```powershell
Get-ScheduledTaskInfo -TaskPath \TraumaHub\ -TaskName respaldo-nocturno
```

`LastTaskResult` 0 es que fue bien, 1 que el guion falló y lo dice el registro, y
267011 que no ha corrido nunca. Si la última ejecución es vieja y no hay línea, la
tarea no llegó a arrancar el guion. Un equipo apagado a las 03:00 no es eso: la
tarea corre en cuanto vuelve a encenderse.

**Lanzarla ahora**, con la misma cuenta y los mismos permisos que de noche:

```powershell
Start-ScheduledTask -TaskPath \TraumaHub\ -TaskName respaldo-nocturno
```

Ejecutar `respaldar.ps1` a mano también sirve, pero corre con los permisos de
quien lo lanza, que no son los de SYSTEM: puede ir bien a mano y fallar de noche.

| En el registro | Qué pasa |
|---|---|
| `No se encuentra pg_dump.exe en C:\PostgreSQL\17\bin` | PostgreSQL cambió de carpeta o de versión. Reinstalar la tarea con `-BinPostgres` |
| `pg_dump termino con codigo 1: … password authentication failed` | La `DATABASE_URI` de `.env` no es la de la base |
| `pg_dump termino con codigo 1: … Connection refused` | El servicio `postgresql-17` está parado |
| `El volcado esta incompleto` | Casi siempre, disco lleno |
| `El volcado esta cortado` | Al restaurar: el archivo perdió el final, por un corte al copiarlo o un disco que falla. Usar el del día anterior |
| `AVISO sin copia fuera del disco` | El respaldo es bueno, pero no sobrevive a que el disco falle: poner `RESPALDOS_COPIA_DIR` en otro disco |
| `AVISO la copia a … fallo` | El respaldo local sí está; el disco de la copia no estaba o SYSTEM no puede escribir en él |
| `No existe …\medios` | La tarea apunta a otra carpeta de aplicación |
| `DIAS_A_CONSERVAR vale …` | Un valor que no es un número en `.env`: no se borra nada hasta corregirlo |

### Restaurar

`scripts\restaurar.ps1` es el gemelo de `restaurar.sh`. Desde una consola de
administrador, porque para el servicio:

```powershell
Set-Location C:\Users\vicen\simulaciones
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\restaurar.ps1 base-20260914-030000.sql.gz
```

El nombre se busca tal cual y, si no está, en `RESPALDOS_DIR`. En orden:

1. Comprueba el volcado igual que al crearlo, y el `medios-` de **la misma
   marca** si lo hay. Si algo no sirve, para sin tocar nada.
2. Pide escribir `RESTAURAR`.
3. Respalda el estado actual con `respaldar.ps1`, base y medios. Si la base está
   tan rota que ni eso se puede, para y lo dice; entonces se repite con
   `-SinRespaldoPrevio`.
4. Para `traumahub`: restaurar con la aplicación escribiendo encima deja la base
   entre dos versiones.
5. Carga el volcado en `psql` en **una sola transacción** con `ON_ERROR_STOP`. Si
   falla a mitad, la base sigue exactamente como estaba.
6. Cuenta las cuentas de `usuarios` y extrae los medios encima de la carpeta: lo
   subido después del respaldo no se borra.
7. Vuelve a levantar `traumahub`, también si algo falló.

Deja su línea en `registros\respaldos.log` (`RESTAURACION-OK` o
`RESTAURACION-ERROR`).

**A mano, si el guion no sirve.** El volcado tiene que llegar a `psql` como bytes.
`Get-Content respaldo.sql | psql` y `pg_dump > respaldo.sql` parecen funcionar y
no funcionan: PowerShell 5.1 recodifica lo que pasa por su tubería —cada tilde
llega como `?`— y la redirección `>` escribe UTF-16, que `psql` rechaza con
`invalid byte sequence for encoding "UTF8": 0xff`. Se descomprime con .NET a un
archivo y se le da a `psql` con `-f`. Antes, sin parar nada, se comprueba que el
archivo está entero, con la misma función que usan los guiones; descomprimirlo
con .NET no avisa si le falta el final:

```powershell
$respaldo = 'C:\Users\vicen\simulaciones\backups\base-20260914-030000.sql.gz'   # ruta COMPLETA, dentro de RESPALDOS_DIR
Set-ExecutionPolicy -Scope Process Bypass -Force   # solo esta consola: con la de la maquina, "." no carga un .ps1
. C:\Users\vicen\simulaciones\scripts\respaldo-comun.ps1
Probar-Volcado $respaldo
```

Si responde con un número —los bytes sin comprimir—, sirve. Si dice «cortado» o
«incompleto», no: se elige el del día anterior. Va en un bloque aparte a
propósito: pegado en la consola junto con lo de abajo, un error no detiene las
líneas siguientes, y `psql` cargaría igual el archivo roto.

```powershell
Stop-Service traumahub
$volcado  = "$env:TEMP\restaurar.sql"
$entrada  = [IO.File]::OpenRead($respaldo)
$gzip     = New-Object IO.Compression.GZipStream($entrada, [IO.Compression.CompressionMode]::Decompress)
$salida   = [IO.File]::Create($volcado)
$gzip.CopyTo($salida); $salida.Close(); $gzip.Close()
C:\PostgreSQL\17\bin\psql.exe -U trauma -h 127.0.0.1 -d trauma --single-transaction -v ON_ERROR_STOP=1 --quiet -f $volcado
Remove-Item $volcado
C:\Windows\System32\tar.exe -xzf C:\Users\vicen\simulaciones\backups\medios-20260914-030000.tar.gz -C C:\Users\vicen\simulaciones
Start-Service traumahub
```

`psql` pide la clave de la base, que está en `DATABASE_URI`. Dos trampas que ya
mordieron al escribir esto: las rutas de `[IO.File]` tienen que ser completas,
porque .NET no resuelve contra la carpeta en la que está PowerShell; y los
nombres de variable no pueden repetirse cambiando mayúsculas, porque PowerShell
no las distingue y `$s` pisa a `$S`.

### Cómo se probó

Sin tocar producción, contra PostgreSQL 17.11 en el contenedor de desarrollo, en
una base desechable, ejecutando los guiones de verdad con PowerShell 5.1 y un
`pg_dump.cmd`/`psql.cmd` que llaman a `docker exec`: se respaldó una base con
tildes, 200 filas y dos archivos subidos; se estropeó la base (filas borradas,
una tabla eliminada) y se borró un archivo; se restauró, y volvieron las filas,
las tildes, el contenido de las 200 filas (mismo md5) y los archivos (mismo
SHA-1). El mismo volcado se cargó también por el camino de `restaurar.sh`
(`gzip -dc | psql`). Un volcado cortado se rechazó antes de tocar nada, y uno con
un error de SQL a mitad dejó la base exactamente como estaba.

Después, con un volcado real de 17.11 sobre la base desechable `respaldos_prueba`
(40 000 filas, 930 KB comprimido), se cortaron 4, 8, 12, 20 y 200 bytes del
final. Antes de exigir el pie del gzip, la comprobación aceptaba los cuatro
primeros —con 4 y 8 bytes menos, .NET devolvía el SQL completo—; ahora los rechaza
todos. El mismo volcado recomprimido con `gzip -9` de GNU, como lo deja
`respaldar.sh`, se sigue aceptando; con la clave de `\unrestrict` recortada dentro
de un gzip íntegro, se rechaza.

`tests/unit/respaldoEnWindows.test.ts` repite lo esencial en cada pasada de la
suite, sin base: que el nombre es el del panel y `listarRespaldos()` lo ve, que la
clave llega a `pg_dump` solo por `PGPASSWORD` y no sale ni por pantalla ni por el
registro aunque `pg_dump` la repita en su error, que un volcado sin pie se
descarta, que la retención corta en el mismo día que `find -mtime +30`, que
`restaurar.ps1` entrega a `psql` el volcado byte a byte, que rechaza sin llegar a
`psql` un volcado cortado de tres maneras distintas y acepta uno comprimido por
zlib, y que sin copia en otro disco el registro y el instalador lo avisan. Fuera
de Windows esa parte se omite.

---

## Lo que hay que saber antes de tocar nada

- **Los secretos se generaron en la máquina.** La clave de la base y la de firma
  de sesiones están en `.env`, y la del superusuario de PostgreSQL en
  `C:\Users\vicen\.clave-postgres.txt`. Los dos archivos están restringidos a su
  dueño y a SYSTEM. Cambiar `PAYLOAD_SECRET` cierra la sesión de todo el mundo.

- **Funnel deja la plataforma en internet abierto.** No es la red de Tailscale:
  es una dirección pública que cualquiera puede abrir. Lo que la protege es que
  sin sesión no se ve nada (D-020), no el túnel. Para quitarla de internet y
  dejarla solo para el tailnet: `tailscale funnel reset` y después
  `tailscale serve --bg http://localhost:3000`.

- **La carpeta tenía otra cosa dentro.** `C:\Users\vicen\simulaciones` contenía
  `descargar_y_extraer.py`, `hueso_modelo.stl` y `tomografia_descargada.nii.gz`
  de otro trabajo. Están intactos en `C:\Users\vicen\tomografias`. Se movieron
  al lado y no a una subcarpeta a propósito: dentro del repositorio, un `git
  clean` durante una actualización se los llevaría.

- **Los respaldos son automáticos, pero solo después de instalarlos una vez.**
  `scripts/respaldar.sh` es bash con Docker y aquí no corre; su gemelo es
  `scripts/respaldar.ps1`, que lanza cada noche una tarea programada. Mientras
  `instalar-respaldo-programado.ps1` no se haya ejecutado en esta máquina, no
  hay ninguno. Todo está en [Respaldos](#respaldos): cómo funciona, cómo se
  instala, dónde mirar si falló y cómo se restaura.

  Y no vale `pg_dump.exe ... > respaldo.sql`, que era lo que decía aquí: en
  PowerShell 5.1 la redirección `>` escribe en UTF-16 y recodifica cada línea,
  y el archivo que sale no lo carga `psql`.

- **No hay correo saliente.** Quien olvide su contraseña depende de que un
  administrador le genere el enlace con `npx tsx scripts/restablecer-clave.ts`.
  Ver `docs/CORREO.md`.

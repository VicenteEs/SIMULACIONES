# La plataforma en un Windows, sin Docker

Guía del despliegue que hoy corre en un Windows 11 de casa al que se llega por
Tailscale. La máquina tiene tres nombres y conviene no confundirlos: en Windows
sigue siendo `FARADAY`, el alias de SSH es `blanco`, y en Tailscale es
`traumahub`, que es el único que aparece en la dirección pública. `docs/SERVIDOR.md` describe el
camino de Ubuntu con Docker, que es el recomendado; este describe el otro, el
que hubo que abrir porque la máquina no tenía Docker ni WSL y no había por qué
instalarlos solo para esto.

La dirección pública es **https://traumahub.tailc2094f.ts.net/simulaciones**.

---

## Lo que quedó montado

| Pieza | Dónde | Cómo se mantiene |
|---|---|---|
| La aplicación | `C:\Users\vicen\simulaciones` | Servicio `traumahub`, arranque automático |
| PostgreSQL 17.11 | `C:\PostgreSQL\17` | Servicio `postgresql-17`, arranque automático |
| El túnel | Tailscale Funnel | Guardado en el estado de `tailscaled` |
| Registros | `C:\Users\vicen\simulaciones\registros\servidor.log` | Rota solo a los 10 MB |
| Secretos | `.env` y `C:\Users\vicen\.clave-postgres.txt` | Generados en la máquina, no salen de ahí |

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

- **No hay respaldo automático todavía.** `scripts/respaldar.sh` es bash y
  supone Docker; en esta máquina no corre. Mientras no haya un equivalente, el
  volcado se hace a mano:

  ```powershell
  C:\PostgreSQL\17\bin\pg_dump.exe -U trauma -h 127.0.0.1 trauma > respaldo.sql
  ```

- **No hay correo saliente.** Quien olvide su contraseña depende de que un
  administrador le genere el enlace con `npx tsx scripts/restablecer-clave.ts`.
  Ver `docs/CORREO.md`.

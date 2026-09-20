# Poner la plataforma en el servidor privado

Guía única para llevar esto a un servidor Ubuntu al que solo usted tiene
acceso. Está escrita para leerse de arriba abajo la primera vez y para
consultarse por secciones después.

Resumen de lo que hay que teclear, si tiene prisa:

```bash
git clone git@github.com:VicenteEs/SIMULACIONES.git plataforma
cd plataforma
./scripts/instalar-servidor.sh
```

Eso es todo. El script instala Docker si falta, genera los secretos, construye
la imagen, levanta los contenedores, programa el respaldo diario y comprueba
que todo responda.

---

## 1. Qué hace falta antes

| Requisito | Detalle |
|---|---|
| Ubuntu Server 22.04 o 24.04 LTS | Es la base para la que está escrito el script (D-023) |
| Un usuario normal con `sudo` | **No** se despliega como root; el script se niega |
| Clave SSH registrada en GitHub | Para poder clonar el repositorio privado |
| Tailscale instalado y con sesión iniciada | Es la vía de acceso por omisión (D-034) |

Docker **no** hace falta instalarlo a mano: si no está, el script lo instala
desde el repositorio oficial y pide confirmación antes.

Comprobación rápida, ya en el servidor:

```bash
whoami && sudo -v && ssh -T git@github.com && tailscale status | head -3
```

---

## 2. La instalación

```bash
git clone git@github.com:VicenteEs/SIMULACIONES.git plataforma
cd plataforma
./scripts/instalar-servidor.sh
```

El script pregunta una sola cosa: la **dirección pública** de la plataforma.
Con Tailscale suele ser `https://NOMBRE-DEL-SERVIDOR.ts.net`, que se ve con
`tailscale status`.

Lo demás lo resuelve solo:

1. Instala Docker si falta y comprueba que su usuario pueda usarlo.
2. Genera `.env` con una contraseña de base y un `PAYLOAD_SECRET` aleatorios,
   con permisos `600`. **Si ya existe un `.env`, no lo toca.**
3. Prepara `backups/` con los permisos que necesitan a la vez el contenedor
   (que corre como uid 1001) y su usuario del servidor.
4. Llama a `scripts/deploy.sh`, que construye y levanta todo.
5. Programa el respaldo diario con un temporizador de `systemd`, o en el
   `crontab` si la máquina no lo trae.
6. Ejecuta `scripts/salud.sh` y muestra el estado final.

Si algo falla, el script se detiene y dice qué pasó. Volver a ejecutarlo es
seguro: todo lo que ya está hecho se detecta y se salta.

### Publicar el servicio en Tailscale

Al terminar, falta un paso que necesita privilegios y por eso no se hace solo:

```bash
sudo tailscale serve --bg 3000     # privado: solo su tailnet lo ve
sudo tailscale funnel --bg 3000    # público en internet, con HTTPS de Tailscale
```

Con `serve`, la plataforma es invisible desde internet: solo los dispositivos de
su tailnet llegan a ella. Es lo que corresponde mientras el contenido esté en
construcción.

### La primera cuenta

Abra `https://SU-DIRECCION/instalar` y cree la primera cuenta. **Esa primera
queda como administradora y activa automáticamente** (D-028), y la pantalla
desaparece en cuanto existe: no se puede crear una segunda por ahí. Todas las
siguientes nacen como lectoras desactivadas y se habilitan desde el panel.

Al terminar queda dentro de `https://SU-DIRECCION/admin-panel`. Ese es el único
panel de la plataforma: contenido, cuentas, permisos, actividad, estadísticas,
respaldos y estado del sistema se gestionan desde ahí. Los residentes entran
por `https://SU-DIRECCION/entrar`.

> La interfaz de administración de Payload ya no existe en esta plataforma
> (D-038). La ruta `/admin` se conserva solo para que los enlaces y marcadores
> antiguos no den en un 404 sin explicación: `/admin/login` y `/admin/logout`
> van a `/entrar`, todo lo demás va a `/admin-panel`, y en una instalación sin
> ninguna cuenta todo va a `/instalar`. Los `/admin/reset/<testigo>` de algún
> correo antiguo ya no tienen pantalla propia a la que llegar: acaban en
> `/admin-panel` y, sin sesión, en la portada. No se pierde nada, porque el
> testigo caduca al cabo de una hora y ninguno de aquellos enlaces sigue vivo.
> El correo actual se arma en `src/collections/Usuarios.ts` y apunta a
> `/clave/<testigo>`.

---

## 3. Operación del día a día

Todos los comandos se ejecutan desde el directorio del clon.

| Qué quiere | Comando |
|---|---|
| Ver si todo está bien | `./scripts/salud.sh` |
| Actualizar a la última versión | `./scripts/actualizar.sh` |
| Respaldar ahora | `./scripts/respaldar.sh --verificar` |
| Restaurar un respaldo | `./scripts/restaurar.sh backups/base-AAAAMMDD-HHMMSS.sql.gz` |
| Ver el registro en vivo | `docker compose -f docker-compose.tailscale.yml logs -f app` |
| Reiniciar la aplicación | `docker compose -f docker-compose.tailscale.yml restart app` |

`salud.sh` devuelve un código distinto de cero si algo va mal, así que sirve
también para encadenarlo con otra cosa o para vigilarlo desde fuera.

### Actualizar

```bash
./scripts/actualizar.sh
```

Comprueba que no haya cambios sin confirmar en el servidor, trae lo nuevo,
respalda la base, reconstruye y espera a que la aplicación responda. **Si la
versión nueva no arranca, vuelve sola a la anterior** —imagen y código— y
muestra el registro. Un despliegue que deja la plataforma caída y se marcha es
peor que uno que falla.

---

## 4. Respaldos

Es la parte que conviene entender bien, porque el día que importe será tarde
para leerla.

### Qué se respalda y cuándo

- **Automático:** todos los días a las 03:00, por un temporizador de `systemd`.
  Si el servidor estaba apagado a esa hora, el respaldo se hace al encender
  (`Persistent=true`) en lugar de perderse. Si la máquina no trae `systemd`,
  `instalar-servidor.sh` deja la misma orden en el `crontab` del usuario, a la
  misma hora: es el camino de repuesto y pierde la recuperación al encender.
- **Qué incluye:** un volcado completo de PostgreSQL (`base-*.sql.gz`) y un
  archivo con los medios subidos (`medios-*.tar.gz`).
- **Dónde:** el directorio `backups/` del clon, en el servidor, fuera del
  contenedor. Sobrevive a cualquier despliegue.
- **Cuánto se guarda:** 30 días. Se cambia con `DIAS_A_CONSERVAR` en el `.env`.
- **Verificación:** cada respaldo automático se comprueba (`--verificar`): se
  descomprime y se busca la cabecera de un volcado real. Si no la tiene, la
  tarea falla y queda constancia en el registro, en lugar de dejar un archivo
  corrupto que parece bueno en el listado.

Estado y registro del temporizador:

```bash
systemctl status plataforma-respaldo.timer
systemctl list-timers plataforma-respaldo.timer
journalctl -u plataforma-respaldo.service -n 50
```

### Respaldar y descargar desde el panel

En `/admin-panel/respaldos` puede crear un respaldo con un botón, ver los que
hay con su fecha y tamaño, **descargarlos** y eliminar los que sobren. La
página es solo para administradores.

El archivo que sale del botón se llama igual y vive en el mismo directorio que
el del respaldo automático: un solo sistema, no dos que se ignoran, y
`restaurar.sh` restaura por igual uno hecho a mano y uno de las 03:00. Con un
límite que conviene tener claro: el panel vuelca **solo la base**
(`base-*.sql.gz`). El archivo de los medios (`medios-*.tar.gz`) lo escribe
únicamente `scripts/respaldar.sh`. Una copia completa son los dos archivos, así
que llevarse solo el del panel deja fuera las imágenes, los videos y los
modelos subidos.

El panel avisa en el resumen si el último respaldo tiene más de dos días.

### Copia fuera del servidor

Un respaldo que vive en la misma máquina que la base protege del error, no del
incendio. Si tiene otra máquina en la tailnet, agregue al `.env`:

```bash
COPIA_REMOTA=usuario@otra-maquina:/ruta/respaldos-trauma
```

`respaldar.sh` copiará ahí cada volcado con `rsync` después de crearlo. Si la
copia falla, el respaldo local se conserva igual y el script avisa: perder la
copia externa no es motivo para perder también la local.

La alternativa manual, igual de válida: descargar de vez en cuando un respaldo
desde el panel y guardarlo donde corresponda.

### Restaurar

```bash
./scripts/restaurar.sh backups/base-20260906-030000.sql.gz
```

El script, en este orden: comprueba que el archivo sea un volcado legible, pide
que escriba `RESTAURAR` con esas letras, **respalda el estado actual**, detiene
la aplicación para que no escriba a mitad de la restauración, restaura, cuenta
las cuentas recuperadas y vuelve a levantar la aplicación.

Los archivos subidos los repone en el mismo paso, pero solo si en `backups/`
hay un `medios-*.tar.gz` con la **misma marca de tiempo** que el volcado.
Restaurar medios de otro día junto a una base de hoy deja fichas apuntando a
archivos que no existen, así que ante la duda no los toca y lo dice. Es la otra
cara del límite del panel: un volcado creado desde ahí nunca tiene medios de su
misma fecha.

> **Un respaldo que nunca se restauró no es un respaldo.** Pruebe una
> restauración ahora, con la plataforma todavía vacía, y no el día que haga
> falta de verdad.

### Traer los datos desde el servidor de Windows

El contenido no viaja por git: `medios/`, `backups/` y `ejemplos/` están
ignorados a propósito, y la base nunca estuvo en el repositorio. Un `git clone`
en el Ubuntu deja la plataforma **vacía**. Lo que ya hay —las fichas de ejemplo,
los catálogos del simulador, las preparaciones del atlas, las cuentas y los
archivos subidos— se trae con un respaldo de allí restaurado aquí.

**1. En el Windows, el respaldo final.** Con el servicio parado, para que nadie
escriba entre el respaldo y el cambio de servidor:

```powershell
Set-Location C:\Users\vicen\simulaciones
Stop-Service traumahub
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\respaldar.ps1
```

Deja en `backups\` un `base-MARCA.sql.gz` y un `medios-MARCA.tar.gz` con **la
misma marca**. Hacen falta los dos.

**2. En el Ubuntu, instalar primero.** `./scripts/instalar-servidor.sh` como en
la sección 2, hasta que `./scripts/salud.sh` salga bien. **No cree la primera
cuenta en `/instalar`**: las cuentas vienen en el respaldo, y la que se creara
ahí se borraría al restaurar.

**3. Copiar los dos archivos** a la carpeta `backups/` del repositorio en el
Ubuntu —`RUTA` es donde se clonó—, desde el Windows:

```powershell
scp backups\base-MARCA.sql.gz backups\medios-MARCA.tar.gz usuario@servidor:RUTA/backups/
```

**4. Restaurar:**

```bash
./scripts/restaurar.sh backups/base-MARCA.sql.gz
```

Repone la base y, al ver el `medios-` de la misma marca, los archivos.

**5. Comprobar antes de apagar nada.** Entrar con la cuenta de siempre —la
contraseña es la misma—, abrir una ficha con imagen y el caso del simulador, y
ver que el modelo 3D carga. Solo entonces se retira el Windows; hasta ese
momento es la copia buena. No se le vuelve a arrancar `traumahub` para escribir:
lo que se escriba allí después del paso 1 no está en el Ubuntu.

Lo que se comprobó para que esto funcione, y lo que lo rompería:

- **La versión de PostgreSQL.** Allí 17.11, aquí `postgres:17-alpine`: la misma
  mayor. El volcado trae `\restrict`, que exige un `psql` 17.6 o posterior; una
  imagen `17-alpine` bajada hace meses no lo entiende. `docker compose pull db`
  antes de restaurar.
- **El usuario de la base.** El volcado dice `OWNER TO trauma` en cada tabla. El
  instalador crea ese mismo usuario; si en el `.env` del Ubuntu se cambió
  `POSTGRES_USER`, la restauración falla en la primera tabla —sin dañar nada,
  porque va en una transacción—.
- **El prefijo no importa.** La base guarda direcciones con el `/simulaciones`
  del Windows, pero Payload recalcula la de cada archivo al leerla, con el
  nombre del archivo y la configuración del servidor que la sirve. El Ubuntu
  puede salir con otro prefijo o sin ninguno.
- **Las migraciones.** El volcado trae su tabla `payload_migrations`, sin la
  marca de modo desarrollo. Si el código del Ubuntu es más nuevo que el
  respaldo, las pendientes se aplican solas al levantar la aplicación.
- **`PAYLOAD_SECRET` es otro**, porque el instalador genera el suyo. Las
  contraseñas no dependen de él y siguen valiendo; las sesiones abiertas y los
  enlaces de contraseña ya enviados, no.
- **El `.env` no se copia del Windows.** Trae su dirección pública, su prefijo y
  rutas de Windows. Del de allí solo se pasan a mano los `SMTP_*`, si se quiere
  el mismo correo saliente.

`ejemplos/tibia-de-prueba.glb` está ignorado por git, pero no se pierde: es el
origen de un modelo ya subido, que viaja dentro del `medios-`. Si se quiere
conservar también el archivo suelto, se copia con `scp` como los otros.

---

## 5. Cómo está montado

```
                    ┌─────────────────────────────┐
   tailnet  ───────▶│ tailscale serve (anfitrión) │
                    └──────────────┬──────────────┘
                                   │ 127.0.0.1:3000
                    ┌──────────────▼──────────────┐
                    │  trauma-app  (uid 1001)     │
                    │  Next.js + Payload          │
                    └──────┬───────────────┬──────┘
                           │ red interna   │ volúmenes
                    ┌──────▼──────┐  ┌─────▼────────────────┐
                    │  trauma-db  │  │ medios: /app/medios  │
                    │ PostgreSQL  │  │ ./backups: /backups  │
                    └─────────────┘  └──────────────────────┘
```

Puntos que conviene tener presentes:

- La aplicación publica el puerto **solo en `127.0.0.1`**, nunca en `0.0.0.0`:
  es alcanzable desde el propio servidor y desde Tailscale, y sigue invisible
  para la red local y para internet.
- La base **no publica ningún puerto**: solo se llega a ella desde la red
  interna del compose.
- El contenedor no corre como root (uid 1001).
- Los medios subidos y los respaldos viven fuera de la imagen, de modo que
  reconstruirla no borra nada.
- `/api/salud` es el único extremo propio de la API que no pide sesión, y no
  revela nada: solo si la aplicación está en pie y si la base responde. Los de
  autenticación de Payload tampoco la piden, porque son justamente los que la
  abren. Entre las pantallas, tampoco piden sesión `/entrar`, `/clave`,
  `/instalar` y `/creditos`: ninguna de ellas muestra contenido docente. La
  portada sin sesión enseña la presentación y el enlace a `/entrar`, nada más.

### La alternativa: Cloudflare

Si algún día hay dominio propio, existe la otra vía (D-034):

```bash
TUNEL=cloudflare ./scripts/instalar-servidor.sh
```

Con ella el túnel corre como contenedor dentro del compose y la aplicación no
publica **ningún** puerto en el anfitrión. Hace falta el token del túnel en
`CLOUDFLARE_TUNNEL_TOKEN`. Ver `docs/CLOUDFLARE.md`.

---

## 6. Cuando algo va mal

Empiece siempre por lo mismo:

```bash
./scripts/salud.sh
```

Dice, en una pantalla, si los contenedores corren, si la base acepta
conexiones y cuánto pesa, si la aplicación responde y alcanza la base, cuándo
fue el último respaldo y cuánto disco queda.

| Síntoma | Dónde mirar |
|---|---|
| La página no carga | `docker compose -f docker-compose.tailscale.yml logs --tail 100 app` |
| «No autorizado» en todo | La cuenta existe pero no está activa; actívela en `/admin-panel/usuarios` |
| Nadie recibe correos | No hay SMTP configurado; el panel entrega el enlace de clave a mano (`docs/CORREO.md`) |
| Se quedó fuera del panel | `npx tsx scripts/restablecer-clave.ts correo@ejemplo.cl` genera un enlace de un solo uso |
| El disco se llenó | `du -sh backups/*` y baje `DIAS_A_CONSERVAR` |

La plataforma se niega a dejar sin administrador activo: no se puede quitar el
rol ni desactivar la única cuenta que administra. La regla no vive en el panel
sino en la colección —`src/collections/hooks/autobloqueo.ts`, enganchado desde
`src/collections/Usuarios.ts`—, de modo que la respeta también cualquier
escritura que entre por la API. Eso evita el modo más común de quedarse
encerrado fuera.

---

## 7. Qué guardar en lugar seguro

Del servidor, dos cosas:

1. El archivo **`.env`**. Sin `PAYLOAD_SECRET` no se puede leer ninguna sesión;
   sin `POSTGRES_PASSWORD` no se abre la base de un respaldo restaurado en otra
   máquina.
2. Un **respaldo reciente** descargado fuera del servidor.

Con esas dos cosas, la plataforma se reconstruye en una máquina nueva con el
mismo `git clone` y `./scripts/instalar-servidor.sh`, copiando el `.env` antes
de ejecutarlo y restaurando el volcado después.

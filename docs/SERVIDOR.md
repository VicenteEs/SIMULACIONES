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
5. Programa el respaldo diario con un temporizador de `systemd`.
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
> (D-038). La ruta `/admin` se conserva únicamente para que los enlaces
> antiguos —incluido el `/admin/reset/...` de algún correo ya enviado— lleguen
> a la pantalla que corresponde.

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
  (`Persistent=true`) en lugar de perderse.
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
hay con su fecha y tamaño, **descargarlos** y eliminar los que sobren. Los
archivos son exactamente los mismos que produce el cron: un solo sistema, no
dos que se ignoran.

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

> **Un respaldo que nunca se restauró no es un respaldo.** Pruebe una
> restauración ahora, con la plataforma todavía vacía, y no el día que haga
> falta de verdad.

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
                    ┌──────▼──────┐  ┌─────▼───────────────┐
                    │  trauma-db  │  │ medios: /public/media│
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
- `/api/salud` es el único extremo sin sesión, y no revela nada: solo si la
  aplicación está en pie y si la base responde.

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
rol ni desactivar la única cuenta que administra, ni desde el panel ni desde el
CMS. Eso evita el modo más común de quedarse encerrado fuera.

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

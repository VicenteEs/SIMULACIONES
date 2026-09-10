# Despliegue en el servidor Ubuntu

Estado: **la imagen de producción está construida y verificada**. El ensayo
completo se ejecutó en la máquina de desarrollo con la misma imagen que correrá
en el servidor, y superó las cinco comprobaciones de la decisión D-030.

Lo que falta no es código: son datos de cuentas que solo el titular puede
aportar, y cuáles hacen falta depende del modo con que se publique la
plataforma.

La guía completa del servidor privado, para leerla de arriba abajo, está en
`docs/SERVIDOR.md`. Aquí van la elección del modo, el despliegue y lo que viene
después.

---

## Cómo se publica: tres modos

Lo decide la variable `TUNEL`, y `scripts/comun.sh` la traduce a un archivo de
compose en la función `elegir_compose`:

| `TUNEL` | Compose | Qué levanta |
|---|---|---|
| `tailscale`, por omisión | `docker-compose.tailscale.yml` | Base y aplicación. La aplicación publica `127.0.0.1:3000`, que es de donde lo toma `tailscale serve` |
| `cloudflare` | `docker-compose.prod.yml` | Base, aplicación y un contenedor `tunel` con `cloudflared`. La aplicación no publica ningún puerto |
| `local` | `docker-compose.yml` | Solo la base, para desarrollar con `npm run dev` |

La diferencia entre los dos primeros no es de gusto (decisión D-034). Con
Cloudflare el túnel corre como contenedor dentro de la red del compose, así que
la aplicación no necesita publicar puerto alguno. Con Tailscale el demonio corre
en el anfitrión, fuera de esa red, y por eso la aplicación sí debe publicar uno.
Ese puerto se publica en `127.0.0.1` y nunca en `0.0.0.0`: queda alcanzable para
el propio servidor y para Tailscale, y sigue invisible desde la red local y
desde internet.

**El valor por omisión es `tailscale`.** `scripts/comun.sh` hace
`TUNEL="${TUNEL:-tailscale}"`. Ejecutar `./scripts/deploy.sh` a secas no levanta
ningún túnel de Cloudflare por mucho que `CLOUDFLARE_TUNNEL_TOKEN` esté escrito
en el `.env`: ese archivo de compose ni siquiera se lee y el token queda sin
usar. Para Cloudflare hay que decirlo:

```bash
TUNEL=cloudflare ./scripts/deploy.sh
```

Y hay que decírselo a todos los guiones, no solo a ese. `salud.sh`,
`respaldar.sh`, `restaurar.sh` y `actualizar.sh` llaman al mismo
`elegir_compose`, así que sin la variable miran el despliegue equivocado y lo
dan por caído. Lo cómodo es exportarla una vez en la sesión:

```bash
export TUNEL=cloudflare
```

`scripts/instalar-servidor.sh` además la graba en el respaldo programado, para
que el respaldo diario mire el mismo despliegue que se instaló.

---

## Lo que hace falta antes de desplegar

### En cualquier modo: acceso al servidor

El servidor Ubuntu necesita:

- Docker y el complemento `docker compose` instalados
- El usuario que despliega dentro del grupo `docker`
- Una clave SSH registrada en GitHub para poder clonar el repositorio

Comprobación rápida en el servidor:

```bash
docker --version && docker compose version && docker info >/dev/null && echo "listo"
```

Si el último comando falla por permisos:

```bash
sudo usermod -aG docker $USER
```

y volver a entrar por SSH para que el cambio tenga efecto.

`scripts/instalar-servidor.sh` hace las dos cosas por su cuenta si faltan:
instala Docker desde el repositorio oficial, previa confirmación, y agrega el
usuario al grupo `docker`. Lo segundo tiene un coste: la pertenencia a un grupo
solo se aplica al iniciar sesión, así que el guion se detiene ahí y pide cerrar
el SSH, volver a entrar y ejecutarlo otra vez. De ahí que convenga hacer la
comprobación de arriba antes de empezar.

### Si se publica por Tailscale (lo habitual)

No hace falta dominio ni token. Hace falta Tailscale instalado en el servidor y
con sesión iniciada, y eso se hace aparte: ningún guion lo instala.
`instalar-servidor.sh` ni siquiera lo comprueba, y `deploy.sh` solo consulta
`tailscale serve status` al final, para decidir si recuerda el comando de
publicación. Conviene saberlo porque sin Tailscale el despliegue igual termina
bien: la plataforma queda corriendo en `127.0.0.1:3000` y sin nadie que la
alcance.

Publicar el servicio es un comando, y hay que elegir cuál:

```bash
sudo tailscale serve --bg 3000     # privado, solo su tailnet
sudo tailscale funnel --bg 3000    # público en internet, con HTTPS
```

`deploy.sh` los recuerda al terminar si ve que el 3000 todavía no está
publicado. La dirección pública que `instalar-servidor.sh` propone para el
`.env` es `https://<nombre-del-equipo>.ts.net`, que es la que entrega Tailscale.

### Si se publica por Cloudflare

Hacen falta dos cosas más.

#### Un dominio

Cualquiera sirve. Se compra en Cloudflare, Namecheap o similar, entre 8 y 15
dólares al año. Si se compra fuera de Cloudflare, hay que apuntar sus servidores
de nombres a los de Cloudflare, cosa que el panel indica paso a paso.

#### El túnel

1. Crear una cuenta gratuita en `dash.cloudflare.com` y agregar el dominio.
2. Ir a **Zero Trust → Networks → Tunnels → Create a tunnel**, elegir
   *Cloudflared* y darle un nombre, por ejemplo `plataforma-trauma`.
3. Copiar el **token** que entrega. Es una cadena larga, y es el único secreto
   de esta parte.
4. En la pestaña **Public Hostname** del túnel, agregar:

   | Campo | Valor |
   |---|---|
   | Subdomain | `plataforma` (o el que se prefiera) |
   | Domain | el dominio propio |
   | Service Type | `HTTP` |
   | URL | `app:3000` |

   Ese `app:3000` apunta al contenedor por su nombre dentro de la red del
   compose. Es lo que permite que la aplicación **nunca** se exponga en el
   anfitrión.

El procedimiento largo, incluido cómo colgar del mismo túnel otros servicios del
servidor, está en `docs/CLOUDFLARE.md`.

---

## El despliegue

Desde un clon limpio, un solo comando:

```bash
git clone git@github.com:VicenteEs/SIMULACIONES.git plataforma
cd plataforma
./scripts/instalar-servidor.sh                    # Tailscale, por omisión
# o bien:
TUNEL=cloudflare ./scripts/instalar-servidor.sh
```

Ese guion instala Docker si falta, genera el `.env` con secretos aleatorios
(pregunta la dirección pública y, en el modo Cloudflare, el token del túnel),
deja `backups/` con dueño y permisos correctos, despliega, **programa el
respaldo diario** y termina ejecutando `salud.sh`. Es idempotente: se puede
repetir sin romper nada.

El `.env` que ya exista no se sobrescribe nunca, y eso tiene una consecuencia
que conviene saber: si el archivo ya está, el guion tampoco pregunta por el
token del túnel. En ese caso hay que escribirlo a mano.

### Si prefiere escribir el `.env` a mano

```bash
cp .env.example .env
nano .env
./scripts/deploy.sh
```

Lo mínimo que hay que completar:

```bash
POSTGRES_USER=trauma
POSTGRES_PASSWORD=          # generar: openssl rand -base64 24
POSTGRES_DB=trauma
PAYLOAD_SECRET=             # generar: openssl rand -base64 48
NEXT_PUBLIC_SERVER_URL=     # con Tailscale, https://<equipo>.ts.net
CLOUDFLARE_TUNNEL_TOKEN=    # solo en el modo cloudflare
```

El resto de las variables, con su explicación, está en `.env.example`.

`deploy.sh` se niega a continuar si falta alguna de esas variables o si alguna
conserva el valor de ejemplo, es decir, si contiene `CAMBIAR`. Un despliegue que
arranca con el secreto de ejemplo es peor que uno que no arranca: parece
correcto. El token del túnel solo se exige cuando `TUNEL=cloudflare`.

Si la base ya está en marcha, la respalda antes de reconstruir, en
`backups/base-AAAAMMDD-HHMMSS.sql.gz`. Solo la base: los archivos subidos no
entran en ese respaldo, de esos se encarga el respaldo diario. Después espera
hasta 90 segundos a que la aplicación responda en `/api/salud`. La consulta la
hace desde dentro del contenedor, porque en el modo Cloudflare no hay ningún
puerto publicado en el anfitrión al que llamar, y `/api/salud` toca la base
antes de contestar: un «ok» significa aplicación y base en pie, no solo el
puerto abierto.

Si no responde, vuelve a la imagen anterior. En la primera instalación no hay
imagen anterior a la que volver, así que ahí lo único que hace es mostrar las
últimas sesenta líneas del registro y detenerse.

Lo que `deploy.sh` **no** hace es programar el respaldo diario. Eso solo lo deja
hecho `instalar-servidor.sh`. Quien despliegue a mano tiene que ocuparse aparte,
como se explica más abajo.

### La primera cuenta

Al terminar, abrir `/instalar` en la dirección pública que se puso en
`NEXT_PUBLIC_SERVER_URL` y crear la primera cuenta. **Esa primera cuenta queda
como administradora y activa de forma automática** (decisión D-028); todas las
siguientes nacen como lectoras desactivadas y hay que habilitarlas a mano desde
el panel.

---

## Qué quedó verificado en el ensayo

Con la imagen real de producción, no con el modo desarrollo:

| Comprobación | Resultado |
|---|---|
| Usuario del contenedor | `uid=1001(nextjs)`, no root |
| Puerto de la base en el anfitrión | ninguno |
| `GET /api/patologias` sin sesión | 403 |
| `robots.txt` | `Disallow: /` |
| Cabeceras de seguridad | las cinco presentes |
| Arranque completo | 10 segundos |
| Tamaño de la imagen | 334 MB |

---

## Después del despliegue

### Respaldos automáticos

Ya quedan programados. Lo hace `scripts/instalar-servidor.sh` al instalar
(decisión D-036), y no hay que escribir ningún cron a mano.

Donde hay systemd escribe dos unidades:

- `plataforma-respaldo.service` ejecuta `scripts/respaldar.sh --verificar` desde
  el directorio del clon, como el usuario que instaló y con `TUNEL` fijado al
  modo con que se instaló.
- `plataforma-respaldo.timer` lo dispara a las 03:00, con `Persistent=true` y
  `RandomizedDelaySec=300`. `Persistent=true` es lo que importa: si el servidor
  estaba apagado a esa hora, el respaldo se hace al encender en lugar de
  perderse hasta el día siguiente.

Comprobar cómo va:

```bash
systemctl status plataforma-respaldo.timer
journalctl -u plataforma-respaldo.service
```

Donde no hay systemd, el mismo guion cae a una línea de cron equivalente, que
deja el registro en un archivo porque en cron nadie lee la salida:

```
0 3 * * * cd /ruta/del/clon && TUNEL=tailscale ./scripts/respaldar.sh --verificar >> backups/respaldo.log 2>&1
```

`salud.sh` comprueba las dos vías y avisa si el respaldo diario no está
programado por ninguna, o si el último respaldo tiene más de dos días.

### Por qué no un `pg_dump` propio en el cron

Escribir el volcado a mano en una línea de cron parece equivalente y no lo es.
Hay cuatro razones, y todas se descubren tarde.

**El nombre.** `src/lib/respaldos.ts` reconoce exactamente dos patrones,
`base-AAAAMMDD-HHMMSS.sql.gz` y `medios-AAAAMMDD-HHMMSS.tar.gz`. Un archivo con
cualquier otro nombre es invisible: no aparece en el panel de respaldos, no se
puede descargar ni borrar desde ahí, la retención de `respaldar.sh` no lo limpia
porque busca esos mismos patrones, y `salud.sh` no lo cuenta ni mira su
antigüedad. El estado sigue en rojo mientras el disco se llena de respaldos que
nadie ve.

**Los archivos subidos.** Un `pg_dump` a secas deja fuera `medios/`, que es lo
único irreemplazable de la plataforma: la base se puede volver a escribir; una
resonancia segmentada, no. `respaldar.sh` los empaqueta en el mismo momento y
con la misma marca de tiempo que el volcado, y falla si no los puede leer, en
lugar de dar por bueno un respaldo a medias.

**La verificación.** Con `--verificar`, comprueba que el volcado se descomprima
y traiga la cabecera de PostgreSQL. Y si el volcado falla a mitad, borra el
archivo truncado, con `--verificar` o sin él: si se queda, al día siguiente el
panel y `salud.sh` lo dan por bueno solo por su fecha.

**La retención y la copia externa.** Descarta lo anterior a `DIAS_A_CONSERVAR`
días, treinta por omisión, y si se define `COPIA_REMOTA=usuario@maquina:/ruta`
copia fuera del servidor con rsync. Un respaldo que vive en la misma máquina que
la base protege del error, no del incendio.

### Respaldar a mano

Antes de una maniobra arriesgada, o para probar que todo esto funciona:

```bash
./scripts/respaldar.sh --verificar
```

Con `TUNEL=cloudflare` delante si ese es el modo. Es seguro repetirlo: cada
ejecución crea sus propios archivos fechados y no pisa los anteriores.

### Restaurar

```bash
./scripts/restaurar.sh backups/base-20260906-030000.sql.gz
```

Sin argumento lista los diez volcados más recientes. Pide escribir `RESTAURAR`
antes de tocar nada, respalda el estado actual por si acaso y detiene la
aplicación mientras trabaja, porque restaurar con la aplicación escribiendo
encima deja la base a medio camino entre las dos versiones. La restauración va
dentro de una transacción: o entra entera o la base queda como estaba.

**También restaura los archivos subidos.** Busca
`backups/medios-<la misma marca de tiempo>.tar.gz` y lo desempaqueta en `/app`.
La misma marca a propósito: medios de otro día junto a una base de hoy deja
fichas apuntando a archivos que no existen. Lo desempaqueta desde un contenedor
desechable con los mismos volúmenes montados, no desde la aplicación, porque en
ese punto la aplicación está detenida. Si no hay respaldo de medios de esa
fecha, avisa, deja la base restaurada e indica la orden para hacerlo a mano, ya
con la plataforma en pie:

```bash
gzip -dc backups/medios-FECHA.tar.gz | docker compose -f docker-compose.tailscale.yml exec -T app tar xzf - -C /app
```

Con `-f docker-compose.prod.yml` en el modo Cloudflare. Los archivos subidos
viven en el volumen `medios`, montado en `/app/medios` dentro del contenedor:
fuera de la imagen, para que sobrevivan a cada despliegue.

**Un respaldo que nunca se restauró no es un respaldo.** Conviene probar una
restauración antes de que la plataforma tenga contenido que perder.

### Actualizar

```bash
./scripts/actualizar.sh
```

Trae los cambios con `merge --ff-only`, respalda, reconstruye y comprueba. Si la
versión nueva no responde, `deploy.sh` vuelve solo a la imagen anterior y
`actualizar.sh` devuelve además el código al punto en que estaba, para que el
árbol de trabajo y el contenedor no queden contando historias distintas. Se
niega a actuar si hay cambios sin confirmar: un servidor no es sitio para editar
código.

### Ver el registro

```bash
docker compose -f docker-compose.tailscale.yml logs -f app   # modo tailscale
docker compose -f docker-compose.prod.yml logs -f app        # modo cloudflare
```

Para el estado completo de un vistazo, `./scripts/salud.sh`: contenedores, base,
aplicación, respaldos y espacio en disco.

### Una segunda puerta para el panel

Solo en el modo Cloudflare. En Zero Trust se puede exigir que `/admin-panel`
sea accesible únicamente desde correos concretos, con código de verificación por
correo, antes incluso de llegar al inicio de sesión de la plataforma. Es
gratuito hasta cincuenta usuarios y se configura en **Access → Applications**.
Muy recomendable.

Con Tailscale la segunda puerta ya está puesta de otra forma: con
`tailscale serve` la plataforma solo se ve desde la tailnet. Si se publica con
`tailscale funnel`, en cambio, queda expuesta a internet y la única puerta es el
inicio de sesión de la plataforma.

# TraumaHub en el servidor de `paginas/`

Cómo encaja esta plataforma junto a las demás páginas del servidor `ved`, sin
chocar con ninguna.

## Cómo está montado ese servidor

```
Internet ──► Tailscale Funnel :10000 ──► 127.0.0.1:8080 ──► Nginx Proxy Manager
                                                                    │
                                          ┌─────────────────────────┼──────────────────────┐
                                          │  red docker «proxy»     │                      │
                                     apce-web:3000            mi-web-latsib:80        traumahub:3000
                                     (ruta /)                 (/mi-web-latsib,        (/traumahub)
                                                               /equipo, …)
```

Tres reglas que sigue todo el mundo ahí y que esta página también sigue:

1. **Ningún contenedor publica puertos HTTP en el anfitrión.** La única entrada
   es el proxy, a través de la red externa `proxy`. Solo se publican en
   `127.0.0.1` los puertos de base de datos, para respaldos e inspección.
2. **Cada proyecto es una carpeta con `.git` y `docker-compose.yml`.**
   `start-all.sh` los levanta al reiniciar y `auto-update.sh` trae los cambios
   del remoto y redespliega cada 30 minutos.
3. **Cada página cuelga de su propia ruta.** La raíz `/` es de APCE.

### Rutas ya ocupadas

`/` · `/api` · `/actividades` · `/equipo` · `/image.jpg` · `/logo-circle.png`
`/mi-web-latsib` · `/senales` · `/senales/api` · `/vite.svg`

TraumaHub usa **`/traumahub`**, que está libre. Su propia API queda bajo
`/traumahub/api`, de modo que **no choca con el `/api` de APCE**.

### Puertos de base de datos ya ocupados

`5433` (APCE) y `5434` (señales). TraumaHub usa el **5432**, que estaba libre.

---

## Instalación

```bash
cd /home/chesscore/Escritorio/paginas
git clone git@github.com:VicenteEs/SIMULACIONES.git traumahub
cd traumahub

cp despliegue/paginas/docker-compose.override.yml .
cp despliegue/paginas/env.ejemplo .env
chmod 600 .env
nano .env            # completar POSTGRES_PASSWORD y PAYLOAD_SECRET

mkdir -p backups
sudo chown -R 1001:"$(id -g)" backups && chmod 770 backups

docker compose up -d --build
```

El `docker-compose.override.yml` **no se versiona** (lo ignora `.gitignore`),
así que `auto-update.sh` puede hacer `git pull --ff-only` sin chocar nunca con
él, y a la vez `docker compose up -d` lo fusiona solo con el compose del
repositorio. Por eso no hace falta tocar los scripts del servidor.

## La ruta en el proxy

La ruta **no** se dio de alta desde el panel de NPM sino como fragmento de
configuración, en:

```
nginx-proxy-manager/data/nginx/custom/server_proxy.conf
```

Nginx Proxy Manager incluye ese archivo dentro de **cada** server de proxy que
genera (su plantilla `proxy_host.conf` trae
`include /data/nginx/custom/server_proxy[.]conf`). Se eligió así por dos
razones:

1. **No toca nada de lo que ya existe.** La base de datos de NPM y la
   configuración del panel se quedan como estaban, de modo que dar de alta
   TraumaHub no puede estropear las rutas de APCE, mi-web-latsib ni señales.
2. **Sobrevive** a reinicios y actualizaciones de NPM.

El fragmento apunta el destino con una **variable**, y eso es lo importante:

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
set $traumahub http://traumahub:3000;
proxy_pass $traumahub;
```

Con un `proxy_pass http://traumahub:3000` literal, nginx resuelve el nombre al
**cargar** la configuración: si el contenedor de TraumaHub estuviera parado,
nginx entero se negaría a arrancar y se caerían **todas** las páginas del
servidor. Con la variable y el resolver de Docker, el nombre se resuelve en
cada petición: TraumaHub caído da un 502 en `/traumahub` y las demás páginas
siguen sirviendo con normalidad.

El fragmento incluye además:

- `proxy_buffering off` y `proxy_read_timeout 3600s`, sin los cuales el flujo
  de eventos de «hay contenido nuevo» se queda en el búfer de nginx y el aviso
  no llega nunca;
- `client_max_body_size 64m`, porque el techo por omisión de nginx (1 MB) queda
  por debajo de lo que la plataforma acepta: sin esta línea, un vídeo se rechaza
  con un 413 antes de llegar siquiera a la aplicación. **Esta línea no cambia**
  desde que la plataforma admite vídeo de quirófano, y merece la pena entender
  por qué no.

### La cadena de topes, y por qué el de nginx es el último

Los cuatro números tienen que ir creciendo hacia fuera, de modo que quien corte
sea siempre la aplicación, que sabe decir en español qué pasó y cuánto pesaba el
archivo. Un proxy que corta antes devuelve un 413 sin una palabra dentro.

| Tope | Dónde | Hoy |
|---|---|---|
| Techo del archivo en `medios` | `TECHO_DE_MEDIOS_BYTES`, `src/admin/esquema.ts` | 50 MB |
| Techo del archivo en `modelos-3d` | `TECHO_DE_MODELOS_3D_BYTES`, mismo archivo | 5 MB |
| Cuerpo de una acción de servidor | `serverActions.bodySizeLimit`, `next.config.mjs` | 52 MB |
| Cuerpo que admite el proxy | `client_max_body_size`, este fragmento | 64 MB |

50 ≤ 52 ≤ 64. Lo compara `tests/unit/subidaDeVideo.test.ts`, que **lee este
archivo**: si alguien sube el techo de la aplicación por encima de los 64 MB sin
tocar el proxy, la suite falla en vez de dejar dos cifras que no se hablan.

La subida del panel ya no va por una acción de servidor sino por una ruta
(`src/app/(frontend)/api/subidas/[coleccion]/route.ts`), que recibe el archivo
en flujo y no lleva el límite de `bodySizeLimit`; el tercer número de la tabla
sigue ahí porque el editor de bloques todavía inserta archivos por la vía
antigua. El techo de la aplicación se dejó en 50 y no se subió el del proxy a
propósito: ese nginx vive en **otra máquina** y en un archivo que este
repositorio no versiona, así que un número puesto aquí no lo pone allá, y esa es
exactamente la forma en que nacen dos límites que se contradicen.

**Si algún día hacen falta más de 64 MB**, el orden es al revés y no se puede
saltar: primero el proxy, después la aplicación.

```bash
# En el servidor, dentro del fragmento que ya existe:
docker exec nginx-proxy-manager sh -c \
  "sed -i 's/client_max_body_size 64m/client_max_body_size 128m/' /data/nginx/custom/server_proxy.conf"
docker exec nginx-proxy-manager nginx -s reload
```

Y después actualizar la tabla de aquí arriba, que es lo que la prueba lee. Ojo
con los otros dos vecinos del proxy: el fragmento se incluye en **cada** server
que genera NPM, así que ese número lo suben también APCE, mi-web-latsib y
señales sin haberlo pedido.

Esta línea decía «hasta 50 MB», que es lo que `upload.limits` prometía antes de
corregirse; aquellos 50 MB no existieron nunca en el servidor, porque quien
cortaba de verdad era el cuerpo de las acciones de Next. Los de ahora sí
existen, y por eso están en una tabla y no en una frase.

> Si algún día se prefiere gestionarla desde el panel: **Custom locations** →
> location `/traumahub`, scheme `http`, hostname `traumahub`, puerto `3000`; y
> entonces vaciar el fragmento para no tener la regla dos veces.

Para deshacerla:

```bash
docker exec nginx-proxy-manager cp   /data/nginx/custom/server_proxy.conf.antes-de-traumahub   /data/nginx/custom/server_proxy.conf
docker exec nginx-proxy-manager nginx -s reload
```

## Por qué las rutas son relativas

La aplicación se compila con `basePath: /traumahub`, de modo que Next.js pone
ese prefijo en cada enlace y en cada recurso. Lo que se escribe a mano —una
imagen, un `fetch`, el flujo de eventos— pasa por `ruta()` de
`src/lib/rutas.ts`, que hace lo mismo.

El resultado es que **el navegador nunca sale del origen en el que está**: si
entró por `https://ved.tailc2094f.ts.net:10000/traumahub`, todos los enlaces
siguen dentro de ese host y ese puerto. Es lo que evita el fallo clásico de una
aplicación tras un proxy en un puerto distinto del 443: un enlace absoluto
manda al usuario al mismo dominio **sin el puerto**, y ahí no hay nada.

Por lo mismo, `NEXT_PUBLIC_SERVER_URL` en el `.env` lleva el puerto **y** el
prefijo: es lo que usan los pocos enlaces que sí tienen que ser absolutos, como
el de recuperar contraseña que viaja por correo.

> El prefijo se incrusta al **compilar**. Cambiarlo obliga a reconstruir:
> `docker compose build --build-arg BASE_PATH=/otro app`

## Primera cuenta

Abrir `https://ved.tailc2094f.ts.net:10000/traumahub/instalar`. La primera
cuenta queda como administradora y activa, y la pantalla desaparece en cuanto
existe.

## Comprobaciones

```bash
cd /home/chesscore/Escritorio/paginas/traumahub

docker compose ps
docker compose logs -f app

# La aplicación responde y alcanza la base:
docker compose exec -T app wget -qO- http://127.0.0.1:3000/traumahub/api/salud

# A través del proxy, como llega un visitante:
curl -sI http://127.0.0.1:8080/traumahub -H 'Host: ved.tailc2094f.ts.net'
```

## Respaldos

El respaldo diario **ya está programado** en el `crontab` del usuario `ved`:

```
0 3 * * * cd /home/chesscore/Escritorio/paginas/traumahub && TUNEL=local ./scripts/respaldar.sh --verificar >> backups/respaldo.log 2>&1
```

`TUNEL=local` hace que el script use el `docker-compose.yml` de la carpeta, que
es el que aquí corresponde. El volcado se verifica antes de darlo por bueno y
se conservan treinta días.

El panel (`/traumahub/admin-panel/respaldos`) crea y descarga volcados a mano.
Lo que le permite escribir no es el bit de «otros», sino el `chown` de más
arriba: el directorio `backups/` es del uid 1001, que es el del contenedor, y
su grupo es el del usuario que despliega. Con `chmod 770` escriben esos dos y
nadie más entra.

Los tres scripts que tocan el directorio (`scripts/instalar-servidor.sh`,
`scripts/deploy.sh` y `scripts/respaldar.sh`) repiten ese `chmod 770`, pero
solo surte efecto mientras el directorio siga siendo de quien los ejecuta: en
cuanto pasa a ser del uid 1001, `chmod` únicamente lo puede correr su dueño o
root. `instalar-servidor.sh` lo tiene previsto y cae en `sudo chmod 770`; los
otros dos acaban en `|| true` y fallan en silencio a propósito, para no tumbar
un despliegue ni un respaldo por un permiso que casi siempre ya estaba bien. Si
alguna vez se pierde, se repone a mano con `sudo chmod 770 backups`.

Si algún día se instala `acl` en el servidor, lo correcto es sustituirlo por
esto, y en este orden:

```bash
sudo apt install acl
sudo chown -R "$(id -u)":"$(id -g)" backups
chmod 700 backups
setfacl -m u:1001:rwx backups && setfacl -d -m u:1001:rwx backups
```

El orden no es capricho. Sobre un directorio que ya tiene ACL extendida,
`chmod` no toca los permisos del grupo: reescribe la **máscara**, que es el
techo de todo lo que la ACL conceda. Con el `chmod 700` al final, `u:1001:rwx`
queda limitado por una máscara vacía y el contenedor pierde la escritura sin
que nada avise; `getfacl` lo delata con un `#effective:---`. Puesto antes,
`setfacl` recalcula la máscara solo. El `chown` inicial hace falta porque, tras
el `chown` a 1001 de la instalación, quien despliega ya no puede ejecutar
`chmod` sobre ese directorio.

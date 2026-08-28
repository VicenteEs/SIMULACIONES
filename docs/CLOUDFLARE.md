# Cloudflare Tunnel · guía práctica

Guía para exponer servicios autoalojados sin abrir un solo puerto del router.
Escrita para esta plataforma, pero el procedimiento sirve igual para cualquier
otro servicio del mismo servidor.

---

## El modelo mental

Lo normal para publicar un servicio casero sería abrir el puerto 443 en el
router. Eso hace tres cosas malas: publica la dirección IP del domicilio, expone
la red doméstica al escaneo constante de internet, y deja de funcionar cada vez
que el proveedor cambia la dirección.

El túnel invierte la dirección de la conexión. Un demonio llamado `cloudflared`
corre **dentro** del servidor y abre una conexión **saliente** hacia la red de
Cloudflare. El tráfico de los visitantes llega a Cloudflare, baja por esa
conexión ya establecida y alcanza el servicio.

    visitante -> Cloudflare -> [conexión saliente] -> cloudflared -> servicio

El router no abre nada. La dirección IP nunca se publica. El certificado HTTPS
lo gestiona Cloudflare.

**Lo más importante para quien tiene varios servicios:** hace falta *un solo
túnel por servidor*, no uno por servicio. Un mismo túnel enruta muchos nombres
públicos hacia muchos servicios internos.

    plataforma.midominio.cl  ->  http://app:3000
    fotos.midominio.cl       ->  http://192.168.1.50:2342
    libros.midominio.cl      ->  http://192.168.1.50:8083

---

## Paso 1 · El dominio

Es el único gasto: entre 8 y 15 dólares al año. Cloudflare Tunnel no cobra.

**Comprarlo directamente en Cloudflare** (`dash.cloudflare.com` → Domain
Registration) ahorra el paso de mover los servidores de nombres, porque quedan
configurados solos. Si se compra en otro registrador, hay que entrar a la
configuración del dominio allí y reemplazar sus servidores de nombres por los
dos que Cloudflare indica. El cambio tarda entre unos minutos y unas horas.

Para un dominio chileno `.cl` hay que registrarlo en NIC Chile y apuntar los
servidores de nombres a Cloudflare a mano. Un `.com` o un `.org` comprado en
Cloudflare es bastante menos trámite.

## Paso 2 · Agregar el dominio a Cloudflare

En `dash.cloudflare.com`, **Add a site**, escribir el dominio y elegir el plan
**Free**. Cloudflare muestra dos servidores de nombres; hay que ponerlos en el
registrador. El panel avisa cuando el dominio queda activo.

## Paso 3 · Crear el túnel

1. Ir a **Zero Trust** (menú lateral) → **Networks** → **Tunnels**
2. **Create a tunnel** → elegir **Cloudflared**
3. Nombrarlo por el servidor y no por el servicio: `servidor-casa` sirve para
   todos los servicios que corran allí
4. Cloudflare muestra el comando de instalación con un **token** largo. Ese
   token es el único secreto de esta parte: **no se comparte ni se versiona**

## Paso 4 · Ejecutar el túnel en el servidor

Dos formas. La segunda es la que usa esta plataforma.

### Como servicio del sistema

Sirve cuando los servicios no están en Docker, o están repartidos por la red
local:

```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
sudo cloudflared service install <TOKEN>
sudo systemctl status cloudflared
```

Desde ahí, ese demonio puede enrutar hacia cualquier dirección alcanzable desde
el servidor, incluidas otras máquinas de la red local.

### Como contenedor

Es lo que hace `docker-compose.prod.yml` de esta plataforma:

```yaml
tunel:
  image: cloudflare/cloudflared:latest
  restart: unless-stopped
  command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
  networks: [interna]
```

La ventaja de esta variante es fuerte: el contenedor del túnel comparte red con
la aplicación, de modo que **la aplicación no publica ningún puerto en el
anfitrión**. Ni siquiera desde el propio servidor se la puede alcanzar por un
puerto local. El túnel es la única puerta.

Su límite es el reverso de lo mismo: solo alcanza contenedores de esa red. Para
servicios fuera de Docker conviene el servicio del sistema.

## Paso 5 · Publicar el nombre

En el túnel recién creado, pestaña **Public Hostname** → **Add a public
hostname**:

| Campo | Valor para esta plataforma |
|---|---|
| Subdomain | `plataforma` |
| Domain | el dominio propio |
| Path | vacío |
| Service Type | `HTTP` |
| URL | `app:3000` |

`app:3000` es el **nombre del contenedor** dentro de la red del compose. Si el
túnel corriera como servicio del sistema, ahí iría `localhost:3000` o la
dirección local de otra máquina.

Se repite este paso por cada servicio: otro subdominio, otra URL interna, el
mismo túnel.

## Paso 6 · Poner una segunda puerta en el panel

Esto es gratis hasta cincuenta usuarios y conviene hacerlo siempre.

**Zero Trust → Access → Applications → Add an application → Self-hosted**

| Campo | Valor |
|---|---|
| Application name | Panel de contenido |
| Subdomain / Domain | `plataforma` · el dominio |
| Path | `admin` |

En **Policies**, crear una con acción **Allow** y regla **Emails**, indicando los
correos que pueden entrar.

El efecto: antes incluso de ver el inicio de sesión de la plataforma, Cloudflare
pide un código enviado por correo. Quien no esté en esa lista no llega a ver
nunca el formulario. Son dos cerraduras independientes en la puerta que más
importa.

---

## Comprobación

```bash
# En el servidor: el túnel está conectado
docker compose -f docker-compose.prod.yml logs tunel | grep -i "registered\|connection"

# Desde cualquier parte: responde con certificado válido
curl -I https://plataforma.midominio.cl
```

En el panel, el túnel debe figurar como **HEALTHY** con cuatro conexiones
activas hacia distintos centros de datos.

---

## Cosas que conviene saber antes

**El túnel no protege lo que publica.** Oculta la dirección IP y evita abrir
puertos, pero cualquiera que conozca el nombre público llega al servicio. La
autenticación sigue siendo responsabilidad de la aplicación —en esta plataforma,
la decisión D-020— y de las políticas de Access.

**El plan gratuito no permite servir vídeo masivo.** La sección 2.8 de los
términos de servicio de Cloudflare prohíbe usar el CDN gratuito para
distribuir volúmenes grandes de vídeo. Para unos cuantos vídeos de maniobras no
hay problema, pero si el módulo de examen físico llega a tener horas de material
propio, corresponde mover ese contenido a Cloudflare Stream, a R2 o a otro
alojamiento.

**Los archivos grandes tienen tope.** El plan gratuito limita la subida a 100 MB
por petición. Los modelos tridimensionales de esta plataforma pesan menos de 5
MB (observación O-008), así que no molesta, pero conviene tenerlo presente para
otros servicios.

**Un túnel caído deja el servicio inalcanzable.** Con `restart: unless-stopped`
el contenedor vuelve solo, y `cloudflared` reintenta la conexión por su cuenta.
Vale la pena mirar los registros la primera vez que ocurra.

---

## Migrar un servicio que hoy va por Tailscale

Los dos pueden convivir sin conflicto: Tailscale para administrar el servidor
por SSH, Cloudflare para publicar los servicios a quien no va a instalar nada.
De hecho es una buena combinación.

1. Agregar el nombre público en la pestaña **Public Hostname** del túnel,
   apuntando a la misma dirección interna que hoy usa Tailscale
2. Comprobar que responde por el nuevo nombre
3. Recién entonces dejar de publicar ese servicio por Tailscale

Conviene mantener el acceso por Tailscale al propio servidor: si el túnel falla,
sigue habiendo una vía para entrar y arreglarlo.

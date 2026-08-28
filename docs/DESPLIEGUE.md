# Despliegue en el servidor Ubuntu

Estado: **la imagen de producción está construida y verificada**. El ensayo
completo se ejecutó en la máquina de desarrollo con la misma imagen que correrá
en el servidor, y superó las cinco comprobaciones de la decisión D-030.

Lo que falta no es código: son tres datos que solo el titular de las cuentas
puede aportar.

---

## Lo que hace falta antes de desplegar

### 1. Un dominio

Cualquiera sirve. Se compra en Cloudflare, Namecheap o similar, entre 8 y 15
dólares al año. Si se compra fuera de Cloudflare, hay que apuntar sus servidores
de nombres a los de Cloudflare, cosa que el panel indica paso a paso.

### 2. El túnel de Cloudflare

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

### 3. Acceso al servidor

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

---

## El despliegue

```bash
git clone git@github.com:VicenteEs/SIMULACIONES.git plataforma
cd plataforma
cp .env.example .env
nano .env
./scripts/deploy.sh
```

### Qué poner en el `.env`

```bash
POSTGRES_USER=trauma
POSTGRES_PASSWORD=          # generar: openssl rand -base64 24
POSTGRES_DB=trauma
PAYLOAD_SECRET=             # generar: openssl rand -base64 48
NEXT_PUBLIC_SERVER_URL=https://plataforma.sudominio.cl
CLOUDFLARE_TUNNEL_TOKEN=    # el token del paso 2
```

El script se niega a continuar si falta alguna variable o si `PAYLOAD_SECRET`
conserva el valor de ejemplo. También respalda la base antes de reconstruir.

### La primera cuenta

Al terminar, abrir `https://plataforma.sudominio.cl/admin` y crear la primera
cuenta. **Esa primera cuenta queda como administradora y activa de forma
automática** (decisión D-028); todas las siguientes nacen como lectoras
desactivadas y hay que habilitarlas a mano desde el panel.

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

`scripts/deploy.sh` respalda antes de cada despliegue, pero conviene además un
respaldo diario. En el servidor:

```bash
crontab -e
```

y agregar:

```
0 3 * * * cd ~/plataforma && docker compose -f docker-compose.prod.yml exec -T db pg_dump -U trauma trauma | gzip > backups/diario-$(date +\%Y\%m\%d).sql.gz
```

**Un respaldo que nunca se restauró no es un respaldo.** Conviene probar una
restauración antes de que la plataforma tenga contenido que perder.

### Actualizar

```bash
cd ~/plataforma && git pull && ./scripts/deploy.sh
```

### Ver el registro

```bash
docker compose -f docker-compose.prod.yml logs -f app
```

### Una segunda puerta para el panel

En Cloudflare Zero Trust se puede exigir que `/admin` solo sea accesible desde
correos concretos, con código de verificación por correo, antes incluso de
llegar al inicio de sesión de la plataforma. Es gratuito hasta cincuenta
usuarios y se configura en **Access → Applications**. Muy recomendable.

#!/usr/bin/env bash
# Despliegue en el servidor Ubuntu (decisiones D-010, D-019, D-023).
#
# Deja el servidor operativo desde un clon limpio del repositorio. Es
# idempotente: sirve tanto para la primera instalacion como para actualizar.
#
#   git clone git@github.com:VicenteEs/SIMULACIONES.git plataforma
#   cd plataforma
#   cp .env.example .env && nano .env
#   ./scripts/deploy.sh              # Tailscale (por omision)
#   TUNEL=cloudflare ./scripts/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

rojo()  { printf "[31m%s[0m
" "$*"; }
verde() { printf "[32m%s[0m
" "$*"; }
paso()  { printf "
==> %s
" "$*"; }

if [ "$(id -u)" -eq 0 ]; then
  rojo "No ejecute este script como root."
  rojo "Use un usuario normal que pertenezca al grupo docker."
  exit 1
fi

# Que tunel se usa. Tailscale por omision; cloudflare como alternativa.
TUNEL="${TUNEL:-tailscale}"
case "$TUNEL" in
  tailscale)  COMPOSE="docker-compose.tailscale.yml" ;;
  cloudflare) COMPOSE="docker-compose.prod.yml" ;;
  *) rojo "TUNEL debe ser 'tailscale' o 'cloudflare', no '$TUNEL'."; exit 1 ;;
esac
echo "Tunel: $TUNEL  ·  Compose: $COMPOSE"

paso "Comprobando requisitos"
for cmd in docker git; do
  command -v "$cmd" >/dev/null || { rojo "Falta $cmd."; exit 1; }
done
docker compose version >/dev/null 2>&1 || { rojo "Falta el complemento docker compose."; exit 1; }
docker info >/dev/null 2>&1 || { rojo "El usuario no puede hablar con Docker. Anadalo al grupo: sudo usermod -aG docker \$USER"; exit 1; }
verde "    requisitos correctos"

paso "Comprobando la configuracion"
[ -f .env ] || { rojo "Falta .env. Copie .env.example y complete los valores."; exit 1; }
set -a; . ./.env; set +a
requeridas="POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB PAYLOAD_SECRET NEXT_PUBLIC_SERVER_URL"
[ "$TUNEL" = "cloudflare" ] && requeridas="$requeridas CLOUDFLARE_TUNNEL_TOKEN"
for var in $requeridas; do
  if [ -z "${!var:-}" ]; then rojo "Falta la variable $var en .env"; exit 1; fi
done
case "$PAYLOAD_SECRET" in
  *CAMBIAR*) rojo "PAYLOAD_SECRET sigue con el valor de ejemplo. Genere uno con: openssl rand -base64 48"; exit 1;;
esac
verde "    configuracion completa"

paso "Preparando directorios"
mkdir -p backups
chmod 700 backups

paso "Respaldando la base antes de tocar nada"
if docker compose -f $COMPOSE ps db --status running -q | grep -q .; then
  marca=$(date +%Y%m%d-%H%M%S)
  docker compose -f $COMPOSE exec -T db     pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "backups/antes-de-desplegar-$marca.sql"
  verde "    respaldo en backups/antes-de-desplegar-$marca.sql"
else
  echo "    primera instalacion, no hay nada que respaldar"
fi

paso "Construyendo la imagen"
docker compose -f $COMPOSE build app

paso "Levantando los servicios"
docker compose -f $COMPOSE up -d

paso "Esperando a que la aplicacion responda"
for intento in $(seq 1 90); do
  if docker compose -f $COMPOSE exec -T app node -e "fetch('http://localhost:3000').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    verde "    responde tras ${intento}s"
    break
  fi
  if [ "$intento" -eq 90 ]; then
    rojo "La aplicacion no respondio en 90 segundos."
    docker compose -f $COMPOSE logs --tail 40 app
    exit 1
  fi
  sleep 1
done

paso "Comprobando el tunel"
if [ "$TUNEL" = "cloudflare" ]; then
  if docker compose -f $COMPOSE logs tunel 2>/dev/null | grep -qi "Registered tunnel connection"; then
    verde "    el tunel esta conectado a Cloudflare"
  else
    rojo "    el tunel aun no registra conexiones."
    rojo "    Revise el token en .env y ejecute: docker compose -f $COMPOSE logs tunel"
  fi
else
  if command -v tailscale >/dev/null && tailscale serve status 2>/dev/null | grep -q "3000"; then
    verde "    Tailscale ya publica el puerto 3000"
  else
    echo "    Falta publicar el servicio en Tailscale. Ejecute UNA de estas:"
    echo "      sudo tailscale serve --bg 3000     # privado, solo su tailnet"
    echo "      sudo tailscale funnel --bg 3000    # publico en internet, con HTTPS"
  fi
fi

paso "Programando el respaldo diario"
linea_cron="0 3 * * * cd $(pwd) && TUNEL=$TUNEL ./scripts/respaldar.sh >> backups/respaldo.log 2>&1"
if crontab -l 2>/dev/null | grep -q "respaldar.sh"; then
  verde "    ya estaba programado"
else
  (crontab -l 2>/dev/null; echo "$linea_cron") | crontab - &&     verde "    respaldo diario a las 03:00" ||     rojo "    no se pudo programar; agreguelo a mano con: crontab -e"
fi

paso "Limpiando imagenes antiguas"
docker image prune -f >/dev/null

verde ""
verde "Despliegue completado."
echo
if [ "$TUNEL" = "cloudflare" ]; then
  echo "La aplicacion no publica ningun puerto en el anfitrion: el unico camino"
  echo "de entrada es el tunel de Cloudflare. Compruebe en su panel que la ruta"
  echo "publica apunta a http://app:3000 dentro de la red del compose."
else
  echo "La aplicacion escucha en 127.0.0.1:3000, accesible solo desde el propio"
  echo "servidor. Tailscale la publica desde ahi; no se expone en la red local"
  echo "ni en internet por su cuenta."
  echo
  echo "Estado del tunel:  tailscale serve status"
fi
echo
echo "Registro en vivo:  docker compose -f $COMPOSE logs -f app"

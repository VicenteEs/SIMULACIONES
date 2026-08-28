#!/usr/bin/env bash
# Despliegue en el servidor Ubuntu (decisiones D-010, D-019, D-023).
#
# Deja el servidor operativo desde un clon limpio del repositorio. Es
# idempotente: sirve tanto para la primera instalacion como para actualizar.
#
#   git clone git@github.com:VicenteEs/SIMULACIONES.git plataforma
#   cd plataforma
#   cp .env.example .env && nano .env
#   ./scripts/deploy.sh
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
for var in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB PAYLOAD_SECRET NEXT_PUBLIC_SERVER_URL CLOUDFLARE_TUNNEL_TOKEN; do
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
if docker compose -f docker-compose.prod.yml ps db --status running -q | grep -q .; then
  marca=$(date +%Y%m%d-%H%M%S)
  docker compose -f docker-compose.prod.yml exec -T db     pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "backups/antes-de-desplegar-$marca.sql"
  verde "    respaldo en backups/antes-de-desplegar-$marca.sql"
else
  echo "    primera instalacion, no hay nada que respaldar"
fi

paso "Construyendo la imagen"
docker compose -f docker-compose.prod.yml build app

paso "Levantando los servicios"
docker compose -f docker-compose.prod.yml up -d

paso "Esperando a que la aplicacion responda"
for intento in $(seq 1 90); do
  if docker compose -f docker-compose.prod.yml exec -T app node -e "fetch('http://localhost:3000').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    verde "    responde tras ${intento}s"
    break
  fi
  if [ "$intento" -eq 90 ]; then
    rojo "La aplicacion no respondio en 90 segundos."
    docker compose -f docker-compose.prod.yml logs --tail 40 app
    exit 1
  fi
  sleep 1
done

paso "Comprobando el tunel"
if docker compose -f docker-compose.prod.yml logs tunel 2>/dev/null | grep -qi "Registered tunnel connection"; then
  verde "    el tunel esta conectado a Cloudflare"
else
  rojo "    el tunel aun no registra conexiones."
  rojo "    Revise el token en .env y consulte: docker compose -f docker-compose.prod.yml logs tunel"
fi

paso "Limpiando imagenes antiguas"
docker image prune -f >/dev/null

verde ""
verde "Despliegue completado."
echo
echo "La aplicacion no publica ningun puerto en el anfitrion: el unico camino"
echo "de entrada es el tunel de Cloudflare, que abre una conexion saliente."
echo "Compruebe en el panel de Cloudflare que la ruta publica apunta a"
echo "http://app:3000 dentro de la red del compose."
echo
echo "Registro en vivo:  docker compose -f docker-compose.prod.yml logs -f app"

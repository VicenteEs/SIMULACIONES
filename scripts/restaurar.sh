#!/usr/bin/env bash
# Restauracion de un respaldo.
#
# ESTE SCRIPT SOBRESCRIBE LA BASE DE DATOS. Pide confirmacion escrita antes de
# hacerlo y, aun asi, respalda el estado actual primero: si la restauracion sale
# mal, todavia hay a donde volver.
#
#   ./scripts/restaurar.sh backups/base-20260829-030000.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."

archivo="${1:-}"
if [ -z "$archivo" ]; then
  echo "Uso: $0 <archivo.sql.gz>"
  echo
  echo "Respaldos disponibles:"
  ls -1t backups/base-*.sql.gz 2>/dev/null | head -10 || echo "  (ninguno)"
  exit 1
fi

[ -f "$archivo" ] || { echo "No existe: $archivo" >&2; exit 1; }

TUNEL="${TUNEL:-tailscale}"
case "$TUNEL" in
  tailscale)  COMPOSE="docker-compose.tailscale.yml" ;;
  cloudflare) COMPOSE="docker-compose.prod.yml" ;;
  local)      COMPOSE="docker-compose.yml" ;;
  *) echo "TUNEL debe ser tailscale, cloudflare o local." >&2; exit 1 ;;
esac

set -a; . ./.env; set +a

echo "==> Comprobando el archivo antes de tocar nada"
gzip -t "$archivo" || { echo "El archivo esta corrupto." >&2; exit 1; }
gzip -dc "$archivo" | head -50 | grep -q "PostgreSQL database dump"   || { echo "No parece un volcado de PostgreSQL." >&2; exit 1; }
echo "    el archivo es valido"

echo
echo "Se va a SOBRESCRIBIR la base '$POSTGRES_DB' con el contenido de:"
echo "    $archivo"
echo
printf "Escriba RESTAURAR para continuar: "
read -r respuesta
[ "$respuesta" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

echo "==> Respaldando el estado actual por si acaso"
previo="backups/antes-de-restaurar-$(date +%Y%m%d-%H%M%S).sql.gz"
mkdir -p backups
docker compose -f "$COMPOSE" exec -T db   pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists | gzip -9 > "$previo"
echo "    $previo"

echo "==> Restaurando"
gzip -dc "$archivo" | docker compose -f "$COMPOSE" exec -T db   psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --quiet

echo "==> Comprobando el resultado"
usuarios=$(docker compose -f "$COMPOSE" exec -T db   psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from usuarios;" | tr -d ' 
')
echo "    cuentas restauradas: $usuarios"

echo
echo "Restauracion completada."
echo "Reinicie la aplicacion:  docker compose -f $COMPOSE restart app"
echo "Si algo salio mal, el estado previo esta en: $previo"

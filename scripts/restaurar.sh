#!/usr/bin/env bash
# Restauracion de un respaldo.
#
# ESTE SCRIPT SOBRESCRIBE LA BASE DE DATOS. Pide confirmacion escrita antes de
# hacerlo y, aun asi, respalda el estado actual primero: si la restauracion sale
# mal, todavia hay a donde volver.
#
#   ./scripts/restaurar.sh backups/base-20260906-030000.sql.gz
#
# Un respaldo que nunca se restauro no es un respaldo. Conviene probar esto una
# vez, con la plataforma todavia vacia, antes de necesitarlo de verdad.
set -euo pipefail

cd "$(dirname "$0")/.."
. scripts/comun.sh

archivo="${1:-}"
if [ -z "$archivo" ]; then
  echo "Uso: $0 <archivo.sql.gz>"
  echo
  echo "Respaldos disponibles:"
  ls -1t backups/base-*.sql.gz 2>/dev/null | head -10 || echo "  (ninguno)"
  exit 1
fi

[ -f "$archivo" ] || morir "No existe: $archivo"

elegir_compose
cargar_env

paso "Comprobando el archivo antes de tocar nada"
gzip -t "$archivo" || morir "El archivo esta corrupto."
# El contenido se captura antes de examinarlo: encadenar gzip con head bajo
# "pipefail" hace fallar el conducto por SIGPIPE aunque el contenido sea bueno.
cabecera=$(gzip -dc "$archivo" 2>/dev/null | head -50 || true)
printf '%s' "$cabecera" | grep -q "PostgreSQL database dump" ||
  morir "No parece un volcado de PostgreSQL."
verde "    el archivo es valido"

servicio_en_marcha db || morir "El contenedor de la base no esta en marcha."

echo
rojo "Se va a SOBRESCRIBIR la base '$POSTGRES_DB' con el contenido de:"
echo "    $archivo   ($(du -h "$archivo" | cut -f1), del $(date -r "$archivo" '+%Y-%m-%d %H:%M'))"
echo
printf "Escriba RESTAURAR para continuar: "
read -r respuesta
[ "$respuesta" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

paso "Respaldando el estado actual por si acaso"
mkdir -p backups
previo="backups/base-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose -f "$COMPOSE" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists | gzip -9 > "$previo"
verde "    $previo"

paso "Deteniendo la aplicacion mientras se restaura"
# Restaurar con la aplicacion escribiendo encima deja la base a medio camino
# entre las dos versiones, que es el peor resultado posible.
detenida=0
if servicio_en_marcha app; then
  docker compose -f "$COMPOSE" stop app >/dev/null
  detenida=1
  verde "    aplicacion detenida"
fi

paso "Restaurando"
gzip -dc "$archivo" | docker compose -f "$COMPOSE" exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --quiet

paso "Comprobando el resultado"
usuarios=$(docker compose -f "$COMPOSE" exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from usuarios;" | tr -d '\r ')
verde "    cuentas restauradas: $usuarios"

if [ "$detenida" -eq 1 ]; then
  paso "Volviendo a levantar la aplicacion"
  docker compose -f "$COMPOSE" start app >/dev/null
  verde "    en marcha"
fi

echo
verde "Restauracion completada."
echo "Si algo salio mal, el estado previo esta en: $previo"
echo "Compruebe todo con:  ./scripts/salud.sh"

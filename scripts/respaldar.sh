#!/usr/bin/env bash
# Respaldo de la base de datos y de los archivos subidos.
#
# Pensado para cron, pero tambien util a mano antes de una maniobra arriesgada.
# Es seguro repetirlo: cada ejecucion crea su propio archivo fechado.
#
#   ./scripts/respaldar.sh
#   ./scripts/respaldar.sh --verificar
set -euo pipefail

cd "$(dirname "$0")/.."

TUNEL="${TUNEL:-tailscale}"
case "$TUNEL" in
  tailscale)  COMPOSE="docker-compose.tailscale.yml" ;;
  cloudflare) COMPOSE="docker-compose.prod.yml" ;;
  local)      COMPOSE="docker-compose.yml" ;;
  *) echo "TUNEL debe ser tailscale, cloudflare o local." >&2; exit 1 ;;
esac

DIAS_A_CONSERVAR="${DIAS_A_CONSERVAR:-30}"
DESTINO="backups"
MARCA="$(date +%Y%m%d-%H%M%S)"

set -a; . ./.env; set +a

mkdir -p "$DESTINO"
chmod 700 "$DESTINO"

archivo="$DESTINO/base-$MARCA.sql.gz"

# Si el volcado falla a mitad, gzip ya creo el archivo: se borra al salir con
# error para no dejar respaldos truncados que parezcan buenos en el listado.
limpiar_si_falla() {
  local codigo=$?
  if [ "$codigo" -ne 0 ] && [ -f "$archivo" ]; then
    tam=$(stat -c%s "$archivo" 2>/dev/null || stat -f%z "$archivo" 2>/dev/null || echo 0)
    if [ "$tam" -lt 1024 ]; then
      rm -f "$archivo"
      echo "Se descarto el respaldo incompleto." >&2
    fi
  fi
  exit "$codigo"
}
trap limpiar_si_falla EXIT

echo "==> Volcando la base de datos"
docker compose -f "$COMPOSE" exec -T db   pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists   | gzip -9 > "$archivo"

# Un volcado vacio pesa unos cientos de bytes: menos de 1 KB indica que algo
# fallo aunque pg_dump no lo haya dicho.
tamano=$(stat -c%s "$archivo" 2>/dev/null || stat -f%z "$archivo")
if [ "$tamano" -lt 1024 ]; then
  echo "El respaldo pesa $tamano bytes: demasiado poco. Se aborta." >&2
  rm -f "$archivo"
  exit 1
fi
echo "    $archivo ($tamano bytes)"

echo "==> Respaldando los archivos subidos"
archivo_medios="$DESTINO/medios-$MARCA.tar.gz"
if docker compose -f "$COMPOSE" ps app --status running -q 2>/dev/null | grep -q .; then
  if docker compose -f "$COMPOSE" exec -T app tar czf - -C /app/public media 2>/dev/null > "$archivo_medios"; then
    echo "    $archivo_medios"
  else
    rm -f "$archivo_medios"
    echo "    sin archivos subidos todavia"
  fi
elif [ -d public/media ]; then
  tar czf "$archivo_medios" public/media
  echo "    $archivo_medios"
else
  echo "    sin medios que respaldar"
fi

if [ "${1:-}" = "--verificar" ]; then
  echo "==> Verificando que el volcado se pueda leer"
  # El contenido se captura antes de examinarlo: encadenar gzip con head bajo
  # "pipefail" hace fallar el conducto entero por SIGPIPE, aunque el contenido
  # sea correcto.
  cabecera=$(gzip -dc "$archivo" 2>/dev/null | head -50 || true)
  if gzip -t "$archivo" && printf '%s' "$cabecera" | grep -q "PostgreSQL database dump"; then
    echo "    integro y con la cabecera esperada"
  else
    echo "El volcado no supera la verificacion." >&2
    exit 1
  fi
fi

echo "==> Descartando respaldos de mas de $DIAS_A_CONSERVAR dias"
find "$DESTINO" -name "base-*.sql.gz" -mtime "+$DIAS_A_CONSERVAR" -print -delete || true
find "$DESTINO" -name "medios-*.tar.gz" -mtime "+$DIAS_A_CONSERVAR" -print -delete || true

echo
echo "Respaldo completado. Conservados: $(ls -1 "$DESTINO"/base-*.sql.gz 2>/dev/null | wc -l)"

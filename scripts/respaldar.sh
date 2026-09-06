#!/usr/bin/env bash
# Respaldo de la base de datos y de los archivos subidos (decision D-036).
#
# Pensado para el temporizador diario, pero tambien util a mano antes de una
# maniobra arriesgada. Es seguro repetirlo: cada ejecucion crea su propio
# archivo fechado.
#
#   ./scripts/respaldar.sh
#   ./scripts/respaldar.sh --verificar        # comprueba que el volcado se lea
#
# Variables opcionales:
#   DIAS_A_CONSERVAR=30       cuantos dias de respaldos se guardan
#   COPIA_REMOTA=usuario@maquina:/ruta   destino rsync para la copia externa
#
# Un respaldo que vive en la misma maquina que la base protege del error, no
# del incendio: si hay a donde copiarlo fuera, se define COPIA_REMOTA.
set -euo pipefail

cd "$(dirname "$0")/.."
. scripts/comun.sh

elegir_compose
cargar_env

DIAS_A_CONSERVAR="${DIAS_A_CONSERVAR:-30}"
DESTINO="backups"
MARCA="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DESTINO"
chmod 770 "$DESTINO" 2>/dev/null || true

archivo="$DESTINO/base-$MARCA.sql.gz"

# Si el volcado falla a mitad, gzip ya creo el archivo: se borra al salir con
# error para no dejar respaldos truncados que parezcan buenos en el listado.
limpiar_si_falla() {
  local codigo=$?
  if [ "$codigo" -ne 0 ] && [ -f "$archivo" ]; then
    tam=$(stat -c%s "$archivo" 2>/dev/null || stat -f%z "$archivo" 2>/dev/null || echo 0)
    if [ "$tam" -lt 1024 ]; then
      rm -f "$archivo"
      rojo "Se descarto el respaldo incompleto."
    fi
  fi
  exit "$codigo"
}
trap limpiar_si_falla EXIT

paso "Volcando la base de datos"
servicio_en_marcha db || morir "El contenedor de la base no esta en marcha."
docker compose -f "$COMPOSE" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -9 > "$archivo"

# Un volcado vacio pesa unos cientos de bytes: menos de 1 KB indica que algo
# fallo aunque pg_dump no lo haya dicho.
tamano=$(stat -c%s "$archivo" 2>/dev/null || stat -f%z "$archivo")
if [ "$tamano" -lt 1024 ]; then
  rm -f "$archivo"
  morir "El respaldo pesa $tamano bytes: demasiado poco. Se aborta."
fi
verde "    $archivo ($tamano bytes)"

paso "Respaldando los archivos subidos"
archivo_medios="$DESTINO/medios-$MARCA.tar.gz"
if servicio_en_marcha app; then
  if docker compose -f "$COMPOSE" exec -T app tar czf - -C /app/public media 2>/dev/null > "$archivo_medios"; then
    verde "    $archivo_medios"
  else
    rm -f "$archivo_medios"
    echo "    sin archivos subidos todavia"
  fi
elif [ -d public/media ]; then
  tar czf "$archivo_medios" public/media
  verde "    $archivo_medios"
else
  echo "    sin medios que respaldar"
fi

if [ "${1:-}" = "--verificar" ]; then
  paso "Verificando que el volcado se pueda leer"
  # El contenido se captura antes de examinarlo: encadenar gzip con head bajo
  # "pipefail" hace fallar el conducto entero por SIGPIPE, aunque el contenido
  # sea correcto.
  cabecera=$(gzip -dc "$archivo" 2>/dev/null | head -50 || true)
  if gzip -t "$archivo" && printf '%s' "$cabecera" | grep -q "PostgreSQL database dump"; then
    verde "    integro y con la cabecera esperada"
  else
    morir "El volcado no supera la verificacion."
  fi
fi

if [ -n "${COPIA_REMOTA:-}" ]; then
  paso "Copiando fuera del servidor"
  if command -v rsync >/dev/null 2>&1; then
    a_copiar=("$archivo")
    [ -f "$archivo_medios" ] && a_copiar+=("$archivo_medios")
    if rsync -az --partial "${a_copiar[@]}" "$COPIA_REMOTA/" 2>/dev/null; then
      verde "    copiado a $COPIA_REMOTA"
    else
      # No es motivo para fallar: el respaldo local existe y es valido.
      ambar "    no se pudo copiar a $COPIA_REMOTA; el respaldo local si esta"
    fi
  else
    ambar "    falta rsync; se omite la copia externa"
  fi
fi

paso "Descartando respaldos de mas de $DIAS_A_CONSERVAR dias"
find "$DESTINO" -name "base-*.sql.gz" -mtime "+$DIAS_A_CONSERVAR" -print -delete || true
find "$DESTINO" -name "medios-*.tar.gz" -mtime "+$DIAS_A_CONSERVAR" -print -delete || true

echo
verde "Respaldo completado. Conservados: $(ls -1 "$DESTINO"/base-*.sql.gz 2>/dev/null | wc -l)"

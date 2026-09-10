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
#
# Se borra SIEMPRE que el codigo de salida no sea cero, sin mirar el tamano.
# La version anterior solo descartaba lo que pesara menos de 1 KB, y ese es
# justo el caso que no ocurre: si el disco se llena a mitad o pg_dump muere sin
# memoria, lo que queda son cientos de megabytes truncados. El archivo se
# quedaba, la verificacion no llegaba a ejecutarse porque el guion moria antes,
# y al dia siguiente el panel y salud.sh lo daban por bueno solo por su fecha.
# El gemelo en TypeScript ya lo hacia bien (src/lib/respaldosServidor.ts).
limpiar_si_falla() {
  local codigo=$?
  if [ "$codigo" -ne 0 ] && [ -f "$archivo" ]; then
    rm -f "$archivo"
    rojo "Se descarto el respaldo incompleto."
  fi
  exit "$codigo"
}
trap limpiar_si_falla EXIT

paso "Volcando la base de datos"
servicio_en_marcha db || morir "El contenedor de la base no esta en marcha."
dc exec -T db \
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
# Es lo unico irreemplazable de la plataforma: la base se puede volver a
# escribir, pero las imagenes, los videos y los modelos 3D que subio el
# traumatologo no. Por eso aqui no se sale nunca en silencio: si no se puede
# leer de donde estan, el guion falla y el respaldo no se da por bueno.
archivo_medios="$DESTINO/medios-$MARCA.tar.gz"
medios_ok=0

if servicio_en_marcha app; then
  # Con la aplicacion viva se lee de su propio contenedor.
  if dc exec -T app tar czf - -C /app/public media 2>/dev/null > "$archivo_medios"; then
    medios_ok=1
  fi
else
  # Sin ella, un contenedor desechable con los mismos volumenes montados.
  # `--no-deps` evita arrastrar la base solo para leer archivos.
  rm -f "$archivo_medios"
  if dc run --rm --no-deps --entrypoint sh app \
      -c 'tar czf - -C /app/public media' 2>/dev/null > "$archivo_medios"; then
    medios_ok=1
  fi
fi

if [ "$medios_ok" -eq 1 ]; then
  tam_medios=$(stat -c%s "$archivo_medios" 2>/dev/null || stat -f%z "$archivo_medios" 2>/dev/null || echo 0)
  # Un tar.gz de un directorio vacio pesa unas decenas de bytes: eso es
  # «todavia no hay medios», no un fallo.
  if [ "$tam_medios" -lt 200 ]; then
    rm -f "$archivo_medios"
    echo "    sin archivos subidos todavia"
  else
    verde "    $archivo_medios ($tam_medios bytes)"
  fi
else
  rm -f "$archivo_medios"
  morir "No se pudieron leer los archivos subidos. El respaldo NO esta completo:
la base se volco pero los medios no. Compruebe que el servicio 'app' existe en
este despliegue con:  ./scripts/salud.sh"
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

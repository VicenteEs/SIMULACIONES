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
#   RESPALDOS_DESTINATARIO=age1...       llave publica con que se cifran (D-295)
#
# Un respaldo que vive en la misma maquina que la base protege del error, no
# del incendio: si hay a donde copiarlo fuera, se define COPIA_REMOTA.
#
# Con RESPALDOS_DESTINATARIO cada archivo sale cifrado (base-....sql.gz.age y
# medios-....tar.gz.age) y solo lo abre la llave privada, que no esta en el
# servidor. Las piezas del cifrado estan en comun.sh.
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

paso "Comprobando el cifrado"
preparar_cifrado
if [ "$CIFRAR" -eq 1 ]; then
  # Solo el final de la llave: basta para reconocer cual es en el registro.
  verde "    se cifra para la llave ...${RESPALDOS_DESTINATARIO: -8}"
fi

# Los nombres definitivos, sin el .age: guardar_respaldo se lo pone si cifra.
archivo="$DESTINO/base-$MARCA.sql.gz"
archivo_medios="$DESTINO/medios-$MARCA.tar.gz"
# Los temporales, ocultos y con otro final para que ni el listado, ni el panel,
# ni la retencion, ni la copia a ved los confundan con un respaldo.
claro="$DESTINO/.base-$MARCA.sql.gz.parcial"
claro_medios="$DESTINO/.medios-$MARCA.tar.gz.parcial"

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
#
# Los temporales en claro se borran siempre, salga bien o mal: uno olvidado
# seria un volcado legible en un servidor que promete no tenerlos.
limpiar_al_salir() {
  local codigo=$? borrados=0 f
  rm -f "$claro" "$claro_medios"
  if [ "$codigo" -ne 0 ]; then
    # Solo los de esta marca de tiempo, que son de esta ejecucion: los de
    # noches anteriores no se tocan aunque esta falle.
    for f in "$archivo" "$archivo.age" "$archivo_medios" "$archivo_medios.age"; do
      if [ -n "$f" ] && [ -f "$f" ]; then
        rm -f "$f"
        borrados=1
      fi
    done
    if [ "$borrados" -eq 1 ]; then rojo "Se descarto el respaldo incompleto."; fi
  fi
  exit "$codigo"
}
trap limpiar_al_salir EXIT

paso "Volcando la base de datos"
servicio_en_marcha db || morir "El contenedor de la base no esta en marcha."
dc exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists \
  | gzip -9 > "$claro"

# Un volcado vacio pesa unos cientos de bytes: menos de 1 KB indica que algo
# fallo aunque pg_dump no lo haya dicho.
tamano=$(stat -c%s "$claro" 2>/dev/null || stat -f%z "$claro")
if [ "$tamano" -lt 1024 ]; then
  morir "El respaldo pesa $tamano bytes: demasiado poco. Se aborta."
fi

if [ "${1:-}" = "--verificar" ]; then
  paso "Verificando que el volcado se pueda leer"
  # Antes de cifrar, porque despues ya no se puede: la llave que lo abriria no
  # esta en este servidor. Lo que se comprueba es lo mismo que antes.
  #
  # El contenido se captura antes de examinarlo: encadenar gzip con head bajo
  # "pipefail" hace fallar el conducto entero por SIGPIPE, aunque el contenido
  # sea correcto.
  cabecera=$(gzip -dc "$claro" 2>/dev/null | head -50 || true)
  if gzip -t "$claro" && printf '%s' "$cabecera" | grep -q "PostgreSQL database dump"; then
    verde "    integro y con la cabecera esperada"
  else
    morir "El volcado no supera la verificacion."
  fi
fi

guardar_respaldo "$claro" "$archivo"
archivo="$RESPALDO_FINAL"
verde "    $archivo ($(stat -c%s "$archivo" 2>/dev/null || stat -f%z "$archivo") bytes)"

paso "Respaldando los archivos subidos"
# Es lo unico irreemplazable de la plataforma: la base se puede volver a
# escribir, pero las imagenes, los videos y los modelos 3D que subio el
# traumatologo no. Por eso aqui no se sale nunca en silencio: si no se puede
# leer de donde estan, el guion falla y el respaldo no se da por bueno.
medios_ok=0

if servicio_en_marcha app; then
  # Con la aplicacion viva se lee de su propio contenedor.
  if dc exec -T app tar czf - -C /app medios 2>/dev/null > "$claro_medios"; then
    medios_ok=1
  fi
else
  # Sin ella, un contenedor desechable con los mismos volumenes montados.
  # `--no-deps` evita arrastrar la base solo para leer archivos.
  rm -f "$claro_medios"
  if dc run --rm --no-deps --entrypoint sh app \
      -c 'tar czf - -C /app medios' 2>/dev/null > "$claro_medios"; then
    medios_ok=1
  fi
fi

if [ "$medios_ok" -eq 1 ]; then
  tam_medios=$(stat -c%s "$claro_medios" 2>/dev/null || stat -f%z "$claro_medios" 2>/dev/null || echo 0)
  # Un tar.gz de un directorio vacio pesa unas decenas de bytes: eso es
  # «todavia no hay medios», no un fallo.
  if [ "$tam_medios" -lt 200 ]; then
    rm -f "$claro_medios"
    archivo_medios=""
    echo "    sin archivos subidos todavia"
  else
    guardar_respaldo "$claro_medios" "$archivo_medios"
    archivo_medios="$RESPALDO_FINAL"
    verde "    $archivo_medios ($(stat -c%s "$archivo_medios" 2>/dev/null || stat -f%z "$archivo_medios") bytes)"
  fi
else
  morir "No se pudieron leer los archivos subidos. El respaldo NO esta completo:
la base se volco pero los medios no. Compruebe que el servicio 'app' existe en
este despliegue con:  ./scripts/salud.sh"
fi

if [ -n "${COPIA_REMOTA:-}" ]; then
  paso "Copiando fuera del servidor"
  if command -v rsync >/dev/null 2>&1; then
    a_copiar=("$archivo")
    [ -n "$archivo_medios" ] && [ -f "$archivo_medios" ] && a_copiar+=("$archivo_medios")
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
# Los cifrados y los de antes del cifrado por igual: un volcado en claro de
# hace dos meses no se queda por haber nacido antes de D-295.
find "$DESTINO" \( -name "base-*.sql.gz" -o -name "base-*.sql.gz.age" \) -mtime "+$DIAS_A_CONSERVAR" -print -delete || true
find "$DESTINO" \( -name "medios-*.tar.gz" -o -name "medios-*.tar.gz.age" \) -mtime "+$DIAS_A_CONSERVAR" -print -delete || true
# Un temporal que sobrevivio a un corte de luz a mitad de respaldo, cuando la
# trampa de salida no llega a correr. Un dia basta: ninguno legitimo dura tanto.
find "$DESTINO" -maxdepth 1 -name ".*.parcial" -mtime +0 -print -delete || true

echo
verde "Respaldo completado. Conservados: $(listar_volcados | wc -l)"

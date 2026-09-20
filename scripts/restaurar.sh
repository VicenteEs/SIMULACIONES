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
dc exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists | gzip -9 > "$previo"
verde "    $previo"

paso "Deteniendo la aplicacion mientras se restaura"
# Restaurar con la aplicacion escribiendo encima deja la base a medio camino
# entre las dos versiones, que es el peor resultado posible.
detenida=0
if servicio_en_marcha app; then
  dc stop app >/dev/null
  detenida=1
  verde "    aplicacion detenida"
fi

# A partir de aqui la plataforma esta apagada, asi que cualquier salida tiene
# que dejarla en pie y decir en que estado quedo la base. Sin esta trampa, un
# error de psql dejaba la aplicacion detenida, la base a medio restaurar y al
# operador delante de un 502 sin una sola indicacion de que hacer.
al_salir() {
  local codigo=$?
  if [ "$codigo" -ne 0 ]; then
    echo
    rojo "La restauracion fallo."
    ambar "La base NO quedo a medias: se restaura dentro de una transaccion,"
    ambar "asi que sigue como estaba antes de ejecutar este guion."
    echo
    echo "El estado previo tambien esta guardado en:  $previo"
    echo "Para volver a intentarlo:  ./scripts/restaurar.sh $archivo"
  fi
  if [ "${detenida:-0}" -eq 1 ]; then
    dc start app >/dev/null 2>&1 && echo "La aplicacion se volvio a levantar."
  fi
  exit "$codigo"
}
trap al_salir EXIT

paso "Restaurando"
# `--single-transaction` es lo que convierte esto en todo o nada. El volcado
# empieza destruyendo objetos (--clean --if-exists), asi que sin transaccion un
# error a mitad deja el esquema anterior ya borrado y a medio reconstruir.
gzip -dc "$archivo" | dc exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --single-transaction --quiet

paso "Comprobando el resultado"
usuarios=$(dc exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from usuarios;" | tr -d '\r ')
verde "    cuentas restauradas: $usuarios"

# --- archivos subidos -------------------------------------------------------
# Se respaldaban y no se restauraban nunca. Una base restaurada sin sus medios
# deja cada ficha con las imagenes rotas y los modelos 3D ausentes, que es
# justo lo irreemplazable: la base se puede volver a escribir, una resonancia
# segmentada no. Se busca el respaldo de medios de la misma marca de tiempo que
# el volcado, porque restaurar medios de otro dia junto a una base de hoy deja
# documentos apuntando a archivos que no existen.
marca_del_volcado=$(basename "$archivo" | sed -n 's/^base-\(.*\)\.sql\.gz$/\1/p')
archivo_medios="backups/medios-${marca_del_volcado}.tar.gz"

if [ -z "$marca_del_volcado" ]; then
  ambar "    el nombre del volcado no lleva marca de tiempo; los medios no se tocan"
elif [ ! -f "$archivo_medios" ]; then
  ambar "    no hay respaldo de medios de esa misma fecha ($archivo_medios)"
  echo "     La base quedo restaurada. Si hacen falta los archivos subidos,"
  echo "     restaurelos a mano dentro del contenedor:"
  echo "       gzip -dc backups/medios-FECHA.tar.gz | $(orden_compose) exec -T app tar xzf - -C /app"
else
  paso "Restaurando los archivos subidos"
  # La aplicacion esta detenida en este punto —se detuvo antes de tocar la
  # base—, asi que se escribe en el volumen desde un contenedor desechable con
  # los mismos montajes, igual que hace respaldar.sh para leerlos.
  # `--no-deps` evita levantar la base solo para copiar archivos.
  if gzip -dc "$archivo_medios" |
      dc run --rm --no-deps --entrypoint sh -T app -c 'tar xzf - -C /app' 2>/dev/null; then
    verde "    $archivo_medios"
  else
    ambar "    no se pudieron restaurar los medios; la base SI quedo restaurada"
    echo "     Reintente a mano, con la plataforma ya en pie:"
    echo "       gzip -dc $archivo_medios | $(orden_compose) exec -T app tar xzf - -C /app"
  fi
fi

if [ "$detenida" -eq 1 ]; then
  paso "Volviendo a levantar la aplicacion"
  dc start app >/dev/null
  # Se marca como ya levantada para que la trampa de salida no lo repita ni
  # vuelva a anunciarlo.
  detenida=0
  verde "    en marcha"
fi

echo
verde "Restauracion completada."
echo "Si algo salio mal, el estado previo esta en: $previo"
echo "Compruebe todo con:  ./scripts/salud.sh"

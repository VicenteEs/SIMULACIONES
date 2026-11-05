#!/usr/bin/env bash
# Restauracion de un respaldo.
#
# ESTE SCRIPT SOBRESCRIBE LA BASE DE DATOS. Pide confirmacion escrita antes de
# hacerlo y, aun asi, respalda el estado actual primero: si la restauracion sale
# mal, todavia hay a donde volver.
#
#   ./scripts/restaurar.sh backups/base-20260906-030000.sql.gz
#   ./scripts/restaurar.sh backups/base-20260906-030000.sql.gz.age ~/llave-respaldos.txt
#
# Un respaldo cifrado (D-295) se abre con la llave privada de age, que no vive
# en el servidor: se trae solo para esto (scp a una carpeta propia) y se borra
# al terminar. El volcado en claro pasa por un temporal que se borra siempre,
# salga bien o mal.
#
# NUNCA se restaura un respaldo de produccion en un servidor de pruebas ni en un
# equipo de desarrollo (BITACORA, D-295): son los datos de personas reales, y
# el aviso de privacidad dice donde estan y quien los ve. Este guion es para
# devolver una base a su propio servidor.
#
# Un respaldo que nunca se restauro no es un respaldo. Conviene probar esto una
# vez, con la plataforma todavia vacia, antes de necesitarlo de verdad.
set -euo pipefail

cd "$(dirname "$0")/.."
. scripts/comun.sh

archivo="${1:-}"
llave="${2:-}"
if [ -z "$archivo" ]; then
  echo "Uso: $0 <archivo.sql.gz>"
  echo "     $0 <archivo.sql.gz.age> <llave-privada-de-age>"
  echo
  echo "Respaldos disponibles:"
  listar_volcados | head -10 | grep . || echo "  (ninguno)"
  exit 1
fi

[ -f "$archivo" ] || morir "No existe: $archivo"

elegir_compose
cargar_env

# El volcado en claro con que se trabaja: el propio archivo, o el temporal en
# que se abre el cifrado.
volcado="$archivo"
# Los dos temporales en claro que puede dejar este guion: el respaldo abierto y
# el respaldo de seguridad antes de cifrarlo. Se borran salga como salga.
temporal=""
claro_previo=""
borrar_temporales() {
  [ -z "$temporal" ] || rm -f "$temporal"
  [ -z "$claro_previo" ] || rm -f "$claro_previo"
  return 0
}
trap borrar_temporales EXIT

# Por la cabecera y no por el nombre: un .age renombrado a .sql.gz fallaba en
# gzip con «not in gzip format», que suena a archivo roto y no a llave que falta.
cifrado=0
if es_archivo_age "$archivo"; then cifrado=1; fi

if [ "$cifrado" -eq 1 ]; then
  paso "Abriendo el respaldo cifrado"
  [ -n "$llave" ] || morir "Es un respaldo cifrado: falta la llave privada.
Uso:  $0 $archivo <llave-privada-de-age>"
  [ -f "$llave" ] || morir "No existe la llave: $llave"
  command -v age >/dev/null 2>&1 || morir "Falta age en este servidor. Instalelo con:  sudo apt install age"
  temporal="backups/.restaurar-$$.sql.gz.parcial"
  # Solo el usuario que restaura puede leerlo mientras existe.
  ( umask 077 && age -d -i "$llave" -o "$temporal" "$archivo" ) ||
    morir "No se pudo abrir con esa llave. ¿Es la privada que corresponde a RESPALDOS_DESTINATARIO?"
  volcado="$temporal"
  verde "    abierto"
  # Se descifra una sola vez, a disco, y no dos veces en conducto: una llave
  # protegida con frase (age -p) la pediria en cada pasada.
fi

paso "Comprobando el archivo antes de tocar nada"
gzip -t "$volcado" || morir "El archivo esta corrupto."
# El contenido se captura antes de examinarlo: encadenar gzip con head bajo
# "pipefail" hace fallar el conducto por SIGPIPE aunque el contenido sea bueno.
cabecera=$(gzip -dc "$volcado" 2>/dev/null | head -50 || true)
printf '%s' "$cabecera" | grep -q "PostgreSQL database dump" ||
  morir "No parece un volcado de PostgreSQL."
verde "    el archivo es valido"

servicio_en_marcha db || morir "El contenedor de la base no esta en marcha."

paso "Comprobando el cifrado del respaldo de seguridad"
# Antes de la confirmacion: si falta age o la llave publica esta mal copiada, se
# sabe ahora, y no despues de haber escrito RESTAURAR.
preparar_cifrado
if [ "$CIFRAR" -eq 1 ]; then verde "    se cifra para la llave ...${RESPALDOS_DESTINATARIO: -8}"; fi

echo
rojo "Se va a SOBRESCRIBIR la base '$POSTGRES_DB' con el contenido de:"
echo "    $archivo   ($(du -h "$archivo" | cut -f1), del $(date -r "$archivo" '+%Y-%m-%d %H:%M'))"
echo
printf "Escriba RESTAURAR para continuar: "
read -r respuesta
[ "$respuesta" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

paso "Respaldando el estado actual por si acaso"
# Cifrado como cualquier otro respaldo de este servidor: es la base entera, y
# se queda treinta dias en la misma carpeta que los de cada noche.
mkdir -p backups
marca_previa="$(date +%Y%m%d-%H%M%S)"
claro_previo="backups/.base-$marca_previa.sql.gz.parcial"
dc exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists | gzip -9 > "$claro_previo"
guardar_respaldo "$claro_previo" "backups/base-$marca_previa.sql.gz"
previo="$RESPALDO_FINAL"
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

# Como se repite la orden en los mensajes: con la llave, si la hubo.
repetir="./scripts/restaurar.sh $archivo${llave:+ $llave}"

# A partir de aqui la plataforma esta apagada, asi que cualquier salida tiene
# que dejarla en pie y decir en que estado quedo la base. Sin esta trampa, un
# error de psql dejaba la aplicacion detenida, la base a medio restaurar y al
# operador delante de un 502 sin una sola indicacion de que hacer.
al_salir() {
  local codigo=$?
  borrar_temporales
  if [ "$codigo" -ne 0 ]; then
    echo
    rojo "La restauracion fallo."
    ambar "La base NO quedo a medias: se restaura dentro de una transaccion,"
    ambar "asi que sigue como estaba antes de ejecutar este guion."
    echo
    echo "El estado previo tambien esta guardado en:  $previo"
    echo "Para volver a intentarlo:  $repetir"
    if [ "$cifrado" -eq 1 ]; then
      ambar "Y al terminar, borre la llave privada de este servidor:  rm -f $llave"
    fi
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
gzip -dc "$volcado" | dc exec -T db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 --single-transaction --quiet
# El volcado en claro ya no hace falta: fuera ahora, no al final.
borrar_temporales

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
marca_del_volcado=$(basename "$archivo" | sed -n 's/^base-\(.*\)\.sql\.gz\(\.age\)\{0,1\}$/\1/p')
archivo_medios=""
for candidato in "backups/medios-${marca_del_volcado}.tar.gz.age" "backups/medios-${marca_del_volcado}.tar.gz"; do
  if [ -n "$marca_del_volcado" ] && [ -f "$candidato" ]; then
    archivo_medios="$candidato"
    break
  fi
done

# Lo que hay que anteponer al `gzip -dc` para leer el paquete: nada, o abrirlo
# con la llave. Para los mensajes y para la restauracion, la misma orden.
abrir_medios() {
  case "$archivo_medios" in
    *.age) age -d -i "$llave" "$archivo_medios" | gzip -dc ;;
    *) gzip -dc "$archivo_medios" ;;
  esac
}

if [ -z "$marca_del_volcado" ]; then
  ambar "    el nombre del volcado no lleva marca de tiempo; los medios no se tocan"
elif [ -z "$archivo_medios" ]; then
  ambar "    no hay respaldo de medios de esa misma fecha (backups/medios-${marca_del_volcado}.tar.gz[.age])"
  echo "     La base quedo restaurada. Si hacen falta los archivos subidos,"
  echo "     restaurelos a mano dentro del contenedor:"
  echo "       gzip -dc backups/medios-FECHA.tar.gz | $(orden_compose) exec -T app tar xf - -C /app"
elif [ "${archivo_medios%.age}" != "$archivo_medios" ] && [ -z "$llave" ]; then
  # Un volcado en claro con unos medios cifrados de la misma noche no deberia
  # darse nunca, pero si se da no se adivina la llave.
  ambar "    los medios de esa fecha estan cifrados y no se dio la llave; no se tocan"
  echo "     Reintente con:  ./scripts/restaurar.sh $archivo <llave-privada-de-age>"
else
  paso "Restaurando los archivos subidos"
  # La aplicacion esta detenida en este punto —se detuvo antes de tocar la
  # base—, asi que se escribe en el volumen desde un contenedor desechable con
  # los mismos montajes, igual que hace respaldar.sh para leerlos.
  # `--no-deps` evita levantar la base solo para copiar archivos.
  #
  # `tar xf`, sin la z: lo que llega por el conducto ya lo descomprimio el
  # `gzip -dc` de esta misma linea. Con `xzf` el tar de la imagen intentaba
  # descomprimirlo otra vez, salia con «invalid magic» y el `2>/dev/null` se
  # lo callaba: la base se restauraba y los archivos no, en todas las
  # restauraciones desde que existe este bloque (O-053).
  if abrir_medios | dc run --rm --no-deps --entrypoint sh -T app -c 'tar xf - -C /app' 2>/dev/null; then
    verde "    $archivo_medios"
  else
    ambar "    no se pudieron restaurar los medios; la base SI quedo restaurada"
    echo "     Reintente a mano, con la plataforma ya en pie:"
    case "$archivo_medios" in
      *.age) echo "       age -d -i <llave> $archivo_medios | gzip -dc | $(orden_compose) exec -T app tar xf - -C /app" ;;
      *) echo "       gzip -dc $archivo_medios | $(orden_compose) exec -T app tar xf - -C /app" ;;
    esac
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
# La restauracion devuelve vivas, y con nombre, las cuentas que se eliminaron
# despues de la fecha del respaldo a peticion de su titular, y la pasada diaria
# no las ve: para ella son cuentas que existen (D-291). Este es el momento de
# repetir esas supresiones, antes de avisar a nadie de que la plataforma volvio.
ambar "Vuelva a eliminar las cuentas que se eliminaron despues de la fecha del respaldo: estan en el registro de solicitudes (BITACORA, D-296)."
if [ "$cifrado" -eq 1 ]; then
  ambar "Borre ahora la llave privada de este servidor:  rm -f $llave"
fi

#!/usr/bin/env bash
# Ensayo de los casos del simulador antes de desplegar (D-373, E3 de P-016).
#
#   ./scripts/ensayar-casos.sh
#
# Copia el contenido de la base -sin cuentas, sin actividad, sin nada de
# personas (D-295)- a una base temporal del mismo PostgreSQL, le aplica las
# migraciones del codigo nuevo y abre en ella cada caso con ese codigo
# (`scripts/ensayar-casos.ts`). Sale con 1 si algun caso deja de leerse o si
# alguna resolucion de referencia cambia de nota sin que su caso cambiara.
# deploy.sh lo llama despues de construir y antes de cambiar el contenedor, asi
# que un fallo aqui deja la version anterior sirviendo.
#
# Ensaya tambien las migraciones: corren primero sobre la copia, y una que
# falle se ve aqui y no al arrancar la aplicacion sobre la base de verdad.
#
# Lo que no toca: la base de verdad solo se lee (pg_dump), y la temporal se
# borra al salir, tambien si algo falla. Nada sale del servidor.
set -euo pipefail

cd "$(dirname "$0")/.."
. scripts/comun.sh

elegir_compose
cargar_env
exigir_variables POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB PAYLOAD_SECRET

if ! servicio_en_marcha db; then
  echo "    la base no esta en marcha: primera instalacion, no hay casos que ensayar"
  exit 0
fi

marca="$(date +%Y%m%d%H%M%S)"
BASE="ensayo_$marca"
IMAGEN_DEL_ENSAYO="plataforma-trauma:ensayo"
CONTENEDOR="traumahub-ensayo-$marca"
REGISTRO_DE_LA_IMAGEN="$(mktemp)"

limpiar() {
  rm -f "$REGISTRO_DE_LA_IMAGEN"
  docker rm -f "$CONTENEDOR" >/dev/null 2>&1 || true
  dc exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$1"' _ "$BASE" </dev/null >/dev/null 2>&1 || true
  docker image rm "$IMAGEN_DEL_ENSAYO" >/dev/null 2>&1 || true
}
trap limpiar EXIT

# La etapa `ensayo` del Dockerfile: las dependencias de la imagen y el codigo,
# sin compilar. Reutiliza la cache de la construccion que deploy.sh acaba de
# hacer, asi que solo copia el codigo.
#
# Lo que escribe la construccion se guarda y solo se ensena si falla: en ved,
# sin buildx, cada construccion avisa de que el constructor viejo esta en
# desuso, y ese aviso entre las lineas del ensayo no dice nada de los casos.
echo "    preparando el entorno del ensayo"
if ! docker build --quiet --target ensayo -t "$IMAGEN_DEL_ENSAYO" . >"$REGISTRO_DE_LA_IMAGEN" 2>&1; then
  cat "$REGISTRO_DE_LA_IMAGEN" >&2
  morir "No se pudo preparar el entorno del ensayo."
fi

# Sin el aviso de version nueva de npm, que sale en cada `npx` y no es del ensayo.
SIN_AVISOS_DE_NPM=(-e NPM_CONFIG_UPDATE_NOTIFIER=false)

# Las tablas que no viajan las dice el propio codigo, que es donde vive la
# lista y su prueba (`COLECCIONES_SIN_COPIAR`): copiada aqui, la coleccion de
# personas que se anada manana viajaria a la copia sin que nadie lo notara.
sin_copiar=()
while IFS= read -r patron; do
  [ -n "$patron" ] && sin_copiar+=("--exclude-table-data=$patron")
done < <(docker run --rm "${SIN_AVISOS_DE_NPM[@]}" "$IMAGEN_DEL_ENSAYO" npx tsx scripts/ensayar-casos.ts --tablas-sin-copiar </dev/null)
[ "${#sin_copiar[@]}" -gt 0 ] || morir "El ensayo no devolvio la lista de tablas sin copiar: no se copia nada a ciegas."

echo "    copiando el contenido a una base temporal ($BASE)"
dc exec -T db sh -c 'createdb -U "$POSTGRES_USER" "$1"' _ "$BASE" </dev/null
# Los patrones van como argumentos y no metidos en la orden: con el `*` dentro,
# el shell del contenedor podria expandirlos contra sus archivos.
dc exec -T db sh -c '
  base="$1"; shift
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@" \
    | psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$base" >/dev/null
' _ "$BASE" "${sin_copiar[@]}" </dev/null
# Una marca de esquema ajustado al vuelo (`batch = -1`, ver AGENTS.md) haria
# que Payload preguntara por consola antes de migrar y se quedara esperando.
# En la copia se puede quitar sin miedo: es lo unico que se toca, y se tira.
dc exec -T db sh -c 'psql -q -U "$POSTGRES_USER" -d "$1" -c "delete from payload_migrations where batch = -1"' _ "$BASE" </dev/null >/dev/null

# La red de la base, para llegar a ella por su nombre de servicio, y los
# archivos subidos de la aplicacion, para mirar los modelos. Sin aplicacion en
# marcha no hay de donde sacarlos: el ensayo los da por ausentes y avisa.
red="$(docker inspect -f '{{range $nombre, $_ := .NetworkSettings.Networks}}{{$nombre}} {{end}}' "$(dc ps -q db)" | awk '{print $1}')"
medios=""
if servicio_en_marcha app; then
  medios="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app/medios"}}{{if eq .Type "volume"}}{{.Name}}{{else}}{{.Source}}{{end}}{{end}}{{end}}' "$(dc ps -q app)")"
fi
montaje=()
[ -n "$medios" ] && montaje=(-v "$medios:/app/medios:ro")

echo "    abriendo cada caso con el codigo nuevo"
# NODE_ENV=production es el que hace que Payload aplique las migraciones al
# iniciar (`prodMigrations`). Las variables pasan por el entorno y no en la
# orden, para que la contrasena no se vea en la lista de procesos. Con techo de
# tiempo: un ensayo colgado no puede dejar el despliegue esperando para siempre.
export DATABASE_URI="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@db:5432/$BASE"
set +e
timeout 900 docker run --rm --name "$CONTENEDOR" --network "$red" "${montaje[@]}" "${SIN_AVISOS_DE_NPM[@]}" \
  -e NODE_ENV=production -e DATABASE_URI -e PAYLOAD_SECRET -e DIRECTORIO_DE_MEDIOS=/app/medios \
  "$IMAGEN_DEL_ENSAYO" npx tsx scripts/ensayar-casos.ts </dev/null 2>&1 | sed 's/^/      /'
resultado="${PIPESTATUS[0]}"
set -e
unset DATABASE_URI

case "$resultado" in
  0) verde "    los casos abren y sus referencias dan la misma nota" ;;
  1) rojo "    el codigo nuevo rompe algun caso: vea los ERROR de arriba"; exit 1 ;;
  124) rojo "    el ensayo no termino en 15 minutos"; exit 1 ;;
  *) rojo "    el ensayo no pudo terminar (salida $resultado)"; exit 1 ;;
esac

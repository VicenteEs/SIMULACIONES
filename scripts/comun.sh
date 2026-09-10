#!/usr/bin/env bash
# Piezas compartidas por los scripts de operacion.
#
# Se cargan con:  . "$(dirname "$0")/comun.sh"
#
# Aqui viven las tres cosas que los cuatro scripts hacian cada uno a su manera
# y que ya habian empezado a divergir: colores, eleccion del archivo de compose
# y lectura del .env.

# Colores solo si la salida es una terminal: en un registro de cron, las
# secuencias de escape ensucian el archivo sin aportar nada.
if [ -t 1 ]; then
  _ROJO=$'\033[31m'; _VERDE=$'\033[32m'; _AMBAR=$'\033[33m'; _FIN=$'\033[0m'
else
  _ROJO=''; _VERDE=''; _AMBAR=''; _FIN=''
fi

rojo()  { printf '%s%s%s\n' "$_ROJO" "$*" "$_FIN" >&2; }
verde() { printf '%s%s%s\n' "$_VERDE" "$*" "$_FIN"; }
ambar() { printf '%s%s%s\n' "$_AMBAR" "$*" "$_FIN"; }
paso()  { printf '\n==> %s\n' "$*"; }
morir() { rojo "$*"; exit 1; }

# Que archivo de compose corresponde al tunel elegido.
#   TUNEL=tailscale   (por omision)  -> la app publica 127.0.0.1:3000
#   TUNEL=cloudflare                 -> la app no publica ningun puerto
#   TUNEL=local                      -> solo la base, para desarrollo
elegir_compose() {
  TUNEL="${TUNEL:-tailscale}"
  case "$TUNEL" in
    tailscale)  COMPOSE="docker-compose.tailscale.yml" ;;
    cloudflare) COMPOSE="docker-compose.prod.yml" ;;
    local)      COMPOSE="docker-compose.yml" ;;
    *) morir "TUNEL debe ser tailscale, cloudflare o local, no '$TUNEL'." ;;
  esac
  export TUNEL COMPOSE
}

# Carga el .env exportando cada variable. Se hace con "set -a" y no leyendo
# linea a linea para que valores con espacios o con "=" no se partan.
cargar_env() {
  [ -f .env ] || morir "Falta .env. Copie .env.example y complete los valores."
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
}

# Comprueba que existan las variables indicadas y que ninguna conserve el valor
# de ejemplo. Un despliegue que arranca con PAYLOAD_SECRET=CAMBIAR_... es peor
# que uno que no arranca: parece correcto.
exigir_variables() {
  for var in "$@"; do
    if [ -z "${!var:-}" ]; then morir "Falta la variable $var en .env"; fi
    case "${!var}" in
      *CAMBIAR*) morir "$var conserva el valor de ejemplo. Genere uno con: openssl rand -base64 48" ;;
    esac
  done
}

# Ejecuta docker compose sobre el despliegue que corresponda.
#
# El detalle que importa: cuando el archivo es el `docker-compose.yml` de
# siempre, **no se pasa -f**. Con -f explicito, Compose deja de fusionar el
# `docker-compose.override.yml`, y en el servidor de paginas el servicio `app`
# vive precisamente ahi (ver despliegue/paginas/LEEME.md). Pasarlo hacia que
# `ps app` fallara en silencio, y con ello que el respaldo de los medios se
# saltara siempre, que salud.sh informara de averias inexistentes y que
# restaurar.sh no llegara a detener la aplicacion. Un guion de "-f" de mas.
dc() {
  if [ "$COMPOSE" = "docker-compose.yml" ]; then
    docker compose "$@"
  else
    docker compose -f "$COMPOSE" "$@"
  fi
}

# La misma orden, escrita, para poder sugerirla en un mensaje.
#
# Los guiones terminan diciendo «revise el registro con: ...», y esa linea la
# copia y pega alguien. Si sugiere un "-f" que aqui evitamos, le entregamos al
# operador el mismo fallo que acabamos de corregir, y en el peor momento.
orden_compose() {
  if [ "$COMPOSE" = "docker-compose.yml" ]; then
    printf 'docker compose'
  else
    printf 'docker compose -f %s' "$COMPOSE"
  fi
}

# ¿Esta corriendo un servicio del compose?
servicio_en_marcha() {
  dc ps "$1" --status running -q 2>/dev/null | grep -q .
}

# El prefijo bajo el que se sirve la plataforma, preguntado al contenedor.
#
# Se pregunta y no se deduce: el prefijo se graba en la imagen al compilar
# (ARG BASE_PATH del Dockerfile) y no existe en el .env del anfitrion, asi que
# leerlo de una variable de aqui daba siempre vacio y hacia consultar
# /api/salud en vez de /traumahub/api/salud.
prefijo_de_la_app() {
  # La sustitucion de comando ya quita los saltos finales; el tr esta por el
  # retorno de carro que anade Docker cuando el anfitrion es Windows.
  dc exec -T app printenv NEXT_PUBLIC_BASE_PATH 2>/dev/null | tr -d '\r'
}

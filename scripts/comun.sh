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
#   TUNEL=local       (por omision)  -> docker-compose.yml, que en desarrollo es
#                                       solo la base y en los servidores suma
#                                       el override de despliegue/paginas
#   TUNEL=cloudflare                 -> la app no publica ningun puerto
#
# Por omision va `local` porque es lo que corren los dos servidores, ved y
# Contabo, detras de su proxy. Antes la omision era `tailscale`, un modo que ya
# no usaba nadie, y olvidar el TUNEL=local levantaba un segundo compose fuera
# de la red del proxy, que respondia 502 (O-077). Ese modo se quito en D-223:
# lo que sale cuando nadie dice nada tiene que ser lo habitual.
elegir_compose() {
  TUNEL="${TUNEL:-local}"
  case "$TUNEL" in
    local)      COMPOSE="docker-compose.yml" ;;
    cloudflare) COMPOSE="docker-compose.prod.yml" ;;
    *) morir "TUNEL debe ser local o cloudflare, no '$TUNEL'." ;;
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

# --- respaldos cifrados (D-295) ---------------------------------------------
# Los respaldos se cifran con age para la llave PUBLICA de
# RESPALDOS_DESTINATARIO. La privada no esta en ningun servidor: este puede
# cifrar sus copias, pero no leerlas, y una copia robada -del disco, de la que
# se lleva ved, de un portatil- no sirve sin ella.
#
# Lo que se cifra es lo ya comprimido: quitando el .age con la llave queda el
# .sql.gz o el .tar.gz de siempre, y todo lo demas (restaurar, verificar)
# sigue igual.

# Una llave publica de age: "age1" y 58 caracteres de bech32. La misma regla
# que esDestinatarioDeAge (src/lib/respaldos.ts).
PATRON_DESTINATARIO_AGE='^age1[02-9ac-hj-np-z]{58}$'

# Decide si este respaldo se cifra, y comprueba que se pueda. Deja CIFRAR=1 o 0.
#
# Sin destinatario se respalda en claro, avisando: un respaldo sin cifrar es
# mejor que ninguno, y es lo que pasa en desarrollo y en un servidor al que
# aun no se le puso la llave. Con destinatario, en cambio, no se respalda en
# claro nunca: si falta age o la llave esta mal copiada, el guion se detiene.
# Un servidor configurado para cifrar que deja caer un volcado legible es justo
# lo que el aviso de privacidad promete que no pasa.
preparar_cifrado() {
  if [ -z "${RESPALDOS_DESTINATARIO:-}" ]; then
    CIFRAR=0
    ambar "    AVISO: falta RESPALDOS_DESTINATARIO en .env; este respaldo queda SIN CIFRAR."
    return 0
  fi
  printf '%s' "$RESPALDOS_DESTINATARIO" | grep -Eq "$PATRON_DESTINATARIO_AGE" ||
    morir "RESPALDOS_DESTINATARIO no es una llave publica de age (empieza por age1 y tiene 62 caracteres).
No se respalda sin cifrar en un servidor configurado para cifrar: corrija el .env."
  command -v age >/dev/null 2>&1 ||
    morir "RESPALDOS_DESTINATARIO esta puesto pero falta age en este servidor.
Instalelo con:  sudo apt install age"
  CIFRAR=1
}

# ¿Es un archivo de age? Mira solo la primera linea, que es lo unico que se
# puede comprobar sin la llave privada.
es_archivo_age() {
  [ "$(head -c 21 "$1" 2>/dev/null)" = "age-encryption.org/v1" ]
}

# guardar_respaldo <en_claro> <destino>
#
# Deja el respaldo en su sitio: cifrado como <destino>.age si toca, o tal cual.
# El archivo en claro es temporal y se borra en cuanto esta el cifrado. La ruta
# final queda en RESPALDO_FINAL.
#
# El temporal en claro vive unos minutos en la carpeta de respaldos (770) del
# mismo servidor donde la base esta en claro de todos modos: no expone nada que
# no estuviera ya ahi. Lo que no puede salir en claro es la copia que se queda
# treinta dias y la que viaja a ved, y esas salen ya cifradas.
#
# Si el cifrado falla, el guion muere sin guardar nada: el temporal lo borra la
# trampa de salida de quien llama, y en su lugar no se deja la copia en claro.
guardar_respaldo() {
  local claro="$1" destino="$2"
  if [ "${CIFRAR:-0}" -eq 1 ]; then
    if ! age -r "$RESPALDOS_DESTINATARIO" -o "$destino.age" "$claro"; then
      rm -f "$destino.age"
      morir "age no pudo cifrar el respaldo, y no se guarda en claro en un servidor configurado para cifrar."
    fi
    if ! es_archivo_age "$destino.age"; then
      rm -f "$destino.age"
      morir "age no produjo un archivo cifrado valido, y no se guarda en claro en un servidor configurado para cifrar."
    fi
    rm -f "$claro"
    RESPALDO_FINAL="$destino.age"
  else
    mv "$claro" "$destino"
    RESPALDO_FINAL="$destino"
  fi
  chmod 640 "$RESPALDO_FINAL" 2>/dev/null || true
}

# Los volcados de la base y los paquetes de medios, cifrados o no, del mas
# reciente al mas antiguo. Para el listado de restaurar.sh y para salud.sh.
listar_volcados() {
  ls -1t backups/base-*.sql.gz backups/base-*.sql.gz.age 2>/dev/null || true
}
listar_paquetes_de_medios() {
  ls -1t backups/medios-*.tar.gz backups/medios-*.tar.gz.age 2>/dev/null || true
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

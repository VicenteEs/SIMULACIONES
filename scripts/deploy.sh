#!/usr/bin/env bash
# Despliegue en el servidor (decisiones D-019, D-023, D-034).
#
# Deja el servidor operativo desde un clon limpio del repositorio. Es
# idempotente: sirve tanto para la primera instalacion como para actualizar.
#
#   ./scripts/deploy.sh                 # Tailscale (por omision)
#   TUNEL=cloudflare ./scripts/deploy.sh
#
# Si la version nueva no llega a responder, se vuelve sola a la imagen anterior.
# Un despliegue que deja la plataforma caida y se marcha es peor que uno que
# falla: al menos este avisa y devuelve el servicio.
set -euo pipefail

cd "$(dirname "$0")/.."
. scripts/comun.sh

[ "$(id -u)" -ne 0 ] || morir "No ejecute este script como root. Use un usuario del grupo docker."

elegir_compose
echo "Tunel: $TUNEL  ·  Compose: $COMPOSE"

IMAGEN="plataforma-trauma:local"
ANTERIOR="plataforma-trauma:anterior"

paso "Comprobando requisitos"
for cmd in docker git; do
  command -v "$cmd" >/dev/null || morir "Falta $cmd."
done
docker compose version >/dev/null 2>&1 || morir "Falta el complemento docker compose."
docker info >/dev/null 2>&1 || morir "El usuario no puede hablar con Docker. Ejecute: sudo usermod -aG docker \$USER"
verde "    requisitos correctos"

paso "Comprobando la configuracion"
cargar_env
requeridas="POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB PAYLOAD_SECRET NEXT_PUBLIC_SERVER_URL"
[ "$TUNEL" = "cloudflare" ] && requeridas="$requeridas CLOUDFLARE_TUNNEL_TOKEN"
# shellcheck disable=SC2086
exigir_variables $requeridas
case "$NEXT_PUBLIC_SERVER_URL" in
  https://*) ;;
  *) ambar "    NEXT_PUBLIC_SERVER_URL no usa HTTPS: la cookie de sesion viajara sin cifrar." ;;
esac
verde "    configuracion completa"

paso "Preparando directorios"
mkdir -p backups
chmod 770 backups 2>/dev/null || true

paso "Respaldando la base antes de tocar nada"
if servicio_en_marcha db; then
  marca=$(date +%Y%m%d-%H%M%S)
  archivo="backups/base-$marca.sql.gz"
  dc exec -T db \
    pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists | gzip -9 > "$archivo"
  verde "    respaldo en $archivo"
else
  echo "    primera instalacion, no hay nada que respaldar"
fi

paso "Guardando la imagen actual por si hay que volver"
if docker image inspect "$IMAGEN" >/dev/null 2>&1; then
  docker tag "$IMAGEN" "$ANTERIOR"
  verde "    etiquetada como $ANTERIOR"
  HAY_ANTERIOR=1
else
  echo "    no hay imagen previa"
  HAY_ANTERIOR=0
fi

paso "Construyendo la imagen"
dc build app

paso "Levantando los servicios"
dc up -d --remove-orphans

paso "Esperando a que la aplicacion responda"
# Se consulta desde dentro del contenedor: con el tunel de Cloudflare la
# aplicacion no publica ningun puerto en el anfitrion, asi que no hay a donde
# llamar desde fuera. /api/salud consulta la base antes de responder, de modo
# que un "ok" significa aplicacion y base en pie, no solo el puerto abierto.
sano=0
for intento in $(seq 1 90); do
  if dc exec -T app wget -qO- "http://127.0.0.1:3000${BASE_PATH:-}/api/salud" 2>/dev/null | grep -q '"estado":"ok"'; then
    verde "    responde y alcanza la base tras ${intento}s"
    sano=1
    break
  fi
  sleep 1
done

if [ "$sano" -ne 1 ]; then
  rojo "La aplicacion no respondio en 90 segundos."
  dc logs --tail 60 app
  if [ "$HAY_ANTERIOR" -eq 1 ]; then
    paso "Volviendo a la imagen anterior"
    docker tag "$ANTERIOR" "$IMAGEN"
    dc up -d --no-build app
    ambar "    se restauro la version anterior; revise el registro de arriba"
  fi
  exit 1
fi

paso "Comprobando el tunel"
if [ "$TUNEL" = "cloudflare" ]; then
  if dc logs tunel 2>/dev/null | grep -qi "Registered tunnel connection"; then
    verde "    el tunel esta conectado a Cloudflare"
  else
    ambar "    el tunel aun no registra conexiones."
    ambar "    Revise el token en .env y ejecute: $(orden_compose) logs tunel"
  fi
else
  if command -v tailscale >/dev/null && tailscale serve status 2>/dev/null | grep -q "3000"; then
    verde "    Tailscale ya publica el puerto 3000"
  else
    ambar "    Falta publicar el servicio en Tailscale. Ejecute UNA de estas:"
    echo "      sudo tailscale serve --bg 3000     # privado, solo su tailnet"
    echo "      sudo tailscale funnel --bg 3000    # publico en internet, con HTTPS"
  fi
fi

paso "Limpiando imagenes antiguas"
docker image prune -f >/dev/null

echo
verde "Despliegue completado."
echo
echo "Registro en vivo:  $(orden_compose) logs -f app"
echo "Estado:            ./scripts/salud.sh"
echo "Respaldo manual:   ./scripts/respaldar.sh --verificar"

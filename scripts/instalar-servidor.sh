#!/usr/bin/env bash
# Instalacion completa en un servidor Ubuntu limpio (decisiones D-019, D-023).
#
# Es el unico comando que hay que ejecutar despues de clonar el repositorio.
# Deja el servidor operativo: Docker instalado, secretos generados, aplicacion
# construida y en marcha, y el respaldo diario programado.
#
#   git clone git@github.com:VicenteEs/SIMULACIONES.git plataforma
#   cd plataforma
#   ./scripts/instalar-servidor.sh
#
# Es idempotente: se puede volver a ejecutar sin romper nada. Lo que ya esta
# hecho se detecta y se salta, y el .env existente NUNCA se sobrescribe.
set -euo pipefail

cd "$(dirname "$0")/.."
. scripts/comun.sh

echo
echo "  Plataforma docente de traumatologia"
echo "  Instalacion en servidor"
echo

[ "$(id -u)" -ne 0 ] || morir "No ejecute este script como root. Use su usuario normal; se pedira sudo cuando haga falta."

TUNEL="${TUNEL:-tailscale}"
elegir_compose
echo "Tunel: $TUNEL  ·  Compose: $COMPOSE"

# ---------------------------------------------------------------- 1. Docker

paso "Comprobando Docker"
if ! command -v docker >/dev/null 2>&1; then
  ambar "Docker no esta instalado. Se instalara desde el repositorio oficial."
  printf "Continuar? [s/N] "
  read -r respuesta
  case "$respuesta" in
    s|S|si|SI|Si) ;;
    *) morir "Instalacion cancelada. Instale Docker a mano y vuelva a ejecutar." ;;
  esac

  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  sudo chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" |
    sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  verde "    Docker instalado"
fi

if ! docker info >/dev/null 2>&1; then
  ambar "El usuario no puede hablar con Docker. Se agregara al grupo 'docker'."
  sudo usermod -aG docker "$USER"
  rojo "Cierre la sesion SSH y vuelva a entrar para que el cambio tenga efecto,"
  rojo "y despues ejecute otra vez este script."
  exit 1
fi
docker compose version >/dev/null 2>&1 || morir "Falta el complemento 'docker compose'."
verde "    Docker responde y el usuario puede usarlo"

# ------------------------------------------------------------- 2. Utilidades

paso "Comprobando utilidades del sistema"
faltantes=""
for cmd in git openssl curl; do
  command -v "$cmd" >/dev/null 2>&1 || faltantes="$faltantes $cmd"
done
if [ -n "$faltantes" ]; then
  ambar "    faltan:$faltantes — se instalan"
  # shellcheck disable=SC2086
  sudo apt-get install -y $faltantes
fi
verde "    utilidades disponibles"

# ------------------------------------------------------------------ 3. .env

paso "Preparando la configuracion"
if [ -f .env ]; then
  verde "    ya existe .env; no se toca"
else
  echo "    No hay .env. Se genera uno con secretos aleatorios."
  echo
  printf "Direccion publica de la plataforma [https://$(hostname).ts.net]: "
  read -r url_publica
  url_publica="${url_publica:-https://$(hostname).ts.net}"

  clave_bd="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
  secreto="$(openssl rand -base64 48)"

  umask 077
  cat > .env <<ENV
# Generado por scripts/instalar-servidor.sh el $(date +%Y-%m-%d).
# Guarde una copia de este archivo: sin PAYLOAD_SECRET no se puede leer
# ninguna sesion, y sin POSTGRES_PASSWORD no se puede abrir la base.

POSTGRES_USER=trauma
POSTGRES_PASSWORD=$clave_bd
POSTGRES_DB=trauma
DATABASE_URI=postgres://trauma:$clave_bd@db:5432/trauma

PAYLOAD_SECRET=$secreto
NEXT_PUBLIC_SERVER_URL=$url_publica
TZ=${TZ:-America/Santiago}

CLOUDFLARE_TUNNEL_TOKEN=

SMTP_HOST=
SMTP_PUERTO=587
SMTP_USUARIO=
SMTP_CLAVE=
SMTP_DESDE=

DIAS_A_CONSERVAR=30
ENV
  chmod 600 .env
  verde "    .env creado con secretos nuevos (permisos 600)"

  if [ "$TUNEL" = "cloudflare" ]; then
    ambar "    Recuerde poner CLOUDFLARE_TUNNEL_TOKEN en .env antes de continuar."
    printf "Pegue el token del tunel (o Intro para hacerlo despues): "
    read -r token
    if [ -n "$token" ]; then
      sed -i "s|^CLOUDFLARE_TUNNEL_TOKEN=.*|CLOUDFLARE_TUNNEL_TOKEN=$token|" .env
      verde "    token guardado"
    fi
  fi
fi

# ------------------------------------------------------------- 4. Respaldos

paso "Preparando el directorio de respaldos"
mkdir -p backups
# El contenedor de la aplicacion corre como uid 1001 y tambien escribe aqui
# cuando se respalda desde el panel. Dueno 1001 y grupo el del usuario que
# despliega: ambos escriben, nadie mas entra.
if [ "$(stat -c '%u' backups)" != "1001" ]; then
  sudo chown -R 1001:"$(id -g)" backups
fi
chmod 770 backups 2>/dev/null || sudo chmod 770 backups
verde "    backups/ lista para el contenedor y para el cron"

# ------------------------------------------------------------ 5. Despliegue

paso "Desplegando la aplicacion"
TUNEL="$TUNEL" ./scripts/deploy.sh

# --------------------------------------------------- 6. Respaldo programado

paso "Programando el respaldo diario"
if command -v systemctl >/dev/null 2>&1 && [ -d /etc/systemd/system ]; then
  destino="$(pwd)"
  sudo tee /etc/systemd/system/plataforma-respaldo.service >/dev/null <<UNIDAD
[Unit]
Description=Respaldo de la plataforma docente de traumatologia
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=$USER
WorkingDirectory=$destino
Environment=TUNEL=$TUNEL
ExecStart=$destino/scripts/respaldar.sh --verificar
UNIDAD

  sudo tee /etc/systemd/system/plataforma-respaldo.timer >/dev/null <<UNIDAD
[Unit]
Description=Respaldo diario de la plataforma a las 03:00

[Timer]
OnCalendar=*-*-* 03:00:00
# Si el servidor estaba apagado a esa hora, el respaldo se hace al encender en
# lugar de perderse hasta el dia siguiente.
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
UNIDAD

  sudo systemctl daemon-reload
  sudo systemctl enable --now plataforma-respaldo.timer
  verde "    temporizador de systemd activo (03:00, con recuperacion si el equipo estuvo apagado)"
  echo "    Estado:    systemctl status plataforma-respaldo.timer"
  echo "    Registro:  journalctl -u plataforma-respaldo.service"
else
  linea="0 3 * * * cd $(pwd) && TUNEL=$TUNEL ./scripts/respaldar.sh --verificar >> backups/respaldo.log 2>&1"
  if crontab -l 2>/dev/null | grep -q "respaldar.sh"; then
    verde "    ya estaba programado en cron"
  else
    (crontab -l 2>/dev/null; echo "$linea") | crontab -
    verde "    respaldo diario en cron a las 03:00"
  fi
fi

# ------------------------------------------------------------------- listo

paso "Comprobacion final"
./scripts/salud.sh || ambar "    revise los avisos de arriba"

echo
verde "Instalacion completada."
echo
if [ "$TUNEL" = "tailscale" ]; then
  echo "Falta publicar el servicio en Tailscale. Ejecute UNA de estas:"
  echo "    sudo tailscale serve --bg 3000     # privado, solo su tailnet"
  echo "    sudo tailscale funnel --bg 3000    # publico en internet, con HTTPS"
  echo
fi
echo "Primera cuenta:  abra ${NEXT_PUBLIC_SERVER_URL:-la direccion publica}/admin"
echo "                 la primera cuenta que se cree queda como administradora y activa."
echo
echo "Actualizar:      ./scripts/actualizar.sh"
echo "Respaldar ahora: ./scripts/respaldar.sh --verificar"
echo "Estado:          ./scripts/salud.sh"

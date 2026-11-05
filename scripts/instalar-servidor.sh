#!/usr/bin/env bash
# Instalacion completa en un servidor Ubuntu limpio (decisiones D-019, D-023).
#
# Es el unico comando que hay que ejecutar despues de clonar el repositorio.
# Deja el servidor operativo: Docker instalado, secretos generados, aplicacion
# construida y en marcha, y el respaldo diario programado.
#
#   git clone git@github.com:VicenteEs/SIMULACIONES.git plataforma
#   cd plataforma
#   ./scripts/instalar-servidor.sh                     # tras un proxy propio
#   TUNEL=cloudflare ./scripts/instalar-servidor.sh    # tras un tunel de Cloudflare
#
# Por omision deja la plataforma como en ved y en Contabo: el override de
# despliegue/paginas, sin puertos en el anfitrion, en la red docker «proxy» y
# bajo /traumahub. El proxy con HTTPS que la publique queda por cuenta de quien
# instala (ver despliegue/paginas/LEEME.md).
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
# age cifra los respaldos (D-295). Sin el, un servidor con la llave publica
# puesta no respalda: no se deja caer un volcado legible donde se prometio que
# no lo habria.
for cmd in git openssl curl age; do
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
  # Sin valor por omision: antes proponia https://<equipo>.ts.net, la de un
  # modo que ya no existe (D-223), y aceptarla con Intro dejaba un .env que
  # apuntaba a ninguna parte. Con el override, la direccion lleva /traumahub.
  url_publica=""
  while [ -z "$url_publica" ]; do
    if [ "$TUNEL" = "local" ]; then
      printf "Direccion publica de la plataforma (https://.../traumahub): "
    else
      printf "Direccion publica de la plataforma (https://...): "
    fi
    read -r url_publica
  done

  echo
  echo "    Los respaldos se cifran con una llave publica de age (D-295). La privada,"
  echo "    la unica que los abre, no se pone en este servidor: se genera en su propio"
  echo "    equipo con  age-keygen -o llave-respaldos.txt  y se guarda en dos lugares"
  echo "    distintos. Aqui va solo la publica, la linea que empieza por age1."
  destinatario=""
  while :; do
    printf "Llave publica de age (Intro para ponerla despues): "
    read -r destinatario
    if [ -z "$destinatario" ] || printf '%s' "$destinatario" | grep -Eq "$PATRON_DESTINATARIO_AGE"; then
      break
    fi
    rojo "    no es una llave publica de age: empieza por age1 y tiene 62 caracteres"
  done

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

# Llave PUBLICA de age con que se cifran los respaldos (D-295). La privada no va
# nunca en un servidor. Vacia, los respaldos salen sin cifrar y salud.sh lo
# marca como problema.
RESPALDOS_DESTINATARIO=$destinatario

# Grupo con que el override arranca la aplicacion, para que escriba en
# backups/ (O-067). Es el de quien instala.
RESPALDOS_GID=$(id -g)
ENV
  chmod 600 .env
  verde "    .env creado con secretos nuevos (permisos 600)"
  if [ -z "$destinatario" ]; then
    ambar "    Sin llave publica de age: los respaldos saldran SIN CIFRAR hasta que"
    ambar "    se ponga RESPALDOS_DESTINATARIO en .env y se recree la app."
  fi

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

if [ "$TUNEL" = "local" ]; then
  paso "Preparando el override y la red del proxy"
  # El override no se versiona dentro del clon (lo ignora .gitignore), asi que
  # copiarlo no estorba a ningun git pull. Si ya existe es el del servidor y no
  # se pisa: puede llevar cambios propios.
  if [ -f docker-compose.override.yml ]; then
    verde "    ya existe docker-compose.override.yml; no se toca"
  else
    cp despliegue/paginas/docker-compose.override.yml .
    verde "    override copiado de despliegue/paginas"
  fi
  # La red es externa al compose: si no existe, `up` falla antes de arrancar.
  if docker network inspect proxy >/dev/null 2>&1; then
    verde "    la red «proxy» ya existe"
  else
    docker network create proxy >/dev/null
    verde "    red «proxy» creada"
  fi
fi

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
if [ "$TUNEL" = "local" ]; then
  echo "Falta la entrada: un proxy con HTTPS en la red docker «proxy» que lleve"
  echo "/traumahub a http://traumahub:3000 (ver despliegue/paginas/LEEME.md)."
  echo
fi
echo "Primera cuenta:  abra ${NEXT_PUBLIC_SERVER_URL:-la direccion publica}/instalar"
echo "                 la primera cuenta que se cree queda como administradora y activa."
echo
echo "Actualizar:      ./scripts/actualizar.sh"
echo "Respaldar ahora: ./scripts/respaldar.sh --verificar"
echo "Estado:          ./scripts/salud.sh"

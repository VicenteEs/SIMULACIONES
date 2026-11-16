#!/usr/bin/env bash
# Prepara el monitoreo de la producción (P-016 E7, D-408).
#
#   ./scripts/preparar-monitoreo.sh
#
# Solo en la producción. Hace tres cosas, y se puede repetir sin daño: lo que
# ya está hecho no se vuelve a hacer.
#
#   1. Escribe en el .env las claves de Umami que falten —la de su base, su
#      secreto, la de su cuenta y el identificador del sitio— y enciende el
#      perfil `monitoreo` del compose. No las enseña: nadie tiene que leerlas,
#      porque la aplicación entra a Umami por su cuenta y su pantalla no se
#      abre a internet.
#   2. Crea la carpeta `estado/` y toma una primera foto del servidor.
#   3. Pone en el cron de este usuario `estado-del-servidor.sh`, cada minuto,
#      después de guardar una copia del cron de antes.
#
# Lo que NO hace es levantar los contenedores: eso queda para quien lo lanza,
# con la orden que se escribe al final, para que el momento del corte de unos
# segundos lo elija una persona y no un guion.
#
# El token de Cloudflare tampoco: lo crea el dueño en el panel de Cloudflare y
# lo escribe él en el .env (`CLOUDFLARE_TOKEN`, `CLOUDFLARE_ZONA`). Es una llave
# de una cuenta suya, y no pasa por ninguna otra mano.
set -euo pipefail

cd "$(dirname "$0")/.."
. scripts/comun.sh

[ "$(id -u)" -ne 0 ] || morir "No ejecute este script como root: el cron tiene que quedar en el usuario que despliega."
# Siempre detrás del proxy o del túnel aparte, como la plantilla del override.
TUNEL=local elegir_compose

paso "Comprobando requisitos"
for cmd in docker python3 flock timeout openssl crontab; do
  command -v "$cmd" >/dev/null || morir "Falta $cmd."
done
[ -f .env ] || morir "Falta .env: este guion se lanza en un servidor ya instalado."
[ -f docker-compose.override.yml ] || morir "Falta docker-compose.override.yml: copie la plantilla de despliegue/paginas."
cmp -s docker-compose.override.yml despliegue/paginas/docker-compose.override.yml ||
  morir "docker-compose.override.yml no es copia de su plantilla, y es la plantilla la que trae a Umami:
    cp despliegue/paginas/docker-compose.override.yml ."
verde "    requisitos correctos"

paso "Escribiendo las claves de Umami en el .env"
# Una copia antes de tocarlo, con sus mismos permisos. `.env.*` está en
# .gitignore, así que no ensucia el árbol que exige actualizar.sh.
marca=$(date +%Y%m%d-%H%M%S)
cp -p .env ".env.antes-del-monitoreo-$marca"
echo "    copia del .env de antes en .env.antes-del-monitoreo-$marca"

# Hexadecimales y no base64: la de la base va dentro de una dirección
# (`postgresql://umami:<clave>@…`) y la de la cuenta dentro de un JSON, y una
# `/` o un `+` en cualquiera de las dos las rompería sin decir por qué.
escribir_si_falta() {
  local variable=$1 valor=$2
  if grep -qE "^${variable}=.+" .env; then
    echo "    $variable ya estaba"
  else
    # Una línea vacía del mismo nombre se quita antes, o quedarían dos.
    sed -i "/^${variable}=\$/d" .env
    printf '%s=%s\n' "$variable" "$valor" >> .env
    verde "    $variable escrita"
  fi
}
if ! grep -q "Monitoreo (D-408)" .env; then
  printf '\n# --- Monitoreo (D-408), escrito por scripts/preparar-monitoreo.sh ---\n' >> .env
fi
escribir_si_falta UMAMI_DB_CLAVE "$(openssl rand -hex 24)"
escribir_si_falta UMAMI_SECRETO "$(openssl rand -hex 32)"
escribir_si_falta UMAMI_CLAVE "$(openssl rand -hex 24)"
escribir_si_falta UMAMI_SITIO "$(cat /proc/sys/kernel/random/uuid)"

if grep -qE '^COMPOSE_PROFILES=' .env; then
  grep -qE '^COMPOSE_PROFILES=.*\bmonitoreo\b' .env ||
    morir "El .env ya trae COMPOSE_PROFILES con otros perfiles. Añada «monitoreo» a mano, separado por coma."
  echo "    el perfil monitoreo ya estaba encendido"
else
  printf 'COMPOSE_PROFILES=monitoreo\n' >> .env
  verde "    perfil monitoreo encendido"
fi
chmod 600 .env

paso "Tomando la primera foto del servidor"
mkdir -p estado
chmod 755 estado
[ -w estado ] || morir "La carpeta estado/ no es de este usuario. Suele pasar si Docker la creó antes que este guion:
    sudo chown $(id -un): estado"
./scripts/estado-del-servidor.sh
[ -s estado/servidor.json ] || morir "El guion no dejó estado/servidor.json: revise lo que escribió arriba."
verde "    estado/servidor.json escrito"

paso "Programando la foto de cada minuto"
if crontab -l 2>/dev/null | grep -q "estado-del-servidor.sh"; then
  verde "    ya estaba en el cron"
else
  copia="$HOME/crontab-antes-del-monitoreo-$marca.txt"
  crontab -l > "$copia" 2>/dev/null || : > "$copia"
  echo "    copia del cron de antes en $copia"
  # La salida va a un archivo que se reescribe cada minuto y no a uno que
  # crece: el guion no escribe nada si todo va bien, y si algo falla interesa
  # el último error, no 1 440 copias del mismo al día.
  linea="* * * * * cd '$(pwd)' && ./scripts/estado-del-servidor.sh > estado/ultimo-error.log 2>&1"
  (crontab -l 2>/dev/null; echo "$linea") | crontab -
  verde "    cada minuto en el cron"
fi

paso "Listo"
echo "    Para encender Umami y darle sus claves a la aplicación (unos segundos sin servicio):"
echo "      $(orden_compose) up -d"
echo "    La aplicación deja Umami listo sola al minuto de arrancar; en su registro sale «[umami] Listo»."
echo
echo "    Para el tráfico de Cloudflare, el dueño escribe en el .env CLOUDFLARE_TOKEN (Zone · Analytics · Read)"
echo "    y CLOUDFLARE_ZONA (el Zone ID de la zona), y vuelve a lanzar la orden de arriba."

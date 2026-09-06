#!/usr/bin/env bash
# Actualizacion del servidor a la ultima version publicada.
#
#   ./scripts/actualizar.sh
#
# Trae los cambios, respalda, reconstruye y comprueba. Si la version nueva no
# responde, deploy.sh vuelve sola a la imagen anterior; este script ademas
# devuelve el codigo al punto en que estaba, para que el arbol de trabajo y el
# contenedor no queden contando historias distintas.
set -euo pipefail

cd "$(dirname "$0")/.."
. scripts/comun.sh

elegir_compose

paso "Comprobando el repositorio"
[ -d .git ] || morir "Esto no es un clon de git."
if [ -n "$(git status --porcelain)" ]; then
  rojo "Hay cambios sin confirmar en el servidor:"
  git status --short
  morir "Un servidor no es sitio para editar codigo. Confirme o descarte antes de actualizar."
fi

ANTES="$(git rev-parse HEAD)"
RAMA="$(git rev-parse --abbrev-ref HEAD)"
echo "    rama $RAMA en $(git rev-parse --short HEAD)"

paso "Trayendo cambios"
git fetch --quiet origin "$RAMA"
NUEVO="$(git rev-parse "origin/$RAMA")"

if [ "$ANTES" = "$NUEVO" ]; then
  verde "    ya esta en la ultima version"
  paso "Comprobando que todo siga en pie"
  exec ./scripts/salud.sh
fi

echo "    hay $(git rev-list --count "$ANTES..$NUEVO") cambio(s) nuevos:"
git log --oneline "$ANTES..$NUEVO" | sed 's/^/      /'

git merge --ff-only "origin/$RAMA"
verde "    actualizado a $(git rev-parse --short HEAD)"

paso "Desplegando"
if TUNEL="$TUNEL" ./scripts/deploy.sh; then
  echo
  verde "Actualizacion completada."
else
  rojo "El despliegue fallo."
  paso "Devolviendo el codigo a $(git rev-parse --short "$ANTES")"
  git reset --hard "$ANTES"
  ambar "    el codigo volvio a la version anterior; la aplicacion tambien."
  ambar "    Revise el registro:  docker compose -f $COMPOSE logs --tail 100 app"
  exit 1
fi

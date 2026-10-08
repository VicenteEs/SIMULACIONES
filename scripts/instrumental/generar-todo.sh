#!/bin/sh
# Rehace todos los modelos de instrumental con Blender, en segundo plano.
#
#   scripts/instrumental/generar-todo.sh              # los 47, a ejemplos/instrumental/
#   scripts/instrumental/generar-todo.sh tijera_mayo  # solo uno (nombre del guion, sin .py)
#
# Por qué un guion de shell y no un script de npm: Blender trae su propio
# Python y no se puede llamar desde Node sin más. Los módulos de apoyo
# (`lib.py`, `detalles.py`, `anillado.py`...) no son instrumentos: se
# reconocen porque ninguno llama a `iniciar(`, que es lo primero que hace cada
# guion de instrumento.
#
# Blender se busca en BLENDER, y si no, en la ruta de instalación de Windows.
# Las medidas están en milímetros en los guiones y salen en metros en el .glb.

cd "$(dirname "$0")/../.." || exit 1
BLENDER="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"

if [ ! -x "$BLENDER" ]; then
  echo "No encuentro Blender en: $BLENDER" >&2
  echo "Instálelo o indique la ruta con BLENDER=/ruta/a/blender" >&2
  exit 1
fi

if [ -n "$1" ]; then
  guiones="scripts/instrumental/$1.py"
else
  guiones=$(grep -l "iniciar(" scripts/instrumental/*.py | grep -v "/lib.py$")
fi

total=0
fallidos=""
for g in $guiones; do
  total=$((total + 1))
  salida=$("$BLENDER" --background --factory-startup --python "$g" 2>&1)
  if echo "$salida" | grep -q "EXPORTADO"; then
    echo "ok     $(basename "$g" .py)"
  else
    echo "FALLÓ  $(basename "$g" .py)"
    echo "$salida" | grep -E "Error|Traceback|Exception" | head -3
    fallidos="$fallidos $(basename "$g" .py)"
  fi
done

echo
echo "$total guion(es) ejecutado(s); salida en ejemplos/instrumental/"
if [ -n "$fallidos" ]; then
  echo "Fallaron:$fallidos" >&2
  exit 1
fi

"""
Elevador de Freer, 180 mm: doble extremo, uno afilado y otro romo, con mango central
acanalado. Para los abordajes periarticulares finos y los minifragmentos.

    blender --background --factory-startup --python scripts/instrumental/elevador_freer.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import exposicion as ex

SLUG = 'elevador-freer'
carpeta = iniciar(SLUG)
raiz = ex.freer(SLUG, 'Elevador de Freer', 'Largo 180 mm · doble punta, afilada y roma')
exportar(raiz, SLUG, carpeta)

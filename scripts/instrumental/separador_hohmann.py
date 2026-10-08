"""
Separador de Hohmann, 240 mm: pala de 18 mm acodada, con la punta hacia arriba para pasar por
detrás del hueso; extremo del mango redondeado para martillarlo.

    blender --background --factory-startup --python scripts/instrumental/separador_hohmann.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import exposicion as ex

SLUG = 'separador-hohmann'
carpeta = iniciar(SLUG)
raiz = ex.hohmann(SLUG, 'Separador de Hohmann', 18.0, 240.0, 'Largo 240 mm · pala de 18 mm · punta en gancho')
exportar(raiz, SLUG, carpeta, vistas={'azimut': 70, 'elevacion': 12})

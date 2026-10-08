"""
Dedo reductor endomedular (finger reducer) de 9 mm, con la punta curva y empuñadura en T: reduce
indirectamente fragmentos dentro del canal sin abrir el foco.

    blender --background --factory-startup --python scripts/instrumental/dedo_reductor.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import doblado_y_clavo as dc

SLUG = 'dedo-reductor'
carpeta = iniciar(SLUG)
raiz = dc.dedo_reductor(SLUG, 'Dedo reductor endomedular', 'Ø 9 mm · largo 420 mm · punta curva · empuñadura en T de 118 mm')
exportar(raiz, SLUG, carpeta)

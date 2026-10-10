"""
Broca AO de 2,0 mm: túnel piloto del tornillo de 2,7 mm (fragmento pequeño).

    blender --background --factory-startup --python scripts/instrumental/broca_2_0.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'broca-2-0'
carpeta = iniciar(SLUG)
raiz = fj.broca(SLUG, 'Broca AO 2,0 mm', 2.0, 80.0, 40.0, 'mini', 'Ø 2,0 × 80 mm · túnel piloto de tornillo 2,7 · también el bloqueado de 2,4')
exportar(raiz, SLUG, carpeta)

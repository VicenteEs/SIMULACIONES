"""
Broca AO de 3,5 mm: agujero de deslizamiento del tornillo cortical de 3,5 mm.

    blender --background --factory-startup --python scripts/instrumental/broca_3_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'broca-3-5'
carpeta = iniciar(SLUG)
raiz = fj.broca(SLUG, 'Broca AO 3,5 mm', 3.5, 110.0, 62.0, 'pequeno', 'Ø 3,5 × 110 mm · agujero de deslizamiento de un tornillo de tracción de 3,5')
exportar(raiz, SLUG, carpeta)

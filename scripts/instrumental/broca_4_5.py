"""
Broca AO de 4,5 mm: agujero de deslizamiento del tornillo cortical de 4,5 mm.

    blender --background --factory-startup --python scripts/instrumental/broca_4_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'broca-4-5'
carpeta = iniciar(SLUG)
raiz = fj.broca(SLUG, 'Broca AO 4,5 mm', 4.5, 145.0, 82.0, 'grande', 'Ø 4,5 × 145 mm · agujero de deslizamiento de un tornillo de tracción de 4,5')
exportar(raiz, SLUG, carpeta)

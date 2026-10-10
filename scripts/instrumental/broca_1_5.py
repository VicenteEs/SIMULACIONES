"""
Broca AO de 1,5 mm: túnel piloto del tornillo de 2,0 mm (minifragmentos).

    blender --background --factory-startup --python scripts/instrumental/broca_1_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'broca-1-5'
carpeta = iniciar(SLUG)
raiz = fj.broca(SLUG, 'Broca AO 1,5 mm', 1.5, 60.0, 30.0, 'mini', 'Ø 1,5 × 60 mm · minifragmentos · túnel piloto de tornillo 2,0')
exportar(raiz, SLUG, carpeta)

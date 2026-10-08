"""
Broca AO de 3,2 mm, 145 mm de largo: túnel piloto de un tornillo cortical de 4,5 mm (gran
fragmento) y de un tornillo de esponjosa de 6,5 mm.

    blender --background --factory-startup --python scripts/instrumental/broca_3_2.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'broca-3-2'
carpeta = iniciar(SLUG)
raiz = fj.broca(SLUG, 'Broca AO 3,2 mm', 3.2, 145.0, 82.0, 'grande', 'Ø 3,2 × 145 mm · gran fragmento · túnel piloto de tornillo 4,5')
exportar(raiz, SLUG, carpeta)

"""
Broca AO de 2,5 mm, 110 mm de largo: abre el túnel piloto de un tornillo cortical de 3,5 mm
(y el de un tornillo bloqueado LCP de 3,5). Punta de 118°, dos filos y acople rápido.

    blender --background --factory-startup --python scripts/instrumental/broca_2_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'broca-2-5'
carpeta = iniciar(SLUG)
raiz = fj.broca(SLUG, 'Broca AO 2,5 mm', 2.5, 110.0, 62.0, 'pequeno', 'Ø 2,5 × 110 mm · pequeño fragmento · túnel piloto de tornillo 3,5')
exportar(raiz, SLUG, carpeta)

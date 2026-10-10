"""
Clavo tibial de 9 × 330 mm: curva proximal de 11°, cuatro agujeros distales y tres proximales.

    blender --background --factory-startup --python scripts/instrumental/clavo_tibial_9x330.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'clavo-tibial-9x330'
carpeta = iniciar(SLUG)
raiz = im.clavo(SLUG, 'Clavo tibial 9 × 330 mm', 330.0, 9.0, lambda z: (0.0, max(0.0, z - 265.0) * 0.1944, z), 'Ø 9 mm · largo 330 mm · curva proximal de 11° · 3 agujeros proximales (uno dinámico) y 3 distales de Ø 5 mm', [(314.0, (1, 0, 0), 5.0, 4.0), (300.0, (1, 0, 0), 5.0, 0.0), (307.0, (0, 1, 0), 5.0, 0.0)], [(14.0, (1, 0, 0), 5.0, 0.0), (26.0, (1, 0, 0), 5.0, 0.0), (38.0, (0, 1, 0), 5.0, 0.0)])
exportar(raiz, SLUG, carpeta)

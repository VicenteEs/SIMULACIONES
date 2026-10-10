"""
Clavo femoral anterógrado de 11 × 380 mm: arco anterior y desvío proximal de 5°.

    blender --background --factory-startup --python scripts/instrumental/clavo_femoral_11x380.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'clavo-femoral-11x380'
carpeta = iniciar(SLUG)
raiz = im.clavo(SLUG, 'Clavo femoral 11 × 380 mm', 380.0, 11.0, lambda z: (max(0.0, z - 310.0) * 0.0875, 12.0 - (z - 190.0) ** 2 / 3000.0, z), 'Ø 11 mm · largo 380 mm · radio de curvatura 1.500 mm · desvío proximal de 5° · 2 agujeros proximales y 3 distales de Ø 5 mm', [(356.0, (1, 0, 0), 5.0, 6.0), (340.0, (1, 0, 0), 5.0, 0.0)], [(16.0, (1, 0, 0), 5.0, 0.0), (30.0, (1, 0, 0), 5.0, 0.0), (44.0, (0, 1, 0), 5.0, 0.0)], mat='titanio_dorado')
exportar(raiz, SLUG, carpeta)

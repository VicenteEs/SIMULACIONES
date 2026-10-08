"""
Aguja de Kirschner de 1,6 mm × 150 mm con punta de trocar de tres facetas: fija de forma
transitoria la reducción o guía un tornillo canulado.

    blender --background --factory-startup --python scripts/instrumental/aguja_kirschner.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion2 as f2

SLUG = 'aguja-kirschner'
carpeta = iniciar(SLUG)
raiz = f2.kirschner(SLUG, 'Aguja de Kirschner 1,6 mm', 1.6, 150.0, 'Ø 1,6 × 150 mm · punta trocar · marcas cada 10 mm')
exportar(raiz, SLUG, carpeta)

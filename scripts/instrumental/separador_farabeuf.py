"""
Separador de Farabeuf, 125 mm: mango plano con una pala en cada extremo, de 10 × 25 mm y de
12 × 30 mm, a lados opuestos. Se usan en pareja.

    blender --background --factory-startup --python scripts/instrumental/separador_farabeuf.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import exposicion as ex

SLUG = 'separador-farabeuf'
carpeta = iniciar(SLUG)
raiz = ex.farabeuf(SLUG, 'Separador de Farabeuf', 'Largo 125 mm · palas de 10 × 25 mm y 12 × 30 mm')
exportar(raiz, SLUG, carpeta)

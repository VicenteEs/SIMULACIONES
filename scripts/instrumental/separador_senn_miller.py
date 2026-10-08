"""
Separador de Senn-Miller, 160 mm: rastrillo de tres garras romas en un extremo y pala en el
otro. El primero que se usa al abrir la piel, para separar en espacios chicos.

    blender --background --factory-startup --python scripts/instrumental/separador_senn_miller.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import exposicion as ex

SLUG = 'separador-senn-miller'
carpeta = iniciar(SLUG)
raiz = ex.senn_miller(SLUG, 'Separador de Senn-Miller', 'Largo 160 mm · rastrillo de 3 garras romas y pala de 17 × 26 mm')
exportar(raiz, SLUG, carpeta)

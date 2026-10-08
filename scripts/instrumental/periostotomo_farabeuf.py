"""
Periostótomo de Farabeuf, 200 mm: hoja acanalada y curva de 13 mm, de filo redondeado.

    blender --background --factory-startup --python scripts/instrumental/periostotomo_farabeuf.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import exposicion as ex

SLUG = 'periostotomo-farabeuf'
carpeta = iniciar(SLUG)
raiz = ex.periostotomo(SLUG, 'Periostótomo de Farabeuf (hoja curva)', 13.0, 200.0, True, 'Largo 200 mm · hoja curva de 13 mm', flecha=2.6)
exportar(raiz, SLUG, carpeta)

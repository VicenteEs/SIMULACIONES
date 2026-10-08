"""
Fresa flexible canulada de 12 mm: cabeza de seis filos helicoidales, eje de espiral y acople AO/Hudson.

    blender --background --factory-startup --python scripts/instrumental/fresa_flexible.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import doblado_y_clavo as dc

SLUG = 'fresa-flexible'
carpeta = iniciar(SLUG)
raiz = dc.fresa_flexible(SLUG, 'Fresa flexible canulada 12 mm', 12.0, 'Cabeza Ø 12 mm (8,5 a 12,0 de 0,5 en 0,5) · eje flexible · largo 420 mm')
exportar(raiz, SLUG, carpeta)

"""
Martillo de osteosíntesis de cabeza de acero con dos caras de nailon y mango de goma.

    blender --background --factory-startup --python scripts/instrumental/martillo.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import doblado_y_clavo as dc

SLUG = 'martillo'
carpeta = iniciar(SLUG)
raiz = dc.martillo(SLUG, 'Martillo con caras de nailon', 'Cabeza Ø 40 × 104 mm · mango de 260 mm')
exportar(raiz, SLUG, carpeta)

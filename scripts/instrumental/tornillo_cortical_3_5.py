"""
Tornillo cortical de 3,5 mm, rosca en todo su largo, cabeza hexagonal.

    blender --background --factory-startup --python scripts/instrumental/tornillo_cortical_3_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'tornillo-cortical-3-5'
carpeta = iniciar(SLUG)
raiz = im.tornillo(SLUG, 'Tornillo cortical 3,5 mm', 3.5, 2.4, 24.0, 1.25, 6.0, 2.6, 'cortical', 'Ø 3,5 mm · núcleo 2,4 · paso 1,25 · largo 24 mm (varía de 10 a 60)')
exportar(raiz, SLUG, carpeta)

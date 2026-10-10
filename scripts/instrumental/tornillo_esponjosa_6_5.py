"""
Tornillo de esponjosa de 6,5 mm, rosca parcial.

    blender --background --factory-startup --python scripts/instrumental/tornillo_esponjosa_6_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'tornillo-esponjosa-6-5'
carpeta = iniciar(SLUG)
raiz = im.tornillo(SLUG, 'Tornillo de esponjosa 6,5 mm', 6.5, 3.0, 50.0, 2.75, 8.0, 3.0, 'esponjosa', 'Ø 6,5 mm · núcleo 3,0 · paso 2,75 · largo 50 mm con rosca de 16 mm', largo_rosca=16.0)
exportar(raiz, SLUG, carpeta)

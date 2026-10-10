"""
Tornillo de bloqueo de un clavo endomedular, de 5,0 mm.

    blender --background --factory-startup --python scripts/instrumental/tornillo_bloqueo_clavo_5_0.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'tornillo-bloqueo-clavo-5-0'
carpeta = iniciar(SLUG)
raiz = im.tornillo(SLUG, 'Tornillo de bloqueo de clavo 5,0 mm', 5.0, 4.0, 40.0, 1.0, 7.0, 2.5, 'clavo', 'Ø 5,0 mm · largo 40 mm (de 20 a 100) · cabeza baja con Stardrive')
exportar(raiz, SLUG, carpeta)

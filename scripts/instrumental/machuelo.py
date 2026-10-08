"""
Machuelo de 3,5 mm (paso 1,25): abre la rosca del hueso cortical denso de la diáfisis antes de
el tornillo. Núcleo de 2,5 mm, tres acanaladuras y vástago con acople rápido.

    blender --background --factory-startup --python scripts/instrumental/machuelo.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion2 as f2

SLUG = 'machuelo-3-5'
carpeta = iniciar(SLUG)
raiz = f2.machuelo(SLUG, 'Machuelo 3,5 mm', 3.5, 2.5, 1.25, 120.0, 'Rosca 3,5 mm · paso 1,25 mm · núcleo 2,5 mm · largo 120 mm')
exportar(raiz, SLUG, carpeta)

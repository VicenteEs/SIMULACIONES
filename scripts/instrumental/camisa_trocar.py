"""
Camisa de protección de partes blandas con guía interna y trocar (Ø 8 / 6 mm): protege la
piel y los músculos al taladrar y deja la guía concéntrica sobre el hueso.

    blender --background --factory-startup --python scripts/instrumental/camisa_trocar.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion2 as f2

SLUG = 'camisa-proteccion-trocar'
carpeta = iniciar(SLUG)
raiz = f2.camisa_trocar(SLUG, 'Camisa de protección con guía y trocar', 'Camisa Ø 8 mm · guía interna Ø 6 mm (dorada) · trocar de tres facetas · largo 96 mm')
exportar(raiz, SLUG, carpeta)

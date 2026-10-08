"""
Guía de broca roscada LCP 2,5 mm (para tornillos bloqueados de 3,5 mm): se enrosca en el
orificio cónico roscado de la placa y fija la trayectoria monoaxial a 90°.

    blender --background --factory-startup --python scripts/instrumental/guia_broca_roscada.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'guia-broca-roscada-lcp'
carpeta = iniciar(SLUG)
raiz = fj.guia_roscada(SLUG, 'Guía de broca roscada LCP 2,5', 8.0, 2.6, 92.0, 0.9, 'Largo 92 mm · rosca de 5,0 mm · para tornillos bloqueados 3,5')
exportar(raiz, SLUG, carpeta)

"""
Tornillo bloqueado de 3,5 mm para una placa LCP: la cabeza tiene rosca y se traba en la placa.

    blender --background --factory-startup --python scripts/instrumental/tornillo_bloqueado_lcp_3_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'tornillo-bloqueado-lcp-3-5'
carpeta = iniciar(SLUG)
raiz = im.tornillo(SLUG, 'Tornillo bloqueado LCP 3,5 mm', 3.5, 2.9, 26.0, 1.25, 5.0, 3.5, 'bloqueado', 'Ø 3,5 mm · núcleo 2,9 · cabeza roscada de 5,0 mm · Stardrive T15 · largo 26 mm')
exportar(raiz, SLUG, carpeta)

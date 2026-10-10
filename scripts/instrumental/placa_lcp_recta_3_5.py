"""
Placa LCP recta de 3,5 mm: agujeros combinados (compresión y bloqueo).

    blender --background --factory-startup --python scripts/instrumental/placa_lcp_recta_3_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'placa-lcp-recta-3-5'
carpeta = iniciar(SLUG)
raiz = im.placa_recta(SLUG, 'Placa LCP recta 3,5 mm', 'lcp', 8, 13.0, 11.0, 4.0, 'Ancho 11 mm · grosor 4,0 mm · 8 agujeros combinados a 13 mm · tornillos corticales de 3,5 o bloqueados de 3,5', d_agujero=3.5)
exportar(raiz, SLUG, carpeta)

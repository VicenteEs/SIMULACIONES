"""
Placa LCP recta de 4,5/5,0 mm, ancha: para fémur y húmero.

    blender --background --factory-startup --python scripts/instrumental/placa_lcp_recta_4_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'placa-lcp-recta-4-5'
carpeta = iniciar(SLUG)
raiz = im.placa_recta(SLUG, 'Placa LCP recta 4,5/5,0 mm ancha', 'lcp', 8, 16.0, 16.0, 5.2, 'Ancho 16 mm · grosor 5,2 mm · 8 agujeros combinados a 16 mm · tornillos de 4,5 o bloqueados de 5,0', d_agujero=4.5)
exportar(raiz, SLUG, carpeta)

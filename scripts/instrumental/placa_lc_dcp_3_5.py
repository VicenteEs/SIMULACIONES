"""
Placa LC-DCP 3,5 mm: contacto limitado, con rebajes bajo la placa entre los agujeros.

    blender --background --factory-startup --python scripts/instrumental/placa_lc_dcp_3_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'placa-lc-dcp-3-5'
carpeta = iniciar(SLUG)
raiz = im.placa_recta(SLUG, 'Placa LC-DCP 3,5 mm', 'lcdcp', 8, 13.0, 10.0, 3.2, 'Ancho 10 mm · grosor 3,2 mm · 8 agujeros a 13 mm · tornillos de 3,5 mm', d_agujero=3.5)
exportar(raiz, SLUG, carpeta)

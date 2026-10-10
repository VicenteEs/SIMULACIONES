"""
Placa DCP 4,5 mm estrecha: compresión dinámica, óvalos con avellanado inclinado.

    blender --background --factory-startup --python scripts/instrumental/placa_dcp_4_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'placa-dcp-4-5'
carpeta = iniciar(SLUG)
raiz = im.placa_recta(SLUG, 'Placa DCP 4,5 mm estrecha', 'dcp', 8, 16.0, 12.0, 3.6, 'Ancho 12 mm · grosor 3,6 mm · 8 agujeros a 16 mm · tornillos de 4,5 mm', d_agujero=4.5)
exportar(raiz, SLUG, carpeta)

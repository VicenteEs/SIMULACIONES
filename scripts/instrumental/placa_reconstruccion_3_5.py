"""
Placa de reconstrucción 3,5 mm: muescas entre agujeros para moldearla en tres planos.

    blender --background --factory-startup --python scripts/instrumental/placa_reconstruccion_3_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'placa-reconstruccion-3-5'
carpeta = iniciar(SLUG)
raiz = im.placa_recta(SLUG, 'Placa de reconstrucción 3,5 mm', 'recon', 10, 10.0, 10.0, 2.7, 'Ancho 10 mm · grosor 2,7 mm · 10 agujeros a 10 mm · se dobla y se tuerce', d_agujero=3.5)
exportar(raiz, SLUG, carpeta)

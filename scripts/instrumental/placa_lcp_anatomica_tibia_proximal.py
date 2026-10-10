"""
Placa LCP anatómica de tibia proximal lateral: cabeza curva con agujeros de bloqueo en dos filas.

    blender --background --factory-startup --python scripts/instrumental/placa_lcp_anatomica_tibia_proximal.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'placa-lcp-anatomica-tibia-proximal'
carpeta = iniciar(SLUG)
raiz = im.placa_con_cabeza(SLUG, 'Placa LCP anatómica de tibia proximal lateral', 'anatomica', 'Cabeza de 44 mm con 6 agujeros de bloqueo (2 filas) · cuerpo de 12 mm con 7 agujeros combinados · grosor 4,5 mm · precontorneada', 130.0, 13.0, 12.0, 7, 44.0, 6, 4.5, d_agujero=3.5, combi=True, radio_cabeza=38.0)
exportar(raiz, SLUG, carpeta)

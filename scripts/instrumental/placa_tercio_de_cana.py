"""
Placa de tercio de caña: un tercio de tubo, delgada, para el maléolo y el peroné.

    blender --background --factory-startup --python scripts/instrumental/placa_tercio_de_cana.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'placa-tercio-de-cana'
carpeta = iniciar(SLUG)
raiz = im.placa_recta(SLUG, 'Placa de tercio de caña 3,5 mm', 'tercio', 6, 12.0, 10.0, 1.0, 'Ancho 10 mm · grosor 1,0 mm · 6 agujeros ovales a 12 mm · curva de un tercio de tubo', d_agujero=3.5, radio_curva=5.8)
exportar(raiz, SLUG, carpeta)

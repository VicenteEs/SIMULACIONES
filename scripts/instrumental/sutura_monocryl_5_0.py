"""
Sutura Monocryl 5-0: poliglecaprona 25, monofilamento, incoloro; absorbible (sutura subcuticular).
Aguja curva de 3/8 de círculo con punta cortante; el hilo se muestra exagerado para verse.

    blender --background --factory-startup --python scripts/instrumental/sutura_monocryl_5_0.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import partes_blandas as pb

SLUG = 'sutura-monocryl-5-0'
carpeta = iniciar(SLUG)
raiz = pb.sutura(SLUG, 'Sutura Monocryl 5-0', 'hilo_incoloro', 0.55, None, 6.0, 'poliglecaprona 25, monofilamento, incoloro; absorbible (sutura subcuticular) · hilo exagerado ×3 para verse en pantalla')
exportar(raiz, SLUG, carpeta)

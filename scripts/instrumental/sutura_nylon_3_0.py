"""
Sutura Nylon 3-0: nailon monofilamento, negro; no absorbible (piel).
Aguja curva de 3/8 de círculo con punta cortante; el hilo se muestra exagerado para verse.

    blender --background --factory-startup --python scripts/instrumental/sutura_nylon_3_0.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import partes_blandas as pb

SLUG = 'sutura-nylon-3-0'
carpeta = iniciar(SLUG)
raiz = pb.sutura(SLUG, 'Sutura Nylon 3-0', 'hilo_negro', 0.9, None, 8.5, 'nailon monofilamento, negro; no absorbible (piel) · hilo exagerado ×3 para verse en pantalla')
exportar(raiz, SLUG, carpeta)

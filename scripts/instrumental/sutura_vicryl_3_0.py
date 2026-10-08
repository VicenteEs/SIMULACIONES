"""
Sutura Vicryl 3-0: poliglactina 910, trenzada, violeta; absorbible.
Aguja curva de 3/8 de círculo con punta cortante; el hilo se muestra exagerado para verse.

    blender --background --factory-startup --python scripts/instrumental/sutura_vicryl_3_0.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import partes_blandas as pb

SLUG = 'sutura-vicryl-3-0'
carpeta = iniciar(SLUG)
raiz = pb.sutura(SLUG, 'Sutura Vicryl 3-0', 'violeta', 0.9, None, 8.5, 'poliglactina 910, trenzada, violeta; absorbible · hilo exagerado ×3 para verse en pantalla')
exportar(raiz, SLUG, carpeta)

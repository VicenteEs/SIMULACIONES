"""
Pinza de disección sin dientes (anatómica), 120 mm: toma tejidos delicados sin
lesionarlos. La punta lleva estrías finas.

    blender --background --factory-startup --python scripts/instrumental/pinza_diseccion_sin_dientes.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import partes_blandas as pb

SLUG = 'pinza-diseccion-sin-dientes'
carpeta = iniciar(SLUG)
raiz = pb.pinza_diseccion(SLUG, 'Pinza de disección sin dientes (anatómica)', 120.0, False, 'Largo 120 mm · puntas estriadas')
exportar(raiz, SLUG, carpeta)

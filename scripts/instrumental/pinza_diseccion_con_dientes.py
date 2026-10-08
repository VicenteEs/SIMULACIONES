"""
Pinza de disección de Adson con dientes (1×2), 120 mm: toma la piel y la fascia sin
resbalar.

    blender --background --factory-startup --python scripts/instrumental/pinza_diseccion_con_dientes.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import partes_blandas as pb

SLUG = 'pinza-diseccion-con-dientes'
carpeta = iniciar(SLUG)
raiz = pb.pinza_diseccion(SLUG, 'Pinza de disección con dientes (Adson 1×2)', 120.0, True, 'Largo 120 mm · puntas con dientes 1×2')
exportar(raiz, SLUG, carpeta)

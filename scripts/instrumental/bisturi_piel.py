"""
Bisturí de piel: mango n.º 4 con hoja n.º 22 (la de vientre grande). Es el que
hace la incisión de la piel.

    blender --background --factory-startup --python scripts/instrumental/bisturi_piel.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import partes_blandas as pb

SLUG = 'bisturi-piel-n22'
carpeta = iniciar(SLUG)
raiz = pb.bisturi(SLUG, 'Bisturí de piel (mango 4, hoja 22)', '4', '22', 'Mango n.º 4 · hoja n.º 22 · largo total 171 mm')
exportar(raiz, SLUG, carpeta)

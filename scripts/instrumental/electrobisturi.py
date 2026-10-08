"""
Electrobisturí (lápiz de electrocirugía) de dos botones: amarillo corta (CUT), azul
coagula (COAG). Con electrodo de hoja, cable y conector.

    blender --background --factory-startup --python scripts/instrumental/electrobisturi.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import partes_blandas as pb

SLUG = 'electrobisturi'
carpeta = iniciar(SLUG)
raiz = pb.electrobisturi(SLUG, 'Electrobisturí de dos botones (corte / coagulación)', 'Lápiz de 176 mm · electrodo de hoja de 20 mm · botón amarillo = corte, azul = coagulación')
exportar(raiz, SLUG, carpeta)

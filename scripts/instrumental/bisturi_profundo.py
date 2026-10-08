"""
Bisturí profundo: mango n.º 3 con hoja n.º 15 (la pequeña de vientre). Para cortar
planos profundos, fascia y periostio.

    blender --background --factory-startup --python scripts/instrumental/bisturi_profundo.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import partes_blandas as pb

SLUG = 'bisturi-profundo-n15'
carpeta = iniciar(SLUG)
raiz = pb.bisturi(SLUG, 'Bisturí profundo (mango 3, hoja 15)', '3', '15', 'Mango n.º 3 · hoja n.º 15 · largo total 153 mm')
exportar(raiz, SLUG, carpeta)

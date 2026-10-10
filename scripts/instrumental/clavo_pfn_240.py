"""
Clavo cefalomedular (PFN) de 10 × 240 mm con su tornillo cefálico y el antirrotatorio.

    blender --background --factory-startup --python scripts/instrumental/clavo_pfn_240.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'clavo-pfn-240'
carpeta = iniciar(SLUG)
raiz = im.clavo_pfn(SLUG, 'Clavo cefalomedular PFN 10 × 240 mm', 'Ø 10 mm · largo 240 mm · desvío proximal de 6° · cuello-diáfisis 130° · tornillo cefálico Ø 10,35 y antirrotatorio Ø 6,5 · bloqueo distal de Ø 5')
exportar(raiz, SLUG, carpeta)

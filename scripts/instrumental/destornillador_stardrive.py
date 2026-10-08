"""
Destornillador Stardrive T15 con mango recto: coloca los tornillos bloqueados LCP de
3,5 mm. El sistema Stardrive (Torx) evita que la punta resbale en la cabeza.

    blender --background --factory-startup --python scripts/instrumental/destornillador_stardrive.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'destornillador-stardrive'
carpeta = iniciar(SLUG)
raiz = fj.destornillador(SLUG, 'Destornillador Stardrive T15', 'torx', 210.0, 2.6, 'verde_anodizado', 'Stardrive T15 · largo 210 mm · mango recto estriado', en_t=False, d_torx=3.1)
exportar(raiz, SLUG, carpeta)

"""
Avellanador de 6 mm para tornillos de 3,5 mm: talla en la primera cortical el lecho esférico de la
cabeza para evitar picos de esfuerzo al dar compresión.

    blender --background --factory-startup --python scripts/instrumental/avellanador.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion2 as f2

SLUG = 'avellanador'
carpeta = iniciar(SLUG)
raiz = f2.avellanador(SLUG, 'Avellanador 6,0 mm (tornillo 3,5)', 6.0, 100.0, 'Cabeza Ø 6,0 mm · 5 filos · guía piloto · largo 100 mm')
exportar(raiz, SLUG, carpeta)

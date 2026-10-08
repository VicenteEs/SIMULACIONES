"""
Plantilla maleable de aluminio con 12 orificios, para copiar el contorno del hueso y moldear la placa
antes de colocarla.

    blender --background --factory-startup --python scripts/instrumental/plantilla_aluminio.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import doblado_y_clavo as dc

SLUG = 'plantilla-aluminio'
carpeta = iniciar(SLUG)
raiz = dc.plantilla(SLUG, 'Plantilla maleable de aluminio', 12, 13.0, 'Aluminio · 12 orificios a 13 mm · 11 × 1,6 mm')
exportar(raiz, SLUG, carpeta)

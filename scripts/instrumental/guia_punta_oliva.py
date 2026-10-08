"""
Guía de punta de oliva de 3,0 mm × 950 mm: pasa el canal medular y guía las fresas canuladas. Modelo del
largo real; la vista previa enseña la punta.

    blender --background --factory-startup --python scripts/instrumental/guia_punta_oliva.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import doblado_y_clavo as dc

SLUG = 'guia-punta-oliva'
carpeta = iniciar(SLUG)
raiz = dc.guia_oliva(SLUG, 'Guía de punta de oliva 3,0 mm', 3.0, 950.0, 'Ø 3,0 mm × 950 mm · esfera de 4,4 mm · marcas cada 100 mm')
exportar(raiz, SLUG, carpeta, vistas={'distancia': 0.55, 'desplazar': (0, 0, -440), 'azimut': 20})

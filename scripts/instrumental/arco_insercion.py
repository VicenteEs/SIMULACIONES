"""
Arco de inserción del clavo: mango con perno de conexión y brazo curvo con tres camisas para los tornillos
de bloqueo proximales.

    blender --background --factory-startup --python scripts/instrumental/arco_insercion.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import doblado_y_clavo as dc

SLUG = 'arco-insercion'
carpeta = iniciar(SLUG)
raiz = dc.arco_insercion(SLUG, 'Arco de inserción del clavo (guía proximal)', 'Mango Ø 38 mm · perno de conexión · 3 camisas de bloqueo')
exportar(raiz, SLUG, carpeta, vistas={'azimut': 20, 'elevacion': 20})

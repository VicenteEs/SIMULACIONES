"""
Punzón iniciador curvo (awl) de 250 mm: marca el punto de entrada del clavo (vértice del trocánter
mayor, tubérculo anterior de la tibia) sin dañar el aparato extensor.

    blender --background --factory-startup --python scripts/instrumental/punzon_iniciador.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import doblado_y_clavo as dc

SLUG = 'punzon-iniciador'
carpeta = iniciar(SLUG)
raiz = dc.punzon(SLUG, 'Punzón iniciador curvo (awl)', 'Largo 250 mm · vástago curvo Ø 5 mm · punta de tres filos · mango moleteado')
exportar(raiz, SLUG, carpeta)

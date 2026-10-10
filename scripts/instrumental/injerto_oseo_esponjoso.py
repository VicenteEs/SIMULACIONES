"""
Injerto de esponjosa en trozos, para rellenar defectos.

    blender --background --factory-startup --python scripts/instrumental/injerto_oseo_esponjoso.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'injerto-oseo-esponjoso'
carpeta = iniciar(SLUG)
raiz = im.injerto_esponjoso(SLUG, 'Injerto óseo esponjoso en trozos', 'Trozos de 3 a 8 mm de esponjosa de cresta ilíaca')
exportar(raiz, SLUG, carpeta)

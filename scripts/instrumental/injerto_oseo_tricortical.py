"""
Injerto tricortical de cresta ilíaca: bloque con tres cortical y esponjosa.

    blender --background --factory-startup --python scripts/instrumental/injerto_oseo_tricortical.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'injerto-oseo-tricortical'
carpeta = iniciar(SLUG)
raiz = im.injerto_tricortical(SLUG, 'Injerto óseo tricortical de cresta ilíaca', 'Bloque de unos 30 × 15 × 18 mm · tres caras de cortical')
exportar(raiz, SLUG, carpeta)

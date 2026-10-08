"""
Tubo de intercambio de 330 mm: vaina de plástico por donde se retira la guía de punta de oliva y se pasa
una guía lisa si el clavo lo exige.

    blender --background --factory-startup --python scripts/instrumental/tubo_intercambio.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import doblado_y_clavo as dc

SLUG = 'tubo-intercambio'
carpeta = iniciar(SLUG)
raiz = dc.tubo_intercambio(SLUG, 'Tubo de intercambio', 'Largo 330 mm · Ø 8,6 / 6,6 mm · casquillo azul')
exportar(raiz, SLUG, carpeta)

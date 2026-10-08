"""
Guía de broca doble DCP 2,5 / 3,5 mm: un extremo neutro (verde) y otro excéntrico (dorado).
Centra la broca en el orificio de una placa de compresión y, en modo excéntrico,
la desplaza para que el tornillo comprima el trazo.

    blender --background --factory-startup --python scripts/instrumental/guia_broca_doble.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'guia-broca-doble-dcp'
carpeta = iniciar(SLUG)
raiz = fj.guia_doble(SLUG, 'Guía de broca doble DCP 2,5 / 3,5', 11.0, 2.6, 78.0, 'Largo 78 mm · neutro (verde) y excéntrico (dorado) · broca 2,5 mm')
exportar(raiz, SLUG, carpeta)

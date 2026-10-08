"""
Motor quirúrgico a batería, de cuerpo de pistola, con mandril de acople rápido AO. Gatillo y
mandril articulados.

    blender --background --factory-startup --python scripts/instrumental/motor_quirurgico.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion2 as f2

SLUG = 'motor-quirurgico'
carpeta = iniciar(SLUG)
raiz = f2.motor(SLUG, 'Motor quirúrgico a batería', 'Cuerpo de pistola · unos 280 mm · mandril AO · gatillo')
exportar(raiz, SLUG, carpeta, vistas={'azimut': 38, 'elevacion': 12})

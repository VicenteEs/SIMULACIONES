"""
Placa en gancho: cuerpo con tres agujeros y gancho subacromial, para la clavícula distal.

    blender --background --factory-startup --python scripts/instrumental/placa_gancho_clavicular.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'placa-gancho-clavicular'
carpeta = iniciar(SLUG)
raiz = im.placa_gancho(SLUG, 'Placa en gancho para clavícula', 'Ancho 11 mm · grosor 3,0 mm · 3 agujeros · gancho de 15 mm hacia el acromion')
exportar(raiz, SLUG, carpeta)

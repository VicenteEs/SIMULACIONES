"""
Placa en L de 3,5 mm: cabeza que sale solo hacia un lado (existe derecha e izquierda).

    blender --background --factory-startup --python scripts/instrumental/placa_l_3_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'placa-l-3-5'
carpeta = iniciar(SLUG)
raiz = im.placa_con_cabeza(SLUG, 'Placa en L 3,5 mm', 'L', 'Cabeza de 28 mm con 3 agujeros · cuerpo de 10 mm con 4 óvalos · grosor 3,2 mm', 70.0, 13.0, 10.0, 4, 28.0, 3, 3.2)
exportar(raiz, SLUG, carpeta)

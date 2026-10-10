"""
Placa en T de 3,5 mm: cabeza horizontal con tres agujeros y cuerpo recto.

    blender --background --factory-startup --python scripts/instrumental/placa_t_3_5.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import implantes as im

SLUG = 'placa-t-3-5'
carpeta = iniciar(SLUG)
raiz = im.placa_con_cabeza(SLUG, 'Placa en T 3,5 mm', 'T', 'Cabeza de 30 mm con 3 agujeros · cuerpo de 10 mm con 4 óvalos · grosor 3,2 mm', 70.0, 13.0, 10.0, 4, 30.0, 3, 3.2)
exportar(raiz, SLUG, carpeta)

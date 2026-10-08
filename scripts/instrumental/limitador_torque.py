"""
Limitador de torque dinámico de 1,5 N·m (tornillos bloqueados LCP 3,5): el mango patina al
alcanzar el par y evita barrer la rosca de la placa.

    blender --background --factory-startup --python scripts/instrumental/limitador_torque.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion2 as f2

SLUG = 'limitador-torque'
carpeta = iniciar(SLUG)
raiz = f2.limitador_torque(SLUG, 'Limitador de torque 1,5 N·m', 1.5, 'dorado_anodizado', 'Par 1,5 N·m (sistema 3,5) · largo 150 mm · acople AO · anillo dorado')
exportar(raiz, SLUG, carpeta)

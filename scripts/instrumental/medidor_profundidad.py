"""
Medidor de profundidad AO, 150 mm, escala 0 a 60 mm: la varilla de gancho se desliza dentro
de la vaina; con el gancho tras la cortical lejana se lee la longitud del tornillo.

    blender --background --factory-startup --python scripts/instrumental/medidor_profundidad.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion2 as f2

SLUG = 'medidor-profundidad'
carpeta = iniciar(SLUG)
raiz = f2.medidor_profundidad(SLUG, 'Medidor de profundidad AO 0-60 mm', 60.0, 'Largo 150 mm · escala 0-60 mm de 2 en 2 · gancho de 3,6 mm')
exportar(raiz, SLUG, carpeta)

"""
Broca AO de 2,8 mm, 165 mm de largo, con marcas de profundidad: abre el túnel del tornillo bloqueado
LCP de 3,5 mm a través de la guía roscada. No es la del cortical de 3,5, que va con la de 2,5: el
bloqueado tiene el núcleo más grueso, y con la de 2,5 el agujero queda estrecho (D-300).

    blender --background --factory-startup --python scripts/instrumental/broca_2_8.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'broca-2-8'
carpeta = iniciar(SLUG)
raiz = fj.broca(SLUG, 'Broca AO 2,8 mm', 2.8, 165.0, 70.0, 'pequeno', 'Ø 2,8 × 165 mm · pequeño fragmento · túnel del tornillo bloqueado LCP 3,5')
exportar(raiz, SLUG, carpeta)

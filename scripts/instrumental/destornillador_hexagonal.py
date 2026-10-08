"""
Destornillador hexagonal de 2,5 mm con mango en T y acople AO: coloca los tornillos
corticales de 3,5 y 4,0 mm (pequeño fragmento) a mano.

    blender --background --factory-startup --python scripts/instrumental/destornillador_hexagonal.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import fijacion as fj

SLUG = 'destornillador-hexagonal'
carpeta = iniciar(SLUG)
raiz = fj.destornillador(SLUG, 'Destornillador hexagonal 2,5 con mango en T', 'hex', 190.0, 2.4, 'azul_anodizado', 'Hexágono 2,5 mm · largo 190 mm · mango en T de 107 mm', en_t=True, af=2.5)
exportar(raiz, SLUG, carpeta)

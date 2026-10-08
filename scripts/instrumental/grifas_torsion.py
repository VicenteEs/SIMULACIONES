"""
Grifa de torsión para placas (bending iron) de 250 mm, con la cabeza ranurada para placas de 3,5 y
4,5 mm. Se usa en pareja para doblar y torcer una placa en los tres planos.

    blender --background --factory-startup --python scripts/instrumental/grifas_torsion.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import doblado_y_clavo as dc

SLUG = 'grifas-torsion'
carpeta = iniciar(SLUG)
raiz = dc.grifa(SLUG, 'Grifa de torsión (bending iron)', 4.4, 'Largo 250 mm · ranura 3,5 / 4,5 mm · se usan en pares')
exportar(raiz, SLUG, carpeta)

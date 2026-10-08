"""
Tijera de Metzenbaum, 180 mm: la de disección de planos profundos. Hojas largas
y delgadas, de punta roma, sobre ramas cruzadas.

    blender --background --factory-startup --python scripts/instrumental/tijera_metzenbaum.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import anillado as an

SLUG = 'tijera-metzenbaum'
carpeta = iniciar(SLUG)

P = an.por_omision(
    pivote_z=70.0,
    union_z=128.0,
    ancho_caña=5.0,
    argolla_a=10.5,
    argolla_b=17.0,
    hoja=[(0.0, 1.3), (26.0, 3.0), (52.0, 4.8), (70.0, 7.0)],
    talon=4.0,
    apertura_max=38.0,
    filo=True,
    filo_ancho=1.1,
    filo_desde=22.0,
    radio_tornillo=3.1,
)
raiz = an.construir(SLUG, P)
meta_raiz(raiz, SLUG, 'Tijera de Metzenbaum', 'Largo 180 mm · hojas de 70 mm · punta roma')
exportar(raiz, SLUG, carpeta)

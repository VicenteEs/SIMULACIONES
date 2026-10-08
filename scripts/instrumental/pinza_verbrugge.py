"""
Pinza de reducción de Verbrugge, unos 210 mm: pinza ósea de ramas gruesas con
trinquete y mandíbulas anchas, de garra, para sujetar el hueso mientras se
fija. Es la «pinza de reducción» de las osteosíntesis.

    blender --background --factory-startup --python scripts/instrumental/pinza_verbrugge.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import anillado as an

SLUG = 'pinza-reduccion-verbrugge'
carpeta = iniciar(SLUG)

P = an.por_omision(
    espesor=3.6,
    pivote_z=76.0,
    union_z=160.0,
    ancho_caña=7.0,
    talon=5.0,
    argolla_a=11.5,
    argolla_b=19.0,
    argolla_grosor=4.0,
    argolla_fondo=4.2,
    hoja=[(0.0, 3.2), (12.0, 7.5), (34.0, 9.5), (76.0, 11.0)],
    borde_interior=[(0.0, 0.0), (76.0, 0.0)],
    cremallera=(116.0, 123.0, 1.8),
    apertura_max=32.0,
    radio_tornillo=4.2,
    crec=0.4,
)


def garra(bm, lado, P, y0, y1, pz):
    """Las puntas de la mandíbula se curvan hacia dentro y llevan tres dientes de garra."""
    for i, z in enumerate((2.0, 7.0, 12.0)):
        zz = z - pz
        prisma_plano(bm, [(0.0, zz), (-lado * 3.4, zz + 1.1), (0.0, zz + 3.4)][::lado], y0 + 0.5, y1 - 0.5)


raiz = an.construir(SLUG, P, distal_extra=garra)
meta_raiz(raiz, SLUG, 'Pinza de reducción de Verbrugge', 'Largo 210 mm · ramas con trinquete · mandíbulas de garra')
exportar(raiz, SLUG, carpeta)

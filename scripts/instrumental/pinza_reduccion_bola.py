"""
Pinza de reducción de punta de bola (la «pinza bola»), 250 mm: ramas largas con
trinquete y un vástago fino que termina en una esfera, para reducir fragmentos
de pelvis y acetábulo sin dañar el hueso.

    blender --background --factory-startup --python scripts/instrumental/pinza_reduccion_bola.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import anillado as an

SLUG = 'pinza-reduccion-bola'
carpeta = iniciar(SLUG)

P = an.por_omision(
    espesor=3.2,
    pivote_z=96.0,
    union_z=196.0,
    ancho_caña=6.2,
    talon=4.4,
    argolla_a=11.0,
    argolla_b=18.0,
    argolla_grosor=3.8,
    argolla_fondo=4.0,
    hoja=[(0.0, 3.6), (30.0, 4.4), (66.0, 5.6), (96.0, 7.0)],
    cremallera=(150.0, 156.5, 1.8),
    apertura_max=30.0,
    radio_tornillo=3.6,
)


def bola(bm, lado, P, y0, y1, pz):
    """El vástago acaba en una esfera de 4,6 mm, doblada hacia la línea media."""
    ym = (y0 + y1) / 2
    esfera(bm, (-lado * 5.2, ym, -pz + 3.0), 2.3, 14, 9)
    cilindro(bm, (-lado * 0.2, ym, -pz + 4.0), (-lado * 5.2, ym, -pz + 3.0), 0.95, 0.95, 10)


raiz = an.construir(SLUG, P, distal_extra=bola)
meta_raiz(raiz, SLUG, 'Pinza de reducción de punta de bola', 'Largo 250 mm · ramas con trinquete · esferas de 4,6 mm')
exportar(raiz, SLUG, carpeta)

"""
Pinza de reducción con puntas (de «camarón» o de Weber), 180 mm: ramas con
trinquete que terminan en dos puntas afiladas que se clavan en el hueso, por
cada lado, para tirar de un fragmento sin resbalar.

    blender --background --factory-startup --python scripts/instrumental/pinza_reduccion_puntas.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import anillado as an

SLUG = 'pinza-reduccion-puntas'
carpeta = iniciar(SLUG)

P = an.por_omision(
    espesor=3.0,
    pivote_z=58.0,
    union_z=128.0,
    ancho_caña=6.0,
    talon=4.2,
    argolla_a=10.5,
    argolla_b=17.5,
    argolla_grosor=3.6,
    argolla_fondo=3.8,
    hoja=[(0.0, 2.2), (14.0, 4.2), (36.0, 6.0), (58.0, 8.0)],
    cremallera=(95.0, 101.5, 1.7),
    apertura_max=34.0,
    radio_tornillo=3.5,
)


def puntas(bm, lado, P, y0, y1, pz):
    """Dos puntas por mandíbula: una larga en el eje y otra corta junto a ella, ambas afiladas hacia dentro."""
    for dz, largo in ((0.0, 13.0), (6.5, 7.5)):
        z = dz - pz
        prisma_plano(bm, [(0.0, z + 0.2), (-lado * largo, z - 1.2 + dz * 0.02), (0.0, z + 2.6)][::lado], y0 + 0.2, y1 - 0.2)


raiz = an.construir(SLUG, P, distal_extra=puntas)
meta_raiz(raiz, SLUG, 'Pinza de reducción con puntas (camarón / Weber)', 'Largo 180 mm · ramas con trinquete · dos puntas por mandíbula')
exportar(raiz, SLUG, carpeta)

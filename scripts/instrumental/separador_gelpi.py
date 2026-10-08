"""
Separador autoestático de Gelpi, 180 mm: brazos con una punta afilada, sin
rastrillo, que se clavan en el borde de la herida; trinquete para fijarlo. Se
usa en espacios profundos y estrechos, como el abordaje del canal medular o de
la columna.

    blender --background --factory-startup --python scripts/instrumental/separador_gelpi.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import anillado as an

SLUG = 'separador-gelpi'
carpeta = iniciar(SLUG)

P = an.por_omision(
    espesor=3.2,
    pivote_z=60.0,
    union_z=124.0,
    ancho_caña=6.2,
    talon=4.4,
    argolla_a=10.5,
    argolla_b=17.0,
    argolla_grosor=3.6,
    argolla_fondo=3.8,
    hoja=[(0.0, 4.8), (36.0, 5.4), (60.0, 7.0)],
    cremallera=(86.0, 92.5, 1.9),
    apertura_max=44.0,
    apertura_etiqueta='Separar',
    radio_tornillo=3.5,
)


def punta(bm, lado, P, y0, y1, pz):
    """Cada brazo acaba en una punta afilada que se dobla hacia fuera y abajo, como un garfio."""
    ym = (y0 + y1) / 2
    xo = lado * (P['hoja'][0][1] - 0.2)
    camino = [(xo - lado * 2.0, ym, -pz + 4.0), (xo + lado * 0.6, ym, -pz + 0.5), (xo + lado * 3.4, ym, -pz - 3.5), (xo + lado * 4.2, ym, -pz - 8.0)]
    barrido(bm, camino, [(1.9 * cos(2 * pi * i / 10), 1.35 * sin(2 * pi * i / 10)) for i in range(10)], escala=lambda t: 1.0 - 0.92 * t)


raiz = an.construir(SLUG, P, distal_extra=punta)
meta_raiz(raiz, SLUG, 'Separador autoestático de Gelpi', 'Largo 180 mm · puntas afiladas · trinquete')
exportar(raiz, SLUG, carpeta)

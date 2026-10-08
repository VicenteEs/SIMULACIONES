"""
Separador autoestático de Weitlaner, 160 mm: abre la herida y se queda abierto gracias al trinquete. Rastrillos de 3 y 4 dientes.

    blender --background --factory-startup --python scripts/instrumental/separador_weitlaner.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import anillado as an

SLUG = 'separador-weitlaner'
carpeta = iniciar(SLUG)

P = an.por_omision(
    espesor=3.0,
    pivote_z=52.0,
    union_z=118.0,
    ancho_caña=6.4,
    talon=4.6,
    argolla_a=10.5,
    argolla_b=17.0,
    argolla_grosor=3.6,
    argolla_fondo=3.8,
    hoja=[(0.0, 5.2), (26.0, 5.6), (52.0, 7.0)],
    cremallera=(73.16, 79.66, 1.9),
    apertura_max=44.0,
    apertura_etiqueta='Separar',
    radio_tornillo=3.6,
)

DIENTES = (3, 4)


def rastrillo(bm, lado, P, y0, y1, pz):
    """
    Cada brazo termina en un rastrillo: una barra transversal (a lo largo de Y)
    de la que cuelgan dientes curvos hacia fuera. El brazo A lleva 3 y el B 4
    dientes, como en el instrumento real (el rastrillo desparejo evita que los
    dientes se enfrenten y se claven entre sí al cerrar).
    """
    n = DIENTES[0] if lado > 0 else DIENTES[1]
    ancho = 4.2 * n + 2.0
    xo = lado * (P['hoja'][0][1] + 1.2)
    caja(bm, (xo + lado * 1.2, 0.0, -pz - 2.6), (6.0, ancho, 5.0))
    for i in range(n):
        y = (i - (n - 1) / 2) * 4.2
        camino = [(xo + lado * 1.2, y, -pz - 4.6), (xo + lado * 2.4, y, -pz - 8.2), (xo + lado * 5.2, y, -pz - 10.6), (xo + lado * 8.2, y, -pz - 10.9)]
        barrido(bm, camino, circulo(0.75, 8), escala=lambda t: 1.0 - 0.75 * t)


raiz = an.construir(SLUG, P, distal_extra=rastrillo)
meta_raiz(raiz, SLUG, 'Separador autoestático de Weitlaner', 'Largo 160 mm · rastrillos de 3 y 4 dientes · trinquete')
exportar(raiz, SLUG, carpeta)

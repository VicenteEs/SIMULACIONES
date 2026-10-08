"""
Portaagujas de Mayo-Hegar, 150 mm, con inserto de carburo de tungsteno: el que
sostiene la aguja al suturar. Mandíbulas cortas y gruesas con estrías cruzadas
que enfrentan sus dientes, trinquete de cierre en las cañas y argollas doradas
(en el instrumental real, las argollas doradas señalan que las mandíbulas
llevan carburo de tungsteno).

    blender --background --factory-startup --python scripts/instrumental/portaagujas_mayo_hegar.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import anillado as an

SLUG = 'portaagujas-mayo-hegar'
carpeta = iniciar(SLUG)

P = an.por_omision(
    pivote_z=40.0,
    union_z=112.0,
    ancho_caña=5.6,
    argolla_a=10.0,
    argolla_b=16.5,
    argolla_grosor=3.4,
    hoja=[(0.0, 4.6), (14.0, 5.4), (30.0, 6.8), (40.0, 8.4)],
    talon=3.8,
    espesor=2.8,
    cremallera=(84.0, 91.0, 1.7),
    argolla_mat='dorado_anodizado',
    acero_distal='acero_pulido',
    apertura_max=36.0,
    radio_tornillo=3.0,
)


def estrias(bm, lado, P, y0, y1, pz):
    """Las estrías cruzadas de las mandíbulas: crestas finas que encajan una entre otra."""
    paso = 1.15
    n = int((P['pivote_z'] - 14.0 - 2.0) / paso)
    for i in range(n):
        z = 2.0 + i * paso + (paso / 2 if lado < 0 else 0.0) - pz
        sg = -lado  # la cresta sobresale hacia el lado de la rama contraria
        prisma_plano(bm, [(0.0, z), (sg * 0.28, z + paso * 0.5), (0.0, z + paso)][::lado], y0 + 0.4, y1 - 0.4)
    # Surco central longitudinal, que se lee como un canal oscuro en la cara de la mandíbula
    return


raiz = an.construir(SLUG, P, distal_extra=estrias)
meta_raiz(raiz, SLUG, 'Portaagujas de Mayo-Hegar', 'Largo 150 mm · mandíbulas de carburo de tungsteno · trinquete de 3 puntos')
exportar(raiz, SLUG, carpeta)

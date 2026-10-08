"""
Alicate de doblado de tres puntos para placas de reconstrucción de 3,5 y 4,5 mm: dos mandíbulas con tres
clavijas que doblan la placa en el plano sagital.

    blender --background --factory-startup --python scripts/instrumental/alicate_doblado.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import doblado_y_clavo as dc

import anillado as an

SLUG = 'alicate-doblado'
carpeta = iniciar(SLUG)

P = an.por_omision(
    espesor=5.0,
    pivote_z=44.0,
    union_z=120.0,
    ancho_caña=9.0,
    talon=5.0,
    hoja=[(0.0, 9.0), (20.0, 10.0), (44.0, 12.0)],
    apertura_max=24.0,
    apertura_etiqueta='Abrir',
    radio_tornillo=4.4,
    mango_goma=(95.0, 7.2, 'azul_boton'),
    crec=0.5,
)


def tres_puntos(bm, lado, P, y0, y1, pz):
    """Tres clavijas en las mandíbulas: dos en una y una entre ellas en la otra, que doblan la placa entre las tres."""
    ym = (y0 + y1) / 2
    zs = (7.0, 27.0) if lado > 0 else (17.0,)
    for z in zs:
        cilindro(bm, (0.0, ym, z - pz), (-lado * 7.0, ym, z - pz), 2.4, 2.4, 18)


raiz = an.construir(SLUG, P, distal_extra=tres_puntos)
meta_raiz(raiz, SLUG, 'Alicate de doblado de tres puntos', 'Largo 215 mm · clavijas de 4,8 mm · empuñaduras de goma')
exportar(raiz, SLUG, carpeta)

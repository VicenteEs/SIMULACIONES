"""
Tijera de Mayo recta, 170 mm: la de cortar hilos y tejido grueso. Dos ramas
cruzadas que giran sobre el tornillo; cerrada, las hojas se tocan en la línea
media y las argollas quedan una junto a otra.

    blender --background --factory-startup --python scripts/instrumental/tijera_mayo.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
import anillado as an

SLUG = 'tijera-mayo'
carpeta = iniciar(SLUG)

P = an.por_omision(
    pivote_z=62.0,
    union_z=122.0,
    ancho_caña=5.2,
    argolla_a=11.0,
    argolla_b=17.5,
    hoja=[(0.0, 0.9), (22.0, 3.0), (45.0, 5.6), (62.0, 8.2)],
    apertura_max=42.0,
    apoyo_dedo=True,
    filo=True,
    filo_ancho=1.2,
)
raiz = an.construir(SLUG, P)
meta_raiz(raiz, SLUG, 'Tijera de Mayo recta', 'Largo 170 mm · hojas de 62 mm · acero inoxidable')
exportar(raiz, SLUG, carpeta)

"""
Placa LCP volar de radio distal 2,4 mm, izquierda (pedido del dueño del 2026-11-21, D-426).

    blender --background --factory-startup --python scripts/instrumental/placa_volar_radio_distal_2_4_izquierda.py

Es la derecha en espejo: la arma `placa_volar_radio_distal_2_4.py` con `lado=-1`. Vista desde volar con la cabeza
arriba, el lado radial de un radio izquierdo queda a la izquierda, que es −X: ahí sube el borde distal y ahí se abre
más tarde el cuello. Una copia del guion de la derecha con los signos cambiados a mano habría sido más corta de leer,
pero cualquier arreglo en una se habría quedado sin llegar a la otra.

La foto se toma desde el mismo sitio que la de la derecha y no desde su espejo: las luces del estudio no se espejan,
y desde el otro lado el reflejo de la principal cae justo en la cámara y quema la cara de la placa. Por eso se ve
desde distal y cubital.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from lib import _vista_previa
import placa_volar_radio_distal_2_4 as derecha

SLUG = 'placa-volar-radio-distal-2-4-izquierda'
NOMBRE = 'Placa LCP volar de radio distal 2,4 mm (izquierda)'
NOTAS = ('Izquierda: el lado radial es −X. La cabeza (+Y) sube 10° hacia volar y su cara contra el hueso es cóncava '
         '(radio de 50 mm); sus agujeros son perpendiculares a ella.')


if __name__ == '__main__':
    carpeta = iniciar(SLUG)
    raiz, placa, agujeros, alturas = derecha.construir(lado=-1)
    meta_raiz(raiz, SLUG, NOMBRE, derecha.MEDIDAS, notas=NOTAS, agujeros=agujeros, **derecha.meta_de_la_placa(alturas))
    # La foto lleva el material entero; lo que viaja al .glb es el aplanado (ver la cabecera de la derecha).
    _vista_previa(os.path.join(carpeta, SLUG + '.png'), derecha.VISTA)
    derecha.material_para_el_gltf(placa.active_material)
    exportar(raiz, SLUG, carpeta, previa=False)

"""
Decimado de una malla con Blender (P-006, E1). Se ejecuta con Blender, sin ventana:

    blender --background --factory-startup --python scripts/atlas/fascias/refinar_en_blender.py \
        -- entrada.npz salida.npz --triangulos 14000

`entrada.npz` trae `v` (N×3, flotantes) y `f` (M×3, enteros); `salida.npz` lleva lo mismo, con
menos triángulos.

Por qué Blender y no código propio: la malla que sale de los *Surface Nets* tiene triángulos de
2 mm por todas partes, y una fascia es lisa en casi toda su extensión. Reducirla bien —conservar
el contorno de un maléolo y dejar casi sin triángulos un muslo— es colapsar aristas por
**error cuádrico**, que Blender hace y que en numpy serían cientos de líneas y mucho más lento.
Mismo motivo por el que los 47 instrumentos se modelan con Blender (`scripts/instrumental`).

Lo que Blender no hace es decir si la reducción fue buena: eso lo mide `generar.py` contra la
malla fina, con la distancia de cada vértice nuevo a la superficie vieja.
"""

import sys

import bpy
import numpy as np


def argumentos():
    resto = sys.argv[sys.argv.index('--') + 1 :]
    entrada, salida = resto[0], resto[1]
    triangulos = int(resto[resto.index('--triangulos') + 1])
    return entrada, salida, triangulos


def main():
    entrada, salida, objetivo = argumentos()
    datos = np.load(entrada)
    v = np.asarray(datos['v'], np.float64)
    f = np.asarray(datos['f'], np.int64)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    malla = bpy.data.meshes.new('fascia')
    malla.from_pydata(v.tolist(), [], f.tolist())
    malla.update()
    objeto = bpy.data.objects.new('fascia', malla)
    bpy.context.scene.collection.objects.link(objeto)
    bpy.context.view_layer.objects.active = objeto
    objeto.select_set(True)

    antes = len(malla.polygons)
    if objetivo < antes:
        modificador = objeto.modifiers.new('decimar', 'DECIMATE')
        modificador.decimate_type = 'COLLAPSE'
        modificador.ratio = objetivo / antes
        # Triangulado ya: una fascia que sale con cuadriláteros de la reducción se dibuja distinto
        # en cada visor.
        modificador.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modificador.name)

    resultado = objeto.data
    n = len(resultado.vertices)
    nuevos_v = np.empty(n * 3, np.float64)
    resultado.vertices.foreach_get('co', nuevos_v)
    nuevos_f = np.empty(len(resultado.polygons) * 3, np.int64)
    # Tras triangular, cada polígono tiene exactamente tres índices.
    resultado.polygons.foreach_get('vertices', nuevos_f)
    np.savez(salida, v=nuevos_v.reshape(-1, 3), f=nuevos_f.reshape(-1, 3))
    print(f'DECIMADO {antes} -> {len(resultado.polygons)} triángulos')


main()

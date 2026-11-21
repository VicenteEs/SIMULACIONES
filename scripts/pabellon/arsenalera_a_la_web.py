"""
La arsenalera que modeló el dueño, llevada al simulador (D-418): de su `.blend` de trabajo a `arsenalera-persona.glb`.

Desde D-424 la que viaja es `arsenalera_mesa.blend`: la copia de su archivo con las manos a la altura de la bandeja y
los codos doblados, que el dueño pidió y pintó después. La de los brazos abajo sigue en `arsenalera_manual.blend`, y
sale con `--fuente`: las comprobaciones de abajo valen para las dos.

    blender --background --factory-startup --python scripts/pabellon/arsenalera_a_la_web.py -- [opciones]

    --fuente <archivo.blend>  de dónde sale (por omisión, `salida/arsenalera_manual/arsenalera_mesa.blend`)
    --destino <carpeta>       adónde va el `.glb` (por omisión, `privado/pabellon/`): otra carpeta para probar sin pisar
                              lo que viaja
    --lado-color 1024         el lado de la textura de color de la figura
    --lado-relieve 1024       el de su mapa de normales; 0 lo deja fuera
    --calidad 80              la calidad WebP de las texturas
    --cofia 0.25              la parte de los triángulos de la cofia que se conserva al simplificarla
    --muestras 128            las de Cycles para hornear la sombra de contacto (en el procesador)

**La fuente no se escribe nunca.** Se copia a una carpeta temporal y se abre la copia. El archivo es del dueño, que lo
sigue modelando a mano: un guardado desde aquí le borraría lo que tenga sin guardar, y una pieza movida por el guion
aparecería en su ventana sin que supiera de dónde salió. Ni la copia se guarda: todo pasa en memoria.

Qué hace con cada cosa, y por qué:
- **La figura** (`arsenalera`) se parte por material en las piezas que busca el simulador: bata, pantalón, guantes y
  cubrecalzado (`zapatos`). Las cuatro comparten un atlas de color y otro de normales de 4096 px, que van en 1024 y en
  WebP: en 4096 pesarían más que todo lo demás junto. Lo que sus materiales hacen además con nodos (el ruido fino de la
  tela, la mezcla de normales de la cara de atrás) no viaja: el formato de la web no lo lleva, y a la distancia a la que
  se la ve en el simulador no se nota. Las dos caras sueltas de `piel` que quedaron en el hombro, bajo la bata, se
  dejan fuera.
- **La cabeza** (`cabeza-puesta` con sus hijas) va con sus modificadores aplicados, salvo la Subdivisión y la
  Solidificación de la cofia: con ellas son 267 000 triángulos, más que la figura entera, para una tela que en el
  simulador ocupa unos pocos píxeles. Se simplifica, va de dos caras y de color liso (el ruido de su rampa no viaja).
- **Los lentes**, sin su Solidificación y sin transmisión: `KHR_materials_transmission` obliga a three a dibujar la
  escena entera otra vez en cada cuadro por unos lentes de cinco centímetros. Van ámbar, con transparencia simple.
- **La cara** va con la foto y su alfa, mezclada con la piel del óvalo.
- **La sombra de contacto** se hornea aquí: la oclusión del suelo con Cycles en el procesador (sin esperar el turno de
  la gráfica) vuelta alfa, sin luz, igual que la de la mesa en `mobiliario.py`, para que las dos se asienten igual.
- **Las piezas de la figura van partidas a un centímetro sobre la bandeja de la mesa** cuando tienen caras a los dos
  lados: `bata.arriba` y `bata.abajo`, `guantes.arriba` y `guantes.abajo`. Arriba, las caras con todos sus vértices por
  encima (los antebrazos y las manos que pasan sobre la bandeja); abajo, todo lo demás. Se ve igual que una sola malla.
  Es para la prueba, que solo lee las cajas del `.glb`: en una sola caja, la manga que pasa sobre la bandeja y la falda
  que no puede llegar a la funda serían lo mismo, y no habría regla que sirviera. La pieza que queda entera de un lado
  conserva su nombre de siempre (`pantalon.tela`, `zapatos.cubrecalzado`).

Lo que el simulador y la prueba (`tests/unit/mueblesDelPabellon.test.ts`) buscan por su nombre: la raíz
`arsenalera-persona` y, de ella, `bata`, `pantalon`, `guantes`, `zapatos`, `cabeza`, `cara`, `gorro`, `mascarilla`,
`gafas` y `sombra`. La escena pincha la bata, los guantes y el gorro (cada grupo con todo lo que cuelga de él), y deja
la sombra sin echar ni recibir sombra. El origen queda en el suelo entre los pies, y la figura mira a +Z en la web (a −Y
en Blender).

**Se comprueba antes de escribir, y para si algo falla:** los pies en el suelo, la cofia a la altura de una persona, la
cara por delante de la cabeza, lo que baja hasta la altura de la base de la mesa dentro de la huella de los pies (lo
único que la base respeta: ver `radioDeLosPies` en `src/lib/mesaDeArsenalera.ts`), que ninguna malla que baje de la
bandeja llegue a la funda de la mesa (lo que pasa sobre la funda tiene que ir por encima de la bandeja), que nada vaya
más allá de lo que alcanzan sus manos (`alcanceDeLasManos`), la falda en su radio y el peso bajo el tope del contrato.
"""

import argparse
import json
import re
import shutil
import struct
import sys
import tempfile
import time
from pathlib import Path

import bmesh
import bpy
import numpy as np

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
# La de las manos en la mesa (D-424). La de los brazos abajo, `arsenalera_manual.blend`, sale con `--fuente`.
FUENTE = AQUI / 'salida' / 'arsenalera_manual' / 'arsenalera_mesa.blend'
PABELLON = RAIZ / 'privado' / 'pabellon'
ARCHIVO = 'arsenalera-persona.glb'
MEDIDAS = RAIZ / 'src' / 'lib' / 'mesaDeArsenalera.ts'
MOBILIARIO = AQUI / 'mobiliario.py'

# Material de la figura → pieza del simulador. Lo que no está aquí no viaja.
PIEZAS_DE_LA_FIGURA = {'bata': 'bata', 'pantalon': 'pantalon', 'guantes': 'guantes', 'cubrecalzado': 'zapatos'}
# Rugosidad de cada pieza: la de sus materiales sale de nodos, y en la web va un número. Las de la figura anterior.
RUGOSIDAD = {'bata': 0.85, 'pantalon': 0.85, 'guantes': 0.42, 'zapatos': 0.42}
# Lo que cuelga la funda de la mesa desde el eje de la bandeja (comentario de `delEjeDeLaBandejaALaPersona`).
FUNDA_DESDE_EL_EJE = 0.246
# Lo que tiene que quedar entre la bandeja y lo que pasa sobre ella: los guantes bajan hasta 1,00 m y la bandeja está a
# 0,98. Con menos, una mano que se hundiera en la compresa pasaría la comprobación.
SOBRE_LA_BANDEJA = 0.01
TOPE_DEL_PESO = 1.2 * 1024 * 1024


def opciones():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--fuente', default=str(FUENTE))
    p.add_argument('--destino', default=str(PABELLON))
    p.add_argument('--lado-color', type=int, default=1024)
    p.add_argument('--lado-relieve', type=int, default=1024)
    p.add_argument('--calidad', type=int, default=80)
    p.add_argument('--cofia', type=float, default=0.25)
    p.add_argument('--muestras', type=int, default=128)
    return p.parse_args(argv)


def medidas_del_simulador():
    """Las medidas de la sala que se comprueban, leídas de donde las usa el simulador: copiadas aquí se desfasarían."""
    texto = MEDIDAS.read_text(encoding='utf-8')
    salida = {}
    for nombre in ('radioDeLosPies', 'radioDeLaPersona', 'delEjeDeLaBandejaALaPersona', 'alturaDeLaBandeja',
                   'alcanceDeLasManos'):
        m = re.search(rf'\b{nombre}:\s*([0-9.]+)', texto)
        if not m:
            raise SystemExit(f'No encuentro {nombre} en {MEDIDAS}.')
        salida[nombre] = float(m.group(1))
    return salida


def leer_glb(ruta):
    datos = Path(ruta).read_bytes()
    largo = struct.unpack_from('<I', datos, 12)[0]
    return json.loads(datos[20:20 + largo])


def cajas(doc):
    """Las cajas de cada nodo con nombre, con lo que cuelga de él: lo mismo que mide la prueba."""
    resultado = {}

    def matriz(nodo):
        t = np.array(nodo.get('translation', [0, 0, 0]), dtype=float)
        x, y, z, w = nodo.get('rotation', [0, 0, 0, 1])
        s = np.array(nodo.get('scale', [1, 1, 1]), dtype=float)
        r = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ])
        m = np.eye(4)
        m[:3, :3] = r * s
        m[:3, 3] = t
        return m

    def recorrer(i, padre, acumuladas):
        nodo = doc['nodes'][i]
        mundo = padre @ matriz(nodo)
        caja = [np.full(3, np.inf), np.full(3, -np.inf)]
        de_este = acumuladas + [caja]
        if 'mesh' in nodo:
            for prim in doc['meshes'][nodo['mesh']]['primitives']:
                acc = doc['accessors'][prim['attributes']['POSITION']]
                lo, hi = np.array(acc['min']), np.array(acc['max'])
                esquinas = np.array([[a, b, c, 1] for a in (lo[0], hi[0]) for b in (lo[1], hi[1]) for c in (lo[2], hi[2])])
                puntos = (esquinas @ mundo.T)[:, :3]
                for c in de_este:
                    c[0] = np.minimum(c[0], puntos.min(axis=0))
                    c[1] = np.maximum(c[1], puntos.max(axis=0))
        for hijo in nodo.get('children', []):
            recorrer(hijo, mundo, de_este)
        if 'name' in nodo:
            resultado[nodo['name']] = caja

    for raiz in doc['scenes'][0]['nodes']:
        recorrer(raiz, np.eye(4), [])
    return resultado


def hijos(doc, nombre):
    """Los nombres de los nodos que cuelgan directamente del nodo `nombre`."""
    for nodo in doc['nodes']:
        if nodo.get('name') == nombre:
            return [doc['nodes'][i].get('name') for i in nodo.get('children', [])]
    return []


def abrir_una_copia(fuente):
    carpeta = Path(tempfile.mkdtemp(prefix='arsenalera-a-la-web-'))
    copia = carpeta / 'copia.blend'
    shutil.copy2(fuente, copia)
    bpy.ops.wm.open_mainfile(filepath=str(copia), load_ui=False)
    return carpeta


def malla_vista(ob, quitar=()):
    """
    Un objeto nuevo con la malla de `ob` como se ve, ya en el marco del mundo: los modificadores aplicados, salvo los de
    los tipos de `quitar`, y el padre horneado. Así todo queda con la transformación identidad y la jerarquía de la web
    se arma sin arrastrar la del archivo.
    """
    for md in list(ob.modifiers):
        if md.type in quitar:
            ob.modifiers.remove(md)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    malla = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    malla.transform(ob.matrix_world)
    if ob.matrix_world.determinant() < 0:
        malla.flip_normals()
    nuevo = bpy.data.objects.new(f'{ob.name}--web', malla)
    bpy.context.scene.collection.objects.link(nuevo)
    return nuevo


def simplificar(ob, proporcion):
    md = ob.modifiers.new('simplificar', 'DECIMATE')
    md.ratio = proporcion
    md.use_collapse_triangulate = True
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    malla = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    vieja = ob.data
    ob.modifiers.remove(md)
    ob.data = malla
    bpy.data.meshes.remove(vieja)


def deseleccionar_todo():
    # Por la escena y no por la capa: tras borrar los objetos de la fuente, la lista de la capa trae huecos (None)
    # hasta que algo la rehace.
    for ob in bpy.context.scene.objects:
        ob.select_set(False)


def triangulos(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def principled_de(mat):
    return next((n for n in mat.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None) if mat else None


def color_de(mat, defecto=(0.8, 0.8, 0.8, 1.0)):
    """El color base de un material: el valor del Principled o, si le llega una rampa, su color del medio."""
    p = principled_de(mat)
    if p is None:
        return defecto
    entrada = p.inputs['Base Color']
    if entrada.is_linked:
        nodo = entrada.links[0].from_node
        if nodo.bl_idname == 'ShaderNodeValToRGB':
            return tuple(nodo.color_ramp.evaluate(0.5))
        return defecto
    return tuple(entrada.default_value)


def rugosidad_de(mat, defecto):
    p = principled_de(mat)
    if p is None or p.inputs['Roughness'].is_linked:
        return defecto
    return float(p.inputs['Roughness'].default_value)


def uv_de_la_imagen(mat, nombre_de_imagen):
    """El mapa UV con que un material lee una imagen: el del nodo UVMap que le llega, o None si usa el activo."""
    for n in mat.node_tree.nodes:
        if n.bl_idname == 'ShaderNodeTexImage' and n.image and n.image.name == nombre_de_imagen:
            entrada = n.inputs['Vector']
            if entrada.is_linked and entrada.links[0].from_node.bl_idname == 'ShaderNodeUVMap':
                return entrada.links[0].from_node.uv_map
    return None


def dejar_un_uv(ob, nombre):
    capas = ob.data.uv_layers
    if nombre and nombre in capas:
        for capa in list(capas):
            if capa.name != nombre:
                capas.remove(capa)
    elif len(capas) > 1:
        for capa in list(capas)[1:]:
            capas.remove(capa)
    if len(capas):
        capas[0].name = 'UVMap'
        capas.active = capas[0]


def reducida(original, nombre, lado, datos=False):
    """Una copia de la imagen en `lado` px, empaquetada: el exportador la pasa a WebP desde aquí."""
    im = original.copy()
    im.name = nombre
    # El espacio de color antes de achicarla: cambiarlo después recarga la imagen de su original y deshace la reducción.
    # Así viajó el mapa de normales en 4096 la primera vez, sin ningún aviso.
    if datos:
        im.colorspace_settings.name = 'Non-Color'
    im.scale(lado, lado)
    im.pack()
    if tuple(im.size) != (lado, lado):
        raise SystemExit(f'«{nombre}» quedó en {tuple(im.size)} y no en {lado}×{lado}.')
    return im


def material_web(nombre, color, rugosidad, imagen=None, relieve=None, alfa=None, alfa_de_la_imagen=False, dos_caras=True):
    """Un Principled liso, con lo único que el exportador sabe llevar a la web: color, alfa, normales y rugosidad."""
    mat = bpy.data.materials.new(nombre)
    if hasattr(mat, 'use_nodes') and not mat.use_nodes:
        mat.use_nodes = True
    arbol = mat.node_tree
    arbol.nodes.clear()
    salida = arbol.nodes.new('ShaderNodeOutputMaterial')
    bsdf = arbol.nodes.new('ShaderNodeBsdfPrincipled')
    arbol.links.new(bsdf.outputs['BSDF'], salida.inputs['Surface'])
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = rugosidad
    bsdf.inputs['Metallic'].default_value = 0.0
    if imagen is not None:
        tex = arbol.nodes.new('ShaderNodeTexImage')
        tex.image = imagen
        arbol.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        if alfa_de_la_imagen:
            arbol.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    if relieve is not None:
        tex = arbol.nodes.new('ShaderNodeTexImage')
        tex.image = relieve
        normal = arbol.nodes.new('ShaderNodeNormalMap')
        arbol.links.new(tex.outputs['Color'], normal.inputs['Color'])
        arbol.links.new(normal.outputs['Normal'], bsdf.inputs['Normal'])
    if alfa is not None:
        bsdf.inputs['Alpha'].default_value = alfa
    if alfa is not None or alfa_de_la_imagen:
        mat.surface_render_method = 'BLENDED'
    mat.use_backface_culling = not dos_caras
    return mat


def poner_material(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    indices = np.zeros(len(ob.data.polygons), dtype=np.int32)
    ob.data.polygons.foreach_set('material_index', indices)


def partir_la_figura(figura):
    """Las piezas de la figura, una por material, ya en el mundo. Devuelve {pieza: objeto} y el UV de su atlas."""
    nombres = [s.material.name if s.material else None for s in figura.material_slots]
    uv = uv_de_la_imagen(figura.material_slots[nombres.index('bata')].material, 'albedo.png')
    uv_normal = uv_de_la_imagen(figura.material_slots[nombres.index('bata')].material, 'normal-tangente.png')
    if uv_normal not in (None, uv):
        raise SystemExit(f'El color y las normales de la figura usan UV distintos ({uv} y {uv_normal}): en la web va uno.')
    entera = malla_vista(figura)
    piezas = {}
    for i, nombre in enumerate(nombres):
        if nombre not in PIEZAS_DE_LA_FIGURA:
            caras = sum(1 for p in entera.data.polygons if p.material_index == i)
            if caras:
                print(f'  fuera de la web: {caras} caras de «{nombre}»', flush=True)
            continue
        bm = bmesh.new()
        bm.from_mesh(entera.data)
        sin_pesos(bm)
        otras = [f for f in bm.faces if f.material_index != i]
        bmesh.ops.delete(bm, geom=otras, context='FACES')
        malla = bpy.data.meshes.new(PIEZAS_DE_LA_FIGURA[nombre])
        bm.to_mesh(malla)
        bm.free()
        ob = bpy.data.objects.new(f'{PIEZAS_DE_LA_FIGURA[nombre]}--web', malla)
        bpy.context.scene.collection.objects.link(ob)
        dejar_un_uv(ob, uv)
        piezas[PIEZAS_DE_LA_FIGURA[nombre]] = ob
    bpy.data.objects.remove(entera, do_unlink=True)
    return piezas, uv


def sin_pesos(bm):
    """
    Quita los pesos de los vértices. La figura de las manos en la mesa los trae de su esqueleto (D-424) y en la web va
    quieta. Una malla nueva los hereda sin la lista de grupos que los nombra, y el exportador la da por no válida y la
    corrige por su cuenta con `validate()`: mejor que no tenga nada que corregir salvo lo que ya traía.
    """
    for capa in list(bm.verts.layers.deform.values()):
        bm.verts.layers.deform.remove(capa)


def partir_por_la_altura(ob, altura):
    """
    Dos objetos con las caras de `ob`: las que tienen todos sus vértices a `altura` o más, y las demás. Las caras no se
    cortan, solo se reparten, así que el borde queda con los mismos vértices a los dos lados y no se ve la costura. Si
    una de las dos partes queda vacía, devuelve `None` en su lugar.
    """
    partes = []
    for arriba in (True, False):
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        sin_pesos(bm)
        sobran = [f for f in bm.faces if all(v.co.z >= altura for v in f.verts) != arriba]
        bmesh.ops.delete(bm, geom=sobran, context='FACES')
        if not bm.faces:
            bm.free()
            partes.append(None)
            continue
        malla = bpy.data.meshes.new(f'{ob.data.name}-{"arriba" if arriba else "abajo"}')
        bm.to_mesh(malla)
        bm.free()
        # `to_mesh` lleva el índice de material de cada cara, pero no la lista de materiales, que es de la malla.
        for m in ob.data.materials:
            malla.materials.append(m)
        nuevo = bpy.data.objects.new(f'{ob.name}-{"arriba" if arriba else "abajo"}', malla)
        bpy.context.scene.collection.objects.link(nuevo)
        partes.append(nuevo)
    bpy.data.objects.remove(ob, do_unlink=True)
    return partes


def plano_de_sombra(medio, z=0.002):
    """El plano del suelo que lleva la sombra, en ejes de Blender, con su UV de esquina a esquina."""
    v = [[-medio, -medio, z], [medio, -medio, z], [medio, medio, z], [-medio, medio, z]]
    malla = bpy.data.meshes.new('sombra')
    malla.from_pydata(v, [], [[0, 1, 2, 3]])
    malla.update()
    capa = malla.uv_layers.new(name='UVMap')
    uv = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=np.float32)
    orden = np.empty(len(malla.loops), dtype=np.int64)
    malla.loops.foreach_get('vertex_index', orden)
    capa.data.foreach_set('uv', uv[orden].ravel())
    ob = bpy.data.objects.new('sombra--web', malla)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def difuminar(imagen_2d, radio):
    """Desenfoque de caja, tres pasadas (casi gaussiano), con el borde repetido."""
    salida = imagen_2d.astype(np.float64)
    r = max(1, int(round(radio)))
    for eje in (0, 1):
        for _ in range(3):
            relleno = np.pad(salida, [(r + 1, r) if e == eje else (0, 0) for e in range(2)], mode='edge')
            suma = np.cumsum(relleno, axis=eje)
            if eje == 0:
                salida = (suma[2 * r + 1:] - suma[:-2 * r - 1]) / (2 * r + 1)
            else:
                salida = (suma[:, 2 * r + 1:] - suma[:, :-2 * r - 1]) / (2 * r + 1)
    return salida


def hornear_la_sombra(sombra, lado, muestras, distancia=0.35, fuerza=0.85, contraste=1.35, desenfoque=2.0):
    """
    La sombra de contacto: la oclusión del suelo, vuelta alfa y apagada hacia los bordes del plano (una sombra cortada
    en recto delata el truco en cuanto la cámara baja). En el procesador y con semilla fija: no necesita el turno de la
    gráfica, que comparten otros trabajos de esta máquina, y dos corridas dan la misma.
    """
    escena = bpy.context.scene
    escena.render.engine = 'CYCLES'
    escena.cycles.device = 'CPU'
    escena.cycles.samples = muestras
    escena.cycles.use_denoising = False
    escena.cycles.seed = 0
    if escena.world is None:
        escena.world = bpy.data.worlds.new('mundo')
    escena.world.light_settings.distance = distancia
    img = bpy.data.images.new('oclusion-del-suelo', lado, lado, float_buffer=True)
    temporal = bpy.data.materials.new('horneado')
    if hasattr(temporal, 'use_nodes') and not temporal.use_nodes:
        temporal.use_nodes = True
    tex = temporal.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    temporal.node_tree.nodes.active = tex
    sombra.data.materials.append(temporal)
    deseleccionar_todo()
    sombra.select_set(True)
    bpy.context.view_layer.objects.active = sombra
    inicio = time.time()
    bpy.ops.object.bake(type='AO', margin=12, use_clear=True)
    print(f'  sombra horneada: {lado}×{lado}, {muestras} muestras, {time.time() - inicio:.1f} s', flush=True)
    pixeles = np.empty(lado * lado * 4, dtype=np.float32)
    img.pixels.foreach_get(pixeles)
    oclusion = pixeles.reshape(lado, lado, 4)[..., 0].astype(np.float64)
    sombra.data.materials.clear()
    bpy.data.images.remove(img)
    bpy.data.materials.remove(temporal)

    alfa = np.clip(1.0 - oclusion, 0.0, 1.0)
    alfa = np.clip(alfa * contraste, 0.0, 1.0) ** 1.1
    alfa = difuminar(alfa, desenfoque)
    filas, columnas = np.mgrid[0:lado, 0:lado]
    u, v = (columnas + 0.5) / lado, (filas + 0.5) / lado
    borde = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
    apagado = np.clip(borde / 0.12, 0.0, 1.0)
    alfa *= fuerza * apagado * apagado * (3 - 2 * apagado)
    rgba = np.zeros((lado, lado, 4), dtype=np.float32)
    rgba[..., 3] = alfa
    final = bpy.data.images.new('arsenalera-persona-sombra', lado, lado, alpha=True)
    final.pixels.foreach_set(rgba.ravel())
    final.pack()

    # Sin luz y con la sombra en el alfa: el exportador lo reconoce como KHR_materials_unlit por esta forma exacta del
    # árbol —un emisor con el truco del rayo de cámara, mezclado con un transparente—, la misma de `mobiliario.py`.
    m = bpy.data.materials.new('sombra')
    if hasattr(m, 'use_nodes') and not m.use_nodes:
        m.use_nodes = True
    arbol = m.node_tree
    arbol.nodes.clear()
    salida = arbol.nodes.new('ShaderNodeOutputMaterial')
    tex = arbol.nodes.new('ShaderNodeTexImage')
    tex.image = final
    emisor = arbol.nodes.new('ShaderNodeEmission')
    arbol.links.new(tex.outputs['Color'], emisor.inputs['Color'])
    camino = arbol.nodes.new('ShaderNodeLightPath')
    truco = arbol.nodes.new('ShaderNodeMixShader')
    arbol.links.new(camino.outputs['Is Camera Ray'], truco.inputs['Fac'])
    arbol.links.new(emisor.outputs['Emission'], truco.inputs[2])
    arbol.links.new(emisor.outputs['Emission'], truco.inputs[1])
    transparente = arbol.nodes.new('ShaderNodeBsdfTransparent')
    mezcla = arbol.nodes.new('ShaderNodeMixShader')
    arbol.links.new(tex.outputs['Alpha'], mezcla.inputs['Fac'])
    arbol.links.new(transparente.outputs['BSDF'], mezcla.inputs[1])
    arbol.links.new(truco.outputs['Shader'], mezcla.inputs[2])
    arbol.links.new(mezcla.outputs['Shader'], salida.inputs['Surface'])
    m.surface_render_method = 'BLENDED'
    m.use_backface_culling = True
    sombra.data.materials.append(m)


def altura_de_las_patas():
    """
    Hasta dónde suben las patas de la mesa con sus ruedas, más 2,5 cm de holgura: lo de ella que baje hasta ahí tiene
    que caber en la huella de sus pies. Se lee de `mobiliario.py` (el eje del tubo, más su medio alto de 12 mm).

    No se mide con la caja del nodo `base` del `.glb`, que llega a 63 cm porque trae el tramo fijo del poste: con ella
    esta comprobación paraba por 7 mm de bata a media pierna, donde no hay pata que pisar. El poste no le toca la falda
    en ningún sitio (tras el poste queda a 31,6 cm de su eje; ver `detrasDelPoste`), y lo de delante se mide contra la
    funda en `comprobar_el_glb`.
    """
    texto = MOBILIARIO.read_text(encoding='utf-8')
    m = re.search(r'^ALTO_DE_LAS_PATAS\s*=\s*([0-9.]+)', texto, re.MULTILINE)
    if not m:
        raise SystemExit(f'No encuentro ALTO_DE_LAS_PATAS en {MOBILIARIO}.')
    return float(m.group(1)) + 0.012 + 0.025


def comprobar_lo_de_abajo(piezas, altura, radio):
    """Lo de bata, pantalón y cubrecalzado que baja hasta la altura de las patas, dentro de la huella de los pies."""
    for nombre in ('bata', 'pantalon', 'zapatos'):
        ob = piezas[nombre]
        co = np.empty(len(ob.data.vertices) * 3)
        ob.data.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        abajo = co[co[:, 2] <= altura]
        if not len(abajo):
            continue
        # Como la prueba: el mayor de los cuatro lados, no el radio. Es lo que suponen los sitios de la mesa.
        lado = float(max(-abajo[:, 0].min(), abajo[:, 0].max(), -abajo[:, 1].min(), abajo[:, 1].max()))
        print(f'  {nombre} bajo {altura:.2f} m: {lado:.3f} m del eje (huella de los pies: {radio:.3f})', flush=True)
        if lado > radio:
            raise SystemExit(f'Lo de abajo de «{nombre}» sale {lado:.3f} m del eje: la base de la mesa lo pisaría.')


def comprobar_el_glb(ruta, medidas):
    doc = leer_glb(ruta)
    c = cajas(doc)
    faltan = [n for n in ('arsenalera-persona', 'bata', 'pantalon', 'guantes', 'zapatos', 'cabeza', 'cara', 'gorro',
                          'mascarilla', 'gafas', 'sombra') if n not in c]
    if faltan:
        raise SystemExit(f'Faltan nodos en el .glb: {faltan}')
    errores = []
    if abs(c['zapatos'][0][1]) > 0.005:
        errores.append(f"los pies no tocan el suelo: {c['zapatos'][0][1]:.3f}")
    if not 1.65 < c['gorro'][1][1] < 1.82:
        errores.append(f"la cofia llega a {c['gorro'][1][1]:.3f} m")
    if not (c['cara'][0][2] > 0 and c['cara'][1][2] > c['cabeza'][1][2] - 0.05):
        errores.append('la cara no queda por delante de la cabeza: ¿mira a +Z?')
    funda = medidas['delEjeDeLaBandejaALaPersona'] - FUNDA_DESDE_EL_EJE
    sobre = medidas['alturaDeLaBandeja'] + SOBRE_LA_BANDEJA
    alcance = medidas['alcanceDeLasManos']
    # Malla por malla y no por grupos: el grupo `bata` junta la falda con las mangas que pasan sobre la bandeja. Lo que
    # baja de la bandeja no puede llegar a la funda que cuelga de ella; lo que pasa por encima, sí, hasta donde llegan
    # las manos, que es lo que suponen los sitios de `colocarALaArsenalera`.
    mallas = [n['name'] for n in doc['nodes'] if 'mesh' in n and n.get('name') not in (None, 'sombra')]
    for nombre in mallas:
        lo, hi = c[nombre]
        print(f'    {nombre}: de {lo[1]:.3f} a {hi[1]:.3f} m de alto, hasta {hi[2]:.3f} m por delante', flush=True)
        if lo[1] < sobre and hi[2] > funda - 0.02:
            errores.append(f'«{nombre}» baja a {lo[1]:.3f} m, más que la bandeja, y llega a {hi[2]:.3f} m por delante, '
                           f'contra la funda a {funda:.3f}')
        if hi[2] > alcance + 0.01:
            errores.append(f'«{nombre}» llega a {hi[2]:.3f} m por delante, más de lo que alcanzan sus manos ({alcance:.2f})')
    # La falda: lo de la bata que baja de la bandeja, que es lo que queda a la altura del colchón.
    falda = [c[n] for n in hijos(doc, 'bata') if n in c and c[n][0][1] < sobre]
    if not falda:
        errores.append('nada de la bata baja de la bandeja: ¿está bien puesta la figura?')
    else:
        lo, hi = np.min([b[0] for b in falda], axis=0), np.max([b[1] for b in falda], axis=0)
        radio = float(max(-lo[0], hi[0], -lo[2], hi[2]))
        print(f'  la falda llega a {radio:.3f} m de su eje (su radio: {medidas["radioDeLaPersona"]:.3f})', flush=True)
        if radio > medidas['radioDeLaPersona']:
            errores.append(f'la falda de la bata sale de su radio: {radio:.3f} m')
    peso = Path(ruta).stat().st_size
    if peso >= TOPE_DEL_PESO:
        errores.append(f'pesa {peso / 1024:.0f} KB, más que el tope de {TOPE_DEL_PESO / 1024:.0f}')
    if 'KHR_materials_transmission' in doc.get('extensionsUsed', []):
        errores.append('lleva KHR_materials_transmission')
    imagenes = sum(doc['bufferViews'][i['bufferView']]['byteLength'] for i in doc.get('images', []))
    print(f'  {peso / 1024:.0f} KB: {imagenes / 1024:.0f} KB de imágenes y {(peso - imagenes) / 1024:.0f} KB de lo demás',
          flush=True)
    print(f"  cofia a {c['gorro'][1][1]:.3f} m; la funda a {funda:.3f} m de su eje y la bandeja a "
          f"{medidas['alturaDeLaBandeja']:.2f} m del suelo", flush=True)
    print(f"  extensiones: {doc.get('extensionsUsed', [])}; obligatorias: {doc.get('extensionsRequired', [])}", flush=True)
    for m in doc.get('materials', []):
        print(f"    material {m.get('name')}: {m.get('alphaMode', 'OPAQUE')}{' dos caras' if m.get('doubleSided') else ''}",
              flush=True)
    if errores:
        raise SystemExit('No pasa: ' + '; '.join(errores))


def main():
    o = opciones()
    fuente = Path(o.fuente)
    destino = Path(o.destino)
    medidas = medidas_del_simulador()
    base = altura_de_las_patas()
    print(f'Fuente: {fuente} ({fuente.stat().st_size / 1e6:.1f} MB, guardada {time.ctime(fuente.stat().st_mtime)})', flush=True)
    temporal = abrir_una_copia(fuente)
    try:
        objetos = bpy.data.objects
        for nombre in ('arsenalera', 'cabeza-puesta', 'cara', 'cofia', 'cofia-ribete', 'mascarilla-puesta', 'lentes-puestos'):
            if nombre not in objetos:
                raise SystemExit(f'La fuente no trae «{nombre}»: ¿cambió el archivo? Ver la cabecera de este guion.')
        figura = objetos['arsenalera']
        mat_figura = {s.material.name: s.material for s in figura.material_slots if s.material}
        albedo = next(n.image for n in mat_figura['bata'].node_tree.nodes
                      if n.bl_idname == 'ShaderNodeTexImage' and n.image and n.image.name == 'albedo.png')
        normales = next((n.image for n in mat_figura['bata'].node_tree.nodes
                         if n.bl_idname == 'ShaderNodeTexImage' and n.image and n.image.name == 'normal-tangente.png'), None)
        colores = {n: color_de(objetos[o_].active_material) for n, o_ in (
            ('cabeza', 'cabeza-puesta'), ('gorro', 'cofia'), ('ribete', 'cofia-ribete'))}
        mascarilla_mats = [s.material for s in objetos['mascarilla-puesta'].material_slots]
        vidrio = objetos['lentes-puestos'].active_material
        foto = next(n.image for n in objetos['cara'].active_material.node_tree.nodes
                    if n.bl_idname == 'ShaderNodeTexImage' and n.image)

        print('Piezas:', flush=True)
        piezas, uv = partir_la_figura(figura)
        print(f'  la figura lee su atlas por el UV «{uv}»', flush=True)
        # La cara antes que el óvalo: su Shrinkwrap mira al óvalo subdividido, y así queda pegada a lo que viaja.
        piezas['cara'] = malla_vista(objetos['cara'])
        piezas['cabeza'] = malla_vista(objetos['cabeza-puesta'])
        piezas['gorro'] = malla_vista(objetos['cofia'], quitar=('SUBSURF', 'SOLIDIFY'))
        piezas['ribete'] = malla_vista(objetos['cofia-ribete'])
        piezas['mascarilla'] = malla_vista(objetos['mascarilla-puesta'])
        piezas['gafas'] = malla_vista(objetos['lentes-puestos'], quitar=('SOLIDIFY',))
        antes = triangulos(piezas['gorro'])
        simplificar(piezas['gorro'], o.cofia)
        print(f"  cofia: {antes} → {triangulos(piezas['gorro'])} triángulos", flush=True)
        for ob in list(objetos):
            if not ob.name.endswith('--web'):
                objetos.remove(ob, do_unlink=True)
        bpy.context.view_layer.update()

        comprobar_lo_de_abajo(piezas, base, medidas['radioDeLosPies'])

        print('Sombra:', flush=True)
        sombra = plano_de_sombra(0.5)
        hornear_la_sombra(sombra, 256, o.muestras)

        print('Materiales:', flush=True)
        color = reducida(albedo, 'arsenalera-color', o.lado_color)
        relieve = reducida(normales, 'arsenalera-normales', o.lado_relieve, datos=True) if normales and o.lado_relieve else None
        for nombre in ('bata', 'pantalon', 'guantes', 'zapatos'):
            rug = rugosidad_de(mat_figura.get({'zapatos': 'cubrecalzado'}.get(nombre, nombre)), RUGOSIDAD[nombre])
            poner_material(piezas[nombre], material_web(nombre, (1, 1, 1, 1), rug, imagen=color, relieve=relieve))
        poner_material(piezas['cabeza'], material_web('piel', colores['cabeza'], rugosidad_de(None, 0.5)))
        poner_material(piezas['cara'], material_web('cara', (1, 1, 1, 1), 0.5, imagen=foto, alfa_de_la_imagen=True,
                                                    dos_caras=False))
        poner_material(piezas['gorro'], material_web('cofia', colores['gorro'], 0.9))
        poner_material(piezas['ribete'], material_web('ribete', colores['ribete'], 0.9))
        # La mascarilla trae dos materiales (la tela y los elásticos): se cambian en su sitio, sin juntarlos.
        mascarilla = piezas['mascarilla'].data
        nuevos = [material_web('mascarilla' if i == 0 else 'elastico', color_de(m), 0.85) for i, m in enumerate(mascarilla_mats)]
        mascarilla.materials.clear()
        for m in nuevos:
            mascarilla.materials.append(m)
        ambar = color_de(vidrio, (0.9, 0.6, 0.2, 1.0))
        poner_material(piezas['gafas'], material_web('lentes', (ambar[0], ambar[1], ambar[2], 1.0), 0.05, alfa=0.3))
        # Las cuatro piezas de la figura, partidas a la altura de la bandeja; después del material, para que las partes
        # lo lleven sin repetir nada. No solo la bata: Tripo dejó una cara de guante en la cadera, donde la mano tocaba el
        # muslo, y con ella en la misma malla que las manos la caja de los guantes bajaba de la bandeja.
        for pieza in ('bata', 'pantalon', 'guantes', 'zapatos'):
            arriba, abajo = partir_por_la_altura(piezas.pop(pieza), medidas['alturaDeLaBandeja'] + SOBRE_LA_BANDEJA)
            if arriba is not None and abajo is not None:
                piezas[f'{pieza}-arriba'], piezas[f'{pieza}-abajo'] = arriba, abajo
            else:
                piezas[pieza] = arriba or abajo

        print('Árbol:', flush=True)
        raiz = bpy.data.objects.new('arsenalera-persona', None)
        bpy.context.scene.collection.objects.link(raiz)
        # Una pieza que no se partió conserva el nombre de siempre; la partida va en `.arriba` y `.abajo`.
        nombres = {}
        for pieza, tela in (('bata', 'tela'), ('pantalon', 'tela'), ('guantes', 'nitrilo'), ('zapatos', 'cubrecalzado')):
            nombres[pieza] = (pieza, f'{pieza}.{tela}')
            nombres[f'{pieza}-arriba'] = (pieza, f'{pieza}.arriba')
            nombres[f'{pieza}-abajo'] = (pieza, f'{pieza}.abajo')
        nombres |= {
            'cabeza': ('cabeza', 'cabeza.piel'), 'cara': ('cara', 'cara.foto'), 'gorro': ('gorro', 'gorro.tela'),
            'ribete': ('gorro', 'gorro.ribete'), 'mascarilla': ('mascarilla', 'mascarilla.tela'),
            'gafas': ('gafas', 'gafas.lentes'),
        }
        grupos = {}
        for clave, (grupo, nombre) in nombres.items():
            if clave not in piezas:
                continue
            if grupo not in grupos:
                g = bpy.data.objects.new(grupo, None)
                bpy.context.scene.collection.objects.link(g)
                g.parent = raiz
                grupos[grupo] = g
            ob = piezas[clave]
            ob.name = nombre
            ob.parent = grupos[grupo]
            print(f'  {nombre}: {triangulos(ob)} triángulos', flush=True)
        sombra.name = 'sombra'
        sombra.parent = raiz

        destino.mkdir(parents=True, exist_ok=True)
        ruta = destino / ARCHIVO
        deseleccionar_todo()
        pila = [raiz]
        while pila:
            ob = pila.pop()
            ob.select_set(True)
            pila.extend(ob.children)
        bpy.context.view_layer.objects.active = raiz
        provisional = destino / (ARCHIVO + '.provisional')
        bpy.ops.export_scene.gltf(
            filepath=str(provisional), export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
            export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
            export_extras=False, export_cameras=False, export_lights=False, export_animations=False,
            export_vertex_color='NONE', export_attributes=False,
            export_image_format='WEBP', export_image_quality=o.calidad,
            export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
            export_draco_position_quantization=14, export_draco_normal_quantization=10,
            export_draco_texcoord_quantization=12, export_draco_generic_quantization=12,
        )
        # El exportador escribe a su nombre con la extensión que quiera: se busca lo que dejó y se comprueba antes de
        # ponerlo en su sitio. Un .glb que no pasa no reemplaza al que hay.
        escrito = next(destino.glob(ARCHIVO + '.provisional*'))
        print('Comprobación:', flush=True)
        comprobar_el_glb(escrito, medidas)
        escrito.replace(ruta)
        print(f'LISTO {ruta}: {ruta.stat().st_size / 1024:.0f} KB', flush=True)
    finally:
        shutil.rmtree(temporal, ignore_errors=True)


try:
    main()
except SystemExit as e:
    print(f'ERROR: {e}', flush=True)
    sys.exit(1)

"""
Los muebles del pabellón: la mesa de la arsenalera —una mesa de Mayo con su funda, la compresa y el instrumental
ordenado encima— y la mesa quirúrgica que va debajo del colchón.

    blender --background --factory-startup --python scripts/pabellon/mobiliario.py -- [opciones]

    --pieza arsenalera | quirurgica | todo     cuál se fabrica (por omisión, todo)
    --vistas                                   además, las fotos de comprobación, en `salida/vistas/`
    --muestras 128                             las muestras de Cycles de esas fotos
    --destino <carpeta>                        para probar sin pisar lo que viaja (por omisión, `public/pabellon/`)

Sale `mesa-arsenalera.glb` y `mesa-quirurgica.glb`. Son decorado: el simulador los pone alrededor del campo y solo
les toca dos cosas, que por eso tienen nombre fijo. Sube el nodo `elevable` de la arsenalera para regular su
altura, y le cambia el color a la malla `funda` por el del paño de cada caso.

## Los ejes

Se modela en los de Blender (Z arriba) y el exportador los pasa a los de glTF (Y arriba): un punto (x, y, z) de
este guion sale en (x, z, −y). Las medidas que el simulador da por sabidas —la bandeja a 0,98, el suelo de la
camilla a −0,95, la columna en z = −0,45— están escritas aquí con su equivalente glTF al lado, y `medir` las
vuelve a leer del `.glb` exportado: es la única comprobación que no depende de haber hecho bien esta cuenta.

## Por qué casi todo se barre

La bandeja, la riñonera, las patas, la columna y hasta la horquilla de una rueda son un perfil con las esquinas
redondeadas barrido a lo largo de un contorno que también las tiene redondeadas (`barrer`). Así el bisel sale de
construcción y con su radio de verdad: el del canto de una chapa, el de la goma de un parachoques. Un
modificador Bevel sobre una caja da lo mismo en las caras planas, pero en cada esquina donde se cruzan tres
aristas deja un nudo de triángulos que refleja mal la luz, y en acero pulido es justo lo que se ve. Después, las
normales se ponderan por área (`acabar`): sin eso, la tapa plana de una pieza se sombrea curva hasta el centro.

## Lo que se hornea, y dónde

La funda no lleva textura de color, porque el simulador se la cambia en cada caso: su oclusión va en un mapa
gris aparte (el `occlusionTexture` de glTF). La compresa y las gasas sí son de un solo color, así que su
oclusión —la sombra de contacto de cada instrumento sobre la tela— se multiplica directamente en su textura de
color: three solo aplica el `aoMap` a la luz ambiente, y con la luz directa del simulador esa sombra se perdía.
Y el suelo lleva un plano `sombra`, sin luz y con la sombra en el alfa, que es lo que hace que un mueble no
flote: sin él, un objeto que toca el suelo y uno que flota un centímetro se ven igual.

Todo es determinista: la tela parte de una forma fija y los ruidos de una semilla fija. Dos corridas en esta
máquina dan los mismos `.glb`.
"""

import argparse
import json
import math
import struct
import sys
import time
from math import cos, pi, radians, sin
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
PUBLICO = RAIZ / 'public' / 'pabellon'
SALIDA = AQUI / 'salida'
INSTRUMENTAL = RAIZ / 'ejemplos' / 'instrumental'

# Las primitivas de barrido y los acabados del instrumental: el acero de la bandeja tiene que ser el mismo
# acero que el de las tijeras que lleva encima, o la mesa y lo de encima parecen de dos fotos distintas.
sys.path.insert(0, str(RAIZ / 'scripts' / 'instrumental'))
import lib as L  # noqa: E402

SEMILLA = 20261116


def argumentos():
    resto = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser(prog='mobiliario.py')
    p.add_argument('--pieza', default='todo', choices=('arsenalera', 'quirurgica', 'todo'))
    p.add_argument('--vistas', action='store_true')
    p.add_argument('--muestras', type=int, default=128)
    p.add_argument('--destino', default=str(PUBLICO))
    p.add_argument('--cuadros', type=int, default=70, help='cuántos cuadros se deja caer la funda')
    return p.parse_args(resto)


# ============================================================================================ materiales

# (color sRGB, metálico, rugosidad). Los del instrumental, tal cual, y los propios de los muebles.
ACABADOS = {clave: valor[:3] for clave, valor in L.MATERIALES.items()}
ACABADOS.update({
    'pintura': ('#D3D6D9', 0.0, 0.40),
    'tablero': ('#3A3D42', 0.0, 0.55),
    'goma': ('#18191B', 0.0, 0.80),
    'plastico_gris': ('#868C93', 0.0, 0.50),
    'plastico_negro': ('#1D1E21', 0.0, 0.40),
})

# El azul del paño del simulador. La funda sale de este color, pero lo que cuenta es que no lleve textura de
# color: el simulador se lo cambia al del paño de cada caso.
AZUL_DEL_PANO = '#1e519c'
VERDE_DE_LA_COMPRESA = (0.66, 0.80, 0.72)

_materiales = {}


def vaciar():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _materiales.clear()


def nodos(material):
    """El árbol de un material con su Principled y su salida, se cree como se cree en esta versión de Blender."""
    if hasattr(material, 'use_nodes') and not material.use_nodes:
        material.use_nodes = True
    arbol = material.node_tree
    principal = next((n for n in arbol.nodes if n.type == 'BSDF_PRINCIPLED'), None) or arbol.nodes.new('ShaderNodeBsdfPrincipled')
    salida = next((n for n in arbol.nodes if n.type == 'OUTPUT_MATERIAL'), None) or arbol.nodes.new('ShaderNodeOutputMaterial')
    if not salida.inputs['Surface'].is_linked:
        arbol.links.new(principal.outputs['BSDF'], salida.inputs['Surface'])
    return arbol, principal, salida


def material(clave):
    if isinstance(clave, bpy.types.Material):
        return clave
    if clave in _materiales:
        return _materiales[clave]
    color, metal, rugosidad = ACABADOS[clave]
    m = bpy.data.materials.new(clave)
    _, p, _ = nodos(m)
    p.inputs['Base Color'].default_value = (*L._lineal(L._hex(color)), 1.0)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rugosidad
    # Sin barniz: con él el exportador pide KHR_materials_clearcoat y three pasa a su material físico, que en
    # un portátil modesto cuesta el doble por píxel para un brillo que en un mueble no se distingue.
    if 'Coat Weight' in p.inputs:
        p.inputs['Coat Weight'].default_value = 0.0
    m.use_backface_culling = True
    _materiales[clave] = m
    return m


def imagen(nombre, pixeles, sin_color=False):
    """Una imagen de Blender a partir de una matriz (alto, ancho, 3 o 4) en 0…1, con la fila 0 abajo."""
    alto, ancho, canales = pixeles.shape
    img = bpy.data.images.new(nombre, ancho, alto, alpha=canales == 4)
    if sin_color:
        img.colorspace_settings.name = 'Non-Color'
    rgba = np.ones((alto, ancho, 4), dtype=np.float32)
    rgba[..., :canales] = pixeles
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def nodo_de_imagen(arbol, img, uv=None):
    tex = arbol.nodes.new('ShaderNodeTexImage')
    tex.image = img
    if uv:
        mapa = arbol.nodes.new('ShaderNodeUVMap')
        mapa.uv_map = uv
        arbol.links.new(mapa.outputs['UV'], tex.inputs['Vector'])
    return tex


def poner_normal(arbol, principal, img, uv=None, fuerza=1.0):
    tex = nodo_de_imagen(arbol, img, uv)
    mapa = arbol.nodes.new('ShaderNodeNormalMap')
    mapa.inputs['Strength'].default_value = fuerza
    if uv:
        mapa.uv_map = uv
    arbol.links.new(tex.outputs['Color'], mapa.inputs['Color'])
    arbol.links.new(mapa.outputs['Normal'], principal.inputs['Normal'])


def poner_oclusion(arbol, img, uv=None):
    """
    La oclusión, por el único camino que el exportador de glTF reconoce: el grupo «glTF Material Output» con
    su entrada «Occlusion», leída del canal rojo.
    """
    grupo = bpy.data.node_groups.get('glTF Material Output')
    if grupo is None:
        grupo = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        grupo.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        grupo.nodes.new('NodeGroupOutput')
        grupo.nodes.new('NodeGroupInput')
    nodo = arbol.nodes.new('ShaderNodeGroup')
    nodo.node_tree = grupo
    tex = nodo_de_imagen(arbol, img, uv)
    partes = arbol.nodes.new('ShaderNodeSeparateColor')
    arbol.links.new(tex.outputs['Color'], partes.inputs['Color'])
    arbol.links.new(partes.outputs['Red'], nodo.inputs['Occlusion'])


# ============================================================================================ geometría


def redondear(puntos, por_arco=5):
    """
    Una polilínea (x, y, radio) con cada esquina cambiada por un arco de ese radio. El primero y el último no
    se redondean. Si el radio no cabe entre los dos tramos, se encoge hasta la mitad del más corto.
    """
    salida = []
    for i, (x, y, r) in enumerate(puntos):
        if r <= 0 or i == 0 or i == len(puntos) - 1:
            salida.append((x, y))
            continue
        p = np.array([x, y], dtype=float)
        a = np.array(puntos[i - 1][:2], dtype=float)
        b = np.array(puntos[i + 1][:2], dtype=float)
        la, lb = np.linalg.norm(a - p), np.linalg.norm(b - p)
        u1, u2 = (a - p) / la, (b - p) / lb
        angulo = math.acos(float(np.clip(u1 @ u2, -1.0, 1.0)))
        if angulo > math.pi - 1e-4:
            salida.append((x, y))
            continue
        t = r / math.tan(angulo / 2)
        # Un tramo que llega a un extremo sin redondear se puede gastar entero; uno entre dos esquinas, solo
        # la mitad, que la otra mitad es de la esquina de enfrente.
        t = min(t, la if i == 1 else 0.5 * la, lb if i == len(puntos) - 2 else 0.5 * lb)
        r = t * math.tan(angulo / 2)
        bisectriz = (u1 + u2) / np.linalg.norm(u1 + u2)
        centro = p + bisectriz * (r / math.sin(angulo / 2))
        t1, t2 = p + u1 * t, p + u2 * t
        a1 = math.atan2(*(t1 - centro)[::-1])
        a2 = math.atan2(*(t2 - centro)[::-1])
        giro = (a2 - a1 + math.pi) % (2 * math.pi) - math.pi
        for k in range(por_arco + 1):
            ang = a1 + giro * k / por_arco
            salida.append((centro[0] + r * math.cos(ang), centro[1] + r * math.sin(ang)))
    return salida


def arco(centro, radio, desde, hasta, pasos):
    """Puntos de un arco en el plano del perfil, de `desde` a `hasta` grados, ambos incluidos."""
    return [(centro[0] + radio * cos(radians(desde + (hasta - desde) * k / pasos)),
             centro[1] + radio * sin(radians(desde + (hasta - desde) * k / pasos))) for k in range(pasos + 1)]


def rectangulo(a, b, r, por_esquina=8):
    """Un rectángulo de esquinas redondeadas, en sentido antihorario: sus puntos y la normal hacia fuera de cada uno."""
    puntos, normales = [], []
    for cx, cy, desde in ((a - r, b - r, 0), (-(a - r), b - r, 90), (-(a - r), -(b - r), 180), (a - r, -(b - r), 270)):
        for k in range(por_esquina + 1):
            ang = radians(desde + 90.0 * k / por_esquina)
            puntos.append((cx + r * cos(ang), cy + r * sin(ang)))
            normales.append((cos(ang), sin(ang)))
    return np.array(puntos), np.array(normales)


def circulo(n=32):
    """Un contorno de radio cero: barrido con un perfil (radio, altura), da una pieza de revolución."""
    ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
    return np.zeros((n, 2)), np.stack([np.cos(ang), np.sin(ang)], axis=-1)


def cerrado(poligono, por_arco=4):
    """
    Un polígono cerrado (x, y, radio), en sentido antihorario, con las esquinas redondeadas; y la normal de cada
    punto, alargada en las esquinas para que el desplazamiento deje los lados paralelos.
    """
    n = len(poligono)
    puntos = []
    for i in range(n):
        tramo = [poligono[(i - 1) % n], poligono[i], poligono[(i + 1) % n]]
        puntos.extend(redondear(tramo, por_arco)[1:-1])
    puntos = np.array(puntos)
    return puntos, normales_de(puntos)


def normales_de(puntos):
    lado = np.roll(puntos, -1, axis=0) - puntos
    lado /= np.linalg.norm(lado, axis=1, keepdims=True)
    hacia_fuera = np.stack([lado[:, 1], -lado[:, 0]], axis=-1)
    media = hacia_fuera + np.roll(hacia_fuera, 1, axis=0)
    media /= np.linalg.norm(media, axis=1, keepdims=True)
    coseno = np.clip(np.sum(media * hacia_fuera, axis=1), 0.5, 1.0)
    return media / coseno[:, None]


def barrer(contorno, normales, perfil, materiales=None, abajo=True, arriba=True):
    """
    Barre un perfil (d, h) alrededor de un contorno: cada punto del perfil es un anillo del contorno desplazado
    `d` hacia fuera y subido `h`.

    El perfil se recorre de abajo-dentro a arriba-dentro pasando por fuera —el fondo hacia fuera, la pared
    hacia arriba, la tapa hacia dentro—, y con el contorno en sentido antihorario eso deja todas las caras
    mirando hacia fuera sin recalcular nada. Las tapas son un solo polígono por anillo: en una cara plana no
    hace falta más, y es el exportador el que lo triangula.

    `materiales`, si se da, es el índice de material de cada tramo del perfil.
    """
    p = np.asarray(contorno, dtype=float)
    nrm = np.asarray(normales, dtype=float)
    d = np.array([q[0] for q in perfil])
    h = np.array([q[1] for q in perfil])
    n, m = len(p), len(perfil)
    v = np.empty((m, n, 3))
    v[:, :, 0:2] = p[None] + nrm[None] * d[:, None, None]
    v[:, :, 2] = h[:, None]
    indice = np.arange(m * n).reshape(m, n)
    caras, mats = [], []
    for j in range(m - 1):
        for k in range(n):
            k2 = (k + 1) % n
            caras.append([indice[j, k], indice[j, k2], indice[j + 1, k2], indice[j + 1, k]])
            mats.append(materiales[j] if materiales else 0)
    if abajo:
        caras.append(indice[0, ::-1].tolist())
        mats.append(materiales[0] if materiales else 0)
    if arriba:
        caras.append(indice[-1, :].tolist())
        mats.append(materiales[-1] if materiales else 0)
    return v.reshape(-1, 3), caras, mats


def caja(centro, medio, r, por_arco=3, por_esquina=4):
    """Una caja con todas las aristas redondeadas a radio `r`: un rectángulo redondeado barrido con un perfil redondeado."""
    contorno, normales = rectangulo(medio[0], medio[1], r, por_esquina)
    perfil = redondear([(-r, 0, 0), (0, 0, r), (0, 2 * medio[2], r), (-r, 2 * medio[2], 0)], por_arco)
    v, f, m = barrer(contorno, normales, perfil)
    return v + np.array([centro[0], centro[1], centro[2] - medio[2]]), f, m


def revolucion(perfil, n=32):
    contorno, normales = circulo(n)
    return barrer(contorno, normales, perfil, abajo=perfil[0][0] > 1e-6, arriba=perfil[-1][0] > 1e-6)


def mover(v, matriz):
    m = np.array(matriz)
    return v @ m[:3, :3].T + m[:3, 3]


def objeto(nombre, v, caras, acabados, indices=None, uvs=None, angulo=40.0, ponderar=True):
    """
    Un objeto de malla a partir de matrices, con sus materiales, sombreado suave y normales ponderadas.

    `acabados` es la lista de materiales (claves de `ACABADOS` o materiales hechos); `indices`, el de cada cara.
    `uvs` es un diccionario nombre → UV por vértice.
    """
    malla = bpy.data.meshes.new(nombre)
    malla.from_pydata(np.asarray(v, dtype=float).tolist(), [], [list(map(int, c)) for c in caras])
    malla.update()
    for nombre_uv, uv in (uvs or {}).items():
        capa = malla.uv_layers.new(name=nombre_uv)
        orden = np.empty(len(malla.loops), dtype=np.int64)
        malla.loops.foreach_get('vertex_index', orden)
        capa.data.foreach_set('uv', np.asarray(uv, dtype=np.float32)[orden].ravel())
    for a in (acabados if isinstance(acabados, (list, tuple)) else [acabados]):
        malla.materials.append(material(a))
    if indices is not None:
        malla.polygons.foreach_set('material_index', np.asarray(indices, dtype=np.int32))
    ob = bpy.data.objects.new(nombre, malla)
    bpy.context.scene.collection.objects.link(ob)
    # Los vértices repetidos —los polos de una pieza de revolución, las esquinas de un rectángulo encogido
    # hasta su radio— se funden antes de suavizar, o cada uno se sombrea con su propia normal.
    bm = bmesh.new()
    bm.from_mesh(malla)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=1e-7)
    bm.to_mesh(malla)
    bm.free()
    acabar(ob, angulo, ponderar)
    return ob


def objeto_de_bmesh(nombre, bm, acabado, angulo=40.0):
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    malla = bpy.data.meshes.new(nombre)
    bm.to_mesh(malla)
    bm.free()
    malla.materials.append(material(acabado))
    ob = bpy.data.objects.new(nombre, malla)
    bpy.context.scene.collection.objects.link(ob)
    acabar(ob, angulo)
    return ob


def acabar(ob, angulo=40.0, ponderar=True):
    """Suave salvo en las aristas de más de `angulo` grados, y con las normales ponderadas por el área de cada cara."""
    malla = ob.data
    malla.shade_smooth()
    if hasattr(malla, 'set_sharp_from_angle'):
        malla.set_sharp_from_angle(angle=radians(angulo))
    if ponderar:
        mod = ob.modifiers.new('normales', 'WEIGHTED_NORMAL')
        mod.mode = 'FACE_AREA'
        mod.weight = 50
        mod.keep_sharp = True
        aplicar(ob, mod.name)


def aplicar(ob, nombre_del_modificador):
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=nombre_del_modificador)


def unir(objetos, nombre):
    objetos = [o for o in objetos if o is not None]
    activo = objetos[0]
    if len(objetos) > 1:
        with bpy.context.temp_override(object=activo, active_object=activo, selected_objects=objetos,
                                       selected_editable_objects=objetos):
            bpy.ops.object.join()
    activo.name = nombre
    activo.data.name = nombre
    return activo


def vacio(nombre, padre=None):
    ob = bpy.data.objects.new(nombre, None)
    bpy.context.scene.collection.objects.link(ob)
    if padre is not None:
        ob.parent = padre
    return ob


def vertices_de(ob):
    co = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    m = np.array(ob.matrix_world)
    return co @ m[:3, :3].T + m[:3, 3]


def ruido_periodico(n, desde, hasta, lado, semilla):
    """
    Ruido de `n`×`n` muestras sobre `lado` metros, con longitudes de onda entre `desde` y `hasta`, de media cero
    y desviación uno. Es el mismo filtro en frecuencia que `texturas.py`: periódico de suyo, así que repetido
    no deja costura.
    """
    rng = np.random.default_rng(semilla)
    espectro = np.fft.fft2(rng.standard_normal((n, n)))
    f = np.hypot(*np.meshgrid(np.fft.fftfreq(n, d=lado / n), np.fft.fftfreq(n, d=lado / n)))
    f[0, 0] = 1e-9
    alta, baja = 1.0 / desde, 1.0 / hasta
    filtro = np.exp(-0.5 * (np.log(f / np.sqrt(alta * baja)) / (0.5 * np.log(alta / baja) + 1e-9)) ** 2) / f
    campo = np.fft.ifft2(espectro * filtro).real
    campo -= campo.mean()
    return campo / (campo.std() + 1e-12)


def mapa_de_normales(alto, metros_por_pixel):
    """Un campo de alturas periódico en metros, como mapa de normales (verde hacia arriba, como glTF y Blender)."""
    dx = (np.roll(alto, -1, axis=1) - np.roll(alto, 1, axis=1)) / (2 * metros_por_pixel)
    dy = (np.roll(alto, -1, axis=0) - np.roll(alto, 1, axis=0)) / (2 * metros_por_pixel)
    # Aquí la fila 0 es la de abajo de la imagen (así las guarda Blender): la Y crece con la fila.
    n = np.stack([-dx, -dy, np.ones_like(alto)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return (n * 0.5 + 0.5).astype(np.float32)


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


# ============================================================================================ horneado


def usar_la_grafica():
    """La tarjeta gráfica si Cycles la sabe usar; si no, el procesador, que tarda más y da lo mismo."""
    escena = bpy.context.scene
    escena.render.engine = 'CYCLES'
    try:
        preferencias = bpy.context.preferences.addons['cycles'].preferences
        for tipo in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
            try:
                preferencias.compute_device_type = tipo
            except TypeError:
                continue
            preferencias.get_devices()
            suyos = [d for d in preferencias.devices if d.type == tipo]
            if suyos:
                for d in preferencias.devices:
                    d.use = d.type == tipo
                escena.cycles.device = 'GPU'
                return tipo
    except Exception as error:  # noqa: BLE001
        print('Cycles con el procesador:', error)
    escena.cycles.device = 'CPU'
    return 'CPU'


def hornear_oclusion(objetivo, ancho, alto, distancia, muestras, uv='UVMap'):
    """
    La oclusión ambiental de un objeto, horneada con Cycles en su UV: 1 donde nada lo tapa, 0 donde está metido
    bajo otra cosa. Cuenta todo lo que hay en la escena, que es lo que se quiere: la sombra de contacto de una
    tijera sobre la compresa la hace la tijera.
    """
    escena = bpy.context.scene
    usar_la_grafica()
    escena.cycles.samples = muestras
    escena.cycles.use_denoising = False
    # Una semilla fija: dos corridas tienen que dar el mismo ruido.
    escena.cycles.seed = 0
    if escena.world is None:
        escena.world = bpy.data.worlds.new('mundo')
    escena.world.light_settings.distance = distancia
    img = bpy.data.images.new(f'oclusion-{objetivo.name}', ancho, alto, float_buffer=True)
    temporal = bpy.data.materials.new('horneado')
    arbol, _, _ = nodos(temporal)
    tex = arbol.nodes.new('ShaderNodeTexImage')
    tex.image = img
    arbol.nodes.active = tex
    sin_material = len(objetivo.material_slots) == 0
    if sin_material:
        objetivo.data.materials.append(temporal)
    originales = [s.material for s in objetivo.material_slots]
    for s in objetivo.material_slots:
        s.material = temporal
    capas = objetivo.data.uv_layers
    activa = capas.active.name
    al_dibujar = next(c.name for c in capas if c.active_render)
    capas.active = capas[uv]
    capas[uv].active_render = True
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    objetivo.select_set(True)
    bpy.context.view_layer.objects.active = objetivo
    inicio = time.time()
    bpy.ops.object.bake(type='AO', margin=12, use_clear=True)
    print(f'  horneada la oclusión de {objetivo.name}: {ancho}×{alto}, {muestras} muestras, {time.time() - inicio:.1f} s', flush=True)
    capas.active = capas[activa]
    capas[al_dibujar].active_render = True
    for s, m in zip(objetivo.material_slots, originales):
        s.material = m
    if sin_material:
        objetivo.data.materials.clear()
    pixeles = np.empty(ancho * alto * 4, dtype=np.float32)
    img.pixels.foreach_get(pixeles)
    bpy.data.images.remove(img)
    bpy.data.materials.remove(temporal)
    return pixeles.reshape(alto, ancho, 4)[..., 0].astype(np.float64)


def plano_de_sombra(x0, x1, y0, y1, z=0.002):
    """El plano del suelo que lleva la sombra. Su UV va de 0 a 1 de esquina a esquina."""
    v = np.array([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]])
    uv = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], dtype=float)
    ob = objeto('sombra', v, [[0, 1, 2, 3]], [], uvs={'UVMap': uv}, ponderar=False)
    return ob


def hornear_la_sombra(sombra, nombre, ancho, alto, distancia, muestras, fuerza=0.85, contraste=1.35, desenfoque=2.0):
    """
    La sombra de contacto: la oclusión del suelo, vuelta alfa. Se apaga hacia los bordes del plano, porque un
    plano con la sombra cortada en recto delata el truco en cuanto la cámara baja.
    """
    oclusion = hornear_oclusion(sombra, ancho, alto, distancia, muestras)
    alfa = np.clip(1.0 - oclusion, 0.0, 1.0)
    alfa = np.clip(alfa * contraste, 0.0, 1.0) ** 1.1
    alfa = difuminar(alfa, desenfoque)
    filas, columnas = np.mgrid[0:alto, 0:ancho]
    u, v = (columnas + 0.5) / ancho, (filas + 0.5) / alto
    borde = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
    apagado = np.clip(borde / 0.12, 0.0, 1.0)
    alfa *= fuerza * apagado * apagado * (3 - 2 * apagado)
    rgba = np.zeros((alto, ancho, 4), dtype=np.float32)
    rgba[..., 3] = alfa
    img = imagen(f'{nombre}-sombra', rgba)

    # Sin luz y con la sombra en el alfa: el exportador lo reconoce como KHR_materials_unlit por esta forma
    # exacta del árbol —un emisor con el truco del rayo de cámara, mezclado con un transparente—.
    m = bpy.data.materials.new('sombra')
    arbol, principal, salida = nodos(m)
    arbol.nodes.remove(principal)
    tex = nodo_de_imagen(arbol, img)
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
    if hasattr(m, 'surface_render_method'):
        m.surface_render_method = 'BLENDED'
    m.use_backface_culling = True
    sombra.data.materials.clear()
    sombra.data.materials.append(m)


# ============================================================================================ exportación


def exportar(ruta, raiz):
    """
    El `.glb`, con Draco y las texturas en WebP. Sin los `extras` del instrumental: las articulaciones que lleva
    cada instrumento en su archivo son para cogerlo, y aquí solo es decorado.
    """
    ruta.parent.mkdir(parents=True, exist_ok=True)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    pila = [raiz]
    while pila:
        o = pila.pop()
        o.select_set(True)
        pila.extend(o.children)
    bpy.context.view_layer.objects.active = raiz
    bpy.ops.export_scene.gltf(
        filepath=str(ruta), export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
        export_extras=False, export_cameras=False, export_lights=False, export_animations=False,
        export_vertex_color='NONE', export_attributes=False,
        export_image_format='WEBP', export_image_quality=90,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12, export_draco_generic_quantization=12,
    )
    print(f'EXPORTADO {ruta}: {ruta.stat().st_size / 1024:.0f} KB', flush=True)


def leer_glb(ruta):
    datos = ruta.read_bytes()
    largo = struct.unpack_from('<I', datos, 12)[0]
    return json.loads(datos[20:20 + largo])


def medir(ruta, nodos_a_medir):
    """
    Vuelve a abrir el `.glb` exportado y mide, en coordenadas de glTF, la caja de los nodos que el simulador da
    por sabidos. Es lo que se informa: no lo que este guion cree haber hecho, sino lo que salió.
    """
    gltf = leer_glb(ruta)
    triangulos = 0
    primitivas = 0
    for m in gltf['meshes']:
        for p in m['primitives']:
            primitivas += 1
            triangulos += gltf['accessors'][p['indices']]['count'] // 3
    vaciar()
    bpy.ops.import_scene.gltf(filepath=str(ruta))
    bpy.context.view_layer.update()
    cajas = {}
    for nombre in nodos_a_medir:
        ob = bpy.data.objects.get(nombre)
        if ob is None:
            cajas[nombre] = None
            continue
        puntos = []
        pila = [ob]
        while pila:
            o = pila.pop()
            pila.extend(o.children)
            if o.type == 'MESH':
                puntos.append(vertices_de(o))
        if not puntos:
            cajas[nombre] = None
            continue
        p = np.vstack(puntos)
        # De Blender (x, y, z) a glTF (x, z, −y).
        g = np.stack([p[:, 0], p[:, 2], -p[:, 1]], axis=-1)
        cajas[nombre] = (g.min(axis=0).round(4).tolist(), g.max(axis=0).round(4).tolist())
    informe = {
        'archivo': ruta.name,
        'kb': round(ruta.stat().st_size / 1024),
        'mallas': len(gltf['meshes']),
        'primitivas': primitivas,
        'triangulos': triangulos,
        'imagenes': len(gltf.get('images', [])),
        'extensiones': gltf.get('extensionsUsed', []),
        'nodos': [n.get('name') for n in gltf['nodes']],
        'cajas': cajas,
    }
    print('MEDIDO', json.dumps(informe, ensure_ascii=False), flush=True)
    return informe


# ============================================================================================ arsenalera
#
# En los ejes de Blender: X el largo de la bandeja, Y su ancho (−Z de glTF), Z hacia arriba. El origen está en el
# suelo, bajo el centro de la bandeja.

ALTO = 0.98                     # la cara de arriba del fondo de la bandeja: glTF y = 0,98
MEDIO_LARGO, MEDIO_ANCHO = 0.30, 0.20
RADIO_DE_LA_BANDEJA = 0.035
BORDE = 0.020
X_DEL_POSTE = -0.33
RECORRIDO = 0.35                # lo que el simulador sube `elevable`
SOLAPE_MINIMO = 0.05            # lo que el tubo interior queda metido en el exterior con la mesa arriba del todo

# El poste, de abajo arriba: (radio, desde, hasta) en metros sobre el suelo.
TUBO_EXTERIOR = (0.019, 0.138, 0.592)
COLLAR = (0.0235, 0.584, 0.628)
TUBO_INTERIOR = (0.0155, 0.205, 0.952)

# Las patas: un tubo de 40 × 24 mm en U, con el poste en el centro del travesaño y las dos ramas avanzando por
# debajo de la bandeja. Abierta hacia +X a propósito: es el lado por el que la mesa se mete bajo una camilla.
ALTO_DE_LAS_PATAS = 0.112
Y_DE_LAS_PATAS = 0.215
PUNTA_DE_LAS_PATAS = 0.236
RUEDAS = [(0.198, Y_DE_LAS_PATAS, 25.0, False), (0.198, -Y_DE_LAS_PATAS, -32.0, False),
          (-0.262, Y_DE_LAS_PATAS, 168.0, True), (-0.262, -Y_DE_LAS_PATAS, 150.0, True)]

# La funda: cuánto mide extendida, cada cuánto tiene un vértice y dónde queda pegada al fondo de la bandeja.
# Diecisiete centímetros más allá del borde por cada lado: con el bordón de por medio cuelga unos quince por los
# lados, y las esquinas, que siempre caen más, no bajan de la mitad del poste. Con diecinueve las puntas llegaban
# a treinta centímetros y la mesa parecía un mantel.
FUNDA = {'medio': (0.47, 0.37), 'paso': 0.010, 'giro': 1.2, 'corrimiento': (0.006, -0.004)}
# Con qué choca la funda en el borde: no con la chapa, sino con un bloque macizo del tamaño de la bandeja, un
# milímetro más ancho y más alto que el bordón y con el canto de arriba redondeado a medio centímetro.
#
# Contra la chapa de verdad salía mal de tres maneras. La tela se simula con un vértice por centímetro y el bordón
# tiene dos y medio de radio, así que pasaba entre dos vértices y asomaba por encima como una costura de plata.
# Subir la distancia de choque de toda la bandeja a seis milímetros lo tapaba, pero el fondo empujaba entonces
# hacia arriba la tela pegada a él, la fija chocaba con la suelta y la funda entera se arrugaba sobre el borde
# como un acordeón. Y un tubo engordado solo alrededor del bordón se dejaba atravesar en las esquinas, donde la
# punta que cuelga tira en diagonal: la tela acababa por debajo de la bandeja, con la esquina de acero a la
# vista. Un bloque macizo no tiene por dónde dejarse atravesar, y de lejos la tela no distingue un bordón de un
# canto redondeado.
BLOQUE_DE_CHOQUE = {'sobra': 0.001, 'redondeo': 0.005, 'fondo': 0.035}
FUNDA_PEGADA = ALTO + 0.0018

# La compresa: una toalla doblada en cuatro, que no llega al borde de la bandeja para no subirse a la pendiente
# de la funda junto a la pared.
COMPRESA = {'medio': (0.266, 0.168), 'grueso': 0.0066, 'paso': 0.006}
FONDO_DE_LA_COMPRESA = FUNDA_PEGADA + 0.0004


def perfil_de_bandeja():
    """
    El canto de la bandeja: el fondo de chapa, la pared un poco abierta y el bordón enrollado arriba, que es lo
    que da rigidez a una bandeja de un milímetro y lo que se nota bajo la funda.
    """
    chapa = 0.0012
    centro, r = (-0.0025, BORDE - 0.0025), 0.0025
    fuera = arco(centro, r, -60, 240, 14)
    tramo_1 = redondear([(-0.02, -chapa, 0), (-0.0080, -chapa, 0.005), (*fuera[0], 0)], 5)
    tramo_2 = redondear([(*fuera[-1], 0), (-0.0093, 0.0, 0.0045), (-0.02, 0.0, 0)], 5)
    return tramo_1[:-1] + fuera + tramo_2[1:]


def construir_la_bandeja():
    """La bandeja, el bastidor que la sostiene, el cabezal y el tubo interior: lo que sube con `elevable`."""
    piezas = []
    contorno, normales = rectangulo(MEDIO_LARGO, MEDIO_ANCHO, RADIO_DE_LA_BANDEJA, 10)
    v, f, _ = barrer(contorno, normales, perfil_de_bandeja())
    piezas.append(objeto('bandeja-chapa', v + [0, 0, ALTO], f, 'acero'))

    # El bastidor: una varilla de 10 mm en U justo bajo el fondo, que sale del cabezal. La bandeja se apoya en
    # él y no lleva tornillos: así se saca para esterilizarla.
    z = ALTO - 0.0012 - 0.005
    bm = bmesh.new()
    camino = [(-0.312, 0.13, z), (0.20, 0.13, z), (0.2245, 0.13, z)]
    camino += [(0.225 + 0.03 * cos(radians(a)), 0.10 + 0.03 * sin(radians(a)), z) for a in range(80, -1, -10)]
    camino += [(0.255, 0.0, z)]
    camino += [(0.225 + 0.03 * cos(radians(a)), -0.10 + 0.03 * sin(radians(a)), z) for a in range(0, -81, -10)]
    camino += [(0.2245, -0.13, z), (0.20, -0.13, z), (-0.312, -0.13, z)]
    L.barrido(bm, camino, L.circulo(0.005, 12))
    piezas.append(objeto_de_bmesh('bandeja-bastidor', bm, 'acero'))

    # El cabezal: un travesaño junto al extremo de la bandeja, sin meterse debajo de ella, y el manguito que lo
    # une al tubo interior.
    v, f, _ = caja((X_DEL_POSTE + 0.0210, 0.0, 0.969), (0.0085, 0.145, 0.011), 0.004)
    piezas.append(objeto('bandeja-travesano', v, f, 'acero'))
    v, f, _ = revolucion(redondear([(0, 0.925, 0), (0.021, 0.925, 0.003), (0.021, 0.981, 0.004), (0, 0.981, 0)], 3), 32)
    piezas.append(objeto('bandeja-manguito', v + [X_DEL_POSTE, 0, 0], f, 'acero'))

    r, desde, hasta = TUBO_INTERIOR
    v, f, _ = revolucion(redondear([(0, desde, 0), (r, desde, 0.002), (r, hasta, 0), (0, hasta, 0)], 3), 32)
    piezas.append(objeto('bandeja-tubo', v + [X_DEL_POSTE, 0, 0], f, 'acero_pulido'))
    return unir(piezas, 'bandeja')


def rueda(x, y, giro, con_freno):
    """
    Una rueda giratoria de 75 mm: la goma, el buje, la horquilla con su avance —el eje de la rueda va detrás
    del de giro, que es lo que la hace orientarse sola— y el plato con su rodamiento.
    """
    piezas = []
    radio, medio_ancho = 0.0375, 0.0115
    eje = (-0.022, 0.0, radio)        # el eje de la rueda, en el marco de la rueda (Z arriba, sin girar)
    colocar = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(radians(giro), 4, 'Z')
    acostar = Matrix.Translation(eje) @ Matrix.Rotation(radians(-90), 4, 'X')

    goma = redondear([(0.0262, -medio_ancho, 0), (0.0375, -medio_ancho, 0.0055), (0.0375, medio_ancho, 0.0055),
                      (0.0262, medio_ancho, 0)], 4)
    v, f, _ = revolucion(goma, 40)
    piezas.append(objeto('rueda-goma', mover(v, colocar @ acostar), f, 'goma'))
    buje = redondear([(0.0, -0.0085, 0), (0.0095, -0.0085, 0.001), (0.0115, -0.0105, 0.001), (0.0268, -0.0105, 0.001),
                      (0.0268, 0.0105, 0.001), (0.0115, 0.0105, 0.001), (0.0095, 0.0085, 0.001), (0.0, 0.0085, 0)], 2)
    v, f, _ = revolucion(buje, 40)
    piezas.append(objeto('rueda-buje', mover(v, colocar @ acostar), f, 'plastico_gris'))
    perno = redondear([(0.0, -0.0185, 0), (0.0065, -0.0185, 0.0012), (0.0065, 0.0185, 0.0012), (0.0, 0.0185, 0)], 2)
    v, f, _ = revolucion(perno, 20)
    piezas.append(objeto('rueda-perno', mover(v, colocar @ acostar), f, 'acero'))

    # La horquilla: dos chapas de 2,5 mm a los lados de la rueda y el puente de arriba.
    chapa = [(0.016, 0.081, 0.003), (-0.021, 0.081, 0.003), (-0.036, 0.036, 0.012), (-0.012, 0.022, 0.010), (0.016, 0.058, 0.006)]
    contorno, normales = cerrado(chapa, 4)
    perfil = redondear([(-0.0006, 0.0, 0), (0.0, 0.0, 0.0006), (0.0, 0.0025, 0.0006), (-0.0006, 0.0025, 0)], 2)
    v, f, _ = barrer(contorno, normales, perfil)
    de_pie = Matrix.Rotation(radians(90), 4, 'X')   # el contorno pasa al plano XZ y el grueso a −Y
    for lado in (0.0155, -0.0130):
        piezas.append(objeto('rueda-horquilla', mover(v, colocar @ Matrix.Translation((0, lado, 0)) @ de_pie), f, 'acero_cepillado'))
    v, f, _ = caja((-0.0025, 0.0, 0.0805), (0.0185, 0.0155, 0.0025), 0.0012)
    piezas.append(objeto('rueda-puente', mover(v, colocar), f, 'acero_cepillado'))
    plato = redondear([(0, 0.082, 0), (0.0205, 0.082, 0.0008), (0.0205, 0.0845, 0.0006), (0.0185, 0.0855, 0.0006),
                       (0.0185, 0.0975, 0.0015), (0, 0.0975, 0)], 2)
    v, f, _ = revolucion(plato, 32)
    piezas.append(objeto('rueda-plato', mover(v, colocar), f, 'acero'))
    v, f, _ = revolucion(redondear([(0, 0.0974, 0), (0.0065, 0.0974, 0), (0.0065, 0.106, 0), (0, 0.106, 0)], 1), 16)
    piezas.append(objeto('rueda-vastago', mover(v, colocar), f, 'acero_oscuro'))
    if con_freno:
        # El pedal del freno, en el lado contrario al de la rueda: el pie lo encuentra sin buscarlo.
        v, f, _ = caja((0.030, 0.0, 0.0), (0.016, 0.011, 0.0035), 0.0016)
        inclinar = Matrix.Translation((0.012, 0, 0.079)) @ Matrix.Rotation(radians(14), 4, 'Y') @ Matrix.Translation((-0.012, 0, 0))
        piezas.append(objeto('rueda-freno', mover(v, colocar @ inclinar), f, 'plastico_gris'))
    return piezas


def construir_la_base():
    piezas = []
    z, yl, xp, r = ALTO_DE_LAS_PATAS, Y_DE_LAS_PATAS, X_DEL_POSTE, 0.05
    # El camino de la U, con un punto más junto a cada curva: el barrido orienta cada sección según los
    # puntos vecinos, y sin él la primera sección de la curva salía torcida a medias.
    camino = [(PUNTA_DE_LAS_PATAS, yl, z), (xp + r + 0.002, yl, z)]
    camino += [(xp + r + r * cos(radians(a)), yl - r + r * sin(radians(a)), z) for a in range(90, 181, 10)]
    camino += [(xp, yl - r - 0.002, z), (xp, -(yl - r - 0.002), z)]
    camino += [(xp + r + r * cos(radians(a)), -(yl - r) + r * sin(radians(a)), z) for a in range(180, 271, 10)]
    camino += [(xp + r + 0.002, -yl, z), (PUNTA_DE_LAS_PATAS, -yl, z)]
    seccion = [(u, v) for v, u in redondear([(0, 0.012, 0), (0.020, 0.012, 0.008), (0.020, -0.012, 0.008),
                                             (-0.020, -0.012, 0.008), (-0.020, 0.012, 0.008), (0, 0.012, 0)], 3)[:-1]]
    bm = bmesh.new()
    L.barrido(bm, camino, seccion)
    piezas.append(objeto_de_bmesh('patas', bm, 'acero', angulo=50))
    for lado in (1, -1):
        v, f, _ = caja((PUNTA_DE_LAS_PATAS + 0.004, lado * yl, z), (0.007, 0.0215, 0.0130), 0.005)
        piezas.append(objeto('patas-tapon', v, f, 'plastico_negro'))

    # El poste: el cubo sobre el travesaño, el tubo exterior, el collar con la perilla y el casquillo por el
    # que entra el tubo interior.
    cubo = redondear([(0, 0.098, 0), (0.033, 0.098, 0.003), (0.026, 0.148, 0.006), (0, 0.148, 0)], 3)
    v, f, _ = revolucion(cubo, 40)
    piezas.append(objeto('poste-cubo', v + [xp, 0, 0], f, 'acero'))
    radio, desde, hasta = TUBO_EXTERIOR
    v, f, _ = revolucion([(0, desde), (radio, desde), (radio, hasta), (0, hasta)], 40)
    piezas.append(objeto('poste-tubo', v + [xp, 0, 0], f, 'acero'))
    radio, desde, hasta = COLLAR
    collar = redondear([(0, desde, 0), (radio - 0.003, desde, 0.0), (radio, desde + 0.004, 0.002), (radio, hasta, 0.003),
                        (0.0176, hasta, 0)], 3)
    v, f, _ = revolucion(collar, 40)
    piezas.append(objeto('poste-collar', v + [xp, 0, 0], f, 'acero'))
    casquillo = redondear([(0.0158, hasta - 0.002, 0), (0.0186, hasta - 0.002, 0.0008), (0.0186, hasta + 0.005, 0.0015),
                           (0.0158, hasta + 0.005, 0)], 2)
    v, f, _ = revolucion(casquillo, 40)
    piezas.append(objeto('poste-casquillo', v + [xp, 0, 0], f, 'plastico_negro'))

    # La perilla de fijación: una estrella de cinco puntas en el lado de fuera del poste, con su espárrago.
    z_perilla = (desde + hasta) / 2
    hacia_fuera = Matrix.Translation((xp - radio + 0.001, 0, z_perilla)) @ Matrix.Rotation(radians(-90), 4, 'Y')
    v, f, _ = revolucion(redondear([(0, 0, 0), (0.0075, 0, 0), (0.0075, 0.014, 0.0015), (0, 0.014, 0)], 2), 20)
    piezas.append(objeto('perilla-esparrago', mover(v, hacia_fuera), f, 'acero_oscuro'))
    ang = np.linspace(0, 2 * np.pi, 80, endpoint=False)
    rad = 0.0165 + 0.0035 * np.cos(5 * ang)
    estrella = np.stack([rad * np.cos(ang), rad * np.sin(ang)], axis=-1)
    perfil = redondear([(-0.006, 0.0, 0), (0.0, 0.0, 0.002), (0.0, 0.015, 0.003), (-0.004, 0.0175, 0.003), (-0.012, 0.0185, 0)], 3)
    v, f, _ = barrer(estrella, normales_de(estrella), perfil)
    piezas.append(objeto('perilla', mover(v, hacia_fuera @ Matrix.Translation((0, 0, 0.013))), f, 'plastico_negro'))

    for x, y, giro, freno in RUEDAS:
        piezas.extend(rueda(x, y, giro, freno))
    return unir(piezas, 'base')


# ---------------------------------------------------------------------------------------------- funda


def distancia_al_rectangulo(x, y, a, b, r):
    qx, qy = np.abs(x) - (a - r), np.abs(y) - (b - r)
    return np.hypot(np.maximum(qx, 0), np.maximum(qy, 0)) + np.minimum(np.maximum(qx, qy), 0) - r


def apartar_del_bordon(objeto_tela, despejo=0.0025):
    """
    Saca hacia fuera los vértices de la tela que hayan quedado a menos de `despejo` de la superficie del bordón.

    Es la red bajo el bloque de choque (`BLOQUE_DE_CHOQUE`), que ya deja la tela fuera del bordón: la subdivisión
    de después redondea la tela hacia dentro en los cantos, y alguno de esos vértices puede volver a rozar el
    acero. Corrige solo lo que toca: mide en el plano del perfil —cuánto hacia fuera del contorno y a qué
    altura—, empuja cada vértice desde el centro del bordón hasta el despejo, y convierte lo de «hacia fuera» en
    x e y con la dirección en que crece la distancia al contorno.
    """
    malla = objeto_tela.data
    v = np.empty(len(malla.vertices) * 3)
    malla.vertices.foreach_get('co', v)
    v = v.reshape(-1, 3)
    centro_s, centro_h, radio = -0.0025, BORDE - 0.0025, 0.0025 + despejo
    s = distancia_al_rectangulo(v[:, 0], v[:, 1], MEDIO_LARGO, MEDIO_ANCHO, RADIO_DE_LA_BANDEJA)
    ds, dh = s - centro_s, v[:, 2] - ALTO - centro_h
    d = np.hypot(ds, dh)
    cerca = (d < radio) & (d > 1e-9)
    if not cerca.any():
        return 0
    e = 1e-5
    gx = (distancia_al_rectangulo(v[:, 0] + e, v[:, 1], MEDIO_LARGO, MEDIO_ANCHO, RADIO_DE_LA_BANDEJA) - s) / e
    gy = (distancia_al_rectangulo(v[:, 0], v[:, 1] + e, MEDIO_LARGO, MEDIO_ANCHO, RADIO_DE_LA_BANDEJA) - s) / e
    largo = np.maximum(np.hypot(gx, gy), 1e-9)
    factor = np.where(cerca, radio / np.maximum(d, 1e-9) - 1.0, 0.0)
    v[:, 0] += factor * ds * gx / largo
    v[:, 1] += factor * ds * gy / largo
    v[:, 2] += factor * dh
    malla.vertices.foreach_set('co', v.ravel())
    malla.update()
    return int(cerca.sum())


def simular_la_funda(bandeja, cuadros):
    """
    Deja caer la funda sobre la bandeja y su soporte, y devuelve la malla ya quieta.

    No se deja caer desde el aire: empieza ya pegada al fondo de la bandeja, subiendo por encima del bordón y
    extendida hacia fuera a esa altura, y lo de dentro queda fijo. Así la simulación solo tiene que hacer lo que
    no se puede dibujar —cómo cuelga lo que sobra, con sus pliegues en las esquinas—, y la parte de dentro, que
    en una funda de verdad aplastan la compresa y el instrumental, queda plana sin tener que simular su peso.
    """
    escena = bpy.context.scene
    (mx, my), paso = FUNDA['medio'], FUNDA['paso']
    nx, ny = int(round(2 * mx / paso)) + 1, int(round(2 * my / paso)) + 1
    xs, ys = np.linspace(-mx, mx, nx), np.linspace(-my, my, ny)
    gx, gy = np.meshgrid(xs, ys)
    # Ninguna funda cae centrada ni derecha: un grado y medio y medio centímetro bastan para que los pliegues de
    # las cuatro esquinas no salgan iguales, que es lo primero que delata una simulación.
    g = radians(FUNDA['giro'])
    dx, dy = FUNDA['corrimiento']
    x = gx * cos(g) - gy * sin(g) + dx
    y = gx * sin(g) + gy * cos(g) + dy
    s = distancia_al_rectangulo(x, y, MEDIO_LARGO, MEDIO_ANCHO, RADIO_DE_LA_BANDEJA)
    # Por encima del bloque de choque y fuera ya de su distancia: si la tela empieza dentro de ella, el
    # primer cuadro la empuja de golpe y ese tirón se queda colgando en forma de onda. La subida acaba antes de
    # llegar al bordón por la misma razón.
    arriba = ALTO + BORDE + BLOQUE_DE_CHOQUE['sobra'] + 0.0075
    rampa = np.clip((s + 0.021) / 0.012, 0.0, 1.0)
    # Sin ruido en la altura de partida. La tela recuerda como forma de reposo la que tenía al empezar, y un
    # milímetro de ruido por vértice se quedaba para siempre como cien abolladuras de un centímetro: la funda
    # colgaba martilleada. El giro y el corrimiento ya bastan para que las esquinas caigan distintas.
    z = FUNDA_PEGADA + rampa * (arriba - FUNDA_PEGADA)
    # Fija también la subida hasta lo alto del bordón, y no solo el fondo. Con la subida suelta, en las
    # esquinas el peso de la punta que cuelga tiraba en diagonal de ella, la hacía pasar por dentro del bordón y
    # la tela acababa bajo el canto, con el acero de la esquina a la vista. La subida no tiene nada que simular:
    # es la tela tensa entre el fondo y el borde.
    fijos = (s < -0.006).ravel()

    v = np.stack([x.ravel(), y.ravel(), z.ravel()], axis=-1)
    indice = np.arange(nx * ny).reshape(ny, nx)
    caras = np.stack([indice[:-1, :-1], indice[:-1, 1:], indice[1:, 1:], indice[1:, :-1]], axis=-1).reshape(-1, 4)
    uv = np.stack([(gx.ravel() + mx) / (2 * mx), (gy.ravel() + my) / (2 * my)], axis=-1)
    # El tejido se repite cada 4,8 cm, la misma escala que el paño del simulador (`texturas.py`).
    tejido = np.stack([gx.ravel() / 0.048, gy.ravel() / 0.048], axis=-1)

    malla = bpy.data.meshes.new('funda-simulada')
    malla.from_pydata(v.tolist(), [], caras.tolist())
    tela_ob = bpy.data.objects.new('funda-simulada', malla)
    escena.collection.objects.link(tela_ob)
    grupo = tela_ob.vertex_groups.new(name='fijo')
    grupo.add(np.flatnonzero(fijos).tolist(), 1.0, 'REPLACE')

    choque = bandeja.modifiers.new('choque', 'COLLISION')
    bandeja.collision.thickness_outer = 0.0015
    bandeja.collision.thickness_inner = 0.004
    bandeja.collision.cloth_friction = 8.0
    bandeja.collision.damping = 0.6
    sobra, redondeo, fondo = BLOQUE_DE_CHOQUE['sobra'], BLOQUE_DE_CHOQUE['redondeo'], BLOQUE_DE_CHOQUE['fondo']
    contorno, normales = rectangulo(MEDIO_LARGO, MEDIO_ANCHO, RADIO_DE_LA_BANDEJA, 10)
    perfil = redondear([(-0.012, -fondo, 0), (sobra, -fondo, 0), (sobra, BORDE + sobra, redondeo), (-0.012, BORDE + sobra, 0)], 6)
    v, f, _ = barrer(contorno, normales, perfil)
    bloque = objeto('bloque-de-choque', v + [0, 0, ALTO], f, [], ponderar=False)
    bloque.modifiers.new('choque', 'COLLISION')
    bloque.collision.thickness_outer = 0.0015
    # Un centímetro hacia dentro: el vértice que llegue a meterse en el bloque sale siempre por fuera. La tela
    # fija del fondo también queda dentro, pero a la tela fija el choque no la mueve.
    bloque.collision.thickness_inner = 0.010
    bloque.collision.cloth_friction = 8.0
    bloque.collision.damping = 0.6

    tela = tela_ob.modifiers.new('tela', 'CLOTH')
    a = tela.settings
    a.quality = 10
    # Un no tejido de pabellón: el SMS de gramaje alto de las fundas, que tiene cuerpo y hace pocos pliegues
    # anchos. Con la rigidez a la flexión del paño (`generar.py`, menos de uno) salía arrugada como seda, con
    # cien pliegues de un centímetro; a dos y medio quedan los grandes de cada esquina. Más allá deja de doblarse
    # sobre el borde y se encoge en vez de caer.
    a.mass = 0.25
    a.tension_stiffness = 20.0
    a.compression_stiffness = 20.0
    a.shear_stiffness = 8.0
    a.bending_stiffness = 2.5
    a.tension_damping = 8.0
    a.compression_damping = 8.0
    a.shear_damping = 8.0
    a.bending_damping = 2.0
    # El aire frena lo que cuelga. Con uno y medio, a los setenta cuadros las puntas seguían balanceándose quince
    # centímetros, y la forma final dependía de en qué punto del vaivén se cortara.
    a.air_damping = 5.0
    a.vertex_group_mass = 'fijo'
    a.pin_stiffness = 1.0
    c = tela.collision_settings
    c.use_collision = True
    c.collision_quality = 4
    c.distance_min = 0.0016
    c.friction = 8.0
    c.use_self_collision = True
    c.self_distance_min = 0.0016
    c.self_friction = 6.0
    escena.use_gravity = True
    escena.gravity = (0.0, 0.0, -9.81)
    escena.frame_start, escena.frame_end = 1, cuadros
    tela.point_cache.frame_start, tela.point_cache.frame_end = 1, cuadros

    inicio = time.time()
    antes = None
    for cuadro in range(1, cuadros + 1):
        escena.frame_set(cuadro)
        if cuadro % 10 == 0 or cuadro == cuadros:
            grafo = bpy.context.evaluated_depsgraph_get()
            evaluado = tela_ob.evaluated_get(grafo).to_mesh()
            ahora = np.empty(len(evaluado.vertices) * 3)
            evaluado.vertices.foreach_get('co', ahora)
            tela_ob.evaluated_get(grafo).to_mesh_clear()
            movido = float(np.abs(ahora - antes).max()) * 1000 if antes is not None else float('nan')
            antes = ahora
            print(f'  funda: cuadro {cuadro}/{cuadros}, {time.time() - inicio:4.0f} s; lo que más se movió en diez cuadros: {movido:.1f} mm', flush=True)
    final = antes.reshape(-1, 3)
    bandeja.modifiers.remove(choque)
    bpy.data.objects.remove(tela_ob)
    bpy.data.objects.remove(bloque)

    funda = objeto('funda', final, caras, [], uvs={'UVMap': uv, 'tejido': tejido}, angulo=180, ponderar=False)
    # Una subdivisión: la tela se simula a un centímetro, que basta para que caiga bien, y se dibuja a medio, que
    # es lo que hace falta para que un pliegue se vea redondo y no quebrado.
    mod = funda.modifiers.new('subdivision', 'SUBSURF')
    mod.levels = 1
    mod.render_levels = 1
    mod.boundary_smooth = 'PRESERVE_CORNERS'
    aplicar(funda, mod.name)
    print(f'  funda: {apartar_del_bordon(funda)} vértices apartados del bordón', flush=True)
    # Lo que queda bajo la compresa no lo ve nadie: se funde en un solo polígono plano, y son veinte mil
    # triángulos menos que viajar.
    bm = bmesh.new()
    bm.from_mesh(funda.data)
    (ax, ay), margen = COMPRESA['medio'], 0.02
    tapadas = [cara for cara in bm.faces if all(abs(v.co.x) < ax - margen and abs(v.co.y) < ay - margen and v.co.z < FUNDA_PEGADA + 0.0005 for v in cara.verts)]
    bmesh.ops.dissolve_faces(bm, faces=tapadas)
    bm.to_mesh(funda.data)
    bm.free()
    funda.data.shade_smooth()
    print(f'  funda simulada en {time.time() - inicio:.0f} s', flush=True)
    return funda


# ---------------------------------------------------------------------------------------------- compresa


class Alturas:
    """
    La altura de lo que hay sobre la bandeja, en una rejilla de un milímetro: la compresa, y encima lo que se va
    dejando. Es lo que dice a qué altura apoya cada cosa sin atravesar la de abajo.
    """

    def __init__(self, x0, x1, y0, y1, paso=0.001):
        self.x0, self.y0, self.paso = x0, y0, paso
        self.nx, self.ny = int(round((x1 - x0) / paso)) + 1, int(round((y1 - y0) / paso)) + 1
        self.z = np.full((self.ny, self.nx), FUNDA_PEGADA)

    def celdas(self, x, y):
        return (np.clip(np.round((np.asarray(y) - self.y0) / self.paso).astype(int), 0, self.ny - 1),
                np.clip(np.round((np.asarray(x) - self.x0) / self.paso).astype(int), 0, self.nx - 1))

    def en(self, x, y):
        """Bilineal, para que la superficie entre dos celdas no quede más baja que ninguna de las dos."""
        fx = np.clip((np.asarray(x) - self.x0) / self.paso, 0, self.nx - 1.0001)
        fy = np.clip((np.asarray(y) - self.y0) / self.paso, 0, self.ny - 1.0001)
        i, j = np.floor(fy).astype(int), np.floor(fx).astype(int)
        u, w = fx - j, fy - i
        z = self.z
        return ((1 - u) * (1 - w) * z[i, j] + u * (1 - w) * z[i, j + 1] + (1 - u) * w * z[i + 1, j] + u * w * z[i + 1, j + 1])

    def posar(self, v, holgura=0.0004):
        """Cuánto hay que subir unos vértices para que el más bajo apoye en lo que tiene debajo."""
        return float(np.max(self.en(v[:, 0], v[:, 1]) - v[:, 2])) + holgura

    def subir(self, x, y, z):
        """
        Lo que se acaba de posar pasa a ser suelo para lo siguiente. Hay que darle la superficie bastante densa
        —más de un punto por celda—, o entre punto y punto quedan celdas a la altura de antes.
        """
        i, j = self.celdas(np.ravel(x), np.ravel(y))
        np.maximum.at(self.z, (i, j), np.ravel(z))


def refinar(a, veces):
    """Una rejilla con `veces` puntos por cada uno, interpolando en línea recta entre vecinos."""
    filas, columnas = a.shape
    nf, nc = (filas - 1) * veces + 1, (columnas - 1) * veces + 1
    f, c = np.linspace(0, filas - 1, nf), np.linspace(0, columnas - 1, nc)
    por_filas = np.stack([np.interp(f, np.arange(filas), a[:, k]) for k in range(columnas)], axis=1)
    return np.stack([np.interp(c, np.arange(columnas), por_filas[k, :]) for k in range(nf)], axis=0)


def suavizar(a, veces, minimo=None):
    """Media de cada punto con sus cuatro vecinos, repetida; con el borde repetido, no envuelto."""
    for _ in range(veces):
        r = np.pad(a, 1, mode='edge')
        a = (r[1:-1, 1:-1] + r[:-2, 1:-1] + r[2:, 1:-1] + r[1:-1, :-2] + r[1:-1, 2:]) / 5
        if minimo is not None:
            a = np.maximum(a, minimo)
    return a


def grosor_de_la_compresa(x, y):
    """
    El grueso de la toalla en cada punto: plano con un leve abombado, arrugas de varios centímetros y, junto al
    borde de atrás, el escalón de la capa de arriba, que acaba un poco antes que las de abajo: así se dobla una
    compresa, y es lo que hace que se lea doblada y no como una plancha.
    """
    (ax, ay), t = COMPRESA['medio'], COMPRESA['grueso']
    n, lado = 256, 0.6
    arruga = ruido_periodico(n, 0.025, 0.12, lado, SEMILLA + 1)
    fx = ((np.asarray(x) / lado) % 1.0) * n
    fy = ((np.asarray(y) / lado) % 1.0) * n
    i0, j0 = np.floor(fy).astype(int) % n, np.floor(fx).astype(int) % n
    u, w = fx - np.floor(fx), fy - np.floor(fy)
    a = arruga
    valor = ((1 - u) * (1 - w) * a[i0, j0] + u * (1 - w) * a[i0, (j0 + 1) % n] + (1 - u) * w * a[(i0 + 1) % n, j0]
             + u * w * a[(i0 + 1) % n, (j0 + 1) % n])
    abombado = 0.0006 * (1 - (np.asarray(x) / ax) ** 2) * (1 - (np.asarray(y) / ay) ** 2)
    escalon = -0.0022 / (1 + np.exp(-(np.asarray(y) - (ay - 0.009)) / 0.0012))
    return t + abombado + 0.00045 * valor + escalon


def construir_la_compresa(alturas):
    """
    La compresa: la cara de arriba es una rejilla con el grueso de cada punto, y el canto baja redondeado hasta
    la funda. No tiene cara de abajo, que nadie ve, y así su proyección desde arriba no se pisa consigo misma y
    sirve de UV para hornearle la oclusión.
    """
    (ax, ay), paso = COMPRESA['medio'], COMPRESA['paso']
    nx, ny = int(round(2 * ax / paso)) + 1, int(round(2 * ay / paso)) + 1
    xs, ys = np.linspace(-ax, ax, nx), np.linspace(-ay, ay, ny)
    gx, gy = np.meshgrid(xs, ys)
    arriba = FONDO_DE_LA_COMPRESA + grosor_de_la_compresa(gx, gy)
    v = [np.stack([gx.ravel(), gy.ravel(), arriba.ravel()], axis=-1)]
    indice = np.arange(nx * ny).reshape(ny, nx)
    caras = np.stack([indice[:-1, :-1], indice[:-1, 1:], indice[1:, 1:], indice[1:, :-1]], axis=-1).reshape(-1, 4).tolist()

    # El anillo del borde, en sentido antihorario, con la normal hacia fuera de cada punto.
    borde = (list(indice[0, :]) + list(indice[1:, -1]) + list(indice[-1, -2::-1]) + list(indice[-2:0:-1, 0]))
    puntos = v[0][borde]
    normal = np.zeros((len(borde), 2))
    normal[:, 0] = np.where(np.isclose(puntos[:, 0], ax), 1, np.where(np.isclose(puntos[:, 0], -ax), -1, 0))
    normal[:, 1] = np.where(np.isclose(puntos[:, 1], ay), 1, np.where(np.isclose(puntos[:, 1], -ay), -1, 0))
    normal /= np.linalg.norm(normal, axis=1, keepdims=True)
    grueso = puntos[:, 2] - FONDO_DE_LA_COMPRESA
    anterior = borde
    total = len(v[0])
    for k in range(1, 5):
        ang = radians(90 * k / 4)
        anillo = np.empty((len(borde), 3))
        anillo[:, 0:2] = puntos[:, 0:2] + normal * (grueso * math.sin(ang))[:, None]
        anillo[:, 2] = FONDO_DE_LA_COMPRESA + grueso * math.cos(ang)
        v.append(anillo)
        actual = list(range(total, total + len(borde)))
        for a in range(len(borde)):
            b = (a + 1) % len(borde)
            caras.append([anterior[a], actual[a], actual[b], anterior[b]])
        anterior, total = actual, total + len(borde)
    v = np.vstack(v)
    margen = COMPRESA['grueso'] * 1.2
    uv = np.stack([(v[:, 0] + ax + margen) / (2 * (ax + margen)), (v[:, 1] + ay + margen) / (2 * (ay + margen))], axis=-1)
    tejido = v[:, 0:2] / 0.012
    compresa = objeto('compresa', v, caras, [], uvs={'UVMap': uv, 'tejido': tejido}, angulo=180, ponderar=False)
    # El suelo de lo que se deja encima: la cara de arriba, muestreada en la rejilla de un milímetro.
    xs_f = np.arange(alturas.nx) * alturas.paso + alturas.x0
    ys_f = np.arange(alturas.ny) * alturas.paso + alturas.y0
    fx, fy = np.meshgrid(xs_f, ys_f)
    dentro = (np.abs(fx) <= ax) & (np.abs(fy) <= ay)
    alturas.z = np.where(dentro, FONDO_DE_LA_COMPRESA + grosor_de_la_compresa(fx, fy), alturas.z)
    return compresa


# ---------------------------------------------------------------------------------------------- instrumental

# Lo que lleva la mesa para una osteosíntesis de tobillo, en el orden en que lo deja una arsenalera. Delante, con
# los mangos hacia ella (−Y de Blender, +Z de glTF), lo de corte y disección y las gasas; en medio, atravesado
# sobre las puntas, un Farabeuf; detrás, el Hohmann, la cápsula y la riñonera. Cada cosa se corre por su fila
# hasta el primer sitio libre (`colocar`), así que el orden de la lista es el orden en la mesa.
#
# Para cada una: la fila, hacia dónde mira el mango (grados sobre la bandeja), cuánto se adelanta o se retrasa
# respecto de la línea de su fila y un giro de más. Los dos últimos son pequeños y a propósito: una arsenalera
# alinea, pero a mano, y una fila perfecta de instrumentos clavados en su sitio se lee como un render.
DISPOSICION = [
    ('tijera-mayo', 'delante', -90, 0.000, 0.8),
    ('tijera-metzenbaum', 'delante', -90, 0.004, -0.6),
    ('portaagujas-mayo-hegar', 'delante', -90, 0.001, 0.5),
    ('pinza-reduccion-puntas', 'delante', -90, 0.006, -1.0),
    ('pinza-diseccion-con-dientes', 'delante', -90, 0.010, 1.2),
    ('pinza-diseccion-sin-dientes', 'delante', -90, 0.012, 0.4),
    ('bisturi-piel-n22', 'delante', -90, 0.002, -0.8),
    ('bisturi-profundo-n15', 'delante', -90, 0.003, 0.6),
    ('elevador-freer', 'delante', -90, 0.002, -0.4),
    ('periostotomo-farabeuf', 'delante', -90, 0.000, 0.7),
    ('gasas', 'delante', 0, 0.001, 0.0),
    ('separador-farabeuf', 'delante', -90, 0.004, -0.5),
    ('separador-farabeuf', 'medio', 180, 0.000, 0.9),
    ('separador-hohmann', 'detras', 180, 0.000, 0.5),
    ('capsula', 'detras', 0, 0.000, 0.0),
    ('rinonera', 'detras', 0, 0.000, 0.0),
]
# Cada fila alinea un borde: la de delante, el de los mangos; la de detrás, el del fondo de la compresa.
FILAS = {'delante': ('min', -0.159), 'medio': ('min', 0.013), 'detras': ('max', 0.161)}
HOLGURA = 0.0035


def importar_instrumento(nombre):
    """Un instrumento de `ejemplos/instrumental/`, en una sola malla, en metros y con los aceros de este guion."""
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(INSTRUMENTAL / f'{nombre}.glb'))
    nuevos = [o for o in bpy.data.objects if o not in antes]
    bpy.context.view_layer.update()
    mallas = []
    for o in nuevos:
        if o.type != 'MESH':
            continue
        o.data = o.data.copy()
        m = o.matrix_world.copy()
        o.parent = None
        o.data.transform(m)
        o.matrix_world = Matrix.Identity(4)
        for s in o.material_slots:
            importado = s.material
            # Quitando también el prefijo: dos piezas del mismo instrumento comparten material importado, y la
            # segunda lo encuentra ya apartado. Sin quitarlo, la segunda argolla del portaagujas salía de acero.
            base = importado.name.split('.')[0].removeprefix('importado-') if importado else 'acero'
            # El material que trae el archivo deja libre su nombre antes de crear el nuestro: si no, el nuestro
            # nace como «dorado_anodizado.001» y con ese nombre llega al simulador.
            if importado is not None and importado not in _materiales.values():
                importado.name = f'importado-{base}'
            s.material = material(base if base in ACABADOS else 'acero')
        mallas.append(o)
    for o in nuevos:
        if o.type != 'MESH':
            bpy.data.objects.remove(o)
    return unir(mallas, nombre)


def reposo(ob):
    """
    La pose en que el instrumento se queda quieto sobre una superficie plana.

    Es la cara de su envolvente convexa más cercana a su centro de masas: de todas las caras sobre las que podría
    apoyarse, la que deja el centro más bajo. Elegirla a ojo —«las tijeras, planas»— vale para las tijeras, pero
    un Hohmann o un Farabeuf, con las palas dobladas, quedaban apoyados en una punta y flotando del otro lado.
    Devuelve la matriz que lo acuesta así, con el mango (su +Z de origen) en el plano de la mesa.
    """
    co = vertices_de(ob)
    ob.data.calc_loop_triangles()
    tri = np.empty(len(ob.data.loop_triangles) * 3, dtype=np.int64)
    ob.data.loop_triangles.foreach_get('vertices', tri)
    tri = tri.reshape(-1, 3)
    a, b, c = co[tri[:, 0]], co[tri[:, 1]], co[tri[:, 2]]
    area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
    centro = ((a + b + c) / 3 * area[:, None]).sum(axis=0) / area.sum()

    bm = bmesh.new()
    for p in co:
        bm.verts.new(p)
    casco = bmesh.ops.convex_hull(bm, input=bm.verts[:])
    caras = [g for g in casco['geom'] if isinstance(g, bmesh.types.BMFace)]
    mejor = None
    for cara in caras:
        cara.normal_update()
        n = np.array(cara.normal)
        medio = np.array(cara.calc_center_median())
        if (medio - centro) @ n < 0:
            n = -n
        altura = float((medio - centro) @ n)
        clave = (round(altura, 5), *np.round(n, 4))
        if mejor is None or clave < mejor[0]:
            mejor = (clave, n)
    bm.free()
    abajo = Vector(mejor[1].tolist())
    giro = abajo.rotation_difference(Vector((0, 0, -1))).to_matrix().to_4x4()
    return giro @ Matrix.Translation(Vector((-centro).tolist()))


def huella(v, paso=0.001):
    """Las celdas que tapa algo visto desde arriba, rellenas fila a fila: los aros de una tijera no son un hueco donde meter nada."""
    i = np.round(v[:, 1] / paso).astype(int)
    j = np.round(v[:, 0] / paso).astype(int)
    filas = {}
    for fila, col in zip(i.tolist(), j.tolist()):
        lo, hi = filas.get(fila, (col, col))
        filas[fila] = (min(lo, col), max(hi, col))
    celdas = [(fila, col) for fila, (lo, hi) in filas.items() for col in range(lo, hi + 1)]
    return np.array(celdas, dtype=int)


def puntos_de_las_aristas(ob, paso=0.0008):
    co = vertices_de(ob)
    aristas = np.empty(len(ob.data.edges) * 2, dtype=np.int64)
    ob.data.edges.foreach_get('vertices', aristas)
    aristas = aristas.reshape(-1, 2)
    a, b = co[aristas[:, 0]], co[aristas[:, 1]]
    k = np.maximum(2, np.ceil(np.linalg.norm(b - a, axis=1) / paso).astype(int) + 1)
    cual = np.repeat(np.arange(len(k)), k)
    inicio = np.repeat(np.cumsum(k) - k, k)
    t = (np.arange(k.sum()) - inicio) / np.repeat(k - 1, k)
    return np.vstack([co, a[cual] + (b[cual] - a[cual]) * t[:, None]])


class Ocupacion:
    """Lo que ya está puesto sobre la compresa, visto desde arriba, en celdas de un milímetro."""

    def __init__(self, medio, paso=0.001):
        self.paso = paso
        self.medio = medio
        self.n = (int(round(2 * medio[1] / paso)) + 1, int(round(2 * medio[0] / paso)) + 1)
        self.lleno = np.zeros(self.n, dtype=bool)
        self.vedado = np.zeros(self.n, dtype=bool)

    def indices(self, celdas, dx, dy):
        i = celdas[:, 0] + int(round((dy + self.medio[1]) / self.paso))
        j = celdas[:, 1] + int(round((dx + self.medio[0]) / self.paso))
        return i, j

    def cabe(self, celdas, dx, dy):
        i, j = self.indices(celdas, dx, dy)
        if i.min() < 0 or j.min() < 0 or i.max() >= self.n[0] or j.max() >= self.n[1]:
            return False
        return not self.vedado[i, j].any()

    def poner(self, celdas, dx, dy, holgura=HOLGURA):
        i, j = self.indices(celdas, dx, dy)
        self.lleno[i, j] = True
        r = int(round(holgura / self.paso))
        yy, xx = np.mgrid[-r:r + 1, -r:r + 1]
        for di, dj in zip(yy[yy ** 2 + xx ** 2 <= r * r], xx[yy ** 2 + xx ** 2 <= r * r]):
            ii, jj = np.clip(i + di, 0, self.n[0] - 1), np.clip(j + dj, 0, self.n[1] - 1)
            self.vedado[ii, jj] = True


def deslizar(ocupacion, celdas, dx0, dy, que):
    for paso in range(700):
        dx = dx0 + paso * 0.001
        if ocupacion.cabe(celdas, dx, dy):
            return dx
    raise RuntimeError(f'{que} no cabe en la compresa')


def colocar(alturas, ocupacion):
    """
    Pone sobre la compresa todo lo de `DISPOSICION`. Acuesta cada instrumento en su pose de reposo, lo gira para
    que el mango mire adonde le toca y lo corre por su fila, de izquierda a derecha, hasta el primer sitio en
    que no toca nada de lo ya puesto; después lo baja hasta que apoya. Las gasas y los recipientes pasan por la
    misma cuenta, con su huella.

    Devuelve los instrumentos, los recipientes ya unidos y las gasas.
    """
    instrumentos, recipientes, gasas = [], [], None
    desde = {fila: -ocupacion.medio[0] + 0.002 for fila in FILAS}
    for que, fila, mango, adelanto, giro_de_mas in DISPOSICION:
        girar = Matrix.Rotation(radians(giro_de_mas), 4, 'Z')
        if que == 'gasas':
            plan = plan_de_las_gasas()
            puntos = puntos_de_las_gasas(plan)
        elif que in ('rinonera', 'capsula'):
            v, f = recipiente(que)
            v = mover(v, girar @ Matrix.Rotation(radians(mango), 4, 'Z'))
            puntos = v
        else:
            ob = importar_instrumento(que)
            acostado = reposo(ob)
            direccion = acostado.to_3x3() @ Vector((0, 0, 1))
            actual = math.degrees(math.atan2(direccion.y, direccion.x))
            ob.data.transform(girar @ Matrix.Rotation(radians(mango - actual), 4, 'Z') @ acostado)
            puntos = puntos_de_las_aristas(ob)
        borde, linea = FILAS[fila]
        if borde == 'min':
            dy = linea + adelanto - puntos[:, 1].min()
        else:
            dy = linea - adelanto - puntos[:, 1].max()
        celdas = huella(puntos)
        dx = deslizar(ocupacion, celdas, desde[fila] - puntos[:, 0].min(), dy, que)
        ocupacion.poner(celdas, dx, dy)
        desde[fila] = float(puntos[:, 0].min()) + dx + 0.004
        if que == 'gasas':
            gasas = construir_las_gasas(alturas, plan, (dx, dy))
        elif que in ('rinonera', 'capsula'):
            v = v + [dx, dy, 0]
            v[:, 2] += alturas.posar(v, 0.0003)
            recipientes.append(objeto(que, v, f, 'acero'))
        else:
            ob.data.transform(Matrix.Translation((dx, dy, 0)))
            ob.data.transform(Matrix.Translation((0, 0, alturas.posar(vertices_de(ob)))))
            instrumentos.append(ob)
        x0, x1 = puntos[:, 0].min() + dx, puntos[:, 0].max() + dx
        y0, y1 = puntos[:, 1].min() + dy, puntos[:, 1].max() + dy
        print(f'  {que}: x {x0:+.3f}…{x1:+.3f}, y {y0:+.3f}…{y1:+.3f}', flush=True)
    return instrumentos, unir(recipientes, 'recipientes'), gasas


# ---------------------------------------------------------------------------------------------- recipientes y gasas


def contorno_de_rinonera(largo=0.185, ancho=0.085, radio_medio=0.11, por_arco=28, por_cabo=14):
    """
    La planta de una riñonera: una banda curva con los cabos redondos, convexa por fuera y cóncava por dentro.
    Devuelve los puntos en sentido antihorario y la normal hacia fuera de cada uno.
    """
    medio = ancho / 2
    fi = math.asin((largo / 2 - medio) / radio_medio)
    centro = np.array([0.0, -radio_medio])
    puntos, normales = [], []

    def radial(a):
        return np.array([math.sin(a), math.cos(a)])

    def tangente(a):
        return np.array([math.cos(a), -math.sin(a)])

    for k in range(por_arco + 1):
        a = fi - 2 * fi * k / por_arco
        puntos.append(centro + (radio_medio + medio) * radial(a))
        normales.append(radial(a))
    pc = centro + radio_medio * radial(-fi)
    for k in range(1, por_cabo):
        t = math.pi * k / por_cabo
        d = math.cos(t) * radial(-fi) - math.sin(t) * tangente(-fi)
        puntos.append(pc + medio * d)
        normales.append(d)
    for k in range(por_arco + 1):
        a = -fi + 2 * fi * k / por_arco
        puntos.append(centro + (radio_medio - medio) * radial(a))
        normales.append(-radial(a))
    pc = centro + radio_medio * radial(fi)
    for k in range(1, por_cabo):
        t = math.pi * k / por_cabo
        d = -math.cos(t) * radial(fi) + math.sin(t) * tangente(fi)
        puntos.append(pc + medio * d)
        normales.append(d)
    puntos = np.array(puntos)
    puntos -= (puntos.min(axis=0) + puntos.max(axis=0)) / 2
    return puntos, np.array(normales)


def perfil_de_recipiente(alto, abierto, chapa=0.0011, bordon=0.0019, suelo=-0.02):
    """El perfil de un recipiente de chapa embutida: fondo, pared abierta `abierto` metros y bordón enrollado."""
    centro = (-bordon, alto - bordon)
    fuera = arco(centro, bordon, -60, 240, 12)
    tramo_1 = redondear([(suelo, 0.0, 0), (-abierto, 0.0, 0.007), (*fuera[0], 0)], 5)
    tramo_2 = redondear([(*fuera[-1], 0), (-abierto - chapa * 1.2, chapa, 0.006), (suelo, chapa, 0)], 5)
    return tramo_1[:-1] + fuera + tramo_2[1:]


def recipiente(que):
    """
    La riñonera, de 18,5 cm —la concavidad hacia −Y, hacia el instrumental, cuando no se gira—, o la cápsula, un
    cuenco de 7 cm para el suero. Centradas en el origen y con el fondo en z = 0.
    """
    if que == 'rinonera':
        contorno, normales = contorno_de_rinonera()
        v, f, _ = barrer(contorno, normales, perfil_de_recipiente(0.032, 0.015, suelo=-0.03))
    else:
        ang = np.linspace(0, 2 * np.pi, 48, endpoint=False)
        normales = np.stack([np.cos(ang), np.sin(ang)], axis=-1)
        v, f, _ = barrer(normales * 0.035, normales, perfil_de_recipiente(0.030, 0.012, suelo=-0.02))
    return v, f


GASAS = 4
MEDIO_LADO_DE_LA_GASA = 0.045


def plan_de_las_gasas():
    """Dónde va cada gasa del abanico respecto del primero, y con qué giro: corridas hacia atrás, como cartas."""
    rng = np.random.default_rng(SEMILLA + 7)
    return [(np.array([0.003 * k, 0.016 * k]) + rng.normal(0, 0.001, 2), radians(-3 + 2.2 * k + rng.normal(0, 1.0)))
            for k in range(GASAS)]


def puntos_de_las_gasas(plan):
    """El contorno de cada gasa del abanico, con el canto, punto a punto: su huella para colocarlas."""
    lado = MEDIO_LADO_DE_LA_GASA + 0.003
    t = np.linspace(-lado, lado, 200)
    cuadrado = np.vstack([np.stack([t, np.full_like(t, s)], axis=-1) for s in (-lado, lado)]
                         + [np.stack([np.full_like(t, s), t], axis=-1) for s in (-lado, lado)])
    puntos = []
    for centro, ang in plan:
        x = centro[0] + cuadrado[:, 0] * cos(ang) - cuadrado[:, 1] * sin(ang)
        y = centro[1] + cuadrado[:, 0] * sin(ang) + cuadrado[:, 1] * cos(ang)
        puntos.append(np.stack([x, y, np.zeros_like(x)], axis=-1))
    return np.vstack(puntos)


def construir_las_gasas(alturas, plan, desplazamiento):
    """
    Gasas dobladas de 9 × 9 cm, en abanico como las deja una arsenalera para contarlas, cada una con su hilo azul
    radiopaco a la vista.

    Cada gasa se apoya en lo que tiene debajo —la compresa o la gasa anterior— con la rejilla de alturas, y
    se suaviza: una gasa es blanda y se dobla sobre el canto de la de abajo en vez de quedar en el aire.
    """
    lado, paso = MEDIO_LADO_DE_LA_GASA, 0.003
    n = int(round(2 * lado / paso)) + 1
    s = np.linspace(-lado, lado, n)
    lu, lv = np.meshgrid(s, s)
    todo_v, todo_f, todo_uv, total = [], [], [], 0
    for k, (centro, ang) in enumerate(plan):
        centro = centro + np.asarray(desplazamiento)
        # Un poco de forma propia: una gasa nunca es un cuadrado perfecto.
        deforma = 0.0012 * ruido_periodico(32, 0.03, 0.12, 0.2, SEMILLA + 10 + k)[:n, :n]
        x = centro[0] + lu * cos(ang) - lv * sin(ang) + deforma * 0.6
        y = centro[1] + lu * sin(ang) + lv * cos(ang) - deforma * 0.4
        apoyo = alturas.en(x, y)
        # Blanda: el fondo es el apoyo suavizado, pero nunca por debajo del apoyo.
        suave = suavizar(apoyo, 6, minimo=apoyo)
        grueso = 0.0022 + 0.0004 * ruido_periodico(32, 0.02, 0.08, 0.2, SEMILLA + 20 + k)[:n, :n]
        arriba = suave + 0.0002 + grueso
        v = np.stack([x.ravel(), y.ravel(), arriba.ravel()], axis=-1)
        indice = np.arange(n * n).reshape(n, n)
        caras = np.stack([indice[:-1, :-1], indice[:-1, 1:], indice[1:, 1:], indice[1:, :-1]], axis=-1).reshape(-1, 4).tolist()
        borde = list(indice[0, :]) + list(indice[1:, -1]) + list(indice[-1, -2::-1]) + list(indice[-2:0:-1, 0])
        puntos = v[borde]
        lu_b, lv_b = lu.ravel()[borde], lv.ravel()[borde]
        normal_local = np.stack([np.where(np.isclose(lu_b, lado), 1, np.where(np.isclose(lu_b, -lado), -1, 0)),
                                 np.where(np.isclose(lv_b, lado), 1, np.where(np.isclose(lv_b, -lado), -1, 0))], axis=-1).astype(float)
        normal_local /= np.linalg.norm(normal_local, axis=1, keepdims=True)
        normal = np.stack([normal_local[:, 0] * cos(ang) - normal_local[:, 1] * sin(ang),
                           normal_local[:, 0] * sin(ang) + normal_local[:, 1] * cos(ang)], axis=-1)
        base = suave.ravel()[borde]
        alto_borde = puntos[:, 2] - base
        anillos = [v]
        anterior, cuenta = borde, len(v)
        uv_local = [np.stack([lu.ravel(), lv.ravel()], axis=-1)]
        for paso_anillo in range(1, 4):
            a = radians(90 * paso_anillo / 3)
            anillo = np.empty((len(borde), 3))
            anillo[:, 0:2] = puntos[:, 0:2] + normal * (alto_borde * math.sin(a))[:, None]
            anillo[:, 2] = base + alto_borde * math.cos(a)
            anillos.append(anillo)
            uv_local.append(np.stack([lu_b, lv_b], axis=-1) + normal_local * (alto_borde * math.sin(a))[:, None])
            actual = list(range(cuenta, cuenta + len(borde)))
            for i in range(len(borde)):
                j = (i + 1) % len(borde)
                caras.append([anterior[i], actual[i], actual[j], anterior[j]])
            anterior, cuenta = actual, cuenta + len(borde)
        v = np.vstack(anillos)
        uvl = np.vstack(uv_local)
        # Cada gasa en su cuarto del atlas, con un margen para que el horneado no se salga a la de al lado.
        col, fil = k % 2, k // 2
        uv = np.stack([(col + 0.04 + 0.92 * (uvl[:, 0] + MARGEN_DEL_ATLAS) / (2 * MARGEN_DEL_ATLAS)) / 2,
                       (fil + 0.04 + 0.92 * (uvl[:, 1] + MARGEN_DEL_ATLAS) / (2 * MARGEN_DEL_ATLAS)) / 2], axis=-1)
        todo_v.append(v)
        todo_f.extend([[i + total for i in c] for c in caras])
        todo_uv.append(uv)
        total += len(v)
        alturas.subir(refinar(x, 5), refinar(y, 5), refinar(arriba, 5))
    v = np.vstack(todo_v)
    return objeto('gasas', v, todo_f, [], uvs={'UVMap': np.vstack(todo_uv)}, angulo=180, ponderar=False)


# Lo que cubre cada cuarto del atlas de las gasas, desde su centro: la gasa y su canto, con holgura.
MARGEN_DEL_ATLAS = MEDIO_LADO_DE_LA_GASA + 0.004


# ---------------------------------------------------------------------------------------------- texturas de tela


def tejido_de_algodon(n=256, hilos=16):
    """
    El relieve de un tafetán de algodón: urdimbre y trama de igual paso, cada hilo pasando por encima y por
    debajo del de al lado. Periódico, para repetirlo en la compresa; con algo de ruido de fibra.
    """
    t = np.arange(n) / n * hilos
    fx, fy = np.meshgrid(t, t)
    def hilo(a, b):
        cruce = np.abs(((a % 1.0) - 0.5) * 2)
        perfil = np.sqrt(np.clip(1 - cruce ** 2, 0, 1))
        sube = 0.5 + 0.5 * np.cos(np.pi * (b + np.floor(a)))
        return perfil * (0.55 + 0.45 * sube)
    alto = np.maximum(hilo(fx, fy), hilo(fy + 0.5, fx + 0.5))
    alto += 0.12 * ruido_periodico(n, 2.0 / n, 12.0 / n, 1.0, SEMILLA + 3)
    return alto


def textura_de_la_compresa(oclusion):
    """El color de la compresa: el verde, un moteado leve del algodón, el pespunte del dobladillo y su oclusión."""
    alto, ancho = oclusion.shape
    (ax, ay) = COMPRESA['medio']
    margen = COMPRESA['grueso'] * 1.2
    filas, columnas = np.mgrid[0:alto, 0:ancho]
    x = (columnas + 0.5) / ancho * 2 * (ax + margen) - (ax + margen)
    y = (filas + 0.5) / alto * 2 * (ay + margen) - (ay + margen)
    moteado = 1.0 + 0.035 * ruido_periodico(1024, 0.004, 0.05, 0.6, SEMILLA + 4)[:alto, :ancho]
    # El pespunte, a 7 mm de los bordes con dobladillo (atrás y a los lados): puntadas de 3 mm.
    a_borde = np.minimum(np.minimum(ax - np.abs(x), ay - y), 1.0)
    linea = np.exp(-((a_borde - 0.007) / 0.00045) ** 2)
    puntada = (np.sin((x + y) / 0.003 * np.pi) > -0.3).astype(float)
    pespunte = 1.0 - 0.18 * linea * puntada
    ao = np.clip(oclusion, 0, 1) ** 1.3
    color = np.array(VERDE_DE_LA_COMPRESA)[None, None, :] * (moteado * pespunte * (0.25 + 0.75 * ao))[..., None]
    return np.clip(color, 0, 1).astype(np.float32)


def texturas_de_las_gasas(oclusion):
    """
    El atlas de las gasas: la trama abierta de la gasa —se ve el hilo y, entre hilos, lo que queda debajo, más
    oscuro—, el hilo azul radiopaco de cada una y su oclusión. Y el mapa de normales del mismo tejido.
    """
    alto, ancho = oclusion.shape
    filas, columnas = np.mgrid[0:alto, 0:ancho]
    u, v = (columnas + 0.5) / ancho, (filas + 0.5) / alto
    # Coordenadas en metros dentro de cada cuarto del atlas.
    margen = MARGEN_DEL_ATLAS
    lu = ((u * 2) % 1.0 - 0.04) / 0.92 * 2 * margen - margen
    lv = ((v * 2) % 1.0 - 0.04) / 0.92 * 2 * margen - margen
    paso = 0.0011
    def hilo(a):
        d = np.abs(((a / paso) % 1.0) - 0.5) * 2
        return np.clip(1.0 - (d - 0.35) / 0.25, 0, 1)
    urdimbre, trama = hilo(lu), hilo(lv)
    hilos = np.maximum(urdimbre, trama)
    ruido = ruido_periodico(1024, 0.0008, 0.01, 0.2, SEMILLA + 5)[:alto, :ancho]
    blanco = 0.82 + 0.13 * hilos + 0.02 * ruido
    color = np.stack([blanco, blanco, blanco * 0.985], axis=-1)
    rng = np.random.default_rng(SEMILLA + 6)
    for k in range(GASAS):
        col, fil = k % 2, k // 2
        en_cuarto = (np.floor(u * 2) == col) & (np.floor(v * 2) == fil)
        donde = rng.uniform(-0.025, 0.025)
        ondula = 0.0012 * np.sin(lv / 0.006 + k)
        azul = np.exp(-((lu - donde - ondula) / 0.00045) ** 2) * en_cuarto
        color = color * (1 - azul[..., None]) + np.array([0.10, 0.30, 0.78])[None, None, :] * azul[..., None]
    ao = np.clip(oclusion, 0, 1) ** 1.2
    color *= (0.30 + 0.70 * ao)[..., None]
    alto_tejido = 0.00012 * hilos + 0.00003 * ruido
    normales = mapa_de_normales(alto_tejido, 4 * margen / (0.92 * ancho))
    return np.clip(color, 0, 1).astype(np.float32), normales


def material_de_tela(nombre, color_o_imagen, normal, rugosidad, uv_normal=None, fuerza=1.0, dos_caras=False):
    m = bpy.data.materials.new(nombre)
    arbol, principal, _ = nodos(m)
    if isinstance(color_o_imagen, bpy.types.Image):
        tex = nodo_de_imagen(arbol, color_o_imagen, 'UVMap')
        arbol.links.new(tex.outputs['Color'], principal.inputs['Base Color'])
    else:
        principal.inputs['Base Color'].default_value = (*color_o_imagen, 1.0)
    principal.inputs['Roughness'].default_value = rugosidad
    principal.inputs['Metallic'].default_value = 0.0
    if normal is not None:
        poner_normal(arbol, principal, normal, uv_normal, fuerza)
    m.use_backface_culling = not dos_caras
    return m, arbol, principal


# ---------------------------------------------------------------------------------------------- la mesa entera


def comprobar_el_poste():
    """Con la mesa arriba del todo, el tubo interior tiene que seguir metido en el exterior: un hueco ahí se ve."""
    _, fondo, _ = TUBO_INTERIOR
    tope = COLLAR[2]
    metido = tope - (fondo + RECORRIDO)
    if metido < SOLAPE_MINIMO:
        raise RuntimeError(f'Con la mesa subida {RECORRIDO} m el tubo interior queda solo {metido * 1000:.0f} mm dentro del exterior.')
    print(f'  el tubo interior queda {metido * 1000:.0f} mm dentro del exterior con la mesa arriba del todo', flush=True)


def fabricar_la_arsenalera(args, destino):
    inicio = time.time()
    vaciar()
    comprobar_el_poste()
    base = construir_la_base()
    bandeja = construir_la_bandeja()
    funda = simular_la_funda(bandeja, args.cuadros)

    alturas = Alturas(-0.30, 0.30, -0.20, 0.20)
    compresa = construir_la_compresa(alturas)
    ocupacion = Ocupacion((COMPRESA['medio'][0] - 0.004, COMPRESA['medio'][1] - 0.004))
    instrumentos, recipientes, gasas = colocar(alturas, ocupacion)

    # Juntos por material: un objeto con un material es una llamada de dibujo, y catorce instrumentos sueltos
    # con tres aceros cada uno eran cuarenta.
    instrumental = unir(instrumentos, 'instrumental')

    sombra = plano_de_sombra(-0.72, 0.58, -0.65, 0.65)

    # ---- horneados. La oclusión de la compresa y de las gasas va a su color; la de la funda, a su mapa gris.
    oc = hornear_oclusion(compresa, 1024, 672, 0.03, 96)
    color = textura_de_la_compresa(difuminar(oc, 1.0))
    normal_algodon = mapa_de_normales(tejido_de_algodon() * 0.00008, 0.012 / 256)
    m, _, _ = material_de_tela('compresa', imagen('compresa-color', color),
                               imagen('algodon-normal', normal_algodon, sin_color=True), 0.88, 'tejido', 0.6)
    compresa.data.materials.append(m)

    oc = hornear_oclusion(gasas, 1024, 1024, 0.015, 96)
    color, normal = texturas_de_las_gasas(difuminar(oc, 1.0))
    m, _, _ = material_de_tela('gasa', imagen('gasa-color', color), imagen('gasa-normal', normal, sin_color=True), 0.92)
    gasas.data.materials.append(m)

    oc = hornear_oclusion(funda, 1024, 1024, 0.06, 128)
    oc = np.clip(difuminar(oc, 1.5), 0, 1) ** 1.2
    relieve = bpy.data.images.load(str(PUBLICO / 'tela-relieve.webp'), check_existing=True)
    relieve.colorspace_settings.name = 'Non-Color'
    # El relieve del paño a menos de la mitad: el del colchón es un algodón que se arruga, y una funda de SMS es
    # lisa; con la fuerza entera el azul salía moteado de lejos.
    m, arbol, _ = material_de_tela('funda', L._lineal(L._hex(AZUL_DEL_PANO)), relieve, 0.86, 'tejido', 0.35, dos_caras=True)
    poner_oclusion(arbol, imagen('funda-oclusion', np.repeat(oc[..., None], 3, axis=-1).astype(np.float32), sin_color=True), 'UVMap')
    funda.data.materials.append(m)

    hornear_la_sombra(sombra, 'mesa-arsenalera', 1024, 1024, 0.9, 128)

    # ---- los nodos que el simulador busca por su nombre.
    raiz = vacio('mesa-arsenalera')
    elevable = vacio('elevable', raiz)
    base.parent = raiz
    sombra.parent = raiz
    for ob in (bandeja, funda, compresa, gasas, recipientes, instrumental):
        ob.parent = elevable
    ruta = Path(destino) / 'mesa-arsenalera.glb'
    exportar(ruta, raiz)
    print(f'ARSENALERA en {time.time() - inicio:.0f} s', flush=True)
    return medir(ruta, ['mesa-arsenalera', 'base', 'elevable', 'bandeja', 'funda', 'compresa', 'instrumental', 'gasas', 'recipientes', 'sombra'])


# ============================================================================================ mesa quirúrgica
#
# En los ejes de Blender, con el origen en el centro de la cara de arriba del colchón: X el ancho, Y hacia la
# cabeza (−Z de glTF), Z hacia arriba. El suelo queda en z = −0,95.

SUELO = -0.95
ARRIBA_DEL_TABLERO = -0.11
CANTO_DEL_TABLERO = 0.06
MEDIO_ANCHO_DEL_TABLERO = 0.39
# Las tres secciones, de la cabeza a los pies, en Y de Blender (glTF z = −y): respaldo, asiento y piernas.
SECCIONES = [('respaldo', 0.960, 0.222), ('asiento', 0.214, -0.238), ('piernas', -0.246, -0.960)]
# La columna, bajo el tórax: glTF (0, ·, −0,45). Hacia la cabeza a propósito, para dejar libre el suelo bajo las
# piernas, que es por donde se mete la mesa de la arsenalera.
Y_DE_LA_COLUMNA = 0.45
# La base: glTF x ∈ [−0,30, 0,30], z ∈ [−0,95, 0,05].
BASE_X = 0.30
BASE_Y = (-0.05, 0.95)
ALTO_DE_LA_BASE = 0.12


def construir_el_tablero():
    piezas = []
    abajo = ARRIBA_DEL_TABLERO - CANTO_DEL_TABLERO
    for nombre, y0, y1 in SECCIONES:
        medio_largo, centro = (y0 - y1) / 2, (y0 + y1) / 2
        contorno, normales = rectangulo(MEDIO_ANCHO_DEL_TABLERO, medio_largo, 0.012, 4)
        # El cuerpo de la sección, pintado, y arriba la placa radiotransparente, oscura.
        perfil = redondear([(-0.012, 0.0, 0), (0.0, 0.0, 0.005), (0.0, 0.044, 0.0), (0.0, 0.0445, 0), (-0.0015, 0.046, 0),
                            (0.0, 0.0475, 0), (0.0, CANTO_DEL_TABLERO, 0.007), (-0.012, CANTO_DEL_TABLERO, 0)], 4)
        materiales = [0 if (perfil[j][1] + perfil[j + 1][1]) / 2 < 0.0458 else 1 for j in range(len(perfil) - 1)]
        v, f, m = barrer(contorno, normales, perfil, materiales)
        piezas.append(objeto(f'tablero-{nombre}', v + [0, centro, abajo], f, ['pintura', 'tablero'], m))

        # Los rieles: pletina DIN de 25 × 10 mm a cada lado, separada del canto por sus separadores para que
        # entre la mordaza de un accesorio.
        for lado in (1, -1):
            x_riel = lado * (MEDIO_ANCHO_DEL_TABLERO + 0.016 + 0.005)
            v, f, _ = caja((x_riel, centro, ARRIBA_DEL_TABLERO - 0.0255), (0.005, medio_largo - 0.022, 0.0125), 0.0015, 2, 3)
            piezas.append(objeto('riel', v, f, 'acero_pulido'))
            for t in (-1, 0, 1) if medio_largo > 0.3 else (-1, 1):
                y_sep = centro + t * (medio_largo - 0.06)
                v, f, _ = caja((lado * (MEDIO_ANCHO_DEL_TABLERO + 0.008), y_sep, ARRIBA_DEL_TABLERO - 0.0255),
                               (0.0085, 0.012, 0.008), 0.002, 2, 3)
                piezas.append(objeto('riel-separador', v, f, 'acero'))
    # Las bisagras, en las juntas: dos nudillos por junta y lado.
    for (_, _, y_fin), (_, y_inicio, _) in zip(SECCIONES[:-1], SECCIONES[1:]):
        y_j = (y_fin + y_inicio) / 2
        for lado in (1, -1):
            colocar = Matrix.Translation((lado * 0.335, y_j, abajo + 0.020)) @ Matrix.Rotation(radians(90), 4, 'Y')
            v, f, _ = revolucion(redondear([(0, -0.025, 0), (0.0095, -0.025, 0.002), (0.0095, 0.025, 0.002), (0, 0.025, 0)], 2), 24)
            piezas.append(objeto('bisagra', mover(v, colocar), f, 'acero'))
    # El cabezal de la columna, bajo el respaldo: lo que articula el tablero sobre ella.
    v, f, _ = caja((0.0, Y_DE_LA_COLUMNA, abajo - 0.030), (0.175, 0.16, 0.030), 0.012, 3, 4)
    piezas.append(objeto('tablero-cabezal', v, f, 'pintura'))
    return unir(piezas, 'tablero')


# El mando de mano, colgado del riel derecho a la altura del asiento, y su cable en espiral hasta la columna.
# Va del lado +X y algo hacia la cabeza para que la arsenalera, que entra por los pies, no lo tape; y bajo el
# riel, porque el paño del simulador cuelga ocho centímetros y medio del canto del colchón (`comun.py`) y no
# llega hasta él.
MANDO = {'x': 0.434, 'y': 0.10, 'arriba': -0.170, 'alto': 0.200, 'medio': (0.016, 0.033)}
PASACABLES = (0.150, Y_DE_LA_COLUMNA, -0.62)


def bezier(p0, p1, p2, p3, n):
    t = np.linspace(0.0, 1.0, n)[:, None]
    p0, p1, p2, p3 = (np.asarray(q, dtype=float) for q in (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def espiral(curva, radio, paso, por_vuelta=10):
    """
    Una hélice enrollada alrededor de una curva: el camino del cable de un mando.

    Se reparte la curva por longitud y no por parámetro, o las vueltas se apretarían donde la curva va despacio.
    El radio crece desde cero en la primera vuelta y vuelve a cero en la última, para que el tramo recto de cada
    punta entre en la espiral sin un codo.
    """
    tramos = np.linalg.norm(np.diff(curva, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(tramos)])
    largo = s[-1]
    vueltas = largo / paso
    n = int(round(vueltas * por_vuelta)) + 1
    si = np.linspace(0.0, largo, n)
    puntos = np.stack([np.interp(si, s, curva[:, k]) for k in range(3)], axis=-1)
    tangentes = np.gradient(puntos, axis=0)
    tangentes /= np.linalg.norm(tangentes, axis=1)[:, None]
    # Marco transportado sin torcer, el mismo de `barrido` en `lib.py`: con uno fijo, la hélice se aplasta
    # donde la curva se vuelve paralela a él.
    normal = np.cross(tangentes[0], [0.0, 0.0, 1.0])
    normal /= np.linalg.norm(normal)
    salida = []
    for k in range(n):
        tg = tangentes[k]
        normal = normal - tg * normal.dot(tg)
        normal /= np.linalg.norm(normal)
        binormal = np.cross(tg, normal)
        angulo = 2 * pi * si[k] / paso
        r = radio * min(1.0, si[k] / paso, (largo - si[k]) / paso)
        salida.append(puntos[k] + r * (cos(angulo) * normal + sin(angulo) * binormal))
    return np.array(salida)


def construir_el_mando():
    """El mando: cuerpo, carátula con sus doce teclas, gancho sobre el riel, protector del cable y el cable."""
    piezas = []
    x, y, arriba, alto = MANDO['x'], MANDO['y'], MANDO['arriba'], MANDO['alto']
    mx, my = MANDO['medio']
    centro_z = arriba - alto / 2
    v, f, _ = caja((x, y, centro_z), (mx, my, alto / 2), 0.009, 4, 5)
    piezas.append(objeto('mando-cuerpo', v, f, 'pintura'))
    frente = x + mx
    v, f, _ = caja((frente - 0.0004, y, centro_z - 0.004), (0.0012, my - 0.007, alto / 2 - 0.016), 0.005, 2, 4)
    piezas.append(objeto('mando-caratula', v, f, 'plastico_negro'))
    for fila in range(6):
        for columna in (-1, 1):
            v, f, _ = caja((frente + 0.0012, y + columna * 0.0125, arriba - 0.040 - fila * 0.025), (0.0012, 0.0085, 0.0065), 0.0011, 2, 3)
            piezas.append(objeto('mando-tecla', v, f, 'plastico_gris'))

    # El gancho: una pletina de dos milímetros que sube por la espalda del mando, pasa sobre el riel y baja por
    # dentro, entre el riel y el canto del tablero, que es el hueco que dejan los separadores.
    espalda = x - mx
    camino = [(espalda + 0.0006, y, arriba - 0.012), (espalda + 0.0006, y, -0.128)]
    camino += [(0.4108 + 0.0072 * cos(radians(a)), y, -0.128 + 0.0072 * sin(radians(a))) for a in range(0, 181, 15)]
    camino += [(0.4036, y, -0.142)]
    bm = bmesh.new()
    L.barrido(bm, camino, L.circulo(0.001, 12, ry=0.007))
    piezas.append(objeto_de_bmesh('mando-gancho', bm, 'acero'))

    # El protector del cable bajo el mando, y el cable: recto al salir, en espiral mientras cuelga, recto al
    # entrar en el pasacables de la columna.
    fondo = arriba - alto
    v, f, _ = revolucion(redondear([(0, 0.0, 0), (0.0065, 0.0, 0.001), (0.0032, -0.020, 0.001), (0, -0.020, 0)], 2), 16)
    piezas.append(objeto('mando-protector', v + [x, y, fondo + 0.001], f, 'plastico_negro'))
    px, py, pz = PASACABLES
    inicio, fin = np.array([x, y, fondo - 0.045]), np.array([px + 0.045, py, pz])
    curva = bezier(inicio, inicio + [0.0, 0.0, -0.20], fin + [0.17, -0.08, -0.10], fin, 200)
    camino = [(x, y, fondo - 0.012)] + espiral(curva, 0.0055, 0.0045).tolist() + [(px + 0.010, py, pz)]
    bm = bmesh.new()
    L.barrido(bm, camino, L.circulo(0.0016, 6))
    piezas.append(objeto_de_bmesh('mando-cable', bm, 'pintura'))
    return unir(piezas, 'mando')


def construir_la_columna():
    piezas = []
    arriba_de_la_base = SUELO + ALTO_DE_LA_BASE
    abajo_del_cabezal = ARRIBA_DEL_TABLERO - CANTO_DEL_TABLERO - 0.060
    # Dos tramos telescópicos: el de abajo, pintado como la base; el de arriba, de acero, entrando en él.
    contorno, normales = rectangulo(0.150, 0.110, 0.045, 10)
    alto_1 = 0.36
    perfil = redondear([(-0.03, 0.0, 0), (0.008, 0.0, 0.004), (0.0, 0.012, 0.006), (0.0, alto_1 - 0.012, 0.0),
                        (0.0025, alto_1 - 0.008, 0.0015), (0.0025, alto_1, 0.0015), (-0.012, alto_1, 0)], 4)
    materiales = [0 if (perfil[j][1] + perfil[j + 1][1]) / 2 < alto_1 - 0.01 else 1 for j in range(len(perfil) - 1)]
    v, f, m = barrer(contorno, normales, perfil, materiales)
    piezas.append(objeto('columna-abajo', v + [0, Y_DE_LA_COLUMNA, arriba_de_la_base], f, ['pintura', 'plastico_negro'], m))
    contorno, normales = rectangulo(0.137, 0.097, 0.036, 10)
    desde = arriba_de_la_base + alto_1 - 0.02
    alto_2 = abajo_del_cabezal - desde
    perfil = redondear([(-0.03, 0.0, 0), (0.0, 0.0, 0), (0.0, alto_2, 0.006), (-0.03, alto_2, 0)], 4)
    v, f, _ = barrer(contorno, normales, perfil)
    piezas.append(objeto('columna-arriba', v + [0, Y_DE_LA_COLUMNA, desde], f, 'acero_cepillado'))
    # El pasacables por donde entra el cable del mando.
    px, py, pz = PASACABLES
    colocar = Matrix.Translation((px - 0.002, py, pz)) @ Matrix.Rotation(radians(90), 4, 'Y')
    v, f, _ = revolucion(redondear([(0, 0.0, 0), (0.0068, 0.0, 0), (0.0068, 0.005, 0.0012), (0.0042, 0.007, 0), (0.0042, 0.014, 0.001), (0, 0.014, 0)], 2), 20)
    piezas.append(objeto('columna-pasacables', mover(v, colocar), f, 'plastico_negro'))
    return unir(piezas, 'columna')


def construir_la_base_quirurgica():
    piezas = []
    medio_y = (BASE_Y[1] - BASE_Y[0]) / 2
    centro_y = (BASE_Y[1] + BASE_Y[0]) / 2
    contorno, normales = rectangulo(BASE_X, medio_y, 0.07, 12)
    # De abajo arriba: el parachoques de goma, que es lo más ancho, y encima el cuerpo pintado, un poco metido.
    perfil = redondear([(-0.05, 0.0, 0), (-0.003, 0.0, 0.002), (0.0, 0.005, 0.004), (0.0, 0.029, 0.004), (-0.006, 0.033, 0.0015),
                        (-0.006, 0.034, 0.0), (-0.006, ALTO_DE_LA_BASE, 0.024), (-0.05, ALTO_DE_LA_BASE, 0)], 4)
    materiales = [1 if (perfil[j][1] + perfil[j + 1][1]) / 2 < 0.0335 else 0 for j in range(len(perfil) - 1)]
    v, f, m = barrer(contorno, normales, perfil, materiales)
    piezas.append(objeto('base-cuerpo', v + [0, centro_y, SUELO], f, ['pintura', 'goma'], m))
    # La tapa de acero sobre la base, y el zócalo de la columna.
    contorno, normales = rectangulo(BASE_X - 0.045, medio_y - 0.045, 0.045, 12)
    perfil = redondear([(-0.03, 0.0, 0), (0.0, 0.0, 0.0), (0.0, 0.003, 0.002), (-0.03, 0.004, 0)], 3)
    v, f, _ = barrer(contorno, normales, perfil)
    piezas.append(objeto('base-tapa', v + [0, centro_y, SUELO + ALTO_DE_LA_BASE - 0.0005], f, 'acero_cepillado'))
    contorno, normales = rectangulo(0.172, 0.132, 0.055, 10)
    perfil = redondear([(-0.03, 0.0, 0), (0.0, 0.0, 0.0), (0.0, 0.008, 0.006), (-0.03, 0.010, 0)], 3)
    v, f, _ = barrer(contorno, normales, perfil)
    piezas.append(objeto('base-zocalo', v + [0, Y_DE_LA_COLUMNA, SUELO + ALTO_DE_LA_BASE + 0.003], f, 'pintura'))
    return unir(piezas, 'base')


def fabricar_la_quirurgica(args, destino):
    inicio = time.time()
    vaciar()
    tablero = construir_el_tablero()
    # El mando en un nodo propio y no dentro del tablero: con él dentro, la caja del tablero bajaba hasta el
    # cable, a medio metro del suelo, y quien la midiera para saber dónde acaba el tablero se equivocaba.
    mando = construir_el_mando()
    columna = construir_la_columna()
    base = construir_la_base_quirurgica()
    sombra = plano_de_sombra(-0.75, 0.75, -1.35, 1.35, SUELO + 0.002)
    # El colchón también hace sombra: se trae solo para hornear y se quita antes de exportar.
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(PUBLICO / 'colchon.glb'))
    colchon = [o for o in bpy.data.objects if o not in antes]
    hornear_la_sombra(sombra, 'mesa-quirurgica', 512, 1024, 0.8, 128, fuerza=0.8)
    for o in colchon:
        bpy.data.objects.remove(o)
    raiz = vacio('mesa-quirurgica')
    for ob in (tablero, mando, columna, base, sombra):
        ob.parent = raiz
    ruta = Path(destino) / 'mesa-quirurgica.glb'
    exportar(ruta, raiz)
    print(f'QUIRURGICA en {time.time() - inicio:.0f} s', flush=True)
    return medir(ruta, ['mesa-quirurgica', 'tablero', 'mando', 'columna', 'base', 'sombra'])


# ============================================================================================ vistas

# El fondo de pabellón: un gris verdoso, en sRGB.
FONDO = (0.47, 0.53, 0.50)
SUELO_DEL_PABELLON = (0.40, 0.45, 0.43)


def luz(nombre, sitio, hacia, tamano, potencia, color=(1.0, 1.0, 1.0)):
    dato = bpy.data.lights.new(nombre, 'AREA')
    dato.shape = 'DISK'
    dato.size = tamano
    dato.energy = potencia
    dato.color = color
    ob = bpy.data.objects.new(nombre, dato)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = sitio
    ob.rotation_euler = (Vector(hacia) - Vector(sitio)).to_track_quat('-Z', 'Y').to_euler()
    return ob


def estudio(muestras, suelo_z):
    """
    Un pabellón de mentira: fondo gris verdoso, el suelo de vinilo y una lámpara grande encima. No es el aspecto
    final —eso lo dan las luces del simulador—, pero el acero necesita algo que reflejar para leerse como acero.
    """
    escena = bpy.context.scene
    usar_la_grafica()
    escena.cycles.samples = muestras
    escena.cycles.use_denoising = True
    escena.render.resolution_x, escena.render.resolution_y = 1600, 1000
    escena.render.image_settings.file_format = 'PNG'
    # AgX y no Standard como `vistas.py`: aquí hay acero pulido, y con Standard sus brillos se queman en blanco
    # plano. Pero AgX solo lava los colores saturados, y el azul de la funda salía celeste; el aspecto «Punchy»
    # devuelve la saturación sin perder los brillos.
    escena.view_settings.view_transform = 'AgX'
    try:
        escena.view_settings.look = 'AgX - Punchy'
    except TypeError:
        pass
    mundo = bpy.data.worlds.new('pabellon')
    escena.world = mundo
    if hasattr(mundo, 'use_nodes') and not mundo.use_nodes:
        mundo.use_nodes = True
    arbol = mundo.node_tree
    fondo = next((n for n in arbol.nodes if n.type == 'BACKGROUND'), None)
    if fondo is None:
        fondo = arbol.nodes.new('ShaderNodeBackground')
        salida = next((n for n in arbol.nodes if n.type == 'OUTPUT_WORLD'), None) or arbol.nodes.new('ShaderNodeOutputWorld')
        arbol.links.new(fondo.outputs['Background'], salida.inputs['Surface'])
    fondo.inputs['Color'].default_value = (*L._lineal(FONDO), 1.0)
    fondo.inputs['Strength'].default_value = 0.6
    v = np.array([[-8, -8, suelo_z], [8, -8, suelo_z], [8, 8, suelo_z], [-8, 8, suelo_z]])
    suelo = objeto('suelo-del-pabellon', v, [[0, 1, 2, 3]], [], ponderar=False)
    m = bpy.data.materials.new('vinilo')
    _, p, _ = nodos(m)
    p.inputs['Base Color'].default_value = (*L._lineal(SUELO_DEL_PABELLON), 1.0)
    p.inputs['Roughness'].default_value = 0.45
    suelo.data.materials.append(m)
    luz('lampara', (0.3, -0.4, suelo_z + 2.9), (0.0, 0.0, suelo_z), 1.0, 450, (1.0, 0.98, 0.95))
    luz('relleno', (-2.4, -1.6, suelo_z + 1.8), (0.0, 0.0, suelo_z + 0.7), 2.4, 220, (0.85, 0.92, 1.0))
    luz('contraluz', (1.6, 2.4, suelo_z + 1.7), (0.0, 0.0, suelo_z + 0.7), 1.6, 220, (0.95, 0.97, 1.0))


def camara(sitio, hacia, focal):
    dato = bpy.data.cameras.new('camara')
    dato.lens = focal
    dato.clip_start, dato.clip_end = 0.02, 50.0
    ob = bpy.data.objects.new('camara', dato)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = sitio
    ob.rotation_euler = (Vector(hacia) - Vector(sitio)).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = ob
    return ob


def importar(ruta):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ruta))
    return [o for o in bpy.data.objects if o not in antes]


def material_del_colchon():
    m = bpy.data.materials.new('colchon')
    _, p, _ = nodos(m)
    p.inputs['Base Color'].default_value = (*L._lineal((0.105, 0.110, 0.125)), 1.0)
    p.inputs['Roughness'].default_value = 0.46
    return m


def fotografiar(nombre, vistas):
    carpeta = SALIDA / 'vistas'
    carpeta.mkdir(parents=True, exist_ok=True)
    rutas = []
    for vista, (sitio, hacia, focal) in vistas.items():
        camara(sitio, hacia, focal)
        ruta = carpeta / f'{nombre}-{vista}.png'
        bpy.context.scene.render.filepath = str(ruta)
        inicio = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'VISTA {ruta} ({time.time() - inicio:.0f} s)', flush=True)
        rutas.append(ruta)
    return rutas


def hacer_las_vistas(args, destino, piezas):
    rutas = []
    if 'arsenalera' in piezas:
        vaciar()
        estudio(args.muestras, 0.0)
        importar(Path(destino) / 'mesa-arsenalera.glb')
        rutas += fotografiar('mesa-arsenalera', {
            'tres-cuartos': ((1.30, -1.45, 1.60), (0.0, 0.0, 0.68), 40),
            'lateral': ((0.05, -2.6, 0.80), (-0.03, 0.0, 0.55), 45),
            'bandeja': ((0.10, -0.62, 1.52), (0.0, -0.01, 0.985), 45),
        })
    if 'quirurgica' in piezas:
        vaciar()
        estudio(args.muestras, SUELO)
        importar(Path(destino) / 'mesa-quirurgica.glb')
        rutas += fotografiar('mesa-quirurgica', {
            'tres-cuartos': ((2.1, -2.4, 0.75), (0.0, 0.0, -0.45), 35),
            'lateral': ((2.9, 0.0, -0.35), (0.0, 0.0, -0.50), 40),
        })
    if 'arsenalera' in piezas and 'quirurgica' in piezas:
        vaciar()
        estudio(args.muestras, SUELO)
        importar(Path(destino) / 'mesa-quirurgica.glb')
        for o in importar(PUBLICO / 'colchon.glb'):
            if o.type == 'MESH':
                o.data.materials.clear()
                o.data.materials.append(material_del_colchon())
        nuevos = importar(Path(destino) / 'mesa-arsenalera.glb')
        raiz = next(o for o in nuevos if o.name.startswith('mesa-arsenalera'))
        # Al lado de la camilla, con la bandeja sobre las piernas y subida del todo, como en un caso de tobillo.
        # En glTF: girada media vuelta, en (0,16, −0,95, 0,55).
        raiz.matrix_world = Matrix.Translation((0.16, -0.55, SUELO)) @ Matrix.Rotation(radians(180), 4, 'Z')
        next(o for o in nuevos if o.name.startswith('elevable')).location.z += RECORRIDO
        rutas += fotografiar('conjunto', {
            'tres-cuartos': ((2.2, -2.7, 1.05), (0.05, -0.25, -0.30), 35),
            'pies': ((0.6, -3.0, 0.45), (0.05, -0.2, -0.25), 38),
        })
    return rutas


# ============================================================================================ principal


def principal():
    args = argumentos()
    destino = Path(args.destino)
    piezas = ('arsenalera', 'quirurgica') if args.pieza == 'todo' else (args.pieza,)
    inicio = time.time()
    informes = []
    if 'arsenalera' in piezas:
        informes.append(fabricar_la_arsenalera(args, destino))
    if 'quirurgica' in piezas:
        informes.append(fabricar_la_quirurgica(args, destino))
    if args.vistas:
        hacer_las_vistas(args, destino, piezas)
    print(f'TODO en {time.time() - inicio:.0f} s', flush=True)
    for informe in informes:
        print('INFORME', json.dumps(informe, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    principal()

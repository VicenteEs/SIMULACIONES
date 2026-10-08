"""
Biblioteca común de los guiones de instrumental (P-001, E5.4).

Cada instrumento es un guion de Python que se ejecuta con Blender sin ventana:

    blender --background --factory-startup --python scripts/instrumental/<nombre>.py

y escribe un `.glb` (y una vista previa en PNG) en `ejemplos/instrumental/`.

Convenios, y por qué:

- **Se modela en milímetros** (1 unidad de Blender = 1 mm) porque las medidas
  de los catálogos están en milímetros y así se leen las cifras del guion sin
  convertir. Al exportar se pasa todo a metros, que es lo que espera glTF.
- **Eje largo hacia arriba y punta en el origen.** El instrumento «se para»
  sobre su punta de trabajo y su mango sube por +Z de Blender (que es +Y en
  glTF). Es la pose que necesita el simulador para colocarlo sobre el foco sin
  dar vueltas, y la que enseña mejor el visor.
- **Una pieza que se mueve es un empty «pivote»** cuyo origen está exactamente
  en el eje de giro (el tornillo de una tijera, la bisagra de una pinza). Las
  mallas que se mueven cuelgan de él. Así girar el nodo es girar sobre el
  punto correcto, sin cuentas en el simulador.
- **La articulación se describe en el propio archivo**, en el `extras` de los
  nodos como un JSON bajo la clave `th` (TraumaHub). Una cadena y no un
  diccionario de propiedades: el exportador de glTF trata distinto cada versión
  de Blender los diccionarios anidados, y una cadena viaja igual en todas.
- **Nombres en español y sin tildes**, para poder leerlos en el taller.
"""

import bpy
import bmesh
import json
import math
import os
import sys
from math import pi, sin, cos, radians, sqrt, atan2
from mathutils import Vector, Matrix, Quaternion

# --------------------------------------------------------------------------
# Escena y materiales
# --------------------------------------------------------------------------


def nueva_escena():
    """Escena vacía. Se parte siempre de cero para que dos corridas den el mismo archivo."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 0.001


def _lineal(c):
    """sRGB (0-1) a lineal, que es lo que guarda Blender y lo que espera glTF."""
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in c)


def _hex(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


# (color sRGB, metálico, rugosidad, barniz). Son colores de instrumental real:
# acero inoxidable satinado, pulido, anodizados de los juegos AO, plásticos.
MATERIALES = {
    'acero':            ('#C7CACE', 1.0, 0.30, 0.0),
    'acero_pulido':     ('#DADDE1', 1.0, 0.13, 0.0),
    'acero_cepillado':  ('#B9BEC4', 1.0, 0.42, 0.0),
    'acero_oscuro':     ('#555A60', 0.9, 0.48, 0.0),
    'acero_azulado':    ('#9FA9B8', 1.0, 0.22, 0.0),
    'aluminio':         ('#BDC1C7', 1.0, 0.55, 0.0),
    'titanio':          ('#8D939B', 1.0, 0.36, 0.0),
    'azul_anodizado':   ('#2B5DA6', 0.85, 0.34, 0.0),
    'verde_anodizado':  ('#1F8A4C', 0.82, 0.34, 0.0),
    'dorado_anodizado': ('#D2A33A', 0.92, 0.30, 0.0),
    'rojo_anodizado':   ('#B52B2B', 0.82, 0.34, 0.0),
    'negro_anodizado':  ('#202225', 0.8, 0.40, 0.0),
    'negro_mate':       ('#1B1C1F', 0.0, 0.45, 0.0),
    'negro_goma':       ('#111214', 0.0, 0.72, 0.0),
    'gris_plastico':    ('#7C828A', 0.0, 0.48, 0.2),
    'gris_claro':       ('#C9CCD1', 0.0, 0.45, 0.2),
    'blanco_plastico':  ('#E9EAEC', 0.0, 0.42, 0.3),
    'amarillo':         ('#F2C21F', 0.0, 0.38, 0.3),
    'azul_boton':       ('#2468D8', 0.0, 0.38, 0.3),
    'naranja':          ('#E8742A', 0.0, 0.5, 0.2),
    'violeta':          ('#6A3FA3', 0.0, 0.55, 0.0),
    'hilo_incoloro':    ('#E7E1CF', 0.0, 0.6, 0.0),
    'hilo_negro':       ('#141416', 0.0, 0.55, 0.0),
    'cobre':            ('#B8733E', 1.0, 0.3, 0.0),
    'laton':            ('#C9A24B', 1.0, 0.3, 0.0),
    'madera_oscura':    ('#4B3425', 0.0, 0.55, 0.1),
}
_cache_materiales = {}


def material(clave):
    if clave in _cache_materiales:
        return _cache_materiales[clave]
    color, metal, rug, barniz = MATERIALES[clave]
    m = bpy.data.materials.new(clave)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*_lineal(_hex(color)), 1.0)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rug
    if 'Coat Weight' in p.inputs:
        p.inputs['Coat Weight'].default_value = barniz
    _cache_materiales[clave] = m
    return m


# --------------------------------------------------------------------------
# Primitivas sobre bmesh. Todas devuelven la lista de vértices que crean y
# aceptan una matriz `M` de colocación (por omisión, la identidad).
# --------------------------------------------------------------------------

I4 = Matrix.Identity(4)


def colocar(p0, p1, rolido=0.0):
    """Matriz que lleva +Z local a la recta p0→p1, con origen en p0."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    if d.length < 1e-9:
        return Matrix.Translation(p0)
    q = d.to_track_quat('Z', 'Y')
    M = Matrix.Translation(p0) @ q.to_matrix().to_4x4()
    if rolido:
        M = M @ Matrix.Rotation(rolido, 4, 'Z')
    return M


def _anillo(bm, M, puntos):
    return [bm.verts.new(M @ Vector(p)) for p in puntos]


def _unir(bm, a, b, cerrado=True):
    """Caras entre dos anillos de igual tamaño."""
    n = len(a)
    for i in range(n if cerrado else n - 1):
        j = (i + 1) % n
        try:
            bm.faces.new((a[i], a[j], b[j], b[i]))
        except ValueError:
            pass


def _tapa(bm, anillo, invertir=False):
    try:
        bm.faces.new(anillo[::-1] if invertir else anillo)
    except ValueError:
        pass


def torno(bm, perfil, seg=24, M=I4, tapas=True, giro=0.0):
    """
    Sólido de revolución. `perfil` es una lista de (altura, radio) a lo largo
    de +Z local. Repetir una altura con otro radio hace un escalón (un hombro,
    un chaflán) sin suavizado entre los dos anillos.
    """
    anillos = []
    for h, r in perfil:
        if r <= 1e-6:
            anillos.append(('punta', h))
        else:
            anillos.append(('anillo', _anillo(bm, M, [(r * cos(giro + 2 * pi * i / seg), r * sin(giro + 2 * pi * i / seg), h) for i in range(seg)])))
    prev = None
    for tipo, dato in anillos:
        if prev is not None:
            pt, pd = prev
            if pt == 'anillo' and tipo == 'anillo':
                _unir(bm, pd, dato)
            elif pt == 'anillo' and tipo == 'punta':
                v = bm.verts.new(M @ Vector((0, 0, dato)))
                for i in range(seg):
                    try:
                        bm.faces.new((pd[i], pd[(i + 1) % seg], v))
                    except ValueError:
                        pass
            elif pt == 'punta' and tipo == 'anillo':
                v = bm.verts.new(M @ Vector((0, 0, pd)))
                for i in range(seg):
                    try:
                        bm.faces.new((dato[(i + 1) % seg], dato[i], v))
                    except ValueError:
                        pass
        prev = (tipo, dato)
    if tapas:
        if anillos[0][0] == 'anillo':
            _tapa(bm, anillos[0][1], invertir=True)
        if anillos[-1][0] == 'anillo':
            _tapa(bm, anillos[-1][1])


def cilindro(bm, p0, p1, r0, r1=None, seg=20, tapas=True, rolido=0.0):
    """Cilindro o tronco de cono entre dos puntos cualesquiera."""
    r1 = r0 if r1 is None else r1
    L = (Vector(p1) - Vector(p0)).length
    torno(bm, [(0, r0), (L, r1)], seg, colocar(p0, p1, rolido), tapas)


def caja(bm, centro, tam, M=I4):
    """Caja alineada con los ejes locales; `tam` es (ancho X, largo Y, alto Z)."""
    cx, cy, cz = centro
    hx, hy, hz = tam[0] / 2, tam[1] / 2, tam[2] / 2
    v = _anillo(bm, M, [(cx + sx * hx, cy + sy * hy, cz + sz * hz) for sz in (-1, 1) for sy in (-1, 1) for sx in (-1, 1)])
    for c in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([v[i] for i in c])


def esfera(bm, centro, r, seg=16, anillos=10, M=I4):
    perfil = [(-r * cos(pi * k / anillos), r * sin(pi * k / anillos)) for k in range(0, anillos + 1)]
    torno(bm, perfil, seg, M @ Matrix.Translation(Vector(centro)))


def prisma(bm, contorno, z0, z1, M=I4):
    """Extrusión de un contorno 2D (x, y), sentido antihorario, entre dos alturas Z locales."""
    a = _anillo(bm, M, [(x, y, z0) for x, y in contorno])
    b = _anillo(bm, M, [(x, y, z1) for x, y in contorno])
    _unir(bm, a, b)
    _tapa(bm, a, invertir=True)
    _tapa(bm, b)
    return a, b


def prisma_plano(bm, contorno, y0, y1, M=I4):
    """Como `prisma`, pero el contorno está en el plano XZ y se extruye a lo largo de Y."""
    a = _anillo(bm, M, [(x, y0, z) for x, z in contorno])
    b = _anillo(bm, M, [(x, y1, z) for x, z in contorno])
    _unir(bm, a, b)
    _tapa(bm, a)
    _tapa(bm, b, invertir=True)
    return a, b


def barrido(bm, camino, seccion, escala=None, cerrado=False, tapas=True, M=I4):
    """
    Barre una sección (lista de (u, v)) a lo largo de un camino (lista de
    puntos 3D). El marco se transporta sin torcerse, así que una aguja curva
    o una varilla doblada no se retuerce al pasar por una curva.
    `escala(t)` con t en 0..1 estrecha o ensancha la sección a lo largo del camino.
    """
    pts = [Vector(p) for p in camino]
    n = len(pts)
    tangentes = []
    for i in range(n):
        if cerrado:
            t = pts[(i + 1) % n] - pts[(i - 1) % n]
        elif i == 0:
            t = pts[1] - pts[0]
        elif i == n - 1:
            t = pts[-1] - pts[-2]
        else:
            t = pts[i + 1] - pts[i - 1]
        tangentes.append(t.normalized())
    ref = Vector((0, 0, 1)) if abs(tangentes[0].z) < 0.9 else Vector((1, 0, 0))
    nor = (ref - tangentes[0] * ref.dot(tangentes[0])).normalized()
    anillos = []
    for i in range(n):
        t = tangentes[i]
        nor = (nor - t * nor.dot(t))
        if nor.length < 1e-9:
            nor = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            nor = (nor - t * nor.dot(t))
        nor = nor.normalized()
        bi = t.cross(nor).normalized()
        k = 1.0 if escala is None else escala(i / max(1, n - 1))
        anillos.append(_anillo(bm, M, [pts[i] + nor * u * k + bi * v * k for u, v in seccion]))
    for i in range(n - 1):
        _unir(bm, anillos[i], anillos[i + 1])
    if cerrado:
        _unir(bm, anillos[-1], anillos[0])
    elif tapas:
        _tapa(bm, anillos[0], invertir=True)
        _tapa(bm, anillos[-1])
    return anillos


def circulo(r, n=16, ry=None):
    ry = r if ry is None else ry
    return [(r * cos(2 * pi * i / n), ry * sin(2 * pi * i / n)) for i in range(n)]


def elipse_camino(cx, cy, a, b, n=40, z=0.0, plano='xy', arco=(0.0, 2 * pi)):
    """Puntos de una elipse, en el plano pedido ('xy' o 'xz')."""
    pts = []
    for i in range(n):
        t = arco[0] + (arco[1] - arco[0]) * i / n
        x, y = cx + a * cos(t), cy + b * sin(t)
        pts.append((x, y, z) if plano == 'xy' else (x, z, y))
    return pts


def argolla(bm, centro, a, b, grosor, fondo, plano='xy', n=44, M=I4):
    """
    Argolla de mango (el anillo por donde entra el dedo): un aro elíptico de
    sección ovalada. `grosor` es lo que mide el aro en su plano, `fondo` lo que
    mide perpendicular a él. Es la forma real: los aros planos y cuadrados
    se ven falsos en cuanto se acerca la cámara.
    """
    cx, cy, cz = centro
    if plano == 'xy':
        camino = [(cx + a * cos(2 * pi * i / n), cy + b * sin(2 * pi * i / n), cz) for i in range(n)]
    else:  # 'xz'
        camino = [(cx + a * cos(2 * pi * i / n), cy, cz + b * sin(2 * pi * i / n)) for i in range(n)]
    # La sección se da en (u, v): u = hacia fuera del aro, v = perpendicular al plano.
    seccion = [(grosor / 2 * cos(2 * pi * i / 12), fondo / 2 * sin(2 * pi * i / 12)) for i in range(12)]
    return barrido_aro(bm, camino, seccion, plano, centro, M)


def barrido_aro(bm, camino, seccion, plano, centro, M=I4):
    """Barrido de un camino cerrado con la sección orientada hacia fuera del centro (u) y fuera del plano (v)."""
    c = Vector(centro)
    n = len(camino)
    eje = Vector((0, 0, 1)) if plano == 'xy' else Vector((0, 1, 0))
    anillos = []
    for i in range(n):
        p = Vector(camino[i])
        u = (p - c)
        u = (u - eje * u.dot(eje)).normalized()
        anillos.append(_anillo(bm, M, [p + u * su + eje * sv for su, sv in seccion]))
    for i in range(n):
        _unir(bm, anillos[i], anillos[(i + 1) % n])
    return anillos


def bisel(bm, ancho=0.3, segmentos=1, angulo=35):
    """Redondea las aristas vivas. Un borde sin biselar no refleja la luz y hace el modelo plano."""
    bm.normal_update()
    aristas = []
    lim = radians(angulo)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            n0, n1 = e.link_faces[0].normal, e.link_faces[1].normal
            if n0.length > 1e-6 and n1.length > 1e-6 and n0.angle(n1) > lim:
                aristas.append(e)
    if aristas:
        bmesh.ops.bevel(bm, geom=aristas, offset=ancho, segments=segmentos, affect='EDGES', profile=0.5)


# --------------------------------------------------------------------------
# Objetos, pivotes y articulaciones
# --------------------------------------------------------------------------

_articulaciones = []  # se declara una vez por instrumento, en `declarar_articulacion`


def malla(nombre, bm, mat, padre=None, loc=(0, 0, 0), suave=True, angulo=40, unir_cercanos=0.0001, indice=None):
    """
    Crea un objeto malla desde un bmesh y le pone material y suavizado por ángulo.
    `mat` puede ser una lista de materiales; entonces `indice(centro_de_cara)`
    dice cuál le toca a cada cara (la hoja pulida y el mango satinado de una
    tijera son una sola pieza de acero con dos acabados).
    """
    if unir_cercanos:
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=unir_cercanos)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if indice is not None:
        for f in bm.faces:
            f.material_index = indice(f.calc_center_median())
    bm.normal_update()
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nombre, me)
    bpy.context.scene.collection.objects.link(ob)
    for m in (mat if isinstance(mat, (list, tuple)) else [mat]):
        ob.data.materials.append(material(m) if isinstance(m, str) else m)
    ob.location = loc
    if padre is not None:
        ob.parent = padre
    if suave:
        _suavizar(me, angulo)
    return ob


def _suavizar(me, angulo):
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    lim = radians(angulo)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2:
            n0, n1 = e.link_faces[0].normal, e.link_faces[1].normal
            e.smooth = (n0.length < 1e-6 or n1.length < 1e-6) or n0.angle(n1) <= lim
        else:
            e.smooth = True
    bm.to_mesh(me)
    bm.free()


def vacio(nombre, padre=None, loc=(0, 0, 0)):
    ob = bpy.data.objects.new(nombre, None)
    ob.empty_display_type = 'ARROWS'
    ob.empty_display_size = 5
    bpy.context.scene.collection.objects.link(ob)
    ob.location = loc
    if padre is not None:
        ob.parent = padre
    return ob


def _eje_gltf(eje):
    """Un eje de Blender (x, y, z) escrito en los ejes de glTF (y arriba): (x, z, -y)."""
    return [round(eje[0], 6), round(eje[2], 6), round(-eje[1], 6)]


def pivote(nombre, padre, loc, grupo, eje, factor=1.0, rot0=0.0):
    """
    Un nodo que gira. `grupo` es el nombre de la articulación a la que obedece
    (varias piezas pueden obedecer a la misma: las dos ramas de una pinza),
    `eje` el eje de giro en coordenadas de Blender, `factor` cuánto de la
    articulación recibe (con signo) y `rot0` el ángulo en grados con que nace
    el modelo (cerrado, normalmente 0).
    """
    p = vacio(nombre, padre, loc)
    p['th'] = json.dumps({'mueve': grupo, 'tipo': 'giro', 'eje': _eje_gltf(eje), 'factor': factor, 'reposo': rot0}, ensure_ascii=False)
    return p


def deslizador(nombre, padre, loc, grupo, eje, factor=1.0):
    """Un nodo que se desplaza en línea recta (la varilla de un medidor, un émbolo)."""
    p = vacio(nombre, padre, loc)
    p['th'] = json.dumps({'mueve': grupo, 'tipo': 'desliza', 'eje': _eje_gltf(eje), 'factor': factor}, ensure_ascii=False)
    return p


def declarar_articulacion(nombre, etiqueta, minimo, maximo, unidad='°', inicial=0.0):
    """Una articulación que el taller y el simulador ofrecen como deslizador."""
    _articulaciones.append({'nombre': nombre, 'etiqueta': etiqueta, 'min': minimo, 'max': maximo, 'unidad': unidad, 'inicial': inicial})


# --------------------------------------------------------------------------
# Exportación y vista previa
# --------------------------------------------------------------------------


def _a_metros():
    k = 0.001
    for ob in bpy.data.objects:
        ob.location = ob.location * k
        if ob.type == 'MESH':
            ob.data.transform(Matrix.Scale(k, 4))
            ob.data.update()


def triangulos():
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    total = 0
    for ob in bpy.data.objects:
        if ob.type == 'MESH':
            e = ob.evaluated_get(deps)
            me = e.to_mesh()
            me.calc_loop_triangles()
            total += len(me.loop_triangles)
            e.to_mesh_clear()
    return total


def meta_raiz(raiz, slug, nombre, medidas, partes=None, notas=''):
    raiz['th'] = json.dumps({
        'instrumento': slug,
        'nombre': nombre,
        'medidas': medidas,
        'articulaciones': list(_articulaciones),
        'notas': notas,
        'generado_por': 'scripts/instrumental/' + slug.replace('-', '_') + '.py',
    }, ensure_ascii=False)


def exportar(raiz, slug, carpeta, previa=True, vistas=None):
    """Exporta el `.glb` y, si se pide, la vista previa. Devuelve (ruta_glb, triangulos)."""
    os.makedirs(carpeta, exist_ok=True)
    tris = triangulos()
    # La vista previa se hace con el modelo todavía en milímetros: la cámara y
    # las luces se calculan sobre medidas que se leen sin cuentas.
    if previa:
        _vista_previa(os.path.join(carpeta, slug + '.png'), vistas)
    for ob in [o for o in bpy.data.objects if o.type in ('CAMERA', 'LIGHT')]:
        bpy.data.objects.remove(ob, do_unlink=True)
    _a_metros()
    ruta = os.path.join(carpeta, slug + '.glb')
    bpy.ops.object.select_all(action='DESELECT')
    kw = dict(filepath=ruta, export_format='GLB', export_apply=True, export_extras=True,
              export_cameras=False, export_lights=False, export_animations=False,
              export_materials='EXPORT', export_yup=True)
    try:
        bpy.ops.export_scene.gltf(**kw)
    except TypeError:
        for k in ('export_cameras', 'export_lights', 'export_animations'):
            kw.pop(k, None)
        bpy.ops.export_scene.gltf(**kw)
    print('EXPORTADO', ruta, os.path.getsize(ruta) // 1024, 'KB', tris, 'triangulos')
    return ruta, tris


def _caja_mundo():
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    bpy.context.view_layer.update()
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    return mn, mx


def _vista_previa(png, vistas=None):
    """
    Foto de estudio. Lo que ve la cámara es un fondo claro y liso; lo que ven
    los reflejos del metal es otra cosa: una cúpula oscura con grandes
    ventanas de luz. Un acero que sólo refleja blanco se pierde contra un
    fondo blanco y parece de plástico; con reflejos de contraste se lee como
    metal.
    """
    sc = bpy.context.scene
    mn, mx = _caja_mundo()
    centro = (mn + mx) / 2
    tam = (mx - mn)
    radio = max(tam.length * 0.5, 20)
    vistas = dict(vistas or {})
    # Para mirar un detalle de cerca sin tocar el guion:  ... -- --foco=60 --zoom=4 --az=20 --el=10
    for a in sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []:
        if a.startswith('--foco='):
            vistas['desplazar'] = (0, 0, float(a.split('=')[1]) - centro.z)
        elif a.startswith('--zoom='):
            vistas['distancia'] = vistas.get('distancia', 5.0) / float(a.split('=')[1])
        elif a.startswith('--az='):
            vistas['azimut'] = float(a.split('=')[1])
        elif a.startswith('--el='):
            vistas['elevacion'] = float(a.split('=')[1])
        elif a.startswith('--sufijo='):
            png = png.replace('.png', '-' + a.split('=')[1] + '.png')

    mundo = bpy.data.worlds.new('estudio')
    mundo.use_nodes = True
    nt = mundo.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    N = nt.nodes
    L = nt.links
    luz_cam = N.new('ShaderNodeLightPath')
    # Fondo que ve la cámara: degradado vertical en pantalla
    coord = N.new('ShaderNodeTexCoord')
    sep = N.new('ShaderNodeSeparateXYZ')
    r_fondo = N.new('ShaderNodeValToRGB')
    nt.links.new(coord.outputs['Window'], sep.inputs[0])
    nt.links.new(sep.outputs['Y'], r_fondo.inputs['Fac'])
    r_fondo.color_ramp.elements[0].position = 0.0
    r_fondo.color_ramp.elements[0].color = (0.50, 0.53, 0.58, 1)
    r_fondo.color_ramp.elements[1].position = 1.0
    r_fondo.color_ramp.elements[1].color = (0.86, 0.88, 0.91, 1)
    bg_cam = N.new('ShaderNodeBackground')
    nt.links.new(r_fondo.outputs['Color'], bg_cam.inputs['Color'])
    # Entorno que ven los reflejos: cúpula con degradado según la dirección
    dirc = N.new('ShaderNodeTexCoord')
    sep2 = N.new('ShaderNodeSeparateXYZ')
    r_env = N.new('ShaderNodeValToRGB')
    nt.links.new(dirc.outputs['Generated'], sep2.inputs[0])
    nt.links.new(sep2.outputs['Z'], r_env.inputs['Fac'])
    r_env.color_ramp.elements[0].position = 0.25
    r_env.color_ramp.elements[0].color = (0.015, 0.016, 0.02, 1)
    r_env.color_ramp.elements[1].position = 0.85
    r_env.color_ramp.elements[1].color = (0.55, 0.57, 0.62, 1)
    bg_env = N.new('ShaderNodeBackground')
    bg_env.inputs['Strength'].default_value = 0.65
    nt.links.new(r_env.outputs['Color'], bg_env.inputs['Color'])
    mezcla = N.new('ShaderNodeMixShader')
    nt.links.new(luz_cam.outputs['Is Camera Ray'], mezcla.inputs['Fac'])
    nt.links.new(bg_env.outputs['Background'], mezcla.inputs[1])
    nt.links.new(bg_cam.outputs['Background'], mezcla.inputs[2])
    salida = N.new('ShaderNodeOutputWorld')
    nt.links.new(mezcla.outputs['Shader'], salida.inputs['Surface'])
    sc.world = mundo

    # Piso: sólo recibe sombra, para que el instrumento no flote
    piso = bpy.data.objects.new('piso', bpy.data.meshes.new('piso'))
    bpy.context.scene.collection.objects.link(piso)
    bm = bmesh.new()
    s = radio * 10
    caja(bm, (0, 0, -0.5), (s, s, 1))
    bm.to_mesh(piso.data)
    bm.free()
    piso.location = (centro.x, centro.y, mn.z - 0.5)
    piso.data.materials.append(_material_piso())
    try:
        piso.is_shadow_catcher = True
    except Exception:
        pass

    def luz(nombre, loc, energia, tam_l, color=(1, 1, 1)):
        d = bpy.data.lights.new(nombre, 'AREA')
        d.energy = energia
        d.size = tam_l
        d.color = color
        o = bpy.data.objects.new(nombre, d)
        bpy.context.scene.collection.objects.link(o)
        o.location = loc
        o.rotation_euler = (centro - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        try:
            o.visible_camera = False
        except Exception:
            pass
    k = radio * 3.4
    f = (radio / 100) ** 2
    luz('llave', (centro.x + k * 0.9, centro.y - k * 0.9, centro.z + k * 0.8), 2.2e6 * f, radio * 2.6)
    luz('relleno', (centro.x - k * 1.1, centro.y - k * 0.5, centro.z + k * 0.25), 1.0e6 * f, radio * 3.2, (0.9, 0.95, 1.0))
    luz('contra', (centro.x - k * 0.3, centro.y + k * 1.1, centro.z + k * 0.6), 1.6e6 * f, radio * 2.2)
    luz('borde', (centro.x + k * 1.2, centro.y + k * 0.4, centro.z + k * 0.2), 0.8e6 * f, radio * 1.4, (1.0, 0.96, 0.9))

    cam_d = bpy.data.cameras.new('camara')
    cam_d.lens = vistas.get('lente', 85)
    cam_d.sensor_width = 36
    # Con 1 unidad = 1 mm, el recorte por omisión (1000) cortaba los instrumentos largos
    cam_d.clip_start = 1.0
    cam_d.clip_end = 100000.0
    cam = bpy.data.objects.new('camara', cam_d)
    bpy.context.scene.collection.objects.link(cam)
    az, el = vistas.get('azimut', 28), vistas.get('elevacion', 14)
    dist = radio * vistas.get('distancia', 5.0)
    objetivo = centro + Vector(vistas.get('desplazar', (0, 0, 0)))
    cam.location = objetivo + Vector((dist * cos(radians(el)) * sin(radians(az)), -dist * cos(radians(el)) * cos(radians(az)), dist * sin(radians(el))))
    cam.rotation_euler = (objetivo - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam

    sc.render.resolution_x, sc.render.resolution_y = vistas.get('resolucion', (1100, 1100))
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = vistas.get('exposicion', 0.0)
    try:
        sc.render.engine = 'CYCLES'
        sc.cycles.samples = 128
        sc.cycles.use_denoising = True
        sc.cycles.device = 'GPU'
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = 'OPTIX'
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
        except Exception:
            sc.cycles.device = 'CPU'
    except Exception:
        sc.render.engine = 'BLENDER_EEVEE'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = png
    bpy.ops.render.render(write_still=True)
    print('VISTA PREVIA', png)
    bpy.data.objects.remove(piso, do_unlink=True)


def _material_piso():
    m = bpy.data.materials.new('piso')
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (0.93, 0.94, 0.95, 1)
    p.inputs['Roughness'].default_value = 0.55
    return m


def iniciar(slug):
    """Prepara la escena para un instrumento y devuelve la carpeta de salida."""
    nueva_escena()
    _articulaciones.clear()
    raiz_repo = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    return os.path.join(raiz_repo, 'ejemplos', 'instrumental')

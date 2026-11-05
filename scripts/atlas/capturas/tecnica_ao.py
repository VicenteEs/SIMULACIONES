"""Dibuja la tibia y el peroné derechos con una fractura diafisaria reducida y fijada con una placa LCP: la imagen del
capítulo «Técnica AO» de la portada (abordaje, reducción y fijación), con fondo transparente.

    blender --background --factory-startup --python tecnica_ao.py -- --salida CARPETA [--ancho 880] [--alto 1280]
            [--muestras 160] [--nombre tecnica-osteosintesis] [--marcas]

`--salida` va absoluta: con una relativa Blender escribe en la raíz de la unidad C:, no donde se está parado. Con
`--marcas` imprime dónde caen en la imagen los tres puntos que la portada numera (líneas `MARCA`), medidos proyectando
con la misma cámara: si se cambia el encuadre, las posiciones de `PASOS_AO` en `Ilustraciones.tsx` se rehacen con esto.
`--giro` y `--acimut` cambian la cara de la placa y la cámara sin tocar las constantes, para probar encuadres.

La portada no usa el PNG sino un WebP con alfa, hecho con Pillow (casi todo el cuadro es transparente: pesa unos 18 kB):

    python -c "from PIL import Image; Image.open('CARPETA/tecnica-osteosintesis.png').save('src/components/portada/imagenes/tecnica-osteosintesis.webp', quality=85, method=6, alpha_quality=100)"

De dónde sale cada cosa (todo en metros, como el simulador):
- los huesos, de la pierna derecha del caso del simulador (`medios/modelos/pierna-derecha.glb`, malla `skeletal`), que es
  el esqueleto del atlas recortado. Es una malla muy aligerada (la tibia tiene 334 vértices): de cerca se le ven las
  facetas, así que se subdivide antes de nada. Subdividir redondea un poco la cresta tibial, que a este tamaño no se nota.
- la placa y los tornillos, del instrumental del simulador (`placa-lcp-recta-4-5.glb`, `tornillo-bloqueado-lcp-3-5.glb`),
  pero no a tamaño real: la placa, de 8 agujeros (16 × 134 mm), se alarga dos agujeros y todo se reduce al 80 %, porque
  la tibia del atlas es más delgada que una de verdad (ver `TRAMOS_AGREGADOS` y `ESCALA_DE_LOS_IMPLANTES`). Es una
  imagen, no una planificación: lo que se cuida es la proporción a la vista, no los milímetros.

Ejes de Blender en la pierna importada: z hacia arriba, el frente del cuerpo mira a -y y lo medial de la pierna derecha es
+x (la línea media del cuerpo está en x = 0).
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise
from bpy_extras.object_utils import world_to_camera_view

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opc = {'salida': None, 'ancho': 880, 'alto': 1280, 'muestras': 160, 'nombre': 'tecnica-osteosintesis', 'marcas': False,
       'giro': None, 'acimut': None}
i = 0
while i < len(args):
    k = args[i]
    if k in ('--salida', '--nombre'):
        opc[k[2:]] = args[i + 1]; i += 2
    elif k in ('--ancho', '--alto', '--muestras'):
        opc[k[2:]] = int(args[i + 1]); i += 2
    elif k in ('--giro', '--acimut'):
        # Para probar encuadres: el giro de la cara de la placa y el de la cámara, en grados desde anterior.
        opc[k[2:]] = float(args[i + 1]); i += 2
    elif k == '--marcas':
        opc['marcas'] = True; i += 1
    else:
        i += 1

SALIDA = Path(opc['salida'])
SALIDA.mkdir(parents=True, exist_ok=True)
MODELOS = Path('D:/simulaciones/medios/modelos')

# ------------------------------------------------------------------------------------------------ la fractura y la placa
# A qué altura cruza el trazo, en tanto por uno del largo de la tibia desde el maléolo. La unión del tercio medio con el
# distal está en 1/3; se sube un poco porque la placa es recta y, centrada más abajo, su extremo distal se metía en el
# ensanchamiento de la metáfisis (una placa recta no se moldea sola: en pabellón se usaría una precontorneada).
ALTURA_DEL_TRAZO = 0.40
# Oblicuo (42-A2, ≥ 30°): un trazo transverso, de frente, se lee como una raya cualquiera; el oblicuo se lee como fractura.
INCLINACION_DEL_TRAZO = 38
# La hendidura del trazo reducido: lo justo para que dibuje una línea fina. El plano del trazo contiene la dirección de
# la cámara, así que por la hendidura se ve el fondo de la tarjeta. Con 0,7 mm, a tamaño de tarjeta, el trazo se leía
# como un rayón y no como una fractura, y con 1,1 mm todavía se perdía: la placa tapa el medio del trazo y solo asoman
# sus dos puntas, de unos 5 mm, a los lados. Con 1,7 mm esas puntas se leen.
HENDIDURA = 0.0017
# Lo que se aparta el trazo del plano (dientes del borde), para que no parezca un corte de sierra.
DIENTES = 0.0009
# Hacia dónde mira la cara de la tibia donde va la placa, en grados desde anterior hacia medial: la cara medial de la
# diáfisis, la subcutánea, la del abordaje medial. En esta malla aligerada la diáfisis es casi redonda (se probó a
# buscar el giro donde la placa asienta mejor y salía cualquier cosa entre 50° y 70°), así que se elige por cómo se ve.
GIRO_DE_LA_PLACA = 58
# Desde dónde mira la cámara, en grados desde anterior hacia medial: 14° más atrás que la cara de la placa, que así se
# ve casi de frente. Girada 25° o más respecto de la placa, quedaba en el borde de la silueta y parecía pegada de canto.
# En esta malla el peroné va más por detrás que por fuera de la tibia (2,7 cm atrás y 1,4 cm afuera a la altura del
# trazo): con la cámara a 36° y la placa a 44° quedaba tapado entero y la imagen era un hueso suelto, no una pierna.
# Desde 72° asoma a la derecha de la tibia (lo posterior), separado por una rendija; a 80° se separa más, pero la placa
# se va contra el borde posterior de la tibia. De anterolateral también se vería, pero la placa medial, de canto.
ACIMUT_DE_LA_CAMARA = 72
# La placa del simulador es de 8 agujeros; se alarga (`alargar`) dos más. Sus agujeros van cada 16 mm.
PASO_DE_LOS_AGUJEROS = 0.016
TRAMOS_AGREGADOS = 2
# La placa y los tornillos, a escala. La tibia del atlas es delgada (unos 20 mm de ancho en la diáfisis) y la placa de
# 16 mm la cubría de borde a borde: se leía como una tira pegada encima y no como una placa sobre el hueso. Al 80 % deja
# hueso a los dos lados, que es la proporción de una placa estrecha sobre una tibia adulta.
ESCALA_DE_LOS_IMPLANTES = 0.8
# Qué agujeros llevan tornillo, por la distancia de su centro al centro de la placa ya alargada (mm, medidos sobre el
# glb a tamaño real): tres a cada lado del trazo; los dos agujeros del medio, libres, que es el tramo que trabaja sobre
# el foco, y los de las puntas también.
TORNILLOS_MM = (-59.1, -43.1, -27.1, 27.1, 43.1, 59.1)
# La placa: su origen está en el centro de su cara de abajo; la de arriba queda a 5,2 mm (a tamaño real).
GROSOR_DE_LA_PLACA = 0.0052 * ESCALA_DE_LOS_IMPLANTES
LARGO_DEL_TORNILLO = 0.0295 * ESCALA_DE_LOS_IMPLANTES  # del glb: punta en z = 0, cabeza arriba
HUNDIMIENTO_DE_LA_CABEZA = 0.0001  # la cabeza bloqueada queda enrasada con la placa


def importar(ruta):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ruta))
    nuevos = [o for o in bpy.data.objects if o not in antes]
    for o in nuevos:
        o.select_set(False)
    return nuevos


def aplicar_transformaciones(objeto):
    """Deja la malla en coordenadas del mundo: el glTF importa con padres vacíos y giros, y medir sobre la malla con la
    matriz a medias da alturas que no son las de la escena."""
    mundo = objeto.matrix_world.copy()
    objeto.parent = None
    objeto.matrix_world = mundo
    objeto.data.transform(mundo)
    objeto.matrix_world = Matrix.Identity(4)


def suavizar(objeto, niveles):
    """Subdivide y sombrea suave. Las normales personalizadas del glTF se quitan antes: con ellas la subdivisión deja el
    sombreado de las facetas viejas pintado encima de la superficie nueva."""
    bpy.context.view_layer.objects.active = objeto
    objeto.select_set(True)
    try:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    except RuntimeError:
        pass
    mod = objeto.modifiers.new('subdividir', 'SUBSURF')
    mod.levels = niveles
    mod.render_levels = niveles
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth()
    objeto.select_set(False)


def grosor(objeto):
    """Cuánto de tubo tiene una pieza: el menor de sus dos anchos principales dividido por el mayor. Un hueso largo es un
    tubo (cerca de 1); una lámina de tendón, una hoja (cerca de 0)."""
    puntos = np.array([v.co[:] for v in objeto.data.vertices])
    s = np.linalg.svd(puntos - puntos.mean(axis=0), compute_uv=False)
    return s[2] / s[1]


def tibia_y_perone():
    """Separa el esqueleto de la pierna en piezas sueltas y se queda con la tibia y el peroné.

    No basta con el alto: en esta malla van como «esqueleto» varias láminas de tendón tan largas como el peroné, y el
    volumen tampoco sirve (son superficies abiertas y `calc_volume` da cualquier cosa). Se distinguen por la forma: un
    hueso largo es un tubo y un tendón, una hoja. De los tubos, la tibia es el más ancho."""
    nuevos = importar(MODELOS / 'pierna-derecha.glb')
    esqueleto = next(o for o in nuevos if o.name == 'skeletal')
    for o in nuevos:
        if o is not esqueleto and o.type == 'MESH':
            bpy.data.objects.remove(o)
    aplicar_transformaciones(esqueleto)
    bpy.context.view_layer.objects.active = esqueleto
    esqueleto.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    piezas = [o for o in bpy.data.objects if o.type == 'MESH']
    tubos = []
    for o in piezas:
        zs = [v.co.z for v in o.data.vertices]
        if 0.34 < max(zs) - min(zs) < 0.42 and max(zs) < 0.6 and grosor(o) > 0.7:
            xs = [v.co.x for v in o.data.vertices]
            tubos.append((max(xs) - min(xs), o))
    tubos.sort(key=lambda t: t[0], reverse=True)
    print('TUBOS', [(o.name, len(o.data.vertices), round(ancho, 3), round(grosor(o), 2)) for ancho, o in tubos], flush=True)
    tibia, perone = tubos[0][1], tubos[1][1]
    for o in piezas:
        if o not in (tibia, perone):
            bpy.data.objects.remove(o)
    tibia.name, perone.name = 'tibia', 'perone'
    return tibia, perone


def eje(objeto):
    """El eje largo del hueso (componente principal de sus vértices), apuntando hacia arriba, y su centro."""
    puntos = np.array([v.co[:] for v in objeto.data.vertices])
    centro = puntos.mean(axis=0)
    _, _, vt = np.linalg.svd(puntos - centro, full_matrices=False)
    d = Vector(vt[0])
    if d.z < 0:
        d = -d
    return d.normalized(), Vector(centro)


def centro_de_la_diafisis(objeto, z):
    """El centro del corte transversal del hueso a la altura `z`.

    El eje principal pasa por el centro de todos los vértices, y los extremos (la meseta, el maléolo) lo tiran hacia
    atrás y hacia fuera: a la altura del trazo quedaba a 5 mm del centro de la diáfisis, y la placa, centrada en ese eje,
    salía montada sobre el borde medial."""
    bm = bmesh.new()
    bm.from_mesh(objeto.data)
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7, plane_co=(0, 0, z),
                               plane_no=(0, 0, 1))
    puntos = [v.co.copy() for v in r['geom_cut'] if isinstance(v, bmesh.types.BMVert)]
    bm.free()
    return sum(puntos, Vector()) / len(puntos)


def fracturar(tibia, punto, normal):
    """Parte la tibia por un plano, tapa las dos caras y desplaza un poco el borde para que el trazo tenga dientes.

    Las dos mitades comparten el mismo borde (se corta una vez y se separa por la arista del corte), y el desplazamiento
    es la misma función del punto en las dos: los dientes de una encajan en los de la otra, como en una fractura reducida.
    Devuelve los dos fragmentos, el proximal primero."""
    bm = bmesh.new()
    bm.from_mesh(tibia.data)
    r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7, plane_co=punto,
                               plane_no=normal)
    corte = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    bmesh.ops.split_edges(bm, edges=corte)
    bm.to_mesh(tibia.data)
    bm.free()
    bpy.context.view_layer.objects.active = tibia
    tibia.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    trozos = [o for o in bpy.data.objects if o.name.startswith('tibia')]
    # Si la malla traía islas sueltas pequeñas, se quedan con el fragmento del lado donde caen.
    trozos.sort(key=lambda o: len(o.data.vertices), reverse=True)
    a, b = trozos[0], trozos[1]
    for o in trozos[2:]:
        lado = (Vector(o.data.vertices[0].co) - punto).dot(normal)
        destino = a if ((Vector(a.data.vertices[0].co) - punto).dot(normal) > 0) == (lado > 0) else b
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        destino.select_set(True)
        bpy.context.view_layer.objects.active = destino
        bpy.ops.object.join()
    centro_a = sum((v.co for v in a.data.vertices), Vector()) / len(a.data.vertices)
    proximal, distal = (a, b) if (centro_a - punto).dot(normal) > 0 else (b, a)
    proximal.name, distal.name = 'fragmento_proximal', 'fragmento_distal'

    cara = material_de_la_cara_de_fractura()

    def dientes(p):
        # Dos octavas: la grande da el escalón del trazo y la pequeña, que el borde no sea liso.
        return DIENTES * (0.75 * noise.noise(p * 260.0) + 0.35 * noise.noise(p * 900.0 + Vector((3.1, 7.7, 1.3))))

    for frag in (proximal, distal):
        frag.data.materials.append(cara)
        indice = len(frag.data.materials) - 1
        bm = bmesh.new()
        bm.from_mesh(frag.data)
        borde = [e for e in bm.edges if e.is_boundary and all(abs((v.co - punto).dot(normal)) < 1e-5 for v in e.verts)]
        try:
            caras = bmesh.ops.triangle_fill(bm, edges=borde, use_beauty=True, use_dissolve=False, normal=normal)['geom']
            caras = [f for f in caras if isinstance(f, bmesh.types.BMFace)]
        except Exception:
            caras = bmesh.ops.holes_fill(bm, edges=borde, sides=0)['faces']
        for f in caras:
            f.material_index = indice
            f.smooth = False
        for v in bm.verts:
            if abs((v.co - punto).dot(normal)) < 1e-5:
                v.co += normal * dientes(v.co)
        bm.normal_update()
        bm.to_mesh(frag.data)
        bm.free()
    # El distal se aparta del proximal a lo largo de la normal del plano: la hendidura es igual en todo el trazo.
    distal.data.transform(Matrix.Translation(-normal * HENDIDURA))
    return proximal, distal


def material_de_la_cara_de_fractura():
    """El hueso por dentro: más oscuro y cálido que la superficie. Casi no se ve (la hendidura es fina), pero lo poco
    que asoma tiene que leerse como hueso partido y no como un hueco."""
    m = bpy.data.materials.new('cara_de_fractura')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.62, 0.47, 0.36, 1)
    bsdf.inputs['Roughness'].default_value = 0.9
    return m


def material_del_hueso(objeto):
    """El del atlas (marfil mate), con una pizca de translucidez: de cerca el hueso sin ella parece yeso."""
    m = bpy.data.materials.new('hueso')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.91, 0.886, 0.835, 1)
    bsdf.inputs['Roughness'].default_value = 0.72
    bsdf.inputs['Subsurface Weight'].default_value = 0.12
    bsdf.inputs['Subsurface Radius'].default_value = (1.0, 0.55, 0.35)
    bsdf.inputs['Subsurface Scale'].default_value = 0.0015
    objeto.data.materials.clear()
    objeto.data.materials.append(m)
    return m


def material_del_titanio():
    """Titanio gris plata, satinado. Más claro que el del simulador (que se ve sobre el campo quirúrgico): sobre el
    marino de la tarjeta, el gris oscuro se confundía con el fondo en el borde de la placa. Con menos aspereza la cara
    de la placa reflejaba el cielo del mundo entero y salía blanca, como una tira de papel."""
    m = bpy.data.materials.new('titanio_portada')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.58, 0.60, 0.63, 1)
    bsdf.inputs['Metallic'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.38
    return m


def material_de_los_tornillos():
    """Titanio anodizado dorado, como vienen muchos tornillos de bloqueo. Del mismo gris que la placa, las cabezas se
    perdían dentro de sus agujeros y la placa parecía vacía: dorados, se cuentan de un vistazo."""
    m = bpy.data.materials.new('titanio_dorado')
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.86, 0.68, 0.36, 1)
    bsdf.inputs['Metallic'].default_value = 1.0
    bsdf.inputs['Roughness'].default_value = 0.32
    return m


def superficie(hueso, origen, direccion):
    """Dónde toca la tibia un rayo. Contra la tibia sola y no contra la escena: el peroné va detrás, y un rayo que se
    salía por el borde de la cara lo encontraba a tres centímetros y contaba como un hueco enorme bajo la placa."""
    tocado, lugar, *_ = hueso.ray_cast(origen, direccion)
    return lugar if tocado else None


PASOS_A_LO_LARGO = np.linspace(-0.068 - TRAMOS_AGREGADOS * PASO_DE_LOS_AGUJEROS / 2,
                               0.068 + TRAMOS_AGREGADOS * PASO_DE_LOS_AGUJEROS / 2, 43) * ESCALA_DE_LOS_IMPLANTES
PASOS_A_LO_ANCHO = tuple(w * ESCALA_DE_LOS_IMPLANTES for w in (-0.0085, -0.004, 0.0, 0.004, 0.0085))
# Un rayo que no toca hueso es placa que sobra por el borde: cuenta como un hueco grande, para que la búsqueda prefiera
# la cara donde la placa entera tiene hueso debajo.
HUECO_SIN_HUESO = 0.005


def apoyo(hueso, centro, u, n):
    """Cómo queda una placa recta apoyada en la cara que mira hacia `n`.

    Se miden con rayos los puntos de la cara bajo el largo y el ancho de la placa, y se elige la recta (inclinación y
    altura) que queda por encima de todos con el menor hueco medio: la placa toca el hueso donde sobresale y no se mete
    en él en ningún punto. Devuelve (hueco medio, pendiente, altura en el centro, normal corregida)."""
    b = u.cross(n).normalized()
    n = b.cross(u).normalized()
    alturas = np.full((len(PASOS_A_LO_LARGO), len(PASOS_A_LO_ANCHO)), np.nan)
    for i_, s in enumerate(PASOS_A_LO_LARGO):
        for j_, w in enumerate(PASOS_A_LO_ANCHO):
            p = superficie(hueso, centro + u * s + b * w + n * 0.08, -n)
            if p is not None:
                alturas[i_, j_] = (p - centro).dot(n)
    lo_mas_alto = np.nanmax(np.where(np.isnan(alturas), -1.0, alturas), axis=1)
    validas = lo_mas_alto > -0.5
    mejor = None
    for pendiente in np.linspace(-0.25, 0.25, 101):
        a = np.max(lo_mas_alto[validas] - pendiente * PASOS_A_LO_LARGO[validas])
        recta = (a + pendiente * PASOS_A_LO_LARGO)[:, None]
        huecos = np.where(np.isnan(alturas), HUECO_SIN_HUESO, recta - alturas)
        hueco = float(np.mean(huecos))
        if mejor is None or hueco < mejor[0]:
            mejor = (hueco, pendiente, a)
    return (*mejor, n)


def colocar_la_placa(centro, u, n, pendiente, a):
    """La matriz de la placa (x ancho, y largo hacia proximal, z hacia fuera), apoyada según `apoyo`."""
    largo = (u + n * pendiente).normalized()
    fuera = (n - largo * n.dot(largo)).normalized()
    ancho = largo.cross(fuera).normalized()
    origen = centro + fuera * (a + 0.0002)
    m = Matrix.Identity(4)
    for fila in range(3):
        m[fila][0], m[fila][1], m[fila][2], m[fila][3] = ancho[fila], largo[fila], fuera[fila], origen[fila]
    return m


def cortar_por_y(bm, y, quitar):
    """Corta por el plano y = cte y quita lo de debajo o lo de encima."""
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7, plane_co=(0, y, 0),
                           plane_no=(0, 1, 0), clear_inner=quitar == 'debajo', clear_outer=quitar == 'encima')


def alargar(placa, tramos):
    """Hace la placa `tramos` agujeros más larga sin deformarla: la parte por el puente del medio (y = 0), separa las
    mitades y mete entre ellas copias del tramo que va de un puente al siguiente (un agujero combinado entero).

    La del simulador es de 8 agujeros (134 mm). Sobre la tibia entera se veía corta, como un parche, y una diáfisis
    tibial se fija con placas más largas. Los cortes caen en mitad de un puente macizo y la placa es periódica (un
    agujero cada 16 mm), así que la sección es la misma a los dos lados de cada costura y los vértices se sueldan."""
    if tramos <= 0:
        return
    original = bmesh.new()
    original.from_mesh(placa.data)

    def trozo(desde, hasta):
        t = original.copy()
        if desde is not None:
            cortar_por_y(t, desde, 'debajo')
        if hasta is not None:
            cortar_por_y(t, hasta, 'encima')
        return t

    piezas = [(trozo(None, 0.0), 0.0)]
    piezas += [(trozo(0.0, PASO_DE_LOS_AGUJEROS), k * PASO_DE_LOS_AGUJEROS) for k in range(tramos)]
    piezas.append((trozo(0.0, None), tramos * PASO_DE_LOS_AGUJEROS))
    resultado = bmesh.new()
    for t, corrimiento in piezas:
        bmesh.ops.translate(t, vec=(0, corrimiento - tramos * PASO_DE_LOS_AGUJEROS / 2, 0), verts=t.verts[:])
        malla = bpy.data.meshes.new('trozo')
        t.to_mesh(malla)
        t.free()
        resultado.from_mesh(malla)  # varias llamadas juntan las mallas
        bpy.data.meshes.remove(malla)
    antes = len(resultado.verts)
    bmesh.ops.remove_doubles(resultado, verts=resultado.verts[:], dist=2e-5)
    abiertas = sum(1 for e in resultado.edges if e.is_boundary)
    print(f'PLACA alargada {tramos} agujeros: {antes - len(resultado.verts)} vértices soldados, '
          f'{abiertas} aristas abiertas', flush=True)
    resultado.to_mesh(placa.data)
    resultado.free()
    original.free()


def placa_y_tornillos(matriz):
    nuevos = importar(MODELOS / 'placa-lcp-recta-4-5.glb')
    placa = next(o for o in nuevos if o.name.startswith('placa'))
    for o in nuevos:
        if o is not placa:
            bpy.data.objects.remove(o)
    aplicar_transformaciones(placa)
    alargar(placa, TRAMOS_AGREGADOS)
    placa.data.transform(Matrix.Scale(ESCALA_DE_LOS_IMPLANTES, 4))
    placa.matrix_world = matriz
    titanio = material_del_titanio()
    placa.data.materials.clear()
    placa.data.materials.append(titanio)
    bpy.context.view_layer.objects.active = placa
    placa.select_set(True)
    bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
    placa.select_set(False)
    dorado = material_de_los_tornillos()
    tornillos = []
    for k, y_mm in enumerate(TORNILLOS_MM):
        nuevos = importar(MODELOS / 'tornillo-bloqueado-lcp-3-5.glb')
        piezas = [o for o in nuevos if o.type == 'MESH']
        for o in nuevos:
            if o.type != 'MESH':
                continue
            aplicar_transformaciones(o)
            o.data.transform(Matrix.Scale(ESCALA_DE_LOS_IMPLANTES, 4))
            o.name = f'{o.name}_{k}'
        for o in nuevos:
            if o.type != 'MESH':
                bpy.data.objects.remove(o)
        for o in piezas:
            if o.name.startswith('tornillo'):
                o.data.materials.clear()
                o.data.materials.append(dorado)
            o.matrix_world = matriz @ Matrix.Translation(
                (0, y_mm / 1000.0 * ESCALA_DE_LOS_IMPLANTES, GROSOR_DE_LA_PLACA - HUNDIMIENTO_DE_LA_CABEZA - LARGO_DEL_TORNILLO))
            tornillos.append(o)
    return placa, tornillos


def mundo_y_luces(escena, cam):
    """Las tres luces del atlas (`capas_y_cortes.py`) y un mundo en degradado: con un mundo de un solo color el metal no
    tiene qué reflejar y la placa sale gris plano, sin el brillo que dice «metal»."""
    mundo = bpy.data.worlds.new('mundo')
    escena.world = mundo
    mundo.use_nodes = True
    nt = mundo.node_tree
    for n_ in list(nt.nodes):
        nt.nodes.remove(n_)
    coords = nt.nodes.new('ShaderNodeTexCoord')
    separar = nt.nodes.new('ShaderNodeSeparateXYZ')
    rampa = nt.nodes.new('ShaderNodeValToRGB')
    rampa.color_ramp.elements[0].position = 0.30
    rampa.color_ramp.elements[0].color = (0.12, 0.14, 0.20, 1)
    rampa.color_ramp.elements[1].position = 0.68
    rampa.color_ramp.elements[1].color = (0.95, 0.97, 1.0, 1)
    mapa = nt.nodes.new('ShaderNodeMapRange')
    mapa.inputs['From Min'].default_value = -1.0
    mapa.inputs['From Max'].default_value = 1.0
    fondo = nt.nodes.new('ShaderNodeBackground')
    fondo.inputs['Strength'].default_value = 0.6
    salida = nt.nodes.new('ShaderNodeOutputWorld')
    nt.links.new(coords.outputs['Generated'], separar.inputs['Vector'])
    nt.links.new(separar.outputs['Z'], mapa.inputs['Value'])
    nt.links.new(mapa.outputs['Result'], rampa.inputs['Fac'])
    nt.links.new(rampa.outputs['Color'], fondo.inputs['Color'])
    nt.links.new(fondo.outputs['Background'], salida.inputs['Surface'])
    escena.view_settings.view_transform = 'Standard'
    escena.view_settings.look = 'None'
    escena.view_settings.exposure = -0.1
    # Las luces se orientan respecto de la cámara y no con giros fijos: los del atlas estaban pensados para el cuerpo
    # visto de frente, y con la cámara girada hacia medial la clave caía de frente y aplanaba el hueso.
    adelante = (cam.matrix_world.to_quaternion() @ Vector((0, 0, -1))).normalized()
    derecha = adelante.cross(Vector((0, 0, 1))).normalized()
    arriba = derecha.cross(adelante).normalized()
    for nombre, energia, desde, color in (
        # La clave, de arriba a la izquierda y algo de frente: modela el hueso de un lado a otro.
        ('clave', 2.4, -derecha * 0.85 + arriba * 0.55 - adelante * 0.45, (1.0, 0.96, 0.92)),
        # El relleno, de la derecha y bajo, para que la sombra no se coma el borde medial.
        ('relleno', 0.7, derecha * 0.9 - adelante * 0.5 - arriba * 0.1, (0.80, 0.88, 1.0)),
        # El contraluz, de detrás: perfila la silueta contra el marino de la tarjeta.
        ('contraluz', 2.6, derecha * 0.45 + adelante * 0.85 + arriba * 0.35, (0.85, 0.92, 1.0)),
        ('contraluz_izquierdo', 1.6, -derecha * 0.6 + adelante * 0.8 + arriba * 0.2, (0.85, 0.92, 1.0)),
    ):
        luz = bpy.data.lights.new(nombre, 'SUN')
        luz.energy = energia
        luz.color = color
        luz.angle = math.radians(8)
        lo = bpy.data.objects.new(nombre, luz)
        escena.collection.objects.link(lo)
        # Un sol alumbra hacia su -Z: se apunta en contra de la dirección desde la que llega.
        lo.rotation_euler = (-desde.normalized()).to_track_quat('-Z', 'Y').to_euler()


def usar_la_grafica(escena):
    """La gráfica si la hay (OptiX y si no CUDA); si no, el procesador. Solo cambia cuánto tarda."""
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for tipo in ('OPTIX', 'CUDA'):
            prefs.compute_device_type = tipo
            prefs.get_devices()
            graficas = [d for d in prefs.devices if d.type == tipo]
            if graficas:
                for d in prefs.devices:
                    d.use = d.type == tipo
                escena.cycles.device = 'GPU'
                return tipo
    except Exception as e:  # noqa: BLE001
        print('sin gráfica:', e, flush=True)
    return 'CPU'


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    escena = bpy.context.scene
    tibia, perone = tibia_y_perone()
    d, centro_tibia = eje(tibia)
    zs = [v.co.z for v in tibia.data.vertices]
    zmin, zmax = min(zs), max(zs)
    suavizar(tibia, 2)
    suavizar(perone, 2)
    material_del_hueso(tibia)
    material_del_hueso(perone)

    # El punto del trazo, en el centro de la diáfisis, y el eje de la diáfisis bajo la placa (no el de todo el hueso).
    # La cara de la placa se mide antes de partir el hueso: con la hendidura abierta, algún rayo se colaba por ella y la
    # placa se hundía en el foco.
    altura = zmin + ALTURA_DEL_TRAZO * (zmax - zmin)
    punto = centro_de_la_diafisis(tibia, altura)
    tramo = 0.05
    d = (centro_de_la_diafisis(tibia, altura + tramo) - centro_de_la_diafisis(tibia, altura - tramo)).normalized()
    giro = opc['giro'] if opc['giro'] is not None else GIRO_DE_LA_PLACA
    cara = Vector((math.sin(math.radians(giro)), -math.cos(math.radians(giro)), 0.0))
    hueco, pendiente, a, cara = apoyo(tibia, punto, d, (cara - d * cara.dot(d)).normalized())
    print(f'PLACA cara a {giro}°, hueco medio {hueco * 1000:.2f} mm, '
          f'inclinación {math.degrees(math.atan(pendiente)):.1f}°', flush=True)
    acimut = math.radians(opc['acimut'] if opc['acimut'] is not None else ACIMUT_DE_LA_CAMARA)
    hacia_camara = Vector((math.sin(acimut), -math.cos(acimut), 0.0))
    # La normal del plano del trazo: el eje inclinado alrededor de la dirección desde la que mira la cámara, para que
    # el trazo se vea oblicuo de frente y no de canto.
    normal_del_trazo = (Matrix.Rotation(math.radians(INCLINACION_DEL_TRAZO), 3, hacia_camara) @ d).normalized()
    proximal, distal = fracturar(tibia, punto, normal_del_trazo)

    matriz = colocar_la_placa(punto, d, cara, pendiente, a)
    placa, tornillos = placa_y_tornillos(matriz)

    # Cámara: de medial y algo de anterior, a la altura del centro de la tibia. Lo anterior queda a la izquierda de la
    # imagen y lo posterior a la derecha, por donde asoma el peroné (ver `ACIMUT_DE_LA_CAMARA`).
    objetivo = centro_tibia + Vector((0.0, 0.0, -0.006))
    distancia = 1.6
    posicion = objetivo + hacia_camara * distancia + Vector((0, 0, 0.04))
    cam = bpy.data.objects.new('camara', bpy.data.cameras.new('camara'))
    escena.collection.objects.link(cam)
    cam.location = posicion
    cam.rotation_euler = (objetivo - posicion).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 85
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.sensor_height = 24
    cam.data.shift_x = 0.075  # el hueso a la izquierda: la mitad derecha queda para las líneas de los marcadores
    cam.data.shift_y = -0.02
    escena.camera = cam
    bpy.context.view_layer.update()
    mundo_y_luces(escena, cam)

    escena.render.engine = 'CYCLES'
    dispositivo = usar_la_grafica(escena)
    escena.cycles.samples = opc['muestras']
    escena.cycles.use_denoising = True
    escena.render.resolution_x = opc['ancho']
    escena.render.resolution_y = opc['alto']
    escena.render.film_transparent = True
    escena.render.image_settings.file_format = 'PNG'
    escena.render.image_settings.color_mode = 'RGBA'
    escena.render.filepath = str(SALIDA / f"{opc['nombre']}.png")

    if opc['marcas']:
        # La matriz de la cámara no se actualiza hasta que se evalúa la escena: sin esto se proyecta con la de origen.
        bpy.context.view_layer.update()
        # Los tres puntos que numera la portada, en tanto por ciento de la imagen (x desde la izquierda, y desde arriba).
        proximal_de_la_placa = matriz @ Vector((0, 0.078 * ESCALA_DE_LOS_IMPLANTES, GROSOR_DE_LA_PLACA))
        sobre_el_trazo = punto + cara * 0.012
        distal_de_la_placa = matriz @ Vector((0, -0.051 * ESCALA_DE_LOS_IMPLANTES, GROSOR_DE_LA_PLACA))
        for nombre, p in (('abordaje', proximal_de_la_placa), ('reduccion', sobre_el_trazo),
                          ('fijacion', distal_de_la_placa)):
            c = world_to_camera_view(escena, cam, p)
            print(f'MARCA {nombre} x={c.x * 100:.1f}% y={(1 - c.y) * 100:.1f}%', flush=True)
    print('DISPOSITIVO', dispositivo, flush=True)
    bpy.ops.render.render(write_still=True)
    print('dibujada', escena.render.filepath, flush=True)


main()

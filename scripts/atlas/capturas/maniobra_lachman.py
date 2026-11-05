"""La prueba de Lachman sobre la rodilla derecha del atlas: el video en bucle de la lupa del capítulo Examina de la portada.

    blender --background --factory-startup --python maniobra_lachman.py -- --blend X.blend --salida carpeta
            [--fotogramas 1-180 | --fotogramas 60] [--escala 1] [--muestras 64] [--video | --solo-video] [--poster 90]

El .blend es el atlas completo (`scripts/atlas/piel/salida/modelo-completo.blend`): de él se sacan la rodilla derecha (fémur,
rótula, tibia y peroné del sistema `Esqueleto`) y la piel de la pierna. Las dos rutas van absolutas, como en
`capas_y_cortes.py`: con una relativa Blender escribe en la raíz de la unidad C:.

Deja los fotogramas en `<salida>/fotogramas/` (PNG); con `--video` además los une en `<salida>/maniobra-lachman.mp4` (H.264)
y `<salida>/maniobra-lachman.webm` (VP9) con el FFmpeg que trae Blender, y `--solo-video` vuelve a unir los que ya hay sin
dibujar nada. `--poster N` guarda el fotograma N como `<salida>/maniobra-lachman.webp`. Lo que usa la portada:

    public/portada/maniobra-lachman.mp4 y .webm       ← los dos videos
    src/components/portada/imagenes/maniobra-lachman.webp   ← el póster

Con la GPU de la máquina de desarrollo (RTX 4070, OptiX) cada fotograma de 720 × 720 a 64 muestras tarda unos 3,5 s. Se
dibujan 101 de los 180 (los demás son copias, ver `dibujar`): con los dos videos, unos 6 minutos.

Qué se ve y por qué así:
- La rodilla a 25° de flexión, que es donde se hace el Lachman (a 90° sería el cajón anterior). El atlas está en posición
  anatómica, con la rodilla extendida: la tibia, el peroné y la piel de la pierna se giran en torno al eje de los cóndilos.
- El paciente tumbado, como en la camilla: el muslo entra por la derecha y la pierna sale por la izquierda, la rodilla arriba.
  Lo anterior queda hacia arriba, así que el tirón de la tibia es una flecha que sube.
- Vista medial. El ligamento cruzado anterior vive en la escotadura, detrás del cóndilo femoral medial: ese cóndilo se dibuja
  como un vidrio (solo su contorno) para que se vea el ligamento sin cortar el hueso.
- El cruzado anterior va resaltado y se enciende al tensarse; el posterior va apagado, para que se lea que son dos y cuál es
  el que importa aquí.
- Dos flechas: la que tira de la tibia hacia delante y la que sujeta el muslo. Sin texto en el video: el rótulo lo pone la
  página, que se puede leer en voz alta y traducir.

Ejes de Blender, como en el resto del atlas: x = x del atlas (la derecha del cuerpo hacia -x), y = -z del atlas (el frente
mira a -y), z = y del atlas - 0.86.
"""
import math
import shutil
import sys
from pathlib import Path

import bmesh
import bpy
from bpy_extras import anim_utils
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
opc = {'blend': None, 'salida': None, 'fotogramas': '1-180', 'escala': 1.0, 'muestras': 64, 'video': False, 'poster': None}
i = 0
while i < len(args):
    k = args[i]
    if k in ('--blend', '--salida', '--fotogramas'):
        opc[k[2:]] = args[i + 1]; i += 2
    elif k == '--escala':
        opc['escala'] = float(args[i + 1]); i += 2
    elif k == '--muestras':
        opc['muestras'] = int(args[i + 1]); i += 2
    elif k == '--poster':
        opc['poster'] = int(args[i + 1]); i += 2
    elif k == '--video':
        opc['video'] = True; i += 1
    elif k == '--solo-video':
        opc['solo_video'] = True; i += 1
    else:
        i += 1

SALIDA = Path(opc['salida'])
SALIDA.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------------------------------------ la maniobra en números
FPS = 30
DURACION = 180                       # 6 s
FLEXION = math.radians(25)
ROTULA_SIGUE = 0.7                   # la rótula acompaña a la tibia, pero se queda atrás: ~0,7 de la flexión
TRASLACION = 0.010                   # 10 mm: un Lachman normal da 2-5 con tope firme; se exagera para que se lea en la lupa
# El centro de los cóndilos posteriores: el punto más bajo del cóndilo está justo debajo, a su radio (2,1 cm), y el más
# posterior a la misma altura. Girar la tibia en torno a él mantiene la meseta pegada al cóndilo en los primeros 30°.
PIVOTE = Vector((-0.072, 0.034, -0.388))

# Los tiempos del bucle, en fotogramas: reposo, se sujeta el muslo, tirón, el tope firme, vuelta y reposo. El primero y el
# último son iguales, así que el video cierra sin salto.
SUJETA, TIRA, TOPE, SUELTA, VUELVE = 14, 30, 72, 108, 144

# ------------------------------------------------------------------------------------------------------- color
def lineal(hexa, alfa=1.0):
    """Un color de la página (sRGB en hexadecimal) en el espacio lineal de los nodos."""
    hexa = hexa.lstrip('#')
    out = []
    for j in (0, 2, 4):
        c = int(hexa[j:j + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, alfa)


MARINO_CENTRO = '#143063'            # --marino-3: el centro del degradado de la lupa
MARINO_BORDE = '#0a1633'             # --marino-1: el borde
CIAN_CLARO = '#7fd0f5'               # --cian-claro: las flechas y el contorno del vidrio
CORAL = '#ff7a59'                    # el cruzado anterior: cálido sobre el marino, y distinto del cian de las flechas
CRUZADO_POSTERIOR = '#c9b2a4'

# -------------------------------------------------------------------------------------------------------- utilidades


def seleccionar_en_caja(objeto, cmin, cmax, ligar):
    """Separa de `objeto` los vértices que caen en la caja (y, con `ligar`, las piezas enteras que tocan). Devuelve el nuevo."""
    bpy.ops.object.select_all(action='DESELECT')
    objeto.hide_set(False)
    objeto.select_set(True)
    bpy.context.view_layer.objects.active = objeto
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='VERT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bm = bmesh.from_edit_mesh(objeto.data)
    mw = objeto.matrix_world
    for v in bm.verts:
        co = mw @ v.co
        v.select = all(cmin[k] <= co[k] <= cmax[k] for k in range(3))
    bm.select_flush(True)
    bmesh.update_edit_mesh(objeto.data)
    if ligar:
        bpy.ops.mesh.select_linked(delimit=set())
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    nuevo = [o for o in bpy.context.selected_objects if o is not objeto][0]
    nuevo.data.transform(nuevo.matrix_world)
    nuevo.matrix_world = Matrix.Identity(4)
    return nuevo


def piezas_sueltas(objeto):
    bpy.ops.object.select_all(action='DESELECT')
    objeto.select_set(True)
    bpy.context.view_layer.objects.active = objeto
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    return list(bpy.context.selected_objects)


def caja(o):
    vs = [v.co for v in o.data.vertices]
    return (Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))),
            Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs))))


def giro_en_x(angulo, centro):
    """Giro en torno al eje transversal de la rodilla (x), con centro en `centro`. Positivo flexiona: lo distal va atrás."""
    return Matrix.Translation(centro) @ Matrix.Rotation(angulo, 4, 'X') @ Matrix.Translation(-centro)


def suave(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def unir(objetos, nombre):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objetos:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objetos[0]
    bpy.ops.object.join()
    objetos[0].name = nombre
    return objetos[0]


# ------------------------------------------------------------------------------------------------------- el modelo


def preparar_huesos():
    """Fémur, rótula, tibia y peroné derechos, sacados del esqueleto del atlas y reconocidos por dónde caen."""
    esq = bpy.data.objects['Esqueleto']
    rodilla = seleccionar_en_caja(esq, Vector((-0.16, -0.06, -0.47)), Vector((-0.02, 0.09, -0.36)), ligar=True)
    huesos = {}
    for p in piezas_sueltas(rodilla):
        mn, mx = caja(p)
        n = len(p.data.vertices)
        if n < 60:
            bpy.data.objects.remove(p, do_unlink=True)
        elif mx.z > -0.30 and mn.z < -0.40:
            huesos['femur'] = p
        elif mn.z < -0.60 and mx.z > -0.41:
            huesos['tibia'] = p
        elif mn.z < -0.60:
            huesos['perone'] = p
        elif mx.z - mn.z < 0.06 and mn.y < -0.01:
            huesos['rotula'] = p
        else:
            bpy.data.objects.remove(p, do_unlink=True)
    faltan = {'femur', 'tibia', 'perone', 'rotula'} - set(huesos)
    if faltan:
        raise SystemExit(f'No se reconocieron: {faltan}')
    for nombre, o in huesos.items():
        o.name = nombre
        o.data.name = nombre
    return huesos


def preparar_piel():
    """La piel de la pierna derecha, de medio muslo a media pierna: sin los dedos de la mano, que cuelgan junto al muslo."""
    return seleccionar_en_caja(bpy.data.objects['Piel'], Vector((-0.19, -0.20, -0.70)), Vector((-0.004, 0.20, -0.16)), ligar=False)


def flexionar(huesos, piel):
    """Lleva la rodilla a la flexión del Lachman: tibia y peroné rígidos, la rótula a medias y la piel con una mezcla suave."""
    m = giro_en_x(FLEXION, PIVOTE)
    huesos['tibia'].data.transform(m)
    huesos['perone'].data.transform(m)
    huesos['rotula'].data.transform(giro_en_x(FLEXION * ROTULA_SIGUE, PIVOTE))
    # La piel se dobla con dos «huesos» (muslo y pierna) y un peso que pasa de uno a otro en 8 cm alrededor de la
    # interlínea. Es la mezcla lineal de toda la vida: a 25° no llega a pellizcar la corva, y la piel va casi transparente.
    grupo = piel.vertex_groups.new(name='pierna')
    for v in piel.data.vertices:
        w = suave(-0.36, -0.44, v.co.z)
        v.co = v.co.lerp(m @ v.co, w)
        if w > 0:
            grupo.add([v.index], w, 'REPLACE')


# ------------------------------------------------------------------------------------------------------ los cruzados


def punto_en_superficie(bvh, origen, direccion, respaldo):
    hit = bvh.ray_cast(origen, direccion, 0.08)
    return hit[0] if hit[0] is not None else respaldo


def ligamento(nombre, a, b, ancho_a, ancho_b, grosor, comba, giro, material):
    """Una cinta de fibras de `a` (fémur) a `b` (tibia): sección elíptica que se afina hacia el medio, un poco retorcida
    (el cruzado anterior gira sobre sí mismo) y una leve curva. Los extremos entran 2 mm en el hueso para que no floten.

    El grupo `hacia_tibia` pesa 0 en el fémur y 1 en la tibia: cuando la tibia se adelanta, el gancho estira la cinta."""
    eje = (b - a).normalized()
    a = a - eje * 0.002
    b = b + eje * 0.002
    # Un marco que no gira con la cinta: lateral (x) proyectado fuera del eje.
    lado = (Vector((1, 0, 0)) - eje * eje.dot(Vector((1, 0, 0)))).normalized()
    normal = eje.cross(lado)
    control = (a + b) / 2 + normal * comba
    largo_n, vuelta_n = 40, 18
    bm = bmesh.new()
    capa_uv = bm.loops.layers.uv.new('UVMap')
    anillos = []
    for i in range(largo_n + 1):
        t = i / largo_n
        p = (1 - t) ** 2 * a + 2 * (1 - t) * t * control + t ** 2 * b
        tangente = (2 * (1 - t) * (control - a) + 2 * t * (b - control)).normalized()
        l = (lado - tangente * tangente.dot(lado)).normalized()
        n = tangente.cross(l)
        ancho = (ancho_a * (1 - t) + ancho_b * t) * (0.82 + 0.18 * (2 * t - 1) ** 2)
        g = giro * t
        anillo = []
        for j in range(vuelta_n):
            ang = 2 * math.pi * j / vuelta_n
            dx, dy = math.cos(ang) * ancho / 2, math.sin(ang) * grosor / 2
            ex = l * math.cos(g) + n * math.sin(g)
            ey = -l * math.sin(g) + n * math.cos(g)
            anillo.append(bm.verts.new(p + ex * dx + ey * dy))
        anillos.append((t, anillo))
    for i in range(largo_n):
        _, r0 = anillos[i]
        _, r1 = anillos[i + 1]
        for j in range(vuelta_n):
            k = (j + 1) % vuelta_n
            f = bm.faces.new((r0[j], r0[k], r1[k], r1[j]))
            f.smooth = True
            for loop, (u, v) in zip(f.loops, ((j, i), (j + 1, i), (j + 1, i + 1), (j, i + 1))):
                loop[capa_uv].uv = (u / vuelta_n, v / largo_n)
    for extremo in (anillos[0][1], anillos[-1][1]):
        f = bm.faces.new(extremo)
        f.smooth = True
    bm.normal_update()
    malla = bpy.data.meshes.new(nombre)
    bm.to_mesh(malla)
    bm.free()
    o = bpy.data.objects.new(nombre, malla)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    grupo = o.vertex_groups.new(name='hacia_tibia')
    for v in o.data.vertices:
        t = max(0.0, min(1.0, (v.co - a).dot(b - a) / (b - a).length_squared))
        grupo.add([v.index], suave(0.0, 1.0, t), 'REPLACE')
    return o


# ------------------------------------------------------------------------------------------------------- materiales


def nodos_nuevos(nombre):
    m = bpy.data.materials.new(nombre)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    return m, nt, nt.nodes.new('ShaderNodeOutputMaterial')


def material_vidrio_del_femur(hueso):
    """El fémur del atlas, que se vuelve vidrio en el lado medial: del cóndilo medial solo queda el contorno.

    La transparencia depende de dónde está cada punto (x del mundo) y no de la cara: el fémur se ve macizo por fuera de la
    escotadura y el cóndilo que tapa el ligamento se aclara poco a poco, sin un corte que se lea como una avería."""
    m = hueso.copy()
    m.name = 'femur_vidrio'
    nt = m.node_tree
    salida = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
    origen = salida.inputs['Surface'].links[0].from_socket
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs['Vector'])
    rango = nt.nodes.new('ShaderNodeMapRange')
    rango.inputs['From Min'].default_value = -0.075
    rango.inputs['From Max'].default_value = -0.063
    rango.inputs['To Min'].default_value = 1.0
    rango.inputs['To Max'].default_value = 0.0
    nt.links.new(sep.outputs['X'], rango.inputs['Value'])
    # El contorno: lo que se ve de canto sigue opaco, como el borde de un vidrio.
    capa = nt.nodes.new('ShaderNodeLayerWeight')
    capa.inputs['Blend'].default_value = 0.35
    borde = nt.nodes.new('ShaderNodeMath')
    borde.operation = 'POWER'
    borde.inputs[1].default_value = 2.2
    nt.links.new(capa.outputs['Facing'], borde.inputs[0])
    opaco = nt.nodes.new('ShaderNodeMath')
    opaco.operation = 'MAXIMUM'
    nt.links.new(rango.outputs['Result'], opaco.inputs[0])
    nt.links.new(borde.outputs['Value'], opaco.inputs[1])
    minimo = nt.nodes.new('ShaderNodeMath')
    minimo.operation = 'MAXIMUM'
    minimo.inputs[1].default_value = 0.06
    nt.links.new(opaco.outputs['Value'], minimo.inputs[0])
    transparente = nt.nodes.new('ShaderNodeBsdfTransparent')
    mezcla = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(minimo.outputs['Value'], mezcla.inputs['Fac'])
    nt.links.new(transparente.outputs['BSDF'], mezcla.inputs[1])
    nt.links.new(origen, mezcla.inputs[2])
    # El filo del vidrio en el cian de la piel: con el filo blanco, el cóndilo parecía una lente de hueso; en cian se lee
    # como lo que es, la parte que se ha vuelto transparente para mirar dentro, igual que la piel.
    vidrio = nt.nodes.new('ShaderNodeMath')
    vidrio.operation = 'SUBTRACT'
    vidrio.inputs[0].default_value = 1.0
    nt.links.new(rango.outputs['Result'], vidrio.inputs[1])
    filo = nt.nodes.new('ShaderNodeMath')
    filo.operation = 'MULTIPLY'
    nt.links.new(vidrio.outputs['Value'], filo.inputs[0])
    nt.links.new(borde.outputs['Value'], filo.inputs[1])
    fuerza = nt.nodes.new('ShaderNodeMath')
    fuerza.operation = 'MULTIPLY'
    fuerza.inputs[1].default_value = 1.4
    nt.links.new(filo.outputs['Value'], fuerza.inputs[0])
    emision = nt.nodes.new('ShaderNodeEmission')
    emision.inputs['Color'].default_value = lineal(CIAN_CLARO)
    nt.links.new(fuerza.outputs['Value'], emision.inputs['Strength'])
    suma = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(mezcla.outputs['Shader'], suma.inputs[0])
    nt.links.new(emision.outputs['Emission'], suma.inputs[1])
    nt.links.new(suma.outputs['Shader'], salida.inputs['Surface'])
    return m


def material_piel_de_vidrio():
    """La piel como un vidrio: transparente de frente y un filo cian en el contorno, para que se lea la pierna sin tapar."""
    m, nt, salida = nodos_nuevos('piel_vidrio')
    capa = nt.nodes.new('ShaderNodeLayerWeight')
    capa.inputs['Blend'].default_value = 0.25
    potencia = nt.nodes.new('ShaderNodeMath')
    potencia.operation = 'POWER'
    potencia.inputs[1].default_value = 3.0
    nt.links.new(capa.outputs['Facing'], potencia.inputs[0])
    escala = nt.nodes.new('ShaderNodeMath')
    escala.operation = 'MULTIPLY'
    escala.inputs[1].default_value = 0.55
    nt.links.new(potencia.outputs['Value'], escala.inputs[0])
    transparente = nt.nodes.new('ShaderNodeBsdfTransparent')
    emision = nt.nodes.new('ShaderNodeEmission')
    emision.inputs['Color'].default_value = lineal(CIAN_CLARO)
    emision.inputs['Strength'].default_value = 0.9
    mezcla = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(escala.outputs['Value'], mezcla.inputs['Fac'])
    nt.links.new(transparente.outputs['BSDF'], mezcla.inputs[1])
    nt.links.new(emision.outputs['Emission'], mezcla.inputs[2])
    nt.links.new(mezcla.outputs['Shader'], salida.inputs['Surface'])
    return m


def material_ligamento(nombre, color, brillo, alfa=1.0):
    """Fibras: un BSDF con bandas a lo largo (la textura de onda va en la coordenada que da la vuelta) y un brillo propio
    que se anima. `alfa` < 1 deja ver lo que hay detrás (el posterior no tapa al anterior donde se cruzan)."""
    m, nt, salida = nodos_nuevos(nombre)
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = lineal(color)
    bsdf.inputs['Roughness'].default_value = 0.42
    bsdf.inputs['Emission Color'].default_value = lineal(color)
    bsdf.inputs['Emission Strength'].default_value = brillo
    coord = nt.nodes.new('ShaderNodeTexCoord')
    onda = nt.nodes.new('ShaderNodeTexWave')
    onda.wave_type = 'BANDS'
    onda.bands_direction = 'X'
    onda.inputs['Scale'].default_value = 9.0
    onda.inputs['Distortion'].default_value = 2.0
    onda.inputs['Detail'].default_value = 2.0
    nt.links.new(coord.outputs['UV'], onda.inputs['Vector'])
    relieve = nt.nodes.new('ShaderNodeBump')
    relieve.inputs['Strength'].default_value = 0.25
    relieve.inputs['Distance'].default_value = 0.0005
    nt.links.new(onda.outputs['Fac'], relieve.inputs['Height'])
    nt.links.new(relieve.outputs['Normal'], bsdf.inputs['Normal'])
    if alfa < 1.0:
        transparente = nt.nodes.new('ShaderNodeBsdfTransparent')
        mezcla = nt.nodes.new('ShaderNodeMixShader')
        mezcla.inputs['Fac'].default_value = alfa
        nt.links.new(transparente.outputs['BSDF'], mezcla.inputs[1])
        nt.links.new(bsdf.outputs['BSDF'], mezcla.inputs[2])
        nt.links.new(mezcla.outputs['Shader'], salida.inputs['Surface'])
    else:
        nt.links.new(bsdf.outputs['BSDF'], salida.inputs['Surface'])
    return m, bsdf


def material_flecha(nombre):
    """Una flecha plana de luz cian. `Fac` de la mezcla es cuánto se ve: se anima para que aparezca y se apague."""
    m, nt, salida = nodos_nuevos(nombre)
    emision = nt.nodes.new('ShaderNodeEmission')
    emision.inputs['Color'].default_value = lineal(CIAN_CLARO)
    emision.inputs['Strength'].default_value = 1.0
    transparente = nt.nodes.new('ShaderNodeBsdfTransparent')
    mezcla = nt.nodes.new('ShaderNodeMixShader')
    mezcla.name = 'visible'
    nt.links.new(transparente.outputs['BSDF'], mezcla.inputs[1])
    nt.links.new(emision.outputs['Emission'], mezcla.inputs[2])
    nt.links.new(mezcla.outputs['Shader'], salida.inputs['Surface'])
    return m, mezcla


# ----------------------------------------------------------------------------------------------------------- flechas


def flecha(nombre, punta, direccion, hacia_camara, largo, ancho, material):
    """Una flecha plana, de cara a la cámara, que acaba en `punta` y apunta en `direccion`. Con las esquinas romas: el
    trazo se lee como un gesto y no como un icono de interfaz."""
    d = direccion.normalized()
    z = hacia_camara.normalized()
    x = d.cross(z).normalized()
    cabeza_largo = largo * 0.42
    cabeza_ancho = ancho
    cuerpo_ancho = ancho * 0.38
    puntos2d = [
        (0.0, 0.0),
        (-cabeza_ancho / 2, -cabeza_largo),
        (-cuerpo_ancho / 2, -cabeza_largo * 0.86),
        (-cuerpo_ancho / 2, -largo),
        (cuerpo_ancho / 2, -largo),
        (cuerpo_ancho / 2, -cabeza_largo * 0.86),
        (cabeza_ancho / 2, -cabeza_largo),
    ]
    bm = bmesh.new()
    vs = [bm.verts.new(punta + x * px + d * py) for px, py in puntos2d]
    bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    malla = bpy.data.meshes.new(nombre)
    bm.to_mesh(malla)
    bm.free()
    o = bpy.data.objects.new(nombre, malla)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    # Un bisel mínimo para que el borde no sea un serrucho de píxeles.
    sol = o.modifiers.new('grosor', 'SOLIDIFY')
    sol.thickness = 0.0006
    bis = o.modifiers.new('bisel', 'BEVEL')
    bis.width = 0.0012
    bis.segments = 3
    bis.affect = 'VERTICES'
    return o


# ------------------------------------------------------------------------------------------------------- la escena


def mundo_de_la_lupa(escena):
    """El fondo de la lupa (degradado radial del marino, centro a la altura del 35 %) solo para los rayos de la cámara; para
    iluminar, un ambiente gris azulado tenue como el de las capturas del atlas."""
    mundo = escena.world or bpy.data.worlds.new('mundo')
    escena.world = mundo
    mundo.use_nodes = True
    nt = mundo.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    salida = nt.nodes.new('ShaderNodeOutputWorld')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['Window'], sep.inputs['Vector'])
    dx = nt.nodes.new('ShaderNodeMath'); dx.operation = 'SUBTRACT'; dx.inputs[1].default_value = 0.5
    dy = nt.nodes.new('ShaderNodeMath'); dy.operation = 'SUBTRACT'; dy.inputs[1].default_value = 0.65
    nt.links.new(sep.outputs['X'], dx.inputs[0])
    nt.links.new(sep.outputs['Y'], dy.inputs[0])
    comb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(dx.outputs['Value'], comb.inputs['X'])
    nt.links.new(dy.outputs['Value'], comb.inputs['Y'])
    largo = nt.nodes.new('ShaderNodeVectorMath'); largo.operation = 'LENGTH'
    nt.links.new(comb.outputs['Vector'], largo.inputs[0])
    # `radial-gradient(circle at 50% 35%, …)` acaba en la esquina más lejana: a √(0,5² + 0,65²) ≈ 0,82 del centro.
    norm = nt.nodes.new('ShaderNodeMath'); norm.operation = 'DIVIDE'; norm.inputs[1].default_value = 0.82
    nt.links.new(largo.outputs['Value'], norm.inputs[0])
    rampa = nt.nodes.new('ShaderNodeValToRGB')
    rampa.color_ramp.elements[0].color = lineal(MARINO_CENTRO)
    rampa.color_ramp.elements[1].color = lineal(MARINO_BORDE)
    nt.links.new(norm.outputs['Value'], rampa.inputs['Fac'])
    fondo = nt.nodes.new('ShaderNodeBackground')
    fondo.inputs['Strength'].default_value = 1.0
    nt.links.new(rampa.outputs['Color'], fondo.inputs['Color'])
    ambiente = nt.nodes.new('ShaderNodeBackground')
    ambiente.inputs['Color'].default_value = (0.55, 0.60, 0.70, 1)
    ambiente.inputs['Strength'].default_value = 0.35
    camino = nt.nodes.new('ShaderNodeLightPath')
    mezcla = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(camino.outputs['Is Camera Ray'], mezcla.inputs['Fac'])
    nt.links.new(ambiente.outputs['Background'], mezcla.inputs[1])
    nt.links.new(fondo.outputs['Background'], mezcla.inputs[2])
    nt.links.new(mezcla.outputs['Shader'], salida.inputs['Surface'])


def camara_y_luces(escena, objetivo):
    """Vista medial con lo anterior hacia arriba, girada 12,5° para que muslo y pierna bajen igual a cada lado."""
    adelante = Vector((-1, 0, 0))
    arriba0 = Vector((0, -1, 0))
    derecha0 = Vector((0, 0, 1))
    phi = -FLEXION / 2
    arriba = arriba0 * math.cos(phi) + derecha0 * math.sin(phi)
    derecha = derecha0 * math.cos(phi) - arriba0 * math.sin(phi)
    rot = Matrix((derecha, arriba, -adelante)).transposed()
    cam = bpy.data.objects.new('camara', bpy.data.cameras.new('camara'))
    escena.collection.objects.link(cam)
    cam.data.lens = 85
    cam.data.clip_start = 0.05
    cam.data.clip_end = 10
    distancia = 0.50
    cam.matrix_world = Matrix.Translation(objetivo - adelante * distancia) @ rot.to_4x4()
    escena.camera = cam
    for o in [o for o in bpy.data.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(o)

    def luz(nombre, energia, tam, desde, color=(1, 1, 1)):
        datos = bpy.data.lights.new(nombre, 'AREA')
        datos.energy = energia
        datos.size = tam
        datos.color = color
        lo = bpy.data.objects.new(nombre, datos)
        escena.collection.objects.link(lo)
        pos = objetivo + desde
        lo.location = pos
        lo.rotation_euler = (objetivo - pos).to_track_quat('-Z', 'Y').to_euler()

    # La clave, desde arriba (lo anterior) y del lado de la cámara; el relleno, desde abajo; el contraluz, desde detrás
    # (lado lateral), para despegar el contorno del fondo marino.
    luz('clave', 7, 0.2, -adelante * 0.45 + arriba * 0.55 - derecha * 0.15, (1.0, 0.97, 0.93))
    luz('relleno', 1.6, 0.6, -adelante * 0.5 - arriba * 0.45 + derecha * 0.3, (0.82, 0.88, 1.0))
    luz('contraluz', 8, 0.3, adelante * 0.5 + arriba * 0.35 + derecha * 0.25, (0.85, 0.93, 1.0))
    return cam, adelante, arriba, derecha


# ---------------------------------------------------------------------------------------------------------- montaje


def montar():
    bpy.ops.wm.open_mainfile(filepath=opc['blend'])
    escena = bpy.context.scene
    huesos = preparar_huesos()
    piel = preparar_piel()
    hueso_mat = bpy.data.objects['Esqueleto'].data.materials[0]
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.name not in set(huesos) | {piel.name}:
            bpy.data.objects.remove(o, do_unlink=True)
    for o in list(bpy.data.objects):
        if o.type in ('LIGHT', 'CAMERA'):
            bpy.data.objects.remove(o, do_unlink=True)

    # Las inserciones se buscan sobre los huesos en reposo (rodilla extendida), con rayos desde dentro de la escotadura.
    dg = bpy.context.evaluated_depsgraph_get()
    bvh_f = BVHTree.FromObject(huesos['femur'], dg)
    bvh_t = BVHTree.FromObject(huesos['tibia'], dg)
    # Cruzado anterior: de la cara medial del cóndilo lateral, atrás y arriba en la escotadura, al área intercondílea
    # anterior de la tibia, por delante de las espinas.
    lca_f = punto_en_superficie(bvh_f, Vector((-0.074, 0.040, -0.387)), Vector((-1, 0, 0)), Vector((-0.083, 0.040, -0.387)))
    lca_t = punto_en_superficie(bvh_t, Vector((-0.070, 0.013, -0.395)), Vector((0, 0, -1)), Vector((-0.070, 0.013, -0.409)))
    # Cruzado posterior: de la cara lateral del cóndilo medial, delante en la escotadura, a la cara posterior de la tibia,
    # por debajo de la meseta.
    lcp_f = punto_en_superficie(bvh_f, Vector((-0.072, 0.031, -0.394)), Vector((1, 0, 0)), Vector((-0.066, 0.031, -0.394)))
    lcp_t = punto_en_superficie(bvh_t, Vector((-0.069, 0.070, -0.421)), Vector((0, -1, 0)), Vector((-0.069, 0.050, -0.421)))
    print('INSERCIONES lca', tuple(round(c, 4) for c in lca_f), tuple(round(c, 4) for c in lca_t),
          'lcp', tuple(round(c, 4) for c in lcp_f), tuple(round(c, 4) for c in lcp_t), flush=True)

    flexionar(huesos, piel)
    flexion = giro_en_x(FLEXION, PIVOTE)
    lca_t = flexion @ lca_t
    lcp_t = flexion @ lcp_t

    # Suavizar los huesos del atlas, que en la pierna vienen con pocos polígonos: de cerca se verían las facetas.
    for o in huesos.values():
        sub = o.modifiers.new('suave', 'SUBSURF')
        sub.levels = 2
        sub.render_levels = 2
        for p in o.data.polygons:
            p.use_smooth = True
    huesos['femur'].data.materials.clear()
    huesos['femur'].data.materials.append(material_vidrio_del_femur(hueso_mat))
    piel.data.materials.clear()
    piel.data.materials.append(material_piel_de_vidrio())
    for p in piel.data.polygons:
        p.use_smooth = True

    # La tibia arrastra al peroné: van juntos en un objeto, que es lo que se anima.
    tibia = unir([huesos['tibia'], huesos['perone']], 'tibia')

    mat_lca, bsdf_lca = material_ligamento('cruzado_anterior', CORAL, 0.25)
    mat_lcp, _ = material_ligamento('cruzado_posterior', CRUZADO_POSTERIOR, 0.0, alfa=0.55)
    lca = ligamento('cruzado_anterior', lca_f, lca_t, 0.0115, 0.0135, 0.0062, 0.0018, math.radians(80), mat_lca)
    lcp = ligamento('cruzado_posterior', lcp_f, lcp_t, 0.012, 0.011, 0.006, -0.002, math.radians(-40), mat_lcp)

    # Los ganchos: la piel de la pierna y el extremo tibial de los cruzados siguen a la tibia cuando se adelanta.
    for o, grupo in ((piel, 'pierna'), (lca, 'hacia_tibia'), (lcp, 'hacia_tibia')):
        g = o.modifiers.new('sigue_a_la_tibia', 'HOOK')
        g.object = tibia
        g.vertex_group = grupo
        g.matrix_inverse = Matrix.Identity(4)
        g.center = PIVOTE
    # El gancho de la piel va antes que nada más; el de los cruzados, igual (no tienen otros modificadores).

    objetivo = Vector((-0.072, 0.020, -0.402))
    cam, adelante, arriba, derecha = camara_y_luces(escena, objetivo)
    mundo_de_la_lupa(escena)

    # Hacia delante de la tibia ya flexionada: el cajón es perpendicular a su eje.
    anterior = (flexion.to_3x3() @ Vector((0, -1, 0))).normalized()
    # Las flechas van en el plano medio de la rodilla (x = -0,06), por fuera del contorno del hueso: pegadas a donde se
    # aplica la fuerza. Se probaron más cerca de la cámara (x = -0,02, en la piel medial) y la perspectiva las agrandaba
    # hasta el borde de la lupa, donde las tapan el chip y el botón de pausa.
    plano_x = -0.06
    # La que tira: por detrás de la tibia, 3 cm bajo la meseta (donde la mano rodea la pantorrilla), apuntando adelante.
    # El punto se busca en la tibia en reposo y se lleva a la flexión.
    trasera = punto_en_superficie(bvh_t, Vector((-0.072, 0.20, -0.437)), Vector((0, -1, 0)), Vector((-0.072, 0.045, -0.437)))
    punta_tira = flexion @ (trasera + Vector((0, 0.004, 0)))
    punta_tira.x = plano_x
    mat_tira, vis_tira = material_flecha('flecha_tira')
    tira = flecha('flecha_tira', punta_tira, anterior, -adelante, 0.028, 0.017, mat_tira)
    tira.parent = tibia
    # La que sujeta: por delante del fémur, 6 cm sobre la interlínea (encima de la rótula), apuntando atrás.
    delantera = punto_en_superficie(bvh_f, Vector((-0.084, -0.20, -0.345)), Vector((0, 1, 0)), Vector((-0.084, -0.004, -0.345)))
    punta_sujeta = delantera - Vector((0, 0.005, 0))
    punta_sujeta.x = plano_x
    mat_sujeta, vis_sujeta = material_flecha('flecha_sujeta')
    sujeta = flecha('flecha_sujeta', punta_sujeta, Vector((0, 1, 0)), -adelante, 0.022, 0.015, mat_sujeta)
    print('FLECHAS tira', tuple(round(c, 4) for c in punta_tira), 'sujeta', tuple(round(c, 4) for c in punta_sujeta), flush=True)

    # ---------------------------------------------------------------- la animación
    escena.frame_start = 1
    escena.frame_end = DURACION
    escena.render.fps = FPS

    def clave_tibia(fotograma, cuanto):
        tibia.location = anterior * cuanto
        tibia.keyframe_insert('location', frame=fotograma)

    for f, c in ((1, 0), (TIRA, 0), (TOPE, TRASLACION), (SUELTA, TRASLACION), (VUELVE, 0), (DURACION, 0)):
        clave_tibia(f, c)

    def clave(nodo, entrada, fotograma, valor):
        nodo.inputs[entrada].default_value = valor
        nodo.inputs[entrada].keyframe_insert('default_value', frame=fotograma)

    # El cruzado se enciende al tensarse.
    for f, v in ((1, 0.18), (TIRA, 0.18), (TOPE, 1.1), (SUELTA, 1.1), (VUELVE, 0.18), (DURACION, 0.18)):
        clave(bsdf_lca, 'Emission Strength', f, v)
    # Las flechas: la que sujeta aparece primero; la que tira, con el tirón. En reposo quedan como una sombra.
    for f, v in ((1, 0.22), (SUJETA, 0.22), (TIRA, 1.0), (VUELVE, 1.0), (VUELVE + 16, 0.22), (DURACION, 0.22)):
        clave(vis_sujeta, 'Fac', f, v)
    for f, v in ((1, 0.18), (TIRA - 6, 0.18), (TIRA + 10, 1.0), (SUELTA, 1.0), (VUELVE, 0.18), (DURACION, 0.18)):
        clave(vis_tira, 'Fac', f, v)

    # ---------------------------------------------------------------- el render
    escena.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == 'OPTIX'
        escena.cycles.device = 'GPU'
    except Exception as e:
        print('sin GPU:', e, flush=True)
    escena.cycles.samples = opc['muestras']
    escena.cycles.use_adaptive_sampling = False
    escena.cycles.use_denoising = True
    escena.cycles.seed = 7
    escena.cycles.use_animated_seed = False
    escena.cycles.transparent_max_bounces = 16
    escena.view_settings.view_transform = 'Standard'
    escena.view_settings.look = 'None'
    escena.view_settings.exposure = 0.0
    lado = int(720 * opc['escala'])
    escena.render.resolution_x = lado
    escena.render.resolution_y = lado
    escena.render.resolution_percentage = 100
    escena.render.film_transparent = False
    return escena


def firma(f):
    """Lo que vale en el fotograma `f` cada curva animada de la escena: la tibia, el brillo del cruzado y las flechas."""
    valores = []
    for datos in [*bpy.data.objects, *(m.node_tree for m in bpy.data.materials if m.node_tree)]:
        ad = datos.animation_data
        if ad and ad.action:
            bolsa = anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot)
            valores += [round(fc.evaluate(f), 6) for fc in bolsa.fcurves]
    return tuple(valores)


def dibujar(escena):
    """Dibuja los fotogramas pedidos. Los que tienen la misma `firma` que uno ya dibujado son la misma imagen y se copian:
    79 de los 180 (el reposo del principio y del final, el tope, y la flecha que sujeta, que se enciende y se apaga en
    espejo). Además de ahorrar casi la mitad del render, deja el último fotograma idéntico al primero bit a bit, así que
    el bucle no puede saltar ni por el ruido del render. Vale mientras nada cambie con el tiempo fuera de las curvas: por
    eso la semilla de Cycles va fija."""
    fotos = SALIDA / 'fotogramas'
    fotos.mkdir(exist_ok=True)
    escena.render.image_settings.media_type = 'IMAGE'
    escena.render.image_settings.file_format = 'PNG'
    escena.render.image_settings.color_mode = 'RGB'
    texto = opc['fotogramas']
    if '-' in texto:
        a, b = (int(x) for x in texto.split('-'))
    else:
        a = b = int(texto)
    hechos = {}
    for f in range(a, b + 1):
        destino = fotos / f'{f:04d}.png'
        clave = firma(f)
        if clave in hechos:
            shutil.copyfile(hechos[clave], destino)
            print('fotograma', f, '= copia de', hechos[clave].name, flush=True)
            continue
        escena.frame_set(f)
        escena.render.filepath = str(destino)
        bpy.ops.render.render(write_still=True)
        hechos[clave] = destino
        print('fotograma', f, flush=True)


def unir_en_video(fotos, destino, formato, codec):
    """Une los PNG en un video con el FFmpeg que trae Blender, por el editor de secuencias: así se puede volver a
    codificar (otro formato, otra calidad) sin volver a dibujar. Sin audio, 4:2:0 y en sRGB tal cual: la escena de
    video no toca el color de los fotogramas, que ya traen el marino exacto de la lupa. Blender etiqueta los dos videos
    como BT.709 de rango limitado, que es lo que suponen los navegadores: el fondo sale a uno o dos niveles del PNG."""
    # Solo los numerados: cualquier otro PNG que se deje en la carpeta (una prueba, un recorte) entraría en el video.
    archivos = sorted(fotos.glob('[0-9][0-9][0-9][0-9].png'))
    esc = bpy.data.scenes.new(f'video_{codec}')
    esc.render.resolution_x = esc.render.resolution_y = 720
    esc.render.resolution_percentage = 100
    esc.render.fps = FPS
    esc.frame_start = 1
    esc.frame_end = len(archivos)
    esc.view_settings.view_transform = 'Standard'
    esc.view_settings.look = 'None'
    editor = esc.sequence_editor_create()
    tiras = editor.strips if hasattr(editor, 'strips') else editor.sequences
    tira = tiras.new_image(name='fotogramas', filepath=str(archivos[0]), channel=1, frame_start=1)
    for f in archivos[1:]:
        tira.elements.append(f.name)
    ajustes = esc.render.image_settings
    ajustes.media_type = 'VIDEO'
    ajustes.file_format = 'FFMPEG'
    ff = esc.render.ffmpeg
    ff.format = formato
    ff.codec = codec
    ff.audio_codec = 'NONE'
    ff.constant_rate_factor = 'CUSTOM'
    # La calidad y el GOP salen de medir cada video decodificado contra los PNG y, sobre todo, el salto entre dos
    # fotogramas seguidos donde la escena está quieta, que es todo del códec. Con un fotograma clave por segundo (GOP 30,
    # lo primero que se probó) la imagen quieta del tope «latía» al entrar cada clave: 0,6 niveles de media y hasta 50 en
    # los bordes, y lo mismo en la costura del bucle. Con una sola clave por vuelta el latido queda solo en la costura:
    # VP9 casi no deja nada (0,01) y H.264 a CRF 14 deja 0,3 de media y 16 de máximo (a CRF 26 eran 0,6 y 51). Así pesan
    # unos 115 KB (VP9) y 450 KB (H.264), lejos todavía del mega y medio.
    ff.custom_constant_rate_factor = 14 if codec == 'H264' else 22
    ff.ffmpeg_preset = 'BEST'
    ff.gopsize = DURACION
    temporal = destino.parent / f'_{destino.stem}_'
    esc.render.filepath = str(temporal)
    esc.render.use_file_extension = True
    antes = set(destino.parent.iterdir())
    bpy.ops.render.render(animation=True, scene=esc.name)
    nuevos = [p for p in destino.parent.iterdir() if p not in antes and p.name.startswith(temporal.name)]
    if not nuevos:
        raise SystemExit(f'Blender no escribió el video {destino.name}')
    if destino.exists():
        destino.unlink()
    nuevos[0].rename(destino)
    print('VIDEO', destino, destino.stat().st_size, flush=True)


def moov_delante(ruta):
    """Pasa el índice del MP4 (la caja `moov`) delante de los datos (`mdat`), lo que hace `qt-faststart` (D-274).

    El FFmpeg de Blender lo escribe al final y no deja pedir `-movflags +faststart`. Así, el navegador tenía que pedir
    el final del archivo antes de pintar el primer cuadro. Al moverlo, los desplazamientos de los trozos (`stco` y
    `co64`) crecen en lo que mide el índice, y se corrigen. Lo hecho a mano el 2026-11-05 decodificaba idéntico al
    original en los tres instantes comparados."""
    import struct

    contenedores = {b'moov', b'trak', b'mdia', b'minf', b'stbl', b'edts', b'dinf'}

    def cajas(datos, inicio, fin):
        i = inicio
        while i + 8 <= fin:
            largo, tipo = struct.unpack('>I4s', datos[i:i + 8])
            cabecera = 8
            if largo == 1:
                largo = struct.unpack('>Q', datos[i + 8:i + 16])[0]
                cabecera = 16
            elif largo == 0:
                largo = fin - i
            yield i, largo, tipo, cabecera
            i += largo

    datos = ruta.read_bytes()
    lista = list(cajas(datos, 0, len(datos)))
    tipos = [t for _, _, t, _ in lista]
    if b'moov' not in tipos or b'mdat' not in tipos or tipos.index(b'moov') < tipos.index(b'mdat'):
        return
    i_moov, l_moov = next((i, l) for i, l, t, _ in lista if t == b'moov')
    moov = bytearray(datos[i_moov:i_moov + l_moov])

    def corregir(inicio, fin):
        for i, largo, tipo, cabecera in cajas(moov, inicio, fin):
            if tipo in contenedores:
                corregir(i + cabecera, i + largo)
            elif tipo in (b'stco', b'co64'):
                ancho = 4 if tipo == b'stco' else 8
                formato = '>I' if tipo == b'stco' else '>Q'
                n = struct.unpack('>I', moov[i + cabecera + 4:i + cabecera + 8])[0]
                for k in range(n):
                    p = i + cabecera + 8 + ancho * k
                    moov[p:p + ancho] = struct.pack(formato, struct.unpack(formato, moov[p:p + ancho])[0] + l_moov)

    corregir(8, len(moov))
    i_mdat = next(i for i, _, t, _ in lista if t == b'mdat')
    resto = datos[:i_moov] + datos[i_moov + l_moov:]
    nuevo = resto[:i_mdat] + bytes(moov) + resto[i_mdat:]
    assert len(nuevo) == len(datos)
    ruta.write_bytes(nuevo)
    print('MOOV DELANTE', ruta, flush=True)


def poster(fotos, numero, destino):
    """El fotograma del tope (tibia adelantada, flechas encendidas) como WebP: lo que se ve antes de que cargue el video y
    con «reducir movimiento»."""
    imagen = bpy.data.images.load(str(fotos / f'{numero:04d}.png'))
    esc = bpy.context.scene
    # `save_render` pasa la imagen por la gestión de color de la escena: con «Standard» el sRGB del PNG sale igual.
    esc.view_settings.view_transform = 'Standard'
    esc.view_settings.look = 'None'
    esc.view_settings.exposure = 0.0
    esc.view_settings.gamma = 1.0
    ajustes = esc.render.image_settings
    ajustes.media_type = 'IMAGE'
    ajustes.file_format = 'WEBP'
    ajustes.color_mode = 'RGB'
    ajustes.quality = 86
    imagen.save_render(str(destino), scene=esc)
    print('POSTER', destino, destino.stat().st_size, flush=True)


FOTOS = SALIDA / 'fotogramas'
if not opc.get('solo_video'):
    montar()
    # Se guarda la escena y se vuelve a abrir antes de dibujar: dibujada recién montada, con el grafo de dependencias a
    # medio evaluar, la primera prueba salió sin la diáfisis del fémur detrás de la piel; abierta de nuevo, sale entera.
    ESCENA = SALIDA / 'escena-lachman.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(ESCENA))
    bpy.ops.wm.open_mainfile(filepath=str(ESCENA))
    dibujar(bpy.context.scene)
if opc['video'] or opc.get('solo_video'):
    unir_en_video(FOTOS, SALIDA / 'maniobra-lachman.mp4', 'MPEG4', 'H264')
    moov_delante(SALIDA / 'maniobra-lachman.mp4')
    unir_en_video(FOTOS, SALIDA / 'maniobra-lachman.webm', 'WEBM', 'WEBM')
if opc['poster']:
    poster(FOTOS, opc['poster'], SALIDA / 'maniobra-lachman.webp')

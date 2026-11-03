"""Dibuja las capas (piel, músculo, hueso, vasos, órganos) y los cortes del modelo completo, con fondo transparente.

    blender --background --factory-startup --python capas_y_cortes.py -- --blend X.blend --salida carpeta --tomas a,b,c [--muestras 64] [--escala 1]

El .blend sale de `scripts/atlas/fascias/vista_en_blender.py --sin-render --blend` sobre el GLB del atlas completo. Las dos rutas,
`--blend` y `--salida`, van absolutas: con una relativa Blender escribe en la raíz de la unidad C:, no donde se está parado.

Cada toma se dibuja sobre una copia recién abierta del .blend: un corte borra geometría y no se puede deshacer. Los cortes son
de verdad (bisect sobre cada objeto) y llevan tapa, con un material propio para la cara cortada: un hueso cortado es marfil y un
músculo cortado, rojo vivo, no el color de su superficie. La piel y las fascias son láminas y no se tapan: el corte deja de la piel
un anillo fino, que es lo que es.

Ejes de Blender: x = x del atlas, y = -z del atlas (el frente del cuerpo mira a -y), z = y del atlas - 0.86.
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
opc = {'blend': None, 'salida': None, 'tomas': [], 'muestras': 64, 'escala': 1.0}
i = 0
while i < len(args):
    k = args[i]
    if k == '--blend':
        opc['blend'] = args[i + 1]; i += 2
    elif k == '--salida':
        opc['salida'] = args[i + 1]; i += 2
    elif k == '--tomas':
        opc['tomas'] = args[i + 1].split(','); i += 2
    elif k == '--muestras':
        opc['muestras'] = int(args[i + 1]); i += 2
    elif k == '--escala':
        opc['escala'] = float(args[i + 1]); i += 2
    else:
        i += 1

SALIDA = Path(opc['salida'])
SALIDA.mkdir(parents=True, exist_ok=True)

# Qué es cada objeto del modelo, y de qué color es su cara cortada.
CAPAS = {
    'piel': ['Piel'],
    'fascias': ['Fascia_superficial', 'Fascia_profunda', 'Fascia_visceral', 'Fascia_meningea'],
    'musculos': ['Musculos', 'Tejido_conectivo'],
    'esqueleto': ['Esqueleto'],
    'arterias': ['Arterias'],
    'venas': ['Venas'],
    'nervios': ['Sistema_nervioso'],
    'organos': ['Aparato_digestivo', 'Aparato_respiratorio', 'Aparato_urinario', 'Aparato_reproductor', 'Corazon',
                'Sistema_endocrino', 'Sistema_linfatico'],
    'ojos': ['Ojos', 'Cornea', 'Organos_de_los_sentidos'],
}
# Las láminas no se tapan (un anillo de piel es un anillo).
SIN_TAPA = {'Piel', 'Fascia_superficial', 'Fascia_profunda', 'Fascia_visceral', 'Fascia_meningea', 'Cornea'}
COLOR_DE_LA_CARA_CORTADA = {
    'Piel': (0.93, 0.80, 0.55),
    'Musculos': (0.66, 0.12, 0.11),
    'Tejido_conectivo': (0.86, 0.80, 0.68),
    'Esqueleto': (0.90, 0.84, 0.70),
    'Arterias': (0.72, 0.05, 0.05),
    'Venas': (0.12, 0.17, 0.52),
    'Sistema_nervioso': (0.90, 0.80, 0.50),
    'Aparato_digestivo': (0.72, 0.38, 0.30),
    'Aparato_respiratorio': (0.80, 0.50, 0.50),
    'Aparato_urinario': (0.55, 0.20, 0.20),
    'Aparato_reproductor': (0.65, 0.35, 0.35),
    'Corazon': (0.55, 0.08, 0.08),
    'Sistema_endocrino': (0.80, 0.55, 0.30),
    'Sistema_linfatico': (0.80, 0.78, 0.55),
    'Ojos': (0.92, 0.90, 0.85),
    'Organos_de_los_sentidos': (0.82, 0.70, 0.62),
}

# --------------------------------------------------------------------------------------------- las tomas
# `ocultar`: capas fuera. `corte`: ('x'|'y'|'z', valor, lado que se quita) o ('z', valor, 'rebanada', grosor).
# `camara`: (posición, objetivo, lente) o ('orto', posición, objetivo, escala). `tam`: píxeles.
CUERPO = (1400, 2200)
CABEZA = (1800, 1600)
CUADRADO = (1600, 1600)
FRENTE = (0.0, -4.5, 0.0)
CENTRO = (0.0, 0.0, 0.0)

TOMAS = {
    # --- capas, el cuerpo entero de frente
    # La piel se dibuja sola: lo que hay debajo no debe asomar (la cintilla iliotibial roza la piel del muslo y deja rayas).
    'cuerpo-piel': dict(ocultar=['fascias', 'musculos', 'esqueleto', 'arterias', 'venas', 'nervios', 'organos'],
                        camara=(FRENTE, CENTRO, 85), tam=CUERPO),
    # La fascia superficial es un velo del color de la piel: dejarla es dejar la piel. «Sin piel» la quita también.
    'cuerpo-sin-piel': dict(ocultar=['piel', 'fascias'], camara=(FRENTE, CENTRO, 85), tam=CUERPO),
    'cuerpo-musculos': dict(ocultar=['piel', 'fascias', 'arterias', 'venas', 'nervios', 'organos'], esqueleto_desde=0.62,
                            camara=(FRENTE, CENTRO, 85), tam=CUERPO),
    'cuerpo-esqueleto': dict(ocultar=['piel', 'fascias', 'musculos', 'arterias', 'venas', 'nervios', 'organos'],
                             camara=(FRENTE, CENTRO, 85), tam=CUERPO),
    'cuerpo-vasos': dict(ocultar=['piel', 'fascias', 'musculos', 'nervios', 'organos'], camara=(FRENTE, CENTRO, 85), tam=CUERPO),
    'cuerpo-organos': dict(ocultar=['piel', 'fascias', 'musculos', 'arterias', 'venas', 'nervios', 'esqueleto'],
                           camara=((0.0, -2.6, 0.33), (0.0, 0.0, 0.33), 85), tam=(1600, 1800)),
    # --- capas en tres cuartos
    'cuerpo-piel-3q': dict(ocultar=['fascias', 'musculos', 'esqueleto', 'arterias', 'venas', 'nervios', 'organos'],
                           camara=((2.2, -3.9, 0.15), CENTRO, 85), tam=CUERPO),
    'cuerpo-esqueleto-3q': dict(ocultar=['piel', 'fascias', 'musculos', 'arterias', 'venas', 'nervios', 'organos'],
                                camara=((2.2, -3.9, 0.15), CENTRO, 85), tam=CUERPO),
    # --- cortes
    'corte-sagital-cuerpo': dict(ocultar=[], corte=('x', 0.0, 'menos'), camara=((-4.5, 0.0, 0.0), CENTRO, 85), tam=CUERPO),
    'corte-sagital-cabeza': dict(ocultar=[], corte=('x', 0.0, 'menos'), camara=((-1.25, 0.0, 0.76), (0.0, 0.012, 0.76), 85), tam=CABEZA),
    'corte-coronal-torax': dict(ocultar=['piel'], corte=('y', -0.035, 'menos'), camara=((0.0, -2.2, 0.38), (0.0, 0.0, 0.38), 85), tam=CUADRADO),
    'corte-axial-torax': dict(ocultar=[], corte=('z', 0.44, 'rebanada', 0.03), camara=((0.0, -0.75, 0.95), (0.0, -0.01, 0.43), 85), tam=CUADRADO),
    'corte-axial-abdomen': dict(ocultar=[], corte=('z', 0.20, 'rebanada', 0.03), camara=((0.0, -0.75, 0.70), (0.0, -0.02, 0.19), 85), tam=CUADRADO),
    'corte-axial-muslo': dict(ocultar=[], corte=('z', -0.20, 'rebanada', 0.03), camara=((-0.09, -0.62, 0.40), (-0.09, -0.02, -0.21), 85), tam=CUADRADO),
    'corte-axial-pierna': dict(ocultar=[], corte=('z', -0.45, 'rebanada', 0.03), camara=((-0.09, -0.62, 0.15), (-0.09, -0.02, -0.46), 85), tam=CUADRADO),
    'corte-axial-cabeza': dict(ocultar=[], corte=('z', 0.76, 'rebanada', 0.03), camara=((0.0, -0.45, 1.05), (0.0, 0.0, 0.76), 85), tam=CUADRADO),
}


def ocultar_capas(capas):
    nombres = {n for c in capas for n in CAPAS[c]}
    for o in bpy.data.objects:
        if o.name in nombres:
            o.hide_render = True
            o.hide_viewport = True


def quitar_por_debajo(objeto, z):
    """Deja de un objeto solo lo que queda por encima de `z`, sin tapa: el borde queda dentro de otras piezas y no se ve.
    Sirve para que la figura de los músculos lleve el cráneo, que si no es una cabeza vacía con los ojos flotando."""
    bm = bmesh.new()
    bm.from_mesh(objeto.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7, plane_co=(0, 0, z), plane_no=(0, 0, 1),
                           clear_inner=True)
    bm.to_mesh(objeto.data)
    bm.free()


def material_de_la_cara_cortada(nombre):
    """Un material plano (emisión) del color del tejido cortado: ni la tapa que se logra ni el interior que se ve por el
    corte llevan sombra, así que se leen igual y el corte parece macizo aunque la malla sea una superficie abierta."""
    color = COLOR_DE_LA_CARA_CORTADA.get(nombre, (0.85, 0.8, 0.75))
    m = bpy.data.materials.new(f'corte_{nombre}')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    emision = nt.nodes.new('ShaderNodeEmission')
    emision.inputs['Color'].default_value = (*color, 1.0)
    emision.inputs['Strength'].default_value = 1.0
    salida = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(emision.outputs['Emission'], salida.inputs['Surface'])
    return m


def pintar_el_interior(objeto):
    """Lo que se ve por dentro de un tejido cortado (las caras vistas por su revés) sale del color plano del corte.

    Los músculos del atlas son cáscaras abiertas: tapar el corte no basta, y por los huecos se veía el fondo. Así el interior
    de la cáscara, visto desde arriba, es una mancha del color del músculo."""
    color = COLOR_DE_LA_CARA_CORTADA.get(objeto.name, (0.85, 0.8, 0.75))
    for m in objeto.data.materials:
        if m is None or not m.use_nodes or m.name.startswith('corte_'):
            continue
        nt = m.node_tree
        salida = next((n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if salida is None or not salida.inputs['Surface'].links:
            continue
        origen = salida.inputs['Surface'].links[0].from_socket
        geometria = nt.nodes.new('ShaderNodeNewGeometry')
        emision = nt.nodes.new('ShaderNodeEmission')
        emision.inputs['Color'].default_value = (*color, 1.0)
        mezcla = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(geometria.outputs['Backfacing'], mezcla.inputs['Fac'])
        nt.links.new(origen, mezcla.inputs[1])
        nt.links.new(emision.outputs['Emission'], mezcla.inputs[2])
        nt.links.new(mezcla.outputs['Shader'], salida.inputs['Surface'])


def tapar(bm, aristas, normal, indice_de_material):
    """Rellena con caras el contorno de una pieza cortada y les da el material de la cara cortada.

    `triangle_fill` y no `holes_fill`: la segunda deja sin tapar los bucles que no son un anillo limpio, y en los músculos
    eso era casi todo (se veían las paredes como un tubo vacío, con el fondo a través)."""
    try:
        relleno = bmesh.ops.triangle_fill(bm, edges=aristas, use_beauty=True, use_dissolve=False, normal=normal)
        caras = [f for f in relleno['geom'] if isinstance(f, bmesh.types.BMFace)]
    except Exception:
        try:
            caras = bmesh.ops.holes_fill(bm, edges=aristas, sides=0)['faces']
        except Exception:
            caras = []
    for f in caras:
        f.material_index = indice_de_material


def componentes(bm):
    """El número de pieza conexa de cada vértice (por aristas). Los músculos van fundidos en un solo objeto, pero cada uno es
    una cáscara aparte: tapar cada pieza por separado evita que los bucles de dos músculos que se tocan se enreden."""
    bm.verts.index_update()
    pieza = {}
    n = 0
    for v in bm.verts:
        if v.index in pieza:
            continue
        pila = [v]
        pieza[v.index] = n
        while pila:
            u = pila.pop()
            for e in u.link_edges:
                w = e.other_vert(u)
                if w.index not in pieza:
                    pieza[w.index] = n
                    pila.append(w)
        n += 1
    return pieza


PROFUNDIDAD_DEL_FONDO = 0.04


def cortar(objeto, eje, valor, modo, grosor=0.03):
    """Corta un objeto por un plano y, si es un volumen, le pone tapa con el material de la cara cortada."""
    taparla = objeto.name not in SIN_TAPA
    if taparla or objeto.name == 'Piel':
        objeto.data.materials.append(material_de_la_cara_cortada(objeto.name))
    cara_cortada = len(objeto.data.materials) - 1
    normal = {'x': (1, 0, 0), 'y': (0, 1, 0), 'z': (0, 0, 1)}[eje]
    punto = {'x': (valor, 0, 0), 'y': (0, valor, 0), 'z': (0, 0, valor)}[eje]
    bm = bmesh.new()
    bm.from_mesh(objeto.data)
    bordes = []

    def un_corte(punto, quitar_lo_de_arriba):
        r = bmesh.ops.bisect_plane(
            bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7, plane_co=punto, plane_no=normal,
            clear_outer=quitar_lo_de_arriba, clear_inner=not quitar_lo_de_arriba,
        )
        return [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]

    if modo == 'rebanada':
        # Se queda lo que hay entre `valor - grosor` y `valor`; la tapa que se ve es la de arriba.
        arriba = un_corte(punto, True)
        punto_abajo = tuple(c - grosor * n for c, n in zip(punto, normal))
        abajo = un_corte(punto_abajo, False)
        bordes = [arriba, abajo]
    else:
        # 'menos': se quita todo lo que cae del lado negativo del eje.
        bordes = [un_corte(punto, False)]
    if objeto.name == 'Piel':
        # La piel es una lámina: no se tapa el corte, pero detrás de él hace falta un fondo, o lo que no es músculo ni hueso
        # (la grasa, las fascias) se ve como un agujero. El fondo es la propia silueta del corte, más atrás.
        pieza = componentes(bm)
        fondo = cara_cortada
        for k, b in enumerate(bordes):
            if modo == 'rebanada' and k == 0:
                continue  # el de arriba se deja abierto: es por donde se mira
            por_pieza = {}
            for e in [e for e in b if e.is_valid]:
                por_pieza.setdefault(pieza.get(e.verts[0].index, -1), []).append(e)
            for grupo in por_pieza.values():
                if modo == 'rebanada':
                    tapar(bm, grupo, normal, fondo)
                else:
                    desplazamiento = Vector(normal) * PROFUNDIDAD_DEL_FONDO
                    nuevos = {}
                    copia = []
                    for e in grupo:
                        extremos = []
                        for v in e.verts:
                            if v.index not in nuevos:
                                nuevos[v.index] = bm.verts.new(v.co + desplazamiento)
                            extremos.append(nuevos[v.index])
                        copia.append(bm.edges.new(extremos) if bm.edges.get(extremos) is None else bm.edges.get(extremos))
                    tapar(bm, copia, normal, fondo)
    elif taparla:
        pieza = componentes(bm)
        for b in bordes:
            b = [e for e in b if e.is_valid]
            por_pieza = {}
            for e in b:
                por_pieza.setdefault(pieza.get(e.verts[0].index, -1), []).append(e)
            for grupo in por_pieza.values():
                tapar(bm, grupo, normal, cara_cortada)
    bm.to_mesh(objeto.data)
    bm.free()
    objeto.data.update()


def luces(escena):
    """La iluminación del modelo (tres luces de sol y un fondo oscuro), más ambiente que la de los diagnósticos."""
    escena.world.node_tree.nodes['Background'].inputs[0].default_value = (0.55, 0.60, 0.70, 1)
    escena.world.node_tree.nodes['Background'].inputs[1].default_value = 0.55
    escena.view_settings.view_transform = 'Standard'
    escena.view_settings.look = 'None'
    escena.view_settings.exposure = -0.1
    for o in [o for o in bpy.data.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(o)
    for nombre, energia, rotacion, color in (
        ('clave', 3.2, (55, 10, 20), (1.0, 0.96, 0.92)),
        ('relleno', 1.6, (70, 0, 215), (0.80, 0.88, 1.0)),
        ('contraluz', 3.0, (-35, 0, 120), (1.0, 1.0, 1.0)),
    ):
        luz = bpy.data.lights.new(nombre, 'SUN')
        luz.energy = energia
        luz.color = color
        # Con el sol casi puntual (0,5°) los dedos de las manos dibujaban sus cuatro sombras nítidas sobre el muslo; con 10°
        # la sombra se difumina y se lee como lo que es, una sombra suave.
        luz.angle = math.radians(10)
        lo = bpy.data.objects.new(nombre, luz)
        escena.collection.objects.link(lo)
        lo.rotation_euler = tuple(math.radians(a) for a in rotacion)


def dibujar(nombre, toma):
    bpy.ops.wm.open_mainfile(filepath=opc['blend'])
    escena = bpy.context.scene
    ocultar_capas(toma.get('ocultar', []))
    if 'esqueleto_desde' in toma:
        for o in bpy.data.objects:
            if o.name in CAPAS['esqueleto']:
                quitar_por_debajo(o, toma['esqueleto_desde'])
    corte = toma.get('corte')
    if corte:
        visibles = [o for o in bpy.data.objects if o.type == 'MESH' and not o.hide_render]
        for o in visibles:
            if o.name not in SIN_TAPA:
                pintar_el_interior(o)
            if corte[2] == 'rebanada':
                cortar(o, corte[0], corte[1], 'rebanada', corte[3])
            else:
                cortar(o, corte[0], corte[1], 'menos')
    luces(escena)
    cam = next((o for o in bpy.data.objects if o.type == 'CAMERA'), None)
    if cam is None:
        cam = bpy.data.objects.new('camara', bpy.data.cameras.new('camara'))
        escena.collection.objects.link(cam)
    escena.camera = cam
    for c in list(cam.constraints):
        cam.constraints.remove(c)
    posicion, objetivo, lente = toma['camara']
    cam.location = posicion
    cam.rotation_euler = (Vector(objetivo) - Vector(posicion)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.type = 'PERSP'
    cam.data.lens = lente
    cam.data.clip_start = 0.05
    cam.data.clip_end = 30
    ancho, alto = toma['tam']
    escena.render.engine = 'CYCLES'
    escena.cycles.samples = opc['muestras']
    escena.cycles.use_denoising = True
    escena.render.resolution_x = int(ancho * opc['escala'])
    escena.render.resolution_y = int(alto * opc['escala'])
    escena.render.film_transparent = True
    escena.render.image_settings.file_format = 'PNG'
    escena.render.image_settings.color_mode = 'RGBA'
    escena.render.filepath = str(SALIDA / f'{nombre}.png')
    bpy.ops.render.render(write_still=True)
    print('dibujada', nombre, flush=True)


for t in opc['tomas']:
    if t not in TOMAS:
        print('no existe la toma', t, flush=True)
        continue
    dibujar(t, TOMAS[t])

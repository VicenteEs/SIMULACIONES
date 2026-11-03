"""
Mira las fascias en Blender (P-006, E1 y E4). Se ejecuta con Blender:

    blender --background --factory-startup --python scripts/atlas/fascias/vista_en_blender.py -- [opciones]

Tiene dos entradas, y las dos terminan en la misma escena y en las mismas vistas:

  --glb ruta.glb        Abre un modelo exportado de verdad (lo que recibe la consola quirúrgica: la pierna
                        cortada con su fascia recortada) y le pone el aspecto de cada tejido.
  (sin --glb)           Lee las piezas recién generadas de `salida/piezas/` según `manifiesto.json`, con las
                        del atlas que van debajo como contexto. Es la vista de trabajo de `generar.py`.

Opciones:

  --salida PREFIJO      Dónde escribir las imágenes: `PREFIJO_frente.png`, `_lado.png`, `_espalda.png`,
                        `_corte.png` y `_detalle.png`.
  --colores distintos   Cada pieza de fascia de un color, para ver dónde acaba una y empieza la vecina.
  --colores aspecto     El aspecto de verdad (`aspecto_en_blender.py`): color, fibras, brillo, translucidez.
  --corte-y M           El corte transversal a esa altura del atlas (con `--glb`, a la fracción de la altura
                        del modelo que dé `--corte-fraccion`, 0,5 por omisión: mitad del modelo).
  --blend RUTA          Guarda la escena en un `.blend`, con luces y cámara, para abrirla con ventana.
  --sin-render          No dibuja: solo arma (y guarda) la escena.
  --vistas a,b,c        Cuáles dibujar.

Lo que hace, en orden:

  1. Arma los objetos. De las coordenadas del atlas (Y arriba) a las de Blender (Z arriba) se pasa con
     `(x, y, z) → (x, −z, y)`, que es un giro y no un espejo: las caras siguen mirando hacia fuera. El
     importador de glTF de Blender hace lo mismo con un `.glb`.
  2. Les pone material.
  3. Pone luces y cámaras y dibuja el frente, el costado, la espalda, un detalle de cerca y, si se pide,
     el corte, que **parte cada objeto por el plano** y tapa los cerrados: es la imagen B del PDF.

Se importa `malla.py` y `atlas.py` de esta misma carpeta: solo usan numpy, que Blender trae.
"""

import argparse
import json
import math
import re
import sys
from pathlib import Path

import bpy
import bmesh
import numpy as np
from mathutils import Vector

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import aspecto_en_blender as ASPECTO  # noqa: E402
import malla as M  # noqa: E402
from atlas import Atlas  # noqa: E402

SALIDA = AQUI / 'salida'

COLORES_DE_SISTEMA = {
    'skeletal': (0.91, 0.886, 0.835),
    'muscular': (0.714, 0.329, 0.298),
    'connective': (0.847, 0.788, 0.659),
    'integumentary': (0.863, 0.753, 0.659),
    'nervous': (0.86, 0.66, 0.66),
    'cardiac': (0.72, 0.30, 0.34),
}
COLORES_DISTINTOS = [
    (0.20, 0.45, 0.95), (0.95, 0.55, 0.10), (0.20, 0.75, 0.40), (0.85, 0.25, 0.70),
    (0.95, 0.85, 0.15), (0.15, 0.80, 0.85), (0.60, 0.40, 0.95), (0.90, 0.30, 0.30),
]
#: Los sistemas que la vista del corte tapa: los volúmenes. Las fascias son láminas y quedan como anillos.
SISTEMAS_CERRADOS = {'skeletal', 'muscular', 'connective', 'integumentary'}


def argumentos():
    resto = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument('--glb', default=None)
    p.add_argument('--salida', default=str(SALIDA / 'vistas' / 'vista'))
    p.add_argument('--contexto', default='pierna-derecha', choices=['ninguno', 'pierna-derecha', 'pierna-izquierda', 'miembro-inferior-derecho', 'craneo', 'columna', 'cuerpo'])
    p.add_argument('--piel', action='store_true', help='Incluir la piel recortada a la zona.')
    p.add_argument('--corte-y', type=float, default=None, help='Altura (atlas) del corte transversal.')
    p.add_argument('--corte-fraccion', type=float, default=0.5, help='Con --glb, a qué fracción de la altura se corta.')
    p.add_argument('--colores', default='distintos', choices=['distintos', 'aspecto'])
    p.add_argument('--opacidad', type=float, default=0.55)
    p.add_argument('--blend', default=None, help='Guardar la escena en este .blend.')
    p.add_argument('--sin-render', action='store_true')
    p.add_argument('--vistas', default='frente,lado,espalda,corte,detalle')
    p.add_argument('--grupo', default=None, help='Solo las piezas de este grupo del manifiesto.')
    p.add_argument('--lado', default='derecho', choices=['derecho', 'izquierdo', 'ambos'])
    p.add_argument('--ids', default=None, help='Solo estas piezas del manifiesto, separadas por comas (sin la `M`).')
    p.add_argument('--capas', default='superficial,profunda,meningea,visceral',
                   help='Qué capas de fascia se ven (con --colores aspecto en el cuerpo entero), separadas por comas.')
    p.add_argument('--sin-piel', action='store_true', help='Esconde la piel del contexto del cuerpo.')
    p.add_argument('--sin-esqueleto', action='store_true', help='Esconde el esqueleto del contexto del cuerpo.')
    p.add_argument('--opacidad-capas', type=float, default=None,
                   help='En el cuerpo entero, la misma opacidad para todas las capas de fascia (para ver una sola).')
    p.add_argument('--corte-x', type=float, default=None,
                   help='Corte sagital: quita todo lo que está del lado de la x menor a ésta (en metros del atlas), y mira desde ese lado.')
    p.add_argument('--muestras', type=int, default=48)
    p.add_argument('--cerebro', action='store_true', help='Con --contexto craneo, dibujar también el cerebro.')
    p.add_argument('--piel-opacidad', type=float, default=0.22,
                   help='Con --glb, la opacidad de la piel en la vista: 1 la deja como viene del archivo (maciza) y 0 la esconde.')
    return p.parse_args(resto)


# ------------------------------------------------------------------ geometría


def a_blender(v):
    """Del atlas (Y arriba) a Blender (Z arriba): un giro, no un espejo."""
    v = np.asarray(v, np.float64)
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], axis=1)


def material_sencillo(nombre, color, opacidad, brillo):
    material = bpy.data.materials.new(nombre)
    material.use_nodes = True
    principal = material.node_tree.nodes['Principled BSDF']
    principal.inputs['Base Color'].default_value = (*color, 1.0)
    principal.inputs['Roughness'].default_value = brillo
    if opacidad < 1.0:
        principal.inputs['Alpha'].default_value = opacidad
        material.surface_render_method = 'DITHERED'
        material.use_backface_culling = False
    return material


def crear_objeto(nombre, v, f, color, opacidad=1.0, coleccion=None, brillo=0.5, sistema=None, aspecto=False):
    malla = bpy.data.meshes.new(nombre)
    malla.from_pydata(a_blender(v).tolist(), [], np.asarray(f).tolist())
    malla.update()
    for p in malla.polygons:
        p.use_smooth = True
    objeto = bpy.data.objects.new(nombre, malla)
    (coleccion or bpy.context.scene.collection).objects.link(objeto)
    objeto.data.materials.append(material_sencillo(nombre, color, opacidad, brillo))
    if sistema:
        objeto['sistema'] = sistema
    if aspecto and sistema:
        ASPECTO.aplicar(objeto, sistema)
    return objeto


def leer_pieza_generada(registro):
    """Posiciones y triángulos de una pieza de `salida/piezas/` (el formato del paquete del atlas)."""
    datos = (SALIDA / 'piezas' / f"{registro['id']}.bin").read_bytes()
    n, m = registro['vertices'], registro['indices']
    pos = np.frombuffer(datos, '<f4', n * 3, 0).reshape(-1, 3)
    desde = n * 12 + n * 6
    desde += (-desde) % 4
    idx = np.frombuffer(datos, '<u4', m, desde).reshape(-1, 3)
    return pos.astype(np.float64), idx.astype(np.int64)


def cortar_en_z(objeto, z, cerrar, grosor=0.012):
    """
    Deja de un objeto la rebanada de `grosor` metros que acaba en la altura `z` (Blender), y la tapa si es cerrado.

    Es el corte transversal de la imagen B del PDF. Una rebanada y no «todo lo de abajo» porque la
    cámara mira desde arriba y vería, además del corte, el pie entero por detrás. Las fascias, que
    son láminas abiertas, quedan como anillos sin tapar.
    """
    bm = bmesh.new()
    bm.from_mesh(objeto.data)
    resultado = bmesh.ops.bisect_plane(
        bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7,
        plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_outer=True, clear_inner=False,
    )
    corte_arriba = [e for e in resultado['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    resultado = bmesh.ops.bisect_plane(
        bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7,
        plane_co=(0, 0, z - grosor), plane_no=(0, 0, 1), clear_outer=False, clear_inner=True,
    )
    corte_abajo = [e for e in resultado['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if cerrar:
        for borde in (corte_arriba, corte_abajo):
            borde = [e for e in borde if e.is_valid]
            if borde:
                bmesh.ops.holes_fill(bm, edges=borde, sides=0)
    bm.to_mesh(objeto.data)
    bm.free()
    objeto.data.update()


def cortar_en_x(objeto, x, cerrar):
    """Quita de un objeto todo lo que cae en x menor que `x` (el corte sagital); tapa el corte si es un volumen cerrado."""
    bm = bmesh.new()
    bm.from_mesh(objeto.data)
    resultado = bmesh.ops.bisect_plane(
        bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-7,
        plane_co=(x, 0, 0), plane_no=(1, 0, 0), clear_outer=False, clear_inner=True,
    )
    borde = [e for e in resultado['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    if cerrar and borde:
        bmesh.ops.holes_fill(bm, edges=[e for e in borde if e.is_valid], sides=0)
    bm.to_mesh(objeto.data)
    bm.free()
    objeto.data.update()


# -------------------------------------------------------------------- escena


def cargar_generadas(args):
    manifiesto = json.loads((SALIDA / 'manifiesto.json').read_text(encoding='utf8'))
    registros = manifiesto['piezas']
    if args.grupo:
        registros = [r for r in registros if r.get('grupo') == args.grupo]
    if args.lado != 'ambos':
        registros = [r for r in registros if r['id'].endswith('M') == (args.lado == 'izquierdo')]
    if args.ids:
        quedan = set(args.ids.split(','))
        registros = [r for r in registros if r['id'].rstrip('M') in quedan]
    return registros


#: Con cuánta opacidad se ve cada capa en el cuerpo entero: más translúcidas que en el `.glb` (0,45 a 0,65), porque aquí se
#: miran unas a través de otras y la superficial, la más grande, tapa todo lo demás si no se le baja.
OPACIDAD_DE_LA_CAPA = {
    'fascia-superficial': 0.22,
    'fascia-profunda': 0.40,
    'fascia-meningea': 0.55,
    'fascia-visceral': 0.45,
}

#: Cómo se llama cada capa en el esquema de Blender, y en qué orden (la superficial arriba).
COLECCIONES_DE_FASCIA = {
    'fascia-superficial': 'Fascia superficial',
    'fascia-profunda': 'Fascia profunda',
    'fascia-meningea': 'Fascia meníngea',
    'fascia-visceral': 'Fascia visceral',
}

#: Los órganos que el cuerpo entero enseña de contexto (las capas viscerales y meníngeas se leen contra ellos).
ORGANOS_DEL_CONTEXTO = re.compile(
    r'^(Wall of ventricle|Wall of (left|right) atrium|Ascending aorta|Arch of aorta|Descending thoracic aorta|Pulmonary trunk|'
    r'Superior vena cava|Inferior vena cava|Esophagus|Trachea|Left main bronchus|Right main bronchus proper|Stomach|Spleen|Pancreas|'
    r'Gallbladder|Duodenum|Appendix|Cecum|Ascending colon|Transverse colon|Descending colon|Sigmoid colon|Rectum|Urinary bladder|'
    r'(Left|Right) kidney|(Left|Right) adrenal gland|(Proximal|Middle|Distal) part of (jejunum|ileum)|Caudate lobe of liver)$'
)


def traducciones():
    """La tabla de nombres en español de la plataforma, para que el esquema de Blender se lea como el árbol del taller."""
    ruta = AQUI.parents[2] / 'src' / 'atlas' / 'nombres-es.json'
    try:
        return json.loads(ruta.read_text(encoding='utf8'))
    except OSError:
        return {}


def construir_desde_el_manifiesto(args):
    escena = bpy.context.scene
    es = traducciones()
    coleccion_contexto = bpy.data.collections.new('Contexto')
    coleccion_fascias = bpy.data.collections.new('Fascias')
    escena.collection.children.link(coleccion_contexto)
    escena.collection.children.link(coleccion_fascias)
    # Cada capa en su colección, para encenderla y apagarla con el ojo del esquema.
    por_capa = {}
    for sistema, nombre in COLECCIONES_DE_FASCIA.items():
        c = bpy.data.collections.new(nombre)
        coleccion_fascias.children.link(c)
        por_capa[sistema] = c

    objetos = []
    registros = cargar_generadas(args)
    cajas = []
    for k, registro in enumerate(registros):
        v, f = leer_pieza_generada(registro)
        cajas.append(M.caja_de(v))
        if args.colores == 'distintos':
            color, brillo, aspecto = COLORES_DISTINTOS[k % len(COLORES_DISTINTOS)], 0.4, False
        else:
            color, brillo, aspecto = (0.914, 0.71, 0.678), 0.35, True
        opacidad = OPACIDAD_DE_LA_CAPA.get(registro['sistema'], 0.6) if args.contexto == 'cuerpo' else 0.6
        if args.opacidad_capas is not None:
            opacidad = args.opacidad_capas
        o = crear_objeto(es.get(registro['nombre'], registro['nombre']), v, f, color, args.opacidad if not aspecto else opacidad,
                         por_capa.get(registro['sistema'], coleccion_fascias), brillo,
                         sistema=registro['sistema'], aspecto=aspecto)
        if o['sistema'].replace('fascia-', '') not in args.capas.split(','):
            o.hide_render = True
            o.hide_viewport = True
        o['fma'] = registro.get('fma', '')
        o['nombre_original'] = registro['nombre']
        objetos.append((o, False, registro))

    if args.contexto in ('craneo', 'columna'):
        # Las meninges se miran **dentro de su hueso**: el cráneo o la columna, translúcidos, y el cerebro entero
        # en el cráneo. Opacidad baja para ver las capas a través.
        import entradas_meningeas as G

        atlas = Atlas()
        if args.contexto == 'craneo':
            piezas = G.piezas_del_craneo(atlas)
            cerebro = G.piezas_del_cerebro(atlas) if args.cerebro else []
        else:
            piezas = G.piezas_de_la_columna(atlas) + [
                p for p in atlas.piezas if not p.get('generada') and p['nombre'].startswith('Intervertebral disk')]
            cerebro = []
        for p in piezas + cerebro:
            v, f = atlas.malla(p)
            color = COLORES_DE_SISTEMA.get(p['sistema'], (0.7, 0.7, 0.7))
            opacidad = 0.20 if p in piezas else 0.55
            objetos.append((crear_objeto(p['nombre'], v, f, color, opacidad, coleccion_contexto, 0.6, sistema=p['sistema']), True, p))
    elif args.contexto == 'cuerpo':
        # El cuerpo entero como contexto: el esqueleto, el cerebro y los órganos que las capas envuelven, y la piel casi
        # transparente. Cada grupo en su colección, para quitar lo que estorba.
        import entradas_meningeas as G

        atlas = Atlas()
        grupos = {
            'Esqueleto': [p for p in atlas.piezas if not p.get('generada') and p['sistema'] == 'skeletal'
                          and not p['nombre'].startswith('Intervertebral')],
            'Discos intervertebrales': [p for p in atlas.piezas if not p.get('generada') and p['nombre'].startswith('Intervertebral')],
            'Cerebro': G.piezas_del_cerebro(atlas),
            'Órganos': [p for p in atlas.piezas if not p.get('generada') and ORGANOS_DEL_CONTEXTO.match(p['nombre'])],
        }
        vistos = set()
        for nombre_grupo, piezas in grupos.items():
            c = bpy.data.collections.new(nombre_grupo)
            coleccion_contexto.children.link(c)
            for p in piezas:
                if p['id'] in vistos:
                    continue
                vistos.add(p['id'])
                v, f = atlas.malla(p)
                color = COLORES_DE_SISTEMA.get(p['sistema'], (0.72, 0.46, 0.43))
                o = crear_objeto(es.get(p['nombre'], p['nombre']), v, f, color, 1.0, c, 0.6, sistema=p['sistema'],
                                 aspecto=args.colores == 'aspecto')
                if args.sin_esqueleto and nombre_grupo in ('Esqueleto', 'Discos intervertebrales'):
                    o.hide_render = True
                    o.hide_viewport = True
                objetos.append((o, True, p))
        piel = atlas.por_nombre('Skin')[0]
        v, f = atlas.malla(piel)
        c = bpy.data.collections.new('Piel')
        coleccion_contexto.children.link(c)
        o = crear_objeto('Piel', v, f, COLORES_DE_SISTEMA['integumentary'], 0.08, c, 0.7, sistema='integumentary',
                         aspecto=args.colores == 'aspecto')
        if args.sin_piel:
            o.hide_render = True
            o.hide_viewport = True
        objetos.append((o, False, piel))
    elif args.contexto != 'ninguno':
        atlas = Atlas()
        lado = 'izquierdo' if 'izquierda' in args.contexto else 'derecho'
        regiones = [f'miembro-inferior-{lado}', f'pie-{lado}']
        piezas = atlas.seleccionar(regiones=regiones, sistemas=['muscular', 'connective', 'skeletal'])
        extra = ['gluteus maximus', 'gluteus medius', 'gluteus minimus', 'tensor fasciae latae', 'hip bone', 'piriformis']
        piezas += atlas.seleccionar(filtro=lambda p: any(e in p['nombre'].lower() for e in extra) and (lado == 'derecho') == ('right' in p['nombre'].lower()))
        vistos = set()
        for p in piezas:
            if p['id'] in vistos:
                continue
            vistos.add(p['id'])
            v, f = atlas.malla(p)
            color = COLORES_DE_SISTEMA.get(p['sistema'], (0.7, 0.7, 0.7))
            objetos.append((crear_objeto(p['nombre'], v, f, color, 1.0, coleccion_contexto, 0.6, sistema=p['sistema'], aspecto=args.colores == 'aspecto'), True, p))
        if args.piel:
            piel = atlas.por_nombre('Skin')[0]
            v, f = atlas.malla(piel)
            if cajas:
                bajo = np.min([c[0] for c in cajas], axis=0) - 0.06
                alto = np.max([c[1] for c in cajas], axis=0) + 0.06
                planos = [M.mitad_de_espacio(bajo, (1, 0, 0)), M.mitad_de_espacio(alto, (-1, 0, 0)),
                          M.mitad_de_espacio(bajo, (0, 1, 0)), M.mitad_de_espacio(alto, (0, -1, 0)),
                          M.mitad_de_espacio(bajo, (0, 0, 1)), M.mitad_de_espacio(alto, (0, 0, -1))]
                v, f = M.recortar_por_planos(v, f, planos)
            objetos.append((crear_objeto('Piel', v, f, COLORES_DE_SISTEMA['integumentary'], 0.35, coleccion_contexto, 0.7,
                                         sistema='integumentary', aspecto=args.colores == 'aspecto'), False, piel))
    if args.corte_x is not None:
        for objeto, _es_contexto, info in objetos:
            cortar_en_x(objeto, args.corte_x, str(info.get('sistema', '')) in ('skeletal',))
    if cajas:
        minimo = np.min([c[0] for c in cajas], axis=0)
        maximo = np.max([c[1] for c in cajas], axis=0)
    else:
        minimo, maximo = np.array([-0.2, 0, -0.1]), np.array([0.0, 1.0, 0.1])
    # La caja de las fascias, en las coordenadas de Blender.
    esquinas = a_blender(np.array([minimo, maximo]))
    return objetos, np.min(esquinas, axis=0), np.max(esquinas, axis=0)


def sistema_por_el_nombre(nombre):
    """El sistema de un objeto que no trae `extras`, por cómo se llama (un modelo hecho a mano)."""
    n = nombre.lower()
    if 'fascia_profunda' in n:
        return 'fascia-profunda'
    if 'fascia_superficial' in n:
        return 'fascia-superficial'
    if n.startswith('piel'):
        return 'integumentary'
    if n.startswith('musculo'):
        return 'muscular'
    if 'esqueleto' in n or 'tibia' in n or 'hueso' in n:
        return 'skeletal'
    if 'conectivo' in n:
        return 'connective'
    return None


def construir_desde_un_glb(args):
    """Importa un modelo exportado y le pone el aspecto de cada tejido según el `sistema` que lleva en sus extras."""
    bpy.ops.import_scene.gltf(filepath=str(Path(args.glb).resolve()))
    objetos = []
    minimo = np.array([np.inf] * 3)
    maximo = np.array([-np.inf] * 3)
    for objeto in list(bpy.context.scene.objects):
        if objeto.type != 'MESH':
            continue
        sistema = objeto.get('sistema') or sistema_por_el_nombre(objeto.name)
        if args.colores == 'aspecto' and sistema:
            # Un grupo de aspecto propio (los ojos, la córnea) manda sobre el sistema al que pertenece.
            ASPECTO.aplicar(objeto, objeto.get('aspecto') or sistema)
        if sistema == 'integumentary' and args.piel_opacidad < 1.0:
            # La piel del archivo es maciza (así se enciende y se apaga en la consola): para mirar lo de
            # debajo se la deja translúcida, o se esconde del todo con 0.
            if args.piel_opacidad <= 0.0:
                objeto.hide_render = True
                objeto.hide_viewport = True
            else:
                for ranura in objeto.material_slots:
                    principal = ranura.material.node_tree.nodes.get('Principled BSDF')
                    if principal is not None:
                        for enlace in list(principal.inputs['Alpha'].links):
                            ranura.material.node_tree.links.remove(enlace)
                        principal.inputs['Alpha'].default_value = args.piel_opacidad
                    ranura.material.surface_render_method = 'DITHERED'
        for p in objeto.data.polygons:
            p.use_smooth = True
        # Qué capas de fascia se ven (`--capas`): las demás se esconden, para mirar la profunda sin la superficial encima.
        if sistema and sistema.startswith('fascia-') and sistema.replace('fascia-', '') not in args.capas.split(','):
            objeto.hide_render = True
            objeto.hide_viewport = True
        cajas = np.array([objeto.matrix_world @ Vector(c) for c in objeto.bound_box])
        minimo = np.minimum(minimo, cajas.min(axis=0))
        maximo = np.maximum(maximo, cajas.max(axis=0))
        objetos.append((objeto, True, {'sistema': sistema or ''}))
    print('OBJETOS', [(o.name, i['sistema']) for o, _, i in objetos], flush=True)
    return objetos, minimo, maximo


def luces_y_camara(centro, extension):
    escena = bpy.context.scene
    escena.world = bpy.data.worlds.new('mundo')
    escena.world.use_nodes = True
    # Un fondo oscuro de estudio: una lámina translúcida y pálida sobre un gris claro no se ve (se probó, y todas las
    # capas salían blancas). Con «Estándar» y no el AgX de Blender, que desatura los rosados y los amarillos de las fascias.
    escena.world.node_tree.nodes['Background'].inputs[0].default_value = (0.045, 0.052, 0.066, 1)
    escena.world.node_tree.nodes['Background'].inputs[1].default_value = 1.0
    escena.view_settings.view_transform = 'Standard'
    escena.view_settings.look = 'None'
    escena.view_settings.exposure = -0.2
    # Tres luces: una clave algo cálida desde arriba y adelante, un relleno frío desde el otro lado y un
    # contraluz que dibuja el borde de las láminas (es lo que hace brillar el brillo sedoso).
    for nombre, energia, rotacion, color in (
        ('clave', 2.6, (55, 10, 35), (1.0, 0.96, 0.92)),
        ('relleno', 0.9, (70, 0, 215), (0.80, 0.88, 1.0)),
        ('contraluz', 3.2, (-35, 0, 120), (1.0, 1.0, 1.0)),
    ):
        luz = bpy.data.lights.new(nombre, 'SUN')
        luz.energy = energia
        luz.color = color
        lo = bpy.data.objects.new(nombre, luz)
        escena.collection.objects.link(lo)
        lo.rotation_euler = tuple(math.radians(a) for a in rotacion)
    cam = bpy.data.cameras.new('camara')
    co = bpy.data.objects.new('camara', cam)
    escena.collection.objects.link(co)
    escena.camera = co
    cam.type = 'ORTHO'
    cam.ortho_scale = extension
    cam.clip_start = 0.01
    cam.clip_end = 20
    return co


def apuntar(camara, centro, direccion, distancia=3.0):
    """
    Pone la cámara a `distancia` del centro, mirando hacia él desde `direccion` (en ejes de Blender).

    `to_track_quat('-Z', 'Y')` alinea el eje Y **de la cámara** con el Z del mundo, que es lo que se
    quiere en una vista horizontal. Mirando desde arriba, la vista y el «arriba» coinciden y el giro
    queda sin definir (la primera versión salió con la espalda boca abajo): ahí se fija a mano, con
    el frente del cuerpo hacia la parte alta de la imagen.
    """
    d = Vector(direccion).normalized()
    camara.location = Vector(centro) + d * distancia
    if abs(d.z) > 0.99:
        camara.rotation_euler = (0.0, 0.0, math.pi if d.z > 0 else 0.0)
        return
    camara.rotation_euler = (Vector(centro) - camara.location).to_track_quat('-Z', 'Y').to_euler()


def dibujar(args, centro, extension, objetos, corte_z):
    escena = bpy.context.scene
    escena.render.engine = 'BLENDER_EEVEE'
    try:
        escena.eevee.taa_render_samples = args.muestras
    except Exception:
        pass
    escena.render.resolution_x = 1000
    escena.render.resolution_y = 1100
    escena.render.film_transparent = False
    camara = luces_y_camara(centro, extension)
    args.salida = str(Path(args.salida).resolve())
    Path(args.salida).parent.mkdir(parents=True, exist_ok=True)
    direcciones = {
        'frente': (0, -1, 0.15),
        'lado': (-1, 0, 0.15) if args.lado != 'izquierdo' else (1, 0, 0.15),
        'espalda': (0, 1, 0.15),
        'detalle': (0, -1, 0.1),
        'corte': (0, 0, 1),
    }
    vistas = [v for v in args.vistas.split(',') if v in direcciones]
    # El corte va al final: parte los objetos de la escena y las demás vistas los quieren enteros.
    vistas.sort(key=lambda v: v == 'corte')
    for nombre in vistas:
        if nombre == 'corte':
            if corte_z is None:
                continue
            for objeto, _es_contexto, info in objetos:
                sistema = str(info.get('sistema', ''))
                cortar_en_z(objeto, corte_z, sistema in SISTEMAS_CERRADOS)
            camara.data.ortho_scale = 0.42
            apuntar(camara, (centro[0], centro[1], corte_z), direcciones[nombre], 1.0)
        elif nombre == 'detalle':
            # De cerca: unos siete centímetros de ancho, donde se ven los hilos de la fascia.
            camara.data.ortho_scale = 0.07
            apuntar(camara, (centro[0], centro[1], centro[2] + 0.02), direcciones[nombre], 3.0)
        else:
            camara.data.ortho_scale = extension
            apuntar(camara, centro, direcciones[nombre], 3.0)
        escena.render.filepath = f'{args.salida}_{nombre}.png'
        bpy.ops.render.render(write_still=True)
        print('VISTA', escena.render.filepath, flush=True)


def main():
    args = argumentos()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if args.glb:
        objetos, minimo, maximo = construir_desde_un_glb(args)
    else:
        objetos, minimo, maximo = construir_desde_el_manifiesto(args)
    centro = tuple((minimo + maximo) / 2)
    extension = float(max(maximo - minimo) * 1.15)
    # Dónde se corta: con `--glb`, a una fracción de la altura; sin él, a la altura del atlas que se pida.
    corte_z = None
    if args.corte_y is not None:
        corte_z = args.corte_y
    elif args.glb:
        corte_z = float(minimo[2] + args.corte_fraccion * (maximo[2] - minimo[2]))
    if args.blend:
        luces_y_camara(centro, extension)
        # Para abrirla con ventana: perspectiva, de frente y algo desde arriba, encuadrando todo.
        cam = bpy.context.scene.camera
        cam.data.type = 'PERSP'
        cam.data.lens = 70
        cam.data.clip_end = 100
        apuntar(cam, centro, (0.35, -1.0, 0.25), extension * 2.6)
        # Para quien la abra con ventana: la vista previa de materiales (con el color, la translucidez y el rayado de las
        # fascias, que el modo sólido no enseña), mirando por la cámara.
        for pantalla in bpy.data.screens:
            for area in pantalla.areas:
                if area.type != 'VIEW_3D':
                    continue
                for espacio in area.spaces:
                    if espacio.type == 'VIEW_3D':
                        espacio.shading.type = 'MATERIAL'
                        try:
                            espacio.region_3d.view_perspective = 'CAMERA'
                            espacio.clip_end = 100
                        except Exception:
                            pass
        bpy.context.scene.render.engine = 'BLENDER_EEVEE'
        bpy.context.scene.render.resolution_x = 1600
        bpy.context.scene.render.resolution_y = 1760
        args.blend = str(Path(args.blend).resolve())
        Path(args.blend).parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=args.blend)
        print('BLEND', args.blend, flush=True)
        # La escena se vuelve a armar limpia para las vistas: `luces_y_camara` crea la suya.
        for o in [o for o in bpy.context.scene.objects if o.type in ('LIGHT', 'CAMERA')]:
            bpy.data.objects.remove(o, do_unlink=True)
    if not args.sin_render:
        dibujar(args, centro, extension, objetos, corte_z)


main()

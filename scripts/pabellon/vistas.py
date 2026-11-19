"""
Vistas de comprobación del campo quirúrgico (P-014, E1): abre lo que `generar.py` dejó en `privado/pabellon/` y lo
fotografía.

    blender --background --factory-startup --python scripts/pabellon/vistas.py -- [opciones]

    --decubito supino | prono         cuál (por omisión, supino)
    --vista general,lateral,…         cuáles, separadas por comas; «todas» por omisión
    --ventana rodilla | mano | …      abre en el paño una ventana de muestra y deja ver solo esa parte de la piel
    --sin-pano / --sin-piel           para mirar lo que hay debajo
    --muestras 64 --ancho 1600        la calidad

Lee los mismos `.glb` que va a cargar el simulador, y no las mallas intermedias, a propósito: lo que se mira aquí
es lo que viaja. Las imágenes van a `scripts/pabellon/salida/vistas/`, que no viaja.

No es el aspecto final —eso lo da el simulador, con sus luces y su sombreado—, pero las telas llevan las mismas
texturas y un material equivalente, así que sirve para decidir la forma y el color antes de tocar el navegador.
"""

import argparse
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comun as C  # noqa: E402

# Los tres colores del paño que el médico podrá elegir por caso, en sRGB.
COLORES = {
    'azul': (0.118, 0.318, 0.612),
    'celeste': (0.435, 0.690, 0.835),
    'verde': (0.180, 0.490, 0.420),
}

# Ventanas de muestra, en el cuerpo: centro (x, y) y medio tamaño. Solo sirven para estas vistas; en el
# simulador la ventana sale de la caja de lo recortado.
VENTANAS = {
    'rodilla': {'centro': (-0.095, 0.50), 'medio': (0.085, 0.16)},
    'pierna': {'centro': (-0.10, 0.27), 'medio': (0.075, 0.17)},
    'mano': {'centro': (-0.275, 0.80), 'medio': (0.075, 0.11)},
    'cadera': {'centro': (-0.13, 0.90), 'medio': (0.11, 0.14)},
    'hombro': {'centro': (-0.18, 1.36), 'medio': (0.10, 0.11)},
    'columna': {'centro': (0.0, 1.12), 'medio': (0.09, 0.20)},
    'tobillo': {'centro': (-0.10, 0.08), 'medio': (0.07, 0.10)},
}

# Desde dónde se mira, en el marco del colchón (X el ancho, Y hacia la cabeza, Z hacia arriba): la cámara, el
# punto al que mira y la focal en milímetros.
VISTAS = {
    'general': ((1.55, -1.75, 1.35), (0.0, -0.05, 0.05), 50),
    'lateral': ((2.3, 0.0, 0.42), (0.0, 0.0, 0.05), 55),
    'cenital': ((0.0, 0.0, 3.3), (0.0, 0.0, 0.0), 50),
    'pies': ((0.55, -2.25, 0.75), (0.0, -0.2, 0.08), 50),
    'cabeza': ((-0.75, 2.2, 0.95), (0.0, 0.25, 0.08), 50),
}


def argumentos():
    resto = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser(prog='vistas.py')
    p.add_argument('--decubito', default='supino', choices=C.DECUBITOS)
    p.add_argument('--vista', default='todas')
    p.add_argument('--ventana', default='')
    p.add_argument('--color', default='azul', choices=tuple(COLORES))
    p.add_argument('--sin-pano', action='store_true')
    p.add_argument('--sin-piel', action='store_true')
    p.add_argument('--sin-texturas', action='store_true')
    p.add_argument('--muestras', type=int, default=64)
    p.add_argument('--ancho', type=int, default=1600)
    p.add_argument('--sufijo', default='')
    p.add_argument('--nombre', default='')
    p.add_argument('--blend', action='store_true', help='guarda además la escena, para abrirla en Blender')
    args = p.parse_args(resto)
    # El sufijo se da sin guion —«prueba»— y el guion se pone aquí: un argumento que empieza por guion,
    # argparse lo toma por otra opción.
    args.sufijo = f'-{args.sufijo}' if args.sufijo else ''
    return args


def lineal(c):
    """De sRGB a lineal, que es en lo que Blender quiere los colores."""
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


# --------------------------------------------------------------------------------------------- materiales


def nodos_de(material):
    material.use_nodes = True
    arbol = material.node_tree
    principal = next(n for n in arbol.nodes if n.type == 'BSDF_PRINCIPLED')
    salida = next(n for n in arbol.nodes if n.type == 'OUTPUT_MATERIAL')
    return arbol, principal, salida


def imagen(nombre):
    ruta = C.PABELLON / nombre
    if not ruta.exists():
        return None
    img = bpy.data.images.load(str(ruta), check_existing=True)
    img.colorspace_settings.name = 'Non-Color'
    return img


def poner_relieve(arbol, principal, pliegues, detalle, repeticiones, fuerza_pliegues=1.0, fuerza_detalle=1.0):
    """
    Las dos normales de una tela: la de pliegues, única, y la del relieve del tejido, que se repite. Se mezclan
    como las va a mezclar el sombreador del simulador —se suman las pendientes y se multiplican las alturas—,
    para que la foto y el navegador partan de la misma cuenta.
    """
    def vector_de(img, escala):
        tex = arbol.nodes.new('ShaderNodeTexImage')
        tex.image = img
        if escala != 1.0:
            coordenadas = arbol.nodes.new('ShaderNodeTexCoord')
            mapa = arbol.nodes.new('ShaderNodeMapping')
            mapa.inputs['Scale'].default_value = (escala, escala, 1.0)
            arbol.links.new(coordenadas.outputs['UV'], mapa.inputs['Vector'])
            arbol.links.new(mapa.outputs['Vector'], tex.inputs['Vector'])
        # Del color (0…1) al vector (−1…1).
        n = arbol.nodes.new('ShaderNodeVectorMath')
        n.operation = 'MULTIPLY_ADD'
        n.inputs[1].default_value = (2.0, 2.0, 2.0)
        n.inputs[2].default_value = (-1.0, -1.0, -1.0)
        arbol.links.new(tex.outputs['Color'], n.inputs[0])
        partes = arbol.nodes.new('ShaderNodeSeparateXYZ')
        arbol.links.new(n.outputs['Vector'], partes.inputs['Vector'])
        return partes

    capas = [(vector_de(img, escala), fuerza) for img, escala, fuerza in (
        (pliegues, 1.0, fuerza_pliegues), (detalle, repeticiones, fuerza_detalle)) if img is not None]
    if not capas:
        return

    def sumar(eje):
        salida = None
        for partes, fuerza in capas:
            n = arbol.nodes.new('ShaderNodeMath')
            n.operation = 'MULTIPLY'
            n.inputs[1].default_value = fuerza
            arbol.links.new(partes.outputs[eje], n.inputs[0])
            if salida is None:
                salida = n
            else:
                suma = arbol.nodes.new('ShaderNodeMath')
                suma.operation = 'ADD'
                arbol.links.new(salida.outputs[0], suma.inputs[0])
                arbol.links.new(n.outputs[0], suma.inputs[1])
                salida = suma
        return salida

    def multiplicar(eje):
        salida = None
        for partes, _ in capas:
            if salida is None:
                salida = partes.outputs[eje]
            else:
                n = arbol.nodes.new('ShaderNodeMath')
                n.operation = 'MULTIPLY'
                arbol.links.new(salida, n.inputs[0])
                arbol.links.new(partes.outputs[eje], n.inputs[1])
                salida = n.outputs[0]
        return salida

    junto = arbol.nodes.new('ShaderNodeCombineXYZ')
    arbol.links.new(sumar('X').outputs[0], junto.inputs['X'])
    arbol.links.new(sumar('Y').outputs[0], junto.inputs['Y'])
    arbol.links.new(multiplicar('Z'), junto.inputs['Z'])
    unidad = arbol.nodes.new('ShaderNodeVectorMath')
    unidad.operation = 'NORMALIZE'
    arbol.links.new(junto.outputs['Vector'], unidad.inputs[0])
    color = arbol.nodes.new('ShaderNodeVectorMath')
    color.operation = 'MULTIPLY_ADD'
    color.inputs[1].default_value = (0.5, 0.5, 0.5)
    color.inputs[2].default_value = (0.5, 0.5, 0.5)
    arbol.links.new(unidad.outputs['Vector'], color.inputs[0])
    mapa = arbol.nodes.new('ShaderNodeNormalMap')
    arbol.links.new(color.outputs['Vector'], mapa.inputs['Color'])
    arbol.links.new(mapa.outputs['Normal'], principal.inputs['Normal'])


def abrir_ventana(arbol, principal, salida, marco, por_dentro):
    """
    Hace transparente el material dentro (o fuera) de un marco. En el simulador el paño se corta de verdad, en
    la geometría; para una foto basta con no dibujarlo.
    """
    coordenadas = arbol.nodes.new('ShaderNodeTexCoord')
    coordenadas.object = marco
    partes = arbol.nodes.new('ShaderNodeSeparateXYZ')
    arbol.links.new(coordenadas.outputs['Object'], partes.inputs['Vector'])
    absolutos = []
    for eje in ('X', 'Y'):
        n = arbol.nodes.new('ShaderNodeMath')
        n.operation = 'ABSOLUTE'
        arbol.links.new(partes.outputs[eje], n.inputs[0])
        absolutos.append(n)
    mayor = arbol.nodes.new('ShaderNodeMath')
    mayor.operation = 'MAXIMUM'
    arbol.links.new(absolutos[0].outputs[0], mayor.inputs[0])
    arbol.links.new(absolutos[1].outputs[0], mayor.inputs[1])
    dentro = arbol.nodes.new('ShaderNodeMath')
    dentro.operation = 'LESS_THAN' if por_dentro else 'GREATER_THAN'
    dentro.inputs[1].default_value = 1.0
    arbol.links.new(mayor.outputs[0], dentro.inputs[0])
    transparente = arbol.nodes.new('ShaderNodeBsdfTransparent')
    mezcla = arbol.nodes.new('ShaderNodeMixShader')
    arbol.links.new(dentro.outputs[0], mezcla.inputs['Fac'])
    arbol.links.new(principal.outputs['BSDF'], mezcla.inputs[1])
    arbol.links.new(transparente.outputs['BSDF'], mezcla.inputs[2])
    arbol.links.new(mezcla.outputs['Shader'], salida.inputs['Surface'])


def material_de_tela(nombre, color, con_texturas, mas_oscuro=1.0):
    material = bpy.data.materials.new(nombre)
    arbol, principal, salida = nodos_de(material)
    r, g, b = lineal(color)
    principal.inputs['Base Color'].default_value = (r * mas_oscuro, g * mas_oscuro, b * mas_oscuro, 1.0)
    principal.inputs['Roughness'].default_value = 0.82
    if 'Sheen Weight' in principal.inputs:
        principal.inputs['Sheen Weight'].default_value = 0.35
        principal.inputs['Sheen Roughness'].default_value = 0.55
    if con_texturas:
        poner_relieve(arbol, principal, imagen('tela-pliegues.webp'), imagen('tela-relieve.webp'), 50.0)
    return material, arbol, principal, salida


def material_del_colchon(nombre, con_tira, con_texturas):
    material = bpy.data.materials.new(nombre)
    arbol, principal, _ = nodos_de(material)
    principal.inputs['Base Color'].default_value = (*lineal((0.105, 0.110, 0.125)), 1.0)
    principal.inputs['Roughness'].default_value = 0.46
    if con_texturas:
        poner_relieve(
            arbol, principal, imagen('colchon-pared.webp') if con_tira else None, imagen('colchon-grano.webp'), 3.0)
    return material


def material_de_piel():
    material = bpy.data.materials.new('piel')
    arbol, principal, salida = nodos_de(material)
    principal.inputs['Base Color'].default_value = (*lineal((0.80, 0.60, 0.50)), 1.0)
    principal.inputs['Roughness'].default_value = 0.55
    if 'Subsurface Weight' in principal.inputs:
        principal.inputs['Subsurface Weight'].default_value = 0.12
        principal.inputs['Subsurface Radius'].default_value = (0.012, 0.005, 0.003)
    return material, arbol, principal, salida


# ------------------------------------------------------------------------------------------------- escena


def acostar(decubito):
    """La matriz que lleva del cuerpo (ya en ejes de Blender) al marco del colchón: es lo que tumba la escena."""
    marco = C.marco_del_colchon(decubito)
    filas = [C.a_blender(marco[eje]) for eje in ('ancho', 'largo', 'normal')]
    giro = Matrix([list(f) for f in filas]).to_4x4()
    return giro @ Matrix.Translation(Vector(-C.a_blender(marco['origen'])))


def importar(ruta):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ruta))
    return [o for o in bpy.data.objects if o not in antes]


def crear_la_piel():
    v, f = C.leer_la_piel()
    malla = bpy.data.meshes.new('piel')
    malla.from_pydata(C.a_blender(v.astype(np.float64)).tolist(), [], f.tolist())
    malla.update()
    malla.shade_smooth()
    objeto = bpy.data.objects.new('piel', malla)
    bpy.context.scene.collection.objects.link(objeto)
    return objeto


def marco_de_ventana(nombre, ventana, margen, tumbar):
    """Un vacío con el tamaño de la ventana: su X y su Y locales son las del cuerpo, y su caja va de −1 a 1."""
    (cx, cy), (mx, my) = ventana['centro'], ventana['medio']
    vacio = bpy.data.objects.new(nombre, None)
    bpy.context.scene.collection.objects.link(vacio)
    # Los ejes del cuerpo, vistos desde Blender: X → X, Y → Z, Z → −Y.
    ejes = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0))).to_4x4()
    escala = Matrix.Diagonal((mx + margen, my + margen, 1.0, 1.0))
    vacio.matrix_world = tumbar @ Matrix.Translation(Vector(C.a_blender(np.array([cx, cy, 0.0])))) @ ejes @ escala
    return vacio


def luz_de_area(nombre, sitio, hacia, tamano, potencia, color=(1.0, 1.0, 1.0)):
    dato = bpy.data.lights.new(nombre, 'AREA')
    dato.shape = 'DISK'
    dato.size = tamano
    dato.energy = potencia
    dato.color = color
    objeto = bpy.data.objects.new(nombre, dato)
    bpy.context.scene.collection.objects.link(objeto)
    objeto.location = sitio
    objeto.rotation_euler = (Vector(hacia) - Vector(sitio)).to_track_quat('-Z', 'Y').to_euler()
    return objeto


def preparar_el_dibujo(args):
    escena = bpy.context.scene
    escena.render.engine = 'CYCLES'
    escena.cycles.samples = args.muestras
    escena.cycles.use_denoising = True
    escena.render.resolution_x = args.ancho
    escena.render.resolution_y = int(args.ancho * 10 / 16)
    escena.render.resolution_percentage = 100
    escena.render.image_settings.file_format = 'PNG'
    escena.view_settings.view_transform = 'Standard'
    try:
        escena.view_settings.look = 'None'
    except TypeError:
        pass
    # La tarjeta gráfica, si la hay y Cycles la sabe usar; si no, el procesador, que tarda más y da lo mismo.
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
                print('Cycles dibuja con', tipo, [d.name for d in suyos])
                break
    except Exception as error:  # noqa: BLE001
        print('Cycles dibuja con el procesador:', error)

    mundo = bpy.data.worlds.new('pabellon')
    mundo.use_nodes = True
    fondo = next(n for n in mundo.node_tree.nodes if n.type == 'BACKGROUND')
    fondo.inputs['Color'].default_value = (0.045, 0.055, 0.07, 1.0)
    fondo.inputs['Strength'].default_value = 1.0
    escena.world = mundo

    # La lámpara de pabellón, encima y un poco hacia los pies; un relleno frío por un costado y un contraluz.
    luz_de_area('lampara', (0.25, -0.35, 2.3), (0.0, 0.0, 0.0), 0.9, 135, (1.0, 0.98, 0.95))
    luz_de_area('relleno', (-2.6, -1.2, 1.5), (0.0, 0.0, 0.1), 2.2, 70, (0.82, 0.9, 1.0))
    luz_de_area('contraluz', (1.4, 2.6, 1.3), (0.0, 0.2, 0.1), 1.6, 80, (0.9, 0.95, 1.0))


def vista_de_detalle(decubito, ventana):
    """Una cámara que mira a la ventana desde cerca y un poco de lado, que es como se va a ver en el simulador."""
    marco = C.marco_del_colchon(decubito)
    (cx, cy), (mx, my) = ventana['centro'], ventana['medio']
    relativo = np.array([cx, cy, 0.0]) - marco['origen']
    a, l = float(relativo @ marco['ancho']), float(relativo @ marco['largo'])
    lejos = max(mx, my) * 4.2
    return (a + lejos * 0.55, l - lejos * 0.75, 0.10 + lejos * 0.95), (a, l, 0.09), 55


def poner_la_camara(nombre, detalle=None):
    sitio, hacia, focal = detalle if nombre == 'detalle' else VISTAS[nombre]
    dato = bpy.data.cameras.new(nombre)
    dato.lens = focal
    dato.clip_start, dato.clip_end = 0.05, 50.0
    camara = bpy.data.objects.new(nombre, dato)
    bpy.context.scene.collection.objects.link(camara)
    camara.location = sitio
    arriba = 'Y'
    camara.rotation_euler = (Vector(hacia) - Vector(sitio)).to_track_quat('-Z', arriba).to_euler()
    bpy.context.scene.camera = camara
    return camara


def principal():
    args = argumentos()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    preparar_el_dibujo(args)
    con_texturas = not args.sin_texturas
    tumbar = acostar(args.decubito)
    ventana = VENTANAS.get(args.ventana)

    # El colchón viene en su propio marco, que es el de esta escena: no se mueve.
    for objeto in importar(C.PABELLON / 'colchon.glb'):
        if objeto.type == 'MESH':
            objeto.data.materials.append(material_del_colchon(objeto.name, 'pared' in objeto.name, con_texturas))

    color = COLORES[args.color]
    for objeto in importar(C.PABELLON / f'campo-{args.decubito}{args.sufijo}.glb'):
        if objeto.type != 'MESH':
            continue
        objeto.matrix_world = tumbar @ objeto.matrix_world
        if objeto.name.startswith('pano'):
            if args.sin_pano:
                objeto.hide_render = True
                continue
            material, arbol, principal_, salida = material_de_tela('pano', color, con_texturas)
            if ventana:
                abrir_ventana(arbol, principal_, salida, marco_de_ventana('ventana', ventana, 0.0, tumbar), por_dentro=True)
        else:
            # La sábana es del mismo campo estéril, un punto más oscura para que el paño se lea encima.
            material, *_ = material_de_tela('sabana', color, con_texturas, mas_oscuro=0.82)
        objeto.data.materials.append(material)

    if not args.sin_piel:
        piel = crear_la_piel()
        piel.matrix_world = tumbar @ piel.matrix_world
        material, arbol, principal_, salida = material_de_piel()
        if ventana:
            # Solo lo recortado: lo de la ventana y los cinco centímetros de piel que el taller deja de margen.
            abrir_ventana(arbol, principal_, salida, marco_de_ventana('recorte', ventana, 0.05, tumbar), por_dentro=False)
        piel.data.materials.append(material)

    carpeta = C.SALIDA / 'vistas'
    carpeta.mkdir(parents=True, exist_ok=True)
    vistas = list(VISTAS) if args.vista == 'todas' else args.vista.split(',')
    for vista in vistas:
        poner_la_camara(vista, vista_de_detalle(args.decubito, ventana) if ventana else None)
        nombre = args.nombre or '-'.join(t for t in (args.decubito, args.ventana, args.color if args.color != 'azul' else '') if t)
        ruta = carpeta / f'{nombre}-{vista}{args.sufijo}.png'
        bpy.context.scene.render.filepath = str(ruta)
        bpy.ops.render.render(write_still=True)
        print('VISTA', ruta)
    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=str(C.SALIDA / f'campo-{args.decubito}{args.sufijo}.blend'))


if __name__ == '__main__':
    principal()

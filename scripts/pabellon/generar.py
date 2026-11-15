"""
Genera el campo quirúrgico del simulador (P-014, E1): el colchón, la sábana con la huella del cuerpo y el paño.

    blender --background --factory-startup --python scripts/pabellon/generar.py -- [opciones]

    --etapa colchon | simular | campo | todo     qué se hace (por omisión, todo)
    --decubito supino | prono | ambos            para cuál (por omisión, ambos)
    --paso 0.008                                 el tamaño del triángulo del paño, en metros
    --cuadros 150                                cuántos cuadros se deja caer la tela

Lo que sale a `public/pabellon/` es lo que viaja: `colchon.glb`, `campo-supino.glb`, `campo-prono.glb` y
`manifiesto.json`. Lo intermedio (la tela ya caída, que es lo caro) queda en `scripts/pabellon/salida/` y no
viaja: por eso `--etapa campo` rehace los `.glb` en segundos sin volver a simular.

## Por qué el paño se simula y la sábana no

El paño es lo que el dueño pidió ver: «como la silueta», el bulto de un cuerpo entero bajo una tela. Eso no se
dibuja a mano; se deja caer una tela sobre la piel del atlas y se guarda cómo quedó.

La sábana, en cambio, está pillada entre el colchón y el cuerpo, y una tela pillada entre dos superficies es
justo lo que un simulador de tela resuelve mal: tiembla, o atraviesa una de las dos. Y no hace falta. Una sábana
con un cuerpo encima no tiene libertad ninguna: está donde está el apoyo. Así que se construye sobre la rejilla
de alturas (`comun.apoyo`), con la garantía —que una simulación no da— de quedar siempre por debajo de la piel.

## Todo en las coordenadas del cuerpo

Los vértices se escriben donde el atlas tiene la piel, y la gravedad se pone perpendicular al colchón de cada
decúbito. Al exportar con Y arriba, el `.glb` sale en las mismas coordenadas en que el taller exporta el recorte
antes de centrarlo; el simulador solo tiene que restarle el mismo centro (`campoQuirurgico.ts`).
"""

import argparse
import json
import sys
import time
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import comun as C  # noqa: E402

# Lo que el paño se separa de lo que toca. Más cerca, la tela atraviesa la piel en los cuadros en que cae
# deprisa; más lejos, se ve flotar sobre la pierna que asoma por la ventana.
DISTANCIA_DEL_PANO = 0.0022
GROSOR_DEL_CHOQUE = 0.0008
# Lo que como mínimo queda entre el paño y la piel después de asentarlo sobre la rejilla.
SOBRE_LA_PIEL = 0.0025
SOBRE_LA_SABANA = 0.0015

# El origen de V en la textura de pliegues: el paño extendido empieza en y = −0,26 y la textura mide 2,4 m.
Y_DE_LA_TEXTURA = -0.35

# El relieve que viaja al navegador: dos rejillas de alturas por decúbito, en celdas de 6 mm. Una dice dónde
# hay cuerpo, y con ella el simulador sabe si lo recortado llega hasta la punta de un miembro. La otra es el
# lecho: a qué altura pegar el borde de la ventana que se abre en el paño. Enteros de 16 bits en pasos de
# 0,02 mm: 73 000 celdas por rejilla son 290 KB, y en coma flotante serían el doble para una precisión que
# nadie ve.
RELIEVE = {'x0': -0.522, 'y0': -0.34, 'paso': 0.006, 'nx': 174, 'ny': 420, 'unidad': 0.00002}
SIN_DATO = -32768


def argumentos():
    resto = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser(prog='generar.py')
    p.add_argument('--etapa', default='todo', choices=('colchon', 'simular', 'campo', 'todo'))
    p.add_argument('--decubito', default='ambos', choices=('supino', 'prono', 'ambos'))
    p.add_argument('--paso', type=float, default=0.008)
    p.add_argument('--cuadros', type=int, default=150)
    p.add_argument('--sufijo', default='', help='para probar sin pisar lo bueno: se añade al nombre de lo intermedio')
    args = p.parse_args(resto)
    # El sufijo se da sin guion —«prueba»— y el guion se pone aquí: un argumento que empieza por guion,
    # argparse lo toma por otra opción.
    args.sufijo = f'-{args.sufijo}' if args.sufijo else ''
    return args


# ------------------------------------------------------------------------------------------------ mallas


def vaciar():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def crear_malla(nombre, vertices, caras, uv=None, en_el_cuerpo=True, uv_por_esquina=None):
    """
    Un objeto de malla a partir de matrices. Los vértices vienen en el cuerpo del atlas, salvo que se diga que
    ya están en los ejes de Blender (el colchón, que se modela tumbado en su propio marco).
    """
    v = np.asarray(vertices, dtype=np.float64)
    if en_el_cuerpo:
        v = C.a_blender(v)
    lista = caras.tolist() if isinstance(caras, np.ndarray) else caras
    malla = bpy.data.meshes.new(nombre)
    malla.from_pydata(v.tolist(), [], lista)
    malla.update()
    if uv is not None or uv_por_esquina is not None:
        capa = malla.uv_layers.new(name='UVMap')
        if uv_por_esquina is None:
            orden = np.fromiter((i for cara in lista for i in cara), dtype=np.int64)
            uv_por_esquina = np.asarray(uv, dtype=np.float32)[orden]
        capa.data.foreach_set('uv', np.asarray(uv_por_esquina, dtype=np.float32).ravel())
    malla.shade_smooth()
    objeto = bpy.data.objects.new(nombre, malla)
    bpy.context.scene.collection.objects.link(objeto)
    return objeto


def posiciones_de(objeto):
    """Los vértices de un objeto tal como quedan después de sus modificadores, en el cuerpo del atlas."""
    grafo = bpy.context.evaluated_depsgraph_get()
    evaluado = objeto.evaluated_get(grafo)
    malla = evaluado.to_mesh()
    co = np.empty(len(malla.vertices) * 3, dtype=np.float32)
    malla.vertices.foreach_get('co', co)
    evaluado.to_mesh_clear()
    # Los objetos se crean sin mover, así que lo local es lo del mundo. Se anota porque la primera prueba de
    # tela se leyó mal por esto mismo: la tela estaba a 34 cm y sus alturas locales parecían atravesar el suelo.
    return C.al_atlas(co.reshape(-1, 3).astype(np.float64))


def exportar(ruta, objetos):
    bpy.ops.object.select_all(action='DESELECT')
    for objeto in objetos:
        objeto.select_set(True)
    bpy.context.view_layer.objects.active = objetos[0]
    ruta.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(ruta), export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_materials='NONE', export_extras=True,
        export_cameras=False, export_lights=False, export_animations=False,
    )
    print(f'EXPORTADO {ruta.name}: {ruta.stat().st_size / 1024:.0f} KB')


# ----------------------------------------------------------------------------------------------- relieve


def relieve_del(decubito):
    """Las rejillas de un decúbito: lo de abajo y lo de arriba del cuerpo, y el apoyo con su huella."""
    v, f = C.leer_la_piel()
    abajo, arriba = C.envolventes(C.muestras(v, f), decubito)
    con_huella, sin_huella = C.apoyo(decubito, abajo)
    x, y = C.centros()
    hondo = float((C.plano(decubito, y) - con_huella)[C.dentro_del_colchon(decubito)].max())
    if hondo > C.HUNDIMIENTO_MAXIMO:
        raise RuntimeError(f'La sábana baja {hondo * 1000:.1f} mm bajo el plano y la plancha está a {C.HUNDIMIENTO_MAXIMO * 1000:.0f}: la atravesaría.')
    return {'piel': (v, f), 'abajo': abajo, 'arriba': arriba, 'apoyo': con_huella, 'sin_huella': sin_huella}


# ------------------------------------------------------------------------------------------------ colchón


def contorno_del_colchon(paso=0.025, por_esquina=12):
    """
    El contorno del colchón visto desde arriba, en su marco (a, l): los puntos, la normal hacia fuera de cada
    uno y lo recorrido hasta él. Empieza y termina en el medio de la cabecera, que es donde va la costura de la
    UV: el sitio que menos se mira.
    """
    ma, ml, r = C.ANCHO_DEL_COLCHON / 2, C.LARGO_DEL_COLCHON / 2, C.RADIO_EN_PLANTA
    puntos, normales = [], []

    def recta(desde, hasta, normal):
        desde, hasta = np.array(desde), np.array(hasta)
        n = max(1, int(round(np.linalg.norm(hasta - desde) / paso)))
        for k in range(n):
            puntos.append(desde + (hasta - desde) * k / n)
            normales.append(np.array(normal, dtype=np.float64))

    def arco(centro, desde_grados):
        for k in range(por_esquina):
            angulo = np.radians(desde_grados + 90.0 * k / por_esquina)
            direccion = np.array([np.cos(angulo), np.sin(angulo)])
            puntos.append(np.array(centro) + r * direccion)
            normales.append(direccion)

    # En sentido antihorario visto desde arriba: cabecera hacia −a, esquina, costado izquierdo hacia los pies…
    recta((0, ml), (-(ma - r), ml), (0, 1))
    arco((-(ma - r), ml - r), 90)
    recta((-ma, ml - r), (-ma, -(ml - r)), (-1, 0))
    arco((-(ma - r), -(ml - r)), 180)
    recta((-(ma - r), -ml), (ma - r, -ml), (0, -1))
    arco((ma - r, -(ml - r)), 270)
    recta((ma, -(ml - r)), (ma, ml - r), (1, 0))
    arco((ma - r, ml - r), 0)
    recta((ma - r, ml), (0, ml), (0, 1))
    puntos, normales = np.array(puntos), np.array(normales)
    tramo = np.linalg.norm(np.roll(puntos, -1, axis=0) - puntos, axis=1)
    recorrido = np.concatenate([[0.0], np.cumsum(tramo)])
    return puntos, normales, recorrido


def perfil_del_colchon(por_canto=7, por_pared=3):
    """
    El perfil del canto, de arriba abajo: cuánto se mete cada punto respecto del contorno, su altura y lo
    recorrido sobre el perfil.
    """
    r = C.RADIO_DEL_CANTO
    arriba, abajo = -C.HUNDIMIENTO_MAXIMO, -C.GROSOR_DEL_COLCHON
    dentro, alto = [], []
    for k in range(por_canto + 1):
        a = np.pi / 2 * k / por_canto
        dentro.append(r * (1 - np.sin(a)))
        alto.append(arriba - r * (1 - np.cos(a)))
    for k in range(1, por_pared):
        dentro.append(0.0)
        alto.append(arriba - r + (abajo + r - (arriba - r)) * k / por_pared)
    for k in range(por_canto + 1):
        a = np.pi / 2 * k / por_canto
        dentro.append(r * (1 - np.cos(a)))
        alto.append(abajo + r - r * np.sin(a))
    dentro, alto = np.array(dentro), np.array(alto)
    recorrido = np.concatenate([[0.0], np.cumsum(np.hypot(np.diff(dentro), np.diff(alto)))])
    return dentro, alto, recorrido


def construir_el_colchon():
    """
    La plancha del colchón, tumbada en su marco: X el ancho, Y el largo hacia la cabeza, Z hacia el paciente y
    el origen en el centro del plano de apoyo. Su cara de arriba queda `HUNDIMIENTO_MAXIMO` por debajo: lo que
    hay entre las dos es la espuma que cede, y la dibuja la sábana.

    Son dos mallas porque son dos materiales: la pared lleva la tira de costuras, que se repite a lo largo del
    contorno, y las tapas solo el grano del forro.
    """
    puntos, normales, recorrido = contorno_del_colchon()
    dentro, alto, sobre_el_perfil = perfil_del_colchon()
    n, m = len(puntos), len(dentro)
    # La tira de costuras mide de alto lo que el perfil, y se repite un número entero de veces por el contorno.
    alto_de_la_tira = float(sobre_el_perfil[-1])
    repeticiones = round(float(recorrido[-1]) / alto_de_la_tira)
    u_del_contorno = recorrido / recorrido[-1] * repeticiones
    v_del_perfil = 1.0 - sobre_el_perfil / alto_de_la_tira

    vertices = np.empty((n, m, 3))
    for j in range(m):
        vertices[:, j, 0:2] = puntos - normales * dentro[j]
        vertices[:, j, 2] = alto[j]
    indice = np.arange(n * m).reshape(n, m)
    caras, uvs = [], []
    for k in range(n):
        k2 = (k + 1) % n
        for j in range(m - 1):
            caras.append([indice[k, j], indice[k, j + 1], indice[k2, j + 1], indice[k2, j]])
            # La UV va por esquina y no por vértice: el último tramo cierra sobre el primer punto, y su U tiene
            # que ser la del final del recorrido, no la del principio.
            ua, ub = u_del_contorno[k], u_del_contorno[k + 1]
            uvs.extend([(ua, v_del_perfil[j]), (ua, v_del_perfil[j + 1]), (ub, v_del_perfil[j + 1]), (ub, v_del_perfil[j])])
    pared = crear_malla('colchon-pared', vertices.reshape(-1, 3), caras, uv_por_esquina=uvs, en_el_cuerpo=False)

    # Las tapas: un abanico desde el centro, con la UV en la misma escala que la pared.
    tapas_v, tapas_c, tapas_uv = [], [], []
    for j, hacia_arriba in ((0, True), (m - 1, False)):
        base = len(tapas_v)
        anillo = vertices[:, j, :]
        tapas_v.extend(anillo.tolist())
        tapas_v.append([0.0, 0.0, float(alto[j])])
        centro = base + n
        for k in range(n):
            k2 = (k + 1) % n
            tapas_c.append([base + k, base + k2, centro] if hacia_arriba else [base + k2, base + k, centro])
        tapas_uv.extend((anillo[:, 0:2] / alto_de_la_tira).tolist())
        tapas_uv.append([0.0, 0.0])
    tapas = crear_malla('colchon-tapas', np.array(tapas_v), tapas_c, uv=np.array(tapas_uv), en_el_cuerpo=False)
    return [pared, tapas], {'repeticionesDeLaTira': repeticiones, 'altoDeLaTira': alto_de_la_tira}


# -------------------------------------------------------------------------------------------------- sábana


def construir_la_sabana(decubito, relieve):
    vertices, cuadros, sobre_la_tela = C.tela_sobre_el_colchon(
        decubito, relieve['apoyo'], C.CAIDA_DE_LA_SABANA, onda=C.ONDA_DE_LA_SABANA)
    uv = np.stack([
        C.CENTRO_DE_LA_SABANA_EN_U + sobre_la_tela[:, 0] / C.LADO_DE_LA_TEXTURA,
        0.5 + sobre_la_tela[:, 1] / C.LADO_DE_LA_TEXTURA,
    ], axis=-1)
    return crear_malla('sabana', vertices, cuadros, uv=uv)


# ---------------------------------------------------------------------------------------------------- paño


def simular_el_pano(decubito, relieve, paso, cuadros, sufijo=''):
    """Deja caer el paño sobre la piel y la sábana, y guarda cómo quedó."""
    vaciar()
    escena = bpy.context.scene
    s = C.ARRIBA[decubito]
    marco = C.marco_del_colchon(decubito)
    _, y = C.centros()

    # Contra qué choca: el cuerpo visto desde arriba (`cuerpo_por_arriba` dice por qué no la piel de verdad) y
    # la sábana, alargada hasta más abajo del colchón para hacer de pared.
    x_celdas, y_celdas = C.centros()
    suelo = np.where(C.dentro_del_colchon(decubito), relieve['apoyo'] - 0.02, C.plano(decubito, y_celdas) - 0.30)
    cuerpo_v, cuerpo_c = C.cuerpo_por_arriba(relieve['arriba'], suelo)
    cuerpo_v[:, 2] *= s
    if s < 0:
        cuerpo_c = cuerpo_c[:, ::-1]
    cuerpo = crear_malla('cuerpo', cuerpo_v, cuerpo_c)
    pared_v, pared_c, _ = C.tela_sobre_el_colchon(
        decubito, relieve['apoyo'], C.GROSOR_DEL_COLCHON + 0.08, aire=C.ONDA_DE_LA_SABANA * 1.6)
    pared = crear_malla('pared', pared_v, pared_c)
    for objeto, roce in ((cuerpo, 40.0), (pared, 30.0)):
        objeto.modifiers.new('choque', 'COLLISION')
        objeto.collision.thickness_outer = GROSOR_DEL_CHOQUE
        objeto.collision.thickness_inner = 0.006
        objeto.collision.cloth_friction = roce
        objeto.collision.damping = 0.8

    # El paño. Su forma en reposo es la extendida, plana; pero no se deja caer desde ahí: empieza ya tendido
    # sobre la carpa del cuerpo, y lo único que hace la simulación es asentarlo.
    alto = np.maximum(C.rellenar(relieve['arriba'], -10.0), relieve['apoyo'])
    puntos, triangulos = C.pano_extendido(decubito, alto, paso)
    techo = float((alto - C.plano(decubito, y))[np.isfinite(relieve['arriba'])].max()) + 0.012
    h = C.plano(decubito, puntos[:, 1]) + techo
    pano = crear_malla('pano', np.stack([puntos[:, 0], puntos[:, 1], s * h], axis=-1), triangulos)
    # Fuera del colchón la carpa baja: el vuelo del paño empieza ya colgando, y no tieso en el aire.
    fuera = ~C.dentro_del_colchon(decubito, margen=0.012)
    lona = C.carpa(np.where(fuera & ~np.isfinite(relieve['arriba']), C.plano(decubito, y_celdas) - 0.30, alto))
    inicio_del_pano = C.sobre_la_carpa(decubito, puntos, lona, 0.010)
    inicio_del_pano[:, 2] *= s
    pano.shape_key_add(name='reposo')
    tendido = pano.shape_key_add(name='tendido')
    tendido.data.foreach_set('co', C.a_blender(inicio_del_pano).astype(np.float32).ravel())
    tendido.value = 1.0
    print(f'[{decubito}] paño: {len(puntos)} vértices, {len(triangulos)} triángulos, paso {paso * 1000:.0f} mm')

    tela = pano.modifiers.new('tela', 'CLOTH')
    a = tela.settings
    a.rest_shape_key = pano.data.shape_keys.key_blocks['reposo']
    a.quality = 12
    # Un no tejido de pabellón: ligero, que casi no estira y que dobla con facilidad pero no como la seda. Los
    # números parten del algodón de Blender y se ajustaron mirando las vistas.
    a.mass = 0.25
    a.tension_stiffness = 20.0
    a.compression_stiffness = 20.0
    a.shear_stiffness = 8.0
    a.bending_stiffness = 0.35
    a.tension_damping = 8.0
    a.compression_damping = 8.0
    a.shear_damping = 8.0
    a.bending_damping = 0.5
    a.air_damping = 1.5
    c = tela.collision_settings
    c.use_collision = True
    c.collision_quality = 5
    c.distance_min = DISTANCIA_DEL_PANO
    c.friction = 30.0
    c.use_self_collision = True
    c.self_distance_min = 0.0018
    c.self_friction = 12.0

    # La gravedad, perpendicular al colchón. Es lo que tumba al paciente sin girar una sola malla.
    escena.use_gravity = True
    escena.gravity = tuple(float(g) for g in C.a_blender(-9.81 * marco['normal']))
    escena.frame_start, escena.frame_end = 1, cuadros
    tela.point_cache.frame_start, tela.point_cache.frame_end = 1, cuadros

    inicio = time.time()
    antes = None
    for cuadro in range(1, cuadros + 1):
        escena.frame_set(cuadro)
        if cuadro % 10 == 0 or cuadro == cuadros:
            ahora = posiciones_de(pano)
            se_mueve = float(np.abs(ahora - antes).max()) * 1000 if antes is not None else float('nan')
            antes = ahora
            print(f'[{decubito}] cuadro {cuadro}/{cuadros}  {time.time() - inicio:5.0f} s  lo que más se movió en diez cuadros: {se_mueve:.1f} mm', flush=True)
    final = posiciones_de(pano)
    final, subidos = asentar(decubito, final, relieve)
    print(f'[{decubito}] simulado en {time.time() - inicio:.0f} s; {subidos} vértices subidos para no tocar la piel ni la sábana')

    C.SALIDA.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(C.SALIDA / f'pano-{decubito}{sufijo}.npz', reposo=puntos, triangulos=triangulos, posiciones=final, paso=paso)


def asentar(decubito, posiciones, relieve):
    """
    Sube lo que haya quedado por debajo de la piel o de la sábana.

    La simulación deja la tela a su distancia casi siempre; «casi» es un pliegue que en un cuadro rápido pasó
    al otro lado de un dedo. La rejilla no falla: da, para cada punto, lo más alto que hay debajo.
    """
    s = C.ARRIBA[decubito]
    x, y = posiciones[:, 0], posiciones[:, 1]
    ix, iy, dentro = C.celdas(x, y)
    ix, iy = np.clip(ix, 0, C.NX - 1), np.clip(iy, 0, C.NY - 1)
    techo_del_cuerpo = C.vecindad(C.rellenar(relieve['arriba'], -10.0), np.maximum)[ix, iy] + SOBRE_LA_PIEL
    marco = C.marco_del_colchon(decubito)
    relativo = posiciones - marco['origen'][None, :]
    a, l = relativo @ marco['ancho'], relativo @ marco['largo']
    sobre_el_colchon = (np.abs(a) < C.ANCHO_DEL_COLCHON / 2 - C.RADIO_DEL_CANTO) & (np.abs(l) < C.LARGO_DEL_COLCHON / 2 - C.RADIO_DEL_CANTO)
    techo_de_la_sabana = np.where(sobre_el_colchon, C.interpolar(relieve['apoyo'], x, y) + SOBRE_LA_SABANA, -10.0)
    h = s * posiciones[:, 2]
    minimo = np.where(dentro, np.maximum(techo_del_cuerpo, techo_de_la_sabana), -10.0)
    # Solo cuenta para lo que está encima del cuerpo, no para lo que cuelga a su lado: la tela que baja junto
    # al muslo está, con razón, más baja que el muslo.
    bajo = (h < minimo) & (h > minimo - 0.03)
    salida = posiciones.copy()
    salida[bajo, 2] = s * minimo[bajo]
    return salida, int(bajo.sum())


def construir_el_pano(decubito, sufijo=''):
    dato = np.load(C.SALIDA / f'pano-{decubito}{sufijo}.npz')
    s = C.ARRIBA[decubito]
    reposo = dato['reposo']
    # Boca abajo la U va al revés, para que la textura no quede en espejo vista desde arriba.
    uv = np.stack([
        C.CENTRO_DEL_PANO_EN_U + s * reposo[:, 0] / C.LADO_DE_LA_TEXTURA,
        (reposo[:, 1] - Y_DE_LA_TEXTURA) / C.LADO_DE_LA_TEXTURA,
    ], axis=-1)
    return crear_malla('pano', dato['posiciones'], dato['triangulos'], uv=uv)


# ------------------------------------------------------------------------------------------------- relieve


def interpolar_el_relieve(rejilla, x, y):
    """
    La altura de una rejilla del relieve en unos puntos, y la celda de abajo a la izquierda de cada uno.

    Es, cuenta por cuenta, `alturaEn` de `src/lib/campoQuirurgico.ts`: bilineal entre los centros de las cuatro
    celdas y repartida entre las que tienen dato. Tiene que serlo: `cubrir` sube el lecho hasta que **esta**
    interpolación quede por encima de la piel, y el navegador no hace otra.
    """
    r = RELIEVE
    fx = (np.asarray(x) - r['x0']) / r['paso'] - 0.5
    fy = (np.asarray(y) - r['y0']) / r['paso'] - 0.5
    i, j = np.floor(fx).astype(int), np.floor(fy).astype(int)
    u, w = fx - i, fy - j
    suma, peso = np.zeros(len(fx)), np.zeros(len(fx))
    for di in (0, 1):
        for dj in (0, 1):
            ii, jj = i + di, j + dj
            vale = (ii >= 0) & (ii < r['nx']) & (jj >= 0) & (jj < r['ny'])
            valor = np.where(vale, rejilla[np.clip(ii, 0, r['nx'] - 1), np.clip(jj, 0, r['ny'] - 1)], np.nan)
            vale &= np.isfinite(valor)
            p = (u if di else 1 - u) * (w if dj else 1 - w)
            suma += np.where(vale, valor * p, 0.0)
            peso += np.where(vale, p, 0.0)
    return np.where(peso > 1e-6, suma / np.maximum(peso, 1e-6), np.nan), i, j


def cubrir(rejilla, x, y, h, margen):
    """
    Sube las celdas que haga falta para que la rejilla, interpolada, quede `margen` por encima de cada punto.

    A cada punto que queda por encima se le suben sus cuatro celdas lo que le falta. Como los pesos de la
    interpolación suman uno, con eso ese punto queda cubierto justo, y subir una celda no destapa a ningún otro.
    """
    r = RELIEVE
    rejilla = rejilla.copy()
    for _ in range(3):
        alto, i, j = interpolar_el_relieve(rejilla, x, y)
        falta = h + margen - alto
        mal = np.isfinite(falta) & (falta > 1e-7)
        if not mal.any():
            break
        subida = np.zeros_like(rejilla)
        for di in (0, 1):
            for dj in (0, 1):
                ii, jj = i[mal] + di, j[mal] + dj
                vale = (ii >= 0) & (ii < r['nx']) & (jj >= 0) & (jj < r['ny'])
                np.maximum.at(subida, (ii[vale], jj[vale]), falta[mal][vale])
        rejilla = np.where(np.isfinite(rejilla), rejilla + subida, rejilla)
    return rejilla


def escribir_el_relieve(decubito, relieve, sufijo=''):
    """
    Las dos rejillas de alturas de un decúbito, en un solo binario (ver `RELIEVE`): el cuerpo y el lecho.

    El lecho es la superficie en que se apoya el borde del paño cuando se le abre la ventana: la piel donde hay
    cuerpo y la sábana donde no. El navegador baja la tela hasta ahí alrededor de la ventana, así que de esta
    rejilla depende que el borde quede pegado a la piel sin atravesarla.
    """
    r = RELIEVE
    s = C.ARRIBA[decubito]
    forma = (r['nx'], r['ny'])

    def por_celda(puntos, cerca_del_centro=None):
        """Lo más alto de unos puntos en cada celda; con radio, solo de los que caen así de cerca de su centro."""
        ci = np.floor((puntos[:, 0] - r['x0']) / r['paso']).astype(int)
        cj = np.floor((puntos[:, 1] - r['y0']) / r['paso']).astype(int)
        vale = (ci >= 0) & (ci < r['nx']) & (cj >= 0) & (cj < r['ny'])
        if cerca_del_centro is not None:
            dx = puntos[:, 0] - (r['x0'] + (ci + 0.5) * r['paso'])
            dy = puntos[:, 1] - (r['y0'] + (cj + 0.5) * r['paso'])
            vale &= np.hypot(dx, dy) <= cerca_del_centro
        salida = np.full(forma, -np.inf)
        np.maximum.at(salida, (ci[vale], cj[vale]), s * puntos[vale, 2])
        return np.where(np.isfinite(salida), salida, np.nan)

    # Lo que el paño no puede atravesar, en puntos a un milímetro: la piel entera y la sábana tal como se exporta.
    piel = C.muestras(*relieve['piel'], paso=0.001)
    sabana_v, sabana_c, _ = C.tela_sobre_el_colchon(decubito, relieve['apoyo'], C.CAIDA_DE_LA_SABANA, onda=C.ONDA_DE_LA_SABANA)
    sabana = C.muestras(sabana_v, np.vstack([sabana_c[:, [0, 1, 2]], sabana_c[:, [0, 2, 3]]]), paso=0.0015)
    todo = np.vstack([piel, sabana])

    cuerpo = por_celda(piel)

    # El lecho parte de la altura en el centro de cada celda, que es lo que la interpolación del navegador
    # supone que hay. Partiendo de lo más alto de la celda entera, en la cara de un muslo —donde la piel sube
    # un centímetro en seis milímetros— el borde del paño quedaba flotando ese centímetro.
    centro = por_celda(todo, cerca_del_centro=0.0017)
    lecho = np.where(np.isfinite(centro), centro, por_celda(todo))
    hay = np.isfinite(lecho)
    # En mitón, como el cuerpo contra el que cayó la tela: sin los valles de menos de dos centímetros y medio,
    # en los que el borde de un paño no entra.
    fondo = float(np.nanmin(lecho)) - 0.05
    lleno = np.where(hay, lecho, fondo)
    lecho = np.where(hay, np.maximum(C.difuminar(C.cerrar(lleno, 0.012, r['paso']), 0.004, r['paso']), lleno), np.nan)
    # Y por último, lo que da la garantía: ningún punto de la piel ni de la sábana por encima.
    antes = lecho.copy()
    lecho = cubrir(lecho, todo[:, 0], todo[:, 1], s * todo[:, 2], margen=0.0002)

    alto, _, _ = interpolar_el_relieve(lecho, todo[:, 0], todo[:, 1])
    sobra = alto - s * todo[:, 2]
    if not np.all(np.isfinite(sobra)) or float(sobra.min()) < 0:
        raise RuntimeError(f'[{decubito}] el lecho queda {-float(np.nanmin(sobra)) * 1000:.2f} mm por debajo de la piel o de la sábana.')
    # Cuánto queda por encima de la piel vista desde arriba: lo que el borde del paño va a flotar.
    fino = r['paso'] / 3
    fi = np.floor((piel[:, 0] - r['x0']) / fino).astype(int)
    fj = np.floor((piel[:, 1] - r['y0']) / fino).astype(int)
    vale = (fi >= 0) & (fi < r['nx'] * 3) & (fj >= 0) & (fj < r['ny'] * 3)
    techo = np.full((r['nx'] * 3, r['ny'] * 3), -np.inf)
    np.maximum.at(techo, (fi[vale], fj[vale]), s * piel[vale, 2])
    ti, tj = np.where(np.isfinite(techo))
    sobre_la_piel, _, _ = interpolar_el_relieve(lecho, r['x0'] + (ti + 0.5) * fino, r['y0'] + (tj + 0.5) * fino)
    flota = (sobre_la_piel - techo[ti, tj]) * 1000

    def a_enteros(rejilla):
        # Hacia arriba, para que el redondeo no se coma el margen.
        enteros = np.where(np.isnan(rejilla), SIN_DATO, np.clip(np.ceil(np.nan_to_num(rejilla) / r['unidad']), -32767, 32767))
        # Por filas de Y y, dentro de cada una, por X: es como lo recorre quien lo lee.
        return enteros.astype('<i2').T.ravel()

    ruta = C.PUBLICO / f'relieve-{decubito}{sufijo}.bin'
    ruta.write_bytes(np.concatenate([a_enteros(cuerpo), a_enteros(lecho)]).tobytes())
    print(f'ESCRITO {ruta.name}: {ruta.stat().st_size / 1024:.0f} KB; cuerpo en {int(np.isfinite(cuerpo).sum())} celdas, lecho en {int(hay.sum())}; '
          f'{int((lecho > antes + 1e-6).sum())} celdas subidas para cubrir la piel; el lecho queda sobre la piel '
          f'{np.percentile(flota, 50):.1f} mm de mediana, {np.percentile(flota, 90):.1f} en el 90 % y {np.percentile(flota, 99):.1f} en el 99 %')


# ------------------------------------------------------------------------------------------------- principal


def manifiesto(extra):
    marcos = {}
    for decubito in C.DECUBITOS:
        m = C.marco_del_colchon(decubito)
        marcos[decubito] = {
            'origen': [round(float(t), 6) for t in m['origen']],
            'ancho': [round(float(t), 6) for t in m['ancho']],
            'largo': [round(float(t), 6) for t in m['largo']],
            'normal': [round(float(t), 6) for t in m['normal']],
            'modelo': f'campo-{decubito}.glb',
            'relieve': f'relieve-{decubito}.bin',
            # +1 si «arriba» es +Z del cuerpo (boca arriba) y −1 si es −Z: las alturas del relieve van con ese signo.
            'signo': int(C.ARRIBA[decubito]),
        }
    return {
        'generadoPor': 'scripts/pabellon/generar.py',
        'unidades': 'metros, en las coordenadas del cuerpo del atlas (Y hacia la cabeza, +Z hacia delante)',
        'colchon': {
            'modelo': 'colchon.glb',
            # El .glb del colchón viene en su propio marco: X el ancho, Y hacia el paciente y −Z el largo.
            'ejesDelModelo': {'x': 'ancho', 'y': 'normal', 'z': '-largo'},
            'ancho': C.ANCHO_DEL_COLCHON,
            'largo': C.LARGO_DEL_COLCHON,
            'grosor': C.GROSOR_DEL_COLCHON,
            # Lo que la cara de arriba del forro queda por debajo del plano de apoyo: entre los dos está la
            # espuma que cede, que la dibuja la sábana. El navegador lo usa para saber qué tapa el colchón.
            'hundimiento': C.HUNDIMIENTO_MAXIMO,
            **extra,
        },
        'decubitos': marcos,
        # Dos rejillas seguidas —cuerpo y lecho— de enteros de 16 bits, por filas de Y. La altura de una celda
        # es su entero por `unidad`; `sinDato` marca donde no hay nada.
        'relieve': {**RELIEVE, 'sinDato': SIN_DATO, 'rejillas': ['cuerpo', 'lecho']},
        'textura': {'lado': C.LADO_DE_LA_TEXTURA, 'repeticionesDelRelieve': 50, 'repeticionesDelGrano': 3},
    }


def principal():
    args = argumentos()
    decubitos = C.DECUBITOS if args.decubito == 'ambos' else (args.decubito,)
    extra = {}

    if args.etapa in ('colchon', 'todo'):
        vaciar()
        piezas, extra = construir_el_colchon()
        exportar(C.PUBLICO / 'colchon.glb', piezas)

    for decubito in decubitos:
        if args.etapa in ('simular', 'campo', 'todo'):
            relieve = relieve_del(decubito)
        if args.etapa in ('simular', 'todo'):
            simular_el_pano(decubito, relieve, args.paso, args.cuadros, args.sufijo)
        if args.etapa in ('campo', 'todo'):
            vaciar()
            sabana = construir_la_sabana(decubito, relieve)
            pano = construir_el_pano(decubito, args.sufijo)
            exportar(C.PUBLICO / f'campo-{decubito}{args.sufijo}.glb', [sabana, pano])
            escribir_el_relieve(decubito, relieve, args.sufijo)

    if args.etapa in ('colchon', 'todo'):
        (C.PUBLICO / 'manifiesto.json').write_text(json.dumps(manifiesto(extra), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('ESCRITO manifiesto.json')


if __name__ == '__main__':
    principal()

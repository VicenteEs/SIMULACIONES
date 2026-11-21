"""
Placa LCP volar de radio distal 2,4 mm, derecha (pedido del dueño del 2026-11-21).

    blender --background --factory-startup --python scripts/instrumental/placa_volar_radio_distal_2_4.py

Las medidas son las del pedido: 55 mm de largo, cabeza de 25 mm, vástago de 9,5 mm y 2,2 mm de grosor; la cabeza
inclinada unos 10° hacia volar y con una concavidad transversal suave; en la cabeza, 4 agujeros distales
(subcondrales) y 3 proximales de Ø 2,4 con avellanado cónico, y en el vástago 3 combinados de 4,5 × 2,4.

Es la primera placa que no sale de `implantes.placa_con_cabeza`. Aquella barre dos láminas rectas y las funde; la
cabeza de una volar no es una lámina sino una silueta (una T torcida, más larga del lado radial) que después se dobla
en dos sentidos a la vez. Por eso este guion es largo. Lo que el simulador necesita de una placa sí es lo de siempre y
se guarda como en `implantes.py`: la cara contra el hueso en Z = 0 y la de arriba en Z = 2,2 a lo largo del vástago,
el largo en Y con el centro en el origen, la cabeza hacia +Y y los agujeros en la meta (D-169).

**Se modela plana y se dobla al final.** Los booleanos y el bisel se hacen sobre la pieza plana, donde las paredes de
los agujeros son verticales y el solver exacto no tiene nada que adivinar. El doblez mueve después los vértices y se
lleva los agujeros con la placa, perpendiculares a la cara en la que están, como en una placa de verdad; perforando
después de doblar, cada agujero de la cabeza saldría torcido 10° respecto de su cara. Para que el doblez quede liso, la
cabeza se corta antes en una malla de 1 mm: una cara plana de 25 mm no se puede curvar. Se corta después del bisel y
no antes, porque las aristas diminutas que dejan los cortes junto al borde frenarían el bisel de toda la pieza
(`use_clamp_overlap`).

**Las tapas, en tiras.** Antes de los booleanos, las dos tapas se parten a lo largo por el centro de cada columna de
agujeros. Así ninguna cara tiene un agujero dentro y el solver no tiene que inventar puentes entre ellos: uno casi
tangente al borde de un combinado bastaba para dejar el bisel entero en 0,03 mm (`placa_plana`).

**Derecha.** Vista desde volar con la cabeza arriba, el lado radial de un radio derecho queda a la derecha, que es
+X. La asimetría está donde la pide el hueso: el borde distal sube hacia radial siguiendo la inclinación radial (la
estiloides llega más lejos que la esquina cubital) y el cuello se abre antes del lado cubital. Una izquierda sería
esta misma con X cambiada de signo.

**El doblez.** La cabeza gira hasta 10° hacia volar entre los 5 y los 13 mm, por arco (la chapa no se estira), y su
cara contra el hueso se ahueca con un radio de 50 mm centrado en el eje, que entra entre los 11 y los 25 mm. La
concavidad entra más despacio que la inclinación a propósito: baja los bordes, y si los baja más rápido de lo que la
cabeza sube, el borde de la placa hace una ola que se ve de perfil (pasó con 45 mm entre los 10 y los 20) o se mete
bajo el vástago y agranda la caja del modelo, de la que el simulador saca el grosor de la placa (`colocarPlaca`). Así
el borde sube siempre, y la caja mide unos 5 mm: no 2,2, por lo que sube la cabeza, como le pasa a la anatómica de
tibia. Las medidas se comprueban sobre la placa ya doblada: el borde distal se corre lo que haga falta para que mida
55 mm después del doblez, que acorta la cabeza unas décimas.

**El orden de los agujeros** en la meta no es caprichoso: el simulador saca el eje de la placa del primero al último
(`ejeDeLaPlaca`) y con él la dirección de la compresión en los combinados. El primero es el combinado más proximal y
el último el central de la hilera proximal de la cabeza, los dos en X = 0. Entre medio van los otros dos combinados,
la hilera distal de cubital a radial y los dos laterales de la proximal.

**Lo que no viaja al .glb.** El material `Titanium_Anodized_Medical` (el nombre lo pidió el dueño así, en inglés, y
así se queda) lleva para la vista previa un ruido estirado a lo largo de la placa que mueve la rugosidad entre 0,22 y
0,34 y le da un relieve de mecanizado de fuerza 0,03. glTF no transporta nodos de procedimiento: el exportador los
dejaría caer sin avisar. Antes de exportar se dejan como en las demás placas, valores fijos: rugosidad 0,28 (la mitad
del rango) y sin relieve. El color (#C5B38A) y el metálico (1,0) sí viajan.

**El bisel y las normales** van como modificadores (Bevel de 0,15 mm y 3 segmentos, Weighted Normal) y se aplican
dentro del guion: `lib.exportar` pasa la malla a metros escalando los vértices pero no los parámetros de los
modificadores, y un bisel de 0,15 sin aplicar se volvería uno de 0,15 m.

Lo que corre al ejecutarlo está bajo `__main__`, para poder importarlo sin exportar nada: así salen las fotos de cada
etapa (`construir(hasta='plana')`).
"""

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from lib import _hex, _lineal, _vista_previa
import implantes as im

SLUG = 'placa-volar-radio-distal-2-4'
NOMBRE = 'Placa LCP volar de radio distal 2,4 mm (derecha)'
MEDIDAS = ('Largo 55 mm · cabeza de 25 mm con 4 + 3 agujeros de 2,4 avellanados · vástago de 9,5 mm con 3 combinados '
           'de 4,5 × 2,4 · grosor 2,2 mm · cabeza a 10° volar')
NOTAS = ('Derecha: el lado radial es +X. La cabeza (+Y) sube 10° hacia volar y su cara contra el hueso es cóncava '
         '(radio de 50 mm); sus agujeros son perpendiculares a ella.')

# --------------------------------------------------------------------------
# Medidas, en milímetros
# --------------------------------------------------------------------------

LARGO = 55.0
ANCHO_CABEZA = 25.0
ANCHO_VASTAGO = 9.5
GROSOR = 2.2

D_AGUJERO = 2.4
# Un cono de 90° que baja 0,7 mm deja el avellanado en Ø 3,8 sobre la cara de arriba: con 5,8 mm entre agujeros quedan
# 2 mm de puente. Más hondo se comía el puente entre dos conos; más bajo, la cabeza del tornillo no asienta.
PROFUNDIDAD_DEL_AVELLANADO = 0.7
# Dos círculos de 2,4 con los centros a 2,1 dan el ocho de 4,5 × 2,4 del pedido.
CENTROS_DEL_COMBINADO = 2.1
# Los lados del círculo de cada avellanado, los mismos que los redondos de `implantes.py`.
LADOS_DEL_AGUJERO = 28
# A 8 mm, la distancia entre agujeros del sistema LCP 2,4 (`SISTEMAS_DE_PLACA_RECTA`, src/lib/placasRectas.ts).
COMBINADOS_Y = (-22.0, -14.0, -6.0)
SEPARACION = 5.8
DE_LA_HILERA_AL_BORDE = 3.9
ENTRE_HILERAS = 5.4
# El metal mínimo entre un agujero (con su avellanado) y el borde o el agujero de al lado. Por debajo de esto la placa
# no se exporta: un puente más fino es una placa que se rompe, y a simple vista no se nota.
PUENTE_MINIMO = 1.2

# La silueta. El borde distal es un arco suave inclinado: sube ~10° hacia radial.
INCLINACION_DEL_BORDE = 0.18
RADIO_DEL_BORDE = 60.0
RADIO_DE_LA_ESQUINA = 2.5
# Donde cada lado del cuello pasa de la mitad del vástago a la de la cabeza: el cubital (−X) antes que el radial (+X).
# En 8 mm el hombro se lee como la T del pedido; con 11, como una paleta.
CUELLO_CUBITAL = (1.0, 9.0)
CUELLO_RADIAL = (4.0, 12.0)
PASO_DEL_CONTORNO = 0.5
BISEL = 0.15

VOLAR_GRADOS = 10.0
DOBLEZ = (5.0, 13.0)
RADIO_DE_LA_CONCAVIDAD = 50.0
CONCAVIDAD = (11.0, 25.0)
MALLA_DE_LA_CABEZA = 1.0

# La foto del catálogo: desde distal y radial, alta, para que se lean la cabeza y sus avellanados. Desde el lado
# cubital la cara de la placa recibía de lleno la luz principal y el cuello salía quemado.
VISTA = {'azimut': 155, 'elevacion': 38, 'distancia': 4.9}


# --------------------------------------------------------------------------
# La silueta, plana
# --------------------------------------------------------------------------

def _suave(t):
    """De 0 a 1 sin quiebre al empezar ni al terminar: un cuello o un doblez que se abre de golpe hace arista."""
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _serie(a, b, paso):
    n = max(1, int(np.ceil(abs(b - a) / paso)))
    return [a + (b - a) * k / n for k in range(n + 1)]


def semiancho(y, cuello):
    a, b = cuello
    return ANCHO_VASTAGO / 2 + (ANCHO_CABEZA - ANCHO_VASTAGO) / 2 * float(_suave((y - a) / (b - a)))


def borde_distal(x, c):
    return c + INCLINACION_DEL_BORDE * x - x * x / (2.0 * RADIO_DEL_BORDE)


def _redondear(puntos, i, r, n=10):
    """
    Redondea la esquina `i` de un contorno denso: lo corta a `r` de ella por cada lado y une los cortes con una curva
    que tiene la esquina por control. `exposicion.redondear_contorno` hace lo mismo pero en todos los vértices a la
    vez, y en un contorno muestreado cada medio milímetro no llega a redondear nada.
    """
    def cortar(sentido):
        recorrido, j = 0.0, i
        while True:
            k = j + sentido
            a, b = Vector(puntos[j]), Vector(puntos[k])
            tramo = (b - a).length
            if recorrido + tramo >= r:
                return a.lerp(b, (r - recorrido) / tramo), k
            recorrido, j = recorrido + tramo, k
    antes, k0 = cortar(-1)
    despues, k1 = cortar(1)
    esquina = Vector(puntos[i])
    curva = []
    for t in range(n + 1):
        u = t / n
        q = (1 - u) ** 2 * antes + 2 * (1 - u) * u * esquina + u * u * despues
        curva.append((q.x, q.y))
    return puntos[:k0 + 1] + curva + puntos[k1:]


def contorno(c):
    """La silueta en sentido antihorario, vista desde arriba (volar): lado radial, borde distal, lado cubital, punta."""
    r = ANCHO_VASTAGO / 2
    y_punta = -LARGO / 2 + r
    mitad = ANCHO_CABEZA / 2
    puntos = [(semiancho(y, CUELLO_RADIAL), y) for y in _serie(y_punta, borde_distal(mitad, c), PASO_DEL_CONTORNO)]
    esquina_radial = len(puntos) - 1
    puntos += [(x, borde_distal(x, c)) for x in _serie(mitad, -mitad, PASO_DEL_CONTORNO)[1:]]
    esquina_cubital = len(puntos) - 1
    puntos += [(-semiancho(y, CUELLO_CUBITAL), y) for y in _serie(borde_distal(-mitad, c), y_punta, PASO_DEL_CONTORNO)[1:]]
    n = 24
    puntos += [(r * cos(pi + pi * k / n), y_punta + r * sin(pi + pi * k / n)) for k in range(1, n)]
    # Primero la de índice mayor: así el índice de la otra no se mueve.
    puntos = _redondear(puntos, esquina_cubital, RADIO_DE_LA_ESQUINA)
    puntos = _redondear(puntos, esquina_radial, RADIO_DE_LA_ESQUINA)
    limpio = []
    for p in puntos:
        if not limpio or (Vector(p) - Vector(limpio[-1])).length > 0.05:
            limpio.append(p)
    if (Vector(limpio[0]) - Vector(limpio[-1])).length <= 0.05:
        limpio.pop()
    return limpio


def agujeros_planos(c):
    """Los centros en la placa plana: combinados del vástago, hilera distal de la cabeza y la proximal (central al final)."""
    combinados = [(0.0, y) for y in COMBINADOS_Y]
    distal = [(x, borde_distal(x, c) - DE_LA_HILERA_AL_BORDE) for x in ((k - 1.5) * SEPARACION for k in range(4))]
    proximal = [(x, borde_distal(x, c) - DE_LA_HILERA_AL_BORDE - ENTRE_HILERAS) for x in (-SEPARACION, SEPARACION, 0.0)]
    return combinados, distal, proximal


def comprobar_puentes(puntos, combinados, redondos):
    """Que ningún agujero se coma el borde ni el puente con el de al lado. Devuelve los dos mínimos, en mm."""
    borde = np.array(puntos)
    tramo = np.roll(borde, -1, axis=0) - borde
    largo2 = (tramo ** 2).sum(1)

    def al_borde(p):
        t = np.clip(((p - borde) * tramo).sum(1) / largo2, 0.0, 1.0)
        return float(np.sqrt((((borde + t[:, None] * tramo) - p) ** 2).sum(1)).min())

    # Cada agujero como círculos: el redondo, por su avellanado; el combinado, por sus dos círculos.
    r_cono = D_AGUJERO / 2 + PROFUNDIDAD_DEL_AVELLANADO
    agujeros = [[((x, y + d), D_AGUJERO / 2) for d in (-CENTROS_DEL_COMBINADO / 2, CENTROS_DEL_COMBINADO / 2)]
                for x, y in combinados]
    agujeros += [[((x, y), r_cono)] for x, y in redondos]
    faltas = []
    minimo_borde = minimo_entre = 1e9
    for i, a in enumerate(agujeros):
        for p, r in a:
            d = al_borde(np.array(p)) - r
            minimo_borde = min(minimo_borde, d)
            if d < PUENTE_MINIMO:
                faltas.append(f'el agujero {i + 1} queda a {d:.2f} mm del borde')
        for j in range(i + 1, len(agujeros)):
            d = min((Vector(p) - Vector(q)).length - r - s for p, r in a for q, s in agujeros[j])
            minimo_entre = min(minimo_entre, d)
            if d < PUENTE_MINIMO:
                faltas.append(f'entre los agujeros {i + 1} y {j + 1} quedan {d:.2f} mm')
    if faltas:
        raise ValueError('Puentes demasiado finos: ' + '; '.join(faltas))
    return minimo_borde, minimo_entre


# --------------------------------------------------------------------------
# El doblez
# --------------------------------------------------------------------------

def _mapa_del_doblez():
    """La cara contra el hueso, a lo largo de la placa: dónde queda cada Y de la plana y cuánto se inclinó ahí."""
    ys = np.linspace(-LARGO / 2 - 5.0, LARGO / 2 + 5.0, 6001)
    angulo = radians(VOLAR_GRADOS) * _suave((ys - DOBLEZ[0]) / (DOBLEZ[1] - DOBLEZ[0]))
    dy = ys[1] - ys[0]
    # Por arco: cada milímetro de chapa sigue midiendo un milímetro, solo que inclinado.
    Y = ys[0] + np.concatenate(([0.0], np.cumsum((np.cos(angulo[1:]) + np.cos(angulo[:-1])) * dy / 2)))
    Z = np.concatenate(([0.0], np.cumsum((np.sin(angulo[1:]) + np.sin(angulo[:-1])) * dy / 2)))
    return ys, Y, Z, angulo


_MAPA = _mapa_del_doblez()


def deformar(p):
    """
    Lleva puntos de la placa plana (n × 3, en mm) a la doblada. La concavidad baja los bordes respecto del eje en el
    marco de la placa y el doblez lo inclina todo; Z se mide a lo largo de la normal de la cara, así que el grosor no
    cambia al doblar.
    """
    ys, Y, Z, angulo = _MAPA
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    a = np.interp(y, ys, angulo)
    h = z - _suave((y - CONCAVIDAD[0]) / (CONCAVIDAD[1] - CONCAVIDAD[0])) * x * x / (2.0 * RADIO_DE_LA_CONCAVIDAD)
    return np.column_stack([x, np.interp(y, ys, Y) - h * np.sin(a), np.interp(y, ys, Z) + h * np.cos(a)])


def borde_que_da_el_largo():
    """
    Dónde va el borde distal para que la placa ya doblada mida LARGO: el doblez acorta la cabeza unas décimas. Se mide
    a la altura del bisel, que es donde empieza la pared que queda más afuera una vez inclinada.
    """
    c = LARGO / 2
    for _ in range(5):
        xy = np.array(contorno(c))
        doblado = deformar(np.column_stack([xy, np.full(len(xy), BISEL)]))
        c += (LARGO / 2 - doblado[:, 1].max()) / cos(radians(VOLAR_GRADOS))
    return c


# --------------------------------------------------------------------------
# El material
# --------------------------------------------------------------------------

def _principled(m):
    # Por tipo y no por nombre: con los nombres nuevos traducidos (la interfaz en español) el nodo no se llama
    # «Principled BSDF» y la búsqueda por nombre falla.
    return next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')


def titanio_anodizado():
    """Titanio anodizado dorado pálido, con un ruido de mecanizado CNC estirado a lo largo de la placa."""
    m = bpy.data.materials.new('Titanium_Anodized_Medical')
    m.use_nodes = True
    nodos, enlaces = m.node_tree.nodes, m.node_tree.links
    p = _principled(m)
    p.inputs['Base Color'].default_value = (*_lineal(_hex('#C5B38A')), 1.0)
    p.inputs['Metallic'].default_value = 1.0
    p.inputs['Roughness'].default_value = 0.28
    coordenadas = nodos.new('ShaderNodeTexCoord')
    mapeo = nodos.new('ShaderNodeMapping')
    # En coordenadas del objeto (mm): una veta de un cuarto de milímetro de través y de unos 12 mm a lo largo, que es
    # como deja la fresa la superficie de una placa. Z casi no cuenta: en la cabeza doblada la altura cambia con Y, y
    # con Z a escala 1 las vetas se cortaban en manchas de milímetro y medio.
    mapeo.inputs['Scale'].default_value = (1.0, 0.02, 0.02)
    ruido = nodos.new('ShaderNodeTexNoise')
    ruido.inputs['Scale'].default_value = 4.0
    ruido.inputs['Detail'].default_value = 3.0
    ruido.inputs['Roughness'].default_value = 0.5
    rango = nodos.new('ShaderNodeMapRange')
    # El ruido casi no sale de 0,3–0,7: tomado de 0 a 1, la rugosidad apenas se movería de 0,28.
    rango.inputs['From Min'].default_value = 0.3
    rango.inputs['From Max'].default_value = 0.7
    rango.inputs['To Min'].default_value = 0.22
    rango.inputs['To Max'].default_value = 0.34
    rango.clamp = True
    relieve = nodos.new('ShaderNodeBump')
    relieve.inputs['Strength'].default_value = 0.03
    enlaces.new(coordenadas.outputs['Object'], mapeo.inputs['Vector'])
    enlaces.new(mapeo.outputs['Vector'], ruido.inputs['Vector'])
    enlaces.new(ruido.outputs['Fac'], rango.inputs['Value'])
    enlaces.new(rango.outputs['Result'], p.inputs['Roughness'])
    enlaces.new(ruido.outputs['Fac'], relieve.inputs['Height'])
    enlaces.new(relieve.outputs['Normal'], p.inputs['Normal'])
    return m


def material_para_el_gltf(m):
    """Lo que glTF sí lleva: el mismo material con la rugosidad fija a la mitad del rango y sin relieve."""
    nodos = m.node_tree.nodes
    p = _principled(m)
    for n in [n for n in nodos if n.type not in ('BSDF_PRINCIPLED', 'OUTPUT_MATERIAL')]:
        nodos.remove(n)
    p.inputs['Roughness'].default_value = 0.28


# --------------------------------------------------------------------------
# La pieza
# --------------------------------------------------------------------------

def agujero_avellanado(bm, x, y):
    """
    El agujero y su cono de 90° como UN solo sólido de revolución. `implantes.py` corta el cono en una segunda pasada;
    aquí eso dejaba, donde el cono encuentra la pared, 24 aristas de largo cero por agujero (las dos piezas tienen los
    vértices en los mismos ángulos), y en ellas el bisel se anulaba y dejaba miles de caras sin área.
    """
    r = D_AGUJERO / 2
    torno(bm, [(-1.0, r), (GROSOR - PROFUNDIDAD_DEL_AVELLANADO, r), (GROSOR + 1.0, r + PROFUNDIDAD_DEL_AVELLANADO + 1.0)],
          LADOS_DEL_AGUJERO, Matrix.Translation((x, y, 0)))


def _en_una_columna(e, columnas):
    """Una arista de una tapa que va a lo largo de uno de los cortes de `placa_plana`."""
    a, b = e.verts
    if abs(a.co.z - b.co.z) > 1e-6 or min(abs(a.co.z), abs(a.co.z - GROSOR)) > 1e-6:
        return False
    return any(abs(a.co.x - x) < 1e-4 and abs(b.co.x - x) < 1e-4 for x in columnas)


def _aplicar(ob, mod):
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)


def placa_plana(raiz, c, combinados, redondos):
    """
    La silueta extruida y sus agujeros, con booleanos exactos.

    Antes de cortar, las dos tapas se parten en tiras a lo largo, por el centro de cada columna de agujeros. Una cara
    con un agujero no existe en una malla: el solver la parte con puentes de un agujero a otro, y los elige él. Aquí
    elegía puentes casi tangentes al borde de los combinados (de un lóbulo al del combinado siguiente), y con un
    puente así al lado el bisel de ese borde se anula: `use_clamp_overlap` frena entonces el bisel de toda la pieza a
    la vez, no el de esa arista, y quedaba en 0,03 mm en vez de 0,15. Con las tiras, cada agujero queda partido entre
    dos tiras, ninguna tapa tiene agujeros y los únicos puentes son los cortes, que llegan a cada borde en ángulo recto.
    Se probaron antes otros arreglos sobre la malla ya cortada (juntar los vértices sueltos que deja el solver, o
    colapsar las aristas cortas): el que no torcía la pared de un combinado tapaba otro.
    """
    bm = bmesh.new()
    prisma(bm, contorno(c), 0.0, GROSOR)
    columnas = sorted({float(x) for x, _ in combinados + redondos})
    for x in columnas:
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-5,
                               plane_co=(x, 0.0, 0.0), plane_no=(1.0, 0.0, 0.0))
    ob = im.objeto_desde('placa', bm, titanio_anodizado(), raiz)
    cortes = bmesh.new()
    for x, y in combinados:
        im.agujero_combi(cortes, x, y, D_AGUJERO, CENTROS_DEL_COMBINADO, GROSOR)
    for x, y in redondos:
        agujero_avellanado(cortes, x, y)
    im.restar(ob, cortes)
    me = ob.data
    # El booleano deja una ranura vacía por el cortador, que no tiene material: ninguna cara la usa, pero un visor
    # que liste las ranuras la vería.
    for i in reversed(range(len(me.materials))):
        if me.materials[i] is None:
            me.materials.pop(index=i)
    bm = bmesh.new()
    bm.from_mesh(me)
    # Donde un corte pasa justo por un vértice de un cortador (las puntas de los combinados, los círculos de los
    # avellanados a 90° y 270°), el solver deja a veces dos vértices a 1e-16 mm: 16 en esta placa.
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-4)
    # El solver devuelve las tiras troceadas por sus propias diagonales, y con vértices de más en los bordes de los
    # agujeros, donde esas diagonales los cruzaban. Se vuelve a dejar cada tira en un polígono, y el corte se marca
    # como costura para que la disolución no junte dos tiras y tenga que inventar puentes otra vez.
    for e in bm.edges:
        e.seam = _en_una_columna(e, columnas)
    bmesh.ops.dissolve_limit(bm, angle_limit=radians(0.5), verts=bm.verts[:], edges=bm.edges[:], delimit={'SEAM'})
    for e in bm.edges:
        e.seam = False
    bm.to_mesh(me)
    bm.free()
    me.validate(verbose=False)
    return ob


def biselar(ob):
    """Bevel de 0,15 mm y 3 segmentos en toda arista de más de 30°: el contorno, los bordes de los agujeros y los conos."""
    mod = ob.modifiers.new('bisel', 'BEVEL')
    mod.width = BISEL
    mod.segments = 3
    mod.limit_method = 'ANGLE'
    mod.angle_limit = radians(30)
    # Donde dos biseles se tocan (el cono junto a la pared del agujero) se montarían uno sobre otro. El freno es de
    # toda la pieza: por eso `placa_plana` corta las tapas en tiras antes de los agujeros.
    mod.use_clamp_overlap = True
    _aplicar(ob, mod)


def densificar(ob):
    """
    Corta el cuello y la cabeza en una malla de MALLA_DE_LA_CABEZA para que el doblez tenga dónde curvar. Los cortes
    pasan por los vértices que tienen a menos de 0,15 mm en vez de dejar al lado una arista de nada.
    """
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    desde = DOBLEZ[0] - MALLA_DE_LA_CABEZA
    for y in np.arange(desde, LARGO / 2 + MALLA_DE_LA_CABEZA, MALLA_DE_LA_CABEZA):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=0.15,
                               plane_co=(0.0, float(y), 0.0), plane_no=(0.0, 1.0, 0.0))
    for x in np.arange(-ANCHO_CABEZA / 2 + MALLA_DE_LA_CABEZA, ANCHO_CABEZA / 2, MALLA_DE_LA_CABEZA):
        # A lo largo solo en la cabeza: el vástago no se dobla y no necesita más caras.
        caras = [f for f in bm.faces if f.calc_center_median().y > desde]
        geom = list({v for f in caras for v in f.verts}) + list({e for f in caras for e in f.edges}) + caras
        bmesh.ops.bisect_plane(bm, geom=geom, dist=0.15, plane_co=(float(x), 0.0, 0.0), plane_no=(1.0, 0.0, 0.0))
    # Los polígonos de más de cuatro lados dejarían de ser planos al doblar, y cada visor los partiría a su manera.
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


def doblar(ob):
    me = ob.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    me.vertices.foreach_set('co', deformar(co.reshape(-1, 3)).ravel())
    me.update()


def normales(ob):
    """
    Todo suave y Weighted Normal por área: las caras grandes mandan, así la cara de la placa se ve plana hasta el borde
    y la luz da la vuelta en el bisel, sin las sombras torcidas que deja un booleano suavizado a secas.
    """
    me = ob.data
    me.validate(verbose=False)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if 'sharp_edge' in me.attributes:
        me.attributes.remove(me.attributes['sharp_edge'])
    me.update()
    mod = ob.modifiers.new('normales', 'WEIGHTED_NORMAL')
    mod.mode = 'FACE_AREA'
    mod.weight = 50
    mod.keep_sharp = True
    _aplicar(ob, mod)


def construir(hasta=None):
    """La placa entera, o plana (`hasta='plana'`) para mirar ese paso. Devuelve (raíz, objeto, agujeros de la meta)."""
    raiz = vacio('implante')
    c = borde_que_da_el_largo()
    combinados, distal, proximal = agujeros_planos(c)
    redondos = distal + proximal
    al_borde, entre = comprobar_puentes(contorno(c), combinados, redondos)
    ob = placa_plana(raiz, c, combinados, redondos)
    biselar(ob)
    if hasta != 'plana':
        densificar(ob)
        doblar(ob)
    normales(ob)
    # A media altura del grosor, por el mismo mapa que la malla: el simulador los proyecta sobre su plano.
    centros = np.array([(x, y, GROSOR / 2) for x, y in combinados + redondos])
    if hasta != 'plana':
        centros = deformar(centros)
    agujeros = [(float(x), float(y)) for x, y, _ in centros]
    co = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    tam = co.max(0) - co.min(0)
    print(f'>> placa {hasta or "doblada"}: {tam[0]:.2f} × {tam[1]:.2f} mm, Z de {co[:, 2].min():.2f} a '
          f'{co[:, 2].max():.2f}; puente mínimo {al_borde:.2f} mm al borde y {entre:.2f} mm entre agujeros')
    return raiz, ob, agujeros


if __name__ == '__main__':
    carpeta = iniciar(SLUG)
    raiz, placa, agujeros = construir()
    meta_raiz(raiz, SLUG, NOMBRE, MEDIDAS, notas=NOTAS, agujeros=agujeros)
    # La foto lleva el material entero; lo que viaja al .glb es el aplanado (ver la cabecera).
    _vista_previa(os.path.join(carpeta, SLUG + '.png'), VISTA)
    material_para_el_gltf(placa.active_material)
    exportar(raiz, SLUG, carpeta, previa=False)

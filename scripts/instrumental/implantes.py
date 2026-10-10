"""
Implantes y injerto óseo del simulador (P-001, E5, D-168): placas, tornillos,
clavos endomedulares y los dos injertos que pidió el traumatólogo.

Aquí no hay un guion por pieza sino las funciones que las construyen; cada
`scripts/instrumental/<slug>.py` es una llamada de una línea, como el resto del
catálogo (`generar-todo.sh` reconoce un instrumento porque llama a `iniciar(`).

Convenios que difieren de los instrumentos, y por qué:

- **Una placa se posa de plano.** Su cara contra el hueso está en Z = 0 y su cara
  de arriba en Z = grosor, con el eje largo en Y y el centro en el origen. El
  simulador pone el modelo con su +Z hacia fuera de la superficie, así que la
  placa queda apoyada sobre el hueso y no «de pie» como una pinza.
- **Un tornillo o un clavo sí van de pie**: la punta en el origen y la cabeza (o
  el extremo proximal) arriba, como cualquier instrumento.
- **Medidas** en milímetros, del documento del traumatólogo y de los catálogos de
  AO/Synthes; donde dan un rango se toma el valor habitual. Son de referencia:
  las valida Cristóbal con el catálogo que enviará, y por eso están todas arriba,
  en las llamadas, y no escondidas en las funciones.
"""

import random
from math import tan

from lib import *
from detalles import *
from exposicion import redondear_contorno


# --------------------------------------------------------------------------
# Booleanos
# --------------------------------------------------------------------------

def _objeto_temporal(bm, nombre):
    me = bpy.data.meshes.new(nombre)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(nombre, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _booleano(ob, bm, operacion):
    """Aplica un booleano exacto entre `ob` y la malla `bm`, que se descarta."""
    cortador = _objeto_temporal(bm, 'cortador')
    mod = ob.modifiers.new('b', 'BOOLEAN')
    mod.operation = operacion
    mod.object = cortador
    mod.solver = 'EXACT'
    # Los cortadores se hacen con varias primitivas solapadas (un óvalo son dos
    # cilindros y una caja): sin esto el solver exacto no las funde.
    mod.use_self = True
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cortador, do_unlink=True)


def restar(ob, bm):
    _booleano(ob, bm, 'DIFFERENCE')


def unir(ob, bm):
    _booleano(ob, bm, 'UNION')


def objeto_desde(nombre, bm, mat, padre, quitar_dobles=True):
    """Un objeto sin suavizar todavía: los booleanos se hacen con las aristas vivas."""
    return malla(nombre, bm, mat, padre, suave=False, unir_cercanos=0.0001 if quitar_dobles else 0.0)


def suavizar(ob, angulo=40):
    from lib import _suavizar
    # `validate` quita lo que el booleano deja suelto (aristas sin caras, caras
    # sin área); sin esto el exportador avisa «Mesh is not valid».
    ob.data.validate(verbose=False)
    _suavizar(ob.data, angulo)


# --------------------------------------------------------------------------
# Láminas: la base de toda placa
# --------------------------------------------------------------------------

def _puntos_del_borde(largo, radio_extremo, paso=1.0):
    """
    Valores a lo largo del eje de una lámina, de -largo/2 a +largo/2, con el
    extremo redondeado: más densos donde la anchura cambia deprisa. Devuelve
    parejas (valor, factor_de_ancho), con el factor entre 0 y 1.
    """
    mitad = largo / 2
    r = min(radio_extremo, mitad)
    n_borde = 7
    salida = []
    # extremo negativo: de la punta al cuerpo
    for k in range(n_borde):
        a = (k / n_borde) * (pi / 2)
        salida.append((-mitad + r - r * cos(a), sin(a) * 0.9 + 0.1 * (k / n_borde)))
    cuerpo = max(2, int((largo - 2 * r) / paso))
    for k in range(cuerpo + 1):
        salida.append((-mitad + r + (largo - 2 * r) * k / cuerpo, 1.0))
    for k in range(n_borde, 0, -1):
        a = (k / n_borde) * (pi / 2)
        salida.append((mitad - r + r * cos(a), sin(a) * 0.9 + 0.1 * (k / n_borde)))
    return salida


def lamina(bm, eje, largo, ancho, grosor, radio_curva=None, chaflan=0.5, radio_extremo=None,
           ancho_fn=None, desplazamiento=None, centro=(0.0, 0.0), pasos=1.0, elevacion=None):
    """
    Una lámina larga —el cuerpo de una placa— barrida a lo largo de `eje` ('y' o 'x').

    Su cara de abajo está en Z = 0 (más la curvatura) y la de arriba en Z = grosor.
    `radio_curva` curva la sección transversal (los bordes bajan hacia el hueso),
    `ancho_fn(valor)` modula la anchura —las muescas de una placa de
    reconstrucción—, `desplazamiento(valor)` mueve el centro a un lado (el cuello
    de una placa anatómica) y `elevacion(valor)` la sube o la baja (la curva de
    una cabeza que abraza la metáfisis).
    """
    radio_extremo = ancho * 0.45 if radio_extremo is None else radio_extremo
    anillos = []
    cx, cy = centro
    for valor, f in _puntos_del_borde(largo, radio_extremo, pasos):
        w = (ancho_fn(valor) if ancho_fn else ancho) * f
        w = max(w, 0.3)
        d = desplazamiento(valor) if desplazamiento else 0.0
        e = elevacion(valor) if elevacion else 0.0
        ch = min(chaflan, w / 3)
        sag = (lambda x: -(x * x) / (2.0 * radio_curva)) if radio_curva else (lambda x: 0.0)
        n_x = 9 if radio_curva else 3
        xs = [-w / 2 + w * i / (n_x - 1) for i in range(n_x)]
        # base (de -w/2 a +w/2) y luego la cara de arriba, de vuelta
        base = [(x, sag(x) + e) for x in xs]
        xt = [x for x in xs[::-1]]
        arriba = []
        for x in xt:
            xx = max(-w / 2 + ch, min(w / 2 - ch, x))
            arriba.append((xx, sag(xx) + grosor * (f ** 0.5) + e))
        perfil = base + arriba
        if eje == 'y':
            puntos = [(cx + d + x, cy + valor, z) for x, z in perfil]
        else:
            puntos = [(cx + valor, cy + d + x, z) for x, z in perfil]
        anillos.append([bm.verts.new(Vector(p)) for p in puntos])
    for a, b in zip(anillos, anillos[1:]):
        for i in range(len(a)):
            j = (i + 1) % len(a)
            try:
                bm.faces.new((a[i], a[j], b[j], b[i]))
            except ValueError:
                pass
    for anillo, invertir in ((anillos[0], True), (anillos[-1], False)):
        try:
            bm.faces.new(anillo[::-1] if invertir else anillo)
        except ValueError:
            pass
    return anillos


# --------------------------------------------------------------------------
# Agujeros
# --------------------------------------------------------------------------
# Cada agujero es UN solo sólido, sin cilindros solapados: un cortador hecho con
# piezas que se cruzan entre sí no se funde bien con el booleano exacto y deja
# el agujero a medias (se vieron óvalos reducidos a dos medias lunas). Los
# contornos se extruyen enteros y los avellanados van en una segunda pasada.

def _contorno_por_ancho(y0, y1, semiancho, n=22):
    """Polígono antihorario de un agujero alargado, dado el semiancho en cada Y."""
    mitad = (y1 - y0) / 2
    centro = (y0 + y1) / 2
    ys = [centro + mitad * sin(-pi / 2 + pi * k / n) for k in range(n + 1)]
    derecha = [(semiancho(y), y) for y in ys]
    izquierda = [(-semiancho(y), y) for y in ys[::-1]]
    contorno = derecha + izquierda
    # sin vértices repetidos en los polos
    limpio = []
    for p in contorno:
        if not limpio or abs(p[0] - limpio[-1][0]) > 1e-6 or abs(p[1] - limpio[-1][1]) > 1e-6:
            limpio.append(p)
    return limpio


def _prisma_en(bm, contorno, x, y, z0, z1):
    prisma(bm, [(x + px, y + py) for px, py in contorno], z0, z1)


def contorno_oval(d, largo):
    r = d / 2
    off = (largo - d) / 2
    return _contorno_por_ancho(-largo / 2, largo / 2, lambda y: r if abs(y) <= off else sqrt(max(0.0, r * r - (abs(y) - off) ** 2)))


def contorno_ocho(d, centros):
    """Dos círculos de diámetro d con sus centros separados `centros`: la envolvente es un ocho."""
    r = d / 2
    c = centros / 2

    def semi(y):
        a = r * r - (y - c) ** 2
        b = r * r - (y + c) ** 2
        return sqrt(max(a, b, 0.0))
    return _contorno_por_ancho(-c - r, c + r, semi, 30)


def agujero_redondo(bm, x, y, d, grosor, z0=-1.0):
    """Un cilindro limpio; el avellanado se hace aparte (`avellanado_redondo`)."""
    torno(bm, [(z0, d / 2), (grosor + 1.0, d / 2)], 28, Matrix.Translation((x, y, 0)))


def avellanado_redondo(bm, x, y, d, grosor):
    """Un cono que abre hacia arriba: la cabeza del tornillo se asienta en él."""
    torno(bm, [(grosor - 0.9, d / 2), (grosor + 0.4, d / 2 + 1.3), (grosor + 1.0, d / 2 + 1.3)], 28, Matrix.Translation((x, y, 0)))


def agujero_oval(bm, x, y, d, largo, grosor):
    _prisma_en(bm, contorno_oval(d, largo), x, y, -1.0, grosor + 1.0)


def avellanado_oval(bm, x, y, d, largo, grosor):
    """El avellanado inclinado de un agujero DCP es el que empuja el tornillo: un óvalo algo mayor y poco profundo."""
    _prisma_en(bm, contorno_oval(d + 1.6, largo + 1.6), x, y, grosor - 0.55, grosor + 1.0)


def agujero_combi(bm, x, y, d, centros, grosor):
    """Agujero combinado de una LCP: dos redondos solapados, el de rosca y el de compresión, en un ocho."""
    _prisma_en(bm, contorno_ocho(d, centros), x, y, -1.0, grosor + 1.0)


def rebajes_de_la_cara_inferior(bm, ys, ancho, radio=1.9):
    """LC-DCP: entre dos agujeros la cara que toca el hueso se rebaja, y el contacto es limitado."""
    for y in ys:
        cilindro(bm, (-ancho, y, -0.2), (ancho, y, -0.2), radio, radio, 20)


# --------------------------------------------------------------------------
# Placas rectas
# --------------------------------------------------------------------------

def placa_recta(slug, nombre, tipo, n, paso, ancho, grosor, medidas, d_agujero=3.5, radio_curva=None, mat='titanio'):
    """
    DCP, LC-DCP, LCP, tercio de caña y reconstrucción: todas son una lámina larga
    con una fila de agujeros; lo que las distingue es el agujero, el rebaje de la
    cara inferior, las muescas del borde y cuánto se curvan.
    """
    raiz = vacio('implante')
    # Más margen en la de reconstrucción: sus extremos son angostos por las muescas
    # y el avellanado del primer agujero se comía el borde.
    largo = n * paso + (11.0 if tipo == 'recon' else 6.0)
    ys = [(k - (n - 1) / 2) * paso for k in range(n)]

    ancho_fn = None
    if tipo == 'recon':
        # Las muescas entre agujeros: la placa se dobla por ahí y se adelgaza en los puentes.
        def ancho_fn(y):
            fase = ((y / paso) + 0.5) % 1.0
            return ancho - 2.4 * (1 - abs(cos(pi * fase))) ** 1.0 * 0.9

    bm = bmesh.new()
    lamina(bm, 'y', largo, ancho, grosor, radio_curva=radio_curva, radio_extremo=ancho * 0.55, ancho_fn=ancho_fn)
    ob = objeto_desde('placa', bm, mat, raiz)

    c = bmesh.new()   # los agujeros
    av = bmesh.new()  # sus avellanados, en una segunda pasada
    for y in ys:
        if tipo in ('dcp', 'lcdcp'):
            agujero_oval(c, 0, y, d_agujero, paso * 0.55, grosor)
            avellanado_oval(av, 0, y, d_agujero, paso * 0.55, grosor)
        elif tipo == 'tercio':
            agujero_oval(c, 0, y, d_agujero, paso * 0.45, grosor)
        elif tipo == 'lcp':
            agujero_combi(c, 0, y, d_agujero * 1.2, paso * 0.40, grosor)
        else:
            agujero_redondo(c, 0, y, d_agujero, grosor)
            avellanado_redondo(av, 0, y, d_agujero, grosor)
    restar(ob, c)
    if len(av.verts):
        restar(ob, av)
    else:
        av.free()
    if tipo == 'lcdcp':
        # y entre cada par de agujeros un rebaje, que es lo que da el «limited contact»
        rb = bmesh.new()
        rebajes_de_la_cara_inferior(rb, [(a + b) / 2 for a, b in zip(ys, ys[1:])], ancho, 2.1)
        restar(ob, rb)
    suavizar(ob, 38)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Placas con cabeza: T, L y anatómicas
# --------------------------------------------------------------------------

def placa_con_cabeza(slug, nombre, forma, medidas, largo_cuerpo, paso, ancho_cuerpo, n_cuerpo, ancho_cabeza,
                     n_cabeza, grosor, d_agujero=3.5, mat='titanio', combi=False, radio_cabeza=None):
    """
    Placa T (cabeza centrada), L (cabeza hacia un lado) o anatómica (cabeza
    curvada que abraza la metáfisis). El cuerpo se barre a lo largo de Y, la
    cabeza a lo largo de X, y se funden: un solo trozo de metal con sus agujeros.
    """
    raiz = vacio('implante')
    y_cab = largo_cuerpo / 2
    prof_cab = 11.0 if forma != 'anatomica' else 13.0

    bm = bmesh.new()
    lamina(bm, 'y', largo_cuerpo + prof_cab / 2, ancho_cuerpo, grosor, radio_extremo=ancho_cuerpo * 0.55,
           centro=(0.0, -prof_cab / 4))
    cuerpo = objeto_desde('placa', bm, mat, raiz)

    cab = bmesh.new()
    if forma == 'T':
        lamina(cab, 'x', ancho_cabeza, prof_cab, grosor, radio_extremo=prof_cab * 0.5, centro=(0.0, y_cab))
    elif forma == 'L':
        # La cabeza solo sale hacia +X, desde el borde del cuerpo.
        lamina(cab, 'x', ancho_cabeza, prof_cab, grosor, radio_extremo=prof_cab * 0.5,
               centro=(ancho_cabeza / 2 - ancho_cuerpo / 2, y_cab))
    else:
        r = radio_cabeza or 38.0
        lamina(cab, 'x', ancho_cabeza, prof_cab, grosor, radio_extremo=prof_cab * 0.5, centro=(0.0, y_cab),
               elevacion=lambda x: -(x * x) / (2 * r), radio_curva=None)
    unir(cuerpo, cab)

    c = bmesh.new()
    av = bmesh.new()
    ys = [(-largo_cuerpo / 2 + paso * 0.9 + k * paso) for k in range(n_cuerpo)]
    for y in ys:
        if combi:
            agujero_combi(c, 0, y, d_agujero * 1.2, paso * 0.40, grosor)
        else:
            agujero_oval(c, 0, y, d_agujero, paso * 0.55, grosor)
            avellanado_oval(av, 0, y, d_agujero, paso * 0.55, grosor)
    # la cabeza: una fila de agujeros redondos, o dos filas en la anatómica
    sep = ancho_cabeza / (n_cabeza + 1) if forma != 'anatomica' else ancho_cabeza / (n_cabeza // 2 + 1)
    if forma == 'L':
        x0 = -ancho_cuerpo / 2 + sep * 0.9
        for k in range(n_cabeza):
            agujero_redondo(c, x0 + sep * k, y_cab, d_agujero, grosor)
            avellanado_redondo(av, x0 + sep * k, y_cab, d_agujero, grosor)
    elif forma == 'T':
        for k in range(n_cabeza):
            x = -ancho_cabeza / 2 + sep * (k + 1)
            agujero_redondo(c, x, y_cab, d_agujero, grosor)
            avellanado_redondo(av, x, y_cab, d_agujero, grosor)
    else:
        mitades = n_cabeza // 2
        xs = [-ancho_cabeza / 2 + sep * (k + 1) for k in range(mitades)]
        r = radio_cabeza or 38.0
        for dy in (-3.2, 3.4):
            for x in xs:
                z_extra = -(x * x) / (2 * r)
                torno(c, [(-1.0 + z_extra, d_agujero * 0.62), (grosor + 1.0 + z_extra, d_agujero * 0.62)], 24,
                      Matrix.Translation((x, y_cab + dy, 0)))
    restar(cuerpo, c)
    if len(av.verts):
        restar(cuerpo, av)
    else:
        av.free()
    suavizar(cuerpo, 38)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Placa en gancho (clavícula)
# --------------------------------------------------------------------------

def placa_gancho(slug, nombre, medidas, n=3, paso=12.0, ancho=11.0, grosor=3.0, mat='titanio'):
    """
    Placa en gancho para la clavícula: un cuerpo con unos agujeros, un escalón de
    tres milímetros y, en el extremo lateral, un gancho que pasa por debajo del
    acromion. El gancho se barre sobre un camino curvo; el cuerpo, como cualquier
    lámina.
    """
    raiz = vacio('implante')
    largo = n * paso + 8.0
    bm = bmesh.new()
    lamina(bm, 'y', largo, ancho, grosor, radio_extremo=ancho * 0.5, centro=(0.0, -6.0))
    ob = objeto_desde('placa', bm, mat, raiz)

    # El gancho: sale del extremo lateral (+Y), da un paso hacia arriba y baja.
    y_fin = -6.0 + largo / 2
    camino = [tuple(p) for p in curva_bezier((0, y_fin - 4.0, grosor / 2), (0, y_fin + 6.0, grosor / 2),
                                            (0, y_fin + 14.0, grosor / 2 + 2.0), (0, y_fin + 14.0, -4.0), 14)]
    camino += [tuple(p) for p in curva_bezier((0, y_fin + 14.0, -4.0), (0, y_fin + 14.0, -9.0),
                                              (0, y_fin + 13.0, -13.0), (0, y_fin + 12.0, -15.0), 8)[1:]]
    seccion = [(grosor / 2, ancho * 0.32), (grosor / 2, -ancho * 0.32), (-grosor / 2, -ancho * 0.32), (-grosor / 2, ancho * 0.32)]
    gancho = bmesh.new()
    barrido(gancho, camino, seccion, escala=lambda t: 1.0 - 0.28 * t)
    unir(ob, gancho)

    c = bmesh.new()
    for k in range(n):
        agujero_redondo(c, 0, -6.0 - largo / 2 + 7.0 + k * paso, 3.5, grosor)
    restar(ob, c)
    suavizar(ob, 38)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Tornillos
# --------------------------------------------------------------------------

def tornillo(slug, nombre, d, d_nucleo, largo, paso, cabeza_d, cabeza_h, tipo, medidas, largo_rosca=None):
    """
    Tornillo con la punta en el origen y la cabeza en `largo`. `tipo`:
    `cortical` (rosca en todo el largo, cabeza con hexágono), `esponjosa`
    (rosca solo en la punta, vástago liso, hexágono), `bloqueado` (rosca en la
    cabeza y estrella Stardrive) y `clavo` (de bloqueo de un clavo, cabeza baja).
    """
    raiz = vacio('implante')
    r = d / 2
    rn = d_nucleo / 2
    punta = r * 1.1
    rosca_hasta = largo if tipo != 'esponjosa' else (largo_rosca or largo * 0.35)
    bm = bmesh.new()
    # la punta, un cono con la boca de autoperforación como un facetado
    torno(bm, [(0.0, 0.02), (punta, rn * 0.98)], 20, tapas=False)
    # el núcleo
    cilindro(bm, (0, 0, punta), (0, 0, largo), rn, rn, 28, tapas=False)
    rosca(bm, punta, rosca_hasta, rn * 0.98, r, paso, 36)
    if tipo == 'esponjosa':
        # Vástago liso entre la rosca y la cabeza
        cilindro(bm, (0, 0, rosca_hasta), (0, 0, largo), rn * 1.05, rn * 1.05, 28, tapas=False)
    # La cabeza, de revolución: un tronco de cono que abre hacia arriba o un cilindro bajo.
    if tipo in ('bloqueado', 'clavo'):
        torno(bm, [(largo, rn), (largo, cabeza_d / 2 * 0.9), (largo + cabeza_h, cabeza_d / 2), (largo + cabeza_h, cabeza_d / 2 * 0.92)], 32)
        if tipo == 'bloqueado':
            rosca(bm, largo + 0.2, largo + cabeza_h - 0.3, cabeza_d / 2 * 0.86, cabeza_d / 2 * 0.98, paso * 0.8, 36)
    else:
        torno(bm, [(largo - 0.1, rn), (largo, cabeza_d / 2 * 0.62), (largo + cabeza_h * 0.55, cabeza_d / 2),
                   (largo + cabeza_h, cabeza_d / 2 * 0.93)], 32)
    bisel(bm, 0.12, 1, 50)
    malla('tornillo', bm, 'acero' if tipo == 'cortical' or tipo == 'esponjosa' else 'titanio', raiz, angulo=52)

    # El hueco del destornillador, como una pieza oscura apenas hundida
    s = bmesh.new()
    if tipo in ('cortical', 'esponjosa'):
        hexagono(s, largo + cabeza_h - 0.35, largo + cabeza_h + 0.04, d * 0.62)
    else:
        estrella(s, largo + cabeza_h - 0.35, largo + cabeza_h + 0.04, d * 0.62 if tipo == 'bloqueado' else d * 0.55)
    malla('hueco', s, 'negro_mate', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Clavos endomedulares
# --------------------------------------------------------------------------

def _camino_del_clavo(largo, curva_fn, paso=4.0):
    n = max(8, int(largo / paso))
    return [Vector(curva_fn(largo * i / n)) for i in range(n + 1)]


def _seccion_circular(r, n=24):
    return [(r * cos(2 * pi * i / n), r * sin(2 * pi * i / n)) for i in range(n)]


def barrer_clavo(bm, camino, r, punta_largo=14.0, largo=None, n_seg=24, proximal=None):
    """
    Un clavo macizo: sección circular a lo largo del camino, con la punta
    redondeada (el radio baja en los últimos milímetros) y un chaflán proximal.
    `proximal=(z, radio)` lo ensancha desde esa altura hacia arriba: el PFN es
    más grueso donde pasa el canal del tornillo cefálico.
    """
    total = largo or (camino[-1] - camino[0]).length
    seccion = _seccion_circular(1.0, n_seg)

    def escala(t):
        z = t * total
        rr = r
        if proximal and z > proximal[0]:
            u = min(1.0, (z - proximal[0]) / 14.0)
            rr = r + (proximal[1] - r) * (0.5 - 0.5 * cos(pi * u))
        if z < punta_largo:
            u = z / punta_largo
            return rr * (0.22 + 0.78 * sin(u * pi / 2) ** 0.8)
        if z > total - 1.4:
            return rr * (1.0 - 0.14 * (z - (total - 1.4)) / 1.4)
        return rr
    barrido(bm, [tuple(p) for p in camino], seccion, escala=escala)


def agujero_transversal(c, centro, direccion, d, largo=40.0, oval=0.0):
    """
    Un cortador que atraviesa el clavo por `centro` en `direccion`. Con `oval` > 0
    es una ranura (el agujero dinámico) alargada a lo largo del clavo, el eje Z.
    """
    p = Vector(centro)
    dv = Vector(direccion).normalized()
    M = colocar(p - dv * (largo / 2), p + dv * (largo / 2))
    if oval > 0.0:
        # En el marco de `colocar`, +Y local queda lo más cerca posible de +Z del mundo.
        for dy in (-oval / 2, oval / 2):
            torno(c, [(0, d / 2), (largo, d / 2)], 22, M @ Matrix.Translation((0, dy, 0)))
        caja(c, (0, 0, largo / 2), (d, oval, largo), M)
    else:
        torno(c, [(0, d / 2), (largo, d / 2)], 22, M)


def clavo(slug, nombre, largo, d, curva_fn, medidas, agujeros_proximales, agujeros_distales, mat='titanio_azul',
          canulado=3.0, extras=None, proximal=None):
    """
    Un clavo endomedular de pie, con la punta en el origen y el extremo proximal
    arriba. `curva_fn(z)` da el punto del eje a la altura z (el arco anterior del
    fémur, la curva proximal de la tibia). Los agujeros son listas de
    `(z, dirección, diámetro, oval)`; `extras(raiz)` agrega piezas aparte (los
    tornillos cefálicos del PFN, que van como nodos hijos y se pueden ocultar).
    """
    raiz = vacio('implante')
    camino = _camino_del_clavo(largo, curva_fn)
    bm = bmesh.new()
    barrer_clavo(bm, camino, d / 2, 14.0, proximal=proximal)
    ob = objeto_desde('clavo', bm, mat, raiz)

    c = bmesh.new()
    if canulado > 0:
        # La cánula, como un barrido más estrecho que sobresale por los dos extremos
        t0 = (camino[1] - camino[0]).normalized()
        t1 = (camino[-1] - camino[-2]).normalized()
        ext = [camino[0] - t0 * 2.0] + camino + [camino[-1] + t1 * 2.0]
        barrido(c, [tuple(p) for p in ext], _seccion_circular(canulado / 2, 16))
    for z, direccion, dd, oval in list(agujeros_proximales) + list(agujeros_distales):
        centro = Vector(curva_fn(z))
        agujero_transversal(c, centro, direccion, dd, largo=(proximal[1] if proximal else d / 2) * 3.0 + 4.0, oval=oval)
    restar(ob, c)
    suavizar(ob, 45)
    if extras:
        extras(raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


def clavo_pfn(slug, nombre, medidas):
    """
    Clavo cefalomedular (PFN) de 10 × 240 mm: desvío proximal de 6°, un canal a 130° para el
    tornillo cefálico y otro, más arriba, para el antirrotatorio. Los dos tornillos
    van como nodos aparte, para poder ocultarlos desde el taller.
    """
    L, d = 240.0, 10.0
    z_desvio = 170.0
    t6 = tan(radians(6.0))
    curva = lambda z: (max(0.0, z - z_desvio) * t6, 0.0, z)
    cuello = Vector((sin(radians(130.0)), 0.0, -cos(radians(130.0)))).normalized()
    z_cef, z_anti = 176.0, 198.0

    def extras(raiz):
        for nombre_nodo, z, largo_t, r_mayor, r_menor, largo_rosca in (
            ('tornillo_cefalico', z_cef, 118.0, 5.17, 4.1, 36.0),
            ('tornillo_antirrotacion', z_anti, 96.0, 3.25, 2.6, 24.0),
        ):
            centro = Vector(curva(z))
            p0 = centro - cuello * 26.0
            p1 = p0 + cuello * largo_t
            M = colocar(p0, p1)
            bm = bmesh.new()
            torno(bm, [(0.0, r_mayor * 0.82), (1.6, r_mayor), (largo_t - largo_rosca, r_mayor * 0.9)], 28, M, tapas=True)
            rosca(bm, largo_t - largo_rosca, largo_t - 3.0, r_menor, r_mayor, 3.2, 36, M)
            torno(bm, [(largo_t - 3.0, r_menor), (largo_t, r_menor * 0.3)], 28, M, tapas=False)
            bisel(bm, 0.1, 1, 50)
            malla(nombre_nodo, bm, 'acero', raiz, angulo=52)
    return clavo(slug, nombre, L, d, curva, medidas,
                 [(z_cef, tuple(cuello), 11.2, 0.0), (z_anti, tuple(cuello), 7.0, 0.0), (140.0, (1, 0, 0), 5.0, 0.0)],
                 [(30.0, (1, 0, 0), 5.0, 8.0), (16.0, (1, 0, 0), 5.0, 0.0)],
                 mat='titanio', extras=extras, proximal=(z_desvio - 18.0, 8.5))


# --------------------------------------------------------------------------
# Injerto óseo
# --------------------------------------------------------------------------

def _ruido(rng, v, k):
    return Vector((v.x * (1 + rng.uniform(-k, k)), v.y * (1 + rng.uniform(-k, k)), v.z * (1 + rng.uniform(-k, k))))


def injerto_tricortical(slug, nombre, medidas, semilla=11):
    """
    Injerto tricortical de cresta ilíaca: un bloque de unos 30 × 15 × 18 mm con
    tres caras de cortical lisa y el resto esponjoso, rugoso y poroso.
    """
    rng = random.Random(semilla)
    raiz = vacio('injerto')
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * 30.0, v.co.y * 15.0, v.co.z * 18.0))
    # Subdividir para poder rugosear las caras de esponjosa
    for _ in range(3):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    for v in bm.verts:
        n = v.co.copy()
        # Suaviza las aristas (un bloque tallado no tiene filos) y agrega rugosidad.
        n.x = max(-15.0, min(15.0, n.x))
        k = 0.0
        # las caras de esponjosa (los lados +X, -X y +Z) se rugosean; la cortical (-Z, ±Y) queda lisa
        if abs(n.x) > 14.5 or n.z > 8.5:
            k = 0.9
        v.co += Vector((rng.uniform(-k, k), rng.uniform(-k, k), rng.uniform(-k, k)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    def indice(c):
        # 0 cortical, 1 esponjosa
        return 1 if (abs(c.x) > 14.0 or c.z > 8.2) else 0
    for f in bm.faces:
        f.material_index = indice(f.calc_center_median())
    ob = malla('injerto', bm, ['hueso_cortical', 'hueso_esponjoso'], raiz, suave=True, angulo=55, unir_cercanos=0.0001)
    # Se posa sobre su cara de cortical
    ob.location = (0, 0, 9.0)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


def injerto_esponjoso(slug, nombre, medidas, semilla=5, trozos=22):
    """Esponjosa en trozos: un montón de fragmentos irregulares de 3 a 8 mm, como se aloja en un defecto."""
    rng = random.Random(semilla)
    raiz = vacio('injerto')
    bm = bmesh.new()
    colocados = []
    for k in range(trozos):
        ang = rng.uniform(0, 2 * pi)
        dist = rng.uniform(0, 11.0) * (1.0 - 0.0 * k)
        r = rng.uniform(1.6, 3.8)
        altura = max(0.0, 7.0 - dist * 0.55) * rng.uniform(0.2, 1.0)
        centro = Vector((dist * cos(ang), dist * sin(ang), r * 0.8 + altura))
        trozo = bmesh.new()
        bmesh.ops.create_icosphere(trozo, subdivisions=2, radius=r)
        escala = Vector((rng.uniform(0.7, 1.3), rng.uniform(0.7, 1.3), rng.uniform(0.55, 1.1)))
        for v in trozo.verts:
            v.co = Vector((v.co.x * escala.x, v.co.y * escala.y, v.co.z * escala.z))
            v.co += Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35)))
        colocados.append((trozo, centro, rng.uniform(0, 2 * pi)))
    for trozo, centro, giro in colocados:
        rot = Matrix.Rotation(giro, 4, 'Z')
        for v in trozo.verts:
            v.co = rot @ v.co + centro
        me = bpy.data.meshes.new('t')
        trozo.to_mesh(me)
        trozo.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    ob = malla('injerto', bm, 'hueso_esponjoso', raiz, suave=True, angulo=60, unir_cercanos=0.0)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz

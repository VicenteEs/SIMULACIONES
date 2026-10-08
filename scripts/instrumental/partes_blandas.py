"""
Instrumental de partes blandas: bisturí, electrobisturí, pinzas de disección y
suturas. Sin articulaciones complejas salvo las pinzas (que se abren) y los
botones del electrobisturí (que se pulsan).

Convenio, el de siempre: de pie, punta de trabajo en el origen.
"""

from lib import *
from detalles import *
from math import pi, sin, cos, radians, tan, sqrt, atan2


def seccion_arco(ancho, flecha, grosor, n=10):
    """Sección de una placa curva (una teja): arco exterior e interior, para barrer una hoja acanalada."""
    pts_ext, pts_int = [], []
    R = (ancho * ancho / 4 + flecha * flecha) / (2 * flecha) if flecha > 1e-6 else 1e9
    a0 = atan2(ancho / 2, R - flecha)
    for i in range(n + 1):
        a = -a0 + 2 * a0 * i / n
        pts_ext.append((R * sin(a), R * cos(a) - (R - flecha)))
    for i in range(n, -1, -1):
        a = -a0 + 2 * a0 * i / n
        pts_int.append(((R - grosor) * sin(a), (R - grosor) * cos(a) - (R - flecha)))
    return pts_ext + pts_int


# --------------------------------------------------------------------------
# Bisturí
# --------------------------------------------------------------------------

HOJAS = {
    # número: (largo total, ancho máximo, forma). Medidas de referencia de catálogo.
    '22': (46.0, 14.5, 'vientre'),
    '20': (46.0, 12.0, 'vientre'),
    '15': (38.0, 8.5, 'vientre_chico'),
    '10': (38.0, 9.5, 'curva'),
}


def contorno_hoja(num):
    """Contorno (x, z) de la hoja: el filo curvo a la izquierda, el lomo recto a la derecha, la punta en el origen."""
    L, W, forma = HOJAS[num]
    zt = L - 14.0                       # donde acaba la parte afilada; el resto es el talón
    pts = []
    # Filo: de la punta hacia arriba
    for i in range(0, 21):
        t = i / 20
        z = t * zt
        if forma == 'curva':
            # hoja 10: sin punta, el vientre sube redondeado
            x = -W * 0.5 * (1 - (1 - t) ** 2.2) - 0.2
            if i == 0:
                x = -0.5
        elif forma == 'vientre_chico':
            x = -W * (sin(pi * min(1.0, t * 1.35) / 2)) * 0.9
            if t > 0.74:
                x = -W * 0.9 * (1 - 0.12 * (t - 0.74) / 0.26)
        else:
            x = -W * (1 - (1 - t) ** 1.8) * 0.93
        pts.append((x, z))
    ancho_talon = W * 0.93 if forma != 'curva' else W * 0.5
    pts.append((-ancho_talon, L))
    pts.append((1.2, L))
    # Lomo: sube recto, y baja a la punta
    pts.append((1.2, zt * 0.55))
    pts.append((0.55, 0.9))
    pts.append((0.0, 0.0))
    return pts


def bisturi(slug, nombre, mango, hoja, medidas):
    """
    Bisturí: mango plano de acero con graduación en milímetros y una hoja
    intercambiable. El mango n.º 4 es el ancho (para hojas 20 a 25), el n.º 3
    el angosto (para las hojas 10 a 15).
    """
    raiz = vacio('instrumento')
    LH = HOJAS[hoja][0]
    ancho_m = 11.0 if mango == '4' else 8.2
    largo_m = 135.0 if mango == '4' else 125.0
    zmont = LH - 10.0                    # la hoja entra 10 mm en la ranura del mango
    # La hoja
    bm = bmesh.new()
    prisma_plano(bm, contorno_hoja(hoja), -0.2, 0.2)
    bisel(bm, 0.05, 1, 40)
    malla('hoja', bm, 'acero_azulado', raiz)
    # El talón de la hoja define el eje del mango: la punta queda en el origen y
    # el mango se corre hacia el centro del talón, para que no se vea la hoja
    # pegada de lado.
    L_, W_, forma_ = HOJAS[hoja]
    ancho_talon_ = W_ * 0.93 if forma_ != 'curva' else W_ * 0.5
    dx = (-ancho_talon_ + 1.2) / 2
    # El mango: boca de mordaza, cuello, graduación y agarre
    bm = bmesh.new()
    z0 = zmont
    cont = [(-ancho_m * 0.30, z0), (ancho_m * 0.30, z0), (ancho_m * 0.52, z0 + 10.0), (ancho_m * 0.52, z0 + largo_m * 0.30),
            (ancho_m * 0.5, z0 + largo_m * 0.65), (ancho_m * 0.42, z0 + largo_m - 6.0), (ancho_m * 0.25, z0 + largo_m),
            (-ancho_m * 0.25, z0 + largo_m), (-ancho_m * 0.42, z0 + largo_m - 6.0), (-ancho_m * 0.5, z0 + largo_m * 0.65),
            (-ancho_m * 0.52, z0 + largo_m * 0.30), (-ancho_m * 0.52, z0 + 10.0)]
    prisma_plano(bm, cont, -1.35, 1.35)
    bisel(bm, 0.3, 2, 35)
    # Agarre: estrías transversales en las dos caras
    for cara in (-1, 1):
        for i in range(16):
            z = z0 + 14.0 + i * 1.7
            caja(bm, (0, cara * 1.32, z), (ancho_m * 0.78, 0.16, 0.55))
    malla('mango', bm, 'acero_cepillado', raiz, loc=(dx, 0, 0))
    # La graduación en milímetros, en el canto del mango
    g = bmesh.new()
    for i in range(0, 41):
        z = z0 + largo_m * 0.30 + i * 1.5
        ancho_t = 2.6 if i % 5 == 0 else 1.4
        caja(g, (ancho_m * 0.455, 1.36, z), (ancho_t, 0.06, 0.24))
        caja(g, (ancho_m * 0.455, -1.36, z), (ancho_t, 0.06, 0.24))
    malla('graduacion', g, 'acero_oscuro', raiz, loc=(dx, 0, 0))
    # El pasador que retiene la hoja
    p = bmesh.new()
    cilindro(p, (0, -1.6, z0 + 4.0), (0, 1.6, z0 + 4.0), 0.9, 0.9, 12)
    malla('pasador', p, 'acero_pulido', raiz, loc=(dx, 0, 0))
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Pinzas de disección
# --------------------------------------------------------------------------

def pinza_diseccion(slug, nombre, largo, dientes, medidas):
    """
    Pinza de disección (Adson): dos brazos de acero elástico unidos arriba. Con
    dientes: dos en un brazo y uno en el otro (la «1×2»); sin dientes: la punta
    lleva estrías finas. Cada brazo gira sobre el remache del extremo para
    abrirse.
    """
    raiz = vacio('instrumento')
    zj = largo - 8.0                       # el remache
    declarar_articulacion('Apertura', 'Abrir pinza', 0.0, 9.0, '°', 0.0)
    ancho = [(0.0, 1.9), (14.0, 2.6), (34.0, 4.6), (52.0, 6.8), (largo - 14.0, 7.2), (largo - 4.0, 6.0), (largo, 4.4)]

    def w(z):
        for (z0, a0), (z1, a1) in zip(ancho, ancho[1:]):
            if z <= z1:
                return a0 + (a1 - a0) * (z - z0) / (z1 - z0)
        return ancho[-1][1]
    for lado, nombre_b, factor in ((+1, 'a', -0.5), (-1, 'b', +0.5)):
        pv = pivote('pivote_brazo_' + nombre_b, raiz, (0, 0, zj), 'Apertura', (0, 1, 0), factor)
        bm = bmesh.new()
        t = 1.15
        zs = [i * largo / 40 for i in range(41)]
        a = [(lado * 0.0, 0.0)]
        # Cada brazo es una placa estrecha en X y ancha en Y, de sección rectangular y algo abombada
        izq = []
        for z in zs:
            izq.append((z - zj, w(z) / 2))
        anillos_inf, anillos_sup = [], []
        pts = []
        for z in zs:
            cx = lado * (t / 2 + 0.0)
            pts.append((cx, z - zj, w(z)))
        # Construcción por rebanadas rectangulares
        ant = None
        for cx, zz, ww in pts:
            v = [bm.verts.new((cx - t / 2, -ww / 2, zz)), bm.verts.new((cx + t / 2, -ww / 2, zz)),
                 bm.verts.new((cx + t / 2, ww / 2, zz)), bm.verts.new((cx - t / 2, ww / 2, zz))]
            if ant is not None:
                for k in range(4):
                    bm.faces.new((ant[k], ant[(k + 1) % 4], v[(k + 1) % 4], v[k]))
            ant = v
            if cx == pts[0][0] and zz == pts[0][1]:
                bm.faces.new(v[::-1])
        bm.faces.new(ant)
        # Estrías del agarre (cara exterior) entre z = 50 y z = largo − 18
        for i in range(int((largo - 18 - 50) / 1.5)):
            z = 50 + i * 1.5 - zj
            caja(bm, (lado * (t + 0.08), 0, z), (0.18, 5.6, 0.55))
        # Dientes o estrías de punta
        if dientes:
            if lado > 0:
                for y in (-0.55, 0.55):
                    torno(bm, [(0, 0.45), (0, 0.45), (-1.6, 0.04)], 8, colocar((-lado * 0.05, y, -zj + 0.2), (-lado * 0.05 - lado * 1.25, y, -zj - 0.1)), tapas=False)
            else:
                torno(bm, [(0, 0.5), (0, 0.5), (-1.7, 0.04)], 8, colocar((-lado * 0.05, 0.0, -zj + 0.2), (-lado * 0.05 - lado * 1.25, 0.0, -zj - 0.1)), tapas=False)
        else:
            for i in range(7):
                caja(bm, (-lado * (t / 2 - 0.1) + lado * (t / 2), 0, -zj + 1.4 + i * 0.95), (0.16, 1.6, 0.35))
        bisel(bm, 0.08, 1, 50)
        malla('brazo_' + nombre_b, bm, 'acero_cepillado', pv)
    r = bmesh.new()
    cilindro(r, (-3.3, 0, zj), (3.3, 0, zj), 1.35, 1.35, 16)
    for lado in (-1, 1):
        cilindro(r, (lado * 3.3, 0, zj), (lado * 3.9, 0, zj), 1.35, 1.0, 16)
    malla('remache', r, 'acero_pulido', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Electrobisturí
# --------------------------------------------------------------------------

def electrobisturi(slug, nombre, medidas):
    """
    Lápiz de electrocirugía de dos botones. Amarillo = corte (CUT) y azul =
    coagulación (COAG), que es el código de color que usa casi todo el
    instrumental de electrocirugía. Cable con alivio de tensión y conector de
    tres clavijas. Los dos botones se hunden al pulsarlos.
    """
    raiz = vacio('instrumento')
    declarar_articulacion('Corte', 'Pulsar CORTE (amarillo)', 0.0, 1.4, 'mm', 0.0)
    declarar_articulacion('Coagulacion', 'Pulsar COAG (azul)', 0.0, 1.4, 'mm', 0.0)
    # Electrodo de hoja (acero) y su vaina aislante
    e = bmesh.new()
    prisma_plano(e, [(-1.9, 0.9), (-2.2, 6.0), (-2.2, 20.0), (2.2, 20.0), (2.2, 6.0), (1.9, 0.9), (0.9, 0.0), (-0.9, 0.0)], -0.45, 0.45)
    bisel(e, 0.12, 1, 40)
    malla('electrodo', e, 'acero_pulido', raiz)
    # Vaina blanca y cono de la punta
    b = bmesh.new()
    torno(b, [(18.0, 1.5), (18.0, 2.2), (38.0, 2.4), (46.0, 3.4), (60.0, 5.6), (74.0, 6.9)], 28, tapas=False)
    malla('vaina', b, 'blanco_plastico', raiz)
    # Cuerpo del lápiz
    c = bmesh.new()
    torno(c, [(74.0, 6.9), (74.0, 7.4), (90.0, 8.4), (140.0, 9.0), (166.0, 8.2), (172.0, 6.6), (176.0, 4.4)], 36)
    bisel(c, 0.1, 1, 60)
    malla('cuerpo', c, 'gris_claro', raiz)
    # Anillo de agarre (goma)
    g = bmesh.new()
    estrias_rectas(g, 100.0, 134.0, 9.15, 20, 0.35, 3)
    malla('agarre', g, 'negro_goma', raiz)
    # Botones: cada uno es un deslizador que se hunde hacia −X
    for z0, mat, art in ((93.0, 'amarillo', 'Corte'), (111.0, 'azul_boton', 'Coagulacion')):
        sl = deslizador('boton_' + art.lower(), raiz, (0, 0, z0), art, (-1, 0, 0), -1.0)
        bb = bmesh.new()
        prisma_plano(bb, [(8.0, -4.2), (9.4, -3.2), (9.4, 3.2), (8.0, 4.2)], -3.1, 3.1, colocar((0, 0, 0), (0, 0, 1)) @ Matrix.Rotation(0, 4, 'Z'))
        bisel(bb, 0.35, 2, 30)
        malla('boton_' + art.lower(), bb, mat, sl)
        # Símbolo del botón, en oscuro
        sim = bmesh.new()
        if art == 'Corte':
            caja(sim, (9.5, 0, 0), (0.1, 4.8, 0.6))        # una raya: «—» de corte
        else:
            for i in (-1, 0, 1):
                caja(sim, (9.5, i * 1.3, 0), (0.1, 0.5, 3.2))  # tres rayas: coagulación
        malla('simbolo_' + art.lower(), sim, 'negro_mate', sl)
    # Cable: sale por detrás con un alivio de tensión cónico y se enrosca hacia arriba
    k = bmesh.new()
    torno(k, [(172.0, 3.8), (190.0, 2.6), (205.0, 2.3)], 20)
    malla('alivio_tension', k, 'negro_goma', raiz)
    cam = curva_bezier((0, 0, 205.0), (0, 0, 225.0), (20, 6, 232.0), (14, -8, 252.0), 20)         + curva_bezier((14, -8, 252.0), (8, -22, 270.0), (-12, -14, 280.0), (-14, 4, 300.0), 20)[1:]
    cb = bmesh.new()
    barrido(cb, [tuple(p) for p in cam], circulo(1.7, 10), None)
    malla('cable', cb, 'negro_goma', raiz)
    # Conector de tres clavijas
    cn = bmesh.new()
    torno(cn, [(300.0, 3.0), (306.0, 5.4), (326.0, 5.4), (326.0, 4.4)], 24, colocar((-14, 4, 0), (-14, 4, 1)))
    malla('conector', cn, 'negro_mate', raiz)
    clav = bmesh.new()
    for dx in (-3.2, 0.0, 3.2):
        cilindro(clav, (-14 + dx, 4, 326.0), (-14 + dx, 4, 344.0), 0.95, 0.95, 10)
    malla('clavijas', clav, 'laton', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Suturas
# --------------------------------------------------------------------------

def sutura(slug, nombre, hilo_mat, grosor_hilo, aguja_largo, aguja_radio, medidas, aguja_mat='acero_oscuro'):
    """
    Sutura con aguja: aguja curva de 3/8 de círculo con la punta cortante
    triangular en el origen y el hilo unido por el extremo. El hilo está
    exagerado entre dos y tres veces para que se vea en pantalla: uno de
    0,15 mm de verdad no se distinguiría.
    """
    raiz = vacio('instrumento')
    arco = 3 * pi / 4 if aguja_largo is None else aguja_largo / aguja_radio
    n = 28
    camino = []
    for i in range(n + 1):
        a = arco * i / n
        camino.append((aguja_radio * (1 - cos(a)), 0.0, aguja_radio * sin(a)))
    ra = 0.42 if aguja_radio < 9 else 0.5
    ag = bmesh.new()
    # punta triangular cortante: sección de tres vértices que se afina hacia la punta
    barrido(ag, camino, circulo(ra, 10),
            escala=lambda t: 0.25 + 0.75 * min(1.0, t * 5.0))
    malla('aguja', ag, aguja_mat, raiz)
    # El hilo, desde el ojo de la aguja, en una S suave hacia arriba
    fin = Vector(camino[-1])
    cam = curva_bezier(fin, fin + Vector((6, 0, 14)), fin + Vector((24, 10, 24)), fin + Vector((16, 14, 52)), 24)
    cam += curva_bezier(cam[-1], cam[-1] + Vector((-8, 10, 20)), cam[-1] + Vector((-30, 8, 30)), cam[-1] + Vector((-22, -8, 62)), 24)[1:]
    h = bmesh.new()
    barrido(h, [tuple(p) for p in cam], circulo(grosor_hilo, 8), None)
    malla('hilo', h, hilo_mat, raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz

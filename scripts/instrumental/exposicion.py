"""
Instrumental de exposición y de periostio: separadores de mano (Senn-Miller,
Farabeuf, Hohmann) y periostótomos (Lambotte, Farabeuf, Freer).

Son de una pieza y no tienen articulación: el simulador los mueve enteros. De
pie, con el extremo de trabajo en el origen.
"""

from lib import *
from detalles import *
from partes_blandas import seccion_arco
from math import pi, sin, cos, radians, tan, sqrt


def chapa(bm, camino, ancho, grosor, escala_ancho=None):
    """
    Una pletina doblada: sección rectangular barrida a lo largo de un camino.
    Hace los cuellos acodados de los separadores. El ancho va en la dirección
    que tenía la sección al empezar, sea cual sea el rumbo del camino.
    """
    seccion = [(ancho / 2, grosor / 2), (-ancho / 2, grosor / 2), (-ancho / 2, -grosor / 2), (ancho / 2, -grosor / 2)]
    return barrido(bm, camino, seccion, escala=escala_ancho)


def estrias_transversales(bm, z0, z1, paso, ancho, grosor, prof=0.18):
    """Estrías finas en las dos caras de una pletina: el agarre de un mango plano."""
    n = int((z1 - z0) / paso)
    for i in range(n):
        z = z0 + i * paso
        for cara in (-1, 1):
            caja(bm, (0, cara * (grosor / 2), z), (ancho * 0.8, prof * 2, paso * 0.42))


def redondear_contorno(c, r=1.0, n=3):
    """Esquinas redondeadas de un contorno rectangular dado como cuatro puntos antihorarios."""
    out = []
    k = len(c)
    for i in range(k):
        p0, p1, p2 = Vector(c[i - 1]), Vector(c[i]), Vector(c[(i + 1) % k])
        a = (p0 - p1).normalized() * min(r, (p0 - p1).length / 2)
        b = (p2 - p1).normalized() * min(r, (p2 - p1).length / 2)
        for t in range(n + 1):
            u = t / n
            q = (1 - u) ** 2 * (p1 + a) + 2 * (1 - u) * u * p1 + u * u * (p1 + b)
            out.append((q.x, q.y))
    return out


# --------------------------------------------------------------------------
# Senn-Miller
# --------------------------------------------------------------------------

def senn_miller(slug, nombre, medidas):
    """
    Separador de Senn-Miller: un extremo de rastrillo de tres garras romas y el
    otro de pala; las dos salen en ángulo recto del mango plano. Es el que se usa
    en cuanto se abre la piel, para separar en espacios chicos.
    """
    raiz = vacio('instrumento')
    L = 160.0
    ancho_m, grueso = 11.0, 2.6
    bm = bmesh.new()
    # Mango: pletina con dos cuellos acodados, uno a cada extremo
    abajo = [(0, 0, 14), (0, 0, 9), (0, 1.4, 4.4), (0, 5.0, 1.8), (0, 10.0, 1.2)]
    arriba = [(0, 0, L - 14), (0, 0, L - 9), (0, 1.4, L - 4.4), (0, 5.0, L - 1.8), (0, 10.0, L - 1.2)]
    chapa(bm, abajo[::-1], ancho_m, grueso)
    chapa(bm, arriba, ancho_m, grueso)
    prisma_plano(bm, [(-ancho_m / 2, 14), (ancho_m / 2, 14), (ancho_m * 0.46, L - 14), (-ancho_m * 0.46, L - 14)], -grueso / 2, grueso / 2)
    estrias_transversales(bm, 56.0, 108.0, 2.0, ancho_m, grueso)
    bisel(bm, 0.18, 1, 38)
    malla('mango', bm, 'acero_cepillado', raiz)
    # Rastrillo: barra transversal y tres garras romas, curvadas hacia abajo
    r = bmesh.new()
    caja(r, (0, 12.5, 1.6), (22.0, 5.0, 3.2))
    for x in (-8.0, 0.0, 8.0):
        camino = [(x, 14.0, 1.6), (x, 22.0, 1.6), (x, 28.0, 0.9), (x, 31.5, -1.6)]
        barrido(r, camino, circulo(1.35, 10), escala=lambda t: 1.0 - 0.28 * t)
        esfera(r, (x, 31.7, -1.9), 1.0, 10, 6)
    bisel(r, 0.12, 1, 50)
    malla('rastrillo', r, 'acero_pulido', raiz)
    # Pala del otro extremo
    pa = bmesh.new()
    prisma(pa, redondear_contorno([(-8.5, 10.0), (8.5, 10.0), (8.5, 36.0), (-8.5, 36.0)], 3.0), L - 2.0, L - 0.4)
    bisel(pa, 0.12, 1, 50)
    malla('pala', pa, 'acero_pulido', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Farabeuf
# --------------------------------------------------------------------------

def farabeuf(slug, nombre, medidas):
    """
    Separador de Farabeuf: un mango plano con una pala en cada extremo, en
    ángulo recto, de distinto tamaño y mirando a lados opuestos. Se usan en
    pareja, sostenidos por el ayudante, para abrir la piel y el plano subcutáneo.
    """
    raiz = vacio('instrumento')
    L = 125.0
    ancho_m, grueso = 9.0, 2.4
    bm = bmesh.new()
    abajo = [(0, 0, 10), (0, 0, 6), (0, 1.2, 3.0), (0, 3.4, 1.4)]
    arriba = [(0, 0, L - 10), (0, 0, L - 6), (0, -1.2, L - 3.0), (0, -3.4, L - 1.4)]
    chapa(bm, abajo[::-1], ancho_m, grueso)
    chapa(bm, arriba, ancho_m, grueso)
    prisma_plano(bm, [(-ancho_m / 2, 10), (ancho_m / 2, 10), (ancho_m * 0.5, L - 10), (-ancho_m * 0.5, L - 10)], -grueso / 2, grueso / 2)
    estrias_transversales(bm, 40.0, 86.0, 2.0, ancho_m, grueso)
    bisel(bm, 0.15, 1, 38)
    malla('mango', bm, 'acero_cepillado', raiz)
    # Pala pequeña (10 × 25) abajo y grande (12 × 30) arriba, a lados contrarios
    p1 = bmesh.new()
    prisma(p1, redondear_contorno([(-5.0, 3.0), (5.0, 3.0), (5.0, 25.0), (-5.0, 25.0)], 1.8), 0.0, 1.6)
    bisel(p1, 0.12, 1, 50)
    malla('pala_chica', p1, 'acero_pulido', raiz)
    p2 = bmesh.new()
    prisma(p2, redondear_contorno([(-6.0, -3.0), (6.0, -3.0), (6.0, -30.0), (-6.0, -30.0)], 2.0), L - 1.6, L)
    bisel(p2, 0.12, 1, 50)
    malla('pala_grande', p2, 'acero_pulido', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Hohmann
# --------------------------------------------------------------------------

def hohmann(slug, nombre, ancho_pala, largo, medidas):
    """
    Separador de Hohmann: una pala ancha y acodada con la punta curvada hacia
    arriba, para pasar por detrás del hueso y retraerlo; el mango acaba en un
    extremo redondeado para poder golpearlo con el martillo.
    """
    raiz = vacio('instrumento')
    # El origen en la punta de la pala (donde se apoya en el hueso)
    # La pala, de la punta hacia el codo
    bm = bmesh.new()
    pala = [(0.0, 0.0, 3.5), (0.0, -2.0, 1.2), (0.0, -9.0, 0.0), (0.0, -24.0, 0.0), (0.0, -40.0, 1.0), (0.0, -52.0, 5.0), (0.0, -58.0, 14.0)]
    # Punta con una muesca: dos dientes romos
    chapa(bm, pala[::-1], ancho_pala, 3.2, escala_ancho=lambda t: 1.0 - 0.2 * (1 - t))
    bisel(bm, 0.2, 1, 40)
    # la muesca de la punta
    caja(bm, (0, 1.0, 2.9), (ancho_pala * 0.25, 4.2, 4.2))
    malla('pala', bm, 'acero_pulido', raiz)
    # El vástago plano que sube y el mango
    v = bmesh.new()
    z0 = 14.0
    # (el vástago es una pletina que sale de lo alto de la pala, en vertical)
    chapa(v, [(0, -58.0, 14.0), (0, -58.6, 24.0), (0, -58.6, largo - 36.0)], 9.6, 3.6)
    bisel(v, 0.2, 1, 40)
    malla('vastago', v, 'acero', raiz)
    mg = bmesh.new()
    zi = largo - 36.0
    torno(mg, [(zi, 4.0), (zi + 4.0, 7.4), (zi + 8.0, 8.8), (largo - 6.0, 9.6), (largo - 1.5, 8.6), (largo, 6.0), (largo, 0.05)], 36, colocar((0, -58.6, 0), (0, -58.6, 1)))
    estrias_rectas(mg, zi + 8.0, largo - 8.0, 9.6, 14, 0.45, 3, M=Matrix.Translation((0, -58.6, 0)))
    bisel(mg, 0.1, 1, 50)
    malla('mango', mg, 'acero_cepillado', raiz, angulo=48)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Periostótomos y elevadores
# --------------------------------------------------------------------------

def periostotomo(slug, nombre, ancho_hoja, largo, curvo, medidas, flecha=0.0):
    """
    Periostótomo (Lambotte / Farabeuf): mango moleteado de acero, vástago y una
    hoja plana o acanalada con filo. La hoja se desliza entre hueso y periostio
    sin levantarlo más de lo necesario, para respetar su irrigación.
    """
    raiz = vacio('instrumento')
    # Hoja: una placa (curva si `flecha`) con filo biselado
    hoja = bmesh.new()
    lh = 22.0
    if flecha > 0:
        sec = seccion_arco(ancho_hoja, flecha, 1.6, 10)
        barrido(hoja, [(0, 0, 0.0), (0, 0, lh)], sec, escala=None)
    else:
        prisma_plano(hoja, [(-ancho_hoja * 0.42, 0.0), (ancho_hoja * 0.42, 0.0), (ancho_hoja / 2, lh), (-ancho_hoja / 2, lh)], -0.8, 0.8)
    bisel(hoja, 0.15, 1, 40)
    malla('hoja', hoja, 'acero_pulido', raiz)
    # El filo, más claro
    # Vástago
    v = bmesh.new()
    cilindro(v, (0, 0, lh - 1.0), (0, 0, lh + 6.0), ancho_hoja * 0.30, 2.6, 20)
    cilindro(v, (0, 0, lh + 6.0), (0, 0, largo - 92.0), 2.6, 3.0, 20)
    bisel(v, 0.1, 1, 50)
    malla('vastago', v, 'acero', raiz)
    # Mango moleteado, con collarín
    m = bmesh.new()
    z0 = largo - 92.0
    torno(m, [(z0, 3.0), (z0, 4.5), (z0 + 6.0, 6.0), (z0 + 10.0, 7.5)], 28)
    estrias_rectas(m, z0 + 10.0, largo - 10.0, 7.5, 16, 0.4, 3)
    torno(m, [(largo - 10.0, 7.5), (largo - 3.0, 6.8), (largo, 4.0), (largo, 0.05)], 28)
    bisel(m, 0.1, 1, 50)
    malla('mango', m, 'acero_cepillado', raiz, angulo=48)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


def freer(slug, nombre, medidas):
    """
    Elevador de Freer: doble extremo, uno afilado y otro romo, con un mango
    central acanalado y redondo. Es el elevador fino de los abordajes
    periarticulares y de minifragmentos.
    """
    raiz = vacio('instrumento')
    L = 180.0
    # Hoja afilada (abajo, en el origen)
    h = bmesh.new()
    camino = [(0, 0, 0.0), (0, 0, 14.0), (0, 0, 34.0)]
    barrido(h, camino, [(3.0 * cos(2 * pi * i / 12), 0.8 * sin(2 * pi * i / 12)) for i in range(12)], escala=lambda t: 0.25 + 0.75 * min(1.0, t * 3.0) if t < 0.33 else 1.0)
    bisel(h, 0.1, 1, 50)
    malla('hoja_afilada', h, 'acero_pulido', raiz)
    # Mango central
    m = bmesh.new()
    torno(m, [(34.0, 2.0), (34.0, 3.2), (52.0, 4.0), (60.0, 4.6)], 24)
    estrias_rectas(m, 60.0, L - 60.0, 4.6, 18, 0.35, 3)
    torno(m, [(L - 60.0, 4.6), (L - 52.0, 4.0), (L - 34.0, 3.2), (L - 34.0, 2.0)], 24)
    bisel(m, 0.1, 1, 50)
    malla('mango', m, 'acero_cepillado', raiz, angulo=48)
    # Extremo romo (arriba): espátula de punta redonda
    r = bmesh.new()
    barrido(r, [(0, 0, L - 34.0), (0, 0, L - 20.0), (0, 0, L)], [(2.2 * cos(2 * pi * i / 12), 1.0 * sin(2 * pi * i / 12)) for i in range(12)], escala=lambda t: 1.0 + 0.3 * t)
    esfera(r, (0, 0, L - 1.5), 2.6, 14, 8, Matrix.Scale(0.45, 4, (0, 1, 0)))
    bisel(r, 0.1, 1, 50)
    malla('espatula_roma', r, 'acero_pulido', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz

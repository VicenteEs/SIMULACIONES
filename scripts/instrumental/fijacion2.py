"""
Instrumental de fijación, segunda parte: camisa con trocar, medidor de
profundidad, limitador de torque, machuelo, avellanador, aguja de Kirschner y
motor quirúrgico. Piezas de revolución con partes que se deslizan o giran.
"""

from lib import *
from detalles import *
from math import pi, sin, cos, radians, tan, sqrt


def tubo(bm, z0, z1, r_ext, r_int, seg=32):
    """Tubo hueco de pared fina, abierto por las dos bocas."""
    torno(bm, [(z0, r_int), (z0, r_ext), (z1, r_ext), (z1, r_int)], seg, tapas=False)


# --------------------------------------------------------------------------
# Camisa de protección con guía interna y trocar
# --------------------------------------------------------------------------

def camisa_trocar(slug, nombre, medidas):
    """
    Camisa de protección de partes blandas (Ø 8 / 6 mm), con la guía de broca
    interna (dorada) y el trocar que la asienta sobre el hueso. El trocar se
    desliza: sale 6 mm por la punta en reposo y se retira para pasar la broca.
    """
    raiz = vacio('instrumento')
    L = 96.0
    # Camisa exterior: tubo con dientes en la boca y un mango moleteado arriba
    c = bmesh.new()
    tubo(c, 0.0, L - 28.0, 4.0, 3.1)
    for i in range(8):  # los dientes de la boca, que agarran los tejidos
        a = 2 * pi * i / 8
        torno(c, [(0, 0.5), (0, 0.5), (-1.6, 0.05)], 6, Matrix.Translation((3.55 * cos(a), 3.55 * sin(a), 0.5)), tapas=False)
    torno(c, [(L - 28.0, 3.4), (L - 28.0, 6.5), (L - 24.0, 8.0), (L - 22.0, 8.0)], 28)
    estrias_rectas(c, L - 22.0, L - 4.0, 8.0, 14, 0.35, 3)
    torno(c, [(L - 4.0, 8.0), (L - 1.0, 7.0), (L, 5.0), (L, 3.2)], 28, tapas=False)
    bisel(c, 0.08, 1, 55)
    malla('camisa_exterior', c, 'acero_cepillado', raiz, angulo=48)
    # Guía interna dorada, con su cabeza
    g = bmesh.new()
    tubo(g, 2.0, L + 6.0, 3.0, 2.0)
    torno(g, [(L + 6.0, 2.0), (L + 6.0, 6.0), (L + 9.0, 8.5), (L + 16.0, 8.5), (L + 19.0, 7.0), (L + 19.0, 2.0)], 28, tapas=False)
    bisel(g, 0.08, 1, 55)
    malla('guia_interna', g, 'dorado_anodizado', raiz, angulo=48)
    # Trocar: varilla de punta triangular y perilla; sale por la punta en reposo
    declarar_articulacion('Trocar', 'Retirar el trocar', 0.0, 30.0, 'mm', 0.0)
    tr = deslizador('trocar', raiz, (0, 0, 0), 'Trocar', (0, 0, 1), 1.0)
    t = bmesh.new()
    torno(t, [(-6.0, 0.05), (-3.0, 1.0), (0.0, 1.9)], 3, tapas=False)       # punta de tres facetas
    cilindro(t, (0, 0, 0), (0, 0, L + 38.0), 1.9, 1.9, 20)
    torno(t, [(L + 38.0, 1.9), (L + 38.0, 11.0), (L + 41.0, 12.0), (L + 52.0, 12.0), (L + 55.0, 10.0), (L + 55.0, 0.05)], 32)
    estrias_rectas(t, L + 41.0, L + 52.0, 12.0, 20, 0.5, 3)
    bisel(t, 0.08, 1, 55)
    malla('trocar', t, 'acero_pulido', tr, angulo=45)
    pe = bmesh.new()
    torno(pe, [(L + 38.0, 5.0), (L + 38.0, 11.2), (L + 40.0, 11.8)], 32, tapas=False)
    malla('collarin_trocar', pe, 'negro_anodizado', tr)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Medidor de profundidad
# --------------------------------------------------------------------------

def medidor_profundidad(slug, nombre, maximo, medidas):
    """
    Medidor de profundidad AO: una vaina con una varilla de gancho que se
    desliza. El gancho se pasa detrás de la cortical lejana y la vaina, apoyada
    en la cercana, lee en la escala la longitud del tornillo. La varilla se
    desliza de 0 a `maximo` mm.
    """
    raiz = vacio('instrumento')
    L = 150.0
    # Vaina (tubo) y cuerpo con ventana de lectura
    v = bmesh.new()
    tubo(v, 0.0, 78.0, 2.9, 1.5, 24)
    torno(v, [(78.0, 2.9), (78.0, 4.5), (84.0, 7.5), (88.0, 8.0), (L - 32.0, 8.0), (L - 28.0, 6.4)], 28)
    bisel(v, 0.08, 1, 55)
    malla('vaina', v, 'acero_cepillado', raiz, angulo=48)
    # El cuerpo de agarre, moleteado
    m = bmesh.new()
    estrias_rectas(m, L - 70.0, L - 30.0, 8.2, 12, 0.5, 3)
    torno(m, [(L - 30.0, 8.2), (L - 28.0, 7.0), (L - 14.0, 6.0), (L, 6.0), (L, 3.0), (L - 14.0, 3.0)], 28, tapas=False)
    bisel(m, 0.08, 1, 55)
    malla('agarre', m, 'acero', raiz, angulo=48)
    # Varilla y gancho, que salen por la punta y se deslizan hacia abajo al medir
    declarar_articulacion('Medicion', 'Sacar el gancho', 0.0, maximo, 'mm', 0.0)
    sl = deslizador('varilla', raiz, (0, 0, 0), 'Medicion', (0, 0, -1), 1.0)
    r = bmesh.new()
    cilindro(r, (0, 0, 1.0), (0, 0, L - 6.0), 1.0, 1.0, 14)
    # gancho: el último tramo se dobla 90° hacia +X y acaba afilado
    camino = [(0, 0, 3.0), (0, 0, 0.8), (0.9, 0, -0.6), (2.2, 0, -1.2), (3.6, 0, -1.2)]
    barrido(r, camino, circulo(1.0, 10), escala=lambda t: 1.0 - 0.3 * t)
    bisel(r, 0.05, 1, 55)
    malla('varilla', r, 'acero_pulido', sl)
    # La escala grabada en la varilla, cada 2 mm, con una marca larga cada 10 mm (legible por la ventana)
    e = bmesh.new()
    for i in range(0, int(maximo / 2) + 1):
        z = 90.0 + i * 1.0
        larga = (i % 5 == 0)
        caja(e, (1.05, 0, z), (0.1, 1.2 if larga else 0.8, 0.2))
    malla('escala', e, 'negro_mate', sl)
    # La ventana de lectura (oscura) y el rótulo de numerales
    w = bmesh.new()
    caja(w, (8.0, 0, 110.0), (0.2, 3.0, 36.0))
    malla('ventana', w, 'acero_oscuro', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Limitador de torque
# --------------------------------------------------------------------------

def limitador_torque(slug, nombre, nm, color, medidas):
    """
    Limitador de torque dinámico: el mango se desliza sobre el acople sin
    transmitir más de `nm` N·m, para no barrer la rosca de una placa bloqueada.
    El anillo de color indica el valor.
    """
    raiz = vacio('instrumento')
    L = 150.0
    pv = pivote('giro_limitador', raiz, (0, 0, 0), 'Giro', (0, 0, 1), 1.0)
    declarar_articulacion('Giro', 'Girar el mango', 0.0, 360.0, '°', 0.0)
    a = bmesh.new()
    cilindro(a, (0, 0, 0), (0, 0, 14.0), 3.2, 3.2, 20)
    # el acople hembra AO: un cilindro con un corte plano visible
    caja(a, (0, 2.5, 7.0), (2.4, 1.4, 6.0))
    torno(a, [(14.0, 3.2), (14.0, 5.2), (34.0, 6.0), (38.0, 9.5)], 28)
    bisel(a, 0.1, 1, 55)
    malla('acople', a, 'acero_pulido', pv)
    c = bmesh.new()
    torno(c, [(38.0, 9.5), (38.0, 15.0), (44.0, 16.0), (62.0, 16.0)], 36)
    bisel(c, 0.1, 1, 55)
    malla('cuerpo', c, 'acero_cepillado', pv, angulo=48)
    anillo = bmesh.new()
    torno(anillo, [(62.0, 16.04), (70.0, 16.04)], 36, tapas=False)
    torno(anillo, [(62.0, 16.04), (62.0, 16.5), (70.0, 16.5), (70.0, 16.04)], 36, tapas=False)
    malla('anillo_valor', anillo, color, pv)
    g = bmesh.new()
    estrias_rectas(g, 70.0, L - 16.0, 16.5, 20, 0.55, 3)
    torno(g, [(L - 16.0, 16.5), (L - 8.0, 15.0), (L - 2.0, 11.0), (L, 7.0), (L, 0.05)], 36)
    torno(g, [(70.0, 16.0), (70.0, 16.5)], 36, tapas=False)
    bisel(g, 0.12, 1, 55)
    malla('mango', g, 'negro_goma', pv, angulo=48)
    # La tapa con el valor, en un disco de otro color
    tp = bmesh.new()
    torno(tp, [(L - 2.0, 9.0), (L + 0.3, 9.0), (L + 0.3, 0.05)], 28, tapas=False)
    malla('tapa', tp, color, pv)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Machuelo
# --------------------------------------------------------------------------

def machuelo(slug, nombre, d_mayor, d_nucleo, paso, largo, medidas):
    """
    Machuelo (tap): abre la rosca del hueso cortical denso antes del tornillo.
    Rosca helicoidal de verdad, tres acanaladuras que sacan la viruta y una
    entrada cónica; vástago con acople rápido.
    """
    raiz = vacio('instrumento')
    R, r = d_mayor / 2, d_nucleo / 2
    lt = 24.0
    bm = bmesh.new()

    def fr(z, th):
        fase = ((z - 0.0) / paso - th / (2 * pi)) % 1.0
        t = abs(fase - 0.5) * 2
        f = 1.0 - min(1.0, t / 0.55) if t < 0.55 else 0.0
        # entrada cónica: la rosca crece en los primeros 4 pasos
        cono = min(1.0, 0.25 + z / (paso * 4.0))
        rad = r + (R - r) * f * cono
        # tres acanaladuras
        ang = (th * 3 / (2 * pi)) % 1.0
        if abs(ang - 0.5) < 0.09:
            rad = min(rad, r * 0.82)
        return rad * (1.0 if z > 0.6 else 0.7 + 0.3 * z / 0.6)
    campo(bm, 0.0, lt, fr, int(lt / paso * 8), 30)
    rs = max(2.0, R * 0.9)
    torno(bm, [(lt, r * 0.95), (lt + 2.0, rs * 0.95)], 24, tapas=False)
    cilindro(bm, (0, 0, lt + 2.0), (0, 0, largo - 16.0), rs * 0.95, rs * 0.95, 24, tapas=False)
    acople_ao(bm, largo - 16.0, rs * 0.95, 16.0)
    bisel(bm, 0.04, 1, 60)
    malla('machuelo', bm, 'acero_oscuro', raiz, angulo=55)
    b = bmesh.new()
    bandas(b, [largo - 26.0], rs * 0.95, 3.0)
    malla('banda', b, 'dorado_anodizado', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Avellanador
# --------------------------------------------------------------------------

def avellanador(slug, nombre, d_cabeza, largo, medidas):
    """
    Avellanador (countersink): cabeza cónica con cinco filos y una guía piloto,
    que talla el lecho de la cabeza del tornillo en la primera cortical.
    """
    raiz = vacio('instrumento')
    R = d_cabeza / 2
    bm = bmesh.new()

    def fr(z, th):
        if z < 3.0:
            base = 1.2
        elif z < 3.0 + (R - 1.2):
            base = 1.2 + (z - 3.0)
        else:
            base = R
        ang = (th * 5 / (2 * pi)) % 1.0
        hueco = abs(ang - 0.5) < 0.16 and z > 3.0
        return base * (0.55 if hueco else 1.0)
    campo(bm, 0.0, 3.0 + (R - 1.2) + 3.0, fr, 36, 40)
    zc = 3.0 + (R - 1.2) + 3.0
    torno(bm, [(zc, R * 0.55), (zc + 3.0, 2.2)], 24, tapas=False)
    cilindro(bm, (0, 0, zc + 3.0), (0, 0, largo - 16.0), 2.2, 2.2, 24, tapas=False)
    acople_ao(bm, largo - 16.0, 2.2, 16.0)
    bisel(bm, 0.04, 1, 60)
    malla('avellanador', bm, 'acero_pulido', raiz, angulo=55)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Aguja de Kirschner
# --------------------------------------------------------------------------

def kirschner(slug, nombre, d, largo, medidas):
    """Aguja de Kirschner: varilla lisa de acero con punta de trocar de tres facetas."""
    raiz = vacio('instrumento')
    r = d / 2
    bm = bmesh.new()
    torno(bm, [(0.0, 0.01), (d * 2.6, r)], 3, tapas=False)          # tres facetas
    torno(bm, [(d * 2.6, r), (d * 2.6, r)], 12, tapas=False)
    cilindro(bm, (0, 0, d * 2.6), (0, 0, largo), r, r, 14)
    bisel(bm, 0.02, 1, 60)
    malla('aguja', bm, 'acero_pulido', raiz, angulo=60)
    # marcas de profundidad cada 10 mm
    m = bmesh.new()
    bandas(m, [float(z) for z in range(20, int(largo) - 10, 10)], r, 0.4, seg=14)
    malla('marcas', m, 'acero_oscuro', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Motor quirúrgico
# --------------------------------------------------------------------------

def motor(slug, nombre, medidas):
    """
    Motor quirúrgico a batería, de cuerpo de pistola, con el mandril de acople
    rápido AO. El gatillo se pulsa y el mandril gira. De pie sobre el mandril.
    """
    raiz = vacio('instrumento')
    declarar_articulacion('Gatillo', 'Pulsar el gatillo', 0.0, 14.0, '°', 0.0)
    declarar_articulacion('Mandril', 'Girar el mandril', 0.0, 360.0, '°', 0.0)
    # Mandril giratorio (en el origen): manguito con collarín moleteado y acople
    mand = pivote('mandril', raiz, (0, 0, 0), 'Mandril', (0, 0, 1), 1.0)
    m = bmesh.new()
    torno(m, [(0.0, 4.2), (0.0, 7.0), (4.0, 7.0), (6.0, 8.0), (14.0, 8.0)], 28)
    estrias_rectas(m, 14.0, 32.0, 9.0, 16, 0.5, 3)
    torno(m, [(32.0, 9.0), (34.0, 8.0), (36.0, 7.0)], 28, tapas=False)
    bisel(m, 0.08, 1, 55)
    malla('portabrocas', m, 'acero_cepillado', mand, angulo=48)
    # Cuello y morro del cuerpo
    c = bmesh.new()
    torno(c, [(36.0, 7.0), (36.0, 11.0), (44.0, 14.0), (56.0, 20.0), (62.0, 22.5), (70.0, 23.0)], 36, tapas=False)
    bisel(c, 0.1, 1, 55)
    malla('morro', c, 'gris_claro', raiz, angulo=48)
    # Cuerpo principal (gris) con el anillo de color del fabricante
    k = bmesh.new()
    torno(k, [(70.0, 23.0), (70.0, 24.0), (150.0, 24.0), (160.0, 22.0), (166.0, 18.0), (166.0, 0.05)], 40)
    bisel(k, 0.15, 1, 55)
    malla('cuerpo', k, 'gris_plastico', raiz, angulo=48)
    an = bmesh.new()
    torno(an, [(68.0, 23.6), (68.0, 24.4), (74.0, 24.4), (74.0, 23.6)], 40, tapas=False)
    malla('anillo_marca', an, 'naranja', raiz)
    # Empuñadura: un cilindro inclinado hacia fuera, de goma, y la batería
    asa = bmesh.new()
    p0 = Vector((18.0, 0.0, 128.0))
    p1 = Vector((48.0, 0.0, 128.0 + 80.0))
    torno(asa, [(0.0, 16.0), (8.0, 19.0), ((p1 - p0).length - 6.0, 19.0), ((p1 - p0).length, 17.0)], 32, colocar(p0, p1), tapas=False)
    estrias_rectas(asa, 20.0, (p1 - p0).length - 20.0, 19.2, 18, 0.25, 3, M=colocar(p0, p1))
    bisel(asa, 0.1, 1, 55)
    malla('empunadura', asa, 'negro_goma', raiz, angulo=55)
    bat = bmesh.new()
    caja(bat, (0, 0, 0), (50.0, 42.0, 56.0), Matrix.Translation(p1 + Vector((8.0, 0.0, 24.0))) @ Matrix.Rotation(-0.28, 4, 'Y'))
    bisel(bat, 1.2, 3, 35)
    malla('bateria', bat, 'negro_mate', raiz, angulo=55)
    led = bmesh.new()
    caja(led, (0, 0, 0), (2.0, 10.0, 3.0), Matrix.Translation(p1 + Vector((8.0 - 25.5, 0.0, 24.0))) @ Matrix.Rotation(-0.28, 4, 'Y'))
    malla('luz_bateria', led, 'verde_anodizado', raiz)
    # Gatillo: una pala que gira sobre un pasador, en el frente de la empuñadura (hacia la punta)
    gt = pivote('gatillo', raiz, (22.0, 0.0, 128.0), 'Gatillo', (0, 1, 0), -1.0)
    t = bmesh.new()
    prisma_plano(t, [(0.0, 0.0), (-4.0, -26.0), (-9.0, -34.0), (-11.0, -26.0), (-4.0, 4.0)], -6.0, 6.0)
    bisel(t, 0.6, 2, 35)
    malla('gatillo', t, 'negro_anodizado', gt, angulo=55)
    pas = bmesh.new()
    cilindro(pas, (0, -7.0, 0), (0, 7.0, 0), 1.6, 1.6, 12)
    malla('pasador_gatillo', pas, 'acero_pulido', gt)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz

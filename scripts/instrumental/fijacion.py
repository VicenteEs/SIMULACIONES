"""
Instrumental de fijación de revolución: brocas, guías de broca, camisas,
medidor de profundidad, destornilladores, limitador de torque, machuelo,
avellanador, aguja de Kirschner.

Todos de pie, con la punta en el origen y el mango arriba (+Z), y el vástago
terminado en el acople rápido AO cuando lo lleva. Las medidas son las del
documento del traumatólogo (sistemas AO/ASIF: 2,0 / 2,4, 3,5 y 4,5 mm); donde
el documento da un rango, se toma el valor habitual.
"""

from lib import *
from detalles import *
from math import pi, sin, cos, radians, tan, sqrt

# Colores de referencia de cada sistema, por el diámetro de la broca. Son una
# convención de este manual para distinguirlos en pantalla, no un código
# oficial del fabricante.
COLOR_SISTEMA = {'mini': 'rojo_anodizado', 'pequeno': 'dorado_anodizado', 'grande': 'azul_anodizado', 'esponjosa': 'verde_anodizado'}


# --------------------------------------------------------------------------
# Broca
# --------------------------------------------------------------------------

def broca(slug, nombre, d, largo, lf, sistema, medidas, desde_mm=None):
    """
    Broca helicoidal AO: punta de 118° con dos filos, hélice, cuello, vástago
    liso con marcas láser de profundidad y acople rápido.
    `d` es el diámetro, `largo` el total y `lf` lo que miden las acanaladuras.
    """
    raiz = vacio('instrumento')
    R = d / 2
    rs = max(1.9, R * 0.95)  # vástago, nunca más delgado que el acople
    bm = bmesh.new()
    h_punta = R / tan(radians(59))
    nucleo = R * 0.40

    def fr(z, th):
        # El cono de la punta: el radio crece hasta R en `h_punta`.
        cono = min(1.0, max(0.04, z / h_punta))
        fase = (th * 2 / (2 * pi) - 2.15 * 2 * (z / lf) * 1.0) % 1.0
        v = abs(fase - 0.5) * 2
        tapa = 0.40
        rad = R if v < tapa else R - (R - nucleo) * min(1.0, (v - tapa) / (1 - tapa) * 1.7)
        return rad * cono if z < h_punta else rad
    campo(bm, 0.0, lf, fr, 70, 32)
    torno(bm, [(lf, R * 0.97), (lf + 1.2, rs * 0.92)], 32, tapas=False)
    cilindro(bm, (0, 0, lf + 1.2), (0, 0, largo - 16.0), rs * 0.92, rs * 0.92, 32, tapas=False)
    # el hombro entre el cuerpo y el vástago, para que no sea un escalón
    torno(bm, [(lf + 1.0, R * 0.98), (lf + 1.9, rs * 0.93)], 32, tapas=False)
    acople_ao(bm, largo - 16.0, rs, 16.0)
    bisel(bm, 0.05, 1, 60)
    malla('broca', bm, 'acero_pulido', raiz, angulo=48)

    # Marcas láser, cada 10 mm desde donde acaba la hélice
    bm = bmesh.new()
    zs = [z for z in range(int(lf) + 6, int(largo - 20), 10)]
    bandas(bm, zs, rs * 0.92, 0.9)
    malla('marcas', bm, 'acero_oscuro', raiz)
    # Banda de color del sistema, junto al acople
    bm = bmesh.new()
    torno(bm, [(largo - 22.0, rs * 0.92 + 0.02), (largo - 19.0, rs * 0.92 + 0.02)], 32, tapas=False)
    malla('banda_sistema', bm, COLOR_SISTEMA[sistema], raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Guías de broca
# --------------------------------------------------------------------------

def guia_doble(slug, nombre, od, ido, largo, medidas):
    """
    Guía de broca doble (DCP / LC-DCP): una barra con dos extremos distintos.
    El extremo neutro (verde) tiene el orificio centrado; el excéntrico (dorado)
    lo tiene desplazado hacia un lado, para que el tornillo comprima el trazo
    al apretarse.
    """
    raiz = vacio('instrumento')
    # Cuerpo central con moleteado
    cuerpo = bmesh.new()
    zc0, zc1 = largo * 0.30, largo * 0.70
    estrias_rectas(cuerpo, zc0, zc1, od * 0.78, 14, 0.35, 3)
    cilindro(cuerpo, (0, 0, zc0 - 3.2), (0, 0, zc0), od * 0.62, od * 0.78, 28)
    cilindro(cuerpo, (0, 0, zc1), (0, 0, zc1 + 3.2), od * 0.78, od * 0.62, 28)
    bisel(cuerpo, 0.12, 1, 45)
    malla('cuerpo', cuerpo, 'acero_cepillado', raiz)
    # Extremo neutro (abajo, en el origen)
    n = bmesh.new()
    torno(n, [(0, od * 0.30), (0, od * 0.46), (largo * 0.12, od * 0.46), (largo * 0.12, od * 0.56), (zc0 - 3.2, od * 0.56), (zc0 - 3.2, od * 0.62)], 32)
    bisel(n, 0.08, 1, 60)
    malla('extremo_neutro', n, 'verde_anodizado', raiz)
    # Orificio visto desde abajo: un disco oscuro hundido
    h = bmesh.new()
    cilindro(h, (0, 0, -0.02), (0, 0, 0.5), ido / 2, ido / 2, 24)
    malla('orificio_neutro', h, 'negro_mate', raiz)
    # Extremo excéntrico (arriba): el orificio no está en el eje
    e = bmesh.new()
    torno(e, [(zc1 + 3.2, od * 0.62), (zc1 + 3.2, od * 0.56), (largo * 0.88, od * 0.56), (largo * 0.88, od * 0.46), (largo, od * 0.46), (largo, od * 0.30)], 32)
    bisel(e, 0.08, 1, 60)
    malla('extremo_excentrico', e, 'dorado_anodizado', raiz)
    h = bmesh.new()
    cilindro(h, (od * 0.17, 0, largo - 0.5), (od * 0.17, 0, largo + 0.02), ido / 2, ido / 2, 24)
    malla('orificio_excentrico', h, 'negro_mate', raiz)
    # La flecha grabada que indica el sentido de la compresión
    f = bmesh.new()
    prisma_plano(f, [(-0.9, 0), (0.9, 0), (0.9, 1.8), (2.1, 1.8), (0, 4.2), (-2.1, 1.8), (-0.9, 1.8)], od * 0.47 - 0.0, od * 0.47 + 0.12)
    malla('flecha', f, 'acero_oscuro', raiz, loc=(0, 0, largo * 0.915))
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


def guia_roscada(slug, nombre, od, ido, largo, paso, medidas):
    """Guía de broca roscada para placas bloqueadas (LCP): se enrosca en el orificio cónico de la placa."""
    raiz = vacio('instrumento')
    bm = bmesh.new()
    lr = largo * 0.16
    rosca(bm, 0.0, lr, od * 0.34, od * 0.50, paso, 28)
    cilindro(bm, (0, 0, lr), (0, 0, lr + 2.0), od * 0.48, od * 0.62, 28)          # cono de asiento
    cilindro(bm, (0, 0, lr + 2.0), (0, 0, largo * 0.62), od * 0.62, od * 0.62, 28)
    cilindro(bm, (0, 0, largo * 0.62), (0, 0, largo * 0.66), od * 0.62, od * 1.12, 28)
    estrias_rectas(bm, largo * 0.66, largo * 0.97, od * 1.12, 18, 0.4, 3)
    cilindro(bm, (0, 0, largo * 0.97), (0, 0, largo), od * 1.12, od * 0.90, 28)
    bisel(bm, 0.1, 1, 45)
    malla('guia', bm, 'acero_cepillado', raiz)
    c = bmesh.new()
    torno(c, [(largo * 0.60, od * 0.66), (largo * 0.60 + 3.5, od * 0.66)], 28, tapas=False)
    malla('anillo_color', c, 'dorado_anodizado', raiz)
    o = bmesh.new()
    cilindro(o, (0, 0, largo - 0.4), (0, 0, largo + 0.02), ido / 2, ido / 2, 20)
    malla('orificio', o, 'negro_mate', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Destornilladores
# --------------------------------------------------------------------------

def destornillador(slug, nombre, punta, largo, vastago_r, color_anillo, medidas, en_t=False, af=2.5, d_torx=3.0):
    """
    Destornillador: punta hexagonal o Stardrive, vástago, mango moleteado.
    Con `en_t` el mango es una barra transversal (el de «mango en T»).
    """
    raiz = vacio('instrumento')
    pv = pivote('giro_destornillador', raiz, (0, 0, 0), 'Giro', (0, 0, 1), 1.0)
    bm = bmesh.new()
    lp = 9.0
    if punta == 'hex':
        # El hexágono sale de la punta con una pequeña entrada cónica
        hexagono(bm, 0.0, lp, af)
    else:
        estrella(bm, 0.0, lp, d_torx)
    cilindro(bm, (0, 0, lp), (0, 0, lp + 3.0), (af if punta == 'hex' else d_torx) * 0.62, vastago_r, 20)
    zm = largo * 0.50 if not en_t else largo - 36.0
    cilindro(bm, (0, 0, lp + 3.0), (0, 0, zm), vastago_r, vastago_r, 24)
    bisel(bm, 0.05, 1, 55)
    malla('vastago', bm, 'acero_pulido', pv)
    # Mango
    m = bmesh.new()
    if not en_t:
        r = 9.5
        torno(m, [(zm, vastago_r + 0.6), (zm, r * 0.66), (zm + 3.0, r * 0.9), (zm + 6.0, r)], 36)
        estrias_rectas(m, zm + 6.0, largo - 8.0, r, 12, 0.6, 3)
        torno(m, [(largo - 8.0, r), (largo - 3.0, r * 0.82), (largo, r * 0.55), (largo, 0.05)], 36)
    else:
        torno(m, [(zm, vastago_r + 0.5), (zm, 7.0), (zm + 6.0, 7.5), (largo - 8.0, 8.5), (largo - 3.0, 7.0), (largo, 5.5), (largo, 0.05)], 36)
        # La barra transversal del mango en T (a lo largo de X), con ranuras
        zt = largo - 12.0
        estrias_rectas(m, -50.0, 50.0, 7.0, 10, 0.5, 3, M=Matrix.Translation((0, 0, zt)) @ Matrix.Rotation(pi / 2, 4, 'Y'))
        torno(m, [(-50.0, 7.0), (-52.5, 5.5), (-53.5, 0.05)], 30, Matrix.Translation((0, 0, zt)) @ Matrix.Rotation(pi / 2, 4, 'Y'))
        torno(m, [(50.0, 7.0), (52.5, 5.5), (53.5, 0.05)], 30, Matrix.Translation((0, 0, zt)) @ Matrix.Rotation(pi / 2, 4, 'Y'))
    bisel(m, 0.1, 1, 50)
    malla('mango', m, 'negro_anodizado', pv, angulo=48)
    # Anillo de color del sistema
    a = bmesh.new()
    za = zm + 1.0 if not en_t else zm + 2.0
    torno(a, [(za, (9.5 if not en_t else 7.2) * 0.98), (za + 2.6, (9.5 if not en_t else 7.2) * 1.0)], 36, tapas=False)
    malla('anillo_color', a, color_anillo, pv)
    # Un destornillador gira sobre su eje: el simulador lo usa al apretar un tornillo
    declarar_articulacion('Giro', 'Atornillar', 0.0, 360.0, '°', 0.0)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz

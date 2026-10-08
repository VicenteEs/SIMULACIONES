"""
Detalles de fabricación que se repiten en muchos instrumentos: roscas y
estrías helicoidales, mangos moleteados, acoples rápidos AO, puntas hexagonales
y Stardrive, marcas de profundidad.

Todo es geometría de revolución o barrido, sobre el eje +Z local, con el
origen en el extremo de trabajo (la punta) salvo que se diga otra cosa.
"""

from lib import *
from lib import _unir, _tapa, _anillo
from math import pi, sin, cos, radians, sqrt


def campo(bm, z0, z1, fr, pasos_z, seg, M=I4, tapas=True):
    """
    Superficie de revolución con un radio que depende de la altura y del
    ángulo: `fr(z, theta) -> r`. Con ello salen, con la misma función, las
    roscas (el radio sube y baja siguiendo una hélice), las acanaladuras
    rectas del moleteado y las espirales de una broca.
    """
    anillos = []
    for k in range(pasos_z + 1):
        z = z0 + (z1 - z0) * k / pasos_z
        anillos.append(_anillo_polar(bm, M, z, seg, fr))
    for k in range(pasos_z):
        _unir(bm, anillos[k], anillos[k + 1])
    if tapas:
        _tapa(bm, anillos[0], invertir=True)
        _tapa(bm, anillos[-1])
    return anillos


def _anillo_polar(bm, M, z, seg, fr):
    pts = []
    for i in range(seg):
        th = 2 * pi * i / seg
        r = max(0.02, fr(z, th))
        pts.append((r * cos(th), r * sin(th), z))
    return [bm.verts.new(M @ Vector(p)) for p in pts]


def rosca(bm, z0, z1, r_menor, r_mayor, paso, seg=36, M=I4, mano=1, flancos=0.5):
    """Hélice de sección triangular: la rosca de un machuelo, un tornillo o una guía roscada."""
    n = max(8, int((z1 - z0) / paso * 9))

    def fr(z, th):
        fase = ((z - z0) / paso - mano * th / (2 * pi)) % 1.0
        # perfil triangular con meseta: sube en `flancos` y baja en `flancos`
        t = abs(fase - 0.5) * 2  # 0 en la cresta, 1 en el valle
        f = 1.0 - min(1.0, t / flancos) if t < flancos else 0.0
        return r_menor + (r_mayor - r_menor) * f
    return campo(bm, z0, z1, fr, n, seg, M)


def estrias_rectas(bm, z0, z1, r, n, prof, seg_por_estria=4, pasos=1, M=I4):
    """Cilindro con n acanaladuras rectas: el moleteado grueso de un mango."""
    seg = n * seg_por_estria

    def fr(z, th):
        u = (th * n / (2 * pi)) % 1.0
        # cresta plana y valle triangular
        v = abs(u - 0.5) * 2
        return r - prof * (1.0 - min(1.0, v / 0.55)) ** 1.0 if v < 0.55 else r
    return campo(bm, z0, z1, fr, pasos, seg, M)


def helice_filos(bm, z0, z1, R, nucleo, filos, vueltas, seg=32, pasos=60, M=I4):
    """
    Sección de una broca: n filos que dan vueltas a lo largo del eje. El radio
    es R sobre el filo y se hunde hacia `nucleo` en la acanaladura.
    """
    def fr(z, th):
        fase = (th * filos / (2 * pi) - vueltas * filos * (z - z0) / max(1e-6, (z1 - z0))) % 1.0
        v = abs(fase - 0.5) * 2  # 0 en el filo (centro), 1 en el hueco
        tapa = 0.42
        if v < tapa:
            return R
        k = (v - tapa) / (1 - tapa)
        return R - (R - nucleo) * min(1.0, k * 1.6)
    return campo(bm, z0, z1, fr, pasos, seg, M)


def hexagono(bm, z0, z1, entre_caras, M=I4):
    """Prisma hexagonal: el vástago de un destornillador hexagonal."""
    r = entre_caras / sqrt(3)
    cont = [(r * cos(pi / 6 + i * pi / 3), r * sin(pi / 6 + i * pi / 3)) for i in range(6)]
    prisma(bm, cont, z0, z1, M)


def estrella(bm, z0, z1, d, lobulos=6, M=I4, seg=48):
    """Sección Stardrive/Torx: lóbulos redondeados, d es el diámetro exterior."""
    ro, ri = d / 2, d / 2 * 0.76

    def fr(z, th):
        return ri + (ro - ri) * (0.5 + 0.5 * cos(lobulos * th)) ** 0.7
    campo(bm, z0, z1, fr, 1, seg, M)


def bandas(bm, zs, r, ancho=0.7, M=I4, seg=24):
    """Anillos finos (marcas láser de profundidad): sobresalen una centésima para que se vean."""
    for z in zs:
        torno(bm, [(z, r + 0.02), (z + ancho, r + 0.02)], seg, M, tapas=False)


def acople_ao(bm, z0, r=1.9, largo=16.0, M=I4):
    """
    Acople rápido AO: un vástago con una garganta, un corte plano y una punta
    ligeramente achaflanada. Desde `z0` hacia +Z.
    """
    perfil = [(0, r * 0.82), (0.5, r), (largo * 0.26, r), (largo * 0.28, r * 0.80), (largo * 0.46, r * 0.80), (largo * 0.48, r),
              (largo * 0.80, r), (largo, r)]
    torno(bm, [(z0 + h, rr) for h, rr in perfil], 20, M)
    # el corte plano, que se lee como un chaflán más oscuro
    caja(bm, (r * 0.78, 0, z0 + largo * 0.62), (r * 0.5, r * 1.2, largo * 0.30), M)


def curva_bezier(p0, p1, p2, p3, n=24):
    pts = []
    for i in range(n + 1):
        t = i / n
        a = (1 - t) ** 3
        b = 3 * (1 - t) ** 2 * t
        c = 3 * (1 - t) * t * t
        d = t ** 3
        pts.append(Vector((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2])))
    return pts


def regla(bm, z0, z1, paso, r, largo_x, ancho_y, M=I4, cada=5):
    """Escala graduada: marcas finas cada `paso`, más largas cada `cada` marcas."""
    n = int(round((z1 - z0) / paso))
    for i in range(n + 1):
        z = z0 + i * paso
        caja(bm, (r + 0.02, 0, z), (0.06, ancho_y * (1.0 if i % cada == 0 else 0.5), 0.26 if i % cada else 0.4), M)

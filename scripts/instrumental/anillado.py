"""
Instrumentos de dos ramas cruzadas con argollas: tijeras, portaagujas, pinzas
de reducción, separadores autoestáticos, alicates.

Todos comparten la misma anatomía: dos ramas planas que se cruzan en un tornillo
(el pivote), una parte distal que trabaja (hoja, mandíbula, garra) y una parte
proximal que acaba en una argolla por donde entra el dedo. Hacerlo una vez, con
parámetros, evita repetir cien líneas por instrumento y asegura que todos giren
igual: sobre el eje del tornillo, con la rama A hacia un lado y la B hacia el
otro.

Convenio de lados (los de Blender, antes de pasar a glTF):

- El instrumento está «de pie»: punta en z = 0, argollas arriba.
- Se abre en X y el tornillo apunta a Y.
- La rama A tiene su parte distal en +X y su argolla en −X (se cruzan).
- La rama A ocupa y ∈ [0, t]; la B, y ∈ [−t, 0].
"""

import math
from math import pi, sin, cos
from lib import *


def interp(tabla, z):
    """Interpolación lineal en una tabla [(z, valor), ...] ordenada por z."""
    if z <= tabla[0][0]:
        return tabla[0][1]
    for (z0, v0), (z1, v1) in zip(tabla, tabla[1:]):
        if z <= z1:
            return v0 + (v1 - v0) * (z - z0) / max(1e-9, z1 - z0)
    return tabla[-1][1]


def suave(s):
    s = max(0.0, min(1.0, s))
    return s * s * (3 - 2 * s)


def por_omision(**kw):
    P = dict(
        espesor=2.4,          # grosor de cada rama (mm, en Y)
        pivote_z=60.0,        # altura del tornillo
        union_z=118.0,        # donde la rama se encuentra con su argolla
        ancho_caña=5.0,       # ancho de la caña entre el tornillo y la argolla
        talon=4.4,            # cuánto cruza la rama la línea media en el tornillo
        argolla_a=11.5,       # semieje X de la argolla
        argolla_b=17.0,       # semieje Z de la argolla
        argolla_grosor=3.2,   # lo que mide el aro en su plano
        argolla_fondo=3.4,    # lo que mide el aro hacia fuera del plano
        argolla_holgura=1.2,  # separación entre las dos argollas, cerradas
        hoja=[(0.0, 0.9), (30.0, 3.0), (60.0, 6.0)],  # (z, ancho) de la parte distal
        borde_interior=None,  # [(z, x)] si el borde interior no es recto
        acero_distal='acero_pulido',
        acero_mango='acero',
        argolla_mat=None,     # p. ej. 'dorado_anodizado' en los portaagujas de carburo
        crec=0.28,            # bisel de las aristas
        cremallera=None,      # (z0, z1, paso) para pinzas con trinquete
        apoyo_dedo=False,     # el espolón que descansa en el anular
        filo=False,           # chaflán de corte en el borde interior de la hoja
        filo_ancho=1.2,
        tornillo=True,
        radio_tornillo=3.4,
        apertura_max=40.0,
        apertura_etiqueta='Abrir',
        nombre_rama='rama',
        tapa_distal=None,     # z por debajo de la cual cambia el acabado (por omisión, el pivote)
        mango_goma=None,      # (largo, radio, material): empuñaduras de goma en lugar de argollas (alicates)
    )
    P.update(kw)
    return P


def anillo_x(P):
    return -(P['argolla_a'] + P['argolla_holgura'] / 2 + P['argolla_grosor'] / 2)


def caña(P, z):
    """Bordes (izquierdo, derecho) de la rama A a la altura z ≥ pivote."""
    pz, uz = P['pivote_z'], P['union_z']
    xi = (lambda zz: 0.0) if P['borde_interior'] is None else (lambda zz: interp(P['borde_interior'], zz))
    izq_pz = xi(pz) - P['talon']
    der_pz = xi(pz) + interp(P['hoja'], pz)
    cx_pz = (izq_pz + der_pz) / 2
    bw_pz = der_pz - izq_pz
    s = max(0.0, min(1.0, (z - pz) / (uz - pz)))
    cx = cx_pz + (anillo_x(P) - cx_pz) * (0.10 * s + 0.90 * suave(s * 1.05))
    bw = bw_pz + (P['ancho_caña'] - bw_pz) * suave(s * 2.2)
    return cx - bw / 2, cx + bw / 2


def contorno_rama(P):
    """
    Contorno (x, z) de la rama A, en coordenadas absolutas (z desde la punta).
    La rama B es el espejo en X. Sube por el borde exterior hasta la unión con la
    argolla y baja por el borde interior.

    La rama pasa por el tornillo: en el pivote su cuerpo cruza la línea media (el
    «talón»), y por eso las dos ramas se cruzan justo ahí y no más arriba. Una
    rama que sólo estuviera a un lado del tornillo no podría girar sobre él.
    """
    pz, uz = P['pivote_z'], P['union_z']
    xi = (lambda z: 0.0) if P['borde_interior'] is None else (lambda z: interp(P['borde_interior'], z))
    exterior, interior = [], []
    nz = 30
    for i in range(nz + 1):
        z = pz * i / nz
        w = interp(P['hoja'], z)
        k = suave((z - (pz - 22.0)) / 22.0)
        exterior.append((xi(z) + w, z))
        interior.append((xi(z) - P['talon'] * k, z))
    nprox = 24
    for k in range(1, nprox + 1):
        z = pz + (uz - pz) * k / nprox
        izq, der = caña(P, z)
        exterior.append((der, z))
        interior.append((izq, z))
    return exterior + interior[::-1]


def construir(slug, P, distal_extra=None):
    """
    Arma las dos ramas, los pivotes, el tornillo y las argollas. Devuelve la
    raíz. `distal_extra(bm, lado, P, y0, y1, pz)` añade a cada rama el detalle
    propio de su trabajo (dientes de pinza, garras de separador) en la misma malla.
    """
    raiz = vacio('instrumento')
    pz = P['pivote_z']
    t = P['espesor']
    declarar_articulacion('Apertura', P['apertura_etiqueta'], 0.0, P['apertura_max'], '°', 0.0)
    corte_z = (P['tapa_distal'] if P['tapa_distal'] is not None else pz) - pz

    for lado, nombre, y0, y1, factor in ((+1, 'a', 0.0, t, -0.5), (-1, 'b', -t, 0.0, +0.5)):
        pv = pivote('pivote_%s_%s' % (P['nombre_rama'], nombre), raiz, (0, 0, pz), 'Apertura', (0, 1, 0), factor)
        bm = bmesh.new()
        cont = [(x * lado, z - pz) for x, z in contorno_rama(P)]
        if lado < 0:
            cont = cont[::-1]
        prisma_plano(bm, cont, y0, y1)
        if P['cremallera'] is not None:
            cremallera(bm, P, lado, y0, y1, pz)
        if distal_extra is not None:
            distal_extra(bm, lado, P, y0, y1, pz)
        if P['filo']:
            _filo(bm, P, lado, y1 if lado > 0 else y0)
        bisel(bm, P['crec'], 1, 38)
        malla('rama_' + nombre, bm, [P['acero_distal'], P['acero_mango']], pv, indice=lambda c: 0 if c.z < corte_z else 1)
        ay = (y0 + y1) / 2
        if P['mango_goma']:
            # Empuñadura: un cilindro de goma que continúa la caña, con extremo redondeado
            largo, radio, mat_goma = P['mango_goma']
            cx = anillo_x(P) * lado
            zi = P['union_z'] - pz - 10.0
            g = bmesh.new()
            torno(g, [(0.0, radio * 0.7), (4.0, radio), (largo - 8.0, radio), (largo - 2.0, radio * 0.85), (largo, radio * 0.5), (largo, 0.05)], 28,
                  Matrix.Translation((cx, ay, zi)))
            bisel(g, 0.15, 1, 55)
            malla('empunadura_' + nombre, g, mat_goma, pv, angulo=50)
            continue
        # La argolla va en su propia malla para poder darle otro material (carburo = argollas doradas)
        bm2 = bmesh.new()
        argolla(bm2, (anillo_x(P) * lado, ay, P['union_z'] + P['argolla_b'] - 1.5 - pz), P['argolla_a'], P['argolla_b'],
                P['argolla_grosor'], P['argolla_fondo'], plano='xz', n=40)
        if P['apoyo_dedo'] and lado < 0:
            _apoyo(bm2, P, lado, ay, pz)
        bisel(bm2, 0.15, 1, 50)
        malla('argolla_' + nombre, bm2, P['argolla_mat'] or P['acero_mango'], pv)
    if P['tornillo']:
        bm = bmesh.new()
        r = P['radio_tornillo']
        # Cabeza redonda (+Y) y tuerca hexagonal (−Y), unidas por el vástago
        torno(bm, [(0, 0.01), (0, r), (0.35, r), (0.35, r * 0.96), (1.1, r * 0.9), (1.1, 0.01)], 28, colocar((0, t, pz), (0, t + 1.3, pz)))
        torno(bm, [(0, 0.01), (0, r * 0.95), (0.9, r * 0.95), (0.9, 0.01)], 6, colocar((0, -t, pz), (0, -t - 0.9, pz)))
        cilindro(bm, (0, -t, pz), (0, t, pz), r * 0.6, r * 0.6, 16)
        bisel(bm, 0.12, 1, 50)
        malla('tornillo', bm, 'acero_cepillado', raiz)
        # La ranura de la cabeza, de otro color para que se lea
        bm = bmesh.new()
        caja(bm, (0, t + 1.18, pz), (r * 1.55, 0.2, 0.55))
        malla('ranura', bm, 'acero_oscuro', raiz)
    return raiz


def _filo(bm, P, lado, ycara):
    """
    Afila el borde interior de la hoja con un chaflán en la cara exterior: así
    es como se ve una hoja de tijera real, y lo que da el brillo en línea que
    la distingue de una chapa plana.
    """
    pz = P['pivote_z']
    xi = (lambda z: 0.0) if P['borde_interior'] is None else (lambda z: interp(P['borde_interior'], z))
    bm.edges.ensure_lookup_table()
    sel = []
    for e in bm.edges:
        a, b = e.verts[0].co, e.verts[1].co
        if abs(a.y - ycara) < 1e-4 and abs(b.y - ycara) < 1e-4:
            zm = (a.z + b.z) / 2 + pz
            if P.get('filo_desde', 18.0) < zm < pz - 18.0 and abs(a.x - lado * xi(a.z + pz)) < 0.02 and abs(b.x - lado * xi(b.z + pz)) < 0.02:
                sel.append(e)
    if sel:
        bmesh.ops.bevel(bm, geom=sel, offset=P['filo_ancho'], segments=1, affect='EDGES', profile=0.5)


def cremallera(bm, P, lado, y0, y1, pz):
    """
    El trinquete: de cada caña nace un brazo hacia la línea media, con dientes de
    sierra en su canto superior. Los dos brazos se cruzan sobre la línea media
    (cada uno en la capa de su rama) y así, al cerrar, un diente engancha en otro.
    """
    z0, z1, paso = P['cremallera']
    izq, der = caña(P, (z0 + z1) / 2)
    base = der + 0.4      # el brazo nace del borde interior de la caña (la rama A mira a +X)
    x_fin = -1.0          # y llega un poco más allá de la línea media
    n = max(3, int(abs(base - x_fin) / paso))
    alto = z1 - pz
    brazo = [(base, z0 - pz), (x_fin, z0 - pz)]
    for i in range(n):  # de la línea media hacia la caña
        xa = x_fin + (base - x_fin) * i / n
        xb = x_fin + (base - x_fin) * (i + 1) / n
        brazo += [(xa, alto - 1.2), (xa + (xb - xa) * 0.12, alto), (xb, alto - 1.2)]
    brazo.append((base, alto - 1.2))
    cont = [(x * lado, z) for x, z in brazo]
    if lado < 0:
        cont = cont[::-1]
    prisma_plano(bm, cont, y0, y1)


def _apoyo(bm, P, lado, ay, pz):
    """Espolón de apoyo del dedo meñique: nace del aro, por fuera y abajo, y se curva hacia fuera."""
    a, b = P['argolla_a'], P['argolla_b']
    xc = anillo_x(P) * lado
    zr = P['union_z'] + b - 1.5 - pz
    sg = 1 if lado < 0 else -1

    def en_aro(grados, extra=0.0):
        t = math.radians(grados)
        return (xc + sg * (a + extra) * math.cos(t), zr + (b + extra) * math.sin(t))
    pts = [en_aro(-78, -0.6), (xc + sg * (a + 9.0), zr - b * 0.98), (xc + sg * (a + 11.8), zr - b * 0.74), (xc + sg * (a + 8.0), zr - b * 0.52), en_aro(-34, 0.4), en_aro(-48, -1.4)]
    if sg < 0:
        pts = pts[::-1]
    prisma_plano(bm, pts, ay - 1.45, ay + 1.45)

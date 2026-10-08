"""
Instrumental de modelado de placas (grifas, alicate, plantilla) y de enclavado
endomedular (punzón, guía de punta de oliva, tubo de intercambio, dedo
reductor, fresa flexible, arco de inserción, martillo).

De pie, con el extremo de trabajo en el origen, salvo el martillo (origen en el
centro de la cabeza, que es donde golpea).
"""

from lib import *
from detalles import *
import anillado as an
from fijacion2 import tubo
from math import pi, sin, cos, radians, tan, sqrt


# --------------------------------------------------------------------------
# Grifas de torsión
# --------------------------------------------------------------------------

def grifa(slug, nombre, ranura, medidas):
    """
    Grifa de torsión (bending iron): una palanca plana con la cabeza ranurada,
    donde se encaja la placa. Se usan en pareja, una a cada lado del segmento
    que se quiere torcer o doblar.
    """
    raiz = vacio('instrumento')
    L = 250.0
    cab = bmesh.new()
    # La cabeza: un tarugo con la ranura donde entra la placa
    alto, ancho, grueso = 36.0, 30.0, 14.0
    lado = (ancho - ranura) / 2
    caja(cab, (-(ranura / 2 + lado / 2), 0, alto / 2), (lado, grueso, alto))
    caja(cab, ((ranura / 2 + lado / 2), 0, alto / 2), (lado, grueso, alto))
    caja(cab, (0, 0, alto - 5.0), (ancho, grueso, 10.0))
    bisel(cab, 0.8, 2, 35)
    malla('cabeza', cab, 'acero_cepillado', raiz)
    # El brazo: pletina plana que sube desde la cabeza
    br = bmesh.new()
    prisma_plano(br, [(-9.0, alto - 2.0), (9.0, alto - 2.0), (7.5, L - 90.0), (-7.5, L - 90.0)], -3.2, 3.2)
    bisel(br, 0.5, 2, 35)
    malla('brazo', br, 'acero', raiz)
    # Empuñadura de plástico, con un anillo de color
    mg = bmesh.new()
    z0 = L - 92.0
    torno(mg, [(z0, 6.0), (z0, 10.0), (z0 + 5.0, 12.0), (z0 + 12.0, 12.5)], 30)
    estrias_rectas(mg, z0 + 12.0, L - 8.0, 12.5, 20, 0.5, 3)
    torno(mg, [(L - 8.0, 12.5), (L - 3.0, 11.0), (L, 7.0), (L, 0.05)], 30)
    bisel(mg, 0.12, 1, 55)
    malla('empunadura', mg, 'negro_anodizado', raiz, angulo=48)
    an_ = bmesh.new()
    torno(an_, [(z0 + 1.0, 12.1), (z0 + 6.0, 12.55)], 30, tapas=False)
    malla('anillo_color', an_, 'azul_anodizado', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Plantilla maleable de aluminio
# --------------------------------------------------------------------------

def plantilla(slug, nombre, orificios, paso, medidas):
    """
    Plantilla maleable: una tira de aluminio con los orificios de la placa que
    se moldea sobre el hueso y después se copia al implante. Se muestra con
    una curva suave, ya moldeada, para que se lea como maleable.
    """
    raiz = vacio('instrumento')
    L = orificios * paso + 8.0
    ancho, grueso = 11.0, 1.6
    bm = bmesh.new()
    # La tira, que después se subdivide en Z para poder curvarla
    prisma_plano(bm, [(-ancho / 2, 0.0), (ancho / 2, 0.0), (ancho / 2, L), (-ancho / 2, L)], -grueso / 2, grueso / 2)
    me = bpy.data.meshes.new('tira')
    bm.to_mesh(me)
    bm.free()
    tira = bpy.data.objects.new('tira', me)
    bpy.context.scene.collection.objects.link(tira)
    # Subdividir en Z para que la curva no sea poligonal
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 1.0], cuts=int(L / 4), use_grid_fill=True)
    bm.to_mesh(me)
    bm.free()
    # Los orificios, con un booleano exacto
    for k in range(orificios):
        c = bmesh.new()
        cilindro(c, (0, -3.0, 4.0 + paso * (k + 0.5)), (0, 3.0, 4.0 + paso * (k + 0.5)), 2.1, 2.1, 20)
        cm = bpy.data.meshes.new('c%d' % k)
        c.to_mesh(cm)
        c.free()
        co = bpy.data.objects.new('corte%d' % k, cm)
        bpy.context.scene.collection.objects.link(co)
        mod = tira.modifiers.new('b%d' % k, 'BOOLEAN')
        mod.operation = 'DIFFERENCE'
        mod.object = co
        mod.solver = 'EXACT'
    bpy.context.view_layer.objects.active = tira
    for mod in list(tira.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for ob in [o for o in bpy.data.objects if o.name.startswith('corte')]:
        bpy.data.objects.remove(ob, do_unlink=True)
    # Moldeada: una S suave
    for v in tira.data.vertices:
        v.co.x += 7.0 * sin(v.co.z / L * 2 * pi * 0.9)
        v.co.y += 4.0 * (v.co.z / L) ** 2
    tira.data.materials.append(material('aluminio'))
    tira.parent = raiz
    for p in tira.data.polygons:
        p.use_smooth = True
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Punzón, guía y tubo
# --------------------------------------------------------------------------

def punzon(slug, nombre, medidas):
    """
    Punzón iniciador curvo (awl): marca el punto de entrada —el vértice del
    trocánter mayor, el tubérculo anterior de la tibia—. Mango moleteado y vástago
    con una curva suave que acaba en punta de tres filos.
    """
    raiz = vacio('instrumento')
    L = 250.0
    cam = curva_bezier((0, 0, 0), (0, 0, 24), (0, 6, 52), (0, 6, 84), 20) + curva_bezier((0, 6, 84), (0, 6, 100), (0, 6, 110), (0, 6, 132), 12)[1:]
    v = bmesh.new()
    barrido(v, [tuple(p) for p in cam], circulo(2.6, 14), escala=lambda t: 0.28 + 0.72 * min(1.0, t * 6.0))
    bisel(v, 0.05, 1, 55)
    malla('vastago', v, 'acero_pulido', raiz)
    mg = bmesh.new()
    zi = 132.0
    M = Matrix.Translation((0, 6.0, 0))
    torno(mg, [(zi, 2.6), (zi, 6.0), (zi + 8.0, 9.5), (zi + 14.0, 11.0)], 32, M)
    estrias_rectas(mg, zi + 14.0, L - 14.0, 11.0, 18, 0.55, 3, M=M)
    torno(mg, [(L - 14.0, 11.0), (L - 5.0, 9.5), (L, 5.0), (L, 0.05)], 32, M)
    bisel(mg, 0.12, 1, 55)
    malla('mango', mg, 'negro_anodizado', raiz, angulo=48)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


def guia_oliva(slug, nombre, d, largo, medidas):
    """
    Guía de punta de oliva (3,0 mm × 950 mm): alambre de acero flexible con una
    esfera en la punta, para pasar el canal medular y retirar las fresas
    canuladas. El modelo es del largo real.
    """
    raiz = vacio('instrumento')
    r = d / 2
    bm = bmesh.new()
    esfera(bm, (0, 0, r * 1.5), r * 1.45, 18, 10)
    torno(bm, [(r * 1.5, r * 1.1), (r * 3.2, r)], 16, tapas=False)
    # El alambre, apenas ondulado para que se lea flexible, con marcas cada 100 mm
    cam = [(1.2 * sin(z / 140.0), 0.0, z) for z in [r * 3.2 + i * (largo - r * 3.2) / 60 for i in range(61)]]
    barrido(bm, cam, circulo(r, 12), None)
    malla('alambre', bm, 'acero_pulido', raiz, angulo=60)
    m = bmesh.new()
    for z in range(100, int(largo), 100):
        x = 1.2 * sin(z / 140.0)
        torno(m, [(z, r + 0.03), (z + 3.0, r + 0.03)], 12, Matrix.Translation((x, 0, 0)), tapas=False)
    malla('marcas', m, 'acero_oscuro', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


def tubo_intercambio(slug, nombre, medidas):
    """
    Tubo de intercambio: una vaina de plástico con un casquillo en la boca, por
    donde se retira la guía de punta de oliva y se pasa una guía lisa.
    """
    raiz = vacio('instrumento')
    L = 330.0
    t = bmesh.new()
    tubo(t, 0.0, L - 20.0, 4.3, 3.3, 28)
    torno(t, [(0.0, 3.3), (0.0, 4.3), (1.2, 4.3)], 28, tapas=False)
    bisel(t, 0.05, 1, 55)
    malla('vaina', t, 'gris_claro', raiz)
    c = bmesh.new()
    torno(c, [(L - 20.0, 3.3), (L - 20.0, 6.0), (L - 14.0, 9.0), (L - 3.0, 9.0), (L, 7.5), (L, 3.3)], 30, tapas=False)
    estrias_rectas(c, L - 14.0, L - 4.0, 9.0, 14, 0.3, 3)
    bisel(c, 0.08, 1, 55)
    malla('casquillo', c, 'azul_boton', raiz, angulo=48)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


def dedo_reductor(slug, nombre, medidas):
    """
    Dedo reductor endomedular (finger reducer): una varilla de 9 mm, curva en la
    punta, con una empuñadura en T. Se pasa por el canal para empujar el
    fragmento y reducirlo sin abrir el foco.
    """
    raiz = vacio('instrumento')
    L = 420.0
    cam = curva_bezier((0, 0, 0), (0, 0, 18), (14, 0, 38), (20, 0, 64), 16) + curva_bezier((20, 0, 64), (24, 0, 80), (0, 0, 96), (0, 0, 126), 12)[1:]
    cam += [(0.0, 0.0, 126.0 + (L - 126.0) * i / 10) for i in range(1, 11)]
    v = bmesh.new()
    barrido(v, [tuple(p) if not isinstance(p, tuple) else p for p in cam], circulo(4.5, 16), escala=lambda t: 0.7 + 0.3 * min(1.0, t * 12.0))
    esfera(v, (0, 0, 0.8), 3.4, 14, 8)
    bisel(v, 0.08, 1, 55)
    malla('varilla', v, 'acero', raiz, angulo=55)
    h = bmesh.new()
    torno(h, [(L - 8.0, 4.5), (L - 8.0, 8.0), (L, 8.0)], 24, tapas=False)
    estrias_rectas(h, -55.0, 55.0, 11.0, 18, 0.55, 3, M=Matrix.Translation((0, 0, L + 6.0)) @ Matrix.Rotation(pi / 2, 4, 'Y'))
    torno(h, [(-55.0, 11.0), (-58.0, 9.0), (-59.5, 0.05)], 24, Matrix.Translation((0, 0, L + 6.0)) @ Matrix.Rotation(pi / 2, 4, 'Y'))
    torno(h, [(55.0, 11.0), (58.0, 9.0), (59.5, 0.05)], 24, Matrix.Translation((0, 0, L + 6.0)) @ Matrix.Rotation(pi / 2, 4, 'Y'))
    bisel(h, 0.1, 1, 55)
    malla('empunadura_t', h, 'negro_anodizado', raiz, angulo=48)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Fresa flexible
# --------------------------------------------------------------------------

def fresa_flexible(slug, nombre, d, medidas):
    """
    Fresa flexible canulada (reamer): cabeza de corte con seis filos helicoidales y
    nariz redondeada, eje flexible de espiral y acople AO/Hudson para el motor.
    """
    raiz = vacio('instrumento')
    R = d / 2
    lc = 34.0
    c = bmesh.new()

    def fr(z, th):
        # nariz redondeada: radio crece con un cuarto de elipse en los primeros 10 mm
        nariz = R * sqrt(max(0.0, 1.0 - ((10.0 - min(z, 10.0)) / 10.0) ** 2)) if z < 10.0 else R
        nariz = max(nariz, R * 0.12)
        fase = (th * 6 / (2 * pi) - 1.1 * 6 * (z / lc)) % 1.0
        v = abs(fase - 0.5) * 2
        hueco = 0.0 if v < 0.45 else min(1.0, (v - 0.45) / 0.55 * 1.6)
        return nariz * (1.0 - 0.28 * hueco)
    campo(c, 0.0, lc, fr, 44, 36)
    # taza de salida: cuello cónico hacia el eje
    torno(c, [(lc, R * 0.95), (lc + 8.0, 4.4)], 36, tapas=False)
    bisel(c, 0.04, 1, 60)
    malla('cabeza', c, 'acero_pulido', raiz, angulo=55)
    # Eje flexible: espiral enrollada
    e = bmesh.new()
    lz0, lz1 = lc + 8.0, lc + 8.0 + 170.0

    def fe(z, th):
        fase = ((z - lz0) / 3.2 - th / (2 * pi)) % 1.0
        t = abs(fase - 0.5) * 2
        f = 1.0 - min(1.0, t / 0.6) if t < 0.6 else 0.0
        return 3.3 + 1.1 * f
    campo(e, lz0, lz1, fe, int(170 / 3.2 * 4), 18)
    cilindro(e, (0, 0, lz1), (0, 0, 420.0 - 18.0), 3.6, 3.6, 22)
    acople_ao(e, 420.0 - 18.0, 3.4, 18.0)
    bisel(e, 0.04, 1, 60)
    malla('eje', e, 'acero_oscuro', raiz, angulo=55)
    b = bmesh.new()
    bandas(b, [420.0 - 30.0], 3.62, 4.0)
    malla('banda_diametro', b, 'verde_anodizado', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Arco de inserción
# --------------------------------------------------------------------------

def arco_insercion(slug, nombre, medidas):
    """
    Arco de inserción (guía proximal) del clavo: un mango con un perno de
    conexión y un brazo curvo con las camisas para los tornillos de bloqueo
    proximales. El perno se aprieta con un destornillador canulado.
    """
    raiz = vacio('instrumento')
    # Perno de conexión (abajo): se enrosca en el clavo
    declarar_articulacion('Perno', 'Apretar el perno', 0.0, 720.0, '°', 0.0)
    pv = pivote('perno', raiz, (0, 0, 0), 'Perno', (0, 0, 1), 1.0)
    p = bmesh.new()
    torno(p, [(0.0, 3.4), (0.0, 4.4), (14.0, 4.4), (14.0, 6.0), (40.0, 6.0)], 24)
    rosca(p, 0.0, 14.0, 3.9, 4.5, 1.3, 24)
    malla('perno', p, 'acero_cepillado', pv)
    # Cuerpo del mango
    m = bmesh.new()
    torno(m, [(40.0, 9.0), (40.0, 17.0), (48.0, 19.0), (96.0, 19.0), (104.0, 16.0), (108.0, 0.05)], 36)
    bisel(m, 0.4, 2, 45)
    malla('mango', m, 'negro_anodizado', raiz, angulo=48)
    anillo = bmesh.new()
    torno(anillo, [(38.5, 17.3), (40.0, 17.3), (40.0, 17.7), (38.5, 17.7)], 36, tapas=False)
    malla('anillo_color', anillo, 'azul_anodizado', raiz)
    # Brazo: una barra curva que sale del mango y se curva hacia abajo
    br = bmesh.new()
    cam = curva_bezier((10.0, 0, 70.0), (60.0, 0, 70.0), (120.0, 0, 62.0), (150.0, 0, 20.0), 22)
    barrido(br, [tuple(p_) for p_ in cam], [(5.0 * cos(2 * pi * i / 4 + pi / 4), 9.0 * sin(2 * pi * i / 4 + pi / 4)) for i in range(4)], None)
    bisel(br, 0.8, 2, 35)
    malla('brazo', br, 'negro_anodizado', raiz, angulo=48)
    # Camisas de los tornillos de bloqueo: tubos metálicos en el brazo
    # (las camisas se colocan una a una con su propia matriz)
    camisas = bmesh.new()
    for cx, cz in ((96.0, 64.0), (122.0, 54.0), (142.0, 36.0)):
        M = Matrix.Translation((cx, 0, cz)) @ Matrix.Rotation(pi / 2, 4, 'Y') @ Matrix.Rotation(-0.35, 4, 'X')
        torno(camisas, [(-14.0, 3.3), (-14.0, 5.8), (14.0, 5.8), (14.0, 3.3)], 20, M, tapas=False)
    bisel(camisas, 0.1, 1, 55)
    malla('camisas', camisas, 'acero_pulido', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz


# --------------------------------------------------------------------------
# Martillo
# --------------------------------------------------------------------------

def martillo(slug, nombre, medidas):
    """
    Martillo de osteosíntesis: cabeza de acero de 40 mm con dos caras de nailon,
    mango de acero con empuñadura de goma. Origen en el centro de la cabeza.
    """
    raiz = vacio('instrumento')
    cab = bmesh.new()
    torno(cab, [(-40.0, 17.0), (-30.0, 20.0), (30.0, 20.0), (40.0, 17.0)], 36, Matrix.Rotation(pi / 2, 4, 'Y'))
    bisel(cab, 0.5, 2, 40)
    malla('cabeza', cab, 'acero_cepillado', raiz, angulo=48)
    for lado, nom in ((-1, 'a'), (1, 'b')):
        cara = bmesh.new()
        cilindro(cara, (lado * 40.0, 0, 0), (lado * 52.0, 0, 0), 17.0, 16.0, 32)
        bisel(cara, 0.8, 2, 40)
        malla('cara_nailon_' + nom, cara, 'blanco_plastico', raiz, angulo=48)
    mg = bmesh.new()
    cilindro(mg, (0, 0, 14.0), (0, 0, 120.0), 6.0, 6.0, 20)
    estrias_rectas(mg, 120.0, 250.0, 12.5, 18, 0.5, 3)
    torno(mg, [(250.0, 12.5), (256.0, 11.0), (260.0, 7.0), (260.0, 0.05)], 28)
    torno(mg, [(106.0, 6.0), (110.0, 8.5), (120.0, 12.5)], 28, tapas=False)
    bisel(mg, 0.1, 1, 55)
    malla('mango', mg, 'negro_goma', raiz, angulo=48)
    ma = bmesh.new()
    cilindro(ma, (0, 0, 12.0), (0, 0, 108.0), 6.2, 6.2, 20)
    malla('vastago', ma, 'acero_pulido', raiz)
    meta_raiz(raiz, slug, nombre, medidas)
    return raiz

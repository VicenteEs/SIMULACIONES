"""
Los huesos largos del atlas, rehechos lisos y con su canal medular (P-012 E7, D-335 y D-336).

    python scripts/atlas/huesos/generar.py                  # los catorce
    python scripts/atlas/huesos/generar.py --ids FJ3282     # solo esos, para probar

Deja en `scripts/atlas/huesos/salida/` un `.bin` por hueso, con el formato de las fascias (posiciones, normales e
índices, como en un paquete del atlas), y un `manifiesto.json` con lo que se midió de cada uno. Lo que los pone en el
atlas, después de comprobarlos con la misma prueba que la piel, es `node scripts/atlas/poner-huesos.mjs`.

**Por qué se rehacen.** El hueso del atlas es la malla más pobre del modelo. La tibia izquierda tiene 331 vértices para
38 cm, su arista mediana mide 10,6 mm y la más larga, 168 mm: a lo largo, la diáfisis es una sucesión de caras planas
de varios centímetros, y ahí apoyan la placa a medida, la entrada de la broca y la luz. El original de BodyParts3D
tampoco sirve: se midió (E7 de P-012) y la misma tibia tiene 880 vértices, con la arista más larga en 168 mm. No hay de
dónde sacar más detalle, así que se hace una superficie lisa que pasa por donde pasa la de ahora.

**Qué hace, en orden, con cada uno de los catorce.**

1. Parte del hueso de BodyParts3D tal como lo dejó `preparar.mjs`, leído del historial de git (`ORIGEN`): partir del
   que ya esté rehecho en el atlas sería suavizar lo suavizado, y el guion no sería idempotente.
2. Lo rellena en una rejilla de `VOXEL_FINO` por la paridad de un rayo a lo largo de z. El hueso es una malla cerrada
   (soldada por posición), así que el relleno es exacto en el centro de cada vóxel; el de las fascias marca los vóxeles
   que toca la superficie, que vale para una malla abierta pero deja el borde 0,65 casillas por fuera.
3. Saca su campo de distancia con signo y lo suaviza con una gaussiana de `SUAVIZADO`. Eso redondea las aristas entre
   las caras planas —en la diáfisis, cada 3 mm alrededor— y deja en su sitio lo que es forma.
4. Saca la superficie con *Surface Nets* en una rejilla de `LADO`: un vértice por celda, así que los lados salen de
   unos 2 mm, como se decidió. Cada vértice se lleva después a la superficie del campo fino con unos pasos de Newton, y
   se relaja a lo largo de ella para que los triángulos salgan parejos.
5. **Nada asoma**: ningún vértice queda más de `ASOMA_COMO_MUCHO` fuera del hueso de origen. Lo liso redondea hacia
   fuera lo cóncavo (el surco entre los cóndilos, el canal bicipital), y ahí el músculo, la fascia y la piel ya están
   calculados contra el hueso de antes. Lo que asoma de más se vuelve a meter, a lo largo de su normal.
6. El canal medular: la misma superficie, hundida el grosor de la cortical (`GROSOR_DE_LA_CORTICAL` por el ancho del
   hueso en cada altura), solo en la diáfisis —entre los dos cuadrados de Heim, como `segmentosAO.ts`— y cerrado en
   cúpula al llegar a la metáfisis. Sus caras miran hacia dentro del canal, fuera del hueso: la pieza sigue siendo el
   sólido del hueso, con un hueco.
7. Mide lo que el simulador va a usar y lo deja en el manifiesto: cuánto se apartó del de origen, el grosor de la
   cortical y el istmo.

**Por qué el canal es solo de la diáfisis**, y no una cara a 1–2 mm en la metáfisis, que era la propuesta. Dentro de la
cortical de la metáfisis no hay un hueco sino hueso esponjoso. Con una cara a 1–2 mm hasta la epífisis, el corte de una
meseta tibial o de un radio distal enseñaría una cáscara de huevo vacía. Así, en la metáfisis la tapa del corte sigue
siendo un disco lleno, y el sombreador le pinta 1 a 2 mm de cortical alrededor del esponjoso (D-337); en la diáfisis la
tapa es el anillo de la cortical, con el canal en medio.

Necesita `numpy` y `scipy` (los mismos que las fascias). Tarda unos minutos los catorce.
"""

import argparse
import gzip
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi
from scipy import sparse
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / 'fascias'))

import campo as C  # noqa: E402
import malla as M  # noqa: E402
from atlas import RAIZ  # noqa: E402

#: El commit con los huesos de BodyParts3D tal como los dejó `preparar.mjs` (los paquetes 12 y 13 no los había tocado
#: nadie hasta E7: lo comprueban los guiones de la piel y de las fascias antes de escribir).
ORIGEN = 'e03f345'
SALIDA = AQUI / 'salida'

#: Los catorce huesos largos (decisión 3 de E7): fémur, tibia, peroné, húmero, radio, cúbito y clavícula, de los dos
#: lados. Por identificador y no por nombre: el nombre lo traduce la plataforma y podría cambiar.
HUESOS = {
    'FJ3259': 'Left femur', 'FJ3365': 'Right femur',
    'FJ3282': 'Left tibia', 'FJ3387': 'Right tibia',
    'FJ3260': 'Left fibula', 'FJ3366': 'Right fibula',
    'FJ3262': 'Left humerus', 'FJ3368': 'Right humerus',
    'FJ3277': 'Left radius', 'FJ3349': 'Right radius',
    'FJ3286': 'Left ulna', 'FJ3391': 'Right ulna',
    'FJ3237': 'Left clavicle', 'FJ3362': 'Right clavicle',
}

#: El vóxel del campo fino. Medio milímetro: el campo con signo entre centros de vóxel se equivoca en media casilla
#: como mucho, un cuarto de milímetro, que la gaussiana y los pasos de Newton reparten. Un fémur son 37 millones de
#: vóxeles y unos 2 GB en el pico de memoria.
VOXEL_FINO = 0.0005
#: El margen de la rejilla alrededor del hueso: el relleno inunda desde la esquina y la gaussiana lee lo de fuera.
MARGEN = 0.008
#: La gaussiana del campo, en metros. Con 1,5 mm el borde entre dos caras planas se redondea en unos 4 mm de ancho, que
#: en la diáfisis es la cara entera; lo convexo de 11 mm de radio (la diáfisis de la tibia) entra 0,1 mm, y una cresta
#: de 2 mm, unos 0,6.
SUAVIZADO = 0.0015
#: El lado de la rejilla de la superficie: sale un vértice por celda, y lados de 1,5 a 2,8 mm. Múltiplo del vóxel fino,
#: para que la rejilla gruesa caiga en centros de la fina y se lea sin interpolar.
LADO = 0.002
#: Cuánto se deja asomar la superficie lisa fuera del hueso de origen. Lo de fuera —el músculo, las fascias, la piel y
#: su cara de dentro, que se dejó a 0,8 mm de lo que tuviera debajo (D-331)— está calculado contra el hueso de antes:
#: con un cuarto de milímetro no hay que rehacer nada de eso, y se comprueba con la prueba de la piel al escribirlo.
ASOMA_COMO_MUCHO = 0.00025

#: El grosor de la cortical en la diáfisis, como fracción del ancho del hueso en esa altura (el diámetro de la mayor
#: esfera que cabe dentro). Con 0,23 sale el canal en un 54 % del ancho. Medido al hacerlo (D-336), la cortical mediana
#: de la diáfisis y el istmo: el fémur, 5,3 y 14,5 mm; la tibia, 4 y 10,8; el húmero, 3,8 y 9; el peroné, el radio, el
#: cúbito y la clavícula, unos 2 mm de cortical y de 3,4 a 5 de istmo. Son las cifras de una diáfisis de adulto, y las
#: de la propuesta (4 a 6 mm en la tibia y el fémur). Subirla no compensa: con 0,25 la cortical de los finos pasaría
#: de 2 a 2,2 mm, y el istmo del húmero bajaría a unos 8,4, menos que la cabeza más chica de la fresa (8,5).
GROSOR_DE_LA_CORTICAL = 0.23
GROSOR_MINIMO = 0.0015
GROSOR_MAXIMO = 0.0065
#: Cuánto entra el canal en la metáfisis antes de cerrarse en cúpula, desde el borde del cuadrado de Heim.
CUPULA = 0.012
#: La gaussiana del campo del canal. Hundir una superficie deja en lo hundido las esquinas que tenga la sección: la de la
#: tibia es un triángulo, y su canal salía un triángulo de esquinas vivas, que no es lo que enseña un corte. Con 1,5 mm
#: las esquinas se redondean y las paredes planas, que son las que dan el istmo, no se mueven.
REDONDEO = 0.0015
#: El paso a lo largo del eje con que se mide el istmo, y el de la búsqueda del círculo en cada sección.
TRAMO_DEL_ISTMO = 0.002
PASO_DEL_CIRCULO = 0.00025

#: Lo de `segmentosAO.ts`, repetido: el perfil de anchura en 40 tramos, el extremo buscado en su tercio y acotado
#: entre el 8 y el 33 % del largo. Si allí cambia, aquí también, o el canal acabaría donde el simulador no pone el
#: borde de la diáfisis.
TRAMOS_DEL_PERFIL = 40
ZONA_DEL_EXTREMO = 1 / 3
EXTREMO_MINIMO = 0.08
EXTREMO_MAXIMO = 1 / 3

SEMILLA = 7


def dicho_con_tiempo():
    t0 = time.time()

    def dicho(texto):
        print(f'[{time.time() - t0:5.0f} s] {texto}', flush=True)

    return dicho


# ------------------------------------------------------------------------------------------------ el origen


def git_show(ruta):
    return subprocess.run(['git', 'show', f'{ORIGEN}:{ruta}'], cwd=RAIZ, check=True, capture_output=True).stdout


def huesos_de_origen(ids):
    """Cada hueso pedido, de BodyParts3D: su pieza del catálogo de `ORIGEN` y su malla soldada por posición."""
    catalogo = json.loads(git_show('public/atlas/catalogo.json'))
    paquetes = {}
    salida = {}
    for pieza in catalogo['piezas']:
        if pieza['id'] not in ids:
            continue
        if pieza['nombre'] != HUESOS[pieza['id']]:
            raise SystemExit(f"{pieza['id']} se llama «{pieza['nombre']}» en {ORIGEN}, y se esperaba «{HUESOS[pieza['id']]}».")
        n = pieza['paquete']
        if n not in paquetes:
            paquetes[n] = gzip.decompress(git_show(f"public/atlas/{catalogo['paquetes'][n]['archivo']}"))
        b = paquetes[n]
        pos = np.frombuffer(b, '<f4', pieza['vertices'] * 3, pieza['pos']).reshape(-1, 3).astype(np.float64)
        idx = np.frombuffer(b, '<u4', pieza['indices'], pieza['idx']).reshape(-1, 3).astype(np.int64)
        salida[pieza['id']] = (pieza, *soldar(pos, idx))
    falta = sorted(set(ids) - set(salida))
    if falta:
        raise SystemExit(f'No están en el catálogo de {ORIGEN}: {", ".join(falta)}')
    return salida


def soldar(pos, f):
    """
    Une los vértices que comparten posición, quita los que sobran y las caras degeneradas.

    El atlas repite vértices en las costuras, con normales distintas, y los repite bit a bit: por índice la tibia está
    abierta por cincuenta aristas; por posición, cerrada. Se suelda a la micra, como la piel.
    """
    clave = np.round(pos * 1e6).astype(np.int64)
    _, primero, inversa = np.unique(clave, axis=0, return_index=True, return_inverse=True)
    f = inversa.ravel()[f]
    f = f[(f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 2] != f[:, 0])]
    return M.compactar(pos[primero], f)


# ------------------------------------------------------------------------------------------------ el relleno


def rellenar_por_paridad(v, f, rejilla):
    """
    Qué vóxeles tienen el centro dentro de la malla cerrada `(v, f)`, por la paridad de un rayo a lo largo de z.

    Para cada triángulo se buscan las columnas de vóxeles cuyo centro cae dentro de su proyección en xy, y se anota a
    qué altura lo cruza cada una. Un vóxel está dentro si por debajo de su centro hay un número impar de cruces: se
    anota +1 en el primer vóxel por encima de cada cruce y se acumula. Un rayo que pasara justo por una arista contaría
    dos veces; con las coordenadas del atlas no pasa (se comprueba: cada columna tiene que cruzar un número par de
    veces, y si no, se dice).
    """
    nx, ny, nz = rejilla.forma
    h = rejilla.h
    o = np.asarray(rejilla.origen)
    cruces = np.zeros((nx, ny, nz + 1), np.int16)
    impares = 0
    xs = o[0] + (np.arange(nx) + 0.5) * h
    ys = o[1] + (np.arange(ny) + 0.5) * h
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    for t in range(len(f)):
        pa, pb, pc = a[t], b[t], c[t]
        det = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1])
        if det == 0:
            continue
        i0 = max(0, int(np.floor((min(pa[0], pb[0], pc[0]) - o[0]) / h - 0.5)))
        i1 = min(nx - 1, int(np.ceil((max(pa[0], pb[0], pc[0]) - o[0]) / h - 0.5)))
        j0 = max(0, int(np.floor((min(pa[1], pb[1], pc[1]) - o[1]) / h - 0.5)))
        j1 = min(ny - 1, int(np.ceil((max(pa[1], pb[1], pc[1]) - o[1]) / h - 0.5)))
        if i1 < i0 or j1 < j0:
            continue
        X, Y = np.meshgrid(xs[i0 : i1 + 1], ys[j0 : j1 + 1], indexing='ij')
        # Baricéntricas con la regla de la mitad abierta: un punto sobre la arista compartida por dos triángulos cuenta
        # en uno solo de los dos.
        w1 = ((X - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (Y - pa[1])) / det
        w2 = ((pb[0] - pa[0]) * (Y - pa[1]) - (X - pa[0]) * (pb[1] - pa[1])) / det
        w0 = 1 - w1 - w2
        dentro = (w0 > 0) & (w1 > 0) & (w2 > 0)
        if not dentro.any():
            continue
        z = w0 * pa[2] + w1 * pb[2] + w2 * pc[2]
        k = np.ceil((z - o[2]) / h - 0.5).astype(np.int64)
        ii, jj = np.nonzero(dentro)
        kk = np.clip(k[ii, jj], 0, nz)
        np.add.at(cruces, (ii + i0, jj + j0, kk), 1)
    total = cruces.sum(axis=2)
    impares = int((total % 2 == 1).sum())
    dentro = (np.cumsum(cruces[:, :, :nz], axis=2) % 2).astype(bool)
    return dentro, impares


# ------------------------------------------------------------------------------------------------ el eje


def eje_del_hueso(v, f):
    """
    El eje de `ejeDelHueso` (`src/lib/planoDeCorte.ts`): el centroide de la superficie y su dirección principal, por
    los momentos de área de los triángulos. Aquí no importa cuál de los dos extremos es el proximal: los dos cuadrados
    de Heim se calculan igual.
    """
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    centro = (area[:, None] * (a + b + c) / 3).sum(axis=0) / area.sum()
    s = a + b + c
    segundo = np.zeros((3, 3))
    for p in range(3):
        for q in range(3):
            segundo[p, q] = (area / 12 * (a[:, p] * a[:, q] + b[:, p] * b[:, q] + c[:, p] * c[:, q] + s[:, p] * s[:, q])).sum()
    cov = segundo / area.sum() - np.outer(centro, centro)
    valores, vectores = np.linalg.eigh(cov)
    direccion = vectores[:, np.argmax(valores)]
    return centro, direccion / np.linalg.norm(direccion)


def diafisis_de_heim(v, centro, direccion):
    """Dónde empieza y acaba la diáfisis a lo largo del eje, como `segmentosDeHeim` (`src/atlas/segmentosAO.ts`)."""
    rel = v - centro
    s = rel @ direccion
    proximal, distal = float(s.min()), float(s.max())
    largo = distal - proximal
    radial = np.linalg.norm(rel - np.outer(s, direccion), axis=1)
    tramo = np.minimum(TRAMOS_DEL_PERFIL - 1, np.floor((s - proximal) / largo * TRAMOS_DEL_PERFIL).astype(int))
    perfil = np.zeros(TRAMOS_DEL_PERFIL)
    np.maximum.at(perfil, tramo, 2 * radial)
    zona = max(1, round(TRAMOS_DEL_PERFIL * ZONA_DEL_EXTREMO))

    def acotar(lado):
        return min(EXTREMO_MAXIMO * largo, max(EXTREMO_MINIMO * largo, lado))

    lado_p = acotar(perfil[:zona].max())
    lado_d = acotar(perfil[TRAMOS_DEL_PERFIL - zona :].max())
    sobra = lado_p + lado_d - 0.8 * largo
    if sobra > 0:
        factor = (lado_p + lado_d - sobra) / (lado_p + lado_d)
        lado_p *= factor
        lado_d *= factor
    return proximal, proximal + lado_p, distal - lado_d, distal


# ------------------------------------------------------------------------------------------- la superficie


_ESQUINAS = np.array([(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0), (0, 0, 1), (1, 0, 1), (0, 1, 1), (1, 1, 1)])
_ARISTAS = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]


def surface_nets(campo, origen, h):
    """
    La superficie donde `campo` cambia de signo (negativo dentro), en cuadriláteros: un vértice por celda cruzada, en
    la media de los cortes de sus aristas, y un cuadrilátero por cada arista de la rejilla que cambia de signo.

    Es el algoritmo de `malla.superficie_de_un_campo`, pero devuelve los cuadriláteros sin partir: cada uno se parte
    después por su diagonal más corta, ya con los vértices sobre la superficie. Partido siempre por la misma, la mitad
    de los triángulos sale con un ángulo de más de 90°. Los cuadriláteros miran hacia fuera de lo negativo.
    """
    nx, ny, nz = campo.shape
    esquinas = [campo[dx : nx - 1 + dx, dy : ny - 1 + dy, dz : nz - 1 + dz] for dx, dy, dz in _ESQUINAS]
    dentro = [e < 0 for e in esquinas]
    cruzada = np.logical_or.reduce(dentro) & ~np.logical_and.reduce(dentro)
    celda = -np.ones(cruzada.shape, np.int64)
    celda[cruzada] = np.arange(int(cruzada.sum()))
    ii, jj, kk = np.nonzero(cruzada)
    suma = np.zeros((len(ii), 3))
    cuenta = np.zeros(len(ii))
    for a, b in _ARISTAS:
        va, vb = esquinas[a][cruzada].astype(np.float64), esquinas[b][cruzada].astype(np.float64)
        corta = (va < 0) != (vb < 0)
        t = np.where(corta, va / np.where(corta, va - vb, 1.0), 0.0)
        punto = _ESQUINAS[a][None, :] + t[:, None] * (_ESQUINAS[b] - _ESQUINAS[a])[None, :]
        suma += np.where(corta[:, None], punto, 0.0)
        cuenta += corta
    vertices = np.asarray(origen, float) + (suma / np.maximum(cuenta, 1)[:, None] + np.stack([ii, jj, kk], 1)) * h

    cuadros = []
    for eje in range(3):
        a1, a2 = [d for d in range(3) if d != eje]
        ini = tuple(slice(0, s - 1) if d == eje else slice(None) for d, s in enumerate(campo.shape))
        fin = tuple(slice(1, s) if d == eje else slice(None) for d, s in enumerate(campo.shape))
        p0, p1 = campo[ini], campo[fin]
        cambia = (p0 < 0) != (p1 < 0)
        interior = np.zeros_like(cambia)
        sl = [slice(None)] * 3
        sl[a1] = slice(1, -1)
        sl[a2] = slice(1, -1)
        interior[tuple(sl)] = cambia[tuple(sl)]
        p = np.stack(np.nonzero(interior), 1)

        def vecina(d1, d2):
            q = p.copy()
            q[:, a1] += d1
            q[:, a2] += d2
            return celda[q[:, 0], q[:, 1], q[:, 2]]

        cuadro = np.stack([vecina(-1, -1), vecina(0, -1), vecina(0, 0), vecina(-1, 0)], 1)
        completo = (cuadro >= 0).all(axis=1)
        cuadro, pc = cuadro[completo], p[completo]
        # El sentido sale de qué extremo de la arista está dentro y de la paridad del eje, como en `malla.py`; se
        # comprueba después contra el volumen y se da la vuelta entera si hace falta.
        invertir = (p0[tuple(pc.T)] < 0) ^ (eje == 1)
        cuadros.append(np.where(invertir[:, None], cuadro[:, ::-1], cuadro))
    return vertices, np.vstack(cuadros)


def partir_cuadros(v, cuadros):
    """Cada cuadrilátero en dos triángulos, por su diagonal más corta."""
    a, b, c, d = (v[cuadros[:, k]] for k in range(4))
    por_ac = np.linalg.norm(a - c, axis=1) <= np.linalg.norm(b - d, axis=1)
    t1 = np.where(por_ac[:, None], cuadros[:, [0, 1, 2]], cuadros[:, [0, 1, 3]])
    t2 = np.where(por_ac[:, None], cuadros[:, [0, 2, 3]], cuadros[:, [1, 2, 3]])
    return np.vstack([t1, t2])


class CampoFino:
    """El campo suavizado y lo que se le pregunta: su valor y su gradiente en puntos cualesquiera, interpolados."""

    def __init__(self, valores, rejilla):
        self.valores = valores
        self.rejilla = rejilla

    def en(self, p, valores=None):
        g = (np.asarray(p) - np.asarray(self.rejilla.origen)) / self.rejilla.h - 0.5
        return ndi.map_coordinates(self.valores if valores is None else valores, g.T, order=1, mode='nearest')

    def gradiente(self, p):
        h = self.rejilla.h
        salida = np.zeros_like(p)
        for k in range(3):
            d = np.zeros(3)
            d[k] = h
            salida[:, k] = (self.en(p + d) - self.en(p - d)) / (2 * h)
        return salida


def a_la_superficie(p, valor, gradiente, pasos=4):
    """Lleva cada punto al cero de un campo con pasos de Newton a lo largo de su gradiente."""
    p = p.copy()
    for _ in range(pasos):
        g = gradiente(p)
        n2 = np.maximum((g * g).sum(axis=1), 1e-12)
        p -= (valor(p) / n2)[:, None] * g
    return p


def vecinos(n, f):
    """La matriz que da, para cada vértice, la media de sus vecinos."""
    e = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    e = np.vstack([e, e[:, ::-1]])
    ady = sparse.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    ady.data[:] = 1.0
    grado = np.asarray(ady.sum(axis=1)).ravel()
    return sparse.diags(1.0 / np.maximum(grado, 1)) @ ady


def relajar(v, f, valor, gradiente, pasadas=6, fuerza=0.5):
    """
    Iguala los triángulos sin cambiar la forma: cada vértice va hacia la media de sus vecinos solo a lo largo de la
    superficie (se le quita lo que va por la normal), y después vuelve a ella con Newton.
    """
    media = vecinos(len(v), f)
    for _ in range(pasadas):
        n = M.normales_de_vertices(v, f)
        d = media @ v - v
        d -= (d * n).sum(axis=1)[:, None] * n
        v = a_la_superficie(v + fuerza * d, valor, gradiente, pasos=2)
    return v


def la_mayor(v, f):
    """La parte conexa con más triángulos: lo que el campo deja suelto (una burbuja) no es hueso ni canal."""
    e = np.vstack([f[:, [0, 1]], f[:, [1, 2]]])
    grafo = sparse.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(v), len(v)))
    _, etiqueta = connected_components(grafo, directed=False)
    de_cada = etiqueta[f[:, 0]]
    mayor = np.bincount(de_cada).argmax()
    return M.compactar(v, f[de_cada == mayor])


def superficie(valores, rejilla_fina, paso, valor, gradiente):
    """
    La superficie del cero de `valores` (en la rejilla fina) con lados de `paso`, sobre él y relajada.

    *Surface Nets* deja una arista con más de dos caras donde el hueso es más fino que una celda en una dirección
    (una cresta de 2 mm cortada justo a lo largo): el fémur salía con tres. La misma superficie, sacada con la rejilla
    gruesa corrida un vóxel fino, ya no las tiene, porque la cresta cae de otra manera entre las celdas. Se prueba
    corriéndola hasta que salga cerrada y sin esas aristas. El cúbito derecho no sale limpio con ningún corrimiento de
    la de 2 mm, y para eso se prueba después con la de un vóxel menos: sus lados salen algo más cortos, nada más. Si
    tampoco, se queda la última, y el manifiesto lo dice.
    """
    k0 = int(round(paso / rejilla_fina.h))
    intentos = [(k, c) for k in (k0, k0 - 1) if k > 1 for c in range(k)]
    for k, corrimiento in intentos:
        grueso = valores[corrimiento::k, corrimiento::k, corrimiento::k]
        origen = tuple(o + (0.5 + corrimiento) * rejilla_fina.h for o in rejilla_fina.origen)
        v, cuadros = surface_nets(grueso, origen, rejilla_fina.h * k)
        v = a_la_superficie(v, valor, gradiente)
        f = partir_cuadros(v, cuadros)
        v, f = la_mayor(v, f)
        if M.aristas_de_borde(f) == (0, 0):
            break
    if M.volumen_con_signo(v, f) < 0:
        f = f[:, ::-1].copy()
    v = relajar(v, f, valor, gradiente)
    return v, f


# ------------------------------------------------------------------------------------- distancia al de origen


class Origen:
    """
    La distancia con signo de cualquier punto al hueso de origen, exacta: positiva fuera.

    Se busca el triángulo más cercano entre los de las muestras más cercanas de su superficie (una cada cuarto de
    milímetro), y se mide al triángulo entero. Con una tibia de triángulos de 17 cm, buscar por el centro de cada
    triángulo daría el triángulo equivocado justo a lo largo de la diáfisis. El signo sale de la normal del triángulo
    más cercano; en una arista o un vértice esa normal no basta, y entonces se pregunta al relleno.
    """

    def __init__(self, v, f, dentro, rejilla):
        self.v, self.f = v, f
        self.dentro, self.rejilla = dentro, rejilla
        self.n = M.normales_de_caras(v, f)
        a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
        area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
        cuantos = np.maximum(1, np.ceil(area / (0.5 * 0.00025**2)).astype(np.int64))
        quien = np.repeat(np.arange(len(f)), cuantos)
        azar = np.random.default_rng(SEMILLA)
        r1 = np.sqrt(azar.random(len(quien)))
        r2 = azar.random(len(quien))
        muestras = a[quien] * (1 - r1)[:, None] + b[quien] * (r1 * (1 - r2))[:, None] + c[quien] * (r1 * r2)[:, None]
        self.arbol = cKDTree(muestras)
        self.de_la_muestra = quien

    def distancia(self, p):
        _, cerca = self.arbol.query(p, k=12)
        candidatos = self.de_la_muestra[cerca]
        mejor = np.full(len(p), np.inf)
        punto = np.zeros_like(p)
        cual = np.zeros(len(p), np.int64)
        for k in range(candidatos.shape[1]):
            t = candidatos[:, k]
            q = punto_mas_cercano(p, self.v[self.f[t, 0]], self.v[self.f[t, 1]], self.v[self.f[t, 2]])
            d = np.linalg.norm(p - q, axis=1)
            mejora = d < mejor
            mejor[mejora], punto[mejora], cual[mejora] = d[mejora], q[mejora], t[mejora]
        lado = ((p - punto) * self.n[cual]).sum(axis=1)
        # En una arista o un vértice la normal de un triángulo no dice de qué lado se está: se pregunta al relleno, que
        # es exacto en el centro de cada vóxel.
        dudoso = np.abs(lado) < 0.5 * mejor
        signo = np.sign(lado)
        if dudoso.any():
            g = np.floor((p[dudoso] - np.asarray(self.rejilla.origen)) / self.rejilla.h).astype(int)
            g = np.clip(g, 0, np.asarray(self.rejilla.forma) - 1)
            signo[dudoso] = np.where(self.dentro[g[:, 0], g[:, 1], g[:, 2]], -1.0, 1.0)
        return signo * mejor


def punto_mas_cercano(p, a, b, c):
    """El punto de cada triángulo (a, b, c) más cercano a cada p, vectorizado (Ericson, *Real-Time Collision Detection*)."""
    ab, ac, ap = b - a, c - a, p - a
    d1, d2 = (ab * ap).sum(1), (ac * ap).sum(1)
    bp = p - b
    d3, d4 = (ab * bp).sum(1), (ac * bp).sum(1)
    cp = p - c
    d5, d6 = (ab * cp).sum(1), (ac * cp).sum(1)
    va = d3 * d6 - d5 * d4
    vb = d5 * d2 - d1 * d6
    vc = d1 * d4 - d3 * d2
    salida = np.empty_like(p)
    hecho = np.zeros(len(p), bool)

    def poner(cond, valor):
        nonlocal hecho
        cond = cond & ~hecho
        salida[cond] = valor[cond] if np.ndim(valor) == 2 else valor
        hecho |= cond

    poner((d1 <= 0) & (d2 <= 0), a)
    poner((d3 >= 0) & (d4 <= d3), b)
    poner((d6 >= 0) & (d5 <= d6), c)
    with np.errstate(divide='ignore', invalid='ignore'):
        v_ab = d1 / (d1 - d3)
        poner((vc <= 0) & (d1 >= 0) & (d3 <= 0), a + v_ab[:, None] * ab)
        w_ac = d2 / (d2 - d6)
        poner((vb <= 0) & (d2 >= 0) & (d6 <= 0), a + w_ac[:, None] * ac)
        w_bc = (d4 - d3) / ((d4 - d3) + (d5 - d6))
        poner((va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0), b + w_bc[:, None] * (c - b))
        den = 1.0 / (va + vb + vc)
        v_ = vb * den
        w_ = vc * den
        poner(np.ones(len(p), bool), a + ab * v_[:, None] + ac * w_[:, None])
    return salida


def meter_lo_que_asoma(v, f, origen, valor, gradiente, pasadas=12):
    """
    Lleva hacia dentro, a lo largo de su normal, cada vértice que queda más de `ASOMA_COMO_MUCHO` fuera del hueso de
    origen, y suaviza ese empuje con sus vecinos para que no quede un escalón. Devuelve la malla y cuántos movió.
    """
    media = vecinos(len(v), f)
    movidos = np.zeros(len(v), bool)
    for _ in range(pasadas):
        d = origen.distancia(v)
        sobra = np.maximum(0.0, d - ASOMA_COMO_MUCHO)
        if not (sobra > 0).any():
            break
        movidos |= sobra > 0
        # El empuje se reparte un poco con los vecinos y se queda con el mayor de los dos, para que meter un vértice no
        # deje a su lado otro asomando, ni un hoyo puntual en la superficie lisa.
        empuje = np.maximum(sobra, 0.5 * (media @ sobra))
        n = M.normales_de_vertices(v, f)
        v = v - (empuje * 1.05)[:, None] * n
    return v, int(movidos.sum())


# ----------------------------------------------------------------------------------------------- el canal


def perfil_del_grosor(dentro_suave, rejilla, centro, direccion, lo, hi):
    """
    El grosor de la cortical a lo largo del eje, en tramos de un milímetro: `GROSOR_DE_LA_CORTICAL` por el ancho del hueso
    en esa altura (el doble de lo más hondo que se llega dentro), suavizado, y creciendo en cuadrado más allá de la
    diáfisis para que el canal se cierre en cúpula en `CUPULA`.
    """
    profundo = dentro_suave > 0
    idx = np.nonzero(profundo)
    puntos = np.asarray(rejilla.origen) + (np.stack(idx, 1) + 0.5) * rejilla.h
    s = (puntos - centro) @ direccion
    hondo = dentro_suave[idx]
    tramo = 0.001
    s0 = s.min()
    bins = np.floor((s - s0) / tramo).astype(int)
    radio = np.zeros(bins.max() + 1)
    np.maximum.at(radio, bins, hondo)
    # Una media de 9 mm a lo largo: el ancho de una altura a la siguiente cambia por un tubérculo, y el canal no tiene
    # por qué seguirlo.
    radio = ndi.uniform_filter1d(radio, 9, mode='nearest')
    ejes = s0 + (np.arange(len(radio)) + 0.5) * tramo
    grosor = np.clip(GROSOR_DE_LA_CORTICAL * 2 * radio, GROSOR_MINIMO, GROSOR_MAXIMO)
    # Más allá de la diáfisis el grosor crece hasta cerrar el canal: a `CUPULA` del borde, el radio que le quedaba.
    for borde, lado in ((lo, -1), (hi, 1)):
        k = int(np.clip(np.searchsorted(ejes, borde), 0, len(ejes) - 1))
        queda = max(radio[k] - grosor[k], 0.0005)
        fuera = np.maximum(0.0, (ejes - borde) * lado)
        grosor = grosor + queda * (fuera / CUPULA) ** 2 * (fuera > 0)
    return ejes, grosor, radio


def canal(valores, rejilla, centro, direccion, lo, hi, paso):
    """
    La superficie del canal: el cero de `campo + grosor(s)`, redondeado con `REDONDEO`, solo de la diáfisis, con las
    caras hacia el canal.
    """
    ejes, grosor, radio = perfil_del_grosor(-valores, rejilla, centro, direccion, lo, hi)

    def grosor_en(p):
        return np.interp((p - centro) @ direccion, ejes, grosor)

    # El campo del canal en la rejilla fina: solo hace falta donde el hueso es lo bastante hondo para tener canal.
    forma = valores.shape
    puntos_s = [np.asarray(rejilla.origen)[d] + (np.arange(forma[d]) + 0.5) * rejilla.h for d in range(3)]
    s = (
        (puntos_s[0][:, None, None] - centro[0]) * direccion[0]
        + (puntos_s[1][None, :, None] - centro[1]) * direccion[1]
        + (puntos_s[2][None, None, :] - centro[2]) * direccion[2]
    )
    del_canal = (valores + np.interp(s, ejes, grosor)).astype(np.float32)
    del s
    # Se emborrona el campo y no la malla: así lo que se redondea son las esquinas, que es donde el campo hundido hace
    # pico, y la superficie sigue sobre un campo del que Newton sabe el gradiente.
    del_canal = C.suavizar(del_canal, REDONDEO / rejilla.h).astype(np.float32)
    fino = CampoFino(del_canal, rejilla)
    v, f = superficie(del_canal, rejilla, paso, fino.en, fino.gradiente)
    # `superficie` las deja mirando fuera de lo negativo, que aquí es el canal: se vuelven para que miren hacia dentro
    # de él, fuera del hueso, y la pieza siga siendo el sólido de la cortical.
    return v, f[:, ::-1].copy(), (ejes, grosor, radio)


def seccion(v, f, s_v, s0):
    """Dónde corta el plano `s = s0` la malla: un segmento, con sus dos puntos, por cada triángulo que lo cruza."""
    d = s_v[f] - s0
    neg = d < 0
    cruza = neg.any(axis=1) & ~neg.all(axis=1)
    t, dd, nn = f[cruza], d[cruza], neg[cruza]
    puntos = np.zeros((len(t), 2, 3))
    cuantos = np.zeros(len(t), np.int64)
    for i, j in ((0, 1), (1, 2), (2, 0)):
        corta = np.nonzero(nn[:, i] != nn[:, j])[0]
        a, b = v[t[corta, i]], v[t[corta, j]]
        w = dd[corta, i] / (dd[corta, i] - dd[corta, j])
        puntos[corta, cuantos[corta]] = a + w[:, None] * (b - a)
        cuantos[corta] += 1
    return puntos


def circulo_inscrito(a, b, paso=PASO_DEL_CIRCULO):
    """
    El radio y el centro del mayor círculo que cabe en la sección cuyo contorno son los segmentos `a`–`b` (en 2D).

    Por fuerza bruta, en una rejilla de `paso` y después en dos más finas alrededor del mejor: dentro por la paridad de
    un rayo, y la distancia al segmento más cercano. La sección del canal no es un círculo, y la distancia desde su
    centroide, que fue lo primero que se probó, da en un triángulo bastante menos que el círculo que de verdad cabe.
    """
    ab = b - a
    largo2 = np.maximum((ab * ab).sum(axis=1), 1e-18)

    def dentro(p):
        ay, by = a[None, :, 1], b[None, :, 1]
        py = p[:, 1:2]
        cruza = (ay > py) != (by > py)
        with np.errstate(divide='ignore', invalid='ignore'):
            x = a[None, :, 0] + (py - ay) / (by - ay) * ab[None, :, 0]
        return ((cruza & (x > p[:, 0:1])).sum(axis=1) % 2) == 1

    def distancia(p):
        t = np.clip(((p[:, None, :] - a[None]) * ab[None]).sum(axis=2) / largo2[None], 0.0, 1.0)
        q = a[None] + t[..., None] * ab[None]
        return np.linalg.norm(p[:, None, :] - q, axis=2).min(axis=1)

    bajo, alto = np.minimum(a, b).min(axis=0), np.maximum(a, b).max(axis=0)
    xs, ys = np.arange(bajo[0], alto[0], paso), np.arange(bajo[1], alto[1], paso)
    candidatos = np.stack(np.meshgrid(xs, ys, indexing='ij'), axis=-1).reshape(-1, 2)
    candidatos = candidatos[dentro(candidatos)]
    if not len(candidatos):
        return None, None
    r = distancia(candidatos)
    centro, radio = candidatos[np.argmax(r)], float(r.max())
    for fino in (paso / 5, paso / 25):
        malla = np.arange(-5, 6) * fino
        cerca = centro + np.stack(np.meshgrid(malla, malla, indexing='ij'), axis=-1).reshape(-1, 2)
        cerca = cerca[dentro(cerca)]
        r = distancia(cerca)
        if r.max() > radio:
            centro, radio = cerca[np.argmax(r)], float(r.max())
    return radio, centro


def istmo(vc, fc, centro, direccion, lo, hi):
    """
    El istmo: lo más estrecho del canal en la diáfisis. Cada `TRAMO_DEL_ISTMO` a lo largo del eje, el diámetro del mayor
    círculo que cabe en la sección del canal; de todas las secciones entre los dos cuadrados de Heim, la menor. Es lo
    que pasa una fresa sin tocar la cortical, que es lo que pregunta el simulador (`juzgarElFresado`). Devuelve el
    diámetro y a qué altura del eje está, o `(None, None)` si no hay canal en la diáfisis.
    """
    u = np.cross(direccion, [1.0, 0.0, 0.0])
    if np.linalg.norm(u) < 0.1:
        u = np.cross(direccion, [0.0, 1.0, 0.0])
    u /= np.linalg.norm(u)
    w = np.cross(direccion, u)
    s_v = (vc - centro) @ direccion
    menor, donde = np.inf, None
    for s0 in np.arange(lo + TRAMO_DEL_ISTMO / 2, hi, TRAMO_DEL_ISTMO):
        p = seccion(vc, fc, s_v, s0)
        if len(p) < 8:
            continue
        a = np.stack([(p[:, 0] - centro) @ u, (p[:, 0] - centro) @ w], axis=1)
        b = np.stack([(p[:, 1] - centro) @ u, (p[:, 1] - centro) @ w], axis=1)
        radio, _ = circulo_inscrito(a, b)
        if radio is not None and 2 * radio < menor:
            menor, donde = 2 * radio, float(s0)
    return (None, None) if not np.isfinite(menor) else (float(menor), donde)


# ----------------------------------------------------------------------------------------------- un hueso


def aristas_unicas(f):
    e = np.sort(np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
    return np.unique(e, axis=0, return_counts=True)


def rehacer(id_, pieza, v0, f0, dicho):
    caja = M.caja_de(v0)
    rejilla = C.Rejilla.sobre(caja[0], caja[1], VOXEL_FINO, MARGEN)
    dentro, impares = rellenar_por_paridad(v0, f0, rejilla)
    if impares:
        dicho(f'  aviso: {impares} columnas cruzan la malla un número impar de veces')
    volumen_relleno = C.volumen_de_la_mascara(dentro, rejilla.h) * 1000
    volumen_malla = M.volumen_con_signo(v0, f0) * 1e6
    sdf = C.campo_con_signo(dentro, rejilla.h)
    suave = C.suavizar(sdf, SUAVIZADO / rejilla.h)
    del sdf
    fino = CampoFino(suave, rejilla)
    origen = Origen(v0, f0, dentro, rejilla)

    v, f = superficie(suave, rejilla, LADO, fino.en, fino.gradiente)
    d = origen.distancia(v)
    antes = (float(d.max()), float(np.percentile(d, 1)))
    v, movidos = meter_lo_que_asoma(v, f, origen, fino.en, fino.gradiente)
    d = origen.distancia(v)
    centro, direccion = eje_del_hueso(v, f)
    proximal, lo, hi, distal = diafisis_de_heim(v, centro, direccion)

    vc, fc, (ejes, grosor, radio) = canal(suave, rejilla, centro, direccion, lo, hi, LADO)
    # El grosor de verdad: lo hondo que queda cada vértice del canal bajo la superficie lisa.
    cortical = -fino.en(vc)
    s_canal = (vc - centro) @ direccion
    en_la_diafisis = (s_canal > lo) & (s_canal < hi)
    ancho, donde = istmo(vc, fc, centro, direccion, lo, hi)

    # Las dos cáscaras en una pieza: la de fuera primero, como la piel, y el canal después.
    n_fuera = len(v)
    todo_v = np.vstack([v, vc])
    todo_f = np.vstack([f, fc + n_fuera])
    nor = np.vstack([M.normales_de_vertices(v, f), M.normales_de_vertices(vc, fc)])
    borde_fuera, de_mas_fuera = M.aristas_de_borde(f)
    borde_canal, de_mas_canal = M.aristas_de_borde(fc)
    e, _ = aristas_unicas(f)
    largo = np.linalg.norm(v[e[:, 0]] - v[e[:, 1]], axis=1) * 1000
    medidas = {
        'origen': {'vertices': int(len(v0)), 'triangulos': int(len(f0)), 'volumen_cm3': round(volumen_malla, 2), 'volumen_del_relleno_cm3': round(volumen_relleno, 2)},
        'fuera': {
            'vertices': int(len(v)),
            'triangulos': int(len(f)),
            'arista_mediana_mm': round(float(np.median(largo)), 2),
            'arista_p95_mm': round(float(np.percentile(largo, 95)), 2),
            'arista_maxima_mm': round(float(largo.max()), 2),
            'aristas_de_borde': borde_fuera,
            'aristas_de_mas_de_dos_caras': de_mas_fuera,
            'volumen_cm3': round(M.volumen_con_signo(v, f) * 1e6, 2),
        },
        'respecto_del_origen': {
            'asomaba_mm': round(antes[0] * 1000, 3),
            'vertices_metidos': movidos,
            'asoma_como_mucho_mm': round(float(d.max()) * 1000, 3),
            'mediana_mm': round(float(np.median(d)) * 1000, 3),
            'p1_mm': round(float(np.percentile(d, 1)) * 1000, 3),
            'mas_hondo_mm': round(float(d.min()) * 1000, 3),
        },
        'diafisis': {'proximal_m': round(proximal, 5), 'desde_m': round(lo, 5), 'hasta_m': round(hi, 5), 'distal_m': round(distal, 5)},
        'canal': {
            'vertices': int(len(vc)),
            'triangulos': int(len(fc)),
            'aristas_de_borde': borde_canal,
            'aristas_de_mas_de_dos_caras': de_mas_canal,
            'volumen_cm3': round(M.volumen_con_signo(vc, fc) * 1e6, 2),
            'largo_mm': round(float(np.ptp(s_canal)) * 1000, 1),
            'cortical_minima_mm': round(float(cortical.min()) * 1000, 2),
            'cortical_mediana_en_la_diafisis_mm': round(float(np.median(cortical[en_la_diafisis])) * 1000, 2) if en_la_diafisis.any() else None,
            'istmo_mm': round(ancho * 1000, 1) if ancho else None,
            # Desde el extremo proximal del eje (el de `s` menor), en milímetros: dónde queda lo más estrecho.
            'istmo_desde_el_extremo_mm': round((donde - proximal) * 1000, 1) if ancho else None,
        },
    }
    return todo_v, todo_f, nor, n_fuera, len(f), medidas


def escribir(id_, pieza, v, f, nor, n_fuera, t_fuera, medidas):
    pos = np.asarray(v, '<f4')
    idx = np.asarray(f, '<u4')
    cuerpo = bytearray(pos.tobytes())
    cuerpo += M.normales_a_enteros(nor).tobytes()
    cuerpo += bytes((-len(cuerpo)) % 4)
    cuerpo += idx.tobytes()
    (SALIDA / f'{id_}.bin').write_bytes(bytes(cuerpo))
    minimo, maximo = M.caja_de(pos.astype(np.float64))
    return {
        'id': id_,
        'nombre': pieza['nombre'],
        'vertices': int(len(pos)),
        'indices': int(idx.size),
        # Dónde empieza el canal: los vértices y los índices de la cara de fuera van primero.
        'canal': {'vertice': int(n_fuera), 'indice': int(3 * t_fuera)},
        'caja': [[float(x) for x in minimo], [float(x) for x in maximo]],
        'medidas': medidas,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[1])
    parser.add_argument('--ids', nargs='*', default=list(HUESOS))
    args = parser.parse_args()
    dicho = dicho_con_tiempo()
    SALIDA.mkdir(exist_ok=True)
    origen = huesos_de_origen(set(args.ids))
    registros = []
    for id_ in args.ids:
        pieza, v0, f0 = origen[id_]
        dicho(f'{id_} {pieza["nombre"]}: {len(v0)} vértices de origen')
        v, f, nor, n_fuera, t_fuera, medidas = rehacer(id_, pieza, v0, f0, dicho)
        registros.append(escribir(id_, pieza, v, f, nor, n_fuera, t_fuera, medidas))
        dicho(f'  {json.dumps(medidas, ensure_ascii=False)}')
    previo = SALIDA / 'manifiesto.json'
    todos = {}
    if previo.exists() and set(args.ids) != set(HUESOS):
        todos = {r['id']: r for r in json.loads(previo.read_text(encoding='utf8'))['huesos']}
    for r in registros:
        todos[r['id']] = r
    previo.write_text(
        json.dumps(
            {
                'origen': ORIGEN,
                'parametros': {
                    'voxel_fino_mm': VOXEL_FINO * 1000,
                    'suavizado_mm': SUAVIZADO * 1000,
                    'lado_mm': LADO * 1000,
                    'asoma_como_mucho_mm': ASOMA_COMO_MUCHO * 1000,
                    'grosor_de_la_cortical': GROSOR_DE_LA_CORTICAL,
                    'grosor_minimo_mm': GROSOR_MINIMO * 1000,
                    'grosor_maximo_mm': GROSOR_MAXIMO * 1000,
                    'cupula_mm': CUPULA * 1000,
                    'redondeo_mm': REDONDEO * 1000,
                },
                'huesos': [todos[i] for i in HUESOS if i in todos],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding='utf8',
    )
    dicho(f'Escrito {previo}')


if __name__ == '__main__':
    main()

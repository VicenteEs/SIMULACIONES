"""
Dónde están sobre la piel los puntos que se pigmentan (D-227): codos, rodillas, nudillos, pezones, ombligo...

    python scripts/atlas/pigmentacion/medir.py

Escribe `src/atlas/referenciasDelCuerpo.json`: un punto por zona, en las coordenadas del atlas (metros, Y hacia
arriba, el lado derecho del sujeto en x negativa), ya **sobre la superficie de la piel**. Lo lee
`src/atlas/pigmentacion.ts` y lo vigila `tests/unit/pigmentacion.test.ts`, que comprueba que cada punto sigue a
menos de unos milímetros de la piel: si el atlas se regenera y un punto queda en el aire, falla ahí y no con una
mancha en el codo equivocado.

**Por qué se miden y no se escriben a mano.** Un codo «a 1,12 m de altura» se acierta en la altura y se falla en
los dos centímetros que separan la mancha de la piel de verdad. Aquí cada punto sale de un hueso o de una pieza
que el atlas ya trae (el olécranon es el extremo de arriba del cúbito, el nudillo es el de abajo del metacarpiano)
y de lo que la piel hace delante de él: el punto es el primero que la piel tiene al salir del hueso en la dirección
en que el tejido se ve (atrás para el codo, delante para la rodilla, al dorso para los nudillos).

Solo cuenta la cáscara de fuera de la piel: la piel del atlas tiene también la cara de dentro (D-224), pegada al
hueso, y un punto «el primero que sale del hueso» se quedaría ahí.
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / 'fascias'))

from atlas import RAIZ, Atlas  # noqa: E402

SALIDA = RAIZ / 'src' / 'atlas' / 'referenciasDelCuerpo.json'

A = Atlas()


def cascara_de_fuera(pos, idx):
    """Los vértices de las cáscaras de volumen positivo: el cuerpo y las dos orejas, sin la cara de dentro."""
    n = len(pos)
    e = np.vstack([idx[:, [0, 1]], idx[:, [1, 2]]])
    grafo = sparse.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n))
    _, etiqueta = connected_components(grafo, directed=False)
    fuera = np.zeros(n, bool)
    for c in np.unique(etiqueta):
        caras = idx[etiqueta[idx[:, 0]] == c]
        a, b, d = pos[caras[:, 0]], pos[caras[:, 1]], pos[caras[:, 2]]
        if np.einsum('ij,ij->i', a, np.cross(b, d)).sum() > 0:
            fuera |= etiqueta == c
    return fuera


_pos, _idx = A.malla(A.por_nombre('Skin')[0])
PIEL = _pos.astype(np.float64)
_fuera = cascara_de_fuera(PIEL, _idx.astype(np.int64))
PIEL_FUERA = PIEL[_fuera]
ARBOL = cKDTree(PIEL_FUERA)


def pieza(nombre):
    p = A.por_nombre(nombre)
    if not p:
        raise SystemExit(f'No hay pieza «{nombre}» en el atlas.')
    v, _ = A.malla(p[0])
    return v.astype(np.float64)


def extremo(nombre, arriba, fraccion=0.12):
    """El centro del extremo de arriba (o de abajo) de un hueso largo, por su altura."""
    v = pieza(nombre)
    lo, hi = v[:, 1].min(), v[:, 1].max()
    corte = (hi - lo) * fraccion
    m = v[:, 1] >= hi - corte if arriba else v[:, 1] <= lo + corte
    return v[m].mean(axis=0)


def sobre_la_piel(ancla, direccion, radio=0.014, alcance=0.14):
    """
    El primer punto de la piel de fuera que se encuentra saliendo de `ancla` en `direccion`.

    Entre los vértices a menos de `radio` del rayo, el más lejano en esa dirección dentro de `alcance`: la piel
    de un codo es convexa, y el más lejano del hueso hacia atrás es la punta.
    """
    d = np.asarray(direccion, float)
    d /= np.linalg.norm(d)
    rel = PIEL_FUERA - ancla
    t = rel @ d
    lateral = np.linalg.norm(rel - np.outer(t, d), axis=1)
    m = (t > 0) & (t < alcance) & (lateral < radio)
    if not m.any():
        raise SystemExit(f'Ningún punto de piel saliendo de {ancla} hacia {direccion}.')
    i = np.where(m)[0][np.argmax(t[m])]
    return PIEL_FUERA[i]


def cercano(punto):
    return PIEL_FUERA[ARBOL.query(punto)[1]]


def redondear(p):
    return [round(float(c), 4) for c in p]


puntos = {}
ATRAS, ADELANTE, DORSO = (0, 0, -1), (0, 0, 1), (0, 0, -1)

for lado, nombre_lado, signo in (('derecho', 'Right', -1), ('izquierdo', 'Left', 1)):
    # Codo: la punta del olécranon, el extremo de arriba del cúbito, y la piel que lo cubre por detrás.
    puntos[f'codo-{lado}'] = redondear(sobre_la_piel(extremo(f'{nombre_lado} ulna', True, 0.04), ATRAS))
    # Rodilla: la rótula y la piel que la cubre por delante.
    rotula = pieza(f'{nombre_lado} patella').mean(axis=0)
    puntos[f'rodilla-{lado}'] = redondear(sobre_la_piel(rotula, ADELANTE, 0.02))
    # Talón: la piel por detrás y por debajo del calcáneo.
    calcaneo = pieza(f'{nombre_lado} calcaneus')
    talon = calcaneo[np.argmin(calcaneo[:, 1] - 0.3 * calcaneo[:, 2])]
    puntos[f'talon-{lado}'] = redondear(sobre_la_piel(talon + [0, 0.012, 0.012], (0, -0.5, -1), 0.016))

    # Mano: palmas hacia delante en la posición anatómica del atlas, así que el dorso mira atrás (−z).
    dedos = {'pulgar': 'thumb', 'indice': 'index finger', 'medio': 'middle finger', 'anular': 'ring finger', 'menique': 'little finger'}
    lado_en_minuscula = nombre_lado.lower()
    for dedo, en_ingles in dedos.items():
        falanges = [
            f'Proximal phalanx of {lado_en_minuscula} {en_ingles}',
            f'Middle phalanx of {lado_en_minuscula} {en_ingles}',
            f'Distal phalanx of {lado_en_minuscula} {en_ingles}',
        ]
        # El pulgar no tiene falange media.
        falanges = [f for f in falanges if A.por_nombre(f)]
        if dedo != 'pulgar':
            ordinal = {'indice': 'second', 'medio': 'third', 'anular': 'fourth', 'menique': 'fifth'}[dedo]
            metacarpo = f'{nombre_lado} {ordinal} metacarpal bone'
        else:
            metacarpo = f'{nombre_lado} first metacarpal bone'
        # La cabeza del metacarpiano es su extremo de abajo: la mano cuelga.
        puntos[f'nudillo-{dedo}-{lado}'] = redondear(sobre_la_piel(extremo(metacarpo, False, 0.1), DORSO, 0.012))
        for k, falange in enumerate(falanges):
            # Las articulaciones entre falanges: el extremo de abajo de cada una menos la última.
            if k < len(falanges) - 1:
                nombre_art = 'interfalangica-proximal' if k == 0 else 'interfalangica-distal'
                if dedo == 'pulgar':
                    nombre_art = 'interfalangica-distal'
                puntos[f'{nombre_art}-{dedo}-{lado}'] = redondear(sobre_la_piel(extremo(falange, False, 0.1), DORSO, 0.01))
        # La yema: la piel por debajo del extremo de la última falange.
        yema = extremo(falanges[-1], False, 0.08)
        puntos[f'yema-{dedo}-{lado}'] = redondear(sobre_la_piel(yema, (0, -1, 0.4), 0.01, 0.05))

    # Pie: los dedos y la planta.
    for k, etiqueta in enumerate(('primer', 'segundo', 'tercer', 'cuarto', 'quinto')):
        ordinal = ('first', 'second', 'third', 'fourth', 'fifth')[k]
        hueso = f'{nombre_lado} {ordinal} metatarsal bone'
        v = pieza(hueso)
        cabeza = v[v[:, 2] >= v[:, 2].max() - 0.01].mean(axis=0)
        puntos[f'metatarso-{etiqueta}-{lado}'] = redondear(sobre_la_piel(cabeza, (0, -1, 0.1), 0.012, 0.06))

    # Ojo: el centro del globo y su piel alrededor se miden sobre el contorno de la rendija, en pigmentacion.ts.
    esclera = pieza(f'{nombre_lado} sclera')
    # La esclera de la derecha trae un vértice perdido al otro lado de la cara: se toma la caja sin esos.
    m = np.sign(esclera[:, 0]) == signo
    puntos[f'ojo-{lado}'] = redondear(esclera[m].mean(axis=0))

# Cara
nariz = PIEL_FUERA[(np.abs(PIEL_FUERA[:, 0]) < 0.02) & (PIEL_FUERA[:, 1] > 1.52) & (PIEL_FUERA[:, 1] < 1.65)]
puntos['punta-de-la-nariz'] = redondear(nariz[np.argmax(nariz[:, 2])])
# Por debajo del labio de abajo (que termina en y = 1,52): la ventana llegaba a 1,55 y el punto más adelantado era la base
# de la nariz, que asoma sobre la boca; el mentón se medía 3 cm por encima de donde está (D-228).
menton = PIEL_FUERA[(np.abs(PIEL_FUERA[:, 0]) < 0.02) & (PIEL_FUERA[:, 1] > 1.46) & (PIEL_FUERA[:, 1] < 1.512) & (PIEL_FUERA[:, 2] > 0.04)]
puntos['menton'] = redondear(menton[np.argmax(menton[:, 2])])
for lado, nombre_lado in (('derecho', 'Right'), ('izquierdo', 'Left')):
    cigoma = pieza(f'{nombre_lado} zygomatic bone')
    centro = cigoma.mean(axis=0)
    puntos[f'pomulo-{lado}'] = redondear(sobre_la_piel(centro, (0, 0.2, 1), 0.012, 0.06))

# Tronco: los pezones se ven en la vista de frente (se midieron con una vista ortogonal) y el ombligo es el
# hundimiento de la línea media del abdomen.
for lado, signo in (('derecho', -1), ('izquierdo', 1)):
    puntos[f'pezon-{lado}'] = redondear(sobre_la_piel(np.array([signo * 0.1065, 1.283, 0.0]), ADELANTE, 0.006, 0.2))
cavidad = PIEL_FUERA[(np.abs(PIEL_FUERA[:, 0]) < 0.03) & (PIEL_FUERA[:, 1] > 0.95) & (PIEL_FUERA[:, 1] < 1.12) & (PIEL_FUERA[:, 2] > 0.0)]
vecinos = [ARBOL.query_ball_point(p, 0.03) for p in cavidad]
profundidad = np.array([p[2] - PIEL_FUERA[v, 2].mean() for p, v in zip(cavidad, vecinos)])
puntos['ombligo'] = redondear(cavidad[np.argmin(profundidad)])

# Axilas: la piel del hueco entre el brazo y el tórax, bajo la cabeza del húmero.
for lado, nombre_lado, signo in (('derecho', 'Right', -1), ('izquierdo', 'Left', 1)):
    humero = pieza(f'{nombre_lado} humerus')
    cabeza = humero[np.argmax(humero[:, 1])]
    puntos[f'axila-{lado}'] = redondear(cercano(cabeza + [-signo * 0.02, -0.07, 0.0]))

# Pelvis
puntos['pubis'] = redondear(sobre_la_piel(np.array([0, 0.9, 0.0]), ADELANTE, 0.012, 0.2))
glande = pieza('Glans penis')
puntos['glande'] = redondear(glande.mean(axis=0))

# Orejas: el centro del hélix visto desde el lado.
oreja = pieza('External ear')
for lado, signo in (('derecho', -1), ('izquierdo', 1)):
    m = np.sign(oreja[:, 0]) == signo
    puntos[f'oreja-{lado}'] = redondear(oreja[m].mean(axis=0))

# Labios: la pieza «Lip» entera.
labio = pieza('Lip')
puntos['labios'] = redondear(labio.mean(axis=0))

SALIDA.write_text(json.dumps(puntos, indent=2, ensure_ascii=False) + '\n', encoding='utf8')
print(f'{len(puntos)} puntos en {SALIDA.relative_to(RAIZ)}')
for nombre, p in puntos.items():
    d = np.linalg.norm(cercano(np.array(p)) - np.array(p)) * 1000
    print(f'  {nombre:34s} {p}  a {d:.1f} mm de la piel')

"""
La forma de la piel nueva del atlas, lisa y sin holgura todavía (D-224).

    python scripts/atlas/piel/generar.py

Deja en `scripts/atlas/piel/salida/` la piel como `piel.bin` y `manifiesto.json`. Lo que la pone en el
atlas, después de darle holgura sobre todo lo de dentro y comprobarla, es
`node scripts/atlas/recalcular-piel.mjs` (ver allí). Son dos pasos y en dos lenguajes por lo mismo
que las fascias: la oreja se calcula con un campo de distancia y eso pide `scipy`, y la holgura se
comprueba con el buscador de `geometriaDePiel.mjs`, que es el que vigila la prueba
(`tests/unit/geometriaDePiel.test.ts`). Así lo que se comprueba al escribir es lo mismo que se
comprueba después.

**Por qué la piel se veía tosca y cuadrada.** La de BodyParts3D tiene once mil vértices para un
cuerpo de 1,72 m: aristas de 9 a 16 mm de mediana y de hasta 35 en el tronco. Cada cara es un plano
que se ve, y el sombreado por vértice no lo disimula en el contorno. Y el ajuste de D-159 la empujaba
hasta 12 mm a lo largo de la normal de esos vértices tan separados: un empuje en un vértice es una
pirámide de 3 cm de base. La oreja, además, no tenía forma: en la piel son unos treinta vértices, un
bulto, y la oreja anatómica asomaba por él hasta 18 mm.

**Qué hace, en orden.**

1. Parte de la piel **original** de BodyParts3D, la de antes de D-159, que se lee del historial de
   git (`ORIGEN`). Partir de la ajustada sería suavizar sus pirámides en vez de no hacerlas.
2. Se queda con la cáscara de fuera (la de dentro se rehace al final, en Node, a partir de esta).
3. Aplana el bulto de cada oreja: los vértices a menos de `RADIO_DEL_BULTO` de la oreja anatómica se
   recolocan con un relleno bi-armónico de su entorno, que es lo que haría una membrana tensa sobre
   el hueco. La oreja de verdad va encima, como cáscara aparte.
4. Una subdivisión de Loop sobre todo el cuerpo: cada triángulo en cuatro y cada vértice hacia la
   media de sus vecinos. Es lo que convierte las caras planas en una superficie curva.
5. Parte las aristas que siguen siendo largas hasta un largo que depende de la zona: 4 mm en la
   cabeza, 5,5 en las manos, 6 en los pies y 11 en lo demás (máximos: el refinado rojo-verde deja la
   mayoría en la mitad). Más fino en todo sería más archivo y más memoria de la tarjeta sin que se vea:
   un muslo de 7 cm de radio con aristas de 6 mm ya es redondo.
6. Un suavizado de Taubin, que no encoge.
7. Cada oreja, como una cáscara cerrada a `SEPARACION_DE_LA_OREJA` de la oreja anatómica, sacada del
   campo de distancia de esta (con los agujeros de la malla de origen sellados) a medio milímetro de
   resolución. Su base queda dentro de la cabeza, que es como la piel de BodyParts3D ya resuelve las
   orejas y las manos: varias cáscaras que se solapan.

Lo que sale no tiene todavía holgura: la subdivisión de Loop es aproximante y en lo convexo hunde la
superficie uno o dos milímetros. La holgura —y la garantía de que la piel queda por fuera de todo—
la pone `recalcular-piel.mjs`.
"""

import gzip
import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from scipy import sparse
from scipy.sparse.csgraph import connected_components
from scipy.sparse.linalg import spsolve
from scipy.spatial import cKDTree

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / 'fascias'))

import campo as C  # noqa: E402
import malla as M  # noqa: E402
from atlas import RAIZ, Atlas  # noqa: E402

#: El commit con la piel de BodyParts3D tal como llegó (D-155 la devolvió; D-159 la ajustó después).
ORIGEN = '71192c0'
SALIDA = AQUI / 'salida'

#: La oreja anatómica del atlas (`External ear`): las dos orejas en una pieza.
OREJA = 'FJ2811'
#: Hasta dónde llega el bulto de la piel alrededor de la oreja. Medido: a menos de 12 mm de la oreja
#: hay 34 vértices de la piel por lado, y a 16 mm empieza la sien.
RADIO_DEL_BULTO = 0.012
#: A qué distancia de la oreja anatómica queda su piel. Algo menos que la holgura del resto del cuerpo:
#: la piel de la oreja es la más fina, y con más la oreja engorda y pierde el pliegue del hélix.
SEPARACION_DE_LA_OREJA = 0.0012
#: El lado de los voxeles de la oreja. Con 0,9 mm se ven el hélix y la concha; con medio, la oreja pedía
#: treinta mil vértices, casi lo mismo que la cabeza entera, para un detalle que la oreja de origen
#: (aristas de 4 mm) no tiene.
VOXEL_DE_LA_OREJA = 0.0009


def git_show(ruta):
    return subprocess.run(['git', 'show', f'{ORIGEN}:{ruta}'], cwd=RAIZ, check=True, capture_output=True).stdout


def piel_de_origen():
    """Posiciones y triángulos de la piel de BodyParts3D, sin soldar, leídos del historial."""
    catalogo = json.loads(git_show('public/atlas/catalogo.json'))
    piel = next(p for p in catalogo['piezas'] if p['nombre'] == 'Skin')
    paquete = gzip.decompress(git_show(f"public/atlas/{catalogo['paquetes'][piel['paquete']]['archivo']}"))
    pos = np.frombuffer(paquete, '<f4', piel['vertices'] * 3, piel['pos']).reshape(-1, 3).astype(np.float64)
    idx = np.frombuffer(paquete, '<u4', piel['indices'], piel['idx']).reshape(-1, 3).astype(np.int64)
    return pos, idx


def volumen(v, f):
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    return float(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6)


def cascara_exterior(pos, idx):
    """
    La cáscara de fuera, soldada y compacta.

    Las dos cáscaras de BodyParts3D se separan por conectividad **antes** de soldar: soldadas, una arista
    que comparten las une en una sola pieza (se midió). La de fuera es la mayor de volumen positivo.
    """
    n = len(pos)
    e = np.vstack([idx[:, [0, 1]], idx[:, [1, 2]]])
    grafo = sparse.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n))
    _, etiqueta = connected_components(grafo, directed=False)
    mejor, mayor = None, 0
    for c in np.unique(etiqueta):
        caras = idx[etiqueta[idx[:, 0]] == c]
        if volumen(pos, caras) > 0 and len(caras) > mayor:
            mejor, mayor = caras, len(caras)
    return soldar(pos, mejor)


def soldar(pos, f):
    """Une los vértices que comparten posición (a una micra), quita los que sobran y las caras degeneradas."""
    clave = np.round(pos * 1e6).astype(np.int64)
    _, primero, inversa = np.unique(clave, axis=0, return_index=True, return_inverse=True)
    f = inversa.ravel()[f]
    f = f[(f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 2] != f[:, 0])]
    usados = np.unique(f)
    nuevo = -np.ones(len(primero), np.int64)
    nuevo[usados] = np.arange(len(usados))
    return pos[primero][usados], nuevo[f]


# ----------------------------------------------------------------------------- aristas


def aristas(f):
    """
    Las aristas sin repetir, la arista de cada lado de cada cara y cuántas caras tiene cada una.

    El lado k de la cara (a, b, c) va de la esquina k a la k+1: (a, b), (b, c), (c, a).
    """
    m = len(f)
    lados = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    unicas, inversa, cuenta = np.unique(np.sort(lados, axis=1), axis=0, return_inverse=True, return_counts=True)
    return unicas, inversa.ravel().reshape(3, m).T, cuenta


def puntos_de_arista(v, f, unicas, de_la_cara, cuenta):
    """
    Dónde va el vértice nuevo de cada arista, con la regla de Loop: 3/8 de cada extremo y 1/8 de cada
    vértice opuesto. Así el punto nuevo ya cae sobre la superficie curva y no sobre la cuerda.

    En una arista de borde o que tocan más de dos caras no hay dos opuestos, y va al punto medio.
    """
    opuestos = np.zeros((len(unicas), 3))
    for k in range(3):
        np.add.at(opuestos, de_la_cara[:, k], v[f[:, (k + 2) % 3]])
    medio = 0.5 * (v[unicas[:, 0]] + v[unicas[:, 1]])
    loop = 0.75 * medio + 0.125 * opuestos
    return np.where((cuenta == 2)[:, None], loop, medio)


def subdividir_loop(v, f):
    """Una pasada de la subdivisión de Loop: cada triángulo en cuatro, y los vértices viejos a su sitio nuevo."""
    n = len(v)
    unicas, de_la_cara, cuenta = aristas(f)
    nuevos = puntos_de_arista(v, f, unicas, de_la_cara, cuenta)
    # Los vértices viejos: (1 − nβ)·v + β·Σ vecinos, con β de Warren. Los que tocan un borde o una arista
    # rara se quedan quietos: la regla supone una superficie cerrada a su alrededor.
    suma = np.zeros((n, 3))
    grado = np.zeros(n)
    np.add.at(suma, unicas[:, 0], v[unicas[:, 1]])
    np.add.at(suma, unicas[:, 1], v[unicas[:, 0]])
    np.add.at(grado, unicas[:, 0], 1)
    np.add.at(grado, unicas[:, 1], 1)
    quieto = np.zeros(n, bool)
    quieto[unicas[cuenta != 2].ravel()] = True
    beta = np.where(grado == 3, 3 / 16, 3 / (8 * np.maximum(grado, 1)))
    viejos = (1 - grado * beta)[:, None] * v + beta[:, None] * suma
    viejos[quieto] = v[quieto]
    m0, m1, m2 = (n + de_la_cara[:, k] for k in range(3))
    a, b, c = f[:, 0], f[:, 1], f[:, 2]
    caras = np.vstack([np.stack([a, m0, m2], 1), np.stack([b, m1, m0], 1), np.stack([c, m2, m1], 1), np.stack([m0, m1, m2], 1)])
    return np.vstack([viejos, nuevos]), caras


def refinar(v, f, largo_maximo, rondas=8):
    """
    Parte las aristas más largas que `largo_maximo(puntos)` hasta que no quede ninguna (o se acaben las rondas).

    Refinado rojo-verde: una cara con sus tres aristas marcadas se parte en cuatro, con dos en tres y con
    una en dos. Así no queda ningún vértice colgando en medio de la arista de una vecina —una grieta que
    se vería como una línea de luz—. El vértice nuevo va donde dice Loop, no al punto medio.
    """
    for _ in range(rondas):
        unicas, de_la_cara, cuenta = aristas(f)
        largo = np.linalg.norm(v[unicas[:, 0]] - v[unicas[:, 1]], axis=1)
        marcada = largo > largo_maximo(0.5 * (v[unicas[:, 0]] + v[unicas[:, 1]]))
        if not marcada.any():
            break
        n = len(v)
        indice = -np.ones(len(unicas), np.int64)
        indice[marcada] = n + np.arange(int(marcada.sum()))
        v = np.vstack([v, puntos_de_arista(v, f, unicas, de_la_cara, cuenta)[marcada]])
        marcas = marcada[de_la_cara]  # M×3: si el lado k de cada cara se parte
        cuantas = marcas.sum(axis=1)
        caras = [f[cuantas == 0]]

        def girar(sel, k):
            """Las caras `sel` con sus esquinas y lados girados k pasos: el lado k pasa a ser el 0."""
            orden = [(k + j) % 3 for j in range(3)]
            return f[sel][:, orden], de_la_cara[sel][:, orden]

        # Una marcada: se gira para que sea el lado 0 (a, b), y se une su punto con c.
        for k in range(3):
            sel = (cuantas == 1) & marcas[:, k]
            if sel.any():
                ff, ee = girar(sel, k)
                m = indice[ee[:, 0]]
                caras += [np.stack([ff[:, 0], m, ff[:, 2]], 1), np.stack([m, ff[:, 1], ff[:, 2]], 1)]
        # Dos marcadas: se gira para que la sana sea el lado 2 (c, a). Queda un triángulo en b y un
        # cuadrilátero a, m0, m1, c, que se corta por su diagonal más corta.
        for k in range(3):
            sel = (cuantas == 2) & ~marcas[:, (k + 2) % 3]
            if sel.any():
                ff, ee = girar(sel, k)
                a, b, c = ff[:, 0], ff[:, 1], ff[:, 2]
                m0, m1 = indice[ee[:, 0]], indice[ee[:, 1]]
                caras.append(np.stack([b, m1, m0], 1))
                corta = np.linalg.norm(v[a] - v[m1], axis=1) <= np.linalg.norm(v[m0] - v[c], axis=1)
                caras += [
                    np.stack([a[corta], m0[corta], m1[corta]], 1),
                    np.stack([a[corta], m1[corta], c[corta]], 1),
                    np.stack([a[~corta], m0[~corta], c[~corta]], 1),
                    np.stack([m0[~corta], m1[~corta], c[~corta]], 1),
                ]
        sel = cuantas == 3
        if sel.any():
            a, b, c = f[sel, 0], f[sel, 1], f[sel, 2]
            m0, m1, m2 = (indice[de_la_cara[sel, k]] for k in range(3))
            caras += [np.stack([a, m0, m2], 1), np.stack([b, m1, m0], 1), np.stack([c, m2, m1], 1), np.stack([m0, m1, m2], 1)]
        f = np.vstack(caras)
    return v, f


# ------------------------------------------------------------------------- la oreja


def laplaciana(n, f):
    unicas, _, _ = aristas(f)
    filas = np.concatenate([unicas[:, 0], unicas[:, 1]])
    cols = np.concatenate([unicas[:, 1], unicas[:, 0]])
    ady = sparse.coo_matrix((np.ones(len(filas)), (filas, cols)), shape=(n, n)).tocsr()
    grado = np.asarray(ady.sum(axis=1)).ravel()
    return (sparse.diags(grado) - ady).tocsr()


def aplanar(v, f, region):
    """
    Recoloca los vértices de `region` como una membrana bi-armónica sobre su entorno.

    Bi-armónica y no armónica: la armónica (la media de los vecinos) deja un pliegue en el borde de la
    región; la bi-armónica sigue la curvatura de lo que la rodea, y la sien sigue siendo redonda.
    """
    if not region.any():
        return v
    L = laplaciana(len(v), f)
    B = (L.T @ L).tocsr()
    dentro = np.flatnonzero(region)
    fuera = np.flatnonzero(~region)
    A = B[dentro][:, dentro]
    derecha = -(B[dentro][:, fuera] @ v[fuera])
    v = v.copy()
    v[dentro] = np.column_stack([spsolve(A.tocsc(), derecha[:, k]) for k in range(3)])
    return v


def cascara_de_la_oreja(vo, fo):
    """
    La piel de una oreja: una superficie cerrada a `SEPARACION_DE_LA_OREJA` de la oreja anatómica.

    La malla de origen no está cerrada —son varias láminas con agujeros y una base abierta—, así que no
    se puede desplazar a lo largo de sus normales. Se rellena su volumen con la inundación de `campo.py`
    (que sella las grietas de hasta un milímetro), se calcula la distancia con signo a ese relleno, y la
    piel es donde esa distancia vale la separación.
    """
    h = VOXEL_DE_LA_OREJA
    rejilla = C.Rejilla.sobre(vo.min(0), vo.max(0), h, margen=0.006)
    puntos = C.muestrear_superficie(vo, fo, 0.5 * h, semilla=2811)
    relleno = C.rellenar(C.ocupar(rejilla, puntos), engrosar=2)
    distancia = C.suavizar(C.campo_con_signo(relleno, h), 1.0)
    v, f = C.superficie_de_la_rejilla(distancia, rejilla, C.nivel_de_la_superficie(SEPARACION_DE_LA_OREJA, h))
    v = M.suavizar_taubin(v, f, 12)
    # Lo que quede suelto (una burbuja dentro de un pliegue) no es piel.
    v, f = M.quitar_componentes_pequenas(v, f, 0.2)
    return v, f.astype(np.int64)


# ---------------------------------------------------------------------- las zonas


def largo_maximo_para(v):
    """
    El largo máximo de arista según la zona, en metros, a partir de la piel de origen.

    La cabeza empieza en el mentón; las manos son lo que queda por debajo de las muñecas a los lados, y
    los pies, lo que está por debajo de los tobillos. Se miden en la piel y no se escriben a mano: si el
    atlas cambiara de sujeto, las zonas lo seguirían.
    """
    alto = v[:, 1].max()
    cabeza = 0.865 * alto  # el mentón del sujeto de BodyParts3D (1,72 m) está a 1,49 m
    ancho = np.abs(v[:, 0]).max()
    lado_de_las_manos = 0.62 * ancho  # el ancho de las caderas, medido: más afuera ya solo hay brazos
    alto_de_las_munecas = 0.53 * alto
    tobillo = 0.07 * alto

    def largo(p):
        x, y = np.abs(p[:, 0]), p[:, 1]
        l = np.full(len(p), 0.011)
        l = np.where(y < tobillo, 0.006, l)
        l = np.where((x > lado_de_las_manos) & (y < alto_de_las_munecas), 0.0055, l)
        l = np.where(y > cabeza, 0.004, l)
        return l

    return largo


def normales_de_vertices(v, f):
    return M.normales_de_vertices(v, f)


# -------------------------------------------------------------------- principal


def main():
    t0 = time.time()
    SALIDA.mkdir(exist_ok=True)

    def dicho(texto):
        print(f'[{time.time() - t0:5.0f} s] {texto}', flush=True)

    pos, idx = piel_de_origen()
    v, f = cascara_exterior(pos, idx)
    dicho(f'Piel de origen ({ORIGEN}): cáscara de fuera, {len(v):,} vértices y {len(f):,} triángulos')

    atlas = Atlas()
    vo, fo = atlas.malla(OREJA)
    vo = vo.astype(np.float64)
    fo = fo.astype(np.int64)

    region = cKDTree(vo).query(v)[0] < RADIO_DEL_BULTO
    v = aplanar(v, f, region)
    dicho(f'Bulto de las orejas aplanado: {int(region.sum())} vértices')

    v, f = subdividir_loop(v, f)
    dicho(f'Loop: {len(v):,} vértices')
    # La cáscara de dentro se hace en Node con estas caras: el refinado solo añade vértices al final, así que
    # los de esta malla siguen siendo los primeros de la fina y se mueven con ella.
    gruesa = f.copy()
    v, f = refinar(v, f, largo_maximo_para(pos))
    dicho(f'Refinada por zonas: {len(v):,} vértices, {len(f):,} triángulos')
    v = M.suavizar_taubin(v, f, 6)
    unicas, _, cuenta = aristas(f)
    largo = np.linalg.norm(v[unicas[:, 0]] - v[unicas[:, 1]], axis=1)
    dicho(f'Aristas: mediana {np.median(largo) * 1000:.1f} mm, p99 {np.percentile(largo, 99) * 1000:.1f} mm; '
          f'de borde {int((cuenta == 1).sum())}, de más de dos caras {int((cuenta > 2).sum())}')

    cascaras = [('cuerpo', v, f), ('cuerpo grueso', v[: gruesa.max() + 1], gruesa)]
    for nombre, lado in (('oreja izquierda', 1), ('oreja derecha', -1)):
        caras = fo[(vo[fo[:, 0], 0] * lado) > 0]
        usados = np.unique(caras)
        nuevo = -np.ones(len(vo), np.int64)
        nuevo[usados] = np.arange(len(usados))
        ve, fe = cascara_de_la_oreja(vo[usados], nuevo[caras])
        dicho(f'Cáscara de la {nombre}: {len(ve):,} vértices, volumen {volumen(ve, fe) * 1e6:.1f} cm³')
        cascaras.append((nombre, ve, fe))

    # Un solo archivo: las posiciones y los triángulos de cada cáscara, uno detrás de otro.
    trozos, manifiesto, base_v = [], [], 0
    for nombre, ve, fe in cascaras:
        manifiesto.append({'nombre': nombre, 'vertices': int(len(ve)), 'triangulos': int(len(fe)), 'desde': base_v})
        base_v += len(ve)
    posiciones = np.vstack([c[1] for c in cascaras]).astype('<f4')
    triangulos = np.vstack([c[2] + m['desde'] for c, m in zip(cascaras, manifiesto)]).astype('<u4')
    (SALIDA / 'piel.bin').write_bytes(posiciones.tobytes() + triangulos.tobytes())
    (SALIDA / 'manifiesto.json').write_text(
        json.dumps(
            {
                'origen': ORIGEN,
                'vertices': int(len(posiciones)),
                'triangulos': int(len(triangulos)),
                'cascaras': manifiesto,
                'parametros': {
                    'radio_del_bulto_mm': RADIO_DEL_BULTO * 1000,
                    'separacion_de_la_oreja_mm': SEPARACION_DE_LA_OREJA * 1000,
                    'voxel_de_la_oreja_mm': VOXEL_DE_LA_OREJA * 1000,
                },
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding='utf8',
    )
    dicho(f'Escrito {SALIDA / "piel.bin"}: {len(posiciones):,} vértices, {len(triangulos):,} triángulos')


if __name__ == '__main__':
    main()

"""
Mallas de triángulos (P-006, E1): sacar la superficie de un campo, suavizarla, recortarla, espejarla.

Una malla es un par `(v, f)`: `v` son las posiciones (N×3) y `f` los triángulos (M×3, índices a
`v`). **Las caras miran hacia fuera**, con el sentido contrario a las agujas del reloj visto desde
fuera —la convención de glTF y de three—. Todo lo de aquí la conserva, y las pruebas de
`probar.py` la comprueban contra el interior de una esfera y no a ojo: la primera versión de este
motor las sacó al revés (el 92 % miraba hacia dentro) y la malla se veía bien desde fuera hasta
que se le ponía luz.
"""

import numpy as np

# `scipy` se importa dentro de cada función que lo necesita y no aquí arriba: este módulo lo
# importan también los guiones de Blender (`vista_en_blender.py`), cuyo Python trae numpy y no scipy,
# y solo usan lo que no lo necesita (recortar, espejar, normales).

# Las ocho esquinas de una celda, y las doce aristas que las unen.
_ESQUINAS = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0), (0, 0, 1), (1, 0, 1), (0, 1, 1), (1, 1, 1)]
_ARISTAS = [(0, 1), (2, 3), (4, 5), (6, 7), (0, 2), (1, 3), (4, 6), (5, 7), (0, 4), (1, 5), (2, 6), (3, 7)]


# ------------------------------------------------------------- de campo a malla


def superficie_de_un_campo(campo, origen, h, nivel=0.0):
    """
    La superficie donde `campo` vale `nivel`, con *Surface Nets*.

    Por qué este algoritmo y no los cubos marchantes, que son los de siempre: los cubos
    marchantes piden una tabla de 256 casos, y aquí no hay ninguna librería de mallas que la
    traiga. Los *Surface Nets* no piden tabla: ponen **un vértice por celda** que el campo
    cruza —en la media de los puntos donde corta sus aristas— y unen con un cuadrilátero los
    cuatro de las celdas que comparten cada arista que cambia de signo. Salen mallas más
    regulares y suaves que las de los cubos marchantes, que es lo que se quiere para una
    fascia, y caben en unas cincuenta líneas.

    Todo está vectorizado: una pierna entera a 2 mm son unos tres millones de celdas y tarda
    segundos. Un campo con valor exactamente igual a `nivel` cuenta como «fuera».
    """
    campo = np.asarray(campo, np.float32) - np.float32(nivel)
    nx, ny, nz = campo.shape
    esquinas = [campo[dx : nx - 1 + dx, dy : ny - 1 + dy, dz : nz - 1 + dz] for dx, dy, dz in _ESQUINAS]
    dentro = [e < 0 for e in esquinas]
    todas = np.logical_and.reduce(dentro)
    alguna = np.logical_or.reduce(dentro)
    cruzada = alguna & ~todas
    celda = -np.ones(cruzada.shape, np.int64)
    celda[cruzada] = np.arange(int(cruzada.sum()))

    ii, jj, kk = np.nonzero(cruzada)
    suma = np.zeros((len(ii), 3))
    cuenta = np.zeros(len(ii))
    for a, b in _ARISTAS:
        va, vb = esquinas[a][cruzada].astype(np.float64), esquinas[b][cruzada].astype(np.float64)
        corta = (va < 0) != (vb < 0)
        t = np.where(corta, va / np.where(corta, va - vb, 1.0), 0.0)
        pa, pb = np.array(_ESQUINAS[a], float), np.array(_ESQUINAS[b], float)
        punto = pa[None, :] + t[:, None] * (pb - pa)[None, :]
        suma += np.where(corta[:, None], punto, 0.0)
        cuenta += corta
    vertices = np.asarray(origen, float) + (suma / np.maximum(cuenta, 1)[:, None] + np.stack([ii, jj, kk], 1)) * h

    caras = []
    for eje in range(3):
        otros = [d for d in range(3) if d != eje]
        a1, a2 = otros
        # Cada arista de la rejilla de puntos va de p a p + e_eje. Cambia de signo, o no.
        corte_ini = tuple(slice(0, s - 1) if d == eje else slice(None) for d, s in enumerate(campo.shape))
        corte_fin = tuple(slice(1, s) if d == eje else slice(None) for d, s in enumerate(campo.shape))
        p0, p1 = campo[corte_ini], campo[corte_fin]
        cambia = (p0 < 0) != (p1 < 0)
        # Solo las interiores: una arista del borde de la rejilla no tiene las cuatro celdas.
        interior = np.zeros_like(cambia)
        sl = [slice(None)] * 3
        sl[a1] = slice(1, -1)
        sl[a2] = slice(1, -1)
        interior[tuple(sl)] = cambia[tuple(sl)]
        pi, pj, pk = np.nonzero(interior)
        p = np.stack([pi, pj, pk], 1)

        def vecina(d1, d2):
            q = p.copy()
            q[:, a1] += d1
            q[:, a2] += d2
            return celda[q[:, 0], q[:, 1], q[:, 2]]

        c00, c10, c11, c01 = vecina(-1, -1), vecina(0, -1), vecina(0, 0), vecina(-1, 0)
        completa = (c00 >= 0) & (c10 >= 0) & (c11 >= 0) & (c01 >= 0)
        c00, c10, c11, c01 = c00[completa], c10[completa], c11[completa], c01[completa]
        punto_dentro = (p0[tuple(p[completa].T)] < 0)
        cuadro = np.stack([c00, c10, c11, c01], 1)
        # El sentido depende de qué extremo de la arista está dentro y de la paridad del eje
        # (x y z giran igual, y al revés: es la permutación de los otros dos ejes).
        invertir = punto_dentro ^ (eje == 1)
        cuadro = np.where(invertir[:, None], cuadro[:, ::-1], cuadro)
        caras.append(np.concatenate([cuadro[:, [0, 1, 2]], cuadro[:, [0, 2, 3]]]))
    triangulos = np.vstack(caras) if caras else np.zeros((0, 3), np.int64)
    # La orientación de arriba sale con el signo del campo; se comprueba contra él y se
    # corrige entera si hace falta, porque o sale bien en los tres ejes o sale mal en los tres.
    return vertices, _orientar_hacia_fuera(vertices, triangulos, campo, origen, h)


def _orientar_hacia_fuera(v, f, campo, origen, h):
    """Da la vuelta a todas las caras si la mayoría mira hacia donde el campo baja (hacia dentro)."""
    if len(f) == 0:
        return f
    from scipy import ndimage as ndi

    n = normales_de_caras(v, f)
    centro = v[f].mean(axis=1)
    paso = 0.75 * h
    fuera = centro + n * paso
    dentro = centro - n * paso

    def evaluar(p):
        g = (p - np.asarray(origen, float)) / h
        return ndi.map_coordinates(campo, g.T, order=1, mode='nearest')

    mira_fuera = evaluar(fuera) > evaluar(dentro)
    return f if mira_fuera.mean() >= 0.5 else f[:, ::-1].copy()


# ----------------------------------------------------------------- geometría


def normales_de_caras(v, f):
    """La normal unitaria de cada triángulo (cero en los degenerados)."""
    n = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    largo = np.linalg.norm(n, axis=1, keepdims=True)
    largo[largo == 0] = 1.0
    return n / largo


def area_de_caras(v, f):
    return 0.5 * np.linalg.norm(np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]]), axis=1)


def normales_de_vertices(v, f):
    """
    La normal suave de cada vértice: la media de las de sus caras, ponderada por su área.

    Ponderada por área y no por ángulo porque es lo que hace el resto del atlas al exportar y la
    diferencia, en una malla tan regular, no se ve; lo que sí se vería es una media sin ponderar
    en el borde de un recorte, donde un triángulo muy largo pesaría como uno pequeño.
    """
    cruz = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])  # el área ya va en su módulo
    n = np.zeros_like(v, dtype=np.float64)
    for k in range(3):
        np.add.at(n, f[:, k], cruz)
    largo = np.linalg.norm(n, axis=1, keepdims=True)
    largo[largo == 0] = 1.0
    return n / largo


def normales_a_enteros(n):
    """Normales en enteros de 16 bits con signo, como las guarda el atlas (`nor`): -1…1 → -32767…32767."""
    return np.clip(np.round(np.asarray(n, np.float64) * 32767.0), -32767, 32767).astype('<i2')


def caja_de(v):
    return np.min(v, axis=0), np.max(v, axis=0)


def area_total(v, f):
    return float(area_de_caras(v, f).sum())


def volumen_con_signo(v, f):
    """El volumen que encierra una malla cerrada con las caras hacia fuera (m³); negativo si están al revés."""
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    return float(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6.0)


# ------------------------------------------------------------------ limpieza


def compactar(v, f):
    """Quita los vértices que ningún triángulo usa y corre los índices."""
    if len(f) == 0:
        return v[:0], f
    usados = np.unique(f)
    nuevo = -np.ones(len(v), np.int64)
    nuevo[usados] = np.arange(len(usados))
    return v[usados], nuevo[f]


def quitar_componentes_pequenas(v, f, fraccion=0.01, atributos=None):
    """
    Deja solo las partes conexas que tienen al menos `fraccion` del área de la mayor.

    El cierre y la inundación pueden dejar islotes: una burbuja de aire entre dos músculos, la
    punta de un tendón que el atlas deja suelta. Una fascia con un cascabel suelto adentro es un
    fallo que no se ve de lejos y sí al apagar lo de abajo.
    """
    if len(f) == 0:
        return v, f
    from scipy import sparse
    from scipy.sparse.csgraph import connected_components

    aristas = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    grafo = sparse.coo_matrix((np.ones(len(aristas)), (aristas[:, 0], aristas[:, 1])), shape=(len(v), len(v)))
    _, etiqueta = connected_components(grafo, directed=False)
    cara_de = etiqueta[f[:, 0]]
    area = np.bincount(cara_de, weights=area_de_caras(v, f), minlength=etiqueta.max() + 1)
    seQuedan = area >= fraccion * area.max()
    v2, f2 = compactar(v, f[seQuedan[cara_de]])
    if atributos is None:
        return v2, f2
    # `compactar` conserva los vértices usados en su orden: los atributos se recortan igual.
    return v2, f2, np.asarray(atributos)[np.unique(f[seQuedan[cara_de]])]


def _vecinos_normalizados(n, f):
    from scipy import sparse

    aristas = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    aristas = np.vstack([aristas, aristas[:, ::-1]])
    ady = sparse.coo_matrix((np.ones(len(aristas)), (aristas[:, 0], aristas[:, 1])), shape=(n, n)).tocsr()
    ady.data[:] = 1.0  # las aristas repetidas cuentan una sola vez
    grado = np.asarray(ady.sum(axis=1)).ravel()
    grado[grado == 0] = 1.0
    return sparse.diags(1.0 / grado) @ ady


def suavizar_taubin(v, f, pasadas=10, lam=0.5, mu=-0.53):
    """
    Suavizado de Taubin: una pasada que acerca cada vértice a la media de sus vecinos (`lam`) y
    otra que lo aleja (`mu`, algo mayor en módulo).

    El suavizado de Laplace solo encoge la malla —un cilindro termina siendo más delgado—; el
    segundo paso, que lo desinfla, es lo que deja la forma donde estaba y quita solo el
    escalón de la rejilla. Con los valores de Taubin (λ = 0,5, μ = −0,53) el volumen cambia
    menos del 1 % en diez pasadas.
    """
    if len(f) == 0 or pasadas <= 0:
        return v
    media = _vecinos_normalizados(len(v), f)
    v = v.astype(np.float64)
    for _ in range(pasadas):
        for paso in (lam, mu):
            v = v + paso * (media @ v - v)
    return v


# --------------------------------------------------------------- transformar


def espejar(v, f):
    """El otro lado del cuerpo: `x → −x` y las caras al revés, para que sigan mirando hacia fuera."""
    v2 = v.copy()
    v2[:, 0] = -v2[:, 0]
    return v2, f[:, ::-1].copy()


def recortar_por_planos(v, f, planos, atributos=None):
    """
    Se queda con lo que cae del lado de la normal de **todos** los planos, **sin tapar** el corte.

    Cada plano es `(punto, normal)`. Un triángulo entero dentro se queda, uno entero fuera se va,
    y uno que cruza se parte en uno o dos exactamente sobre el plano. A diferencia del corte de
    un hueso (`src/lib/osteotomia.ts`), aquí **no hay tapa**: una fascia es un manguito, y
    cortarlo por un plano deja un anillo abierto, no un disco.

    Los vértices nuevos se comparten entre los dos triángulos que tocan la arista cortada, así
    que la malla sigue siendo continua por el borde. Cada arista se interpola siempre desde el
    extremo de dentro hacia el de fuera, no al revés: así dos piezas vecinas, cortadas por el
    mismo plano con la normal contraria, dan el mismo punto con la diferencia de un redondeo.

    Con `atributos` (N×k: las normales de los vértices, por ejemplo) se interpolan en los vértices
    nuevos con el mismo `t` que la posición, y se devuelven como tercer valor. Es lo que mantiene el
    sombreado continuo entre dos piezas vecinas: si cada una recalculara sus normales en el borde
    solo con sus propias caras, se vería una costura donde no la hay.
    """
    v = np.asarray(v, np.float64)
    f = np.asarray(f, np.int64)
    a_ = None if atributos is None else np.asarray(atributos, np.float64)
    for punto, normal in planos:
        if len(f) == 0:
            break
        n = np.asarray(normal, float)
        n = n / np.linalg.norm(n)
        d = (v - np.asarray(punto, float)) @ n
        dentro = d >= 0
        cuantos = dentro[f].sum(axis=1)
        if np.all(cuantos == 3):
            continue
        enteras = f[cuantos == 3]

        # Un vértice dentro: queda un triángulo más pequeño (i, p_ij, p_ik).
        uno = f[cuantos == 1]
        k_uno = np.argmax(dentro[uno], axis=1)
        fila = np.arange(len(uno))
        i = uno[fila, k_uno]
        j = uno[fila, (k_uno + 1) % 3]
        k = uno[fila, (k_uno + 2) % 3]

        # Dos dentro: queda un cuadrilátero (a, b, p_bc, p_ca), con c el de fuera.
        dos = f[cuantos == 2]
        k_fuera = np.argmax(~dentro[dos], axis=1)
        fila2 = np.arange(len(dos))
        c = dos[fila2, k_fuera]
        a = dos[fila2, (k_fuera + 1) % 3]
        b = dos[fila2, (k_fuera + 2) % 3]

        # Todas las aristas cortadas, como (extremo de dentro, extremo de fuera).
        aristas = np.vstack(
            [np.stack([i, j], 1), np.stack([i, k], 1), np.stack([b, c], 1), np.stack([a, c], 1)]
        )
        if len(aristas):
            unicas, inverso = np.unique(aristas, axis=0, return_inverse=True)
            inverso = inverso.reshape(-1)
            t = d[unicas[:, 0]] / (d[unicas[:, 0]] - d[unicas[:, 1]])
            nuevos = v[unicas[:, 0]] + t[:, None] * (v[unicas[:, 1]] - v[unicas[:, 0]])
            base = len(v)
            v = np.vstack([v, nuevos])
            if a_ is not None:
                a_ = np.vstack([a_, a_[unicas[:, 0]] + t[:, None] * (a_[unicas[:, 1]] - a_[unicas[:, 0]])])
            n1 = len(uno)
            n2 = len(dos)
            p_ij = base + inverso[:n1]
            p_ik = base + inverso[n1 : 2 * n1]
            p_bc = base + inverso[2 * n1 : 2 * n1 + n2]
            p_ac = base + inverso[2 * n1 + n2 :]
        else:
            p_ij = p_ik = p_bc = p_ac = np.zeros(0, np.int64)

        nuevas = [enteras]
        if len(uno):
            nuevas.append(np.stack([i, p_ij, p_ik], 1))
        if len(dos):
            nuevas.append(np.stack([a, b, p_bc], 1))
            nuevas.append(np.stack([a, p_bc, p_ac], 1))
        f = np.vstack(nuevas)
    if a_ is None:
        return compactar(v, f)
    if len(f) == 0:
        return v[:0], f, a_[:0]
    usados = np.unique(f)
    nuevo = -np.ones(len(v), np.int64)
    nuevo[usados] = np.arange(len(usados))
    return v[usados], nuevo[f], a_[usados]


def mitad_de_espacio(punto, normal):
    """Un plano como lo piden `recortar_por_planos` y las recetas: se queda lo que mira la normal."""
    n = np.asarray(normal, float)
    return (tuple(float(x) for x in punto), tuple(float(x) for x in n / np.linalg.norm(n)))


def aristas_de_borde(f):
    """Cuántas aristas pertenecen a un solo triángulo: 0 en una malla cerrada, más de 0 en una abierta."""
    aristas = np.sort(np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1)
    _, veces = np.unique(aristas, axis=0, return_counts=True)
    return int((veces == 1).sum()), int((veces > 2).sum())

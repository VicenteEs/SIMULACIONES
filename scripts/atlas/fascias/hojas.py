"""
Superficies que no salen de un campo en 3D (P-006, E8 y E9): una hoja plana, un tubo.

El resto del motor (`campo.py`, `malla.py`) saca una superficie de una máscara de voxeles, que es lo que
se necesita para una fascia que envuelve algo. Hay estructuras que no son el contorno de un volumen sino
una lámina: la hoz del cerebro es un trozo del plano medio, y la dura espinal, un tubo que sigue el
conducto. Se hacen aquí, directamente y con los mismos requisitos que las demás: malla sin aristas
sueltas, caras hacia fuera y determinista.
"""

import numpy as np


def hoja_plana(campo, origen, paso, eje_normal=0, valor_del_plano=0.0):
    """
    Los triángulos del conjunto `campo ≤ 0` de una rejilla 2D, puestos en un plano del espacio.

    `campo` es una matriz `(a, b)` de valores con signo (negativo dentro) en los centros de una rejilla de
    `paso` metros cuyo primer centro está en `origen = (a0, b0)`. Cada casilla que el contorno corta se
    recorta contra el cero por interpolación lineal (*marching squares* que devuelve polígonos, no
    segmentos), así que el borde sale suave aunque la rejilla sea de milímetros y no de escalones.

    `eje_normal` es el eje del espacio al que el plano es perpendicular (0: el plano medio, x = const). Los
    dos ejes de la matriz son, en orden, los otros dos del espacio (y, z para el plano medio). Los
    triángulos salen con la normal hacia el lado positivo del eje; el que pida otro sentido da vuelta las
    caras.
    """
    campo = np.asarray(campo, np.float64)
    a, b = campo.shape
    if a < 2 or b < 2:
        return np.zeros((0, 3)), np.zeros((0, 3), np.int64)
    # Las cuatro esquinas de cada celda, en el sentido de las agujas: (i, j), (i+1, j), (i+1, j+1), (i, j+1).
    v00, v10, v11, v01 = campo[:-1, :-1], campo[1:, :-1], campo[1:, 1:], campo[:-1, 1:]
    dentro = np.stack([v00 <= 0, v10 <= 0, v11 <= 0, v01 <= 0], axis=-1)
    quien = np.argwhere(dentro.any(axis=-1))

    puntos = []      # coordenadas 2D de cada vértice, sin soldar
    triangulos = []  # índices en `puntos`

    def esquina(i, j, k):
        di, dj = ((0, 0), (1, 0), (1, 1), (0, 1))[k]
        return (i + di, j + dj)

    for i, j in quien:
        poligono = []
        for k in range(4):
            p, q = esquina(i, j, k), esquina(i, j, (k + 1) % 4)
            vp, vq = campo[p], campo[q]
            if vp <= 0:
                poligono.append((float(p[0]), float(p[1])))
            if (vp <= 0) != (vq <= 0):
                # El mismo cálculo desde las dos celdas que comparten la arista: se ordena el par para que
                # el flotante salga idéntico y la soldadura de abajo no deje rendijas.
                (r, s) = (p, q) if p <= q else (q, p)
                vr, vs = campo[r], campo[s]
                t = vr / (vr - vs)
                poligono.append((r[0] + t * (s[0] - r[0]), r[1] + t * (s[1] - r[1])))
        if len(poligono) < 3:
            continue
        base = len(puntos)
        puntos.extend(poligono)
        for m in range(1, len(poligono) - 1):
            triangulos.append((base, base + m, base + m + 1))
    if not triangulos:
        return np.zeros((0, 3)), np.zeros((0, 3), np.int64)

    puntos = np.asarray(puntos, np.float64)
    triangulos = np.asarray(triangulos, np.int64)
    # Soldar: los puntos de la rejilla caen en enteros, los del contorno en un solo punto por arista.
    llave = np.round(puntos * 1e6).astype(np.int64)
    _, primero, inverso = np.unique(llave, axis=0, return_index=True, return_inverse=True)
    puntos = puntos[primero]
    triangulos = inverso.reshape(-1)[triangulos]
    # Quitar triángulos degenerados (dos esquinas soldadas en una).
    ok = (triangulos[:, 0] != triangulos[:, 1]) & (triangulos[:, 1] != triangulos[:, 2]) & (triangulos[:, 0] != triangulos[:, 2])
    triangulos = triangulos[ok]

    # De coordenadas de celda a metros, y al plano.
    ejes = [e for e in (0, 1, 2) if e != eje_normal]
    v = np.zeros((len(puntos), 3))
    v[:, ejes[0]] = origen[0] + puntos[:, 0] * paso
    v[:, ejes[1]] = origen[1] + puntos[:, 1] * paso
    v[:, eje_normal] = valor_del_plano
    # Orientación: la normal del primer triángulo debe mirar al lado positivo del eje.
    n = np.cross(v[triangulos[:, 1]] - v[triangulos[:, 0]], v[triangulos[:, 2]] - v[triangulos[:, 0]])
    if n[:, eje_normal].sum() < 0:
        triangulos = triangulos[:, ::-1]
    return v, triangulos


def tubo(centros, semiejes, anillo=40, tapa_final=True, tapa_inicial=False):
    """
    Un tubo elíptico barrido a lo largo de una línea.

    `centros` es `(n, 3)` (la línea, de arriba abajo); `semiejes` es `(n, 2)`: el semieje en x y el semieje
    en z de la sección de cada punto. La sección es horizontal (el conducto vertebral es casi vertical y
    una sección perpendicular a la línea no cambia nada a este calibre). Se cierra el extremo de abajo con
    una tapa redondeada si `tapa_final` —el fondo del saco dural—, y el de arriba se deja abierto: ahí
    sigue la dura craneal. Las caras miran hacia fuera.
    """
    centros = np.asarray(centros, np.float64)
    semiejes = np.asarray(semiejes, np.float64)
    n = len(centros)
    ang = np.linspace(0.0, 2 * np.pi, anillo, endpoint=False)
    coseno, seno = np.cos(ang), np.sin(ang)
    v = np.zeros((n * anillo, 3))
    for i in range(n):
        v[i * anillo:(i + 1) * anillo, 0] = centros[i, 0] + semiejes[i, 0] * coseno
        v[i * anillo:(i + 1) * anillo, 1] = centros[i, 1]
        v[i * anillo:(i + 1) * anillo, 2] = centros[i, 2] + semiejes[i, 1] * seno
    caras = []
    for i in range(n - 1):
        for k in range(anillo):
            a, b = i * anillo + k, i * anillo + (k + 1) % anillo
            c, d = (i + 1) * anillo + k, (i + 1) * anillo + (k + 1) % anillo
            caras.append((a, c, b))
            caras.append((b, c, d))
    if tapa_final:
        # Tres anillos que se cierran como un casquete: la altura baja hacia el polo con un cuarto de círculo.
        ultimo = n - 1
        altura = max(semiejes[ultimo].max(), 1e-4)
        niveles = 4
        previo = list(range(ultimo * anillo, (ultimo + 1) * anillo))
        for m in range(1, niveles):
            t = m / niveles
            escala = np.cos(t * np.pi / 2)
            baja = -altura * np.sin(t * np.pi / 2)
            nuevo = []
            for k in range(anillo):
                nuevo.append(len(v))
                v = np.vstack([v, [centros[ultimo, 0] + semiejes[ultimo, 0] * coseno[k] * escala,
                                   centros[ultimo, 1] + baja,
                                   centros[ultimo, 2] + semiejes[ultimo, 1] * seno[k] * escala]])
            for k in range(anillo):
                a, b = previo[k], previo[(k + 1) % anillo]
                c, d = nuevo[k], nuevo[(k + 1) % anillo]
                caras.append((a, c, b))
                caras.append((b, c, d))
            previo = nuevo
        polo = len(v)
        v = np.vstack([v, [centros[ultimo, 0], centros[ultimo, 1] - altura, centros[ultimo, 2]]])
        for k in range(anillo):
            caras.append((previo[k], polo, previo[(k + 1) % anillo]))
    caras = np.asarray(caras, np.int64)
    # Hacia fuera: el centro de masa del tubo está dentro, y las normales deben alejarse de él.
    a, b, c = v[caras[:, 0]], v[caras[:, 1]], v[caras[:, 2]]
    normal = np.cross(b - a, c - a)
    centro_cara = (a + b + c) / 3
    eje = np.zeros_like(centro_cara)
    eje[:, 0] = np.interp(centro_cara[:, 1], centros[::-1, 1], centros[::-1, 0])
    eje[:, 2] = np.interp(centro_cara[:, 1], centros[::-1, 1], centros[::-1, 2])
    hacia_fuera = ((centro_cara - eje) * normal).sum(axis=1)
    if (hacia_fuera < 0).mean() > 0.5:
        caras = caras[:, ::-1]
    return v, caras

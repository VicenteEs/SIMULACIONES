"""
Lo común de los guiones del campo quirúrgico (P-014, E1): las medidas, la piel del atlas y las rejillas de alturas.

Solo usa numpy, que Blender trae, para que lo importen igual los guiones que corren dentro de Blender y los que
no. Todo va en las coordenadas del **cuerpo del atlas**: metros, Y hacia la cabeza, +Z hacia delante y el lado
derecho del sujeto en x negativa (`scripts/atlas/fascias/atlas.py`). Se trabaja ahí, y no con el cuerpo tumbado
en los ejes de Blender, por lo que pasa al final: el `.glb` sale ya en las coordenadas en que el simulador tiene
el modelo recortado, y no queda ningún giro que deshacer —ni que equivocar— en el navegador. Lo que se tumba es
la gravedad.

## El decúbito y la «altura»

El cuerpo del atlas está de pie y es rígido. Boca arriba apoya la espalda, que mira a −Z; boca abajo, el pecho,
que mira a +Z. Para escribir una sola cuenta, cada decúbito tiene un signo (`ARRIBA`) y todo se mide en
**altura** `h = signo · z`: lo que está más alto está más lejos del colchón, en los dos.

## Por qué el colchón va inclinado

Un cuerpo de pie no queda plano al acostarlo: las escápulas y los glúteos quedan 3 a 5 cm por detrás de las
pantorrillas y de los talones. Sobre un plano perpendicular al eje del cuerpo, la pierna —que es lo que más se
opera— flotaría tres centímetros sobre la sábana. Así que el plano de apoyo se inclina lo poco que hace falta
(menos de dos grados) para tocar a la vez el tronco y las piernas, y lo que aun así queda en el aire se calza
como en pabellón: un cojín bajo la cabeza, uno bajo cada brazo y, boca abajo, un rodillo bajo los tobillos.

Los brazos son el caso más claro. El atlas los trae junto al tronco y con el codo algo doblado: boca arriba la
mano queda trece centímetros por encima de la espalda. Sin su cojín, quien recorte una mano la vería levitar
sobre la sábana.
"""

import sys
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
SALIDA = AQUI / 'salida'
PABELLON = RAIZ / 'privado' / 'pabellon'

sys.path.insert(0, str(RAIZ / 'scripts' / 'atlas' / 'fascias'))
from atlas import Atlas  # noqa: E402

# ----------------------------------------------------------------------------------------------- medidas

DECUBITOS = ('supino', 'prono')

# +1: lo de arriba es +Z (boca arriba). −1: lo de arriba es −Z (boca abajo).
ARRIBA = {'supino': 1.0, 'prono': -1.0}

# El colchón de una camilla ancha: mucho más que el de una mesa de operaciones (50 cm), porque el cuerpo del
# atlas lleva los brazos junto al tronco y un poco abiertos, y las manos llegan a 33 cm del eje. Con 76 cm las
# manos quedaban en el mismo canto: el cojín del brazo no tenía sitio para bajar y hacía un cajón, y el paño
# caía desde la mano directamente al vacío, con un pellizco. Con 84 hay un palmo de colchón a cada lado.
ANCHO_DEL_COLCHON = 0.84
LARGO_DEL_COLCHON = 1.96
GROSOR_DEL_COLCHON = 0.11
# El canto de arriba y el de abajo, redondeados; y las cuatro esquinas, vistas desde arriba.
RADIO_DEL_CANTO = 0.022
RADIO_EN_PLANTA = 0.06

# Cuánto se hunde el cuerpo donde más pesa. La plancha rígida del colchón queda esto por debajo del plano de
# apoyo, y lo que se ve encima es la sábana, que sí lleva la huella.
HUNDIMIENTO_MAXIMO = 0.024

# El plano de apoyo de cada decúbito, en altura: h = a + b · y. Salen de `medir.py`, que dice cuánto se hunde o
# cuánto flota cada zona; aquí quedan escritos para que una piel regenerada no mueva el colchón sin que nadie lo
# decida.
PLANO = {
    # Glúteos 18 mm hundidos, tórax 8, muslos y pantorrillas 4; los talones quedan a 3 mm.
    'supino': {'a': -0.0975, 'b': -0.0297},
    # Tórax y abdomen unos 11 mm hundidos, muslos 5. Las piernas quedan en el aire y van sobre su rodillo.
    'prono': {'a': -0.0772, 'b': -0.0290},
}

# Dónde empieza el colchón, en Y. Boca arriba sobran 13 cm bajo las plantas, que es donde el paño cae por
# delante de los dedos. Boca abajo el colchón se corre hacia la cabeza: los pies cuelgan del borde, porque la
# punta de un pie en ángulo recto queda seis centímetros por debajo del plano («pies fuera de la camilla», como
# se pone a un paciente para el tendón de Aquiles).
INICIO_DEL_COLCHON = {'supino': -0.13, 'prono': 0.085}

# Los cojines: dónde se permite que el apoyo suba a buscar al cuerpo, y cuánto como mucho. `x` e `y` son la
# meseta; `rampas`, lo que tarda en bajar al plano por fuera de ella hacia −x, +x, −y y +y. Ninguno llega al
# canto del colchón: la sábana baja por el canto desde la altura que encuentra, y un cojín que llegara hasta
# allí le levantaría el borde y dejaría ver que debajo no hay nada. Hacia el tronco la rampa es corta, porque
# el hueco entre el brazo y la cadera son tres centímetros; hacia fuera es larga, que es lo que hace que bajo
# el paño se lea una almohada y no un cajón.
COJINES = {
    'supino': [
        {'nombre': 'cabeza', 'x': (-0.105, 0.105), 'y': (1.52, 1.75), 'rampas': (0.05, 0.05, 0.05, 0.05), 'maximo': 0.06},
        {'nombre': 'brazo-derecho', 'x': (-0.325, -0.205), 'y': (0.71, 1.31), 'rampas': (0.065, 0.03, 0.07, 0.06), 'maximo': 0.14},
        {'nombre': 'brazo-izquierdo', 'x': (0.205, 0.325), 'y': (0.71, 1.31), 'rampas': (0.03, 0.065, 0.07, 0.06), 'maximo': 0.14},
    ],
    'prono': [
        {'nombre': 'tobillos', 'x': (-0.17, 0.17), 'y': (0.14, 0.44), 'rampas': (0.05, 0.05, 0.03, 0.06), 'maximo': 0.09},
        {'nombre': 'cabeza', 'x': (-0.105, 0.105), 'y': (1.52, 1.75), 'rampas': (0.05, 0.05, 0.05, 0.05), 'maximo': 0.06},
        {'nombre': 'brazo-derecho', 'x': (-0.325, -0.205), 'y': (0.71, 1.38), 'rampas': (0.065, 0.03, 0.07, 0.06), 'maximo': 0.125},
        {'nombre': 'brazo-izquierdo', 'x': (0.205, 0.325), 'y': (0.71, 1.38), 'rampas': (0.03, 0.065, 0.07, 0.06), 'maximo': 0.125},
    ],
}

# La rejilla en que se mide todo: celdas de 4 mm sobre el plano (x, y) del cuerpo.
PASO = 0.004
X0, X1 = -0.70, 0.70
Y0, Y1 = -0.44, 2.36
NX = int(round((X1 - X0) / PASO))
NY = int(round((Y1 - Y0) / PASO))

# Lo que queda entre la piel y lo que la toca: la sábana por debajo, el paño por encima.
CLARO = 0.003

# La sábana: cuánto baja por la pared una vez doblado el canto, y a cuánto queda de la pared del colchón. Con
# el canto son unos seis centímetros bajo el plano: tapa el hueco entre el plano y la plancha, y deja ver el
# colchón por debajo.
CAIDA_DE_LA_SABANA = 0.036
HOLGURA_DE_LA_SABANA = 0.0015
# Lo que ondula su borde hacia fuera. El paño no puede atravesarla: lo que el paño tiene por pared es la de la
# sábana corrida esta misma medida.
ONDA_DE_LA_SABANA = 0.0025

# El paño, extendido antes de caer: de dónde a dónde llega en Y, y cuánto debe colgar por los costados una vez
# puesto. No es un rectángulo. Un rectángulo sobre un cuerpo cuelga un palmo a la altura de las piernas y no
# llega al borde a la altura del pecho; aquí se le da a cada altura el ancho que el cuerpo le va a comer
# (`ancho_del_pano`), y cae parejo.
PANO = {
    'supino': {'y': (-0.26, 1.91)},
    'prono': {'y': (-0.20, 1.95)},
}
CUELGA_DEL_PANO = 0.085

# Dónde cae cada tela en la textura de pliegues, que es una sola y cuadrada, de 2,4 m de lado: el paño a la
# izquierda y la sábana a la derecha. La escala es la misma en U y en V, a propósito: three saca el marco
# tangente de las derivadas de la UV y lo escala con un solo número, y con una UV estirada en un eje los
# pliegues saldrían la mitad de hondos en el otro.
LADO_DE_LA_TEXTURA = 2.4
CENTRO_DEL_PANO_EN_U = 0.29
CENTRO_DE_LA_SABANA_EN_U = 0.80


def plano(decubito, y):
    """La altura del plano de apoyo a esa Y."""
    p = PLANO[decubito]
    return p['a'] + p['b'] * np.asarray(y, dtype=np.float64)


def marco_del_colchon(decubito):
    """
    El marco del colchón en el cuerpo: el origen en el centro de su cara de arriba (la del plano de apoyo) y
    tres ejes unitarios —ancho, largo hacia la cabeza y normal hacia el paciente—, diestros.

    Boca abajo el ancho sale hacia −X: es lo que mantiene diestro un marco cuya normal se ha dado la vuelta, y
    es también lo que pasa de verdad, porque el colchón no se voltea con el paciente.
    """
    s = ARRIBA[decubito]
    b = PLANO[decubito]['b']
    y_medio = INICIO_DEL_COLCHON[decubito] + LARGO_DEL_COLCHON / 2
    origen = np.array([0.0, y_medio, s * float(plano(decubito, y_medio))])
    largo = np.array([0.0, 1.0, s * b])
    largo /= np.linalg.norm(largo)
    # Perpendicular al largo y hacia el paciente. La componente en Y es −b en los dos decúbitos: con −s·b, que es
    # lo que hubo al principio, boca abajo la normal quedaba 3,3° torcida respecto del largo, el marco no era
    # ortogonal y el colchón, colocado con él en el navegador, asomaba cinco centímetros por un extremo de la sábana.
    normal = np.array([0.0, -b, s])
    normal /= np.linalg.norm(normal)
    ancho = np.cross(largo, normal)
    return {'origen': origen, 'ancho': ancho, 'largo': largo, 'normal': normal}


# ------------------------------------------------------------------------------------------- ejes y piel


def a_blender(v):
    """Del atlas (Y arriba) a Blender (Z arriba): un giro, no un espejo. Es el que deshace el exportador de glTF."""
    v = np.asarray(v)
    return np.stack([v[..., 0], -v[..., 2], v[..., 1]], axis=-1)


def al_atlas(v):
    v = np.asarray(v)
    return np.stack([v[..., 0], v[..., 2], -v[..., 1]], axis=-1)


def leer_la_piel():
    """La piel del atlas: posiciones (N×3) y triángulos (M×3), en las coordenadas del cuerpo."""
    atlas = Atlas()
    piel = atlas.por_nombre('Skin')
    if len(piel) != 1:
        raise RuntimeError(f'Se esperaba una sola pieza «Skin» y hay {len(piel)}.')
    return atlas.malla(piel[0])


# ------------------------------------------------------------------------------------------------ rejillas


def muestras(v, f, paso=PASO * 0.6):
    """
    Puntos repartidos sobre los triángulos, más juntos que el paso de la rejilla.

    Los vértices solos no bastan: donde la piel tiene triángulos de un centímetro quedarían celdas vacías, y una
    celda vacía bajo el cuerpo es un sitio donde la sábana atravesaría la piel.
    """
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    lado = np.maximum(np.linalg.norm(b - a, axis=1), np.maximum(np.linalg.norm(c - b, axis=1), np.linalg.norm(a - c, axis=1)))
    n = np.clip(np.ceil(lado / paso).astype(int), 1, 24)
    trozos = [v]
    for k in np.unique(n):
        if k == 1:
            continue
        cuales = np.where(n == k)[0]
        i, j = np.meshgrid(np.arange(k + 1), np.arange(k + 1), indexing='ij')
        dentro = (i + j) <= k
        u = (i[dentro] / k)[None, :, None]
        w = (j[dentro] / k)[None, :, None]
        p = a[cuales][:, None, :] * (1 - u - w) + b[cuales][:, None, :] * u + c[cuales][:, None, :] * w
        trozos.append(p.reshape(-1, 3))
    return np.vstack(trozos)


def celdas(x, y):
    ix = np.floor((np.asarray(x) - X0) / PASO).astype(int)
    iy = np.floor((np.asarray(y) - Y0) / PASO).astype(int)
    dentro = (ix >= 0) & (ix < NX) & (iy >= 0) & (iy < NY)
    return ix, iy, dentro


def envolventes(puntos, decubito):
    """
    Por celda, la altura más baja y la más alta de unos puntos: lo que apoya y lo que el paño toca.
    Donde no hay nada, +inf y −inf.
    """
    s = ARRIBA[decubito]
    ix, iy, dentro = celdas(puntos[:, 0], puntos[:, 1])
    h = s * puntos[dentro, 2]
    abajo = np.full((NX, NY), np.inf)
    arriba = np.full((NX, NY), -np.inf)
    np.minimum.at(abajo, (ix[dentro], iy[dentro]), h)
    np.maximum.at(arriba, (ix[dentro], iy[dentro]), h)
    return abajo, arriba


def centros():
    """Las coordenadas (x, y) del centro de cada celda, como dos matrices NX×NY."""
    x = X0 + (np.arange(NX) + 0.5) * PASO
    y = Y0 + (np.arange(NY) + 0.5) * PASO
    return np.meshgrid(x, y, indexing='ij')


def difuminar(campo, sigma_m, paso=PASO):
    """Un desenfoque gaussiano separable, con el borde repetido. `sigma_m` va en metros."""
    sigma = sigma_m / paso
    radio = max(1, int(np.ceil(sigma * 3)))
    t = np.arange(-radio, radio + 1)
    nucleo = np.exp(-0.5 * (t / sigma) ** 2)
    nucleo /= nucleo.sum()
    salida = np.asarray(campo, dtype=np.float64)
    for eje in (0, 1):
        relleno = [(0, 0), (0, 0)]
        relleno[eje] = (radio, radio)
        ancho = np.pad(salida, relleno, mode='edge')
        salida = np.apply_along_axis(lambda fila: np.convolve(fila, nucleo, mode='valid'), eje, ancho)
    return salida


def vecindad(campo, operacion, radio=1):
    """
    El mínimo o el máximo de cada celda con sus vecinas (`np.minimum` o `np.maximum`).

    Es el margen de quien interpola: entre los centros de dos celdas, una mezcla de sus dos mínimos puede quedar
    por encima de la piel de verdad. Con el mínimo de la vecindad, no.
    """
    salida = np.asarray(campo, dtype=np.float64)
    for _ in range(radio):
        ancho = np.pad(salida, 1, mode='edge')
        r = ancho[1:-1, 1:-1]
        for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            r = operacion(r, ancho[1 + dx:ancho.shape[0] - 1 + dx, 1 + dy:ancho.shape[1] - 1 + dy])
        salida = r
    return salida


def cerrar(campo, radio_m, paso=PASO):
    """
    El cierre de un campo de alturas: rellena los valles más estrechos que dos radios y deja lo demás como
    estaba. Nunca baja nada.

    Es subir cada celda al máximo de su entorno y bajarla luego al mínimo del mismo entorno. El entorno alterna
    entre las ocho vecinas y las cuatro de los lados, que juntas dan un octógono: con solo las ocho sale un
    cuadrado, y los valles en diagonal se rellenarían hasta un cuarenta por ciento más anchos que los rectos.
    """
    pasos = max(1, int(round(radio_m / paso)))
    lados = ((0, 1), (0, -1), (1, 0), (-1, 0))
    esquinas = ((1, 1), (1, -1), (-1, 1), (-1, -1))

    def con_las_vecinas(valores, operacion, con_esquinas):
        ancho = np.pad(valores, 1, mode='edge')
        r = ancho[1:-1, 1:-1]
        for dx, dy in lados + (esquinas if con_esquinas else ()):
            r = operacion(r, ancho[1 + dx:ancho.shape[0] - 1 + dx, 1 + dy:ancho.shape[1] - 1 + dy])
        return r

    salida = np.asarray(campo, dtype=np.float64)
    for operacion in (np.maximum, np.minimum):
        for k in range(pasos):
            salida = con_las_vecinas(salida, operacion, k % 2 == 0)
    return salida


def rellenar(campo, valor):
    """Las celdas sin dato (infinitas), con ese valor."""
    return np.where(np.isfinite(campo), campo, valor)


def interpolar(campo, x, y):
    """El campo en unos puntos sueltos, bilineal entre los centros de las celdas."""
    fx = np.clip((np.asarray(x) - X0) / PASO - 0.5, 0, NX - 1.001)
    fy = np.clip((np.asarray(y) - Y0) / PASO - 0.5, 0, NY - 1.001)
    i, j = np.floor(fx).astype(int), np.floor(fy).astype(int)
    u, w = fx - i, fy - j
    return (
        campo[i, j] * (1 - u) * (1 - w)
        + campo[i + 1, j] * u * (1 - w)
        + campo[i, j + 1] * (1 - u) * w
        + campo[i + 1, j + 1] * u * w
    )


def escalon(a, b, t):
    """De 0 a 1 entre `a` y `b`, suave en los dos extremos."""
    t = np.clip((np.asarray(t, dtype=np.float64) - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def dentro_del_colchon(decubito, margen=0.0):
    """1 sobre el colchón y 0 fuera, como máscara de la rejilla."""
    x, y = centros()
    y0 = INICIO_DEL_COLCHON[decubito]
    return (np.abs(x) <= ANCHO_DEL_COLCHON / 2 + margen) & (y >= y0 - margen) & (y <= y0 + LARGO_DEL_COLCHON + margen)


def apoyo(decubito, abajo):
    """
    La superficie que sostiene al cuerpo, en altura por celda: el plano del colchón, los cojines que suben a
    buscar lo que flota y, encima de todo, la huella de lo que se hunde.

    Devuelve también la superficie sin huella, que es la forma del colchón con sus cojines antes de acostar a
    nadie.
    """
    x, y = centros()
    base = plano(decubito, y)
    hay = np.isfinite(abajo)
    # El cuerpo por debajo, con el margen de quien interpola. Donde no hay cuerpo, muy alto, para que no cuente.
    cuerpo = vecindad(rellenar(abajo, 10.0), np.minimum)

    sin_huella = base.copy()
    for cojin in COJINES[decubito]:
        (xa, xb), (ya, yb), (ra, rb, rc, rd) = cojin['x'], cojin['y'], cojin['rampas']
        peso = (
            escalon(xa - ra, xa, x) * (1 - escalon(xb, xb + rb, x))
            * escalon(ya - rc, ya, y) * (1 - escalon(yb, yb + rd, y))
        )
        # El cojín sube hasta la piel, pero liso —la forma del cuerpo desenfocada, no su relieve— y sigue a la
        # misma altura por los lados. La primera versión subía hasta su máximo donde no había cuerpo encima, y
        # lo que salía no era un cojín sino un bloque de catorce centímetros con el brazo enterrado en una zanja.
        # Por eso el desenfoque es normalizado: solo promedia las celdas en que hay cuerpo.
        cuenta = hay & (peso > 0)
        alto = np.where(cuenta, np.minimum(abajo, base + cojin['maximo']) - base, 0.0)
        suma = difuminar(alto, 0.03)
        pesos = difuminar(cuenta.astype(np.float64), 0.03)
        hasta = np.where(pesos > 1e-3, suma / np.maximum(pesos, 1e-3), 0.0) - CLARO
        sin_huella = np.maximum(sin_huella, base + peso * np.clip(hasta, 0.0, cojin['maximo']))

    # La huella: nada de lo que sostiene puede quedar por encima de la piel menos el claro. La espuma no deja un
    # escalón al borde de lo que se hunde, así que la profundidad se ensancha antes de restarla.
    hondo = np.maximum(0.0, sin_huella - (cuerpo - CLARO))
    ancho = np.maximum(hondo, difuminar(hondo, 0.018))
    con_huella = sin_huella - ancho
    return con_huella, sin_huella


def _largo_tenso(x, h):
    """El largo de un hilo tenso tendido por encima de un perfil: el de su envolvente convexa por arriba."""
    pila = []
    for punto in zip(x, h):
        while len(pila) >= 2:
            (x1, h1), (x2, h2) = pila[-2], pila[-1]
            # Si el punto del medio queda por debajo de la cuerda entre sus vecinos, el hilo no lo toca.
            if (x2 - x1) * (punto[1] - h1) - (h2 - h1) * (punto[0] - x1) >= 0:
                pila.pop()
            else:
                break
        pila.append(punto)
    p = np.array(pila)
    return float(np.hypot(np.diff(p[:, 0]), np.diff(p[:, 1])).sum())


def ancho_del_pano(decubito, relieve):
    """
    El medio ancho del paño extendido, por fila de la rejilla: lo que mide un hilo tenso tendido de canto a canto
    por encima del cuerpo, más lo que debe colgar. `relieve` es lo más alto que hay en cada celda, cuerpo o
    sábana.
    """
    x, _ = centros()
    sobre = np.abs(x[:, 0]) <= ANCHO_DEL_COLCHON / 2
    y = Y0 + (np.arange(NY) + 0.5) * PASO
    y0 = INICIO_DEL_COLCHON[decubito]
    # Fuera del colchón no hay canto del que colgar: vale la fila del colchón más cercana.
    filas = np.clip(np.arange(NY), int((y0 - Y0) / PASO) + 3, int((y0 + LARGO_DEL_COLCHON - Y0) / PASO) - 3)
    medio = np.empty(NY)
    hecho = {}
    for j, fila in enumerate(filas):
        if fila not in hecho:
            hecho[fila] = _largo_tenso(x[sobre, 0], relieve[sobre, fila]) / 2
        medio[j] = hecho[fila]
    # Cada fila pide el ancho de la que más pide a seis centímetros a la redonda, y solo después se alisa.
    # Alisando a secas, la mano —que es corta y es lo más alto que hay junto al borde— se quedaba con el ancho
    # promediado con el del antebrazo y el del muslo, que piden menos: le faltaban tres centímetros de tela y
    # el orillo subía en una muesca justo a su altura.
    alcance = int(round(0.06 / PASO))
    ancho = np.pad(medio, alcance, mode='edge')
    medio = np.max(np.stack([ancho[k:k + NY] for k in range(2 * alcance + 1)]), axis=0)
    # El paño no cambia de ancho de un centímetro al siguiente. Con menos desenfoque, a la altura de las manos
    # —que van sobre su cojín, altas y al borde del colchón— sobraba tela de golpe y se hacía un pellizco.
    sigma = 0.10 / PASO
    radio = int(np.ceil(sigma * 3))
    t = np.arange(-radio, radio + 1)
    nucleo = np.exp(-0.5 * (t / sigma) ** 2)
    nucleo /= nucleo.sum()
    liso = np.convolve(np.pad(medio, radio, mode='edge'), nucleo, mode='valid')
    return y, liso + CUELGA_DEL_PANO


def carpa(alto, pendiente=1.0):
    """
    La carpa sobre un relieve: la superficie más baja que lo cubre sin bajar nunca con más de esa pendiente.

    Es de donde parte el paño. La primera simulación lo dejaba caer plano desde 27 cm, y la tela llegaba a los
    dedos de los pies con tanta velocidad que los atravesaba y se quedaba enganchada del revés. Sobre la carpa
    la tela ya está casi donde va a quedar: lo que le resta es asentarse.
    """
    recto = pendiente * PASO
    pasos = (((0, 1), recto), ((0, -1), recto), ((1, 0), recto), ((-1, 0), recto),
             ((1, 1), recto * np.sqrt(2)), ((1, -1), recto * np.sqrt(2)), ((-1, 1), recto * np.sqrt(2)), ((-1, -1), recto * np.sqrt(2)))
    t = np.asarray(alto, dtype=np.float64).copy()
    for _ in range(2000):
        ancho = np.pad(t, 1, mode='edge')
        nuevo = t
        for (dx, dy), baja in pasos:
            nuevo = np.maximum(nuevo, ancho[1 + dx:ancho.shape[0] - 1 + dx, 1 + dy:ancho.shape[1] - 1 + dy] - baja)
        if float((nuevo - t).max()) < 1e-7:
            break
        t = nuevo
    return t


def cuerpo_por_arriba(arriba, suelo):
    """
    El cuerpo visto desde arriba, como malla: una altura por celda, la más alta de la piel, y un acantilado en
    el contorno que baja hasta `suelo`. Devuelve vértices (x, y, altura) y cuadros.

    Es contra lo que choca el paño, en vez de la piel de verdad. Con la piel, la tela se colaba entre los dedos
    y se enredaba; y lo que una tela que cae ve de un cuerpo es exactamente esto: su envolvente por arriba. Por
    debajo de lo más ancho de un muslo no entra, porque nada la empuja hacia allí.
    """
    hay = np.isfinite(arriba)
    cerca = vecindad(hay.astype(np.float64), np.maximum) > 0
    alto = vecindad(rellenar(arriba, -10.0), np.maximum)
    campo = np.where(cerca, np.maximum(alto, suelo), suelo)
    # Las manos y los pies, en mitón: se rellenan los valles de menos de cuatro centímetros —entre los dedos,
    # entre un tobillo y el otro— antes de alisar. Boca arriba las palmas miran al techo con los dedos algo
    # recogidos, y la tela de ocho milímetros se metía entre ellos: se enganchaba en las yemas, salía de cada
    # una un pliegue hasta el canto del colchón y la mano tapada parecía una garra. Una tela de verdad no baja
    # entre dos dedos; pasa de uno a otro.
    cerrado = cerrar(campo, 0.02)
    # El desenfoque redondea lo que el cierre deja en escalones; el máximo con lo medido garantiza que alisar
    # no deja ninguna punta de la piel por encima.
    liso = np.maximum(difuminar(cerrado, 0.006), campo)
    cerca = vecindad((cerrado > suelo + 0.0005).astype(np.float64), np.maximum) > 0
    alto = np.where(cerca, np.maximum(liso, suelo), suelo)
    ii, jj = np.where(cerca)
    i0, i1, j0, j1 = max(ii.min() - 2, 0), min(ii.max() + 3, NX), max(jj.min() - 2, 0), min(jj.max() + 3, NY)
    x, y = centros()
    recorte = (slice(i0, i1), slice(j0, j1))
    n, m = i1 - i0, j1 - j0
    vertices = np.stack([x[recorte].ravel(), y[recorte].ravel(), alto[recorte].ravel()], axis=-1)
    indice = np.arange(n * m).reshape(n, m)
    cuadros = np.stack([indice[:-1, :-1], indice[1:, :-1], indice[1:, 1:], indice[:-1, 1:]], axis=-1).reshape(-1, 4)
    c = cerca[recorte]
    con_cuerpo = (c[:-1, :-1] | c[1:, :-1] | c[1:, 1:] | c[:-1, 1:]).ravel()
    return vertices, cuadros[con_cuerpo]


def sobre_la_carpa(decubito, puntos, carpa_alta, margen):
    """
    Dónde empieza cada vértice del paño: sobre la carpa, y repartido a lo ancho por el largo de la propia carpa
    y no por su sombra. Así la tela empieza sin estirar: un punto que extendido queda a 50 cm del centro empieza
    a 50 cm medidos sobre la lona, que sobre el pecho son bastante menos en horizontal.
    """
    finos = X0 + PASO / 2 + np.arange(0, (X1 - X0 - PASO) / (PASO / 2)) * (PASO / 2)
    centro = int(np.argmin(np.abs(finos)))
    salida = np.empty((len(puntos), 3))
    for y in np.unique(puntos[:, 1]):
        cuales = puntos[:, 1] == y
        perfil = interpolar(carpa_alta, finos, np.full_like(finos, y))
        tramo = np.hypot(np.diff(finos), np.diff(perfil))
        recorrido = np.concatenate([[0.0], np.cumsum(tramo)])
        recorrido -= recorrido[centro]
        x = np.interp(puntos[cuales, 0], recorrido, finos)
        salida[cuales, 0] = x
        salida[cuales, 1] = y
        salida[cuales, 2] = interpolar(carpa_alta, x, np.full_like(x, y)) + margen
    return salida


def _coser(fila_a, xa, fila_b, xb):
    """Los triángulos entre dos filas de vértices ordenadas por x, la de abajo y la de arriba."""
    i = j = 0
    triangulos = []
    while i < len(fila_a) - 1 or j < len(fila_b) - 1:
        if j == len(fila_b) - 1:
            por_abajo = True
        elif i == len(fila_a) - 1:
            por_abajo = False
        else:
            # Se avanza por donde la diagonal que queda es más corta: es lo que evita los triángulos afilados.
            por_abajo = abs(xa[i + 1] - xb[j]) <= abs(xb[j + 1] - xa[i])
        if por_abajo:
            triangulos.append((fila_a[i], fila_a[i + 1], fila_b[j]))
            i += 1
        else:
            triangulos.append((fila_a[i], fila_b[j + 1], fila_b[j]))
            j += 1
    return triangulos


def pano_extendido(decubito, relieve, paso):
    """
    El paño antes de caer: sus vértices (x, y) y sus triángulos.

    Va en una red de triángulos casi equiláteros y no en una cuadrícula. En una cuadrícula, la simulación de
    tela dobla siempre a lo largo de las filas y de las columnas, y los pliegues salen en ángulo recto.
    """
    ys, medios = ancho_del_pano(decubito, relieve)
    ya, yb = PANO[decubito]['y']
    alto = paso * np.sqrt(3) / 2
    filas_y = np.linspace(ya, yb, int(round((yb - ya) / alto)) + 1)
    puntos, filas = [], []
    for k, y in enumerate(filas_y):
        w = float(np.interp(y, ys, medios))
        n = max(2, int(round(2 * w / paso)))
        x = np.linspace(-w, w, n + 1)
        if k % 2:
            # Las filas impares van corridas medio paso, con sus dos extremos sobre el borde para que el
            # orillo salga recto y no en dientes de sierra.
            x = np.concatenate([[-w], (x[:-1] + x[1:]) / 2, [w]])
        filas.append((len(puntos) + np.arange(len(x)), x))
        puntos.extend((xi, y) for xi in x)
    triangulos = []
    for (ia, xa), (ib, xb) in zip(filas[:-1], filas[1:]):
        triangulos.extend(_coser(ia, xa, ib, xb))
    triangulos = np.array(triangulos, dtype=np.int64)
    if ARRIBA[decubito] < 0:
        # Boca abajo «arriba» es −Z: se da la vuelta a los triángulos para que la cara vista siga siendo la de
        # fuera.
        triangulos = triangulos[:, ::-1]
    return np.array(puntos, dtype=np.float64), triangulos


# ------------------------------------------------------------------------- la tela que viste al colchón


def _rejilla_con_borde(medio_a, medio_l, paso):
    """Una rejilla regular de (a, l) que cubre ±medio_a × ±medio_l, y sus cuadros como índices."""
    na = max(2, int(np.ceil(2 * medio_a / paso)) + 1)
    nl = max(2, int(np.ceil(2 * medio_l / paso)) + 1)
    a = np.linspace(-medio_a, medio_a, na)
    l = np.linspace(-medio_l, medio_l, nl)
    aa, ll = np.meshgrid(a, l, indexing='ij')
    indice = np.arange(na * nl).reshape(na, nl)
    cuadros = np.stack([indice[:-1, :-1], indice[1:, :-1], indice[1:, 1:], indice[:-1, 1:]], axis=-1).reshape(-1, 4)
    return aa.ravel(), ll.ravel(), cuadros


def tela_sobre_el_colchon(decubito, alturas, caida, paso=0.007, holgura=HOLGURA_DE_LA_SABANA, onda=0.0, aire=0.0):
    """
    Una tela que cubre la cara de arriba del colchón, dobla el canto y baja por la pared.

    `alturas` es la rejilla de alturas que la tela sigue por arriba (el apoyo con su huella); `caida`, lo que
    baja desde el canto, medido sobre la tela. Devuelve los vértices en el cuerpo, los cuadros y, por vértice,
    su sitio sobre la tela extendida en metros (lo que será su UV).

    Se hace con una sola cuenta —la distancia de cada punto de la tela extendida al contorno del colchón— y no
    cosiendo una tapa con cuatro faldones: así la esquina redonda sale sin costura, y lo que sirve para la
    sábana sirve, alargando la caída, para la pared contra la que choca el paño (`aire` la separa hacia fuera).
    """
    marco = marco_del_colchon(decubito)
    s = ARRIBA[decubito]
    radio = RADIO_DEL_CANTO + holgura
    # El contorno desde el que la tela empieza a doblar: el del colchón, metido lo que mide el canto.
    medio_a = ANCHO_DEL_COLCHON / 2 - RADIO_DEL_CANTO
    medio_l = LARGO_DEL_COLCHON / 2 - RADIO_DEL_CANTO
    esquina = RADIO_EN_PLANTA - RADIO_DEL_CANTO
    fuera = radio * np.pi / 2 + caida

    a, l, cuadros = _rejilla_con_borde(medio_a + fuera, medio_l + fuera, paso)
    # El punto del núcleo (el rectángulo sin sus esquinas redondas) más cercano, y desde él la distancia.
    ca = np.clip(a, -(medio_a - esquina), medio_a - esquina)
    cl = np.clip(l, -(medio_l - esquina), medio_l - esquina)
    va, vl = a - ca, l - cl
    lejos = np.hypot(va, vl)
    d = lejos - esquina
    con_normal = lejos > 1e-9
    na = np.where(con_normal, va / np.maximum(lejos, 1e-9), 0.0)
    nl = np.where(con_normal, vl / np.maximum(lejos, 1e-9), 0.0)

    # Las esquinas de la tela extendida quedan más lejos que su caída: se recogen sobre el borde, que así sale
    # redondo y liso en vez de dentado. Los cuadros que quedan enteros por fuera se tiran.
    sobra = np.maximum(0.0, d - fuera)
    a, l, d = a - na * sobra, l - nl * sobra, np.minimum(d, fuera)
    vivos = (lejos[cuadros] - esquina).min(axis=1) < fuera - paso * 0.25
    cuadros = cuadros[vivos]

    # Sobre la cara de arriba, la tela está donde está. Pasado el contorno, cuelga del punto del contorno.
    arriba = d <= 0
    qa = np.where(arriba, a, ca + na * esquina)
    ql = np.where(arriba, l, cl + nl * esquina)
    en_el_plano = marco['origen'][None, :] + qa[:, None] * marco['ancho'][None, :] + ql[:, None] * marco['largo'][None, :]
    x, y = en_el_plano[:, 0], en_el_plano[:, 1]
    punto = np.stack([x, y, s * interpolar(alturas, x, y)], axis=-1)

    recorrido = np.maximum(d, 0.0)
    angulo = np.minimum(recorrido / radio, np.pi / 2)
    recto = np.maximum(0.0, recorrido - radio * np.pi / 2)
    hacia_fuera = na[:, None] * marco['ancho'][None, :] + nl[:, None] * marco['largo'][None, :]
    sale = radio * np.sin(angulo) + aire * escalon(0.0, np.pi / 2, angulo)
    if onda:
        # El borde no cae a plomo: ondula un poco, más cuanto más abajo, y solo hacia fuera.
        fase = x * 23.0 + y * 17.0
        sale = sale + onda * (recto / max(caida, 1e-6)) * (1 + 0.6 * np.sin(fase) + 0.4 * np.sin(fase * 2.7 + 1.3))
    baja = radio * (1 - np.cos(angulo)) + recto
    punto = punto + hacia_fuera * sale[:, None] - marco['normal'][None, :] * baja[:, None]

    usados = np.unique(cuadros)
    nuevo = np.full(len(a), -1)
    nuevo[usados] = np.arange(len(usados))
    return punto[usados], nuevo[cuadros], np.stack([a[usados], l[usados]], axis=-1)

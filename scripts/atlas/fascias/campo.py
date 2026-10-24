"""
Campos de distancia sobre una rejilla de voxeles (P-006, E1).

Una fascia es el manguito que envuelve lo que tiene debajo. Para calcularlo no se parte de la
malla de lo envuelto sino de su **volumen**: se rellena, se cierran los surcos entre una pieza y
otra, y se saca la superficie del resultado. Aquí está todo lo que trabaja con voxeles; las mallas
están en `malla.py`.

Todo va en **metros**, que es la unidad del atlas, y las rejillas son de cubos de lado `h`.

Por qué no se rellena por paridad de rayos, que es lo clásico: las mallas del atlas no son todas
cerradas (hay láminas, como la membrana interósea, y piezas que el atlas de origen dejó con
agujeros), y un rayo que cruza una malla abierta cuenta mal sin que nada lo diga. Se hace al
revés: se marcan los voxeles que la superficie toca, se engrosan un voxel para sellar las
grietas y se **inunda desde fuera**; lo que la inundación no alcanza está dentro. No depende de
que la malla sea cerrada, solo de que no tenga agujeros más anchos que dos voxeles.
"""

from dataclasses import dataclass

import numpy as np
from scipy import ndimage as ndi


#: Cuánto sobresale, en voxeles, el borde de un relleno respecto de la superficie de la que salió.
#:
#: Medido sobre una esfera de 4 cm y voxeles de 2 mm (`probar.py`): el borde queda 1,29 mm fuera,
#: 0,65 casillas. Sale de marcar los voxeles que tocan la superficie, que no son una lámina sino
#: una banda de una casilla y algo, y de que esa banda se queda dentro del relleno. Es un sesgo
#: **sistemático** y no un error al azar, así que se resta una vez, en el nivel de la
#: isosuperficie (`nivel_de_la_superficie`), en vez de pelear con él en cada paso. Varía con la
#: orientación de la superficie respecto de la rejilla (de 0,5 a 0,87 casillas): por eso la
#: fascia se pone a casi un milímetro sobre el músculo y no a medio, para que ese margen cubra lo
#: que el sesgo deja de acertar.
SESGO_DEL_RELLENO = 0.65


def nivel_de_la_superficie(separacion, h):
    """El valor del campo con signo que da una superficie `separacion` metros por fuera de lo rellenado."""
    return separacion - SESGO_DEL_RELLENO * h


@dataclass(frozen=True)
class Rejilla:
    """Una caja de voxeles cúbicos: dónde está su primer vértice, el lado y cuántos hay por eje."""

    origen: tuple
    h: float
    forma: tuple

    @classmethod
    def sobre(cls, minimo, maximo, h, margen):
        """
        La rejilla que cubre la caja `[minimo, maximo]` con `margen` por cada lado.

        El margen no es un adorno: la inundación sale de la esquina (0, 0, 0) y el cierre trata el
        borde como «fuera». Con material pegado al borde, la inundación se colaría por dentro y el
        cierre se comería lo que toca el borde. Hay que dar al menos cuatro veces el radio del
        cierre.
        """
        minimo = np.asarray(minimo, float) - margen
        maximo = np.asarray(maximo, float) + margen
        forma = tuple(int(n) for n in np.ceil((maximo - minimo) / h) + 1)
        return cls(tuple(float(x) for x in minimo), float(h), forma)

    def indices(self, puntos):
        """El voxel de cada punto, como enteros (N×3); los que caen fuera de la rejilla se marcan con -1."""
        g = np.floor((np.asarray(puntos, float) - np.asarray(self.origen)) / self.h).astype(np.int64)
        dentro = np.all((g >= 0) & (g < np.asarray(self.forma)), axis=1)
        g[~dentro] = -1
        return g

    def centros(self):
        """Los tres ejes de coordenadas de los centros de los voxeles (para evaluar funciones)."""
        return tuple(
            self.origen[i] + (np.arange(self.forma[i]) + 0.5) * self.h for i in range(3)
        )


# ----------------------------------------------------------------- superficie


def muestrear_superficie(v, f, paso, semilla):
    """
    Puntos repartidos por la superficie de una malla, a menos de `paso` unos de otros.

    Una triángulo grande recibe más puntos que uno pequeño (en proporción a su área), y los
    vértices entran siempre. La semilla es obligatoria: dos corridas con la misma tienen que dar
    el mismo archivo, que es la comprobación que vigila que el resultado sea reproducible.
    """
    v = np.asarray(v, np.float64)
    f = np.asarray(f, np.int64)
    if len(f) == 0:
        return v.copy()
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    cuantos = np.maximum(1, np.ceil(area / (0.5 * paso * paso)).astype(np.int64))
    quien = np.repeat(np.arange(len(f)), cuantos)
    azar = np.random.default_rng(semilla)
    r1 = np.sqrt(azar.random(len(quien)))
    r2 = azar.random(len(quien))
    puntos = (
        a[quien] * (1 - r1)[:, None]
        + b[quien] * (r1 * (1 - r2))[:, None]
        + c[quien] * (r1 * r2)[:, None]
    )
    return np.vstack([v, puntos])


def ocupar(rejilla, puntos):
    """Los voxeles que tocan los puntos, como máscara booleana."""
    ocupacion = np.zeros(rejilla.forma, bool)
    g = rejilla.indices(puntos)
    g = g[g[:, 0] >= 0]
    ocupacion[g[:, 0], g[:, 1], g[:, 2]] = True
    return ocupacion


def rellenar(ocupacion, engrosar=1):
    """
    El volumen que encierra una superficie, aunque no sea del todo cerrada.

    Se engrosa la superficie `engrosar` voxeles para sellar las grietas, se inunda desde la
    esquina de la rejilla (que tiene que estar fuera: ver `Rejilla.sobre`), y se vuelve a
    adelgazar lo mismo que se engrosó. Sin ese último paso el relleno saldría un voxel más
    grande por cada lado, y dos milímetros de más en una fascia que debería estar a medio.

    Si la esquina resulta estar dentro de lo marcado, el relleno saldría entero: se avisa con un
    error en vez de seguir con un campo que no significa nada.
    """
    if ocupacion[0, 0, 0]:
        raise ValueError('La esquina de la rejilla está ocupada: falta margen alrededor de las entradas.')
    gruesa = ndi.binary_dilation(ocupacion, iterations=engrosar) if engrosar else ocupacion
    etiquetas, _ = ndi.label(~gruesa)
    fuera = etiquetas == etiquetas[0, 0, 0]
    relleno = ~fuera
    if engrosar:
        relleno = ndi.binary_erosion(relleno, iterations=engrosar, border_value=0)
    return relleno


# ------------------------------------------------------------------ distancias


def distancia_al_exterior(mascara, h):
    """Para cada voxel de la máscara, a qué distancia (m) está lo más cercano que no lo es. Cero fuera."""
    return (ndi.distance_transform_edt(mascara) * h).astype(np.float32)


def distancia_a_la_mascara(mascara, h):
    """Para cada voxel de fuera, a qué distancia (m) está lo más cercano que es de la máscara. Cero dentro."""
    return (ndi.distance_transform_edt(~mascara) * h).astype(np.float32)


def cierre(relleno, radio, h):
    """
    El cierre morfológico del relleno: dilatar `radio` y erosionar `radio`.

    Es lo que hace que el manguito **pase por encima** de un surco más estrecho que dos radios
    en vez de meterse en él, como pasa la fascia de verdad sobre el espacio entre dos músculos.
    Lo que sobresale y no es cóncavo no cambia: un cilindro cerrado es el mismo cilindro. Las
    concavidades más anchas que dos radios tampoco: la fascia no atraviesa la corva.

    Las distancias son a los voxeles de verdad, no a una aproximación, así que el cierre es
    isótropo (no prefiere los ejes de la rejilla, como haría con un elemento cuadrado).
    """
    if radio <= 0:
        return relleno.copy()
    dilatado = distancia_a_la_mascara(relleno, h) <= radio
    # El relleno de bordes con `False` hace que el límite de la rejilla cuente como «fuera»: sin
    # él, el cierre no erosionaría nada contra el borde y dejaría un reborde falso allí.
    relleno_ampliado = np.pad(dilatado, 1, mode='constant', constant_values=False)
    erosionado = ndi.distance_transform_edt(relleno_ampliado)[1:-1, 1:-1, 1:-1] * h >= radio
    return erosionado | relleno


def campo_con_signo(relleno, h):
    """
    La distancia con signo al borde del relleno: positiva fuera, negativa dentro.

    Medida entre centros de voxeles, la distancia del primer voxel de fuera al más cercano de
    dentro es `h`, y la verdadera es `h / 2`. Se resta esa media casilla a cada lado para que el
    cero caiga justo en la cara entre un voxel de dentro y uno de fuera, y para que las
    distancias lejos del borde sean las verdaderas y no `h / 2` de más.
    """
    fuera = ndi.distance_transform_edt(~relleno) * h
    dentro = ndi.distance_transform_edt(relleno) * h
    campo = np.where(relleno, -(dentro - 0.5 * h), fuera - 0.5 * h)
    return campo.astype(np.float32)


def suavizar(campo, sigma):
    """Una gaussiana de `sigma` voxeles: quita el escalón de la rejilla del campo, no la forma."""
    if sigma <= 0:
        return campo
    return ndi.gaussian_filter(campo, sigma, mode='nearest')


def volumen_de_la_mascara(mascara, h):
    """Litros de una máscara: para comparar con lo que se espera de una pierna, no para calcular."""
    return float(mascara.sum()) * h**3 * 1000.0


def superficie_de_la_rejilla(campo, rejilla, nivel=0.0):
    """
    La superficie de un campo calculado sobre una `Rejilla`, en las coordenadas del cuerpo.

    Un valor del campo es el de su voxel **en el centro del voxel**, no en su esquina: el
    primer valor está a media casilla del origen. Olvidarlo corre la malla entera medio voxel
    (un milímetro), que es justo lo que no se ve al mirarla y sí al compararla con el músculo.
    """
    from malla import superficie_de_un_campo

    origen = tuple(o + 0.5 * rejilla.h for o in rejilla.origen)
    return superficie_de_un_campo(campo, origen, rejilla.h, nivel)

"""
Las recetas de las fascias (P-006): qué envuelve cada una, con qué radio y dónde empieza y acaba.

Es lo único que cambia de una etapa a otra: E2 escribió las del miembro inferior, E5 y E6 las del resto del
cuerpo, E8 y E9 las de las meninges y las serosas. El motor (`campo.py`, `malla.py`, `capas.py`,
`generar.py`) no sabe de anatomía; aquí está toda.

## Grupos y piezas

Un **grupo** es una región del cuerpo que se calcula **de una vez**: el miembro inferior derecho, de la
cadera a los dedos; el tronco con el cuello y la cabeza. De él sale una sola superficie continua, que se
**parte por planos** en las **piezas** que la anatomía distingue (la fascia lata, la crural, la del pie…).
Se hace así y no pieza por pieza porque dos piezas vecinas calculadas por separado no coinciden en el borde:
cada una cerraría sus músculos con un entorno distinto. Cortadas de la misma superficie comparten, hasta el
redondeo, el mismo borde, y la red de fascia sale ininterrumpida, que es lo que pidió el dueño.

Entre dos **grupos** la continuidad es la de un plano compartido: cada uno cierra lo suyo, y las dos mallas se
encuentran allí con la diferencia de lo que el cierre de cada una haga de más o de menos (milímetros). Por eso
los grupos son pocos y grandes.

## Lo que hay que tener presente al escribir una

 - **`id` nunca se reutiliza ni se renumera.** Una preparación guardada nombra la pieza por su `id`. Si una
   pieza deja de hacer falta, se quita de aquí y su número queda sin usar. Los números van por capa: de 1 en
   adelante la profunda, de 100 la superficial, de 200 la meníngea, de 300 la visceral.
 - **`nombre` es el original en inglés** y es la clave de la traducción (`src/atlas/nombres-es.json`). Se toma
   de la Foundational Model of Anatomy, que es lo que el atlas ya hace, y el código `fma` se verificó en la
   ontología (EBI OLS) el 2026-10-24.
 - **Las piezas pares** se escriben solo del lado derecho. El izquierdo sale por espejo con el mismo `id` más
   una `M` (la convención del atlas) y su código FMA propio, que no siempre es el siguiente. Las impares
   (la fascia toracolumbar, la del cuello) no se espejan.
 - **Los planos son de «lo que se queda»**: `(punto, normal)`, y queda lo que mira la normal. Una pieza es la
   intersección de sus planos, y puede sumar otras regiones (`otras`).
"""

from dataclasses import dataclass
from typing import Callable

import numpy as np

# --------------------------------------------------------------------- tipos


@dataclass(frozen=True)
class Pieza:
    id: str
    #: El nombre original, en inglés, del lado derecho. El izquierdo se deduce cambiando «right» por «left».
    nombre: str
    fma: str
    #: El código del lado izquierdo; vacío en una pieza impar.
    fma_izquierdo: str
    sistema: str
    region: str
    region_izquierda: str
    #: Lo que se queda de la superficie del grupo: la intersección de estos semiespacios, o una función del
    #: atlas que los da (para los límites que se miden sobre el propio atlas, como la palma de la mano).
    planos: object = ()
    #: Más regiones que se suman a la primera (la unión de convexos): sin esto una pieza no podría ser cóncava.
    otras: tuple = ()
    #: Si tiene pareja en el otro lado, que se hace por espejo.
    par: bool = True
    #: Para quien lea el catálogo dentro de un año: qué es y dónde empieza y acaba.
    nota: str = ''


@dataclass(frozen=True)
class Grupo:
    id: str
    descripcion: str
    #: De cuántos metros es cada voxel. 2 mm en los miembros, 3 mm en el tronco y la cabeza.
    h: float
    #: Radio del cierre en función de la altura: pares `(y, radio)`, interpolados. Un solo par = constante.
    radio_segun_y: tuple
    #: A cuántos metros por encima de lo envuelto queda la fascia. Un poco menos de un milímetro: ver `campo.SESGO_DEL_RELLENO`.
    separacion: float
    #: Qué piezas del atlas envuelve: una función del atlas que devuelve piezas del catálogo.
    entradas: Callable
    piezas: tuple = ()
    #: Pasadas de Taubin y gaussiana del campo, en voxeles.
    taubin: int = 10
    sigma: float = 1.2
    #: Triángulos por metro cuadrado de la malla ya decimada (la del atlas son unos 25.000 a 30.000).
    densidad: float = 28000.0
    #: Qué constructor la hace (`capas.CONSTRUCTORES`) y lo que ese constructor necesita saber.
    tipo: str = 'envoltura'
    parametros: dict = None  # type: ignore[assignment]

    def __post_init__(self):
        if self.parametros is None:
            object.__setattr__(self, 'parametros', {})


# --------------------------------------------------------------- utilidades


def plano(punto, normal):
    """Un semiespacio de «lo que se queda»."""
    return (tuple(float(x) for x in punto), tuple(float(x) for x in normal))


def por_encima(y):
    return plano((0.0, y, 0.0), (0.0, 1.0, 0.0))


def por_debajo(y):
    return plano((0.0, y, 0.0), (0.0, -1.0, 0.0))


def hacia_atras_de(z):
    """Lo que está detrás (z menor) del plano z = const: el atlas pone la cara del cuerpo en z positiva."""
    return plano((0.0, 0.0, z), (0.0, 0.0, -1.0))


def hacia_delante_de(z):
    return plano((0.0, 0.0, z), (0.0, 0.0, 1.0))


def lateral_a(x):
    """En el lado derecho del sujeto, lo lateral es x más negativa."""
    return plano((x, 0.0, 0.0), (-1.0, 0.0, 0.0))


def medial_a(x):
    return plano((x, 0.0, 0.0), (1.0, 0.0, 0.0))


def plano_por_tres_puntos(a, b, c, arriba):
    """
    El plano que pasa por tres puntos, con la normal hacia el lado donde está `arriba`.

    Para los límites oblicuos —el pliegue de la ingle, el del glúteo— que no son horizontales y que dos puntos
    no fijan. Se da un punto que debe quedar del lado bueno para no depender del orden en que se nombran.
    """
    a, b, c, arriba = (np.asarray(p, float) for p in (a, b, c, arriba))
    n = np.cross(b - a, c - a)
    n = n / np.linalg.norm(n)
    if np.dot(arriba - a, n) < 0:
        n = -n
    return plano(a, n)


def nombre_del_otro_lado(nombre):
    """«Right crural fascia» → «Left crural fascia», respetando la mayúscula, como `espejo.ts`."""
    import re

    def cambia(m):
        palabra = m.group(0)
        nueva = 'left' if palabra.lower() == 'right' else 'right'
        return nueva.capitalize() if palabra[0].isupper() else nueva

    return re.sub(r'\b(right|left)\b', cambia, nombre, flags=re.IGNORECASE)


def _centro(atlas, nombre):
    """El centro (media de los vértices) de una pieza del atlas, por su nombre."""
    v, _ = atlas.malla(atlas.por_nombre(nombre)[0])
    return v.astype(float).mean(axis=0)


def plano_de_la_palma(atlas, lado='derecho', palmar=True):
    """
    El plano que separa la palma de la mano del dorso, medido sobre el atlas.

    No se supone hacia dónde mira la mano —el atlas la pone como sale de BodyParts3D, con el antebrazo en
    reposo—: se toma del vector que va del centro de los **interóseos dorsales** al de los **palmares**. El
    plano pasa por el medio y mira hacia la palma si `palmar`, y hacia el dorso si no.
    """
    de = 'right' if lado == 'derecho' else 'left'
    palma = _centro(atlas, f'Set of palmar interossei of {de} hand')
    dorso = _centro(atlas, f'Set of dorsal interossei of {de} hand')
    n = palma - dorso
    n = n / np.linalg.norm(n)
    medio = (palma + dorso) / 2
    return plano(medio, n if palmar else -n)


# ----------------------------------------------------------------- los hitos

#: Puntos del cuerpo que fijan los límites de cada pieza, medidos sobre el atlas (`caja` de cada pieza,
#: 2026-10-24). Son anatomía y no números a ojo: cada uno dice de qué estructura sale, para poder rehacerlo si
#: el atlas se regenera.
#:
#:  - Rodilla, y = 0,451: la meseta tibial (techo de la tibia derecha, 0,452) y los cóndilos (suelo del fémur
#:    derecho, 0,446). La fascia lata y la crural se encuentran en esa altura.
#:  - Tobillo, y = 0,075: bajo la punta del maléolo medial (la tibia baja hasta 0,072) y el lateral (el peroné,
#:    0,053), donde la fascia crural se hace retináculo.
#:  - Pie: las cabezas de los metatarsianos están en z ≈ 0,085–0,095; los dedos pasan de ahí.
#:  - Cresta ilíaca, y = 1,030: la parte alta del glúteo medio (1,029) y del hueso coxal (1,036).
#:  - Codo, y = 1,110: el húmero baja hasta 1,107 y el radio sube hasta 1,113.
#:  - Muñeca, y = 0,875: el radio y el cúbito acaban en 0,883–0,884; el carpo está justo debajo.
#:  - Hombro, y = 1,440: el techo de la escápula (1,428) y de la clavícula (1,434).
#:  - Arco costal, y = 1,190: el borde inferior de las costillas en la cara anterior.
#:  - Base del cuello, y = 1,440: la primera vértebra torácica llega a 1,455 y la séptima cervical a 1,443.
#:  - Mandíbula, y = 1,500: el borde inferior de la mandíbula (1,500) y el hioides (1,500 a 1,519).
RODILLA_Y = 0.451
TOBILLO_Y = 0.075
PLANTA_Y = 0.028
PIE_ANTERIOR_Z = 0.092
CRESTA_ILIACA_Y = 1.030
CODO_Y = 1.110
MUNECA_Y = 0.875
DEDOS_Y = 0.800
HOMBRO_Y = 1.440
ARCO_COSTAL_Y = 1.190
BASE_DEL_CUELLO_Y = 1.440
MANDIBULA_Y = 1.500
ESPALDA_Z = -0.030

# El pliegue de la ingle y el del glúteo no son horizontales. Se fijan con tres puntos: el tubérculo del pubis
# (medial y delante), la espina ilíaca anterosuperior (lateral y arriba: el sartorio llega a y = 0,98) y el medio
# del pliegue glúteo (detrás y abajo: el glúteo mayor baja hasta y = 0,746). Lo que queda por debajo es muslo;
# por encima, cadera.
_PLIEGUE_DEL_MUSLO = plano_por_tres_puntos(
    (-0.030, 0.890, 0.055),
    (-0.140, 0.985, 0.030),
    (-0.090, 0.800, -0.105),
    arriba=(-0.09, 1.0, 0.0),
)
_DEBAJO_DEL_PLIEGUE = plano(_PLIEGUE_DEL_MUSLO[0], tuple(-c for c in _PLIEGUE_DEL_MUSLO[1]))


def espejo_del_plano(p):
    """El mismo plano al otro lado del cuerpo: `x → −x`. La normal se refleja igual, así que sigue diciendo «lo de dentro»."""
    (px, py, pz), (nx, ny, nz) = p
    return plano((-px, py, pz), (-nx, ny, nz))


# Dónde acaba el tronco y empieza el brazo, medido en la piel a cada altura (hueco entre las dos superficies,
# `x` del centro del hueco): a 0,85 m, −0,195; a 1,00 m, −0,172; a 1,10 m, −0,158; a 1,15 m, −0,158. Por encima de
# 1,2 m la piel es continua —la axila está cerrada— y el límite es el del hombro: una recta hacia fuera hasta el
# acromion (−0,20 a 1,44 m). Son dos planos oblicuos por altura, uno para la parte baja y otro para la alta.
# Cada uno **deja el lado del tronco**; el del brazo es el contrario (`al_otro_lado`).
_SEPARA_BAJO = plano_por_tres_puntos((-0.195, 0.850, 0.0), (-0.158, 1.150, 0.0), (-0.195, 0.850, 0.1), arriba=(0.0, 1.0, 0.0))
_SEPARA_ALTO = plano_por_tres_puntos((-0.152, 1.200, 0.0), (-0.200, 1.440, 0.0), (-0.152, 1.200, 0.1), arriba=(0.0, 1.3, 0.0))
_SEPARA_BAJO_IZQ = espejo_del_plano(_SEPARA_BAJO)
_SEPARA_ALTO_IZQ = espejo_del_plano(_SEPARA_ALTO)
_HOMBRO_DERECHO = _SEPARA_ALTO
_HOMBRO_IZQUIERDO = _SEPARA_ALTO_IZQ


def al_otro_lado(p):
    """El mismo plano mirando al lado contrario: lo que era «el tronco» pasa a ser «el brazo»."""
    return plano(p[0], tuple(-c for c in p[1]))


_COSTADO_DE_LA_CADERA = 0.19
_PLIEGUE_IZQUIERDO = espejo_del_plano(_PLIEGUE_DEL_MUSLO)

# ------------------------------------------------------------- qué envuelve


def _del_otro_lado(nombres, lado):
    return [nombre_del_otro_lado(n) for n in nombres] if lado == 'izquierdo' else list(nombres)


def _sin_repetir(piezas):
    vistas, unicas = set(), []
    for p in piezas:
        if p['id'] not in vistas:
            vistas.add(p['id'])
            unicas.append(p)
    return unicas


def entradas_miembro_inferior(lado):
    """
    Todo lo que hay bajo la fascia del miembro inferior de un lado.

    Las piezas de la región del miembro y del pie, **más** lo que el atlas coloca en «abdomen» siendo del muslo y
    de la cadera: los glúteos, el tensor de la fascia lata, los rotadores cortos, el obturador externo y el hueso
    coxal, que cierra la envoltura por arriba. Los psoas, el ilíaco y el obturador interno quedan fuera: están
    dentro de la pelvis, no bajo esta fascia.
    """

    def entradas(atlas):
        de_la_cadera = _del_otro_lado(
            [
                'Right gluteus maximus', 'Right gluteus medius', 'Right gluteus minimus', 'Right tensor fasciae latae',
                'Right gemellus superior', 'Right gemellus inferior', 'Right piriformis', 'Right obturator externus',
                'Right hip bone',
            ],
            lado,
        )
        piezas = atlas.seleccionar(
            regiones=[f'miembro-inferior-{lado}', f'pie-{lado}'],
            sistemas=['muscular', 'connective', 'skeletal'],
        )
        piezas += atlas.seleccionar(nombres=sorted(de_la_cadera))
        return _sin_repetir(piezas)

    return entradas


def entradas_miembro_superior(lado):
    """
    Lo que hay bajo la fascia del brazo, el antebrazo y la mano de un lado: las piezas de su región y de la mano,
    más el deltoides, los manguitos del hombro, los bíceps y tríceps (que el atlas pone en el tórax por su caja) y
    el húmero. La escápula y la clavícula no: son del tronco, y la fascia que las cubre (la infraespinosa, la
    pectoral) es del tronco.
    """

    def entradas(atlas):
        del_hombro = _del_otro_lado(
            [
                'Acromial part of right deltoid', 'Clavicular part of right deltoid', 'Spinal part of right deltoid',
                'Long head of right biceps brachii', 'Short head of right biceps brachii',
                'Long head of right triceps brachii', 'Medial head of right triceps brachii',
                'Lateral head of right triceps brachii', 'Right coracobrachialis', 'Right brachialis',
                'Right infraspinatus muscle', 'Right supraspinatus', 'Right teres major', 'Right teres minor',
                'Right humerus',
            ],
            lado,
        )
        piezas = atlas.seleccionar(
            regiones=[f'miembro-superior-{lado}', f'mano-{lado}'],
            sistemas=['muscular', 'connective', 'skeletal'],
        )
        piezas += atlas.seleccionar(nombres=sorted(del_hombro))
        # Lo que BodyParts3D clasifica como esqueleto siendo músculo y se lleva la región del brazo: el
        # subescapular y el elevador de la escápula son del tronco; se quitan.
        fuera = {'Right subscapularis', 'Left subscapularis', 'Right levator scapulae', 'Left levator scapulae'}
        return [p for p in _sin_repetir(piezas) if p['nombre'] not in fuera and 'rhomboid' not in p['nombre'].lower()]

    return entradas


def entradas_tronco_cuello_cabeza(atlas):
    """
    Todo lo que hay bajo la fascia del tronco, el cuello y la cabeza: huesos, músculos, vísceras y la cabeza, con
    los hombros (escápula y clavícula), sin los miembros.

    Se dejan fuera los vasos, los nervios y los linfáticos: son hilos finos que no definen una superficie y salen del
    tronco hacia los miembros, de modo que un cierre sobre ellos los tomaría como parte de la pared. Las
    extremidades se descartan por su región; lo que el atlas coloca en «abdomen» siendo del muslo ya está en el
    miembro inferior, y aquí solo se toma el hueso coxal y lo de la pelvis.
    """
    de_los_miembros = {
        'Right gluteus maximus', 'Right gluteus medius', 'Right gluteus minimus', 'Right tensor fasciae latae',
        'Right gemellus superior', 'Right gemellus inferior', 'Right piriformis', 'Right obturator externus',
        'Left gluteus maximus', 'Left gluteus medius', 'Left gluteus minimus', 'Left tensor fasciae latae',
        'Left gemellus superior', 'Left gemellus inferior', 'Left piriformis', 'Left obturator externus',
    }
    del_hombro = {
        'Acromial part of right deltoid', 'Clavicular part of right deltoid', 'Spinal part of right deltoid',
        'Acromial part of left deltoid', 'Clavicular part of left deltoid', 'Spinal part of left deltoid',
        'Long head of right biceps brachii', 'Short head of right biceps brachii', 'Long head of right triceps brachii',
        'Medial head of right triceps brachii', 'Lateral head of right triceps brachii', 'Right coracobrachialis',
        'Long head of left biceps brachii', 'Short head of left biceps brachii', 'Long head of left triceps brachii',
        'Medial head of left triceps brachii', 'Lateral head of left triceps brachii', 'Left coracobrachialis',
        'Right teres major', 'Right teres minor', 'Left teres major', 'Left teres minor',
    }
    piezas = atlas.seleccionar(
        regiones=['cabeza', 'cuello', 'torax', 'abdomen', 'tronco'],
        sistemas=['muscular', 'skeletal', 'connective', 'digestive', 'respiratory', 'cardiac', 'urinary', 'reproductive', 'endocrine', 'sensory', 'nervous'],
    )
    # El cerebro y sus partes (nervioso de la cabeza) entran: llenan el cráneo. Los nervios del tronco, no.
    # La oreja (`External ear`, del sistema sensorial) no: el pabellón es cartílago y piel por fuera de la fascia
    # temporal. Con ella dentro, el cierre la envolvía, la fascia temporal llegaba a dos milímetros de la oreja, y la
    # piel de D-224, que no puede quedar por debajo de ninguna fascia profunda, salía abollonada a su alrededor.
    return [
        p for p in piezas
        if p['nombre'] != 'External ear'
        and p['nombre'] not in de_los_miembros
        and p['nombre'] not in del_hombro
        and not (p['sistema'] == 'nervous' and p['region'] != 'cabeza')
        and not (p['sistema'] == 'skeletal' and any(k in p['nombre'].lower() for k in ('femur', 'tibia', 'fibula', 'humerus', 'radius', 'ulna')))
    ]


# ---------------------------------------------------------- miembro inferior

MIEMBRO_INFERIOR_DERECHO = Grupo(
    id='miembro-inferior-derecho',
    descripcion='De la cresta ilíaca a los dedos, bajo la fascia lata, la crural y las del pie.',
    h=0.002,
    # Más cerrado donde hay más masa y menos donde hay estructuras finas: en el pie, a 8 mm, los dedos y los
    # tendones quedarían fundidos en un bloque; en el muslo, a 4 mm, la fascia se metería entre los cuádriceps y
    # los isquiotibiales.
    radio_segun_y=((0.0, 0.004), (0.09, 0.006), (0.14, 0.008), (0.44, 0.008), (0.52, 0.010), (0.70, 0.012), (1.05, 0.012)),
    separacion=0.0008,
    entradas=entradas_miembro_inferior('derecho'),
    piezas=(
        Pieza(
            id='TH0001', nombre='Right fascia lata proper', fma='FMA58778', fma_izquierdo='FMA58779',
            sistema='fascia-profunda', region='miembro-inferior-derecho', region_izquierda='miembro-inferior-izquierdo',
            planos=(por_encima(RODILLA_Y), _DEBAJO_DEL_PLIEGUE, lateral_a(-0.008)),
            nota='Envuelve el muslo, de la rodilla al pliegue de la ingle y del glúteo; contiene la cintilla iliotibial.',
        ),
        Pieza(
            id='TH0002', nombre='Right crural fascia', fma='FMA58791', fma_izquierdo='FMA58792',
            sistema='fascia-profunda', region='miembro-inferior-derecho', region_izquierda='miembro-inferior-izquierdo',
            planos=(por_debajo(RODILLA_Y), por_encima(TOBILLO_Y)),
            nota='Envuelve la pierna, de la meseta tibial a los maléolos; se pega a la cara subcutánea de la tibia.',
        ),
        Pieza(
            id='TH0003', nombre='Right gluteal fascia', fma='FMA312815', fma_izquierdo='FMA312817',
            sistema='fascia-profunda', region='abdomen', region_izquierda='abdomen',
            # Detrás de z = 0,03 para no repetir la pared del abdomen, que es del tronco.
            planos=(_PLIEGUE_DEL_MUSLO, por_debajo(CRESTA_ILIACA_Y), lateral_a(-0.008), hacia_atras_de(0.03)),
            nota='Cubre los glúteos y el tensor de la fascia lata, del pliegue del muslo a la cresta ilíaca.',
        ),
        Pieza(
            id='TH0004', nombre='Dorsal fascia of right foot', fma='FMA58796', fma_izquierdo='FMA58797',
            sistema='fascia-profunda', region='pie-derecho', region_izquierda='pie-izquierdo',
            planos=(por_debajo(TOBILLO_Y), por_encima(PLANTA_Y), hacia_atras_de(PIE_ANTERIOR_Z)),
            nota='Envuelve el tarso y el metatarso por arriba y por los lados, del tobillo a las cabezas metatarsianas.',
        ),
        Pieza(
            id='TH0005', nombre='Right plantar aponeurosis', fma='FMA45172', fma_izquierdo='FMA45174',
            sistema='fascia-profunda', region='pie-derecho', region_izquierda='pie-izquierdo',
            planos=(por_debajo(PLANTA_Y), hacia_atras_de(PIE_ANTERIOR_Z)),
            nota='La planta del pie, del talón a las cabezas metatarsianas.',
        ),
    ),
)

MIEMBRO_INFERIOR_IZQUIERDO = Grupo(
    id='miembro-inferior-izquierdo',
    descripcion='La envolvente del miembro inferior izquierdo, que solo sirve a la fascia superficial: las piezas del lado izquierdo salen por espejo del derecho.',
    h=MIEMBRO_INFERIOR_DERECHO.h,
    radio_segun_y=MIEMBRO_INFERIOR_DERECHO.radio_segun_y,
    separacion=MIEMBRO_INFERIOR_DERECHO.separacion,
    entradas=entradas_miembro_inferior('izquierdo'),
    tipo='solo-envolvente',
)

# ---------------------------------------------------------- miembro superior

MIEMBRO_SUPERIOR_DERECHO = Grupo(
    id='miembro-superior-derecho',
    descripcion='Del hombro a los dedos, bajo la fascia braquial, la antebraquial y las de la mano.',
    h=0.002,
    radio_segun_y=((0.70, 0.004), (0.88, 0.005), (0.95, 0.006), (1.10, 0.007), (1.25, 0.008), (1.45, 0.010)),
    separacion=0.0008,
    entradas=entradas_miembro_superior('derecho'),
    piezas=(
        Pieza(
            id='TH0006', nombre='Right brachial fascia', fma='FMA37787', fma_izquierdo='FMA37788',
            sistema='fascia-profunda', region='miembro-superior-derecho', region_izquierda='miembro-superior-izquierdo',
            # Del codo al hombro; medialmente hasta el costado (el resto del manguito es la axila y la espalda).
            planos=(por_encima(CODO_Y), por_debajo(HOMBRO_Y), lateral_a(-0.135)),
            nota='Envuelve el brazo y el deltoides, del codo al hombro; la fascia deltoidea es su parte alta.',
        ),
        Pieza(
            id='TH0007', nombre='Right antebrachial fascia', fma='FMA38852', fma_izquierdo='FMA38853',
            sistema='fascia-profunda', region='miembro-superior-derecho', region_izquierda='miembro-superior-izquierdo',
            planos=(por_debajo(CODO_Y), por_encima(MUNECA_Y)),
            nota='Envuelve el antebrazo, del codo a la muñeca; continúa con los retináculos del carpo.',
        ),
        Pieza(
            id='TH0008', nombre='Right palmar aponeurosis', fma='FMA42440', fma_izquierdo='FMA42441',
            sistema='fascia-profunda', region='mano-derecha', region_izquierda='mano-izquierda',
            planos=lambda atlas: (por_debajo(MUNECA_Y), por_encima(DEDOS_Y), plano_de_la_palma(atlas, 'derecho', True)),
            nota='La cara de la palma, de la muñeca a la base de los dedos.',
        ),
        Pieza(
            id='TH0009', nombre='Dorsal fascia of right hand', fma='FMA42445', fma_izquierdo='FMA42446',
            sistema='fascia-profunda', region='mano-derecha', region_izquierda='mano-izquierda',
            planos=lambda atlas: (por_debajo(MUNECA_Y), por_encima(DEDOS_Y), plano_de_la_palma(atlas, 'derecho', False)),
            nota='El dorso de la mano, de la muñeca a la base de los dedos.',
        ),
    ),
)

MIEMBRO_SUPERIOR_IZQUIERDO = Grupo(
    id='miembro-superior-izquierdo',
    descripcion='La envolvente del miembro superior izquierdo, que solo sirve a la fascia superficial.',
    h=MIEMBRO_SUPERIOR_DERECHO.h,
    radio_segun_y=MIEMBRO_SUPERIOR_DERECHO.radio_segun_y,
    separacion=MIEMBRO_SUPERIOR_DERECHO.separacion,
    entradas=entradas_miembro_superior('izquierdo'),
    tipo='solo-envolvente',
)

# ------------------------------------------------- tronco, cuello y cabeza

TRONCO_CUELLO_CABEZA = Grupo(
    id='tronco-cuello-cabeza',
    descripcion='De la pelvis a la coronilla, bajo la fascia pectoral, la toracolumbar, la del abdomen, la del cuello y la temporal.',
    h=0.003,
    # El abdomen es lo menos definido del atlas (le faltan el recto, los oblicuos y el transverso): un cierre grande
    # lo alisa. En el cuello y la cabeza hay estructuras más finas.
    radio_segun_y=((0.83, 0.018), (1.00, 0.018), (1.20, 0.014), (1.43, 0.010), (1.52, 0.008), (1.60, 0.006), (1.72, 0.006)),
    separacion=0.0008,
    entradas=entradas_tronco_cuello_cabeza,
    densidad=30000.0,
    # Al abdomen del atlas le faltan el recto, los dos oblicuos internos y el transverso: sin pared, el cierre
    # seguiría las asas del intestino y dejaría un hueco en el ombligo. Se supone una pared a 22 mm bajo la piel.
    parametros={'bajo_la_piel': 0.022},
    piezas=(
        Pieza(
            id='TH0010', nombre='Right pectoral fascia', fma='FMA38173', fma_izquierdo='FMA38174',
            sistema='fascia-profunda', region='torax', region_izquierda='torax',
            planos=(por_encima(ARCO_COSTAL_Y), por_debajo(BASE_DEL_CUELLO_Y), hacia_delante_de(ESPALDA_Z), lateral_a(-0.0), _HOMBRO_DERECHO),
            nota='Cubre el pectoral mayor y la pared del tórax hasta el borde del dorsal, del arco costal a la clavícula.',
        ),
        Pieza(
            id='TH0011', nombre='Thoracolumbar fascia', fma='FMA25072', fma_izquierdo='',
            sistema='fascia-profunda', region='tronco', region_izquierda='tronco', par=False,
            planos=(por_encima(ARCO_COSTAL_Y), por_debajo(BASE_DEL_CUELLO_Y), hacia_atras_de(ESPALDA_Z), _HOMBRO_DERECHO, _HOMBRO_IZQUIERDO),
            otras=((por_encima(CRESTA_ILIACA_Y), por_debajo(ARCO_COSTAL_Y), hacia_atras_de(ESPALDA_Z), lateral_a(_COSTADO_DE_LA_CADERA * 1.0), medial_a(-_COSTADO_DE_LA_CADERA)),),
            nota='Cubre los músculos de la espalda, de la cresta ilíaca a la base del cuello, de un costado al otro.',
        ),
        Pieza(
            id='TH0012', nombre='Abdominal fascia', fma='FMA19841', fma_izquierdo='',
            sistema='fascia-profunda', region='abdomen', region_izquierda='abdomen', par=False,
            # Del arco costal a la cresta ilíaca, y por debajo de ella solo por delante: el resto es glúteo.
            planos=(por_encima(CRESTA_ILIACA_Y), por_debajo(ARCO_COSTAL_Y), hacia_delante_de(ESPALDA_Z), medial_a(-_COSTADO_DE_LA_CADERA), lateral_a(_COSTADO_DE_LA_CADERA)),
            otras=((por_debajo(CRESTA_ILIACA_Y), hacia_delante_de(0.03), _PLIEGUE_DEL_MUSLO, _PLIEGUE_IZQUIERDO, medial_a(-_COSTADO_DE_LA_CADERA), lateral_a(_COSTADO_DE_LA_CADERA)),),
            nota='La pared del abdomen, con la aponeurosis del oblicuo externo, del arco costal al pliegue de la ingle.',
        ),
        Pieza(
            id='TH0013', nombre='Superficial layer of cervical fascia', fma='FMA57805', fma_izquierdo='',
            sistema='fascia-profunda', region='cuello', region_izquierda='cuello', par=False,
            planos=(por_encima(BASE_DEL_CUELLO_Y), por_debajo(MANDIBULA_Y)),
            nota='La capa que envuelve el cuello, del esternón y las clavículas a la mandíbula.',
        ),
        Pieza(
            id='TH0014', nombre='Right temporal fascia', fma='FMA270187', fma_izquierdo='FMA270189',
            sistema='fascia-profunda', region='cabeza', region_izquierda='cabeza',
            planos=(por_encima(1.575), por_debajo(1.690), lateral_a(-0.045)),
            nota='Cubre el músculo temporal, en la cara lateral del cráneo.',
        ),
    ),
)

# ------------------------------------------------------- fascia superficial

#: Las envolventes profundas del cuerpo entero, con las que se calcula lo que hay entre ellas y la piel.
_ENVOLVENTES = (
    MIEMBRO_INFERIOR_DERECHO,
    MIEMBRO_INFERIOR_IZQUIERDO,
    MIEMBRO_SUPERIOR_DERECHO,
    MIEMBRO_SUPERIOR_IZQUIERDO,
    TRONCO_CUELLO_CABEZA,
)

#: Dónde acaba el tronco y empieza el brazo en la piel: un plano vertical algo lateral a la axila.
BRAZO_X = -0.165

FASCIA_SUPERFICIAL = Grupo(
    id='fascia-superficial',
    descripcion='La tela subcutánea de todo el cuerpo: la lámina que queda justo bajo la piel con su grasa (D-332).',
    h=0.003,
    radio_segun_y=((0.0, 0.0),),
    separacion=0.0,
    entradas=lambda atlas: [],
    tipo='superficial',
    # Medio milímetro bajo la cara de dentro de la piel (ver `capas.superficial`). Las envolventes ya no colocan la
    # lámina: solo sirven para comprobar que no se mete en la fascia profunda.
    parametros={'bajo_la_cara_de_dentro': 0.0005, 'envolventes': _ENVOLVENTES},
    densidad=12000.0,
    piezas=(
        Pieza(
            id='TH0100', nombre='Superficial fascia of right foot', fma='FMA50283', fma_izquierdo='FMA50284',
            sistema='fascia-superficial', region='pie-derecho', region_izquierda='pie-izquierdo',
            planos=(por_debajo(TOBILLO_Y), lateral_a(0.0)),
            nota='La tela subcutánea del pie.',
        ),
        Pieza(
            id='TH0101', nombre='Superficial fascia of right leg', fma='FMA50285', fma_izquierdo='FMA50286',
            sistema='fascia-superficial', region='miembro-inferior-derecho', region_izquierda='miembro-inferior-izquierdo',
            planos=(por_encima(TOBILLO_Y), por_debajo(RODILLA_Y), lateral_a(0.0)),
            nota='La tela subcutánea de la pierna, del tobillo a la rodilla.',
        ),
        Pieza(
            id='TH0102', nombre='Superficial fascia of right thigh', fma='FMA50290', fma_izquierdo='FMA50291',
            sistema='fascia-superficial', region='miembro-inferior-derecho', region_izquierda='miembro-inferior-izquierdo',
            planos=(por_encima(RODILLA_Y), _DEBAJO_DEL_PLIEGUE, lateral_a(0.0), _SEPARA_BAJO),
            nota='La tela subcutánea del muslo, de la rodilla al pliegue de la ingle y del glúteo.',
        ),
        Pieza(
            id='TH0103', nombre='Superficial fascia of right hand', fma='FMA57787', fma_izquierdo='FMA57788',
            sistema='fascia-superficial', region='mano-derecha', region_izquierda='mano-izquierda',
            planos=(por_debajo(MUNECA_Y), al_otro_lado(_SEPARA_BAJO)),
            nota='La tela subcutánea de la mano y los dedos.',
        ),
        Pieza(
            id='TH0104', nombre='Superficial fascia of right forearm', fma='FMA57785', fma_izquierdo='FMA57786',
            sistema='fascia-superficial', region='miembro-superior-derecho', region_izquierda='miembro-superior-izquierdo',
            planos=(por_encima(MUNECA_Y), por_debajo(CODO_Y), al_otro_lado(_SEPARA_BAJO)),
            nota='La tela subcutánea del antebrazo.',
        ),
        Pieza(
            id='TH0105', nombre='Superficial fascia of right arm', fma='FMA37785', fma_izquierdo='FMA37786',
            sistema='fascia-superficial', region='miembro-superior-derecho', region_izquierda='miembro-superior-izquierdo',
            planos=(por_encima(CODO_Y), por_debajo(1.2), al_otro_lado(_SEPARA_BAJO)),
            otras=((por_encima(1.2), por_debajo(1.50), al_otro_lado(_SEPARA_ALTO)),),
            nota='La tela subcutánea del brazo, del codo al hombro.',
        ),
        Pieza(
            id='TH0106', nombre='Superficial fascia of chest', fma='FMA87553', fma_izquierdo='',
            sistema='fascia-superficial', region='torax', region_izquierda='torax', par=False,
            planos=(por_encima(ARCO_COSTAL_Y), por_debajo(BASE_DEL_CUELLO_Y), hacia_delante_de(ESPALDA_Z), _SEPARA_ALTO, _SEPARA_ALTO_IZQ),
            nota='La tela subcutánea de la cara anterior del tórax, del arco costal a la base del cuello.',
        ),
        Pieza(
            id='TH0107', nombre='Superficial fascia of abdomen', fma='FMA18083', fma_izquierdo='',
            sistema='fascia-superficial', region='abdomen', region_izquierda='abdomen', par=False,
            planos=(por_encima(CRESTA_ILIACA_Y), por_debajo(ARCO_COSTAL_Y), hacia_delante_de(ESPALDA_Z), _SEPARA_BAJO, _SEPARA_BAJO_IZQ),
            otras=((por_debajo(CRESTA_ILIACA_Y), hacia_delante_de(0.03), _PLIEGUE_DEL_MUSLO, _PLIEGUE_IZQUIERDO, _SEPARA_BAJO, _SEPARA_BAJO_IZQ),),
            nota='La tela subcutánea del abdomen, con la fascia de Camper y la de Scarpa, del arco costal a la ingle.',
        ),
        Pieza(
            id='TH0108', nombre='Superficial fascia of back', fma='FMA32583', fma_izquierdo='',
            sistema='fascia-superficial', region='tronco', region_izquierda='tronco', par=False,
            planos=(por_encima(ARCO_COSTAL_Y), por_debajo(BASE_DEL_CUELLO_Y), hacia_atras_de(ESPALDA_Z), _SEPARA_ALTO, _SEPARA_ALTO_IZQ),
            otras=((por_encima(CRESTA_ILIACA_Y), por_debajo(ARCO_COSTAL_Y), hacia_atras_de(ESPALDA_Z), _SEPARA_BAJO, _SEPARA_BAJO_IZQ),),
            nota='La tela subcutánea de la espalda, de la cresta ilíaca a la base del cuello.',
        ),
        Pieza(
            id='TH0109', nombre='Superficial fascia of right buttock', fma='FMA25164', fma_izquierdo='FMA25165',
            sistema='fascia-superficial', region='abdomen', region_izquierda='abdomen',
            planos=(_PLIEGUE_DEL_MUSLO, por_debajo(CRESTA_ILIACA_Y), lateral_a(0.0), hacia_atras_de(0.03), _SEPARA_BAJO),
            nota='La tela subcutánea de la nalga, del pliegue glúteo a la cresta ilíaca.',
        ),
        Pieza(
            id='TH0110', nombre='Superficial fascia of neck', fma='FMA53660', fma_izquierdo='',
            sistema='fascia-superficial', region='cuello', region_izquierda='cuello', par=False,
            planos=(por_encima(BASE_DEL_CUELLO_Y), por_debajo(MANDIBULA_Y), _SEPARA_ALTO, _SEPARA_ALTO_IZQ),
            nota='La tela subcutánea del cuello, de la base del cuello a la mandíbula.',
        ),
        Pieza(
            id='TH0111', nombre='Superficial fascia of head', fma='FMA53659', fma_izquierdo='',
            sistema='fascia-superficial', region='cabeza', region_izquierda='cabeza', par=False,
            planos=(por_encima(MANDIBULA_Y),),
            nota='La tela subcutánea de la cara y del cuero cabelludo, de la mandíbula a la coronilla.',
        ),
    ),
)

# ------------------------------------------------------------------- meníngea

# Las meninges no son un manguito que envuelva músculos: cada una se construye aparte (`meningea.py`) y la
# receta solo dice cómo se llama, qué FMA tiene y qué es. Los códigos salen de la FMA (EBI OLS, 2026-10-24).
MENINGES = Grupo(
    id='meninges',
    descripcion='Duramadre, aracnoides y piamadre del cráneo y del conducto vertebral, y las hoces del cerebro y del cerebelo.',
    h=0.0015,
    radio_segun_y=((0.0, 0.0),),
    separacion=0.0,
    entradas=lambda atlas: [],
    densidad=36000.0,
    tipo='meningea',
    piezas=(
        Pieza(
            id='TH0200', nombre='Cranial dura mater', fma='FMA71236', fma_izquierdo='',
            sistema='fascia-meningea', region='cabeza', region_izquierda='cabeza', par=False,
            nota='El forro interno del cráneo: la región entre el cerebro y el hueso (hasta 14 mm del cerebro donde no hay hueso, '
                 'en el agujero magno y las órbitas), cortada en el agujero magno, donde empieza la espinal. Sin senos venosos.',
        ),
        Pieza(
            id='TH0201', nombre='Falx cerebri', fma='FMA83967', fma_izquierdo='',
            sistema='fascia-meningea', region='cabeza', region_izquierda='cabeza', par=False,
            nota='La lámina de dura del plano medio entre los hemisferios: del techo del cráneo al cuerpo calloso (su borde libre pasa a '
                 '3 mm sobre él), al suelo por delante y a la cresta del tentorio por detrás. Aproximada: sin seno sagital ni cresta etmoidal.',
        ),
        Pieza(
            id='TH0202', nombre='Falx cerebelli', fma='FMA83974', fma_izquierdo='',
            sistema='fascia-meningea', region='cabeza', region_izquierda='cabeza', par=False,
            nota='El pliegue de dura que baja por detrás entre los lóbulos del cerebelo, del tentorio al agujero magno; 6 mm de ancho.',
        ),
        Pieza(
            id='TH0203', nombre='Cranial arachnoid mater', fma='FMA83981', fma_izquierdo='',
            sistema='fascia-meningea', region='cabeza', region_izquierda='cabeza', par=False,
            nota='Pegada por dentro de la dura a 1,2 mm y nunca a menos de 1 mm del cerebro. Sin espacio subaracnoideo con sus cisternas.',
        ),
        Pieza(
            id='TH0204', nombre='Cranial pia mater', fma='FMA78443', fma_izquierdo='',
            sistema='fascia-meningea', region='cabeza', region_izquierda='cabeza', par=False,
            nota='Pegada al cerebro, que se cierra 4 mm antes: la piamadre real entra en cada surco y esta los puentea.',
        ),
        Pieza(
            id='TH0205', nombre='Spinal dura mater', fma='FMA71237', fma_izquierdo='',
            sistema='fascia-meningea', region='tronco', region_izquierda='tronco', par=False,
            nota='El saco dural: un tubo por el conducto vertebral, del agujero magno a S2, con el calibre del hueco medido en cada '
                 'vértebra (el 80 %, menos la grasa epidural). Aproximada: sin las vainas de las raíces.',
        ),
        Pieza(
            id='TH0206', nombre='Spinal arachnoid mater', fma='FMA83982', fma_izquierdo='',
            sistema='fascia-meningea', region='tronco', region_izquierda='tronco', par=False,
            nota='Medio milímetro por dentro de la dura espinal, a la que va pegada en el saco.',
        ),
        Pieza(
            id='TH0207', nombre='Spinal pia mater', fma='FMA83975', fma_izquierdo='',
            sistema='fascia-meningea', region='tronco', region_izquierda='tronco', par=False,
            nota='Con el calibre medio de la médula, del agujero magno al cono medular (L1–L2). El atlas no trae la médula: esto '
                 'es solo su envoltura.',
        ),
    ),
)


# ------------------------------------------------------------------- visceral

# Las serosas y la fascia renal: cada una se construye aparte (`visceral.py`). El lado izquierdo de la pleura y de
# la fascia renal **no es el espejo del derecho** (el corazón está a la izquierda, y los riñones no son simétricos),
# así que cada lado es su propia pieza, con su `id` y su `M`.
VISCERAL = Grupo(
    id='visceral',
    descripcion='El pericardio, la pleura parietal, el peritoneo parietal y la fascia renal.',
    h=0.003,
    radio_segun_y=((0.0, 0.0),),
    separacion=0.0,
    entradas=lambda atlas: [],
    densidad=30000.0,
    tipo='visceral',
    piezas=(
        Pieza(
            id='TH0300', nombre='Fibrous pericardium', fma='FMA9586', fma_izquierdo='',
            sistema='fascia-visceral', region='torax', region_izquierda='torax', par=False,
            nota='El saco que envuelve al corazón y a la raíz de los grandes vasos: el cierre del corazón, la aorta ascendente, el tronco '
                 'pulmonar y la vena cava superior, a 2,5 mm por fuera. Sin la capa serosa interna ni el espacio pericárdico.',
        ),
        Pieza(
            id='TH0301', nombre='Right parietal pleura', fma='FMA27312', fma_izquierdo='',
            sistema='fascia-visceral', region='torax', region_izquierda='torax', par=False,
            nota='Forra la cavidad torácica derecha: lo que encierran las costillas, el esternón, las vértebras, los intercostales y el '
                 'diafragma, menos el mediastino. Aproximada: el atlas no trae pulmones, así que el saco está vacío por dentro salvo los '
                 'bronquios; el ápice se corta con una tapa inclinada sobre la primera costilla.',
        ),
        Pieza(
            id='TH0301M', nombre='Left parietal pleura', fma='FMA27313', fma_izquierdo='',
            sistema='fascia-visceral', region='torax', region_izquierda='torax', par=False,
            nota='Como la derecha, con el corazón en su lado: no es el espejo de la derecha.',
        ),
        Pieza(
            id='TH0302', nombre='Parietal peritoneum', fma='FMA21451', fma_izquierdo='',
            sistema='fascia-visceral', region='abdomen', region_izquierda='abdomen', par=False,
            nota='El saco que envuelve a las vísceras abdominales (cierre de 3 cm sobre estómago, hígado, bazo, páncreas, vesícula, '
                 'colon, intestino delgado, vejiga y recto), a 3 mm por fuera y dentro de la pared del abdomen supuesta a 22 mm bajo '
                 'la piel. Aproximada: el atlas no trae la cara interna de la pared del abdomen.',
        ),
        Pieza(
            id='TH0303', nombre='Right renal fascia', fma='FMA18105', fma_izquierdo='',
            sistema='fascia-visceral', region='abdomen', region_izquierda='abdomen', par=False,
            nota='La fascia de Gerota: una bolsa a 15 mm del riñón y de la glándula suprarrenal, el grosor de la grasa perirrenal.',
        ),
        Pieza(
            id='TH0303M', nombre='Left renal fascia', fma='FMA18106', fma_izquierdo='',
            sistema='fascia-visceral', region='abdomen', region_izquierda='abdomen', par=False,
            nota='Como la derecha, alrededor del riñón y la suprarrenal izquierdos.',
        ),
    ),
)


# ----------------------------------------------------- tabiques y retináculos

# Lo que la fascia crural tiene por dentro y en el tobillo (`compartimentos.py`). Salen en el sistema `fascia-profunda` y con
# los números que siguen a los de la profunda; se generan aparte porque se calculan de los músculos y de la propia fascia ya
# hecha, no de un cierre. El tabique transverso no está: la FMA no le da código y no se inventa uno.
COMPARTIMENTOS = Grupo(
    id='compartimentos',
    descripcion='Los tabiques intermusculares de la pierna y los retináculos del tobillo.',
    h=0.002,
    radio_segun_y=((0.0, 0.0),),
    separacion=0.0,
    entradas=lambda atlas: [],
    densidad=30000.0,
    tipo='compartimentos',
    piezas=(
        Pieza(
            id='TH0015', nombre='Anterior intermuscular septum of right leg', fma='FMA58756', fma_izquierdo='FMA58757',
            sistema='fascia-profunda', region='miembro-inferior-derecho', region_izquierda='miembro-inferior-izquierdo',
            nota='Separa el compartimento anterior (tibial anterior, extensores) del lateral (peroneos): donde los dos grupos de músculos '
                 'están a menos de 7 mm uno de otro, entre los 9,5 y los 43 cm de altura.',
        ),
        Pieza(
            id='TH0016', nombre='Posterior intermuscular septum of right leg', fma='FMA58759', fma_izquierdo='FMA58760',
            sistema='fascia-profunda', region='miembro-inferior-derecho', region_izquierda='miembro-inferior-izquierdo',
            nota='Separa el compartimento lateral del posterior superficial (gastrocnemio, sóleo): el mismo cálculo que el anterior.',
        ),
        Pieza(
            id='TH0017', nombre='Right superior extensor retinaculum', fma='FMA49388', fma_izquierdo='FMA49389',
            sistema='fascia-profunda', region='miembro-inferior-derecho', region_izquierda='miembro-inferior-izquierdo',
            nota='La banda de la fascia crural que sujeta los tendones extensores por delante del tobillo, de un maléolo al otro.',
        ),
        Pieza(
            id='TH0018', nombre='Inferior extensor retinaculum of right ankle', fma='FMA49386', fma_izquierdo='FMA49387',
            sistema='fascia-profunda', region='pie-derecho', region_izquierda='pie-izquierdo',
            nota='La banda sobre el dorso del pie, bajo la superior. Aproximada: sin la forma de Y de la real.',
        ),
        Pieza(
            id='TH0019', nombre='Flexor retinaculum of right ankle', fma='FMA49373', fma_izquierdo='FMA49374',
            sistema='fascia-profunda', region='miembro-inferior-derecho', region_izquierda='miembro-inferior-izquierdo',
            nota='Del maléolo medial al calcáneo: el techo del túnel del tarso, por donde pasan el tibial posterior, los flexores y el paquete vasculonervioso.',
        ),
        Pieza(
            id='TH0020', nombre='Right superior fibular retinaculum', fma='FMA51121', fma_izquierdo='FMA51122',
            sistema='fascia-profunda', region='miembro-inferior-derecho', region_izquierda='miembro-inferior-izquierdo',
            nota='Detrás del maléolo lateral: mantiene los tendones peroneos en su surco.',
        ),
        Pieza(
            id='TH0021', nombre='Right inferior fibular retinaculum', fma='FMA51119', fma_izquierdo='FMA51120',
            sistema='fascia-profunda', region='pie-derecho', region_izquierda='pie-izquierdo',
            nota='En el borde lateral del pie, sobre el tubérculo de los peroneos.',
        ),
    ),
)


# --------------------------------------------------------------------- todos

#: Todos los grupos que producen piezas, en el orden en que se generan. Los de `solo-envolvente` no producen
#: piezas: existen para que otra capa (la superficial) pueda calcular lo que queda entre ellos y la piel.
GRUPOS = (
    MIEMBRO_INFERIOR_DERECHO,
    MIEMBRO_SUPERIOR_DERECHO,
    TRONCO_CUELLO_CABEZA,
    FASCIA_SUPERFICIAL,
    COMPARTIMENTOS,
    MENINGES,
    VISCERAL,
)

"""
Los tabiques y los retináculos de la pierna (P-006, E7): lo que la imagen B del PDF de Cristóbal dibuja por dentro.

La fascia crural (E2) envuelve la pierna entera. Por dentro, la pierna está partida en compartimentos, cada uno
con sus músculos, y la fascia manda hacia el hueso unos tabiques que los separan: es lo que se abre en una
fasciotomía y lo que explica el síndrome compartimental. Se hacen aquí:

  - **El tabique intermuscular anterior** (entre el compartimento anterior y el lateral) y **el posterior**
    (entre el lateral y el posterior superficial). Cada uno es la superficie donde los músculos de un
    compartimento dejan de ser los más cercanos y empiezan los del vecino: el cero de la diferencia de las
    distancias con signo a los dos grupos, limitado a donde los dos grupos están a menos de 18 mm.
  - **Los retináculos del tobillo**: el extensor superior y el inferior, el flexor y los dos peroneos (fibulares),
    que son bandas más gruesas de la propia fascia. Se toman de las piezas de la fascia crural y de la dorsal del
    pie ya generadas (los mismos triángulos, así que los bordes coinciden) y se levantan 1,2 mm sobre ella.

**Lo que no se hace, y por qué.** La fascia tiene un tercer tabique, el transverso, entre el compartimento posterior
superficial y el profundo. La FMA no le da código, y toda pieza del atlas lleva uno: no se inventa. Se anota aquí y
en la bitácora. La membrana interósea, que separa el compartimento anterior del posterior profundo, ya está en el
atlas de origen (`FJ1392`).

El muslo tiene tres compartimentos (anterior, medial y posterior) con sus tabiques; no se hacen en esta etapa (D-221).
"""

import json
import time
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi

import campo as C
import malla as M

SEMILLA = 20261024
SALIDA = Path(__file__).resolve().parent / 'salida'

GRUPOS_DE_MUSCULOS = {
    'anterior': ['Right tibialis anterior', 'Right extensor digitorum longus', 'Right extensor hallucis longus', 'Right fibularis tertius'],
    'lateral': ['Right fibularis longus', 'Right fibularis brevis'],
    'posterior_superficial': ['Lateral head of right gastrocnemius', 'Medial head of right gastrocnemius', 'Right soleus', 'Right plantaris'],
    'posterior_profundo': ['Right tibialis posterior', 'Right flexor digitorum longus', 'Right flexor hallucis longus', 'Right popliteus'],
}
HUESOS_DE_LA_PIERNA = ['Right tibia', 'Right fibula']

#: Hasta qué distancia de los dos grupos se acepta el tabique: el hueco entre dos vientres musculares.
TOLERANCIA_DEL_TABIQUE = 0.018
#: La banda de un retináculo se levanta esto sobre la fascia de la que sale.
ALTURA_DEL_RETINACULO = 0.0012
#: Por debajo de la rodilla y por encima del tobillo: el tabique no existe donde acaba el músculo.
TABIQUE_ENTRE = (0.095, 0.430)


def dicho(texto):
    print(texto, flush=True)


def _solido(atlas, rejilla, nombres, h, engrosar=1):
    m = np.zeros(rejilla.forma, bool)
    for n in nombres:
        p = atlas.por_nombre(n)[0]
        v, f = atlas.malla(p)
        oc = C.ocupar(rejilla, C.muestrear_superficie(v, f, 0.5 * h, SEMILLA))
        m |= C.rellenar(oc, engrosar=engrosar) | ndi.binary_dilation(oc)
    return m


def _distancia_con_signo(mascara, h):
    return C.campo_con_signo(mascara, h)


class Pierna:
    """Los cuatro compartimentos de la pierna derecha como máscaras de una rejilla de 2 mm."""

    def __init__(self, atlas, h=0.002):
        t0 = time.time()
        self.atlas, self.h = atlas, h
        todas = [p for n in sum(GRUPOS_DE_MUSCULOS.values(), []) + HUESOS_DE_LA_PIERNA for p in atlas.por_nombre(n)[:1]]
        v, f = atlas.malla_unida(todas)
        self.rejilla = C.Rejilla.sobre(v.min(axis=0), v.max(axis=0), h, 0.04)
        self.masc = {k: C.cierre(_solido(atlas, self.rejilla, ns, h), 0.004, h) for k, ns in GRUPOS_DE_MUSCULOS.items()}
        self.hueso = _solido(atlas, self.rejilla, HUESOS_DE_LA_PIERNA, h)
        self.sd = {k: _distancia_con_signo(m, h) for k, m in self.masc.items()}
        union = np.zeros(self.rejilla.forma, bool)
        for m in self.masc.values():
            union |= m
        union |= self.hueso
        self.envolvente = C.cierre(union, 0.008, h)
        for k, m in self.masc.items():
            dicho(f'  compartimento {k}: {C.volumen_de_la_mascara(m, h):.2f} L')
        dicho(f'  compartimentos listos ({time.time() - t0:.0f} s)')

    def tabique(self, a, b):
        """La hoja entre dos compartimentos: el cero de `sd_a − sd_b`, donde los dos están cerca y dentro de la pierna."""
        h = self.h
        rejilla = self.rejilla
        g = C.suavizar(self.sd[a] - self.sd[b], 1.0)
        v, f = C.superficie_de_la_rejilla(g, rejilla, 0.0)
        if len(f) == 0:
            return v, f
        from scipy import ndimage as ndi_

        idx = (v - np.asarray(rejilla.origen)) / rejilla.h - 0.5
        sa = ndi_.map_coordinates(self.sd[a], idx.T, order=1, mode='nearest')
        sb = ndi_.map_coordinates(self.sd[b], idx.T, order=1, mode='nearest')
        dentro = ndi_.map_coordinates(C.campo_con_signo(self.envolvente, h), idx.T, order=1, mode='nearest')
        # El cero de la diferencia también cruza el hueso (el peroné está entre los dos compartimentos): ahí no hay
        # tabique sino hueso. El tabique nace en la cara del hueso, no dentro.
        en_el_hueso = ndi_.map_coordinates(C.campo_con_signo(self.hueso, h), idx.T, order=1, mode='nearest')
        valido = (sa <= TOLERANCIA_DEL_TABIQUE) & (sb <= TOLERANCIA_DEL_TABIQUE) & (dentro <= 0.0) \
            & (en_el_hueso >= -0.0005) & (v[:, 1] >= TABIQUE_ENTRE[0]) & (v[:, 1] <= TABIQUE_ENTRE[1])
        # Una cara se queda si sus tres vértices valen.
        quedan = valido[f].all(axis=1)
        v, f = M.compactar(v, f[quedan])
        if len(f) == 0:
            return v, f
        v = M.suavizar_taubin(v, f, 8)
        v, f = M.quitar_componentes_pequenas(v, f, 0.05)
        return v, f


# --------------------------------------------------------------- retináculos


def _leer_pieza_generada(registro):
    datos = (SALIDA / 'piezas' / f"{registro['id']}.bin").read_bytes()
    n, m = registro['vertices'], registro['indices']
    pos = np.frombuffer(datos, '<f4', n * 3, 0).reshape(-1, 3).astype(np.float64)
    desde = n * 12 + n * 6
    desde += (-desde) % 4
    idx = np.frombuffer(datos, '<u4', m, desde).reshape(-1, 3).astype(np.int64)
    return pos, idx


def _fascia_del_tobillo():
    """
    La superficie fina de la fascia del miembro inferior, de donde salen las bandas.

    Se toma la **fina** (la de la rejilla de 2 mm, que `generar.py` deja en `salida/`) y no las piezas ya
    decimadas: una banda de dos centímetros con triángulos de cuatro milímetros sale con el borde en
    escalones y con cuarenta caras. La fina y la decimada se apartan menos de 0,6 mm, y la banda se levanta
    más que eso (`ALTURA_DEL_RETINACULO`), así que no se hunde en la fascia de la que sale.
    """
    ruta = SALIDA / 'miembro-inferior-derecho_fina.npz'
    if not ruta.exists():
        raise SystemExit(f'Falta {ruta.name}: genere antes el grupo miembro-inferior-derecho.')
    datos = np.load(ruta)
    return datos['v'].astype(np.float64), datos['f'].astype(np.int64)


def retinaculos():
    """
    Las bandas del tobillo, como `{id: (v, f)}`, cada una un trozo de la fascia unida levantado 1,2 mm.

    El centro del tobillo se mide de la propia fascia (el cuerpo no está recto: el pie del atlas gira) y cada
    banda es un sector de ángulo alrededor de ese eje entre dos alturas. El ángulo se mide desde delante
    (+z) hacia el lado medial (+x en la pierna derecha).
    """
    v, f = _fascia_del_tobillo()
    anillo = v[(v[:, 1] > 0.085) & (v[:, 1] < 0.115)]
    cx, cz = (anillo[:, 0].max() + anillo[:, 0].min()) / 2, (anillo[:, 2].max() + anillo[:, 2].min()) / 2
    centros = v[f].mean(axis=1)
    theta = np.degrees(np.arctan2(centros[:, 0] - cx, centros[:, 2] - cz))
    y = centros[:, 1]
    # Normales de los vértices, para levantar la banda.
    n = M.normales_de_vertices(v, f)

    def banda(y0, y1, t0, t1, extra=None):
        ok = (y >= y0) & (y <= y1) & (theta >= t0) & (theta <= t1)
        if extra is not None:
            ok &= extra(centros)
        sub = f[ok]
        if len(sub) == 0:
            return np.zeros((0, 3)), np.zeros((0, 3), np.int64)
        usados, inverso = np.unique(sub, return_inverse=True)
        vv = v[usados] + n[usados] * ALTURA_DEL_RETINACULO
        ff = inverso.reshape(-1, 3)
        vv, ff = M.compactar(vv, ff)
        vv, ff = M.quitar_componentes_pequenas(vv, ff, 0.1)
        return vv, ff

    return {
        # Delante, de maléolo a maléolo.
        'TH0017': banda(0.098, 0.128, -105.0, 105.0),
        # Sobre el dorso del pie, bajo el anterior.
        'TH0018': banda(0.042, 0.088, -105.0, 105.0),
        # Detrás del maléolo medial, del maléolo al calcáneo.
        'TH0019': banda(0.040, 0.100, 100.0, 175.0),
        # Detrás del maléolo lateral.
        'TH0020': banda(0.048, 0.092, -175.0, -108.0),
        # Sobre el tubérculo de los peroneos, en el borde lateral del pie.
        'TH0021': banda(0.020, 0.052, -140.0, -70.0),
    }


# --------------------------------------------------------------------- grupo


def construir(atlas, grupo, ctx):
    from capas import Resultado  # aquí y no arriba: `capas` importa este módulo

    t0 = time.time()
    pierna = Pierna(atlas)
    anterior = pierna.tabique('anterior', 'lateral')
    posterior = pierna.tabique('lateral', 'posterior_superficial')
    dicho(f'  tabiques: anterior {len(anterior[1]):,} triángulos, posterior {len(posterior[1]):,} ({time.time() - t0:.0f} s)')
    bandas = retinaculos()
    for k, (v, f) in bandas.items():
        dicho(f'  retináculo {k}: {len(f):,} triángulos')

    por_pieza = {'TH0015': anterior, 'TH0016': posterior, **bandas}
    sd_envolvente = C.campo_con_signo(pierna.envolvente, pierna.h)
    sd_hueso = C.campo_con_signo(pierna.hueso, pierna.h)

    def comprobar(pieza, v, f):
        bordes, triples = M.aristas_de_borde(f)
        medidas = {
            'triangulos': int(len(f)), 'vertices': int(len(v)), 'area_m2': round(M.area_total(v, f), 4),
            'aristas_de_borde': bordes, 'aristas_triples': triples,
        }
        avisos = []
        if pieza.id in ('TH0015', 'TH0016'):
            idx = (v - np.asarray(pierna.rejilla.origen)) / pierna.rejilla.h - 0.5
            dentro_del_hueso = (ndi.map_coordinates(sd_hueso, idx.T, order=1, mode='nearest') < -0.002).mean()
            medidas['dentro_del_hueso_pct'] = round(float(dentro_del_hueso) * 100, 2)
            if dentro_del_hueso > 0.05:
                avisos.append(f'{dentro_del_hueso * 100:.1f} % de los vértices está dentro del hueso')
            if len(f) < 100:
                avisos.append('el tabique salió casi vacío: revise la tolerancia')
        return avisos, medidas

    return Resultado(np.zeros((0, 3)), np.zeros((0, 3), np.int64), comprobar, por_pieza=por_pieza)

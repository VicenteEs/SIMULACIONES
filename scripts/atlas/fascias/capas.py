"""
Los constructores de cada capa de fascia (P-006): de las piezas del atlas a la superficie continua de un grupo.

`generar.py` no sabe de anatomía: pide a un constructor, por el `tipo` del grupo (`recetas.Grupo.tipo`),
una superficie, y de ahí en adelante todos los grupos pasan por lo mismo: se decima, se parte en piezas
por planos, se espeja el lado derecho y se comprueba. Cada constructor devuelve un `Resultado`: la
superficie fina y la función que mide **esa** capa, porque no se comprueba igual una fascia que envuelve
músculos (que no debe entrar en ellos) que una tela subcutánea (que no debe cruzar la piel).

  - `envoltura`    el manguito que cierra el volumen de lo que envuelve: la fascia profunda de cada región.
  - `superficial`  lo que hay entre la piel y la envolvente profunda del cuerpo entero: la tela subcutánea.
  - `meningea`    duramadre, aracnoides y piamadre del cráneo y del conducto, y las hoces (`meningea.py`).
  - `compartimentos`  los tabiques intermusculares de la pierna y los retináculos del tobillo (`compartimentos.py`).
  - `visceral`    pericardio, pleura parietal, peritoneo parietal y fascia renal (`visceral.py`).

Las coordenadas son las del atlas: metros, Y arriba, el lado derecho del sujeto en x negativa.
"""

import time
from dataclasses import dataclass
from typing import Callable

import numpy as np

import campo as C
import malla as M

SEMILLA = 20261024


def dicho(texto):
    print(texto, flush=True)


@dataclass
class Resultado:
    """La superficie fina de un grupo y cómo se comprueba cada pieza que sale de ella."""

    verts: np.ndarray
    caras: np.ndarray
    #: `(pieza, v, f) → (avisos, medidas)`; mide lo que importa de **esta** capa.
    comprobar: Callable
    #: Para lo que no sale de cortar una superficie continua por planos (las meninges, las serosas): la
    #: superficie propia de cada pieza, por `id`. Si está, `generar.py` no corta nada: decima cada una.
    por_pieza: dict = None


class Contexto:
    """
    Lo que se calcula una vez y varios grupos usan: el campo de la piel y la envolvente profunda del cuerpo.

    Son rejillas del cuerpo entero a 3 mm —unos veinte millones de voxeles— y cuestan segundos, pero las
    leen la fascia superficial de cada región; calcularlas por grupo sería repetirlo diez veces.
    """

    def __init__(self, atlas, directorio):
        self.atlas = atlas
        self.directorio = directorio
        self._piel = None
        self._profunda = None

    def rejilla_del_cuerpo(self, h=0.003):
        piel = self.atlas.por_nombre('Skin')[0]
        v, _ = self.atlas.malla(piel)
        return C.Rejilla.sobre(v.min(axis=0), v.max(axis=0), h, 0.06)

    def campo_de_la_piel(self, h=0.003):
        """La distancia con signo a la piel (negativa dentro), y la rejilla en que está."""
        if self._piel is None:
            t0 = time.time()
            rejilla = self.rejilla_del_cuerpo(h)
            piel = self.atlas.por_nombre('Skin')[0]
            v, f = self.atlas.malla(piel)
            puntos = C.muestrear_superficie(v, f, 0.75 * h, SEMILLA)
            # La piel tiene unos mil bordes abiertos (la boca, los ojos, las fosas nasales): un voxel de grosor
            # los sella —se midió: con uno o dos el relleno sale de 74 L, el de un cuerpo de adulto—.
            relleno = C.rellenar(C.ocupar(rejilla, puntos), engrosar=1)
            dicho(f'  piel: {C.volumen_de_la_mascara(relleno, h):.1f} L ({time.time() - t0:.0f} s)')
            self._piel = (rejilla, C.campo_con_signo(relleno, h), relleno)
        return self._piel

    def piel_en(self, rejilla):
        """
        La distancia con signo a la piel en los centros de otra rejilla (la de un grupo), por interpolación.

        Sirve para lo que el atlas no trae: la pared del abdomen no tiene el recto, ni los oblicuos interno, ni
        el transverso, y un cierre sobre las vísceras que quedan deja un hueco donde no hay nada. Con la piel se
        puede decir «hay pared a tanto de profundidad» sin inventar un músculo (ver `bajo_la_piel`).
        """
        from scipy import ndimage as ndi

        global_, sd, _ = self.campo_de_la_piel()
        ejes = rejilla.centros()
        gx, gy, gz = np.meshgrid(*ejes, indexing='ij')
        g = (np.stack([gx, gy, gz]) - np.asarray(global_.origen)[:, None, None, None]) / global_.h - 0.5
        return ndi.map_coordinates(sd, g, order=1, mode='nearest').astype(np.float32)

    def campo_de_la_envolvente(self, grupos, h=0.003):
        """
        La distancia con signo a la **unión** de las envolventes de cada región del cuerpo.

        Se cierra cada región por su cuenta y después se unen: cerrar todo junto uniría el muslo derecho con el
        izquierdo por la entrepierna (están a menos de dos radios), y una fascia entre los dos muslos no existe.
        """
        if self._profunda is None:
            t0 = time.time()
            rejilla, sd_piel, _ = self.campo_de_la_piel(h)
            union = np.zeros(rejilla.forma, bool)
            for grupo in grupos:
                piezas = grupo.entradas(self.atlas)
                v, f = self.atlas.malla_unida(piezas)
                puntos = C.muestrear_superficie(v, f, 0.75 * h, SEMILLA)
                relleno = C.rellenar(C.ocupar(rejilla, puntos), engrosar=1)
                if grupo.parametros.get('bajo_la_piel'):
                    relleno |= sd_piel <= -grupo.parametros['bajo_la_piel']
                radio = max(r for _, r in grupo.radio_segun_y)
                union |= C.cierre(relleno, radio, h)
                dicho(f'  envolvente de {grupo.id}: {len(piezas)} piezas ({time.time() - t0:.0f} s)')
            self._profunda = (rejilla, C.campo_con_signo(union, h), union)
        return self._profunda


# ------------------------------------------------------------------ envoltura


def envoltura(atlas, grupo, ctx):
    """
    El manguito que cierra el volumen de lo que envuelve el grupo, a `separacion` por encima.

    Es lo que hizo E2 para el miembro inferior, ahora general: relleno de las superficies de las entradas,
    cierre morfológico con el radio de cada altura (se mezclan los campos de los radios que enmarcan a
    la de cada capa), isosuperficie, suavizado de Taubin y quitar lo suelto.
    """
    t0 = time.time()
    piezas = grupo.entradas(atlas)
    dicho(f'  {len(piezas)} piezas del atlas bajo la fascia')
    v, f = atlas.malla_unida(piezas)
    radios = sorted({r for _, r in grupo.radio_segun_y})
    margen = 4 * max(radios) + 0.02
    rejilla = C.Rejilla.sobre(v.min(axis=0), v.max(axis=0), grupo.h, margen)
    dicho(f'  rejilla de {rejilla.forma[0]}×{rejilla.forma[1]}×{rejilla.forma[2]} voxeles de {grupo.h * 1000:g} mm')

    puntos = C.muestrear_superficie(v, f, 0.75 * grupo.h, SEMILLA)
    relleno = C.rellenar(C.ocupar(rejilla, puntos), engrosar=1)
    dicho(f'  volumen rellenado: {C.volumen_de_la_mascara(relleno, grupo.h):.2f} L ({time.time() - t0:.0f} s)')
    # Donde el atlas no trae la pared (el abdomen), se supone una a esa profundidad bajo la piel: lo que está
    # más hondo que eso cuenta como lleno, y lo que hay de verdad por fuera de ese límite manda.
    suelo = grupo.parametros.get('bajo_la_piel')
    if suelo:
        relleno_entradas = relleno
        sd_de_la_piel = ctx.piel_en(rejilla)
        relleno = relleno | (sd_de_la_piel <= -suelo)
        dicho(f'  con la pared supuesta a {suelo * 1000:g} mm bajo la piel: {C.volumen_de_la_mascara(relleno, grupo.h):.2f} L ({time.time() - t0:.0f} s)')
    else:
        relleno_entradas = relleno

    campos = {}
    for radio in radios:
        campos[radio] = C.suavizar(C.campo_con_signo(C.cierre(relleno, radio, grupo.h), grupo.h), grupo.sigma)
        dicho(f'  cierre de {radio * 1000:g} mm hecho ({time.time() - t0:.0f} s)')
    y_centros = rejilla.centros()[1]
    ys, rs = zip(*grupo.radio_segun_y)
    radio_de_la_capa = np.interp(y_centros, ys, rs)
    mezclado = np.empty(rejilla.forma, np.float32)
    for k, r in enumerate(radio_de_la_capa):
        # Los dos radios calculados que enmarcan al de esta altura, y cuánto pesa cada uno.
        b = int(np.searchsorted(radios, r, side='left'))
        b = min(max(b, 1), len(radios) - 1) if len(radios) > 1 else 0
        a = max(b - 1, 0)
        peso = 0.0 if radios[b] == radios[a] else float(np.clip((r - radios[a]) / (radios[b] - radios[a]), 0.0, 1.0))
        mezclado[:, k, :] = (1 - peso) * campos[radios[a]][:, k, :] + peso * campos[radios[b]][:, k, :]
    del campos

    nivel = C.nivel_de_la_superficie(grupo.separacion, grupo.h)
    verts, caras = C.superficie_de_la_rejilla(mezclado, rejilla, nivel)
    dicho(f'  superficie fina: {len(verts):,} vértices, {len(caras):,} triángulos ({time.time() - t0:.0f} s)')
    verts = M.suavizar_taubin(verts, caras, grupo.taubin)
    verts, caras = M.quitar_componentes_pequenas(verts, caras, 0.01)

    def apoyada_en_la_pared(v):
        """Los vértices que descansan sobre la pared supuesta bajo la piel: no flotan, aunque no haya nada de verdad debajo."""
        if not suelo:
            return np.zeros(len(v), bool)
        from scipy import ndimage as ndi

        g = (np.asarray(v) - np.asarray(rejilla.origen)) / rejilla.h - 0.5
        sd = ndi.map_coordinates(sd_de_la_piel, g.T, order=1, mode='nearest')
        return np.abs(sd + suelo) < 0.012

    def comprobar(pieza, pv, pf):
        return _comprobar_envoltura(pieza, pv, pf, relleno_entradas, rejilla, puntos, grupo.h, apoyada_en_la_pared)

    return Resultado(verts, caras, comprobar)


def _comprobar_envoltura(pieza, v, f, relleno, rejilla, puntos_de_entrada, h, apoyada=None):
    """
    Lo que se exige a una fascia que envuelve músculos (F-13), con tres medidas que no se ven a ojo:

     - que **no entre en el músculo**: cuántos vértices están a más de 3,5 mm dentro del relleno (el relleno
       sobresale 1,3 mm de lo verdadero, ver `SESGO_DEL_RELLENO`);
     - que **no flote**: cuántos están a más de 3 cm de cualquier cosa de lo envuelto;
     - que la malla sea decente: aristas compartidas por más de dos triángulos.
    """
    from scipy.spatial import cKDTree

    avisos = []
    interior = C.distancia_al_exterior(relleno, h)
    g = rejilla.indices(v)
    prof = np.zeros(len(v), np.float32)
    ok = g[:, 0] >= 0
    prof[ok] = interior[g[ok, 0], g[ok, 1], g[ok, 2]]
    # El umbral crece con la casilla: el relleno sobresale 0,65 casillas, la reducción se aparta hasta un
    # milímetro, y ocho décimas de la separación. A 2 mm son 3,5 mm; a 3 mm, 5,3.
    hundidos = float((prof > 1.75 * h).mean())
    d, _ = cKDTree(puntos_de_entrada).query(v)
    lejos = d > 0.03
    if apoyada is not None:
        lejos &= ~apoyada(v)
    flotantes = float(lejos.mean())
    bordes, triples = M.aristas_de_borde(f)
    medidas = {
        'triangulos': int(len(f)),
        'vertices': int(len(v)),
        'area_m2': round(M.area_total(v, f), 4),
        'hundidos_pct': round(hundidos * 100, 2),
        'mas_hundido_mm': round(float(prof.max()) * 1000, 2),
        'flotantes_pct': round(flotantes * 100, 2),
        'distancia_media_mm': round(float(d.mean()) * 1000, 2),
        'aristas_de_borde': bordes,
        'aristas_triples': triples,
    }
    if hundidos > 0.02:
        avisos.append(f'{hundidos * 100:.1f} % de los vértices está dentro de lo envuelto')
    if flotantes > 0.05:
        avisos.append(f'{flotantes * 100:.1f} % de los vértices está a más de 3 cm de lo envuelto')
    if triples > 0.001 * len(f):
        avisos.append(f'{triples} aristas compartidas por más de dos triángulos')
    return avisos, medidas


# ------------------------------------------------------------------ superficial


def superficial(atlas, grupo, ctx):
    """
    La tela subcutánea: una lámina **entre** la piel y la envolvente profunda del cuerpo entero.

    Es lo que hay entre las dos, así que su campo es una mezcla de las distancias a ellas. Con `SD_p` la
    distancia con signo a la envolvente profunda y `SD_s` la distancia con signo a la piel (las dos
    negativas dentro), el campo `F = (1 − α) · SD_p + α · SD_s` vale cero justo donde la distancia a la
    profunda es la fracción `α` del espesor total: en una pierna con dos centímetros de grasa, a ocho
    milímetros de la fascia profunda; sobre el borde cortante de la tibia, donde la piel casi toca la
    profunda, a un milímetro de las dos, en vez de cruzarlas.

    `α` está en `grupo.parametros['alfa']` (0,4): más cerca de la profunda que de la piel, que es donde la
    fascia superficial —una membrana dentro de la grasa— está en la cara y el tronco.

    Se fuerza a quedar **dentro de la piel**: donde la envolvente profunda sobresale de la piel (los
    sitios donde el cierre rellena huecos de más, la axila, la ingle) el campo cruzaría la piel hacia
    fuera; el máximo con la piel desplazada un milímetro lo evita.
    """
    t0 = time.time()
    alfa = grupo.parametros.get('alfa', 0.4)
    rejilla, sd_piel, _ = ctx.campo_de_la_piel(grupo.h)
    _, sd_profunda, _ = ctx.campo_de_la_envolvente(grupo.parametros['envolventes'], grupo.h)
    campo = (1 - alfa) * sd_profunda + alfa * sd_piel
    # Un milímetro bajo la piel como mucho: el campo de la piel desplazado.
    campo = np.maximum(campo, sd_piel + 0.001)
    campo = C.suavizar(campo, grupo.sigma)
    dicho(f'  campo de la capa superficial listo ({time.time() - t0:.0f} s)')

    # Los dos campos tienen el mismo sesgo de relleno, que se suma entero: se compensa una vez, en el nivel.
    nivel = -C.SESGO_DEL_RELLENO * grupo.h
    verts, caras = C.superficie_de_la_rejilla(campo, rejilla, nivel)
    dicho(f'  superficie fina: {len(verts):,} vértices, {len(caras):,} triángulos ({time.time() - t0:.0f} s)')
    verts = M.suavizar_taubin(verts, caras, grupo.taubin)
    verts, caras = M.quitar_componentes_pequenas(verts, caras, 0.001)

    def comprobar(pieza, pv, pf):
        return _comprobar_entre_capas(pv, pf, rejilla, sd_piel, sd_profunda, grupo.h)

    return Resultado(verts, caras, comprobar)


def _comprobar_entre_capas(v, f, rejilla, sd_piel, sd_profunda, h):
    """
    Que la lámina quede **entre** la piel y la envolvente: dentro de la piel y fuera de la profunda.

    Se mide con los dos campos de la rejilla del cuerpo, en el punto de cada vértice (el más cercano), con la
    tolerancia del propio relleno: el campo de la piel sobresale 0,65 casillas de la piel de verdad (ver
    `SESGO_DEL_RELLENO`), y la envolvente profunda también.
    """
    from scipy import ndimage as ndi

    g = (np.asarray(v) - np.asarray(rejilla.origen)) / rejilla.h - 0.5
    en_la_piel = ndi.map_coordinates(sd_piel, g.T, order=1, mode='nearest')
    en_la_profunda = ndi.map_coordinates(sd_profunda, g.T, order=1, mode='nearest')
    tolerancia = 0.65 * h + 0.0008
    fuera_de_la_piel = float((en_la_piel > tolerancia).mean())
    dentro_de_la_profunda = float((en_la_profunda < -tolerancia).mean())
    bordes, triples = M.aristas_de_borde(f)
    espesor = en_la_profunda - en_la_piel  # distancia de la lámina a la profunda más a la piel: el espesor de la grasa aquí
    medidas = {
        'triangulos': int(len(f)),
        'vertices': int(len(v)),
        'area_m2': round(M.area_total(v, f), 4),
        'fuera_de_la_piel_pct': round(fuera_de_la_piel * 100, 2),
        'dentro_de_la_profunda_pct': round(dentro_de_la_profunda * 100, 2),
        'espesor_medio_de_la_grasa_mm': round(float(np.mean(espesor)) * 1000, 2),
        'aristas_de_borde': bordes,
        'aristas_triples': triples,
    }
    avisos = []
    if fuera_de_la_piel > 0.02:
        avisos.append(f'{fuera_de_la_piel * 100:.1f} % de los vértices queda fuera de la piel')
    if dentro_de_la_profunda > 0.02:
        avisos.append(f'{dentro_de_la_profunda * 100:.1f} % de los vértices queda dentro de la fascia profunda')
    return avisos, medidas


def meningea(atlas, grupo, ctx):
    import meningea as G

    return G.construir(atlas, grupo, ctx)


def compartimentos(atlas, grupo, ctx):
    import compartimentos as G

    return G.construir(atlas, grupo, ctx)


def visceral(atlas, grupo, ctx):
    import visceral as G

    return G.construir(atlas, grupo, ctx)


CONSTRUCTORES = {
    'envoltura': envoltura,
    'superficial': superficial,
    'meningea': meningea,
    'visceral': visceral,
    'compartimentos': compartimentos,
}

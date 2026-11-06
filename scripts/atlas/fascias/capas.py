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
        self._dentro = None
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

    def campo_de_la_cara_de_dentro(self, h=0.003):
        """
        La distancia con signo a la cara de dentro de la piel (negativa por debajo de ella), en la rejilla de la piel.

        La cara de dentro la pone `recalcular-piel.mjs` bajo la de fuera, con su misma malla: 4 mm por debajo en el
        cuerpo y 2 en la cabeza, o menos donde lo de dentro está más cerca (D-331). Tiene los mismos bordes abiertos
        que la de fuera, un poco hacia dentro, y hacen falta dos vóxeles de grosor para sellarlos (ver abajo).
        """
        if self._dentro is None:
            t0 = time.time()
            rejilla, _, _ = self.campo_de_la_piel(h)
            piel = self.atlas.por_nombre('Skin')[0]
            v, f = self.atlas.malla(piel)
            caras = cara_de_dentro(v, f)
            if caras is None:
                raise SystemExit(
                    'La piel del atlas no trae cara de dentro.\nEjecute antes: node scripts/atlas/recalcular-piel.mjs --aplicar'
                )
            # Solo sus vértices: `muestrear_superficie` mete siempre todos los de la malla, y la pieza trae también los
            # de la cara de fuera. Con ellos, el vóxel de grosor los unía en una cáscara a 4 mm de la cara de dentro, la
            # inundación se paraba ahí y el campo era el de la piel de fuera: la lámina salía dentro de la piel, a 2 mm
            # de mediana por encima de la cara de dentro, y `bajo-la-piel.mjs` recortaba dos tercios de la del pie.
            v, caras = M.compactar(v, caras)
            puntos = C.muestrear_superficie(v, caras, 0.75 * h, SEMILLA)
            # Y con dos vóxeles de grosor, no uno: sola, la cara de dentro no sella con uno sus aberturas (los ojos, la
            # boca), la inundación entra al cuerpo y el relleno sale de 6 L. Con dos sale de 67, con tres igual, y el
            # campo en la propia cara de dentro vale −1,72 mm de mediana, el mismo sesgo que el de la piel en la suya
            # (−1,73): el nivel de `SESGO_DEL_RELLENO` acierta en las dos.
            relleno = C.rellenar(C.ocupar(rejilla, puntos), engrosar=2)
            dicho(f'  cara de dentro de la piel: {C.volumen_de_la_mascara(relleno, h):.1f} L ({time.time() - t0:.0f} s)')
            self._dentro = (rejilla, C.campo_con_signo(relleno, h), relleno)
        return self._dentro

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


def cara_de_dentro(v, f):
    """
    Los triángulos de la cara de dentro de la piel, o `None` si no la tiene.

    La pieza «Skin» trae varias cáscaras sueltas: la del cuerpo, las dos orejas y la cara de dentro, que es una copia
    de la del cuerpo con los vértices corridos hacia dentro. La de dentro es la única de volumen negativo, porque sus
    caras miran al cuerpo. Es la misma regla que `cascarasDeLaPiel`, de `comprobarPiel.mjs`.
    """
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components

    n = len(v)
    filas = np.concatenate([f[:, 0], f[:, 1], f[:, 2]])
    columnas = np.concatenate([f[:, 1], f[:, 2], f[:, 0]])
    grafo = coo_matrix((np.ones(len(filas), np.int8), (filas, columnas)), shape=(n, n))
    _, etiqueta = connected_components(grafo, directed=False)
    de_cada_cara = etiqueta[f[:, 0]]
    a, b, c = (v[f[:, k]].astype(np.float64) for k in range(3))
    volumen = np.einsum('ij,ij->i', a, np.cross(b, c)) / 6
    por_cascara = np.bincount(de_cada_cara, weights=volumen)
    la_de_dentro = int(np.argmin(por_cascara))
    if por_cascara[la_de_dentro] >= 0:
        return None
    return f[de_cada_cara == la_de_dentro]


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
    La tela subcutánea: la lámina que queda justo bajo la piel con su grasa (D-332, E8 de P-012).

    Hasta D-332 iba **entre** la piel y la envolvente profunda, a la fracción α = 0,4 del espesor contada desde la
    profunda: la mezcla `(1 − α) · SD_p + α · SD_s` de las dos distancias. La lámina hacía de grasa, porque la grasa no
    estaba. Con E8 la grasa es parte de la piel: la cara de dentro de la piel queda 4 mm por debajo de la de fuera en el
    cuerpo y 2 en la cabeza, o menos donde no cabe (D-331). El dueño pidió la fascia «justo al terminar el espesor de la
    piel con grasa». Es lo que aparece al cortar la piel entera.

    Por eso el campo es el de la cara de dentro, corrido `grupo.parametros['bajo_la_cara_de_dentro']` (medio milímetro)
    hacia el cuerpo. La cara de dentro ya deja `HOLGURA_DE_DENTRO` (0,8 mm) sobre lo más superficial que tiene debajo:
    medio milímetro más abajo, la lámina todavía no toca ni el músculo ni la fascia profunda. Medido al generarla, queda
    de 0,8 a 1,3 mm bajo la cara de dentro según la zona (la mediana de cada pieza): la gaussiana del campo la hunde un
    poco más en lo convexo, que es casi todo el cuerpo. Lo que se mete en el grosor de la piel —en la rejilla de 3 mm,
    sobre todo en la ingle, en la axila y entre los dedos— lo hunde o lo recorta `bajo-la-piel.mjs`.

    Ya no se mezcla con la envolvente profunda. Donde la envolvente sobresale de la piel (la axila, la ingle, donde el
    cierre rellena de más), la mezcla sacaba la lámina por fuera, y había que atajarla con un máximo contra la piel. La
    cara de dentro, en cambio, no sobresale nunca. La envolvente se sigue leyendo, pero solo para comprobar la lámina
    (`_comprobar_entre_capas`).
    """
    t0 = time.time()
    rejilla, sd_piel, _ = ctx.campo_de_la_piel(grupo.h)
    _, sd_dentro, _ = ctx.campo_de_la_cara_de_dentro(grupo.h)
    _, sd_profunda, _ = ctx.campo_de_la_envolvente(grupo.parametros['envolventes'], grupo.h)
    campo = C.suavizar(sd_dentro + grupo.parametros['bajo_la_cara_de_dentro'], grupo.sigma)
    dicho(f'  campo de la capa superficial listo ({time.time() - t0:.0f} s)')

    # El campo de la cara de dentro tiene el sesgo del relleno, como cualquier otro: se compensa en el nivel.
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
    # De la piel a la profunda, pasando por la lámina: todo lo que hay bajo la piel. Hasta D-331 era la grasa, que la
    # lámina representaba; desde entonces la grasa es parte de la piel y esto es la grasa más el hueco de debajo.
    espacio = en_la_profunda - en_la_piel
    medidas = {
        'triangulos': int(len(f)),
        'vertices': int(len(v)),
        'area_m2': round(M.area_total(v, f), 4),
        'fuera_de_la_piel_pct': round(fuera_de_la_piel * 100, 2),
        'dentro_de_la_profunda_pct': round(dentro_de_la_profunda * 100, 2),
        'espacio_bajo_la_piel_mm': round(float(np.mean(espacio)) * 1000, 2),
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

"""
La fascia meníngea (P-006, E8): duramadre, aracnoides y piamadre del cerebro y de la médula, y las dos hoces.

El atlas trae el cerebro (69 piezas: circunvoluciones, sustancia blanca, cerebelo, tronco, núcleos), los
huesos del cráneo y las vértebras de C1 a L5 con el sacro, pero **ni una sola meninge** salvo el tentorio
del cerebelo (`FJ1843`), y **no trae la médula espinal**. Se calcula todo de lo que sí hay:

  - **Craneal.** La *duramadre* es el forro interno del cráneo: la región que queda entre el cerebro y el
    hueso, hasta `ALCANCE_DE_LA_DURA` del cerebro donde el hueso no está (el agujero magno, las órbitas).
    La *aracnoides* va pegada por dentro de la dura, y la *piamadre* pegada al cerebro. La **hoz del
    cerebro** es la lámina de dura del plano medio entre los hemisferios, y la **del cerebelo**, la que baja
    por detrás entre los lóbulos del cerebelo.
  - **Espinal.** La médula no está en el atlas, pero el conducto vertebral sí: se mide el hueco de cada
    vértebra (la sección horizontal tiene un agujero cerrado por el cuerpo y el arco) y se barre un tubo por
    esos centros. La dura y la aracnoides son un tubo del tamaño del conducto menos la grasa epidural; la
    piamadre, un tubo del calibre de la médula que acaba donde acaba ella, en L1–L2.

Todo es aproximado y se dice en la nota de cada pieza: no hay espacio subaracnoideo con sus cisternas ni
senos venosos, y la piamadre sigue el cerebro **cerrado** (no se mete en cada surco).
"""

import time

import numpy as np
from scipy import ndimage as ndi

import campo as C
import malla as M
from entradas_meningeas import piezas_de_la_columna, piezas_del_cerebro, piezas_del_craneo
from hojas import hoja_plana, tubo

#: Hasta dónde se aleja la dura del cerebro donde no hay hueso que la sujete (el agujero magno, las fisuras
#: de la órbita). A 14 mm cubre el espesor del líquido sobre la convexidad, y no se mete en la cara.
ALCANCE_DE_LA_DURA = 0.014
#: Cuánto entra la aracnoides bajo la dura, y cuánto de la piamadre al cerebro. Separados lo bastante para
#: que no se mezclen en el sombreado a 1,5 mm de rejilla, y lo bastante poco para leerse como capas pegadas.
ARACNOIDES_BAJO_LA_DURA = 0.0012
DURA_DEL_CEREBRO_MINIMO = 0.0020
ARACNOIDES_DEL_CEREBRO_MINIMO = 0.0010
CIERRE_DEL_CEREBRO = 0.004

#: Altura del agujero magno: el borde inferior del occipital (1,556) y la base de la cabeza del atlas. Por
#: debajo, la dura es espinal.
AGUJERO_MAGNO_Y = 1.553


def dicho(texto):
    print(texto, flush=True)


class Craneo:
    """Las máscaras del cráneo y del cerebro en una rejilla de 1,5 mm, y lo que sale de ellas."""

    def __init__(self, atlas, h=0.0015, semilla=20261024):
        t0 = time.time()
        self.atlas, self.h = atlas, h
        cerebro = piezas_del_cerebro(atlas)
        hueso = piezas_del_craneo(atlas)
        dicho(f'  {len(cerebro)} piezas del cerebro y {len(hueso)} huesos del cráneo')
        vb, fb = atlas.malla_unida(cerebro)
        vc, fc = atlas.malla_unida(hueso)
        self.rejilla = C.Rejilla.sobre(
            np.minimum(vb.min(axis=0), vc.min(axis=0)), np.maximum(vb.max(axis=0), vc.max(axis=0)), h, 0.045
        )
        puntos_b = C.muestrear_superficie(vb, fb, 0.75 * h, semilla)
        self.cerebro = C.rellenar(C.ocupar(self.rejilla, puntos_b), engrosar=1)
        self.cerebro_cerrado = C.cierre(self.cerebro, CIERRE_DEL_CEREBRO, h)
        dicho(f'  cerebro: {C.volumen_de_la_mascara(self.cerebro, h):.2f} L, cerrado {C.volumen_de_la_mascara(self.cerebro_cerrado, h):.2f} L ({time.time() - t0:.0f} s)')

        # Cada hueso por su cuenta: rellenar uno solo no deja que el relleno de uno tape la cavidad de otro.
        macizo = np.zeros(self.rejilla.forma, bool)
        for p in hueso:
            v, f = atlas.malla(p)
            oc = C.ocupar(self.rejilla, C.muestrear_superficie(v, f, 0.75 * h, semilla))
            macizo |= C.rellenar(oc, engrosar=1) | ndi.binary_dilation(oc)
        self.hueso = macizo
        dicho(f'  hueso del cráneo (macizo): {C.volumen_de_la_mascara(macizo, h):.2f} L ({time.time() - t0:.0f} s)')

        # El interior del cráneo: el casco del hueso, cerrado con 30 mm para sellar el agujero magno, el
        # techo de las órbitas y la base. A ese radio el casco también se come las cuencas y los senos —sale
        # de 2,6 L, el doble de lo que cabe—, pero solo se usa para decir qué es «dentro» y qué es el cuero
        # cabelludo: lo que cuenta de verdad lo limita ALCANCE_DE_LA_DURA desde el cerebro.
        casco = C.cierre(macizo, 0.03, h)
        dentro = ndi.binary_fill_holes(casco)
        # La región de la dura: lo que está a menos de ALCANCE del cerebro, dentro del casco y sin ser hueso,
        # en la parte conectada con el cerebro. Se abre con 2 mm para soltar las rendijas que se cuelan por
        # los agujeros del hueso.
        distancia = C.distancia_a_la_mascara(self.cerebro_cerrado, h)
        libre = (distancia <= ALCANCE_DE_LA_DURA) & dentro & ~macizo
        libre |= distancia <= DURA_DEL_CEREBRO_MINIMO
        libre = ndi.binary_opening(libre, iterations=max(1, round(0.002 / h)))
        etiquetas, _ = ndi.label(libre | self.cerebro_cerrado)
        centro = np.argwhere(self.cerebro_cerrado).mean(axis=0).astype(int)
        elegido = etiquetas[tuple(centro)]
        if elegido == 0:
            centro = np.argwhere(self.cerebro_cerrado)[len(np.argwhere(self.cerebro_cerrado)) // 2]
            elegido = etiquetas[tuple(centro)]
        # La dura craneal se corta después, con el plano del agujero magno, que es por donde empieza la espinal.
        self.region_de_la_dura = (etiquetas == elegido)
        dicho(f'  región de la dura: {C.volumen_de_la_mascara(self.region_de_la_dura, h):.2f} L ({time.time() - t0:.0f} s)')

    # ------------------------------------------------------------------ campos

    def _campos(self):
        """Las distancias con signo (negativas dentro) a la región de la dura y al cerebro cerrado."""
        if getattr(self, '_f', None) is None:
            h = self.h
            self._f = (
                C.suavizar(C.campo_con_signo(self.region_de_la_dura, h), 1.0),
                C.suavizar(C.campo_con_signo(self.cerebro_cerrado, h), 1.0),
            )
        return self._f

    def _isosuperficie(self, campo, cortar_en_el_agujero_magno=True):
        v, f = C.superficie_de_la_rejilla(campo, self.rejilla, 0.0)
        v = M.suavizar_taubin(v, f, 10)
        v, f = M.quitar_componentes_pequenas(v, f, 0.05)
        if cortar_en_el_agujero_magno:
            v, f = M.recortar_por_planos(v, f, [((0.0, AGUJERO_MAGNO_Y, 0.0), (0.0, 1.0, 0.0))])
        return v, f

    def dura(self):
        """El forro interno del cráneo, nunca a menos de 2 mm del cerebro."""
        region, cerebro = self._campos()
        return self._isosuperficie(np.minimum(region, cerebro - DURA_DEL_CEREBRO_MINIMO))

    def aracnoides(self):
        """Por dentro de la dura a 1,2 mm, y nunca a menos de 1 mm del cerebro."""
        region, cerebro = self._campos()
        return self._isosuperficie(np.minimum(region + ARACNOIDES_BAJO_LA_DURA, cerebro - ARACNOIDES_DEL_CEREBRO_MINIMO))

    def piamadre(self):
        """Pegada al cerebro cerrado, a una décima de milímetro."""
        _, cerebro = self._campos()
        return self._isosuperficie(cerebro - 0.0001)

    # -------------------------------------------------------------------- hoces

    def _corte_del_plano_medio(self, campo, paso):
        """El campo en el plano x = 0, remuestreado cada `paso` metros: `(valores, y0, z0, ys, zs)` con ejes (y, z)."""
        ejes = self.rejilla.centros()
        ys, zs = ejes[1], ejes[2]
        y_fino = np.arange(ys[0], ys[-1], paso)
        z_fino = np.arange(zs[0], zs[-1], paso)
        # Interpolación trilineal en x = 0, que cae entre dos columnas de la rejilla.
        fx = (0.0 - ejes[0][0]) / self.h
        gy, gz = np.meshgrid((y_fino - ys[0]) / self.h, (z_fino - zs[0]) / self.h, indexing='ij')
        plano = np.stack([np.full_like(gy, fx), gy, gz])
        return ndi.map_coordinates(campo, plano, order=1, mode='nearest'), y_fino[0], z_fino[0], y_fino, z_fino

    @staticmethod
    def _contorno_del_plano_medio(atlas, nombre):
        """Los vértices de una pieza del atlas a menos de 12 mm del plano medio: `(y, z)` de cada uno."""
        v, _ = atlas.malla(atlas.por_nombre(nombre)[0])
        m = np.abs(v[:, 0]) < 0.012
        return v[m][:, 1], v[m][:, 2]

    @staticmethod
    def _techo_por_z(y, z, z_fino, ancho=0.003):
        """El `y` más alto de los puntos, por intervalos de `ancho` en z, interpolado a `z_fino`."""
        if len(y) == 0:
            return None
        compartimentos = np.floor((z - z.min()) / ancho).astype(int)
        centros = z.min() + (np.arange(compartimentos.max() + 1) + 0.5) * ancho
        techo = np.full(len(centros), np.nan)
        for k in range(len(centros)):
            m = compartimentos == k
            if m.any():
                techo[k] = y[m].max()
        buenos = ~np.isnan(techo)
        return np.interp(z_fino, centros[buenos], techo[buenos])

    def hoz_del_cerebro(self, atlas, paso=0.00075):
        """
        La lámina de dura del plano medio entre los hemisferios: pegada al techo de la dura, y por debajo
        limitada por el cuerpo calloso (su borde libre pasa a 3 mm sobre él), por delante baja hacia la
        cresta etmoidal, y por detrás se apoya en la cresta del tentorio.
        """
        region, cerebro = self._campos()
        dura = np.minimum(region, cerebro - DURA_DEL_CEREBRO_MINIMO)
        corte, y0, z0, ys, zs = self._corte_del_plano_medio(dura, paso)

        cy, cz = self._contorno_del_plano_medio(atlas, 'Corpus callosum')
        z_atras, z_delante = cz.min(), cz.max()
        techo_cc = self._techo_por_z(cy, cz, zs)
        ty, tz = self._contorno_del_plano_medio(atlas, 'Tentorium cerebelli')
        cresta = self._techo_por_z(ty, tz, zs)

        limite = np.full(len(zs), 1.6, float)
        en_el_cuerpo = (zs >= z_atras) & (zs <= z_delante)
        limite[en_el_cuerpo] = techo_cc[en_el_cuerpo] + 0.003
        # Por delante del cuerpo calloso: el borde libre baja con una pendiente de 1,5 hasta el suelo.
        delante = zs > z_delante
        cima = techo_cc[np.searchsorted(zs, z_delante) - 1] + 0.003
        limite[delante] = np.maximum(cima - 1.5 * (zs[delante] - z_delante), 1.585)
        # Por detrás del cuerpo calloso: la cresta del tentorio, si el atlas la trae, y si no, la altura del esplenio.
        atras = zs < z_atras
        limite[atras] = cresta[atras] if cresta is not None else techo_cc[0] + 0.003
        # La unión entre el cuerpo calloso y el tentorio no puede ser un escalón: se promedia en 12 mm.
        ventana = max(1, int(round(0.012 / paso)))
        nucleo = np.ones(ventana) / ventana
        limite = np.convolve(np.pad(limite, ventana, mode='edge'), nucleo, mode='same')[ventana:-ventana]

        yy = ys[:, None]
        campo = np.maximum(corte - 0.0006, limite[None, :] - yy)
        return _hoja(campo, y0, z0, paso)

    def hoz_del_cerebelo(self, atlas, paso=0.00075):
        """
        El pliegue de dura que baja por detrás entre los lóbulos del cerebelo: del tentorio al agujero magno,
        pegado a la dura occipital, y de 6 mm de ancho (entra 6 mm en el cerebelo, que es donde se inserta).
        """
        region, cerebro = self._campos()
        dura = np.minimum(region, cerebro - DURA_DEL_CEREBRO_MINIMO)
        corte, y0, z0, ys, zs = self._corte_del_plano_medio(dura, paso)
        cerebro_en_x0, _, _, _, _ = self._corte_del_plano_medio(cerebro, paso)

        ty, tz = self._contorno_del_plano_medio(atlas, 'Tentorium cerebelli')
        cresta = self._techo_por_z(ty, tz, zs)
        techo = cresta if cresta is not None else np.full(len(zs), 1.60)
        # Para cada altura, la cara de atrás del cerebro en el plano medio: la z más baja con cerebro dentro.
        dentro = cerebro_en_x0 <= 0
        cara_de_atras = np.full(len(ys), np.nan)
        for k in range(len(ys)):
            idx = np.where(dentro[k])[0]
            if len(idx):
                cara_de_atras[k] = zs[idx.min()]
        validos = ~np.isnan(cara_de_atras)
        if not validos.any():
            return np.zeros((0, 3)), np.zeros((0, 3), np.int64)
        cara_de_atras = np.interp(ys, ys[validos], cara_de_atras[validos])
        yy, zz = ys[:, None], zs[None, :]
        # Dentro de la dura, bajo el tentorio, sobre el agujero magno y a menos de 6 mm de la cara posterior del cerebro.
        campo = np.maximum.reduce([
            corte - 0.0006,
            yy - (techo[None, :] - 0.003),
            AGUJERO_MAGNO_Y - yy + 0 * zz,
            zz - (cara_de_atras[:, None] + 0.006),
        ])
        return _hoja(campo, y0, z0, paso)


def _hoja(campo, y0, z0, paso):
    """Una hoja en el plano medio (x = 0) con la forma de `campo ≤ 0`, sin pedazos sueltos."""
    v, f = hoja_plana(campo, (y0, z0), paso, eje_normal=0, valor_del_plano=0.0)
    if len(f):
        v, f = M.quitar_componentes_pequenas(v, f, 0.02)
    return v, f


# ------------------------------------------------------------------ espinal

#: Donde acaba el saco dural: la altura de S2 (el sacro del atlas va de 0,861 a 1,005 y cada segmento mide unos 3 cm).
FIN_DEL_SACO = 0.955
#: Donde acaba la médula, el cono medular: en L1–L2 (L1 va de 1,093 a 1,15; L2 de 1,07 a 1,118).
FIN_DE_LA_MEDULA = 1.090
#: Grasa epidural y espacio de seguridad entre la dura y el hueso del conducto.
HOLGURA_DE_LA_DURA = 0.0015
#: Cuánto entra la aracnoides bajo la dura espinal: en el saco dural las dos están pegadas.
ARACNOIDES_ESPINAL = 0.0005

def _rellenar_huecos(valores):
    """Interpola linealmente los `nan` de una serie con los vecinos buenos más cercanos (los extremos repiten el último)."""
    valores = np.asarray(valores, float).copy()
    buenos = ~np.isnan(valores)
    if not buenos.any():
        return valores
    indices = np.arange(len(valores))
    valores[~buenos] = np.interp(indices[~buenos], indices[buenos], valores[buenos])
    return valores


def _gauss1d(valores, sigma_en_pasos):
    return ndi.gaussian_filter1d(np.asarray(valores, float), sigma_en_pasos, mode='nearest')


def medir_el_conducto(atlas, ys, semilla=20261024):
    """
    La línea del conducto vertebral a las alturas `ys`: centro `(x, z)` y semiejes `(sx, sz)` del hueco libre.

    El hueco de cada vértebra no se busca como un agujero cerrado en la sección: las mallas de las vértebras
    del atlas son abiertas y esa búsqueda se equivocaba de hueco (se midió: el tubo rozaba el hueso en el
    30 a 50 % de sus vértices). Se mide, en cambio, **por los dos lados del conducto**:

      - la pared de delante es la cara posterior de los cuerpos y de los discos intervertebrales, que sí son
        sólidos cerrados: el `z` más bajo de cada disco, interpolado entre uno y otro;
      - la de atrás es la cara interna de las láminas: el hueso más cercano hacia atrás, en una franja de 1 cm
        sobre el plano medio, a más de 6 mm de la pared de delante;
      - los lados son las caras internas de los pedículos: el hueso más cercano a derecha e izquierda del
        centro, a la altura del conducto.

    Donde falta una medida (entre dos láminas, el espacio interlaminar), se interpola con las de arriba y
    abajo, y todo se suaviza por altura. Después se encoge el tubo lo que haga falta para que no toque el
    hueso: la escala es la menor distancia normalizada a los puntos de la vértebra (por 0,93), con un suelo.
    """
    from scipy.spatial import cKDTree  # noqa: F401  (se usa en el ajuste final)

    vertebras = piezas_de_la_columna(atlas)
    v, f = atlas.malla_unida(vertebras)
    puntos = C.muestrear_superficie(v, f, 0.0006, semilla)

    discos = [p for p in atlas.piezas if not p.get('generada') and p['nombre'].startswith('Intervertebral disk')]
    y_disco, z_disco = [], []
    for d in discos:
        dv, _ = atlas.malla(d)
        y_disco.append((dv[:, 1].min() + dv[:, 1].max()) / 2)
        centro = dv[np.abs(dv[:, 0]) < 0.012]
        z_disco.append(centro[:, 2].min() if len(centro) else dv[:, 2].min())
    orden = np.argsort(y_disco)
    y_disco, z_disco = np.asarray(y_disco)[orden], np.asarray(z_disco)[orden]
    z_adelante = np.interp(ys, y_disco, z_disco)

    n = len(ys)
    z_atras = np.full(n, np.nan)
    x_izq = np.full(n, np.nan)
    x_der = np.full(n, np.nan)
    for k, y in enumerate(ys):
        franja = puntos[np.abs(puntos[:, 1] - y) < 0.003]
        if len(franja) < 20:
            continue
        medio = franja[np.abs(franja[:, 0] + 0.0006) < 0.005]
        detras = medio[medio[:, 2] < z_adelante[k] - 0.006]
        if len(detras):
            z_atras[k] = detras[:, 2].max()
    # La altura del conducto: de la pared de delante a la de atrás, con un mínimo y un máximo de anatomía.
    ap = np.clip(_gauss1d(_rellenar_huecos(z_adelante - z_atras), 4), 0.012, 0.024)
    z_c = z_adelante - ap / 2
    for k, y in enumerate(ys):
        franja = puntos[np.abs(puntos[:, 1] - y) < 0.003]
        banda = franja[np.abs(franja[:, 2] - z_c[k]) < 0.004]
        derecha = banda[banda[:, 0] > 0.004]
        izquierda = banda[banda[:, 0] < -0.004]
        if len(derecha):
            x_der[k] = derecha[:, 0].min()
        if len(izquierda):
            x_izq[k] = izquierda[:, 0].max()
    x_der, x_izq = _rellenar_huecos(x_der), _rellenar_huecos(x_izq)
    ancho = np.clip(_gauss1d((x_der - x_izq) / 2, 4), 0.008, 0.014)
    x_c = np.clip(_gauss1d((x_der + x_izq) / 2, 4), -0.004, 0.004)

    sx = ancho - HOLGURA_DE_LA_DURA
    sz = ap / 2 - HOLGURA_DE_LA_DURA
    # El ajuste final contra el hueso: ningún punto de las vértebras dentro del elipse, con un margen del 7 %.
    escala = np.ones(n)
    for k, y in enumerate(ys):
        franja = puntos[np.abs(puntos[:, 1] - y) < 0.0025]
        if not len(franja):
            continue
        r = np.sqrt(((franja[:, 0] - x_c[k]) / sx[k]) ** 2 + ((franja[:, 2] - z_c[k]) / sz[k]) ** 2)
        escala[k] = min(1.0, 0.93 * float(r.min()))
    escala = np.maximum(escala, 0.55)
    escala = _gauss1d(ndi.minimum_filter1d(escala, 5, mode='nearest'), 2)
    escala = np.minimum(escala, 1.0)
    return x_c, z_c, sx * escala, sz * escala


def _suavizar_por_altura(ys, valores, y_objetivo, sigma=0.04):
    """Media ponderada con un núcleo gaussiano de `sigma` metros de altura: la columna no hace zigzag vértebra a vértebra."""
    ys, valores, y_objetivo = np.asarray(ys), np.asarray(valores), np.asarray(y_objetivo)
    pesos = np.exp(-0.5 * ((y_objetivo[:, None] - ys[None, :]) / sigma) ** 2)
    return (pesos * valores[None, :]).sum(axis=1) / pesos.sum(axis=1)


def _paso_suave(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def _anillo_en(v, y, ancho=0.0015):
    """El centro y los semiejes de los vértices de una malla a menos de `ancho` de la altura `y`."""
    m = np.abs(v[:, 1] - y) < ancho
    if m.sum() < 8:
        return None
    p = v[m]
    return ((p[:, 0].max() + p[:, 0].min()) / 2, (p[:, 2].max() + p[:, 2].min()) / 2,
            (p[:, 0].max() - p[:, 0].min()) / 2, (p[:, 2].max() - p[:, 2].min()) / 2)


def tubos_de_la_columna(atlas, dura_craneal, pia_craneal, paso=0.002):
    """
    La dura, la aracnoides y la piamadre espinales: tres tubos por el conducto vertebral.

    La línea de centros y los semiejes salen de medir el conducto (`medir_el_conducto`). Arriba empiezan donde
    acaban la dura y la piamadre craneales (el anillo del corte en el agujero magno) y se estrechan hasta el calibre del conducto en 3 cm; la dura acaba en S2 con un fondo
    redondeado, y la piamadre un poco antes de L2, que es donde acaba la médula.
    """
    y_arriba = AGUJERO_MAGNO_Y
    ys = np.arange(y_arriba, FIN_DEL_SACO, -paso)
    x, z, sx, sz = medir_el_conducto(atlas, ys)

    # La médula: calibre medio (transversal × anteroposterior) con los ensanchamientos cervical y lumbar.
    cx = 0.0045 + 0.0014 * np.exp(-0.5 * ((ys - 1.47) / 0.04) ** 2) + 0.0010 * np.exp(-0.5 * ((ys - 1.13) / 0.03) ** 2)
    cz = 0.0036 + 0.0004 * np.exp(-0.5 * ((ys - 1.47) / 0.04) ** 2)
    # La médula ocupa el centro del saco, algo hacia delante: el saco guarda más espacio detrás que delante.
    z_medula = z + 0.0006
    # Y la médula cabe en el saco con un milímetro de sobra, también donde el conducto se estrecha.
    cx = np.minimum(cx, sx - 0.001)
    cz = np.minimum(cz, sz - 0.001)

    resultado = {}
    for nombre, anillo_craneal, tamaño, centro_z, hasta in (
        ('dura', dura_craneal, (sx, sz), z, FIN_DEL_SACO),
        ('aracnoides', dura_craneal, (sx - ARACNOIDES_ESPINAL, sz - ARACNOIDES_ESPINAL), z, FIN_DEL_SACO),
        ('pia', pia_craneal, (cx, cz), z_medula, FIN_DE_LA_MEDULA),
    ):
        hacia = ys >= hasta
        yy = ys[hacia]
        px, pz = x[hacia].copy(), centro_z[hacia].copy()
        ex, ez = tamaño[0][hacia].copy(), tamaño[1][hacia].copy()
        anillo = _anillo_en(anillo_craneal, y_arriba)
        if anillo is not None:
            w = _paso_suave((y_arriba - yy) / 0.03)  # 0 arriba, 1 a 3 cm
            ax, az, aex, aez = anillo
            px = (1 - w) * ax + w * px
            pz = (1 - w) * az + w * pz
            ex = (1 - w) * aex + w * ex
            ez = (1 - w) * aez + w * ez
        # El fondo: los últimos 2 cm se estrechan a la mitad antes de la tapa, y la piamadre acaba en punta.
        cola = _paso_suave((hasta + 0.02 - yy) / 0.02) * (1 - _paso_suave((yy - hasta) / 0.02))
        reduccion = 1 - (0.5 if nombre != 'pia' else 0.8) * _paso_suave((hasta + 0.02 - yy) / 0.02)
        ex, ez = ex * reduccion, ez * reduccion
        centros = np.stack([px, yy, pz], axis=1)
        v, f = tubo(centros, np.stack([ex, ez], axis=1), anillo=40, tapa_final=True)
        resultado[nombre] = (v, f)
    return resultado


# ------------------------------------------------------------------ el grupo


def _porcentaje_en(mascara, rejilla, v):
    """Qué fracción de los vértices cae en un voxel marcado de `mascara`."""
    g = rejilla.indices(v)
    ok = g[:, 0] >= 0
    dentro = np.zeros(len(v), bool)
    dentro[ok] = mascara[g[ok, 0], g[ok, 1], g[ok, 2]]
    return float(dentro.mean())


def construir(atlas, grupo, ctx):
    """
    Todas las meninges, cada una como su propia superficie (`Resultado.por_pieza`): no salen de cortar una
    superficie continua por planos, como la fascia de un miembro, sino de construcciones distintas.
    """
    from capas import Resultado  # aquí y no arriba: `capas` importa este módulo

    t0 = time.time()
    craneo = Craneo(atlas, h=grupo.h)
    dura = craneo.dura()
    dicho(f'  dura craneal: {len(dura[1]):,} triángulos ({time.time() - t0:.0f} s)')
    aracnoides = craneo.aracnoides()
    pia = craneo.piamadre()
    hoz = craneo.hoz_del_cerebro(atlas)
    hoz_del_cerebelo = craneo.hoz_del_cerebelo(atlas)
    dicho(f'  aracnoides, piamadre y las dos hoces listas ({time.time() - t0:.0f} s)')
    espinal = tubos_de_la_columna(atlas, dura[0], pia[0])
    dicho(f'  dura, aracnoides y piamadre espinales listas ({time.time() - t0:.0f} s)')

    por_pieza = {
        'TH0200': dura, 'TH0201': hoz, 'TH0202': hoz_del_cerebelo, 'TH0203': aracnoides, 'TH0204': pia,
        'TH0205': espinal['dura'], 'TH0206': espinal['aracnoides'], 'TH0207': espinal['pia'],
    }

    # El hueso de la columna, para ver si el tubo del conducto lo toca: la superficie de cada vértebra en una
    # rejilla de 1,5 mm sobre la caja de la columna.
    vertebras = piezas_de_la_columna(atlas)
    vv, ff = atlas.malla_unida(vertebras)
    rejilla_c = C.Rejilla.sobre(vv.min(axis=0), vv.max(axis=0), 0.0015, 0.01)
    hueso_columna = C.ocupar(rejilla_c, C.muestrear_superficie(vv, ff, 0.0011, 20261024))
    # «Dentro del hueso» quiere decir hundida al menos 2,5 mm: la dura va justo sobre la cara interna del
    # hueso, y un vértice en la frontera es de la dura, no del hueso.
    hueso_hondo = C.distancia_al_exterior(craneo.hueso, craneo.h) > 0.0025

    def comprobar(pieza, v, f):
        bordes, triples = M.aristas_de_borde(f)
        medidas = {
            'triangulos': int(len(f)),
            'vertices': int(len(v)),
            'area_m2': round(M.area_total(v, f), 4),
            'aristas_de_borde': bordes,
            'aristas_triples': triples,
        }
        avisos = []
        espinal_ = pieza.id in ('TH0205', 'TH0206', 'TH0207')
        if espinal_:
            toca = _porcentaje_en(hueso_columna, rejilla_c, v)
            medidas['tocando_el_hueso_pct'] = round(toca * 100, 2)
            if toca > 0.30:
                avisos.append(f'{toca * 100:.1f} % de los vértices toca el hueso del conducto')
        else:
            # El atlas trae un cerebro que entra en el hueso (hasta 15 % de su superficie, 2,5 mm o más): la
            # dura va a 2 mm del cerebro y entra con él. Se mide y se dice, pero no es un fallo de la capa.
            medidas['en_el_hueso_pct'] = round(_porcentaje_en(hueso_hondo, craneo.rejilla, v) * 100, 2)
            if pieza.id in ('TH0200', 'TH0203'):
                # Ninguna de las dos debe estar dentro del cerebro: la dura queda a 2 mm y la aracnoides a 1.
                en_el_cerebro = _porcentaje_en(craneo.cerebro, craneo.rejilla, v)
                medidas['en_el_cerebro_pct'] = round(en_el_cerebro * 100, 2)
                if en_el_cerebro > 0.08:
                    avisos.append(f'{en_el_cerebro * 100:.1f} % de los vértices está dentro del cerebro')
            # Las tres capas van **una dentro de la otra**: del cerebro hacia fuera, piamadre, aracnoides, dura.
            exterior = {'TH0203': dura, 'TH0204': aracnoides}.get(pieza.id)
            if exterior is not None:
                from scipy.spatial import cKDTree

                d, _ = cKDTree(exterior[0]).query(v)
                medidas['separacion_con_la_capa_de_fuera_p5_mm'] = round(float(np.percentile(d, 5)) * 1000, 2)
                if np.percentile(d, 5) < 0.0003:
                    avisos.append('pegada a la capa de fuera: las dos se mezclan en el sombreado')
        if triples > 0.003 * len(f):
            avisos.append(f'{triples} aristas compartidas por más de dos triángulos')
        return avisos, medidas

    return Resultado(np.zeros((0, 3)), np.zeros((0, 3), np.int64), comprobar, por_pieza=por_pieza)

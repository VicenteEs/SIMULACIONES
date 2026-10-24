"""
La fascia visceral (P-006, E9): el pericardio, la pleura parietal, el peritoneo parietal y la fascia renal.

Son las membranas que forran las cavidades y envuelven a los órganos. El atlas trae los órganos (el
corazón, los grandes vasos, el hígado, el estómago, los intestinos, los riñones), la caja torácica con sus
músculos intercostales y el diafragma, pero **no trae los pulmones** ni **la pared interna del abdomen**
(le faltan el recto del abdomen, los oblicuos interno y el transverso). Lo que se hace con cada una:

  - **Pericardio fibroso.** El saco que envuelve al corazón y a la raíz de los grandes vasos: el cierre del
    corazón, de la aorta ascendente, del tronco de la pulmonar y de la parte baja de la vena cava superior,
    a 2,5 mm por fuera.
  - **Pleura parietal, derecha e izquierda.** Forra la cavidad torácica por dentro. La cavidad es lo que
    encierran las costillas, el esternón, las vértebras, los intercostales y el diafragma, con una tapa
    inclinada sobre la primera costilla (el estrecho superior está abierto en el atlas). A esa cavidad se le
    quita el mediastino (corazón, grandes vasos, esófago, tráquea y bronquios principales, timo) y lo que
    queda a cada lado del plano medio es el saco pleural. **Sin pulmones** el saco está vacío por dentro,
    salvo los bronquios que el atlas deja dentro; se dice en la nota.
  - **Peritoneo parietal.** El saco que envuelve a las vísceras abdominales: el cierre de estómago, hígado,
    bazo, páncreas, vesícula, colon e intestino delgado, vejiga y recto, con el límite en la pared del
    abdomen supuesta a 22 mm bajo la piel (la misma de la fascia profunda del tronco).
  - **Fascia renal, derecha e izquierda** (Gerota). Una bolsa a 15 mm del riñón y de la suprarrenal: el
    grosor de la grasa perirrenal que hay entre ellos y la fascia.

Todo es aproximado y la nota de cada pieza lo dice.
"""

import re
import time

import numpy as np
from scipy import ndimage as ndi

import campo as C
import malla as M

SEMILLA = 20261024

#: A cuánto del corazón queda el pericardio fibroso, y el radio con que se cierra el corazón antes.
PERICARDIO_FUERA = 0.0025
PERICARDIO_CIERRE = 0.006
#: A cuánto de los órganos del mediastino llega el saco pleural: más que el pericardio, que va a 2,5 mm.
PLEURA_DEL_MEDIASTINO = 0.0045
MEDIASTINO_CIERRE = 0.008
#: Radio del cierre de la cavidad torácica. Con 10 mm la cavidad salía de 4,2 L según cómo cayera la rejilla y de 0,4 L si no: hay un hueco
#: de unos 2 cm en el borde del diafragma que solo 15 mm sella siempre (se probó con siete márgenes de rejilla distintos).
TORAX_CIERRE = 0.015
#: El peritoneo se cierra sobre las vísceras con este radio (tapa los huecos entre asas) y queda 3 mm por fuera.
PERITONEO_CIERRE = 0.030
PERITONEO_FUERA = 0.003
PARED_DEL_ABDOMEN = 0.022
#: La fascia renal: a esta distancia del riñón y la suprarrenal.
RENAL_FUERA = 0.015


def dicho(texto):
    print(texto, flush=True)


def _piezas(atlas, patron, excluir=r'artery|vein|nerve|ligament|branch|plexus|node|lymph|biliary|tributary|tendon|duct\b|ducts'):
    return [p for p in atlas.piezas if not p.get('generada') and re.search(patron, p['nombre'], re.I)
            and not re.search(excluir, p['nombre'], re.I)]


def _solido(atlas, rejilla, piezas, h, engrosar=1):
    """
    La unión de los volúmenes rellenos de cada pieza, cada una por su cuenta.

    Se muestrea a la mitad de la casilla (no a tres cuartos, como en las fascias de los miembros): la pared del
    tórax mide un voxel de espesor, y con la semilla de las otras capas la cavidad se escapaba por un hueco de
    muestreo y salía de 0,4 L en vez de 4. Con otra semilla salía bien: una pared de un voxel no se puede dejar
    a la suerte del azar.
    """
    solido = np.zeros(rejilla.forma, bool)
    for p in piezas:
        v, f = atlas.malla(p)
        oc = C.ocupar(rejilla, C.muestrear_superficie(v, f, 0.5 * h, SEMILLA))
        solido |= C.rellenar(oc, engrosar=engrosar) | ndi.binary_dilation(oc)
    return solido


def _superficie(mascara, rejilla, h, sigma=1.0, taubin=10, compensar_sesgo=False):
    campo = C.suavizar(C.campo_con_signo(mascara, h), sigma)
    nivel = -C.SESGO_DEL_RELLENO * h if compensar_sesgo else 0.0
    v, f = C.superficie_de_la_rejilla(campo, rejilla, nivel)
    v = M.suavizar_taubin(v, f, taubin)
    v, f = M.quitar_componentes_pequenas(v, f, 0.02)
    return v, f


# --------------------------------------------------------------------- tórax

NOMBRES_DEL_CORAZON = r'^(Wall of ventricle|Wall of (left|right) atrium|Cavity of (left|right) (ventricle|atrium)|Coronary sinus|Ascending aorta|Pulmonary trunk|Superior vena cava)$'
NOMBRES_DEL_MEDIASTINO = (
    r'^(Wall of ventricle|Wall of (left|right) atrium|Cavity of (left|right) (ventricle|atrium)|Ascending aorta|Arch of aorta|'
    r'Descending thoracic aorta|Pulmonary trunk|Left pulmonary artery|Right pulmonary artery|Superior vena cava|Inferior vena cava|'
    r'Esophagus|Trachea|Left main bronchus|Right main bronchus proper|Left lobe of thymus|Right lobe of thymus|'
    r'Left brachiocephalic vein|Right brachiocephalic vein|Azygos vein)$'
)
PARED_TORACICA = (
    r' rib$|costal cartilage|^(Body of sternum|Manubrium|Xiphoid process)$|intercostal muscle|^Diaphragm$|'
    r'^(First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth|Eleventh|Twelfth) thoracic vertebra$|'
    # La primera lumbar y su disco cierran por detrás el borde bajo del diafragma: sin ellos la cavidad se escapaba (0,4 L en vez de 4).
    r'^First lumbar vertebra$|'
    r'^Intervertebral disk( of (first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh) thoracic vertebra| of first lumbar vertebra)?$'
)


class Torax:
    """La cavidad torácica, el mediastino y los sacos pleurales, en una rejilla de 3 mm."""

    def __init__(self, atlas, h=0.003):
        t0 = time.time()
        self.atlas, self.h = atlas, h
        pared = [p for p in _piezas(atlas, PARED_TORACICA, excluir=r'artery|vein|nerve|ligament|plexus|node|lymph|tendon')]
        medias = _piezas(atlas, NOMBRES_DEL_MEDIASTINO, excluir=r'^$')
        corazon = _piezas(atlas, NOMBRES_DEL_CORAZON, excluir=r'^$')
        dicho(f'  tórax: {len(pared)} piezas de la pared, {len(medias)} del mediastino, {len(corazon)} del corazón y sus raíces')
        v, f = atlas.malla_unida(pared + medias)
        self.rejilla = C.Rejilla.sobre(v.min(axis=0), v.max(axis=0), h, 0.07)
        rej = self.rejilla

        macizo = _solido(atlas, rej, pared, h)
        # La tapa del estrecho superior: una losa inclinada como el anillo de la primera costilla (que es 4 cm
        # más baja delante, en el manubrio, que detrás, en la primera vértebra torácica).
        xs, ys, zs = rej.centros()
        X, Y, Z = np.meshgrid(xs, ys, zs, indexing='ij')
        self.plano_de_la_tapa = lambda z: 1.430 - 0.5 * z
        tapa = (np.abs(Y - self.plano_de_la_tapa(Z)) < 2.5 * h) & (((X / 0.090) ** 2 + ((Z - 0.01) / 0.080) ** 2) <= 1.0)
        cerrado = C.cierre(macizo | tapa, TORAX_CIERRE, h)
        etiquetas = ndi.label(~cerrado)[0]
        interior = etiquetas != etiquetas[0, 0, 0]
        # Lo que queda por encima de la tapa no es del tórax.
        debajo_de_la_tapa = Y <= self.plano_de_la_tapa(Z) + 2.5 * h
        self.cavidad = interior & ~macizo & ~tapa & debajo_de_la_tapa
        self.pared = macizo
        dicho(f'  cavidad torácica: {C.volumen_de_la_mascara(self.cavidad, h):.2f} L ({time.time() - t0:.0f} s)')

        mediastino = _solido(atlas, rej, medias, h)
        self.mediastino = C.cierre(mediastino, MEDIASTINO_CIERRE, h)
        corazon_m = _solido(atlas, rej, corazon, h)
        self.corazon = C.cierre(corazon_m, PERICARDIO_CIERRE, h)

        a_menos = C.distancia_a_la_mascara(self.mediastino, h) <= PLEURA_DEL_MEDIASTINO
        libre = self.cavidad & ~a_menos & ~(C.distancia_a_la_mascara(self.corazon, h) <= PERICARDIO_FUERA + 0.001)
        # Cada voxel libre es del saco del lado en que cae del plano medio; lo que queda suelto (burbujas, esquinas
        # de la tapa) se descarta quedándose con los dos mayores.
        derecho = libre & (X < 0)
        izquierdo = libre & (X >= 0)
        self.saco = {}
        for nombre, m in (('derecho', derecho), ('izquierdo', izquierdo)):
            et, n = ndi.label(m)
            if n == 0:
                raise SystemExit(f'El saco pleural {nombre} salió vacío: revise la cavidad torácica.')
            tamanos = np.bincount(et.ravel())[1:]
            mayor = int(np.argmax(tamanos)) + 1
            self.saco[nombre] = et == mayor
            dicho(f'  saco pleural {nombre}: {C.volumen_de_la_mascara(self.saco[nombre], h):.2f} L (de {n} regiones)')

    def pleura(self, lado):
        # Se cierra un voxel el saco: el saco es lo que sobra de restar, y su borde sale dentado donde la resta es fina.
        m = ndi.binary_closing(self.saco[lado], iterations=1)
        return _superficie(m, self.rejilla, self.h, sigma=1.2, taubin=12)

    def pericardio(self):
        """El saco del pericardio: el corazón cerrado, a 2,5 mm por fuera."""
        m = C.distancia_a_la_mascara(self.corazon, self.h) <= PERICARDIO_FUERA
        return _superficie(m | self.corazon, self.rejilla, self.h, sigma=1.0, taubin=10)


# ------------------------------------------------------------------ abdomen

PERITONEO_ENTRADAS = (
    r'^(Stomach|Spleen|Pancreas|Gallbladder|Duodenum|Appendix|Cecum|Ascending colon|Transverse colon|Descending colon|Sigmoid colon|'
    r'Rectum|Urinary bladder|(Proximal|Middle|Distal) part of (jejunum|ileum)|Caudate lobe of liver|(Right|Left) lobe of liver|'
    r'Quadrate lobe of liver|Liver|Parenchyma of liver)$|^Hepatovenous segment|^Hepatic segment|lobe of liver'
)


def peritoneo(atlas, ctx, h=0.003):
    """El peritoneo parietal: el saco que envuelve a las vísceras, dentro de la pared del abdomen."""
    t0 = time.time()
    piezas = _piezas(atlas, PERITONEO_ENTRADAS, excluir=r'artery|vein|nerve|ligament|plexus|node|lymph|biliary|tributary|duct\b|ducts|tendon')
    dicho(f'  peritoneo: {len(piezas)} piezas de vísceras')
    v, f = atlas.malla_unida(piezas)
    rej = C.Rejilla.sobre(v.min(axis=0), v.max(axis=0), h, 0.07)
    organos = _solido(atlas, rej, piezas, h)
    cerrado = C.cierre(organos, PERITONEO_CIERRE, h)
    sd_piel = ctx.piel_en(rej)
    dentro_de_la_pared = sd_piel <= -PARED_DEL_ABDOMEN
    saco = C.distancia_a_la_mascara(cerrado, h) <= PERITONEO_FUERA
    saco = (saco | cerrado) & dentro_de_la_pared
    et, n = ndi.label(saco)
    mayor = int(np.argmax(np.bincount(et.ravel())[1:])) + 1
    saco = et == mayor
    dicho(f'  saco peritoneal: {C.volumen_de_la_mascara(saco, h):.2f} L ({time.time() - t0:.0f} s)')
    superficie = _superficie(saco, rej, h, sigma=1.5, taubin=14)
    return superficie, (rej, organos, sd_piel)


# --------------------------------------------------------------------- riñón


def fascia_renal(atlas, lado, h=0.002):
    """La fascia renal de Gerota: una bolsa a 15 mm del riñón y de la suprarrenal."""
    nombres = {'derecho': ('Right kidney', 'Right adrenal gland'), 'izquierdo': ('Left kidney', 'Left adrenal gland')}[lado]
    piezas = [atlas.por_nombre(n)[0] for n in nombres]
    v, f = atlas.malla_unida(piezas)
    rej = C.Rejilla.sobre(v.min(axis=0), v.max(axis=0), h, RENAL_FUERA + 0.04)
    organo = _solido(atlas, rej, piezas, h)
    organo = C.cierre(organo, 0.004, h)
    bolsa = C.distancia_a_la_mascara(organo, h) <= RENAL_FUERA
    return _superficie(bolsa | organo, rej, h, sigma=1.0, taubin=12), (rej, organo)


# --------------------------------------------------------------------- grupo


def construir(atlas, grupo, ctx):
    from capas import Resultado  # aquí y no arriba: `capas` importa este módulo

    t0 = time.time()
    torax = Torax(atlas)
    pericardio = torax.pericardio()
    pleura_d, pleura_i = torax.pleura('derecho'), torax.pleura('izquierdo')
    dicho(f'  pericardio y pleuras listos ({time.time() - t0:.0f} s)')
    peri, (rej_p, organos_p, sd_piel_p) = peritoneo(atlas, ctx)
    dicho(f'  peritoneo listo ({time.time() - t0:.0f} s)')
    renal_d, (rej_rd, organo_rd) = fascia_renal(atlas, 'derecho')
    renal_i, (rej_ri, organo_ri) = fascia_renal(atlas, 'izquierdo')
    dicho(f'  fascias renales listas ({time.time() - t0:.0f} s)')

    por_pieza = {
        'TH0300': pericardio, 'TH0301': pleura_d, 'TH0301M': pleura_i,
        'TH0302': peri, 'TH0303': renal_d, 'TH0303M': renal_i,
    }

    def en(mascara, rejilla, v):
        g = rejilla.indices(v)
        ok = g[:, 0] >= 0
        dentro = np.zeros(len(v), bool)
        dentro[ok] = mascara[g[ok, 0], g[ok, 1], g[ok, 2]]
        return float(dentro.mean())

    hondo = lambda m, h_: C.distancia_al_exterior(m, h_) > 0.0035  # noqa: E731
    corazon_hondo = hondo(torax.corazon, torax.h)
    pared_honda = hondo(torax.pared, torax.h)
    mediastino_hondo = hondo(torax.mediastino, torax.h)
    organos_hondos = hondo(organos_p, 0.003)
    rd_hondo, ri_hondo = hondo(organo_rd, 0.002), hondo(organo_ri, 0.002)

    def comprobar(pieza, v, f):
        bordes, triples = M.aristas_de_borde(f)
        medidas = {
            'triangulos': int(len(f)), 'vertices': int(len(v)), 'area_m2': round(M.area_total(v, f), 4),
            'aristas_de_borde': bordes, 'aristas_triples': triples,
        }
        avisos = []
        if pieza.id == 'TH0300':
            medidas['dentro_del_corazon_pct'] = round(en(corazon_hondo, torax.rejilla, v) * 100, 2)
            if medidas['dentro_del_corazon_pct'] > 2:
                avisos.append(f"{medidas['dentro_del_corazon_pct']} % de los vértices está dentro del corazón")
        elif pieza.id.startswith('TH0301'):
            medidas['dentro_de_la_pared_pct'] = round(en(pared_honda, torax.rejilla, v) * 100, 2)
            medidas['dentro_del_mediastino_pct'] = round(en(mediastino_hondo, torax.rejilla, v) * 100, 2)
            if medidas['dentro_de_la_pared_pct'] > 5:
                avisos.append(f"{medidas['dentro_de_la_pared_pct']} % de los vértices está dentro de la pared del tórax")
        elif pieza.id == 'TH0302':
            medidas['dentro_de_las_visceras_pct'] = round(en(organos_hondos, rej_p, v) * 100, 2)
        elif pieza.id == 'TH0303':
            medidas['dentro_del_rinon_pct'] = round(en(rd_hondo, rej_rd, v) * 100, 2)
            if medidas['dentro_del_rinon_pct'] > 1:
                avisos.append('la bolsa entra en el riñón')
        elif pieza.id == 'TH0303M':
            medidas['dentro_del_rinon_pct'] = round(en(ri_hondo, rej_ri, v) * 100, 2)
            if medidas['dentro_del_rinon_pct'] > 1:
                avisos.append('la bolsa entra en el riñón')
        if triples > 0.003 * len(f):
            avisos.append(f'{triples} aristas compartidas por más de dos triángulos')
        return avisos, medidas

    return Resultado(np.zeros((0, 3)), np.zeros((0, 3), np.int64), comprobar, por_pieza=por_pieza)

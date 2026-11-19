"""
EL PABELLÓN QUIRÚRGICO COMPLETO: paredes, techo, piso y todo lo que hay en la sala, alrededor de la camilla.

    blender --background --factory-startup --python scripts/pabellon/sala.py -- [opciones]

    --destino <carpeta>        dónde sale `sala.glb` (por omisión, `privado/pabellon/`)
    --vistas                   además, las fotos de comprobación, en `salida/vistas/sala-*.png`: desde la camilla
                               (cabecera, pies, costados, rincón), la cenital sin techo y la planta anotada
    --vistas-cuales a,b,c      solo esas fotos: `cabecera`, `pies`, `costado-derecho`, `costado-izquierdo`, `rincon`, `cenital`,
                               `planta` y `cerca-<pieza>` (el detalle de una pieza de `DISPOSICION`); `todas`, por omisión, es todo menos los `cerca-*`
    --muestras 48              las muestras de Cycles de esas fotos (bajar para probar)
    --muestras-oclusion 192    las muestras con que se hornea la oclusión ambiental (las del `.glb` publicado)
    --lado-oclusion 2048       el lado del atlas de oclusión
    --sin-oclusion             no hornea (para probar la forma en segundos); el `.glb` sale sin oclusión
    --solo-vistas              no reconstruye: fotografía el `.glb` que ya hay en `--destino`

Las texturas (`texturas_sala.py`, con Pillow, en `salida/sala/`) se hacen solas si faltan; si se cambia algo de ese archivo
hay que rehacerlas a mano con `python scripts/pabellon/texturas_sala.py`, porque `sala.py` no mira si están al día.

Hace una sola cosa: `sala.glb`, el recinto y el equipo de un pabellón en el MISMO marco que `colchon.glb` y
`mesa-quirurgica.glb` (metros; origen en el centro de la cara de arriba del colchón; Y arriba; el ancho del colchón en
X y su largo en Z, con la cabeza hacia −Z; el piso en y = −0,95). La camilla no se modela aquí: la pone el simulador.
El resto de la sala, sí, y lo dejó pensado para que se pueda pintar y reordenar sin leer el guion.

## Cómo se repinta y cómo se reordena

- Los colores de la pintura viven en UNA tabla, `PINTURA`, al principio. Todo material que se pueda repintar se llama
  `pintura-*` y lleva un color base plano y limpio, sin luz ni sombra horneadas: el simulador pone sus luces. El resto
  de los materiales son `acero-*`, `plastico-*`, `vidrio-*`, `goma-*`, `pantalla-*`, `piso-vinilo`, `luz-led`, `tela-*`.
- Dónde va cada cosa vive en UNA tabla, `DISPOSICION`: nombre del elemento → posición (x, z en metros, en el marco de
  la camilla), giro y lo que haga falta. Hay una foto de planta (`sala-planta.png`) que la dibuja con sus nombres y
  sus coordenadas, y `comprobar_zonas()` mide lo que ocupa cada pieza del piso de su geometría y falla si una invade la zona
  libre de la arsenalera (|x| ≤ 2,0 y −1,3 ≤ z ≤ 2,6, ni a menos de 2,6 m del centro; solo el equipo de anestesia, en la
  cabecera), se sale de la sala o pisa a otra.

## Qué se le pide al navegador

`mesaEnLaEscena.ts` y `recintoEnLaEscena.ts` cargan el `.glb` y solo le piden tres cosas por su nombre. Los nodos raíz
son `estructura` (paredes, techo, piso, zócalos, puertas, ventanas, perfiles), `equipos` (todo lo del piso y de las
paredes) y `colgantes`. Cada colgante es un nodo `colgante-<algo>` con su pivote en el punto de anclaje al techo: es lo
que el simulador oculta cuando se interpone entre la cámara y el paciente (`despejarLaVista`), y por eso cada uno es
un nodo entero y compacto. Las pantallas son nodos `pantalla-<algo>`, cada una con su material emisivo y su imagen, para
poder cambiarlas sin tocar nada más.

Paredes, techo y piso son de UNA cara (`doubleSided` falso): el simulador deja ver el interior desde fuera y desde
arriba a través de ellos, y una cara trasera o un espesor modelado hacia fuera lo estorbaría.

## Por qué se hace como se hace

**Todo se modela en el marco de glTF** (Y arriba), con `numpy`, y solo se pasa a Blender al final con el giro que hace
el exportador. Así las cuentas de aquí —`DISPOSICION`, las alturas, las zonas libres— son las mismas del navegador.

**Los biseles salen de construcción.** Una caja con las aristas redondeadas es una pila de anillos (`caja`), no un
modificador: un bisel de modificador deja un nudo de triángulos en cada esquina que en acero se ve en los reflejos, y
la pila da el bisel que se le pide con los triángulos justos. Después Blender suaviza por ángulo y pondera las normales
por área (`acabar`), igual que `mobiliario.py`: con eso una caja de bordes biselados refleja la luz como una chapa.

**El detalle fino va en texturas, no en polígonos.** El cepillado del acero, el grano del vinilo, el tejido de una bata
y los rombos de un tapete son mapas de normales que se repiten (`texturas_sala.py`); las juntas de los paneles de
pared y de techo, que son lo que da escala a una sala, sí son geometría —un surco en V de tres milímetros—, porque
cuestan cuatro triángulos por metro y una textura de 512 píxeles por panel no las resolvería. Lo que no se repite
(rótulos, carteles, el reloj, las cajas de insumos) va en un atlas; las pantallas, aparte.

**La oclusión se hornea con Cycles en procesador** y se exporta como `occlusionTexture` en una segunda UV, un atlas de
oclusión solo. Con la luz del simulador la oclusión de los rincones y de las sombras de contacto es lo único que dice
que un carro toca el piso y no flota; el color, no: el color base queda siendo el de la pintura limpia. La segunda UV se
arma aquí (`armar_la_segunda_uv`), sin el desplegado de Blender, para controlar cuánto atlas se lleva cada cosa: el piso y las
paredes, que son enormes y suaves, caben con muy pocos texeles por metro; un monitor, que es chico y está lleno de
rincones, con muchos.

**Es determinista.** Las semillas son fijas, el horneado de Cycles lleva semilla y no se usa ningún orden de conjunto:
dos pasadas dan el mismo `.glb` byte a byte.
"""

import argparse
import hashlib
import json
import math
import os
import shutil
import struct
import subprocess
import sys
import time
from math import cos, hypot, pi, radians, sin, sqrt
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
PABELLON = RAIZ / 'privado' / 'pabellon'
SALIDA = AQUI / 'salida'
TEXTURAS = SALIDA / 'sala'

sys.path.insert(0, str(AQUI))
import texturas_sala as TX  # noqa: E402  (solo sus tablas: Pillow no se importa fuera de sus funciones)

SEMILLA = 20261118


def argumentos():
    resto = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    p = argparse.ArgumentParser(prog='sala.py')
    p.add_argument('--destino', default=str(PABELLON))
    p.add_argument('--vistas', action='store_true')
    p.add_argument('--muestras', type=int, default=48)
    p.add_argument('--muestras-oclusion', type=int, default=192)
    p.add_argument('--lado-oclusion', type=int, default=2048)
    p.add_argument('--sin-oclusion', action='store_true')
    p.add_argument('--solo-vistas', action='store_true')
    p.add_argument('--vistas-cuales', default='todas', help='cuáles fotos, separadas por comas')
    return p.parse_args(resto)


# ================================================================================================== medidas

# El piso a −0,95 y la sala de ±3,8: el simulador y la camilla no negocian estas dos. El techo, a 3,10 m del piso.
SUELO = -0.95
ALTO_DE_LA_SALA = 3.10
TECHO = SUELO + ALTO_DE_LA_SALA
MEDIO = 3.8
RADIO_DE_ESQUINA = 0.08


def h(m):
    """La Y del glTF de un punto a `m` metros sobre el piso."""
    return SUELO + m


# ============================================================================================ la pintura

# Los colores de la pintura, sRGB. Es lo único que hay que tocar para repintar la sala: cada entrada es el color base
# plano del material `pintura-<nombre>` (el piso es `piso-vinilo`, y su color también está aquí). Sin luz ni sombra
# horneadas: de eso se encargan el simulador y la oclusión aparte. El simulador puede repintar sin Blender con
# `PINTURA_DEL_PABELLON` (`src/lib/pabellonCompleto.ts`).

PINTURA = {
    'pared': '#a9c7be',    # verde quirófano claro: el mismo del fondo de la consola
    'zocalo': '#8ea59c',   # gris verdoso, un tono más hondo que la pared: es lo que primero se ensucia
    'techo': '#f2f4f3',    # blanco
    'piso': '#7b8794',     # gris azulado
    'puerta': '#cdd3d5',   # gris claro
    'mueble': '#dde2e1',   # armarios, carros, mostradores
    'equipo': '#e4e8e9',   # carcasas de los equipos
}


# ========================================================================================== la disposición

# Dónde va cada cosa. Es la ÚNICA tabla que hay que tocar para reordenar la sala; el resto del guion lee de aquí.
#
# Coordenadas: las del marco de la camilla (el del `.glb`). `x` va a lo ancho del colchón y `z` a lo largo, con la cabeza
# en −Z y los pies en +Z; `x`, `z` y las alturas, en metros; las alturas de pared se miden desde el piso.
#
# Hay tres clases de entrada:
#
#  - Lo que está en el PISO lleva `x`, `z` y `giro` (grados, alrededor de la vertical; con 0 el frente de la pieza mira a
#    +Z, con 90 a +X, con 180 a −Z y con −90 a −X). Su pieza se construye con el origen en el piso, centrado en su
#    huella y mirando a +Z. Cuánto ocupa lo mide `comprobar_zonas()` de la geometría que sale (no hay tabla de huellas que
#    se desactualice), y falla si algo invade la zona libre, se sale de la sala o pisa a otra pieza.
#  - Lo que está en una PARED lleva `pared` (norte −Z, este +X, sur +Z, oeste −X), `centro` (la coordenada a lo largo
#    de la pared: la x en las paredes norte y sur, la z en las este y oeste) y `altura` (del piso al centro o a la base,
#    según la pieza). El frente mira hacia dentro de la sala.
#  - Lo que CUELGA del techo lleva `x`, `z` del anclaje y lo que haga falta (largos y giros de sus brazos).
#
# La zona libre, que no se toca: nada fijo en el piso dentro de |x| ≤ 2,0 y −1,3 ≤ z ≤ 2,6 (la mesa de la arsenalera y
# ella misma se mueven por ahí), ni dentro de 2,6 m del centro, salvo el equipo de anestesia en la cabecera.
DISPOSICION = {
    # ---- vanos en las paredes ----
    'puerta-corrediza': dict(pared='sur', centro=0.0, ancho=2.0, alto=2.10),
    'puerta-de-paso': dict(pared='oeste', centro=-1.95, ancho=1.0, alto=2.10),
    'ventana-pasillo': dict(pared='este', centro=1.55, ancho=1.6, desde=0.95, hasta=2.10),
    'hueco-lavamanos': dict(pared='oeste', centro=1.75, ancho=2.2, fondo=0.65, alto=2.60),

    # ---- equipo de anestesia, en la cabecera ----
    'maquina-anestesia': dict(x=1.25, z=-2.15, giro=-18),
    'carro-anestesia': dict(x=-1.05, z=-2.35, giro=8),
    'banco-anestesista': dict(x=0.25, z=-1.75, giro=0),
    'poste-suero': dict(x=-0.55, z=-1.80, giro=0),
    'columna-gases': dict(pared='norte', centro=1.25, altura=1.25),

    # ---- contra la pared norte (cabecera) ----
    'estantes-noroeste': dict(x=-2.70, z=-3.53, giro=0),
    'armarios-norte': dict(x=-1.15, z=-3.50, giro=0),
    'torre-insumos': dict(x=0.10, z=-3.49, giro=0),
    'repisas-norte': dict(pared='norte', centro=2.85, altura=1.55),
    'pizarra-conteo': dict(pared='este', centro=-2.75, altura=1.62),

    # ---- contra la pared este (derecha) ----
    'unidad-electroquirurgica': dict(x=3.25, z=-3.15, giro=-35),
    'aspirador': dict(x=3.45, z=-1.95, giro=-90),
    'mostrador-pacs': dict(x=3.50, z=-0.05, giro=-90),
    'monitor-pacs': dict(pared='este', centro=-0.05, altura=1.58),
    'arco-en-c': dict(x=3.00, z=3.02, giro=-90),

    # ---- contra la pared oeste (izquierda) ----
    'estantes-oeste': dict(x=-3.55, z=-3.15, giro=90),
    'gabinete-calentamiento': dict(x=-3.49, z=-0.70, giro=90),
    'taburete-cirujano': dict(x=-3.00, z=0.15, giro=0),
    'cubo-patada': dict(x=-2.95, z=-0.30, giro=0),
    'lavamanos': dict(pared='oeste', centro=1.75),
    'tapete-antifatiga': dict(x=-3.0, z=1.78, giro=90),
    'perchero-plomo': dict(pared='oeste', centro=3.35, altura=1.35),

    # ---- contra la pared sur (pies) ----
    'carro-instrumental': dict(x=-2.85, z=3.30, giro=180),
    'cubo-rojo': dict(x=1.35, z=3.45, giro=180),
    'cubo-negro': dict(x=1.85, z=3.45, giro=180),
    'dispensador-gel': dict(pared='sur', centro=-1.45, altura=1.15),
    'extintor': dict(pared='sur', centro=-1.85, altura=0.95),
    'panel-control': dict(pared='sur', centro=1.65, altura=1.38),
    'reloj-pared': dict(pared='sur', centro=0.0, altura=2.72),
    'desague': dict(x=2.85, z=-0.55),

    # ---- lo que cuelga del techo ----
    # Cada brazo es (azimut en grados desde +X hacia +Z, largo en metros). El anclaje queda fuera del plénum, que ocupa
    # el techo sobre la camilla, y los brazos pasan por debajo de su faldón hasta quedar sobre la camilla.
    'cialitica-1': dict(x=-1.75, z=-0.60, brazo1=(0, 0.95), brazo2=(-20, 0.55), altura_cabezal=2.25),
    'cialitica-2': dict(x=1.75, z=0.55, brazo1=(180, 0.95), brazo2=(160, 0.55), altura_cabezal=2.25),
    'boom-monitores': dict(x=1.65, z=-1.15, brazo=(90, 1.05), altura_monitores=1.98),
    'plenum': dict(x=0.0, z=0.0, ancho=2.60, largo=2.80),

    # ---- tramos de pared sin barra de protección (hay un mueble contra ella): pared, desde, hasta (x en norte y sur, z en este y oeste) ----
    'sin-barra': [('norte', -3.8, 0.45), ('norte', 0.7, 1.9), ('este', -3.8, -2.4), ('este', -1.0, 0.6), ('este', 2.45, 3.8),
                  ('oeste', -3.8, -2.5), ('oeste', -1.0, -0.2), ('oeste', 2.8, 3.8), ('sur', -3.8, -3.0), ('sur', 1.05, 2.2)],

    # ---- lo que va en el techo (empotrado): x, z, ancho (x), largo (z) ----
    'luminarias-techo': [(-2.6, -2.4, 1.2, 0.6), (2.6, -2.4, 1.2, 0.6), (-2.6, 0.0, 1.2, 0.6), (2.6, 0.0, 1.2, 0.6),
                         (-2.6, 2.4, 1.2, 0.6), (2.6, 2.4, 1.2, 0.6), (0.0, -2.6, 1.2, 0.6), (0.0, 2.6, 1.2, 0.6)],
    'rejillas-techo': [(-1.2, 3.0, 0.6, 0.6), (1.2, -3.0, 0.6, 0.6), (-3.1, -1.0, 0.6, 0.6), (3.1, 1.0, 0.6, 0.6)],
    # Rejillas de retorno, bajas en la pared: pared, centro, altura del centro.
    'rejillas-retorno': [('norte', 0.9, 0.30), ('sur', -2.2, 0.30), ('este', -1.2, 0.30)],
    # Detectores de humo y altavoz de intercomunicador: x, z.
    'detectores-techo': [(-1.4, 1.4), (1.4, -2.0), (2.9, 3.0), (-3.0, -3.0)],
}

# Lo que es equipo de anestesia y por eso puede estar en la cabecera, dentro de la zona libre.
EQUIPO_DE_ANESTESIA = {'maquina-anestesia', 'carro-anestesia', 'banco-anestesista', 'poste-suero'}
# Lo que es plano y puede ir en la zona libre sin estorbar a nadie (una lámina de goma de un centímetro).
SIN_ESPESOR = {'tapete-antifatiga'}


# ============================================================================================== los materiales

# Cada material: color (una clave de PINTURA o un #hex), metálico, rugosidad y lo que lleve. Nombres:
# `pintura-*` es lo que se repinta; el resto no. `mosaico` es un mapa de normales que se repite (ver
# `texturas_sala.MOSAICOS`); `color_imagen`, una textura de color; `emision`, (color, fuerza) o una imagen.
MATERIALES = {
    'pintura-pared': dict(color='pared', rug=0.60),
    'pintura-zocalo': dict(color='zocalo', rug=0.45),
    'pintura-techo': dict(color='techo', rug=0.72),
    'pintura-puerta': dict(color='puerta', rug=0.42),
    'pintura-mueble': dict(color='mueble', rug=0.42),
    'pintura-equipo': dict(color='equipo', rug=0.34),
    'piso-vinilo': dict(color='piso', rug=0.40, mosaico='normal-vinilo', fuerza=1.0),
    'acero-cepillado': dict(color='#c5c8cb', metal=1.0, rug=0.40, mosaico='normal-acero', fuerza=1.2),
    'acero-pulido': dict(color='#dde0e2', metal=1.0, rug=0.12),
    'acero-perforado': dict(color='#ffffff', metal=0.6, rug=0.48, mosaico='perforado', es_color=True),
    'plastico-blanco': dict(color='#e7e9ea', rug=0.45),
    'plastico-negro': dict(color='#1b1c1e', rug=0.40),
    'plastico-gris': dict(color='#6f757b', rug=0.52),
    'plastico-estampado': dict(color='#ffffff', rug=0.46, atlas='etiquetas'),
    'plastico-transparente': dict(color='#dfeaee', rug=0.12, alfa=0.38, ao=False),
    'goma-negra': dict(color='#1a1b1c', rug=0.85, mosaico='normal-goma', fuerza=0.75),
    'tela-azul': dict(color='#2d4a75', rug=0.92, mosaico='normal-tejido', fuerza=1.0),
    'vidrio-claro': dict(color='#cfe3e8', rug=0.05, alfa=0.16, ao=False),
    'vidrio-espejo': dict(color='#e3e8eb', metal=1.0, rug=0.03, ao=False),
    'luz-led': dict(color='#fdfeff', emision=('#f6faff', 2.4), ao=False),
    'pantalla-signos': dict(color='#050607', rug=0.18, pantalla='pantalla-signos', ao=False),
    'pantalla-ventilador': dict(color='#050607', rug=0.18, pantalla='pantalla-ventilador', ao=False),
    'pantalla-pacs': dict(color='#050607', rug=0.18, pantalla='pantalla-pacs', ao=False),
    'pantalla-boom': dict(color='#050607', rug=0.18, pantalla='pantalla-boom', ao=False),
    'pantalla-arco': dict(color='#050607', rug=0.18, pantalla='pantalla-arco', ao=False),
    'pantalla-control': dict(color='#050607', rug=0.18, pantalla='pantalla-control', ao=False),
    'pantalla-menores': dict(color='#050607', rug=0.18, pantalla='pantalla-menores', ao=False),
}


# ================================================================================================ el kit

# Todo se construye con numpy en el marco de glTF (Y arriba, mano derecha) y solo al final pasa a Blender. Una `Malla`
# es vértices y caras (polígonos, con las normales hacia fuera por el orden de los vértices, antihorario visto desde
# fuera); el exportador triangula. Para no equivocar el sentido de las caras hay una prueba (`--prueba`): el volumen con
# signo de cada cuerpo cerrado tiene que salir positivo.


def T(x=0.0, y=0.0, z=0.0):
    m = np.eye(4)
    m[:3, 3] = (x, y, z)
    return m


def Rx(g):
    c, s = cos(radians(g)), sin(radians(g))
    return np.array([[1, 0, 0, 0], [0, c, -s, 0], [0, s, c, 0], [0, 0, 0, 1.0]])


def Ry(g):
    c, s = cos(radians(g)), sin(radians(g))
    return np.array([[c, 0, s, 0], [0, 1, 0, 0], [-s, 0, c, 0], [0, 0, 0, 1.0]])


def Rz(g):
    c, s = cos(radians(g)), sin(radians(g))
    return np.array([[c, -s, 0, 0], [s, c, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1.0]])


def Es(sx, sy=None, sz=None):
    m = np.eye(4)
    m[0, 0], m[1, 1], m[2, 2] = sx, sx if sy is None else sy, sx if sz is None else sz
    return m


def mm(*ms):
    r = np.eye(4)
    for m in ms:
        r = r @ m
    return r


def unitario(v):
    v = np.asarray(v, dtype=float)
    return v / np.linalg.norm(v)


def entre(p0, p1, referencia=(1.0, 0.0, 0.0)):
    """La matriz que lleva el eje Y de una pieza (construida a lo largo de +Y) del punto p0 al punto p1."""
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    y = unitario(p1 - p0)
    ref = np.asarray(referencia, float)
    if abs(y @ unitario(ref)) > 0.98:
        ref = np.array([0.0, 0.0, 1.0]) if abs(y[2]) < 0.98 else np.array([1.0, 0.0, 0.0])
    x = unitario(ref - y * (ref @ y))
    z = np.cross(x, y)
    m = np.eye(4)
    m[:3, 0], m[:3, 1], m[:3, 2], m[:3, 3] = x, y, z, p0
    return m


class Malla:
    def __init__(self, v, f, uv=None):
        self.v = np.asarray(v, dtype=float).reshape(-1, 3)
        self.f = [tuple(int(i) for i in c) for c in f]
        self.uv = None if uv is None else np.asarray(uv, dtype=float).reshape(-1, 2)

    def t(self, m):
        """La malla transformada por una matriz 4×4. Si la matriz es un espejo, da la vuelta a las caras."""
        m = np.asarray(m)
        v = self.v @ m[:3, :3].T + m[:3, 3]
        f = self.f if np.linalg.det(m[:3, :3]) > 0 else [c[::-1] for c in self.f]
        return Malla(v, f, self.uv)

    def soldar(self, tol=1e-6):
        """Funde los vértices que coinciden y tira las caras que se quedan en menos de tres: los polos y los anillos colapsados."""
        clave = np.round(self.v / tol).astype(np.int64)
        _, primero, inverso = np.unique(clave, axis=0, return_index=True, return_inverse=True)
        inverso = inverso.reshape(-1)
        caras = []
        for c in self.f:
            salida = []
            for i in c:
                j = int(inverso[i])
                if not salida or salida[-1] != j:
                    salida.append(j)
            if len(salida) > 1 and salida[0] == salida[-1]:
                salida.pop()
            if len(salida) >= 3:
                caras.append(tuple(salida))
        uv = None if self.uv is None else self.uv[primero]
        return Malla(self.v[primero], caras, uv)

    def compactar(self):
        """Quita los vértices que ninguna cara usa."""
        usados = np.unique([i for c in self.f for i in c])
        nuevo = np.full(len(self.v), -1)
        nuevo[usados] = np.arange(len(usados))
        return Malla(self.v[usados], [tuple(int(nuevo[i]) for i in c) for c in self.f], None if self.uv is None else self.uv[usados])


def unir(mallas):
    mallas = [m for m in mallas if m is not None and len(m.f)]
    if not mallas:
        return Malla(np.zeros((0, 3)), [])
    v, f, uv, n = [], [], [], 0
    con_uv = any(m.uv is not None for m in mallas)
    for m in mallas:
        v.append(m.v)
        f.extend(tuple(i + n for i in c) for c in m.f)
        if con_uv:
            uv.append(m.uv if m.uv is not None else np.zeros((len(m.v), 2)))
        n += len(m.v)
    return Malla(np.concatenate(v), f, np.concatenate(uv) if con_uv else None)


def volumen(m):
    """El volumen con signo de un cuerpo cerrado: positivo si las caras miran hacia fuera."""
    total = 0.0
    for c in m.f:
        a = m.v[c[0]]
        for k in range(1, len(c) - 1):
            total += a @ np.cross(m.v[c[k]], m.v[c[k + 1]])
    return total / 6.0


# ---------------------------------------------------------------------------------------- cuerpos de anillos


def pila(anillos, cerrar_abajo=True, cerrar_arriba=True):
    """
    Una pila de anillos de igual número de puntos, recorridos con el ángulo creciendo de +X hacia +Z y de abajo
    arriba. Con ese orden, las caras (a, d, c, b) miran hacia fuera. Los anillos colapsados (polos, aristas) se
    sueldan al final.
    """
    m = len(anillos[0])
    k = len(anillos)
    v = np.concatenate(anillos)
    idx = np.arange(k * m).reshape(k, m)
    caras = []
    for j in range(k - 1):
        for i in range(m):
            i2 = (i + 1) % m
            caras.append((idx[j, i], idx[j + 1, i], idx[j + 1, i2], idx[j, i2]))
    if cerrar_abajo:
        caras.append(tuple(idx[0]))
    if cerrar_arriba:
        caras.append(tuple(idx[-1][::-1]))
    return Malla(v, caras).soldar()


def caja(c, t, r=0.0, seg=2):
    """
    Una caja centrada en `c`, de tamaño `t` (x, y, z), con todas las aristas redondeadas a radio `r` en `seg` pasos.
    Es una pila de anillos: cada nivel es un rectángulo de esquinas redondas, y las aristas de arriba y de abajo son
    los niveles que se achican. Con `r = 0` son seis caras.
    """
    hx, hy, hz = (t[0] / 2, t[1] / 2, t[2] / 2)
    r = min(r, hx * 0.98, hy * 0.98, hz * 0.98)
    if r <= 1e-6:
        niveles = [(-hy, 0.0), (hy, 0.0)]
        n_esquina = 0
    else:
        alfas = [90.0 * i / seg for i in range(seg + 1)]
        niveles = [(-hy + r * (1 - cos(radians(a))), r * sin(radians(a))) for a in alfas]
        niveles += [(hy - r * (1 - cos(radians(a))), r * sin(radians(a))) for a in reversed(alfas)]
        n_esquina = seg
    anillos = []
    for y, rho in niveles:
        pts = []
        for (sx, sz, desde) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
            cx, cz = sx * (hx - r), sz * (hz - r)
            for k in range(n_esquina + 1):
                a = radians(desde + 90.0 * k / max(n_esquina, 1))
                pts.append((c[0] + cx + rho * cos(a), c[1] + y, c[2] + cz + rho * sin(a)))
        anillos.append(np.array(pts))
    return pila(anillos)


def bloque(a, b, r=0.0, seg=2):
    """Una caja por sus dos esquinas opuestas (mínimo y máximo)."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    return caja((a + b) / 2, np.abs(b - a), r, seg)


def revolucion(perfil, n=24, cerrar=False):
    """
    Una pieza de revolución alrededor de Y. El perfil son puntos (radio, y) recorridos de abajo-dentro a arriba-dentro por
    fuera: el fondo, la pared, la tapa. Si empieza o acaba en el eje (radio 0) a la misma altura que el vecino, esa
    tapa es un solo polígono y no un abanico. `cerrar` une el último punto con el primero (un perfil de anillo).
    """
    perfil = [(float(r), float(y)) for r, y in perfil]
    cierra_abajo = cierra_arriba = False
    if not cerrar:
        if perfil[0][0] < 1e-9 and len(perfil) > 1 and abs(perfil[0][1] - perfil[1][1]) < 1e-9:
            perfil = perfil[1:]
            cierra_abajo = True
        if perfil[-1][0] < 1e-9 and len(perfil) > 1 and abs(perfil[-1][1] - perfil[-2][1]) < 1e-9:
            perfil = perfil[:-1]
            cierra_arriba = True
    ang = np.arange(n) * 2 * pi / n
    anillos = [np.stack([r * np.cos(ang), np.full(n, y), r * np.sin(ang)], axis=-1) for r, y in perfil]
    if cerrar:
        m = pila(anillos + [anillos[0]], False, False)
        return m
    return pila(anillos, cierra_abajo, cierra_arriba)


def cilindro(r, alto, n=20, r2=None, base=0.0):
    r2 = r if r2 is None else r2
    return revolucion([(0, base), (r, base), (r2, base + alto), (0, base + alto)], n)


def cilindro_entre(p0, p1, r, n=16, r2=None):
    largo = float(np.linalg.norm(np.asarray(p1, float) - np.asarray(p0, float)))
    return cilindro(r, largo, n, r2).t(entre(p0, p1))


def esfera(r, n=16, mitad=None):
    """Una esfera, o su mitad de arriba (`mitad='arriba'`) o de abajo (`'abajo'`), con tapa plana."""
    a0, a1 = {None: (-90, 90), 'arriba': (0, 90), 'abajo': (-90, 0)}[mitad]
    perfil = [(r * cos(radians(a)), r * sin(radians(a))) for a in np.linspace(a0, a1, max(4, n // 2) + 1)]
    if mitad == 'arriba':
        perfil = [(0.0, 0.0)] + perfil
    if mitad == 'abajo':
        perfil = perfil + [(0.0, 0.0)]
    return revolucion(perfil, n)


def disco(r, n=24, y=0.0):
    """Un círculo plano en XZ mirando hacia +Y."""
    ang = np.arange(n) * 2 * pi / n
    return Malla(np.stack([r * np.cos(ang), np.full(n, y), r * np.sin(ang)], axis=-1), [tuple(range(n))[::-1]])


def prisma(poligono, y0, y1):
    """Un prisma vertical sobre un polígono (x, z) cualquiera, convexo o no, en el orden que sea."""
    p = np.asarray(poligono, float)
    area = 0.0
    for i in range(len(p)):
        j = (i + 1) % len(p)
        area += p[i, 1] * p[j, 0] - p[j, 1] * p[i, 0]
    if area < 0:
        p = p[::-1]
    n = len(p)
    v = np.concatenate([np.stack([p[:, 0], np.full(n, y0), p[:, 1]], -1), np.stack([p[:, 0], np.full(n, y1), p[:, 1]], -1)])
    caras = [tuple(range(n))]
    caras.append(tuple(range(n, 2 * n))[::-1])
    for i in range(n):
        j = (i + 1) % n
        caras.append((i, n + i, n + j, j))
    m = Malla(v, caras)
    if volumen(m) < 0:
        m = Malla(v, [c[::-1] for c in caras])
    return m


# ------------------------------------------------------------------------------------------- barridos


def marcos(pts, arriba=(0.0, 1.0, 0.0)):
    """Los marcos (T, N, B) de un camino, transportados sin torcer: con uno fijo, el tubo se aplasta donde el camino se vuelve paralelo."""
    P = np.asarray(pts, dtype=float)
    Tg = np.gradient(P, axis=0)
    Tg /= np.linalg.norm(Tg, axis=1)[:, None]
    ref = np.asarray(arriba, float)
    if abs(Tg[0] @ unitario(ref)) > 0.98:
        ref = np.array([1.0, 0.0, 0.0])
    N = unitario(ref - Tg[0] * (ref @ Tg[0]))
    Ns, Bs = [], []
    for t in Tg:
        N = unitario(N - t * (N @ t))
        Ns.append(N)
        Bs.append(np.cross(t, N))
    return P, Tg, np.array(Ns), np.array(Bs)


def barrido(perfil, pts, arriba=(0.0, 1.0, 0.0), tapas=True, escala=None):
    """
    Barre un perfil cerrado (x, y) —antihorario en el plano (N, B) del camino— a lo largo de un camino. `escala` es
    un factor por punto del camino. Con el perfil antihorario y (N, B, T) diestro, las caras miran hacia fuera.
    """
    P, Tg, N, B = marcos(pts, arriba)
    perfil = np.asarray(perfil, float)
    m = len(perfil)
    k = len(P)
    escala = np.ones(k) if escala is None else np.asarray(escala, float)
    anillos = [P[i] + escala[i] * (N[i] * perfil[:, 0:1] + B[i] * perfil[:, 1:2]) for i in range(k)]
    v = np.concatenate(anillos)
    idx = np.arange(k * m).reshape(k, m)
    caras = []
    for j in range(k - 1):
        for i in range(m):
            i2 = (i + 1) % m
            caras.append((idx[j, i], idx[j, i2], idx[j + 1, i2], idx[j + 1, i]))
    if tapas:
        caras.append(tuple(idx[0][::-1]))
        caras.append(tuple(idx[-1]))
    return Malla(v, caras)


def circulo_perfil(r, n=8):
    a = np.arange(n) * 2 * pi / n
    return np.stack([r * np.cos(a), r * np.sin(a)], axis=-1)


def rect_perfil(w, hh, r=0.0, seg=2):
    """Un rectángulo (w × hh) de esquinas redondas, antihorario: el perfil de un riel, un listón, una barra."""
    pts = []
    r = min(r, w / 2 * 0.98, hh / 2 * 0.98)
    n = seg if r > 0 else 0
    for (sx, sy, desde) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        for k in range(n + 1):
            a = radians(desde + 90.0 * k / max(n, 1))
            pts.append((sx * (w / 2 - r) + r * cos(a), sy * (hh / 2 - r) + r * sin(a)))
    return np.array(pts)


def tubo(pts, r, n=8, tapas=True, radios=None):
    return barrido(circulo_perfil(r, n), pts, tapas=tapas, escala=radios)


def barra(p0, p1, perfil, arriba=(0.0, 1.0, 0.0)):
    """Un perfil recto de p0 a p1."""
    return barrido(perfil, [p0, p1], arriba=arriba)


# ------------------------------------------------------------------------------------------------ curvas


def bezier(p0, p1, p2, p3, n=24):
    t = np.linspace(0.0, 1.0, n)[:, None]
    p0, p1, p2, p3 = (np.asarray(q, dtype=float) for q in (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def cuelga(p0, p1, caida, n=24):
    """El camino de un cable o una manguera tendida entre dos puntos, con la panza que le da su peso: una parábola."""
    t = np.linspace(0.0, 1.0, n)[:, None]
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    p = p0 + (p1 - p0) * t
    p[:, 1] -= caida * 4 * t[:, 0] * (1 - t[:, 0])
    return p


def espiral(centro_p, radio, paso, vueltas, eje=(0, 1, 0), n_por_vuelta=14):
    """Una hélice (un cable enroscado) en torno a un eje que parte de `centro_p`."""
    e = unitario(eje)
    x = unitario(np.cross(e, [0.0, 0.0, 1.0]) if abs(e[2]) < 0.9 else np.cross(e, [1.0, 0.0, 0.0]))
    z = np.cross(e, x)
    n = int(vueltas * n_por_vuelta) + 1
    a = np.arange(n) * 2 * pi / n_por_vuelta
    return np.asarray(centro_p, float) + np.outer(np.arange(n) * paso / n_por_vuelta, e) + radio * (np.outer(np.cos(a), x) + np.outer(np.sin(a), z))


# --------------------------------------------------------------------------------------------- láminas


def quad(p0, p1, p2, p3, uv=None):
    """Un cuadrilátero con las normales según el orden (antihorario visto desde donde mira). `uv` es (u0, v0, u1, v1) o cuatro puntos."""
    u = None
    if uv is not None:
        if len(uv) == 4 and np.isscalar(uv[0]):
            u0, v0, u1, v1 = uv
            u = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        else:
            u = uv
    return Malla([p0, p1, p2, p3], [(0, 1, 2, 3)], u)


def lamina(c, eu, ev, w, hh, uv=None):
    """Un rectángulo de w × hh centrado en `c`, con ejes unitarios eu y ev; su normal es eu × ev."""
    c, eu, ev = np.asarray(c, float), np.asarray(eu, float), np.asarray(ev, float)
    a, b = eu * w / 2, ev * hh / 2
    return quad(c - a - b, c + a - b, c + a + b, c - a + b, uv)


def caja_impresa(c, t, caras, resto=None, ejes_frente='z'):
    """
    Una caja sin biseles con una imagen del atlas en cada cara. `caras` es un diccionario '+z', '-z', '+x', '-x', '+y',
    '-y' → rectángulo (u0, v0, u1, v1); `resto` es el de las caras que falten (una muestra de color).
    """
    cx, cy, cz = c
    hx, hy, hz = t[0] / 2, t[1] / 2, t[2] / 2
    lados = {
        '+z': ((cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz), (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz)),
        '-z': ((cx + hx, cy - hy, cz - hz), (cx - hx, cy - hy, cz - hz), (cx - hx, cy + hy, cz - hz), (cx + hx, cy + hy, cz - hz)),
        '+x': ((cx + hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz - hz), (cx + hx, cy + hy, cz - hz), (cx + hx, cy + hy, cz + hz)),
        '-x': ((cx - hx, cy - hy, cz - hz), (cx - hx, cy - hy, cz + hz), (cx - hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz - hz)),
        '+y': ((cx - hx, cy + hy, cz + hz), (cx + hx, cy + hy, cz + hz), (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz)),
        '-y': ((cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz + hz), (cx - hx, cy - hy, cz + hz)),
    }
    piezas = []
    for cara, pts in lados.items():
        uv = caras.get(cara, resto)
        if uv is None:
            continue
        piezas.append(quad(*pts, uv=uv))
    return unir(piezas)


def faja_curva(centro, radio, a0, a1, y0, y1, n=6, hacia_el_centro=True):
    """Una faja vertical de cilindro entre dos ángulos (grados, x = cos, z = sin): la esquina redondeada de una pared."""
    ang = np.radians(np.linspace(a0, a1, n + 1))
    bajo = np.stack([centro[0] + radio * np.cos(ang), np.full(n + 1, y0), centro[1] + radio * np.sin(ang)], -1)
    alto = np.stack([centro[0] + radio * np.cos(ang), np.full(n + 1, y1), centro[1] + radio * np.sin(ang)], -1)
    v = np.concatenate([bajo, alto])
    caras = []
    for i in range(n):
        a, b, c, d = i, i + 1, n + 1 + i + 1, n + 1 + i
        caras.append((a, b, c, d) if hacia_el_centro else (a, d, c, b))
    # El sentido depende de si el ángulo crece o decrece; se corrige con la normal esperada.
    m = Malla(v, caras)
    cara = m.f[0]
    nrm = np.cross(m.v[cara[1]] - m.v[cara[0]], m.v[cara[3]] - m.v[cara[0]])
    medio = (m.v[cara[0]] + m.v[cara[2]]) / 2
    hacia = np.array([centro[0] - medio[0], 0.0, centro[1] - medio[2]])
    if (nrm @ hacia > 0) != hacia_el_centro:
        m = Malla(v, [c[::-1] for c in m.f])
    return m


def _quiebres(r0, r1, juntas, ancho, extras):
    pts = {round(r0, 6), round(r1, 6)}
    for j in juntas:
        if r0 + 1e-6 < j - ancho / 2 and j + ancho / 2 < r1 - 1e-6:
            pts.update((round(j - ancho / 2, 6), round(j, 6), round(j + ancho / 2, 6)))
    for e in extras:
        if r0 + 1e-6 < e < r1 - 1e-6:
            pts.add(round(e, 6))
    return np.array(sorted(pts))


def superficie(o, u, v, ru, rv, huecos=(), juntas_u=(), juntas_v=(), ancho=0.006, prof=0.0025):
    """
    Un plano de pared, techo o piso con huecos y juntas. `o` es el origen; `u` y `v`, los ejes unitarios, y la
    cara mira hacia u × v. `ru` y `rv` son los rangos (u0, u1), (v0, v1). `huecos` son (u0, u1, v0, v1) que se
    dejan sin cara. Las juntas son ranuras en V (de `ancho` y `prof`): `juntas_u` están en esas posiciones de u,
    corriendo a lo largo de v, y `juntas_v`, al revés.

    Se hace en una cuadrícula cuyas líneas son los bordes de los huecos y de las ranuras, así que nada queda a
    medias: cada celda está dentro o fuera de un hueco. Una ranura de tres milímetros cuesta un par de triángulos
    por metro; lo que no se logra con una textura de 512 píxeles por panel.
    """
    o, u, v = (np.asarray(a, float) for a in (o, u, v))
    n = unitario(np.cross(u, v))
    bu = _quiebres(ru[0], ru[1], juntas_u, ancho, [e for hu in huecos for e in hu[:2]])
    bv = _quiebres(rv[0], rv[1], juntas_v, ancho, [e for hu in huecos for e in hu[2:]])

    def tienda(x, juntas):
        d = 0.0
        for j in juntas:
            d = max(d, 1.0 - abs(x - j) / (ancho / 2))
        return max(d, 0.0) * prof

    pu = np.array([tienda(x, juntas_u) for x in bu])
    pv = np.array([tienda(y, juntas_v) for y in bv])
    nu, nv = len(bu), len(bv)
    prof_v = np.maximum(pu[:, None], pv[None, :])
    V = o + bu[:, None, None] * u + bv[None, :, None] * v - prof_v[..., None] * n
    caras = []
    for i in range(nu - 1):
        for j in range(nv - 1):
            cu, cv = (bu[i] + bu[i + 1]) / 2, (bv[j] + bv[j + 1]) / 2
            if any(h0 < cu < h1 and k0 < cv < k1 for h0, h1, k0, k1 in huecos):
                continue
            caras.append((i * nv + j, (i + 1) * nv + j, (i + 1) * nv + j + 1, i * nv + j + 1))
    return Malla(V.reshape(-1, 3), caras).compactar()


# ============================================================================================ lotes y materiales

LOTES = []
_ramas = {}      # nombre → objeto de Blender (para colgar hijos)


class Lote:
    """
    Todo lo que va junto en un mismo nodo del `.glb`: piezas (mallas con su material) que se funden en UNA malla de
    Blender con una ranura por material. Se funden por material y por nodo; los nodos propios son solo los que el código
    del navegador va a tocar (cada colgante, cada pantalla) y las piezas grandes que se quieren poder reconocer.

    `grupo` es el nodo raíz del que cuelga: `estructura`, `equipos` o `colgantes`. `pivote` es el origen del nodo (en el
    marco de la sala): para un colgante, el punto de anclaje al techo; para lo demás, el origen. `padre` es otro lote
    del que cuelga (las pantallas de un boom). `densidad` es cuántos texeles de oclusión se lleva respecto del
    común: lo enorme y suave (el piso, el techo) se conforma con menos.
    """

    def __init__(self, nombre, grupo, suave=40.0, pivote=(0.0, 0.0, 0.0), padre=None, densidad=1.0):
        self.nombre = nombre
        self.grupo = grupo
        self.suave = suave
        self.pivote = np.asarray(pivote, dtype=float)
        self.padre = padre
        self.densidad = densidad
        self.piezas = []
        self._pila = [np.eye(4)]
        LOTES.append(self)

    def en(self, *matrices):
        """`with lote.en(T(...), Ry(...)):` — lo que se agregue dentro queda transformado."""
        return _Marco(self, mm(*matrices))

    def add(self, malla, material):
        if malla is None or not len(malla.f):
            return
        assert material in MATERIALES, f'material desconocido: {material}'
        self.piezas.append((malla.t(self._pila[-1]), material))

    def adds(self, mallas, material):
        for m in mallas:
            self.add(m, material)


class _Marco:
    def __init__(self, lote, m):
        self.lote, self.m = lote, m

    def __enter__(self):
        self.lote._pila.append(self.lote._pila[-1] @ self.m)
        return self.lote

    def __exit__(self, *a):
        self.lote._pila.pop()


def sobre_el_piso(x, z, giro=0.0):
    """La matriz que lleva una pieza hecha en su marco (origen en el piso, frente a +Z) a su sitio de la sala."""
    return mm(T(x, SUELO, z), Ry(giro))


_PARED = {
    # nombre: (punto sobre la pared en función de la coordenada a lo largo, giro del frente, eje de esa coordenada)
    'norte': (lambda c: (c, 0.0, -MEDIO), 0.0),
    'este': (lambda c: (MEDIO, 0.0, c), -90.0),
    'sur': (lambda c: (c, 0.0, MEDIO), 180.0),
    'oeste': (lambda c: (-MEDIO, 0.0, c), 90.0),
}


def sobre_la_pared(pared, centro, altura=0.0):
    """
    La matriz que lleva una pieza hecha en su marco de pared (origen sobre la pared, `+z` hacia dentro de la sala, `+x` a
    la derecha de quien la mira de frente, `+y` arriba) a su sitio. `altura` es desde el piso.
    """
    f, giro = _PARED[pared]
    x, _, z = f(centro)
    return mm(T(x, SUELO + altura, z), Ry(giro))


# ---------------------------------------------------------------------------------------------- materiales


def lineal(c):
    """De sRGB (#hex o tupla 0–1) a lineal, que es lo que pide Blender."""
    if isinstance(c, str):
        c = c.lstrip('#')
        c = tuple(int(c[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    f = lambda x: x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    return tuple(f(x) for x in c)


def arbol_de(material):
    if material.node_tree is None:
        material.use_nodes = True
    a = material.node_tree
    p = next((n for n in a.nodes if n.type == 'BSDF_PRINCIPLED'), None) or a.nodes.new('ShaderNodeBsdfPrincipled')
    s = next((n for n in a.nodes if n.type == 'OUTPUT_MATERIAL'), None) or a.nodes.new('ShaderNodeOutputMaterial')
    if not s.inputs['Surface'].is_linked:
        a.links.new(p.outputs['BSDF'], s.inputs['Surface'])
    return a, p


_imagenes = {}


def imagen_de_archivo(nombre, sin_color=False):
    if nombre in _imagenes:
        return _imagenes[nombre]
    ruta = TEXTURAS / f'{nombre}.png'
    if not ruta.exists():
        raise FileNotFoundError(f'Falta {ruta}: corre `python scripts/pabellon/texturas_sala.py`.')
    img = bpy.data.images.load(str(ruta))
    img.name = nombre
    if sin_color:
        img.colorspace_settings.name = 'Non-Color'
    img.pack()
    _imagenes[nombre] = img
    return img


def _con_mosaico(arbol, img, metros):
    tex = arbol.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.extension = 'REPEAT'
    tex.interpolation = 'Linear'
    uv = arbol.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    mapa = arbol.nodes.new('ShaderNodeMapping')
    mapa.inputs['Scale'].default_value = (1.0 / metros, 1.0 / metros, 1.0)
    arbol.links.new(uv.outputs['UV'], mapa.inputs['Vector'])
    arbol.links.new(mapa.outputs['Vector'], tex.inputs['Vector'])
    return tex


def _con_atlas(arbol, img):
    tex = arbol.nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.extension = 'EXTEND'
    uv = arbol.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UVMap'
    arbol.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    return tex


def _con_oclusion(arbol, img):
    """La oclusión por el único camino que el exportador de glTF reconoce: el grupo «glTF Material Output», leída del rojo."""
    grupo = bpy.data.node_groups.get('glTF Material Output')
    if grupo is None:
        grupo = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        grupo.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        grupo.nodes.new('NodeGroupOutput')
        grupo.nodes.new('NodeGroupInput')
    nodo = arbol.nodes.new('ShaderNodeGroup')
    nodo.node_tree = grupo
    tex = arbol.nodes.new('ShaderNodeTexImage')
    tex.image = img
    uv = arbol.nodes.new('ShaderNodeUVMap')
    uv.uv_map = 'UV-oclusion'
    arbol.links.new(uv.outputs['UV'], tex.inputs['Vector'])
    partes = arbol.nodes.new('ShaderNodeSeparateColor')
    arbol.links.new(tex.outputs['Color'], partes.inputs['Color'])
    arbol.links.new(partes.outputs['Red'], nodo.inputs['Occlusion'])


def crear_los_materiales(img_oclusion):
    mats = {}
    for nombre, d in MATERIALES.items():
        m = bpy.data.materials.new(nombre)
        arbol, p = arbol_de(m)
        color = PINTURA.get(d['color'], d['color'])
        p.inputs['Base Color'].default_value = (*lineal(color), 1.0)
        p.inputs['Metallic'].default_value = d.get('metal', 0.0)
        p.inputs['Roughness'].default_value = d.get('rug', 0.5)
        if 'Coat Weight' in p.inputs:
            p.inputs['Coat Weight'].default_value = 0.0
        # Una sola cara: el simulador deja ver el interior desde fuera y desde arriba, y una cara trasera lo estorbaría.
        m.use_backface_culling = True
        if 'alfa' in d:
            p.inputs['Alpha'].default_value = d['alfa']
            if hasattr(m, 'surface_render_method'):
                m.surface_render_method = 'BLENDED'
        if 'emision' in d:
            c, fuerza = d['emision']
            p.inputs['Emission Color'].default_value = (*lineal(c), 1.0)
            p.inputs['Emission Strength'].default_value = fuerza
        if 'mosaico' in d and not d.get('es_color'):
            img = imagen_de_archivo(d['mosaico'], sin_color=True)
            tex = _con_mosaico(arbol, img, TX.MOSAICOS[d['mosaico']][1])
            nm = arbol.nodes.new('ShaderNodeNormalMap')
            nm.inputs['Strength'].default_value = d.get('fuerza', 1.0)
            arbol.links.new(tex.outputs['Color'], nm.inputs['Color'])
            arbol.links.new(nm.outputs['Normal'], p.inputs['Normal'])
        if d.get('es_color'):
            img = imagen_de_archivo(d['mosaico'])
            tex = _con_mosaico(arbol, img, TX.MOSAICOS[d['mosaico']][1])
            arbol.links.new(tex.outputs['Color'], p.inputs['Base Color'])
        if 'atlas' in d:
            tex = _con_atlas(arbol, imagen_de_archivo(d['atlas']))
            arbol.links.new(tex.outputs['Color'], p.inputs['Base Color'])
        if 'pantalla' in d:
            tex = _con_atlas(arbol, imagen_de_archivo(d['pantalla']))
            arbol.links.new(tex.outputs['Color'], p.inputs['Emission Color'])
            p.inputs['Emission Strength'].default_value = 1.15
        if d.get('ao', True) and img_oclusion is not None:
            _con_oclusion(arbol, img_oclusion)
        mats[nombre] = m
    return mats


# -------------------------------------------------------------------------------------- de lote a objeto


def _caras_a_arreglos(caras):
    totales = np.array([len(c) for c in caras], dtype=np.int64)
    lv = np.concatenate([np.asarray(c, dtype=np.int64) for c in caras]) if caras else np.zeros(0, dtype=np.int64)
    inicios = np.concatenate([[0], np.cumsum(totales)[:-1]]) if len(caras) else np.zeros(0, dtype=np.int64)
    lf = np.repeat(np.arange(len(caras)), totales)
    return totales, inicios, lv, lf


def normales_de_caras(V, totales, inicios, lv, lf):
    """Las normales (método de Newell) y las áreas de todas las caras a la vez."""
    nl = len(lv)
    sig = np.arange(nl) + 1
    sig[inicios + totales - 1] = inicios
    p, q = V[lv], V[lv[sig]]
    n = np.stack([(p[:, 1] - q[:, 1]) * (p[:, 2] + q[:, 2]),
                  (p[:, 2] - q[:, 2]) * (p[:, 0] + q[:, 0]),
                  (p[:, 0] - q[:, 0]) * (p[:, 1] + q[:, 1])], axis=-1)
    N = np.zeros((len(totales), 3))
    np.add.at(N, lf, n)
    area = np.linalg.norm(N, axis=1) / 2
    return N / np.maximum(np.linalg.norm(N, axis=1), 1e-12)[:, None], area


def a_blender(v):
    """Del marco de glTF (Y arriba) al de Blender (Z arriba): el giro inverso del que hace el exportador."""
    v = np.asarray(v)
    return np.stack([v[..., 0], -v[..., 2], v[..., 1]], axis=-1)


def acabar(ob, angulo):
    """Suave salvo en las aristas de más de `angulo` grados, y con las normales ponderadas por el área de cada cara."""
    malla = ob.data
    malla.shade_smooth()
    if hasattr(malla, 'set_sharp_from_angle'):
        malla.set_sharp_from_angle(angle=radians(angulo))
    mod = ob.modifiers.new('normales', 'WEIGHTED_NORMAL')
    mod.mode = 'FACE_AREA'
    mod.weight = 50
    mod.keep_sharp = True
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def construir_objeto(lote, mats):
    nombres = sorted({m for _, m in lote.piezas})
    if not nombres:
        return None
    indice = {m: i for i, m in enumerate(nombres)}
    V, caras, cara_mat, uvs, n = [], [], [], [], 0
    for malla, m in lote.piezas:
        V.append(malla.v - lote.pivote)
        caras.extend(tuple(i + n for i in c) for c in malla.f)
        cara_mat.extend([indice[m]] * len(malla.f))
        uvs.append(malla.uv if malla.uv is not None else np.zeros((len(malla.v), 2)))
        n += len(malla.v)
    V = np.concatenate(V)
    UVv = np.concatenate(uvs)
    cara_mat = np.array(cara_mat, dtype=np.int32)
    totales, inicios, lv, lf = _caras_a_arreglos(caras)
    N, area = normales_de_caras(V, totales, inicios, lv, lf)

    malla = bpy.data.meshes.new(lote.nombre)
    malla.from_pydata(a_blender(V).tolist(), [], [list(c) for c in caras])
    malla.update()
    for i, m in enumerate(nombres):
        malla.materials.append(mats[m])
    malla.polygons.foreach_set('material_index', cara_mat)

    # UV 0: lo que el material pide. Las texturas que se repiten, por proyección de caja en metros (por cara, según su
    # normal dominante; el material las escala con KHR_texture_transform). Las del atlas y las pantallas, las que se
    # dieron explícitas. Lo que no lleva textura, cero: un atributo constante casi no pesa.
    modo = np.array([('caja' if ('mosaico' in MATERIALES[m]) else 'explicita' if ('atlas' in MATERIALES[m] or 'pantalla' in MATERIALES[m]) else 'nada')
                     for m in nombres])
    modo_cara = modo[cara_mat]
    eje = np.argmax(np.abs(N), axis=1)
    P = V[lv]
    ea = eje[lf]
    u = np.where(ea == 0, P[:, 2], P[:, 0])
    v = np.where(ea == 1, P[:, 2], P[:, 1])
    uv0 = np.where((modo_cara[lf] == 'caja')[:, None], np.stack([u, v], -1), 0.0)
    uv0 = np.where((modo_cara[lf] == 'explicita')[:, None], UVv[lv], uv0)
    capa0 = malla.uv_layers.new(name='UVMap')
    capa0.data.foreach_set('uv', uv0.astype(np.float32).ravel())
    malla.uv_layers.new(name='UV-oclusion')

    ob = bpy.data.objects.new(lote.nombre, malla)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = a_blender(lote.pivote)
    acabar(ob, lote.suave)
    lote.ob = ob
    lote.V, lote.N, lote.area = V, N, area
    lote.lv, lote.lf, lote.totales, lote.inicios = lv, lf, totales, inicios
    lote.cara_mat, lote.nombres_mat = cara_mat, nombres
    return ob


def armar_la_jerarquia():
    raices = {}
    for nombre in ('estructura', 'equipos', 'colgantes'):
        e = bpy.data.objects.new(nombre, None)
        bpy.context.scene.collection.objects.link(e)
        raices[nombre] = e
    por_nombre = {l.nombre: l for l in LOTES if getattr(l, 'ob', None) is not None}
    for l in LOTES:
        ob = getattr(l, 'ob', None)
        if ob is None:
            continue
        if l.padre is not None:
            padre = por_nombre[l.padre.nombre if isinstance(l.padre, Lote) else l.padre]
            ob.parent = padre.ob
            ob.location = a_blender(l.pivote - padre.pivote)
        else:
            ob.parent = raices[l.grupo]
    return raices


# ============================================================================================ la envolvente
#
# Paredes, piso, techo, zócalos, perfiles, puertas y ventanas. Es `estructura`: todo de una cara y sin espesor hacia
# fuera. Las paredes llevan juntas en V (paneles de 1,2 m, con la última más corta contra el rincón), el techo, una
# cuadrícula de juntas del mismo paso, y el piso, la soldadura de las tiras de vinilo cada 2 m.

ZOCALO_ALTO = 0.139          # hasta dónde sube el zócalo: sobre eso empiezan los paneles
R_COVE = 0.07                # el radio de la media caña
JUNTAS_PANEL = [-3.0, -1.8, -0.6, 0.6, 1.8, 3.0]
JUNTAS_PISO = [-3.0, -1.0, 1.0, 3.0]
ESPESOR_DEL_VANO = 0.14      # lo que se ve de la pared por dentro de una puerta o una ventana


def hacer_contorno(puntos, cerrado, rc=RADIO_DE_ESQUINA):
    """
    El contorno de unas paredes en planta (x, z) con las esquinas redondeadas. Los puntos van en el sentido en que
    la normal hacia dentro es (−dz, dx): el mismo en que `superficie` da la cara con u = dirección y v = +Y. Devuelve
    tramos rectos (ya recortados por las esquinas), los arcos de las esquinas y la polilínea de todo, con su coordenada
    `s` a lo largo del perímetro.
    """
    P = [np.array(p, float) for p in puntos]
    n = len(P)
    nseg = n if cerrado else n - 1
    d = [unitario(P[(i + 1) % n] - P[i]) for i in range(nseg)]
    hay = lambda i: cerrado or 0 < i < n - 1
    segs, arcos, nodos = [], [], []
    s = 0.0
    for i in range(nseg):
        a, b = P[i], P[(i + 1) % n]
        p0 = a + d[i] * (rc if hay(i) else 0.0)
        p1 = b - d[i] * (rc if hay((i + 1) % n) else 0.0)
        largo = float(np.linalg.norm(p1 - p0))
        segs.append(dict(i=i, p0=p0, p1=p1, d=d[i], n=np.array([-d[i][1], d[i][0]]), largo=largo, s0=s, orig=a))
        nodos.append((p0, s))
        s += largo
        nodos.append((p1, s))
        j = (i + 1) % n
        if hay(j) and (cerrado or i + 1 < nseg):
            din, dout = d[i], d[j % nseg]
            nin, nout = np.array([-din[1], din[0]]), np.array([-dout[1], dout[0]])
            centro = P[j] + rc * (nin + nout)
            fin = P[j] + dout * rc
            f0 = math.degrees(math.atan2(p1[1] - centro[1], p1[0] - centro[0]))
            f1 = math.degrees(math.atan2(fin[1] - centro[1], fin[0] - centro[0]))
            delta = ((f1 - f0 + 180) % 360) - 180
            lon = rc * radians(abs(delta))
            arcos.append(dict(centro=centro, f0=f0, delta=delta, rc=rc, s0=s, largo=lon))
            for k in range(1, 7):
                a_k = radians(f0 + delta * k / 6)
                nodos.append((centro + rc * np.array([cos(a_k), sin(a_k)]), s + lon * k / 6))
            s += lon
    limpio = [nodos[0]]
    for p, t in nodos[1:]:
        if t - limpio[-1][1] > 1e-9:
            limpio.append((p, t))
    return dict(segs=segs, arcos=arcos, nodos=limpio, total=s, cerrado=cerrado, rc=rc)


def punto_en(C, s):
    nodos = C['nodos']
    s = min(max(s, 0.0), C['total'])
    for (p, a), (q, b) in zip(nodos[:-1], nodos[1:]):
        if a - 1e-9 <= s <= b + 1e-9:
            t = 0.0 if b - a < 1e-12 else (s - a) / (b - a)
            return p + (q - p) * t
    return nodos[-1][0]


def camino_por_el_contorno(C, s0, s1, y):
    """Los puntos 3D del contorno entre dos coordenadas de perímetro, a la altura y."""
    pts = [punto_en(C, s0)]
    for p, t in C['nodos']:
        if s0 + 1e-9 < t < s1 - 1e-9:
            pts.append(p)
    pts.append(punto_en(C, s1))
    return np.array([(p[0], y, p[1]) for p in pts])


def s_de(C, i_seg, coord):
    """La coordenada de perímetro de un punto de la pared `i_seg` a esa coordenada mundial (x en norte y sur, z en este y oeste)."""
    seg = C['segs'][i_seg]
    e = 0 if abs(seg['d'][0]) > 0.5 else 1
    u = (coord - seg['p0'][e]) * (1 if seg['d'][e] > 0 else -1)
    return seg['s0'] + min(max(u, 0.0), seg['largo'])


def quitar(intervalo, huecos):
    """Un intervalo (a, b) menos unos huecos [(c, d)…]: lo que queda, como lista de intervalos."""
    trozos = [intervalo]
    for c, d in sorted(huecos):
        nuevo = []
        for a, b in trozos:
            if d <= a or c >= b:
                nuevo.append((a, b))
                continue
            if c > a:
                nuevo.append((a, c))
            if d < b:
                nuevo.append((d, b))
        trozos = nuevo
    return [(a, b) for a, b in trozos if b - a > 0.02]


def tira(perfil, camino):
    """
    Una tira abierta (un zócalo, un friso) a lo largo de un contorno. El perfil son puntos (d, hh): `d` hacia
    dentro de la sala desde la pared y `hh` hacia arriba, de abajo arriba. La cara mira hacia dentro.
    """
    P = np.asarray(camino, float)
    Tg = np.gradient(P, axis=0)
    Tg /= np.linalg.norm(Tg, axis=1)[:, None]
    Nn = np.cross(Tg, [0.0, 1.0, 0.0])
    perfil = np.asarray(perfil, float)
    m, k = len(perfil), len(P)
    v = np.concatenate([P + Nn * d + np.array([0.0, 1.0, 0.0]) * hh for d, hh in perfil])
    caras = []
    for i in range(m - 1):
        for j in range(k - 1):
            caras.append((i * k + j, i * k + j + 1, (i + 1) * k + j + 1, (i + 1) * k + j))
    return Malla(v, caras)


def borde_del_vano(seg, hueco, e=ESPESOR_DEL_VANO):
    """Las cuatro caras interiores de una puerta o ventana: jambas, dintel y alféizar. Miran hacia el vano."""
    u0, u1, y0, y1 = hueco
    o = np.array([seg['p0'][0], 0.0, seg['p0'][1]])
    t = np.array([seg['d'][0], 0.0, seg['d'][1]])
    nrm = np.cross(t, [0.0, 1.0, 0.0])

    def Pt(u, y, d):
        return o + t * u + np.array([0.0, y, 0.0]) - nrm * d

    piezas = [
        quad(Pt(u0, y0, 0), Pt(u0, y0, e), Pt(u0, y1, e), Pt(u0, y1, 0)),
        quad(Pt(u1, y0, e), Pt(u1, y0, 0), Pt(u1, y1, 0), Pt(u1, y1, e)),
        quad(Pt(u0, y1, 0), Pt(u0, y1, e), Pt(u1, y1, e), Pt(u1, y1, 0)),
    ]
    if y0 > SUELO + 0.05:
        piezas.append(quad(Pt(u0, y0, e), Pt(u0, y0, 0), Pt(u1, y0, 0), Pt(u1, y0, e)))
    return unir(piezas)


# ------------------------------------------------------------------------------------------------ la sala


def vanos_de_las_paredes():
    """Los huecos de cada pared principal, en coordenadas mundiales (c0, c1, desde, hasta) con alturas desde el piso."""
    D = DISPOSICION
    huecos = {'norte': [], 'este': [], 'sur': [], 'oeste': []}
    for nombre in ('puerta-corrediza', 'puerta-de-paso'):
        d = D[nombre]
        huecos[d['pared']].append((d['centro'] - d['ancho'] / 2, d['centro'] + d['ancho'] / 2, 0.0, d['alto'], nombre))
    d = D['ventana-pasillo']
    huecos[d['pared']].append((d['centro'] - d['ancho'] / 2, d['centro'] + d['ancho'] / 2, d['desde'], d['hasta'], 'ventana-pasillo'))
    d = D['hueco-lavamanos']
    huecos[d['pared']].append((d['centro'] - d['ancho'] / 2, d['centro'] + d['ancho'] / 2, 0.0, d['alto'], 'hueco-lavamanos'))
    return huecos


def construir_la_envolvente():
    D = DISPOSICION
    paredes = Lote('paredes', 'estructura', suave=25.0, densidad=0.55)
    zocalos = Lote('zocalos', 'estructura', suave=30.0, densidad=1.0)
    piso = Lote('piso', 'estructura', suave=25.0, densidad=0.5)
    techo = Lote('techo', 'estructura', suave=25.0, densidad=0.5)
    perfiles = Lote('perfiles', 'estructura', suave=40.0, densidad=1.0)

    # ---------------------------------------------------------------- la sala principal
    sala = hacer_contorno([(-MEDIO, -MEDIO), (MEDIO, -MEDIO), (MEDIO, MEDIO), (-MEDIO, MEDIO)], True)
    nombres = ('norte', 'este', 'sur', 'oeste')
    vanos = vanos_de_las_paredes()
    y0, y1 = SUELO + ZOCALO_ALTO, TECHO
    huecos_al_piso = []        # intervalos de perímetro donde no hay zócalo ni barra
    huecos_a_la_barra = []
    for seg, nombre in zip(sala['segs'], nombres):
        e = 0 if abs(seg['d'][0]) > 0.5 else 1
        sg = 1 if seg['d'][e] > 0 else -1
        o = np.array([seg['p0'][0], 0.0, seg['p0'][1]])
        t = np.array([seg['d'][0], 0.0, seg['d'][1]])
        huecos_u = []
        for c0, c1, desde, hasta, quien in vanos[nombre]:
            ua, ub = sorted(((c0 - seg['p0'][e]) * sg, (c1 - seg['p0'][e]) * sg))
            hueco = (ua, ub, SUELO + max(desde, 0.0), SUELO + hasta)
            huecos_u.append(hueco)
            paredes.add(borde_del_vano(seg, hueco), 'pintura-pared')
            sa, sb = sorted((s_de(sala, seg['i'], c0), s_de(sala, seg['i'], c1)))
            if desde <= 0.98 and hasta >= 0.88:
                huecos_a_la_barra.append((sa, sb))
            if desde <= 0.01:
                huecos_al_piso.append((sa, sb))
        juntas = [(c - seg['p0'][e]) * sg for c in JUNTAS_PANEL]
        paredes.add(superficie(o, t, [0, 1, 0], (0.0, seg['largo']), (y0, y1), huecos_u, juntas_u=juntas), 'pintura-pared')
    for arco in sala['arcos']:
        c = arco['centro']
        a0, a1 = arco['f0'], arco['f0'] + arco['delta']
        paredes.add(faja_curva(c, arco['rc'], a0, a1, y0, y1, 6), 'pintura-pared')

    # El zócalo sanitario: media caña, tramo vertical y un labio arriba que lo separa del panel.
    perfil_zocalo = [(R_COVE + R_COVE * cos(radians(a)), R_COVE + R_COVE * sin(radians(a))) for a in (-90, -112.5, -135, -157.5, -180)]
    perfil_zocalo += [(0.0, 0.125), (0.006, 0.127), (0.006, 0.133), (0.0, ZOCALO_ALTO)]
    for a, b in quitar((0.0, sala['total']), huecos_al_piso):
        zocalos.add(tira(perfil_zocalo, camino_por_el_contorno(sala, a, b, SUELO)), 'pintura-zocalo')

    # La barra de protección a unos 0,9 m: un perfil achatado de 9 × 3,2 cm, con el cuerpo que hace de tope. Se corta
    # donde hay un vano y donde hay un mueble contra la pared (ver `sin-barra` en `DISPOSICION`).
    alto_barra = 0.93
    perfil_barra = rect_perfil(0.09, 0.032, 0.010, 2) + np.array([0.0, 0.016])
    for a, b in quitar((0.0, sala['total']), huecos_a_la_barra + sin_barra(sala)):
        zocalos.add(barrido(perfil_barra, camino_por_el_contorno(sala, a, b, SUELO + alto_barra)), 'pintura-zocalo')

    # ---------------------------------------------------------------- el nicho del lavamanos
    d = D['hueco-lavamanos']
    zc, w, fondo, alto_n = d['centro'], d['ancho'], d['fondo'], d['alto']
    xb = -MEDIO - fondo
    nicho = hacer_contorno([(-MEDIO, zc + w / 2), (xb, zc + w / 2), (xb, zc - w / 2), (-MEDIO, zc - w / 2)], False)
    yn1 = SUELO + alto_n
    for seg in nicho['segs']:
        o = np.array([seg['p0'][0], 0.0, seg['p0'][1]])
        t = np.array([seg['d'][0], 0.0, seg['d'][1]])
        paredes.add(superficie(o, t, [0, 1, 0], (0.0, seg['largo']), (y0, yn1), juntas_u=[seg['largo'] / 2] if seg['largo'] > 1.0 else []), 'pintura-pared')
    for arco in nicho['arcos']:
        paredes.add(faja_curva(arco['centro'], arco['rc'], arco['f0'], arco['f0'] + arco['delta'], y0, yn1, 6), 'pintura-pared')
    # El techo del nicho, más bajo que el de la sala: baja el dintel y deja el espacio de los grifos y la luz.
    paredes.add(superficie([0, yn1, 0], [1, 0, 0], [0, 0, 1], (xb, -MEDIO), (zc - w / 2, zc + w / 2)), 'pintura-techo')
    for a, b in ((0.0, nicho['total']),):
        zocalos.add(tira(perfil_zocalo, camino_por_el_contorno(nicho, a, b, SUELO)), 'pintura-zocalo')
    piso.add(superficie([0, SUELO, 0], [0, 0, 1], [1, 0, 0], (zc - w / 2, zc + w / 2), (xb, -MEDIO)), 'piso-vinilo')

    # ---------------------------------------------------------------- el piso y el techo
    # Piso: las tiras de vinilo van a lo largo de Z, cada 2 m, con su soldadura. u = z, v = x, así que la normal es +Y.
    piso.add(superficie([0, SUELO, 0], [0, 0, 1], [1, 0, 0], (-MEDIO, MEDIO), (-MEDIO, MEDIO), juntas_v=JUNTAS_PISO, ancho=0.008, prof=0.0015), 'piso-vinilo')
    # Techo: cuadrícula de paneles de 1,2 m. u = x, v = z: la normal es −Y, hacia abajo.
    techo.add(superficie([0, TECHO, 0], [1, 0, 0], [0, 0, 1], (-MEDIO, MEDIO), (-MEDIO, MEDIO), juntas_u=JUNTAS_PANEL, juntas_v=JUNTAS_PANEL), 'pintura-techo')
    return dict(sala=sala, nicho=nicho, vanos=vanos, paredes=paredes, zocalos=zocalos, piso=piso, techo=techo, perfiles=perfiles)


def sin_barra(sala):
    """Los tramos de pared donde no va la barra de protección porque hay un mueble contra ella: intervalos de perímetro."""
    tramos = []
    for pared, c0, c1 in DISPOSICION['sin-barra']:
        i = ('norte', 'este', 'sur', 'oeste').index(pared)
        a, b = sorted((s_de(sala, i, c0), s_de(sala, i, c1)))
        tramos.append((a, b))
    return tramos


# ------------------------------------------------------------------------------------------- atlas y color


def rect_del_atlas(nombre):
    return TX.uv_de(nombre)


def con_color(malla, muestra):
    """A una malla de `plastico-estampado` le pone el color liso de una muestra del atlas: un punto de su centro en todos los vértices."""
    u0, v0, u1, v1 = TX.uv_de('m-' + muestra)
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    return Malla(malla.v, malla.f, np.tile([uc, vc], (len(malla.v), 1)))


def colorear(lote, malla, muestra):
    lote.add(con_color(malla, muestra), 'plastico-estampado')


# ============================================================================================ puertas y ventanas


def marco_de_cajas(x0, x1, y0, y1, z0, z1, ancho, r=0.004, seg=1):
    """Un marco rectangular (cuatro barras) alrededor del hueco x0..x1, y0..y1; las barras van por fuera del hueco."""
    return [
        bloque((x0 - ancho, y0 - ancho, z0), (x0, y1 + ancho, z1), r, seg),
        bloque((x1, y0 - ancho, z0), (x1 + ancho, y1 + ancho, z1), r, seg),
        bloque((x0, y0 - ancho, z0), (x1, y0, z1), r, seg),
        bloque((x0, y1, z0), (x1, y1 + ancho, z1), r, seg),
    ]


def hoja_con_ventanilla(L, xa, xb, y0, y1, z0, z1, v, material, r=0.007):
    """Una hoja de puerta con un hueco para la ventanilla: cuatro cajas alrededor (`v` = (x0, x1, y0, y1) del hueco)."""
    vx0, vx1, vy0, vy1 = v
    L.add(bloque((xa, y0, z0), (xb, vy0, z1), r, 1), material)
    L.add(bloque((xa, vy1, z0), (xb, y1, z1), r, 1), material)
    L.add(bloque((xa, vy0, z0), (vx0, vy1, z1), r, 1), material)
    L.add(bloque((vx1, vy0, z0), (xb, vy1, z1), r, 1), material)


def construir_la_puerta_corrediza():
    """
    La doble puerta corrediza hermética: dos hojas delante de la pared, que se cruzan unos centímetros sobre el hueco; con
    el cajón del riel arriba, el umbral de acero abajo, un burlete negro en el encuentro, las manillas y una ventanilla en
    cada hoja. Son hojas llenas con un hueco para el vidrio, y no una hoja con un vidrio pegado: por la ventanilla se tiene
    que ver el pasillo.
    """
    d = DISPOSICION['puerta-corrediza']
    L = Lote('puerta-corrediza', 'estructura', suave=40.0)
    W, A = d['ancho'], d['alto']
    with L.en(sobre_la_pared(d['pared'], d['centro'], 0.0)):
        z0, z1 = 0.014, 0.058
        for lado in (-1, 1):
            xa, xb = sorted((lado * 0.004, lado * (W / 2 + 0.045)))
            vx = sorted((lado * 0.20, lado * 0.70))
            hoja_con_ventanilla(L, xa, xb, 0.018, A + 0.025, z0, z1, (vx[0], vx[1], 0.95, 1.92), 'pintura-puerta')
            # El marco de la ventanilla, de acero, y su vidrio.
            for m in marco_de_cajas(vx[0], vx[1], 0.95, 1.92, z0 - 0.002, z1 + 0.006, 0.014, 0.003, 1):
                L.add(m, 'acero-pulido')
            L.add(lamina((sum(vx) / 2, 1.435, 0.036), (1, 0, 0), (0, 1, 0), vx[1] - vx[0], 0.97), 'vidrio-claro')
            L.add(lamina((sum(vx) / 2, 1.435, 0.036), (-1, 0, 0), (0, 1, 0), vx[1] - vx[0], 0.97), 'vidrio-claro')
            # El zócalo de acero de la hoja, contra los golpes de las ruedas.
            L.add(bloque((xa + 0.03, 0.03, z1), (xb - 0.03, 0.33, z1 + 0.0028), 0.001, 1), 'acero-cepillado')
            # La manilla: un tirador vertical de acero sobre dos postes, junto al encuentro.
            xm = lado * 0.10
            L.add(cilindro_entre((xm, 0.95, z1 + 0.04), (xm, 1.35, z1 + 0.04), 0.0125, 14), 'acero-pulido')
            for ym in (0.97, 1.33):
                L.add(cilindro_entre((xm, ym, z1), (xm, ym, z1 + 0.04), 0.008, 10), 'acero-pulido')
        # El burlete del encuentro y los de los cantos exteriores.
        L.add(bloque((-0.006, 0.018, z0 - 0.002), (0.006, A + 0.025, z1 + 0.002), 0.002, 1), 'goma-negra')
        # El cajón del riel: la cubierta que esconde el mecanismo, que se corre dos metros más a cada lado.
        L.add(bloque((-(W + 0.20), A + 0.025, 0.0), (W + 0.20, A + 0.26, 0.108), 0.022, 2), 'pintura-puerta')
        L.add(bloque((-0.11, A + 0.205, 0.105), (0.11, A + 0.245, 0.118), 0.006, 1), 'plastico-negro')      # el sensor de radar
        # El umbral: una chapa de acero con la guía del piso.
        L.add(bloque((-(W / 2 + 0.12), 0.0, -0.08), (W / 2 + 0.12, 0.009, 0.075), 0.004, 1), 'acero-cepillado')
    return L


def construir_la_puerta_de_paso():
    """Una puerta de una hoja con su marco de acero, su ventanilla, la placa de empuje, el tirador, las bisagras y el cierrapuertas."""
    d = DISPOSICION['puerta-de-paso']
    L = Lote('puerta-de-paso', 'estructura', suave=40.0)
    W, A = d['ancho'], d['alto']
    with L.en(sobre_la_pared(d['pared'], d['centro'], 0.0)):
        z0, z1 = 0.008, 0.046
        xa, xb = -W / 2 + 0.003, W / 2 - 0.003
        hoja_con_ventanilla(L, xa, xb, 0.018, A - 0.012, z0, z1, (-0.16, 0.16, 1.28, 1.86), 'pintura-puerta')
        for m in marco_de_cajas(-0.16, 0.16, 1.28, 1.86, z0 - 0.002, z1 + 0.006, 0.016, 0.003, 1):
            L.add(m, 'acero-pulido')
        L.add(lamina((0.0, 1.57, 0.026), (1, 0, 0), (0, 1, 0), 0.32, 0.58), 'vidrio-claro')
        L.add(lamina((0.0, 1.57, 0.026), (-1, 0, 0), (0, 1, 0), 0.32, 0.58), 'vidrio-claro')
        # El marco: dos jambas y un dintel de acero cepillado, de 6 cm, que sobresalen tres centímetros de la pared.
        L.add(bloque((-W / 2 - 0.06, 0.0, -0.07), (-W / 2, A + 0.06, 0.032), 0.004, 1), 'acero-cepillado')
        L.add(bloque((W / 2, 0.0, -0.07), (W / 2 + 0.06, A + 0.06, 0.032), 0.004, 1), 'acero-cepillado')
        L.add(bloque((-W / 2, A, -0.07), (W / 2, A + 0.06, 0.032), 0.004, 1), 'acero-cepillado')
        L.add(bloque((xa + 0.03, 0.03, z1), (xb - 0.03, 0.31, z1 + 0.0028), 0.001, 1), 'acero-cepillado')       # zócalo de la hoja
        L.add(bloque((0.19, 0.95, z1), (0.37, 1.35, z1 + 0.003), 0.002, 1), 'acero-cepillado')                    # placa de empuje
        # El tirador de palanca, con su placa.
        L.add(bloque((0.405, 0.92, z1), (0.445, 1.12, z1 + 0.006), 0.004, 1), 'acero-pulido')
        L.add(cilindro_entre((0.425, 1.04, z1 + 0.006), (0.425, 1.04, z1 + 0.04), 0.009, 12), 'acero-pulido')
        L.add(cilindro_entre((0.425, 1.04, z1 + 0.04), (0.30, 1.04, z1 + 0.04), 0.0095, 12), 'acero-pulido')
        # Tres bisagras de pivote en la jamba izquierda.
        for yb in (0.25, 1.05, 1.85):
            L.add(cilindro_entre((-W / 2 + 0.004, yb - 0.055, 0.03), (-W / 2 + 0.004, yb + 0.055, 0.03), 0.0115, 12), 'acero-pulido')
        # El cierrapuertas: la caja y su brazo.
        L.add(bloque((-0.36, A - 0.115, z1), (-0.06, A - 0.055, z1 + 0.05), 0.006, 1), 'plastico-gris')
        L.add(barra((-0.06, A - 0.085, z1 + 0.04), (0.14, A + 0.02, z1 + 0.02), rect_perfil(0.012, 0.008, 0.002, 1)), 'acero-cepillado')
    return L


def construir_la_ventana():
    """El vano con ventana de vidrio hacia el pasillo: marco de acero cepillado, un montante central, dos vidrios y el alféizar."""
    d = DISPOSICION['ventana-pasillo']
    L = Lote('ventana-pasillo', 'estructura', suave=40.0)
    W = d['ancho']
    y0, y1 = d['desde'], d['hasta']
    with L.en(sobre_la_pared(d['pared'], d['centro'], 0.0)):
        for m in marco_de_cajas(-W / 2, W / 2, y0, y1, -0.07, 0.034, 0.05, 0.005, 1):
            L.add(m, 'acero-cepillado')
        L.add(bloque((-0.025, y0, -0.07), (0.025, y1, 0.034), 0.004, 1), 'acero-cepillado')
        for cx in (-W / 4 - 0.0125, W / 4 + 0.0125):
            ancho_v = W / 2 - 0.0125 * 2
            L.add(lamina((cx, (y0 + y1) / 2, -0.03), (1, 0, 0), (0, 1, 0), ancho_v, y1 - y0), 'vidrio-claro')
            L.add(lamina((cx, (y0 + y1) / 2, -0.03), (-1, 0, 0), (0, 1, 0), ancho_v, y1 - y0), 'vidrio-claro')
        # El alféizar interior, una repisa de 20 cm.
        L.add(bloque((-W / 2 - 0.07, y0 - 0.045, -0.02), (W / 2 + 0.07, y0 - 0.005, 0.21), 0.008, 1), 'pintura-mueble')
    return L


def construir_el_pasillo():
    """
    Lo que se ve por las ventanillas y el vidrio: un trozo de pasillo detrás de cada vano. Sin esto, por la ventana se ve
    el vacío. Son caras que miran hacia la sala, así que desde fuera no se ven: el simulador mira el interior a través
    de las paredes, y un pasillo con su cara de espaldas no lo estorba.
    """
    L = Lote('pasillo', 'estructura', suave=30.0, densidad=0.35)
    D = DISPOSICION
    cuartos = [('puerta-corrediza', 2.2, 1.9, 2.6), ('puerta-de-paso', 1.6, 1.4, 2.6), ('ventana-pasillo', 2.4, 2.2, 2.7)]
    for nombre, ancho_m, fondo, alto in cuartos:
        d = D[nombre]
        with L.en(sobre_la_pared(d['pared'], d['centro'], 0.0)):
            L.add(lamina((0, alto / 2, -fondo), (1, 0, 0), (0, 1, 0), 2 * ancho_m, alto), 'pintura-pared')                           # el fondo
            L.add(lamina((0, 0.0, -fondo / 2 - 0.05), (0, 0, 1), (1, 0, 0), fondo + 0.1, 2 * ancho_m), 'piso-vinilo')                 # el piso
            L.add(lamina((0, alto, -fondo / 2 - 0.05), (1, 0, 0), (0, 0, 1), 2 * ancho_m, fondo + 0.1), 'pintura-techo')               # el techo
            L.add(lamina((-ancho_m, alto / 2, -fondo / 2 - 0.05), (0, 0, -1), (0, 1, 0), fondo + 0.1, alto), 'pintura-pared')           # un costado
            L.add(lamina((ancho_m, alto / 2, -fondo / 2 - 0.05), (0, 0, 1), (0, 1, 0), fondo + 0.1, alto), 'pintura-pared')            # el otro
    return L


def construir_los_perfiles(env):
    """Guardacantos en las jambas del nicho y un remate de 45° donde el techo se encuentra con las paredes."""
    L = env['perfiles']
    sala = env['sala']
    # El remate: una tira que baja del techo hacia dentro, por todo el contorno, con las esquinas.
    L.add(tira([(0.0, -0.05), (0.05, 0.0)], camino_por_el_contorno(sala, 0.0, sala['total'], TECHO)), 'pintura-techo')
    d = DISPOSICION['hueco-lavamanos']
    with L.en(sobre_la_pared(d['pared'], d['centro'], 0.0)):
        for lado in (-1, 1):
            x = lado * d['ancho'] / 2
            L.add(bloque((x - 0.012 - 0.018, 0.2, -0.006), (x + 0.012 + 0.018 * 0, 1.9, 0.020), 0.004, 1), 'acero-pulido')
    # Guardacantos de PVC en las jambas del vano de la ventana y de la puerta de paso: se reponen cada tanto, así que son un material propio.
    return L
# ====================================================================================== la zona libre y la planta
#
# Dos cosas que leen de `DISPOSICION` y no dibujan nada: la comprobación de que ningún mueble invade el sitio donde se mueven
# la arsenalera y su mesa, y los datos de la foto de planta (dónde está cada cosa, con su número y su leyenda).

ZONA_LIBRE = dict(x=2.0, z0=-1.3, z1=2.6, radio=2.6)
# El equipo de anestesia sí puede estar dentro de la zona libre, pero solo en la cabecera y a esta distancia del centro.
ANESTESIA_DESDE_EL_CENTRO = 1.4
# Cuánto se pueden pisar dos huellas antes de que cuente como un choque: una holgura de dibujo, no de obra.
TOLERANCIA_DE_CHOQUE = 0.02


def medir_las_huellas():
    """
    Lo que ocupa de verdad cada pieza del piso (las que llevan `giro` en `DISPOSICION`), medido de su geometría en el marco de la
    pieza: el rectángulo más ajustado, alineado con su frente, y sus cuatro esquinas ya en la sala. Medirlo y no escribirlo en una
    tabla es lo que impide que la zona libre se compruebe contra una huella que ya no es la de la pieza.
    """
    por_nombre = {l.nombre: l for l in LOTES}
    huellas = {}
    for nombre, d in DISPOSICION.items():
        if not (isinstance(d, dict) and 'giro' in d):
            continue
        lote = por_nombre.get(nombre)
        assert lote is not None and lote.piezas, f'DISPOSICION tiene {nombre} y no hay lote con ese nombre'
        v = np.concatenate([m.v for m, _ in lote.piezas])
        c, s = cos(radians(d['giro'])), sin(radians(d['giro']))
        X, Z = v[:, 0] - d['x'], v[:, 2] - d['z']
        px, pz = X * c - Z * s, X * s + Z * c
        x0, x1, z0, z1 = float(px.min()), float(px.max()), float(pz.min()), float(pz.max())
        esquinas = [(d['x'] + a * c + b * s, d['z'] - a * s + b * c) for a, b in ((x0, z0), (x1, z0), (x1, z1), (x0, z1))]
        huellas[nombre] = dict(poligono=esquinas, ancho=x1 - x0, fondo=z1 - z0)
    return huellas


def _distancia_punto_segmento(p, a, b):
    ax, az, bx, bz, px, pz = a[0], a[1], b[0], b[1], p[0], p[1]
    dx, dz = bx - ax, bz - az
    t = 0.0 if dx == dz == 0 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)))
    return hypot(px - (ax + t * dx), pz - (az + t * dz))


def _dentro(p, poligono):
    """Punto dentro de un polígono convexo, sea cual sea el sentido en que vienen sus esquinas."""
    signos = []
    for k in range(len(poligono)):
        a, b = poligono[k], poligono[(k + 1) % len(poligono)]
        signos.append((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]))
    return all(v >= 0 for v in signos) or all(v <= 0 for v in signos)


def distancia_al_poligono(p, poligono):
    """Cero si el punto está dentro; si no, lo que le falta para tocarlo."""
    if _dentro(p, poligono):
        return 0.0
    return min(_distancia_punto_segmento(p, poligono[k], poligono[(k + 1) % len(poligono)]) for k in range(len(poligono)))


def _penetracion(a, b):
    """
    Cuánto se meten dos polígonos convexos uno en el otro (el eje de separación de menor solape), o un número negativo si hay
    hueco entre ellos. Es el teorema del eje de separación; con huellas rectangulares y pocas piezas sobra.
    """
    mejor = float('inf')
    for poligono in (a, b):
        for k in range(len(poligono)):
            p, q = poligono[k], poligono[(k + 1) % len(poligono)]
            n = (q[1] - p[1], p[0] - q[0])
            largo = hypot(*n)
            if largo == 0:
                continue
            n = (n[0] / largo, n[1] / largo)
            ya = [v[0] * n[0] + v[1] * n[1] for v in a]
            yb = [v[0] * n[0] + v[1] * n[1] for v in b]
            mejor = min(mejor, min(max(ya), max(yb)) - max(min(ya), min(yb)))
    return mejor


def comprobar_zonas():
    """
    La zona libre es un contrato con el simulador: la arsenalera y su mesa se mueven por ahí, y un mueble que la invada se
    les mete dentro. Falla en voz alta (no avisa) si una pieza del piso invade la zona, se sale de la sala o pisa a otra,
    para que reordenar `DISPOSICION` no pueda dejar un pabellón que se vea bien y no se pueda usar. Devuelve las huellas
    medidas, que la foto de planta dibuja.
    """
    zona = [(-ZONA_LIBRE['x'], ZONA_LIBRE['z0']), (ZONA_LIBRE['x'], ZONA_LIBRE['z0']), (ZONA_LIBRE['x'], ZONA_LIBRE['z1']), (-ZONA_LIBRE['x'], ZONA_LIBRE['z1'])]
    fallos = []
    huellas = medir_las_huellas()
    for nombre, h in huellas.items():
        pts = h['poligono']
        print(f'  HUELLA {nombre:26s} {h["ancho"]:.2f} x {h["fondo"]:.2f} m, x {min(p[0] for p in pts):+.2f}…{max(p[0] for p in pts):+.2f}, z {min(p[1] for p in pts):+.2f}…{max(p[1] for p in pts):+.2f}', flush=True)
        # Medio centímetro de tolerancia: lo que va contra la pared llega a ella, no la atraviesa.
        if any(abs(x) > MEDIO + 0.005 or abs(z) > MEDIO + 0.005 for x, z in pts):
            fallos.append(f'{nombre} se sale de la sala')
        if nombre in SIN_ESPESOR:
            continue
        lejos = distancia_al_poligono((0.0, 0.0), pts)
        if nombre in EQUIPO_DE_ANESTESIA:
            if any(z > ZONA_LIBRE['z0'] + 1e-6 for _, z in pts) or lejos < ANESTESIA_DESDE_EL_CENTRO:
                fallos.append(f'{nombre} (anestesia) debe quedar en z < {ZONA_LIBRE["z0"]} y a {ANESTESIA_DESDE_EL_CENTRO} m del centro; está a {lejos:.2f} m')
            continue
        if _penetracion(pts, zona) > 1e-6:
            fallos.append(f'{nombre} entra en la zona libre')
        if lejos < ZONA_LIBRE['radio']:
            fallos.append(f'{nombre} queda a {lejos:.2f} m del centro (menos de {ZONA_LIBRE["radio"]} m)')
    nombres = list(huellas)
    for i, a in enumerate(nombres):
        for b in nombres[i + 1:]:
            hondo = _penetracion(huellas[a]['poligono'], huellas[b]['poligono'])
            if hondo > TOLERANCIA_DE_CHOQUE:
                fallos.append(f'{a} y {b} se pisan ({hondo * 100:.0f} cm)')
    if fallos:
        raise SystemExit('DISPOSICION no cumple la zona libre:\n  ' + '\n  '.join(fallos))
    print(f'ZONAS ok: {len(huellas)} piezas del piso fuera de la zona libre y sin pisarse', flush=True)
    return huellas


# --------------------------------------------------------------------------------------------- la foto de planta

# Cómo se llama cada cosa en la leyenda de la planta (con sus tildes, que las claves de `DISPOSICION` no llevan), y en qué
# grupo va. El orden de los grupos es el de la leyenda.
GRUPOS_DE_LA_PLANTA = [
    ('vanos', 'Vanos en las paredes', '#d6336c'),
    ('anestesia', 'Cabecera: anestesia', '#f08c00'),
    ('norte', 'Pared norte (cabecera)', '#1c7ed6'),
    ('este', 'Pared este (derecha)', '#2f9e44'),
    ('oeste', 'Pared oeste (izquierda)', '#7048e8'),
    ('sur', 'Pared sur (pies)', '#c2410c'),
    ('colgantes', 'Cuelga del techo', '#0c8599'),
]

NOMBRES_DE_LA_PLANTA = {
    'puerta-corrediza': 'Puerta corrediza', 'puerta-de-paso': 'Puerta de paso', 'ventana-pasillo': 'Ventana al pasillo',
    'hueco-lavamanos': 'Nicho del lavamanos', 'maquina-anestesia': 'Máquina de anestesia', 'carro-anestesia': 'Carro de anestesia',
    'banco-anestesista': 'Banco del anestesista', 'poste-suero': 'Poste de suero', 'columna-gases': 'Columna de gases',
    'estantes-noroeste': 'Estantes noroeste', 'armarios-norte': 'Armarios del norte', 'torre-insumos': 'Torre de insumos',
    'repisas-norte': 'Repisas del norte', 'pizarra-conteo': 'Pizarra de conteo', 'unidad-electroquirurgica': 'Electrobisturí',
    'aspirador': 'Aspirador', 'mostrador-pacs': 'Mostrador del PACS', 'monitor-pacs': 'Monitor del PACS', 'arco-en-c': 'Arco en C',
    'estantes-oeste': 'Estantes oeste', 'gabinete-calentamiento': 'Gabinete de calentamiento', 'taburete-cirujano': 'Taburete del cirujano',
    'cubo-patada': 'Cubo de patada', 'lavamanos': 'Lavamanos quirúrgico', 'tapete-antifatiga': 'Tapete antifatiga',
    'perchero-plomo': 'Perchero de plomo', 'carro-instrumental': 'Carro de instrumental', 'cubo-rojo': 'Cubo de residuos rojo',
    'cubo-negro': 'Cubo de residuos negro', 'dispensador-gel': 'Dispensador de gel', 'extintor': 'Extintor',
    'panel-control': 'Panel de control', 'reloj-pared': 'Reloj de pared', 'desague': 'Desagüe',
    'cialitica-1': 'Cialítica 1', 'cialitica-2': 'Cialítica 2', 'boom-monitores': 'Boom de monitores', 'plenum': 'Plénum de flujo laminar',
}


def _grupo_de(nombre):
    d = DISPOSICION[nombre]
    if 'ancho' in d and 'pared' in d:
        return 'vanos'
    if nombre in EQUIPO_DE_ANESTESIA or nombre == 'columna-gases':
        return 'anestesia'
    if nombre in ('cialitica-1', 'cialitica-2', 'boom-monitores', 'plenum'):
        return 'colgantes'
    if 'pared' in d:
        return d['pared']
    x, z = d['x'], d['z']
    por_pared = {'norte': z + MEDIO, 'sur': MEDIO - z, 'oeste': x + MEDIO, 'este': MEDIO - x}
    return min(por_pared, key=por_pared.get)


def datos_de_la_planta(huellas):
    """
    Todo lo que la foto de planta tiene que dibujar encima de la vista cenital, en metros de la sala y ya numerado. `texturas_sala.py
    --planta` lo pinta con Pillow: aquí solo se decide qué y dónde, que es lo que lee de `DISPOSICION`.
    """
    por_grupo = {g: [] for g, _, _ in GRUPOS_DE_LA_PLANTA}
    for nombre in DISPOSICION:
        if nombre in NOMBRES_DE_LA_PLANTA:
            por_grupo[_grupo_de(nombre)].append(nombre)
    piezas, n = [], 0
    for grupo, titulo, color in GRUPOS_DE_LA_PLANTA:
        for nombre in sorted(por_grupo[grupo], key=lambda k: (DISPOSICION[k].get('x', DISPOSICION[k].get('centro', 0.0)), k)):
            n += 1
            d = DISPOSICION[nombre]
            pieza = dict(numero=n, nombre=nombre, texto=NOMBRES_DE_LA_PLANTA[nombre], grupo=grupo, color=color)
            if nombre in huellas:
                pieza.update(clase='piso', poligono=huellas[nombre]['poligono'], x=d['x'], z=d['z'], giro=d.get('giro', 0.0),
                             dato=f'x {d["x"]:.2f}  z {d["z"]:.2f}  giro {d.get("giro", 0.0):.0f}°'.replace('.', ','))
            elif nombre == 'desague':
                pieza.update(clase='punto', x=d['x'], z=d['z'], dato=f'x {d["x"]:.2f}  z {d["z"]:.2f}'.replace('.', ','))
            elif nombre in ('cialitica-1', 'cialitica-2'):
                (az1, l1), (az2, l2) = d['brazo1'], d['brazo2']
                a1, a2 = radians(az1), radians(az2)
                codo = (d['x'] + l1 * cos(a1), d['z'] + l1 * sin(a1))
                cabeza = (codo[0] + l2 * cos(a2), codo[1] + l2 * sin(a2))
                pieza.update(clase='cialitica', ancla=(d['x'], d['z']), codo=codo, x=cabeza[0], z=cabeza[1], radio=0.37,
                             dato=f'ancla x {d["x"]:.2f}  z {d["z"]:.2f}'.replace('.', ','))
            elif nombre == 'boom-monitores':
                az, largo = d['brazo']
                fin = (d['x'] + largo * cos(radians(az)), d['z'] + largo * sin(radians(az)))
                pieza.update(clase='boom', ancla=(d['x'], d['z']), x=fin[0], z=fin[1],
                             dato=f'ancla x {d["x"]:.2f}  z {d["z"]:.2f}'.replace('.', ','))
            elif nombre == 'plenum':
                pieza.update(clase='plenum', x=d['x'], z=d['z'], ancho=d['ancho'], largo=d['largo'], dato=f'{d["ancho"]:.1f} × {d["largo"]:.1f} m'.replace('.', ','))
            else:
                f = _PARED[d['pared']][0](d['centro'])
                pieza.update(clase='pared', pared=d['pared'], x=f[0], z=f[2], centro=d['centro'], ancho=d.get('ancho', 0.0),
                             dato=(f'centro {d["centro"]:.2f}  ' + (f'altura {d["altura"]:.2f}' if 'altura' in d else f'ancho {d.get("ancho", 0):.1f}')).replace('.', ','))
            piezas.append(pieza)
    techo = []
    for (x, z, w, l) in DISPOSICION['luminarias-techo']:
        techo.append(dict(clase='luminaria', x=x, z=z, ancho=w, largo=l))
    for (x, z, w, l) in DISPOSICION['rejillas-techo']:
        techo.append(dict(clase='rejilla', x=x, z=z, ancho=w, largo=l))
    for (x, z) in DISPOSICION['detectores-techo']:
        techo.append(dict(clase='detector', x=x, z=z, ancho=0.14, largo=0.14))
    retornos = []
    for pared, centro, _alto in DISPOSICION['rejillas-retorno']:
        f = _PARED[pared][0](centro)
        retornos.append(dict(pared=pared, x=f[0], z=f[2], centro=centro))
    return dict(medio=MEDIO, zona_libre=ZONA_LIBRE, grupos=[dict(id=g, titulo=t, color=c) for g, t, c in GRUPOS_DE_LA_PLANTA],
                piezas=piezas, techo=techo, retornos=retornos, camilla=dict(ancho=0.84, largo=1.96))
# ============================================================================================ que miren hacia fuera
#
# Una pieza cerrada cuyas caras miran hacia adentro se ve al revés: con una cara por lado (que es lo que carga el simulador)
# se dibuja su interior, y en Cycles sale negra. Pasó con los perfiles de `revolucion` escritos de arriba abajo en vez de
# «de abajo-dentro a arriba-dentro por fuera», que es el orden que espera: no da ningún error ni se nota en una foto
# lejana. Lo vigila `comprobar_las_caras()`, por el volumen con signo de cada pieza cerrada.


def _triangulos(m):
    tri = []
    for f in m.f:
        for k in range(1, len(f) - 1):
            tri.append((f[0], f[k], f[k + 1]))
    return np.asarray(tri, dtype=np.int64).reshape(-1, 3)


def volumen_con_signo(m):
    """El volumen de una malla cerrada por la divergencia: positivo si sus caras miran hacia fuera, negativo si miran hacia adentro."""
    t = _triangulos(m)
    a, b, c = m.v[t[:, 0]], m.v[t[:, 1]], m.v[t[:, 2]]
    return float(np.einsum('ij,ij->i', a, np.cross(b, c)).sum() / 6.0)


def es_cerrada(m):
    """Cada arista, recorrida en un sentido por una cara y en el contrario por la de al lado: una superficie cerrada y orientada."""
    t = _triangulos(m)
    if not len(t):
        return False
    n = len(m.v)
    ida = np.concatenate([t[:, 0] * n + t[:, 1], t[:, 1] * n + t[:, 2], t[:, 2] * n + t[:, 0]])
    vuelta = np.concatenate([t[:, 1] * n + t[:, 0], t[:, 2] * n + t[:, 1], t[:, 0] * n + t[:, 2]])
    return bool(np.array_equal(np.sort(ida), np.sort(vuelta)))


def comprobar_las_caras():
    """Falla si alguna pieza cerrada de algún lote tiene las caras hacia adentro. Devuelve cuántas pudo comprobar."""
    del_reves, vistas = [], 0
    for lote in LOTES:
        for k, (m, material) in enumerate(lote.piezas):
            if not es_cerrada(m):
                continue
            vistas += 1
            vol = volumen_con_signo(m)
            if vol < -1e-12:
                c = m.v.mean(axis=0)
                del_reves.append(f'{lote.nombre} pieza {k} ({material}) en ({c[0]:+.2f}, {c[1]:+.2f}, {c[2]:+.2f}), volumen {vol:.2e}')
    if del_reves:
        raise SystemExit(f'{len(del_reves)} piezas cerradas con las caras hacia adentro:\n  ' + '\n  '.join(del_reves[:40]))
    print(f'CARAS ok: {vistas} piezas cerradas, todas con las caras hacia fuera', flush=True)
    return vistas


# ============================================================================================ ayudas de equipo
#
# Lo que se repite en casi todos los equipos: ruedas, tornillos, rótulos, pantallas, mangueras. Cada pieza se hace en su
# marco (origen en el piso, frente a +Z) y la pone su constructor con `with L.en(sobre_el_piso(...))`.

# Para cada cara de una caja: los ejes (u, v) de un rótulo pegado en ella y su normal (u × v = normal).
_CARAS = {
    '+z': ((1, 0, 0), (0, 1, 0), (0, 0, 1)), '-z': ((-1, 0, 0), (0, 1, 0), (0, 0, -1)),
    '+x': ((0, 0, -1), (0, 1, 0), (1, 0, 0)), '-x': ((0, 0, 1), (0, 1, 0), (-1, 0, 0)),
    '+y': ((1, 0, 0), (0, 0, -1), (0, 1, 0)), '-y': ((1, 0, 0), (0, 0, 1), (0, -1, 0)),
}
_GIRO_DE_CARA = {'+z': 0.0, '+x': 90.0, '-z': 180.0, '-x': -90.0}

# El grueso de un rótulo sobre su superficie: un milímetro y medio se pierde en la cuantización de la posición, y dos
# milímetros no se ven de canto pero tampoco se pelean con el fondo.
SALTO = 0.002


def rotulo(L, nombre, c, w, hh, cara='+z', salto=SALTO):
    """Una imagen del atlas (un cartel, una etiqueta, una caja de insumos) pegada sobre una superficie, de w × hh, centrada en c."""
    eu, ev, n = _CARAS[cara]
    L.add(lamina(np.asarray(c, float) + np.asarray(n, float) * salto, eu, ev, w, hh, TX.uv_de(nombre)), 'plastico-estampado')


def disco_con_imagen(L, nombre, c, r, cara='+z', n=28, salto=SALTO):
    """Una imagen cuadrada del atlas recortada en círculo: un manómetro, un reloj."""
    eu, ev, nrm = (np.asarray(a, float) for a in _CARAS[cara])
    ang = np.arange(n) * 2 * pi / n
    pts = [np.asarray(c, float) + nrm * salto + r * (cos(a) * eu + sin(a) * ev) for a in ang]
    u0, v0, u1, v1 = TX.uv_de(nombre)
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    uv = [(uc + cos(a) * (u1 - u0) / 2, vc + sin(a) * (v1 - v0) / 2) for a in ang]
    L.add(Malla(pts, [tuple(range(n))], uv), 'plastico-estampado')


def colorear(L, malla, muestra):
    """Una pieza de plástico de un color liso del atlas (`MUESTRAS`): así todo el plástico de color es un solo material."""
    u0, v0, u1, v1 = TX.uv_de('m-' + muestra)
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    L.add(Malla(malla.v, malla.f, np.tile([uc, vc], (len(malla.v), 1))), 'plastico-estampado')


def caja_de_insumos(L, c, t, tipo, resto='blanco', cara='+z'):
    """Una caja de cartón de insumos con su rótulo (del atlas) en la cara que se ve y el resto blanco."""
    L.add(caja_impresa(c, t, {cara: TX.uv_de(tipo)}, resto=TX.uv_de('m-' + resto)), 'plastico-estampado')


def tornillos(L, puntos, cara='+z', r=0.0038, alto=0.0024, material='acero-pulido'):
    """Cabezas de tornillo a la vista: lo que dice «esto está atornillado» sin tener que modelar el tornillo."""
    eu, ev, n = (np.asarray(a, float) for a in _CARAS[cara])
    for p in puntos:
        p = np.asarray(p, float)
        L.add(cilindro_entre(p, p + n * alto, r, 6), material)


def rueda(L, x, z, r=0.05, ancho=0.028, giro=0.0, freno=False):
    """Una ruedecilla de carro: el neumático, el buje, la horquilla de acero y, si lleva freno, la palanca roja."""
    with L.en(T(x, 0.0, z), Ry(giro)):
        L.add(cilindro(r, ancho, 14).t(mm(T(-ancho / 2, r, 0), Rz(-90))), 'goma-negra')
        L.add(cilindro(r * 0.55, ancho + 0.010, 10).t(mm(T(-(ancho + 0.010) / 2, r, 0), Rz(-90))), 'plastico-gris')
        for s in (-1, 1):
            xs = s * (ancho / 2 + 0.006)
            L.add(bloque((xs - 0.0022, r - 0.012, -0.018), (xs + 0.0022, r * 2 + 0.018, 0.018)), 'acero-cepillado')
        L.add(bloque((-ancho / 2 - 0.0085, r * 2 + 0.014, -0.024), (ancho / 2 + 0.0085, r * 2 + 0.026, 0.024)), 'acero-cepillado')
        if freno:
            colorear(L, bloque((ancho / 2 + 0.008, r * 1.6, -0.012), (ancho / 2 + 0.030, r * 1.6 + 0.010, 0.018)), 'rojo')


def cuatro_ruedas(L, hx, hz, r=0.05, ancho=0.028):
    for sx in (-1, 1):
        for sz in (-1, 1):
            rueda(L, sx * hx, sz * hz, r, ancho, giro=(sz * 14.0 + sx * 6.0), freno=(sz < 0))


def estrella(L, radio, y_patas, alto_patas, patas=5, r_rueda=0.03, color_pata='acero-cepillado'):
    """La base de cinco brazos de un taburete o un poste de suero: cada brazo es una barra que sube un poco hacia el centro."""
    for k in range(patas):
        a = radians(90 + 360.0 * k / patas)
        p1 = (radio * cos(a), y_patas, radio * sin(a))
        L.add(barra((0.0, y_patas + alto_patas, 0.0), p1, rect_perfil(0.040, 0.022, 0.006, 1)), color_pata)
        rueda(L, p1[0], p1[2], r_rueda, 0.020, giro=degrees_de(a) + 30)


def degrees_de(a):
    return a * 180.0 / pi


def manguera(L, pts, r=0.011, material='plastico-blanco', lados=8, corrugada=True, paso=0.012):
    """Un tubo flexible por una poligonal. Corrugada: el radio sube y baja cada `paso`, que es lo que la hace leer como manguera de circuito."""
    pts = np.asarray(pts, float)
    largo = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    radios = None
    if corrugada:
        radios = 1.0 + 0.16 * np.where(np.sin(largo / paso * 2 * pi) > 0, 1.0, -1.0)
    L.add(tubo(pts, r, lados, True, radios), material)


def cable(L, pts, r=0.0045, material='goma-negra', lados=5):
    L.add(tubo(np.asarray(pts, float), r, lados, True), material)


def monitor(L, hijo, material, c, w, hh, cara='+z', uv=(0.0, 0.0, 1.0, 1.0), inclinar=0.0, borde=0.014, fondo=0.04,
            carcasa='plastico-negro', retoque=0.008):
    """
    Un monitor: la carcasa va en el lote del equipo y el panel emisivo en su propio lote (`hijo`, un nodo `pantalla-*`), para
    poder cambiar su imagen sin tocar nada más. `c` es el centro de la cara del panel; `cara` hacia dónde mira; `inclinar`, grados
    alrededor de la horizontal (positivo: mira hacia abajo).
    """
    m = mm(T(*c), Ry(_GIRO_DE_CARA[cara]), Rx(inclinar))
    base = L._pila[-1] @ m
    with L.en(m):
        L.add(bloque((-w / 2 - borde, -hh / 2 - borde, -fondo), (w / 2 + borde, hh / 2 + borde, 0.0), retoque, 2), carcasa)
    with hijo.en(base):
        hijo.add(lamina((0.0, 0.0, 0.0016), (1, 0, 0), (0, 1, 0), w, hh, uv), material)


def pantalla_sola(L, hijo, material, c, w, hh, cara='+z', uv=(0.0, 0.0, 1.0, 1.0), borde=0.008, fondo=0.012):
    """Un visor pequeño metido en una carcasa más grande: un marco bajo y el panel."""
    monitor(L, hijo, material, c, w, hh, cara, uv, 0.0, borde, fondo, 'plastico-negro', 0.003)


def esquinas_de(a, b, nivel=None):
    (x0, y0, z0), (x1, y1, z1) = a, b
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


def asa_vertical(L, x, y0, y1, z, sobresale=0.035, r=0.0105, material='acero-pulido'):
    """Un tirador vertical de acero sobre dos postes."""
    L.add(cilindro_entre((x, y0, z + sobresale), (x, y1, z + sobresale), r, 12), material)
    for y in (y0 + 0.012, y1 - 0.012):
        L.add(cilindro_entre((x, y, z), (x, y, z + sobresale), r * 0.7, 8), material)


def asa_horizontal(L, y, x0, x1, z, sobresale=0.03, r=0.0095, material='acero-pulido'):
    L.add(cilindro_entre((x0, y, z + sobresale), (x1, y, z + sobresale), r, 12), material)
    for x in (x0 + 0.012, x1 - 0.012):
        L.add(cilindro_entre((x, y, z), (x, y, z + sobresale), r * 0.7, 8), material)


# ================================================================================================ la cabecera
#
# El equipo de anestesia: la máquina con su ventilador, el carro de cajones, el banco y el poste de suero, más la columna
# de gases de la pared. Es lo único que hay en el piso dentro de la zona libre, y está en la cabecera, a más de 1,4 m del
# colchón.


def construir_la_maquina_de_anestesia():
    d = DISPOSICION['maquina-anestesia']
    L = Lote('maquina-anestesia', 'equipos', suave=35.0)
    p_sig = Lote('pantalla-signos', 'equipos', padre=L)
    p_ven = Lote('pantalla-ventilador', 'equipos', padre=L)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        cuatro_ruedas(L, 0.235, 0.285, 0.055)
        L.add(bloque((-0.30, 0.115, -0.34), (0.30, 0.19, 0.325), 0.014, 2), 'plastico-gris')          # el chasis
        # El gabinete: tres cajones con su rótulo y su tirador, y un hueco para el equipo de succión arriba.
        L.add(bloque((-0.29, 0.19, -0.33), (0.29, 1.0, 0.285), 0.03, 3), 'pintura-equipo')
        for (y0, y1), tipo in zip(((0.23, 0.41), (0.43, 0.61), (0.63, 0.81)), ('cajon-via-aerea', 'cajon-farmacos', 'cajon-otros')):
            L.add(bloque((-0.255, y0, 0.28), (0.255, y1, 0.298), 0.008, 1), 'pintura-mueble')
            asa_horizontal(L, y1 - 0.045, -0.09, 0.09, 0.298, 0.03)
            rotulo(L, tipo, (-0.15, y0 + 0.045, 0.298), 0.17, 0.045)
        L.add(bloque((-0.255, 0.83, 0.28), (0.255, 0.97, 0.292), 0.006, 1), 'plastico-gris')            # la rejilla de ventilación
        for k in range(7):
            L.add(bloque((-0.23, 0.845 + k * 0.017, 0.2915), (0.23, 0.853 + k * 0.017, 0.2945)), 'plastico-negro')
        # La mesa de trabajo, con un labio al frente.
        L.add(bloque((-0.315, 1.0, -0.36), (0.315, 1.022, 0.36), 0.01, 2), 'acero-cepillado')
        L.add(bloque((-0.30, 1.022, 0.345), (0.30, 1.036, 0.36), 0.005, 1), 'acero-cepillado')
        # La torre trasera, con el ventilador y el rótulo del fabricante.
        L.add(bloque((-0.29, 1.022, -0.335), (0.29, 1.66, -0.09), 0.035, 3), 'pintura-equipo')
        L.add(bloque((-0.315, 1.66, -0.355), (0.315, 1.725, -0.03), 0.02, 2), 'pintura-equipo')
        rotulo(L, 'logo-anestesia', (0.0, 1.693, -0.0305), 0.24, 0.06, '+z')
        monitor(L, p_ven, 'pantalla-ventilador', (-0.07, 1.30, -0.062), 0.255, 0.17, '+z', borde=0.016, fondo=0.04)
        # Los flujómetros: tres tubos de vidrio con su bolita y su perilla.
        L.add(bloque((0.115, 1.17, -0.075), (0.275, 1.45, -0.055), 0.006, 1), 'plastico-negro')
        for k, col in enumerate(('verde', 'azul', 'blanco')):
            x = 0.145 + k * 0.05
            L.add(cilindro(0.0075, 0.2, 8, base=1.215).t(T(x, 0.0, -0.0555)), 'plastico-transparente')
            colorear(L, esfera(0.0062, 8).t(T(x, 1.27 + 0.045 * k, -0.0555)), col)
            L.add(cilindro(0.013, 0.02, 10).t(mm(T(x, 1.19, -0.055), Rx(90))), 'acero-pulido')
        # Los vaporizadores en su riel: sevoflurano, isoflurano, desflurano.
        for x, col in ((-0.215, 'amarillo'), (-0.085, 'violeta'), (0.045, 'azul')):
            colorear(L, bloque((x - 0.052, 1.036, -0.085), (x + 0.052, 1.19, 0.045), 0.012, 2), col)
            L.add(cilindro(0.036, 0.022, 14, base=1.19).t(T(x, 0.0, -0.02)), 'plastico-negro')
            L.add(bloque((x - 0.006, 1.2, -0.02), (x + 0.006, 1.212, 0.034), 0.002, 1), 'acero-pulido')
        # El canister de cal sodada: un cilindro transparente con la cal violeta adentro y las tapas de acero.
        L.add(cilindro(0.066, 0.21, 20, base=1.04).t(T(0.17, 0.0, 0.055)), 'plastico-transparente')
        colorear(L, cilindro(0.058, 0.185, 16, base=1.05).t(T(0.17, 0.0, 0.055)), 'violeta')
        L.add(cilindro(0.072, 0.02, 18, base=1.25).t(T(0.17, 0.0, 0.055)), 'acero-cepillado')
        L.add(cilindro(0.072, 0.012, 18, base=1.03).t(T(0.17, 0.0, 0.055)), 'acero-cepillado')
        # El circuito: dos mangueras corrugadas desde los puertos hasta el codo de la bolsa-reservorio, que cuelga de un brazo
        # atornillado al costado del gabinete. Antes la bolsa quedaba suelta en el aire, sin nada que la sostuviera.
        L.add(cilindro_entre((-0.285, 0.93, 0.12), (-0.46, 0.93, 0.12), 0.011, 10), 'acero-pulido')
        L.add(cilindro(0.0125, 0.03, 10, base=0.90).t(T(-0.46, 0.0, 0.12)), 'plastico-gris')
        L.add(esfera(0.085, 14).t(mm(T(-0.46, 0.79, 0.12), Es(0.75, 1.2, 0.75))), 'goma-negra')
        for dz, mat in ((0.0, 'plastico-blanco'), (0.034, 'plastico-gris')):
            p0 = np.array([-0.12 - dz * 0.4, 1.065, 0.08 + dz])
            p1 = np.array([-0.46, 0.945, 0.088 + dz * 1.8])
            ruta = bezier(p0, p0 + (-0.14, 0.04, 0.10), p1 + (0.10, 0.16, 0.0), p1, 30)
            manguera(L, ruta, 0.0105, mat)
        # El brazo del monitor de signos vitales, sobre la torre.
        L.add(cilindro(0.016, 0.16, 12, base=1.725).t(T(0.0, 0.0, -0.16)), 'acero-pulido')
        L.add(bloque((-0.03, 1.875, -0.2), (0.03, 1.93, -0.1), 0.01, 1), 'plastico-gris')
        monitor(L, p_sig, 'pantalla-signos', (0.0, 2.045, -0.062), 0.40, 0.25, '+z', inclinar=6.0, borde=0.016, fondo=0.05)
        # El tirador de empujar, atrás, y el cable de red enrollado en su soporte.
        L.add(cilindro_entre((-0.26, 0.9, -0.36), (0.26, 0.9, -0.36), 0.013, 12), 'acero-pulido')
        for x in (-0.26, 0.26):
            L.add(cilindro_entre((x, 0.9, -0.33), (x, 0.9, -0.36), 0.01, 8), 'acero-pulido')
        L.add(tubo(espiral((0.0, 0.5, -0.345), 0.05, 0.012, 3.5, (0, 0, -1)), 0.0055, 5), 'goma-negra')
        tornillos(L, [(-0.25, 0.25, 0.298), (0.25, 0.25, 0.298), (-0.25, 0.75, 0.298), (0.25, 0.75, 0.298)])
    return L


def construir_el_carro_de_anestesia():
    d = DISPOSICION['carro-anestesia']
    L = Lote('carro-anestesia', 'equipos', suave=35.0)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        cuatro_ruedas(L, 0.235, 0.17, 0.045)
        L.add(bloque((-0.285, 0.10, -0.225), (0.285, 0.14, 0.225), 0.01, 2), 'plastico-gris')
        L.add(bloque((-0.28, 0.14, -0.22), (0.28, 0.90, 0.22), 0.012, 2), 'pintura-mueble')
        for k, tipo in enumerate(('cajon-via-aerea', 'cajon-farmacos', 'cajon-vias', 'cajon-otros')):
            y0 = 0.165 + k * 0.18
            L.add(bloque((-0.255, y0, 0.215), (0.255, y0 + 0.165, 0.232), 0.006, 1), 'pintura-puerta')
            asa_horizontal(L, y0 + 0.125, -0.07, 0.07, 0.232, 0.026)
            rotulo(L, tipo, (-0.145, y0 + 0.05, 0.232), 0.16, 0.04)
        L.add(bloque((-0.30, 0.90, -0.24), (0.30, 0.925, 0.24), 0.008, 2), 'acero-cepillado')
        for lado in ((-0.30, -0.285), (0.285, 0.30)):          # los bordes elevados de la tapa
            L.add(bloque((lado[0], 0.925, -0.24), (lado[1], 0.94, 0.24), 0.003, 1), 'acero-cepillado')
        L.add(bloque((-0.285, 0.925, -0.24), (0.285, 0.94, -0.225), 0.003, 1), 'acero-cepillado')
        # Sobre la tapa: cajas de jeringas y de guantes, una bandeja con ampollas y el laringoscopio.
        caja_de_insumos(L, (-0.17, 0.985, -0.08), (0.20, 0.12, 0.13), 'caja-jeringas')
        caja_de_insumos(L, (0.07, 0.975, -0.12), (0.20, 0.10, 0.12), 'caja-guantes')
        L.add(bloque((0.01, 0.94, 0.02), (0.27, 0.955, 0.19), 0.004, 1), 'acero-pulido')
        for k in range(7):
            colorear(L, cilindro(0.0065, 0.05, 8).t(mm(T(0.045 + k * 0.032, 0.9615, 0.08), Rx(90))), 'celeste' if k % 2 else 'blanco')
        L.add(bloque((-0.27, 0.94, 0.06), (-0.10, 0.962, 0.15), 0.008, 2), 'plastico-negro')
        L.add(cilindro_entre((-0.26, 0.951, 0.105), (-0.12, 0.951, 0.105), 0.012, 10), 'acero-pulido')
        # El contenedor rojo de cortopunzantes colgado del costado, y el riel de acero que lo sostiene.
        colorear(L, bloque((0.30, 0.56, -0.06), (0.37, 0.72, 0.08), 0.01, 2), 'rojo')
        rotulo(L, 'letrero-biologico', (0.37, 0.64, 0.01), 0.07, 0.07, '+x')
        L.add(cilindro_entre((0.30, 0.78, -0.10), (0.30, 0.78, 0.12), 0.007, 8), 'acero-pulido')
        L.add(cilindro_entre((0.30, 0.50, -0.10), (0.30, 0.50, 0.12), 0.007, 8), 'acero-pulido')
        # El tirador de empuje, atrás.
        L.add(cilindro_entre((-0.24, 0.86, -0.27), (0.24, 0.86, -0.27), 0.011, 12), 'acero-pulido')
        for x in (-0.24, 0.24):
            L.add(cilindro_entre((x, 0.86, -0.22), (x, 0.86, -0.27), 0.009, 8), 'acero-pulido')
    return L


def construir_el_banco_del_anestesista():
    d = DISPOSICION['banco-anestesista']
    L = Lote('banco-anestesista', 'equipos', suave=35.0)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        estrella(L, 0.27, 0.075, 0.03, 5, 0.032)
        L.add(cilindro(0.032, 0.09, 12, base=0.10), 'acero-pulido')
        L.add(cilindro(0.023, 0.30, 12, base=0.16), 'acero-pulido')
        L.add(revolucion([(0.0, 0.46), (0.05, 0.46), (0.05, 0.50), (0.03, 0.50), (0.0, 0.50)], 12), 'plastico-negro')
        L.add(revolucion([(0.0, 0.50), (0.18, 0.50), (0.188, 0.515), (0.185, 0.545), (0.16, 0.56), (0.0, 0.56)], 24), 'tela-azul')
        L.add(revolucion([(0.0, 0.485), (0.17, 0.485), (0.18, 0.50), (0.0, 0.50)], 24), 'plastico-negro')
        # El respaldo bajo, a un costado, sobre un poste curvo.
        L.add(tubo(bezier((0.0, 0.52, -0.16), (0.0, 0.62, -0.2), (0.0, 0.70, -0.2), (0.0, 0.76, -0.17), 10), 0.011, 8), 'acero-pulido')
        L.add(bloque((-0.14, 0.74, -0.215), (0.14, 0.84, -0.165), 0.02, 2), 'tela-azul')
    return L


def construir_el_poste_de_suero():
    d = DISPOSICION['poste-suero']
    L = Lote('poste-suero', 'equipos', suave=35.0)
    p_bomba = Lote('pantalla-bomba', 'equipos', padre=L)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        estrella(L, 0.30, 0.07, 0.025, 5, 0.03)
        L.add(cilindro(0.016, 1.1, 12, base=0.09), 'acero-cepillado')
        L.add(cilindro(0.021, 0.10, 12, base=0.95), 'plastico-negro')
        L.add(cilindro(0.0115, 1.05, 12, base=1.05), 'acero-cepillado')
        # El cabezal con cuatro ganchos.
        L.add(cilindro(0.026, 0.045, 12, base=2.07), 'plastico-gris')
        for k in range(4):
            a = radians(45 + 90 * k)
            p1 = (0.19 * cos(a), 2.115, 0.19 * sin(a))
            L.add(barra((0.0, 2.095, 0.0), p1, rect_perfil(0.014, 0.010, 0.002, 1)), 'acero-pulido')
            L.add(tubo(bezier(p1, (p1[0], p1[1] - 0.04, p1[2]), (p1[0] * 1.07, p1[1] - 0.045, p1[2] * 1.07), (p1[0] * 1.07, p1[1] - 0.0, p1[2] * 1.07), 6), 0.0035, 5), 'acero-pulido')
        # Dos bolsas colgadas, con su línea que baja por la cámara de goteo hasta la bomba.
        for k, (tipo, a) in enumerate((('bolsa-suero', 45), ('bolsa-ringer', 135))):
            a = radians(a)
            cx, cz = 0.19 * 1.07 * cos(a), 0.19 * 1.07 * sin(a)
            with L.en(T(cx, 1.88, cz), Ry(degrees_de(a) + 90)):
                L.add(caja_impresa((0, 0, 0), (0.135, 0.215, 0.028), {'+z': TX.uv_de(tipo), '-z': TX.uv_de(tipo)}, resto=TX.uv_de('m-celeste')), 'plastico-estampado')
                L.add(bloque((-0.02, -0.125, -0.012), (0.02, -0.105, 0.012), 0.004, 1), 'plastico-blanco')
            colorear(L, bloque((cx - 0.012, 1.99, cz - 0.012), (cx + 0.012, 2.01, cz + 0.012), 0.004, 1), 'blanco')
        for a in (45, 135):
            a = radians(a)
            cx, cz = 0.19 * 1.07 * cos(a), 0.19 * 1.07 * sin(a)
            cable(L, cuelga((cx, 1.755, cz), (0.05, 1.56, 0.04), 0.05, 12), 0.0028, 'plastico-transparente', 5)
        L.add(cilindro(0.013, 0.07, 10, base=1.50).t(T(0.05, 0.0, 0.04)), 'plastico-transparente')
        # La bomba de infusión, abrazada al poste.
        L.add(bloque((-0.095, 1.05, 0.02), (0.095, 1.25, 0.15), 0.014, 2), 'pintura-equipo')
        L.add(bloque((-0.022, 1.05, -0.0), (0.022, 1.25, 0.03), 0.006, 1), 'plastico-gris')
        pantalla_sola(L, p_bomba, 'pantalla-menores', (0.0, 1.18, 0.1515), 0.15, 0.075, uv=(0.0, 0.0, 0.5, 0.5), borde=0.006, fondo=0.01)
        for k in range(3):
            colorear(L, bloque((-0.075 + k * 0.052, 1.07, 0.1505), (-0.045 + k * 0.052, 1.095, 0.1545), 0.003, 1), ('verde', 'amarillo', 'rojo')[k])
        cable(L, cuelga((0.05, 1.50, 0.04), (0.0, 1.25, 0.1), 0.04, 8), 0.0028, 'plastico-transparente', 5)
        # La línea que va al paciente queda recogida y con su tapón colgando junto al poste: una línea tendida hasta la camilla
        # entraría en la zona libre, que no admite nada que arrastre desde el piso hacia el centro.
        cable(L, cuelga((0.0, 1.05, 0.12), (0.05, 0.80, 0.30), 0.10, 14), 0.0028, 'plastico-transparente', 5)
        L.add(cilindro(0.008, 0.03, 8, base=0.77).t(T(0.05, 0.0, 0.30)), 'plastico-blanco')
    return L


def construir_la_columna_de_gases():
    d = DISPOSICION['columna-gases']
    L = Lote('columna-gases', 'equipos', suave=35.0)
    with L.en(sobre_la_pared(d['pared'], d['centro'], d['altura'])):
        L.add(bloque((-0.14, -0.50, 0.0), (0.14, 0.50, 0.075), 0.02, 2), 'pintura-equipo')
        L.add(bloque((-0.115, -0.47, 0.075), (0.115, 0.47, 0.082), 0.01, 1), 'plastico-gris')
        # Tres tomas, cada una con su anillo de color, su etiqueta y su manómetro.
        for k, (gas, etiqueta, color) in enumerate((('o2', 'etiq-o2', 'blanco'), ('aire', 'etiq-aire', 'negro'), ('vac', 'etiq-vac', 'amarillo'))):
            y = 0.31 - k * 0.27
            colorear(L, cilindro(0.032, 0.012, 16).t(mm(T(-0.05, y, 0.082), Rx(90), T(0, 0, 0))), color)
            L.add(cilindro(0.021, 0.026, 14).t(mm(T(-0.05, y, 0.094), Rx(90))), 'acero-pulido')
            L.add(cilindro(0.010, 0.012, 10).t(mm(T(-0.05, y, 0.12), Rx(90))), 'plastico-negro')
            rotulo(L, etiqueta, (-0.05, y - 0.056, 0.082), 0.06, 0.03)
            L.add(cilindro(0.037, 0.026, 18).t(mm(T(0.065, y + 0.015, 0.082), Rx(90))), 'acero-pulido')
            disco_con_imagen(L, ('manometro-o2', 'manometro-aire', 'manometro-vac')[k], (0.065, y + 0.015, 0.1087), 0.0335, '+z', 24, 0.0)
            L.add(cilindro(0.0345, 0.0016, 18).t(mm(T(0.065, y + 0.015, 0.1103), Rx(90))), 'vidrio-claro')
        L.add(bloque((-0.10, 0.425, 0.082), (0.10, 0.455, 0.094), 0.005, 1), 'plastico-negro')
        colorear(L, bloque((-0.085, 0.43, 0.094), (-0.06, 0.45, 0.0962), 0.002, 1), 'verde')
        tornillos(L, [(-0.12, 0.47, 0.082), (0.12, 0.47, 0.082), (-0.12, -0.47, 0.082), (0.12, -0.47, 0.082)])
    return L


# ============================================================================================ almacenaje
#
# Estantes de acero, armarios empotrados con puertas de vidrio, la torre de insumos, las repisas de pared, el gabinete de
# calentamiento de líquidos, el carro de instrumental y el mostrador del PACS. Casi todo lo que se ve adentro son cajas de
# insumos del atlas, que son una sola imagen para toda la sala.

TIPOS_DE_CAJA = ['caja-gasas', 'caja-sutura', 'caja-guantes', 'caja-jeringas', 'caja-mascarillas', 'caja-campo', 'caja-via', 'caja-compresas']


def llenar_de_cajas(L, x0, x1, y, z_frente, fondo, alto_max, rng, ancho=(0.14, 0.24), huecos=0.15):
    """
    Una hilera de cajas de insumos sobre un entrepaño, de x0 a x1, con el frente alineado a `z_frente` y un hueco ocasional. Las
    cajas son de tamaños algo distintos y alguna va apilada sobre otra: un estante que se ve sin repetirse.
    """
    x = x0 + 0.02
    while x < x1 - ancho[0]:
        w = float(rng.uniform(*ancho))
        w = min(w, x1 - 0.01 - x)
        if w < ancho[0] * 0.8:
            break
        p = float(rng.uniform(0.17, 0.27))
        p = min(p, fondo - 0.04)
        h = min(float(rng.uniform(0.09, 0.15)), alto_max)
        if rng.random() < huecos:
            x += w * 0.6
            continue
        tipo = TIPOS_DE_CAJA[int(rng.integers(len(TIPOS_DE_CAJA)))]
        cz = z_frente - p / 2 - 0.005
        caja_de_insumos(L, (x + w / 2, y + h / 2, cz), (w, h, p), tipo)
        if alto_max - h > 0.10 and rng.random() < 0.35:
            h2 = min(float(rng.uniform(0.08, 0.12)), alto_max - h)
            caja_de_insumos(L, (x + w / 2, y + h + h2 / 2, cz), (w * 0.92, h2, p * 0.9), TIPOS_DE_CAJA[int(rng.integers(len(TIPOS_DE_CAJA)))])
        x += w + float(rng.uniform(0.008, 0.03))


def bultos_azules(L, x0, x1, y, z0, z1, rng, alto=0.12):
    """Paquetes de instrumental esterilizado: bultos de tela azul, de bordes redondos, uno sobre otro."""
    x = x0
    while x < x1 - 0.12:
        w = float(rng.uniform(0.16, 0.24))
        w = min(w, x1 - x)
        h = float(rng.uniform(alto * 0.8, alto * 1.1))
        L.add(bloque((x, y, z0), (x + w, y + h, z1), 0.022, 2), 'tela-azul')
        if rng.random() < 0.4:
            L.add(bloque((x + 0.01, y + h, z0 + 0.015), (x + w - 0.01, y + h + 0.08, z1 - 0.015), 0.02, 2), 'tela-azul')
        x += w + 0.012


def estante_de_acero(L, ancho, fondo, alto, niveles, semilla, con_bultos=2):
    """
    Un estante de acero: cuatro montantes con regatón de goma, entrepaños perforados con su canto frontal y las cajas
    de insumos de cada nivel. Los entrepaños son `acero-perforado`: la chapa agujereada es una textura y no agujeros.
    """
    rng = np.random.default_rng(SEMILLA + semilla)
    hx, hz = ancho / 2, fondo / 2
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * (hx - 0.018), sz * (hz - 0.018)
            L.add(barra((x, 0.03, z), (x, alto, z), rect_perfil(0.036, 0.036, 0.005, 1)), 'acero-cepillado')
            L.add(cilindro(0.017, 0.03, 8).t(T(x, 0.0, z)), 'goma-negra')
    for y in niveles:
        L.add(bloque((-hx, y, -hz), (hx, y + 0.02, hz), 0.004, 1), 'acero-perforado')
        L.add(bloque((-hx, y - 0.028, hz - 0.012), (hx, y + 0.02, hz), 0.003, 1), 'acero-cepillado')
        L.add(bloque((-hx, y - 0.028, -hz), (hx, y + 0.02, -hz + 0.012), 0.003, 1), 'acero-cepillado')
    limites = list(niveles[1:]) + [alto + 0.05]
    for k, (y, sup) in enumerate(zip(niveles, limites)):
        libre = sup - (y + 0.02) - 0.05
        if libre < 0.08:
            continue
        if k < len(niveles) - 1 and k % 3 == con_bultos % 3:
            bultos_azules(L, -hx + 0.03, hx - 0.03, y + 0.02, -hz + 0.08, hz - 0.03, rng, min(libre, 0.14))
        else:
            llenar_de_cajas(L, -hx + 0.02, hx - 0.02, y + 0.02, hz - 0.02, fondo, min(libre, 0.3), rng)
    tornillos(L, [(sx * (hx - 0.018), alto - 0.01, hz - 0.0) for sx in (-1, 1)], '+z')


def puerta_de_vidrio(L, x0, x1, y0, y1, z, marco=0.022, perfil=0.012, material_marco='acero-pulido'):
    """Una puerta de armario: el marco de aluminio de cuatro barras y el vidrio, una lámina por cada cara."""
    for caja_ in marco_de_cajas(x0 + marco, x1 - marco, y0 + marco, y1 - marco, z - perfil / 2, z + perfil / 2, marco, 0.003, 1):
        L.add(caja_, material_marco)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    for s in (-1, 1):
        L.add(lamina((cx, cy, z), (s, 0, 0), (0, 1, 0), x1 - x0 - 2 * marco, y1 - y0 - 2 * marco), 'vidrio-claro')


def hueco_de_armario(L, x0, x1, y0, y1, z_atras, z_frente, grosor=0.018, entrepanos=(), material='pintura-mueble'):
    """El casco de un armario abierto por delante: fondo, tapa, base, costados y entrepaños. Por dentro se ve lo que guarda."""
    L.add(bloque((x0, y0, z_atras), (x1, y1, z_atras + 0.012), 0.002, 1), material)
    L.add(bloque((x0, y1 - grosor, z_atras), (x1, y1, z_frente), 0.004, 1), material)
    L.add(bloque((x0, y0, z_atras), (x1, y0 + grosor, z_frente), 0.004, 1), material)
    L.add(bloque((x0, y0, z_atras), (x0 + grosor, y1, z_frente), 0.004, 1), material)
    L.add(bloque((x1 - grosor, y0, z_atras), (x1, y1, z_frente), 0.004, 1), material)
    for y in entrepanos:
        L.add(bloque((x0 + grosor, y, z_atras), (x1 - grosor, y + 0.016, z_frente - 0.02), 0.002, 1), material)


def construir_los_estantes(nombre, ancho, fondo, alto, niveles, semilla, con_bultos=2):
    d = DISPOSICION[nombre]
    L = Lote(nombre, 'equipos', suave=35.0)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        estante_de_acero(L, ancho, fondo, alto, niveles, semilla, con_bultos)
    return L


def construir_los_armarios_del_norte():
    d = DISPOSICION['armarios-norte']
    L = Lote('armarios-norte', 'equipos', suave=35.0)
    rng = np.random.default_rng(SEMILLA + 31)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        L.add(bloque((-0.88, 0.0, -0.28), (0.88, 0.10, 0.22)), 'pintura-zocalo')
        L.add(bloque((-0.9, 0.10, -0.30), (0.9, 0.88, 0.28), 0.01, 2), 'pintura-mueble')
        for i in range(4):
            x0 = -0.9 + i * 0.45
            L.add(bloque((x0 + 0.003, 0.115, 0.28), (x0 + 0.447, 0.865, 0.298), 0.006, 1), 'pintura-puerta')
            asa_vertical(L, x0 + (0.405 if i % 2 == 0 else 0.045), 0.62, 0.78, 0.298, 0.03)
            if i in (0, 3):
                rotulo(L, 'etiqueta-armario', (x0 + 0.225, 0.78, 0.298), 0.16, 0.047)
        L.add(bloque((-0.91, 0.88, -0.30), (0.91, 0.906, 0.31), 0.006, 2), 'acero-cepillado')
        L.add(bloque((-0.91, 0.906, -0.30), (0.91, 1.0, -0.285), 0.004, 1), 'acero-cepillado')
        # Sobre la mesada: una bandeja con insumos y una caja de guantes.
        caja_de_insumos(L, (-0.62, 0.965, -0.12), (0.22, 0.12, 0.14), 'caja-guantes')
        caja_de_insumos(L, (-0.36, 0.955, -0.12), (0.20, 0.10, 0.14), 'caja-mascarillas')
        L.add(bloque((0.35, 0.906, -0.22), (0.80, 0.918, 0.12), 0.006, 1), 'acero-pulido')
        for k in range(5):
            L.add(cilindro_entre((0.40 + k * 0.08, 0.92, -0.17), (0.40 + k * 0.08, 0.92, 0.05), 0.007, 8), 'acero-pulido')
        # Los armarios altos, con puertas de vidrio y las cajas que se ven detrás.
        hueco_de_armario(L, -0.9, 0.9, 1.45, 2.30, -0.30, 0.04, 0.018, (1.88,))
        for fila, (y, tope) in enumerate(((1.468, 1.88), (1.896, 2.28))):
            llenar_de_cajas(L, -0.88, 0.88, y, 0.015, 0.34, tope - y - 0.03, rng, huecos=0.1)
        for i in range(4):
            x0 = -0.9 + i * 0.45
            puerta_de_vidrio(L, x0 + 0.002, x0 + 0.448, 1.46, 2.29, 0.042)
            asa_vertical(L, x0 + (0.40 if i % 2 == 0 else 0.05), 1.70, 1.95, 0.048, 0.02, 0.008)
    return L


def construir_la_torre_de_insumos():
    d = DISPOSICION['torre-insumos']
    L = Lote('torre-insumos', 'equipos', suave=35.0)
    rng = np.random.default_rng(SEMILLA + 41)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        L.add(bloque((-0.26, 0.0, -0.28), (0.26, 0.09, 0.22)), 'pintura-zocalo')
        L.add(bloque((-0.275, 0.09, -0.30), (0.275, 1.00, 0.28), 0.012, 2), 'pintura-equipo')
        for k, y0 in enumerate((0.11, 0.33, 0.55, 0.77)):
            L.add(bloque((-0.25, y0, 0.28), (0.25, y0 + 0.205, 0.298), 0.006, 1), 'pintura-puerta')
            asa_horizontal(L, y0 + 0.15, -0.07, 0.07, 0.298, 0.028)
            if k == 3:
                rotulo(L, 'etiqueta-armario', (-0.11, y0 + 0.05, 0.298), 0.15, 0.044)
        hueco_de_armario(L, -0.275, 0.275, 1.0, 1.95, -0.30, 0.15, 0.018, (1.32, 1.64), 'pintura-equipo')
        for (y, tope) in ((1.018, 1.32), (1.336, 1.64), (1.656, 1.93)):
            llenar_de_cajas(L, -0.25, 0.25, y, 0.145, 0.45, tope - y - 0.03, rng, ancho=(0.15, 0.22), huecos=0.05)
        puerta_de_vidrio(L, -0.272, 0.272, 1.0, 1.94, 0.152)
        asa_vertical(L, 0.21, 1.30, 1.55, 0.155, 0.02, 0.008)
        L.add(bloque((-0.285, 1.95, -0.31), (0.285, 1.97, 0.29), 0.006, 1), 'pintura-equipo')
    return L


def construir_las_repisas_del_norte():
    d = DISPOSICION['repisas-norte']
    L = Lote('repisas-norte', 'equipos', suave=35.0)
    rng = np.random.default_rng(SEMILLA + 51)
    with L.en(sobre_la_pared(d['pared'], d['centro'], d['altura'])):
        for y in (-0.28, 0.28):
            L.add(bloque((-0.62, y, 0.0), (0.62, y + 0.022, 0.30), 0.004, 1), 'acero-cepillado')
            L.add(bloque((-0.62, y + 0.022, 0.285), (0.62, y + 0.05, 0.30), 0.003, 1), 'acero-cepillado')
            for x in (-0.5, 0.0, 0.5):
                L.add(bloque((x - 0.012, y - 0.14, 0.0), (x + 0.012, y, 0.015), 0.002, 1), 'acero-pulido')
                L.add(barra((x, y, 0.29), (x, y - 0.14, 0.012), rect_perfil(0.022, 0.012, 0.002, 1)), 'acero-pulido')
        llenar_de_cajas(L, -0.60, 0.0, 0.302, 0.295, 0.30, 0.24, rng, ancho=(0.14, 0.20), huecos=0.0)
        bultos_azules(L, 0.04, 0.60, 0.302, 0.03, 0.27, rng, 0.14)
        llenar_de_cajas(L, -0.60, -0.05, -0.258, 0.295, 0.30, 0.24, rng, ancho=(0.14, 0.20), huecos=0.0)
        # Una caja de laringoscopio y un tensiómetro portátil sobre la repisa de abajo.
        L.add(bloque((0.08, -0.258, 0.06), (0.42, -0.14, 0.26), 0.014, 2), 'plastico-negro')
        L.add(bloque((0.20, -0.14, 0.14), (0.30, -0.128, 0.18), 0.004, 1), 'acero-pulido')
        colorear(L, bloque((0.46, -0.258, 0.08), (0.56, -0.20, 0.24), 0.01, 2), 'azul')
    return L


def construir_el_gabinete_de_calentamiento():
    d = DISPOSICION['gabinete-calentamiento']
    L = Lote('gabinete-calentamiento', 'equipos', suave=35.0)
    p_cal = Lote('pantalla-calentador', 'equipos', padre=L)
    rng = np.random.default_rng(SEMILLA + 61)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        L.add(bloque((-0.28, 0.0, -0.29), (0.28, 0.08, 0.24)), 'pintura-zocalo')
        L.add(bloque((-0.30, 0.08, -0.31), (0.30, 0.82, 0.31), 0.012, 2), 'acero-cepillado')
        L.add(bloque((-0.285, 0.10, 0.31), (0.285, 0.80, 0.326), 0.006, 1), 'pintura-puerta')
        asa_vertical(L, 0.23, 0.38, 0.62, 0.326, 0.03)
        hueco_de_armario(L, -0.30, 0.30, 0.82, 1.62, -0.31, 0.31, 0.02, (1.12, 1.40), 'acero-cepillado')
        for k, y in enumerate((0.84, 1.14, 1.42)):
            for j in range(3):
                tipo = ('bolsa-suero', 'bolsa-ringer', 'bolsa-glucosa')[(j + k) % 3]
                for pila in range(2):
                    x = -0.19 + j * 0.19
                    L.add(caja_impresa((x, y + 0.115, 0.05 - pila * 0.1), (0.14, 0.215, 0.07), {'+z': TX.uv_de(tipo)}, resto=TX.uv_de('m-celeste')), 'plastico-estampado')
        puerta_de_vidrio(L, -0.295, 0.295, 0.82, 1.62, 0.313)
        asa_vertical(L, 0.24, 1.0, 1.3, 0.318, 0.03)
        L.add(bloque((-0.30, 1.62, -0.31), (0.30, 1.86, 0.31), 0.012, 2), 'pintura-equipo')
        pantalla_sola(L, p_cal, 'pantalla-menores', (-0.07, 1.74, 0.3105), 0.20, 0.10, uv=(0.5, 0.0, 1.0, 0.5), borde=0.008, fondo=0.012)
        for k in range(3):
            colorear(L, cilindro(0.014, 0.014, 10).t(mm(T(0.12 + k * 0.045, 1.74, 0.31), Rx(90))), ('blanco', 'gris-claro', 'rojo')[k])
        L.add(bloque((-0.28, 1.65, 0.31), (0.28, 1.67, 0.3115)), 'acero-pulido')
    return L


def construir_el_carro_de_instrumental():
    d = DISPOSICION['carro-instrumental']
    L = Lote('carro-instrumental', 'equipos', suave=35.0)
    rng = np.random.default_rng(SEMILLA + 71)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        cuatro_ruedas(L, 0.34, 0.215, 0.05)
        for sx in (-1, 1):
            for sz in (-1, 1):
                L.add(barra((sx * 0.37, 0.12, sz * 0.235), (sx * 0.37, 0.95, sz * 0.235), rect_perfil(0.03, 0.03, 0.005, 1)), 'acero-cepillado')
        for y in (0.20, 0.86):
            L.add(bloque((-0.40, y, -0.27), (0.40, y + 0.022, 0.27), 0.006, 2), 'acero-cepillado')
            for (a, b) in (((-0.40, -0.27), (0.40, -0.255)), ((-0.40, 0.255), (0.40, 0.27))):
                L.add(bloque((a[0], y + 0.022, a[1]), (b[0], y + 0.05, b[1]), 0.003, 1), 'acero-cepillado')
            L.add(bloque((-0.40, y + 0.022, -0.27), (-0.385, y + 0.05, 0.27), 0.003, 1), 'acero-cepillado')
        # Abajo, campos estériles y cajas; arriba, el instrumental sobre un paño azul.
        bultos_azules(L, -0.36, 0.0, 0.222, -0.20, 0.20, rng, 0.14)
        caja_de_insumos(L, (0.17, 0.30, 0.0), (0.26, 0.15, 0.30), 'caja-campo', cara='+z')
        caja_de_insumos(L, (0.30, 0.28, 0.05), (0.14, 0.12, 0.28), 'caja-compresas', cara='+z')
        L.add(bloque((-0.34, 0.908, -0.22), (0.34, 0.918, 0.22), 0.004, 1), 'tela-azul')
        for k in range(9):          # pinzas, tijeras y portaagujas, de punta
            x = -0.29 + k * 0.07
            L.add(barra((x, 0.92, -0.12), (x + 0.004, 0.924, 0.12), rect_perfil(0.012, 0.004, 0.0015, 1)), 'acero-pulido')
            L.add(barra((x - 0.012, 0.922, -0.14), (x + 0.012, 0.922, -0.085), rect_perfil(0.014, 0.005, 0.0015, 1)), 'acero-pulido')
        L.add(tubo(bezier((-0.34, 0.918, 0.20), (-0.2, 0.96, 0.12), (0.2, 0.96, 0.12), (0.34, 0.918, 0.20), 16), 0.003, 5), 'acero-pulido')
        # El tirador de empuje, atrás.
        L.add(cilindro_entre((-0.34, 0.99, -0.255), (0.34, 0.99, -0.255), 0.0115, 12), 'acero-pulido')
        for x in (-0.34, 0.34):
            L.add(cilindro_entre((x, 0.95, -0.235), (x, 0.99, -0.255), 0.009, 8), 'acero-pulido')
    return L


def construir_el_mostrador_del_pacs():
    d = DISPOSICION['mostrador-pacs']
    L = Lote('mostrador-pacs', 'equipos', suave=35.0)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        L.add(bloque((-0.78, 0.0, -0.28), (0.78, 0.10, 0.22)), 'pintura-zocalo')
        L.add(bloque((-0.8, 0.10, -0.30), (0.8, 0.88, 0.28), 0.01, 2), 'pintura-mueble')
        for i in range(4):
            x0 = -0.8 + i * 0.40
            L.add(bloque((x0 + 0.003, 0.115, 0.28), (x0 + 0.397, 0.865, 0.298), 0.006, 1), 'pintura-puerta')
            asa_vertical(L, x0 + (0.36 if i % 2 == 0 else 0.04), 0.60, 0.76, 0.298, 0.03)
        L.add(bloque((-0.81, 0.88, -0.30), (0.81, 0.905, 0.31), 0.006, 2), 'plastico-blanco')
        # La estación: torre del computador, teclado, ratón y una carpeta.
        L.add(bloque((-0.72, 0.905, -0.25), (-0.54, 1.29, 0.10), 0.012, 2), 'pintura-equipo')
        L.add(bloque((-0.70, 1.24, 0.098), (-0.56, 1.255, 0.103)), 'plastico-negro')
        L.add(bloque((-0.30, 0.905, 0.02), (0.16, 0.922, 0.20), 0.004, 2), 'plastico-negro')
        L.add(bloque((0.22, 0.905, 0.07), (0.265, 0.918, 0.14), 0.01, 2), 'plastico-negro')
        L.add(bloque((0.44, 0.905, -0.12), (0.72, 0.918, 0.12), 0.003, 1), 'tela-azul')
    return L


def construir_el_monitor_del_pacs():
    d = DISPOSICION['monitor-pacs']
    L = Lote('monitor-pacs', 'equipos', suave=35.0)
    p = Lote('pantalla-pacs', 'equipos', padre=L)
    with L.en(sobre_la_pared(d['pared'], d['centro'], d['altura'])):
        L.add(bloque((-0.12, -0.12, 0.0), (0.12, 0.12, 0.05), 0.01, 1), 'plastico-gris')                # la base de pared
        L.add(barra((0.0, 0.0, 0.05), (0.0, 0.0, 0.085), rect_perfil(0.08, 0.05, 0.01, 1)), 'plastico-gris')
        monitor(L, p, 'pantalla-pacs', (0.0, 0.0, 0.13), 1.2, 0.675, '+z', borde=0.02, fondo=0.045, retoque=0.012)
        tornillos(L, [(-0.1, 0.1, 0.0), (0.1, 0.1, 0.0)], '+z')
    return L


# ============================================================================================ equipos del piso
#
# La unidad electroquirúrgica, el aspirador, el arco en C, los taburetes, el cubo de patada, los cubos de residuos, el
# lavamanos quirúrgico y lo que va en las paredes (perchero de plomo, extintor, dispensador, reloj, panel, pizarra, tomas).


def construir_la_unidad_electroquirurgica():
    d = DISPOSICION['unidad-electroquirurgica']
    L = Lote('unidad-electroquirurgica', 'equipos', suave=35.0)
    p = Lote('pantalla-electrobisturi', 'equipos', padre=L)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        cuatro_ruedas(L, 0.22, 0.25, 0.045)
        L.add(bloque((-0.27, 0.10, -0.29), (0.27, 0.14, 0.29), 0.01, 2), 'plastico-gris')
        for sx in (-1, 1):
            for sz in (-1, 1):
                L.add(cilindro_entre((sx * 0.245, 0.14, sz * 0.265), (sx * 0.245, 0.80, sz * 0.265), 0.0155, 10), 'acero-cepillado')
        for y in (0.45, 0.79):
            L.add(bloque((-0.27, y, -0.29), (0.27, y + 0.022, 0.29), 0.006, 2), 'acero-cepillado')
        # El generador, con su panel: pantalla, perillas, tomas y el rótulo del fabricante.
        L.add(bloque((-0.23, 0.812, -0.26), (0.23, 0.99, 0.25), 0.014, 2), 'pintura-equipo')
        L.add(bloque((-0.225, 0.822, 0.25), (0.225, 0.98, 0.262), 0.006, 1), 'plastico-gris')
        pantalla_sola(L, p, 'pantalla-menores', (-0.105, 0.91, 0.262), 0.15, 0.075, uv=(0.0, 0.5, 0.5, 1.0), borde=0.008, fondo=0.012)
        rotulo(L, 'logo-electro', (-0.095, 0.963, 0.262), 0.15, 0.0375)
        for k in range(2):
            L.add(cilindro(0.017, 0.016, 14).t(mm(T(0.06 + k * 0.055, 0.915, 0.262), Rx(90))), 'plastico-negro')
            L.add(cilindro(0.0035, 0.0165, 6).t(mm(T(0.06 + k * 0.055, 0.915, 0.262), Rx(90), T(0.011, 0.0, 0.0))), 'acero-pulido')
        for k in range(3):
            L.add(cilindro(0.015, 0.014, 12).t(mm(T(-0.17 + k * 0.05, 0.846, 0.262), Rx(90))), 'plastico-negro')
            colorear(L, cilindro(0.0065, 0.016, 10).t(mm(T(-0.17 + k * 0.05, 0.846, 0.262), Rx(90))), ('amarillo', 'azul', 'blanco')[k])
        # Los cables: el del lápiz y el del retorno salen de las tomas, y el del pedal baja hasta el piso.
        cable(L, cuelga((-0.17, 0.846, 0.27), (-0.40, 0.55, 0.30), 0.14, 18), 0.0045, 'plastico-negro')
        cable(L, cuelga((-0.12, 0.846, 0.27), (-0.15, 0.20, 0.52), 0.15, 18), 0.0045, 'plastico-gris')
        L.add(bloque((-0.24, 0.0, 0.44), (-0.06, 0.07, 0.60), 0.02, 2), 'plastico-negro')               # el pedal
        L.add(bloque((-0.22, 0.07, 0.47), (-0.08, 0.085, 0.57), 0.01, 1), 'acero-cepillado')
        cable(L, cuelga((-0.15, 0.04, 0.44), (-0.12, 0.16, 0.28), 0.04, 10), 0.0045, 'plastico-negro')
        # El portalápiz del costado.
        L.add(cilindro(0.028, 0.07, 12, base=0.86).t(T(0.30, 0.0, 0.0)), 'plastico-gris')
        L.add(barra((0.265, 0.86, 0.0), (0.30, 0.86, 0.0), rect_perfil(0.03, 0.01, 0.002, 1)), 'plastico-gris')
    return L


def construir_el_aspirador():
    d = DISPOSICION['aspirador']
    L = Lote('aspirador', 'equipos', suave=35.0)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        cuatro_ruedas(L, 0.235, 0.29, 0.05)
        L.add(bloque((-0.28, 0.10, -0.33), (0.28, 0.15, 0.33), 0.012, 2), 'plastico-gris')
        L.add(bloque((-0.26, 0.15, -0.31), (0.26, 0.55, 0.30), 0.03, 3), 'pintura-equipo')           # la bomba
        for k in range(5):
            L.add(bloque((-0.17 + k * 0.07, 0.17, 0.30), (-0.12 + k * 0.07, 0.30, 0.31)), 'plastico-negro')
        rotulo(L, 'logo-aspirador', (0.0, 0.44, 0.30), 0.22, 0.066)
        L.add(bloque((-0.28, 0.55, -0.33), (0.28, 0.575, 0.33), 0.008, 2), 'acero-cepillado')
        # Dos frascos de aspiración con su tapa y la línea que llega a cada uno.
        for x in (-0.13, 0.13):
            L.add(cilindro(0.088, 0.32, 20, base=0.575).t(T(x, 0.0, 0.0)), 'plastico-transparente')
            colorear(L, cilindro(0.082, 0.07 + 0.03 * (x > 0), 16, base=0.585).t(T(x, 0.0, 0.0)), 'rojo-oscuro' if x > 0 else 'amarillo')
            L.add(cilindro(0.094, 0.028, 20, base=0.895).t(T(x, 0.0, 0.0)), 'plastico-gris')
            L.add(cilindro(0.012, 0.03, 10, base=0.923).t(T(x - 0.03, 0.0, -0.03)), 'acero-pulido')
            L.add(cilindro(0.012, 0.03, 10, base=0.923).t(T(x + 0.03, 0.0, 0.03)), 'acero-pulido')
        # El regulador con su manómetro, adelante.
        L.add(bloque((-0.10, 0.60, 0.15), (0.10, 0.76, 0.24), 0.012, 2), 'pintura-equipo')
        L.add(cilindro(0.045, 0.026, 18).t(mm(T(0.0, 0.69, 0.24), Rx(90))), 'acero-pulido')
        disco_con_imagen(L, 'manometro-vac', (0.0, 0.69, 0.266), 0.0415, '+z', 24, 0.0)
        L.add(cilindro(0.017, 0.02, 12).t(mm(T(0.0, 0.625, 0.24), Rx(90))), 'plastico-negro')
        # Las mangueras que salen de las tapas, con su caída natural, y el tirador de empuje.
        manguera(L, bezier((-0.16, 0.95, -0.03), (-0.16, 1.1, 0.1), (-0.12, 1.1, 0.40), (-0.02, 0.62, 0.42), 24), 0.0085, 'plastico-transparente', 8)
        manguera(L, bezier((0.16, 0.95, 0.03), (0.16, 1.1, 0.2), (0.14, 1.12, 0.46), (0.06, 0.60, 0.48), 24), 0.0085, 'plastico-transparente', 8)
        L.add(cilindro_entre((-0.24, 1.0, -0.33), (0.24, 1.0, -0.33), 0.012, 12), 'acero-pulido')
        for x in (-0.24, 0.24):
            L.add(cilindro_entre((x, 0.575, -0.33), (x, 1.0, -0.33), 0.012, 10), 'acero-pulido')
    return L


def construir_el_arco_en_c():
    d = DISPOSICION['arco-en-c']
    L = Lote('arco-en-c', 'equipos', suave=35.0)
    p = Lote('pantalla-arco', 'equipos', padre=L)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        # La base: un chasis largo con cuatro ruedas y la cubierta de plástico, el cuerpo de la columna y el tablero de mando.
        cuatro_ruedas(L, 0.27, 0.55, 0.06, 0.035)
        L.add(bloque((-0.32, 0.12, -0.72), (0.32, 0.30, 0.62), 0.03, 3), 'plastico-gris')
        L.add(bloque((-0.30, 0.30, -0.70), (0.30, 0.78, -0.18), 0.04, 3), 'pintura-equipo')
        L.add(bloque((-0.20, 0.78, -0.62), (0.20, 1.20, -0.30), 0.035, 3), 'pintura-equipo')
        rotulo(L, 'logo-arco', (0.0, 0.54, -0.18), 0.30, 0.075, '+z')
        for k in range(4):
            colorear(L, cilindro(0.013, 0.012, 12).t(mm(T(-0.15 + k * 0.1, 0.36, -0.18), Rx(90))), ('verde', 'amarillo', 'azul', 'rojo')[k])
        # El arco: un perfil de 7 × 12 cm en 200 grados, abierto hacia +Z, con el intensificador de imagen arriba y el tubo de rayos abajo.
        centro = np.array([0.0, 1.14, -0.02])
        radio = 0.44
        fi = np.radians(np.linspace(-102, 102, 36))
        ruta = np.stack([np.zeros_like(fi), centro[1] + radio * np.sin(fi), centro[2] - radio * np.cos(fi)], axis=-1)
        L.add(barrido(rect_perfil(0.07, 0.12, 0.02, 2), ruta, arriba=(1.0, 0.0, 0.0)), 'pintura-equipo')
        L.add(bloque((-0.07, centro[1] - 0.09, centro[2] - radio - 0.07), (0.07, centro[1] + 0.09, centro[2] - radio + 0.07), 0.02, 2), 'plastico-gris')   # el carro del arco
        arriba, abajo = ruta[-1], ruta[0]
        L.add(cilindro(0.175, 0.17, 24).t(T(0.0, arriba[1] - 0.17 - 0.02, arriba[2])), 'pintura-equipo')             # el intensificador
        L.add(cilindro(0.18, 0.025, 24).t(T(0.0, arriba[1] - 0.045, arriba[2])), 'plastico-gris')
        L.add(cilindro(0.16, 0.012, 24).t(T(0.0, arriba[1] - 0.17 - 0.032, arriba[2])), 'acero-cepillado')
        L.add(bloque((-0.115, abajo[1] + 0.02, abajo[2] - 0.115), (0.115, abajo[1] + 0.20, abajo[2] + 0.115), 0.03, 2), 'pintura-equipo')   # el tubo
        L.add(cilindro(0.075, 0.022, 18).t(T(0.0, abajo[1] + 0.20, abajo[2])), 'acero-cepillado')
        # La estación de mando: un mástil con el monitor, mirando al frente y un poco hacia abajo.
        L.add(cilindro_entre((0.0, 0.62, 0.52), (0.0, 1.30, 0.52), 0.022, 12), 'acero-pulido')
        L.add(bloque((-0.14, 1.30, 0.40), (0.14, 1.36, 0.58), 0.01, 1), 'plastico-gris')
        monitor(L, p, 'pantalla-arco', (0.0, 1.52, 0.60), 0.46, 0.29, '+z', inclinar=7.0, borde=0.02, fondo=0.06)
        L.add(bloque((-0.16, 0.30, 0.44), (0.16, 0.62, 0.62), 0.03, 2), 'pintura-equipo')
        # El pedal de rayos y su cable, y el cable de red enrollado.
        L.add(bloque((-0.16, 0.0, 0.70), (0.10, 0.07, 0.86), 0.02, 2), 'plastico-negro')
        cable(L, cuelga((-0.03, 0.05, 0.70), (0.0, 0.26, 0.58), 0.05, 12), 0.005, 'plastico-negro')
        L.add(tubo(espiral((0.0, 0.5, -0.72), 0.06, 0.014, 4, (0, 0, -1)), 0.006, 5), 'goma-negra')
    return L


def taburete_giratorio(L, asiento=0.62, radio=0.19, aro=False, respaldo=False):
    """Un taburete giratorio: base de cinco patas con ruedas, columna de gas, asiento acolchado y, opcional, aro para los pies."""
    estrella(L, 0.27, 0.075, 0.03, 5, 0.032)
    L.add(cilindro(0.032, 0.09, 12, base=0.10), 'acero-pulido')
    L.add(cilindro(0.023, asiento - 0.32, 12, base=0.16), 'acero-pulido')
    L.add(revolucion([(0.0, asiento - 0.04), (0.05, asiento - 0.04), (0.05, asiento), (0.0, asiento)], 12), 'plastico-negro')
    L.add(revolucion([(0.0, asiento), (radio, asiento), (radio + 0.008, asiento + 0.015), (radio + 0.005, asiento + 0.05), (radio - 0.03, asiento + 0.068), (0.0, asiento + 0.068)], 24), 'tela-azul')
    L.add(revolucion([(0.0, asiento - 0.015), (radio - 0.01, asiento - 0.015), (radio, asiento), (0.0, asiento)], 24), 'plastico-negro')
    if aro:
        ang = np.linspace(0.0, 2 * pi, 28)
        L.add(tubo(np.stack([0.24 * np.cos(ang), np.full_like(ang, 0.30), 0.24 * np.sin(ang)], -1), 0.011, 8), 'acero-pulido')
        for a in (0.0, 2 * pi / 3, 4 * pi / 3):
            L.add(cilindro_entre((0.0, 0.26, 0.0), (0.24 * cos(a), 0.30, 0.24 * sin(a)), 0.008, 8), 'acero-pulido')


def construir_el_taburete_del_cirujano():
    d = DISPOSICION['taburete-cirujano']
    L = Lote('taburete-cirujano', 'equipos', suave=35.0)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        taburete_giratorio(L, 0.60, 0.20, aro=True)
    return L


def construir_el_cubo_de_patada():
    d = DISPOSICION['cubo-patada']
    L = Lote('cubo-patada', 'equipos', suave=35.0)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        for a in (45, 135, 225, 315):
            rueda(L, 0.12 * cos(radians(a)), 0.12 * sin(radians(a)), 0.03, 0.02, giro=a + 20)
        L.add(revolucion([(0.0, 0.07), (0.15, 0.07), (0.15, 0.085), (0.0, 0.085)], 20), 'plastico-gris')
        L.add(revolucion([(0.0, 0.085), (0.125, 0.085), (0.138, 0.30), (0.155, 0.31), (0.155, 0.318), (0.13, 0.318), (0.12, 0.30), (0.108, 0.10), (0.0, 0.10)], 24), 'acero-pulido')
    return L


def cubo_de_residuos(L, color, con_senal):
    L.add(revolucion([(0.0, 0.0), (0.172, 0.0), (0.176, 0.02), (0.0, 0.02)], 28), 'plastico-gris')
    colorear(L, revolucion([(0.0, 0.02), (0.174, 0.02), (0.208, 0.58), (0.0, 0.58)], 28).t(T(0, 0, 0)), color)
    colorear(L, revolucion([(0.0, 0.58), (0.214, 0.58), (0.214, 0.615), (0.19, 0.655), (0.10, 0.682), (0.0, 0.685)], 28), color)
    L.add(revolucion([(0.0, 0.685), (0.045, 0.685), (0.045, 0.70), (0.0, 0.70)], 12), 'plastico-negro')
    # El pedal, al frente, y su varilla.
    L.add(bloque((-0.07, 0.012, 0.20), (0.07, 0.034, 0.30), 0.008, 1), 'plastico-negro')
    L.add(cilindro_entre((0.0, 0.03, 0.205), (0.0, 0.50, 0.202), 0.006, 8), 'acero-pulido')
    if con_senal:
        rotulo(L, 'letrero-biologico', (0.0, 0.33, 0.1925 + 0.0), 0.15, 0.15, '+z')


def construir_el_cubo(nombre, color, con_senal):
    d = DISPOSICION[nombre]
    L = Lote(nombre, 'equipos', suave=40.0)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        cubo_de_residuos(L, color, con_senal)
    return L


def construir_el_lavamanos():
    d = DISPOSICION['lavamanos']
    L = Lote('lavamanos', 'equipos', suave=35.0)
    p_lav = Lote('pantalla-lavado', 'equipos', padre=L)
    zb = -0.65            # el fondo del nicho
    with L.en(sobre_la_pared(d['pared'], d['centro'], 0.0)):
        # El mesón de acero: dos costados, el canto delantero, el resalte de atrás y el fondo de la artesa.
        L.add(bloque((0.92, 0.0, zb + 0.02), (0.95, 0.86, -0.14), 0.004, 1), 'acero-cepillado')
        L.add(bloque((-0.95, 0.0, zb + 0.02), (-0.92, 0.86, -0.14), 0.004, 1), 'acero-cepillado')
        L.add(bloque((-0.95, 0.40, zb), (0.95, 0.84, zb + 0.02), 0.003, 1), 'acero-cepillado')
        L.add(bloque((-0.95, 0.84, -0.20), (0.95, 0.88, -0.14), 0.01, 2), 'acero-pulido')
        L.add(bloque((-0.95, 0.84, zb + 0.02), (0.95, 0.88, -0.55), 0.008, 2), 'acero-pulido')
        L.add(bloque((-0.95, 0.84, -0.55), (-0.86, 0.88, -0.20), 0.008, 2), 'acero-pulido')
        L.add(bloque((0.86, 0.84, -0.55), (0.95, 0.88, -0.20), 0.008, 2), 'acero-pulido')
        L.add(bloque((-0.95, 0.88, zb), (0.95, 1.00, zb + 0.03), 0.008, 1), 'acero-pulido')
        L.add(bloque((-0.86, 0.64, -0.55), (0.86, 0.66, -0.20), 0.004, 1), 'acero-cepillado')
        for (a, b) in (((-0.86, -0.205), (0.86, -0.20)), ((-0.86, -0.55), (0.86, -0.545))):
            L.add(bloque((a[0], 0.64, a[1]), (b[0], 0.84, b[1])), 'acero-cepillado')
        for x in (-0.55, 0.0, 0.55):
            # Desagüe y sifón.
            L.add(revolucion([(0.0, 0.661), (0.034, 0.661), (0.034, 0.665), (0.0, 0.665)], 14), 'acero-perforado')
            L.add(cilindro_entre((x, 0.64, -0.375), (x, 0.40, -0.375), 0.018, 10), 'acero-pulido')
            # La grifería de cuello de cisne con su palanca para el codo.
            L.add(cilindro(0.03, 0.07, 14).t(T(x, 0.88, -0.585)), 'acero-pulido')
            L.add(tubo(bezier((x, 0.94, -0.585), (x, 1.28, -0.585), (x, 1.24, -0.40), (x, 1.05, -0.40), 22), 0.0125, 10), 'acero-pulido')
            L.add(cilindro(0.017, 0.026, 12).t(T(x, 1.026, -0.40)), 'acero-cepillado')
            L.add(cilindro_entre((x + 0.04, 0.93, -0.58), (x + 0.04, 0.975, -0.20), 0.0085, 8), 'acero-pulido')
            L.add(bloque((x + 0.01, 0.965, -0.27), (x + 0.07, 0.978, -0.17), 0.005, 1), 'acero-pulido')
        L.add(cilindro_entre((-0.55, 0.40, -0.375), (0.55, 0.40, -0.375), 0.022, 10), 'acero-pulido')
        L.add(cilindro_entre((0.55, 0.40, -0.375), (0.55, 0.40, -0.63), 0.022, 10), 'acero-pulido')
        # Dos dispensadores de accionamiento por codo: jabón (azul) y antiséptico (rojo).
        for x, col in ((-0.28, 'azul'), (0.28, 'rojo')):
            L.add(bloque((x - 0.04, 1.08, zb), (x + 0.04, 1.26, zb + 0.075), 0.012, 2), 'plastico-blanco')
            colorear(L, bloque((x - 0.034, 1.15, zb + 0.074), (x + 0.034, 1.22, zb + 0.077), 0.003, 1), col)
            L.add(cilindro_entre((x, 1.10, zb + 0.07), (x, 1.04, -0.38), 0.0065, 8), 'acero-pulido')
            L.add(bloque((x - 0.03, 1.035, -0.43), (x + 0.03, 1.048, -0.33), 0.004, 1), 'acero-pulido')
        # El espejo, con su marco; el cronómetro de lavado arriba; las luces del nicho.
        L.add(lamina((0.0, 1.62, zb + 0.004), (1, 0, 0), (0, 1, 0), 1.8, 0.66), 'vidrio-espejo')
        for caja_ in marco_de_cajas(-0.9, 0.9, 1.29, 1.95, zb, zb + 0.014, 0.025, 0.003, 1):
            L.add(caja_, 'acero-pulido')
        pantalla_sola(L, p_lav, 'pantalla-menores', (0.0, 2.2, zb + 0.016), 0.28, 0.14, uv=(0.5, 0.5, 1.0, 1.0), borde=0.012, fondo=0.014)
        L.add(lamina((0.0, DISPOSICION['hueco-lavamanos']['alto'] - 0.004, -0.32), (1, 0, 0), (0, 0, 1), 1.6, 0.30), 'luz-led')
        rotulo(L, 'cartel-manos', (-1.097, 1.55, -0.34), 0.30, 0.4125, '+x', 0.0)
        rotulo(L, 'letrero-lavado', (0.0, 2.86, 0.0), 0.62, 0.1938, '+z')
        tornillos(L, [(x, 1.94, zb + 0.014) for x in (-0.88, 0.88)], '+z')
    return L


def construir_el_tapete():
    d = DISPOSICION['tapete-antifatiga']
    L = Lote('tapete-antifatiga', 'equipos', suave=60.0)
    with L.en(sobre_el_piso(d['x'], d['z'], d['giro'])):
        L.add(bloque((-0.30, 0.0, -0.50), (0.30, 0.013, 0.50), 0.0045, 2), 'goma-negra')
    return L


def construir_el_perchero_de_plomo():
    d = DISPOSICION['perchero-plomo']
    L = Lote('perchero-plomo', 'equipos', suave=35.0)
    with L.en(sobre_la_pared(d['pared'], d['centro'], d['altura'])):
        L.add(bloque((-0.55, 0.38, 0.0), (0.55, 0.43, 0.02), 0.005, 1), 'acero-cepillado')
        L.add(cilindro_entre((-0.52, 0.40, 0.055), (0.52, 0.40, 0.055), 0.0125, 12), 'acero-pulido')
        for x in (-0.52, 0.0, 0.52):
            L.add(cilindro_entre((x, 0.40, 0.0), (x, 0.40, 0.055), 0.009, 8), 'acero-pulido')
        for k, (x, col) in enumerate(((-0.33, 'azul'), (0.0, 'verde-oscuro'), (0.33, 'gris'))):
            # El delantal de plomo: el cuerpo con el cuello abierto, el cuello y las tiras de los hombros.
            colorear(L, bloque((x - 0.17, -0.42, 0.065), (x + 0.17, 0.34, 0.088), 0.02, 2), col)
            colorear(L, bloque((x - 0.075, 0.34, 0.065), (x + 0.075, 0.385, 0.088), 0.015, 2), col)
            colorear(L, bloque((x - 0.05, 0.385, 0.07), (x - 0.03, 0.43, 0.084), 0.004, 1), col)
            colorear(L, bloque((x + 0.03, 0.385, 0.07), (x + 0.05, 0.43, 0.084), 0.004, 1), col)
            L.add(bloque((x - 0.16, -0.12, 0.088), (x + 0.16, -0.095, 0.0905), 0.003, 1), 'plastico-negro')
        for k, x in enumerate((-0.45, 0.45)):         # collarines tiroideos en un gancho bajo
            colorear(L, bloque((x - 0.055, -0.29, 0.12), (x + 0.055, -0.20, 0.155), 0.02, 2), 'azul-claro')
        rotulo(L, 'letrero-radiacion', (0.0, 0.72, 0.0), 0.24, 0.24, '+z')
    return L


def construir_el_dispensador_de_gel():
    d = DISPOSICION['dispensador-gel']
    L = Lote('dispensador-gel', 'equipos', suave=35.0)
    with L.en(sobre_la_pared(d['pared'], d['centro'], d['altura'])):
        L.add(bloque((-0.055, -0.14, 0.0), (0.055, 0.14, 0.10), 0.015, 2), 'plastico-blanco')
        colorear(L, bloque((-0.045, 0.02, 0.099), (0.045, 0.11, 0.1015), 0.003, 1), 'celeste')
        L.add(barra((0.0, -0.07, 0.10), (0.0, -0.09, 0.16), rect_perfil(0.07, 0.012, 0.004, 1)), 'plastico-gris')
        L.add(cilindro_entre((0.0, -0.09, 0.16), (0.0, -0.125, 0.16), 0.007, 8), 'plastico-gris')
        L.add(bloque((-0.03, -0.20, 0.0), (0.03, -0.14, 0.04), 0.005, 1), 'plastico-gris')            # la bandeja que recoge las gotas
    return L


def construir_el_extintor():
    d = DISPOSICION['extintor']
    L = Lote('extintor', 'equipos', suave=35.0)
    with L.en(sobre_la_pared(d['pared'], d['centro'], d['altura'])):
        L.add(bloque((-0.045, -0.08, 0.0), (0.045, 0.10, 0.014), 0.004, 1), 'acero-cepillado')
        colorear(L, revolucion([(0.0, -0.20), (0.07, -0.20), (0.075, -0.18), (0.075, 0.16), (0.062, 0.21), (0.032, 0.235), (0.0, 0.235)], 20).t(T(0.0, 0.0, 0.092)), 'rojo')
        L.add(cilindro(0.026, 0.05, 10, base=0.235).t(T(0.0, 0.0, 0.092)), 'acero-pulido')
        L.add(barra((0.0, 0.27, 0.06), (0.0, 0.27, 0.125), rect_perfil(0.012, 0.05, 0.003, 1)), 'plastico-negro')
        L.add(tubo(bezier((0.0, 0.245, 0.092), (0.07, 0.24, 0.18), (0.10, 0.0, 0.20), (0.075, -0.10, 0.17), 14), 0.007, 6), 'goma-negra')
        L.add(barra((-0.085, 0.03, 0.092), (0.085, 0.03, 0.092), rect_perfil(0.02, 0.012, 0.003, 1)), 'plastico-negro')
        disco_con_imagen(L, 'manometro-aire', (0.0, 0.17, 0.168), 0.022, '+z', 16, 0.0)
        rotulo(L, 'letrero-extintor', (0.0, 0.66, 0.0), 0.15, 0.18, '+z')
    return L


def construir_el_panel_de_control():
    d = DISPOSICION['panel-control']
    L = Lote('panel-control', 'equipos', suave=35.0)
    p = Lote('pantalla-control', 'equipos', padre=L)
    with L.en(sobre_la_pared(d['pared'], d['centro'], d['altura'])):
        L.add(bloque((-0.23, -0.17, 0.0), (0.23, 0.17, 0.02), 0.01, 1), 'acero-cepillado')
        monitor(L, p, 'pantalla-control', (0.0, 0.0, 0.032), 0.36, 0.24, '+z', borde=0.012, fondo=0.014, retoque=0.006)
        tornillos(L, [(-0.21, 0.15, 0.02), (0.21, 0.15, 0.02), (-0.21, -0.15, 0.02), (0.21, -0.15, 0.02)], '+z')
    return L


def construir_el_reloj():
    d = DISPOSICION['reloj-pared']
    L = Lote('reloj-pared', 'equipos', suave=35.0)
    with L.en(sobre_la_pared(d['pared'], d['centro'], d['altura'])):
        L.add(cilindro(0.205, 0.03, 32).t(Rx(90)), 'plastico-negro')
        # El aro de acero es un anillo y no un disco: un disco taparía la esfera, que es lo que se quiere ver.
        L.add(revolucion([(0.192, 0.0), (0.212, 0.0), (0.212, 0.01), (0.192, 0.01)], 36, cerrar=True).t(mm(T(0.0, 0.0, 0.024), Rx(90))), 'acero-pulido')
        disco_con_imagen(L, 'reloj', (0.0, 0.0, 0.03), 0.192, '+z', 36, 0.0015)
    return L


def construir_la_pizarra():
    d = DISPOSICION['pizarra-conteo']
    L = Lote('pizarra-conteo', 'equipos', suave=35.0)
    with L.en(sobre_la_pared(d['pared'], d['centro'], d['altura'])):
        for caja_ in marco_de_cajas(-0.45, 0.45, -0.29, 0.29, 0.0, 0.028, 0.02, 0.004, 1):
            L.add(caja_, 'acero-cepillado')
        L.add(bloque((-0.45, -0.29, 0.0), (0.45, 0.29, 0.012), 0.002, 1), 'plastico-blanco')
        rotulo(L, 'pizarra', (0.0, 0.0, 0.012), 0.90, 0.5786, '+z', 0.0008)
        L.add(bloque((-0.30, -0.325, 0.0), (0.30, -0.29, 0.06), 0.008, 1), 'acero-cepillado')
        for k, col in enumerate(('azul', 'rojo', 'negro')):
            colorear(L, cilindro_entre((-0.12 + k * 0.05, -0.30, 0.04), (-0.12 + k * 0.05 + 0.10, -0.30, 0.04), 0.008, 8), col)
    return L


def construir_el_desague():
    d = DISPOSICION['desague']
    L = Lote('desague', 'equipos', suave=35.0)
    with L.en(sobre_el_piso(d['x'], d['z'], 0.0)):
        L.add(revolucion([(0.088, 0.0), (0.105, 0.0), (0.105, 0.005), (0.088, 0.005)], 28, cerrar=True), 'acero-cepillado')
        L.add(revolucion([(0.0, 0.004), (0.088, 0.004), (0.088, 0.0045), (0.0, 0.0045)], 28), 'acero-perforado')
    return L


def tomacorriente(L, pared, centro, altura):
    with L.en(sobre_la_pared(pared, centro, altura)):
        L.add(bloque((-0.045, -0.045, 0.0), (0.045, 0.045, 0.012), 0.006, 1), 'plastico-blanco')
        for dy in (-0.0165, 0.0165):
            L.add(cilindro(0.0125, 0.003, 10).t(mm(T(0.0, dy, 0.012), Rx(90))), 'plastico-gris')
            for dx in (-0.006, 0.006):
                L.add(bloque((dx - 0.0012, dy - 0.004, 0.0118), (dx + 0.0012, dy + 0.004, 0.0152)), 'plastico-negro')


def construir_los_accesorios_de_pared():
    """
    Tomas de corriente, interruptores, rótulos y carteles: lo pequeño que va pegado a las paredes. Los rótulos van con el salto de
    siempre (dos milímetros): pegados a ras, en el mismo plano de la pared, la pared los tapa o se pelean con ella según desde dónde
    se mire, y así faltaban en la foto los carteles de la pared norte y el de la puerta de paso.
    """
    L = Lote('accesorios-pared', 'equipos', suave=40.0)
    for pared, c, a in (('este', -3.20, 0.32), ('este', -1.95, 0.32), ('este', -0.40, 1.10), ('este', 0.20, 1.10), ('este', 2.85, 0.35),
                        ('norte', -2.35, 1.10), ('norte', 0.55, 0.40), ('sur', -0.90, 0.35), ('oeste', 0.40, 0.35), ('oeste', -1.20, 0.35)):
        tomacorriente(L, pared, c, a)
    with L.en(sobre_la_pared('sur', 1.25, 1.30)):           # los interruptores, junto a la puerta
        L.add(bloque((-0.045, -0.07, 0.0), (0.045, 0.07, 0.012), 0.006, 1), 'plastico-blanco')
        for dy in (-0.032, 0.032):
            L.add(bloque((-0.012, dy - 0.018, 0.012), (0.012, dy + 0.018, 0.018), 0.004, 1), 'plastico-gris')
    with L.en(sobre_la_pared('sur', -0.62, 1.55)):
        rotulo(L, 'letrero-mascarilla', (0.0, 0.0, 0.0), 0.22, 0.22, '+z')
    with L.en(sobre_la_pared('sur', -2.35, 1.62)):
        rotulo(L, 'cartel-lista', (0.0, 0.0, 0.0), 0.34, 0.4675, '+z')
    with L.en(sobre_la_pared('sur', 1.65, 2.5)):
        rotulo(L, 'letrero-zona-esteril', (0.0, 0.0, 0.0), 0.70, 0.21875, '+z')
    with L.en(sobre_la_pared('norte', 0.0, 2.52)):
        rotulo(L, 'letrero-pabellon', (0.0, 0.0, 0.0), 0.92, 0.23, '+z')
    with L.en(sobre_la_pared('norte', -3.05, 2.45)):
        rotulo(L, 'letrero-personal', (0.0, 0.0, 0.0), 0.56, 0.175, '+z')
    with L.en(sobre_la_pared('oeste', DISPOSICION['puerta-de-paso']['centro'], 2.40)):
        rotulo(L, 'letrero-salida', (0.0, 0.0, 0.0), 0.36, 0.18, '+z')
    # Junto a la puerta de salida, a la altura de los ojos y fuera del nicho del lavamanos, donde una pared que no existe lo dejaría en el aire.
    with L.en(sobre_la_pared('sur', 2.55, 1.55)):
        rotulo(L, 'plano-evacuacion', (0.0, 0.0, 0.0), 0.40, 0.30, '+z')
    return L


# ================================================================================================ lo que cuelga
#
# Las dos cialíticas con sus brazos articulados y el boom de monitores. Cada una es UN lote-nodo `colgante-*` con el origen
# en su anclaje al techo: el simulador la esconde entera cuando se interpone entre la cámara y el paciente, así que importa
# que sea compacta y que todo lo suyo cuelgue de ese nodo (las pantallas del boom, hijas suyas, se van con él).


def brazo_horizontal(L, desde, azimut, largo, r, material='plastico-blanco'):
    """Un brazo horizontal de `largo` m desde `desde`, con el azimut medido desde +X hacia +Z. Devuelve el punto de su extremo."""
    a = radians(azimut)
    hasta = np.asarray(desde, float) + np.array([largo * cos(a), 0.0, largo * sin(a)])
    L.add(cilindro_entre(desde, hasta, r, 14), material)
    return hasta


def junta(L, c, r=0.05, alto=0.12):
    """El alojamiento de un pivote: un cilindro vertical con tapas de acero."""
    c = np.asarray(c, float)
    L.add(cilindro(r, alto, 18).t(T(c[0], c[1] - alto / 2, c[2])), 'plastico-blanco')
    L.add(cilindro(r * 1.04, 0.008, 18).t(T(c[0], c[1] + alto / 2 - 0.008, c[2])), 'acero-pulido')
    L.add(cilindro(r * 1.04, 0.008, 18).t(T(c[0], c[1] - alto / 2, c[2])), 'acero-pulido')


def cabezal_de_cialitica(L, c, azimut):
    """
    La cabeza de la lámpara: carcasa blanca de 74 cm, cara de LED emisiva con sus módulos en dos anillos, el mango central
    esterilizable, el aro de agarre en el borde, el rótulo del fabricante y el panel de mando. `c` es el centro de la cabeza.
    """
    c = np.asarray(c, float)
    with L.en(T(*c), Ry(azimut)):
        L.add(revolucion([(0.0, -0.05), (0.34, -0.05), (0.372, -0.02), (0.372, 0.012), (0.33, 0.045), (0.20, 0.062), (0.0, 0.055)], 36), 'plastico-blanco')
        L.add(disco(0.336, 36, 0.0).t(mm(T(0.0, -0.0505, 0.0), Rx(180))), 'luz-led')
        for radio, n, r_mod in ((0.27, 24, 0.0235), (0.15, 12, 0.0235)):
            for k in range(n):
                a = 2 * pi * k / n
                L.add(cilindro(r_mod, 0.007, 8).t(T(radio * cos(a), -0.057, radio * sin(a))), 'luz-led')
        L.add(revolucion([(0.0, -0.185), (0.03, -0.185), (0.038, -0.17), (0.038, -0.05), (0.0, -0.05)], 14), 'plastico-gris')
        for k in range(3):
            L.add(cilindro(0.041, 0.006, 14).t(T(0.0, -0.095 - k * 0.035, 0.0)), 'plastico-negro')
        ang = np.linspace(0.0, 2 * pi, 40)
        L.add(tubo(np.stack([0.392 * np.cos(ang), np.full_like(ang, -0.005), 0.392 * np.sin(ang)], -1), 0.012, 8), 'acero-pulido')
        for a in (0.0, 2 * pi / 3, 4 * pi / 3):
            L.add(cilindro_entre((0.37 * cos(a), -0.005, 0.37 * sin(a)), (0.392 * cos(a), -0.005, 0.392 * sin(a)), 0.01, 8), 'acero-pulido')
        rotulo(L, 'logo-lampara', (0.0, 0.0, 0.371), 0.16, 0.04, '+z', 0.0)
        L.add(bloque((0.06, -0.025, 0.368), (0.20, 0.005, 0.388), 0.006, 1), 'plastico-negro')
        for k in range(3):
            colorear(L, bloque((0.075 + k * 0.04, -0.016, 0.386), (0.095 + k * 0.04, -0.006, 0.3895), 0.002, 1), ('verde', 'amarillo', 'blanco')[k])


def construir_la_cialitica(nombre, h0=0.0):
    d = DISPOSICION[nombre]
    ancla = np.array([d['x'], TECHO, d['z']])
    L = Lote('colgante-' + nombre, 'colgantes', suave=35.0, pivote=ancla)
    az1, l1 = d['brazo1']
    az2, l2 = d['brazo2']
    y_cabeza = SUELO + d['altura_cabezal']
    with L.en(T(*ancla)):
        # El anclaje: la placa al techo con su cubierta cónica y la columna.
        # La placa queda un milímetro bajo el techo y no a ras: a ras, su cara de arriba se pelea con el techo en profundidad.
        L.add(cilindro(0.20, 0.035, 28).t(T(0.0, -0.036, 0.0)), 'plastico-blanco')
        L.add(revolucion([(0.0, -0.17), (0.062, -0.17), (0.095, -0.12), (0.15, -0.035), (0.0, -0.035)], 24), 'plastico-blanco')
        y1 = -0.30
        L.add(cilindro(0.052, -(y1 + 0.17) + 0.06, 18).t(T(0.0, y1 - 0.06, 0.0)), 'plastico-blanco')
        L.add(esfera(0.068, 14).t(T(0.0, y1, 0.0)), 'plastico-blanco')
        e1 = brazo_horizontal(L, (0.0, y1, 0.0), az1, l1, 0.038)
        junta(L, (e1[0], y1 - 0.02, e1[2]), 0.055, 0.15)
        y2 = y1 - 0.17
        e2 = brazo_horizontal(L, (e1[0], y2, e1[2]), az2, l2, 0.034)
        # El brazo de resorte que cae hasta el yugo de la cabeza.
        yc = y_cabeza - TECHO
        L.add(esfera(0.05, 12).t(T(e2[0], y2, e2[2])), 'plastico-blanco')
        L.add(cilindro_entre((e2[0], y2, e2[2]), (e2[0], yc + 0.20, e2[2]), 0.026, 14), 'acero-pulido')
        # El yugo: un arco sobre la cabeza que la sostiene por dos pivotes laterales.
        a2 = radians(az2)
        lado = np.array([-sin(a2), 0.0, cos(a2)])
        arco_ = np.array([np.array([e2[0], yc + 0.04, e2[2]]) + lado * 0.385 * np.cos(t) + np.array([0.0, 0.17 * np.sin(t), 0.0]) for t in np.linspace(0.0, pi, 16)])
        L.add(tubo(arco_, 0.017, 8), 'plastico-blanco')
        for s in (-1, 1):
            p = np.array([e2[0], yc + 0.04, e2[2]]) + lado * s * 0.385
            L.add(cilindro_entre(p, p - lado * s * 0.045, 0.03, 14), 'acero-pulido')
        cabezal_de_cialitica(L, (e2[0], yc, e2[2]), -az2)
    return L


def construir_el_boom_de_monitores():
    d = DISPOSICION['boom-monitores']
    ancla = np.array([d['x'], TECHO, d['z']])
    L = Lote('colgante-boom-monitores', 'colgantes', suave=35.0, pivote=ancla)
    p1 = Lote('pantalla-boom-1', 'colgantes', pivote=ancla, padre=L)
    p2 = Lote('pantalla-boom-2', 'colgantes', pivote=ancla, padre=L)
    az, largo = d['brazo']
    yc = SUELO + d['altura_monitores'] - TECHO
    with L.en(T(*ancla)):
        L.add(cilindro(0.17, 0.035, 26).t(T(0.0, -0.036, 0.0)), 'plastico-blanco')
        L.add(revolucion([(0.0, -0.16), (0.055, -0.16), (0.08, -0.11), (0.12, -0.035), (0.0, -0.035)], 22), 'plastico-blanco')
        ya = -0.42
        L.add(cilindro(0.046, -(ya + 0.16) + 0.05, 16).t(T(0.0, ya - 0.05, 0.0)), 'plastico-blanco')
        L.add(esfera(0.06, 12).t(T(0.0, ya, 0.0)), 'plastico-blanco')
        fin = brazo_horizontal(L, (0.0, ya, 0.0), az, largo, 0.034)
        junta(L, (fin[0], ya - 0.02, fin[2]), 0.05, 0.14)
        # Del extremo cae un tubo hasta el travesaño que lleva los dos monitores, uno al lado del otro y mirando a la camilla.
        L.add(cilindro_entre((fin[0], ya - 0.02, fin[2]), (fin[0] + 0.06, yc + 0.28, fin[2]), 0.026, 14), 'acero-pulido')
        L.add(bloque((fin[0] + 0.035, yc + 0.20, fin[2] - 0.40), (fin[0] + 0.095, yc + 0.28, fin[2] + 0.40), 0.01, 2), 'plastico-blanco')
        for lote, dz, uv in ((p1, -0.32, (0.0, 0.0, 0.5, 1.0)), (p2, 0.32, (0.5, 0.0, 1.0, 1.0))):
            c = (fin[0] + 0.0, yc, fin[2] + dz)
            monitor(L, lote, 'pantalla-boom', c, 0.58, 0.36, '-x', uv=uv, borde=0.017, fondo=0.05, retoque=0.01)
            for dx_ in (-0.2, 0.2):
                L.add(cilindro_entre((fin[0] + 0.0, yc + 0.18 + 0.03, fin[2] + dz + dx_), (fin[0] + 0.07, yc + 0.22, fin[2] + dz + dx_), 0.011, 8), 'plastico-gris')
    return L


# Lo que va pegado al techo —el plénum, las luminarias, las rejillas, los detectores— tiene SOLO caras que miran hacia abajo,
# y de una cara. El simulador mira la sala desde arriba a través del techo, que es de una cara; si el plénum fuera una caja o
# una luminaria tuviera marco con volumen, su cara de arriba y sus costados taparían la camilla en la vista cenital. Por eso
# aquí nada tiene relieve: son láminas apenas más bajas que el techo (de uno a seis milímetros, ordenadas de afuera hacia
# adentro para que no se pisen), y el relieve que se ve lo ponen el color, el material y la sombra de contacto. Lo que sí
# cuelga de verdad (las cialíticas, el boom) tiene volumen, y va en `colgantes`, que el simulador aparta cuando estorba.
# `comprobar_el_techo()` lo vigila.


def faja_abajo(L, x0, z0, x1, z1, y, material):
    """Un rectángulo que mira hacia abajo, entre dos esquinas (x, z), a la altura y."""
    L.add(lamina(((x0 + x1) / 2, y, (z0 + z1) / 2), (1, 0, 0), (0, 0, 1), abs(x1 - x0), abs(z1 - z0)), material)


def marco_abajo(L, x0, z0, x1, z1, ancho, y, material):
    """Un marco rectangular de cuatro tiras que miran hacia abajo."""
    faja_abajo(L, x0, z0, x1, z0 + ancho, y, material)
    faja_abajo(L, x0, z1 - ancho, x1, z1, y, material)
    faja_abajo(L, x0, z0 + ancho, x0 + ancho, z1 - ancho, y, material)
    faja_abajo(L, x1 - ancho, z0 + ancho, x1, z1 - ancho, y, material)


def disco_abajo(L, r, y, material, n=20):
    L.add(disco(r, n, 0.0).t(mm(T(0.0, y, 0.0), Rx(180))), material)


def tornillos_abajo(L, puntos, y, r=0.0045, material='acero-pulido'):
    """Cabezas de tornillo en el techo: hexágonos planos que miran hacia abajo, sin relieve."""
    for x, z in puntos:
        L.add(disco(r, 6, 0.0).t(mm(T(x, y, z), Rx(180))), material)


def construir_el_plenum():
    """
    El plénum de flujo laminar sobre la camilla, a ras del techo: un marco de acero, el panel perforado por el que sale el aire,
    la tira de LED que lo rodea y las barras de sujeción. Antes llevaba un faldón de 14 cm; era más creíble y tapaba la camilla
    desde arriba (ver arriba), así que se quedó plano.
    """
    d = DISPOSICION['plenum']
    L = Lote('plenum', 'estructura', suave=35.0, densidad=0.8)
    hx, hz = d['ancho'] / 2, d['largo'] / 2
    y = TECHO
    with L.en(T(d['x'], 0.0, d['z'])):
        marco_abajo(L, -hx, -hz, hx, hz, 0.06, y - 0.002, 'acero-cepillado')
        faja_abajo(L, -hx + 0.06, -hz + 0.06, hx - 0.06, hz - 0.06, y - 0.003, 'acero-perforado')
        marco_abajo(L, -hx + 0.06, -hz + 0.06, hx - 0.06, hz - 0.06, 0.045, y - 0.004, 'luz-led')
        marco_abajo(L, -hx + 0.105, -hz + 0.105, hx - 0.105, hz - 0.105, 0.012, y - 0.005, 'acero-cepillado')
        for z in (-0.47, 0.47):
            faja_abajo(L, -hx + 0.105, z - 0.014, hx - 0.105, z + 0.014, y - 0.0055, 'acero-cepillado')
        for x in (-0.43, 0.43):
            faja_abajo(L, x - 0.014, -hz + 0.105, x + 0.014, hz - 0.105, y - 0.0055, 'acero-cepillado')
        tornillos_abajo(L, [(x, hz - 0.03) for x in np.linspace(-hx + 0.2, hx - 0.2, 9)] + [(x, -hz + 0.03) for x in np.linspace(-hx + 0.2, hx - 0.2, 9)], y - 0.0025)
    return L


def luminaria_empotrada(L, x, z, ancho, largo):
    """Una luminaria LED plana empotrada: el marco, un filete de acero y el panel emisivo, todo hacia abajo y a ras."""
    with L.en(T(x, TECHO, z)):
        marco_abajo(L, -ancho / 2, -largo / 2, ancho / 2, largo / 2, 0.03, -0.002, 'acero-cepillado')
        faja_abajo(L, -ancho / 2 + 0.03, -largo / 2 + 0.03, ancho / 2 - 0.03, largo / 2 - 0.03, -0.0035, 'luz-led')
        tornillos_abajo(L, [(sx * (ancho / 2 - 0.015), sz * (largo / 2 - 0.015)) for sx in (-1, 1) for sz in (-1, 1)], -0.0025, 0.0035)


def rejilla_de_techo(L, x, z, ancho, largo):
    """Un difusor de aire: marco blanco, fondo negro y las aletas como tiras blancas, todo plano."""
    with L.en(T(x, TECHO, z)):
        marco_abajo(L, -ancho / 2, -largo / 2, ancho / 2, largo / 2, 0.035, -0.002, 'plastico-blanco')
        faja_abajo(L, -ancho / 2 + 0.035, -largo / 2 + 0.035, ancho / 2 - 0.035, largo / 2 - 0.035, -0.0025, 'plastico-negro')
        n = 9
        paso = (largo - 0.07) / n
        for k in range(n):
            zz = -largo / 2 + 0.035 + paso * (k + 0.5)
            faja_abajo(L, -ancho / 2 + 0.035, zz - 0.0085, ancho / 2 - 0.035, zz + 0.0085, -0.0035, 'plastico-blanco')


def detector_de_humo(L, x, z):
    """Un detector de humo: discos concéntricos que miran hacia abajo, con su LED."""
    with L.en(T(x, TECHO, z)):
        disco_abajo(L, 0.058, -0.002, 'plastico-blanco', 24)
        disco_abajo(L, 0.040, -0.003, 'plastico-gris', 20)
        disco_abajo(L, 0.026, -0.0035, 'plastico-blanco', 16)
        u0, v0, u1, v1 = TX.uv_de('m-rojo')
        m = disco(0.005, 8, 0.0).t(mm(T(0.047, -0.0036, 0.0), Rx(180)))
        L.add(Malla(m.v, m.f, np.tile([(u0 + u1) / 2, (v0 + v1) / 2], (len(m.v), 1))), 'plastico-estampado')


def rejilla_de_retorno(L, pared, centro, altura):
    with L.en(sobre_la_pared(pared, centro, altura)):
        L.add(bloque((-0.30, -0.16, 0.0), (0.30, 0.16, 0.02), 0.006, 1), 'plastico-blanco')
        L.add(bloque((-0.27, -0.13, 0.019), (0.27, 0.13, 0.021)), 'plastico-negro')
        for k in range(8):
            y = -0.115 + k * 0.03
            L.add(bloque((-0.27, y, 0.02), (0.27, y + 0.012, 0.032), 0.002, 1), 'plastico-blanco')


def construir_lo_del_techo():
    """Las luminarias, las rejillas de impulsión y los detectores: lo que va pegado al techo, solo con caras hacia abajo."""
    L = Lote('luces-y-rejillas', 'estructura', suave=40.0, densidad=1.0)
    for x, z, w, l in DISPOSICION['luminarias-techo']:
        luminaria_empotrada(L, x, z, w, l)
    for x, z, w, l in DISPOSICION['rejillas-techo']:
        rejilla_de_techo(L, x, z, w, l)
    for x, z in DISPOSICION['detectores-techo']:
        detector_de_humo(L, x, z)
    return L


def construir_las_rejillas_de_retorno():
    """Las rejillas de retorno, bajas en la pared: son equipo de pared, no del techo, y por eso van aparte."""
    L = Lote('rejillas-de-retorno', 'equipos', suave=40.0, densidad=1.0)
    for pared, c, a in DISPOSICION['rejillas-retorno']:
        rejilla_de_retorno(L, pared, c, a)
    return L


def comprobar_el_techo(lotes=('plenum', 'luces-y-rejillas')):
    """
    Lo pegado al techo tiene que mirar solo hacia abajo (normal casi −Y): si no, se ve desde arriba por la cara de arriba o por los
    costados, y tapa la camilla en la vista cenital. Falla en voz alta, no en una foto.
    """
    malos = []
    for l in LOTES:
        if l.nombre in lotes:
            for malla, material in l.piezas:
                totales, inicios, lv, lf = _caras_a_arreglos(malla.f)
                nrm, _ = normales_de_caras(malla.v, totales, inicios, lv, lf)
                peor = float(nrm[:, 1].max())
                if peor > -0.95:
                    malos.append((l.nombre, material, round(peor, 2)))
    if malos:
        raise SystemExit('Lo del techo debe mirar solo hacia abajo y hay caras que no: ' + str(malos[:6]))


def construir_los_protectores_de_esquina():
    """Guardacantos de acero en las cuatro esquinas de la sala, de 15 a 140 cm: es donde pegan los carros."""
    L = Lote('protectores-esquina', 'estructura', suave=40.0, densidad=1.0)
    for sx in (-1, 1):
        for sz in (-1, 1):
            x, z = sx * MEDIO, sz * MEDIO
            a = (min(x, x - sx * 0.065), min(z, z - sz * 0.006))
            b = (max(x, x - sx * 0.065), max(z, z - sz * 0.006))
            L.add(bloque((a[0], h(0.15), a[1]), (b[0], h(1.40), b[1]), 0.002, 1), 'acero-cepillado')
            a = (min(x, x - sx * 0.006), min(z, z - sz * 0.065))
            b = (max(x, x - sx * 0.006), max(z, z - sz * 0.065))
            L.add(bloque((a[0], h(0.15), a[1]), (b[0], h(1.40), b[1]), 0.002, 1), 'acero-cepillado')
    return L


# ================================================================================================= la oclusión
#
# La oclusión ambiental va horneada en un atlas ÚNICO (una sola imagen para toda la sala) sobre la segunda UV de cada
# malla, `UV-oclusion`. Se arma aquí y no con el desplegado de Blender, porque el reparto de texeles hay que
# controlarlo: un piso de 58 m² no necesita lo que necesita un cajón de 20 cm lleno de rincones.
#
# El reparto, en tres pasos: (1) cada malla se parte en islas —las caras que miran hacia el mismo lado de los seis
# ejes y se tocan por un vértice—, y cada isla se proyecta plana a su eje; (2) un empaquetado por estantes las acomoda
# todas con una densidad de texeles por metro común, ponderada por la `densidad` de su lote, que se busca por bisección
# hasta que justo caben; (3) lo que no lleva oclusión (el vidrio, las pantallas, la luz) y lo diminuto (la cabeza de un
# tornillo) apuntan a un solo bloque reservado de 8 × 8 píxeles que se deja en blanco.

RESERVADO = 8            # el lado del bloque reservado, en píxeles, en la esquina de abajo a la derecha
HOLGURA = 2              # píxeles de aire alrededor de cada isla (el horneado agrega su propio margen)
MINIMA = 0.04            # una isla de menos de 4 cm por lado va al bloque reservado: no se nota su oclusión


def _raiz(padre, i):
    while padre[i] != i:
        padre[i] = padre[padre[i]]
        i = padre[i]
    return i


def partir_en_islas(lote):
    """
    Las islas de un lote: para cada cara, a qué isla pertenece; y para cada isla, la caja (a, b) de su proyección plana.
    Devuelve (isla_por_cara, proyeccion_por_vertice_de_cara (nl × 2), cajas (n × 4: amin, bmin, ancho, alto), con_ao (n)).
    """
    N, lv, lf = lote.N, lote.lv, lote.lf
    nf = len(lote.totales)
    eje = np.argmax(np.abs(N), axis=1)
    negativo = N[np.arange(nf), eje] < 0
    grupo = eje * 2 + negativo
    # Dos caras son de la misma isla si comparten un vértice y miran hacia el mismo lado.
    clave = lv.astype(np.int64) * 6 + grupo[lf]
    orden = np.argsort(clave, kind='stable')
    k, f = clave[orden], lf[orden]
    iguales = k[1:] == k[:-1]
    padre = list(range(nf))
    for a, b in zip(f[:-1][iguales].tolist(), f[1:][iguales].tolist()):
        ra, rb = _raiz(padre, a), _raiz(padre, b)
        if ra != rb:
            padre[rb] = ra
    raiz = np.array([_raiz(padre, i) for i in range(nf)], dtype=np.int64)
    _, isla_de_cara = np.unique(raiz, return_inverse=True)
    isla_de_cara = isla_de_cara.reshape(-1)
    n_islas = int(isla_de_cara.max()) + 1 if nf else 0
    P = lote.V[lv]
    e = eje[lf]
    a = np.where(e == 0, P[:, 2], P[:, 0])
    b = np.where(e == 1, P[:, 2], P[:, 1])
    isla_de_lazo = isla_de_cara[lf]
    orden = np.argsort(isla_de_lazo, kind='stable')
    s = isla_de_lazo[orden]
    inicios = np.r_[0, np.flatnonzero(s[1:] != s[:-1]) + 1]
    amin = np.minimum.reduceat(a[orden], inicios)
    amax = np.maximum.reduceat(a[orden], inicios)
    bmin = np.minimum.reduceat(b[orden], inicios)
    bmax = np.maximum.reduceat(b[orden], inicios)
    cajas = np.stack([amin, bmin, amax - amin, bmax - bmin], axis=-1)
    con_ao_cara = np.array([MATERIALES[m].get('ao', True) for m in lote.nombres_mat])[lote.cara_mat]
    # Una isla lleva oclusión si alguna de sus caras la lleva (en la práctica, todas o ninguna).
    con_ao = np.zeros(n_islas, dtype=bool)
    np.logical_or.at(con_ao, isla_de_cara, con_ao_cara)
    return isla_de_cara, np.stack([a, b], axis=-1), cajas, con_ao


def empaquetar_estantes(tamanos, lado, base_y):
    """Estantes de izquierda a derecha, de mayor a menor alto. `tamanos` son (ancho, alto) en píxeles con su holgura; devuelve las posiciones o None si no caben."""
    orden = sorted(range(len(tamanos)), key=lambda i: (-tamanos[i][1], -tamanos[i][0], i))
    pos = [None] * len(tamanos)
    x, y, fila = 0, base_y, 0
    for i in orden:
        w, hh = tamanos[i]
        if w > lado:
            return None
        if x + w > lado:
            x, y, fila = 0, y + fila, 0
        if y + hh > lado:
            return None
        pos[i] = (x, y)
        x += w
        fila = max(fila, hh)
    return pos


def armar_la_segunda_uv(lotes, lado):
    """
    Reparte el atlas entre todas las islas de todos los lotes y deja en cada lote `uv1` (una UV por vértice de cara).
    Devuelve un resumen: densidad base final en texeles por metro, número de islas y fracción de atlas ocupada.
    """
    todas = []        # (lote, isla, ancho_m, alto_m, densidad)
    por_lote = {}
    for l in lotes:
        if getattr(l, 'ob', None) is None:
            continue
        isla_de_cara, proy, cajas, con_ao = partir_en_islas(l)
        por_lote[l.nombre] = (isla_de_cara, proy, cajas, con_ao)
        for i in range(len(cajas)):
            if con_ao[i] and max(cajas[i, 2], cajas[i, 3]) >= MINIMA:
                todas.append((l, i, float(cajas[i, 2]), float(cajas[i, 3]), l.densidad))
    base_y = RESERVADO

    def tamano(k):
        return [(int(math.ceil(w * k * d)) + 2 * HOLGURA + 1, int(math.ceil(hh * k * d)) + 2 * HOLGURA + 1) for (_, _, w, hh, d) in todas]

    lo, hi = 1.0, 2000.0
    mejor = None
    for _ in range(26):
        k = (lo + hi) / 2
        pos = empaquetar_estantes(tamano(k), lado, base_y)
        if pos is None:
            hi = k
        else:
            lo, mejor = k, (k, pos)
    k, pos = mejor
    tam = tamano(k)
    ocupado = sum(w * hh for w, hh in tam) / float(lado * lado)
    colocadas = {}
    for (l, i, w, hh, d), (px, py) in zip(todas, pos):
        colocadas[(l.nombre, i)] = (px + HOLGURA, py + HOLGURA, k * d)
    for l in lotes:
        if getattr(l, 'ob', None) is None:
            continue
        isla_de_cara, proy, cajas, con_ao = por_lote[l.nombre]
        isla_de_lazo = isla_de_cara[l.lf]
        uv = np.empty((len(l.lv), 2))
        # Por omisión, el bloque reservado.
        uv[:] = ((lado - RESERVADO / 2) / lado, (RESERVADO / 2) / lado)
        for i in range(len(cajas)):
            c = colocadas.get((l.nombre, i))
            if c is None:
                continue
            x0, y0, escala = c
            m = isla_de_lazo == i
            uv[m, 0] = (x0 + (proy[m, 0] - cajas[i, 0]) * escala) / lado
            uv[m, 1] = (y0 + (proy[m, 1] - cajas[i, 1]) * escala) / lado
        l.uv1 = uv
        l.ob.data.uv_layers['UV-oclusion'].data.foreach_set('uv', uv.astype(np.float32).ravel())
    return dict(densidad_base=round(k, 1), islas=len(todas), ocupado=round(ocupado, 3))


def crear_la_imagen_de_oclusion(lado):
    """La imagen que llevan todos los materiales: de momento en blanco; el horneado la llena después."""
    img = bpy.data.images.new('oclusion', lado, lado, alpha=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.ones(lado * lado * 4, dtype=np.float32))
    img.pack()
    return img


def hornear_la_oclusion(lotes, img_final, lado, muestras, distancia=0.9):
    """
    Cycles en procesador, una sola pasada: todos los lotes se funden en una malla desechable cuya segunda UV es el atlas, y se
    hornea ahí con el colchón y la mesa quirúrgica puestos de oclusores (no se exportan: solo dan sombra de contacto al piso
    y a lo que está debajo). La semilla es fija, así que dos pasadas dan lo mismo.
    """
    escena = bpy.context.scene
    escena.render.engine = 'CYCLES'
    escena.cycles.device = 'CPU'
    escena.cycles.samples = muestras
    escena.cycles.use_denoising = False
    escena.cycles.seed = 0
    if escena.world is None:
        escena.world = bpy.data.worlds.new('mundo')
    escena.world.light_settings.distance = distancia
    V, caras, uvs, n = [], [], [], 0
    for l in lotes:
        if getattr(l, 'ob', None) is None:
            continue
        V.append(a_blender(l.V + l.pivote))
        inicio = 0
        for t in l.totales:
            caras.append([int(i) + n for i in l.lv[inicio:inicio + t]])
            inicio += int(t)
        uvs.append(l.uv1)
        n += len(l.V)
    V = np.concatenate(V)
    malla = bpy.data.meshes.new('horneado-sala')
    malla.from_pydata(V.tolist(), [], caras)
    malla.update()
    capa = malla.uv_layers.new(name='UV-oclusion')
    capa.data.foreach_set('uv', np.concatenate(uvs).astype(np.float32).ravel())
    objeto = bpy.data.objects.new('horneado-sala', malla)
    escena.collection.objects.link(objeto)
    # Los oclusores y fuera los lotes mismos (ya están en la malla desechable).
    ocluyen = []
    for nombre in ('colchon.glb', 'mesa-quirurgica.glb'):
        if (PABELLON / nombre).exists():
            ocluyen += importar(PABELLON / nombre)
    for l in lotes:
        if getattr(l, 'ob', None) is not None:
            l.ob.hide_render = True
    img = bpy.data.images.new('oclusion-horneado', lado, lado, alpha=False, float_buffer=True)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(np.ones(lado * lado * 4, dtype=np.float32))
    mat = bpy.data.materials.new('horneado')
    mat.use_nodes = True
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    mat.node_tree.nodes.active = tex
    malla.materials.append(mat)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    objeto.select_set(True)
    bpy.context.view_layer.objects.active = objeto
    inicio = time.time()
    bpy.ops.object.bake(type='AO', margin=6, margin_type='EXTEND', use_clear=False)
    print(f'  oclusión horneada: {lado}², {muestras} muestras, {time.time() - inicio:.0f} s', flush=True)
    pix = np.empty(lado * lado * 4, dtype=np.float32)
    img.pixels.foreach_get(pix)
    ao = pix.reshape(lado, lado, 4)[..., 0].astype(np.float64)
    if os.environ.get('SALA_DEPURAR_OCLUSION'):
        # Para buscar piezas negras: oclusión media y mínima de cada lote, sobre los texeles que sus vértices tocan.
        for l in lotes:
            if getattr(l, 'ob', None) is not None:
                xs = np.clip((l.uv1[:, 0] * lado).astype(int), 0, lado - 1)
                ys = np.clip((l.uv1[:, 1] * lado).astype(int), 0, lado - 1)
                v = ao[ys, xs]
                print(f'   AO {l.nombre:28s} media {v.mean():.2f}  mínima {v.min():.2f}  caras {len(l.totales)}', flush=True)
    # Un desenfoque de 3 × 3 lleva el ruido de las muestras a nada visible; la curva 1,35 afirma un poco las esquinas.
    suave = ao.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx or dy:
                suave += np.roll(np.roll(ao, dy, axis=0), dx, axis=1)
    ao = np.clip(suave / 9.0, 0.0, 1.0) ** 1.35
    ao[:RESERVADO, lado - RESERVADO:] = 1.0
    rgba = np.ones((lado, lado, 4), dtype=np.float32)
    rgba[..., :3] = ao[..., None].astype(np.float32)
    img_final.pixels.foreach_set(rgba.ravel())
    img_final.pack()
    for l in lotes:
        if getattr(l, 'ob', None) is not None:
            l.ob.hide_render = False
    for o in ocluyen:
        bpy.data.objects.remove(o)
    bpy.data.objects.remove(objeto)
    bpy.data.meshes.remove(malla)
    bpy.data.images.remove(img)
    return ao


# ================================================================================================= exportación


def exportar(ruta, raices):
    """
    El `.glb`, con Draco y las texturas en WebP (como `mesa-quirurgica.glb`). Los UV van cuantizados a 14 bits: el
    atlas de rótulos es de 2048 píxeles y a 12 bits un texel se movería medio píxel; las posiciones, a 14 bits sobre
    una sala de 7,6 m, dan un paso de medio milímetro.
    """
    ruta.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.view_layer.update()
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    pila = list(raices)
    while pila:
        o = pila.pop()
        o.select_set(True)
        pila.extend(o.children)
    bpy.context.view_layer.objects.active = raices[0]
    bpy.ops.export_scene.gltf(
        filepath=str(ruta), export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials='EXPORT',
        export_extras=False, export_cameras=False, export_lights=False, export_animations=False,
        export_vertex_color='NONE', export_attributes=False,
        export_image_format='WEBP', export_image_quality=CALIDAD_WEBP,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=14, export_draco_generic_quantization=12,
    )
    print(f'EXPORTADO {ruta}: {ruta.stat().st_size / 1024:.0f} KB', flush=True)


CALIDAD_WEBP = 84


def leer_glb(ruta):
    datos = Path(ruta).read_bytes()
    largo = struct.unpack_from('<I', datos, 12)[0]
    return json.loads(datos[20:20 + largo])


def informe_del_glb(ruta):
    """
    Lo que salió, medido en el archivo y no en lo que este guion cree haber hecho: peso total y por partes
    (geometría comprimida y cada imagen), triángulos, y los nombres de nodos y materiales que son el contrato con el simulador.
    """
    ruta = Path(ruta)
    g = leer_glb(ruta)
    vistas = g['bufferViews']
    geometria = 0
    triangulos = 0
    primitivas = 0
    for malla in g['meshes']:
        for p in malla['primitives']:
            primitivas += 1
            triangulos += g['accessors'][p['indices']]['count'] // 3
            draco = p.get('extensions', {}).get('KHR_draco_mesh_compression')
            if draco:
                geometria += vistas[draco['bufferView']]['byteLength']
    imagenes = {}
    for i, im in enumerate(g.get('images', [])):
        imagenes[im.get('name', f'imagen-{i}')] = vistas[im['bufferView']]['byteLength'] if 'bufferView' in im else 0
    # Qué textura es de cada material, para decir cuánto pesa lo que lleva cada uno.
    texturas = g.get('textures', [])
    de_material = {}
    for m in g['materials']:
        usadas = set()
        for clave in ('normalTexture', 'occlusionTexture', 'emissiveTexture'):
            if clave in m:
                usadas.add(clave)
        pbr = m.get('pbrMetallicRoughness', {})
        if 'baseColorTexture' in pbr:
            usadas.add('baseColorTexture')
        de_material[m['name']] = sorted(usadas)
    nodos = g['nodes']
    hijos = set(h for n in nodos for h in n.get('children', []))
    raices = [nodos[i]['name'] for i in g['scenes'][0]['nodes']]
    informe = {
        'archivo': ruta.name,
        'bytes': ruta.stat().st_size,
        'bytes_geometria': geometria,
        'bytes_imagenes': imagenes,
        'bytes_json_y_otros': ruta.stat().st_size - geometria - sum(imagenes.values()),
        'mallas': len(g['meshes']),
        'primitivas': primitivas,
        'triangulos': triangulos,
        'materiales': len(g['materials']),
        'texturas': len(texturas),
        'imagenes': len(g.get('images', [])),
        'extensiones': g.get('extensionsUsed', []),
        'raices': raices,
        'nodos': [n['name'] for n in nodos],
        'nombres_de_materiales': [m['name'] for m in g['materials']],
    }
    return informe


# ============================================================================================ las fotos


def vaciar():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def usar_el_procesador(muestras):
    """Cycles en el procesador, siempre: la tarjeta gráfica es de otro proceso y no se toca."""
    escena = bpy.context.scene
    escena.render.engine = 'CYCLES'
    escena.cycles.device = 'CPU'
    escena.cycles.samples = muestras
    escena.cycles.use_denoising = True
    try:
        escena.cycles.denoiser = 'OPENIMAGEDENOISE'
    except TypeError:
        pass
    escena.cycles.seed = 0
    escena.render.resolution_percentage = 100
    escena.render.image_settings.file_format = 'PNG'
    escena.view_settings.view_transform = 'Khronos PBR Neutral'


def luz_de_area(nombre, sitio, hacia, tam, potencia, color=(1.0, 0.98, 0.95), forma='RECTANGLE'):
    dato = bpy.data.lights.new(nombre, 'AREA')
    dato.shape = forma
    dato.size = tam[0]
    if forma == 'RECTANGLE':
        dato.size_y = tam[1]
    dato.energy = potencia
    dato.color = color
    ob = bpy.data.objects.new(nombre, dato)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = a_blender(np.asarray(sitio))
    ob.rotation_euler = (Vector(a_blender(np.asarray(hacia))) - Vector(a_blender(np.asarray(sitio)))).to_track_quat('-Z', 'Y').to_euler()
    return ob


def poner_las_luces_de_la_sala():
    """
    Las luces de la foto (el tono lo fijó el simulador: Neutral con exposición 1, cielo 0,55 y una lámpara fuerte sobre el paciente; una pared
    verde claro tiene que verse verde claro y no blanca): una por cada luminaria del techo, con la forma de la luminaria, y una débil más abajo para que el
    acero tenga algo que reflejar. No es el aspecto del simulador (esas son sus luces), solo hace legible el interior.
    """
    escena = bpy.context.scene
    mundo = bpy.data.worlds.new('mundo')
    escena.world = mundo
    mundo.use_nodes = True
    fondo = next(n for n in mundo.node_tree.nodes if n.type == 'BACKGROUND')
    fondo.inputs["Color"].default_value = (0.05, 0.06, 0.06, 1.0)
    fondo.inputs['Strength'].default_value = 1.0
    for k, (x, z, w, l) in enumerate(DISPOSICION['luminarias-techo']):
        luz_de_area(f'luminaria-{k}', (x, TECHO - 0.03, z), (x, TECHO - 1.0, z), (w * 0.9, l * 0.9), 42.0, (1.0, 0.99, 0.96))
    # Dos para modelar la camilla.
    luz_de_area('sobre-la-camilla', (0.0, TECHO - 0.4, 0.0), (0.0, SUELO, 0.0), (1.6, 1.6), 70.0, (1.0, 0.99, 0.97))
    luz_de_area('relleno-cabecera', (0.0, TECHO - 0.6, -2.0), (0.0, 0.0, 0.0), (2.5, 1.0), 22.0)
    luz_de_area('relleno-pies', (0.0, TECHO - 0.6, 2.0), (0.0, 0.0, 0.0), (2.5, 1.0), 22.0)


def camara_de_foto(sitio, hacia, focal=20.0, ortografica=None):
    dato = bpy.data.cameras.new('camara')
    dato.lens = focal
    dato.clip_start, dato.clip_end = 0.03, 80.0
    if ortografica:
        dato.type = 'ORTHO'
        dato.ortho_scale = ortografica
    ob = bpy.data.objects.new('camara', dato)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = a_blender(np.asarray(sitio, float))
    d = Vector(a_blender(np.asarray(hacia, float))) - Vector(a_blender(np.asarray(sitio, float)))
    ob.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = ob
    return ob


def emular_la_cara_unica():
    """
    Cycles no sabe de caras traseras ocultas, y el simulador sí: paredes, techo y piso son de una cara y desde atrás no existen. Para que
    la foto muestre lo que verá el simulador, a cada material de una cara se le pone un Mix con «transparente» donde la cara es la trasera.
    Así la cenital sin techo prueba también que lo pegado al techo no tapa nada, y las paredes dejan de verse desde fuera.
    """
    for m in bpy.data.materials:
        if not m.use_nodes or not m.use_backface_culling:
            continue
        a = m.node_tree
        salida = next((n for n in a.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output), None)
        if salida is None or not salida.inputs['Surface'].links:
            continue
        origen = salida.inputs['Surface'].links[0].from_socket
        trans = a.nodes.new('ShaderNodeBsdfTransparent')
        geo = a.nodes.new('ShaderNodeNewGeometry')
        mezcla = a.nodes.new('ShaderNodeMixShader')
        a.links.new(geo.outputs['Backfacing'], mezcla.inputs['Fac'])
        a.links.new(origen, mezcla.inputs[1])
        a.links.new(trans.outputs['BSDF'], mezcla.inputs[2])
        a.links.new(mezcla.outputs['Shader'], salida.inputs['Surface'])


def importar(ruta):
    antes = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(ruta))
    return [o for o in bpy.data.objects if o not in antes]


def el_colchon_de_la_foto():
    """La camilla, solo para las fotos: el colchón oscuro y la mesa de verdad, para ver la sala con su centro."""
    nuevos = []
    colchon = PABELLON / 'colchon.glb'
    if colchon.exists():
        for o in importar(colchon):
            nuevos.append(o)
            if o.type == 'MESH':
                o.data.materials.clear()
                m = bpy.data.materials.new('colchon-foto')
                m.use_nodes = True
                p = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
                p.inputs['Base Color'].default_value = (*lineal((0.105, 0.110, 0.125)), 1.0)
                p.inputs['Roughness'].default_value = 0.46
                o.data.materials.append(m)
    mesa = PABELLON / 'mesa-quirurgica.glb'
    if mesa.exists():
        nuevos += importar(mesa)
    return nuevos


def fotografiar(nombre, camaras, ocultar=(), muestras=48, ancho=1600, alto=1000, carpeta=None):
    """Una foto por cada cámara de `camaras` (nombre → (sitio, hacia, focal o ('orto', escala))), con ciertos objetos ocultos."""
    carpeta = carpeta or SALIDA / 'vistas'
    carpeta.mkdir(parents=True, exist_ok=True)
    escena = bpy.context.scene
    escena.render.resolution_x, escena.render.resolution_y = ancho, alto
    escena.cycles.samples = muestras
    rutas = []
    for vista, (sitio, hacia, foco) in camaras.items():
        for c in [o for o in bpy.data.objects if o.type == 'CAMERA']:
            bpy.data.objects.remove(c)
        if isinstance(foco, tuple):
            camara_de_foto(sitio, hacia, 50.0, ortografica=foco[1])
        else:
            camara_de_foto(sitio, hacia, foco)
        for o in ocultar:
            o.hide_render = True
        ruta = carpeta / (f'{nombre}-{vista}.png' if vista else f'{nombre}.png')
        escena.render.filepath = str(ruta)
        inicio = time.time()
        bpy.ops.render.render(write_still=True)
        for o in ocultar:
            o.hide_render = False
        print(f'VISTA {ruta.name} ({time.time() - inicio:.0f} s)', flush=True)
        rutas.append(ruta)
    return rutas


# La planta se fotografía desde arriba y en ortogonal; el margen que sobra alrededor de la sala (10,2 m de imagen para 7,6 m de sala)
# es donde la anotación pone los números de lo que va en las paredes y las coordenadas.
ESCALA_DE_LA_PLANTA = 10.2
PIXELES_DE_LA_PLANTA = 1600


def anotar_la_planta(base, huellas):
    """
    Pone encima de la vista cenital lo que dice `DISPOSICION`: cada pieza con su número y su leyenda, la zona libre y las
    coordenadas. Lo hace `texturas_sala.py --planta` con el Python del sistema, porque Pillow no está en el de Blender.
    """
    datos = datos_de_la_planta(huellas)
    datos['escala'] = PIXELES_DE_LA_PLANTA / ESCALA_DE_LA_PLANTA
    ruta_datos = SALIDA / 'sala' / 'planta.json'
    ruta_datos.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding='utf-8')
    destino = SALIDA / 'vistas' / 'sala-planta.png'
    destino.parent.mkdir(parents=True, exist_ok=True)
    python = shutil.which('python') or shutil.which('python3')
    if python is None:
        raise SystemExit('Para anotar la planta hace falta un Python con Pillow: `python scripts/pabellon/texturas_sala.py --planta`.')
    subprocess.run([python, str(AQUI / 'texturas_sala.py'), '--planta', str(ruta_datos), str(base), str(destino)], check=True)
    print(f'VISTA {destino.name} (anotada)', flush=True)
    return destino


# Los puntos de vista: sentado en la camilla, con los ojos a 0,62 m sobre el colchón, y una cámara por lado.
OJOS = 0.62

VISTAS = {
    'cabecera': ((0.0, OJOS, 0.15), (0.0, 0.55, -3.8), 20.0),
    'pies': ((0.0, OJOS, -0.15), (0.0, 0.55, 3.8), 20.0),
    'costado-derecho': ((0.0, OJOS, 0.0), (3.8, 0.55, 0.0), 20.0),
    'costado-izquierdo': ((0.0, OJOS, 0.0), (-3.8, 0.55, 0.0), 20.0),
    'rincon': ((-0.9, OJOS, 0.9), (3.8, 0.9, -3.8), 20.0),
}


def camara_cerca(nombre, distancia=2.1, altura=None, focal=28.0):
    """Una cámara que mira de frente una pieza de `DISPOSICION`, desde `distancia` metros hacia el centro de la sala: el detalle de cerca."""
    d = DISPOSICION[nombre]
    if 'pared' in d:
        sitio, giro = _PARED[d['pared']][0](d['centro']), _PARED[d['pared']][1]
        x, _, z = sitio
        mira = (x, SUELO + d.get('altura', 1.2), z)
    else:
        x, z, giro = d['x'], d['z'], d.get('giro', 0.0)
        mira = (x, SUELO + (altura or 0.8), z)
    frente = np.array([sin(radians(giro)), 0.0, cos(radians(giro))])
    sitio = np.array(mira) + frente * distancia
    sitio[1] = mira[1] + 0.25
    return tuple(sitio), mira, focal


def hacer_las_vistas(args, ruta_glb, cuales=None, huellas=None):
    vaciar()
    usar_el_procesador(args.muestras)
    poner_las_luces_de_la_sala()
    importar(ruta_glb)
    emular_la_cara_unica()
    el_colchon_de_la_foto()
    bpy.context.view_layer.update()
    techo = bpy.data.objects.get('techo')
    colgantes = bpy.data.objects.get('colgantes')
    escogidas = (cuales or 'todas').split(',')
    quiere = lambda n: 'todas' in escogidas or n in escogidas
    rutas = []
    dentro = {k: v for k, v in VISTAS.items() if quiere(k)}
    if dentro:
        rutas += fotografiar('sala', dentro, muestras=args.muestras)
    cerca = {n: camara_cerca(n[6:]) for n in escogidas if n.startswith('cerca-')}
    if cerca:
        rutas += fotografiar('sala', cerca, muestras=args.muestras)
    # Sin techo la sala queda abierta al cielo, y las caras de arriba se ven negras: un poco de luz de mundo las levanta.
    # «Sin techo» es literal: el cielo del techo se quita de la foto. Lo pegado a él (plénum, luminarias, rejillas) sí se deja, con la
    # cara única emulada, para comprobar que desde arriba no existe. El techo mismo no puede quedarse emulado: las placas de anclaje de
    # lo que cuelga están un milímetro más abajo y, tras atravesar la hoja «transparente», el rayo de Cycles salta esa placa y
    # dibuja su fondo por dentro, negro.
    ocultos = [techo] if techo is not None else []
    if quiere('cenital') or quiere('planta'):
        fondo = bpy.context.scene.world.node_tree.nodes['Background']
        fondo.inputs['Strength'].default_value = 1.6
        fondo.inputs['Color'].default_value = (0.62, 0.68, 0.66, 1.0)
    if quiere('cenital'):
        rutas += fotografiar('sala', {'cenital': ((0.0, 8.6, 0.8), (0.0, 0.0, 0.0), 24.0)}, ocultar=ocultos, muestras=args.muestras)
    if quiere('planta'):
        ocultos_planta = (list(colgantes.children_recursive) if colgantes is not None else []) + ocultos
        base = fotografiar('planta-base', {'': ((0.0, 8.0, 0.0), (0.0, 0.0, 0.0), ('orto', ESCALA_DE_LA_PLANTA))}, ocultar=ocultos_planta,
                           muestras=max(16, args.muestras // 2), ancho=PIXELES_DE_LA_PLANTA, alto=PIXELES_DE_LA_PLANTA, carpeta=SALIDA / 'sala')[0]
        rutas.append(anotar_la_planta(base, huellas))
    return rutas


# ================================================================================================== principal


def texturas_si_faltan():
    """Las texturas las hace `texturas_sala.py` con Pillow, que el Python de Blender no trae: si faltan, se lanza con el del sistema."""
    esperadas = ['etiquetas', 'normal-acero', 'normal-vinilo', 'normal-tejido', 'normal-goma', 'perforado'] + list(TX.PANTALLAS)
    if all((TEXTURAS / f'{n}.png').exists() for n in esperadas):
        return
    python = shutil.which('python') or shutil.which('python3')
    if python is None:
        raise SystemExit('Faltan las texturas y no hay un Python con Pillow para hacerlas: `python scripts/pabellon/texturas_sala.py`.')
    subprocess.run([python, str(AQUI / 'texturas_sala.py')], check=True)


def construir_todo():
    LOTES.clear()
    env = construir_la_envolvente()
    construir_la_puerta_corrediza()
    construir_la_puerta_de_paso()
    construir_la_ventana()
    construir_el_pasillo()
    construir_los_perfiles(env)
    construir_la_maquina_de_anestesia()
    construir_el_carro_de_anestesia()
    construir_el_banco_del_anestesista()
    construir_el_poste_de_suero()
    construir_la_columna_de_gases()
    construir_los_estantes('estantes-noroeste', 1.20, 0.50, 1.95, [0.18, 0.58, 0.98, 1.38, 1.78], 21, 1)
    construir_los_estantes('estantes-oeste', 1.10, 0.50, 1.95, [0.18, 0.58, 0.98, 1.38, 1.78], 22, 0)
    construir_los_armarios_del_norte()
    construir_la_torre_de_insumos()
    construir_las_repisas_del_norte()
    construir_el_gabinete_de_calentamiento()
    construir_el_carro_de_instrumental()
    construir_el_mostrador_del_pacs()
    construir_el_monitor_del_pacs()
    construir_la_unidad_electroquirurgica()
    construir_el_aspirador()
    construir_el_arco_en_c()
    construir_el_taburete_del_cirujano()
    construir_el_cubo_de_patada()
    construir_el_cubo('cubo-rojo', 'rojo', True)
    construir_el_cubo('cubo-negro', 'negro', False)
    construir_el_lavamanos()
    construir_el_tapete()
    construir_el_perchero_de_plomo()
    construir_el_dispensador_de_gel()
    construir_el_extintor()
    construir_el_panel_de_control()
    construir_el_reloj()
    construir_la_pizarra()
    construir_el_desague()
    construir_los_accesorios_de_pared()
    construir_la_cialitica('cialitica-1')
    construir_la_cialitica('cialitica-2')
    construir_el_boom_de_monitores()
    construir_el_plenum()
    construir_lo_del_techo()
    construir_las_rejillas_de_retorno()
    comprobar_el_techo()
    construir_los_protectores_de_esquina()
    comprobar_las_caras()
    return env


def principal():
    args = argumentos()
    destino = Path(args.destino)
    ruta_glb = destino / 'sala.glb'
    inicio = time.time()
    huellas = None
    if not args.solo_vistas:
        texturas_si_faltan()
        vaciar()
        usar_el_procesador(8)
        construir_todo()
        huellas = comprobar_zonas()
        img_ao = None if args.sin_oclusion else crear_la_imagen_de_oclusion(args.lado_oclusion)
        mats = crear_los_materiales(img_ao)
        for l in LOTES:
            construir_objeto(l, mats)
        raices = armar_la_jerarquia()
        bpy.context.view_layer.update()
        resumen_ao = None
        if img_ao is not None:
            resumen_ao = armar_la_segunda_uv(LOTES, args.lado_oclusion)
            print('SEGUNDA UV', resumen_ao, flush=True)
            ao = hornear_la_oclusion(LOTES, img_ao, args.lado_oclusion, args.muestras_oclusion)
            guardar_gris(SALIDA / 'sala-oclusion.png', ao)
        exportar(ruta_glb, [raices['estructura'], raices['equipos'], raices['colgantes']])
        informe = informe_del_glb(ruta_glb)
        informe['oclusion'] = resumen_ao
        informe['luces'] = sorted(l.nombre for l in LOTES if l.grupo == 'colgantes')
        (SALIDA / 'sala-informe.json').write_text(json.dumps(informe, ensure_ascii=False, indent=1), encoding='utf-8')
        print('INFORME', json.dumps(informe, ensure_ascii=False, indent=1), flush=True)
    if args.vistas or args.solo_vistas:
        if huellas is None:
            # Solo las fotos: la geometría no se exporta, pero la planta necesita lo que ocupa cada pieza, y se mide de ella.
            construir_todo()
            huellas = comprobar_zonas()
        hacer_las_vistas(args, ruta_glb, args.vistas_cuales, huellas)
    print(f'TODO en {time.time() - inicio:.0f} s', flush=True)


def guardar_gris(ruta, matriz):
    """Una matriz 0…1 (fila 0 abajo, como las imágenes de Blender) a un PNG de grises, para mirarla."""
    img = bpy.data.images.new('gris-temporal', matriz.shape[1], matriz.shape[0], alpha=False)
    rgba = np.ones((*matriz.shape, 4), dtype=np.float32)
    rgba[..., :3] = matriz[..., None]
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = str(ruta)
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


if __name__ == '__main__':
    principal()

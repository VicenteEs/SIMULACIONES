"""
Lectura del atlas anatómico desde Python (P-006, E1).

El atlas se prepara y se sirve con Node (`scripts/atlas/*.mjs`, `src/atlas/*.ts`); las fascias
se generan con numpy y scipy, que no existen en Node. Esto es lo mínimo que hace falta para
leer lo que ya está preparado en `public/atlas/`: el catálogo, con las correcciones de sistema
aplicadas, y la geometría de cada pieza.

Se lee el mismo formato que lee el navegador y el exportador del servidor (`src/atlas/formato.ts`):
cada pieza vive en un paquete `cuerpo-N.bin.gz`, y `pos`, `nor` e `idx` son desplazamientos en
bytes dentro del paquete ya descomprimido. Posiciones en flotantes de 32 bits, normales en enteros
de 16 bits con signo y triángulos en enteros de 32 sin signo. Las coordenadas son del cuerpo
entero: metros, Y hacia arriba, con los pies en y = 0 y el lado derecho del sujeto en x negativa.
"""

import gzip
import json
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parents[3]
DIRECTORIO_DEL_ATLAS = RAIZ / 'public' / 'atlas'
CORRECCIONES_DE_SISTEMA = RAIZ / 'src' / 'atlas' / 'correcciones-de-sistema.json'


class Atlas:
    """El catálogo corregido y el acceso a la geometría de sus piezas."""

    def __init__(self, directorio=DIRECTORIO_DEL_ATLAS, corregir=True):
        self.directorio = Path(directorio)
        self.catalogo = json.loads((self.directorio / 'catalogo.json').read_text(encoding='utf8'))
        # Las correcciones se aplican aquí, al leer, y no en `catalogo.json`: es lo mismo que hacen
        # `corregirCatalogo` en el navegador y en el servidor (`src/atlas/clasificacion.ts`). Una
        # fascia crural que dejara fuera el tibial anterior porque el atlas de origen lo mete en el
        # esqueleto saldría mal sin ningún error.
        if corregir:
            correcciones = json.loads(CORRECCIONES_DE_SISTEMA.read_text(encoding='utf8'))
            for pieza in self.catalogo['piezas']:
                destino = correcciones.get(pieza['nombre'])
                if destino:
                    pieza['sistema'] = destino
        self.piezas = self.catalogo['piezas']
        self._por_id = {p['id']: p for p in self.piezas}
        self._paquetes = {}

    # ------------------------------------------------------------------ buscar

    def pieza(self, id_):
        return self._por_id[id_]

    def por_nombre(self, nombre):
        """Todas las piezas con ese nombre original: el atlas repite nombres en piezas distintas."""
        return [p for p in self.piezas if p['nombre'] == nombre]

    def seleccionar(self, regiones=None, sistemas=None, nombres=None, ids=None, filtro=None):
        """
        Las piezas que cumplen todo lo que se pida.

        `nombres` y `ids` son listas; `filtro` es una función de la pieza que devuelve verdadero o
        falso, para lo que las demás no dicen (una caja, una palabra en el nombre).
        """
        salida = []
        for p in self.piezas:
            if regiones is not None and p['region'] not in regiones:
                continue
            if sistemas is not None and p['sistema'] not in sistemas:
                continue
            if nombres is not None and p['nombre'] not in nombres:
                continue
            if ids is not None and p['id'] not in ids:
                continue
            if filtro is not None and not filtro(p):
                continue
            salida.append(p)
        return salida

    # --------------------------------------------------------------- geometría

    def _paquete(self, indice):
        if indice not in self._paquetes:
            archivo = self.directorio / self.catalogo['paquetes'][indice]['archivo']
            self._paquetes[indice] = gzip.decompress(archivo.read_bytes())
        return self._paquetes[indice]

    def malla(self, pieza):
        """
        Posiciones (N×3, float32) y triángulos (M×3, uint32) de una pieza, como copias.

        Copias y no vistas: quien las modifique no puede estropear el paquete que otra pieza
        comparte, y quien las guarde no retiene el paquete entero en memoria.
        """
        if isinstance(pieza, str):
            pieza = self._por_id[pieza]
        bufer = self._paquete(pieza['paquete'])
        pos = np.frombuffer(bufer, dtype='<f4', count=pieza['vertices'] * 3, offset=pieza['pos'])
        idx = np.frombuffer(bufer, dtype='<u4', count=pieza['indices'], offset=pieza['idx'])
        return pos.reshape(-1, 3).copy(), idx.reshape(-1, 3).copy()

    def malla_unida(self, piezas):
        """Varias piezas en una sola malla, con los índices corridos (lo que hace `fusionar` en TypeScript)."""
        vs, fs, base = [], [], 0
        for p in piezas:
            v, f = self.malla(p)
            vs.append(v)
            fs.append(f + base)
            base += len(v)
        if not vs:
            return np.zeros((0, 3), np.float32), np.zeros((0, 3), np.uint32)
        return np.vstack(vs), np.vstack(fs).astype(np.uint32)

"""
Corte transversal de control (P-006): el equivalente a la imagen B del PDF, hecho con el atlas.

    python scripts/atlas/fascias/corte_transversal.py --y 0.25 --lado derecho --salida salida/vistas/corte_pierna.png

Parte de las piezas del atlas y de las fascias generadas por el plano horizontal `y`, y dibuja la
rebanada vista desde arriba: la piel como contorno, los músculos y los huesos rellenos, y cada
pieza de fascia como una línea gruesa de su color.

Por qué no se hace con el corte de Blender: las mallas del atlas no son cerradas, y tapar el corte
de una malla abierta con `holes_fill` deja la mayoría de los músculos huecos (se probó, y es lo que
enseñó la primera versión de esto). Aquí se dibujan los segmentos de corte sobre una imagen y se
rellena por inundación desde fuera, que es lo mismo que hace `campo.rellenar` en tres dimensiones y
tiene el mismo comportamiento con las mallas abiertas.

Sirve de prueba visual de cuatro cosas: que la fascia **envuelve** lo que debe, que **no entra** en
un músculo, que **puentea** los surcos entre músculos y no se mete en ellos, y que queda **entre**
la piel y el músculo.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

from atlas import Atlas  # noqa: E402

SALIDA = AQUI / 'salida'
PIXELES_POR_METRO = 2400  # 0,42 mm por píxel

COLOR_DE_SISTEMA = {
    'skeletal': (236, 230, 214),
    'muscular': (170, 70, 62),
    'connective': (216, 201, 168),
    'integumentary': (220, 192, 168),
}
COLORES_DE_FASCIA = [
    (240, 120, 160), (60, 120, 240), (50, 190, 110), (240, 150, 40), (150, 90, 230), (40, 190, 200),
]


def segmentos_en_y(v, f, y0):
    """Los segmentos (x1, z1, x2, z2) donde el plano y = y0 corta una malla."""
    d = v[:, 1] - y0
    s = d[f]
    cruza = (s.min(axis=1) < 0) & (s.max(axis=1) >= 0)
    f = f[cruza]
    if len(f) == 0:
        return np.zeros((0, 4))
    puntos = []
    for a, b in ((0, 1), (1, 2), (2, 0)):
        da, db = d[f[:, a]], d[f[:, b]]
        corta = (da < 0) != (db < 0)
        t = np.where(corta, da / np.where(corta, da - db, 1), 0)
        p = v[f[:, a]] + t[:, None] * (v[f[:, b]] - v[f[:, a]])
        puntos.append((corta, p))
    salida = []
    for k in range(len(f)):
        hallados = [p[k] for corta, p in puntos if corta[k]]
        if len(hallados) == 2:
            salida.append([hallados[0][0], hallados[0][2], hallados[1][0], hallados[1][2]])
    return np.asarray(salida)


def rasterizar(segmentos, caja, grosor=2):
    (x0, z0), (x1, z1) = caja
    ancho = int((x1 - x0) * PIXELES_POR_METRO) + 1
    alto = int((z1 - z0) * PIXELES_POR_METRO) + 1
    imagen = Image.new('L', (ancho, alto), 0)
    dibujo = ImageDraw.Draw(imagen)
    for ax, az, bx, bz in segmentos:
        # El eje x del cuerpo (derecha = negativa) se dibuja con la derecha del sujeto a la izquierda de
        # la imagen, como un corte visto desde los pies; z positiva (delante) arriba.
        dibujo.line(
            [((ax - x0) * PIXELES_POR_METRO, (z1 - az) * PIXELES_POR_METRO),
             ((bx - x0) * PIXELES_POR_METRO, (z1 - bz) * PIXELES_POR_METRO)],
            fill=255, width=grosor,
        )
    return np.asarray(imagen) > 0


def relleno_de(contorno):
    """Lo que encierra un contorno aunque tenga huecos pequeños: se engrosa, se rellena y se vuelve a adelgazar."""
    grueso = ndi.binary_dilation(contorno, iterations=2)
    rell = ndi.binary_fill_holes(grueso)
    return ndi.binary_erosion(rell, iterations=2)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--y', type=float, required=True)
    p.add_argument('--lado', default='derecho', choices=['derecho', 'izquierdo'])
    p.add_argument('--salida', required=True)
    p.add_argument('--ventana', type=float, default=0.30, help='Lado de la ventana, en metros.')
    p.add_argument('--grupo', default=None)
    args = p.parse_args()

    atlas = Atlas()
    manifiesto = json.loads((SALIDA / 'manifiesto.json').read_text(encoding='utf8'))
    izq = args.lado == 'izquierdo'
    fascias = [r for r in manifiesto['piezas'] if r['id'].endswith('M') == izq and (not args.grupo or r.get('grupo') == args.grupo)]

    # La ventana se centra en el eje de lo que haya a esa altura.
    cajas = [r['caja'] for r in fascias if r['caja'][0][1] <= args.y <= r['caja'][1][1]]
    if not cajas:
        raise SystemExit(f'Ninguna fascia llega a y = {args.y}.')
    cx = np.mean([(c[0][0] + c[1][0]) / 2 for c in cajas])
    cz = np.mean([(c[0][2] + c[1][2]) / 2 for c in cajas])
    mitad = args.ventana / 2
    caja = ((cx - mitad, cz - mitad), (cx + mitad, cz + mitad))

    lienzo = np.full((int(args.ventana * PIXELES_POR_METRO) + 1,) * 2 + (3,), 238, np.uint8)

    def pintar(mascara, color):
        lienzo[mascara[: lienzo.shape[0], : lienzo.shape[1]]] = color

    # Piel: solo el contorno.
    piel = atlas.por_nombre('Skin')[0]
    v, f = atlas.malla(piel)
    seg = segmentos_en_y(v.astype(np.float64), f.astype(np.int64), args.y)
    if len(seg):
        seg = seg[(np.abs((seg[:, 0] + seg[:, 2]) / 2 - cx) < mitad) & (np.abs((seg[:, 1] + seg[:, 3]) / 2 - cz) < mitad)]
        pintar(rasterizar(seg, caja, 5), COLOR_DE_SISTEMA['integumentary'])

    region = [f'miembro-inferior-{args.lado}', f'pie-{args.lado}']
    piezas = atlas.seleccionar(regiones=region, sistemas=['muscular', 'connective', 'skeletal'])
    piezas += atlas.seleccionar(filtro=lambda q: any(e in q['nombre'].lower() for e in ('gluteus', 'tensor fasciae', 'hip bone')) and izq == ('left' in q['nombre'].lower()))
    orden = {'muscular': 0, 'connective': 1, 'skeletal': 2}
    piezas = sorted({q['id']: q for q in piezas}.values(), key=lambda q: orden[q['sistema']])
    for q in piezas:
        if not (q['caja'][0][1] <= args.y <= q['caja'][1][1]):
            continue
        v, f = atlas.malla(q)
        seg = segmentos_en_y(v.astype(np.float64), f.astype(np.int64), args.y)
        if not len(seg):
            continue
        contorno = rasterizar(seg, caja, 2)
        base = np.array(COLOR_DE_SISTEMA[q['sistema']], int)
        if q['sistema'] == 'muscular':
            base = np.clip(base + (hash(q['id']) % 31 - 15), 0, 255)
        pintar(relleno_de(contorno), tuple(int(c) for c in base))
        pintar(contorno, tuple(int(c * 0.55) for c in base))

    # Fascias, encima de todo y gruesas.
    for k, r in enumerate(fascias):
        datos = (SALIDA / 'piezas' / f"{r['id']}.bin").read_bytes()
        n, m = r['vertices'], r['indices']
        pos = np.frombuffer(datos, '<f4', n * 3, 0).reshape(-1, 3).astype(np.float64)
        desde = n * 18
        desde += (-desde) % 4
        idx = np.frombuffer(datos, '<u4', m, desde).reshape(-1, 3).astype(np.int64)
        seg = segmentos_en_y(pos, idx, args.y)
        if not len(seg):
            continue
        pintar(rasterizar(seg, caja, 4), COLORES_DE_FASCIA[k % len(COLORES_DE_FASCIA)])
        print(f"  {r['id']} {r['nombre']}: {len(seg)} segmentos de corte")

    Path(args.salida).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(lienzo).save(args.salida)
    print('CORTE', args.salida)


if __name__ == '__main__':
    main()

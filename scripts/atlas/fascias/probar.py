"""
Pruebas del motor de fascias (P-006, E1). Se ejecutan a mano, sin dependencias nuevas:

    python scripts/atlas/fascias/probar.py

No son de vitest porque el motor es Python y la integración continua del proyecto no lo
tiene instalado; lo que sí comprueba vitest son los **resultados**, en `public/atlas/`
(`tests/unit/fascias.test.ts`). Aquí se prueba cada pieza del motor contra una forma de
tamaño conocido, que es donde un error de media casilla o de orientación aparece con números.
"""

import math
import sys
import time
from pathlib import Path

# La consola de Windows no es UTF-8 por omisión y los mensajes llevan tildes.
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import campo as C  # noqa: E402
import malla as M  # noqa: E402
from atlas import Atlas  # noqa: E402

FALLOS = []


def comprobar(nombre, condicion, detalle=''):
    estado = 'ok    ' if condicion else 'FALLÓ '
    print(f'{estado}{nombre}' + (f'  ({detalle})' if detalle else ''))
    if not condicion:
        FALLOS.append(nombre)


def esfera_en_la_rejilla(radio, h, centro=(0.0, 0.0, 0.0)):
    """Un relleno que es una esfera de radio conocido, hecho a mano (no por el motor)."""
    rejilla = C.Rejilla.sobre([-radio] * 3, [radio] * 3, h, margen=4 * h + 0.02)
    ejes = rejilla.centros()
    x, y, z = np.meshgrid(*ejes, indexing='ij')
    dentro = (x - centro[0]) ** 2 + (y - centro[1]) ** 2 + (z - centro[2]) ** 2 <= radio**2
    return rejilla, dentro


def prueba_esfera():
    r, h = 0.05, 0.002
    rejilla, dentro = esfera_en_la_rejilla(r, h)
    campo = C.suavizar(C.campo_con_signo(dentro, h), 1.0)
    v, f = C.superficie_de_la_rejilla(campo, rejilla)
    volumen = M.volumen_con_signo(v, f)
    esperado = 4 / 3 * math.pi * r**3
    comprobar('esfera: el volumen sale dentro del 3 %', abs(volumen - esperado) / esperado < 0.03,
              f'{volumen * 1e6:.1f} cm³ frente a {esperado * 1e6:.1f}')
    area = M.area_total(v, f)
    comprobar('esfera: el área sale dentro del 3 %', abs(area - 4 * math.pi * r**2) / (4 * math.pi * r**2) < 0.03)
    n = M.normales_de_caras(v, f)
    centro_cara = v[f].mean(axis=1)
    hacia_fuera = np.sum(n * centro_cara, axis=1) > 0
    comprobar('esfera: el 100 % de las caras mira hacia fuera', hacia_fuera.all(), f'{hacia_fuera.mean() * 100:.2f} %')
    bordes, mal = M.aristas_de_borde(f)
    comprobar('esfera: malla cerrada y sin aristas triples', bordes == 0 and mal == 0, f'{bordes} de borde, {mal} triples')
    comprobar('esfera: centrada (el cero está en la cara y no media casilla corrido)',
              np.abs(v.mean(axis=0)).max() < 0.0007, f'{np.abs(v.mean(axis=0)).max() * 1000:.3f} mm')
    aristas = np.unique(np.sort(np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]), axis=1), axis=0)
    comprobar('esfera: característica de Euler = 2', len(v) - len(aristas) + len(f) == 2)
    return v, f


def prueba_taubin(v, f):
    antes = M.volumen_con_signo(v, f)
    despues = M.volumen_con_signo(M.suavizar_taubin(v, f, 10), f)
    comprobar('Taubin: el volumen cambia menos del 1 %', abs(despues - antes) / antes < 0.01,
              f'{(despues - antes) / antes * 100:+.3f} %')


def prueba_cierre():
    h = 0.002
    # Dos cilindros paralelos de 20 mm de diámetro, separados 10 mm.
    rejilla = C.Rejilla.sobre([-0.04, -0.03, -0.03], [0.04, 0.03, 0.03], h, margen=0.04)
    x, y, z = np.meshgrid(*rejilla.centros(), indexing='ij')

    def cilindro(cx):
        return (x - cx) ** 2 + z**2 <= 0.01**2

    dos = (cilindro(-0.015) | cilindro(0.015)) & (np.abs(y) <= 0.03)
    chico = C.cierre(dos, 0.003, h)
    grande = C.cierre(dos, 0.008, h)
    ix, iy, iz = [int(np.floor((0 - rejilla.origen[i]) / h)) for i in range(3)]
    comprobar('cierre: con radio menor que medio hueco no los une', not chico[ix, iy, iz])
    comprobar('cierre: con radio mayor que medio hueco los une', bool(grande[ix, iy, iz]))
    solo = cilindro(0.0) & (np.abs(y) <= 0.03)
    cerrado = C.cierre(solo, 0.008, h)
    comprobar('cierre: lo convexo no pierde nada y gana menos del 3 % (el borde digital del círculo)',
              not (solo & ~cerrado).any() and int((cerrado & ~solo).sum()) / solo.sum() < 0.03,
              f'{int((cerrado & ~solo).sum())} voxeles de {int(solo.sum())}')


def prueba_relleno_de_una_malla_abierta():
    # Una cáscara esférica con un agujero de 6 mm: la inundación no debe colarse.
    r, h = 0.04, 0.002
    azar = np.random.default_rng(3)
    p = azar.normal(size=(60000, 3))
    p = r * p / np.linalg.norm(p, axis=1, keepdims=True)
    p = p[~((p[:, 2] > r * 0.99) & (np.hypot(p[:, 0], p[:, 1]) < 0.003))]
    rejilla = C.Rejilla.sobre([-r] * 3, [r] * 3, h, margen=0.03)
    ocupacion = C.ocupar(rejilla, p)
    relleno = C.rellenar(ocupacion, engrosar=1)
    esperado = 4 / 3 * math.pi * r**3 * 1000
    medido = C.volumen_de_la_mascara(relleno, h)
    comprobar('relleno: una cáscara con un agujero de 6 mm se rellena entera (no se cuela la inundación)',
              0.95 * esperado < medido < 1.15 * esperado, f'{medido:.3f} L frente a {esperado:.3f}')
    # El sesgo del borde, medido: es lo que `SESGO_DEL_RELLENO` descuenta.
    campo = C.campo_con_signo(relleno, h)
    v, f = C.superficie_de_la_rejilla(campo, rejilla)
    sesgo = (np.linalg.norm(v, axis=1).mean() - r) / h
    comprobar('relleno: el borde sobresale lo que dice SESGO_DEL_RELLENO (±0,15 casillas)',
              abs(sesgo - C.SESGO_DEL_RELLENO) < 0.15, f'{sesgo:.2f} casillas')
    v, f = C.superficie_de_la_rejilla(campo, rejilla, nivel=-C.SESGO_DEL_RELLENO * h)
    corregido = np.linalg.norm(v, axis=1).mean() - r
    comprobar('relleno: con el nivel corregido la superficie cae a menos de 0,3 casillas de la verdadera',
              abs(corregido) < 0.3 * h, f'{corregido * 1000:+.2f} mm')


def tubo_abierto(n=48, m=40, radio=0.03, largo=0.2):
    """Un tubo abierto por los dos extremos, eje Y, hecho a mano."""
    ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
    ys = np.linspace(-largo / 2, largo / 2, m)
    v = np.array([[radio * math.cos(a), y, radio * math.sin(a)] for y in ys for a in ang])
    f = []
    for j in range(m - 1):
        for i in range(n):
            a, b = j * n + i, j * n + (i + 1) % n
            c, d = (j + 1) * n + i, (j + 1) * n + (i + 1) % n
            f += [[a, c, b], [b, c, d]]
    return v, np.array(f)


def prueba_recorte_sin_tapa():
    n = 48
    v, f = tubo_abierto(n=n)
    # Se corta a una altura que no cae en un nudo de la malla: obliga a partir triángulos.
    plano = ((0, 0.0123, 0), (0, 1, 0))
    v2, f2 = M.recortar_por_planos(v, f, [plano])
    bordes, triples = M.aristas_de_borde(f2)
    comprobar('recorte: lo que queda está del lado bueno', v2[:, 1].min() >= 0.0123 - 1e-9,
              f'y mínima {v2[:, 1].min():.6f}')
    # El anillo de arriba son n aristas; el del corte pasa por las n aristas verticales y las n
    # diagonales de la malla, que son 2n tramos: 3n en total.
    comprobar('recorte: sigue abierto por los dos extremos', bordes == 3 * n and triples == 0,
              f'{bordes} aristas de borde, se esperan {3 * n}')
    normal_y = np.abs(M.normales_de_caras(v2, f2)[:, 1])
    comprobar('recorte: no gana tapa (ninguna cara mira a lo largo del eje)', normal_y.max() < 0.5,
              f'|n_y| máxima {normal_y.max():.3f}')
    en_el_plano = np.isclose(v2[:, 1], 0.0123, atol=1e-9)
    comprobar('recorte: el borde queda exactamente sobre el plano', int(en_el_plano.sum()) >= n)
    va, _ = M.recortar_por_planos(v, f, [plano])
    vb, _ = M.recortar_por_planos(v, f, [((0, 0.0123, 0), (0, -1, 0))])
    ba = va[np.isclose(va[:, 1], 0.0123, atol=1e-9)]
    bb = vb[np.isclose(vb[:, 1], 0.0123, atol=1e-9)]

    def ordena(p):
        return p[np.lexsort((p[:, 2], p[:, 0]))]

    comprobar('recorte: dos piezas vecinas comparten el borde',
              len(ba) == len(bb) and np.allclose(ordena(ba), ordena(bb), atol=1e-9))
    area_total = M.area_total(v, f)
    area_a = M.area_total(*M.recortar_por_planos(v, f, [plano]))
    area_b = M.area_total(*M.recortar_por_planos(v, f, [((0, 0.0123, 0), (0, -1, 0))]))
    comprobar('recorte: las dos mitades suman el área entera', abs(area_a + area_b - area_total) < 1e-9 * area_total)
    _, f3 = M.recortar_por_planos(v, f, [((0, -1, 0), (0, 1, 0))])
    comprobar('recorte: lo que está entero dentro no cambia', len(f3) == len(f))
    _, f4 = M.recortar_por_planos(v, f, [((0, 1, 0), (0, 1, 0))])
    comprobar('recorte: lo que está entero fuera sale vacío', len(f4) == 0)
    # Dos planos a la vez, uno oblicuo: no se pierde nada ni queda nada fuera.
    v5, f5 = M.recortar_por_planos(v, f, [plano, ((0.01, 0, 0), (1, -0.3, 0))])
    d = (v5 - np.array([0.01, 0, 0])) @ (np.array([1, -0.3, 0]) / np.linalg.norm([1, -0.3, 0]))
    comprobar('recorte: con dos planos todo queda del lado bueno de los dos',
              d.min() >= -1e-9 and v5[:, 1].min() >= 0.0123 - 1e-9)


def prueba_espejo(v, f):
    v2, f2 = M.espejar(v + np.array([0.01, 0, 0]), f)
    n = M.normales_de_caras(v2, f2)
    centro = v2[f2].mean(axis=1) - v2.mean(axis=0)
    comprobar('espejo: las caras siguen mirando hacia fuera', (np.sum(n * centro, axis=1) > 0).all())
    comprobar('espejo: el volumen conserva su signo', M.volumen_con_signo(v2, f2) > 0)


def prueba_determinismo():
    r, h = 0.03, 0.002
    rejilla, dentro = esfera_en_la_rejilla(r, h)

    def una_vez():
        campo = C.suavizar(C.campo_con_signo(C.cierre(dentro, 0.004, h), h), 1.2)
        return C.superficie_de_la_rejilla(campo, rejilla)

    v1, f1 = una_vez()
    v2, f2 = una_vez()
    comprobar('determinismo: dos corridas dan los mismos bytes', v1.tobytes() == v2.tobytes() and f1.tobytes() == f2.tobytes())
    p1 = C.muestrear_superficie(v1, f1, 0.0015, 5)
    p2 = C.muestrear_superficie(v1, f1, 0.0015, 5)
    comprobar('determinismo: el muestreo con la misma semilla es idéntico', p1.tobytes() == p2.tobytes())


def prueba_componentes():
    v, f = tubo_abierto(n=16, m=10)
    # Un triángulo suelto, mucho más pequeño que el tubo.
    v = np.vstack([v, [[0.5, 0, 0], [0.501, 0, 0], [0.5, 0.001, 0]]])
    f = np.vstack([f, [len(v) - 3, len(v) - 2, len(v) - 1]])
    v2, f2 = M.quitar_componentes_pequenas(v, f, 0.01)
    comprobar('componentes: se quita el islote y se queda el tubo', len(f2) == len(f) - 1 and v2[:, 0].max() < 0.1)


def prueba_atlas():
    atlas = Atlas()
    tibia = atlas.por_nombre('Right tibia')[0]
    v, f = atlas.malla(tibia)
    comprobar('atlas: la tibia derecha son 334 vértices y 634 triángulos', len(v) == 334 and len(f) == 634)
    comprobar('atlas: la caja de la pieza coincide con su geometría',
              np.allclose(v.min(axis=0), tibia['caja'][0], atol=5e-4) and np.allclose(v.max(axis=0), tibia['caja'][1], atol=5e-4))
    piel = atlas.por_nombre('Skin')[0]
    vp, fp = atlas.malla(piel)
    comprobar('atlas: la piel son 22.902 vértices y 44.744 triángulos', len(vp) == 22902 and len(fp) == 44744)
    tibial = atlas.por_nombre('Right tibialis anterior')[0]
    comprobar('atlas: el tibial anterior está corregido a músculo', tibial['sistema'] == 'muscular')


if __name__ == '__main__':
    t0 = time.time()
    v, f = prueba_esfera()
    prueba_taubin(v, f)
    prueba_cierre()
    prueba_relleno_de_una_malla_abierta()
    prueba_recorte_sin_tapa()
    prueba_espejo(v, f)
    prueba_determinismo()
    prueba_componentes()
    prueba_atlas()
    print(f'\n{time.time() - t0:.1f} s')
    if FALLOS:
        print(f'\n{len(FALLOS)} prueba(s) fallaron:')
        for nombre in FALLOS:
            print('  -', nombre)
        sys.exit(1)
    print('Todo en orden.')

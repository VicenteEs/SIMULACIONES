"""
Mide cómo apoya el cuerpo del atlas en el colchón de cada decúbito (P-014, E1).

    python scripts/pabellon/medir.py

No escribe nada: imprime, por zonas, cuánto se hunde la piel bajo el plano de apoyo de `comun.py` y cuánto
flota. Es la cuenta con que se eligieron los planos (`PLANO`) y los cojines (`COJINES`), y la que hay que volver
a mirar si la piel del atlas se regenera: un plano que deja la pantorrilla tres centímetros en el aire no da
ningún error, solo una pierna que flota sobre la sábana.
"""

import numpy as np

import comun as C

ZONAS = [
    ('pies', -0.01, 0.08),
    ('tobillos', 0.08, 0.14),
    ('pantorrillas', 0.14, 0.45),
    ('rodillas', 0.45, 0.55),
    ('muslos', 0.55, 0.85),
    ('gluteos y pelvis', 0.85, 1.02),
    ('lumbar y abdomen', 1.02, 1.20),
    ('torax', 1.20, 1.42),
    ('cuello', 1.42, 1.50),
    ('cabeza', 1.50, 1.73),
]


def informe(decubito, abajo):
    x, y = C.centros()
    con_huella, sin_huella = C.apoyo(decubito, abajo)
    base = C.plano(decubito, y)
    hay = np.isfinite(abajo)
    print(f'\n== {decubito}: h = {C.PLANO[decubito]["a"]:+.4f} {C.PLANO[decubito]["b"]:+.4f}·y ==')
    print(f'{"zona":18s} {"se hunde":>9s} {"flota (plano)":>14s} {"flota (con cojines)":>20s}   (mm; tronco y piernas | brazos)')
    for nombre, y0, y1 in ZONAS:
        fila = []
        for cuales in (np.abs(x) < 0.21, np.abs(x) >= 0.21):
            m = hay & (y >= y0) & (y < y1) & cuales
            if not m.any():
                fila.append('      —')
                continue
            # Lo más bajo de la zona respecto del plano: negativo, hundido; positivo, en el aire.
            respecto = (abajo - base)[m]
            con_cojin = (abajo - sin_huella)[m]
            fila.append(f'{max(0.0, -respecto.min()) * 1000:5.1f} {max(0.0, respecto.min()) * 1000:6.1f} {max(0.0, con_cojin.min()) * 1000:6.1f}')
        print(f'{nombre:18s} {fila[0]}   |   {fila[1]}')
    # Lo que importa no es cuánto se hunde la nariz en su cojín, sino cuánto baja la sábana respecto del plano:
    # la plancha del colchón está `HUNDIMIENTO_MAXIMO` por debajo, y una huella más honda la atravesaría.
    m = C.dentro_del_colchon(decubito)
    print('lo más hondo de la sábana bajo el plano: %.1f mm (el tope es %.1f); la huella más honda, cojines incluidos: %.1f mm' % (
        (base - con_huella)[m].max() * 1000, C.HUNDIMIENTO_MAXIMO * 1000, (sin_huella - con_huella)[m].max() * 1000))
    fuera = hay & ~C.dentro_del_colchon(decubito)
    if fuera.any():
        ys = y[fuera]
        print('cuerpo fuera del colchón: y de %.3f a %.3f, y lo más bajo queda %.1f mm bajo el plano' % (
            ys.min(), ys.max(), max(0.0, -(abajo - base)[fuera].min()) * 1000))


def principal():
    v, f = C.leer_la_piel()
    puntos = C.muestras(v, f)
    print('piel:', len(v), 'vértices,', len(f), 'triángulos,', len(puntos), 'muestras')
    for decubito in C.DECUBITOS:
        abajo, _ = C.envolventes(puntos, decubito)
        informe(decubito, abajo)


if __name__ == '__main__':
    principal()

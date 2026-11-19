"""
Las texturas del campo quirúrgico (P-014, E1): el relieve de la tela, sus pliegues y el forro del colchón.

    python scripts/pabellon/texturas.py

No pasa por Blender: son campos de alturas calculados con numpy y convertidos en mapas de normales. Hacerlos con
una cuenta y no horneando un material tiene dos ventajas que aquí pesan. Se repiten sin costura por
construcción —el ruido se filtra en frecuencia, que es periódico de suyo—, y la escala es exacta: el punto del
no tejido mide 1,6 mm porque así está escrito, no porque un nodo de ruido haya quedado más o menos de ese tamaño.

Lo que sale a `privado/pabellon/`:

    tela-relieve.webp     512², se repite cada 4,8 cm. El gofrado del no tejido: puntos de soldadura al
                          tresbolillo y, entre ellos, la fibra.
    tela-pliegues.webp    2048², única, 2,4 m de lado. A la izquierda el paño —los dobleces de venir plegado en
                          su envase y la arruga fina—; a la derecha la sábana.
    colchon-grano.webp    512², se repite cada 3,7 cm. El grano del forro de poliuretano.
    colchon-pared.webp    512², se repite a lo largo del contorno. Las costuras y el cierre de la pared.

Todas en la convención de glTF y de Blender: el verde hacia arriba de la imagen. El simulador las carga sin
voltear (`flipY = false`) y con la Y de `normalScale` cambiada de signo, que es lo que hace el cargador de glTF
cuando no hay tangentes.
"""

from pathlib import Path

import numpy as np
from PIL import Image

import comun as C

SEMILLA = 20261114


# -------------------------------------------------------------------------------------------- herramientas


def ruido(n, desde_m, hasta_m, lado_m, semilla, estirado=(1.0, 1.0)):
    """
    Ruido periódico de `n`×`n` con longitudes de onda entre `desde_m` y `hasta_m`, para una imagen que mide
    `lado_m` de lado. `estirado` alarga la mancha en (x, y): (4, 1) da vetas a lo ancho.
    Sale con media cero y desviación uno.
    """
    rng = np.random.default_rng(semilla)
    espectro = np.fft.fft2(rng.standard_normal((n, n)))
    # Ciclos por metro en cada eje. Estirar la mancha en un eje es encoger su frecuencia en ese eje.
    fy = np.fft.fftfreq(n, d=lado_m / n)[:, None] * estirado[1]
    fx = np.fft.fftfreq(n, d=lado_m / n)[None, :] * estirado[0]
    f = np.hypot(fx, fy)
    f[0, 0] = 1e-9
    alta, baja = 1.0 / desde_m, 1.0 / hasta_m
    # Una banda con los bordes suaves y más energía en lo grande, como cualquier superficie arrugada.
    filtro = np.exp(-0.5 * (np.log(f / np.sqrt(alta * baja)) / (0.5 * np.log(alta / baja) + 1e-9)) ** 2) / f
    campo = np.fft.ifft2(espectro * filtro).real
    campo -= campo.mean()
    return campo / (campo.std() + 1e-12)


def normales(alto, metros_por_pixel, periodica):
    """Un campo de alturas en metros, como mapa de normales en 8 bits (verde hacia arriba de la imagen)."""
    if periodica:
        dx = (np.roll(alto, -1, axis=1) - np.roll(alto, 1, axis=1)) / (2 * metros_por_pixel)
        dy = (np.roll(alto, -1, axis=0) - np.roll(alto, 1, axis=0)) / (2 * metros_por_pixel)
    else:
        dy, dx = np.gradient(alto, metros_por_pixel)
    # Las filas crecen hacia abajo y el verde mira hacia arriba: de ahí el signo de la Y.
    n = np.stack([-dx, dy, np.ones_like(alto)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.clip(np.round((n * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)


def guardar(nombre, pixeles, calidad=93):
    C.PABELLON.mkdir(parents=True, exist_ok=True)
    ruta = C.PABELLON / nombre
    Image.fromarray(pixeles, 'RGB').save(ruta, 'WEBP', quality=calidad, method=6)
    print(f'ESCRITO {nombre}: {pixeles.shape[1]}×{pixeles.shape[0]}, {ruta.stat().st_size / 1024:.0f} KB')


def informe(nombre, alto, metros_por_pixel):
    dy, dx = np.gradient(alto, metros_por_pixel)
    pendiente = np.degrees(np.arctan(np.hypot(dx, dy)))
    print(f'  {nombre}: relieve de {np.ptp(alto) * 1000:.2f} mm; pendiente media {pendiente.mean():.1f}°, percentil 99 {np.percentile(pendiente, 99):.1f}°')


# ---------------------------------------------------------------------------------------- relieve de la tela


def relieve_de_la_tela(n=512, lado=C.LADO_DE_LA_TEXTURA / 50):
    """
    El no tejido de tres capas de los paños desechables: una lámina de fibra soldada por puntos. Los puntos son
    hoyuelos ovalados al tresbolillo, cada 1,6 mm; entre ellos la fibra queda abombada y algo revuelta.
    """
    columnas, filas = 30, 34
    y, x = np.meshgrid(np.arange(n), np.arange(n), indexing='ij')
    paso_x, paso_y = n / columnas, n / filas
    fila = np.floor(y / paso_y)
    alto = np.zeros((n, n))
    # Cada píxel mira los puntos de su fila y de las dos vecinas; con eso basta, porque un hoyuelo mide menos
    # que el paso.
    for df in (-1, 0, 1):
        f = fila + df
        cy = (f + 0.5) * paso_y
        corrida = np.where(f % 2 == 0, 0.0, 0.5)
        cx = (np.round(x / paso_x - 0.5 - corrida) + 0.5 + corrida) * paso_x
        dx = (x - cx) / (paso_x * 0.30)
        dy = (y - cy) / (paso_y * 0.21)
        alto = np.minimum(alto, -np.exp(-(dx * dx + dy * dy) ** 1.4))
    hoyuelos = alto * 0.085e-3
    fibra = ruido(n, 0.15e-3, 0.9e-3, lado, SEMILLA + 1, estirado=(1.0, 2.2)) * 0.012e-3
    fibra += ruido(n, 0.15e-3, 0.9e-3, lado, SEMILLA + 2, estirado=(2.2, 1.0)) * 0.012e-3
    nube = ruido(n, 2e-3, 12e-3, lado, SEMILLA + 3) * 0.018e-3
    alto = hoyuelos + fibra + nube
    informe('relieve de la tela', alto, lado / n)
    return normales(alto, lado / n, periodica=True)


# --------------------------------------------------------------------------------------------- los pliegues


def doblez(distancia, ancho):
    """El perfil de un doblez marcado: una arista con las laderas que se apagan."""
    return np.exp(-np.abs(distancia) / ancho)


def pliegues(n=2048):
    lado = C.LADO_DE_LA_TEXTURA
    mpp = lado / n
    fila, columna = np.meshgrid(np.arange(n) + 0.5, np.arange(n) + 0.5, indexing='ij')
    u = columna / n
    v = 1.0 - fila / n
    rng = np.random.default_rng(SEMILLA + 10)

    # Vaivenes de un solo eje, para que ningún doblez sea una recta de regla ni tenga la misma fuerza en todo
    # su largo.
    def vaiven(semilla, desde, hasta):
        return ruido(n, desde, hasta, lado, semilla)[0]

    alto = np.zeros((n, n))

    # --- El paño: u de 0 a 0,59, centrado en `CENTRO_DEL_PANO_EN_U`. ---
    x = (u - C.CENTRO_DEL_PANO_EN_U) * lado
    y = v * lado - 0.35
    pano = np.zeros((n, n))
    # Los dobleces de fábrica. Un paño sale de su envase plegado en acordeón a lo largo y luego a lo ancho, y
    # al abrirlo queda una cuadrícula de aristas, unas hacia arriba y otras hacia abajo. Es lo primero que se
    # reconoce en una foto de un campo quirúrgico.
    for k, x0 in enumerate(np.arange(-0.64, 0.65, 0.16)):
        signo = 1.0 if k % 2 else -1.0
        d = x - x0 - 0.0018 * vaiven(SEMILLA + 20 + k, 0.05, 0.4)[:, None]
        fuerza = 0.75 + 0.25 * vaiven(SEMILLA + 40 + k, 0.1, 0.6)[:, None]
        pano += signo * 0.00062 * fuerza * doblez(d, 0.0030)
    for k, y0 in enumerate(np.arange(-0.14, 2.0, 0.235)):
        signo = 1.0 if k % 2 else -1.0
        d = y - y0 - 0.0018 * vaiven(SEMILLA + 60 + k, 0.05, 0.4)[None, :]
        fuerza = 0.75 + 0.25 * vaiven(SEMILLA + 80 + k, 0.1, 0.6)[None, :]
        pano += signo * 0.00052 * fuerza * doblez(d, 0.0030)
    # La arruga fina: el no tejido se arruga como un papel blando, en aristas cortas y sin dirección.
    grande = ruido(n, 0.02, 0.09, lado, SEMILLA + 100)
    fina = ruido(n, 0.006, 0.022, lado, SEMILLA + 101)
    pano += 0.00034 * (1.0 - np.abs(grande)).clip(0, 1) ** 2
    pano += 0.00010 * (1.0 - np.abs(fina)).clip(0, 1) ** 2
    # Y unas ondas blandas, de un palmo, para que la luz no resbale igual por toda la tela.
    pano += 0.0006 * ruido(n, 0.08, 0.35, lado, SEMILLA + 102)

    # --- La sábana: u de 0,59 a 1, centrada en `CENTRO_DE_LA_SABANA_EN_U`. ---
    sabana = np.zeros((n, n))
    # Arrugas de tela tirante, a lo ancho: son las que deja un cuerpo al acomodarlo.
    veta = ruido(n, 0.012, 0.05, lado, SEMILLA + 110, estirado=(0.16, 1.0))
    sabana += 0.00050 * (1.0 - np.abs(veta)).clip(0, 1) ** 2.5
    sabana += 0.00014 * (1.0 - np.abs(ruido(n, 0.006, 0.02, lado, SEMILLA + 111))).clip(0, 1) ** 2
    sabana += 0.0005 * ruido(n, 0.08, 0.3, lado, SEMILLA + 112)
    xs = (u - C.CENTRO_DE_LA_SABANA_EN_U) * lado
    ys = (v - 0.5) * lado
    for k, x0 in enumerate((-0.19, 0.19)):
        d = xs - x0 - 0.0015 * vaiven(SEMILLA + 120 + k, 0.05, 0.4)[:, None]
        sabana += (-1.0) ** k * 0.00045 * doblez(d, 0.0028)
    for k, y0 in enumerate(np.arange(-0.84, 0.9, 0.42)):
        d = ys - y0 - 0.0015 * vaiven(SEMILLA + 130 + k, 0.05, 0.4)[None, :]
        sabana += (-1.0) ** k * 0.00045 * doblez(d, 0.0028)

    alto = np.where(u < 0.59, pano, sabana)
    informe('pliegues del paño', pano[:, : int(n * 0.59)], mpp)
    informe('pliegues de la sábana', sabana[:, int(n * 0.59):], mpp)
    return normales(alto, mpp, periodica=False)


# ------------------------------------------------------------------------------------------------- colchón


def grano_del_colchon(n=512, lado=0.111 / 3):
    """
    El forro de poliuretano: un grano de celdillas irregulares, como el de una tapicería vinílica, de algo
    menos de un milímetro.
    """
    celdas = 44
    rng = np.random.default_rng(SEMILLA + 200)
    semillas = (np.stack(np.meshgrid(np.arange(celdas), np.arange(celdas), indexing='ij'), axis=-1) + rng.uniform(0.1, 0.9, (celdas, celdas, 2))) / celdas
    y, x = np.meshgrid((np.arange(n) + 0.5) / n, (np.arange(n) + 0.5) / n, indexing='ij')
    ci, cj = np.floor(y * celdas).astype(int), np.floor(x * celdas).astype(int)
    primera = np.full((n, n), 9.0)
    segunda = np.full((n, n), 9.0)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            p = semillas[(ci + di) % celdas, (cj + dj) % celdas]
            # La distancia, dando la vuelta por el borde: es lo que hace que el grano case consigo mismo.
            dy = (y - p[..., 0] + 0.5) % 1.0 - 0.5
            dx = (x - p[..., 1] + 0.5) % 1.0 - 0.5
            d = np.hypot(dx, dy) * celdas
            segunda = np.where(d < primera, primera, np.minimum(segunda, d))
            primera = np.minimum(primera, d)
    # Entre dos celdillas hay un surco; cada celdilla es un domo bajo.
    surco = C.escalon(0.0, 0.32, segunda - primera)
    alto = (surco * (1.0 - 0.35 * primera ** 2)) * 0.055e-3
    alto += ruido(n, 0.1e-3, 0.5e-3, lado, SEMILLA + 201) * 0.005e-3
    alto += ruido(n, 3e-3, 15e-3, lado, SEMILLA + 202) * 0.02e-3
    informe('grano del colchón', alto, lado / n)
    return normales(alto, lado / n, periodica=True)


def pared_del_colchon(n=512, lado=0.111):
    """
    La pared del colchón, de arriba abajo en V y repetida a lo largo del contorno en U: el vivo de la costura
    donde la pared se encuentra con cada canto, sus dos filas de puntadas, y la solapa del cierre a media altura.

    La sábana tapa la mitad de arriba; lo que se ve es de la solapa para abajo.
    """
    mpp = lado / n
    fila, columna = np.meshgrid(np.arange(n) + 0.5, np.arange(n) + 0.5, indexing='ij')
    s = fila / n * lado          # lo recorrido sobre el perfil, desde el canto de arriba
    t = columna / n * lado       # a lo largo del contorno
    canto = C.RADIO_DEL_CANTO * np.pi / 2
    alto = np.zeros((n, n))

    def vaiven(semilla, desde, hasta):
        return ruido(n, desde, hasta, lado, semilla)[0][None, :]

    def puntadas(s0, largo=0.004, hilo=0.0005):
        """Una fila de puntadas: tramos de hilo que sobresalen, con el agujero de la aguja entre uno y otro."""
        fase = (t / largo) % 1.0
        a_lo_largo = C.escalon(0.0, 0.16, fase) * (1 - C.escalon(0.84, 1.0, fase))
        a_traves = np.exp(-((s - s0) / hilo) ** 2)
        agujero = np.exp(-(((fase + 0.5) % 1.0 - 0.5) * largo / 0.00035) ** 2) * np.exp(-((s - s0) / 0.00035) ** 2)
        return 0.00022 * a_lo_largo * a_traves - 0.00018 * agujero

    for s0, signo in ((canto, 1.0), (lado - canto, -1.0)):
        # El vivo: un cordón forrado que corre por la costura.
        alto += 0.0011 * np.sqrt(np.clip(1.0 - ((s - s0) / 0.0021) ** 2, 0.0, 1.0))
        # Y el fruncido que deja al coser: arruguitas cortas que salen de la costura hacia la pared.
        hacia_la_pared = np.clip(signo * (s - s0) / 0.012, 0.0, 1.0)
        frunce = ruido(n, 0.003, 0.012, lado, SEMILLA + 300 + int(signo), estirado=(1.0, 0.25))
        alto += 0.00016 * frunce * np.exp(-hacia_la_pared * 3.0) * (hacia_la_pared > 0)
        alto += puntadas(s0 + signo * 0.0042)
        alto += puntadas(s0 + signo * 0.0066)

    # La solapa que tapa la cremallera: un escalón con su fila de puntadas y, debajo, la sombra del cierre.
    solapa = lado * 0.60 + 0.0006 * vaiven(SEMILLA + 310, 0.02, 0.1)
    alto += 0.0009 * C.escalon(-0.0006, 0.0006, solapa - s) * C.escalon(-0.016, -0.011, s - solapa)
    alto += puntadas(lado * 0.60 - 0.013)
    alto += 0.00012 * ruido(n, 0.004, 0.02, lado, SEMILLA + 311, estirado=(1.0, 0.3)) * C.escalon(-0.016, -0.008, s - solapa) * (1 - C.escalon(-0.002, 0.0, s - solapa))
    # La tela de la pared no queda tensa como un tambor.
    alto += 0.0004 * ruido(n, 0.015, 0.08, lado, SEMILLA + 312)
    informe('pared del colchón', alto, mpp)
    return normales(alto, mpp, periodica=True)


def principal():
    guardar('tela-relieve.webp', relieve_de_la_tela())
    guardar('tela-pliegues.webp', pliegues(), calidad=90)
    guardar('colchon-grano.webp', grano_del_colchon())
    guardar('colchon-pared.webp', pared_del_colchon())


if __name__ == '__main__':
    principal()

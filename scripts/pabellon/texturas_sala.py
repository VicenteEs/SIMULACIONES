"""
Las texturas del pabellón completo (`sala.py`): mapas de normales que se repiten, el atlas de rótulos y las pantallas.

    python scripts/pabellon/texturas_sala.py            (las deja en `salida/sala/`; `sala.py` las lee de ahí)
    python scripts/pabellon/texturas_sala.py --planta DATOS BASE DESTINO   (anota la foto de planta; la llama `sala.py --vistas`)

Corre con el Python del sistema (numpy y Pillow), no con el de Blender: el de Blender no trae Pillow, y Pillow es lo
que dibuja el texto. Por eso `sala.py` solo importa de aquí las tablas —`RECTAS`, los tamaños de las pantallas— y no
las funciones que dibujan, que importan Pillow dentro de sí mismas.

## Por qué hay dos clases de textura

Lo que se repite (acero cepillado, vinilo, tejido, goma, la chapa perforada) va en imágenes pequeñas y propias, que el
material pone en mosaico con una escala en metros (`KHR_texture_transform`). Un atlas no puede repetirse: al pasar de
su rectángulo, la textura enseña el rectángulo de al lado. Lo que no se repite (rótulos, carteles, la esfera del reloj,
las cajas de insumos con su estampado) va junto en un atlas de 2048², que es una sola imagen y un solo material. Las
pantallas van aparte, una imagen por pantalla, porque son lo que el código querrá cambiar sin tocar lo demás.

Nada de esto lleva luz horneada ni color de pintura: el color de la pintura es del material y el dueño quiere poder
repintar. Los mapas de normales son campos de alturas pasados a normales, como en `texturas.py`.

Todo es determinista (semillas fijas). Las letras salen de Arial si la máquina la tiene; con otra fuente el texto
cambia de forma, no de sitio.
"""

import argparse
import math
import sys
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
SALIDA = AQUI / 'salida' / 'sala'
SEMILLA = 20261118

# ----------------------------------------------------------------------------------------------- el atlas

LADO_DEL_ATLAS = 2048

# (nombre, ancho, alto) en píxeles. El orden importa solo para empacar: de mayor a menor altura.
ETIQUETAS = [
    ('pizarra', 896, 576),
    ('cartel-manos', 384, 528),
    ('cartel-lista', 384, 528),
    ('reloj', 384, 384),
    ('plano-evacuacion', 320, 240),
    ('letrero-pabellon', 640, 160),
    ('letrero-zona-esteril', 512, 160),
    ('letrero-lavado', 512, 160),
    ('letrero-personal', 512, 160),
    ('letrero-salida', 320, 160),
    ('letrero-radiacion', 256, 256),
    ('letrero-biologico', 224, 224),
    ('letrero-mascarilla', 224, 224),
    ('letrero-extintor', 160, 192),
    ('manometro-o2', 160, 160),
    ('manometro-aire', 160, 160),
    ('manometro-vac', 160, 160),
    ('caja-guantes', 224, 136),
    ('caja-gasas', 224, 136),
    ('caja-sutura', 224, 136),
    ('caja-jeringas', 224, 136),
    ('caja-mascarillas', 224, 136),
    ('caja-campo', 224, 136),
    ('caja-via', 224, 136),
    ('caja-compresas', 224, 136),
    ('bolsa-suero', 160, 240),
    ('bolsa-ringer', 160, 240),
    ('bolsa-glucosa', 160, 240),
    ('logo-anestesia', 384, 96),
    ('logo-arco', 384, 96),
    ('logo-electro', 384, 96),
    ('logo-aspirador', 320, 96),
    ('logo-lampara', 256, 64),
    ('etiq-o2', 128, 64),
    ('etiq-aire', 128, 64),
    ('etiq-vac', 128, 64),
    ('cajon-via-aerea', 192, 48),
    ('cajon-farmacos', 192, 48),
    ('cajon-vias', 192, 48),
    ('cajon-otros', 192, 48),
    ('etiqueta-armario', 192, 56),
]

# Muestras de color liso: un objeto que debe ser de un color y no de la pintura apunta a un punto de su muestra.
# Así todo el plástico de color de la sala es un solo material.
MUESTRAS = [
    ('blanco', '#e9ecee'), ('negro', '#1c1e21'), ('gris', '#6d7379'), ('gris-claro', '#b4babf'),
    ('rojo', '#b3241f'), ('rojo-oscuro', '#6e1613'), ('amarillo', '#d9b21c'), ('naranja', '#d9701b'),
    ('verde', '#2e8a4f'), ('verde-oscuro', '#1f5a38'), ('azul', '#2a5ea8'), ('azul-claro', '#6fa8d6'),
    ('violeta', '#6b3f8c'), ('celeste', '#8ec9e6'), ('crema', '#d8cfb4'), ('marron', '#6a4a35'),
]
LADO_DE_LA_MUESTRA = 40
MARGEN = 6


def empaquetar(piezas, ancho=LADO_DEL_ATLAS, margen=MARGEN):
    """Estantes de izquierda a derecha, de mayor a menor altura. Devuelve nombre → (x, y, w, h) en píxeles."""
    rectas = {}
    x = y = fila = 0
    for nombre, w, h in sorted(piezas, key=lambda p: (-p[2], -p[1], p[0])):
        if x + w + margen > ancho:
            x, y, fila = 0, y + fila + margen, 0
        rectas[nombre] = (x + margen, y + margen, w, h)
        x += w + margen
        fila = max(fila, h + margen)
    return rectas, y + fila + margen


RECTAS, _ALTO_USADO = empaquetar(ETIQUETAS)
# Las muestras van en filas bajo todo lo demás.
_y_muestras = _ALTO_USADO + MARGEN
for _k, (_nombre, _color) in enumerate(MUESTRAS):
    RECTAS['m-' + _nombre] = (MARGEN + _k * (LADO_DE_LA_MUESTRA + MARGEN), _y_muestras, LADO_DE_LA_MUESTRA, LADO_DE_LA_MUESTRA)
assert _y_muestras + LADO_DE_LA_MUESTRA + MARGEN <= LADO_DEL_ATLAS, 'el atlas de rótulos no cabe'

# Las pantallas: nombre del archivo → (ancho, alto). `pantalla-boom` lleva dos monitores lado a lado y `pantalla-menores`
# cuatro displays pequeños en cuadrícula de 2 × 2: cada nodo de pantalla usa su mitad o su cuarto (ver `sala.py`).
PANTALLAS = {
    'pantalla-signos': (512, 320),
    'pantalla-ventilador': (384, 256),
    'pantalla-pacs': (1024, 576),
    'pantalla-boom': (1024, 320),
    'pantalla-arco': (512, 320),
    'pantalla-control': (384, 256),
    'pantalla-menores': (512, 256),
}

# Las que se repiten: archivo → (lado en píxeles, metros que cubre una repetición).
MOSAICOS = {
    'normal-acero': (512, 0.20),
    'normal-vinilo': (512, 0.50),
    'normal-tejido': (256, 0.06),
    'normal-goma': (256, 0.08),
    'perforado': (256, 0.10),
}


def uv_de(nombre, ancho=LADO_DEL_ATLAS, alto=LADO_DEL_ATLAS):
    """El rectángulo (u0, v0, u1, v1) de un rótulo en el atlas, con la v medida desde abajo como en Blender."""
    x, y, w, h = RECTAS[nombre]
    return x / ancho, 1.0 - (y + h) / alto, (x + w) / ancho, 1.0 - y / alto


# ------------------------------------------------------------------------------------------------ ruido


def ruido(n, desde, hasta, lado, semilla, estirado=(1.0, 1.0)):
    """Ruido periódico n×n con longitudes de onda entre `desde` y `hasta` (en la misma unidad que `lado`). Media 0, desviación 1."""
    rng = np.random.default_rng(semilla)
    espectro = np.fft.fft2(rng.standard_normal((n, n)))
    fy = np.fft.fftfreq(n, d=lado / n)[:, None] * estirado[1]
    fx = np.fft.fftfreq(n, d=lado / n)[None, :] * estirado[0]
    f = np.hypot(fx, fy)
    f[0, 0] = 1e-9
    alta, baja = 1.0 / desde, 1.0 / hasta
    filtro = np.exp(-0.5 * (np.log(f / np.sqrt(alta * baja)) / (0.5 * np.log(alta / baja) + 1e-9)) ** 2) / f
    campo = np.fft.ifft2(espectro * filtro).real
    campo -= campo.mean()
    return campo / (campo.std() + 1e-12)


def normales(alto, metros_por_pixel):
    """Un campo de alturas periódico (en metros) como mapa de normales en 8 bits, con el verde hacia arriba de la imagen."""
    dx = (np.roll(alto, -1, axis=1) - np.roll(alto, 1, axis=1)) / (2 * metros_por_pixel)
    dy = (np.roll(alto, -1, axis=0) - np.roll(alto, 1, axis=0)) / (2 * metros_por_pixel)
    n = np.stack([-dx, dy, np.ones_like(alto)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.clip(np.round((n * 0.5 + 0.5) * 255), 0, 255).astype(np.uint8)


def con_pendiente(alto, metros_por_pixel, pendiente):
    """
    Escala un campo de alturas para que su pendiente típica (la desviación de la inclinación, en m/m) sea `pendiente`. Se pide la
    pendiente y no la altura porque es la pendiente lo que el mapa de normales guarda: la primera versión de estos mosaicos fijaba
    alturas de micras sobre ondas de menos de un píxel y salió plana (desviación de 1 sobre 255), es decir, un acero liso.
    """
    gy, gx = np.gradient(alto, metros_por_pixel)
    return alto * pendiente / (np.sqrt(np.mean(gx * gx + gy * gy)) + 1e-12)


def guardar_gris(nombre, pixeles):
    from PIL import Image
    SALIDA.mkdir(parents=True, exist_ok=True)
    Image.fromarray(pixeles, 'RGB' if pixeles.ndim == 3 else 'L').save(SALIDA / f'{nombre}.png', optimize=False)


# --------------------------------------------------------------------------------------- los mosaicos


def acero_cepillado(n=512, lado=0.20):
    """
    El cepillado del acero: rayas a lo largo de X, más o menos continuas, con alguna más marcada. Es lo que separa un acero
    inoxidable de un plástico gris; a un metro no se distingue una raya, solo que el brillo se estira. Las ondas más finas miden
    un milímetro y medio (tres o cuatro píxeles): por debajo de eso el mapa no las puede guardar.
    """
    mpp = lado / n
    # Estirado en X: la frecuencia en X se encoge, así que las manchas se alargan decenas de veces.
    finas = con_pendiente(ruido(n, 1.2e-3, 4.0e-3, lado, SEMILLA + 1, estirado=(0.03, 1.0)), mpp, 0.06)
    medias = con_pendiente(ruido(n, 4e-3, 14e-3, lado, SEMILLA + 2, estirado=(0.05, 1.0)), mpp, 0.025)
    alto = finas + medias
    # Algún rayón suelto, largo y más hondo.
    rng = np.random.default_rng(SEMILLA + 3)
    paso = np.std(alto)
    for _ in range(14):
        fila = rng.integers(0, n)
        largo = rng.integers(n // 4, n)
        x0 = rng.integers(0, n)
        cols = (x0 + np.arange(largo)) % n
        alto[fila, cols] -= rng.uniform(1.5, 3.0) * paso
    return normales(alto, mpp)


def vinilo(n=512, lado=0.50):
    """El vinilo de pabellón: satinado, con un grano muy fino y salpicado de puntitos, como el vinilo con partículas."""
    mpp = lado / n
    grano = con_pendiente(ruido(n, 2.5e-3, 8.0e-3, lado, SEMILLA + 10), mpp, 0.04)
    nube = con_pendiente(ruido(n, 15e-3, 70e-3, lado, SEMILLA + 11), mpp, 0.010)
    rng = np.random.default_rng(SEMILLA + 12)
    puntos = np.zeros((n, n))
    yy, xx = np.ogrid[-3:4, -3:4]
    for _ in range(900):
        y, x = rng.integers(0, n, 2)
        r = rng.uniform(0.8, 2.2)
        hoyo = np.exp(-(xx * xx + yy * yy) / (2 * (r / 1.4) ** 2))
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                puntos[(y + dy) % n, (x + dx) % n] -= hoyo[dy + 3, dx + 3] * 0.12e-3
    return normales(grano + nube + puntos, mpp)


def tejido(n=256, lado=0.06):
    """Una tela lisa de ligamento tafetán, de un milímetro de hilo: la bata plomada y las fundas."""
    mpp = lado / n
    hilos = 28
    y, x = np.meshgrid(np.arange(n), np.arange(n), indexing='ij')
    fx, fy = x / n * hilos, y / n * hilos
    ix, iy = np.floor(fx).astype(int), np.floor(fy).astype(int)
    # Tafetán: el hilo pasa por encima o por debajo según la paridad.
    arriba = ((ix + iy) % 2).astype(float)
    sx = np.sin(np.pi * (fx % 1.0))
    sy = np.sin(np.pi * (fy % 1.0))
    alto = (arriba * sx + (1 - arriba) * sy) * 0.18e-3
    alto += ruido(n, 0.6e-3, 3e-3, lado, SEMILLA + 20) * 0.015e-3
    return normales(alto, mpp)


def goma(n=256, lado=0.08):
    """El tapete antifatiga: rombos en relieve, con las aristas redondeadas."""
    mpp = lado / n
    y, x = np.meshgrid((np.arange(n) + 0.5) / n, (np.arange(n) + 0.5) / n, indexing='ij')
    u = (x + y) * 4.0
    v = (x - y) * 4.0
    du = np.abs((u % 1.0) - 0.5)
    dv = np.abs((v % 1.0) - 0.5)
    d = np.maximum(du, dv)
    alto = np.clip((0.40 - d) / 0.08, 0.0, 1.0)
    alto = alto * alto * (3 - 2 * alto) * 0.8e-3
    alto += ruido(n, 0.5e-3, 2.5e-3, lado, SEMILLA + 30) * 0.03e-3
    return normales(alto, mpp)


def chapa_perforada(n=256, lado=0.10):
    """
    Chapa perforada de acero: orificios de 7 mm cada 12,5 mm, al tresbolillo. Es de color, no de normales: en un plénum de
    flujo laminar el orificio se ve negro, y es lo que lo hace parecer lo que es. 8 orificios por lado y fila corrida.
    """
    filas = 8
    paso = n / filas
    y, x = np.meshgrid(np.arange(n) + 0.5, np.arange(n) + 0.5, indexing='ij')
    fila = np.floor(y / paso)
    d_min = np.full((n, n), 1e9)
    for df in (-1, 0, 1):
        f = fila + df
        corrida = np.where(f % 2 == 0, 0.0, 0.5)
        cy = (f + 0.5) * paso
        cx = (np.round(x / paso - 0.5 - corrida) + 0.5 + corrida) * paso
        d = np.hypot(x - cx, y - cy)
        d_min = np.minimum(d_min, d)
    radio = paso * 0.28
    # Orificio oscuro, con el borde suavizado un píxel y un halo de chapa algo más clara alrededor.
    borde = np.clip((d_min - radio) / 1.5 + 0.5, 0.0, 1.0)
    halo = np.clip(1.0 - (d_min - radio) / (paso * 0.12), 0.0, 1.0) * 0.06
    gris = 0.80 + halo
    valor = 0.06 + (gris - 0.06) * borde
    rng = np.random.default_rng(SEMILLA + 40)
    valor += rng.normal(0, 0.006, (n, n))
    rgb = np.repeat(np.clip(valor, 0, 1)[..., None], 3, axis=-1)
    return (rgb * 255).astype(np.uint8)


# ---------------------------------------------------------------------------------------- las letras


def _fuente(tam, negrita=False):
    from PIL import ImageFont
    nombres = ('arialbd.ttf', 'segoeuib.ttf', 'DejaVuSans-Bold.ttf') if negrita else ('arial.ttf', 'segoeui.ttf', 'DejaVuSans.ttf')
    for n in nombres:
        for carpeta in ('C:/Windows/Fonts', '/usr/share/fonts/truetype/dejavu', '/usr/share/fonts/truetype/msttcorefonts'):
            ruta = Path(carpeta) / n
            if ruta.exists():
                return ImageFont.truetype(str(ruta), tam)
    return ImageFont.load_default(size=tam)


def _texto(d, centro, texto, tam, fill, negrita=True, ancla='mm'):
    """
    Escribe `texto` y, si no cabe en lo que queda de la imagen hasta el borde, lo encoge. Así ningún rótulo sale
    cortado aunque la fuente de esta máquina sea más ancha que la de otra.
    """
    ancho_imagen = d.im.size[0]
    x = centro[0]
    disponible = {'mm': 2 * min(x, ancho_imagen - x) - 14, 'lm': ancho_imagen - x - 8, 'rm': x - 8}.get(ancla, ancho_imagen)
    fuente = _fuente(tam, negrita)
    while tam > 8 and d.textlength(texto, font=fuente) > disponible:
        tam -= 1
        fuente = _fuente(tam, negrita)
    d.text(centro, texto, font=fuente, fill=fill, anchor=ancla)


def _rect_redondeado(d, caja, radio, fill, outline=None, ancho=0):
    d.rounded_rectangle(caja, radius=radio, fill=fill, outline=outline, width=ancho)


def _hex(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


# ------------------------------------------------------------------------------------- rótulos del atlas


def _letrero_pabellon(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex('#e9ecee'))
    d = ImageDraw.Draw(im)
    _rect_redondeado(d, (6, 6, w - 7, h - 7), 14, _hex('#1d4f57'), _hex('#8fb7bd'), 3)
    _texto(d, (w // 2, h * 0.42), 'PABELLÓN 3', 78, (255, 255, 255))
    _texto(d, (w // 2, h * 0.80), 'BLOQUE QUIRÚRGICO · TRAUMATOLOGÍA', 24, _hex('#cfe5e8'), negrita=False)
    return im


def _letrero_banda(w, h, texto, sub, fondo, texto_color, tam=54):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex(fondo))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w - 1, 14), fill=_hex('#f2f2f2'))
    for k in range(0, w, 40):
        d.polygon([(k, 0), (k + 20, 0), (k + 8, 14), (k - 12, 14)], fill=_hex('#1c1e21'))
    _texto(d, (w // 2, h * 0.52), texto, tam, texto_color)
    if sub:
        _texto(d, (w // 2, h * 0.84), sub, 20, texto_color, negrita=False)
    return im


def _letrero_salida(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex('#1f8a4c'))
    d = ImageDraw.Draw(im)
    d.rectangle((6, 6, w - 7, h - 7), outline=(255, 255, 255), width=3)
    # El pictograma: una persona que corre hacia la puerta, en trazos gruesos.
    cx, cy = w * 0.22, h * 0.5
    d.ellipse((cx - 10, cy - 46, cx + 10, cy - 26), fill=(255, 255, 255))
    d.line([(cx, cy - 24), (cx + 6, cy + 6)], fill=(255, 255, 255), width=10)
    d.line([(cx, cy - 18), (cx + 30, cy - 4)], fill=(255, 255, 255), width=7)
    d.line([(cx + 6, cy + 6), (cx - 14, cy + 30)], fill=(255, 255, 255), width=8)
    d.line([(cx + 6, cy + 6), (cx + 28, cy + 30)], fill=(255, 255, 255), width=8)
    d.line([(cx, cy - 18), (cx - 24, cy - 6)], fill=(255, 255, 255), width=7)
    _texto(d, (w * 0.64, h * 0.50), 'SALIDA', 52, (255, 255, 255))
    d.polygon([(w * 0.90, h * 0.5 - 14), (w * 0.97, h * 0.5), (w * 0.90, h * 0.5 + 14)], fill=(255, 255, 255))
    return im


def _trebol(d, cx, cy, r, fondo, tinta):
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=fondo)
    for ang in (30, 150, 270):
        d.pieslice((cx - r * 0.86, cy - r * 0.86, cx + r * 0.86, cy + r * 0.86), ang - 30, ang + 30, fill=tinta)
    d.ellipse((cx - r * 0.17, cy - r * 0.17, cx + r * 0.17, cy + r * 0.17), fill=tinta)
    d.ellipse((cx - r * 0.34, cy - r * 0.34, cx + r * 0.34, cy + r * 0.34), outline=fondo, width=int(r * 0.12))


def _letrero_radiacion(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex('#f1c40f'))
    d = ImageDraw.Draw(im)
    d.rectangle((5, 5, w - 6, h - 6), outline=_hex('#1c1e21'), width=5)
    _trebol(d, w / 2, h * 0.42, w * 0.30, _hex('#f1c40f'), _hex('#1c1e21'))
    _texto(d, (w / 2, h * 0.82), 'RADIACIÓN', 34, _hex('#1c1e21'))
    _texto(d, (w / 2, h * 0.93), 'ARCO EN C EN USO', 15, _hex('#1c1e21'), negrita=False)
    return im


def _letrero_biologico(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex('#e9ecee'))
    d = ImageDraw.Draw(im)
    cx, cy, r = w / 2, h * 0.42, w * 0.30
    # El símbolo de riesgo biológico, esquematizado: tres anillos abiertos hacia fuera alrededor de un círculo.
    for k in range(3):
        ang = math.radians(90 + 120 * k)
        ox, oy = cx + math.cos(ang) * r * 0.5, cy - math.sin(ang) * r * 0.5
        d.ellipse((ox - r * 0.62, oy - r * 0.62, ox + r * 0.62, oy + r * 0.62), outline=_hex('#b3241f'), width=int(r * 0.22))
    d.ellipse((cx - r * 0.18, cy - r * 0.18, cx + r * 0.18, cy + r * 0.18), fill=_hex('#e9ecee'), outline=_hex('#b3241f'), width=4)
    _texto(d, (w / 2, h * 0.86), 'RIESGO BIOLÓGICO', 20, _hex('#b3241f'))
    return im


def _letrero_mascarilla(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex('#e9ecee'))
    d = ImageDraw.Draw(im)
    cx, cy, r = w / 2, h * 0.42, w * 0.34
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=_hex('#2a5ea8'))
    # Una mascarilla: óvalo con tres pliegues y las cintas.
    d.rounded_rectangle((cx - r * 0.55, cy - r * 0.28, cx + r * 0.55, cy + r * 0.40), radius=int(r * 0.2), fill=(255, 255, 255))
    for k in (-0.14, 0.06, 0.26):
        d.line([(cx - r * 0.5, cy + r * k), (cx + r * 0.5, cy + r * k)], fill=_hex('#9ec0e8'), width=3)
    d.line([(cx - r * 0.55, cy), (cx - r * 0.85, cy - r * 0.15)], fill=(255, 255, 255), width=3)
    d.line([(cx + r * 0.55, cy), (cx + r * 0.85, cy - r * 0.15)], fill=(255, 255, 255), width=3)
    _texto(d, (w / 2, h * 0.84), 'MASCARILLA', 22, _hex('#2a5ea8'))
    _texto(d, (w / 2, h * 0.94), 'OBLIGATORIA', 16, _hex('#2a5ea8'), negrita=False)
    return im


def _letrero_extintor(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex('#b3241f'))
    d = ImageDraw.Draw(im)
    d.rectangle((8, 8, w - 9, h - 9), outline=(255, 255, 255), width=3)
    cx = w / 2
    d.rounded_rectangle((cx - 22, 52, cx + 22, 128), radius=14, fill=(255, 255, 255))
    d.rectangle((cx - 10, 36, cx + 10, 54), fill=(255, 255, 255))
    d.line([(cx + 10, 40), (cx + 34, 46), (cx + 38, 70)], fill=(255, 255, 255), width=5)
    _texto(d, (w / 2, h - 30), 'EXTINTOR', 20, (255, 255, 255))
    return im


def _reloj(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex('#e9ecee'))
    d = ImageDraw.Draw(im)
    c = w / 2
    d.ellipse((6, 6, w - 7, h - 7), fill=_hex('#f6f7f7'), outline=_hex('#2b2e33'), width=12)
    for k in range(60):
        ang = math.radians(k * 6)
        largo = 20 if k % 5 == 0 else 8
        r1, r0 = c - 26, c - 26 - largo
        d.line([(c + math.sin(ang) * r0, c - math.cos(ang) * r0), (c + math.sin(ang) * r1, c - math.cos(ang) * r1)],
               fill=_hex('#1c1e21'), width=5 if k % 5 == 0 else 2)
    for k in range(1, 13):
        ang = math.radians(k * 30)
        _texto(d, (c + math.sin(ang) * (c - 68), c - math.cos(ang) * (c - 68)), str(k), 36, _hex('#1c1e21'))
    _texto(d, (c, c * 0.62), 'CIRUMAX', 16, _hex('#6d7379'), negrita=False)
    # Las diez y ocho: la hora de las fotografías de relojes.
    for ang, largo, ancho, color in ((math.radians(304), c * 0.50, 12, '#1c1e21'), (math.radians(48), c * 0.74, 8, '#1c1e21'), (math.radians(200), c * 0.80, 3, '#b3241f')):
        d.line([(c, c), (c + math.sin(ang) * largo, c - math.cos(ang) * largo)], fill=_hex(color), width=ancho)
    d.ellipse((c - 9, c - 9, c + 9, c + 9), fill=_hex('#1c1e21'))
    return im


def _pizarra(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex('#f4f6f5'))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w - 1, h - 1), outline=_hex('#9aa0a6'), width=6)
    _texto(d, (w // 2, 44), 'CONTEO DE GASAS E INSTRUMENTAL', 38, _hex('#1d4f57'))
    columnas = [0.04, 0.34, 0.50, 0.67, 0.84, 0.97]
    filas = ['GASAS', 'COMPRESAS', 'AGUJAS', 'BISTURÍES', 'INSTR. SET']
    top = 92
    alto_fila = (h - top - 30) / (len(filas) + 1)
    for k, t in enumerate(('', 'INICIO', '+ AGREG.', 'TOTAL', 'FINAL')):
        _texto(d, (w * (columnas[k] + columnas[k + 1]) / 2, top + alto_fila / 2), t, 22, _hex('#4a5058'))
    for j in range(len(filas) + 2):
        y = top + j * alto_fila
        d.line([(w * 0.04, y), (w * 0.97, y)], fill=_hex('#b4babf'), width=2)
    for k in range(len(columnas)):
        d.line([(w * columnas[k], top), (w * columnas[k], top + alto_fila * (len(filas) + 1))], fill=_hex('#b4babf'), width=2)
    datos = [('20', '10', '30', '30'), ('10', '4', '14', '14'), ('6', '0', '6', '6'), ('2', '0', '2', '2'), ('48', '0', '48', '48')]
    rng = np.random.default_rng(SEMILLA + 50)
    for j, nombre in enumerate(filas):
        y = top + (j + 1.5) * alto_fila
        _texto(d, (w * 0.06, y), nombre, 25, _hex('#2b2e33'), ancla='lm')
        for k, valor in enumerate(datos[j]):
            # Letra de marcador azul, algo torcida: el conteo se escribe a mano.
            capa = Image.new('RGBA', (90, 60), (0, 0, 0, 0))
            _texto(ImageDraw.Draw(capa), (45, 30), valor, 34, _hex('#1d4a9c') + (255,))
            capa = capa.rotate(float(rng.uniform(-6, 6)), resample=Image.BICUBIC)
            im.paste(capa, (int(w * (columnas[k + 1] + columnas[k + 2]) / 2 - 45), int(y - 30)), capa)
    return im


def _cartel_manos(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w - 1, 66), fill=_hex('#1d4f57'))
    _texto(d, (w // 2, 33), 'LAVADO QUIRÚRGICO DE MANOS', 26, (255, 255, 255))
    pasos = ['Mojar manos y antebrazos', 'Jabón antiséptico, 3 minutos', 'Palmas, dorso y dedos', 'Uñas con cepillo estéril', 'Antebrazos hasta el codo', 'Enjuagar de dedos a codo', 'Secar con compresa estéril']
    for k, t in enumerate(pasos):
        y = 96 + k * 58
        d.ellipse((24, y - 20, 64, y + 20), fill=_hex('#2a5ea8'))
        _texto(d, (44, y), str(k + 1), 24, (255, 255, 255))
        _texto(d, (84, y), t, 22, _hex('#2b2e33'), negrita=False, ancla='lm')
    _texto(d, (w // 2, h - 36), 'NO TOCAR EL GRIFO CON LAS MANOS', 20, _hex('#b3241f'))
    return im


def _cartel_lista(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (255, 255, 255))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w - 1, 70), fill=_hex('#2a5ea8'))
    _texto(d, (w // 2, 24), 'LISTA DE VERIFICACIÓN', 26, (255, 255, 255))
    _texto(d, (w // 2, 52), 'SEGURIDAD QUIRÚRGICA', 20, (255, 255, 255), negrita=False)
    bloques = [('ANTES DE LA ANESTESIA', ['Identidad y sitio confirmados', 'Consentimiento firmado', 'Equipo de anestesia revisado']),
               ('ANTES DE LA INCISIÓN', ['Equipo presentado por nombre', 'Antibiótico administrado', 'Imágenes disponibles']),
               ('ANTES DE SALIR', ['Conteo de gasas e instrumental', 'Muestras rotuladas', 'Problemas del equipo'])]
    y = 96
    for titulo, items in bloques:
        d.rectangle((16, y - 14, w - 17, y + 14), fill=_hex('#dfe9f4'))
        _texto(d, (26, y), titulo, 19, _hex('#1d4a9c'), ancla='lm')
        y += 40
        for t in items:
            d.rectangle((26, y - 10, 46, y + 10), outline=_hex('#4a5058'), width=2)
            d.line([(30, y), (36, y + 6), (44, y - 8)], fill=_hex('#2e8a4f'), width=3)
            _texto(d, (58, y), t, 17, _hex('#2b2e33'), negrita=False, ancla='lm')
            y += 34
        y += 18
    return im


def _plano_evacuacion(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex('#f1f4ee'))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w - 1, 40), fill=_hex('#1f8a4c'))
    _texto(d, (w // 2, 20), 'PLANO DE EVACUACIÓN', 22, (255, 255, 255))
    d.rectangle((40, 64, w - 40, h - 36), outline=_hex('#2b2e33'), width=4)
    d.rectangle((w // 2 - 36, h - 38, w // 2 + 36, h - 34), fill=_hex('#1f8a4c'))
    d.rectangle((40, 100, 46, 150), fill=_hex('#1f8a4c'))
    d.rounded_rectangle((w // 2 - 24, h // 2 - 30, w // 2 + 24, h // 2 + 30), radius=6, fill=_hex('#6fa8d6'))
    d.ellipse((w // 2 - 70, h - 90, w // 2 - 54, h - 74), fill=_hex('#b3241f'))
    d.line([(w // 2 - 62, h - 90), (w // 2 - 20, h - 52), (w // 2, h - 40)], fill=_hex('#1f8a4c'), width=3)
    _texto(d, (w // 2, h - 14), 'USTED ESTÁ AQUÍ', 14, _hex('#b3241f'))
    return im


def _manometro(w, h, valor, maximo, unidad, color):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex('#f4f6f5'))
    d = ImageDraw.Draw(im)
    c = w / 2
    d.ellipse((4, 4, w - 5, h - 5), fill=_hex('#f4f6f5'), outline=_hex('#1c1e21'), width=5)
    for k in range(0, 11):
        ang = math.radians(225 - k * 27)
        r1, r0 = c - 16, c - 16 - (14 if k % 5 == 0 else 7)
        d.line([(c + math.cos(ang) * r0, c - math.sin(ang) * r0), (c + math.cos(ang) * r1, c - math.sin(ang) * r1)], fill=_hex('#1c1e21'), width=2)
    _texto(d, (c, c + 22), unidad, 15, _hex(color))
    ang = math.radians(225 - 27 * 10 * valor / maximo)
    d.line([(c, c), (c + math.cos(ang) * (c - 26), c - math.sin(ang) * (c - 26))], fill=_hex('#b3241f'), width=4)
    d.ellipse((c - 6, c - 6, c + 6, c + 6), fill=_hex('#1c1e21'))
    return im


def _caja(w, h, titulo, sub, color, marca='INSUPAK'):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (244, 245, 243))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w - 1, 34), fill=_hex(color))
    _texto(d, (10, 17), marca, 16, (255, 255, 255), ancla='lm')
    _texto(d, (w - 10, 17), 'ESTÉRIL', 13, (255, 255, 255), negrita=False, ancla='rm')
    _texto(d, (w // 2, 70), titulo, 24, _hex('#1c1e21'))
    _texto(d, (w // 2, 100), sub, 14, _hex('#4a5058'), negrita=False)
    d.rectangle((0, h - 14, w - 1, h - 1), fill=_hex(color))
    for k in range(18):
        d.rectangle((12 + k * 6 + (k % 3), h - 38, 14 + k * 6 + (k % 3), h - 18), fill=_hex('#1c1e21'))
    return im


def _bolsa(w, h, titulo, sub, color):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (236, 242, 244))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 56, w, h - 36), fill=(255, 255, 255))
    d.rectangle((0, 56, w, 62), fill=_hex(color))
    for k in range(7):
        y = 78 + k * 9
        d.line([(18, y), (30, y)], fill=_hex('#8a9096'), width=1)
    _texto(d, (w // 2 + 8, 116), titulo, 17, _hex(color))
    _texto(d, (w // 2 + 8, 142), sub, 13, _hex('#2b2e33'), negrita=False)
    _texto(d, (w // 2 + 8, 168), '500 mL', 18, _hex('#2b2e33'))
    return im


def _logo(w, h, texto, color, fondo='#e9ecee'):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex(fondo))
    d = ImageDraw.Draw(im)
    d.ellipse((10, h * 0.2, 10 + h * 0.6, h * 0.8), outline=_hex(color), width=4)
    d.line([(10 + h * 0.3 - 8, h * 0.5), (10 + h * 0.3 + 8, h * 0.5)], fill=_hex(color), width=4)
    d.line([(10 + h * 0.3, h * 0.5 - 8), (10 + h * 0.3, h * 0.5 + 8)], fill=_hex(color), width=4)
    _texto(d, (h + 6, h * 0.5), texto, int(h * 0.52), _hex(color), ancla='lm')
    return im


def _etiqueta_gas(w, h, texto, fondo, tinta='#ffffff'):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), _hex(fondo))
    d = ImageDraw.Draw(im)
    d.rectangle((2, 2, w - 3, h - 3), outline=_hex(tinta), width=2)
    _texto(d, (w // 2, h // 2), texto, int(h * 0.55), _hex(tinta))
    return im


def _etiqueta_cajon(w, h, texto):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (244, 245, 243))
    d = ImageDraw.Draw(im)
    d.rectangle((1, 1, w - 2, h - 2), outline=_hex('#8a9096'), width=2)
    _texto(d, (w // 2, h // 2), texto, int(h * 0.5), _hex('#1c1e21'))
    return im


def hacer_el_atlas():
    from PIL import Image
    atlas = Image.new('RGB', (LADO_DEL_ATLAS, LADO_DEL_ATLAS), _hex('#9aa0a6'))
    contenido = {
        'pizarra': _pizarra, 'cartel-manos': _cartel_manos, 'cartel-lista': _cartel_lista, 'reloj': _reloj,
        'plano-evacuacion': _plano_evacuacion,
        'letrero-pabellon': _letrero_pabellon,
        'letrero-zona-esteril': lambda w, h: _letrero_banda(w, h, 'ZONA ESTÉRIL', 'Prohibido el paso sin vestimenta quirúrgica', '#b3241f', (255, 255, 255)),
        'letrero-lavado': lambda w, h: _letrero_banda(w, h, 'LAVADO QUIRÚRGICO', 'Antes de entrar al pabellón', '#2a5ea8', (255, 255, 255), 50),
        'letrero-personal': lambda w, h: _letrero_banda(w, h, 'SOLO PERSONAL AUTORIZADO', None, '#2b2e33', (255, 255, 255), 38),
        'letrero-salida': _letrero_salida, 'letrero-radiacion': _letrero_radiacion, 'letrero-biologico': _letrero_biologico,
        'letrero-mascarilla': _letrero_mascarilla, 'letrero-extintor': _letrero_extintor,
        'manometro-o2': lambda w, h: _manometro(w, h, 190, 250, 'bar O2', '#1c1e21'),
        'manometro-aire': lambda w, h: _manometro(w, h, 170, 250, 'bar AIRE', '#1c1e21'),
        'manometro-vac': lambda w, h: _manometro(w, h, 150, 250, 'kPa VAC', '#1c1e21'),
        'caja-guantes': lambda w, h: _caja(w, h, 'GUANTES QUIRÚRGICOS', 'Talla 7½ · látex libre de polvo', '#2a5ea8'),
        'caja-gasas': lambda w, h: _caja(w, h, 'GASAS 10 × 10', '12 capas · 5 un', '#2e8a4f'),
        'caja-sutura': lambda w, h: _caja(w, h, 'SUTURA NYLON 3-0', 'Aguja 24 mm · 12 un', '#6b3f8c'),
        'caja-jeringas': lambda w, h: _caja(w, h, 'JERINGAS 10 mL', 'Luer lock · 50 un', '#d9701b'),
        'caja-mascarillas': lambda w, h: _caja(w, h, 'MASCARILLAS', 'Tres capas · 50 un', '#8ec9e6'),
        'caja-campo': lambda w, h: _caja(w, h, 'CAMPO ESTÉRIL', '75 × 90 cm · 20 un', '#1d4f57'),
        'caja-via': lambda w, h: _caja(w, h, 'SET VÍA VENOSA', 'Con cámara de goteo', '#b3241f'),
        'caja-compresas': lambda w, h: _caja(w, h, 'COMPRESAS 45 × 45', 'Con hilo radiopaco', '#d9b21c'),
        'bolsa-suero': lambda w, h: _bolsa(w, h, 'SUERO FISIOL.', 'NaCl 0,9 %', '#2a5ea8'),
        'bolsa-ringer': lambda w, h: _bolsa(w, h, 'RINGER LACTATO', 'Solución', '#2e8a4f'),
        'bolsa-glucosa': lambda w, h: _bolsa(w, h, 'GLUCOSADO 5 %', 'Dextrosa', '#d9701b'),
        'logo-anestesia': lambda w, h: _logo(w, h, 'ANESTRA 700', '#1d4f57'),
        'logo-arco': lambda w, h: _logo(w, h, 'ARCOFLUX C-ARM', '#1d4a9c'),
        'logo-electro': lambda w, h: _logo(w, h, 'CAUTERA ES-300', '#b3241f'),
        'logo-aspirador': lambda w, h: _logo(w, h, 'SUCCIONA', '#2e8a4f'),
        'logo-lampara': lambda w, h: _logo(w, h, 'CIALUM', '#4a5058', '#f4f6f5'),
        'etiq-o2': lambda w, h: _etiqueta_gas(w, h, 'O2', '#f4f6f5', '#1c1e21'),
        'etiq-aire': lambda w, h: _etiqueta_gas(w, h, 'AIRE', '#1c1e21'),
        'etiq-vac': lambda w, h: _etiqueta_gas(w, h, 'VAC', '#d9b21c', '#1c1e21'),
        'cajon-via-aerea': lambda w, h: _etiqueta_cajon(w, h, 'VÍA AÉREA'),
        'cajon-farmacos': lambda w, h: _etiqueta_cajon(w, h, 'FÁRMACOS'),
        'cajon-vias': lambda w, h: _etiqueta_cajon(w, h, 'VÍAS Y SUEROS'),
        'cajon-otros': lambda w, h: _etiqueta_cajon(w, h, 'INSUMOS'),
        'etiqueta-armario': lambda w, h: _etiqueta_cajon(w, h, 'INSUMOS ESTÉRILES'),
    }
    for nombre, (x, y, w, h) in RECTAS.items():
        if nombre.startswith('m-'):
            color = dict(MUESTRAS)[nombre[2:]]
            atlas.paste(_hex(color), (x, y, x + w, y + h))
            continue
        atlas.paste(contenido[nombre](w, h), (x, y))
    SALIDA.mkdir(parents=True, exist_ok=True)
    atlas.save(SALIDA / 'etiquetas.png')
    print(f'ESCRITO etiquetas.png: {LADO_DEL_ATLAS}² ({len(RECTAS)} rectángulos, usa hasta y = {_y_muestras + LADO_DE_LA_MUESTRA})')


# ------------------------------------------------------------------------------------------ pantallas


def _suavizar(a, k):
    nucleo = np.ones(k) / k
    return np.convolve(np.pad(a, k, mode='wrap'), nucleo, mode='same')[k:-k]


def _ecg(n, periodo):
    """Un latido sinusal repetido: P, QRS y T como campanas, en n muestras con `periodo` muestras por latido."""
    t = (np.arange(n) % periodo) / periodo
    g = lambda c, a, s: a * np.exp(-((t - c) / s) ** 2)
    return g(0.18, 0.10, 0.035) - g(0.29, 0.12, 0.010) + g(0.32, 1.0, 0.012) - g(0.35, 0.22, 0.012) + g(0.55, 0.22, 0.05)


def _pleti(n, periodo):
    t = (np.arange(n) % periodo) / periodo
    return np.exp(-((t - 0.25) / 0.10) ** 2) + 0.35 * np.exp(-((t - 0.52) / 0.09) ** 2)


def _pantalla_signos(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (6, 8, 10))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w, 22), fill=(28, 34, 40))
    _texto(d, (8, 11), 'PACIENTE DEMO · QUIRÓFANO 3', 12, (200, 210, 215), negrita=False, ancla='lm')
    _texto(d, (w - 8, 11), '10:08', 13, (200, 210, 215), ancla='rm')
    ancho_ondas = int(w * 0.70)
    canales = [(0.0, '#37d66b', 'II', 62, _ecg(ancho_ondas, 82), 34), (1.0, '#4fd2e8', 'SpO2', 98, _pleti(ancho_ondas, 82), 30),
               (2.0, '#e85a4f', 'PA', 62, _pleti(ancho_ondas, 82) ** 1.3, 30)]
    for k, color, nombre, _v, onda, amp in canales:
        y0 = 30 + k * 96
        _texto(d, (8, y0 + 6), nombre, 12, _hex(color), ancla='lm')
        puntos = [(x, y0 + 80 - onda[x] * amp * 1.6 - 10) for x in range(ancho_ondas)]
        d.line(puntos, fill=_hex(color), width=2)
        d.line([(0, y0 + 91), (ancho_ondas, y0 + 91)], fill=(30, 36, 40), width=1)
    x = ancho_ondas + 14
    for y, color, titulo, valor, sub in ((30, '#37d66b', 'FC', '72', 'lpm'), (88, '#4fd2e8', 'SpO2', '98', '%'), (146, '#ffffff', 'PA', '118/76', '(90)'),
                                           (212, '#f2c744', 'EtCO2', '36', 'mmHg'), (262, '#e8e8e8', 'T', '36,5', '°C')):
        _texto(d, (x, y), titulo, 12, _hex(color), negrita=False, ancla='lm')
        _texto(d, (x + 4, y + 22), valor, 34 if len(valor) < 5 else 28, _hex(color), ancla='lm')
        _texto(d, (w - 8, y), sub, 11, _hex(color), negrita=False, ancla='rm')
    return im


def _pantalla_ventilador(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (8, 10, 14))
    d = ImageDraw.Draw(im)
    _texto(d, (8, 12), 'VENTILACIÓN · VCV', 13, (200, 210, 215), ancla='lm')
    n = int(w * 0.62)
    t = (np.arange(n) % 90) / 90
    paw = np.where(t < 0.38, 0.25 + 0.65 * np.clip(np.sin(np.pi * t / 0.38), 0, None) ** 0.6 * (0.6 + 0.4 * t / 0.38), 0.25)
    flujo = np.where(t < 0.38, 0.55, np.where(t < 0.60, -0.8 * np.exp(-(t - 0.38) / 0.06), 0.0))
    for y0, onda, color, nombre in ((28, paw, '#f2c744', 'Paw'), (112, flujo, '#37d66b', 'Flujo')):
        base = y0 + 70 if onda is paw else y0 + 42
        d.line([(x, base - onda[x] * 56) for x in range(n)], fill=_hex(color), width=2)
        _texto(d, (8, y0 + 4), nombre, 11, _hex(color), negrita=False, ancla='lm')
    x = int(w * 0.66)
    for y, titulo, valor in ((34, 'Vt', '500 mL'), (74, 'FR', '12 /min'), (114, 'PEEP', '5 cmH2O'), (154, 'Ppico', '18 cmH2O'), (194, 'FiO2', '40 %'), (230, 'I:E', '1:2')):
        _texto(d, (x, y), titulo, 11, (140, 160, 170), negrita=False, ancla='lm')
        _texto(d, (x, y + 15), valor, 18, (235, 240, 245), ancla='lm')
    return im


def _hueso_ap(w, h):
    """
    Una tibia y un peroné de frente, con una fractura de metáfisis distal reducida con placa y tornillos. Va en niveles
    de gris, hueso claro sobre fondo oscuro, como una placa digital: contorno cortical brillante, canal más oscuro, partes
    blandas apenas marcadas y grano de ruido.
    """
    from PIL import Image, ImageDraw, ImageFilter
    rng = np.random.default_rng(SEMILLA + 60)
    cortical = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(cortical)

    def lerp(a, b, t):
        return a + (b - a) * t

    # Tibia: del platillo (arriba) al maléolo medial (abajo), con la diáfisis algo arqueada.
    y0, y1 = int(h * 0.04), int(h * 0.96)
    izquierda, derecha = [], []
    for k in range(60):
        t = k / 59
        y = lerp(y0, y1, t)
        centro = w * (0.50 + 0.025 * math.sin(t * math.pi * 1.2))
        ancho = w * (0.050 + 0.150 * math.exp(-((t - 0.03) / 0.09) ** 2) + 0.085 * math.exp(-((t - 0.97) / 0.07) ** 2) + 0.018 * math.exp(-((t - 0.5) / 0.35) ** 2))
        izquierda.append((centro - ancho, y))
        derecha.append((centro + ancho, y))
    d.polygon(izquierda + derecha[::-1], fill=255)
    # Peroné: más fino, lateral (derecha de la imagen), de la cabeza al maléolo lateral.
    pi, pd = [], []
    for k in range(60):
        t = k / 59
        y = lerp(h * 0.12, h * 0.97, t)
        centro = w * (0.645 + 0.03 * math.sin(t * math.pi) - 0.015 * t)
        ancho = w * (0.022 + 0.022 * math.exp(-((t - 0.04) / 0.05) ** 2) + 0.026 * math.exp(-((t - 0.97) / 0.05) ** 2))
        pi.append((centro - ancho, y))
        pd.append((centro + ancho, y))
    d.polygon(pi + pd[::-1], fill=255)
    # Cóndilos femorales, cortados por el borde de arriba, y el astrágalo, por el de abajo.
    d.ellipse((w * 0.22, -h * 0.10, w * 0.50, h * 0.045), fill=255)
    d.ellipse((w * 0.50, -h * 0.10, w * 0.78, h * 0.045), fill=255)
    d.ellipse((w * 0.30, h * 0.94, w * 0.68, h * 1.06), fill=255)
    mascara = np.asarray(cortical, dtype=np.float64) / 255.0
    suave = np.asarray(cortical.filter(ImageFilter.GaussianBlur(5)), dtype=np.float64) / 255.0
    interior = np.asarray(cortical.filter(ImageFilter.GaussianBlur(11)), dtype=np.float64) / 255.0
    # La cortical es la parte de la máscara que no está lejos del borde; el canal medular, lo hondo.
    canal = np.clip((interior - 0.62) / 0.3, 0, 1)
    hueso = suave * (0.58 + 0.30 * (1 - canal)) * (0.85 + 0.15 * np.clip(rng.normal(1, 0.1, (h, w)), 0.7, 1.3))
    # Esponjosa en las epífisis: trabéculas.
    trabecula = np.clip(0.5 + 0.5 * np.sin(np.arange(w)[None, :] * 0.5) * np.sin(np.arange(h)[:, None] * 0.35), 0, 1)
    epifisis = np.exp(-((np.arange(h)[:, None] / h - 0.05) / 0.07) ** 2) + np.exp(-((np.arange(h)[:, None] / h - 0.97) / 0.06) ** 2)
    hueso += 0.10 * suave * trabecula * np.clip(epifisis, 0, 1)
    # Las partes blandas: una silueta ancha y tenue.
    blandas = Image.new('L', (w, h), 0)
    db = ImageDraw.Draw(blandas)
    izq, der = [], []
    for k in range(40):
        t = k / 39
        y = h * (0.0 + t)
        c = w * (0.52 + 0.01 * math.sin(t * 5))
        a = w * (0.30 - 0.06 * math.sin(t * math.pi) + 0.03 * t)
        izq.append((c - a, y))
        der.append((c + a, y))
    db.polygon(izq + der[::-1], fill=255)
    blandas = np.asarray(blandas.filter(ImageFilter.GaussianBlur(14)), dtype=np.float64) / 255.0
    imagen = 0.05 + 0.22 * blandas + 0.78 * hueso
    # La fractura: una línea oscura oblicua a unos dos tercios, con un pequeño desplazamiento.
    frac = Image.new('L', (w, h), 0)
    df = ImageDraw.Draw(frac)
    df.line([(w * 0.435, h * 0.70), (w * 0.49, h * 0.675), (w * 0.53, h * 0.70), (w * 0.585, h * 0.665)], fill=255, width=3)
    frac = np.asarray(frac.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float64) / 255.0
    imagen -= 0.30 * frac * (suave > 0.4)
    # Una placa lateral con tornillos: metal muy brillante, que satura.
    metal = Image.new('L', (w, h), 0)
    dm = ImageDraw.Draw(metal)
    dm.rounded_rectangle((w * 0.575, h * 0.56, w * 0.610, h * 0.90), radius=4, fill=255)
    for k in range(7):
        yy = h * (0.585 + 0.043 * k)
        dm.ellipse((w * 0.586 - 4, yy - 4, w * 0.600 + 4, yy + 4), fill=170)
        dm.line([(w * 0.44, yy - 3), (w * 0.59, yy)], fill=210, width=3)
    metal = np.asarray(metal.filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float64) / 255.0
    imagen = np.maximum(imagen, 0.55 + 0.45 * metal) * (metal > 0.1) + imagen * (metal <= 0.1)
    imagen += rng.normal(0, 0.012, (h, w))
    return np.clip(imagen, 0, 1)


def _pantalla_pacs(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (6, 7, 9))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w, 34), fill=(24, 28, 34))
    _texto(d, (12, 17), 'VISOR DE IMÁGENES · TIBIA Y PERONÉ AP', 17, (205, 215, 220), negrita=False, ancla='lm')
    _texto(d, (w - 12, 17), '10:08', 16, (205, 215, 220), ancla='rm')
    placa = (_hueso_ap(330, 494) * 255).astype(np.uint8)
    marco = Image.fromarray(placa, 'L').convert('RGB')
    x0 = int(w * 0.5 - 165)
    im.paste(marco, (x0, 44))
    d.rectangle((x0, 44, x0 + 329, 537), outline=(60, 70, 78), width=1)
    _texto(d, (x0 + 10, 56), 'D', 20, (240, 240, 120), ancla='lm')
    _texto(d, (x0 + 10, 524), 'AP · 60 kV · 4 mAs', 12, (190, 200, 205), negrita=False, ancla='lm')
    # Texto de paciente a la izquierda y la serie a la derecha.
    for k, (t, c) in enumerate((('PACIENTE DEMO', (230, 235, 238)), ('ID 0000-0000', (160, 172, 178)), ('M · 47 años', (160, 172, 178)), ('Estudio: 18/11', (160, 172, 178)),
                                  ('Fractura distal', (240, 200, 90)), ('de tibia, 43-A', (240, 200, 90)), ('Placa lateral', (160, 172, 178)))):
        _texto(d, (14, 70 + k * 26), t, 15, c, negrita=k == 0, ancla='lm')
    for k in range(4):
        y = 54 + k * 128
        mini = Image.fromarray((_hueso_ap(110, 110) * 255).astype(np.uint8), 'L').convert('RGB')
        im.paste(mini, (w - 130, y))
        d.rectangle((w - 130, y, w - 21, y + 109), outline=(110, 150, 190) if k == 0 else (60, 70, 78), width=2 if k == 0 else 1)
    d.rectangle((0, h - 30, w, h), fill=(24, 28, 34))
    for k, t in enumerate(('Ventana', 'Zoom', 'Medir', 'Ángulo', 'Invertir', 'Anotar')):
        _texto(d, (60 + k * 130, h - 15), t, 14, (180, 195, 205), negrita=False)
    return im


def _pantalla_boom(w, h):
    from PIL import Image, ImageDraw, ImageFilter
    im = Image.new('RGB', (w, h), (4, 4, 6))
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(SEMILLA + 70)
    mitad = w // 2
    # Izquierda: la imagen de una cámara intraoperatoria, redonda sobre negro.
    yy, xx = np.mgrid[0:h, 0:mitad]
    cx, cy, r = mitad / 2, h / 2, h * 0.47
    dist = np.hypot(xx - cx, yy - cy)
    tejido = 0.5 + 0.25 * np.sin(xx * 0.05 + np.sin(yy * 0.04) * 2) + 0.2 * np.sin(yy * 0.07 - xx * 0.02)
    tejido += rng.normal(0, 0.03, tejido.shape)
    rojo = np.clip(0.55 + 0.35 * tejido - 0.35 * (dist / r) ** 2, 0, 1)
    verde = np.clip(0.18 + 0.20 * tejido - 0.15 * (dist / r) ** 2, 0, 1)
    azul = np.clip(0.14 + 0.12 * tejido - 0.10 * (dist / r) ** 2, 0, 1)
    brillo = np.exp(-(((xx - cx * 1.2) / 26) ** 2 + ((yy - cy * 0.7) / 14) ** 2)) * 0.5
    rgb = np.stack([rojo + brillo, verde + brillo, azul + brillo], axis=-1)
    rgb *= (dist < r)[..., None] * np.clip((r - dist) / 5, 0, 1)[..., None]
    izquierda = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), 'RGB')
    im.paste(izquierda, (0, 0))
    d.line([(cx + 20, cy + r * 0.9), (cx - 10, cy - 10), (cx - 40, cy - 30)], fill=(190, 195, 200), width=7)
    _texto(d, (10, 12), 'CÁMARA 1 · 1080p', 13, (230, 235, 240), negrita=False, ancla='lm')
    _texto(d, (mitad - 10, h - 14), '● REC 00:42:17', 12, (235, 70, 60), ancla='rm')
    # Derecha: un corte axial de pierna.
    yy, xx = np.mgrid[0:h, 0:mitad]
    cx, cy = mitad / 2, h / 2 + 4
    piel = ((xx - cx) / (mitad * 0.36)) ** 2 + ((yy - cy) / (h * 0.40)) ** 2
    musculo = np.where(piel < 1.0, 0.36 + 0.10 * np.sin(xx * 0.09) * np.sin(yy * 0.08), 0.0)
    grasa = np.where((piel < 1.0) & (piel > 0.80), 0.20, 0.0)
    img = np.where(piel < 0.80, musculo, grasa)

    for x, y, rx, ry in ((cx - 18, cy + 6, 38, 34), (cx + 66, cy + 10, 15, 14)):
        dd = ((xx - x) / rx) ** 2 + ((yy - y) / ry) ** 2
        img = np.where(dd < 1.0, np.where(dd > 0.50, 0.92, 0.42), img)
    img = img + rng.normal(0, 0.03, img.shape)
    derecha = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8), 'L').convert('RGB')
    im.paste(derecha, (mitad, 0))
    _texto(d, (mitad + 10, 12), 'TC · CORTE AXIAL', 13, (230, 235, 240), negrita=False, ancla='lm')
    _texto(d, (w - 10, h - 14), 'W 400 · L 40', 12, (190, 200, 205), negrita=False, ancla='rm')
    d.line([(mitad, 0), (mitad, h)], fill=(40, 44, 48), width=2)
    return im


def _pantalla_arco(w, h):
    """La fluoroscopia del arco en C: la radiografía recortada en un disco, como la imagen redonda del intensificador, con sus datos."""
    from PIL import Image, ImageDraw
    placa = (_hueso_ap(260, 300) * 255).astype(np.uint8)
    base = np.zeros((h, w), dtype=np.uint8)
    alto, ancho = min(h - 10, placa.shape[0]), min(w, placa.shape[1])
    x0 = (w - ancho) // 2
    base[10:10 + alto, x0:x0 + ancho] = placa[:alto, :ancho]
    yy, xx = np.mgrid[0:h, 0:w]
    base = np.where(np.hypot(xx - w / 2, yy - h / 2) < h * 0.49, base, 0).astype(np.uint8)
    im = Image.fromarray(base, 'L').convert('RGB')
    d = ImageDraw.Draw(im)
    for k, t in enumerate(('FLUORO', 'kV 58', 'mA 1,8', '00:12 s', '3,2 mGy')):
        _texto(d, (10, 14 + k * 20), t, 14, (240, 240, 130) if k == 0 else (200, 210, 215), negrita=k == 0, ancla='lm')
    _texto(d, (w - 10, h - 14), 'LAST IMAGE HOLD', 11, (160, 170, 175), negrita=False, ancla='rm')
    return im


def _pantalla_control(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (10, 18, 30))
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, w, 30), fill=(20, 40, 66))
    _texto(d, (12, 15), 'CONTROL DE SALA · PABELLÓN 3', 14, (200, 225, 245), negrita=False, ancla='lm')
    for k, (t, v, c) in enumerate((('TEMPERATURA', '21,5 °C', '#7fe0a0'), ('HUMEDAD', '52 %', '#7fd0e8'), ('PRESIÓN', '+15 Pa', '#e8d27f'))):
        x = 12 + k * 122
        d.rounded_rectangle((x, 42, x + 112, 110), radius=8, fill=(20, 32, 50))
        _texto(d, (x + 56, 56), t, 11, (150, 170, 190), negrita=False)
        _texto(d, (x + 56, 88), v, 22, _hex(c))
    d.rounded_rectangle((12, 122, w - 12, 196), radius=8, fill=(20, 32, 50))
    _texto(d, (w // 2, 138), 'TIEMPO DE CIRUGÍA', 12, (150, 170, 190), negrita=False)
    _texto(d, (w // 2, 172), '00:42:17', 40, (240, 245, 250))
    for k, t in enumerate(('LUZ', 'CRONÓMETRO', 'REINICIAR')):
        x = 12 + k * 122
        d.rounded_rectangle((x, 206, x + 112, 244), radius=8, fill=(34, 74, 120))
        _texto(d, (x + 56, 225), t, 13, (230, 240, 250))
    return im


def _pantalla_menores(w, h):
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (w, h), (8, 10, 12))
    d = ImageDraw.Draw(im)
    mw, mh = w // 2, h // 2
    # (0,0): unidad electroquirúrgica; (1,0): reloj de lavado; (0,1): bomba de infusión; (1,1): calentador de líquidos.
    d.rectangle((0, 0, mw - 1, mh - 1), fill=(14, 20, 16))
    _texto(d, (10, 14), 'MONOPOLAR', 13, (130, 220, 150), negrita=False, ancla='lm')
    _texto(d, (10, 54), 'CORTE', 14, (190, 200, 195), negrita=False, ancla='lm')
    _texto(d, (mw - 10, 54), '40 W', 28, (140, 235, 160), ancla='rm')
    _texto(d, (10, 98), 'COAG', 14, (190, 200, 195), negrita=False, ancla='lm')
    _texto(d, (mw - 10, 98), '30 W', 28, (235, 215, 120), ancla='rm')
    d.rectangle((mw, 0, w - 1, mh - 1), fill=(10, 14, 12))
    _texto(d, (mw + mw // 2, 22), 'LAVADO', 15, (140, 230, 160), negrita=False)
    _texto(d, (mw + mw // 2, 66), '02:41', 50, (110, 245, 150))
    d.rectangle((mw + 16, 108, w - 16, 118), outline=(70, 130, 90), width=2)
    d.rectangle((mw + 18, 110, mw + 18 + int((mw - 36) * 0.85), 116), fill=(110, 245, 150))
    d.rectangle((0, mh, mw - 1, h - 1), fill=(12, 16, 22))
    _texto(d, (10, mh + 14), 'BOMBA 1 · INFUSIÓN', 13, (150, 200, 235), negrita=False, ancla='lm')
    _texto(d, (10, mh + 62), '125', 40, (230, 240, 250), ancla='lm')
    _texto(d, (mw - 10, mh + 72), 'mL/h', 16, (150, 200, 235), negrita=False, ancla='rm')
    _texto(d, (10, mh + 106), 'VTBI 320 mL', 13, (190, 200, 205), negrita=False, ancla='lm')
    d.rectangle((mw, mh, w - 1, h - 1), fill=(20, 12, 10))
    _texto(d, (mw + 10, mh + 14), 'CALENTADOR', 13, (240, 170, 130), negrita=False, ancla='lm')
    _texto(d, (mw + 10, mh + 62), '40,0', 40, (255, 190, 140), ancla='lm')
    _texto(d, (w - 10, mh + 72), '°C', 18, (240, 170, 130), negrita=False, ancla='rm')
    _texto(d, (mw + 10, mh + 106), 'LISTO', 14, (150, 230, 160), ancla='lm')
    return im


def hacer_las_pantallas():
    from PIL import Image
    SALIDA.mkdir(parents=True, exist_ok=True)
    dibujar = {'pantalla-signos': _pantalla_signos, 'pantalla-ventilador': _pantalla_ventilador, 'pantalla-pacs': _pantalla_pacs, 'pantalla-boom': _pantalla_boom,
               'pantalla-arco': _pantalla_arco, 'pantalla-control': _pantalla_control, 'pantalla-menores': _pantalla_menores}
    for nombre, (w, h) in PANTALLAS.items():
        im = dibujar[nombre](w, h)
        assert im.size == (w, h), (nombre, im.size)
        im.save(SALIDA / f'{nombre}.png')
    print(f'ESCRITAS {len(PANTALLAS)} pantallas')


def hacer_los_mosaicos():
    SALIDA.mkdir(parents=True, exist_ok=True)
    hechos = {'normal-acero': acero_cepillado, 'normal-vinilo': vinilo, 'normal-tejido': tejido, 'normal-goma': goma, 'perforado': chapa_perforada}
    for nombre, (n, lado) in MOSAICOS.items():
        guardar_gris(nombre, hechos[nombre](n, lado))
    print(f'ESCRITOS {len(MOSAICOS)} mosaicos')


# ----------------------------------------------------------------------------------------------- la planta anotada
#
# La foto de planta que deja `sala.py --vistas` es la sala vista desde arriba con el techo quitado: se ve dónde está cada
# cosa, pero no cómo se llama ni en qué coordenada. Esto le pone encima lo que dice `DISPOSICION` (que `sala.py` vuelca a un
# JSON ya resuelto, en metros de la sala): cada pieza con su número, el frente de lo que tiene frente, la zona libre, lo
# que va en el techo en punteado, una cuadrícula de a metro con sus coordenadas, y la leyenda al lado. Vive aquí y no en
# `sala.py` porque Pillow no está en el Python de Blender, y porque la leyenda es texto, que es de lo que se ocupa este archivo.

ANCHO_DE_LA_LEYENDA = 1040


def _punteada(d, puntos, color, ancho=3, trazo=14.0, hueco=9.0):
    """Una polilínea a trazos: se camina por ella y se alterna entre dibujar y saltar, sin reiniciar el patrón en cada vértice."""
    resto, dibuja = trazo, True
    for (x0, y0), (x1, y1) in zip(puntos[:-1], puntos[1:]):
        largo = math.hypot(x1 - x0, y1 - y0)
        if largo == 0:
            continue
        pos = 0.0
        while pos < largo:
            paso = min(resto, largo - pos)
            if dibuja:
                a, b = pos / largo, (pos + paso) / largo
                d.line([(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a), (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)], fill=color, width=ancho)
            pos += paso
            resto -= paso
            if resto <= 1e-9:
                dibuja = not dibuja
                resto = trazo if dibuja else hueco


def _texto_con_borde(d, xy, texto, tam, color=(255, 255, 255, 255), borde=(10, 14, 16, 235), ancla='mm', negrita=True, grosor=None):
    """Texto blanco con un borde oscuro, para que se lea sobre cualquier fondo; el borde crece con la letra, o las pequeñas se empastan."""
    d.text(xy, texto, font=_fuente(tam, negrita), fill=color, anchor=ancla, stroke_width=grosor if grosor is not None else (2 if tam >= 20 else 1), stroke_fill=borde)


def _insignia(d, centro, numero, color, radio=17):
    x, y = centro
    d.ellipse((x - radio - 2, y - radio - 2, x + radio + 2, y + radio + 2), fill=(255, 255, 255, 255))
    d.ellipse((x - radio, y - radio, x + radio, y + radio), fill=_hex(color) + (255,))
    d.text((x, y + 1), str(numero), font=_fuente(20 if numero < 100 else 16, True), fill=(255, 255, 255, 255), anchor='mm')


def anotar_la_planta(ruta_datos, ruta_base, ruta_destino):
    import json
    from PIL import Image, ImageDraw

    datos = json.loads(Path(ruta_datos).read_text(encoding='utf-8'))
    base = Image.open(ruta_base).convert('RGBA')
    lado = base.size[0]
    s = datos['escala']
    centro = lado / 2
    medio = datos['medio']

    def px(x, z):
        return (centro + x * s, centro + z * s)

    capa = Image.new('RGBA', base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)

    # La cuadrícula, de a metro, para poder leer una coordenada sin regla. Sus números van en la franja más exterior del margen.
    fuera = medio * s + 185
    for m in range(-3, 4):
        d.line([px(m, -medio), px(m, medio)], fill=(255, 255, 255, 52), width=1)
        d.line([px(-medio, m), px(medio, m)], fill=(255, 255, 255, 52), width=1)
        x, z = px(m, 0)[0], px(0, m)[1]
        for borde in (centro - fuera, centro + fuera):
            _texto_con_borde(d, (x, borde), f'x {m}'.replace('-', '−'), 17, negrita=False)
            _texto_con_borde(d, (borde, z), f'z {m}'.replace('-', '−'), 17, negrita=False)

    # La zona libre: el rectángulo y el círculo, dibujados aparte para que se vea cuál es cuál.
    zl = datos['zona_libre']
    (xa, ya), (xb, yb) = px(-zl['x'], zl['z0']), px(zl['x'], zl['z1'])
    d.rectangle((xa, ya, xb, yb), fill=(64, 192, 87, 30))
    verde = (47, 158, 68, 255)
    _punteada(d, [(xa, ya), (xb, ya), (xb, yb), (xa, yb), (xa, ya)], verde, 3)
    circulo = [px(zl['radio'] * math.cos(t * math.pi / 90), zl['radio'] * math.sin(t * math.pi / 90)) for t in range(181)]
    _punteada(d, circulo, verde, 3, 18.0, 12.0)

    # Lo que va en el techo, en punteado gris amarillento: no se ve en la foto porque el techo está oculto.
    techo = (214, 186, 64, 255)
    for t in datos['techo']:
        (x0, y0), (x1, y1) = px(t['x'] - t['ancho'] / 2, t['z'] - t['largo'] / 2), px(t['x'] + t['ancho'] / 2, t['z'] + t['largo'] / 2)
        _punteada(d, [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)], techo, 2, 8.0, 6.0)
        _texto_con_borde(d, ((x0 + x1) / 2, (y0 + y1) / 2), {'luminaria': 'luz', 'rejilla': 'rejilla', 'detector': 'humo'}[t['clase']], 14, techo, grosor=1, negrita=False)

    # Las piezas, en el orden de la leyenda: primero lo del piso, luego lo que cuelga y lo de las paredes.
    insignias = []
    puestas = []
    afuera = {'norte': (0, -1), 'sur': (0, 1), 'este': (1, 0), 'oeste': (-1, 0)}

    def insignia_de_pared(pieza, punto_en_pared):
        """La insignia fuera de la pared, en la primera franja libre: si ya hay una cerca, se aparta hacia afuera."""
        nx, nz = afuera[pieza['pared']]
        for franja in range(3):
            distancia = 0.22 + franja * 0.24
            c = (punto_en_pared[0] + nx * distancia * s, punto_en_pared[1] + nz * distancia * s)
            if all(math.hypot(c[0] - o[0], c[1] - o[1]) > 40 for o in puestas):
                break
        puestas.append(c)
        d.line([punto_en_pared, c], fill=_hex(pieza['color']) + (255,), width=3)
        insignias.append((c, pieza))

    for pieza in datos['piezas']:
        color = _hex(pieza['color'])
        relleno, trazo = color + (92,), color + (255,)
        clase = pieza['clase']
        if clase == 'piso':
            pts = [px(*p) for p in pieza['poligono']]
            d.polygon(pts, fill=relleno)
            d.line(pts + [pts[0]], fill=trazo, width=4)
            c = (sum(p[0] for p in pts) / 4, sum(p[1] for p in pts) / 4)
            frente = ((pts[2][0] + pts[3][0]) / 2, (pts[2][1] + pts[3][1]) / 2)
            d.line([c, frente], fill=trazo, width=3)
            vx, vz = frente[0] - c[0], frente[1] - c[1]
            n = math.hypot(vx, vz) or 1.0
            ux, uz = vx / n, vz / n
            d.polygon([(frente[0] + ux * 11, frente[1] + uz * 11), (frente[0] - ux * 5 - uz * 9, frente[1] - uz * 5 + ux * 9),
                       (frente[0] - ux * 5 + uz * 9, frente[1] - uz * 5 - ux * 9)], fill=trazo)
            insignias.append((c, pieza))
        elif clase == 'punto':
            c = px(pieza['x'], pieza['z'])
            d.ellipse((c[0] - 9, c[1] - 9, c[0] + 9, c[1] + 9), outline=trazo, width=4)
            insignias.append(((c[0] + 26, c[1]), pieza))
        elif clase == 'cialitica':
            ancla, codo, cabeza = px(*pieza['ancla']), px(*pieza['codo']), px(pieza['x'], pieza['z'])
            r = pieza['radio'] * s
            d.ellipse((cabeza[0] - r, cabeza[1] - r, cabeza[0] + r, cabeza[1] + r), fill=color + (70,), outline=trazo, width=3)
            d.line([ancla, codo, cabeza], fill=trazo, width=5)
            d.ellipse((ancla[0] - 10, ancla[1] - 10, ancla[0] + 10, ancla[1] + 10), fill=trazo)
            insignias.append((cabeza, pieza))
        elif clase == 'boom':
            ancla, fin = px(*pieza['ancla']), px(pieza['x'], pieza['z'])
            d.line([ancla, fin], fill=trazo, width=5)
            d.ellipse((ancla[0] - 10, ancla[1] - 10, ancla[0] + 10, ancla[1] + 10), fill=trazo)
            p0, p1 = px(pieza['x'] - 0.03, pieza['z'] - 0.64), px(pieza['x'] + 0.03, pieza['z'] + 0.64)
            d.rectangle((p0[0], p0[1], p1[0], p1[1]), fill=color + (150,), outline=trazo, width=3)
            insignias.append(((fin[0] - 30, fin[1]), pieza))
        elif clase == 'plenum':
            (x0, y0), (x1, y1) = px(pieza['x'] - pieza['ancho'] / 2, pieza['z'] - pieza['largo'] / 2), px(pieza['x'] + pieza['ancho'] / 2, pieza['z'] + pieza['largo'] / 2)
            _punteada(d, [(x0, y0), (x1, y0), (x1, y1), (x0, y1), (x0, y0)], trazo, 3, 20.0, 10.0)
            insignias.append(((x0 + 22, y0 + 22), pieza))
        else:
            p = px(pieza['x'], pieza['z'])
            largo = (pieza['ancho'] or 0.45) * s
            if pieza['pared'] in ('norte', 'sur'):
                a, b = (p[0] - largo / 2, p[1]), (p[0] + largo / 2, p[1])
            else:
                a, b = (p[0], p[1] - largo / 2), (p[0], p[1] + largo / 2)
            d.line([a, b], fill=trazo, width=10 if pieza['ancho'] else 7)
            insignia_de_pared(pieza, p)

    for retorno in datos['retornos']:
        p = px(retorno['x'], retorno['z'])
        horizontal = retorno['pared'] in ('norte', 'sur')
        a, b = ((p[0] - 0.3 * s, p[1]), (p[0] + 0.3 * s, p[1])) if horizontal else ((p[0], p[1] - 0.3 * s), (p[0], p[1] + 0.3 * s))
        d.line([a, b], fill=techo, width=6)

    # Las insignias van al final, encima de todo.
    for c, pieza in insignias:
        _insignia(d, c, pieza['numero'], pieza['color'])

    # Los rótulos de las paredes y la camilla. Los de los lados van girados para leerse a lo largo de la pared.
    _texto_con_borde(d, px(0, 0), 'CAMILLA', 17, grosor=2)
    for texto, (x, y), giro in (('NORTE  ·  CABECERA  (−Z)', (centro, centro - medio * s - 150), 0), ('SUR  ·  PIES  (+Z)', (centro, centro + medio * s + 150), 0),
                                ('OESTE  ·  IZQUIERDA  (−X)', (centro - medio * s - 150, centro), 90), ('ESTE  ·  DERECHA  (+X)', (centro + medio * s + 150, centro), -90)):
        if giro == 0:
            _texto_con_borde(d, (x, y), texto, 22)
            continue
        recto = Image.new('RGBA', (460, 40), (0, 0, 0, 0))
        _texto_con_borde(ImageDraw.Draw(recto), (230, 20), texto, 22)
        girado = recto.rotate(giro, expand=True)
        capa.alpha_composite(girado, (int(x - girado.size[0] / 2), int(y - girado.size[1] / 2)))
    # La regla de un metro, abajo a la izquierda.
    d.line([(60, lado - 52), (60 + s, lado - 52)], fill=(255, 255, 255, 255), width=5)
    d.line([(60, lado - 60), (60, lado - 44)], fill=(255, 255, 255, 255), width=3)
    d.line([(60 + s, lado - 60), (60 + s, lado - 44)], fill=(255, 255, 255, 255), width=3)
    _texto_con_borde(d, (60 + s / 2, lado - 70), '1 m', 18, grosor=2)

    mapa = Image.alpha_composite(base, capa)

    # La leyenda: dos columnas, cada pieza con su número, su nombre y su dato (coordenadas de DISPOSICION).
    ancho_total = lado + ANCHO_DE_LA_LEYENDA
    lienzo = Image.new('RGB', (ancho_total, lado), (244, 245, 242))
    lienzo.paste(mapa.convert('RGB'), (0, 0))
    ld = ImageDraw.Draw(lienzo)
    x0 = lado + 36
    ld.text((x0, 28), 'PLANTA DEL PABELLÓN', font=_fuente(34, True), fill=(30, 36, 40), anchor='lm')
    ld.text((x0, 66), 'Vista desde arriba con el techo oculto. Norte (la cabecera) arriba.', font=_fuente(19, False), fill=(70, 78, 84), anchor='lm')
    ld.text((x0, 90), 'Metros desde el centro del colchón: x a la derecha, z hacia los pies. Cada número es una entrada de DISPOSICION.', font=_fuente(15, False), fill=(70, 78, 84), anchor='lm')
    ld.text((x0, 112), 'Verde punteado: zona libre. Amarillo punteado: lo del techo. La flecha marca el frente de la pieza.', font=_fuente(15, False), fill=(70, 78, 84), anchor='lm')
    columna = [x0, x0 + (ANCHO_DE_LA_LEYENDA - 60) // 2 + 14]
    y = 150
    col = 0
    por_grupo = {}
    for pieza in datos['piezas']:
        por_grupo.setdefault(pieza['grupo'], []).append(pieza)
    for grupo in datos['grupos']:
        piezas = por_grupo.get(grupo['id'], [])
        if not piezas:
            continue
        alto_del_bloque = 38 + 44 * len(piezas)
        if y + alto_del_bloque > lado - 20 and col == 0:
            col, y = 1, 150
        xc = columna[col]
        ld.rectangle((xc, y, xc + 6, y + 28), fill=_hex(grupo['color']))
        ld.text((xc + 16, y + 14), grupo['titulo'].upper(), font=_fuente(19, True), fill=_hex(grupo['color']), anchor='lm')
        y += 38
        for pieza in piezas:
            _insignia(ld, (xc + 20, y + 18), pieza['numero'], pieza['color'], 15)
            ld.text((xc + 48, y + 9), pieza['texto'], font=_fuente(19, True), fill=(26, 32, 36), anchor='lm')
            ld.text((xc + 48, y + 30), pieza['dato'], font=_fuente(15, False), fill=(88, 96, 102), anchor='lm')
            y += 44
        y += 8
    Path(ruta_destino).parent.mkdir(parents=True, exist_ok=True)
    lienzo.save(ruta_destino)
    print(f'ESCRITA {Path(ruta_destino).name} ({lienzo.size[0]}x{lienzo.size[1]}, {len(datos["piezas"])} piezas)')


def principal():
    p = argparse.ArgumentParser(prog='texturas_sala.py')
    p.add_argument('--solo', choices=('atlas', 'pantallas', 'mosaicos'), default=None)
    p.add_argument('--planta', nargs=3, metavar=('DATOS', 'BASE', 'DESTINO'), help='anota la foto de planta (la llama sala.py)')
    args = p.parse_args()
    if args.planta:
        anotar_la_planta(*args.planta)
        return
    if args.solo in (None, 'mosaicos'):
        hacer_los_mosaicos()
    if args.solo in (None, 'atlas'):
        hacer_el_atlas()
    if args.solo in (None, 'pantallas'):
        hacer_las_pantallas()


if __name__ == '__main__':
    principal()

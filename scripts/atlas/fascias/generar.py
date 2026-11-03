"""
Genera las fascias del atlas (P-006).

    python scripts/atlas/fascias/generar.py                      # todos los grupos
    python scripts/atlas/fascias/generar.py miembro-inferior-derecho
    python scripts/atlas/fascias/generar.py --sin-blender        # sin decimar (más lento y pesado)

Escribe, en `scripts/atlas/fascias/salida/` (ignorada por git):

    <grupo>_fina.npz        la superficie continua del grupo, a la resolución de la rejilla
    <grupo>_gruesa.npz      la misma, decimada a la resolución del atlas
    piezas/<id>.bin         cada pieza lista para empaquetar: posiciones, normales e índices
    manifiesto.json         qué hay en piezas/, con todo lo que el catálogo necesita saber de cada una

El catálogo y el paquete de geometría del atlas los escribe `agregar-fascias.mjs`, que solo lee
`manifiesto.json` y `piezas/`: este guion no toca `public/atlas/`.

## El orden, y por qué

  1. Las piezas del atlas que el grupo envuelve, unidas en una malla.
  2. Se muestrean sus superficies, se marcan los voxeles que tocan, se rellena por inundación y
     se cierra el volumen con cada radio de la receta (`campo.py`).
  3. Se mezclan los campos de los radios según la altura, se saca la isosuperficie a `separacion`
     por encima de lo envuelto y se suaviza (`malla.py`).
  4. Se **decima la superficie entera** y solo después se **parte en piezas por planos**. Al revés,
     cada pieza se decimaría por su cuenta y los bordes de dos piezas vecinas dejarían de
     coincidir. Las normales se calculan también sobre la superficie entera y se interpolan en el
     corte, para que el sombreado no tenga costura.
  5. El lado izquierdo es el espejo del derecho.
  6. Se comprueba cada pieza (`comprobar_pieza`) y se escribe.

Todo es determinista: la semilla está fija y no hay nada que dependa del orden de los hilos.
"""

import json
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import campo as C  # noqa: E402
import capas as K  # noqa: E402
import malla as M  # noqa: E402
import recetas as R  # noqa: E402
from atlas import Atlas  # noqa: E402

SALIDA = AQUI / 'salida'
SEMILLA = 20261024
BLENDER = Path(
    __import__('os').environ.get('BLENDER', r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def dicho(texto):
    print(texto, flush=True)


# ------------------------------------------------------------------- grupo


def decimar(verts, caras, objetivo, trabajo, usar_blender=True):
    """La misma superficie con `objetivo` triángulos, hecha con Blender (`refinar_en_blender.py`)."""
    if not usar_blender or objetivo >= len(caras):
        return verts, caras
    entrada, salida = trabajo / 'a_decimar.npz', trabajo / 'decimada.npz'
    np.savez(entrada, v=verts, f=caras)
    if not BLENDER.exists():
        raise SystemExit(f'No encuentro Blender en {BLENDER}. Indique la ruta con la variable BLENDER.')
    proceso = subprocess.run(
        [str(BLENDER), '--background', '--factory-startup', '--python', str(AQUI / 'refinar_en_blender.py'),
         '--', str(entrada), str(salida), '--triangulos', str(int(objetivo))],
        capture_output=True, text=True, timeout=1200,
    )
    if 'DECIMADO' not in proceso.stdout:
        raise SystemExit('Blender no decimó la malla:\n' + proceso.stdout[-1500:] + proceso.stderr[-1500:])
    r = np.load(salida)
    return r['v'], r['f'].astype(np.int64)


def error_de_la_reduccion(fina, gruesa, semilla=SEMILLA):
    """Distancia de los vértices de la malla decimada a la superficie fina: máxima y percentil 99, en metros."""
    from scipy.spatial import cKDTree

    # Con más de medio metro cuadrado (el cuerpo entero) se muestrea más ralo: el error que se busca es de
    # décimas de milímetro y cinco millones de puntos no lo mejoran.
    paso = 0.0006 if M.area_total(*fina) < 0.5 else 0.0015
    arbol = cKDTree(C.muestrear_superficie(fina[0], fina[1], paso, semilla))
    d, _ = arbol.query(gruesa[0])
    return float(d.max()), float(np.percentile(d, 99))


# ------------------------------------------------------------------- piezas


def a_registro(pieza, lado, v, f, n, medidas, avisos):
    """Lo que el empaquetador necesita de una pieza: su catálogo y sus tres arrays ya en el formato del paquete."""
    nombre = pieza.nombre if lado == 'derecho' else R.nombre_del_otro_lado(pieza.nombre)
    identificador = pieza.id if lado == 'derecho' else pieza.id + 'M'
    codigo = pieza.fma if lado == 'derecho' else pieza.fma_izquierdo
    region = pieza.region if lado == 'derecho' else pieza.region_izquierda
    pos = np.asarray(v, '<f4')
    nor = M.normales_a_enteros(n)
    idx = np.asarray(f, '<u4')
    minimo, maximo = M.caja_de(pos.astype(np.float64))
    return {
        'id': identificador,
        'nombre': nombre,
        'fma': codigo,
        'sistema': pieza.sistema,
        'region': region,
        'nota': pieza.nota,
        'vertices': int(len(pos)),
        'indices': int(idx.size),
        'caja': [[float(x) for x in minimo], [float(x) for x in maximo]],
        'medidas': medidas,
        'avisos': avisos,
    }, pos, nor, idx


def escribir_pieza(carpeta, registro, pos, nor, idx):
    """El `.bin` de una pieza: posiciones, normales (alineadas a 4 bytes) e índices, como en un paquete del atlas."""
    cuerpo = bytearray()
    cuerpo += pos.tobytes()
    cuerpo += nor.tobytes()
    cuerpo += bytes((-len(cuerpo)) % 4)
    cuerpo += idx.tobytes()
    (carpeta / f"{registro['id']}.bin").write_bytes(bytes(cuerpo))


# --------------------------------------------------------------------- main


def regiones_de_la_pieza(pieza, atlas):
    """Las regiones convexas que forman la pieza: la principal y las que se le suman, cada una una lista de planos."""
    planos = pieza.planos(atlas) if callable(pieza.planos) else pieza.planos
    regiones = [list(planos)]
    for otra in pieza.otras:
        regiones.append(list(otra(atlas) if callable(otra) else otra))
    return regiones


def recortar_pieza(pieza, atlas, verts, caras, normales):
    """Lo que de la superficie del grupo cae en la pieza: la unión de sus regiones, cada una recortada sin tapar."""
    partes = []
    for planos in regiones_de_la_pieza(pieza, atlas):
        v, f, n = M.recortar_por_planos(verts, caras, planos, atributos=normales)
        if len(f):
            partes.append((np.asarray(v), np.asarray(f), np.asarray(n)))
    if not partes:
        raise SystemExit(f'La pieza {pieza.id} «{pieza.nombre}» quedó vacía: revise sus planos.')
    if len(partes) == 1:
        v, f, n = partes[0]
    else:
        base = np.cumsum([0] + [len(p[0]) for p in partes[:-1]])
        v = np.vstack([p[0] for p in partes])
        n = np.vstack([p[2] for p in partes])
        f = np.vstack([p[1] + b for p, b in zip(partes, base)])
    # Lo que el recorte deja suelto —la punta de un hombro, una esquina del plano— no es de esta pieza.
    v, f, n = M.quitar_componentes_pequenas(v, f, 0.05, atributos=n)
    n = n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    return v, f, n


def cobertura(grupo, atlas, gv, gf):
    """
    Qué parte del área de la superficie del grupo cae en alguna pieza, y qué parte en más de una (solapes).

    Solo se mide el lado derecho (x ≤ 0): el izquierdo sale por espejo de las piezas pares y las del centro
    cubren los dos lados a la vez, así que medir la superficie entera daba un «67 %» que no decía si faltaba
    algo o si era solo la mitad espejada. Lo que queda sin cubrir se devuelve como cajas, de mayor a menor, para
    ver **dónde** está el hueco.
    """
    centros = gv[gf].mean(axis=1)
    area = M.area_de_caras(gv, gf)
    derecha = centros[:, 0] <= 0.0
    veces = np.zeros(len(gf), int)
    for pieza in grupo.piezas:
        dentro = np.zeros(len(gf), bool)
        for planos in regiones_de_la_pieza(pieza, atlas):
            ok = np.ones(len(gf), bool)
            for punto, normal in planos:
                n = np.asarray(normal, float)
                ok &= (centros - np.asarray(punto, float)) @ (n / np.linalg.norm(n)) >= 0
            dentro |= ok
        veces += dentro
    total = area[derecha].sum()
    sin_cubrir = derecha & (veces == 0)
    huecos = []
    if sin_cubrir.any():
        from scipy.sparse import coo_matrix
        from scipy.sparse.csgraph import connected_components

        caras = gf[sin_cubrir]
        pares = np.concatenate([caras[:, [0, 1]], caras[:, [1, 2]]])
        n = int(gv.shape[0])
        grafo = coo_matrix((np.ones(len(pares)), (pares[:, 0], pares[:, 1])), shape=(n, n))
        _, etiqueta = connected_components(grafo, directed=False)
        de_cara = etiqueta[caras[:, 0]]
        for e in np.unique(de_cara):
            mias = caras[de_cara == e]
            a = float(M.area_de_caras(gv, mias).sum())
            if a / total < 0.002:
                continue
            c = gv[np.unique(mias)]
            huecos.append((a / total, c.min(axis=0), c.max(axis=0)))
        huecos.sort(key=lambda h: -h[0])
    return (float(area[derecha & (veces >= 1)].sum() / total), float(area[derecha & (veces >= 2)].sum() / total),
            huecos[:6])


def generar_por_pieza(grupo, resultado, usar_blender, t0):
    """
    Un grupo cuyas piezas no salen de cortar una superficie continua (las meninges): cada una trae la suya.

    Se decima cada una por su cuenta (no hay vecinas con las que compartir borde, salvo la dura craneal y la
    espinal, que se encuentran en el agujero magno y se alinean por construcción, no por la malla), se mide
    con la comprobación del constructor y se escribe igual que las demás.
    """
    registros = []
    for pieza in grupo.piezas:
        v, f = resultado.por_pieza[pieza.id]
        if len(f) == 0:
            raise SystemExit(f'La pieza {pieza.id} «{pieza.nombre}» salió vacía.')
        # Un mínimo de 600 triángulos: la hoz del cerebelo mide ocho centímetros cuadrados y a la densidad del
        # grupo saldrían treinta, que no dibujan su borde.
        objetivo = max(int(M.area_total(v, f) * grupo.densidad), 600)
        gv, gf = decimar(v, f, objetivo, SALIDA, usar_blender)
        max_err, p99 = error_de_la_reduccion((v, f), (gv, gf))
        n = M.normales_de_vertices(gv, gf)
        avisos, medidas = resultado.comprobar(pieza, gv, gf)
        medidas['desvio_de_la_reduccion_p99_mm'] = round(p99 * 1000, 2)
        dicho(f"  {pieza.id} {pieza.nombre:32s} {medidas['triangulos']:6,} tri · {medidas['area_m2']:.4f} m² · reducción p99 {p99 * 1000:.2f} mm"
              + ''.join(f' · {k} {v_}' for k, v_ in medidas.items()
                        if k not in ('triangulos', 'vertices', 'area_m2', 'desvio_de_la_reduccion_p99_mm'))
              + (f'  AVISOS: {avisos}' if avisos else ''))
        registro, pos, nor, idx = a_registro(pieza, 'derecho', gv, gf, n, medidas, avisos)
        escribir_pieza(SALIDA / 'piezas', registro, pos, nor, idx)
        registros.append(registro)
        if pieza.par:
            ev, ef = M.espejar(gv, gf)
            en = n.copy()
            en[:, 0] = -en[:, 0]
            registro, pos, nor, idx = a_registro(pieza, 'izquierdo', ev, ef, en, medidas, avisos)
            escribir_pieza(SALIDA / 'piezas', registro, pos, nor, idx)
            registros.append(registro)
    dicho(f'  grupo hecho en {time.time() - t0:.0f} s')
    return registros


def generar_grupo(atlas, grupo, ctx, usar_blender=True):
    dicho(f'\n== {grupo.id} · {grupo.descripcion}')
    t0 = time.time()
    SALIDA.mkdir(exist_ok=True)
    (SALIDA / 'piezas').mkdir(exist_ok=True)

    resultado = K.CONSTRUCTORES[grupo.tipo](atlas, grupo, ctx)
    if resultado.por_pieza is not None:
        return generar_por_pieza(grupo, resultado, usar_blender, t0)
    verts, caras = resultado.verts, resultado.caras
    np.savez(SALIDA / f'{grupo.id}_fina.npz', v=verts, f=caras)

    area = M.area_total(verts, caras)
    objetivo = int(area * grupo.densidad)
    gv, gf = decimar(verts, caras, objetivo, SALIDA, usar_blender)
    max_err, p99 = error_de_la_reduccion((verts, caras), (gv, gf))
    dicho(f'  decimada a {len(gf):,} triángulos (objetivo {objetivo:,}); error máximo {max_err * 1000:.2f} mm, p99 {p99 * 1000:.2f} mm')
    # El umbral escala con el voxel: con 3 mm de rejilla, un milímetro de desvío en el p99 es ruido de la propia
    # superficie fina y no una pérdida de forma; con 2 mm sigue siendo 0,8 mm, como cuando se fijó.
    if p99 > 0.4 * grupo.h:
        dicho(f'  AVISO: la reducción se aparta más de {0.4 * grupo.h * 1000:.1f} mm de la fina; suba la densidad de la receta.')
    gn = M.normales_de_vertices(gv, gf)
    np.savez(SALIDA / f'{grupo.id}_gruesa.npz', v=gv, f=gf)
    cubierta, solapada, huecos = cobertura(grupo, atlas, gv, gf)
    dicho(f'  las piezas cubren el {cubierta * 100:.1f} % de la mitad derecha del grupo y se solapan en el {solapada * 100:.2f} %')
    for parte, minimo, maximo in huecos:
        dicho(f'    sin cubrir: {parte * 100:.1f} % · x {minimo[0]:.3f}…{maximo[0]:.3f} · y {minimo[1]:.3f}…{maximo[1]:.3f}'
              f' · z {minimo[2]:.3f}…{maximo[2]:.3f}')

    registros = []
    for pieza in grupo.piezas:
        v, f, n = recortar_pieza(pieza, atlas, gv, gf, gn)
        avisos, medidas = resultado.comprobar(pieza, v, f)
        dicho(f"  {pieza.id} {pieza.nombre:40s} {medidas['triangulos']:6,} tri · {medidas['area_m2']:.3f} m²"
              + ''.join(f' · {k} {v_}' for k, v_ in medidas.items() if k not in ('triangulos', 'vertices', 'area_m2', 'aristas_de_borde'))
              + (f'  AVISOS: {avisos}' if avisos else ''))
        registro, pos, nor, idx = a_registro(pieza, 'derecho', v, f, n, medidas, avisos)
        escribir_pieza(SALIDA / 'piezas', registro, pos, nor, idx)
        registros.append(registro)
        if pieza.par:
            ev, ef = M.espejar(v, f)
            en = n.copy()
            en[:, 0] = -en[:, 0]
            registro, pos, nor, idx = a_registro(pieza, 'izquierdo', ev, ef, en, medidas, avisos)
            escribir_pieza(SALIDA / 'piezas', registro, pos, nor, idx)
            registros.append(registro)
    dicho(f'  grupo hecho en {time.time() - t0:.0f} s')
    return registros


def main():
    argumentos = [a for a in sys.argv[1:] if not a.startswith('--')]
    usar_blender = '--sin-blender' not in sys.argv
    atlas = Atlas()
    grupos = [g for g in R.GRUPOS if not argumentos or g.id in argumentos]
    if not grupos:
        raise SystemExit(f'Ningún grupo se llama {argumentos}. Los hay: {[g.id for g in R.GRUPOS]}')

    SALIDA.mkdir(exist_ok=True)
    ctx = K.Contexto(atlas, SALIDA)
    # El manifiesto lleva TODOS los grupos, también los que no se regeneran ahora: se lee el que hay y se
    # sustituye lo regenerado. Sin esto, generar un grupo borraría de `agregar-fascias.mjs` a los demás.
    ruta = SALIDA / 'manifiesto.json'
    previo = json.loads(ruta.read_text(encoding='utf8')) if ruta.exists() else {'piezas': []}
    hechos = {g.id for g in grupos}
    conservados = [p for p in previo['piezas'] if p.get('grupo') not in hechos]
    nuevos = []
    for grupo in grupos:
        for registro in generar_grupo(atlas, grupo, ctx, usar_blender):
            registro['grupo'] = grupo.id
            nuevos.append(registro)
    todos = sorted(conservados + nuevos, key=lambda p: (p['id'].rstrip('M'), p['id'].endswith('M')))
    ruta.write_text(json.dumps({'version': 1, 'piezas': todos}, ensure_ascii=False, indent=1), encoding='utf8')
    dicho(f'\nManifiesto: {len(todos)} piezas en {ruta}')
    # La rejilla de 3 mm deja asomar la fascia superficial en los pliegues de la piel (D-224): sin este paso, la prueba
    # de la piel falla después de agregarla.
    if 'fascia-superficial' in hechos:
        dicho('Antes de agregarla: node scripts/atlas/fascias/bajo-la-piel.mjs --aplicar')


if __name__ == '__main__':
    main()

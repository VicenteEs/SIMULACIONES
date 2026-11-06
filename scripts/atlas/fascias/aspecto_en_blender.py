"""
El aspecto de cada tejido en Blender (P-006, E4): color, textura y luz con nodos de material.

Se importa desde `vista_en_blender.py`. No define de cero los valores del `.glb` —rugosidad, opacidad,
brillo sedoso, barniz—: esos los escribe `src/lib/exportarAtlas.ts` desde `src/atlas/aspectoDelSistema.ts`, y
el importador de glTF de Blender los convierte en un material físico. Lo que aquí se hace es **añadirle lo
que glTF no puede llevar sin coordenadas de textura**: el rayado de fibras, la variación de color de un
tejido vivo, el relieve fino del hueso. Es la misma decisión que F-12 de la bitácora: la textura fina se
calcula en el material, según la posición, y no se guarda.

Todo se calcula en **coordenadas del objeto, en metros** (`Texture Coordinate → Object`), que en un `.glb`
importado son las del cuerpo: una escala de 2.500 son bandas de unos 2,5 mm, que es lo que miden los haces
de colágeno de una fascia, y la misma textura sirve para cualquier pieza sin desplegarla.

Qué se hace con cada tejido, y por qué:

  - **Fascia profunda**: nacarada, rosada, con hilos largos a lo largo del eje del miembro (Z en Blender),
    ondulados; brillo sedoso en el borde, un resplandor subsuperficial rosado y translucidez que varía un
    poco de un punto a otro (la fascia no es un plástico de espesor uniforme).
  - **Fascia superficial**: amarillenta, esponjosa, sin hilos, con manchas de grasa.
  - **Meníngea**: blanquecina azulada, tensa, lisa.
  - **Visceral**: rosa grisácea, brillante y húmeda (el barniz ya viene del archivo).
  - **Músculo**: rojo con vetas finas a lo largo, subsuperficie y mate-brillante.
  - **Hueso**: crema con grano fino y variación suave.
  - **Piel**: tono de piel, subsuperficie, translúcida si el archivo la trae así. Con el color por vértice que
    escribe la exportación (D-227) —codos, labios, pezones, párpados— se multiplica el tono de la piel por él, y
    donde el vértice es rojo y húmedo (los labios) la rugosidad baja.
  - **Grasa de la piel** (D-331, D-334): la cara de dentro de la piel, que es donde termina la grasa. Amarilla, en
    lóbulos de un par de milímetros separados por tabiques blanquecinos, brillante porque está mojada y es
    aceitosa. Va en su propia ranura (`separar_la_grasa`).
  - **Pared de la piel** (D-334): el anillo que deja el corte de la vista entre la cara de fuera y la de dentro.
    Dermis blanca rosada con el punteado de los capilares hasta 2 mm, y la grasa debajo, por el atributo
    `hondura` que pone el corte. Es lo mismo que pinta el simulador en la pared de una herida (D-333).
  - **Ojos y córnea** (D-227): el color sale entero del vértice —blanco marfil, iris con su anillo, pupila— y se
    le pone brillo de superficie mojada; la córnea es un casquete casi transparente que da el reflejo.
  - **Tendones y ligamentos** (tejido conectivo): blanco amarillento con fibras.
"""

import bpy


def _entrada(nodo, *nombres):
    """La primera entrada que exista con alguno de esos nombres: Blender los ha ido renombrando entre versiones."""
    for n in nombres:
        if n in nodo.inputs:
            return nodo.inputs[n]
    return None


def _poner(nodo, nombres, valor):
    e = _entrada(nodo, *([nombres] if isinstance(nombres, str) else nombres))
    if e is not None:
        e.default_value = valor
    return e


def _principal(material):
    """El Principled BSDF del material que dejó el importador, o uno nuevo conectado a la salida."""
    try:
        material.use_nodes = True
    except Exception:
        pass
    arbol = material.node_tree
    for nodo in arbol.nodes:
        if nodo.type == 'BSDF_PRINCIPLED':
            return nodo
    salida = next((n for n in arbol.nodes if n.type == 'OUTPUT_MATERIAL'), None) or arbol.nodes.new('ShaderNodeOutputMaterial')
    nuevo = arbol.nodes.new('ShaderNodeBsdfPrincipled')
    arbol.links.new(nuevo.outputs['BSDF'], salida.inputs['Surface'])
    return nuevo


def _nodo(arbol, tipo, x, y, **propiedades):
    n = arbol.nodes.new(tipo)
    n.location = (x, y)
    for k, v in propiedades.items():
        setattr(n, k, v)
    return n


def _desconectar(arbol, entrada):
    for enlace in list(entrada.links):
        arbol.links.remove(enlace)


def _mezcla(arbol, x, y, a, b, factor, tipo='RGBA'):
    """Un nodo de mezcla entre `a` y `b` (valores o salidas) con `factor`."""
    m = arbol.nodes.new('ShaderNodeMix')
    m.data_type = tipo
    m.location = (x, y)
    m.blend_type = 'MIX'
    m.inputs['Factor'].default_value = factor if not hasattr(factor, 'node') else 0.0
    if hasattr(factor, 'node'):
        arbol.links.new(factor, m.inputs['Factor'])
    ia, ib = (m.inputs[6], m.inputs[7]) if tipo == 'RGBA' else (m.inputs[2], m.inputs[3])
    for entrada, v in ((ia, a), (ib, b)):
        if hasattr(v, 'node'):
            arbol.links.new(v, entrada)
        else:
            entrada.default_value = v
    return m, (m.outputs[2] if tipo == 'RGBA' else m.outputs[0])


def _rampa(arbol, x, y, entrada, paradas):
    r = arbol.nodes.new('ShaderNodeValToRGB')
    r.location = (x, y)
    r.color_ramp.elements[0].position = paradas[0][0]
    r.color_ramp.elements[0].color = paradas[0][1]
    r.color_ramp.elements[1].position = paradas[-1][0]
    r.color_ramp.elements[1].color = paradas[-1][1]
    for pos, color in paradas[1:-1]:
        e = r.color_ramp.elements.new(pos)
        e.color = color
    arbol.links.new(entrada, r.inputs['Fac'])
    return r.outputs['Color']


def _fibras_alrededor(arbol, coordenadas, eje, periodo_m, ondulacion_m=0.0035):
    """
    Hilos largos que corren **a lo largo** del eje del miembro (Z en Blender), ondulados y distribuidos alrededor.

    Una textura de bandas de Blender varía en una dirección fija y dibuja franjas rectas: con `bands_direction`
    en Z saldrían aros horizontales, no hilos. Lo que hace falta es una función del **ángulo** alrededor del
    eje: `sin(2π · arco / periodo)`, con el arco medido sobre el radio medio del miembro, de modo que el
    hilo mide `periodo_m` metros de ancho a cualquier altura. Una ondulación lenta (ruido que cambia con la
    altura y el ángulo) los hace dejar de ser rectos, como los haces de colágeno de una fascia de verdad.

    `eje` es `(x, y, radio)` en coordenadas del objeto: dónde pasa el eje del miembro y cuánto mide en
    promedio hasta la superficie.
    """
    cx, cy, radio = eje
    mapa = _nodo(arbol, 'ShaderNodeMapping', -1050, 0, vector_type='POINT')
    mapa.inputs['Location'].default_value = (-cx, -cy, 0.0)
    arbol.links.new(coordenadas, mapa.inputs['Vector'])
    separar = _nodo(arbol, 'ShaderNodeSeparateXYZ', -900, 0)
    arbol.links.new(mapa.outputs['Vector'], separar.inputs['Vector'])
    angulo = _matematica(arbol, 'ARCTAN2', separar.outputs['Y'], separar.outputs['X'], -750, 0)
    arco = _matematica(arbol, 'MULTIPLY', angulo, radio, -600, 0)
    # La ondulación: un ruido que varía despacio con la altura (los hilos se tuercen un poco de un sitio a otro).
    estirada = _nodo(arbol, 'ShaderNodeMapping', -1050, -250, vector_type='POINT')
    estirada.inputs['Scale'].default_value = (60.0, 60.0, 14.0)
    arbol.links.new(coordenadas, estirada.inputs['Vector'])
    torcer = _ruido(arbol, estirada.outputs['Vector'], 1.0, 3.0, 0.55, 0.0, x=-900, y=-250)
    desvio = _matematica(arbol, 'MULTIPLY', _matematica(arbol, 'SUBTRACT', torcer, 0.5, -700, -250), ondulacion_m * 2.0, -600, -250)
    fase = _matematica(arbol, 'MULTIPLY', _matematica(arbol, 'ADD', arco, desvio, -450, -100), 6.283185 / periodo_m, -300, -100)
    onda = _matematica(arbol, 'SINE', fase, 0.0, -150, -100)
    # Dos hilos finos dentro de cada haz: un segundo armónico.
    fino = _matematica(arbol, 'SINE', _matematica(arbol, 'MULTIPLY', fase, 2.7, -300, -200), 0.0, -150, -200)
    mezcla = _matematica(arbol, 'ADD', _matematica(arbol, 'MULTIPLY', onda, 0.7, -50, -100), _matematica(arbol, 'MULTIPLY', fino, 0.3, -50, -200), 50, -150)
    return _matematica(arbol, 'ADD', _matematica(arbol, 'MULTIPLY', mezcla, 0.5, 100, -150), 0.5, 200, -150)


def _fibras(arbol, coordenadas, escala, distorsion, detalle=3.0):
    """Hilos largos a lo largo de Z, ondulados: la textura de un haz de colágeno. Devuelve su valor 0…1."""
    onda = _nodo(arbol, 'ShaderNodeTexWave', -900, 0, wave_type='BANDS', bands_direction='Z', wave_profile='SIN')
    onda.inputs['Scale'].default_value = escala
    onda.inputs['Distortion'].default_value = distorsion
    onda.inputs['Detail'].default_value = detalle
    onda.inputs['Detail Scale'].default_value = 1.8
    onda.inputs['Detail Roughness'].default_value = 0.65
    arbol.links.new(coordenadas, onda.inputs['Vector'])
    return onda.outputs['Fac']


def _ruido(arbol, coordenadas, escala, detalle=6.0, rugosidad=0.55, distorsion=0.0, x=-900, y=-300):
    r = _nodo(arbol, 'ShaderNodeTexNoise', x, y)
    r.inputs['Scale'].default_value = escala
    r.inputs['Detail'].default_value = detalle
    r.inputs['Roughness'].default_value = rugosidad
    if 'Distortion' in r.inputs:
        r.inputs['Distortion'].default_value = distorsion
    arbol.links.new(coordenadas, r.inputs['Vector'])
    return r.outputs['Fac']


def _color_por_vertice(objeto, arbol, x=-900, y=500):
    """
    La salida de color del atributo de color del objeto (el `COLOR_0` del archivo), o `None` si no trae.

    El importador de glTF crea su propio nodo para él y lo multiplica con el color del material, pero cada aspecto de
    aquí rehace el color de base y se lo lleva por delante: hay que volver a ponerlo. Se lee el atributo por su
    nombre porque no se sabe cómo lo llame cada versión de Blender (`Color`, `Col`, `COLOR_0`).
    """
    atributos = getattr(objeto.data, 'color_attributes', None)
    if not atributos or len(atributos) == 0:
        return None
    activo = getattr(atributos, 'active_color', None) or atributos[0]
    nodo = _nodo(arbol, 'ShaderNodeVertexColor', x, y)
    nodo.layer_name = activo.name
    return nodo.outputs['Color']


def _multiplicar(arbol, a, b, x=-350, y=200):
    """El producto de dos colores (cada uno, un valor o una salida)."""
    m = arbol.nodes.new('ShaderNodeMix')
    m.data_type = 'RGBA'
    m.location = (x, y)
    m.blend_type = 'MULTIPLY'
    m.inputs['Factor'].default_value = 1.0
    for entrada, v in ((m.inputs[6], a), (m.inputs[7], b)):
        if hasattr(v, 'node'):
            arbol.links.new(v, entrada)
        else:
            entrada.default_value = v
    return m.outputs[2]


def _bump(arbol, altura, fuerza, distancia, principal):
    b = _nodo(arbol, 'ShaderNodeBump', -250, -380)
    b.inputs['Strength'].default_value = fuerza
    b.inputs['Distance'].default_value = distancia
    arbol.links.new(altura, b.inputs['Height'])
    _desconectar(arbol, principal.inputs['Normal'])
    arbol.links.new(b.outputs['Normal'], principal.inputs['Normal'])


def _matematica(arbol, operacion, a, b, x=-600, y=0):
    m = _nodo(arbol, 'ShaderNodeMath', x, y, operation=operacion)
    for i, v in enumerate((a, b)):
        if hasattr(v, 'node'):
            arbol.links.new(v, m.inputs[i])
        else:
            m.inputs[i].default_value = v
    return m.outputs[0]


# ----------------------------------------------------------------- cada tejido


def _fascia_profunda(material, principal, eje, objeto=None):
    arbol = material.node_tree
    coord = _nodo(arbol, 'ShaderNodeTexCoord', -1300, 0).outputs['Object']
    hilos = _fibras_alrededor(arbol, coord, eje, 0.0026)
    manchas = _ruido(arbol, coord, 38.0, 5.0, 0.6, y=-700)
    finas = _ruido(arbol, coord, 700.0, 3.0, 0.5, x=-900, y=-900)

    # Color: del rosa de la fascia al rosa nacarado, según las manchas; un poco más oscuro y saturado entre
    # hilo e hilo, que es lo que hace que el rayado se lea de lejos y no solo de cerca.
    base = _rampa(arbol, -600, 200, manchas, [(0.25, (0.86, 0.50, 0.51, 1)), (0.75, (0.97, 0.76, 0.74, 1))])
    entre_hilos = _matematica(arbol, 'MULTIPLY', _matematica(arbol, 'SUBTRACT', 1.0, hilos, -700, 100), 0.55, -600, 100)
    _, color = _mezcla(arbol, -350, 200, base, (0.66, 0.34, 0.37, 1), entre_hilos)
    _desconectar(arbol, principal.inputs['Base Color'])
    arbol.links.new(color, principal.inputs['Base Color'])

    # Relieve: los hilos y, mucho más suave, el grano.
    altura = _matematica(arbol, 'ADD', _matematica(arbol, 'MULTIPLY', hilos, 0.8, -600, -150), _matematica(arbol, 'MULTIPLY', finas, 0.2, -600, -250), -450, -200)
    _bump(arbol, altura, 0.6, 0.0008, principal)

    # Rugosidad: más lisa sobre el hilo, que es donde se pule el colágeno, y húmeda en general.
    rugosa = _matematica(arbol, 'ADD', 0.22, _matematica(arbol, 'MULTIPLY', _matematica(arbol, 'SUBTRACT', 1.0, hilos, -700, -450), 0.16, -600, -450), -450, -450)
    _desconectar(arbol, principal.inputs['Roughness'])
    arbol.links.new(rugosa, principal.inputs['Roughness'])

    _poner(principal, ('Subsurface Weight', 'Subsurface'), 0.22)
    _poner(principal, 'Subsurface Radius', (0.95, 0.3, 0.25))
    _poner(principal, 'Subsurface Scale', 0.003)
    _poner(principal, 'Sheen Weight', 0.6)
    _poner(principal, 'Sheen Roughness', 0.3)
    _poner(principal, 'Sheen Tint', (1.0, 0.78, 0.78, 1))
    _poner(principal, ('Coat Weight', 'Clearcoat'), 0.3)
    _poner(principal, ('Coat Roughness', 'Clearcoat Roughness'), 0.12)
    _poner(principal, ('Specular IOR Level', 'Specular'), 0.6)

    # Translucidez que varía: un 12 % arriba o abajo de la que trae el archivo.
    alfa = principal.inputs['Alpha'].default_value
    variada = _matematica(arbol, 'ADD', alfa * 0.88, _matematica(arbol, 'MULTIPLY', manchas, alfa * 0.24, -600, -600), -450, -600)
    _desconectar(arbol, principal.inputs['Alpha'])
    arbol.links.new(variada, principal.inputs['Alpha'])


def _fascia_superficial(material, principal, eje, objeto=None):
    arbol = material.node_tree
    coord = _nodo(arbol, 'ShaderNodeTexCoord', -1200, 0).outputs['Object']
    grasa = _ruido(arbol, coord, 80.0, 6.0, 0.62, 0.4)
    lobulos = _ruido(arbol, coord, 220.0, 4.0, 0.5, 1.0, y=-500)
    color = _rampa(arbol, -600, 200, grasa, [(0.3, (0.95, 0.80, 0.42, 1)), (0.7, (0.99, 0.91, 0.62, 1))])
    _desconectar(arbol, principal.inputs['Base Color'])
    arbol.links.new(color, principal.inputs['Base Color'])
    _bump(arbol, lobulos, 0.5, 0.0008, principal)
    _poner(principal, ('Subsurface Weight', 'Subsurface'), 0.35)
    _poner(principal, 'Subsurface Radius', (1.0, 0.6, 0.25))
    _poner(principal, 'Subsurface Scale', 0.006)


def _fascia_meningea(material, principal, eje, objeto=None):
    arbol = material.node_tree
    coord = _nodo(arbol, 'ShaderNodeTexCoord', -1200, 0).outputs['Object']
    ruido = _ruido(arbol, coord, 70.0, 4.0, 0.5)
    color = _rampa(arbol, -600, 200, ruido, [(0.3, (0.78, 0.82, 0.90, 1)), (0.7, (0.90, 0.92, 0.96, 1))])
    _desconectar(arbol, principal.inputs['Base Color'])
    arbol.links.new(color, principal.inputs['Base Color'])
    _poner(principal, ('Subsurface Weight', 'Subsurface'), 0.08)


def _fascia_visceral(material, principal, eje, objeto=None):
    arbol = material.node_tree
    coord = _nodo(arbol, 'ShaderNodeTexCoord', -1200, 0).outputs['Object']
    ruido = _ruido(arbol, coord, 40.0, 4.0, 0.5)
    color = _rampa(arbol, -600, 200, ruido, [(0.3, (0.86, 0.66, 0.72, 1)), (0.7, (0.95, 0.80, 0.84, 1))])
    _desconectar(arbol, principal.inputs['Base Color'])
    arbol.links.new(color, principal.inputs['Base Color'])
    _poner(principal, ('Subsurface Weight', 'Subsurface'), 0.12)
    _poner(principal, ('Coat Weight', 'Clearcoat'), 0.8)
    _poner(principal, ('Coat Roughness', 'Clearcoat Roughness'), 0.06)


def _musculo(material, principal, eje, objeto=None):
    arbol = material.node_tree
    coord = _nodo(arbol, 'ShaderNodeTexCoord', -1200, 0).outputs['Object']
    vetas = _fibras(arbol, coord, 900.0, 3.0, 4.0)
    manchas = _ruido(arbol, coord, 35.0, 4.0, 0.5)
    base = principal.inputs['Base Color'].default_value
    claro = (min(base[0] * 1.18 + 0.02, 1), min(base[1] * 1.3 + 0.03, 1), min(base[2] * 1.3 + 0.03, 1), 1)
    oscuro = (base[0] * 0.78, base[1] * 0.7, base[2] * 0.7, 1)
    tono = _rampa(arbol, -600, 200, manchas, [(0.3, oscuro), (0.7, claro)])
    _, color = _mezcla(arbol, -350, 200, tono, oscuro, _matematica(arbol, 'MULTIPLY', vetas, 0.3, -700, 100))
    _desconectar(arbol, principal.inputs['Base Color'])
    arbol.links.new(color, principal.inputs['Base Color'])
    _bump(arbol, vetas, 0.12, 0.0004, principal)
    _poner(principal, 'Roughness', 0.5)
    _poner(principal, ('Subsurface Weight', 'Subsurface'), 0.12)
    _poner(principal, 'Subsurface Radius', (0.9, 0.2, 0.15))
    _poner(principal, 'Subsurface Scale', 0.004)


def _hueso(material, principal, eje, objeto=None):
    arbol = material.node_tree
    coord = _nodo(arbol, 'ShaderNodeTexCoord', -1200, 0).outputs['Object']
    grano = _ruido(arbol, coord, 400.0, 8.0, 0.6)
    manchas = _ruido(arbol, coord, 25.0, 4.0, 0.5, y=-500)
    color = _rampa(arbol, -600, 200, manchas, [(0.3, (0.80, 0.74, 0.62, 1)), (0.7, (0.93, 0.89, 0.80, 1))])
    _desconectar(arbol, principal.inputs['Base Color'])
    arbol.links.new(color, principal.inputs['Base Color'])
    _bump(arbol, grano, 0.18, 0.0004, principal)
    _poner(principal, 'Roughness', 0.62)


def _piel(material, principal, eje, objeto=None):
    arbol = material.node_tree
    coord = _nodo(arbol, 'ShaderNodeTexCoord', -1200, 0).outputs['Object']
    poros = _ruido(arbol, coord, 1200.0, 3.0, 0.5)
    manchas = _ruido(arbol, coord, 18.0, 4.0, 0.5, y=-500)
    color = _rampa(arbol, -600, 200, manchas, [(0.3, (0.86, 0.66, 0.55, 1)), (0.7, (0.93, 0.76, 0.66, 1))])
    por_vertice = _color_por_vertice(objeto, arbol) if objeto is not None else None
    if por_vertice is not None:
        color = _multiplicar(arbol, color, por_vertice)
    _desconectar(arbol, principal.inputs['Base Color'])
    arbol.links.new(color, principal.inputs['Base Color'])
    _bump(arbol, poros, 0.1, 0.0003, principal)
    _poner(principal, ('Subsurface Weight', 'Subsurface'), 0.25)
    _poner(principal, 'Subsurface Radius', (1.0, 0.35, 0.2))
    _poner(principal, 'Subsurface Scale', 0.005)
    _poner(principal, 'Roughness', 0.5)
    if por_vertice is not None:
        # Lo rojo y húmedo —los labios, el verde del multiplicador por los suelos— brilla más que la piel seca: la
        # rugosidad baja con el canal verde, que es el que más se apaga en ellos.
        separar = _nodo(arbol, 'ShaderNodeSeparateColor', -650, 550)
        arbol.links.new(por_vertice, separar.inputs['Color'])
        mapa = _nodo(arbol, 'ShaderNodeMapRange', -450, 550)
        mapa.clamp = True
        mapa.inputs['From Min'].default_value = 0.34
        mapa.inputs['From Max'].default_value = 0.62
        mapa.inputs['To Min'].default_value = 0.26
        mapa.inputs['To Max'].default_value = 0.5
        arbol.links.new(separar.outputs['Green'], mapa.inputs['Value'])
        _desconectar(arbol, principal.inputs['Roughness'])
        arbol.links.new(mapa.outputs['Result'], principal.inputs['Roughness'])


#: Lo que mide la dermis con la epidermis, en metros: debajo empieza la grasa (`ESPESOR_DE_LA_DERMIS`, D-331).
DERMIS_M = 0.002


def _lobulos_de_grasa(arbol, coordenadas, x=-1000, y=-200):
    """
    El color y el relieve de la grasa: celdas de Voronoi de unos 2 mm —los lóbulos—, amarillas con su variación, y su
    borde blanquecino, que son los tabiques de colágeno. El relieve hunde los tabiques.
    """
    celdas = _nodo(arbol, 'ShaderNodeTexVoronoi', x, y)
    celdas.feature = 'DISTANCE_TO_EDGE'
    celdas.inputs['Scale'].default_value = 450.0
    arbol.links.new(coordenadas, celdas.inputs['Vector'])
    borde = celdas.outputs['Distance']
    variacion = _ruido(arbol, coordenadas, 300.0, 3.0, 0.5, x=x, y=y - 300)
    amarilla = _rampa(arbol, x + 300, y + 250, variacion, [(0.3, (0.84, 0.62, 0.2, 1)), (0.7, (0.98, 0.85, 0.45, 1))])
    tabique = _rampa(arbol, x + 300, y - 100, borde, [(0.0, (1, 1, 1, 1)), (0.08, (0, 0, 0, 1))])
    _, color = _mezcla(arbol, x + 600, y + 100, amarilla, (0.95, 0.88, 0.76, 1), tabique)
    return color, borde


def _grasa(material, principal, eje, objeto=None):
    arbol = material.node_tree
    coord = _nodo(arbol, 'ShaderNodeTexCoord', -1300, 0).outputs['Object']
    color, relieve = _lobulos_de_grasa(arbol, coord)
    _desconectar(arbol, principal.inputs['Base Color'])
    arbol.links.new(color, principal.inputs['Base Color'])
    _bump(arbol, relieve, 0.4, 0.0006, principal)
    _poner(principal, 'Roughness', 0.3)
    _poner(principal, ('Coat Weight', 'Clearcoat'), 0.4)
    _poner(principal, ('Coat Roughness', 'Clearcoat Roughness'), 0.15)
    _poner(principal, ('Subsurface Weight', 'Subsurface'), 0.4)
    _poner(principal, 'Subsurface Radius', (1.0, 0.7, 0.3))
    _poner(principal, 'Subsurface Scale', 0.004)


def _pared_de_la_piel(material, principal, eje, objeto=None):
    """La piel por dentro: la dermis hasta `DERMIS_M` bajo la superficie y la grasa debajo, por el atributo `hondura`."""
    arbol = material.node_tree
    coord = _nodo(arbol, 'ShaderNodeTexCoord', -1300, 0).outputs['Object']
    hondura = _nodo(arbol, 'ShaderNodeAttribute', -1300, 500)
    hondura.attribute_name = 'hondura'
    en_la_grasa = _nodo(arbol, 'ShaderNodeMapRange', -1000, 500)
    en_la_grasa.clamp = True
    en_la_grasa.inputs['From Min'].default_value = DERMIS_M - 0.00025
    en_la_grasa.inputs['From Max'].default_value = DERMIS_M + 0.00025
    arbol.links.new(hondura.outputs['Fac'], en_la_grasa.inputs['Value'])
    grasa, relieve = _lobulos_de_grasa(arbol, coord)
    capilar = _rampa(arbol, -700, 700, _ruido(arbol, coord, 2400.0, 2.0, 0.5, x=-1000, y=800), [(0.62, (0, 0, 0, 1)), (0.7, (1, 1, 1, 1))])
    _, dermis = _mezcla(arbol, -400, 700, (0.9, 0.72, 0.68, 1), (0.62, 0.1, 0.09, 1), capilar)
    _, color = _mezcla(arbol, -200, 400, dermis, grasa, en_la_grasa.outputs['Result'])
    _desconectar(arbol, principal.inputs['Base Color'])
    arbol.links.new(color, principal.inputs['Base Color'])
    _bump(arbol, relieve, 0.3, 0.0005, principal)
    _poner(principal, 'Roughness', 0.32)
    _poner(principal, ('Coat Weight', 'Clearcoat'), 0.35)
    _poner(principal, ('Subsurface Weight', 'Subsurface'), 0.3)
    _poner(principal, 'Subsurface Radius', (1.0, 0.5, 0.3))
    _poner(principal, 'Subsurface Scale', 0.003)


def _material_nuevo(objeto, nombre, funcion):
    """Un material propio en una ranura nueva del objeto, con el aspecto de `funcion`. Devuelve el número de la ranura."""
    material = bpy.data.materials.new(f'{objeto.name} · {nombre}')
    material.use_nodes = True
    try:
        material.surface_render_method = 'DITHERED'
    except Exception:
        pass
    objeto.data.materials.append(material)
    funcion(material, _principal(material), None, objeto)
    return len(objeto.data.materials) - 1


def cara_de_dentro(malla):
    """
    Los polígonos de la cara de dentro de la piel, o una lista vacía.

    La pieza «Skin» trae sueltas la cara de fuera, las orejas y la de dentro, que es la única de volumen negativo porque
    sus caras miran al cuerpo: la regla de `cascarasDeLaPiel` (`comprobarPiel.mjs`) y de `capas.cara_de_dentro`.
    """
    import numpy as np

    n = len(malla.vertices)
    caras = len(malla.polygons)
    if not caras:
        return []
    cuantos = np.zeros(caras, np.int32)
    malla.polygons.foreach_get('loop_total', cuantos)
    if (cuantos != 3).any():
        return []
    tri = np.zeros(caras * 3, np.int64)
    malla.polygons.foreach_get('vertices', tri)
    tri = tri.reshape(-1, 3)
    pos = np.zeros(n * 3, np.float64)
    malla.vertices.foreach_get('co', pos)
    pos = pos.reshape(-1, 3)
    padre = list(range(n))

    def raiz(i):
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i

    for a, b, c in tri.tolist():
        ra, rb = raiz(a), raiz(b)
        if ra != rb:
            padre[ra] = rb
        rc, rb = raiz(c), raiz(b)
        if rc != rb:
            padre[rc] = rb
    etiqueta = np.array([raiz(i) for i in range(n)])[tri[:, 0]]
    volumen = np.einsum('ij,ij->i', pos[tri[:, 0]], np.cross(pos[tri[:, 1]], pos[tri[:, 2]])) / 6
    cascaras, inversa = np.unique(etiqueta, return_inverse=True)
    por_cascara = np.bincount(inversa, weights=volumen)
    la_de_dentro = int(np.argmin(por_cascara))
    if por_cascara[la_de_dentro] >= 0:
        return []
    return np.nonzero(inversa == la_de_dentro)[0].tolist()


def separar_la_grasa(objeto):
    """Pone la cara de dentro de la piel en una ranura propia con la grasa. Devuelve si la encontró."""
    poligonos = cara_de_dentro(objeto.data)
    if not poligonos:
        return False
    ranura = _material_nuevo(objeto, 'grasa', _grasa)
    for i in poligonos:
        objeto.data.polygons[i].material_index = ranura
    objeto['ranura_de_la_grasa'] = ranura
    return True


def ranura_de_la_pared(objeto):
    """La ranura de la pared de la piel del objeto, que se crea la primera vez que el corte la pide."""
    if 'ranura_de_la_pared' not in objeto:
        objeto['ranura_de_la_pared'] = _material_nuevo(objeto, 'pared', _pared_de_la_piel)
    return objeto['ranura_de_la_pared']


def _ojos(material, principal, eje, objeto=None):
    """Esclera, iris y pupila: el color es el del vértice y lo demás, el brillo de lo mojado."""
    arbol = material.node_tree
    por_vertice = _color_por_vertice(objeto, arbol) if objeto is not None else None
    if por_vertice is not None:
        _desconectar(arbol, principal.inputs['Base Color'])
        arbol.links.new(por_vertice, principal.inputs['Base Color'])
    _poner(principal, 'Roughness', 0.22)
    _poner(principal, ('Coat Weight', 'Clearcoat'), 1.0)
    _poner(principal, ('Coat Roughness', 'Clearcoat Roughness'), 0.03)
    _poner(principal, ('Specular IOR Level', 'Specular'), 0.7)
    _poner(principal, ('Subsurface Weight', 'Subsurface'), 0.08)
    _poner(principal, 'Subsurface Radius', (1.0, 0.4, 0.3))
    _poner(principal, 'Subsurface Scale', 0.002)


def _cornea(material, principal, eje, objeto=None):
    """El casquete transparente sobre el iris: casi no se ve, pero da el reflejo de la ventana."""
    _poner(principal, 'Roughness', 0.02)
    _poner(principal, ('Specular IOR Level', 'Specular'), 1.0)
    _poner(principal, 'IOR', 1.376)
    _poner(principal, ('Coat Weight', 'Clearcoat'), 1.0)
    _poner(principal, ('Coat Roughness', 'Clearcoat Roughness'), 0.01)


def _tejido_conectivo(material, principal, eje, objeto=None):
    arbol = material.node_tree
    coord = _nodo(arbol, 'ShaderNodeTexCoord', -1200, 0).outputs['Object']
    hilos = _fibras(arbol, coord, 1800.0, 2.0)
    color = _rampa(arbol, -600, 200, hilos, [(0.0, (0.78, 0.72, 0.58, 1)), (1.0, (0.92, 0.88, 0.76, 1))])
    _desconectar(arbol, principal.inputs['Base Color'])
    arbol.links.new(color, principal.inputs['Base Color'])
    _bump(arbol, hilos, 0.2, 0.0004, principal)
    _poner(principal, 'Roughness', 0.45)


POR_SISTEMA = {
    'fascia-profunda': _fascia_profunda,
    'fascia-superficial': _fascia_superficial,
    'fascia-meningea': _fascia_meningea,
    'fascia-visceral': _fascia_visceral,
    'muscular': _musculo,
    'skeletal': _hueso,
    'integumentary': _piel,
    'connective': _tejido_conectivo,
    # Los grupos de aspecto propio que escribe la exportación (`extras.aspecto`), no sistemas.
    'ojos': _ojos,
    'cornea': _cornea,
}


def _eje_del_objeto(objeto):
    """
    Por dónde pasa el eje del miembro y cuánto mide hasta la superficie: `(x, y, radio)` en coordenadas del objeto.

    Es el centro de la caja en X e Y y la mitad del ancho medio, que para un manguito de miembro es el
    radio de la pierna o del muslo. No es exacto —un miembro no es un cilindro—, y no tiene por qué:
    solo reparte los hilos alrededor, y que uno esté un poco más apretado en un lado se ve como lo que es,
    la anatomía.
    """
    from mathutils import Vector

    esquinas = [Vector(c) for c in objeto.bound_box]
    xs = [c.x for c in esquinas]
    ys = [c.y for c in esquinas]
    return ((max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, max((max(xs) - min(xs) + max(ys) - min(ys)) / 4, 0.01))


def aspecto_de(sistema):
    """La función que pinta un sistema, o `None` si no se sabe: queda el material del archivo."""
    return POR_SISTEMA.get(sistema)


def aplicar(objeto, sistema):
    """
    Pone el aspecto del sistema a todos los materiales del objeto.

    Devuelve `True` si lo reconoce. Cada material se **copia** antes de tocarlo: el importador de glTF comparte
    el material entre los objetos que lo piden, y cambiar el de uno cambiaría el de otro.
    """
    funcion = aspecto_de(sistema)
    if funcion is None:
        return False
    eje = _eje_del_objeto(objeto)
    for i, ranura in enumerate(objeto.material_slots):
        material = ranura.material.copy()
        ranura.material = material
        try:
            material.surface_render_method = 'DITHERED'
        except Exception:
            pass
        funcion(material, _principal(material), eje, objeto)
    # La piel trae su cara de dentro (D-224), y desde D-331 es donde termina la grasa: va con su propio material.
    if sistema == 'integumentary':
        separar_la_grasa(objeto)
    return True

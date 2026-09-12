/**
 * Escritura de archivos glTF binarios, a mano y sin dependencias.
 *
 * Existía ya, dentro de `scripts/modelo-de-prueba.mjs`, para dibujar la tibia
 * de ejemplo. Se saca aquí porque ahora hay un segundo cliente —la exportación
 * de una preparación del atlas a un modelo de caso— y porque es aritmética de
 * desplazamientos y rellenos que puede estar mal sin que se note: un archivo
 * con un accessor mal alineado abre bien en un visor y falla en otro.
 *
 * Se escribe el contenedor entero en vez de usar el exportador de three porque
 * ese exportador vive en el navegador y trabaja sobre una escena montada; aquí
 * se parte de arrays tipados, en el servidor, sin escena y sin WebGL.
 */

/** Lo que hace falta saber de un objeto para escribirlo. */
export interface ObjetoParaGlb {
  /** Nombre del NODO: es lo que la consola busca para encender y apagar. */
  nombre: string
  posiciones: Float32Array
  /** Flotantes, o enteros de 16 bits leídos como decimales de −1 a 1. */
  normales: Float32Array | Int16Array
  indices: Uint32Array
  /** Rojo, verde, azul y opacidad, de 0 a 1. */
  color: [number, number, number, number]
}

/**
 * El nombre con el que el objeto llegará a la escena, no el que se escribe.
 *
 * three.js sanea los nombres al cargar: cambia los espacios por guiones bajos y
 * borra corchetes, puntos, dos puntos y barras. «Right tibia» llega como
 * «Right_tibia». Quien escriba en el caso el nombre original se encontrará una
 * pieza que no se enciende y ningún error que lo explique, así que los archivos
 * se escriben ya con el nombre saneado y lo que se ve en el taller es lo mismo
 * que hay dentro.
 *
 * Misma regla que `PropertyBinding.sanitizeNodeName` de three.
 */
export function nombreDeNodo(texto: string): string {
  return texto.replace(/\s/g, '_').replace(/[[\].:/]/g, '')
}

/** Mínimo y máximo por eje, que glTF exige en el accessor de posiciones. */
function minimoMaximo(posiciones: Float32Array): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < posiciones.length; i += 3) {
    for (let eje = 0; eje < 3; eje += 1) {
      const v = posiciones[i + eje]
      if (v < min[eje]) min[eje] = v
      if (v > max[eje]) max[eje] = v
    }
  }
  // Sin vértices no hay caja: se devuelven ceros en vez de infinitos, que no
  // son JSON válido y dejarían un archivo que ningún lector abre.
  if (!Number.isFinite(min[0])) return { min: [0, 0, 0], max: [0, 0, 0] }
  return { min, max }
}

const alinear = (n: number) => (4 - (n % 4)) % 4

/**
 * Escribe el archivo.
 *
 * Un objeto por nodo y **una primitiva por malla**, a propósito: un nodo con
 * varias primitivas lo convierte el cargador de three en un grupo cuyas mallas
 * hijas llevan otro nombre, de modo que encenderlas por nombre deja de ser
 * posible y la capa no aparece nunca.
 */
export function escribirGlb(objetos: ObjetoParaGlb[], generador: string): Uint8Array {
  const trozos: Uint8Array[] = []
  let desplazamiento = 0

  /** Mete un array tipado en el búfer y devuelve dónde quedó. */
  const agregar = (datos: Float32Array | Int16Array | Uint32Array) => {
    // Todo accessor empieza en múltiplo de 4. Sin esto hay lectores que se
    // niegan a abrir el archivo, y otros que lo abren torcido.
    const relleno = alinear(desplazamiento)
    if (relleno) {
      trozos.push(new Uint8Array(relleno))
      desplazamiento += relleno
    }
    const bytes = new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength)
    trozos.push(bytes)
    const vista = { byteOffset: desplazamiento, byteLength: datos.byteLength }
    desplazamiento += datos.byteLength
    return vista
  }

  const bufferViews: Record<string, number>[] = []
  const accessors: Record<string, unknown>[] = []
  const meshes: Record<string, unknown>[] = []
  const nodes: Record<string, unknown>[] = []
  const materials: Record<string, unknown>[] = []

  for (const objeto of objetos) {
    const { posiciones, normales, indices } = objeto

    const vPos = agregar(posiciones)
    const vNor = agregar(normales)
    const vInd = agregar(indices)

    const iPos = bufferViews.push({ buffer: 0, ...vPos, target: 34962 }) - 1
    const iNor = bufferViews.push({ buffer: 0, ...vNor, target: 34962 }) - 1
    const iInd = bufferViews.push({ buffer: 0, ...vInd, target: 34963 }) - 1

    const { min, max } = minimoMaximo(posiciones)
    const aPos =
      accessors.push({
        bufferView: iPos,
        componentType: 5126,
        count: posiciones.length / 3,
        type: 'VEC3',
        min,
        max,
      }) - 1

    // Los enteros de 16 bits se declaran normalizados: la tarjeta los lee como
    // decimales de −1 a 1 y ocupan la mitad que un flotante, sin diferencia
    // visible. Es como viajan dentro del atlas.
    const esCorto = normales instanceof Int16Array
    const aNor =
      accessors.push({
        bufferView: iNor,
        componentType: esCorto ? 5122 : 5126,
        count: normales.length / 3,
        type: 'VEC3',
        ...(esCorto ? { normalized: true } : {}),
      }) - 1

    // Uint32 siempre. Con Uint16 una selección de más de 65.535 vértices da una
    // malla rota de un modo dificilísimo de diagnosticar: el archivo es válido,
    // abre, y enseña triángulos cosidos al azar.
    const aInd =
      accessors.push({
        bufferView: iInd,
        componentType: 5125,
        count: indices.length,
        type: 'SCALAR',
      }) - 1

    const nombre = nombreDeNodo(objeto.nombre)

    const iMaterial =
      materials.push({
        name: `mat_${nombre}`,
        pbrMetallicRoughness: {
          baseColorFactor: objeto.color,
          metallicFactor: 0.05,
          roughnessFactor: 0.85,
        },
        doubleSided: true,
        ...(objeto.color[3] < 1 ? { alphaMode: 'BLEND' } : {}),
      }) - 1

    const iMesh =
      meshes.push({
        name: nombre,
        primitives: [
          { attributes: { POSITION: aPos, NORMAL: aNor }, indices: aInd, material: iMaterial },
        ],
      }) - 1

    nodes.push({ name: nombre, mesh: iMesh })
  }

  const binario = concatenar(trozos)

  const gltf = {
    asset: { version: '2.0', generator: generador },
    scene: 0,
    scenes: [{ name: 'escena', nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binario.byteLength }],
  }

  // El JSON se rellena con espacios y el binario con ceros: lo dice la norma.
  const bloqueJson = conRelleno(new TextEncoder().encode(JSON.stringify(gltf)), 0x20)
  const bloqueBin = conRelleno(binario, 0x00)

  const total = 12 + 8 + bloqueJson.byteLength + 8 + bloqueBin.byteLength
  const salida = new Uint8Array(total)
  const vista = new DataView(salida.buffer)
  let p = 0

  salida.set([0x67, 0x6c, 0x54, 0x46], 0) // «glTF»
  vista.setUint32(4, 2, true)
  vista.setUint32(8, total, true)
  p = 12

  const bloque = (datos: Uint8Array, tipo: number) => {
    vista.setUint32(p, datos.byteLength, true)
    vista.setUint32(p + 4, tipo, true)
    salida.set(datos, p + 8)
    p += 8 + datos.byteLength
  }
  bloque(bloqueJson, 0x4e4f534a) // JSON
  bloque(bloqueBin, 0x004e4942) // BIN

  return salida
}

function concatenar(trozos: Uint8Array[]): Uint8Array {
  const total = trozos.reduce((t, c) => t + c.byteLength, 0)
  const salida = new Uint8Array(total)
  let p = 0
  for (const t of trozos) {
    salida.set(t, p)
    p += t.byteLength
  }
  return salida
}

function conRelleno(datos: Uint8Array, relleno: number): Uint8Array {
  const sobra = alinear(datos.byteLength)
  if (!sobra) return datos
  const salida = new Uint8Array(datos.byteLength + sobra)
  salida.set(datos, 0)
  salida.fill(relleno, datos.byteLength)
  return salida
}

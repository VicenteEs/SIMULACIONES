/**
 * Genera un modelo 3D de prueba para la consola quirúrgica.
 *
 *   node scripts/modelo-de-prueba.mjs
 *
 * Escribe `medios/modelos/tibia-de-prueba.glb`: una tibia esquemática partida
 * en dos, con la envoltura de músculo y piel. No pretende ser anatomía; es un
 * banco de pruebas y, sobre todo, **el ejemplo de la estructura que espera la
 * consola**, que es lo que hay que reproducir al exportar desde Blender:
 *
 *   tibia_proximal   el trozo que no se mueve
 *   tibia_distal     el fragmento que el residente reduce
 *   musculo          la capa que se apaga para ver el hueso
 *   piel             la capa de fuera
 *
 * Lo único que la consola necesita de un archivo es eso: **objetos separados y
 * con nombre**. El nombre del objeto en Blender es el que se escribe en las
 * piezas del caso, y tiene que coincidir carácter por carácter.
 *
 * Se exporta el hueso REDUCIDO, con los dos trozos en su sitio anatómico. El
 * desplazamiento de la fractura se declara en el caso, no se modela: así la
 * reducción correcta es siempre volver al cero y la consola puede medir cuánto
 * falta.
 *
 * El archivo se escribe a mano y sin dependencias. Un GLB son tres bloques
 * —cabecera, JSON y binario— y generarlos aquí evita traer un exportador de
 * 300 KB para hacer cuatro cilindros.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..')
const DESTINO = join(RAIZ, 'medios', 'modelos')
const ARCHIVO = 'tibia-de-prueba.glb'

/**
 * Un cilindro con tapas, a lo largo del eje Y.
 *
 * Devuelve posiciones, normales e índices ya listos para un accessor de glTF.
 * Se generan las normales a mano y no se calculan después: en un cilindro se
 * saben, y una malla sin normales se ve plana y negra.
 */
function cilindro({ desde, hasta, radioInferior, radioSuperior, lados = 28 }) {
  const posiciones = []
  const normales = []
  const indices = []

  const empujar = (x, y, z, nx, ny, nz) => {
    posiciones.push(x, y, z)
    normales.push(nx, ny, nz)
    return posiciones.length / 3 - 1
  }

  // --- pared ---
  const inclinacion = (radioInferior - radioSuperior) / (hasta - desde)
  const largoNormal = Math.hypot(1, inclinacion)
  for (let i = 0; i < lados; i++) {
    const a = (i / lados) * Math.PI * 2
    const b = ((i + 1) / lados) * Math.PI * 2
    for (const [angulo, siguiente] of [[a, b]]) {
      const puntos = [angulo, siguiente]
      const anillo = puntos.map((ang) => {
        const cos = Math.cos(ang)
        const sen = Math.sin(ang)
        const abajo = empujar(
          cos * radioInferior,
          desde,
          sen * radioInferior,
          cos / largoNormal,
          inclinacion / largoNormal,
          sen / largoNormal,
        )
        const arriba = empujar(
          cos * radioSuperior,
          hasta,
          sen * radioSuperior,
          cos / largoNormal,
          inclinacion / largoNormal,
          sen / largoNormal,
        )
        return { abajo, arriba }
      })
      indices.push(anillo[0].abajo, anillo[1].abajo, anillo[1].arriba)
      indices.push(anillo[0].abajo, anillo[1].arriba, anillo[0].arriba)
    }
  }

  // --- tapas ---
  for (const [y, radio, normalY] of [
    [desde, radioInferior, -1],
    [hasta, radioSuperior, 1],
  ]) {
    const centro = empujar(0, y, 0, 0, normalY, 0)
    const borde = []
    for (let i = 0; i < lados; i++) {
      const ang = (i / lados) * Math.PI * 2
      borde.push(empujar(Math.cos(ang) * radio, y, Math.sin(ang) * radio, 0, normalY, 0))
    }
    for (let i = 0; i < lados; i++) {
      const a = borde[i]
      const b = borde[(i + 1) % lados]
      // El orden depende de la tapa: si se invierte, la cara mira hacia dentro
      // y la tapa se ve como un agujero.
      if (normalY > 0) indices.push(centro, a, b)
      else indices.push(centro, b, a)
    }
  }

  return {
    posiciones: new Float32Array(posiciones),
    normales: new Float32Array(normales),
    indices: new Uint16Array(indices),
  }
}

// --- las cuatro piezas ------------------------------------------------------
//
// Medidas en metros, que es la unidad de glTF. Una tibia adulta ronda los 36 cm
// y el trazo de fractura se pone en el tercio medio, que es donde va un clavo.
const PIEZAS = [
  {
    nombre: 'tibia_proximal',
    color: [0.91, 0.89, 0.83, 1],
    geometria: cilindro({ desde: 0.0, hasta: 0.2, radioInferior: 0.026, radioSuperior: 0.021 }),
  },
  {
    nombre: 'tibia_distal',
    color: [0.91, 0.89, 0.83, 1],
    geometria: cilindro({ desde: -0.16, hasta: 0.0, radioInferior: 0.023, radioSuperior: 0.026 }),
  },
  {
    nombre: 'musculo',
    color: [0.71, 0.33, 0.3, 0.85],
    geometria: cilindro({ desde: -0.17, hasta: 0.21, radioInferior: 0.045, radioSuperior: 0.05 }),
  },
  {
    nombre: 'piel',
    color: [0.86, 0.75, 0.66, 0.8],
    geometria: cilindro({ desde: -0.18, hasta: 0.22, radioInferior: 0.058, radioSuperior: 0.063 }),
  },
]

// --- armado del GLB ---------------------------------------------------------

const trozos = []
let desplazamiento = 0

/** Mete un array tipado en el búfer binario y devuelve su vista. */
function agregar(datos) {
  // Todo accessor tiene que empezar en múltiplo de 4; si no, algunos lectores
  // se niegan a abrir el archivo.
  const relleno = (4 - (desplazamiento % 4)) % 4
  if (relleno) {
    trozos.push(Buffer.alloc(relleno))
    desplazamiento += relleno
  }
  const bytes = Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength)
  trozos.push(bytes)
  const vista = { byteOffset: desplazamiento, byteLength: datos.byteLength }
  desplazamiento += datos.byteLength
  return vista
}

const bufferViews = []
const accessors = []
const meshes = []
const nodes = []
const materials = []

const minimoMaximo = (posiciones) => {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < posiciones.length; i += 3) {
    for (let eje = 0; eje < 3; eje++) {
      min[eje] = Math.min(min[eje], posiciones[i + eje])
      max[eje] = Math.max(max[eje], posiciones[i + eje])
    }
  }
  return { min, max }
}

for (const pieza of PIEZAS) {
  const { posiciones, normales, indices } = pieza.geometria

  const vistaPos = agregar(posiciones)
  const vistaNor = agregar(normales)
  const vistaInd = agregar(indices)

  const iPos = bufferViews.push({ buffer: 0, ...vistaPos, target: 34962 }) - 1
  const iNor = bufferViews.push({ buffer: 0, ...vistaNor, target: 34962 }) - 1
  const iInd = bufferViews.push({ buffer: 0, ...vistaInd, target: 34963 }) - 1

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
  const aNor =
    accessors.push({
      bufferView: iNor,
      componentType: 5126,
      count: normales.length / 3,
      type: 'VEC3',
    }) - 1
  const aInd =
    accessors.push({
      bufferView: iInd,
      componentType: 5123,
      count: indices.length,
      type: 'SCALAR',
    }) - 1

  const iMaterial =
    materials.push({
      name: `mat_${pieza.nombre}`,
      pbrMetallicRoughness: {
        baseColorFactor: pieza.color,
        metallicFactor: 0.05,
        roughnessFactor: 0.85,
      },
      doubleSided: true,
      ...(pieza.color[3] < 1 ? { alphaMode: 'BLEND' } : {}),
    }) - 1

  const iMesh =
    meshes.push({
      name: pieza.nombre,
      primitives: [
        {
          attributes: { POSITION: aPos, NORMAL: aNor },
          indices: aInd,
          material: iMaterial,
        },
      ],
    }) - 1

  // El nombre va en el NODO, que es lo que lee la consola con `getObjectByName`.
  nodes.push({ name: pieza.nombre, mesh: iMesh })
}

const binario = Buffer.concat(trozos)

const gltf = {
  asset: { version: '2.0', generator: 'TraumaHub · scripts/modelo-de-prueba.mjs' },
  scene: 0,
  scenes: [{ name: 'caso', nodes: nodes.map((_, i) => i) }],
  nodes,
  meshes,
  materials,
  accessors,
  bufferViews,
  buffers: [{ byteLength: binario.byteLength }],
}

// --- los tres bloques del contenedor ---------------------------------------
const conRelleno = (buffer, relleno) => {
  const sobra = (4 - (buffer.byteLength % 4)) % 4
  return sobra ? Buffer.concat([buffer, Buffer.alloc(sobra, relleno)]) : buffer
}

// El JSON se rellena con espacios y el binario con ceros: lo dice la norma.
const bloqueJson = conRelleno(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20)
const bloqueBin = conRelleno(binario, 0x00)

const cabeceraDeBloque = (longitud, tipo) => {
  const b = Buffer.alloc(8)
  b.writeUInt32LE(longitud, 0)
  b.writeUInt32LE(tipo, 4)
  return b
}

const cabecera = Buffer.alloc(12)
cabecera.write('glTF', 0, 'ascii')
cabecera.writeUInt32LE(2, 4)
cabecera.writeUInt32LE(12 + 8 + bloqueJson.byteLength + 8 + bloqueBin.byteLength, 8)

const glb = Buffer.concat([
  cabecera,
  cabeceraDeBloque(bloqueJson.byteLength, 0x4e4f534a), // JSON
  bloqueJson,
  cabeceraDeBloque(bloqueBin.byteLength, 0x004e4942), // BIN
  bloqueBin,
])

mkdirSync(DESTINO, { recursive: true })
writeFileSync(join(DESTINO, ARCHIVO), glb)

const triangulos = PIEZAS.reduce((t, p) => t + p.geometria.indices.length / 3, 0)
console.log(`Escrito ${join('medios', 'modelos', ARCHIVO)}`)
console.log(`  ${PIEZAS.length} objetos · ${triangulos} triángulos · ${(glb.byteLength / 1024).toFixed(1)} KB`)
console.log(`  nombres: ${PIEZAS.map((p) => p.nombre).join(', ')}`)

/**
 * Genera la figura del cuerpo completo que se ve en la portada.
 *
 *   node scripts/atlas/portada.mjs
 *
 * Lee `public/atlas/` —el catálogo y los paquetes ya preparados por
 * `preparar.mjs`— y escribe dos cosas:
 *
 *   public/atlas/portada.bin.gz   una nube de puntos del cuerpo entero
 *   src/atlas/portada.json        cuántos puntos hay de cada capa, la caja que
 *                                 los contiene y la versión, para la URL
 *
 * Se ejecuta una sola vez y el resultado se versiona, igual que el atlas.
 *
 * --------------------------------------------------------------------------
 * Por qué una nube de puntos y no el atlas de verdad:
 *
 * La portada es lo primero que abre cada persona, a veces desde el teléfono y
 * por un túnel doméstico. El cuerpo completo son 33 MB y 2,3 millones de
 * triángulos. Y no se puede pedir «solo el esqueleto»: los paquetes no están
 * ordenados por sistema, así que sus 296 piezas obligan a bajar 9 de los 15
 * paquetes, 19 MB. Un adorno no puede costar eso.
 *
 * Los puntos se muestrean sobre los triángulos reales, así que la figura ES el
 * atlas —las proporciones, la postura y cada hueso son los suyos—, solo que
 * cabe en medio megabyte. Y una reconstrucción hecha de puntos es además lo que
 * ya decía la figura anterior, el fémur dibujado como una tomografía.
 *
 * Dos capas, porque se pintan distinto: el esqueleto, que es de lo que trata la
 * plataforma, y la piel, que solo da la silueta y va mucho más tenue.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ATLAS = path.join(RAIZ, 'public', 'atlas')

/**
 * Cuántos puntos por capa. Seis bytes por punto sin comprimir: 85.000 puntos
 * son 510 KB, y comprimidos bastante menos. Más puntos no se notan en una
 * tarjeta de 250 px de ancho; menos, y las manos y las costillas se deshacen.
 */
const PUNTOS_DE_ESQUELETO = 60_000
const PUNTOS_DE_PIEL = 25_000

const catalogo = JSON.parse(readFileSync(path.join(ATLAS, 'catalogo.json'), 'utf8'))

// Las mismas correcciones que aplica `corregirCatalogo` en el navegador. Sin
// ellas, las encías —que el atlas de origen clasifica como hueso— saldrían
// dentro del esqueleto.
const correcciones = JSON.parse(
  readFileSync(path.join(RAIZ, 'src', 'atlas', 'correcciones-de-sistema.json'), 'utf8'),
)
const sistemaDe = (pieza) => correcciones[pieza.nombre] ?? pieza.sistema

// Solo «Skin». El sistema tegumentario trae además cejas, labios y vello, que
// como puntos sueltos son ruido alrededor de la cara.
const capas = [
  { nombre: 'esqueleto', cuantos: PUNTOS_DE_ESQUELETO, piezas: catalogo.piezas.filter((p) => sistemaDe(p) === 'skeletal') },
  { nombre: 'piel', cuantos: PUNTOS_DE_PIEL, piezas: catalogo.piezas.filter((p) => p.nombre === 'Skin') },
]

const paquetes = new Map()
function paquete(indice) {
  if (!paquetes.has(indice)) {
    const comprimido = readFileSync(path.join(ATLAS, catalogo.paquetes[indice].archivo))
    const datos = gunzipSync(comprimido)
    // Copia a un ArrayBuffer propio y alineado: el Buffer de Node puede ser una
    // ventana dentro de otro mayor, y una vista Float32 exige múltiplos de 4.
    paquetes.set(indice, datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength))
  }
  return paquetes.get(indice)
}

/**
 * Generador con semilla fija (mulberry32). Con `Math.random` cada ejecución
 * daría un archivo distinto y un diff de medio megabyte sin que nada hubiera
 * cambiado.
 */
function azar(semilla) {
  let a = semilla >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Muestrea `cuantos` puntos sobre la superficie de las piezas, a razón del área. */
function muestrear(piezas, cuantos, semilla) {
  const triangulos = []
  let areaTotal = 0
  for (const pieza of piezas) {
    const bufer = paquete(pieza.paquete)
    const pos = new Float32Array(bufer, pieza.pos, pieza.vertices * 3)
    const idx = new Uint32Array(bufer, pieza.idx, pieza.indices)
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3
      const b = idx[i + 1] * 3
      const c = idx[i + 2] * 3
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
      const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
      if (!(area > 0)) continue
      areaTotal += area
      triangulos.push({ pos, a, b, c, hasta: areaTotal })
    }
  }

  const aleatorio = azar(semilla)
  const puntos = new Float32Array(cuantos * 3)
  for (let n = 0; n < cuantos; n++) {
    // Búsqueda binaria del triángulo al que le toca esta tirada.
    const objetivo = aleatorio() * areaTotal
    let bajo = 0
    let alto = triangulos.length - 1
    while (bajo < alto) {
      const medio = (bajo + alto) >> 1
      if (triangulos[medio].hasta < objetivo) bajo = medio + 1
      else alto = medio
    }
    const t = triangulos[bajo]
    // Punto uniforme dentro del triángulo: sin la raíz se amontonan en un vértice.
    const r = Math.sqrt(aleatorio())
    const s = aleatorio()
    const wa = 1 - r
    const wb = r * (1 - s)
    const wc = r * s
    for (let k = 0; k < 3; k++) {
      puntos[n * 3 + k] = wa * t.pos[t.a + k] + wb * t.pos[t.b + k] + wc * t.pos[t.c + k]
    }
  }
  return puntos
}

const muestras = capas.map((capa, i) => {
  if (capa.piezas.length === 0) throw new Error(`La capa «${capa.nombre}» no tiene piezas en el catálogo.`)
  return muestrear(capa.piezas, capa.cuantos, 20260921 + i)
})

// Una sola caja para las dos capas: cuantizadas cada una con la suya, la piel y
// el esqueleto dejarían de coincidir por unos milímetros, y se nota en las manos.
const minimo = [Infinity, Infinity, Infinity]
const maximo = [-Infinity, -Infinity, -Infinity]
for (const puntos of muestras) {
  for (let i = 0; i < puntos.length; i++) {
    const k = i % 3
    if (puntos[i] < minimo[k]) minimo[k] = puntos[i]
    if (puntos[i] > maximo[k]) maximo[k] = puntos[i]
  }
}

// Cómo se guarda, y por qué no «xyz, xyz, xyz» en 16 bits, que fue lo primero:
// puntos al azar son ruido y gzip no les saca nada (497 KB de 498). Tres cosas
// lo bajan a bastante menos de la mitad sin que se vea:
//
//  1. 12 bits por coordenada. Sobre 1,72 m son 0,4 mm por paso; la tarjeta mide
//     unos 250 px. Los cuatro bits altos quedan a cero y gzip los cobra casi nada.
//  2. Dentro de cada capa los puntos se ordenan por altura —el orden no
//     significa nada al pintarlos— y la altura se guarda como la diferencia con
//     el punto anterior, que casi siempre es 0 o 1.
//  3. Por planos: todas las alturas, luego todas las x, luego todas las z. Los
//     valores parecidos quedan juntos, que es lo que gzip sabe aprovechar.
//
// El navegador lo deshace en `CuerpoDePortada.tsx` con una suma acumulada.
const PASOS = 4095
const total = muestras.reduce((suma, p) => suma + p.length, 0)
const cuantizado = new Uint16Array(total)
const cuantizar = (valor, k) => Math.round(((valor - minimo[k]) / (maximo[k] - minimo[k] || 1)) * PASOS)
let escrito = 0
for (const puntos of muestras) {
  const n = puntos.length / 3
  const filas = Array.from({ length: n }, (_, i) => [
    cuantizar(puntos[i * 3], 0),
    cuantizar(puntos[i * 3 + 1], 1),
    cuantizar(puntos[i * 3 + 2], 2),
  ]).sort((p, q) => p[1] - q[1] || p[0] - q[0] || p[2] - q[2])
  let anterior = 0
  for (let i = 0; i < n; i++) {
    cuantizado[escrito + i] = filas[i][1] - anterior
    anterior = filas[i][1]
    cuantizado[escrito + n + i] = filas[i][0]
    cuantizado[escrito + 2 * n + i] = filas[i][2]
  }
  escrito += n * 3
}

const crudo = Buffer.from(cuantizado.buffer)
const comprimido = gzipSync(crudo, { level: 9 })
writeFileSync(path.join(ATLAS, 'portada.bin.gz'), comprimido)

const redondear = (v) => Number(v.toFixed(5))
const descripcion = {
  // Viaja en la URL, como la del catálogo: el archivo se sirve «immutable» un
  // año y su nombre no cambia, así que sin esto regenerarlo no llegaría a nadie.
  version: createHash('sha256').update(crudo).digest('hex').slice(0, 12),
  atlas: catalogo.version,
  bytes: crudo.byteLength,
  capas: capas.map((capa) => ({ nombre: capa.nombre, puntos: capa.cuantos })),
  pasos: PASOS,
  caja: [minimo.map(redondear), maximo.map(redondear)],
}
writeFileSync(path.join(RAIZ, 'src', 'atlas', 'portada.json'), JSON.stringify(descripcion, null, 2) + '\n')

console.log(`portada.bin.gz  ${(comprimido.byteLength / 1024).toFixed(0)} KB comprimido, ${(crudo.byteLength / 1024).toFixed(0)} KB en memoria`)
for (const capa of capas) console.log(`  ${capa.nombre.padEnd(10)} ${capa.cuantos} puntos de ${capa.piezas.length} piezas`)
console.log(`  versión ${descripcion.version}`)

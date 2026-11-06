/**
 * Pone en el atlas los huesos largos rehechos (P-012 E7, D-335 y D-336): lisos, con su canal medular y comprobados.
 *
 *   python scripts/atlas/huesos/generar.py      # la forma y el canal (ver allí)
 *   node scripts/atlas/poner-huesos.mjs         # comprueba y dice qué haría
 *   node scripts/atlas/poner-huesos.mjs --aplicar
 *
 * Qué hace:
 *
 * 1. Lee lo que dejó `generar.py` en `scripts/atlas/huesos/salida/`. Tienen que estar los catorce, sacados del mismo
 *    origen, y cada uno tiene que ser una pieza del atlas con el mismo nombre: un manifiesto de una prueba a medias
 *    (`--ids`) no se pone.
 * 2. Pasa la prueba de la piel (`comprobarLaPiel`, la de `geometriaDePiel.test.ts`) con los huesos nuevos en lugar de
 *    los de ahora. El hueso nuevo asoma como mucho un cuarto de milímetro del de antes, y la piel y su cara de dentro
 *    están calculadas contra el de antes: donde la tibia o la clavícula quedan justo bajo la piel, ese cuarto de
 *    milímetro podría meterla en ella. Si no se cumple, no se escribe.
 * 3. Rehace los paquetes de los huesos con las demás piezas byte a byte iguales (se comprueba, como en la piel).
 * 4. Anota cada hueso en `catalogo.json`: `rehecha` (lo que dice que no es el de BodyParts3D, y que lee
 *    `atribucion.mjs`), `canal` (dónde empiezan los vértices y los índices de la cáscara del canal, que va después de
 *    la de fuera) e `istmoMm` (lo más estrecho del canal, que es lo que mide la fresa). Después rehace `ATRIBUCION.md`.
 *
 * Es idempotente: `generar.py` parte de los huesos de BodyParts3D leídos del historial de git, no de los del atlas, y
 * este guion sustituye la pieza entera.
 *
 * **Regenerar el atlas con `preparar.mjs` devuelve los huesos de origen.** Después hay que volver a pasar los dos.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { atribucion } from './atribucion.mjs'
import { comprobarLaPiel } from './comprobarPiel.mjs'
import { alinear, versionDelCatalogo } from './fascias/empaquetar.mjs'
import { NOMBRE_DE_LA_PIEL } from './geometriaDePiel.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ATLAS = join(RAIZ, 'public', 'atlas')
const SALIDA = join(RAIZ, 'scripts', 'atlas', 'huesos', 'salida')
const aplicar = process.argv.includes('--aplicar')

/** Los que tiene que haber: si `generar.py` cambia la lista, aquí también. */
const CUANTOS = 14

const t0 = Date.now()
const dicho = (texto) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)} s] ${texto}`)

// --- lo que dejó generar.py -----------------------------------------------------------------------
const archivoDelManifiesto = join(SALIDA, 'manifiesto.json')
if (!existsSync(archivoDelManifiesto)) {
  console.error(`No está ${archivoDelManifiesto}. Primero: python scripts/atlas/huesos/generar.py`)
  process.exit(1)
}
const manifiesto = JSON.parse(readFileSync(archivoDelManifiesto, 'utf8'))
if (manifiesto.huesos.length !== CUANTOS) {
  console.error(`El manifiesto trae ${manifiesto.huesos.length} huesos y se esperaban ${CUANTOS}: ¿quedó de una prueba con --ids? Vuelva a pasar generar.py sin --ids.`)
  process.exit(1)
}

const catalogo = JSON.parse(readFileSync(join(ATLAS, 'catalogo.json'), 'utf8'))
const paquetes = new Map()
const paquete = (n) => {
  if (!paquetes.has(n)) paquetes.set(n, gunzipSync(readFileSync(join(ATLAS, catalogo.paquetes[n].archivo))))
  return paquetes.get(n)
}

/** Cada hueso nuevo, con sus tres arreglos tal como van al paquete. */
const nuevos = new Map()
for (const h of manifiesto.huesos) {
  const pieza = catalogo.piezas.find((p) => p.id === h.id)
  if (!pieza) throw new Error(`${h.id} no está en el catálogo del atlas.`)
  if (pieza.nombre !== h.nombre) throw new Error(`${h.id} se llama «${pieza.nombre}» en el atlas y «${h.nombre}» en el manifiesto.`)
  const bin = readFileSync(join(SALIDA, `${h.id}.bin`))
  const bytesPos = h.vertices * 12
  const bytesNor = h.vertices * 6
  const inicioIdx = alinear(bytesPos + bytesNor)
  if (bin.byteLength !== inicioIdx + h.indices * 4) throw new Error(`${h.id}.bin mide ${bin.byteLength} bytes y no lo que dice el manifiesto.`)
  // Copias alineadas: el `Buffer` que da `readFileSync` puede empezar en cualquier byte de su memoria.
  const pos = new Float32Array(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bytesPos))
  const nor = new Int16Array(bin.buffer.slice(bin.byteOffset + bytesPos, bin.byteOffset + bytesPos + bytesNor))
  const idx = new Uint32Array(bin.buffer.slice(bin.byteOffset + inicioIdx, bin.byteOffset + inicioIdx + h.indices * 4))
  for (const i of idx) if (i >= h.vertices) throw new Error(`${h.id}: un índice apunta fuera de sus vértices.`)
  if (!(h.canal.vertice > 0 && h.canal.vertice < h.vertices && h.canal.indice > 0 && h.canal.indice < h.indices)) {
    throw new Error(`${h.id}: el canal no está entre sus vértices y sus índices.`)
  }
  nuevos.set(h.id, { registro: h, pieza, pos, nor, idx })
  const m = h.medidas
  dicho(
    `${h.id} ${h.nombre}: ${pieza.vertices} → ${h.vertices} vértices; asoma como mucho ${m.respecto_del_origen.asoma_como_mucho_mm} mm; ` +
      `canal de ${m.canal.largo_mm} mm, cortical de ${m.canal.cortical_mediana_en_la_diafisis_mm} mm e istmo de ${m.canal.istmo_mm} mm`,
  )
}

// --- comprobar antes de escribir --------------------------------------------------------------
// La prueba de la piel con los huesos nuevos: se le dan las piezas con sus cifras nuevas y un `leer` que, para ellas,
// devuelve lo que se va a escribir.
const piezasConLosNuevos = catalogo.piezas.map((p) => (nuevos.has(p.id) ? { ...p, vertices: nuevos.get(p.id).registro.vertices, indices: nuevos.get(p.id).registro.indices } : p))
const leer = (p) => {
  const n = nuevos.get(p.id)
  if (n) return { pos: n.pos, idx: n.idx }
  const b = paquete(p.paquete)
  return {
    pos: new Float32Array(b.buffer.slice(b.byteOffset + p.pos, b.byteOffset + p.pos + p.vertices * 12)),
    idx: new Uint32Array(b.buffer.slice(b.byteOffset + p.idx, b.byteOffset + p.idx + p.indices * 4)),
  }
}
const piel = catalogo.piezas.find((p) => p.nombre === NOMBRE_DE_LA_PIEL)
if (!piel) throw new Error('El atlas no tiene piel.')
const { pos: posPiel, idx: idxPiel } = leer(piel)
const informe = comprobarLaPiel({ pieza: { pos: posPiel, idx: idxPiel, vertices: piel.vertices }, piezas: piezasConLosNuevos, leer })
for (const linea of informe.lineas) dicho(linea)
if (!informe.cumple) {
  console.error('\nCon los huesos nuevos, la piel no cumple lo que exige la prueba. No se escribe nada en el atlas.')
  process.exit(1)
}

if (!aplicar) {
  console.log('\nSin --aplicar no se escribe nada.')
  process.exit(0)
}

// --- los paquetes ------------------------------------------------------------------------------
// Cada uno se rehace entero, en el mismo orden, con los huesos nuevos en su sitio: las demás piezas cambian de
// desplazamiento pero no de bytes, y se comprueba al final.
const huellaDe = (p, b) =>
  createHash('sha256')
    .update(b.subarray(p.pos, p.pos + p.vertices * 12))
    .update(b.subarray(p.nor, p.nor + p.vertices * 6))
    .update(b.subarray(p.idx, p.idx + p.indices * 4))
    .digest('hex')
const numeros = [...new Set([...nuevos.values()].map((n) => n.pieza.paquete))].sort((a, b) => a - b)
const desplazamientos = new Map()
const paquetesEscritos = new Map()
for (const numero of numeros) {
  const viejo = paquete(numero)
  const delPaquete = catalogo.piezas.filter((p) => p.paquete === numero).sort((a, b) => a.pos - b.pos)
  const huellasAntes = new Map(delPaquete.filter((p) => !nuevos.has(p.id)).map((p) => [p.id, huellaDe(p, viejo)]))
  const trozos = []
  let cursor = 0
  const poner = (bytes) => {
    const relleno = alinear(cursor) - cursor
    if (relleno) trozos.push(Buffer.alloc(relleno))
    cursor = alinear(cursor)
    const donde = cursor
    trozos.push(bytes)
    cursor += bytes.length
    return donde
  }
  for (const p of delPaquete) {
    const n = nuevos.get(p.id)
    desplazamientos.set(
      p.id,
      n
        ? { pos: poner(Buffer.from(n.pos.buffer)), nor: poner(Buffer.from(n.nor.buffer)), idx: poner(Buffer.from(n.idx.buffer)) }
        : {
            pos: poner(viejo.subarray(p.pos, p.pos + p.vertices * 12)),
            nor: poner(viejo.subarray(p.nor, p.nor + p.vertices * 6)),
            idx: poner(viejo.subarray(p.idx, p.idx + p.indices * 4)),
          },
    )
  }
  if (alinear(cursor) > cursor) trozos.push(Buffer.alloc(alinear(cursor) - cursor))
  const nuevoPaquete = Buffer.concat(trozos)
  for (const p of delPaquete.filter((q) => !nuevos.has(q.id))) {
    if (huellaDe({ ...p, ...desplazamientos.get(p.id) }, nuevoPaquete) !== huellasAntes.get(p.id)) {
      throw new Error(`La pieza ${p.id} cambió al rehacer el paquete ${numero}. No se escribe nada.`)
    }
  }
  paquetesEscritos.set(numero, { antes: viejo.byteLength, bytes: nuevoPaquete, comprimido: gzipSync(nuevoPaquete, { level: 9 }) })
}

const piezas = catalogo.piezas.map((p) => {
  if (!desplazamientos.has(p.id)) return p
  const d = desplazamientos.get(p.id)
  const n = nuevos.get(p.id)
  if (!n) return { ...p, ...d }
  const { registro: h } = n
  return {
    ...p,
    ...d,
    vertices: h.vertices,
    indices: h.indices,
    caja: h.caja,
    rehecha: `D-335 y D-336: lisa con lados de ${manifiesto.parametros.lado_mm} mm y su canal medular, desde ${manifiesto.origen}`,
    canal: h.canal,
    ...(h.medidas.canal.istmo_mm ? { istmoMm: h.medidas.canal.istmo_mm } : {}),
  }
})
const paquetesNuevos = catalogo.paquetes.map((p, i) =>
  paquetesEscritos.has(i) ? { ...p, bytes: paquetesEscritos.get(i).bytes.byteLength, bytesComprimido: paquetesEscritos.get(i).comprimido.byteLength } : p,
)
const triangulos = catalogo.triangulos + [...nuevos.values()].reduce((s, n) => s + (n.registro.indices - n.pieza.indices) / 3, 0)
const nuevo = { ...catalogo, triangulos, paquetes: paquetesNuevos, piezas, version: versionDelCatalogo(piezas, paquetesNuevos) }
for (const [numero, e] of paquetesEscritos) {
  writeFileSync(join(ATLAS, catalogo.paquetes[numero].archivo), e.comprimido)
  dicho(
    `Escrito ${catalogo.paquetes[numero].archivo}: ${(e.antes / 1048576).toFixed(2)} → ${(e.bytes.byteLength / 1048576).toFixed(2)} MB ` +
      `(${(e.comprimido.byteLength / 1048576).toFixed(2)} MB comprimido)`,
  )
}
writeFileSync(join(ATLAS, 'catalogo.json'), JSON.stringify(nuevo), 'utf8')
writeFileSync(join(ATLAS, 'ATRIBUCION.md'), atribucion(nuevo), 'utf8')
dicho(`Versión ${catalogo.version} → ${nuevo.version}; ${catalogo.triangulos.toLocaleString('es-CL')} → ${triangulos.toLocaleString('es-CL')} triángulos`)

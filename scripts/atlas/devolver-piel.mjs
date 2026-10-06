/**
 * Devuelve la piel al atlas (D-155), y solo la piel.
 *
 *   node scripts/atlas/devolver-piel.mjs [--aplicar]
 *
 * Sin `--aplicar` solo dice qué haría. Con él añade la pieza «Skin» (`FJ2810`)
 * al final de su paquete y la vuelve a anotar en `public/atlas/catalogo.json`,
 * con una versión de catálogo nueva, y rehace `ATRIBUCION.md`.
 *
 * De dónde sale: `quitar-piel.mjs` (D-138) la sacó del atlas ya preparado, y el
 * material de origen no está en ningún servidor. Pero el atlas se versiona, así
 * que la piel sigue entera en el historial de git, en el commit anterior a
 * aquel. Este guion la lee de ahí con `git show`, byte a byte: no se reconstruye
 * nada ni se vuelve a exportar desde Blender.
 *
 * Por qué al final del paquete y no en su sitio de antes: así las demás piezas
 * del paquete se quedan en el mismo desplazamiento y con los mismos bytes, y el
 * guion lo comprueba antes de escribir. Volver a intercalarla habría movido a
 * todas las que van detrás, y comprobar eso es comprobarlo todo.
 *
 * Las cejas, el pelo y el vello NO vuelven: se pidió la piel. Si algún día se
 * quieren, basta con añadir sus nombres a `VUELVEN`.
 *
 * Es idempotente: sobre un atlas que ya tiene la piel no hace nada.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { atribucion } from './atribucion.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DESTINO = join(RAIZ, 'public', 'atlas')

/** El último commit con la piel: el padre de 1e8342b, que la quitó (D-138). */
const CON_PIEL = '48dfed003f5f42aef1ddfb5ecdbfa9444f2270e4'

/** Por nombre original de BodyParts3D, igual que en `quitar-piel.mjs`. */
const VUELVEN = new Set(['Skin'])

const aplicar = process.argv.includes('--aplicar')

/** Un archivo tal como estaba en `CON_PIEL`, en bytes. */
function delHistorial(ruta) {
  return execFileSync(
    'git',
    // `safe.directory` por la línea de órdenes: en una carpeta cuyo dueño no es
    // quien ejecuta —la de faraday es de Administradores— git se niega a leer
    // el repositorio, y el mensaje no menciona permisos.
    ['-c', `safe.directory=${RAIZ.split(sep).join('/')}`, 'show', `${CON_PIEL}:${ruta}`],
    { cwd: RAIZ, maxBuffer: 256 * 1024 * 1024 },
  )
}

const catalogo = JSON.parse(readFileSync(join(DESTINO, 'catalogo.json'), 'utf8'))
const yaEstan = catalogo.piezas.filter((p) => VUELVEN.has(p.nombre))
if (yaEstan.length === VUELVEN.size) {
  console.log('El atlas ya tiene la piel. No hay nada que hacer.')
  process.exit(0)
}

const antiguo = JSON.parse(delHistorial('public/atlas/catalogo.json').toString('utf8'))
const devueltas = antiguo.piezas.filter((p) => VUELVEN.has(p.nombre) && !yaEstan.some((y) => y.id === p.id))
if (devueltas.length === 0) throw new Error(`En ${CON_PIEL} no hay ninguna pieza llamada ${[...VUELVEN].join(', ')}.`)
for (const p of devueltas) {
  if (catalogo.piezas.some((q) => q.id === p.id)) throw new Error(`El identificador ${p.id} ya existe en el atlas.`)
  console.log(`Vuelve  ${p.id.padEnd(8)} ${p.nombre.padEnd(8)} ${p.vertices} vértices, ${p.indices / 3} triángulos · paquete ${p.paquete}`)
}

if (!aplicar) {
  console.log('\nSin --aplicar no se escribe nada.')
  process.exit(0)
}

const alinear = (n) => (n + 3) & ~3
const porPaquete = new Map()
for (const p of devueltas) porPaquete.set(p.paquete, [...(porPaquete.get(p.paquete) ?? []), p])

const piezas = [...catalogo.piezas]
let triangulosDevueltos = 0
const paquetes = catalogo.paquetes.map((paquete, numero) => {
  const suyas = porPaquete.get(numero)
  if (!suyas) return paquete

  const actual = gunzipSync(readFileSync(join(DESTINO, paquete.archivo)))
  const viejo = gunzipSync(delHistorial(`public/atlas/${antiguo.paquetes[numero].archivo}`))

  let total = alinear(actual.byteLength)
  for (const p of suyas) {
    total = alinear(total) + p.vertices * 12
    total = alinear(total) + p.vertices * 6
    total = alinear(total) + p.indices * 4
  }
  const salida = Buffer.alloc(alinear(total))
  actual.copy(salida, 0)

  let cursor = alinear(actual.byteLength)
  for (const original of suyas) {
    const p = { ...original }
    cursor = alinear(cursor)
    viejo.copy(salida, cursor, original.pos, original.pos + p.vertices * 12)
    p.pos = cursor
    cursor += p.vertices * 12
    cursor = alinear(cursor)
    viejo.copy(salida, cursor, original.nor, original.nor + p.vertices * 6)
    p.nor = cursor
    cursor += p.vertices * 6
    cursor = alinear(cursor)
    viejo.copy(salida, cursor, original.idx, original.idx + p.indices * 4)
    p.idx = cursor
    cursor += p.indices * 4
    piezas.push(p)
    triangulosDevueltos += p.indices / 3
  }

  // Lo que ya estaba no se ha movido: los primeros bytes son los de antes.
  if (!salida.subarray(0, actual.byteLength).equals(actual)) {
    throw new Error(`${paquete.archivo}: el contenido anterior cambió al reescribirlo.`)
  }
  const comprimido = gzipSync(salida, { level: 9 })
  writeFileSync(join(DESTINO, paquete.archivo), comprimido)
  console.log(`  ${paquete.archivo}: ${(paquete.bytes / 1048576).toFixed(2)} → ${(salida.byteLength / 1048576).toFixed(2)} MB`)
  return { ...paquete, bytes: salida.byteLength, bytesComprimido: comprimido.byteLength }
})

// La misma cuenta de versión que `preparar.mjs` y `quitar-piel.mjs`: cambia la
// URL de los paquetes, servidos «immutable» un año, y ningún navegador mezcla
// los desplazamientos nuevos con la geometría de antes.
const nuevo = {
  ...catalogo,
  version: `bp3d-4.0-${createHash('sha1').update(JSON.stringify({ piezas, paquetes })).digest('hex').slice(0, 8)}`,
  triangulos: catalogo.triangulos + triangulosDevueltos,
  paquetes,
  piezas,
}
writeFileSync(join(DESTINO, 'catalogo.json'), JSON.stringify(nuevo), 'utf8')
writeFileSync(join(DESTINO, 'ATRIBUCION.md'), atribucion(nuevo), 'utf8')
console.log(`\nEscrito. ${piezas.length} piezas, versión ${nuevo.version}`)

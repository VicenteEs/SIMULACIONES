/**
 * Quita del atlas, de raíz, la piel y el pelo (D-138).
 *
 *   node scripts/atlas/quitar-piel.mjs [--aplicar]
 *
 * Sin `--aplicar` solo dice qué quitaría y cuánto pesa. Con él reescribe
 * `public/atlas/catalogo.json`, los paquetes `cuerpo-N.bin.gz` que contengan
 * alguna de esas piezas y `ATRIBUCION.md`, con una versión de catálogo nueva.
 *
 * Por qué se quitan y no se apagan: la piel es una cáscara de 23.000 vértices
 * que envuelve todo el cuerpo, con la caja envolvente más grande del atlas.
 * Entraba en cualquier marco de selección, tapaba cualquier corte y era lo
 * primero que había que apagar en cada preparación; y el pelo, las cejas y el
 * vello no enseñan traumatología. El dueño pidió que desaparecieran «para
 * siempre».
 *
 * Por qué un guion aparte y no una opción de `preparar.mjs`: el material de
 * origen (`.vendor/human-atlas`) no está en el servidor y los paquetes ya
 * preparados sí. Este guion trabaja sobre lo preparado, y es idempotente:
 * sobre un atlas sin piel no hace nada. El día que se regenere el atlas desde
 * el origen, hay que volver a pasarlo.
 *
 * Cómo se reescribe un paquete: cada pieza vive en él como tres bloques
 * seguidos (posiciones Float32, normales Int16, índices Uint32), señalados por
 * `pos`, `nor` e `idx` en bytes. Se copian los bloques de las piezas que
 * quedan, uno detrás de otro, y se les anotan los desplazamientos nuevos. Las
 * demás piezas del paquete no se tocan ni un byte: solo cambian de sitio.
 */

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { atribucion } from './atribucion.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DESTINO = join(RAIZ, 'public', 'atlas')

/** Por nombre original de BodyParts3D, que es la clave estable del catálogo. */
const SE_QUITAN = new Set(['Skin', 'Eyebrow', 'Hair of head', 'Pubic hair'])

const aplicar = process.argv.includes('--aplicar')

const catalogo = JSON.parse(readFileSync(join(DESTINO, 'catalogo.json'), 'utf8'))
const fuera = catalogo.piezas.filter((p) => SE_QUITAN.has(p.nombre))

if (fuera.length === 0) {
  console.log('El atlas ya no tiene piel ni pelo. No hay nada que hacer.')
  process.exit(0)
}

console.log(`Se quitan ${fuera.length} piezas:`)
for (const p of fuera) {
  console.log(`  ${p.id.padEnd(8)} ${p.nombre.padEnd(14)} ${String(p.vertices).padStart(6)} vértices · paquete ${p.paquete}`)
}
const paquetesTocados = [...new Set(fuera.map((p) => p.paquete))].sort((a, b) => a - b)
console.log(`Paquetes que se reescriben: ${paquetesTocados.join(', ')}`)

if (!aplicar) {
  console.log('\nSin --aplicar no se escribe nada.')
  process.exit(0)
}

const quedan = catalogo.piezas.filter((p) => !SE_QUITAN.has(p.nombre))
let triangulosQuitados = 0
for (const p of fuera) triangulosQuitados += p.indices / 3

const paquetes = catalogo.paquetes.map((paquete, numero) => {
  if (!paquetesTocados.includes(numero)) return paquete
  const bufer = gunzipSync(readFileSync(join(DESTINO, paquete.archivo)))
  const suyas = quedan.filter((p) => p.paquete === numero)
  // Cada bloque se alinea a 4 bytes, como en el original: `Float32Array` y
  // `Uint32Array` sobre un desplazamiento no múltiplo de 4 lanzan al cargar.
  const alinear = (n) => (n + 3) & ~3
  let total = 0
  for (const p of suyas) {
    total = alinear(total) + p.vertices * 12
    total = alinear(total) + p.vertices * 6
    total = alinear(total) + p.indices * 4
  }
  const salida = Buffer.alloc(alinear(total))
  let cursor = 0
  for (const p of suyas) {
    cursor = alinear(cursor)
    bufer.copy(salida, cursor, p.pos, p.pos + p.vertices * 12)
    p.pos = cursor
    cursor += p.vertices * 12
    cursor = alinear(cursor)
    bufer.copy(salida, cursor, p.nor, p.nor + p.vertices * 6)
    p.nor = cursor
    cursor += p.vertices * 6
    cursor = alinear(cursor)
    bufer.copy(salida, cursor, p.idx, p.idx + p.indices * 4)
    p.idx = cursor
    cursor += p.indices * 4
  }
  const comprimido = gzipSync(salida, { level: 9 })
  writeFileSync(join(DESTINO, paquete.archivo), comprimido)
  console.log(
    `  ${paquete.archivo}: ${(paquete.bytes / 1024 / 1024).toFixed(2)} → ${(salida.byteLength / 1024 / 1024).toFixed(2)} MB`,
  )
  return { ...paquete, bytes: salida.byteLength, bytesComprimido: comprimido.byteLength }
})

// La misma cuenta de versión que `preparar.mjs`: resume piezas y paquetes, para
// que cambie la URL de los paquetes y ningún navegador mezcle geometría vieja
// con desplazamientos nuevos.
const nuevo = {
  ...catalogo,
  version: `bp3d-4.0-${createHash('sha1')
    .update(JSON.stringify({ piezas: quedan, paquetes }))
    .digest('hex')
    .slice(0, 8)}`,
  triangulos: catalogo.triangulos - triangulosQuitados,
  paquetes,
  piezas: quedan,
}
writeFileSync(join(DESTINO, 'catalogo.json'), JSON.stringify(nuevo), 'utf8')
writeFileSync(join(DESTINO, 'ATRIBUCION.md'), atribucion(nuevo), 'utf8')

console.log(`\nEscrito. ${quedan.length} piezas, versión ${nuevo.version}`)

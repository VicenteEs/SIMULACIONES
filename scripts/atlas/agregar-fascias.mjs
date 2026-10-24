/**
 * Pone las fascias generadas en el atlas (P-006), y solo las fascias.
 *
 *   node scripts/atlas/agregar-fascias.mjs              # dice qué haría
 *   node scripts/atlas/agregar-fascias.mjs --aplicar    # lo escribe
 *
 * Lee lo que dejó `python scripts/atlas/fascias/generar.py` en `scripts/atlas/fascias/salida/`
 * (`manifiesto.json` y `piezas/*.bin`), escribe el paquete `public/atlas/cuerpo-15.bin.gz`,
 * anota las piezas y los cuatro sistemas de fascia en `public/atlas/catalogo.json` con una
 * versión de catálogo nueva, y rehace `ATRIBUCION.md`.
 *
 * Es el hermano de `devolver-piel.mjs` y hace lo mismo por lo mismo: **no toca los quince
 * paquetes de BodyParts3D**. Lo comprueba antes de escribir, por su contenido y no por su
 * tamaño: si la huella de alguno cambiara, no escribe nada. Las piezas de BodyParts3D conservan su
 * lugar en el catálogo (las fascias van al final), que es el número de píxel que cada una tiene en
 * las texturas del visor.
 *
 * Es idempotente y sustituye: cada pasada reescribe el paquete 15 entero con lo que hay en el
 * manifiesto, así que quitar una pieza de las recetas la quita del atlas. Con los mismos datos,
 * el resultado es el mismo archivo, byte a byte.
 *
 * **Regenerar el atlas con `preparar.mjs` borra las fascias**: parte del material de origen y no
 * las conoce. Después hay que volver a pasar este guion; `preparar.mjs` lo recuerda al terminar.
 *
 * Opciones: `--salida <carpeta>` y `--atlas <carpeta>` (para probar sobre una copia).
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { atribucion, leerTraducciones } from './atribucion.mjs'
import {
  ARCHIVO_DEL_PAQUETE,
  NUMERO_DEL_PAQUETE,
  SISTEMAS_DE_FASCIA,
  catalogoConFascias,
  construirPaquete,
  esGenerada,
} from './fascias/empaquetar.mjs'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const opcion = (nombre, porOmision) => {
  const i = process.argv.indexOf(nombre)
  return i >= 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : porOmision
}
const aplicar = process.argv.includes('--aplicar')
const SALIDA = opcion('--salida', join(RAIZ, 'scripts', 'atlas', 'fascias', 'salida'))
const ATLAS = opcion('--atlas', join(RAIZ, 'public', 'atlas'))

const huella = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fallar = (mensaje) => {
  console.error(`\n${mensaje}`)
  process.exit(1)
}

// --- lo generado ----------------------------------------------------------
if (!existsSync(join(SALIDA, 'manifiesto.json'))) {
  fallar(`No hay nada generado en ${SALIDA}.\nEjecute antes: python scripts/atlas/fascias/generar.py`)
}
const manifiesto = JSON.parse(readFileSync(join(SALIDA, 'manifiesto.json'), 'utf8'))
const registros = manifiesto.piezas
const datos = new Map(registros.map((r) => [r.id, readFileSync(join(SALIDA, 'piezas', `${r.id}.bin`))]))

// --- lo que se exige a cada pieza antes de dejarla entrar ----------------
const traducciones = leerTraducciones()
const sistemasValidos = new Set(SISTEMAS_DE_FASCIA.map((s) => s.id))
const problemas = []
for (const r of registros) {
  if (!/^TH\d{4}M?$/.test(r.id)) problemas.push(`${r.id}: el identificador no es TH#### ni TH####M`)
  if (!sistemasValidos.has(r.sistema)) problemas.push(`${r.id}: «${r.sistema}» no es un sistema de fascia`)
  if (!/^FMA\d+$/.test(r.fma)) problemas.push(`${r.id}: el código FMA «${r.fma}» no tiene la forma FMA + cifras`)
  if (!Object.prototype.hasOwnProperty.call(traducciones, r.nombre)) {
    problemas.push(`${r.id}: «${r.nombre}» no tiene traducción en src/atlas/nombres-es.json`)
  }
  if ((r.avisos ?? []).some((a) => /dentro de lo envuelto|a más de 3 cm|dentro del cerebro|toca el hueso|pegada a la capa/.test(a))) {
    problemas.push(`${r.id}: la comprobación de la geometría dio avisos: ${r.avisos.join('; ')}`)
  }
}
if (problemas.length) fallar(`No se escribe nada. ${problemas.length} problema(s):\n  - ${problemas.join('\n  - ')}`)

// --- el catálogo y los quince paquetes de siempre -------------------------
const rutaCatalogo = join(ATLAS, 'catalogo.json')
const catalogo = JSON.parse(readFileSync(rutaCatalogo, 'utf8'))
const antes = catalogo.paquetes.slice(0, NUMERO_DEL_PAQUETE).map((p) => huella(readFileSync(join(ATLAS, p.archivo))))

const { buffer, colocadas } = construirPaquete(registros, datos)
const comprimido = gzipSync(buffer, { level: 9 })
const nuevo = catalogoConFascias(catalogo, registros, colocadas, {
  archivo: ARCHIVO_DEL_PAQUETE,
  bytesComprimido: comprimido.byteLength,
  bytes: buffer.byteLength,
})

const generadas = nuevo.piezas.filter(esGenerada)
const porSistema = new Map()
for (const p of generadas) porSistema.set(p.sistema, (porSistema.get(p.sistema) ?? 0) + 1)
console.log(`Fascias: ${generadas.length} piezas, ${generadas.reduce((t, p) => t + p.indices / 3, 0).toLocaleString('es-CL')} triángulos`)
for (const [sistema, cuantas] of porSistema) console.log(`  ${sistema.padEnd(20)} ${cuantas}`)
console.log(`Paquete ${NUMERO_DEL_PAQUETE}: ${(buffer.byteLength / 1048576).toFixed(2)} MB → ${(comprimido.byteLength / 1048576).toFixed(2)} MB comprimido`)
console.log(`Versión del catálogo: ${catalogo.version} → ${nuevo.version}`)

if (!aplicar) {
  console.log('\nSin --aplicar no se escribe nada.')
  process.exit(0)
}

writeFileSync(join(ATLAS, ARCHIVO_DEL_PAQUETE), comprimido)
writeFileSync(rutaCatalogo, JSON.stringify(nuevo), 'utf8')
writeFileSync(join(ATLAS, 'ATRIBUCION.md'), atribucion(nuevo), 'utf8')

// Los quince de origen no se han tocado: se comprueba al final, que es cuando importa.
const despues = nuevo.paquetes.slice(0, NUMERO_DEL_PAQUETE).map((p) => huella(readFileSync(join(ATLAS, p.archivo))))
if (antes.some((h, i) => h !== despues[i])) {
  fallar('Un paquete de BodyParts3D cambió mientras se escribían las fascias. Restáurelo con git antes de seguir.')
}
console.log(`\nEscrito. ${nuevo.piezas.length} piezas, versión ${nuevo.version}. Los ${NUMERO_DEL_PAQUETE} paquetes de BodyParts3D siguen idénticos.`)

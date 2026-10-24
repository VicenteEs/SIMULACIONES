/**
 * Exporta una pierna cortada con un marco, como lo haría el taller, y escribe el `.glb` (P-006, E3).
 *
 *   npx tsx scripts/atlas/fascias/exportar-zona-de-prueba.ts [salida.glb]
 *
 * Sirve para ver, sin base de datos y sin abrir el taller, qué le pasa a la fascia cuando se exporta una
 * pierna **cortada**: monta una preparación con todo lo del miembro inferior derecho bajo la rodilla,
 * le hace el corte de un marco (cuatro planos, como `recorte.ts`: las piezas que los cruzan se parten y
 * lo de fuera queda apagado) y pasa por el mismo camino que la exportación de verdad —reproducir la
 * preparación, sumar las fascias de la zona, agrupar, recortar la piel, centrar—. La salida es lo que
 * recibiría la consola.
 *
 * No toca la base de datos ni `public/atlas/`: lee el atlas y escribe un archivo donde se le diga.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { corregirCatalogo } from '../../../src/atlas/clasificacion'
import type { CatalogoDelAtlas, ContenidoDeInstancia, CorteDePieza, PiezaDelAtlas } from '../../../src/atlas/formato'
import { nombreEnEspanol } from '../../../src/atlas/nombres'
import { prepararExportacion, type PiezaLeida } from '../../../src/lib/exportarAtlas'
import { fasciasDeLaZona } from '../../../src/lib/fasciasDeLaZona'
import { escribirGlb } from '../../../src/lib/glb'
import { reproducirPreparacion } from '../../../src/lib/reproducirPreparacion'

const ATLAS = join(process.cwd(), 'public', 'atlas')
const salida = process.argv[2] ?? join(process.cwd(), 'scripts', 'atlas', 'fascias', 'salida', 'pierna_cortada.glb')

const catalogo = corregirCatalogo(JSON.parse(readFileSync(join(ATLAS, 'catalogo.json'), 'utf8')) as CatalogoDelAtlas)
const paquetes = new Map<number, ArrayBuffer>()
const leer = (p: PiezaDelAtlas): PiezaLeida => {
  if (!paquetes.has(p.paquete)) {
    const b = gunzipSync(readFileSync(join(ATLAS, catalogo.paquetes[p.paquete].archivo)))
    paquetes.set(p.paquete, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer)
  }
  const buf = paquetes.get(p.paquete)!
  return {
    id: p.id,
    nombre: p.nombre,
    sistema: p.sistema,
    fma: p.fma,
    posiciones: new Float32Array(new Float32Array(buf, p.pos, p.vertices * 3)),
    normales: new Int16Array(new Int16Array(buf, p.nor, p.vertices * 3)),
    indices: new Uint32Array(new Uint32Array(buf, p.idx, p.indices)),
  }
}

// El marco: un tramo de la pierna, de y = 0,12 a y = 0,40, y de x = −0,20 a x = −0,02. Las normales hacia dentro.
const MARCO = [
  { punto: [0, 0.4, 0] as [number, number, number], normal: [0, -1, 0] as [number, number, number] },
  { punto: [0, 0.12, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number] },
  { punto: [-0.2, 0, 0] as [number, number, number], normal: [1, 0, 0] as [number, number, number] },
  { punto: [-0.02, 0, 0] as [number, number, number], normal: [-1, 0, 0] as [number, number, number] },
]
const fuera = (p: PiezaDelAtlas, plano: (typeof MARCO)[number]) => {
  // Entera por fuera de un plano: sus ocho esquinas del lado malo.
  let dentro = 0
  for (const x of [p.caja[0][0], p.caja[1][0]])
    for (const y of [p.caja[0][1], p.caja[1][1]])
      for (const z of [p.caja[0][2], p.caja[1][2]])
        if ((x - plano.punto[0]) * plano.normal[0] + (y - plano.punto[1]) * plano.normal[1] + (z - plano.punto[2]) * plano.normal[2] >= 0) dentro += 1
  return { dentro: dentro === 8, fuera: dentro === 0 }
}

const delaPierna = catalogo.piezas.filter(
  (p) =>
    (['miembro-inferior-derecho', 'pie-derecho'].includes(p.region) && ['muscular', 'skeletal', 'connective'].includes(p.sistema) && p.caja[1][1] < 0.56) ||
    p.nombre === 'Skin',
)

const piezas: { id: string }[] = []
const cortes: CorteDePieza[] = []
const apagados: string[] = []
for (const p of delaPierna) {
  const lados = MARCO.map((plano) => fuera(p, plano))
  if (lados.some((l) => l.fuera)) continue
  piezas.push({ id: p.id })
  const cruzan = MARCO.filter((_, k) => !lados[k].dentro)
  if (cruzan.length === 0) continue
  const [primero, ...resto] = cruzan
  cortes.push({ pieza: p.id, punto: primero.punto, normal: primero.normal, ...(resto.length ? { otrosPlanos: resto } : {}) })
  apagados.push(`${p.id}#b`)
}
console.log(`Preparación: ${piezas.length} piezas, ${cortes.length} cortadas por el marco.`)

const contenido: Partial<ContenidoDeInstancia> = { version: 1, piezas, cortes, apagados } as never
const ids = new Set(piezas.map((p) => p.id))
const leidas = catalogo.piezas.filter((p) => ids.has(p.id)).map(leer)
const rehecha = reproducirPreparacion(contenido, leidas)
for (const a of rehecha.avisos) console.log('  aviso:', a)

const deFascia = fasciasDeLaZona({
  catalogo,
  piezas: rehecha.piezas,
  cortes,
  apagados: new Set(apagados),
  leer,
})
for (const n of deFascia.notas) console.log('  fascia ·', n)

const colores = Object.fromEntries(catalogo.sistemas.map((s) => [s.id, s.color]))
const nombresDeSistema = Object.fromEntries(catalogo.sistemas.map((s) => [s.id, s.nombre]))
const { objetos, piezas: archivo, centro } = prepararExportacion([...rehecha.piezas, ...deFascia.piezas], { colores, nombresDeSistema })
const glb = escribirGlb(objetos, 'TraumaHub · pierna cortada de prueba')
writeFileSync(salida, glb)
console.log(`\n${objetos.length} objetos, ${(glb.byteLength / 1024 / 1024).toFixed(2)} MB → ${salida}`)
console.log('Centro restado (m):', centro.map((v) => v.toFixed(4)).join(', '))
for (const a of archivo) console.log(`  ${a.nodo.padEnd(28)} ${a.rol.padEnd(9)} ${nombreEnEspanol(a.etiqueta)}`)

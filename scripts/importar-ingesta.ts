/**
 * Importa a la plataforma las fichas de `data_traumahub/listos` (D-144).
 *
 *   npx tsx scripts/importar-ingesta.ts                      # solo comprueba, no escribe
 *   npx tsx scripts/importar-ingesta.ts --ejecutar           # importa
 *   npx tsx scripts/importar-ingesta.ts --ejecutar --crear-segmentos "Columna;Brazo"
 *
 * Opciones: `--carpeta <ruta>` (por omisión `data_traumahub/listos`),
 * `--modulo <módulo>`, `--limite <n>` (las primeras n fichas, para ensayar),
 * `--concurrencia <n>` (fichas a la vez; por omisión 4), `--control <carpeta>`
(dónde se anota lo importado; por omisión `<carpeta>/control`).
 *
 * **Sin `--ejecutar` no escribe nada**: lee los archivos, resuelve los
 * catálogos contra la base y revisa cada ficha y cada imagen, y dice qué haría.
 * Es la pasada que conviene hacer siempre antes.
 *
 * Qué hace con cada ficha, en este orden:
 * 1. la convierte con `convertirSobre` (Markdown → Lexical, bloques, catálogos);
 * 2. sube sus imágenes a `medios` y las añade al final de una pestaña como
 *    bloques `imagen` con el pie «AÑADIR MANUALMENTE»: las figuras las extrajo
 *    `_trabajo/extraer_imagenes.py` sin saber a qué párrafo corresponden, así que
 *    el revisor las coloca y las describe. Nada más del JSON se toca;
 * 3. crea la ficha como **borrador** y la mete en revisión, con su libro, su
 *    capítulo, su lote, las notas del modelo y la versión original.
 *
 * Es reanudable: cada ficha terminada queda en `listos/control/importadas.jsonl`
 * y una segunda pasada salta las que ya están. Si una ficha falla a medias se
 * borra lo que alcanzó a crear —ficha e imágenes— y el error queda en
 * `listos/control/importacion-errores.jsonl`; las demás siguen.
 *
 * Las cirugías no se importan (no hay ninguna, y dependen del modelo 3D).
 * Un segmento que falte en el catálogo detiene todo **antes de escribir**,
 * salvo los que se nombren en `--crear-segmentos`: crearlos sobre la marcha sin
 * esa lista llenaría el catálogo de variantes (ver `CATALOGOS_DE_INGESTA`).
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

// tsx no carga .env como hace Next.js: ver `scripts/contenido-de-demostracion.ts`.
const archivoEnv = resolve(process.cwd(), '.env')
if (existsSync(archivoEnv)) process.loadEnvFile(archivoEnv)
// Ningún aviso por correo mientras se importan miles de fichas (O-062).
process.env.SMTP_HOST = ''

// ----------------------------------------------------------------- argumentos

const args = process.argv.slice(2)
const opcion = (nombre: string): string | undefined => {
  const i = args.indexOf(`--${nombre}`)
  return i >= 0 ? args[i + 1] : undefined
}
const EJECUTAR = args.includes('--ejecutar')
const CARPETA = resolve(opcion('carpeta') ?? 'data_traumahub/listos')
const SOLO_MODULO = opcion('modulo')
const LIMITE = opcion('limite') ? Number(opcion('limite')) : Infinity
const CONCURRENCIA = Math.max(1, Number(opcion('concurrencia') ?? 4))
const SEGMENTOS_A_CREAR = (opcion('crear-segmentos') ?? '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean)

/** Lo que dice el pie de toda imagen importada. Lo pidió el dueño tal cual. */
const PIE_DE_LA_IMAGEN = 'AÑADIR MANUALMENTE'

/**
 * Miles de escrituras iguales no quieren miles de anotaciones en el registro de
 * acciones (D-145): se silencian y al final se anota una que las resume.
 */
const SIN_REGISTRO = { sinRegistro: true }

/** La pestaña donde se añaden las imágenes de cada módulo. */
const PESTANA_DE_LAS_IMAGENES: Record<string, string> = {
  patologias: 'definicion',
  maniobras: 'contenido',
  'casos-ao': 'contenido',
  'estudios-ia': 'contenido',
}

const TECHO_DE_IMAGEN_BYTES = 50 * 1024 * 1024
const FORMATOS_ADMITIDOS = new Set(['png', 'jpeg'])

type Payload = Awaited<ReturnType<typeof import('payload').getPayload>>
type Sobre = { modulo: string; clave: string; ruta: string; json: unknown }

const hacer = (mensaje: string) => console.log(mensaje)

/** «p10-2» → [10, 2]: el orden en que aparecen las figuras en el libro. */
const ordenDeImagen = (nombre: string): [number, number] => {
  const m = /-p(\d+)-(\d+)\.[a-z]+$/i.exec(nombre)
  return m ? [Number(m[1]), Number(m[2])] : [Number.MAX_SAFE_INTEGER, 0]
}

async function main() {
  const { getPayload } = await import('payload')
  const config = (await import('../src/payload.config')).default
  const { convertirSobre, claveDeCatalogo } = await import('../src/ingesta/convertir')
  const { CATALOGOS_DE_INGESTA, MODULOS_DE_INGESTA } = await import('../src/ingesta/formato')
  const { registrarParaRevision } = await import('../src/lib/revisionServidor')
  const { default: sharp } = await import('sharp')

  const destino = (() => {
    try {
      const u = new URL(process.env.DATABASE_URI ?? '')
      return `${u.hostname}:${u.port || 5432}${u.pathname}`
    } catch {
      return '(DATABASE_URI no válida)'
    }
  })()
  hacer(`Base de datos: ${destino}`)
  hacer(EJECUTAR ? 'Modo: IMPORTAR (escribe)' : 'Modo: comprobación (no escribe nada)')

  const payload: Payload = await getPayload({ config })

  // ------------------------------------------------------------ leer archivos
  const carpetaFichas = join(CARPETA, 'fichas')
  // `--control` separa el registro de lo importado: un ensayo contra otra base
  // no puede dar por hechas las fichas de la base de verdad.
  const control = resolve(opcion('control') ?? join(CARPETA, 'control'))
  const archivoImportadas = join(control, 'importadas.jsonl')
  const archivoErrores = join(control, 'importacion-errores.jsonl')

  const sobres: Sobre[] = []
  const ilegibles: string[] = []
  for (const modulo of readdirSync(carpetaFichas)) {
    if (SOLO_MODULO && modulo !== SOLO_MODULO) continue
    if (!(MODULOS_DE_INGESTA as readonly string[]).includes(modulo) || modulo === 'cirugias') continue
    for (const archivo of readdirSync(join(carpetaFichas, modulo)).sort()) {
      if (!archivo.endsWith('.json')) continue
      const ruta = join(carpetaFichas, modulo, archivo)
      try {
        sobres.push({ modulo, clave: archivo.replace(/\.json$/, ''), ruta, json: JSON.parse(readFileSync(ruta, 'utf8')) })
      } catch (e) {
        ilegibles.push(`${modulo}/${archivo}: ${(e as Error).message}`)
      }
    }
  }
  hacer(`Fichas leídas: ${sobres.length}${ilegibles.length ? ` (${ilegibles.length} ilegibles)` : ''}`)
  for (const i of ilegibles) hacer(`  ILEGIBLE ${i}`)

  // Las ya importadas en una pasada anterior.
  const yaImportadas = new Set<string>()
  if (existsSync(archivoImportadas)) {
    for (const linea of readFileSync(archivoImportadas, 'utf8').split('\n')) {
      if (!linea.trim()) continue
      const { modulo, clave } = JSON.parse(linea) as { modulo: string; clave: string }
      yaImportadas.add(`${modulo}/${clave}`)
    }
  }

  // ---------------------------------------------------------------- catálogos
  const ids = new Map<string, string | number>()
  for (const [slug, { campo }] of Object.entries(CATALOGOS_DE_INGESTA)) {
    const { docs } = await payload.find({ collection: slug as never, limit: 0, pagination: false, depth: 0, overrideAccess: true })
    for (const d of docs as unknown as Record<string, unknown>[]) {
      const valor = d[campo]
      if (typeof valor === 'string') ids.set(claveDeCatalogo(slug, valor.trim()), d.id as string | number)
    }
  }

  // ------------------------------------------------------------ convertir todo
  const pendientes = sobres.filter((s) => !yaImportadas.has(`${s.modulo}/${s.clave}`)).slice(0, LIMITE)
  hacer(`Ya importadas: ${sobres.length - sobres.filter((s) => !yaImportadas.has(`${s.modulo}/${s.clave}`)).length}. Por importar: ${pendientes.length}`)

  const convertidas = pendientes.map((s) => ({ s, r: convertirSobre(s.json, ids, s.clave) }))
  // El módulo del sobre tiene que ser el de su carpeta: lo dice el sobre y lo
  // dice la ruta, y si no coinciden alguien movió el archivo.
  for (const { s, r } of convertidas) {
    if (r.errores.length === 0 && r.modulo !== s.modulo) r.errores.push(`El sobre dice «${r.modulo}» y está en la carpeta «${s.modulo}».`)
  }

  const faltan = new Map<string, Set<string>>()
  for (const { r } of convertidas) for (const f of r.faltanEnCatalogo) {
    if (!faltan.has(f.catalogo)) faltan.set(f.catalogo, new Set())
    faltan.get(f.catalogo)!.add(f.valor)
  }
  const sinPermiso: string[] = []
  const aCrear: string[] = []
  for (const [catalogo, valores] of faltan) {
    for (const v of valores) {
      if (catalogo === 'segmentos' && SEGMENTOS_A_CREAR.includes(v)) aCrear.push(v)
      else sinPermiso.push(`${catalogo}: ${v}`)
    }
  }
  if (sinPermiso.length > 0) {
    hacer('\nFaltan en el catálogo y nadie autorizó crearlos:')
    for (const f of sinPermiso) hacer(`  - ${f}`)
    hacer('Nada se ha escrito. Cree esas entradas en el panel, o autorice los segmentos con --crear-segmentos.')
    process.exit(1)
  }
  if (aCrear.length > 0) {
    hacer(`\nSegmentos que se crearían: ${aCrear.join(', ')}`)
    if (!EJECUTAR) {
      // En seco se dan por creados, para que el resto de la comprobación corra
      // como correría de verdad.
      aCrear.forEach((nombre, i) => ids.set(claveDeCatalogo('segmentos', nombre), `simulado-${i}`))
      for (const c of convertidas) {
        if (c.r.faltanEnCatalogo.length > 0) c.r = convertirSobre(c.s.json, ids, c.s.clave)
      }
    } else {
      const mayor = Math.max(0, ...(await payload.find({ collection: 'segmentos', limit: 0, pagination: false, depth: 0, overrideAccess: true })).docs.map((d) => Number((d as { orden?: number }).orden ?? 0)))
      let orden = mayor
      for (const nombre of aCrear) {
        orden += 10
        const creado = await payload.create({ collection: 'segmentos', data: { nombre, orden } as never, overrideAccess: true, context: SIN_REGISTRO })
        ids.set(claveDeCatalogo('segmentos', nombre), (creado as { id: string | number }).id)
      }
      // Con los catálogos completos, se vuelve a convertir lo que fallaba por ellos.
      for (const c of convertidas) {
        if (c.r.faltanEnCatalogo.length > 0) c.r = convertirSobre(c.s.json, ids, c.s.clave)
      }
    }
  }

  // ---------------------------------------------------------------- imágenes
  const carpetaImagenes = join(CARPETA, 'imagenes-por-tema')
  type Figura = { archivo: string; ruta: string }
  const figuras = new Map<string, Figura[]>()
  const imagenesRechazadas: string[] = []
  let imagenesValidas = 0
  for (const { s, r } of convertidas) {
    if (r.errores.length > 0) continue
    const dir = join(carpetaImagenes, s.modulo, s.clave)
    if (!existsSync(dir)) continue
    const lista: Figura[] = []
    const nombres = readdirSync(dir).sort((a, b) => {
      const [pa, ia] = ordenDeImagen(a)
      const [pb, ib] = ordenDeImagen(b)
      return pa - pb || ia - ib || a.localeCompare(b)
    })
    for (const archivo of nombres) {
      const ruta = join(dir, archivo)
      const donde = `${s.modulo}/${s.clave}/${archivo}`
      try {
        const tam = statSync(ruta).size
        if (tam === 0) throw new Error('el archivo está vacío')
        if (tam > TECHO_DE_IMAGEN_BYTES) throw new Error('pasa de 50 MB')
        const meta = await sharp(ruta).metadata()
        if (!meta.format || !FORMATOS_ADMITIDOS.has(meta.format)) throw new Error(`formato «${meta.format}» no admitido`)
        if (!meta.width || !meta.height) throw new Error('sin dimensiones')
        lista.push({ archivo, ruta })
        imagenesValidas++
      } catch (e) {
        imagenesRechazadas.push(`${donde}: ${(e as Error).message}`)
      }
    }
    if (lista.length > 0) figuras.set(`${s.modulo}/${s.clave}`, lista)
  }

  // ---------------------------------------------------------------- informe
  const conErrores = convertidas.filter(({ r }) => r.errores.length > 0)
  const limpias = convertidas.filter(({ r }) => r.errores.length === 0)
  const avisos = convertidas.reduce((n, { r }) => n + r.avisos.length, 0)
  hacer('\n── Informe ──')
  hacer(`Fichas que se importarían: ${limpias.length}`)
  hacer(`Fichas con errores (no se importan): ${conErrores.length}`)
  for (const { s, r } of conErrores.slice(0, 40)) hacer(`  ✗ ${s.modulo}/${s.clave}: ${r.errores.join(' | ').slice(0, 300)}`)
  hacer(`Avisos: ${avisos}`)
  hacer(`Imágenes válidas: ${imagenesValidas} en ${figuras.size} fichas · rechazadas: ${imagenesRechazadas.length}`)
  for (const i of imagenesRechazadas.slice(0, 40)) hacer(`  ✗ ${i}`)

  if (!EJECUTAR) {
    hacer('\nNo se ha escrito nada. Para importar, repita con --ejecutar.')
    process.exit(conErrores.length > 0 || imagenesRechazadas.length > 0 ? 2 : 0)
  }

  // ----------------------------------------------------------------- escribir
  mkdirSync(control, { recursive: true })
  let hechas = 0
  let falladas = 0
  let imagenesSubidas = 0
  const inicio = Date.now()

  async function importar({ s, r }: (typeof limpias)[number]) {
    const creadas: { coleccion: string; id: string | number }[] = []
    try {
      const documento = { ...r.documento } as Record<string, unknown>
      const lista = figuras.get(`${s.modulo}/${s.clave}`) ?? []
      const mediosIds: (string | number)[] = []
      if (lista.length > 0) {
        const pestana = PESTANA_DE_LAS_IMAGENES[s.modulo]
        const existentes = Array.isArray(documento[pestana]) ? (documento[pestana] as unknown[]) : []
        const bloques: unknown[] = []
        for (const figura of lista) {
          const medio = await payload.create({
            collection: 'medios',
            data: {
              alt: `Figura extraída del libro, pendiente de describir (${figura.archivo})`.slice(0, 250),
            } as never,
            filePath: figura.ruta,
            overrideAccess: true,
            context: SIN_REGISTRO,
          })
          const id = (medio as { id: string | number }).id
          creadas.push({ coleccion: 'medios', id })
          mediosIds.push(id)
          bloques.push({ blockType: 'imagen', imagen: id, pie: PIE_DE_LA_IMAGEN, ancho: 'completo' })
        }
        documento[pestana] = [...existentes, ...bloques]
        imagenesSubidas += lista.length
      }

      const guardado = await payload.create({
        collection: s.modulo as never,
        data: { ...documento, _status: 'draft' } as never,
        draft: true,
        overrideAccess: true,
        context: SIN_REGISTRO,
      })
      const documentoId = String((guardado as { id: unknown }).id)
      creadas.push({ coleccion: s.modulo, id: documentoId })

      const revision = await registrarParaRevision(payload, {
        coleccion: s.modulo,
        documentoId,
        usuarioId: null,
        ...r.procedencia,
        notasParaElRevisor: r.notasParaElRevisor,
      })
      appendFileSync(
        archivoImportadas,
        `${JSON.stringify({ modulo: s.modulo, clave: s.clave, id: documentoId, revision: revision.id, medios: mediosIds, fecha: new Date().toISOString() })}\n`,
      )
      hechas++
    } catch (e) {
      falladas++
      // Se deshace lo que alcanzó a crearse, en orden inverso: la ficha antes
      // que las imágenes que referencia.
      for (const c of creadas.reverse()) {
        await payload.delete({ collection: c.coleccion as never, id: c.id, overrideAccess: true, context: SIN_REGISTRO }).catch(() => undefined)
      }
      appendFileSync(archivoErrores, `${JSON.stringify({ modulo: s.modulo, clave: s.clave, error: (e as Error).message, fecha: new Date().toISOString() })}\n`)
      hacer(`  ✗ ${s.modulo}/${s.clave}: ${(e as Error).message.slice(0, 200)}`)
    }
    const total = hechas + falladas
    if (total % 50 === 0) {
      const seg = (Date.now() - inicio) / 1000
      hacer(`  ${total}/${limpias.length} · ${hechas} bien, ${falladas} fallaron · ${imagenesSubidas} imágenes · ${Math.round(seg)} s`)
    }
  }

  // Un reparto simple entre `CONCURRENCIA` trabajadores que toman la siguiente.
  let siguiente = 0
  await Promise.all(
    Array.from({ length: CONCURRENCIA }, async () => {
      while (siguiente < limpias.length) await importar(limpias[siguiente++])
    }),
  )

  const { registrarAccion } = await import('../src/lib/registroServidor')
  await registrarAccion(payload, {
    accion: 'importacion',
    origen: 'importador',
    coleccion: 'ingesta',
    detalle: `${hechas} fichas importadas, ${falladas} fallaron, ${imagenesSubidas} imágenes (lote ${[...new Set(limpias.map(({ r }) => r.procedencia.lote))].join(', ')}).`,
  })

  hacer(`\nTerminado en ${Math.round((Date.now() - inicio) / 1000)} s: ${hechas} fichas importadas, ${falladas} fallaron, ${imagenesSubidas} imágenes.`)
  process.exit(falladas > 0 || conErrores.length > 0 ? 2 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

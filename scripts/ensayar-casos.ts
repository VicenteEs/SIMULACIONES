/**
 * El ensayo de los casos del simulador (D-373, E3 de P-016).
 *
 * Abre cada caso guardado como lo abre la consola, mira el archivo de su modelo
 * y vuelve a calificar su resolución de referencia, todo con el código de este
 * árbol. Sale con 1 si hay algún error: un caso que este código ya no sabe leer,
 * o una referencia cuya nota cambió sin que el caso cambiara. Lo que es de
 * contenido sale como aviso y no cambia la salida (`src/lib/ensayoDeLosCasos.ts`
 * explica la diferencia).
 *
 * No se lanza a mano contra la base de verdad: lo lanza `scripts/ensayar-casos.sh`
 * contra una copia sin datos personales, con `NODE_ENV=production` para que
 * Payload aplique antes las migraciones pendientes, que es la otra mitad de lo
 * que se ensaya. Contra la base de desarrollo no migra (Payload solo lo hace en
 * producción) y se limita a leer.
 *
 *   DATABASE_URI=… PAYLOAD_SECRET=… npx tsx scripts/ensayar-casos.ts
 *   npx tsx scripts/ensayar-casos.ts --tablas-sin-copiar
 *
 * No lee el `.env`, a diferencia de los otros guiones: en el portátil apunta a
 * la base con la que se trabaja, y un ensayo que migrara esa base por olvidar
 * una variable sería justo lo que este guion existe para evitar.
 *
 * Los archivos de los modelos se buscan en `medios/modelos`, o en
 * `$DIRECTORIO_DE_MEDIOS/modelos` si está puesta.
 */
import { open } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import {
  ensayarUnCaso,
  informeDelEnsayo,
  nodosDelGlb,
  tablasSinCopiar,
  type ModeloEnsayado,
} from '../src/lib/ensayoDeLosCasos'

/** Lo más que se lee del JSON de un `.glb`: de sobra para la escena, y un techo ante un archivo raro. */
const MAXIMO_DEL_JSON = 64 * 1024 * 1024

/** La cabecera y el bloque JSON de un `.glb`, sin leer la geometría; `undefined` si el archivo no está. */
async function cabeceraDelGlb(ruta: string): Promise<Uint8Array | null | undefined> {
  let archivo
  try {
    archivo = await open(ruta, 'r')
  } catch {
    return undefined
  }
  try {
    const cabecera = new Uint8Array(20)
    const { bytesRead } = await archivo.read(cabecera, 0, 20, 0)
    if (bytesRead < 20) return null
    const largo = new DataView(cabecera.buffer).getUint32(12, true)
    if (largo > MAXIMO_DEL_JSON) return null
    const todo = new Uint8Array(20 + largo)
    todo.set(cabecera)
    await archivo.read(todo, 20, largo, 20)
    return todo
  } finally {
    await archivo.close()
  }
}

const idDe = (valor: unknown): string | null => {
  if (typeof valor === 'number' || (typeof valor === 'string' && valor)) return String(valor)
  if (valor && typeof valor === 'object' && 'id' in valor) return idDe((valor as { id: unknown }).id)
  return null
}

async function main() {
  if (process.argv.includes('--tablas-sin-copiar')) {
    for (const patron of tablasSinCopiar()) console.log(patron)
    return 0
  }
  if (!process.env.DATABASE_URI) {
    console.error('Falta DATABASE_URI. Este guion no lee el .env: diga a qué base se ensaya.')
    return 2
  }

  const inicio = Date.now()
  const { getPayload } = await import('payload')
  const config = (await import('@payload-config')).default
  const payload = await getPayload({ config })

  const [casos, referencias, modelos] = await Promise.all([
    payload.find({ collection: 'cirugias', pagination: false, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'resoluciones-de-referencia', pagination: false, depth: 0, overrideAccess: true }),
    payload.find({ collection: 'modelos-3d', pagination: false, depth: 0, overrideAccess: true, select: { filename: true } }),
  ])
  const archivoDelModelo = new Map(
    (modelos.docs as unknown as Array<{ id: unknown; filename?: unknown }>).map((m) => [
      String(m.id),
      typeof m.filename === 'string' ? basename(m.filename) : '',
    ]),
  )
  const referenciaDelCaso = new Map<string, Record<string, unknown>>()
  for (const r of referencias.docs as unknown as Array<Record<string, unknown>>) {
    const caso = idDe(r.cirugia)
    if (caso) referenciaDelCaso.set(caso, r)
  }
  const directorio = resolve(process.env.DIRECTORIO_DE_MEDIOS || resolve(process.cwd(), 'medios'), 'modelos')

  const ensayados = []
  for (const documento of casos.docs as unknown as Array<Record<string, unknown>>) {
    const idDelModelo = idDe(documento.modelo)
    let modelo: ModeloEnsayado
    if (!idDelModelo) modelo = { estado: 'sin-modelo' }
    else if (!archivoDelModelo.has(idDelModelo)) modelo = { estado: 'sin-documento', id: idDelModelo }
    else {
      const archivo = archivoDelModelo.get(idDelModelo) as string
      const bytes = archivo ? await cabeceraDelGlb(resolve(directorio, archivo)) : undefined
      const nodos = bytes ? nodosDelGlb(bytes) : null
      modelo =
        bytes === undefined
          ? { estado: 'sin-archivo', archivo: archivo || `(el modelo ${idDelModelo} no tiene archivo)` }
          : nodos === null
            ? { estado: 'ilegible', archivo }
            : { estado: 'leido', archivo, nodos }
    }
    ensayados.push(ensayarUnCaso(documento, referenciaDelCaso.get(String(documento.id)) ?? null, modelo))
  }

  const conCaso = new Set(ensayados.map((c) => c.id))
  const sobrantes = (referencias.docs as unknown as Array<Record<string, unknown>>).filter((r) => {
    const caso = idDe(r.cirugia)
    return !caso || !conCaso.has(caso)
  }).length

  const informe = informeDelEnsayo(ensayados, sobrantes)
  console.log(informe.texto)
  console.log(`(${((Date.now() - inicio) / 1000).toFixed(1)} s)`)
  return informe.errores > 0 ? 1 : 0
}

main()
  .then((codigo) => process.exit(codigo))
  .catch((error) => {
    console.error('El ensayo de los casos no pudo terminar:', error)
    process.exit(2)
  })

import { afterAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import { sql } from 'drizzle-orm'
import sharp from 'sharp'

/**
 * La base sin el prefijo de la instalación, contra una base de verdad (D-370).
 *
 * Lo que solo una base dice. Que el gancho de `url` corre **después** del de
 * Payload y no en su lugar: si Payload cambiara cómo funde sus campos con los
 * de la colección, la columna quedaría con prefijo o vacía, y ninguna prueba
 * sin base lo vería. Y que la migración, ejecutada tal como está escrita, quita
 * cualquier prefijo y no toca lo demás.
 *
 * El prefijo se pone a mano en `NEXT_BASE_PATH`, como lo deja `withPayload` al
 * compilar ved: aquí Payload corre fuera de Next, y sin él no escribiría
 * ninguno.
 *
 * Con la misma guardia que las demás de integración: sin base, falla en rojo
 * salvo que se pida omitirlas por escrito (ver `acceso.test.ts`).
 */

type IntentoDeConexion = { payload: Payload; fallo: null } | { payload: null; fallo: string }

const intento: IntentoDeConexion = await (async (): Promise<IntentoDeConexion> => {
  try {
    const { getPayload } = await import('payload')
    const config = (await import('@payload-config')).default
    return { payload: await getPayload({ config }), fallo: null }
  } catch (error) {
    process.on('unhandledRejection', () => {})
    return { payload: null, fallo: error instanceof Error ? error.message : String(error) }
  }
})()

const estaEnIntegracionContinua = !['', 'false', '0'].includes(process.env.CI ?? '')
const seExigen = estaEnIntegracionContinua || process.env.EXIGIR_INTEGRACION === '1'
const permisoParaOmitir = process.env.OMITIR_INTEGRACION === '1' && !seExigen

describe('las pruebas de la base sin prefijo no se omiten solas', () => {
  it('la base respondió, o alguien pidió omitirlas por escrito', () => {
    if (intento.fallo === null || permisoParaOmitir) return
    expect(permisoParaOmitir, `La base no respondió: ${intento.fallo}`).toBe(true)
  })
})

function glb(): Buffer {
  const json = Buffer.from('{"asset":{"version":"2.0"}}  ', 'utf8')
  const total = 12 + 8 + json.length
  const b = Buffer.alloc(total)
  b.write('glTF', 0, 'ascii')
  b.writeUInt32LE(2, 4)
  b.writeUInt32LE(total, 8)
  b.writeUInt32LE(json.length, 12)
  b.write('JSON', 16, 'ascii')
  json.copy(b, 20)
  return b
}

/** Una imagen más grande que el tamaño mayor (1400), para que Payload saque los dos. */
const imagen = () =>
  sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 200, g: 120, b: 90 } } })
    .png()
    .toBuffer()

type Fila = Record<string, unknown>

describe.skipIf(intento.payload === null)('la base sin prefijo (D-370)', () => {
  const payload = intento.payload as Payload
  const marca = `sin-prefijo-${randomBytes(4).toString('hex')}`
  const creados: { modelos: number[]; medios: number[]; tiempo: number[] } = { modelos: [], medios: [], tiempo: [] }
  const bd = () =>
    (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: Fila[] }> } }).drizzle

  /** Mientras dure `hacer`, con el prefijo que ved recibe al compilar. */
  const comoEnVed = async <T,>(hacer: () => Promise<T>): Promise<T> => {
    const previo = process.env.NEXT_BASE_PATH
    process.env.NEXT_BASE_PATH = '/traumahub'
    try {
      return await hacer()
    } finally {
      if (previo === undefined) delete process.env.NEXT_BASE_PATH
      else process.env.NEXT_BASE_PATH = previo
    }
  }

  const subirModelo = (sufijo: string) => {
    const datos = glb()
    const nombre = `${marca}-${sufijo}`
    return comoEnVed(async () => {
      const modelo = (await payload.create({
        collection: 'modelos-3d',
        overrideAccess: true,
        data: { nombre, origen: 'sintetico' } as never,
        file: { data: datos, mimetype: 'model/gltf-binary', name: `${nombre}.glb`, size: datos.length },
      })) as unknown as { id: number; filename: string; url: string }
      creados.modelos.push(modelo.id)
      return modelo
    })
  }

  const subirImagen = async (sufijo: string) => {
    const datos = await imagen()
    return comoEnVed(async () => {
      const medio = (await payload.create({
        collection: 'medios',
        overrideAccess: true,
        data: { alt: `${marca} ${sufijo}` } as never,
        file: { data: datos, mimetype: 'image/png', name: `${marca}-${sufijo}.png`, size: datos.length },
      })) as unknown as { id: number; filename: string }
      creados.medios.push(medio.id)
      return medio
    })
  }

  const filaDe = async (tabla: string, id: number, columnas: string[]) => {
    const { rows } = await bd().execute(
      sql`SELECT ${sql.join(
        columnas.map((c) => sql.identifier(c)),
        sql`, `,
      )} FROM ${sql.identifier(tabla)} WHERE "id" = ${id}`,
    )
    return rows[0] ?? {}
  }

  afterAll(async () => {
    for (const id of creados.tiempo) await payload.delete({ collection: 'tiempo-activo', id, overrideAccess: true }).catch(() => {})
    for (const id of creados.medios) await payload.delete({ collection: 'medios', id, overrideAccess: true }).catch(() => {})
    for (const id of creados.modelos) await payload.delete({ collection: 'modelos-3d', id, overrideAccess: true }).catch(() => {})
  })

  it('un modelo subido en ved guarda su url sin prefijo, y se sigue pidiendo con él', async () => {
    const modelo = await subirModelo('subido')
    // Lo que recibe quien lo pide sí lleva el prefijo: Payload lo rehace al leer.
    expect(modelo.url).toContain(`/traumahub/api/modelos-3d/file/${modelo.filename}`)
    expect((await filaDe('modelos_3d', modelo.id, ['url'])).url).toBe(`/api/modelos-3d/file/${modelo.filename}`)
  })

  it('y no lo recupera al cambiarle el nombre', async () => {
    // Payload vuelve a escribir la `url` en cada actualización, aunque no
    // cambie el archivo: sin el gancho, editar el nombre devolvía el prefijo.
    const modelo = await subirModelo('renombrado')
    await comoEnVed(() =>
      payload.update({ collection: 'modelos-3d', id: modelo.id, overrideAccess: true, data: { nombre: `${marca}-otro` } as never }),
    )
    expect((await filaDe('modelos_3d', modelo.id, ['url'])).url).toBe(`/api/modelos-3d/file/${modelo.filename}`)
  })

  it('una imagen guarda sin prefijo su url y la de cada tamaño', async () => {
    const medio = await subirImagen('foto')
    const fila = await filaDe('medios', medio.id, ['url', 'sizes_miniatura_url', 'sizes_ancho_url'])
    expect(fila.url).toBe(`/api/medios/file/${medio.filename}`)
    expect(fila.sizes_miniatura_url).toMatch(/^\/api\/medios\/file\/[^/]+$/)
    expect(fila.sizes_ancho_url).toMatch(/^\/api\/medios\/file\/[^/]+$/)
  })

  it('la migración quita cualquier prefijo de lo que ya estaba, y deja lo demás', async () => {
    const modelo = await subirModelo('viejo')
    const sinTocar = await subirModelo('sin-tocar')
    const medio = await subirImagen('vieja')

    // El estado que dejó el pasado, escrito por SQL: con el prefijo de ved, con
    // el de desarrollo, y uno que ya venía bien.
    await bd().execute(
      sql`UPDATE "modelos_3d" SET "url" = ${`/traumahub/api/modelos-3d/file/${modelo.filename}`} WHERE "id" = ${modelo.id}`,
    )
    await bd().execute(
      sql`UPDATE "medios" SET "url" = ${`/simulaciones/api/medios/file/${medio.filename}`},
            "sizes_miniatura_url" = '/traumahub' || "sizes_miniatura_url" WHERE "id" = ${medio.id}`,
    )
    const rutas = [
      ['/traumahub/biblioteca/3', '/biblioteca/3'],
      ['/traumahub', '/'],
      ['/traumahub/', '/'],
      ['/simulaciones/imagenes/7', '/imagenes/7'],
      ['/biblioteca/4', '/biblioteca/4'],
      ['/traumahubx/y', '/traumahubx/y'],
    ] as const
    const filas: number[] = []
    for (const [i, [guardada]] of rutas.entries()) {
      const fila = (await payload.create({
        collection: 'tiempo-activo',
        overrideAccess: true,
        data: { dia: `2099-01-${String(i + 1).padStart(2, '0')}`, ultimaRuta: guardada } as never,
      })) as unknown as { id: number }
      creados.tiempo.push(fila.id)
      filas.push(fila.id)
    }

    const { up } = await import('@/migrations/20261115_130004_datos_sin_prefijo')
    await up({ db: bd(), payload, req: {} } as never)

    expect((await filaDe('modelos_3d', modelo.id, ['url'])).url).toBe(`/api/modelos-3d/file/${modelo.filename}`)
    expect((await filaDe('modelos_3d', sinTocar.id, ['url'])).url).toBe(`/api/modelos-3d/file/${sinTocar.filename}`)
    const fila = await filaDe('medios', medio.id, ['url', 'sizes_miniatura_url'])
    expect(fila.url).toBe(`/api/medios/file/${medio.filename}`)
    expect(fila.sizes_miniatura_url).toMatch(/^\/api\/medios\/file\/[^/]+$/)
    for (const [i, [, esperada]] of rutas.entries()) {
      expect((await filaDe('tiempo_activo', filas[i], ['ultima_ruta'])).ultima_ruta, rutas[i][0]).toBe(esperada)
    }

    // Y otra pasada no cambia nada: el despliegue que se repite no estropea lo hecho.
    await up({ db: bd(), payload, req: {} } as never)
    expect((await filaDe('modelos_3d', modelo.id, ['url'])).url).toBe(`/api/modelos-3d/file/${modelo.filename}`)
    expect((await filaDe('tiempo_activo', filas[0], ['ultima_ruta'])).ultima_ruta).toBe('/biblioteca/3')
  })
})

import { afterAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { sql } from 'drizzle-orm'
import { VERSION_DEL_FORMATO_DEL_CASO } from '@/lib/formatoDelCaso'

/**
 * La versión de formato de los casos contra una base de verdad (D-373).
 *
 * Que el número llega a la columna y a las versiones de los borradores, por
 * cualquier camino que guarde un caso, y que la migración, ejecutada tal cual
 * está escrita, deja en 1 los casos de antes. Con la misma guardia que las
 * demás de integración (ver `acceso.test.ts`).
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

describe('las pruebas del formato de los casos no se omiten solas', () => {
  it('la base respondió, o alguien pidió omitirlas por escrito', () => {
    if (intento.fallo === null || permisoParaOmitir) return
    expect(permisoParaOmitir, `La base no respondió: ${intento.fallo}`).toBe(true)
  })
})

describe.skipIf(intento.payload === null)('la versión de formato de un caso', () => {
  const payload = intento.payload as Payload
  const marca = `formato-${randomBytes(4).toString('hex')}`
  const cirugias: string[] = []

  afterAll(async () => {
    for (const id of cirugias) await payload.delete({ collection: 'cirugias', id, overrideAccess: true }).catch(() => {})
  })

  const columna = async (id: number | string) => {
    const filas = await payload.db.drizzle.execute(
      sql`select version_del_formato as v from cirugias where id = ${Number(id)}`,
    )
    return Number((filas as unknown as { rows: Array<{ v: unknown }> }).rows[0]?.v)
  }

  it('un caso nuevo, un borrador y uno publicado guardan la versión actual, también en sus versiones', async () => {
    const creada = (await payload.create({
      collection: 'cirugias',
      overrideAccess: true,
      draft: true,
      data: { nombre: `${marca} borrador`, _status: 'draft' } as never,
    })) as unknown as { id: number; versionDelFormato?: number }
    cirugias.push(String(creada.id))
    expect(creada.versionDelFormato).toBe(VERSION_DEL_FORMATO_DEL_CASO)

    // Publicar es otro guardado que no pasa por el editor.
    await payload.update({
      collection: 'cirugias',
      id: creada.id,
      overrideAccess: true,
      data: { _status: 'published' } as never,
    })
    expect(await columna(creada.id)).toBe(VERSION_DEL_FORMATO_DEL_CASO)

    const versiones = await payload.db.drizzle.execute(
      sql`select version_version_del_formato as v from _cirugias_v where parent_id = ${creada.id}`,
    )
    const valores = (versiones as unknown as { rows: Array<{ v: unknown }> }).rows.map((f) => Number(f.v))
    expect(valores.length).toBeGreaterThan(0)
    for (const v of valores) expect(v).toBe(VERSION_DEL_FORMATO_DEL_CASO)
  })

  it('la migración deja en 1 los casos que no tenían número', async () => {
    const creada = (await payload.create({
      collection: 'cirugias',
      overrideAccess: true,
      draft: false,
      data: { nombre: `${marca} de antes`, _status: 'draft' } as never,
    })) as unknown as { id: number }
    cirugias.push(String(creada.id))
    // Como estaba un caso de antes de D-373.
    await payload.db.drizzle.execute(sql`update cirugias set version_del_formato = null where id = ${creada.id}`)

    // Las sentencias de datos de la migración, tal cual están escritas. Las de
    // esquema ya corrieron: esta base tiene la columna.
    const fuente = readFileSync(join(process.cwd(), 'src/migrations/20261115_224829_formato_de_los_casos.ts'), 'utf8')
    const sentencia = fuente.match(/UPDATE "cirugias" SET "version_del_formato" = 1;/)
    expect(sentencia, 'la migración escribe el 1 en los casos de antes').not.toBeNull()
    await payload.db.drizzle.execute(sql.raw(sentencia![0]))

    expect(await columna(creada.id)).toBe(1)
  })
})

import { afterAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'

/**
 * Las resoluciones de referencia contra una base de verdad (D-373).
 *
 * Lo que solo la base puede contestar: que la unicidad por caso la pone el
 * índice y no solo la acción, y que borrar el caso se lleva su referencia en
 * vez de dejarla con el caso a nulo. Quién lee y escribe la colección lo
 * prueba la matriz de `roles.test.ts`. Con la misma guardia que las demás de
 * integración (ver `acceso.test.ts`).
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

describe('las pruebas de las resoluciones de referencia no se omiten solas', () => {
  it('la base respondió, o alguien pidió omitirlas por escrito', () => {
    if (intento.fallo === null || permisoParaOmitir) return
    expect(permisoParaOmitir, `La base no respondió: ${intento.fallo}`).toBe(true)
  })
})

describe.skipIf(intento.payload === null)('la resolución de referencia de un caso', () => {
  const payload = intento.payload as Payload
  const marca = `referencia-${randomBytes(4).toString('hex')}`
  const cirugias: Array<number | string> = []
  const referencias: Array<number | string> = []

  afterAll(async () => {
    for (const id of referencias) {
      await payload.delete({ collection: 'resoluciones-de-referencia', id, overrideAccess: true }).catch(() => {})
    }
    for (const id of cirugias) await payload.delete({ collection: 'cirugias', id, overrideAccess: true }).catch(() => {})
  })

  const fila = (cirugia: number | string, nombre: string) => ({
    collection: 'resoluciones-de-referencia' as const,
    overrideAccess: true,
    data: { nombre, cirugia: Number(cirugia), recorrido: { v: 1, pasos: [] }, puntaje: 0, puntajeMaximo: 0 } as never,
  })

  it('una por caso, y la segunda la rechaza la base', async () => {
    const caso = await payload.create({ collection: 'cirugias', overrideAccess: true, data: { nombre: `${marca} único` } as never })
    cirugias.push(caso.id)
    const primera = await payload.create(fila(caso.id, `${marca} primera`))
    referencias.push(primera.id)
    await expect(payload.create(fila(caso.id, `${marca} segunda`))).rejects.toThrow()
  })

  it('borrar el caso borra su referencia', async () => {
    const caso = await payload.create({ collection: 'cirugias', overrideAccess: true, data: { nombre: `${marca} borrado` } as never })
    const referencia = await payload.create(fila(caso.id, `${marca} del borrado`))
    referencias.push(referencia.id)

    await payload.delete({ collection: 'cirugias', id: caso.id, overrideAccess: true })

    const quedan = await payload.find({
      collection: 'resoluciones-de-referencia',
      where: { id: { equals: referencia.id } },
      overrideAccess: true,
    })
    expect(quedan.totalDocs).toBe(0)
  })
})

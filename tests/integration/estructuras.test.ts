import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Payload, PayloadRequest } from 'payload'
import { initTransaction, killTransaction } from 'payload'

/**
 * El listado global de estructuras contra una base de verdad (D-179, P-003 E8).
 *
 * La política de acceso de la colección la prueba la matriz de
 * `roles.test.ts`. Aquí, lo que solo se ve con PostgreSQL delante: que la
 * siembra del atlas entero es idempotente y que el índice único de `atlasId` es
 * el que protege de un duplicado.
 *
 * **Nada de esto deja una fila en la base de desarrollo.** La siembra de 2.231
 * fichas corre dentro de una transacción que se deshace siempre: no solo por
 * limpieza, sino porque `sincronizarConElAtlas` marca como «sin pieza» toda
 * ficha que no esté en el catálogo que se le da, y contra la base de alguien que
 * ya llenó fichas de verdad eso sería tocar su trabajo.
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

describe('las pruebas de las estructuras no se omiten solas', () => {
  it('la base respondió, o alguien pidió omitirlas por escrito', () => {
    if (intento.fallo === null || permisoParaOmitir) return
    expect(permisoParaOmitir, `La base no respondió: ${intento.fallo}`).toBe(true)
  })
})

describe.skipIf(intento.payload === null)('la siembra del atlas entero, contra PostgreSQL', async () => {
  const payload = intento.payload as Payload
  const { leerCatalogo } = await import('@/lib/exportarPreparacion')
  const { sincronizarConElAtlas, leerTodasLasEstructuras } = await import('@/lib/estructurasServidor')
  const { createLocalReq } = await import('payload')

  let req: PayloadRequest

  beforeAll(async () => {
    req = await createLocalReq({}, payload)
    await initTransaction(req)
  })

  afterAll(async () => {
    await killTransaction(req)
  })

  it('crea una ficha por pieza y la segunda pasada no cambia nada', async () => {
    const catalogo = await leerCatalogo()
    const antes = (await leerTodasLasEstructuras(payload, { atlasId: true }, req)).length

    const primera = await sincronizarConElAtlas(payload, catalogo, { origen: 'prueba', req })
    expect(primera.creadas + primera.yaEstaban).toBe(catalogo.piezas.length)
    expect(primera.creadas).toBe(catalogo.piezas.length - antes)

    const filas = await leerTodasLasEstructuras(payload, undefined, req)
    expect(filas).toHaveLength(Math.max(antes, catalogo.piezas.length))
    expect(new Set(filas.map((f) => f.atlasId)).size).toBe(filas.length)

    const segunda = await sincronizarConElAtlas(payload, catalogo, { origen: 'prueba', req })
    expect(segunda).toEqual({
      creadas: 0,
      yaEstaban: catalogo.piezas.length,
      actualizadas: 0,
      huerfanas: 0,
      recuperadas: 0,
      casadasPorNombre: 0,
    })
    expect(await leerTodasLasEstructuras(payload, { atlasId: true }, req)).toHaveLength(filas.length)
  }, 600_000)

  it('el índice único de atlasId rechaza una segunda ficha para la misma pieza', async () => {
    const [una] = await leerTodasLasEstructuras(payload, { atlasId: true }, req)
    expect(una).toBeDefined()
    // Dentro de la misma transacción: las fichas sembradas solo existen ahí. El error del
    // índice la deja abortada, y por eso esta es la última prueba del bloque.
    await expect(
      payload.create({
        collection: 'estructuras-anatomicas',
        data: { atlasId: una.atlasId, nombreOriginal: 'Duplicada' } as never,
        overrideAccess: true,
        context: { sinRegistro: true },
        req,
      }),
    ).rejects.toBeTruthy()
  }, 120_000)
})

import { afterAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import type { Payload } from 'payload'
import { dondeSeUsanLosModelos, modelosEnUso, reemplazarModelo, usosDelModelo } from '@/lib/usosDeUnModeloServidor'

/**
 * Un modelo en uso no se borra, contra una base de verdad (D-372).
 *
 * Lo que solo la base puede contestar: que el catálogo de claves ajenas que
 * lee `usosDeUnModeloServidor.ts` se entiende entero —una columna de modelo que
 * no supiera leer quedaría sin mirar, y el borrado volvería a dejar huecos solo
 * ahí—, que el borrado se niega desde el gancho y no solo desde el panel, y que
 * el reemplazo llega al documento, al borrador y a las filas de bloques y de
 * listas. Con la misma guardia que las demás de integración (ver
 * `acceso.test.ts`).
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

describe('las pruebas de los modelos en uso no se omiten solas', () => {
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

describe.skipIf(intento.payload === null)('un modelo 3D en uso', () => {
  const payload = intento.payload as Payload
  const marca = `en-uso-${randomBytes(4).toString('hex')}`
  const creados: Record<'modelos' | 'cirugias' | 'casos-ao', string[]> = { modelos: [], cirugias: [], 'casos-ao': [] }

  afterAll(async () => {
    for (const id of creados['casos-ao']) await payload.delete({ collection: 'casos-ao', id, overrideAccess: true }).catch(() => {})
    for (const id of creados.cirugias) await payload.delete({ collection: 'cirugias', id, overrideAccess: true }).catch(() => {})
    for (const id of creados.modelos) await payload.delete({ collection: 'modelos-3d', id, overrideAccess: true }).catch(() => {})
  })

  const crearModelo = async (sufijo: string) => {
    const datos = glb()
    const nombre = `${marca}-${sufijo}`
    const modelo = await payload.create({
      collection: 'modelos-3d',
      overrideAccess: true,
      data: { nombre, origen: 'sintetico' } as never,
      file: { data: datos, mimetype: 'model/gltf-binary', name: `${nombre}.glb`, size: datos.length },
    })
    creados.modelos.push(String(modelo.id))
    return Number(modelo.id)
  }

  const crearCirugia = async (nombre: string, modelo: number | null) => {
    const cirugia = await payload.create({
      collection: 'cirugias',
      overrideAccess: true,
      draft: false,
      data: { nombre: `${marca} ${nombre}`, modelo, _status: 'draft' } as never,
    })
    creados.cirugias.push(String(cirugia.id))
    return Number(cirugia.id)
  }

  /** Un caso de técnica AO en borrador, con el modelo en un paso y en un bloque de su «Material adicional». */
  const crearCasoAO = async (modelo: number) => {
    const caso = await payload.create({
      collection: 'casos-ao',
      overrideAccess: true,
      draft: true,
      data: {
        titulo: `${marca} técnica`,
        _status: 'draft',
        pasos: [{ titulo: 'Reducción', principio: 'Estabilidad absoluta', modelo }],
        contenido: [{ blockType: 'modelo-3d', modelo }],
      } as never,
    })
    creados['casos-ao'].push(String(caso.id))
    return Number(caso.id)
  }

  const borrar = (id: number) => payload.delete({ collection: 'modelos-3d', id, overrideAccess: true })

  it('cada columna que apunta a un modelo se sabe leer', async () => {
    const { donde, sinClasificar } = await dondeSeUsanLosModelos(payload)
    // Si esto falla, alguien añadió un campo de modelo que `clasificarColumnas` no sabe recorrer —una lista dentro de
    // un bloque, una relación múltiple—: el borrado no lo miraría, y la base lo pondría a nulo sin avisar.
    expect(sinClasificar).toEqual([])
    const claves = donde.map((d) => `${d.coleccion}:${d.via}:${d.tabla}.${d.columna}`)
    expect(claves).toEqual(
      expect.arrayContaining([
        'cirugias:documento:cirugias.modelo_id',
        'cirugias:version:_cirugias_v.version_modelo_id',
        'instrumental:documento:instrumental.modelo_id',
        'casos-ao:hija:casos_ao_pasos.modelo_id',
        'casos-ao:hija-de-version:_casos_ao_v_version_pasos.modelo_id',
        'patologias:hija:patologias_blocks_modelo_3d.modelo_id',
        'patologias:hija-de-version:_patologias_v_blocks_modelo_3d.modelo_id',
      ]),
    )
  })

  it('no se borra mientras algo lo use, y el rechazo dice qué', async () => {
    const modelo = await crearModelo('usado')
    const cirugia = await crearCirugia('con modelo', modelo)
    const caso = await crearCasoAO(modelo)

    const usos = await usosDelModelo(payload, modelo)
    expect(usos.map((u) => `${u.coleccion}:${u.id}`).sort()).toEqual([`casos-ao:${caso}`, `cirugias:${cirugia}`].sort())
    expect(usos.find((u) => u.coleccion === 'cirugias')?.titulo).toBe(`${marca} con modelo`)

    const rechazo = await borrar(modelo).then(
      () => null,
      (error: unknown) => error as { status?: number; message?: string },
    )
    expect(rechazo?.status).toBe(409)
    expect(rechazo?.message).toContain(`«${marca} con modelo» (Cirugía simulada)`)
    expect(rechazo?.message).toMatch(/Reemplazar por…/)
    // Sigue ahí, con su archivo.
    const sigue = await payload.findByID({ collection: 'modelos-3d', id: modelo, depth: 0, overrideAccess: true })
    expect(sigue.id).toBe(modelo)
    expect((await modelosEnUso(payload)).has(String(modelo))).toBe(true)
  })

  it('«Reemplazar por…» lo cambia en el documento, en el borrador, en los pasos y en los bloques; entonces se borra', async () => {
    const viejo = await crearModelo('viejo')
    const nuevo = await crearModelo('nuevo')
    const cirugia = await crearCirugia('a reemplazar', viejo)
    const caso = await crearCasoAO(viejo)
    const antes = (await payload.findByID({ collection: 'cirugias', id: cirugia, depth: 0, overrideAccess: true })) as {
      updatedAt: string
    }

    const cambiados = await reemplazarModelo(payload, viejo, nuevo)
    expect(cambiados.map((u) => `${u.coleccion}:${u.id}`).sort()).toEqual([`casos-ao:${caso}`, `cirugias:${cirugia}`].sort())

    for (const draft of [false, true]) {
      const c = (await payload.findByID({ collection: 'cirugias', id: cirugia, depth: 0, draft, overrideAccess: true })) as {
        modelo: unknown
        updatedAt: string
      }
      expect(c.modelo).toBe(nuevo)
      // El ensayo del despliegue tiene que ver el caso como tocado (D-386).
      expect(c.updatedAt > antes.updatedAt).toBe(true)
      const t = (await payload.findByID({ collection: 'casos-ao', id: caso, depth: 0, draft, overrideAccess: true })) as {
        pasos: { modelo: unknown }[]
        contenido: { modelo: unknown }[]
      }
      expect(t.pasos[0].modelo).toBe(nuevo)
      expect(t.contenido[0].modelo).toBe(nuevo)
    }

    expect(await usosDelModelo(payload, viejo)).toEqual([])
    await borrar(viejo)
    await expect(payload.findByID({ collection: 'modelos-3d', id: viejo, depth: 0, overrideAccess: true })).rejects.toThrow()
  })

  it('una versión antigua no lo retiene: es historia', async () => {
    const modelo = await crearModelo('historia')
    const cirugia = await crearCirugia('que lo tuvo', modelo)
    await payload.update({
      collection: 'cirugias',
      id: cirugia,
      overrideAccess: true,
      draft: false,
      data: { modelo: null, _status: 'draft' } as never,
    })
    const versiones = await payload.findVersions({
      collection: 'cirugias',
      where: { parent: { equals: cirugia } },
      depth: 0,
      overrideAccess: true,
    })
    // La versión vieja sí lo tiene; la última, no.
    expect(versiones.docs.some((v) => (v.version as { modelo?: unknown }).modelo === modelo)).toBe(true)

    expect(await usosDelModelo(payload, modelo)).toEqual([])
    await borrar(modelo)
  })

  it('no reemplaza un modelo por sí mismo', async () => {
    const modelo = await crearModelo('mismo')
    await expect(reemplazarModelo(payload, modelo, modelo)).rejects.toThrow(/el mismo/)
  })
})

import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { payloadDelLugar } from '@/lib/payloadDelLugar'

/**
 * El Payload del panel de un lugar (P-016 E5.6, D-401), sobre un Payload de
 * mentira que guarda lo que se le pidió y contesta con filas fijas.
 *
 * Lo que se mira es el filtro que llega a la base, no lo que la base haría con
 * él: eso lo hace `tests/integration/panelDelLugar.test.ts` contra una de
 * verdad.
 */

type Llamada = { metodo: string; args: Record<string, unknown> }

/** Un Payload que anota cada llamada; `findByID` devuelve la fila de `filas` con ese id. */
function falso(filas: Record<string, Record<string, unknown>> = {}) {
  const llamadas: Llamada[] = []
  const anotar =
    (metodo: string, respuesta: (args: Record<string, unknown>) => unknown) =>
    async (args: Record<string, unknown>) => {
      llamadas.push({ metodo, args })
      return respuesta(args)
    }
  const payload = {
    db: { nombre: 'la base' },
    find: anotar('find', () => ({ docs: [] })),
    count: anotar('count', () => ({ totalDocs: 0 })),
    findVersions: anotar('findVersions', () => ({ docs: [] })),
    findByID: anotar('findByID', (a) => filas[String(a.id)] ?? (a.disableErrors ? null : Promise.reject(new Error('falta')))),
    update: anotar('update', (a) => ({ id: a.id })),
    delete: anotar('delete', (a) => ({ id: a.id })),
    create: anotar('create', () => ({ id: 99 })),
  }
  return { payload: payload as unknown as Payload, llamadas }
}

const CENTRAL = { institucion: { exists: false } }
const DE_LA_7 = { institucion: { equals: 7 } }

describe('las lecturas', () => {
  it('a la central le junta «sin institución», y a una institución, la suya', async () => {
    const { payload, llamadas } = falso()
    await payloadDelLugar(payload, null).find({ collection: 'usuarios', where: { rol: { equals: 'admin' } } })
    await payloadDelLugar(payload, '7').count({ collection: 'actividad' })
    expect(llamadas[0].args.where).toEqual({ and: [{ rol: { equals: 'admin' } }, CENTRAL] })
    expect(llamadas[1].args.where).toEqual(DE_LA_7)
  })

  it('los medios y los modelos de TraumaHub también se leen desde una institución: su contenido los enlaza', async () => {
    const { payload, llamadas } = falso()
    await payloadDelLugar(payload, '7').find({ collection: 'medios' })
    await payloadDelLugar(payload, null).find({ collection: 'modelos-3d' })
    expect(llamadas[0].args.where).toEqual({ or: [DE_LA_7, CENTRAL] })
    // La central no lee los de las instituciones.
    expect(llamadas[1].args.where).toEqual(CENTRAL)
  })

  it('las versiones guardan la marca dentro de `version`', async () => {
    const { payload, llamadas } = falso()
    await payloadDelLugar(payload, '7').findVersions({ collection: 'patologias' } as never)
    expect(llamadas[0].args.where).toEqual({ 'version.institucion': { equals: 7 } })
  })

  it('lo que no lleva marca se lee como siempre', async () => {
    const { payload, llamadas } = falso()
    const where = { estado: { equals: 'nueva' } }
    await payloadDelLugar(payload, '7').find({ collection: 'cotizaciones', where })
    expect(llamadas[0].args.where).toBe(where)
    expect(payloadDelLugar(payload, '7').db).toBe(payload.db)
  })
})

describe('una fila por su identificador', () => {
  const filas = { 1: { id: 1, institucion: null }, 2: { id: 2, institucion: 7 }, 3: { id: 3, institucion: { id: 8 } } }

  it('la de otro lugar se porta como si no existiera', async () => {
    const { payload } = falso(filas)
    const de7 = payloadDelLugar(payload, '7')
    expect(await de7.findByID({ collection: 'usuarios', id: 2 })).toMatchObject({ id: 2 })
    expect(await de7.findByID({ collection: 'usuarios', id: 1, disableErrors: true })).toBeNull()
    await expect(de7.findByID({ collection: 'usuarios', id: 3 })).rejects.toThrow('No se encontró.')
    await expect(payloadDelLugar(payload, null).findByID({ collection: 'usuarios', id: 2 })).rejects.toMatchObject({
      status: 404,
    })
  })

  it('con una selección de campos, pide además la marca', async () => {
    const { payload, llamadas } = falso(filas)
    await payloadDelLugar(payload, '7').findByID({ collection: 'usuarios', id: 2, select: { email: true } })
    expect(llamadas[0].args.select).toEqual({ email: true, institucion: true })
  })

  it('un medio de TraumaHub se abre desde una institución', async () => {
    const { payload } = falso(filas)
    expect(await payloadDelLugar(payload, '7').findByID({ collection: 'medios', id: 1 })).toMatchObject({ id: 1 })
  })
})

describe('las escrituras', () => {
  const filas = { 1: { id: 1, institucion: null }, 2: { id: 2, institucion: 7 } }

  it('solo alcanzan lo propio, también en los medios', async () => {
    const { payload, llamadas } = falso(filas)
    const de7 = payloadDelLugar(payload, '7')
    await expect(de7.update({ collection: 'usuarios', id: 1, data: { rol: 'admin' } } as never)).rejects.toThrow('No se encontró.')
    await expect(de7.delete({ collection: 'medios', id: 1 } as never)).rejects.toThrow('No se encontró.')
    expect(llamadas.filter((l) => l.metodo === 'update' || l.metodo === 'delete')).toEqual([])

    await de7.update({ collection: 'usuarios', id: 2, data: { activo: false } } as never)
    expect(llamadas.at(-1)).toMatchObject({ metodo: 'update', args: { id: 2 } })
  })

  it('leen la marca dentro de la transacción de quien escribe', async () => {
    const { payload, llamadas } = falso(filas)
    const req = { transactionID: 'la de la acción' }
    await payloadDelLugar(payload, '7').update({ collection: 'usuarios', id: 2, data: {}, req } as never)
    expect(llamadas[0]).toMatchObject({ metodo: 'findByID', args: { id: 2, req } })
  })

  it('con `where`, se les junta el filtro estricto', async () => {
    const { payload, llamadas } = falso()
    await payloadDelLugar(payload, '7').update({ collection: 'medios', where: { alt: { equals: '' } }, data: {} } as never)
    expect(llamadas[0].args.where).toEqual({ and: [{ alt: { equals: '' } }, DE_LA_7] })
  })

  it('crear pasa tal cual: la marca la pone el gancho', async () => {
    const { payload, llamadas } = falso()
    await payloadDelLugar(payload, '7').create({ collection: 'usuarios', data: {} } as never)
    expect(llamadas).toEqual([{ metodo: 'create', args: { collection: 'usuarios', data: {} } }])
  })
})

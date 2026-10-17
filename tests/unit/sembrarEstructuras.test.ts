import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import { corregirCatalogo } from '@/atlas/clasificacion'
import type { CatalogoDelAtlas, PiezaDelAtlas } from '@/atlas/formato'
import {
  resumenDeLaSiembra,
  sincronizarConElAtlas,
  type FilaDeEstructura,
} from '@/lib/estructurasServidor'

/**
 * La siembra del listado global de estructuras (D-179, P-003 E8.3).
 *
 * Contra una base en memoria que cuenta cada escritura: lo que se prueba es lo
 * que la siembra **no** hace —no pisa lo escrito, no borra, no duplica— y eso se
 * mide mirando qué escrituras pidió. La prueba contra PostgreSQL de verdad, con
 * el atlas entero, está en `tests/integration/estructuras.test.ts`.
 */

type Fila = Record<string, unknown> & { id: number }

function baseEnMemoria(iniciales: Partial<FilaDeEstructura>[] = []) {
  const filas = new Map<number, Fila>()
  let siguiente = 1
  for (const inicial of iniciales) filas.set(siguiente, { id: siguiente++, ...inicial } as Fila)
  const escrituras: { operacion: 'create' | 'update'; id: number; data: Record<string, unknown> }[] = []
  const registro: Record<string, unknown>[] = []

  const payload = {
    find: async () => ({ docs: [...filas.values()].map((f) => ({ ...f })) }),
    count: async ({ where }: { where: { atlasId: { equals: string } } }) => ({
      totalDocs: [...filas.values()].filter((f) => f.atlasId === where.atlasId.equals).length,
    }),
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      if (collection === 'registro-de-acciones') {
        registro.push(data)
        return { id: registro.length }
      }
      if ([...filas.values()].some((f) => f.atlasId === data.atlasId)) throw new Error('duplicate key')
      const fila = { id: siguiente++, ...data } as Fila
      filas.set(fila.id, fila)
      escrituras.push({ operacion: 'create', id: fila.id, data })
      return fila
    },
    update: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const fila = filas.get(id)!
      Object.assign(fila, data)
      escrituras.push({ operacion: 'update', id, data })
      return fila
    },
  } as unknown as Payload

  return { payload, filas, escrituras, registro }
}

const pieza = (id: string, nombre: string, sistema = 'muscular', region = 'cabeza'): PiezaDelAtlas =>
  ({ id, nombre, sistema, region, fma: '', origenRegion: 'anatomia' }) as unknown as PiezaDelAtlas
const catalogoDe = (...piezas: PiezaDelAtlas[]): CatalogoDelAtlas => ({ version: 'prueba', piezas }) as unknown as CatalogoDelAtlas

describe('sembrar el listado de estructuras', () => {
  it('crea una ficha vacía por pieza, con el sistema, la región y el lado del atlas', async () => {
    const { payload, filas } = baseEnMemoria()
    const resultado = await sincronizarConElAtlas(
      payload,
      catalogoDe(pieza('FJ1', 'Right tibia', 'skeletal', 'miembro-inferior-derecho'), pieza('FJ2', 'Sternum', 'skeletal', 'torax')),
    )
    expect(resultado).toMatchObject({ creadas: 2, yaEstaban: 0, actualizadas: 0, huerfanas: 0 })
    const tibia = [...filas.values()].find((f) => f.atlasId === 'FJ1')!
    expect(tibia).toMatchObject({
      nombreOriginal: 'Right tibia',
      sistema: 'skeletal',
      region: 'miembro-inferior-derecho',
      lado: 'derecho',
      oculta: false,
      huerfana: false,
    })
    expect([...filas.values()].find((f) => f.atlasId === 'FJ2')?.lado).toBeNull()
  })

  it('repetida no cambia nada: la segunda vez no pide ninguna escritura', async () => {
    const { payload, escrituras } = baseEnMemoria()
    const catalogo = catalogoDe(pieza('FJ1', 'Right tibia'), pieza('FJ2', 'Sternum'))
    await sincronizarConElAtlas(payload, catalogo)
    const antes = escrituras.length
    const segunda = await sincronizarConElAtlas(payload, catalogo)
    expect(segunda).toEqual({ creadas: 0, yaEstaban: 2, actualizadas: 0, huerfanas: 0, recuperadas: 0, casadasPorNombre: 0 })
    expect(escrituras.length).toBe(antes)
  })

  it('no pisa lo escrito: de una ficha que ya existe solo se refrescan los datos del atlas', async () => {
    const { payload, filas, escrituras } = baseEnMemoria([
      {
        atlasId: 'FJ1',
        nombreOriginal: 'Right fibularis brevis',
        sistema: 'skeletal', // como lo clasificó el atlas de origen, antes de la corrección
        region: 'miembro-inferior-derecho',
        lado: 'derecho',
        definicion: 'Músculo corto del compartimento lateral de la pierna.',
        origen: 'Mitad distal de la cara lateral del peroné.',
        oculta: true,
      } as never,
    ])
    const resultado = await sincronizarConElAtlas(
      payload,
      catalogoDe(pieza('FJ1', 'Right fibularis brevis', 'muscular', 'miembro-inferior-derecho')),
    )
    expect(resultado).toMatchObject({ creadas: 0, actualizadas: 1 })
    expect(escrituras).toHaveLength(1)
    // La escritura lleva solo lo del atlas: ni un campo de la ficha ni la marca «No mostrar».
    expect(Object.keys(escrituras[0].data).sort()).toEqual(
      ['atlasId', 'huerfana', 'lado', 'nombreOriginal', 'region', 'sistema'].sort(),
    )
    const fila = filas.get(1)!
    expect(fila.sistema).toBe('muscular')
    expect(fila.definicion).toBe('Músculo corto del compartimento lateral de la pierna.')
    expect(fila.origen).toBe('Mitad distal de la cara lateral del peroné.')
    expect(fila.oculta).toBe(true)
  })

  it('una ficha cuya pieza ya no está no se borra: queda marcada sin pieza, con lo escrito', async () => {
    const { payload, filas } = baseEnMemoria([
      { atlasId: 'FJ9', nombreOriginal: 'Pieza que se fue', sistema: 'muscular', region: 'cabeza', definicion: 'Escrita a mano' } as never,
    ])
    const resultado = await sincronizarConElAtlas(payload, catalogoDe(pieza('FJ1', 'Sternum')))
    expect(resultado).toMatchObject({ creadas: 1, huerfanas: 1 })
    expect(filas.size).toBe(2)
    expect(filas.get(1)).toMatchObject({ huerfana: true, definicion: 'Escrita a mano' })
    // Y una huérfana marcada no se vuelve a marcar.
    const otra = await sincronizarConElAtlas(payload, catalogoDe(pieza('FJ1', 'Sternum')))
    expect(otra.huerfanas).toBe(0)
  })

  it('si la pieza reaparece, la ficha se recupera', async () => {
    const { payload, filas } = baseEnMemoria([
      { atlasId: 'FJ1', nombreOriginal: 'Sternum', sistema: 'skeletal', region: 'cabeza', lado: null, huerfana: true, notas: 'x' } as never,
    ])
    const resultado = await sincronizarConElAtlas(payload, catalogoDe(pieza('FJ1', 'Sternum', 'skeletal', 'cabeza')))
    expect(resultado).toMatchObject({ recuperadas: 1, creadas: 0 })
    expect(filas.get(1)).toMatchObject({ huerfana: false, notas: 'x' })
  })

  it('si el atlas cambia el identificador de una pieza, la ficha se casa por su nombre original', async () => {
    const { payload, filas } = baseEnMemoria([
      { atlasId: 'FJ-VIEJO', nombreOriginal: 'Right tibia', sistema: 'skeletal', region: 'miembro-inferior-derecho', definicion: 'Hueso de la pierna' } as never,
    ])
    const resultado = await sincronizarConElAtlas(payload, catalogoDe(pieza('FJ-NUEVO', 'Right tibia', 'skeletal', 'miembro-inferior-derecho')))
    expect(resultado).toMatchObject({ casadasPorNombre: 1, creadas: 0, huerfanas: 0 })
    expect(filas.size).toBe(1)
    expect(filas.get(1)).toMatchObject({ atlasId: 'FJ-NUEVO', definicion: 'Hueso de la pierna', huerfana: false })
  })

  it('con nombres repetidos no adivina: no casa una huérfana con una de varias piezas del mismo nombre', async () => {
    const { payload, filas } = baseEnMemoria([
      { atlasId: 'FJ-DEDO-VIEJO', nombreOriginal: 'Dorsal digital artery of foot', sistema: 'arterial', region: 'pie-derecho', definicion: 'De un dedo' } as never,
    ])
    const resultado = await sincronizarConElAtlas(
      payload,
      catalogoDe(
        pieza('FJ-A', 'Dorsal digital artery of foot', 'arterial', 'pie-derecho'),
        pieza('FJ-B', 'Dorsal digital artery of foot', 'arterial', 'pie-derecho'),
      ),
    )
    expect(resultado).toMatchObject({ casadasPorNombre: 0, creadas: 2, huerfanas: 1 })
    expect(filas.get(1)).toMatchObject({ atlasId: 'FJ-DEDO-VIEJO', huerfana: true, definicion: 'De un dedo' })
  })

  it('anota una sola línea en el registro, y ninguna si no hubo nada que hacer', async () => {
    const { payload, registro } = baseEnMemoria()
    const catalogo = catalogoDe(pieza('FJ1', 'Sternum'), pieza('FJ2', 'Right tibia'))
    await sincronizarConElAtlas(payload, catalogo, { origen: 'prueba' })
    expect(registro).toHaveLength(1)
    expect(registro[0]).toMatchObject({ accion: 'importacion', coleccion: 'estructuras-anatomicas', origen: 'prueba' })
    expect(String(registro[0].detalle)).toContain('2 fichas nuevas')
    await sincronizarConElAtlas(payload, catalogo, { origen: 'prueba' })
    expect(registro).toHaveLength(1)
  })

  it('las escrituras de la siembra no dejan una línea de registro por ficha', async () => {
    const llamadas: { collection: string; context?: unknown }[] = []
    const { payload } = baseEnMemoria()
    const original = payload.create.bind(payload)
    ;(payload as unknown as { create: unknown }).create = async (args: { collection: string; context?: unknown }) => {
      llamadas.push({ collection: args.collection, context: args.context })
      return original(args as never)
    }
    await sincronizarConElAtlas(payload, catalogoDe(pieza('FJ1', 'Sternum')))
    const deLaFicha = llamadas.find((l) => l.collection === 'estructuras-anatomicas')
    expect(deLaFicha?.context).toEqual({ sinRegistro: true })
  })

  it('con el atlas real crea 2.231 fichas, con el peroneo corto como músculo', async () => {
    const real = corregirCatalogo(
      JSON.parse(readFileSync(resolve(process.cwd(), 'public/atlas/catalogo.json'), 'utf8')) as CatalogoDelAtlas,
    )
    const { payload, filas } = baseEnMemoria()
    const resultado = await sincronizarConElAtlas(payload, real)
    expect(resultado.creadas).toBe(real.piezas.length)
    expect(filas.size).toBe(real.piezas.length)
    expect(new Set([...filas.values()].map((f) => f.atlasId)).size).toBe(real.piezas.length)
    expect([...filas.values()].find((f) => f.nombreOriginal === 'Right fibularis brevis')?.sistema).toBe('muscular')
    // Cada lado con su ficha: una pieza derecha no es la izquierda.
    expect([...filas.values()].find((f) => f.nombreOriginal === 'Right tibia')?.lado).toBe('derecho')
    expect([...filas.values()].find((f) => f.nombreOriginal === 'Left tibia')?.lado).toBe('izquierdo')
  })
})

describe('el resumen de la siembra', () => {
  it('dice lo que pasó y calla lo que no', () => {
    expect(
      resumenDeLaSiembra({ creadas: 3, yaEstaban: 10, actualizadas: 0, huerfanas: 0, recuperadas: 0, casadasPorNombre: 0 }),
    ).toBe('3 fichas nuevas · 10 ya estaban')
    expect(
      resumenDeLaSiembra({ creadas: 0, yaEstaban: 1, actualizadas: 2, huerfanas: 4, recuperadas: 1, casadasPorNombre: 1 }),
    ).toContain('4 sin pieza en el atlas (no se borraron)')
  })
})

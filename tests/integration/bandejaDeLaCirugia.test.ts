import { afterAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { sql } from 'drizzle-orm'

/**
 * La bandeja de la cirugía contra una base de verdad (P-004 E3).
 *
 * Que una cirugía nueva nace con la mesa completa, y que el reparto de la migración —ejecutado tal cual está
 * escrito— deja con «solo lo que elijo» a la que ya tenía su bandeja armada y con toda la mesa a la que no.
 *
 * Con la misma guardia que las demás de integración (ver `acceso.test.ts`).
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

describe('las pruebas de la bandeja no se omiten solas', () => {
  it('la base respondió, o alguien pidió omitirlas por escrito', () => {
    if (intento.fallo === null || permisoParaOmitir) return
    expect(permisoParaOmitir, `La base no respondió: ${intento.fallo}`).toBe(true)
  })
})

describe.skipIf(intento.payload === null)('la bandeja de una cirugía', () => {
  const payload = intento.payload as Payload
  const marca = `bandeja-${randomBytes(4).toString('hex')}`
  const cirugias: string[] = []
  const instrumentos: string[] = []

  afterAll(async () => {
    for (const id of cirugias) await payload.delete({ collection: 'cirugias', id, overrideAccess: true }).catch(() => {})
    for (const id of instrumentos) await payload.delete({ collection: 'instrumental', id, overrideAccess: true }).catch(() => {})
  })

  const crear = async (nombre: string, extra: Record<string, unknown> = {}) => {
    const creada = await payload.create({
      collection: 'cirugias',
      overrideAccess: true,
      draft: false,
      data: { nombre: `${marca} ${nombre}`, _status: 'draft', ...extra } as never,
    })
    cirugias.push(String(creada.id))
    return creada as unknown as { id: number }
  }
  const bandejaDe = async (id: number) =>
    ((await payload.findByID({ collection: 'cirugias', id, overrideAccess: true, depth: 0 })) as unknown as { bandeja: string }).bandeja

  it('una cirugía nueva nace con la mesa completa', async () => {
    const nueva = await crear('nueva')
    expect(await bandejaDe(nueva.id)).toBe('completa')
  })

  it('lo que se escribe se guarda', async () => {
    const acotada = await crear('acotada', { bandeja: 'acotada' })
    expect(await bandejaDe(acotada.id)).toBe('acotada')
  })

  it('el reparto de la migración: con bandeja armada, acotada; sin ella, completa', async () => {
    const carpeta = join(process.cwd(), 'src', 'migrations')
    const nombre = readdirSync(carpeta)
      .sort()
      .find((n) => n.endsWith('_bandeja_completa_o_acotada.ts'))!
    const texto = readFileSync(join(carpeta, nombre), 'utf8')
    const actualizaciones = [...texto.matchAll(/UPDATE "[\s\S]*?;/g)].map((m) => m[0])
    expect(actualizaciones).toHaveLength(2)

    const instrumento = await payload.create({
      collection: 'instrumental',
      overrideAccess: true,
      data: { nombre: `${marca} instrumento` } as never,
    })
    instrumentos.push(String(instrumento.id))
    const conBandeja = await crear('con bandeja', { instrumental: [instrumento.id] })
    const sinBandeja = await crear('sin bandeja')

    // Se devuelve al estado de antes de la migración: todas con el valor por omisión.
    const bd = (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
    await bd.execute(sql`UPDATE "cirugias" SET "bandeja" = 'completa' WHERE "id" IN (${conBandeja.id}, ${sinBandeja.id})`)
    for (const actualizacion of actualizaciones) await bd.execute(sql.raw(actualizacion))

    expect(await bandejaDe(conBandeja.id)).toBe('acotada')
    expect(await bandejaDe(sinBandeja.id)).toBe('completa')
  })
})

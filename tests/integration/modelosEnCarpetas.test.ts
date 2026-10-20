import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Payload } from 'payload'
import { sql } from 'drizzle-orm'

/**
 * Los modelos 3D en dos carpetas contra una base de verdad (P-004 E1).
 *
 * Las cuentas del panel están en `tests/unit/modelosEnDosCarpetas.test.ts`; aquí se comprueba lo que solo una base
 * dice: que un modelo nuevo nace en `cuerpo`, que la colección **rechaza** un modelo de la carpeta equivocada en un
 * instrumento o en una cirugía —por la API, sin pasar por el panel— y que el reparto de la migración, ejecutado tal
 * cual está escrito, deja cada modelo donde le toca.
 *
 * Con la misma guardia que las demás de integración: sin base, falla en rojo salvo que se pida omitirlas por
 * escrito (ver `acceso.test.ts`).
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

describe('las pruebas de las dos carpetas no se omiten solas', () => {
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

describe.skipIf(intento.payload === null)('un modelo 3D y su carpeta', () => {
  const payload = intento.payload as Payload
  const marca = `carpetas-${randomBytes(4).toString('hex')}`
  const creados: { modelos: string[]; instrumentos: string[]; cirugias: string[] } = {
    modelos: [],
    instrumentos: [],
    cirugias: [],
  }

  const crearModelo = async (sufijo: string, clase?: 'herramienta' | 'cuerpo') => {
    const datos = glb()
    const nombre = `${marca}-${sufijo}`
    const modelo = await payload.create({
      collection: 'modelos-3d',
      overrideAccess: true,
      data: { nombre, origen: 'sintetico', ...(clase ? { clase } : {}) } as never,
      file: { data: datos, mimetype: 'model/gltf-binary', name: `${nombre}.glb`, size: datos.length },
    })
    creados.modelos.push(String(modelo.id))
    return modelo as unknown as { id: number; clase: string }
  }

  afterAll(async () => {
    for (const id of creados.instrumentos) await payload.delete({ collection: 'instrumental', id, overrideAccess: true }).catch(() => {})
    for (const id of creados.cirugias) await payload.delete({ collection: 'cirugias', id, overrideAccess: true }).catch(() => {})
    for (const id of creados.modelos) await payload.delete({ collection: 'modelos-3d', id, overrideAccess: true }).catch(() => {})
  })

  it('sin decir la carpeta, nace en el cuerpo', async () => {
    const modelo = await crearModelo('sin-clase')
    expect(modelo.clase).toBe('cuerpo')
  })

  it('en la carpeta que se le diga', async () => {
    const modelo = await crearModelo('herramienta', 'herramienta')
    expect(modelo.clase).toBe('herramienta')
  })

  it('un instrumento acepta un modelo de herramientas y rechaza uno del cuerpo', async () => {
    const herramienta = await crearModelo('i-herramienta', 'herramienta')
    const cuerpo = await crearModelo('i-cuerpo', 'cuerpo')
    const bueno = await payload.create({
      collection: 'instrumental',
      overrideAccess: true,
      data: { nombre: `${marca} instrumento bueno`, modelo: herramienta.id } as never,
    })
    creados.instrumentos.push(String(bueno.id))
    await expect(
      payload.create({
        collection: 'instrumental',
        overrideAccess: true,
        data: { nombre: `${marca} instrumento malo`, modelo: cuerpo.id } as never,
      }),
    ).rejects.toThrow()
  })

  it('una cirugía acepta un modelo del cuerpo y rechaza una herramienta', async () => {
    const herramienta = await crearModelo('c-herramienta', 'herramienta')
    const cuerpo = await crearModelo('c-cuerpo', 'cuerpo')
    const buena = await payload.create({
      collection: 'cirugias',
      overrideAccess: true,
      draft: false,
      data: { nombre: `${marca} cirugía buena`, modelo: cuerpo.id, _status: 'draft' } as never,
    })
    creados.cirugias.push(String(buena.id))
    await expect(
      payload.create({
        collection: 'cirugias',
        overrideAccess: true,
        draft: false,
        data: { nombre: `${marca} cirugía mala`, modelo: herramienta.id, _status: 'published' } as never,
      }),
    ).rejects.toThrow()
  })

  it('la migración reparte: herramienta lo que usa un instrumento, salvo lo que también usa una cirugía', async () => {
    const carpeta = join(process.cwd(), 'src', 'migrations')
    const nombre = readdirSync(carpeta)
      .sort()
      .find((n) => n.endsWith('_modelos_en_dos_carpetas.ts'))!
    const texto = readFileSync(join(carpeta, nombre), 'utf8')
    const actualizacion = texto.match(/UPDATE "modelos_3d"[\s\S]*?;/)![0]

    const soloDelInstrumento = await crearModelo('r-instrumento', 'cuerpo')
    const delInstrumentoYDeLaCirugia = await crearModelo('r-ambos', 'cuerpo')
    const suelto = await crearModelo('r-suelto', 'cuerpo')
    const instrumento = await payload.create({
      collection: 'instrumental',
      overrideAccess: true,
      data: { nombre: `${marca} reparto` } as never,
    })
    creados.instrumentos.push(String(instrumento.id))
    const otro = await payload.create({
      collection: 'instrumental',
      overrideAccess: true,
      data: { nombre: `${marca} reparto 2` } as never,
    })
    creados.instrumentos.push(String(otro.id))
    const cirugia = await payload.create({
      collection: 'cirugias',
      overrideAccess: true,
      draft: false,
      data: { nombre: `${marca} reparto`, _status: 'draft' } as never,
    })
    creados.cirugias.push(String(cirugia.id))

    // Se enlazan por SQL, saltándose la regla de la colección: es justo el estado que dejó el pasado, con modelos
    // de cuerpo puestos en un instrumento, y lo que la migración tiene que arreglar.
    const bd = (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<unknown> } }).drizzle
    await bd.execute(sql`UPDATE "instrumental" SET "modelo_id" = ${soloDelInstrumento.id} WHERE "id" = ${instrumento.id}`)
    await bd.execute(sql`UPDATE "instrumental" SET "modelo_id" = ${delInstrumentoYDeLaCirugia.id} WHERE "id" = ${otro.id}`)
    await bd.execute(sql`UPDATE "cirugias" SET "modelo_id" = ${delInstrumentoYDeLaCirugia.id} WHERE "id" = ${cirugia.id}`)

    await bd.execute(sql.raw(actualizacion))

    const claseDe = async (id: number) =>
      ((await payload.findByID({ collection: 'modelos-3d', id, overrideAccess: true, depth: 0 })) as unknown as { clase: string }).clase
    expect(await claseDe(soloDelInstrumento.id)).toBe('herramienta')
    expect(await claseDe(delInstrumentoYDeLaCirugia.id)).toBe('cuerpo')
    expect(await claseDe(suelto.id)).toBe('cuerpo')
  })
})

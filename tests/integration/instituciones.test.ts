import { randomBytes } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

/**
 * Las instituciones y su marca, contra una base de verdad (P-016 E5.1,
 * D-396). Las reglas del gancho se prueban en `marcaDeInstitucion.test.ts`;
 * aquí, que la columna existe en las tablas y en las versiones, que el
 * subdominio no se repite y que la marca no se mueve al publicar.
 */

const payload: Payload | null = await (async () => {
  try {
    const { getPayload } = await import('payload')
    const config = (await import('@payload-config')).default
    return await getPayload({ config })
  } catch {
    // Ver `acceso.test.ts`: el adaptador deja una promesa rechazada sin dueño.
    process.on('unhandledRejection', () => {})
    return null
  }
})()

const marca = randomBytes(4).toString('hex')

describe.skipIf(payload === null)('las instituciones (D-396)', () => {
  const base = payload as Payload
  const creadas: { coleccion: 'instituciones' | 'usuarios' | 'patologias' | 'segmentos'; id: number | string }[] = []

  afterAll(async () => {
    for (const { coleccion, id } of creadas.reverse()) {
      await base.delete({ collection: coleccion, id, overrideAccess: true }).catch(() => undefined)
    }
  })

  const crearInstitucion = async (subdominio: string) => {
    const institucion = await base.create({
      collection: 'instituciones',
      data: {
        nombre: `Universidad ${marca}`,
        subdominio,
        modalidad: 'piloto',
        inicio: new Date('2026-12-01T12:00:00.000Z').toISOString(),
        cupo: 30,
        correoDelAdministrador: `admin-${marca}@prueba.invalid`,
      },
      overrideAccess: true,
    })
    creadas.push({ coleccion: 'instituciones', id: institucion.id })
    return institucion
  }

  it('guarda el subdominio en minúsculas, y un piloto sin fecha vence a los 15 días', async () => {
    const institucion = await crearInstitucion(`  U${marca} `)
    expect(institucion.subdominio).toBe(`u${marca}`)
    expect(new Date(institucion.vence as string).toISOString()).toBe('2026-12-16T12:00:00.000Z')
  })

  it('no deja repetir un subdominio ni tomar uno reservado', async () => {
    await expect(crearInstitucion(`u${marca}`)).rejects.toThrow()
    await expect(crearInstitucion('mail')).rejects.toThrow()
  })

  it('el contenido de un docente lleva su institución, también en sus versiones, y no se mueve al publicar', async () => {
    const [institucion] = (
      await base.find({ collection: 'instituciones', where: { subdominio: { equals: `u${marca}` } }, overrideAccess: true })
    ).docs
    const otra = await crearInstitucion(`v${marca}`)
    const docente = await base.create({
      collection: 'usuarios',
      data: {
        nombre: `Docente ${marca}`,
        email: `docente-${marca}@prueba.invalid`,
        password: randomBytes(18).toString('base64url'),
        rol: 'editor',
        activo: true,
        institucion: institucion.id,
      } as never,
      overrideAccess: true,
    })
    creadas.push({ coleccion: 'usuarios', id: docente.id })
    expect((docente as { institucion?: unknown }).institucion).toMatchObject({ id: institucion.id })

    // Publicar pide el segmento.
    const segmento = await base.create({ collection: 'segmentos', data: { nombre: `Segmento ${marca}`, orden: 999 }, overrideAccess: true })
    creadas.push({ coleccion: 'segmentos', id: segmento.id })

    // El docente manda otra institución: el gancho la cambia por la suya.
    const ficha = await base.create({
      collection: 'patologias',
      data: { nombre: `Ficha ${marca}`, segmento: segmento.id, institucion: otra.id } as never,
      draft: true,
      user: docente,
      overrideAccess: true,
    })
    creadas.push({ coleccion: 'patologias', id: ficha.id })
    const deLaFicha = (doc: unknown) => {
      const valor = (doc as { institucion?: unknown }).institucion
      return typeof valor === 'object' && valor ? (valor as { id: unknown }).id : valor
    }
    expect(deLaFicha(ficha)).toBe(institucion.id)

    // Publicar es una actualización: la marca se queda donde estaba, aunque
    // el administrador central mande otra.
    const publicada = await base.update({
      collection: 'patologias',
      id: ficha.id,
      data: { _status: 'published', institucion: otra.id } as never,
      overrideAccess: true,
    })
    expect(deLaFicha(publicada)).toBe(institucion.id)

    const versiones = await base.findVersions({
      collection: 'patologias',
      where: { parent: { equals: ficha.id } },
      depth: 0,
      overrideAccess: true,
    })
    expect(versiones.docs.length).toBeGreaterThan(0)
    for (const version of versiones.docs) expect(deLaFicha(version.version)).toBe(institucion.id)
  })

  it('una fila de la cuenta, escrita sin sesión, lleva la institución de la cuenta', async () => {
    const [docente] = (
      await base.find({ collection: 'usuarios', where: { email: { equals: `docente-${marca}@prueba.invalid` } }, overrideAccess: true })
    ).docs
    const entrada = await base.create({
      collection: 'entradas',
      data: { fecha: new Date().toISOString(), usuario: docente.id, equipo: 'prueba' },
      overrideAccess: true,
    })
    try {
      const valor = (entrada as { institucion?: unknown }).institucion
      expect(typeof valor === 'object' && valor ? (valor as { id: unknown }).id : valor).toBe(
        (docente as { institucion: { id: unknown } }).institucion.id,
      )
    } finally {
      await base.delete({ collection: 'entradas', id: entrada.id, overrideAccess: true })
    }
  })
})

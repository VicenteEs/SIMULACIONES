import { describe, it, expect } from 'vitest'
import type { Payload } from 'payload'

/**
 * Pruebas de integración: exigen PostgreSQL en marcha.
 *
 * Comprueban lo que las unitarias no pueden: que la política de acceso llegue
 * de verdad hasta la consulta y no se quede en la interfaz. Un panel bien
 * protegido con una API abierta es el error clásico de este tipo de plataforma.
 *
 * La conexión se intenta al cargar el archivo, no en un `beforeAll`: las
 * condiciones de `describe` se evalúan durante la recolección de pruebas, de
 * modo que decidir ahí con una variable que se llena más tarde dejaría todo el
 * bloque omitido para siempre, incluso con la base disponible.
 */

const conexion = await (async (): Promise<Payload | null> => {
  try {
    const { getPayload } = await import('payload')
    const config = (await import('@payload-config')).default
    return await getPayload({ config })
  } catch {
    console.warn(
      'Sin base de datos: se omiten las pruebas de integración. ' +
        'Levante PostgreSQL con scripts/arrancar-local.sh.',
    )
    return null
  }
})()

const usuario = (rol: string, activo: boolean) =>
  ({ id: 1, rol, activo, collection: 'usuarios' }) as never

describe.skipIf(conexion === null)('acceso a través de la API local', () => {
  const payload = conexion as Payload

  it('una consulta sin usuario no devuelve documentos', async () => {
    const resultado = await payload.find({
      collection: 'patologias',
      overrideAccess: false,
      user: null,
    })
    expect(resultado.docs).toHaveLength(0)
  })

  it('una cuenta sin activar tampoco obtiene documentos', async () => {
    const resultado = await payload.find({
      collection: 'patologias',
      overrideAccess: false,
      user: usuario('lector', false),
    })
    expect(resultado.docs).toHaveLength(0)
  })

  it('un lector activo no recibe borradores', async () => {
    const borrador = await payload.create({
      collection: 'patologias',
      data: { nombre: 'Borrador de prueba', _status: 'draft' } as never,
      overrideAccess: true,
    })

    const resultado = await payload.find({
      collection: 'patologias',
      overrideAccess: false,
      user: usuario('lector', true),
    })

    expect(resultado.docs.map((d) => d.id)).not.toContain(borrador.id)

    await payload.delete({ collection: 'patologias', id: borrador.id, overrideAccess: true })
  })

  it('un editor no puede crear cuentas de usuario', async () => {
    await expect(
      payload.create({
        collection: 'usuarios',
        data: {
          email: 'intruso@ejemplo.cl',
          password: 'una-clave-larga-de-prueba',
          nombre: 'Intruso',
          rol: 'admin',
          activo: true,
        } as never,
        overrideAccess: false,
        user: usuario('editor', true),
      }),
    ).rejects.toThrow()
  })
})

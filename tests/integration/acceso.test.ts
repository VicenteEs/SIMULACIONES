import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Payload } from 'payload'

/**
 * Pruebas de integración: exigen PostgreSQL en marcha.
 *
 * Comprueban lo que las unitarias no alcanzan: que la política de acceso llegue
 * hasta la consulta y no se quede en la interfaz. Un panel bien protegido sobre
 * una API abierta es el error clásico de este tipo de plataforma.
 *
 * La conexión se intenta al cargar el archivo y no en un `beforeAll`: las
 * condiciones de `describe` se evalúan durante la recolección, de modo que
 * decidir allí con una variable llenada más tarde dejaría el bloque omitido
 * para siempre, incluso con la base disponible.
 */

const conexion = await (async (): Promise<Payload | null> => {
  try {
    const { getPayload } = await import('payload')
    const config = (await import('@payload-config')).default
    return await getPayload({ config })
  } catch (error) {
    console.warn(
      'Se omiten las pruebas de integración. Causa: ' +
        (error instanceof Error ? error.message : String(error)),
    )
    return null
  }
})()

const usuario = (rol: string, activo: boolean) =>
  ({ id: 1, rol, activo, collection: 'usuarios' }) as never

/**
 * Comprueba que la operación fue rechazada por falta de permiso.
 *
 * Se mira el código de estado y no el texto del error: el panel está en
 * español, de modo que el mensaje depende del idioma y una aserción sobre la
 * frase se rompería al cambiarlo. El 403 no cambia nunca.
 */
async function esperarRechazoPorPermiso(operacion: Promise<unknown>) {
  const error = await operacion.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error, 'la operación debía ser rechazada y no lo fue').not.toBeNull()
  expect((error as { status?: number }).status).toBe(403)
}

describe.skipIf(conexion === null)('acceso a través de la API local', () => {
  const payload = conexion as Payload
  let segmentoId: number | string
  const creados: (number | string)[] = []

  beforeAll(async () => {
    const segmento = await payload.create({
      collection: 'segmentos',
      data: { nombre: 'Segmento de prueba', orden: 999 },
      overrideAccess: true,
    })
    segmentoId = segmento.id
  })

  afterAll(async () => {
    for (const id of creados) {
      await payload.delete({ collection: 'patologias', id, overrideAccess: true }).catch(() => {})
    }
    if (segmentoId) {
      await payload
        .delete({ collection: 'segmentos', id: segmentoId, overrideAccess: true })
        .catch(() => {})
    }
  })

  it('rechaza la consulta cuando no hay sesión', async () => {
    // Payload no devuelve una lista vacía: rechaza la operación entera, que es
    // el comportamiento más seguro de los dos.
    await esperarRechazoPorPermiso(
      payload.find({ collection: 'patologias', overrideAccess: false, user: null }),
    )
  })

  it('rechaza la consulta de una cuenta que el administrador no ha activado', async () => {
    await esperarRechazoPorPermiso(
      payload.find({
        collection: 'patologias',
        overrideAccess: false,
        user: usuario('lector', false),
      }),
    )
  })

  it('un lector activo sí puede consultar, pero no recibe borradores', async () => {
    const borrador = await payload.create({
      collection: 'patologias',
      data: { nombre: 'Borrador de prueba', segmento: segmentoId, _status: 'draft' } as never,
      overrideAccess: true,
      draft: true,
    })
    creados.push(borrador.id)

    const resultado = await payload.find({
      collection: 'patologias',
      overrideAccess: false,
      user: usuario('lector', true),
    })

    expect(resultado.docs.map((d) => d.id)).not.toContain(borrador.id)
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

  it('un editor sí puede crear contenido', async () => {
    const ficha = await payload.create({
      collection: 'patologias',
      data: { nombre: 'Ficha del editor', segmento: segmentoId } as never,
      overrideAccess: false,
      user: usuario('editor', true),
    })
    creados.push(ficha.id)
    expect(ficha.id).toBeTruthy()
  })
  it('un lector activo recibe la ficha publicada con sus bloques', async () => {
    const publicada = await payload.create({
      collection: 'patologias',
      data: {
        nombre: 'Ficha publicada de prueba',
        segmento: segmentoId,
        _status: 'published',
        definicion: [{ blockType: 'advertencia', tono: 'perla', texto: 'Contenido visible.' }],
      } as never,
      overrideAccess: true,
    })
    creados.push(publicada.id)

    const resultado = await payload.find({
      collection: 'patologias',
      overrideAccess: false,
      user: usuario('lector', true),
      depth: 1,
    })

    const encontrada = resultado.docs.find((d) => d.id === publicada.id)
    expect(encontrada, 'la ficha publicada debía llegar al lector').toBeTruthy()
    // El contenido viaja completo: es lo que la página renderiza en bloques.
    expect(Array.isArray((encontrada as { definicion?: unknown }).definicion)).toBe(true)
  })
})

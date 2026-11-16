import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

/**
 * El panel de cada lugar contra una base de verdad (P-016 E5.6, D-401): el
 * administrador de una institución administra solo sus cuentas, y el de
 * TraumaHub, solo las de TraumaHub.
 *
 * Las acciones del panel leen y escriben con `overrideAccess: true`, así que
 * las reglas de `reglas.ts` no las alcanzan. Lo que las recorta es el Payload
 * que les da la guardia (`payloadDelLugar`), y es lo que se prueba aquí: con el
 * identificador de una cuenta ajena en la mano, como lo mandaría un navegador
 * manipulado. En la central no hay segunda barrera en la base (D-399), así que
 * esto es lo único que hay entre el administrador de TraumaHub y las cuentas
 * de las instituciones.
 */

const estado = vi.hoisted(() => ({ sesion: null as unknown }))

vi.mock('@/lib/sesion', () => ({ obtenerSesion: async () => estado.sesion }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
// El almacén de la petición que lee la barrera (D-399). Fuera del servidor de
// Next, el suyo es uno de mentira que lanza al usarlo; dentro, es este mismo de
// Node. Con él, una prueba puede hacer como si estuviera en el subdominio de
// una institución.
vi.mock('next/dist/server/app-render/work-unit-async-storage.external', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  return { workUnitAsyncStorage: new AsyncLocalStorage() }
})

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

type Lugar = 'central' | 'A' | 'B'
type Actor = 'adminCentral' | 'lectorCentral' | 'adminA' | 'editorA' | 'lectorA' | 'adminB' | 'lectorB'

const ACTORES: Record<Actor, { lugar: Lugar; rol: 'admin' | 'editor' | 'lector' }> = {
  adminCentral: { lugar: 'central', rol: 'admin' },
  lectorCentral: { lugar: 'central', rol: 'lector' },
  adminA: { lugar: 'A', rol: 'admin' },
  editorA: { lugar: 'A', rol: 'editor' },
  lectorA: { lugar: 'A', rol: 'lector' },
  adminB: { lugar: 'B', rol: 'admin' },
  lectorB: { lugar: 'B', rol: 'lector' },
}

describe.skipIf(payload === null)('el panel de cada lugar (D-401)', () => {
  const base = payload as Payload
  const instituciones: Partial<Record<Lugar, number | string>> = {}
  const cuentas = {} as Record<Actor, Record<string, unknown> & { id: number | string }>
  /** Las que crean las propias pruebas, para borrarlas al final. */
  const creadas: (number | string)[] = []
  let admin: typeof import('@/app/(frontend)/acciones/admin')
  let revision: typeof import('@/app/(frontend)/acciones/revision')
  let datos: typeof import('@/app/(frontend)/admin-panel/datos')
  let contenido: typeof import('@/app/(frontend)/acciones/contenido')
  const fichas: Partial<Record<Lugar, number | string>> = {}
  let segmento: number | string | undefined

  const como = (actor: Actor) => {
    const usuario = cuentas[actor]
    estado.sesion = { usuario, activo: true, rolReal: usuario.rol, rol: usuario.rol }
  }
  const releer = async (actor: Actor) =>
    (await base.findByID({ collection: 'usuarios', id: cuentas[actor].id, depth: 0 })) as unknown as Record<string, unknown>

  beforeAll(async () => {
    for (const lugar of ['A', 'B'] as const) {
      const fila = await base.create({
        collection: 'instituciones',
        data: {
          nombre: `Institución ${lugar} ${marca}`,
          subdominio: `${lugar.toLowerCase()}${marca}`,
          modalidad: 'piloto',
          inicio: new Date().toISOString(),
          cupo: 10,
          correoDelAdministrador: `admin-${lugar}-${marca}@prueba.invalid`,
        },
        overrideAccess: true,
      })
      instituciones[lugar] = fila.id
    }
    for (const [actor, { lugar, rol }] of Object.entries(ACTORES) as [Actor, (typeof ACTORES)[Actor]][]) {
      cuentas[actor] = (await base.create({
        collection: 'usuarios',
        data: {
          nombre: `${actor} ${marca}`,
          email: `${actor.toLowerCase()}-${marca}@prueba.invalid`,
          password: randomBytes(18).toString('base64url'),
          rol,
          activo: true,
          ...(lugar === 'central' ? {} : { institucion: instituciones[lugar] }),
        } as never,
      })) as unknown as Record<string, unknown> & { id: number | string }
    }
    segmento = (await base.create({ collection: 'segmentos', data: { nombre: `Segmento ${marca}`, orden: 995 } })).id
    for (const lugar of ['central', 'A'] as const) {
      const fila = await base.create({
        collection: 'patologias',
        data: { nombre: `Ficha ${lugar} ${marca}`, segmento, institucion: instituciones[lugar] ?? null, _status: 'draft' } as never,
        draft: true,
      })
      fichas[lugar] = fila.id
    }
    admin = await import('@/app/(frontend)/acciones/admin')
    contenido = await import('@/app/(frontend)/acciones/contenido')
    revision = await import('@/app/(frontend)/acciones/revision')
    datos = await import('@/app/(frontend)/admin-panel/datos')
  }, 120_000)

  afterAll(async () => {
    for (const id of Object.values(fichas)) {
      await base.delete({ collection: 'patologias', id: id as number }).catch(() => undefined)
    }
    if (segmento !== undefined) await base.delete({ collection: 'segmentos', id: segmento as number }).catch(() => undefined)
    for (const id of [...creadas, ...Object.values(cuentas).map((c) => c.id)]) {
      await base.delete({ collection: 'usuarios', id }).catch(() => undefined)
    }
    for (const id of Object.values(instituciones)) {
      await base.delete({ collection: 'instituciones', id: id as number }).catch(() => undefined)
    }
  })

  it('la pantalla de cuentas de una institución lista solo las suyas, y la de TraumaHub, solo las de TraumaHub', async () => {
    const deMarca = { email: { like: marca } }

    como('adminA')
    const enA = await (await datos.clientePayload()).find({ collection: 'usuarios', where: deMarca, limit: 50, depth: 0 })
    expect(enA.docs.map((d) => d.id).sort()).toEqual([cuentas.adminA.id, cuentas.editorA.id, cuentas.lectorA.id].sort())

    como('adminCentral')
    const enLaCentral = await (await datos.clientePayload()).count({ collection: 'usuarios', where: deMarca })
    expect(enLaCentral.totalDocs).toBe(2)

    // La de todas sigue viéndolas todas: es la de las pantallas de TraumaHub.
    const deTodas = await (await datos.clientePayloadDeTodas()).count({ collection: 'usuarios', where: deMarca })
    expect(deTodas.totalDocs).toBe(Object.keys(ACTORES).length)
  })

  it('el administrador de una institución no toca una cuenta de otra, ni una de TraumaHub', async () => {
    como('adminA')
    for (const ajena of ['lectorB', 'adminCentral'] as const) {
      const cambio = await admin.actualizarUsuario(String(cuentas[ajena].id), { rol: 'admin' })
      expect(cambio.exito, ajena).toBe(false)
      expect(cambio.mensaje).toBe('No se encontró.')
      expect((await admin.cambiarActivoUsuario(String(cuentas[ajena].id), false)).exito, ajena).toBe(false)
      expect((await admin.generarEnlaceDeClave(String(cuentas[ajena].id))).exito, ajena).toBe(false)
      expect((await admin.eliminarUsuario(String(cuentas[ajena].id))).exito, ajena).toBe(false)
      expect((await admin.entradasDeUnaCuenta(String(cuentas[ajena].id))).exito, ajena).toBe(false)
    }
    expect(await releer('lectorB')).toMatchObject({ rol: 'lector', activo: true })
    expect(await releer('adminCentral')).toMatchObject({ rol: 'admin', activo: true })
  })

  it('pero sí las suyas', async () => {
    como('adminA')
    const r = await admin.actualizarUsuario(String(cuentas.lectorA.id), { nombre: `Lectora A ${marca}` })
    expect(r.exito, r.mensaje).toBe(true)
    expect(await releer('lectorA')).toMatchObject({ nombre: `Lectora A ${marca}`, institucion: instituciones.A })
  })

  it('y el de TraumaHub tampoco toca las de una institución desde «Usuarios»', async () => {
    // Las alcanza solo desde «Instituciones», al devolverle la llave a su
    // administrador (D-400).
    como('adminCentral')
    const r = await admin.cambiarActivoUsuario(String(cuentas.lectorA.id), false)
    expect(r.exito).toBe(false)
    expect(await releer('lectorA')).toMatchObject({ activo: true })
  })

  it('una cuenta nueva creada por el administrador de una institución es de su institución', async () => {
    como('adminB')
    const r = await admin.crearUsuario(`nueva-${marca}@prueba.invalid`, `Nueva ${marca}`, randomBytes(18).toString('base64url'), 'lector')
    expect(r.exito, r.mensaje).toBe(true)
    const creada = await base.findByID({ collection: 'usuarios', id: r.datos!.id, depth: 0 })
    creadas.push(creada.id)
    expect(creada).toMatchObject({ institucion: instituciones.B })
  })

  it('el contenido de otro lugar tampoco se borra desde el panel, en ninguno de los dos sentidos', async () => {
    como('editorA')
    expect((await contenido.eliminarDocumento('patologias', String(fichas.central))).exito).toBe(false)
    como('adminCentral')
    expect((await contenido.eliminarDocumento('patologias', String(fichas.A))).exito).toBe(false)
    for (const lugar of ['central', 'A'] as const) {
      const sigue = await base.findByID({ collection: 'patologias', id: fichas[lugar]!, draft: true, depth: 0, disableErrors: true })
      expect(sigue, lugar).not.toBeNull()
    }
  })

  it('borrar una cuenta desde su institución retoca también lo que la central anotó sobre ella', async () => {
    const { workUnitAsyncStorage } = await import('next/dist/server/app-render/work-unit-async-storage.external')
    // Como una petición al subdominio de A: es lo que la barrera mira (D-399).
    const desdeA = <T>(trabajo: () => Promise<T>) =>
      workUnitAsyncStorage.run({ headers: new Headers({ 'x-traumahub-subdominio': `a${marca}` }) } as never, trabajo)

    const alumna = await base.create({
      collection: 'usuarios',
      data: {
        nombre: `Alumna ${marca}`,
        email: `alumna-${marca}@prueba.invalid`,
        password: randomBytes(18).toString('base64url'),
        rol: 'lector',
        activo: true,
        institucion: instituciones.A,
      } as never,
    })
    creadas.push(alumna.id)
    const sobreElla = (quien: Actor) =>
      base.create({
        collection: 'registro-de-acciones',
        data: {
          fecha: new Date().toISOString(),
          accion: 'creo',
          coleccion: 'usuarios',
          documentoId: String(alumna.id),
          titulo: `Alumna ${marca}`,
          usuario: cuentas[quien].id,
        } as never,
      })
    const enLaCentral = await sobreElla('adminCentral')
    const enA = await sobreElla('adminA')
    try {
      expect(enLaCentral.institucion ?? null).toBeNull()
      // Desde A, la fila de la central no se ve: sin el paso aparte, quedaría con el nombre.
      const vista = await desdeA(() =>
        base.count({ collection: 'registro-de-acciones', where: { id: { equals: enLaCentral.id } }, overrideAccess: true }),
      )
      expect(vista.totalDocs).toBe(0)

      await desdeA(() => base.delete({ collection: 'usuarios', id: alumna.id }))

      for (const fila of [enLaCentral, enA]) {
        const despues = await base.findByID({ collection: 'registro-de-acciones', id: fila.id, depth: 0 })
        expect(despues.titulo ?? null).toBeNull()
      }
    } finally {
      for (const fila of [enLaCentral, enA]) {
        await base.delete({ collection: 'registro-de-acciones', id: fila.id }).catch(() => undefined)
      }
    }
  })

  it('los revisores que se ofrecen son de la misma institución', async () => {
    como('adminA')
    const r = await revision.revisoresPosibles()
    expect(r.exito, r.mensaje).toBe(true)
    const ids = (r.datos ?? []).map((c) => c.id)
    expect(ids).toEqual(expect.arrayContaining([String(cuentas.adminA.id), String(cuentas.editorA.id)]))
    expect(ids).not.toContain(String(cuentas.adminCentral.id))
    expect(ids).not.toContain(String(cuentas.adminB.id))
  })
})

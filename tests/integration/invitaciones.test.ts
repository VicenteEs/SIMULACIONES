import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

/**
 * El enlace de invitación de una institución y su cupo contra una base de
 * verdad (P-016 E5.7, D-402).
 *
 * Las solicitudes corren como en el subdominio de la institución: con la
 * cabecera que deja `proxy.ts` y con el almacén de la petición que mira la
 * barrera de la base (D-399), que es lo que hace que una cuenta de otro lugar
 * no se vea. Lo que se comprueba de cada una es lo que quedó en la base y el
 * correo que salió, no solo la respuesta, que a propósito es la misma pase lo
 * que pase.
 */

const estado = vi.hoisted(() => ({
  sesion: null as unknown,
  cabeceras: new Headers(),
  correos: [] as { para: unknown; correo: { titulo?: string; bloques?: { texto?: string }[]; boton?: { enlace?: string } } }[],
}))

vi.mock('@/lib/sesion', () => ({ obtenerSesion: async () => estado.sesion }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/headers', () => ({
  headers: async () => estado.cabeceras,
  cookies: async () => ({ delete: () => {}, set: () => {}, get: () => undefined }),
}))
vi.mock('next/dist/server/app-render/work-unit-async-storage.external', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  return { workUnitAsyncStorage: new AsyncLocalStorage() }
})
// Los correos se anotan en vez de salir. Sin servidor de correo configurado,
// como en esta máquina: el acuse y los avisos al titular salen igual por
// `enviarSinEsperar`, que es donde se miran.
vi.mock('@/correo/enviar', async (original) => ({
  ...(await original<typeof import('@/correo/enviar')>()),
  hayCorreo: () => false,
  enviarSinEsperar: (_payload: unknown, envio: (typeof estado.correos)[number]) => {
    estado.correos.push(envio)
  },
}))
// El suelo de segundo y medio de cada solicitud no cambia nada de lo que se
// mira aquí, y con quince solicitudes serían veinte segundos de espera.
vi.mock('@/lib/formularioPublico', async (original) => ({
  ...(await original<typeof import('@/lib/formularioPublico')>()),
  esperarElSuelo: async () => {},
}))

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
const CENTRAL = 'https://traumahub.prueba.invalid'

describe.skipIf(payload === null)('el enlace de invitación y el cupo (D-402)', () => {
  const base = payload as Payload
  const instituciones = {} as Record<'A' | 'B', { id: number | string; subdominio: string; nombre: string }>
  const cuentas = {} as Record<'adminA' | 'adminCentral' | 'deLaCentral' | 'deB', Record<string, unknown> & { id: number | string }>
  let admin: typeof import('@/app/(frontend)/acciones/admin')
  let sesion: typeof import('@/app/(frontend)/acciones/sesion')
  let version: string
  let direccionAntes: string | undefined
  let pruebasAntes: string | undefined
  let ip = 0
  /**
   * El almacén de la petición, importado una vez en `beforeAll`. Importarlo en
   * cada llamada fallaba con dos a la vez: la segunda importación, mientras la
   * primera todavía corría el doble, recibía el módulo de verdad de Next.
   */
  let almacen: { run: <T>(store: unknown, trabajo: () => T) => T }

  /** Corre `trabajo` como una petición al subdominio de A, o a la central. */
  const en = async <T>(lugar: 'A' | 'central', trabajo: () => Promise<T>): Promise<T> => {
    const cabeceras = new Headers({ 'x-forwarded-for': `10.9.0.${++ip % 250}` })
    if (lugar === 'A') cabeceras.set('x-traumahub-subdominio', instituciones.A.subdominio)
    estado.cabeceras = cabeceras
    return almacen.run({ headers: cabeceras }, trabajo)
  }

  const como = (quien: keyof typeof cuentas) => {
    const usuario = cuentas[quien]
    estado.sesion = { usuario, activo: true, rolReal: usuario.rol, rol: usuario.rol }
  }

  const codigoDe = async (lugar: 'A' | 'B') =>
    ((await base.findByID({ collection: 'instituciones', id: instituciones[lugar].id, depth: 0, overrideAccess: true })) as {
      codigoDeInvitacion?: string | null
    }).codigoDeInvitacion ?? ''

  const solicitud = (correo: string, invitacion?: string) => ({
    nombre: 'Alumna de prueba',
    correo,
    institucion: 'Servicio de Traumatología',
    contrasena: randomBytes(18).toString('base64url'),
    avisoDePrivacidadAceptado: version,
    ...(invitacion === undefined ? {} : { invitacion }),
  })

  /** La cuenta con ese correo, mirada sin barrera, como la vería un guion. */
  const cuentaCon = async (correo: string) =>
    (await base.find({ collection: 'usuarios', where: { email: { equals: correo } }, depth: 0, limit: 1, overrideAccess: true }))
      .docs[0] as unknown as (Record<string, unknown> & { id: number | string }) | undefined

  const activasDeA = async () =>
    (
      await base.count({
        collection: 'usuarios',
        where: { and: [{ activo: { equals: true } }, { institucion: { equals: instituciones.A.id } }] },
        overrideAccess: true,
      })
    ).totalDocs

  /** Una solicitud pendiente de A, creada directamente. */
  const pendienteDeA = async (nombre: string) =>
    (await base.create({
      collection: 'usuarios',
      data: {
        nombre,
        email: `${nombre}-${marca}@prueba.invalid`,
        password: randomBytes(18).toString('base64url'),
        rol: 'lector',
        activo: false,
        pendiente: true,
        origen: 'solicitud',
        institucion: instituciones.A.id,
      } as never,
    })) as unknown as { id: number | string }

  beforeAll(async () => {
    direccionAntes = process.env.NEXT_PUBLIC_SERVER_URL
    pruebasAntes = process.env.SERVIDOR_DE_PRUEBAS
    process.env.NEXT_PUBLIC_SERVER_URL = CENTRAL
    delete process.env.SERVIDOR_DE_PRUEBAS
    version = (await import('@/lib/avisoDePrivacidad')).VERSION_DEL_AVISO_DE_PRIVACIDAD

    for (const [lugar, cupo] of [
      ['A', 2],
      ['B', 5],
    ] as const) {
      const subdominio = `inv${lugar.toLowerCase()}${marca}`
      const nombre = `Hospital ${lugar} ${marca}`
      const fila = await base.create({
        collection: 'instituciones',
        data: {
          nombre,
          subdominio,
          modalidad: 'piloto',
          inicio: new Date().toISOString(),
          cupo,
          correoDelAdministrador: `admin-inv${lugar}-${marca}@prueba.invalid`,
        },
        overrideAccess: true,
      })
      instituciones[lugar] = { id: fila.id, subdominio, nombre }
    }
    const crear = async (nombre: string, rol: string, institucion: number | string | null) =>
      (await base.create({
        collection: 'usuarios',
        data: {
          nombre: `${nombre} ${marca}`,
          email: `${nombre.toLowerCase()}-${marca}@prueba.invalid`,
          password: randomBytes(18).toString('base64url'),
          rol,
          activo: true,
          ...(institucion === null ? {} : { institucion }),
        } as never,
      })) as unknown as Record<string, unknown> & { id: number | string }
    cuentas.adminA = await crear('adminA', 'admin', instituciones.A.id)
    cuentas.adminCentral = await crear('adminCentral', 'admin', null)
    cuentas.deLaCentral = await crear('deLaCentral', 'lector', null)
    cuentas.deB = await crear('deB', 'lector', instituciones.B.id)

    almacen = (await import('next/dist/server/app-render/work-unit-async-storage.external'))
      .workUnitAsyncStorage as unknown as typeof almacen
    admin = await import('@/app/(frontend)/acciones/admin')
    sesion = await import('@/app/(frontend)/acciones/sesion')
  }, 120_000)

  afterAll(async () => {
    if (direccionAntes === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
    else process.env.NEXT_PUBLIC_SERVER_URL = direccionAntes
    if (pruebasAntes !== undefined) process.env.SERVIDOR_DE_PRUEBAS = pruebasAntes
    const deEstaPasada = await base.find({
      collection: 'usuarios',
      where: { email: { like: marca } },
      limit: 200,
      depth: 0,
      overrideAccess: true,
    })
    for (const cuenta of deEstaPasada.docs) {
      await base.delete({ collection: 'usuarios', id: cuenta.id }).catch(() => undefined)
    }
    for (const { id } of Object.values(instituciones)) {
      await base.delete({ collection: 'instituciones', id: id as number }).catch(() => undefined)
    }
  })

  it('cada institución nace con su código, y la API no lo enseña ni al administrador de TraumaHub', async () => {
    expect(await codigoDe('A')).toMatch(/^[A-Za-z0-9_-]{20}$/)
    expect(await codigoDe('A')).not.toBe(await codigoDe('B'))
    const vista = await base.findByID({
      collection: 'instituciones',
      id: instituciones.A.id,
      depth: 0,
      overrideAccess: false,
      user: cuentas.adminCentral as never,
    })
    expect(vista.nombre).toBe(instituciones.A.nombre)
    expect((vista as { codigoDeInvitacion?: unknown }).codigoDeInvitacion).toBeUndefined()
  })

  it('en una institución, sin el enlace o con el de otra, no se pide cuenta', async () => {
    const correo = `sin-enlace-${marca}@prueba.invalid`
    const sinCodigo = await en('A', () => sesion.solicitarCuenta(solicitud(correo)))
    expect(sinCodigo.exito).toBe(false)
    expect(sinCodigo.mensaje).toMatch(/enlace de invitación no es válido/)
    const conElDeB = await en('A', async () => sesion.solicitarCuenta(solicitud(correo, await codigoDe('B'))))
    expect(conElDeB.exito).toBe(false)
    expect(await cuentaCon(correo)).toBeUndefined()
  })

  it('con el enlace, la cuenta nace pendiente en su institución, y un curso entero desde la misma red no choca con el freno', async () => {
    const codigo = await codigoDe('A')
    // Siete desde la misma dirección: en la central, el sexto ya leía
    // «demasiadas solicitudes».
    const misma = new Headers({ 'x-forwarded-for': '10.8.0.1', 'x-traumahub-subdominio': instituciones.A.subdominio })
    for (let i = 0; i < 7; i++) {
      estado.cabeceras = misma
      const r = await almacen.run({ headers: misma }, () =>
        sesion.solicitarCuenta(solicitud(`curso${i}-${marca}@prueba.invalid`, ` ${codigo}\n`)),
      )
      expect(r.exito, r.mensaje).toBe(true)
    }
    for (let i = 0; i < 7; i++) {
      const cuenta = await cuentaCon(`curso${i}-${marca}@prueba.invalid`)
      expect(cuenta, `curso${i}`).toMatchObject({ pendiente: true, activo: false, rol: 'lector' })
      expect(cuenta?.institucion).toBe(instituciones.A.id)
    }
  })

  it('en la central el código no hace falta, y si llega no se mira', async () => {
    const correo = `central-${marca}@prueba.invalid`
    expect((await en('central', () => sesion.solicitarCuenta(solicitud(correo, 'cualquiera')))).exito).toBe(true)
    expect(await cuentaCon(correo)).toMatchObject({ pendiente: true, institucion: null })
  })

  it('un correo con cuenta en otro lugar no crea otra: el titular recibe dónde está, con los enlaces de allí', async () => {
    const codigo = await codigoDe('A')
    for (const [quien, nombre, direccion] of [
      ['deLaCentral', 'TraumaHub', CENTRAL],
      ['deB', instituciones.B.nombre, `https://${instituciones.B.subdominio}.traumahub.prueba.invalid`],
    ] as const) {
      estado.correos = []
      const correo = String(cuentas[quien].email)
      const r = await en('A', () => sesion.solicitarCuenta(solicitud(correo, codigo)))
      expect(r.exito, quien).toBe(true)
      const aviso = estado.correos.find((c) => c.para === correo)
      expect(aviso?.correo.titulo, quien).toBe('Ya tiene una cuenta')
      expect(aviso?.correo.bloques?.[0]?.texto, quien).toContain(`en ${nombre}`)
      expect(aviso?.correo.boton?.enlace, quien).toBe(`${direccion}/entrar`)
      const sigue = await cuentaCon(correo)
      expect(sigue?.id, quien).toBe(cuentas[quien].id)
      expect(sigue?.institucion ?? null, quien).toBe(quien === 'deB' ? instituciones.B.id : null)
    }
  })

  it('el cupo: se aprueba hasta llenarlo, y lleno no se activa por ningún camino', async () => {
    como('adminA')
    // A tiene cupo 2 y su administrador ya ocupa uno.
    expect(await activasDeA()).toBe(1)
    const primera = await pendienteDeA('primera')
    const segunda = await pendienteDeA('segunda')

    const aprobada = await en('A', () => admin.resolverSolicitud(String(primera.id), 'activar', 'lector'))
    expect(aprobada.exito, aprobada.mensaje).toBe(true)
    expect(await activasDeA()).toBe(2)

    const llena = await en('A', () => admin.resolverSolicitud(String(segunda.id), 'activar', 'lector'))
    expect(llena.exito).toBe(false)
    expect(llena.mensaje).toMatch(/llenó su cupo: 2 de 2 cuentas activas/)
    expect(await en('A', () => admin.cambiarActivoUsuario(String(segunda.id), true))).toMatchObject({ exito: false })
    const creada = await en('A', () =>
      admin.crearUsuario(`tercera-${marca}@prueba.invalid`, 'Tercera', randomBytes(18).toString('base64url'), 'lector'),
    )
    expect(creada.exito).toBe(false)
    expect(await cuentaCon(`tercera-${marca}@prueba.invalid`)).toBeUndefined()
    expect(await activasDeA()).toBe(2)

    // Desactivada no ocupa lugar: se crea igual.
    const desactivada = await en('A', () =>
      admin.crearUsuario(`cuarta-${marca}@prueba.invalid`, 'Cuarta', randomBytes(18).toString('base64url'), 'lector', '', false),
    )
    expect(desactivada.exito, desactivada.mensaje).toBe(true)

    // Activar la que ya está activa no le quita sitio a nadie.
    expect(await en('A', () => admin.cambiarActivoUsuario(String(primera.id), true))).toMatchObject({ exito: true })

    // Desactivar una libera su lugar.
    expect(await en('A', () => admin.cambiarActivoUsuario(String(primera.id), false))).toMatchObject({ exito: true })
    expect(await en('A', () => admin.resolverSolicitud(String(segunda.id), 'activar', 'lector'))).toMatchObject({ exito: true })
    expect(await activasDeA()).toBe(2)
  })

  it('dos aprobaciones a la vez con un solo lugar libre: entra una', async () => {
    como('adminA')
    await base.update({ collection: 'instituciones', id: instituciones.A.id, data: { cupo: (await activasDeA()) + 1 }, overrideAccess: true })
    const una = await pendienteDeA('carrera-una')
    const otra = await pendienteDeA('carrera-otra')
    const resultados = await Promise.all(
      [una, otra].map((s) => en('A', () => admin.resolverSolicitud(String(s.id), 'activar', 'lector'))),
    )
    expect(resultados.filter((r) => r.exito)).toHaveLength(1)
    expect(resultados.find((r) => !r.exito)?.mensaje).toMatch(/llenó su cupo/)
    const cupo = ((await base.findByID({ collection: 'instituciones', id: instituciones.A.id, overrideAccess: true })) as { cupo: number }).cupo
    expect(await activasDeA()).toBe(cupo)
  })

  it('cambiar el enlace deja sin efecto el viejo; y en la central no hay enlace que cambiar', async () => {
    const viejo = await codigoDe('A')
    como('adminA')
    const r = await en('A', () => admin.regenerarCodigoDeInvitacion())
    expect(r.exito, r.mensaje).toBe(true)
    const nuevo = await codigoDe('A')
    expect(nuevo).not.toBe(viejo)
    expect(r.datos?.enlace).toBe(
      `https://${instituciones.A.subdominio}.traumahub.prueba.invalid/registro?invitacion=${encodeURIComponent(nuevo)}`,
    )

    const conElViejo = await en('A', () => sesion.solicitarCuenta(solicitud(`viejo-${marca}@prueba.invalid`, viejo)))
    expect(conElViejo.exito).toBe(false)
    const conElNuevo = await en('A', () => sesion.solicitarCuenta(solicitud(`nuevo-${marca}@prueba.invalid`, nuevo)))
    expect(conElNuevo.exito, conElNuevo.mensaje).toBe(true)

    como('adminCentral')
    const central = await en('central', () => admin.regenerarCodigoDeInvitacion())
    expect(central.exito).toBe(false)
    expect(await codigoDe('A')).toBe(nuevo)
  })
})

import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { Payload } from 'payload'
import { MENSAJE_DE_OTRA_ENTRADA, sidDelTestigo, type DatosDelEquipo } from '@/lib/entradas'

/**
 * Una sesión por cuenta y las alertas de entradas imposibles (D-374, D-388),
 * contra Payload y PostgreSQL de verdad.
 *
 * De integración porque lo que se comprueba está en tres sitios que una prueba
 * unitaria tendría que simular, y en los tres el fallo sería mudo: que el gancho
 * de entrada corra dentro del `payload.login`, que la lista de sesiones que deja
 * llegue a `usuarios_sessions` —y que la estrategia JWT rechace por eso el
 * testigo viejo—, y que las entradas, la alerta y su borrado con la cuenta
 * lleguen a la base.
 */

// `obtenerSesion` y `salir` leen la petición con `next/headers`, que fuera de
// Next no existe. Se sustituye solo eso.
const peticion = { cabeceras: new Headers() }
vi.mock('next/headers', () => ({
  headers: async () => peticion.cabeceras,
  cookies: async () => ({ delete: () => {}, set: () => {}, get: () => undefined }),
}))

// El correo de la alerta. Las pruebas no tienen servidor de correo (`tests/setup.ts`),
// y sin él `alertar` ni siquiera busca a quién escribir: se finge que lo hay solo
// mientras corren las alertas, y el envío se queda en el espía. Fingirlo desde el
// principio haría que cualquier otro aviso de la cuenta pasara por el espía.
const correo = vi.hoisted(() => ({ activo: false, enviar: vi.fn() }))
vi.mock('@/correo/enviar', async (original) => ({
  ...(await original<typeof import('@/correo/enviar')>()),
  hayCorreo: () => correo.activo,
  enviarSinEsperar: correo.enviar,
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

const PABELLON: DatosDelEquipo = { equipo: 'Chrome en Windows', ip: '10.0.0.1', pais: 'CL' }
const TELEFONO: DatosDelEquipo = { equipo: 'Safari en iPhone', ip: '10.0.0.2', pais: 'CL' }

describe.skipIf(payload === null)('una sesión por cuenta', () => {
  const base = payload as Payload
  const email = `entradas-${randomBytes(6).toString('hex')}@prueba.invalid`
  const password = randomBytes(18).toString('base64url')
  let cuentaId: number | string
  let borrada = false
  // Un administrador activo, para que la alerta tenga a quién escribir aunque la
  // base de pruebas no traiga ninguno.
  const administrador = `entradas-admin-${randomBytes(6).toString('hex')}@prueba.invalid`
  let administradorId: number | string

  const cabecerasCon = (testigo: string) =>
    new Headers({ cookie: `${base.config.cookiePrefix}-token=${testigo}`, 'sec-fetch-site': 'same-origin' })
  const sesionDe = async (testigo: string) => (await base.auth({ headers: cabecerasCon(testigo) })).user
  const entrarDesde = async (entrada: DatosDelEquipo) =>
    (await base.login({ collection: 'usuarios', data: { email, password }, context: { entrada } })).token as string

  const entradas = async () =>
    (
      await base.find({
        collection: 'entradas',
        where: { usuario: { equals: cuentaId } },
        sort: 'fecha',
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
    ).docs as unknown as Record<string, unknown>[]
  const alertas = async () =>
    (
      await base.find({
        collection: 'registro-de-acciones',
        where: { and: [{ usuario: { equals: cuentaId } }, { accion: { equals: 'entrada-sospechosa' } }] },
        sort: 'fecha',
        limit: 100,
        depth: 0,
        overrideAccess: true,
      })
    ).docs as unknown as Record<string, unknown>[]

  let pabellon: string
  let telefono: string

  beforeAll(async () => {
    const cuenta = await base.create({
      collection: 'usuarios',
      data: { nombre: 'Prueba de entradas', email, password, rol: 'editor', activo: true } as never,
      overrideAccess: true,
    })
    cuentaId = cuenta.id
    const admin = await base.create({
      collection: 'usuarios',
      data: { nombre: 'Administración de prueba', email: administrador, password, rol: 'admin', activo: true } as never,
      overrideAccess: true,
    })
    administradorId = admin.id
  })

  afterAll(async () => {
    correo.activo = false
    if (cuentaId && !borrada) {
      await base.delete({ collection: 'usuarios', id: cuentaId, overrideAccess: true }).catch(() => {})
    }
    if (administradorId) {
      await base.delete({ collection: 'usuarios', id: administradorId, overrideAccess: true }).catch(() => {})
    }
  })

  it('entrar en otro equipo cierra la sesión del primero, y la cuenta se queda con una', async () => {
    pabellon = await entrarDesde(PABELLON)
    expect(await sesionDe(pabellon)).not.toBeNull()

    telefono = await entrarDesde(TELEFONO)
    expect(await sesionDe(pabellon)).toBeNull()
    expect(await sesionDe(telefono)).not.toBeNull()

    const cuenta = (await base.findByID({
      collection: 'usuarios',
      id: cuentaId,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
    })) as unknown as { sessions?: { id: string }[] }
    expect(cuenta.sessions?.map((s) => s.id)).toEqual([sidDelTestigo(telefono)])
  })

  it('cada entrada queda con su equipo, y la del primero, cerrada por la otra', async () => {
    const [primera, segunda] = await entradas()
    expect(primera).toMatchObject({ ...PABELLON, motivoDelCierre: 'otra-entrada', cerroOtroEquipo: false })
    expect(primera.cerradaEn).toBeTruthy()
    expect(segunda).toMatchObject({ ...TELEFONO, cerroOtroEquipo: true })
    expect(segunda.motivoDelCierre ?? null).toBeNull()
    // La huella, no el identificador de la sesión: ese es una llave.
    expect(segunda.sesion).not.toBe(sidDelTestigo(telefono))
    expect(String(segunda.sesion)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('el equipo que se quedó sin sesión sabe por qué, en la plantilla y en las acciones', async () => {
    const { motivoDelCierre } = await import('@/lib/entradasServidor')
    expect(await motivoDelCierre(base, pabellon)).toBe('otra-entrada')
    expect(await motivoDelCierre(base, telefono)).toBeNull()
    // Un testigo con la firma tocada no pregunta por nada.
    expect(await motivoDelCierre(base, `${pabellon.slice(0, -2)}xx`)).toBeNull()

    peticion.cabeceras = cabecerasCon(pabellon)
    const { obtenerSesion } = await import('@/lib/sesion')
    const sesion = await obtenerSesion()
    expect(sesion.usuario).toBeNull()
    expect(sesion.cierre).toBe('otra-entrada')

    const { exigirEditor } = await import('@/lib/guardias')
    await expect(exigirEditor()).rejects.toThrow(MENSAJE_DE_OTRA_ENTRADA)

    // Sin cookie, lo de siempre.
    peticion.cabeceras = new Headers()
    expect((await obtenerSesion()).cierre ?? null).toBeNull()
    await expect(exigirEditor()).rejects.toThrow('Acceso denegado')
  })

  it('turnarse entre dos equipos avisa al administrador a la tercera vez en una hora', async () => {
    correo.activo = true
    expect(await alertas()).toHaveLength(0)
    pabellon = await entrarDesde(PABELLON) // la segunda vez que se echa a otro equipo
    expect(await alertas()).toHaveLength(0)
    expect(correo.enviar).not.toHaveBeenCalled()
    telefono = await entrarDesde(TELEFONO) // la tercera
    const [alerta] = await alertas()
    expect(alerta?.detalle).toContain('En la última hora se entró 3 veces')
    expect(alerta?.usuarioCorreo).toBe(email)

    // Y por correo, a los administradores activos de su lugar, que son hasta
    // 20: la cuenta de la alerta es de TraumaHub, así que los de TraumaHub
    // (D-396). Ella, que es de editor, no está entre ellos.
    expect(correo.enviar).toHaveBeenCalledTimes(1)
    const [, envio] = correo.enviar.mock.calls[0] as [
      unknown,
      { para: string[]; correo: { asunto: string; bloques: unknown[] } },
    ]
    const { totalDocs: administradores } = await base.count({
      collection: 'usuarios',
      where: { and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }, { institucion: { exists: false } }] },
      overrideAccess: true,
    })
    expect(envio.para).toHaveLength(Math.min(administradores, 20))
    expect(envio.para).not.toContain(email)
    expect(envio.correo.asunto).toBe('TraumaHub · Entrada sospechosa en la cuenta de Prueba de entradas')
    expect(JSON.stringify(envio.correo.bloques)).toContain('En la última hora se entró 3 veces')
    // Las últimas entradas, con su equipo, para que se vea el turno sin abrir nada.
    expect(JSON.stringify(envio.correo.bloques)).toContain('Safari en iPhone')
    expect(JSON.stringify(envio.correo.bloques)).toContain('Chrome en Windows')
  })

  it('otro país demasiado pronto, también', async () => {
    // Desde el mismo teléfono, pero ya en Perú: no echa a otro equipo, así que solo avisa por el país.
    telefono = await entrarDesde({ ...TELEFONO, pais: 'PE' })
    const ultima = (await alertas()).at(-1)
    expect(ultima?.detalle).toContain('Entró desde Perú')
    expect(ultima?.detalle).toContain('desde Chile')
    expect(ultima?.detalle).not.toContain('veces')
    // La alerta queda en el registro, pero de la misma cuenta llega un correo al día.
    expect(correo.enviar).toHaveBeenCalledTimes(1)
    correo.activo = false
  })

  it('el administrador las ve en «Usuarios y permisos», y un editor no', async () => {
    const { entradasDeUnaCuenta } = await import('@/app/(frontend)/acciones/admin')

    // Desde la sesión de la propia cuenta, que es de editor.
    peticion.cabeceras = cabecerasCon(telefono)
    expect((await entradasDeUnaCuenta(cuentaId)).exito).toBe(false)

    const { token } = await base.login({ collection: 'usuarios', data: { email: administrador, password } })
    peticion.cabeceras = cabecerasCon(token as string)
    const respuesta = await entradasDeUnaCuenta(cuentaId)
    if (!respuesta.exito || !respuesta.datos) throw new Error(respuesta.exito ? 'sin datos' : respuesta.mensaje)
    const { entradas: vistas, total, alertas: suyas } = respuesta.datos

    // Las cinco de arriba, la más reciente primero.
    expect(total).toBe(5)
    expect(vistas.map((e) => [e.equipo, e.pais, e.fin])).toEqual([
      ['Safari en iPhone', 'PE', 'abierta'],
      ['Safari en iPhone', 'CL', 'otra-entrada'],
      ['Chrome en Windows', 'CL', 'otra-entrada'],
      ['Safari en iPhone', 'CL', 'otra-entrada'],
      ['Chrome en Windows', 'CL', 'otra-entrada'],
    ])
    expect(vistas.map((e) => e.cerroOtroEquipo)).toEqual([false, true, true, true, false])
    // Sin la huella de la sesión: con ella se pregunta a la cuenta, y no sale de ahí.
    expect(vistas.every((e) => !('sesion' in e))).toBe(true)
    // Las dos alertas, la del país primero.
    expect(suyas).toHaveLength(2)
    expect(suyas[0].detalle).toMatch(/^Entró desde Perú /)
    expect(suyas[1].detalle).toMatch(/^En la última hora se entró 3 veces/)
  })

  it('salir deja la entrada cerrada por «salió»', async () => {
    peticion.cabeceras = cabecerasCon(telefono)
    const { salir } = await import('@/app/(frontend)/acciones/sesion')
    expect((await salir()).exito).toBe(true)
    expect((await entradas()).at(-1)).toMatchObject({ motivoDelCierre: 'salio' })
    // Salir no es que se entrara en otro equipo: ese equipo ve «Iniciar sesión» sin más.
    const { motivoDelCierre } = await import('@/lib/entradasServidor')
    expect(await motivoDelCierre(base, telefono)).toBe('salio')
  })

  it('al borrar la cuenta se van con ella todas sus entradas', async () => {
    expect((await entradas()).length).toBeGreaterThan(0)
    await base.delete({ collection: 'usuarios', id: cuentaId, overrideAccess: true })
    borrada = true
    const { totalDocs } = await base.count({
      collection: 'entradas',
      where: { usuario: { equals: cuentaId } },
      overrideAccess: true,
    })
    expect(totalDocs).toBe(0)
  })
})

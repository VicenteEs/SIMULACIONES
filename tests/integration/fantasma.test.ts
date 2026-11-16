import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { CABECERA_DEL_SUBDOMINIO } from '@/lib/anfitrion'
import { olvidarInstituciones } from '@/lib/institucionesServidor'
import { comoSoporte, idDeInstitucion } from '@/access/payload'

/**
 * El administrador de TraumaHub dentro de una institución, el fantasma (P-016
 * E5.9, D-404), contra una base de verdad y con la segunda barrera puesta.
 *
 * Lo que se cuida es lo que D-371 promete: que entra a cualquier institución
 * abierta y trabaja en ella como su administrador, sin aparecer en su registro
 * ni en sus estadísticas, y que el registro de TraumaHub cuenta cada entrada y
 * lo que hizo. Y lo que lo hace posible: su cuenta es de TraumaHub, y desde el
 * subdominio la barrera de la base no deja tocar una fila de TraumaHub. Sin la
 * barrera puesta, estas pruebas pasarían con el código de antes.
 */

const estado = vi.hoisted(() => ({
  cabeceras: new Headers(),
  galletas: {} as Record<string, string>,
}))

// `entrar`, `salir` y `obtenerSesion` leen la petición con `next/headers`, que
// fuera de Next no existe. Las cookies que escriben se guardan para leerlas.
vi.mock('next/headers', () => ({
  headers: async () => estado.cabeceras,
  cookies: async () => ({
    delete: () => {},
    set: (nombre: string, valor: string) => {
      estado.galletas[nombre] = valor
    },
    get: () => undefined,
  }),
}))
// El almacén de la petición que lee la barrera (D-399): con uno de Node, una
// prueba puede hacer como si estuviera en el subdominio de una institución.
vi.mock('next/dist/server/app-render/work-unit-async-storage.external', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks')
  return { workUnitAsyncStorage: new AsyncLocalStorage() }
})
// Ningún correo sale de aquí.
vi.mock('@/correo/enviar', async (original) => ({
  ...(await original<typeof import('@/correo/enviar')>()),
  hayCorreo: () => false,
  enviarCorreo: async () => {},
  enviarSinEsperar: () => {},
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
const DIA = 86_400_000

type Lugar = 'abierta' | 'cerrada'

describe.skipIf(payload === null)('el soporte de TraumaHub dentro de una institución (D-404)', () => {
  const base = payload as Payload
  const clave = randomBytes(18).toString('base64url')
  const borrar: { coleccion: 'instituciones' | 'usuarios' | 'patologias' | 'segmentos'; id: number | string }[] = []
  const lugares = {} as Record<Lugar, { id: number | string; subdominio: string; nombre: string }>
  const correos = {
    soporte: `soporte-${marca}@prueba.invalid`,
    editorCentral: `editor-central-${marca}@prueba.invalid`,
    adminAbierta: `admin-abierta-${marca}@prueba.invalid`,
  }
  const ids = {} as Record<keyof typeof correos, number | string>
  let ficha: number | string
  const antes = { direccion: undefined as string | undefined, pruebas: undefined as string | undefined }

  /** Las cabeceras de una petición al lugar, con el testigo si lo hay. */
  const cabecerasDe = (lugar: Lugar | 'central', testigo?: string) =>
    new Headers({
      ...(lugar === 'central' ? {} : { [CABECERA_DEL_SUBDOMINIO]: lugares[lugar].subdominio }),
      ...(testigo ? { cookie: `${base.config.cookiePrefix}-token=${testigo}`, 'sec-fetch-site': 'same-origin' } : {}),
    })

  /** Corre `trabajo` como una petición al lugar: con sus cabeceras y, fuera de la central, con la barrera. */
  const en = async <T,>(lugar: Lugar | 'central', trabajo: () => Promise<T>, testigo?: string): Promise<T> => {
    estado.cabeceras = cabecerasDe(lugar, testigo)
    if (lugar === 'central') return trabajo()
    const { workUnitAsyncStorage } = await import('next/dist/server/app-render/work-unit-async-storage.external')
    return workUnitAsyncStorage.run({ headers: estado.cabeceras } as never, trabajo)
  }

  /** Un testigo de la cuenta, entrando como lo hace `entrar`, sin la barrera. */
  const testigoDe = async (email: string, lugar: Lugar | 'central') =>
    (
      await base.login({
        collection: 'usuarios',
        data: { email, password: clave },
        context: { institucionDelLugar: lugar === 'central' ? null : String(lugares[lugar].id) },
      })
    ).token as string

  const delRegistro = async (where: Record<string, unknown>) =>
    (
      await base.find({ collection: 'registro-de-acciones', where: where as never, depth: 0, limit: 50, overrideAccess: true })
    ).docs as unknown as Record<string, unknown>[]

  const nombreDelSoporte = (lugar: Lugar) => `${lugares[lugar].nombre} (${lugares[lugar].subdominio})`

  beforeAll(async () => {
    antes.direccion = process.env.NEXT_PUBLIC_SERVER_URL
    antes.pruebas = process.env.SERVIDOR_DE_PRUEBAS
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://traumahub.prueba.invalid'
    delete process.env.SERVIDOR_DE_PRUEBAS

    const plazos: Record<Lugar, Date> = {
      abierta: new Date(Date.now() + 30 * DIA),
      cerrada: new Date(Date.now() - DIA),
    }
    for (const [lugar, vence] of Object.entries(plazos) as [Lugar, Date][]) {
      const subdominio = `fan${lugar}${marca}`
      const nombre = `Hospital ${lugar} ${marca}`
      const creada = await base.create({
        collection: 'instituciones',
        data: {
          nombre,
          subdominio,
          modalidad: 'piloto',
          inicio: new Date(Date.now() - 60 * DIA).toISOString(),
          vence: vence.toISOString(),
          cupo: 10,
          correoDelAdministrador: `contacto-${subdominio}@prueba.invalid`,
        },
        overrideAccess: true,
      })
      lugares[lugar] = { id: creada.id, subdominio, nombre }
      borrar.push({ coleccion: 'instituciones', id: creada.id })
    }

    const cuenta = async (clave_: keyof typeof correos, rol: string, lugar: Lugar | null) => {
      const creada = await base.create({
        collection: 'usuarios',
        data: {
          nombre: `Cuenta ${clave_} ${marca}`,
          email: correos[clave_],
          password: clave,
          rol,
          activo: true,
          ...(lugar ? { institucion: lugares[lugar].id } : {}),
        } as never,
        overrideAccess: true,
      })
      ids[clave_] = creada.id
      borrar.push({ coleccion: 'usuarios', id: creada.id })
    }
    await cuenta('soporte', 'admin', null)
    await cuenta('editorCentral', 'editor', null)
    await cuenta('adminAbierta', 'admin', 'abierta')

    const segmento = await base.create({ collection: 'segmentos', data: { nombre: `Segmento ${marca}`, orden: 994 }, overrideAccess: true })
    borrar.push({ coleccion: 'segmentos', id: segmento.id })
    const creada = await base.create({
      collection: 'patologias',
      data: { nombre: `Ficha de la abierta ${marca}`, segmento: segmento.id, institucion: lugares.abierta.id, _status: 'draft' } as never,
      draft: true,
      overrideAccess: true,
    })
    ficha = creada.id
    borrar.push({ coleccion: 'patologias', id: ficha })
    olvidarInstituciones()
  }, 120_000)

  afterAll(async () => {
    // Lo que anotaron las pruebas, antes que las cuentas: así no queda con nombre.
    await base.delete({ collection: 'registro-de-acciones', where: { usuario: { in: Object.values(ids) } }, overrideAccess: true }).catch(() => undefined)
    await base.delete({ collection: 'entradas', where: { usuario: { in: Object.values(ids) } }, overrideAccess: true }).catch(() => undefined)
    await base.delete({ collection: 'actividad', where: { usuario: { in: Object.values(ids) } }, overrideAccess: true }).catch(() => undefined)
    for (const { coleccion, id } of borrar.reverse()) {
      await base.delete({ collection: coleccion, id, overrideAccess: true }).catch(() => undefined)
    }
    olvidarInstituciones()
    if (antes.direccion === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
    else process.env.NEXT_PUBLIC_SERVER_URL = antes.direccion
    if (antes.pruebas === undefined) delete process.env.SERVIDOR_DE_PRUEBAS
    else process.env.SERVIDOR_DE_PRUEBAS = antes.pruebas
  })

  it('entra en una institución abierta, y la entrada queda en el registro de TraumaHub', async () => {
    const { entrar } = await import('@/app/(frontend)/acciones/sesion')
    const { MENSAJE_INSTITUCION_BLOQUEADA } = await import('@/collections/Usuarios')
    const desde = new Date().toISOString()

    expect(await en('abierta', () => entrar(correos.soporte, clave))).toMatchObject({ exito: true })
    const entradas = await delRegistro({
      and: [{ usuario: { equals: ids.soporte } }, { accion: { equals: 'entrada-como-soporte' } }, { fecha: { greater_than_equal: desde } }],
    })
    expect(entradas).toHaveLength(1)
    expect(entradas[0].institucion ?? null).toBeNull()
    expect(entradas[0].soporteEn).toBe(nombreDelSoporte('abierta'))
    // Desde la institución, esa línea no se ve.
    const vistas = await en('abierta', () =>
      base.count({ collection: 'registro-de-acciones', where: { id: { equals: entradas[0].id } }, overrideAccess: true }),
    )
    expect(vistas.totalDocs).toBe(0)

    // El editor de TraumaHub no es soporte de nadie, y en una bloqueada no entra nadie.
    expect(await en('abierta', () => entrar(correos.editorCentral, clave))).toMatchObject({ exito: false })
    expect(await en('cerrada', () => entrar(correos.soporte, clave))).toEqual({
      exito: false,
      mensaje: MENSAJE_INSTITUCION_BLOQUEADA,
    })
    // Y la cuenta de la institución sigue entrando como siempre, con la barrera.
    expect(await en('abierta', () => entrar(correos.adminAbierta, clave))).toMatchObject({ exito: true })
  })

  it('dentro vale como el administrador de la institución, sin ser de ella', async () => {
    const { cuentaEnSuLugar } = await import('@/lib/sesion')
    const { esDeTraumaHub, lugarDeLaCuenta } = await import('@/lib/guardias')
    const testigo = await testigoDe(correos.soporte, 'abierta')

    const dentro = await en('abierta', () => cuentaEnSuLugar(base, estado.cabeceras), testigo)
    expect(dentro.user).toMatchObject({ id: ids.soporte, rol: 'admin', fantasma: true })
    expect(lugarDeLaCuenta(dentro.user!)).toBe(String(lugares.abierta.id))
    expect(esDeTraumaHub(dentro.user!)).toBe(false)
    // Su cuenta no cambió.
    const fila = await base.findByID({ collection: 'usuarios', id: ids.soporte, depth: 0, overrideAccess: true })
    expect(idDeInstitucion(fila.institucion)).toBeNull()

    // En la central es la de siempre, y en una bloqueada no vale.
    const enLaCentral = await en('central', () => cuentaEnSuLugar(base, estado.cabeceras), testigo)
    expect(enLaCentral.user?.fantasma).toBeUndefined()
    expect(esDeTraumaHub(enLaCentral.user!)).toBe(true)
    const enLaCerrada = await en('cerrada', () => cuentaEnSuLugar(base, estado.cabeceras), testigo)
    expect(enLaCerrada.user).toBeNull()

    // El editor de TraumaHub, dentro, no vale.
    const deEditor = await testigoDe(correos.editorCentral, 'central')
    expect((await en('abierta', () => cuentaEnSuLugar(base, estado.cabeceras), deEditor)).user).toBeNull()
  })

  it('lee lo de la institución también por la API de Payload, que lo ve con su cuenta tal cual', async () => {
    const tal = (await base.findByID({ collection: 'usuarios', id: ids.soporte, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
    const editor = (await base.findByID({ collection: 'usuarios', id: ids.editorCentral, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
    const buscar = (usuario: Record<string, unknown>) => () =>
      base.count({ collection: 'patologias', where: { id: { equals: ficha } }, user: usuario as never, overrideAccess: false })
    expect((await en('abierta', buscar(tal))).totalDocs).toBe(1)
    // En la central, lo de una institución no aparece; y el editor de TraumaHub no lo ve dentro.
    expect((await en('central', buscar(tal))).totalDocs).toBe(0)
    expect((await en('abierta', buscar(editor))).totalDocs).toBe(0)
  })

  it('lo que hace dentro va al registro de TraumaHub, y desde la institución no se ve', async () => {
    const { registrarAccion } = await import('@/lib/registroServidor')
    const tal = (await base.findByID({ collection: 'usuarios', id: ids.soporte, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
    const titulo = `Lo del soporte ${marca}`
    // Llega de las dos formas: como la deja la sesión y como la lee `payload.auth`.
    await en('abierta', () =>
      registrarAccion(base, { accion: 'modifico', usuario: comoSoporte(tal, String(lugares.abierta.id)), coleccion: 'patologias', titulo }),
    )
    await en('abierta', () => registrarAccion(base, { accion: 'creo', usuario: tal, coleccion: 'patologias', titulo }))

    const filas = await delRegistro({ titulo: { equals: titulo } })
    expect(filas).toHaveLength(2)
    for (const fila of filas) {
      expect(fila.institucion ?? null).toBeNull()
      expect(fila.soporteEn).toBe(nombreDelSoporte('abierta'))
    }
    const vistas = await en('abierta', () =>
      base.count({ collection: 'registro-de-acciones', where: { titulo: { equals: titulo } }, overrideAccess: true }),
    )
    expect(vistas.totalDocs).toBe(0)

    // Lo de su administrador sigue en el registro de la institución.
    const admin = (await base.findByID({ collection: 'usuarios', id: ids.adminAbierta, depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
    const suyo = `Lo de la institución ${marca}`
    await en('abierta', () => registrarAccion(base, { accion: 'modifico', usuario: admin, coleccion: 'patologias', titulo: suyo }))
    const [deLaInstitucion] = await delRegistro({ titulo: { equals: suyo } })
    expect(idDeInstitucion(deLaInstitucion.institucion)).toBe(String(lugares.abierta.id))
    expect(deLaInstitucion.soporteEn ?? null).toBeNull()
  })

  it('lo que deja dentro, fuera del registro, es de la institución', async () => {
    // Con su cuenta tal cual, como la lee `payload.auth`: la actividad toma de
    // ahí su dueño. La que llega de la sesión ya trae la institución del lugar.
    const tal = await base.findByID({ collection: 'usuarios', id: ids.soporte, depth: 0, overrideAccess: true })
    const fila = await en('abierta', () =>
      base.create({
        collection: 'actividad',
        data: { usuario: ids.soporte, coleccion: 'patologias', documentoId: String(ficha) } as never,
        user: tal,
        overrideAccess: true,
      }),
    )
    try {
      expect(idDeInstitucion((fila as { institucion?: unknown }).institucion)).toBe(String(lugares.abierta.id))
    } finally {
      await base.delete({ collection: 'actividad', id: fila.id, overrideAccess: true })
    }
  })

  it('no deja actividad ni tiempo activo, y la ficha no le dice que perdió la sesión', async () => {
    const { registrarLatidoDeActividad } = await import('@/app/(frontend)/acciones/registro')
    const { marcarComoLeida } = await import('@/app/(frontend)/acciones/actividad')
    const testigo = await testigoDe(correos.soporte, 'abierta')
    const cuantas = async () => ({
      tiempo: (await base.count({ collection: 'tiempo-activo', where: { usuario: { equals: ids.soporte } }, overrideAccess: true })).totalDocs,
      actividad: (await base.count({ collection: 'actividad', where: { usuario: { equals: ids.soporte } }, overrideAccess: true })).totalDocs,
    })
    const antesDe = await cuantas()
    await en('abierta', () => registrarLatidoDeActividad('/biblioteca'), testigo)
    await en('abierta', () => marcarComoLeida('patologias', String(ficha), true), testigo)
    expect(await cuantas()).toEqual(antesDe)
  })

  it('al salir, su sesión se da de baja también en la base, y la salida queda en el registro de TraumaHub', async () => {
    const { salir } = await import('@/app/(frontend)/acciones/sesion')
    const testigo = await testigoDe(correos.soporte, 'abierta')
    const desde = new Date().toISOString()
    expect(await en('abierta', () => salir(), testigo)).toMatchObject({ exito: true })
    expect((await base.auth({ headers: cabecerasDe('abierta', testigo) })).user).toBeNull()
    const salidas = await delRegistro({
      and: [{ usuario: { equals: ids.soporte } }, { accion: { equals: 'sesion-cerrada' } }, { fecha: { greater_than_equal: desde } }],
    })
    expect(salidas).toHaveLength(1)
    expect(salidas[0].soporteEn).toBe(nombreDelSoporte('abierta'))
  })

  it('en ved, elegir una institución con el selector anota la entrada del soporte', async () => {
    const { elegirInstitucionDePrueba } = await import('@/app/(frontend)/acciones/institucionDePrueba')
    process.env.SERVIDOR_DE_PRUEBAS = 'https://traumahub.prueba.invalid'
    try {
      const desde = new Date().toISOString()
      const delSoporte = await testigoDe(correos.soporte, 'central')
      expect(await en('central', () => elegirInstitucionDePrueba(lugares.abierta.subdominio), delSoporte)).toMatchObject({ exito: true })
      // Y nada en una bloqueada, ni para el editor.
      expect(await en('central', () => elegirInstitucionDePrueba(lugares.cerrada.subdominio), delSoporte)).toMatchObject({ exito: true })
      const delEditor = await testigoDe(correos.editorCentral, 'central')
      expect(await en('central', () => elegirInstitucionDePrueba(lugares.abierta.subdominio), delEditor)).toMatchObject({ exito: true })

      const entradas = await delRegistro({
        and: [{ accion: { equals: 'entrada-como-soporte' } }, { fecha: { greater_than_equal: desde } }, { usuario: { in: [ids.soporte, ids.editorCentral] } }],
      })
      expect(entradas.map((e) => [e.usuario, e.soporteEn])).toEqual([[ids.soporte, nombreDelSoporte('abierta')]])
    } finally {
      delete process.env.SERVIDOR_DE_PRUEBAS
    }
  })
})

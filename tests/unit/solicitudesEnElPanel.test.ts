import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Las solicitudes de cuenta, la invitación por correo y el enlace de «Clave»
 * vistos desde el panel.
 *
 * Una cuenta pedida en `/registro` nace desactivada y con `pendiente` marcado, y
 * lo que decide si entra es lo que se prueba aquí: que activar la deje entrar
 * con el rol elegido y le quite la marca en la misma escritura, que rechazar la
 * borre por el borrado vigilado, y que ninguna de las dos cosas pase sobre una
 * solicitud que otra sesión ya resolvió. Una marca que no se apaga no rompe
 * nada visible: la cuenta entra, y la barra sigue anunciando una solicitud que
 * no existe hasta que alguien, un día, la «rechaza» y borra a un residente.
 *
 * El correo se sustituye entero (`@/correo/enviar`): lo que interesa es qué se
 * manda y a quién, no el transporte, que tiene su propia prueba. Los mensajes
 * sí son los de verdad, para comparar contra lo que arman.
 */

const { estado, cuentas, crear, actualizar, borrar, contar, pedirClave, correo, revalidar, buscar } =
  vi.hoisted(() => ({
    estado: { rolReal: 'admin' as string },
    /** Lo que la base tiene, por `id`. `borrar` lo quita de aquí. */
    cuentas: new Map<string, Record<string, unknown>>(),
    crear: vi.fn(),
    actualizar: vi.fn(),
    borrar: vi.fn(),
    contar: vi.fn(),
    pedirClave: vi.fn(),
    correo: {
      hay: true,
      enviar: vi.fn(),
      sinEsperar: vi.fn(),
    },
    revalidar: vi.fn(),
    /** El `payload.find` de la página de cuentas, que las acciones no usan. */
    buscar: vi.fn(),
  }))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: { id: 1, rol: estado.rolReal, activo: true },
    activo: true,
    rolReal: estado.rolReal,
    rol: estado.rolReal,
    simulando: false,
    usuarioEfectivo: { id: 1, rol: estado.rolReal, activo: true },
  }),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({
    findByID: async ({ id }: { id: string }) => cuentas.get(String(id)) ?? null,
    create: crear,
    update: actualizar,
    delete: borrar,
    count: contar,
    forgotPassword: pedirClave,
    logger: { error: () => {} },
  }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/cache', () => ({ revalidatePath: revalidar }))

// La página de cuentas: su guardia y su cliente, que no son los de las acciones.
vi.mock('@/app/(frontend)/admin-panel/acceso', () => ({
  exigirPanel: async () => ({ sesion: { usuario: { id: 1 } }, esAdmin: true }),
}))
vi.mock('@/app/(frontend)/admin-panel/datos', () => ({
  clientePayload: async () => ({ find: buscar }),
}))

vi.mock('@/correo/enviar', () => ({
  hayCorreo: () => correo.hay,
  enviarCorreo: correo.enviar,
  enviarSinEsperar: correo.sinEsperar,
}))

import {
  cambiarActivoUsuario,
  crearUsuario,
  generarEnlaceDeClave,
  resolverSolicitud,
} from '@/app/(frontend)/acciones/admin'
import PaginaUsuarios from '@/app/(frontend)/admin-panel/usuarios/page'
import type { UsuarioDelPanel } from '@/app/(frontend)/admin-panel/usuarios/TablaUsuarios'
import { enlaceDeClave } from '@/collections/Usuarios'
import {
  mensajeDeBienvenida,
  mensajeDeClaveNueva,
  mensajeDeCuentaActivada,
  mensajeDeSolicitudRechazada,
} from '@/correo/mensajes'

const DIRECCION = 'https://ved.example.net:10000/traumahub'
const direccionOriginal = process.env.NEXT_PUBLIC_SERVER_URL

const SOLICITUD = {
  id: 9,
  email: 'residente@hospital.cl',
  nombre: 'Camila Rojas',
  rol: 'lector',
  activo: false,
  pendiente: true,
  origen: 'solicitud',
}

/** Lo que se mandó a escribir en la única llamada a `payload.update`. */
const loEscrito = () =>
  actualizar.mock.calls[0]?.[0] as { id: string; data: Record<string, unknown>; user?: unknown }

beforeEach(() => {
  estado.rolReal = 'admin'
  cuentas.clear()
  cuentas.set('1', { id: 1, email: 'yo@hospital.cl', rol: 'admin', activo: true })
  const dobles = [crear, actualizar, borrar, contar, pedirClave, correo.enviar, correo.sinEsperar, buscar]
  for (const doble of [...dobles, revalidar]) doble.mockReset()
  correo.hay = true
  crear.mockResolvedValue({ id: 12 })
  actualizar.mockResolvedValue({ id: 9 })
  borrar.mockImplementation(async ({ id }: { id: string }) => {
    cuentas.delete(String(id))
    return { id }
  })
  // Queda otro administrador activo: el borrado vigilado no tiene nada que frenar.
  contar.mockResolvedValue({ totalDocs: 1 })
  pedirClave.mockResolvedValue('testigo-de-la-invitacion')
  correo.enviar.mockResolvedValue(undefined)
  process.env.NEXT_PUBLIC_SERVER_URL = DIRECCION
  // `accion()` anota en consola todo fallo que no sea de acceso, y aquí los
  // fallos son el caso que se prueba.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (direccionOriginal === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
  else process.env.NEXT_PUBLIC_SERVER_URL = direccionOriginal
})

describe('activar una solicitud', () => {
  it('la deja entrar con el rol elegido, le quita la marca y le avisa', async () => {
    cuentas.set('9', { ...SOLICITUD })

    const respuesta = await resolverSolicitud('9', 'activar', 'editor')

    expect(respuesta).toEqual({ exito: true, datos: { avisoPorCorreo: true } })
    expect(actualizar).toHaveBeenCalledTimes(1)
    // En una sola escritura: con dos, un fallo entre ambas deja una cuenta
    // activa y todavía «por revisar», que otro administrador puede rechazar.
    expect(loEscrito().id).toBe('9')
    expect(loEscrito().data).toEqual({ activo: true, pendiente: false, rol: 'editor' })
    // Con el usuario, para que la escritura pase por el control de acceso.
    expect(loEscrito().user).toMatchObject({ id: 1 })

    expect(correo.sinEsperar).toHaveBeenCalledTimes(1)
    const [, envio] = correo.sinEsperar.mock.calls[0] as [unknown, { para: string; correo: unknown }]
    expect(envio.para).toBe('residente@hospital.cl')
    expect(envio.correo).toEqual(
      mensajeDeCuentaActivada({ nombre: 'Camila Rojas', enlaceEntrar: `${DIRECCION}/entrar` }),
    )
  })

  it('sin rol, entra como lector', async () => {
    cuentas.set('9', { ...SOLICITUD })
    await resolverSolicitud('9', 'activar')
    expect(loEscrito().data.rol).toBe('lector')
  })

  it('revalida también el layout, que es quien pinta el aviso de la barra', async () => {
    cuentas.set('9', { ...SOLICITUD })
    await resolverSolicitud('9', 'activar')
    expect(revalidar).toHaveBeenCalledWith('/admin-panel/usuarios')
    expect(revalidar).toHaveBeenCalledWith('/admin-panel', 'layout')
  })

  it('sin servidor de correo, lo dice en la respuesta', async () => {
    correo.hay = false
    cuentas.set('9', { ...SOLICITUD })
    const respuesta = await resolverSolicitud('9', 'activar')
    expect(respuesta.datos).toEqual({ avisoPorCorreo: false })
  })

  it('si la escritura falla, no le dice que ya puede entrar', async () => {
    // Otra sesión la rechazó entre la lectura y la escritura, o la base no
    // contesta: la cuenta sigue desactivada, y un «su cuenta ya está activa»
    // mandaría a la persona a una entrada que le contesta que no.
    cuentas.set('9', { ...SOLICITUD })
    actualizar.mockRejectedValue(new Error('la base no contesta'))

    const respuesta = await resolverSolicitud('9', 'activar', 'editor')

    expect(respuesta.exito).toBe(false)
    expect(correo.sinEsperar).not.toHaveBeenCalled()
  })

  it('un rol que no existe no escribe nada', async () => {
    cuentas.set('9', { ...SOLICITUD })
    const respuesta = await resolverSolicitud('9', 'activar', 'superusuario')
    expect(respuesta.exito).toBe(false)
    expect(actualizar).not.toHaveBeenCalled()
    expect(correo.sinEsperar).not.toHaveBeenCalled()
  })
})

describe('rechazar una solicitud', () => {
  it('la borra por el borrado vigilado y le avisa', async () => {
    cuentas.set('9', { ...SOLICITUD })

    const respuesta = await resolverSolicitud('9', 'rechazar')

    expect(respuesta).toEqual({ exito: true, datos: { avisoPorCorreo: true } })
    expect(borrar).toHaveBeenCalledTimes(1)
    expect(borrar).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'usuarios',
        id: '9',
        user: expect.objectContaining({ id: 1 }),
      }),
    )
    // El borrado vigilado cuenta administradores antes de escribir: rechazar no
    // es un `payload.delete` suelto.
    expect(contar).toHaveBeenCalled()
    expect(actualizar).not.toHaveBeenCalled()

    expect(correo.sinEsperar).toHaveBeenCalledTimes(1)
    const [, envio] = correo.sinEsperar.mock.calls[0] as [unknown, { para: string; correo: unknown }]
    expect(envio.para).toBe('residente@hospital.cl')
    expect(envio.correo).toEqual(mensajeDeSolicitudRechazada({ nombre: 'Camila Rojas' }))
    expect(revalidar).toHaveBeenCalledWith('/admin-panel', 'layout')
  })

  it('si la base no confirmó el borrado, no avisa de un rechazo que no ocurrió', async () => {
    cuentas.set('9', { ...SOLICITUD })
    // El adaptador de Payload se traga el error del `COMMIT`: la llamada
    // resuelve y la cuenta sigue ahí.
    borrar.mockResolvedValue({ id: 9 })

    const respuesta = await resolverSolicitud('9', 'rechazar')

    expect(respuesta.exito).toBe(false)
    expect(correo.sinEsperar).not.toHaveBeenCalled()
  })
})

describe('lo que no se resuelve', () => {
  it.each([
    ['ya activada por otra sesión', { ...SOLICITUD, activo: true, pendiente: false }],
    ['ya rechazada por otra sesión', null],
  ])('una solicitud %s da error sin escribir', async (_caso, cuenta) => {
    if (cuenta) cuentas.set('9', cuenta)

    for (const decision of ['activar', 'rechazar']) {
      const respuesta = await resolverSolicitud('9', decision)
      expect(respuesta.exito).toBe(false)
      expect(respuesta.mensaje).toBe('Esa solicitud ya se resolvió. Recargue la lista.')
    }
    expect(actualizar).not.toHaveBeenCalled()
    expect(borrar).not.toHaveBeenCalled()
    expect(correo.sinEsperar).not.toHaveBeenCalled()
  })

  it.each([['aprobar'], [true], [undefined]])('la decisión %s no escribe nada', async (decision) => {
    cuentas.set('9', { ...SOLICITUD })

    const respuesta = await resolverSolicitud('9', decision)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/decisión/)
    expect(actualizar).not.toHaveBeenCalled()
    expect(borrar).not.toHaveBeenCalled()
  })

  it('un editor no resuelve solicitudes', async () => {
    estado.rolReal = 'editor'
    cuentas.set('9', { ...SOLICITUD })

    const respuesta = await resolverSolicitud('9', 'activar', 'admin')

    expect(respuesta.exito).toBe(false)
    expect(actualizar).not.toHaveBeenCalled()
  })
})

describe('activar una solicitud desde su fila', () => {
  it('cambiarActivoUsuario le quita la marca en la misma escritura y le avisa', async () => {
    cuentas.set('9', { ...SOLICITUD })

    const respuesta = await cambiarActivoUsuario('9', true)

    expect(respuesta.exito).toBe(true)
    expect(actualizar).toHaveBeenCalledTimes(1)
    expect(loEscrito().data).toEqual({ activo: true, pendiente: false })
    expect(correo.sinEsperar).toHaveBeenCalledTimes(1)
    expect((correo.sinEsperar.mock.calls[0][1] as { para: string }).para).toBe('residente@hospital.cl')
    expect(revalidar).toHaveBeenCalledWith('/admin-panel', 'layout')
  })

  it('si la escritura falla, tampoco avisa desde la fila', async () => {
    cuentas.set('9', { ...SOLICITUD })
    actualizar.mockRejectedValue(new Error('la base no contesta'))

    const respuesta = await cambiarActivoUsuario('9', true)

    expect(respuesta.exito).toBe(false)
    expect(correo.sinEsperar).not.toHaveBeenCalled()
  })

  it('reactivar una baja sigue siendo solo activarla, sin correo', async () => {
    cuentas.set('9', { ...SOLICITUD, pendiente: false, origen: 'panel' })

    await cambiarActivoUsuario('9', true)

    expect(loEscrito().data).toEqual({ activo: true })
    expect(correo.sinEsperar).not.toHaveBeenCalled()
  })
})

describe('crear una cuenta con invitación', () => {
  const crearConInvitacion = (invitar: unknown) =>
    crearUsuario(
      'residente@hospital.cl',
      'Camila Rojas',
      'la-que-sugirio-el-navegador',
      'lector',
      'Hospital del Trabajador',
      true,
      undefined,
      invitar,
    )

  it('sin servidor de correo, se niega antes de crear', async () => {
    correo.hay = false

    const respuesta = await crearConInvitacion(true)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/SMTP_HOST/)
    expect(crear).not.toHaveBeenCalled()
    expect(pedirClave).not.toHaveBeenCalled()
  })

  it('sin dirección pública, se niega antes de crear', async () => {
    process.env.NEXT_PUBLIC_SERVER_URL = '/'

    const respuesta = await crearConInvitacion(true)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/NEXT_PUBLIC_SERVER_URL/)
    expect(crear).not.toHaveBeenCalled()
    expect(pedirClave).not.toHaveBeenCalled()
  })

  it('no usa la contraseña que llega, pide un testigo de 72 horas y envía la bienvenida', async () => {
    const respuesta = await crearConInvitacion(true)

    const creado = (crear.mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(creado.password).not.toBe('la-que-sugirio-el-navegador')
    expect(String(creado.password).length).toBeGreaterThanOrEqual(32)

    expect(pedirClave).toHaveBeenCalledWith({
      collection: 'usuarios',
      data: { email: 'residente@hospital.cl' },
      disableEmail: true,
      expiration: 72 * 60 * 60 * 1000,
    })
    expect(crear.mock.invocationCallOrder[0]).toBeLessThan(pedirClave.mock.invocationCallOrder[0])

    const enlace = enlaceDeClave('testigo-de-la-invitacion')
    expect(enlace).toBe(`${DIRECCION}/clave/testigo-de-la-invitacion`)
    expect(correo.enviar).toHaveBeenCalledWith(expect.anything(), {
      para: 'residente@hospital.cl',
      correo: mensajeDeBienvenida({ nombre: 'Camila Rojas', enlace, horas: 72 }),
    })
    expect(respuesta).toEqual({
      exito: true,
      datos: { id: '12', invitacion: { enviada: true, enlace } },
    })
  })

  it('dos invitaciones no comparten contraseña', async () => {
    await crearConInvitacion(true)
    await crearConInvitacion(true)
    const [primera, segunda] = crear.mock.calls.map(
      (llamada) => (llamada[0] as { data: { password: string } }).data.password,
    )
    expect(primera).not.toBe(segunda)
  })

  it('si el correo no sale, la cuenta queda creada y se devuelve el enlace', async () => {
    correo.enviar.mockRejectedValue(new Error('550 cuota por hora superada'))

    const respuesta = await crearConInvitacion(true)

    expect(respuesta.exito).toBe(true)
    expect(respuesta.datos).toEqual({
      id: '12',
      invitacion: { enviada: false, enlace: enlaceDeClave('testigo-de-la-invitacion') },
    })
    // Ni se borra la cuenta ni se reintenta: se entrega a mano.
    expect(borrar).not.toHaveBeenCalled()
    expect(correo.enviar).toHaveBeenCalledTimes(1)
  })

  it('si no hay testigo, dice que la cuenta sí se creó para que no se cree otra vez', async () => {
    pedirClave.mockRejectedValue(new Error('la base no contesta'))

    const respuesta = await crearConInvitacion(true)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/se creó/)
    expect(respuesta.mensaje).toMatch(/Clave/)
    expect(correo.enviar).not.toHaveBeenCalled()
  })

  it('solo el literal true invita: sin él, se conserva la contraseña que pone el administrador', async () => {
    // Esto llega del navegador. Un «"true"» o un «1» no pueden cambiar el
    // camino por el que se crea una cuenta.
    for (const invitar of [undefined, false, 'true', 1]) {
      crear.mockClear()
      pedirClave.mockClear()
      const respuesta = await crearConInvitacion(invitar)
      expect(respuesta).toEqual({ exito: true, datos: { id: '12' } })
      expect((crear.mock.calls[0][0] as { data: { password: string } }).data.password).toBe(
        'la-que-sugirio-el-navegador',
      )
      expect(pedirClave).not.toHaveBeenCalled()
    }
    expect(correo.enviar).not.toHaveBeenCalled()
  })
})

describe('el enlace de «Clave»', () => {
  beforeEach(() => {
    cuentas.set('7', { id: 7, email: 'otra@hospital.cl', activo: true })
    pedirClave.mockResolvedValue('testigo-de-una-hora')
  })

  it('pide el testigo sin el correo de Payload y lo envía con la plantilla', async () => {
    const respuesta = await generarEnlaceDeClave('7')

    expect(pedirClave).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: 'otra@hospital.cl' }, disableEmail: true }),
    )
    const enlace = enlaceDeClave('testigo-de-una-hora')
    expect(correo.enviar).toHaveBeenCalledWith(expect.anything(), {
      para: 'otra@hospital.cl',
      correo: mensajeDeClaveNueva(enlace),
    })
    expect(respuesta).toEqual({ exito: true, datos: { enlace, enviadoPorCorreo: true } })
  })

  it('si el envío lanza, devuelve el enlace con enviadoPorCorreo en falso y lo anota', async () => {
    correo.enviar.mockRejectedValue(new Error('ECONNREFUSED'))

    const respuesta = await generarEnlaceDeClave('7')

    expect(respuesta).toEqual({
      exito: true,
      datos: { enlace: enlaceDeClave('testigo-de-una-hora'), enviadoPorCorreo: false },
    })
    expect(console.error).toHaveBeenCalled()
  })

  it('sin servidor de correo no intenta enviar, y también pide el testigo sin correo', async () => {
    correo.hay = false

    const respuesta = await generarEnlaceDeClave('7')

    expect(pedirClave).toHaveBeenCalledWith(expect.objectContaining({ disableEmail: true }))
    expect(correo.enviar).not.toHaveBeenCalled()
    expect(respuesta.datos?.enviadoPorCorreo).toBe(false)
  })

  it('una solicitud sin revisar no recibe enlace, y el testigo no se pide', async () => {
    // El enlace no le serviría —la cuenta está desactivada— y el correo le
    // diría a alguien que nadie ha revisado que pidió una contraseña nueva.
    cuentas.set('9', { ...SOLICITUD })

    const respuesta = await generarEnlaceDeClave('9')

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/solicitud sin revisar/)
    expect(pedirClave).not.toHaveBeenCalled()
    expect(correo.enviar).not.toHaveBeenCalled()
  })
})

describe('la página de cuentas', () => {
  type Consulta = { where: { pendiente: Record<string, unknown> }; limit: number; sort: string }
  const props = async () =>
    ((await PaginaUsuarios()) as { props: Record<string, unknown> }).props as {
      usuarios: UsuarioDelPanel[]
      solicitudes: UsuarioDelPanel[]
      sinMostrar: { cuentas: number; solicitudes: number }
    }

  beforeEach(() => {
    // La base del caso que dejaba fuera una solicitud: más cuentas que el tope,
    // y una solicitud cuyo correo cae al final del orden alfabético.
    buscar.mockImplementation(async ({ where }: Consulta) =>
      where.pendiente.equals === true
        ? { docs: [{ ...SOLICITUD, email: 'zz@hospital.cl' }], totalDocs: 1 }
        : {
            docs: [
              { id: 3, email: 'beto@hospital.cl', activo: true },
              { id: 2, email: 'ana@hospital.cl', activo: true },
            ],
            totalDocs: 612,
          },
    )
  })

  it('lee las solicitudes con su propia consulta, y las cuentas sin ellas', async () => {
    await props()

    const consultas = buscar.mock.calls.map((llamada) => llamada[0] as Consulta)
    expect(consultas).toHaveLength(2)
    const deSolicitudes = consultas.find((c) => c.where.pendiente.equals === true)
    const deCuentas = consultas.find((c) => c.where.pendiente.not_equals === true)
    // Por antigüedad y con su tope: las cuentas por encima del suyo no pueden
    // dejar fuera una solicitud, ni las solicitudes sacar cuentas de la tabla.
    expect(deSolicitudes).toMatchObject({ sort: 'solicitadaEn' })
    expect(deCuentas).toMatchObject({ sort: 'email', limit: 500 })
    expect(deSolicitudes!.limit).toBeGreaterThan(0)
  })

  it('la solicitud tiene tarjeta y fila aunque las cuentas pasen del tope', async () => {
    const { usuarios, solicitudes, sinMostrar } = await props()

    expect(solicitudes.map((s) => s.email)).toEqual(['zz@hospital.cl'])
    expect(solicitudes[0].pendiente).toBe(true)
    // En la tabla también, con su etiqueta y su filtro, y en orden de correo.
    expect(usuarios.map((u) => u.email)).toEqual([
      'ana@hospital.cl',
      'beto@hospital.cl',
      'zz@hospital.cl',
    ])
    // Y la pantalla sabe cuánto no leyó, para no decir menos de lo que hay.
    expect(sinMostrar).toEqual({ cuentas: 610, solicitudes: 0 })
  })

  it('una solicitud leída por las dos consultas no sale dos veces', async () => {
    // Resuelta entre una lectura y otra: dos filas con la misma clave de React.
    buscar.mockImplementation(async () => ({ docs: [{ ...SOLICITUD }], totalDocs: 1 }))

    const { usuarios } = await props()

    expect(usuarios).toHaveLength(1)
  })
})

// ------------------------------------------------ la pantalla, leída del disco

/**
 * El archivo sin comentarios y en una sola línea, como en
 * `notasDeCuenta.test.ts`: el entorno es `node`, sin jsdom, y los comentarios de
 * esta casa citan el código que explican.
 */
const sinComentarios = (...partes: string[]): string =>
  readFileSync(join(process.cwd(), ...partes), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')

const CARPETA = ['src', 'app', '(frontend)']
const accion = sinComentarios(...CARPETA, 'acciones', 'admin.ts')
const tabla = sinComentarios(...CARPETA, 'admin-panel', 'usuarios', 'TablaUsuarios.tsx')
const pagina = sinComentarios(...CARPETA, 'admin-panel', 'usuarios', 'page.tsx')
const resumen = sinComentarios(...CARPETA, 'admin-panel', 'page.tsx')

describe('la pantalla de cuentas', () => {
  it('las horas de la invitación son las mismas en el servidor y en la pantalla', () => {
    const horas = (codigo: string) => codigo.match(/HORAS_DE_INVITACION = (\d+)/)?.[1] ?? 'no declarado'
    expect(horas(tabla)).toBe(horas(accion))
    expect(horas(accion)).toBe('72')
  })

  it('`page.tsx` copia los campos de la solicitud y pregunta por el correo como las acciones', () => {
    expect(pagina).toMatch(/pendiente: u\.pendiente === true/)
    expect(pagina).toMatch(/motivoDeSolicitud:/)
    expect(pagina).toMatch(/solicitadaEn:/)
    expect(pagina).toContain('hayCorreo={hayCorreo()}')
    expect(pagina).toContain('hayDireccion={Boolean(direccionPublica())}')
    expect(pagina).not.toContain('process.env.SMTP_HOST')
  })

  it('las tarjetas salen de su propia lista, no de las filas de la tabla', () => {
    expect(tabla).toContain('solicitudes={solicitudes}')
    expect(tabla).not.toMatch(/usuarios\.filter\(\(u\) => u\.pendiente\)/)
  })

  it('«Clave» está apagado en la fila de una solicitud', () => {
    expect(tabla).toContain('disabled={u.pendiente}')
  })

  it('las solicitudes no se cuentan como bajas en el filtro de estado', () => {
    expect(tabla).toContain('<option value="solicitudes">Solicitudes</option>')
    expect(tabla).toMatch(/filtroEstado === 'inactivos' && \(u\.activo \|\| u\.pendiente\)/)
  })

  it('la invitación viaja a `crearUsuario` y la contraseña sugerida no', () => {
    expect(tabla).toMatch(
      /crearUsuario\([^)]*datos\.invitar \? '' : datos\.contrasena[^)]*datos\.invitar, \)/,
    )
  })

  it('el Resumen cuenta las solicitudes solo para el administrador', () => {
    expect(resumen).toMatch(
      /esAdmin \? payload \.count\(\{ collection: 'usuarios', where: \{ pendiente: \{ equals: true \} \}/,
    )
    // El enlace, dentro del bloque del aviso y no en cualquier parte: la tarjeta
    // de cuentas de la misma página ya enlaza a la misma ruta, y un
    // `toContain` sobre el archivo entero seguía en verde sin el del aviso.
    expect(resumen).toMatch(
      /esAdmin && solicitudes > 0 \? \((?:(?!\) : null\}).)*<Link href="\/admin-panel\/usuarios">Usuarios y permisos<\/Link>/,
    )
  })
})

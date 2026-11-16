import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Las acciones de «Difusión» (`src/app/(frontend)/acciones/difusion.ts`).
 *
 * Son la puerta de un correo a todas las cuentas, y lo que se prueba es lo que
 * no debe pasar por ella: un botón con `javascript:` o a medias, una difusión
 * guardada como «enviando» sin servidor que la mande, un grupo de destinatarios
 * inventado y dos difusiones saliendo a la vez sobre la misma cuota por hora.
 * La guardia de rol la cubre `accionesConGuardia.test.ts`; aquí basta con ver
 * que un editor no llega a nada.
 *
 * El trabajador se sustituye: aquí importa si se lanza, no lo que manda (eso
 * está en `difusion.test.ts`). `destinatariosDe` sí es el de verdad, sobre un
 * `find` falso.
 *
 * Desde D-393, «se está enviando» es una difusión «enviando» con el latido de
 * su trabajador reciente (`seEstaEnviando`), y el candado de la base que separa
 * dos «Enviar» cruzados se sustituye por uno en memoria que hace lo mismo
 * dentro de un proceso: lo que el candado hace entre procesos se prueba en
 * `tests/integration/estadoCompartido.test.ts`.
 *
 * Al final se pinta la pantalla una vez con los mismos dobles: no hay entorno
 * de navegador para probar el formulario, pero sí para ver que el historial
 * dice «Interrumpida» donde toca y que sin correo los botones no se ofrecen.
 */

const { estado, payload, lanzar } = vi.hoisted(() => ({
  estado: {
    rolReal: 'admin',
    difusionesEnviando: [] as Array<{ id: number; estado: string; latidoDelTrabajador?: string }>,
    cuentas: [] as Array<{ id: number; email: string; nombre: string; rol?: string; institucion?: number | null }>,
    instituciones: [] as Array<{ id: number; nombre: string }>,
    difusion: null as Record<string, unknown> | null,
  },
  payload: {
    find: vi.fn(),
    findByID: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(async () => ({ totalDocs: 2 })),
    sendEmail: vi.fn(),
    logger: { error: vi.fn() },
  },
  lanzar: vi.fn(() => true),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: { id: 1, rol: estado.rolReal, activo: true, email: 'jefe@hospital.cl' },
    activo: true,
    rolReal: estado.rolReal,
    rol: estado.rolReal,
    simulando: false,
    usuarioEfectivo: { id: 1, rol: estado.rolReal, activo: true },
  }),
}))
vi.mock('payload', async (original) => ({
  ...((await original()) as object),
  getPayload: async () => payload,
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', async (original) => ({
  ...((await original()) as object),
  useRouter: () => ({ refresh() {} }),
}))
vi.mock('@/correo/difusion', async (original) => ({
  ...((await original()) as object),
  lanzarDifusion: lanzar,
}))
vi.mock('@/lib/sqlDirecto', () => {
  // Un candado por nombre, en fila: el siguiente entra cuando el anterior
  // termina, salga bien o mal. Es lo que hace `pg_advisory_xact_lock`.
  const filas = new Map<string, Promise<unknown>>()
  return {
    conCandado: (_payload: unknown, nombre: string, trabajo: (req: object) => Promise<unknown>) => {
      const turno = (filas.get(nombre) ?? Promise.resolve()).then(() => trabajo({}))
      filas.set(
        nombre,
        turno.catch(() => undefined),
      )
      return turno
    },
  }
})

/** Una difusión con su trabajador vivo: «enviando» y con un latido de ahora. */
const latiendo = <T extends object>(difusion: T) => ({
  ...difusion,
  estado: 'enviando',
  latidoDelTrabajador: new Date().toISOString(),
})

import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PaginaDifusion from '@/app/(frontend)/admin-panel/difusion/page'
import {
  botonesDisponibles,
  duracionAproximada,
  hayAlgunaEnviandose,
  porcentajeEnviado,
} from '@/app/(frontend)/admin-panel/difusion/PanelDeDifusion'
import {
  detenerDifusion,
  enviarPruebaDeDifusion,
  iniciarDifusion,
  reanudarDifusion,
  retirarAviso,
} from '@/app/(frontend)/acciones/difusion'
import { condicionDeDestinatarios } from '@/correo/difusion'

const DATOS = {
  asunto: 'Sesión del lunes',
  mensaje: 'Revisaremos fracturas de meseta tibial.',
  botonTexto: '',
  botonEnlace: '',
  audiencia: 'todas',
}

const smtpOriginal = process.env.SMTP_HOST

beforeEach(() => {
  estado.rolReal = 'admin'
  estado.difusionesEnviando = []
  estado.cuentas = [
    { id: 3, email: 'ana@hospital.cl', nombre: 'Ana', rol: 'lector' },
    { id: 4, email: 'beto@hospital.cl', nombre: 'Beto', rol: 'editor' },
  ]
  estado.instituciones = []
  estado.difusion = null
  payload.find.mockReset().mockImplementation(async ({ collection }: { collection: string }) => ({
    docs:
      collection === 'difusiones'
        ? estado.difusionesEnviando
        : collection === 'instituciones'
          ? estado.instituciones
          : estado.cuentas,
  }))
  payload.findByID.mockReset().mockImplementation(async ({ collection }: { collection: string }) =>
    collection === 'usuarios' ? { id: 1, email: 'jefe@hospital.cl', nombre: 'Jefe' } : estado.difusion,
  )
  // La creada queda en la base como cualquier otra: es la que tiene que ver el
  // segundo de dos «Enviar» cruzados.
  payload.create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const creada = { id: 77, ...data } as { id: number; estado: string }
    estado.difusionesEnviando.push(creada)
    return creada
  })
  payload.update.mockReset().mockResolvedValue({})
  payload.sendEmail.mockReset().mockResolvedValue(undefined)
  payload.count.mockReset().mockImplementation(async () => ({ totalDocs: 2 }))
  lanzar.mockClear()
  process.env.SMTP_HOST = 'mail.ejemplo.invalid'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  if (smtpOriginal === undefined) delete process.env.SMTP_HOST
  else process.env.SMTP_HOST = smtpOriginal
})

describe('lo que se escribe en el formulario', () => {
  it('rechaza un enlace de botón que no es https, antes de tocar nada', async () => {
    const datos = { ...DATOS, botonTexto: 'Abrir', botonEnlace: 'javascript:alert(1)' }

    const prueba = await enviarPruebaDeDifusion(datos)
    const envio = await iniciarDifusion(datos)

    for (const respuesta of [prueba, envio]) {
      expect(respuesta.exito).toBe(false)
      expect(respuesta.mensaje).toMatch(/https:\/\//)
    }
    expect(payload.find).not.toHaveBeenCalled()
    expect(payload.create).not.toHaveBeenCalled()
    expect(payload.sendEmail).not.toHaveBeenCalled()
  })

  it('no acepta un botón a medias, ni solo con texto ni solo con enlace', async () => {
    for (const boton of [
      { botonTexto: 'Abrir el caso', botonEnlace: '' },
      { botonTexto: '   ', botonEnlace: 'https://traumahub.example/caso' },
    ]) {
      const respuesta = await iniciarDifusion({ ...DATOS, ...boton })
      expect(respuesta.exito, JSON.stringify(boton)).toBe(false)
      expect(respuesta.mensaje).toMatch(/texto y el enlace/)
    }
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('rechaza un grupo de destinatarios que no existe', async () => {
    const respuesta = await iniciarDifusion({ ...DATOS, audiencia: 'residentes' })
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/destinatarios/)
    expect(payload.create).not.toHaveBeenCalled()
    expect(lanzar).not.toHaveBeenCalled()
  })

  it('exige asunto y mensaje', async () => {
    expect((await iniciarDifusion({ ...DATOS, asunto: '  ' })).mensaje).toMatch(/asunto/)
    expect((await iniciarDifusion({ ...DATOS, mensaje: '' })).mensaje).toMatch(/mensaje/)
    expect(payload.create).not.toHaveBeenCalled()
  })
})

describe('sin servidor de correo', () => {
  beforeEach(() => {
    delete process.env.SMTP_HOST
  })

  it('iniciar da el error del correo y no deja guardada una difusión que nadie mandará', async () => {
    const respuesta = await iniciarDifusion(DATOS)
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/SMTP_HOST/)
    expect(payload.create).not.toHaveBeenCalled()
    expect(lanzar).not.toHaveBeenCalled()
  })

  it('la prueba tampoco sale, y lo dice', async () => {
    const respuesta = await enviarPruebaDeDifusion(DATOS)
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/SMTP_HOST/)
    expect(payload.sendEmail).not.toHaveBeenCalled()
  })

  it('cada acción llega igualmente a la base antes de rendirse', async () => {
    // Es lo que mide `accionesConGuardia.test.ts` para saber que la guardia deja
    // pasar al administrador. Si alguna preguntara por el correo antes de leer
    // nada, en una máquina sin SMTP esa prueba no distinguiría «la guardia la
    // rechazó» de «no hay servidor».
    estado.difusion = { id: 5, estado: 'enviada', pendientes: [] }
    await enviarPruebaDeDifusion(DATOS)
    expect(payload.findByID).toHaveBeenCalledTimes(1)
    await iniciarDifusion(DATOS)
    expect(payload.find).toHaveBeenCalled()
    await reanudarDifusion('5')
    await detenerDifusion('5')
    expect(payload.findByID).toHaveBeenCalledTimes(3)
  })

  it('reanudar no vuelve a poner «enviando»', async () => {
    estado.difusion = { id: 5, estado: 'detenida', pendientes: [3, 4] }
    const respuesta = await reanudarDifusion('5')
    expect(respuesta.exito).toBe(false)
    expect(payload.update).not.toHaveBeenCalled()
  })
})

describe('una difusión a la vez', () => {
  it('no empieza otra mientras una se está enviando', async () => {
    estado.difusionesEnviando = [latiendo({ id: 9 })]

    const respuesta = await iniciarDifusion(DATOS)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/Ya hay una difusión enviándose/)
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('una interrumpida por un reinicio no bloquea empezar otra', async () => {
    // «Enviando» sin latido, o con uno de hace rato: su trabajador murió.
    estado.difusionesEnviando = [
      { id: 9, estado: 'enviando' },
      { id: 8, estado: 'enviando', latidoDelTrabajador: new Date(Date.now() - 60 * 60_000).toISOString() },
    ]

    const respuesta = await iniciarDifusion(DATOS)

    expect(respuesta).toEqual({ exito: true, datos: { id: '77', total: 2, porCorreo: true } })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'difusiones',
        overrideAccess: true,
        data: expect.objectContaining({
          autor: 1,
          estado: 'enviando',
          audiencia: 'todas',
          // Como antes de E6, si no se dice otra cosa: a todos los lugares y
          // solo por correo (D-406).
          lugares: null,
          porCorreo: true,
          comoAviso: false,
          avisoHasta: null,
          total: 2,
          enviados: 0,
          fallidos: 0,
          pendientes: [3, 4],
          fallos: [],
          trabajador: expect.any(String),
          latidoDelTrabajador: expect.any(String),
        }),
      }),
    )
    // El trabajador sale con la misma marca que se guardó en la difusión.
    const { trabajador } = (payload.create.mock.calls[0] as [{ data: { trabajador: string } }])[0].data
    expect(lanzar).toHaveBeenCalledWith(payload, 77, { trabajador })
  })

  it('reanudar tampoco arranca si otra está saliendo', async () => {
    estado.difusion = { id: 5, estado: 'detenida', pendientes: [3, 4] }
    estado.difusionesEnviando = [latiendo({ id: 9 })]

    const respuesta = await reanudarDifusion('5')

    expect(respuesta.mensaje).toMatch(/Ya hay una difusión enviándose/)
    expect(lanzar).not.toHaveBeenCalled()
  })

  it('sin nadie en el grupo no crea nada', async () => {
    estado.cuentas = []
    const respuesta = await iniciarDifusion(DATOS)
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/ninguna cuenta activa/)
    expect(payload.create).not.toHaveBeenCalled()
  })
})

describe('la prueba', () => {
  it('llega solo a quien la pide, con «[Prueba]» en el asunto y el botón puesto', async () => {
    const respuesta = await enviarPruebaDeDifusion({
      ...DATOS,
      botonTexto: 'Abrir el caso',
      botonEnlace: 'https://traumahub.example/caso',
    })

    expect(respuesta).toEqual({ exito: true, datos: { para: 'jefe@hospital.cl' } })
    expect(payload.sendEmail).toHaveBeenCalledTimes(1)
    const [correo] = payload.sendEmail.mock.calls[0] as [{ to: unknown; subject: string; html: string }]
    expect(correo.to).toBe('jefe@hospital.cl')
    expect(correo.subject).toBe('[Prueba] Sesión del lunes')
    expect(correo.html).toContain('Hola, Jefe.')
    expect(correo.html).toContain('href="https://traumahub.example/caso"')
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('si el servidor la rechaza, al panel sube la explicación sin la clave', async () => {
    const claveOriginal = process.env.SMTP_CLAVE
    process.env.SMTP_CLAVE = 'clave-secreta-del-hosting'
    try {
      payload.sendEmail.mockRejectedValue(
        Object.assign(new Error('Invalid login: 535 rechazada clave-secreta-del-hosting'), { code: 'EAUTH' }),
      )

      const respuesta = await enviarPruebaDeDifusion(DATOS)

      expect(respuesta.exito).toBe(false)
      expect(respuesta.mensaje).not.toContain('clave-secreta-del-hosting')
      expect(respuesta.mensaje).toMatch(/SMTP_USUARIO/)
      expect(payload.logger.error).toHaveBeenCalled()
    } finally {
      if (claveOriginal === undefined) delete process.env.SMTP_CLAVE
      else process.env.SMTP_CLAVE = claveOriginal
    }
  })
})

describe('reanudar y detener', () => {
  it('reanudar pone la detenida a enviar y lanza el trabajador con una marca nueva', async () => {
    estado.difusion = { id: 5, estado: 'detenida', pendientes: [3, 4], trabajador: 'la-de-antes' }
    const respuesta = await reanudarDifusion('5')
    expect(respuesta).toEqual({ exito: true, datos: { pendientes: 2 } })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '5',
        data: {
          estado: 'enviando',
          terminadaEn: null,
          trabajador: expect.any(String),
          latidoDelTrabajador: expect.any(String),
        },
      }),
    )
    // Una marca nueva: si el trabajador de antes estaba atascado y no muerto, al
    // volver ve que ya no es la suya y para.
    const { trabajador } = (payload.update.mock.calls[0] as [{ data: { trabajador: string } }])[0].data
    expect(trabajador).not.toBe('la-de-antes')
    expect(lanzar).toHaveBeenCalledWith(payload, 5, { trabajador })
  })

  it('reanuda una «enviando» cuyo trabajador dejó de latir, la de un proceso que se cayó', async () => {
    estado.difusion = {
      id: 5,
      estado: 'enviando',
      pendientes: [3, 4],
      latidoDelTrabajador: new Date(Date.now() - 60 * 60_000).toISOString(),
    }
    expect((await reanudarDifusion('5')).exito).toBe(true)
    expect(lanzar).toHaveBeenCalledTimes(1)
  })

  it('reanudar no toca una que ya se está enviando, ni una terminada', async () => {
    // Su trabajador puede estar en otro proceso: lo que se mira es el latido.
    estado.difusion = latiendo({ id: 5, pendientes: [3] })
    expect((await reanudarDifusion('5')).mensaje).toMatch(/ya se está enviando/)

    // Terminada pero con cola: si llevara la cola vacía, el rechazo saldría por
    // «no le queda nadie» y la comprobación del estado no se probaría nunca.
    estado.difusion = { id: 6, estado: 'con-fallos', pendientes: [3] }
    expect((await reanudarDifusion('6')).mensaje).toMatch(/Solo se puede reanudar/)
    expect(lanzar).not.toHaveBeenCalled()
    expect(payload.update).not.toHaveBeenCalled()
  })

  it('dos «Enviar» cruzados no lanzan dos trabajadores', async () => {
    // El primero se queda esperando la lista de destinatarios; mientras tanto
    // llega el segundo. Sin el candado, los dos pasaban la pregunta a la base.
    let soltarLista: () => void = () => {}
    const listaRetenida = new Promise<void>((listo) => {
      soltarLista = listo
    })
    payload.find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'usuarios') await listaRetenida
      return { docs: collection === 'difusiones' ? estado.difusionesEnviando : estado.cuentas }
    })

    const primero = iniciarDifusion(DATOS)
    const segundo = iniciarDifusion(DATOS)
    // El segundo espera el candado del primero, que espera la lista: se suelta
    // la lista antes de esperar a ninguno.
    soltarLista()
    const [uno, dos] = await Promise.all([primero, segundo])

    expect(dos.exito).toBe(false)
    expect(dos.mensaje).toMatch(/Ya hay una difusión enviándose/)
    expect(uno.exito).toBe(true)
    expect(payload.create).toHaveBeenCalledTimes(1)
    expect(lanzar).toHaveBeenCalledTimes(1)

    // Y el candado se suelta: terminada la primera, se puede empezar otra.
    estado.difusionesEnviando = estado.difusionesEnviando.map((d) => ({ ...d, estado: 'enviada' }))
    expect((await iniciarDifusion(DATOS)).exito).toBe(true)
  })

  it('la prueba no se deja mandar en bucle', async () => {
    const respuestas = []
    for (let i = 0; i < 7; i++) respuestas.push(await enviarPruebaDeDifusion(DATOS))
    // Otras pruebas de este archivo ya gastaron alguna del mismo usuario: lo que
    // se exige es que el freno llegue, no en qué intento exacto.
    expect(respuestas.at(-1)?.exito).toBe(false)
    expect(respuestas.at(-1)?.mensaje).toMatch(/varias pruebas/)
    expect(payload.sendEmail.mock.calls.length).toBeLessThanOrEqual(5)
  })

  it('detener solo cambia el estado de una que está enviando', async () => {
    estado.difusion = { id: 5, estado: 'enviando', pendientes: [3] }
    expect((await detenerDifusion('5')).exito).toBe(true)
    expect(payload.update).toHaveBeenCalledWith(expect.objectContaining({ id: '5', data: { estado: 'detenida' } }))

    payload.update.mockClear()
    estado.difusion = { id: 5, estado: 'enviada', pendientes: [] }
    expect((await detenerDifusion('5')).exito).toBe(false)
    expect(payload.update).not.toHaveBeenCalled()
  })
})

it('un editor no llega a tocar nada', async () => {
  estado.rolReal = 'editor'
  for (const respuesta of [
    await enviarPruebaDeDifusion(DATOS),
    await iniciarDifusion(DATOS),
    await reanudarDifusion('5'),
    await detenerDifusion('5'),
    await retirarAviso('5'),
  ]) {
    expect(respuesta.exito).toBe(false)
  }
  for (const metodo of [payload.find, payload.findByID, payload.create, payload.update, payload.sendEmail]) {
    expect(metodo).not.toHaveBeenCalled()
  }
})

describe('los lugares y el aviso (D-406)', () => {
  const datosDeCreacion = () => (payload.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0].data
  const diasHasta = (fecha: unknown) => (new Date(fecha as string).getTime() - Date.now()) / 86_400_000

  it('solo como aviso se publica ya: sin cola, sin trabajador, sin correo y aunque otra difusión esté saliendo', async () => {
    delete process.env.SMTP_HOST
    estado.difusionesEnviando = [latiendo({ id: 9 })]

    const respuesta = await iniciarDifusion({ ...DATOS, porCorreo: false, comoAviso: true, diasDelAviso: 3 })

    expect(respuesta).toEqual({ exito: true, datos: { id: '77', total: 2, porCorreo: false } })
    expect(datosDeCreacion()).toMatchObject({
      estado: 'enviada',
      total: 2,
      enviados: 0,
      pendientes: [],
      porCorreo: false,
      comoAviso: true,
      lugares: null,
    })
    expect(diasHasta(datosDeCreacion().avisoHasta)).toBeGreaterThan(2.99)
    expect(diasHasta(datosDeCreacion().avisoHasta)).toBeLessThanOrEqual(3)
    expect(lanzar).not.toHaveBeenCalled()
  })

  it('por correo y como aviso: la cola de siempre, y el aviso dos semanas si no se dice otra cosa', async () => {
    const respuesta = await iniciarDifusion({ ...DATOS, comoAviso: true })

    expect(respuesta.datos?.porCorreo).toBe(true)
    expect(datosDeCreacion()).toMatchObject({ estado: 'enviando', porCorreo: true, comoAviso: true, pendientes: [3, 4] })
    expect(Math.round(diasHasta(datosDeCreacion().avisoHasta))).toBe(14)
    expect(lanzar).toHaveBeenCalledTimes(1)
  })

  it('rechaza que no salga por ningún lado, un plazo fuera de rango y una lista de lugares vacía', async () => {
    for (const [datos, motivo] of [
      [{ ...DATOS, porCorreo: false, comoAviso: false }, /cómo sale/],
      [{ ...DATOS, comoAviso: true, diasDelAviso: 0 }, /de 1 a 90 días/],
      [{ ...DATOS, comoAviso: true, diasDelAviso: 91 }, /de 1 a 90 días/],
      [{ ...DATOS, comoAviso: true, diasDelAviso: 2.5 }, /de 1 a 90 días/],
      [{ ...DATOS, lugares: [] }, /al menos un lugar/],
      [{ ...DATOS, lugares: ['otro-sitio'] }, /al menos un lugar/],
    ] as const) {
      const respuesta = await iniciarDifusion(datos)
      expect(respuesta.exito, JSON.stringify(datos)).toBe(false)
      expect(respuesta.mensaje).toMatch(motivo)
    }
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('una institución que no existe no vale como lugar', async () => {
    payload.count.mockImplementation(async () => ({ totalDocs: 1 }))

    const respuesta = await iniciarDifusion({ ...DATOS, lugares: ['traumahub', '7', '8'] })

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/ya no existe/)
    expect(payload.count).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'instituciones', where: { id: { in: [7, 8] } } }),
    )
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('los lugares elegidos recortan la cola con la misma condición, y se guardan sin repetidos', async () => {
    payload.count.mockImplementation(async () => ({ totalDocs: 1 }))

    const respuesta = await iniciarDifusion({ ...DATOS, lugares: ['7', 'traumahub', '7'] })

    expect(respuesta.exito).toBe(true)
    const consulta = payload.find.mock.calls
      .map((llamada) => (llamada as unknown[])[0] as { collection: string; where: unknown })
      .find((a) => a.collection === 'usuarios')
    expect(consulta?.where).toEqual(condicionDeDestinatarios('todas', ['7', 'traumahub']))
    expect(datosDeCreacion().lugares).toEqual(['7', 'traumahub'])
  })

  it('retirar el aviso lo deja vencido desde ya, y no toca uno que no está a la vista', async () => {
    estado.difusion = { id: 5, estado: 'enviada', comoAviso: true, avisoHasta: new Date(Date.now() + 86_400_000).toISOString() }

    expect((await retirarAviso('5')).exito).toBe(true)
    const { data } = (payload.update.mock.calls[0] as [{ collection: string; data: { avisoHasta: string } }])[0]
    expect(Math.abs(diasHasta(data.avisoHasta))).toBeLessThan(0.001)

    payload.update.mockClear()
    for (const otra of [
      { id: 5, estado: 'enviada', comoAviso: false, avisoHasta: null },
      { id: 5, estado: 'enviada', comoAviso: true, avisoHasta: '2026-01-01T00:00:00.000Z' },
    ]) {
      estado.difusion = otra
      const respuesta = await retirarAviso('5')
      expect(respuesta.exito).toBe(false)
      expect(respuesta.mensaje).toMatch(/no tiene un aviso a la vista/)
    }
    expect(payload.update).not.toHaveBeenCalled()
  })
})

describe('la pantalla', () => {
  const pintar = async () => renderToStaticMarkup((await PaginaDifusion()) as ReactElement)

  beforeEach(() => {
    estado.difusionesEnviando = [
      {
        id: 31,
        asunto: 'Caso nuevo en el simulador',
        audiencia: 'todas',
        autor: { id: 1, nombre: 'Jefe', email: 'jefe@hospital.cl' },
        estado: 'enviando',
        total: 40,
        enviados: 12,
        fallidos: 0,
        pendientes: Array.from({ length: 28 }, (_, i) => i + 100),
        fallos: [],
        createdAt: '2026-09-10T12:00:00.000Z',
      },
      {
        id: 30,
        asunto: 'Sesión suspendida',
        audiencia: 'lector',
        autor: null,
        estado: 'con-fallos',
        total: 3,
        enviados: 2,
        fallidos: 1,
        pendientes: [],
        fallos: [{ correo: 'viejo@hospital.cl', motivo: '550 buzón inexistente' }],
        createdAt: '2026-09-01T12:00:00.000Z',
      },
    ] as never
  })

  it('sin correo avisa y aun así enseña la vista previa', async () => {
    delete process.env.SMTP_HOST
    const html = await pintar()

    expect(html).toContain('No hay servidor de correo configurado')
    expect(html).toContain('href="/admin-panel/sistema"')
    expect(html).toMatch(/<iframe[^>]*sandbox=""/)
    // El saludo es el de la primera persona de la cola (P-007 E5, D-238), y
    // no el «Nombre» de muestra que llevaba antes: la vista previa enseña el
    // correo que de verdad va a salir.
    expect(html).toContain('Hola, Ana.')
    expect(html).toContain('Así le llega a Ana')
  })

  it('la vista previa saluda a la primera de la cola, y con el grupo vacío vuelve al nombre de muestra', async () => {
    const html = await pintar()
    expect(html).toContain('Hola, Ana.')
    // La primera de la cola sale con el mismo orden y la misma condición que
    // `destinatariosDe`: por id y solo cuentas activas. Si una de las dos
    // cambiara, la vista previa saludaría a alguien que no es el primero.
    const lectura = payload.find.mock.calls
      .map((llamada) => (llamada as unknown[])[0] as Record<string, unknown>)
      .filter((a) => a.collection === 'usuarios' && a.pagination === false && !JSON.stringify(a.where).includes('"in"'))
    expect(lectura).toHaveLength(1)
    expect(lectura[0].sort).toBe('id')
    expect(lectura[0].where).toEqual(condicionDeDestinatarios('todas'))

    estado.cuentas = []
    const vacio = await pintar()
    expect(vacio).toContain('Hola, Nombre.')
    expect(vacio).not.toContain('Así le llega a')
  })

  it('el porcentaje enviado no redondea un fallo hasta el 100 %, y sin destinatarios no lo hay', () => {
    expect(porcentajeEnviado({ enviados: 999, total: 1000 })).toBe(99)
    expect(porcentajeEnviado({ enviados: 12, total: 40 })).toBe(30)
    expect(porcentajeEnviado({ enviados: 3, total: 3 })).toBe(100)
    expect(porcentajeEnviado({ enviados: 0, total: 0 })).toBeNull()
  })

  it('sin correo no se ofrece enviar, aunque el formulario esté bien escrito', () => {
    // Se prueba la regla y no el HTML: la pantalla se pinta con el formulario
    // vacío, y ahí los botones salen desactivados por falta de texto, haya
    // correo o no.
    const listo = { problema: null, ocupado: false, cuantos: 2, algunaEnCurso: false }
    expect(botonesDisponibles({ ...listo, hayCorreo: false })).toEqual({ probar: false, enviar: false })
    expect(botonesDisponibles({ ...listo, hayCorreo: true })).toEqual({ probar: true, enviar: true })
    expect(botonesDisponibles({ ...listo, hayCorreo: true, algunaEnCurso: true })).toEqual({
      probar: true,
      enviar: false,
    })
  })

  it('una detenida cuyo trabajador aún duerme la pausa no bloquea la pantalla', () => {
    expect(hayAlgunaEnviandose([{ estado: 'detenida', enCurso: true }])).toBe(false)
    expect(hayAlgunaEnviandose([{ estado: 'enviando', enCurso: false }])).toBe(false)
    expect(hayAlgunaEnviandose([{ estado: 'enviando', enCurso: true }])).toBe(true)
  })

  it('la duración se dice en buen español', () => {
    // 204 correos a 200 por hora: 203 pausas de 18 s, 61 minutos.
    expect(duracionAproximada(204, 18_000)).toBe('alrededor de una hora y un minuto')
    expect(duracionAproximada(210, 18_000)).toBe('alrededor de una hora y 3 minutos')
    expect(duracionAproximada(1, 18_000)).toBe('menos de un minuto')
  })

  it('una difusión «enviando» sin trabajador se ve como interrumpida, con sus fallos a la vista', async () => {
    const html = await pintar()

    expect(html).toContain('Interrumpida')
    expect(html).toContain('Quedan 28 personas')
    expect(html).toContain('Reanudar')
    expect(html).not.toContain('>Detener<')
    expect(html).toContain('Con fallos')
    expect(html).toContain('viejo@hospital.cl')

    ;(estado.difusionesEnviando[0] as { latidoDelTrabajador?: string }).latidoDelTrabajador = new Date().toISOString()
    const enMarcha = await pintar()
    expect(enMarcha).toContain('>Enviando<')
    expect(enMarcha).toContain('>Detener<')
  })

  it('cuenta cada grupo con una sola lectura de las cuentas, y sin instituciones no pregunta dónde', async () => {
    const html = await pintar()
    // Antes eran un `count` y un `find` por grupo; con los lugares serían dos
    // por cada institución y rol (D-406).
    expect(payload.count.mock.calls.filter((l) => (l as unknown as [{ collection: string }])[0].collection === 'usuarios')).toHaveLength(0)
    expect(html).toContain('Todas las cuentas activas (2)')
    expect(html).toContain('Solo lectores (1)')
    expect(html).toContain('Solo administradores (0)')
    expect(html).not.toContain('Dónde')

    estado.instituciones = [{ id: 7, nombre: 'Hospital del Sur' }]
    estado.cuentas.push({ id: 5, email: 'carla@sur.cl', nombre: 'Carla', rol: 'lector', institucion: 7 })
    const conInstituciones = await pintar()
    expect(conInstituciones).toContain('Dónde')
    expect(conInstituciones).toContain('Todos los lugares')
    expect(conInstituciones).toContain('Solo lectores (2)')
  })

  it('el historial dice por dónde salió cada una, y ofrece retirar el aviso que se ve', async () => {
    estado.instituciones = [{ id: 7, nombre: 'Hospital del Sur' }]
    estado.difusionesEnviando = [
      {
        id: 33,
        asunto: 'Simulador en mantención el sábado',
        audiencia: 'todas',
        lugares: ['7', '99'],
        porCorreo: false,
        comoAviso: true,
        avisoHasta: new Date(Date.now() + 86_400_000).toISOString(),
        autor: null,
        estado: 'enviada',
        total: 5,
        enviados: 0,
        fallidos: 0,
        pendientes: [],
        fallos: [],
        createdAt: '2026-11-16T12:00:00.000Z',
      },
      {
        id: 32,
        asunto: 'Aviso que ya venció',
        botonTexto: 'Abrir el caso',
        botonEnlace: 'https://traumahub.example/caso',
        audiencia: 'lector',
        lugares: null,
        porCorreo: true,
        comoAviso: true,
        avisoHasta: '2026-10-01T12:00:00.000Z',
        autor: null,
        estado: 'enviada',
        total: 4,
        enviados: 4,
        fallidos: 0,
        pendientes: [],
        fallos: [],
        createdAt: '2026-09-20T12:00:00.000Z',
      },
    ] as never
    const html = await pintar()

    expect(html).toContain('Publicada')
    expect(html).toContain('No salió por correo.')
    // La institución borrada sigue nombrada: la difusión le llegó.
    expect(html).toContain('Hospital del Sur, Una institución que ya no existe')
    expect(html).toContain('A la vista hasta el')
    expect(html).toContain('Se dejó de ver el')
    expect(html).toContain('Leído por 2 de 5')
    // Quién siguió el botón, solo del aviso que lo tenía.
    expect(html.match(/2 siguieron el botón/g)).toHaveLength(1)
    expect(html.match(/Retirar el aviso/g)).toHaveLength(1)
    // Las lecturas se cuentan solo de las difusiones con aviso.
    const contadas = payload.count.mock.calls
      .map((l) => (l as unknown as [{ collection: string; where: unknown }])[0])
      .filter((a) => a.collection === 'lecturas-de-avisos')
    expect(contadas.map((a) => a.where)).toEqual([
      { difusion: { equals: 33 } },
      { difusion: { equals: 32 } },
      { and: [{ difusion: { equals: 32 } }, { via: { equals: 'boton' } }] },
    ])
  })
})

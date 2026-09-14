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
 * Al final se pinta la pantalla una vez con los mismos dobles: no hay entorno
 * de navegador para probar el formulario, pero sí para ver que el historial
 * dice «Interrumpida» donde toca y que sin correo los botones no se ofrecen.
 */

const { estado, payload, lanzar } = vi.hoisted(() => ({
  estado: {
    rolReal: 'admin',
    enCurso: new Set<string>(),
    difusionesEnviando: [] as Array<{ id: number; estado: string }>,
    cuentas: [] as Array<{ id: number; email: string; nombre: string }>,
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
  enCurso: (id: number | string) => estado.enCurso.has(String(id)),
  lanzarDifusion: lanzar,
}))

import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import PaginaDifusion from '@/app/(frontend)/admin-panel/difusion/page'
import {
  botonesDisponibles,
  duracionAproximada,
  hayAlgunaEnviandose,
} from '@/app/(frontend)/admin-panel/difusion/PanelDeDifusion'
import {
  detenerDifusion,
  enviarPruebaDeDifusion,
  iniciarDifusion,
  reanudarDifusion,
} from '@/app/(frontend)/acciones/difusion'

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
  estado.enCurso = new Set()
  estado.difusionesEnviando = []
  estado.cuentas = [
    { id: 3, email: 'ana@hospital.cl', nombre: 'Ana' },
    { id: 4, email: 'beto@hospital.cl', nombre: 'Beto' },
  ]
  estado.difusion = null
  payload.find.mockReset().mockImplementation(async ({ collection }: { collection: string }) => ({
    docs: collection === 'difusiones' ? estado.difusionesEnviando : estado.cuentas,
  }))
  payload.findByID.mockReset().mockImplementation(async ({ collection }: { collection: string }) =>
    collection === 'usuarios' ? { id: 1, email: 'jefe@hospital.cl', nombre: 'Jefe' } : estado.difusion,
  )
  payload.create.mockReset().mockResolvedValue({ id: 77 })
  payload.update.mockReset().mockResolvedValue({})
  payload.sendEmail.mockReset().mockResolvedValue(undefined)
  payload.count.mockClear()
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
    estado.difusionesEnviando = [{ id: 9, estado: 'enviando' }]
    estado.enCurso.add('9')

    const respuesta = await iniciarDifusion(DATOS)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/Ya hay una difusión enviándose/)
    expect(payload.create).not.toHaveBeenCalled()
  })

  it('una interrumpida por un reinicio no bloquea empezar otra', async () => {
    estado.difusionesEnviando = [{ id: 9, estado: 'enviando' }]

    const respuesta = await iniciarDifusion(DATOS)

    expect(respuesta).toEqual({ exito: true, datos: { id: '77', total: 2 } })
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'difusiones',
        overrideAccess: true,
        data: expect.objectContaining({
          autor: 1,
          estado: 'enviando',
          audiencia: 'todas',
          total: 2,
          enviados: 0,
          fallidos: 0,
          pendientes: [3, 4],
          fallos: [],
        }),
      }),
    )
    expect(lanzar).toHaveBeenCalledWith(payload, 77)
  })

  it('reanudar tampoco arranca si otra está saliendo', async () => {
    estado.difusion = { id: 5, estado: 'detenida', pendientes: [3, 4] }
    estado.difusionesEnviando = [{ id: 9, estado: 'enviando' }]
    estado.enCurso.add('9')

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
  it('reanudar pone la detenida a enviar y lanza el trabajador', async () => {
    estado.difusion = { id: 5, estado: 'detenida', pendientes: [3, 4] }
    const respuesta = await reanudarDifusion('5')
    expect(respuesta).toEqual({ exito: true, datos: { pendientes: 2 } })
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: '5', data: { estado: 'enviando', terminadaEn: null } }),
    )
    expect(lanzar).toHaveBeenCalledWith(payload, 5)
  })

  it('reanudar no toca una que ya se está enviando, ni una terminada', async () => {
    estado.difusion = { id: 5, estado: 'enviando', pendientes: [3] }
    estado.enCurso.add('5')
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
    // llega el segundo. Sin la reserva, los dos pasaban la pregunta a la base.
    let soltarLista: () => void = () => {}
    const listaRetenida = new Promise<void>((listo) => {
      soltarLista = listo
    })
    payload.find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'usuarios') await listaRetenida
      return { docs: collection === 'difusiones' ? estado.difusionesEnviando : estado.cuentas }
    })

    const primero = iniciarDifusion(DATOS)
    const segundo = await iniciarDifusion(DATOS)
    soltarLista()

    expect(segundo.exito).toBe(false)
    expect(segundo.mensaje).toMatch(/Ya hay una difusión enviándose/)
    expect((await primero).exito).toBe(true)
    expect(payload.create).toHaveBeenCalledTimes(1)
    expect(lanzar).toHaveBeenCalledTimes(1)

    // Y la reserva se suelta: terminada la primera, se puede empezar otra.
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
  ]) {
    expect(respuesta.exito).toBe(false)
  }
  for (const metodo of [payload.find, payload.findByID, payload.create, payload.update, payload.sendEmail]) {
    expect(metodo).not.toHaveBeenCalled()
  }
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
    expect(html).toContain('Hola, Nombre.')
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

    estado.enCurso.add('31')
    const enMarcha = await pintar()
    expect(enMarcha).toContain('>Enviando<')
    expect(enMarcha).toContain('>Detener<')
  })

  it('cuenta los destinatarios de cada grupo con la misma condición que el envío', async () => {
    await pintar()
    expect(payload.count).toHaveBeenCalledTimes(4)
    const condiciones = payload.count.mock.calls.map((llamada) => JSON.stringify((llamada as unknown[])[0]))
    expect(condiciones.every((c) => c.includes('"activo":{"equals":true}'))).toBe(true)
    expect(condiciones.filter((c) => c.includes('"rol"'))).toHaveLength(3)
  })
})

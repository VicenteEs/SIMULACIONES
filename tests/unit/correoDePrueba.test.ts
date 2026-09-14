import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * El botón «Enviarme un correo de prueba» del panel de Sistema
 * (`src/app/(frontend)/acciones/correo.ts`).
 *
 * Es la única comprobación de la plataforma que prueba credenciales y
 * remitente, y la usa quien está configurando el correo, así que su respuesta
 * tiene que decir qué cambiar. Y es una acción que manda correo con la cuenta
 * institucional: se prueba que solo la llama un administrador y que solo
 * escribe a su propia cuenta, diga lo que diga quien la invoca.
 */

const { estado, buscarPorId, enviar, anotarError } = vi.hoisted(() => ({
  estado: { rolReal: 'admin' as string, id: 1 },
  buscarPorId: vi.fn(),
  enviar: vi.fn(),
  anotarError: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: { id: estado.id, rol: estado.rolReal, activo: true },
    activo: true,
    rolReal: estado.rolReal,
    rol: estado.rolReal,
    simulando: false,
    usuarioEfectivo: { id: estado.id, rol: estado.rolReal, activo: true },
  }),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({
    findByID: buscarPorId,
    sendEmail: enviar,
    logger: { error: anotarError },
  }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

import { enviarCorreoDePrueba } from '@/app/(frontend)/acciones/correo'

const VARIABLES = ['SMTP_HOST', 'SMTP_PUERTO', 'SMTP_CLAVE'] as const
const originales = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]))

// Cada prueba con una cuenta distinta: el limitador de la acción cuenta por
// cuenta y vive en memoria durante todo el archivo.
let siguienteId = 100

beforeEach(() => {
  estado.rolReal = 'admin'
  estado.id = ++siguienteId
  for (const v of VARIABLES) delete process.env[v]
  buscarPorId.mockReset()
  buscarPorId.mockImplementation(async ({ id }: { id: string }) => ({
    id,
    email: 'traumatologo@hospital.cl',
    nombre: 'Dra. Prueba',
  }))
  enviar.mockReset()
  enviar.mockResolvedValue({})
  anotarError.mockReset()
  // `accion()` anota en consola todo fallo que no sea de acceso, y aquí los
  // fallos son lo que se prueba.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const v of VARIABLES) {
    if (originales[v] === undefined) delete process.env[v]
    else process.env[v] = originales[v]
  }
})

describe('enviarCorreoDePrueba', () => {
  it('sin SMTP_HOST contesta con un error que nombra la variable, y no intenta enviar', async () => {
    const respuesta = await enviarCorreoDePrueba()
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain('SMTP_HOST')
    expect(enviar).not.toHaveBeenCalled()
    // Una instalación sin correo es un estado normal, no un fallo del envío:
    // no deja rastro de error en el registro.
    expect(anotarError).not.toHaveBeenCalled()
  })

  it('las pulsaciones sin servidor no gastan intentos: configurado el correo, la prueba sale a la primera', async () => {
    // Quien pulsa el botón antes de terminar el `.env` no puede encontrarse,
    // al reiniciar con el correo ya puesto, con que el limitador le hace esperar
    // por intentos que nunca mandaron nada. Más pulsaciones que el máximo, con
    // la misma cuenta.
    for (let i = 0; i < 6; i++) expect((await enviarCorreoDePrueba()).mensaje).toContain('SMTP_HOST')
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    expect((await enviarCorreoDePrueba()).exito).toBe(true)
    expect(enviar).toHaveBeenCalledTimes(1)
  })

  it('con SMTP manda la prueba a la cuenta de quien la pide, con el servidor y el puerto', async () => {
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    process.env.SMTP_PUERTO = '465'
    const respuesta = await enviarCorreoDePrueba()

    expect(respuesta).toEqual({ exito: true, datos: { para: 'traumatologo@hospital.cl' } })
    expect(buscarPorId).toHaveBeenCalledWith(expect.objectContaining({ collection: 'usuarios', id: String(estado.id) }))
    expect(enviar).toHaveBeenCalledTimes(1)
    const [mensaje] = enviar.mock.calls[0] as [Record<string, string>]
    expect(mensaje.to).toBe('traumatologo@hospital.cl')
    expect(mensaje.html).toContain('mail.ejemplo.cl:465')
    expect(mensaje.html).toContain('Dra. Prueba')
  })

  it('no escribe a otra dirección aunque se la pasen: no es un repetidor de correo', async () => {
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    await (enviarCorreoDePrueba as unknown as (para: string) => Promise<unknown>)('victima@otro.cl')
    expect((enviar.mock.calls[0] as [Record<string, string>])[0].to).toBe('traumatologo@hospital.cl')
  })

  it('un fallo de credenciales llega explicado, y el original queda en el registro', async () => {
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    const fallo = Object.assign(new Error('Invalid login: 535 Incorrect authentication data'), {
      code: 'EAUTH',
      responseCode: 535,
    })
    enviar.mockRejectedValue(fallo)

    const respuesta = await enviarCorreoDePrueba()
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toContain('SMTP_USUARIO')
    expect(respuesta.mensaje).toContain('SMTP_CLAVE')
    expect(anotarError).toHaveBeenCalledWith(expect.objectContaining({ err: fallo }))
  })

  it('una cuenta que no es administradora no llega ni a leer la base', async () => {
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    estado.rolReal = 'editor'
    const respuesta = await enviarCorreoDePrueba()
    expect(respuesta.exito).toBe(false)
    expect(buscarPorId).not.toHaveBeenCalled()
    expect(enviar).not.toHaveBeenCalled()
  })

  it('pulsado en bucle se frena antes de gastar la cuota de envío del hosting', async () => {
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    const respuestas = []
    for (let i = 0; i < 7; i++) respuestas.push(await enviarCorreoDePrueba())
    expect(respuestas.filter((r) => r.exito)).toHaveLength(5)
    expect(respuestas.at(-1)?.mensaje).toMatch(/Espere/)
    expect(enviar).toHaveBeenCalledTimes(5)
  })
})

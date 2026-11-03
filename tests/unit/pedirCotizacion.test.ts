import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

/**
 * La cotización que se pide desde la portada (P-007 E3).
 *
 * Es la segunda acción pública que escribe en la base, después de
 * `solicitarCuenta`, y lleva sus mismas defensas: la trampa, los dos frenos,
 * los enlaces fuera del nombre y la institución. Ninguna se nota en pantalla
 * si desaparece —el formulario sigue diciendo «Recibimos tu solicitud»—, así
 * que cada caso de aquí cae si se quita la línea que protege.
 *
 * Payload, las cabeceras y el envío son dobles, como en
 * `solicitudDeCuenta.test.ts`, y por lo mismo el reloj de `setTimeout` es
 * falso: la acción espera un suelo de segundo y medio antes de contestar.
 */

const { estado, buscar, crear, enviar, registrarError } = vi.hoisted(() => ({
  estado: {
    administradores: [] as { id: number; email: string }[],
    smtp: true,
    direccion: '10.0.0.1',
  },
  buscar: vi.fn(),
  crear: vi.fn(),
  enviar: vi.fn(),
  registrarError: vi.fn(),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({
    find: buscar,
    create: crear,
    logger: { error: registrarError, warn() {}, info() {} },
  }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': estado.direccion }),
}))

vi.mock('@/correo/enviar', () => ({
  hayCorreo: () => estado.smtp,
  enviarSinEsperar: enviar,
  enviarCorreo: vi.fn(),
}))

import { pedirCotizacion } from '@/app/(frontend)/acciones/cotizar'
import { mensajeDeCotizacionRecibida } from '@/correo/mensajes'

const BASE = 'https://plataforma.hospital.cl/traumahub'
const direccionOriginal = process.env.NEXT_PUBLIC_SERVER_URL

const PEDIDA = {
  nombre: 'Ana Pérez',
  correo: 'Ana.Perez@Hospital.cl',
  institucion: 'Servicio de Traumatología, Hospital Regional',
  cargo: 'Jefa del programa',
  residentes: '6 a 10',
  modulos: ['patologias', 'cirugias'],
  mensaje: 'Queremos probarlo con una generación.',
  sitioWeb: '',
}

const envios = () =>
  enviar.mock.calls.map(([, envio]) => envio as { para: string | string[]; correo: { asunto: string; boton?: { enlace: string } } })

/** Llama a la acción y adelanta el reloj falso hasta que conteste. */
async function pedir(datos: unknown) {
  let lista = false
  const respuesta = pedirCotizacion(datos).finally(() => {
    lista = true
  })
  while (!lista) await vi.advanceTimersByTimeAsync(250)
  // El aviso a los administradores sale sin esperar: se le da su vuelta.
  await vi.advanceTimersByTimeAsync(0)
  return respuesta
}

beforeEach(() => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('traumahub.ritmo')]
  vi.useFakeTimers({ toFake: ['setTimeout'] })

  process.env.NEXT_PUBLIC_SERVER_URL = BASE
  estado.administradores = [
    { id: 1, email: 'jefe@hospital.cl' },
    { id: 2, email: 'docente@hospital.cl' },
  ]
  estado.smtp = true
  estado.direccion = '10.0.0.1'

  buscar.mockReset()
  buscar.mockImplementation(async () => ({ docs: estado.administradores }))
  crear.mockReset()
  crear.mockResolvedValue({ id: 99 })
  enviar.mockReset()
  registrarError.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  if (direccionOriginal === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
  else process.env.NEXT_PUBLIC_SERVER_URL = direccionOriginal
})

describe('pedirCotizacion', () => {
  it('guarda la solicitud como nueva, diga lo que diga la llamada', async () => {
    const r = await pedir({ ...PEDIDA, estado: 'cerrada', notas: 'colada desde fuera' })
    expect(r.exito).toBe(true)
    expect(crear).toHaveBeenCalledTimes(1)
    const { collection, data, overrideAccess } = crear.mock.calls[0][0]
    expect(collection).toBe('cotizaciones')
    expect(overrideAccess).toBe(true)
    expect(data.estado).toBe('nueva')
    expect(data).not.toHaveProperty('notas')
    // El correo se guarda en minúsculas: es el mismo buzón y así se busca.
    expect(data.correo).toBe('ana.perez@hospital.cl')
  })

  it('no repite un módulo marcado dos veces', async () => {
    await pedir({ ...PEDIDA, modulos: ['cirugias', 'cirugias', 'patologias'] })
    expect(crear.mock.calls[0][0].data.modulos).toEqual(['cirugias', 'patologias'])
  })

  it('manda el acuse a quien pide y el aviso a los administradores, con el enlace al panel', async () => {
    await pedir(PEDIDA)
    const [acuse, aviso] = envios()
    expect(acuse.para).toBe('ana.perez@hospital.cl')
    expect(acuse.correo.asunto).toBe(mensajeDeCotizacionRecibida({ nombre: 'Ana Pérez' }).asunto)
    expect(aviso.para).toEqual(['jefe@hospital.cl', 'docente@hospital.cl'])
    expect(aviso.correo.boton?.enlace).toBe(`${BASE}/admin-panel/cotizaciones/99`)
    // Busca solo administradores activos, y no más de diez.
    const { where, limit } = buscar.mock.calls[0][0]
    expect(JSON.stringify(where)).toContain('"admin"')
    expect(JSON.stringify(where)).toContain('"activo"')
    expect(limit).toBeLessThanOrEqual(10)
  })

  it('sin servidor de correo la guarda igual y no busca a quién avisar', async () => {
    estado.smtp = false
    const r = await pedir(PEDIDA)
    expect(r.exito).toBe(true)
    expect(crear).toHaveBeenCalledTimes(1)
    expect(buscar).not.toHaveBeenCalled()
  })

  it('el campo trampa contesta que sí y no guarda ni manda nada', async () => {
    const r = await pedir({ ...PEDIDA, sitioWeb: 'https://spam.example' })
    expect(r.exito).toBe(true)
    expect(crear).not.toHaveBeenCalled()
    expect(enviar).not.toHaveBeenCalled()
  })

  it('frena a la misma dirección después de cinco en una hora', async () => {
    for (let i = 0; i < 5; i++) expect((await pedir(PEDIDA)).exito).toBe(true)
    crear.mockClear()
    const sexta = await pedir(PEDIDA)
    expect(sexta.exito).toBe(false)
    expect(crear).not.toHaveBeenCalled()
  })

  it.each([
    ['el nombre', { nombre: 'Visita www.spam.example' }],
    ['la institución', { institucion: 'Hospital https://spam.example' }],
    ['el cargo', { cargo: 'spam.example/oferta' }],
  ])('rechaza un enlace en %s', async (_que, cambio) => {
    const r = await pedir({ ...PEDIDA, ...cambio })
    expect(r.exito).toBe(false)
    expect(crear).not.toHaveBeenCalled()
  })

  it.each([
    ['un módulo que no existe', { modulos: ['patologias', 'astrologia'] }],
    ['un tramo de residentes inventado', { residentes: '500' }],
    ['un correo sin dominio', { correo: 'ana@' }],
    ['sin institución', { institucion: '   ' }],
  ])('rechaza %s sin guardar nada', async (_que, cambio) => {
    const r = await pedir({ ...PEDIDA, ...cambio })
    expect(r.exito).toBe(false)
    expect(crear).not.toHaveBeenCalled()
    expect(enviar).not.toHaveBeenCalled()
  })

  it('si la base falla lo dice sin detalles y lo deja en el registro', async () => {
    crear.mockRejectedValueOnce(new Error('relation "cotizaciones" does not exist'))
    const r = await pedir(PEDIDA)
    expect(r.exito).toBe(false)
    expect(r.mensaje).not.toContain('relation')
    expect(registrarError).toHaveBeenCalled()
    expect(enviar).not.toHaveBeenCalled()
  })

  it('con cualquier cosa que no sea un objeto, contesta un error de forma', async () => {
    for (const basura of [null, 'texto', 42, []]) {
      const r = await pedir(basura)
      expect(r.exito).toBe(false)
    }
    expect(crear).not.toHaveBeenCalled()
  })
})

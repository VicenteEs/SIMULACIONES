import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La solicitud pública de cuenta y el enlace de contraseña nueva.
 *
 * `solicitarCuenta` es la primera acción de la plataforma que cualquiera puede
 * llamar sin sesión y que escribe en la base. Todo lo que la hace segura vive
 * en líneas sueltas del servidor —el campo trampa, el freno, la negativa con la
 * base vacía, la cuenta que nace desactivada aunque la llamada diga otra cosa—,
 * y ninguna se nota en pantalla si desaparece: el formulario sigue diciendo
 * «Solicitud enviada». Cada caso de aquí cae si se quita la línea que protege.
 *
 * Payload, las cabeceras y el envío son dobles. El correo se mira en lo que se
 * le entrega a `enviarSinEsperar`, que es lo último que decide esta acción; el
 * transporte y la plantilla tienen sus propias pruebas.
 *
 * El reloj de `setTimeout` es falso: la acción espera a propósito un suelo de
 * segundo y medio antes de contestar, y con el reloj de verdad las cuarenta
 * solicitudes de este archivo tardarían un minuto.
 */

interface Cuenta {
  id: number
  email: string
  nombre?: string
  rol?: string
  activo?: boolean
  pendiente?: boolean
}

const { estado, contar, buscar, crear, pedirTestigo, enviar, registrarError } = vi.hoisted(() => ({
  estado: {
    cuentas: 3,
    existentes: [] as Cuenta[],
    administradores: [] as Cuenta[],
    smtp: true,
    direccion: '10.0.0.1',
  },
  contar: vi.fn(),
  buscar: vi.fn(),
  crear: vi.fn(),
  pedirTestigo: vi.fn(),
  enviar: vi.fn(),
  registrarError: vi.fn(),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({
    count: contar,
    find: buscar,
    create: crear,
    forgotPassword: pedirTestigo,
    logger: { error: registrarError, warn() {}, info() {} },
  }),
  // `sesion.ts` la importa como valor para distinguir la cuenta bloqueada.
  LockedAuth: class LockedAuth extends Error {},
}))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/headers', () => ({
  cookies: async () => ({ set() {}, delete() {}, get: () => undefined }),
  headers: async () => new Headers({ 'x-forwarded-for': estado.direccion }),
}))

vi.mock('@/correo/enviar', () => ({
  hayCorreo: () => estado.smtp,
  enviarSinEsperar: enviar,
  enviarCorreo: vi.fn(),
  SinServidorDeCorreo: class SinServidorDeCorreo extends Error {},
}))

import { pedirEnlaceDeClave, solicitarCuenta } from '@/app/(frontend)/acciones/sesion'
import { mensajeDeClaveNueva, mensajeDeCuentaYaExistente, mensajeDeSolicitudRecibida } from '@/correo/mensajes'

const BASE = 'https://plataforma.hospital.cl/traumahub'
const direccionOriginal = process.env.NEXT_PUBLIC_SERVER_URL

const SOLICITUD = {
  nombre: 'Ana Pérez',
  correo: 'ana.perez@hospital.cl',
  institucion: 'Servicio de Traumatología, Hospital Regional',
  motivo: 'Residente de segundo año.',
  contrasena: 'una-frase-larga-de-prueba',
  sitioWeb: '',
}

/** Lo que recibió `enviarSinEsperar` en cada llamada: destino y correo. */
const envios = () =>
  enviar.mock.calls.map(([, envio]) => envio as { para: string | string[]; correo: { asunto: string; boton?: { enlace: string } } })

/**
 * Llama a la acción y va adelantando el reloj falso hasta que conteste. Sin
 * esto la promesa se queda colgada en el suelo de espera y el caso muere por
 * tiempo, con un mensaje que no dice nada del motivo.
 */
async function pedirCuenta(datos: unknown) {
  let lista = false
  const respuesta = solicitarCuenta(datos).finally(() => {
    lista = true
  })
  while (!lista) await vi.advanceTimersByTimeAsync(250)
  return respuesta
}

beforeEach(() => {
  // El freno vive en `globalThis` a propósito (`src/lib/ritmo.ts`), así que
  // sobrevive entre casos: sin vaciarlo, el sexto caso del archivo ya choca con
  // el límite que puso el primero.
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('traumahub.ritmo')]
  // Solo `setTimeout`: el freno cuenta con `Date.now()` y tiene que seguir
  // viendo el tiempo real, o una hora falsa adelantada lo vaciaría a mitad de caso.
  vi.useFakeTimers({ toFake: ['setTimeout'] })

  process.env.NEXT_PUBLIC_SERVER_URL = BASE
  estado.cuentas = 3
  estado.existentes = []
  estado.administradores = [
    { id: 1, email: 'jefe@hospital.cl', rol: 'admin', activo: true },
    { id: 2, email: 'docente@hospital.cl', rol: 'admin', activo: true },
  ]
  estado.smtp = true
  estado.direccion = '10.0.0.1'

  contar.mockReset()
  contar.mockImplementation(async () => ({ totalDocs: estado.cuentas }))
  buscar.mockReset()
  buscar.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
    if ('email' in where) {
      const correo = (where.email as { equals: string }).equals
      return { docs: estado.existentes.filter((c) => c.email === correo) }
    }
    return { docs: estado.administradores }
  })
  crear.mockReset()
  crear.mockResolvedValue({ id: 99 })
  pedirTestigo.mockReset()
  pedirTestigo.mockResolvedValue('testigo-de-una-hora')
  enviar.mockReset()
  registrarError.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (direccionOriginal === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
  else process.env.NEXT_PUBLIC_SERVER_URL = direccionOriginal
})

describe('la solicitud de cuenta', { timeout: 30_000 }, () => {
  it('con el campo trampa relleno contesta que todo fue bien y no toca nada', async () => {
    const normal = await pedirCuenta(SOLICITUD)
    crear.mockClear()
    contar.mockClear()
    buscar.mockClear()
    enviar.mockClear()

    const robot = await pedirCuenta({ ...SOLICITUD, correo: 'robot@spam.invalid', sitioWeb: 'https://spam.invalid' })

    // Misma respuesta que una persona: si el robot pudiera distinguirlas,
    // aprendería a dejar el campo vacío.
    expect(robot).toEqual(normal)
    expect(contar).not.toHaveBeenCalled()
    expect(buscar).not.toHaveBeenCalled()
    expect(crear).not.toHaveBeenCalled()
    expect(enviar).not.toHaveBeenCalled()
  })

  it('el campo trampa no gasta el cupo de las personas de verdad', async () => {
    // Más que el freno global y desde la misma dirección que la persona: si la
    // trampa se mirara después del freno, el robot dejaría a todo el hospital
    // una hora sin poder pedir cuenta.
    for (let i = 0; i < 31; i++) {
      await pedirCuenta({ ...SOLICITUD, correo: `robot${i}@spam.invalid`, sitioWeb: 'https://spam.invalid' })
    }

    const persona = await pedirCuenta(SOLICITUD)

    expect(persona).toEqual({ exito: true, datos: null })
    expect(crear).toHaveBeenCalledTimes(1)
  })

  it('tarda lo mismo con una cuenta nueva, con una que ya existe y con la trampa', async () => {
    // El camino corto contesta tras una consulta y el largo tras un `pbkdf2` y
    // una escritura: sin el suelo, el cronómetro dice quién tiene cuenta.
    const caminos: Array<[string, () => Promise<unknown>]> = [
      ['cuenta nueva', () => solicitarCuenta({ ...SOLICITUD, correo: 'nueva@hospital.cl' })],
      [
        'cuenta que ya existe',
        () => {
          estado.existentes = [{ id: 7, email: SOLICITUD.correo, nombre: SOLICITUD.nombre }]
          return solicitarCuenta(SOLICITUD)
        },
      ],
      ['campo trampa', () => solicitarCuenta({ ...SOLICITUD, sitioWeb: 'https://spam.invalid' })],
    ]

    for (const [camino, llamar] of caminos) {
      let lista = false
      const respuesta = llamar().finally(() => {
        lista = true
      })
      await vi.advanceTimersByTimeAsync(1000)
      expect(lista, `${camino}: contestó antes del suelo`).toBe(false)
      await vi.advanceTimersByTimeAsync(1000)
      expect(lista, `${camino}: no contestó pasado el suelo`).toBe(true)
      expect(await respuesta).toEqual({ exito: true, datos: null })
    }
  })

  it('con la plataforma sin ninguna cuenta no crea nada', async () => {
    // `ajustarPrimerUsuario` haría administradora activa a esta cuenta: el
    // registro público sería una puerta para quedarse con la plataforma.
    estado.cuentas = 0

    const respuesta = await pedirCuenta(SOLICITUD)

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toBe('La plataforma todavía no está instalada.')
    expect(crear).not.toHaveBeenCalled()
  })

  it('con un correo que ya tiene cuenta no crea otra, avisa al titular y contesta lo mismo', async () => {
    const nueva = await pedirCuenta({ ...SOLICITUD, correo: 'otra.persona@hospital.cl' })
    crear.mockClear()
    enviar.mockClear()

    estado.existentes = [{ id: 7, email: SOLICITUD.correo, nombre: SOLICITUD.nombre, activo: true }]
    const repetida = await pedirCuenta(SOLICITUD)

    expect(repetida).toEqual(nueva)
    expect(crear).not.toHaveBeenCalled()
    const avisos = envios()
    expect(avisos).toHaveLength(1)
    expect(avisos[0].para).toBe(SOLICITUD.correo)
    expect(avisos[0].correo).toEqual(
      mensajeDeCuentaYaExistente({ enlaceEntrar: `${BASE}/entrar`, enlaceClave: `${BASE}/clave` }),
    )
  })

  it('a quien vuelve a pedirla mientras espera le repite el acuse, con el nombre que quedó guardado', async () => {
    // «Ya tiene una cuenta, entre con su contraseña» a quien no puede entrar
    // todavía es mandarle a chocar con «la cuenta no está activada».
    estado.existentes = [
      { id: 7, email: SOLICITUD.correo, nombre: SOLICITUD.nombre, activo: false, pendiente: true },
    ]

    const respuesta = await pedirCuenta({ ...SOLICITUD, nombre: 'Otro Nombre Cualquiera' })

    expect(respuesta).toEqual({ exito: true, datos: null })
    expect(crear).not.toHaveBeenCalled()
    const avisos = envios()
    expect(avisos).toHaveLength(1)
    expect(avisos[0].para).toBe(SOLICITUD.correo)
    expect(avisos[0].correo).toEqual(mensajeDeSolicitudRecibida({ nombre: SOLICITUD.nombre }))
  })

  it('sin dirección pública lo anota y no manda al titular un aviso hecho de enlaces rotos', async () => {
    delete process.env.NEXT_PUBLIC_SERVER_URL
    estado.existentes = [{ id: 7, email: SOLICITUD.correo, nombre: SOLICITUD.nombre, activo: true }]

    const respuesta = await pedirCuenta(SOLICITUD)

    expect(respuesta).toEqual({ exito: true, datos: null })
    expect(enviar).not.toHaveBeenCalled()
    expect(registrarError).toHaveBeenCalledWith(
      expect.objectContaining({ msg: expect.stringContaining('NEXT_PUBLIC_SERVER_URL') }),
    )
  })

  it('la dirección se compara ya normalizada, o las mayúsculas abren una segunda cuenta', async () => {
    estado.existentes = [{ id: 7, email: SOLICITUD.correo }]

    await pedirCuenta({ ...SOLICITUD, correo: '  Ana.Perez@Hospital.CL ' })

    expect(crear).not.toHaveBeenCalled()
  })

  it('la cuenta nace lectora, desactivada y pendiente aunque la llamada pida otra cosa', async () => {
    const respuesta = await pedirCuenta({
      ...SOLICITUD,
      rol: 'admin',
      activo: true,
      origen: 'panel',
      pendiente: false,
      modulosEditables: ['cirugias'],
    })

    expect(respuesta).toEqual({ exito: true, datos: null })
    expect(crear).toHaveBeenCalledTimes(1)
    const { data, overrideAccess } = crear.mock.calls[0][0] as {
      data: Record<string, unknown>
      overrideAccess: boolean
    }
    expect(overrideAccess).toBe(true)
    expect(data).toMatchObject({
      email: SOLICITUD.correo,
      nombre: SOLICITUD.nombre,
      institucion: SOLICITUD.institucion,
      password: SOLICITUD.contrasena,
      rol: 'lector',
      activo: false,
      origen: 'solicitud',
      pendiente: true,
      motivoDeSolicitud: SOLICITUD.motivo,
    })
    expect(Object.keys(data)).not.toContain('modulosEditables')
    expect(Number.isNaN(Date.parse(String(data.solicitadaEn)))).toBe(false)
  })

  it('recorta el motivo a mil caracteres antes de guardarlo', async () => {
    // Quien llama sin formulario no tiene `maxLength`: sin el tope, el texto
    // llega entero a la base y al buzón de cada administrador.
    await pedirCuenta({ ...SOLICITUD, motivo: 'x'.repeat(1500) })

    const { data } = crear.mock.calls[0][0] as { data: { motivoDeSolicitud: string } }
    expect(data.motivoDeSolicitud).toHaveLength(1000)
  })

  it.each([
    ['un enlace con esquema', { nombre: 'Renueve su clave en http://190.45.2.10/entrar' }],
    ['un www', { nombre: 'VISITE WWW.SOPORTE-FALSO.CL' }],
    ['un dominio con ruta, en mayúsculas', { nombre: 'ENTRE EN EVIL.CL/LOGIN' }],
    ['un dominio suelto', { nombre: 'Ana chesscore-soporte.cl' }],
    ['una dirección de correo', { nombre: 'escriba a SOPORTE@EVIL' }],
    ['un salto de línea', { nombre: 'Ana\n\nSu clave vence hoy. Llame al soporte' }],
    ['un enlace en la institución', { institucion: 'Hospital https://evil.example/x' }],
  ])('rechaza %s, que el acuse enviaría desde el buzón de la plataforma', async (_, cambio) => {
    // El nombre va al saludo del acuse, dirigido a la dirección que escribió
    // quien llama, sea suya o no: sin esto la acción manda phishing firmado.
    const respuesta = await pedirCuenta({ ...SOLICITUD, ...cambio })

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/direcciones web/)
    expect(crear).not.toHaveBeenCalled()
    expect(enviar).not.toHaveBeenCalled()
  })

  it.each(['Dra. María José Soto', 'Dra.Soto', "Ana-María O'Higgins", 'Hospital Clínico U.Chile'])(
    'acepta %s: las abreviaturas de siempre no son direcciones',
    async (texto) => {
      const respuesta = await pedirCuenta({ ...SOLICITUD, nombre: texto, institucion: texto })

      expect(respuesta).toEqual({ exito: true, datos: null })
      expect(crear).toHaveBeenCalledTimes(1)
    },
  )

  it('rechaza una contraseña corta sin crear la cuenta', async () => {
    const respuesta = await pedirCuenta({ ...SOLICITUD, contrasena: 'corta' })

    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/12 caracteres/)
    expect(crear).not.toHaveBeenCalled()
  })

  it('exige la institución', async () => {
    const respuesta = await pedirCuenta({ ...SOLICITUD, institucion: '   ' })

    expect(respuesta.exito).toBe(false)
    expect(crear).not.toHaveBeenCalled()
  })

  it('acusa recibo a quien la pide y avisa a los administradores activos', async () => {
    await pedirCuenta(SOLICITUD)

    const avisos = envios()
    const acuse = avisos.find((e) => e.para === SOLICITUD.correo)
    expect(acuse?.correo).toEqual(mensajeDeSolicitudRecibida({ nombre: SOLICITUD.nombre }))

    const aviso = avisos.find((e) => Array.isArray(e.para))
    expect(aviso?.para).toEqual(['jefe@hospital.cl', 'docente@hospital.cl'])
    expect(aviso?.correo.asunto).toContain(SOLICITUD.nombre)
    expect(aviso?.correo.boton?.enlace).toBe(`${BASE}/admin-panel/usuarios`)

    // Y a los administradores se les busca activos: una cuenta de baja no
    // puede activar a nadie, y el aviso a su buzón es ruido para quien ya se fue.
    const consulta = buscar.mock.calls
      .map(([opciones]) => opciones as { where: Record<string, unknown>; overrideAccess?: boolean; limit?: number })
      .find((o) => 'and' in o.where)
    expect(consulta?.where).toEqual({ and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }] })
    expect(consulta?.overrideAccess).toBe(true)
    expect(consulta?.limit).toBe(10)
  })

  it('si otra solicitud con el mismo correo gana la carrera, contesta igual y no revela nada', async () => {
    crear.mockImplementation(async () => {
      estado.existentes = [{ id: 8, email: SOLICITUD.correo }]
      throw new Error('duplicate key value violates unique constraint "usuarios_email_idx"')
    })

    const respuesta = await pedirCuenta(SOLICITUD)

    expect(respuesta).toEqual({ exito: true, datos: null })
    expect(enviar).not.toHaveBeenCalled()
  })

  it('frena a la sexta solicitud desde la misma dirección en una hora', async () => {
    for (let i = 0; i < 5; i++) {
      const respuesta = await pedirCuenta({ ...SOLICITUD, correo: `persona${i}@hospital.cl` })
      expect(respuesta.exito).toBe(true)
    }

    const sexta = await pedirCuenta({ ...SOLICITUD, correo: 'persona5@hospital.cl' })
    expect(sexta.exito).toBe(false)
    expect(sexta.mensaje).toMatch(/Espere/)
    expect(crear).toHaveBeenCalledTimes(5)

    // El freno es por dirección: el resto del hospital sigue pudiendo pedirla.
    estado.direccion = '10.0.0.2'
    expect((await pedirCuenta({ ...SOLICITUD, correo: 'otra@hospital.cl' })).exito).toBe(true)
  })

  it('frena en total aunque cada llamada diga venir de una dirección distinta', async () => {
    // `X-Forwarded-For` lo escribe quien llama si llega directo al puerto.
    for (let i = 0; i < 30; i++) {
      estado.direccion = `10.0.1.${i}`
      expect((await pedirCuenta({ ...SOLICITUD, correo: `p${i}@hospital.cl` })).exito).toBe(true)
    }

    estado.direccion = '10.0.2.1'
    const respuesta = await pedirCuenta({ ...SOLICITUD, correo: 'p30@hospital.cl' })
    expect(respuesta.exito).toBe(false)
    expect(crear).toHaveBeenCalledTimes(30)
  })
})

describe('el enlace de contraseña nueva', { timeout: 30_000 }, () => {
  it('pide el testigo sin el correo de Payload y lo manda con la plantilla', async () => {
    const respuesta = await pedirEnlaceDeClave('Ana.Perez@hospital.cl')

    expect(respuesta).toEqual({ exito: true, datos: null })
    expect(pedirTestigo).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'usuarios', data: { email: SOLICITUD.correo }, disableEmail: true }),
    )
    const avisos = envios()
    expect(avisos).toHaveLength(1)
    expect(avisos[0].para).toBe(SOLICITUD.correo)
    expect(avisos[0].correo).toEqual(mensajeDeClaveNueva(`${BASE}/clave/testigo-de-una-hora`))
  })

  it('sin cuenta con ese correo no manda nada y contesta lo mismo', async () => {
    const conCuenta = await pedirEnlaceDeClave(SOLICITUD.correo)
    enviar.mockClear()
    pedirTestigo.mockResolvedValue(null)

    const sinCuenta = await pedirEnlaceDeClave('nadie@hospital.cl')

    expect(sinCuenta).toEqual(conCuenta)
    expect(pedirTestigo).toHaveBeenLastCalledWith(expect.objectContaining({ disableEmail: true }))
    expect(enviar).not.toHaveBeenCalled()
  })

  it('sin servidor de correo no pide el testigo, que mataría el enlace entregado desde el panel', async () => {
    const conCorreo = await pedirEnlaceDeClave(SOLICITUD.correo)
    pedirTestigo.mockClear()
    enviar.mockClear()
    estado.smtp = false

    const sinCorreo = await pedirEnlaceDeClave(SOLICITUD.correo)

    expect(sinCorreo).toEqual(conCorreo)
    expect(pedirTestigo).not.toHaveBeenCalled()
    expect(enviar).not.toHaveBeenCalled()
  })

  it('sin dirección pública no pide el testigo y deja rastro del motivo', async () => {
    delete process.env.NEXT_PUBLIC_SERVER_URL

    const respuesta = await pedirEnlaceDeClave(SOLICITUD.correo)

    expect(respuesta).toEqual({ exito: true, datos: null })
    expect(pedirTestigo).not.toHaveBeenCalled()
    expect(enviar).not.toHaveBeenCalled()
    expect(registrarError).toHaveBeenCalledWith(
      expect.objectContaining({ msg: expect.stringContaining('NEXT_PUBLIC_SERVER_URL') }),
    )
  })

  it('si falla al emitir el testigo contesta igual pero lo anota', async () => {
    const bien = await pedirEnlaceDeClave(SOLICITUD.correo)
    pedirTestigo.mockRejectedValue(new Error('la base no responde'))

    const mal = await pedirEnlaceDeClave(SOLICITUD.correo)

    expect(mal).toEqual(bien)
    expect(registrarError).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'No se pudo emitir el enlace de clave nueva' }),
    )
  })
})

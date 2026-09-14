import { existsSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import {
  enviarCorreo,
  enviarSinEsperar,
  explicarFalloDeCorreo,
  hayCorreo,
  puertoDeCorreo,
  SinServidorDeCorreo,
} from '@/correo/enviar'
import { CID_DEL_LOGO, type Correo } from '@/correo/plantilla'
import { Comentarios } from '@/collections/Comentarios'

/**
 * El único sitio por donde sale un correo (`src/correo/enviar.ts`).
 *
 * Las variables `SMTP_*` se fijan en cada prueba y se devuelven al terminar:
 * `tests/setup.ts` carga el `.env` de la máquina, y sin esto el resultado
 * dependería de si quien corre la suite tiene un servidor de correo
 * configurado.
 */

const VARIABLES = ['SMTP_HOST', 'SMTP_PUERTO', 'SMTP_CLAVE', 'SMTP_USUARIO'] as const
const originales = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]))

beforeEach(() => {
  for (const v of VARIABLES) delete process.env[v]
})

afterEach(() => {
  for (const v of VARIABLES) {
    if (originales[v] === undefined) delete process.env[v]
    else process.env[v] = originales[v]
  }
})

const CORREO: Correo = {
  asunto: 'Asunto de prueba',
  resumen: 'Resumen',
  titulo: 'Título',
  bloques: [{ tipo: 'parrafo', texto: 'Cuerpo' }],
}

function payloadFalso(sendEmail = vi.fn(async () => ({}))) {
  const error = vi.fn()
  return { payload: { sendEmail, logger: { error } } as unknown as Payload, sendEmail, error }
}

/** Deja correr las promesas pendientes y el aviso de rechazo no atendido. */
const esperarUnMomento = () => new Promise((resolver) => setTimeout(resolver, 20))

describe('enviarCorreo', () => {
  it('sin SMTP_HOST lanza SinServidorDeCorreo y no llama al transporte', async () => {
    const { payload, sendEmail } = payloadFalso()
    expect(hayCorreo()).toBe(false)
    await expect(enviarCorreo(payload, { para: 'a@b.cl', correo: CORREO })).rejects.toBeInstanceOf(SinServidorDeCorreo)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('con SMTP manda HTML y texto, con el logotipo adjunto bajo su cid', async () => {
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    const { payload, sendEmail } = payloadFalso()
    await enviarCorreo(payload, { para: ['a@b.cl', 'c@d.cl'], correo: CORREO })

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const [mensaje] = sendEmail.mock.calls[0] as unknown as [Record<string, any>]
    expect(mensaje.to).toEqual(['a@b.cl', 'c@d.cl'])
    expect(mensaje.subject).toBe('Asunto de prueba')
    expect(mensaje.html).toContain(`src="cid:${CID_DEL_LOGO}"`)
    expect(mensaje.text).toContain('Cuerpo')
    expect(mensaje.text).not.toContain('<')
    expect(mensaje.replyTo).toBeUndefined()
    expect(mensaje.attachments).toHaveLength(1)
    expect(mensaje.attachments[0].cid).toBe(CID_DEL_LOGO)
    // Un adjunto que apunta a un archivo que no existe tumba el envío entero,
    // no solo la imagen: nodemailer no manda el mensaje sin él.
    expect(existsSync(mensaje.attachments[0].path)).toBe(true)
  })

  it('pone responder-a solo cuando se pide', async () => {
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    const { payload, sendEmail } = payloadFalso()
    await enviarCorreo(payload, { para: 'a@b.cl', correo: CORREO, responderA: 'admin@hospital.cl' })
    expect((sendEmail.mock.calls[0] as unknown as [Record<string, unknown>])[0].replyTo).toBe('admin@hospital.cl')
  })
})

describe('enviarSinEsperar', () => {
  it('sin SMTP no llama al transporte ni anota nada: no es un fallo, es una instalación sin correo', async () => {
    const { payload, sendEmail, error } = payloadFalso()
    enviarSinEsperar(payload, { para: 'a@b.cl', correo: CORREO }, 'aviso de prueba')
    await esperarUnMomento()
    expect(sendEmail).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('no devuelve nada que esperar, y un fallo queda anotado sin rechazo no atendido', async () => {
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    const fallo = new Error('el servidor se fue')
    const { payload, error } = payloadFalso(vi.fn(async () => Promise.reject(fallo)))
    const rechazos: unknown[] = []
    const anotarRechazo = (motivo: unknown) => rechazos.push(motivo)
    process.on('unhandledRejection', anotarRechazo)
    try {
      const devuelto = enviarSinEsperar(payload, { para: 'a@b.cl', correo: CORREO }, 'aviso de prueba')
      expect(devuelto).toBeUndefined()
      await esperarUnMomento()
    } finally {
      process.off('unhandledRejection', anotarRechazo)
    }
    expect(rechazos).toEqual([])
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith({ msg: expect.stringContaining('aviso de prueba'), err: fallo })
  })
})

describe('el aviso de comentario nuevo (gancho de `Comentarios`)', () => {
  const gancho = Comentarios.hooks!.afterChange![0] as unknown as (argumentos: Record<string, unknown>) => Promise<unknown>

  function peticion(sendEmail: ReturnType<typeof vi.fn>) {
    const find = vi.fn(async () => ({ docs: [{ email: 'jefe@hospital.cl' }, { email: 'tutora@hospital.cl' }, {}] }))
    return {
      find,
      req: {
        payload: { find, sendEmail, logger: { error: vi.fn() } },
        user: { id: 3, nombre: 'Residente Uno', email: 'residente@hospital.cl' },
      },
    }
  }

  const DOC = { id: 9, coleccion: 'casos-ao', documentoId: '12', texto: 'La placa <b>no</b> se ve' }

  it('sin SMTP no consulta a los administradores', async () => {
    const { req, find } = peticion(vi.fn())
    await gancho({ doc: DOC, operation: 'create', req })
    expect(find).not.toHaveBeenCalled()
  })

  it('no espera al servidor de correo: el comentario se guarda aunque el envío no termine nunca', async () => {
    // Un `await` aquí deja abierta la transacción que insertó el comentario
    // todo lo que tarde el SMTP (ver el comentario del gancho). El envío que no
    // termina nunca es ese servidor colgado; el tope es lo que tarda en fallar
    // esta prueba si alguien vuelve a poner el `await`.
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    const sendEmail = vi.fn(() => new Promise(() => {}))
    const { req } = peticion(sendEmail)
    const resultado = await Promise.race([
      gancho({ doc: DOC, operation: 'create', req }),
      new Promise((resolver) => setTimeout(() => resolver('colgado'), 500)),
    ])
    expect(resultado).toBe(DOC)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('llega a los administradores con el nombre del módulo, el autor y el texto escapado una sola vez', async () => {
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    const sendEmail = vi.fn(async () => ({}))
    const { req } = peticion(sendEmail)
    await gancho({ doc: DOC, operation: 'create', req })

    const [mensaje] = sendEmail.mock.calls[0] as unknown as [Record<string, string>]
    expect(mensaje.to).toEqual(['jefe@hospital.cl', 'tutora@hospital.cl'])
    expect(mensaje.subject).toBe('TraumaHub · Nuevo comentario en Técnica AO')
    expect(mensaje.html).toContain('Residente Uno')
    expect(mensaje.html).toContain('La placa &lt;b&gt;no&lt;/b&gt; se ve')
    expect(mensaje.html).not.toContain('&amp;lt;')
    expect(mensaje.text).toContain('La placa <b>no</b> se ve')
  })

  it('una edición no avisa', async () => {
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    const sendEmail = vi.fn(async () => ({}))
    const { req, find } = peticion(sendEmail)
    await gancho({ doc: DOC, operation: 'update', req })
    expect(find).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('puertoDeCorreo', () => {
  it('587 por omisión, y el de SMTP_PUERTO si está', () => {
    expect(puertoDeCorreo()).toBe(587)
    process.env.SMTP_PUERTO = '465'
    expect(puertoDeCorreo()).toBe(465)
  })
})

/** Un error con la forma que le da nodemailer (`_formatError` en smtp-connection). */
const errorDeNodemailer = (mensaje: string, campos: Record<string, unknown>) =>
  Object.assign(new Error(mensaje), campos)

describe('explicarFalloDeCorreo', () => {
  beforeEach(() => {
    process.env.SMTP_HOST = 'mail.ejemplo.cl'
    process.env.SMTP_PUERTO = '465'
  })

  it('credenciales rechazadas: nombra SMTP_USUARIO y SMTP_CLAVE', () => {
    const explicado = explicarFalloDeCorreo(
      errorDeNodemailer('Invalid login: 535 Incorrect authentication data', {
        code: 'EAUTH',
        response: '535 Incorrect authentication data',
        responseCode: 535,
        command: 'AUTH PLAIN',
      }),
    )
    expect(explicado).toContain('SMTP_USUARIO')
    expect(explicado).toContain('SMTP_CLAVE')
  })

  it('un 535 sin código también es de credenciales', () => {
    expect(explicarFalloDeCorreo({ responseCode: 535, message: '535 Authentication failed' })).toContain('SMTP_CLAVE')
  })

  it('credenciales ausentes: dice que faltan, no que estén mal', () => {
    const explicado = explicarFalloDeCorreo(
      errorDeNodemailer('Missing credentials for "PLAIN"', { code: 'EAUTH', command: 'API' }),
    )
    expect(explicado).toMatch(/falta SMTP_USUARIO o SMTP_CLAVE/)
  })

  it.each(['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EDNS'])(
    'sin conexión (%s): nombra servidor y puerto',
    (code) => {
      const explicado = explicarFalloDeCorreo(errorDeNodemailer('connect failed', { code, command: 'CONN' }))
      expect(explicado).toContain('No se pudo conectar con mail.ejemplo.cl:465')
      expect(explicado).toContain('cortafuegos')
    },
  )

  it('certificado de otro nombre: manda al nombre de «Conectar dispositivos», aunque llegue como ESOCKET', () => {
    // nodemailer reescribe el código de Node con el suyo: el certificado que no
    // casa llega como `ESOCKET`, y solo el texto lo distingue de un cortafuegos.
    const explicado = explicarFalloDeCorreo(
      errorDeNodemailer(
        "Hostname/IP does not match certificate's altnames: Host: mail.ejemplo.cl. is not in the cert's altnames: DNS:*.hosting.cl",
        { code: 'ESOCKET', command: 'CONN' },
      ),
    )
    expect(explicado).toContain('Conectar dispositivos')
    expect(explicado).not.toContain('cortafuegos')
    expect(explicarFalloDeCorreo(errorDeNodemailer('x', { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }))).toContain(
      'Conectar dispositivos',
    )
  })

  it.each([
    ['autofirmado', 'self-signed certificate in certificate chain', 'ESOCKET'],
    ['caducado', 'certificate has expired', 'ESOCKET'],
    ['sin cadena', 'unable to verify the first certificate', 'ESOCKET'],
    ['por código de Node', 'x', 'CERT_HAS_EXPIRED'],
  ])('certificado %s: se explica como certificado y no como cortafuegos', (_caso, mensaje, code) => {
    // En el 465 todo fallo de TLS llega como `ESOCKET`; al principio solo se
    // reconocía el de nombre, y un certificado autofirmado mientras AutoSSL no
    // lo emite mandaba a revisar el cortafuegos.
    const explicado = explicarFalloDeCorreo(errorDeNodemailer(mensaje, { code, command: 'CONN' }))
    expect(explicado).toContain('certificado del servidor de correo no es válido')
    expect(explicado).not.toContain('cortafuegos')
  })

  it('una respuesta temporal (4xx) en MAIL FROM no culpa al remitente: dice que se reintente', () => {
    const respuesta = '451 Temporary local problem - please try later'
    const explicado = explicarFalloDeCorreo(
      errorDeNodemailer(`Mail command failed: ${respuesta}`, {
        code: 'EENVELOPE',
        response: respuesta,
        responseCode: 451,
        command: 'MAIL FROM',
      }),
    )
    expect(explicado).not.toContain('SMTP_DESDE')
    expect(explicado).toContain('Vuelva a intentarlo más tarde')
    expect(explicado).toContain(respuesta)
  })

  it('un rechazo que habla de autenticación, aunque diga «from», no se atribuye al remitente', () => {
    const respuesta = '550 Mail from unauthenticated users is not allowed'
    const explicado = explicarFalloDeCorreo(
      errorDeNodemailer(`Mail command failed: ${respuesta}`, {
        code: 'EENVELOPE',
        response: respuesta,
        responseCode: 550,
        command: 'MAIL FROM',
      }),
    )
    expect(explicado).not.toContain('SMTP_DESDE')
  })

  it('remitente rechazado en MAIL FROM: SMTP_DESDE tiene que ser la cuenta de SMTP_USUARIO', () => {
    const explicado = explicarFalloDeCorreo(
      errorDeNodemailer('Mail command failed: 553 5.7.1 Access denied', {
        code: 'EENVELOPE',
        response: '553 5.7.1 Access denied',
        responseCode: 553,
        command: 'MAIL FROM',
      }),
    )
    expect(explicado).toContain('SMTP_DESDE')
    expect(explicado).toContain('SMTP_USUARIO')
  })

  it('el 550 de cPanel por remitente distinto de la cuenta, aunque llegue en RCPT TO', () => {
    const respuesta =
      '550 Your FROM address ( otro@ejemplo.cl ) must match your authenticated email user ( contacto@ejemplo.cl ). Treating this as a spoofed email.'
    const explicado = explicarFalloDeCorreo(
      errorDeNodemailer(`Can't send mail - all recipients were rejected: ${respuesta}`, {
        code: 'EENVELOPE',
        response: respuesta,
        responseCode: 550,
        command: 'RCPT TO',
      }),
    )
    expect(explicado).toContain('SMTP_DESDE')
  })

  it('un destinatario que no existe no se atribuye al remitente: se deja lo que dijo el servidor', () => {
    const mensaje = "Can't send mail - all recipients were rejected: 550 No such user here"
    const explicado = explicarFalloDeCorreo(
      errorDeNodemailer(mensaje, {
        code: 'EENVELOPE',
        response: '550 No such user here',
        responseCode: 550,
        command: 'RCPT TO',
      }),
    )
    expect(explicado).not.toContain('SMTP_DESDE')
    expect(explicado).toBe(mensaje)
  })

  it('cualquier otro fallo devuelve su mensaje tal cual', () => {
    expect(explicarFalloDeCorreo(new Error('algo que nadie previó'))).toBe('algo que nadie previó')
    expect(explicarFalloDeCorreo('una cadena suelta')).toBe('una cadena suelta')
  })

  it('nunca incluye la clave, aunque venga dentro del error', () => {
    process.env.SMTP_CLAVE = 'Clave-De-Prueba-123'
    for (const code of ['EAUTH', 'ESOCKET', 'EENVELOPE', undefined]) {
      const explicado = explicarFalloDeCorreo(
        errorDeNodemailer('el servidor repitió Clave-De-Prueba-123 en su respuesta from', { code }),
      )
      expect(explicado).not.toContain('Clave-De-Prueba-123')
    }
  })

  it('una clave que es parte del servidor no se delata tachándola, y una clave corta no destroza la frase', () => {
    // Tachar la clave en la frase ya armada dejaba leer «mail.********.cl»:
    // con el nombre del servidor delante, la clave quedaba a la vista.
    process.env.SMTP_CLAVE = 'ejemplo'
    const conexion = explicarFalloDeCorreo(
      errorDeNodemailer('connect ECONNREFUSED mail.ejemplo.cl:465', { code: 'ECONNREFUSED', command: 'CONN' }),
    )
    expect(conexion).toContain('No se pudo conectar con mail.ejemplo.cl:465')
    expect(conexion).not.toContain('*')
    expect(conexion).not.toContain('ECONNREFUSED mail.ejemplo.cl')

    process.env.SMTP_CLAVE = 'a'
    const credenciales = explicarFalloDeCorreo(
      errorDeNodemailer('Invalid login: 535 Incorrect authentication data', { code: 'EAUTH', responseCode: 535 }),
    )
    expect(credenciales).toContain('El servidor de correo rechazó el usuario o la clave')
    expect(credenciales).not.toContain('*')
    expect(credenciales).not.toContain('Invalid login')
  })
})

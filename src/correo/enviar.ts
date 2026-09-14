import { join } from 'node:path'
import type { Payload } from 'payload'
import { armarCorreo, CID_DEL_LOGO, type Correo } from './plantilla'

/**
 * El único sitio por donde sale un correo de la plataforma.
 *
 * Antes cada remitente llamaba a `payload.sendEmail` con su propio HTML y su
 * propia manera de decidir si había servidor. Aquí se decide una vez: con qué
 * plantilla, con qué remitente, con el logotipo adjunto y qué pasa cuando no hay
 * servidor configurado.
 */

/**
 * ¿Hay servidor de correo configurado?
 *
 * La variable que decide es `SMTP_HOST`, la misma que mira `payload.config.ts`
 * para montar el transporte. Si esta pregunta mirara otra cosa —las
 * credenciales, por ejemplo—, el panel podría decir «hay correo» con un
 * transporte que Payload nunca montó, o al revés.
 */
export const hayCorreo = (): boolean => Boolean(process.env.SMTP_HOST)

/**
 * El puerto por el que sale el correo, calculado como en `payload.config.ts`.
 *
 * Lo preguntan la página de Sistema, que saluda a ese puerto, y los mensajes de
 * error, que lo nombran. Si cualquiera de los dos lo calculara a su manera —otro
 * valor por omisión, un `parseInt` que acepta `587abc`—, el panel comprobaría y
 * explicaría un puerto mientras el transporte sale por otro: un diagnóstico que
 * tranquiliza sobre algo que no miró. `payload.config.ts` no lo importa porque
 * se carga antes que nada y no conviene que arrastre la plantilla; las dos
 * expresiones tienen que seguir siendo la misma.
 */
export const puertoDeCorreo = (): number => Number(process.env.SMTP_PUERTO || 587)

export class SinServidorDeCorreo extends Error {
  constructor() {
    super(
      'No hay servidor de correo configurado (SMTP_HOST en .env), así que no se puede enviar. Ver docs/CORREO.md.',
    )
    this.name = 'SinServidorDeCorreo'
  }
}

/** El logotipo que viaja dentro del mensaje. Ver `CID_DEL_LOGO`. */
const RUTA_DEL_LOGO = join(process.cwd(), 'public', 'logo-correo.png')

export interface Envio {
  para: string | string[]
  correo: Correo
  /** A quién contesta quien pulse «Responder». Por omisión, al remitente. */
  responderA?: string
}

/**
 * Envía un correo y espera a que el servidor lo acepte.
 *
 * Lanza si no hay servidor (`SinServidorDeCorreo`) o si el transporte falla.
 * Quien no pueda esperar —un gancho dentro de una transacción, una respuesta que
 * no debe tardar— usa `enviarSinEsperar`.
 *
 * El remitente no se pone aquí: lo pone el adaptador de nodemailer con
 * `SMTP_NOMBRE` y `SMTP_DESDE` (`payload.config.ts`). Escribirlo también aquí
 * serían dos fuentes para el mismo dato, y con cPanel el remitente **tiene** que
 * ser la cuenta con la que se autentica: uno distinto lo rechaza el servidor o
 * lo marca como suplantación.
 */
export async function enviarCorreo(payload: Payload, envio: Envio): Promise<void> {
  if (!hayCorreo()) throw new SinServidorDeCorreo()
  const armado = armarCorreo(envio.correo, { logo: `cid:${CID_DEL_LOGO}` })
  await payload.sendEmail({
    to: envio.para,
    subject: armado.asunto,
    html: armado.html,
    text: armado.texto,
    ...(envio.responderA ? { replyTo: envio.responderA } : {}),
    attachments: [{ filename: 'traumahub.png', path: RUTA_DEL_LOGO, cid: CID_DEL_LOGO }],
  })
}

/**
 * Envía sin esperar, y sin tumbar nada si falla.
 *
 * Para los avisos que no pueden retrasar lo que los provoca: la respuesta a
 * quien pide una cuenta no puede quedarse girando lo que tarde el servidor de
 * correo, y un gancho de Payload no puede tener abierta su transacción mientras
 * tanto (el porqué largo está en `src/collections/Comentarios.ts`).
 *
 * Sin servidor configurado no hace nada y no anota nada: es el estado normal de
 * una instalación nueva, no un fallo. Con servidor, el fallo queda en el
 * registro con su motivo. El `.catch` es obligatorio: una promesa suelta que se
 * rompe después de responder tumba el proceso de Node por rechazo no atendido.
 */
export function enviarSinEsperar(payload: Payload, envio: Envio, queSeEnviaba: string): void {
  if (!hayCorreo()) return
  void enviarCorreo(payload, envio).catch((error: unknown) =>
    payload.logger.error({ msg: `No se pudo enviar el correo: ${queSeEnviaba}`, err: error }),
  )
}

/** Los códigos con los que nodemailer (y Node debajo) dicen «no llegué al servidor». */
const FALLOS_DE_CONEXION = new Set(['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EDNS'])

/**
 * Traduce un fallo de envío a lo que hay que cambiar para que deje de fallar.
 *
 * Lo que nodemailer devuelve está escrito para quien depura el protocolo:
 * «Invalid login: 535 Incorrect authentication data» no dice qué variable del
 * `.env` tocar, y quien lo lee es un administrador delante del botón de prueba.
 * Cada caso de aquí es uno de los tropiezos habituales al configurar una cuenta
 * de cPanel, con la variable que lo arregla.
 *
 * El orden importa. nodemailer **reescribe** el `code` del error de Node con
 * el suyo (`_formatError` en `smtp-connection`): en el puerto 465 cualquier
 * fallo de TLS —certificado de otro nombre, autofirmado, caducado— llega como
 * `ESOCKET`, así que si la conexión se mirara primero, el problema del
 * certificado se explicaría como un cortafuegos. Por eso los certificados se
 * reconocen también por el texto, y van delante.
 *
 * Una respuesta 4xx es temporal y va antes que las demás: el servidor no dice
 * que algo esté mal configurado sino «ahora no», y en un hosting compartido lo
 * habitual es la cuota de envíos por hora. Culpar de un «451 Temporary local
 * problem» en MAIL FROM a `SMTP_DESDE` —como se hacía al principio, con todo
 * rechazo en ese paso— manda a cambiar algo que está bien.
 *
 * Al remitente solo se le atribuye un rechazo definitivo (5xx): el que habla de
 * él, o el que llega en MAIL FROM sin hablar de autenticación ni de relevo.
 * Uno de destinatario —«550 No such user»— tiene el mismo número, y mandar al
 * administrador a cambiar `SMTP_DESDE` por un buzón que no existe es peor que
 * no explicar nada: se queda el mensaje del servidor, que sí lo dice. Tampoco
 * se busca la palabra «from» suelta, que aparece en «Mail from unauthenticated
 * users is not allowed», un problema de credenciales y no de remitente.
 *
 * La clave nunca sale. Hoy nodemailer no la escribe en sus mensajes, pero esta
 * frase acaba en la pantalla del panel, y el día que una versión la incluya —o
 * un servidor la repita en su respuesta— no puede ser esta función la que la
 * enseñe. Solo se mira el texto que viene del servidor, y si la contiene se
 * quita entero en vez de tacharla dentro. Al principio se sustituía la clave
 * por asteriscos en la frase ya armada, y eso la delataba: con
 * `SMTP_HOST=mail.chesscore.cl` y la clave `chesscore`, el panel leía
 * «mail.********.cl», y una clave corta dejaba la frase ilegible. Por lo mismo
 * el aviso no dice *por qué* se quitó el detalle: «contenía la clave» junto al
 * nombre del servidor ya es una pista.
 */
export function explicarFalloDeCorreo(error: unknown): string {
  const fallo = (typeof error === 'object' && error !== null ? error : {}) as {
    code?: unknown
    responseCode?: unknown
    response?: unknown
    command?: unknown
    message?: unknown
  }
  const codigo = typeof fallo.code === 'string' ? fallo.code : ''
  const respuesta = typeof fallo.response === 'string' ? fallo.response : ''
  const mensaje =
    typeof fallo.message === 'string' && fallo.message ? fallo.message : String(error ?? 'error desconocido')
  const numero = typeof fallo.responseCode === 'number' ? fallo.responseCode : Number(/^\d{3}/.exec(respuesta)?.[0])
  const destino = `${process.env.SMTP_HOST ?? '(sin SMTP_HOST)'}:${puertoDeCorreo()}`
  const textoDelServidor = `${mensaje} ${respuesta}`

  const clave = process.env.SMTP_CLAVE
  const detalleOculto = Boolean(clave) && textoDelServidor.includes(clave as string)
  const detalle = detalleOculto ? ' (Se omitió el detalle que dio el servidor.)' : ` (${mensaje})`

  if (codigo === 'ERR_TLS_CERT_ALTNAME_INVALID' || /altnames/i.test(mensaje)) {
    return `El certificado del servidor de correo no corresponde al nombre ${process.env.SMTP_HOST ?? ''}. Use como SMTP_HOST el nombre de servidor que cPanel muestra en «Conectar dispositivos» (Configurar cliente de correo), no un alias como mail.su-dominio.${detalle}`
  }
  if (/certificate|self[- ]signed|CERT_|unable to (verify|get)/i.test(`${codigo} ${mensaje}`)) {
    return `El certificado del servidor de correo no es válido (autofirmado, caducado o sin su cadena). Use como SMTP_HOST el nombre de servidor que cPanel muestra en «Conectar dispositivos», que lleva el certificado del hosting, o espere a que AutoSSL emita el del dominio.${detalle}`
  }
  if (numero >= 400 && numero < 500) {
    return `El servidor de correo no aceptó el envío por ahora (respuesta temporal ${numero}). Vuelva a intentarlo más tarde; si se repite, puede ser el límite de envíos por hora del hosting.${detalle}`
  }
  if (codigo === 'EAUTH' || numero === 535) {
    if (/missing credentials/i.test(mensaje)) {
      return 'El servidor de correo pide usuario y clave, y falta SMTP_USUARIO o SMTP_CLAVE en el .env.'
    }
    return `El servidor de correo rechazó el usuario o la clave (SMTP_USUARIO / SMTP_CLAVE). SMTP_USUARIO tiene que ser la dirección completa de la cuenta, con su dominio, y SMTP_CLAVE la clave de esa cuenta de correo, no la de cPanel.${detalle}`
  }
  const definitivo = numero >= 500 && numero < 600
  const hablaDelRemitente = /sender|remitente|spoof|from address/i.test(textoDelServidor)
  const hablaDeAutenticacion = /authenticat|relay/i.test(textoDelServidor)
  if (
    definitivo &&
    (hablaDelRemitente || (codigo === 'EENVELOPE' && fallo.command === 'MAIL FROM' && !hablaDeAutenticacion))
  ) {
    return `El servidor de correo no acepta el remitente. SMTP_DESDE tiene que ser la misma cuenta que SMTP_USUARIO (o quedar vacío para que se use esa).${detalle}`
  }
  if (FALLOS_DE_CONEXION.has(codigo)) {
    return `No se pudo conectar con ${destino}. Compruebe el nombre del servidor (SMTP_HOST), el puerto (SMTP_PUERTO: 465 con SSL, 587 con STARTTLS) y que ningún cortafuegos bloquee la salida por ese puerto.${detalle}`
  }
  return detalleOculto ? 'El envío falló, y se omitió el detalle que dio el servidor.' : mensaje
}

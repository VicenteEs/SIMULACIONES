'use server'

/**
 * Difusión: el correo que un administrador manda a todas las cuentas.
 *
 * El envío en sí lo hace el trabajador de `src/correo/difusion.ts`, despacio y
 * con la cola guardada. Estas acciones solo deciden si se puede empezar,
 * reanudar o detener, y lo dejan anotado en la difusión.
 *
 * Todas son de administrador. Una difusión es un correo con el nombre de la
 * plataforma a cada persona que tiene cuenta: es la acción del panel que más
 * lejos llega y la que menos se puede deshacer.
 */

import { revalidatePath } from 'next/cache'
import type { Payload } from 'payload'
import { AUDIENCIAS_DE_DIFUSION, type AudienciaDeDifusion } from '@/collections/Difusiones'
import { destinatariosDe, enCurso, lanzarDifusion, reservarInicioDeDifusion } from '@/correo/difusion'
import { enviarCorreo, explicarFalloDeCorreo, hayCorreo, SinServidorDeCorreo } from '@/correo/enviar'
import { mensajeDeDifusion, type DatosDeDifusion } from '@/correo/mensajes'
import { esEnlaceSeguro } from '@/correo/plantilla'
import { accion, exigirAdmin, type Respuesta } from '@/lib/guardias'
import { crearLimitador } from '@/lib/ritmo'
import { ErrorDeValidacion, exigirIdentificador, exigirTexto } from '@/lib/validacion'

const RUTA = '/admin-panel/difusion'

/**
 * Cada prueba gasta un correo de la cuota por hora del hosting, la misma de la
 * que salen los enlaces de contraseña; es el mismo freno que el correo de prueba
 * de Sistema (`acciones/correo.ts`). Quien retoca el texto y se lo manda otra
 * vez para verlo en su buzón no pasa de cinco en diez minutos; un bucle, sí.
 */
const limitadorDePruebas = crearLimitador('difusion-prueba', { maximo: 5, ventanaMs: 10 * 60_000 })

/**
 * Lo que llega del formulario, comprobado.
 *
 * Los cuatro techos son los de la colección (`Difusiones.ts`) salvo el del
 * mensaje, que allí es un `textarea` sin límite: cinco mil caracteres son dos
 * pantallas de correo, y lo que no quepa ahí es un documento, no un aviso.
 *
 * Un campo del botón con solo espacios cuenta como vacío. `textoOpcional`
 * lanzaría «no puede quedar vacío» sobre un campo que el formulario presenta
 * como opcional, y el administrador no vería qué escribió mal.
 */
function validarDatos(bruto: unknown): DatosDeDifusion {
  const datos = (typeof bruto === 'object' && bruto !== null ? bruto : {}) as Record<string, unknown>
  // El asunto va a una cabecera del correo: sin saltos de línea, que en una
  // cabecera separan una de la siguiente.
  const asunto = exigirTexto(datos.asunto, 'El asunto', 150).replace(/\s+/g, ' ')
  const mensaje = exigirTexto(datos.mensaje, 'El mensaje', 5000)

  const opcional = (valor: unknown, que: string, maximo: number): string | undefined => {
    if (valor == null || (typeof valor === 'string' && valor.trim() === '')) return undefined
    return exigirTexto(valor, que, maximo)
  }
  const texto = opcional(datos.botonTexto, 'El texto del botón', 60)
  const enlace = opcional(datos.botonEnlace, 'El enlace del botón', 500)

  if (Boolean(texto) !== Boolean(enlace)) {
    throw new ErrorDeValidacion('El botón necesita las dos cosas: el texto y el enlace. O deje los dos vacíos.')
  }
  // `armarCorreo` ya descarta el botón con un enlace que no es `http(s)`, pero
  // en silencio: la difusión saldría a todos sin el botón que se anunció.
  // Mejor decirlo aquí, antes de enviar nada.
  if (enlace && !esEnlaceSeguro(enlace)) {
    throw new ErrorDeValidacion(
      'El enlace del botón tiene que ser una dirección completa, que empiece por http:// o https://.',
    )
  }

  return { asunto, mensaje, boton: texto && enlace ? { texto, enlace } : undefined }
}

function validarAudiencia(valor: unknown): AudienciaDeDifusion {
  const audiencia = AUDIENCIAS_DE_DIFUSION.find((a) => a.value === valor)
  if (!audiencia) throw new ErrorDeValidacion('El grupo de destinatarios indicado no existe.')
  return audiencia.value
}

/**
 * La difusión que este proceso está mandando ahora, si hay una.
 *
 * Una sola a la vez: dos trabajadores en paralelo duplican el ritmo, y la pausa
 * entre correos existe justamente para no pasarse de la cuota por hora del
 * hosting. Las que están `enviando` sin trabajador —cortadas por un reinicio—
 * no cuentan: no mandan nada y no deben bloquear la pantalla hasta que alguien
 * las reanude.
 */
async function difusionEnCurso(payload: Payload): Promise<string | null> {
  const { docs } = await payload.find({
    collection: 'difusiones',
    where: { estado: { equals: 'enviando' } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const activa = docs.find((d) => enCurso(d.id))
  return activa ? String(activa.id) : null
}

const YA_HAY_UNA =
  'Ya hay una difusión enviándose. Espere a que termine o deténgala antes de empezar otra: dos a la vez gastarían el doble de la cuota de correo por hora.'

/**
 * Manda la difusión solo a quien la escribe, tal como la recibiría cualquiera.
 *
 * Espera al servidor de correo, a diferencia del envío masivo: quien pide una
 * prueba quiere saber ya si salió o por qué no.
 */
export async function enviarPruebaDeDifusion(datos: unknown): Promise<Respuesta<{ para: string }>> {
  return accion(async () => {
    const { payload, usuarioId } = await exigirAdmin()
    const difusion = validarDatos(datos)

    // Se lee la cuenta en vez de fiarse del correo de la sesión: la sesión
    // dura horas y la dirección pudo cambiarse desde otra pestaña.
    const cuenta = await payload.findByID({
      collection: 'usuarios',
      id: usuarioId,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })
    if (!cuenta?.email) throw new Error('No se encontró el correo de su cuenta.')
    if (!hayCorreo()) throw new SinServidorDeCorreo()
    if (!limitadorDePruebas.permitir(usuarioId)) {
      throw new Error('Ya envió varias pruebas en los últimos minutos. Espere un poco antes de volver a intentarlo.')
    }

    const correo = mensajeDeDifusion(difusion, cuenta.nombre)
    try {
      await enviarCorreo(payload, { para: cuenta.email, correo: { ...correo, asunto: `[Prueba] ${correo.asunto}` } })
    } catch (error) {
      // Lo mismo que el correo de prueba de Sistema (`acciones/correo.ts`): al
      // panel no sube el mensaje de nodemailer, que no dice qué variable tocar y
      // que `explicarFalloDeCorreo` limpia de la clave antes de enseñarlo. El
      // error entero va al registro, que es donde se depura el protocolo.
      payload.logger.error({ msg: 'Falló la prueba de una difusión', err: error })
      throw new Error(explicarFalloDeCorreo(error))
    }
    return { para: cuenta.email }
  })
}

export async function iniciarDifusion(datos: unknown): Promise<Respuesta<{ id: string; total: number }>> {
  return accion(async () => {
    const { payload, usuarioId } = await exigirAdmin()
    const difusion = validarDatos(datos)
    const audiencia = validarAudiencia((datos as { audiencia?: unknown } | null)?.audiencia)

    // La reserva va antes de la primera espera. Ver `reservarInicioDeDifusion`.
    const soltar = reservarInicioDeDifusion()
    if (!soltar) throw new Error(YA_HAY_UNA)
    try {
      if (await difusionEnCurso(payload)) throw new Error(YA_HAY_UNA)

      const destinatarios = await destinatariosDe(payload, audiencia)
      if (destinatarios.length === 0) {
        throw new Error('No hay ninguna cuenta activa en ese grupo, así que no hay a quién enviarla.')
      }
      // Después de contar y antes de crear: sin servidor no debe quedar guardada
      // una difusión «enviando» que nadie va a mandar.
      if (!hayCorreo()) throw new SinServidorDeCorreo()

      const creada = await payload.create({
        collection: 'difusiones',
        depth: 0,
        overrideAccess: true,
        data: {
          asunto: difusion.asunto,
          mensaje: difusion.mensaje,
          botonTexto: difusion.boton?.texto,
          botonEnlace: difusion.boton?.enlace,
          audiencia,
          autor: Number(usuarioId),
          estado: 'enviando',
          total: destinatarios.length,
          enviados: 0,
          fallidos: 0,
          pendientes: destinatarios.map((d) => d.id),
          fallos: [],
        },
      })

      lanzarDifusion(payload, creada.id)
      revalidatePath(RUTA)
      return { id: String(creada.id), total: destinatarios.length }
    } finally {
      soltar()
    }
  })
}

/**
 * Sigue una difusión detenida o cortada por un reinicio, desde donde quedó.
 *
 * No vuelve a armar la lista de destinatarios: sigue la cola guardada, que es
 * lo que impide volver a escribirle a quien ya lo recibió. La única excepción es
 * la persona cuyo correo salía justo cuando se cortó, que puede recibirlo dos
 * veces (ver `procesarDifusion`). Una cuenta creada después de empezar no la
 * recibe, y es lo esperable: el aviso era para quien estaba.
 */
export async function reanudarDifusion(id: unknown): Promise<Respuesta<{ pendientes: number }>> {
  return accion(async () => {
    const { payload } = await exigirAdmin()
    const idDifusion = exigirIdentificador(id, 'La difusión')

    const difusion = await payload.findByID({
      collection: 'difusiones',
      id: idDifusion,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })
    if (!difusion) throw new Error('La difusión no existe.')

    const pendientes = Array.isArray(difusion.pendientes) ? difusion.pendientes.length : 0
    if (pendientes === 0) throw new Error('A esta difusión no le queda nadie por recibirla.')
    if (difusion.estado === 'enviando' && enCurso(difusion.id)) {
      throw new Error('Esta difusión ya se está enviando.')
    }
    if (difusion.estado !== 'detenida' && difusion.estado !== 'enviando') {
      throw new Error('Solo se puede reanudar una difusión detenida o interrumpida.')
    }

    const soltar = reservarInicioDeDifusion()
    if (!soltar) throw new Error(YA_HAY_UNA)
    try {
      if (await difusionEnCurso(payload)) throw new Error(YA_HAY_UNA)
      if (!hayCorreo()) throw new SinServidorDeCorreo()

      await payload.update({
        collection: 'difusiones',
        id: idDifusion,
        depth: 0,
        overrideAccess: true,
        data: { estado: 'enviando', terminadaEn: null },
      })
      lanzarDifusion(payload, difusion.id)
      revalidatePath(RUTA)
      return { pendientes }
    } finally {
      soltar()
    }
  })
}

/**
 * Detiene una difusión. No corta el correo que esté saliendo en ese instante:
 * el trabajador ve el estado nuevo antes del siguiente y para ahí.
 */
export async function detenerDifusion(id: unknown): Promise<Respuesta<null>> {
  return accion(async () => {
    const { payload } = await exigirAdmin()
    const idDifusion = exigirIdentificador(id, 'La difusión')

    const difusion = await payload.findByID({
      collection: 'difusiones',
      id: idDifusion,
      depth: 0,
      overrideAccess: true,
      disableErrors: true,
    })
    if (!difusion) throw new Error('La difusión no existe.')
    if (difusion.estado !== 'enviando') throw new Error('Esta difusión ya no se está enviando.')

    await payload.update({
      collection: 'difusiones',
      id: idDifusion,
      depth: 0,
      overrideAccess: true,
      data: { estado: 'detenida' },
    })
    revalidatePath(RUTA)
    return null
  })
}

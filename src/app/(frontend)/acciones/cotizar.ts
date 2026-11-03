'use server'

import { headers } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { direccionPublica } from '@/collections/Usuarios'
import { enviarSinEsperar, hayCorreo } from '@/correo/enviar'
import { mensajeDeCotizacionNueva, mensajeDeCotizacionRecibida } from '@/correo/mensajes'
import { NOMBRE_DE_MODULO } from '@/app/(frontend)/admin-panel/modulos'
import { problemasDeLaCotizacion, type DatosDeCotizacion } from '@/lib/cotizaciones'
import { esperarElSuelo, exigirSinEnlaces } from '@/lib/formularioPublico'
import { accion, type Respuesta } from '@/lib/guardias'
import { crearLimitador, direccionDeQuienLlama } from '@/lib/ritmo'

const UNA_HORA = 60 * 60 * 1000

/**
 * Los dos frenos, como los de `solicitarCuenta`: uno por dirección, para quien
 * insiste, y uno para todas, para quien reparte el abuso entre muchas
 * direcciones. Cada cotización manda dos correos (el acuse y el aviso), así
 * que el global es más bajo que el de las cuentas: veinte por hora son
 * cuarenta correos, y más que eso de una portada que recién empieza es un
 * robot, no clientes.
 */
const LIMITE_POR_DIRECCION = crearLimitador('cotizacion:direccion', { maximo: 5, ventanaMs: UNA_HORA })
const LIMITE_GLOBAL = crearLimitador('cotizacion:global', { maximo: 20, ventanaMs: UNA_HORA })

const texto = (valor: unknown) => (typeof valor === 'string' ? valor : '')

/**
 * Pide una cotización desde la portada pública (P-007 E3).
 *
 * Como `solicitarCuenta`, cualquiera la puede llamar por HTTP con lo que
 * quiera, así que de `datos` solo se toma lo que la persona escribe, y el
 * estado nace «nueva» lo diga o no la llamada. A diferencia de la cuenta, aquí
 * no hay nada que callar sobre la base —pedir dos cotizaciones con el mismo
 * correo no revela nada—, y por eso un error de forma se dice tal cual.
 *
 * Lo guardado aparece en «Cotizaciones» del panel. El acuse a quien pide y el
 * aviso a los administradores salen sin esperar: si el correo falla, la
 * cotización ya está guardada y el panel la enseña igual.
 */
export async function pedirCotizacion(datos: unknown): Promise<Respuesta<null>> {
  return accion(async () => {
    const inicio = Date.now()
    const bruto = (typeof datos === 'object' && datos !== null ? datos : {}) as Record<string, unknown>

    // La trampa, antes del límite para que el robot no gaste el cupo de las
    // personas, y con la misma espera que un envío de verdad.
    if (typeof bruto.sitioWeb === 'string' ? bruto.sitioWeb.trim() !== '' : bruto.sitioWeb != null) {
      await esperarElSuelo(inicio)
      return null
    }

    const direccion = direccionDeQuienLlama(await headers())
    if (!LIMITE_POR_DIRECCION.permitir(direccion) || !LIMITE_GLOBAL.permitir('todas')) {
      throw new Error('Se recibieron demasiadas solicitudes en poco tiempo. Espera una hora y vuelve a intentarlo, o escríbenos por correo.')
    }

    const pedida: DatosDeCotizacion = {
      nombre: texto(bruto.nombre).trim(),
      correo: texto(bruto.correo).trim().toLowerCase(),
      institucion: texto(bruto.institucion).trim(),
      cargo: texto(bruto.cargo).trim(),
      residentes: texto(bruto.residentes),
      modulos: Array.isArray(bruto.modulos) ? [...new Set(bruto.modulos.filter((m): m is string => typeof m === 'string'))] : [],
      mensaje: texto(bruto.mensaje).trim(),
    }
    const problema = Object.values(problemasDeLaCotizacion(pedida))[0]
    if (problema) throw new Error(problema)
    // Lo que acaba en el saludo del acuse o en el asunto del aviso no puede
    // traer nada que un cliente de correo convierta en enlace (ver
    // `formularioPublico.ts`). El mensaje no: va en un bloque `cita` y solo lo
    // leen los administradores.
    exigirSinEnlaces(pedida.nombre, 'El nombre')
    exigirSinEnlaces(pedida.institucion, 'La institución')
    if (pedida.cargo) exigirSinEnlaces(pedida.cargo, 'El cargo')

    const payload = await getPayload({ config })
    try {
      const creada = await payload.create({
        collection: 'cotizaciones',
        data: {
          nombre: pedida.nombre,
          correo: pedida.correo,
          institucion: pedida.institucion,
          cargo: pedida.cargo || undefined,
          residentes: pedida.residentes as never,
          modulos: pedida.modulos as never,
          mensaje: pedida.mensaje || undefined,
          estado: 'nueva',
        },
        overrideAccess: true,
      })
      avisar(payload, pedida, creada.id)
    } catch (fallo) {
      payload.logger.error({ msg: 'No se pudo guardar la cotización', err: fallo })
      throw new Error('No se pudo enviar la solicitud. Vuelve a intentarlo en unos minutos o escríbenos por correo.')
    } finally {
      await esperarElSuelo(inicio)
    }
    return null
  })
}

/** El acuse y el aviso, sin esperar a que salgan: la cotización ya está guardada. */
function avisar(payload: Awaited<ReturnType<typeof getPayload>>, pedida: DatosDeCotizacion, id: number | string) {
  enviarSinEsperar(payload, { para: pedida.correo, correo: mensajeDeCotizacionRecibida({ nombre: pedida.nombre }) }, 'acuse de cotización')

  // Sin servidor de correo no hay a quién mandar nada; el aviso del menú del
  // panel, que cuenta las nuevas, sigue avisando.
  if (!hayCorreo()) return
  const base = direccionPublica()
  if (!base) {
    payload.logger.error({ msg: 'Cotización sin NEXT_PUBLIC_SERVER_URL: el aviso a los administradores sale sin botón' })
  }
  void payload
    .find({
      collection: 'usuarios',
      where: { and: [{ rol: { equals: 'admin' } }, { activo: { equals: true } }] },
      depth: 0,
      limit: 10,
      overrideAccess: true,
    })
    .then(({ docs }) => {
      const destinatarios = docs.map((admin) => admin.email).filter((correo): correo is string => Boolean(correo))
      if (destinatarios.length === 0) return
      enviarSinEsperar(
        payload,
        {
          para: destinatarios,
          correo: mensajeDeCotizacionNueva({
            ...pedida,
            modulos: pedida.modulos.map((m) => NOMBRE_DE_MODULO[m] ?? m),
            enlacePanel: `${base}/admin-panel/cotizaciones/${id}`,
          }),
        },
        'aviso de cotización nueva a los administradores',
      )
    })
    .catch((fallo) => payload.logger.error({ msg: 'No se pudo avisar de la cotización a los administradores', err: fallo }))
}

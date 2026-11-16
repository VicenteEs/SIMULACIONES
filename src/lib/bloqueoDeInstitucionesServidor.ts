/**
 * Lo que la pasada diaria hace con las instituciones bloqueadas (P-016 E5.8,
 * D-371, D-403): avisar a los doce meses y borrar sus cuentas treinta días
 * después.
 *
 * Va dentro de la conservación (`aplicarLaConservacion`) y no en un reloj
 * aparte: es otro plazo de los que el aviso de privacidad promete, corre en el
 * mismo proceso (el primero, D-393), y su resumen sale en la misma entrada del
 * registro. Qué toca a cada institución lo decide `etapaDelBloqueo`, que es
 * pura; aquí solo se lee, se escribe y se manda.
 *
 * Se borran las **cuentas**, cada una con `payload.delete`, que es lo mismo que
 * hace «Eliminar» en el panel: sus ganchos borran la actividad, dejan sin
 * nombre los comentarios y el registro, y quitan su correo de las difusiones
 * (D-291). La institución y su contenido se quedan: no son datos personales,
 * y una institución que vuelve después de un año lo encuentra donde lo dejó.
 *
 * Sin petición, y por eso sin barrera (D-399): ve todas las instituciones, que
 * es lo que necesita.
 */
import type { Payload } from 'payload'
import { direccionPublica } from '@/collections/Usuarios'
import { enviarCorreo, hayCorreo } from '@/correo/enviar'
import { mensajeDeBorradoProximo } from '@/correo/mensajes'
import { borradoTrasElAviso, diaEnPalabras, etapaDelBloqueo } from './instituciones'

/** Las escrituras de la pasada no dejan una entrada cada una: la conservación anota su resumen. */
const SIN_REGISTRO = { sinRegistro: true }

export interface ResultadoDelBloqueo {
  /** Las instituciones avisadas en esta pasada, con el día en que se borrarán sus cuentas. */
  avisadas: { nombre: string; borradoEl: Date }[]
  /** Las instituciones cuyas cuentas se borraron, con cuántas. */
  borradas: { nombre: string; cuentas: number }[]
  /** Avisos que no salieron: se apuntan igual, y el borrado sigue su curso. */
  avisosSinEnviar: number
}

interface Fila {
  id: number | string
  nombre: string
  vence?: string | null
  avisoDeBorradoEn?: string | null
  cuentasBorradasEn?: string | null
  correoDelAdministrador?: string | null
}

const cuentasDe = (payload: Payload, institucion: Fila['id']) =>
  payload.count({ collection: 'usuarios', where: { institucion: { equals: institucion } }, overrideAccess: true })

/** Los correos de los administradores activos de un lugar: una institución, o `null`, TraumaHub. */
async function administradoresDe(payload: Payload, institucion: Fila['id'] | null): Promise<string[]> {
  const { docs } = await payload.find({
    collection: 'usuarios',
    where: {
      and: [
        { rol: { equals: 'admin' } },
        { activo: { equals: true } },
        institucion === null ? { institucion: { exists: false } } : { institucion: { equals: institucion } },
      ],
    },
    depth: 0,
    // Todos: un aviso así no puede quedarse sin llegar a alguno por un tope.
    pagination: false,
    overrideAccess: true,
    select: { email: true },
  })
  return docs.map((d) => String((d as { email?: unknown }).email ?? '').trim().toLowerCase()).filter(Boolean)
}

/**
 * Manda el aviso, a la institución y a TraumaHub. Devuelve cuántos envíos
 * fallaron; no lanza.
 *
 * A los administradores activos de la institución y al correo de contacto de
 * su ficha, que puede no tener cuenta: después de un año, quien firmó suele
 * ser lo único que queda. A TraumaHub, a sus administradores, con el enlace a
 * la pestaña donde se extiende el plazo.
 */
async function avisar(payload: Payload, fila: Fila, vence: Date, borradoEl: Date, cuentas: number): Promise<number> {
  if (!hayCorreo()) return 1
  const datos = {
    institucion: fila.nombre,
    vencio: diaEnPalabras(vence),
    borrado: diaEnPalabras(borradoEl),
    cuentas,
  }
  const deLaInstitucion = [...new Set([...(await administradoresDe(payload, fila.id)), (fila.correoDelAdministrador ?? '').trim().toLowerCase()])].filter(Boolean)
  const deTraumaHub = (await administradoresDe(payload, null)).filter((c) => !deLaInstitucion.includes(c))
  const envios = [
    deLaInstitucion.length ? { para: deLaInstitucion, correo: mensajeDeBorradoProximo(datos) } : null,
    deTraumaHub.length
      ? { para: deTraumaHub, correo: mensajeDeBorradoProximo({ ...datos, enlacePanel: `${direccionPublica()}/admin-panel/instituciones` }) }
      : null,
  ].filter((e) => e !== null)
  let fallidos = 0
  for (const envio of envios) {
    try {
      await enviarCorreo(payload, envio)
    } catch (fallo) {
      fallidos += 1
      payload.logger.error({ msg: `No se pudo mandar el aviso de borrado de ${fila.nombre}`, err: fallo })
    }
  }
  return fallidos
}

/**
 * Borra las cuentas de una institución, una a una. Devuelve cuántas borró y
 * cuántas quedan.
 *
 * Una a una y no con un `where`: cada borrado lleva su transacción, y una
 * cuenta que falla —una fila a medio escribir, un gancho que lanza— no deshace
 * las demás. La que quede se intenta en la pasada siguiente, y la fila no se
 * marca como borrada hasta que no quede ninguna.
 */
async function borrarLasCuentas(payload: Payload, fila: Fila): Promise<{ borradas: number; quedan: number }> {
  const { docs } = await payload.find({
    collection: 'usuarios',
    where: { institucion: { equals: fila.id } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    // Basta el identificador, que viene siempre; algún campo hay que pedir.
    select: { activo: true },
  })
  let borradas = 0
  for (const cuenta of docs) {
    try {
      await payload.delete({ collection: 'usuarios', id: cuenta.id, overrideAccess: true, context: SIN_REGISTRO })
      borradas += 1
    } catch (fallo) {
      payload.logger.error({ msg: `No se pudo borrar una cuenta de ${fila.nombre}`, err: fallo })
    }
  }
  return { borradas, quedan: (await cuentasDe(payload, fila.id)).totalDocs }
}

/** La pasada sobre las instituciones vencidas: avisa a las que tocan y borra las cuentas de las avisadas. */
export async function aplicarElBloqueo(payload: Payload, ahora: Date = new Date()): Promise<ResultadoDelBloqueo> {
  const resultado: ResultadoDelBloqueo = { avisadas: [], borradas: [], avisosSinEnviar: 0 }
  const { docs } = await payload.find({
    collection: 'instituciones',
    where: { vence: { less_than: ahora.toISOString() } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })

  for (const fila of docs as unknown as Fila[]) {
    const etapa = etapaDelBloqueo(fila, ahora)
    try {
      if (etapa.etapa === 'por-avisar') {
        const { totalDocs: cuentas } = await cuentasDe(payload, fila.id)
        // Sin cuentas no hay nada que borrar ni nadie a quien avisar de ello.
        // Se mira cada día: si alguien la reabre y la deja vencer otra vez,
        // el plazo nuevo vacía el aviso y esto vuelve a empezar.
        if (cuentas === 0) continue
        const borradoEl = borradoTrasElAviso(ahora)
        resultado.avisosSinEnviar += await avisar(payload, fila, new Date(fila.vence as string), borradoEl, cuentas)
        await payload.update({
          collection: 'instituciones',
          id: fila.id,
          data: { avisoDeBorradoEn: ahora.toISOString() },
          depth: 0,
          overrideAccess: true,
          context: SIN_REGISTRO,
        })
        resultado.avisadas.push({ nombre: fila.nombre, borradoEl })
      } else if (etapa.etapa === 'por-borrar') {
        const { borradas, quedan } = await borrarLasCuentas(payload, fila)
        if (quedan === 0) {
          await payload.update({
            collection: 'instituciones',
            id: fila.id,
            data: { cuentasBorradasEn: ahora.toISOString() },
            depth: 0,
            overrideAccess: true,
            context: SIN_REGISTRO,
          })
        }
        if (borradas > 0) resultado.borradas.push({ nombre: fila.nombre, cuentas: borradas })
      }
    } catch (fallo) {
      // Una institución que falla no detiene a las demás: se intenta mañana.
      payload.logger.error({ msg: `No se pudo aplicar el bloqueo de ${fila.nombre}`, err: fallo })
    }
  }
  return resultado
}

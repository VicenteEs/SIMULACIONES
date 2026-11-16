import { getPayload } from 'payload'
import config from '@payload-config'
import { esColeccionEditable } from '@/admin/esquema'
import { lugarDeLaCuenta, puedeEditar } from '@/lib/guardias'
import { payloadDelLugar } from '@/lib/payloadDelLugar'
import { vieneDeAqui } from '@/lib/origenDeLaPeticion'
import { claveDeFicha, leerLatido } from '@/lib/presencia'
import { almacenDePresencia } from '@/lib/presenciaServidor'
import { obtenerSesion } from '@/lib/sesion'

export const dynamic = 'force-dynamic'

/**
 * Presencia en el editor: quién más tiene abierta una ficha (ver
 * `src/lib/presencia.ts`, que guarda y decide).
 *
 * `POST` es el latido de una pestaña del editor, y la respuesta lleva a los
 * demás. Con `salir: true` es la despedida al cerrar o dejar la ficha, que
 * llega con `fetch(…, { keepalive: true })` y a veces no llega: para eso está
 * la caducidad.
 *
 * `GET ?coleccion=patologias` dice quién está en qué ficha de una colección,
 * para que el listado pueda enseñarlo. Hoy no lo consume nadie; está lista
 * para cuando el listado lo pinte.
 *
 * La guardia es la del panel —sesión activa, rol **real** de editor o
 * administrador— más el permiso sobre esa colección (`puedeEditar`): un editor
 * apartado de un módulo no debe enterarse de quién trabaja en él, igual que no
 * puede abrir sus fichas. Se pregunta en cada latido y no se recuerda: una baja
 * o un cambio de permisos se nota en quince segundos, que es lo que tarda el
 * siguiente.
 */

const responder = (cuerpo: unknown, estado = 200): Response =>
  Response.json(cuerpo, { status: estado, headers: { 'Cache-Control': 'no-store' } })

/** Quien llama, si puede editar esa colección; si no, la respuesta con que rechazarle. */
async function quienLlama(coleccion: string) {
  const { usuario, activo, rolReal } = await obtenerSesion()
  if (!usuario || !activo || (rolReal !== 'admin' && rolReal !== 'editor')) {
    return { rechazo: responder({ error: 'Sesión no válida.' }, 401) }
  }
  if (!esColeccionEditable(coleccion)) return { rechazo: responder({ error: 'Esa colección no existe.' }, 404) }
  if (!puedeEditar(usuario, coleccion)) {
    return { rechazo: responder({ error: 'Su cuenta no edita este módulo.' }, 403) }
  }
  return { usuario: { id: String(usuario.id) }, lugar: lugarDeLaCuenta(usuario) }
}

/**
 * De esas fichas, las del lugar de quien pregunta (D-401).
 *
 * La presencia no lleva marca de institución: se guarda por ficha, y las de
 * cada lugar tienen identificadores distintos. Pero sin este recorte, un
 * docente de una institución leía por aquí quién de TraumaHub estaba editando
 * qué, con su nombre, y podía anunciarse en una ficha ajena para ver quién más
 * estaba en ella. Se pregunta a la base con el Payload del lugar, el mismo que
 * recorta el panel.
 */
async function fichasDelLugar(coleccion: string, ids: string[], lugar: string | null): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const delLugar = payloadDelLugar(await getPayload({ config }), lugar)
  const { docs } = await delLugar.find({
    collection: coleccion as never,
    where: { id: { in: ids } },
    limit: ids.length,
    pagination: false,
    depth: 0,
    draft: true,
    select: { id: true } as never,
    overrideAccess: true,
  })
  return new Set(docs.map((d) => String((d as { id: unknown }).id)))
}

export async function POST(peticion: Request) {
  if (!vieneDeAqui(peticion)) return responder({ error: 'La petición no viene de esta plataforma.' }, 403)

  // Como texto y no con `.json()`: la despedida puede llegar por
  // `sendBeacon`, que no deja poner `Content-Type: application/json`.
  const latido = leerLatido(await peticion.text().then(
    (texto) => {
      try {
        return JSON.parse(texto) as unknown
      } catch {
        return null
      }
    },
    () => null,
  ))
  if (!latido) return responder({ error: 'Latido mal formado.' }, 400)

  const acceso = await quienLlama(latido.coleccion)
  if (acceso.rechazo) return acceso.rechazo
  const { usuario } = acceso
  if (!(await fichasDelLugar(latido.coleccion, [latido.id], acceso.lugar)).has(latido.id)) {
    return responder({ error: 'Esa ficha no existe.' }, 404)
  }

  const almacen = almacenDePresencia()
  const ficha = claveDeFicha(latido.coleccion, latido.id)
  const ahora = Date.now()

  if (latido.salir) {
    await almacen.salir(ficha, usuario.id, latido.pestana)
    return responder({ ok: true })
  }

  // El nombre y el rol no viajan: el almacén los lee de la cuenta al
  // preguntar, así que un cambio de nombre se ve en el siguiente latido.
  await almacen.latir(ficha, { usuarioId: usuario.id, pestana: latido.pestana, visible: latido.visible }, ahora)
  // Se limpia de paso, con cada latido, en vez de con un temporizador del
  // proceso: un `setInterval` suelto en un módulo de ruta sobrevive a las
  // recargas de desarrollo y se multiplica con cada una.
  await almacen.limpiar(ahora)
  // `ahora` viaja con la respuesta para que «desde hace 3 min» se cuente con
  // el reloj del servidor, que es el que puso los `desde`: el del computador
  // de quien mira puede ir minutos adelantado o atrasado.
  return responder({ ahora, ...(await almacen.quienMas(ficha, usuario.id, latido.pestana, ahora)) })
}

export async function GET(peticion: Request) {
  const coleccion = new URL(peticion.url).searchParams.get('coleccion') ?? ''
  const acceso = await quienLlama(coleccion)
  if (acceso.rechazo) return acceso.rechazo
  const ahora = Date.now()
  const todas = await almacenDePresencia().porColeccion(coleccion, ahora)
  const propias = await fichasDelLugar(coleccion, Object.keys(todas), acceso.lugar)
  // Sin el identificador interno de las cuentas: a quien mira el listado le
  // basta con el nombre y con saber cuál de ellas es la suya.
  const salida = Object.fromEntries(
    Object.entries(todas)
      .filter(([id]) => propias.has(id))
      .map(([id, personas]) => [
        id,
        personas.map(({ usuarioId, ...resto }) => ({ ...resto, esUsted: usuarioId === acceso.usuario.id })),
      ]),
  )
  return responder({ ahora, fichas: salida })
}

import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { versionActual } from '@/lib/publicaciones'
import { despliegueActual } from '@/lib/despliegue'
import { puedeVerModulo } from '@/access/reglas'

export const dynamic = 'force-dynamic'

/**
 * Flujo de eventos de publicación.
 *
 * El navegador mantiene abierta esta conexión y recibe la versión actual del
 * contenido. Cuando cambia, la página **avisa** de que hay contenido nuevo en
 * lugar de recargarse sola: a un residente que está leyendo no se le mueve el
 * texto bajo los ojos, porque eso se percibe como una avería y no como una
 * mejora.
 */
type Sesion = Parameters<typeof puedeVerModulo>[0]

/**
 * Cada cuántos envíos se vuelve a preguntar quién es. Cuatro de quince segundos
 * son un minuto: una consulta por pestaña abierta y minuto no pesa, y es lo que
 * tarda como mucho en enterarse este flujo de una baja o de un «salir».
 */
const ENVIOS_ENTRE_COMPROBACIONES = 4

export async function GET() {
  const payload = await getPayload({ config })
  const cabeceras = await siguientesCabeceras()

  /** La cuenta que llama, leída de la base ahora, o `null` si ya no puede ver nada. */
  const sesionVigente = async (): Promise<Sesion | null> => {
    const { user } = await payload.auth({ headers: cabeceras })
    if (!user || !(user as { activo?: boolean }).activo) return null
    return user as unknown as Sesion
  }

  let sesion = await sesionVigente()
  if (!sesion) return new Response('No autorizado', { status: 401 })

  // A cada quien lo suyo. Una cuenta con `modulosVisibles` restringido no debe
  // enterarse siquiera de que se publicó algo en un módulo que no ve: se lo
  // diría el aviso, recargaría, y no encontraría nada. Y como el aviso nombra
  // el módulo, callarlo no es cortesía sino la decisión D-020.
  const puedeVer = (modulo: string) => sesion !== null && puedeVerModulo(sesion, modulo)

  const codificador = new TextEncoder()
  let intervalo: ReturnType<typeof setInterval>

  const flujo = new ReadableStream({
    start(controlador) {
      let envios = 0
      // Con cada envío viajan también la construcción y el arranque de este
      // proceso (D-127): es como una página abierta se entera de que el servidor
      // que le contesta ya no es el que le dio su JavaScript.
      //
      // Y la cuenta de publicaciones sale sumada a los segundos del arranque.
      // Al cliente de ahora le da igual —cuando cambia el proceso adopta la
      // cuenta nueva sin compararla—; es para el cliente de ANTES de D-127, que
      // sigue abierto en alguna pestaña y no sabe leer `despliegue`. Ese solo
      // entiende «la cuenta subió», y con el contador a cero tras el reinicio
      // la veía bajar y callaba: se quedaba con el código viejo sin que nada se
      // lo dijera. Así la ve subir y saca su aviso con el botón «Recargar», que
      // es todo lo que se le puede pedir a un código que ya está descargado.
      const { despliegue, arranque } = despliegueActual()
      const base = Math.floor(arranque / 1000)
      const enviar = () => {
        const actual = versionActual(puedeVer)
        const datos = JSON.stringify({
          ...actual,
          version: base + actual.version,
          despliegue,
          arranque,
        })
        controlador.enqueue(codificador.encode(`data: ${datos}

`))
      }
      // La sesión se comprobaba una vez, al abrir, y el flujo dura lo que dure
      // la pestaña: a una cuenta desactivada, o que ya había salido, se le
      // seguían contando las publicaciones (O-061). Ahora se vuelve a leer de la
      // base cada minuto, y con ella los módulos que ve, que también cambian.
      // Si la base no contesta se cierra igual: ante la duda, un flujo cerrado
      // se reabre solo —`EventSource` reintenta— y uno abierto de más no avisa.
      const latido = async () => {
        envios += 1
        if (envios % ENVIOS_ENTRE_COMPROBACIONES === 0) {
          sesion = await sesionVigente().catch(() => null)
        }
        if (!sesion) {
          clearInterval(intervalo)
          controlador.close()
          return
        }
        enviar()
      }
      enviar()
      intervalo = setInterval(() => void latido().catch(() => clearInterval(intervalo)), 15_000)
    },
    cancel() {
      clearInterval(intervalo)
    },
  })

  return new Response(flujo, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Evita que un proxy intermedio acumule el flujo en un búfer.
      'X-Accel-Buffering': 'no',
    },
  })
}

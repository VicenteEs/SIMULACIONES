import { headers as siguientesCabeceras } from 'next/headers'
import { getPayload } from 'payload'
import config from '@payload-config'
import { versionActual } from '@/lib/publicaciones'

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
export async function GET() {
  const payload = await getPayload({ config })
  const { user } = await payload.auth({ headers: await siguientesCabeceras() })

  if (!user || !(user as { activo?: boolean }).activo) {
    return new Response('No autorizado', { status: 401 })
  }

  const codificador = new TextEncoder()
  let intervalo: ReturnType<typeof setInterval>

  const flujo = new ReadableStream({
    start(controlador) {
      const enviar = () => {
        const datos = JSON.stringify(versionActual())
        controlador.enqueue(codificador.encode(`data: ${datos}

`))
      }
      enviar()
      intervalo = setInterval(enviar, 15_000)
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

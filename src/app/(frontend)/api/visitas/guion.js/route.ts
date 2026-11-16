import { configuracionDelContador } from '@/lib/contador'

export const dynamic = 'force-dynamic'

/**
 * El guion de Umami, servido desde la plataforma (P-016 E7, D-408): Umami no
 * se asoma a internet, y la página no carga nada de otro sitio.
 *
 * Se guarda una hora en la memoria de cada proceso, colgado de `globalThis`
 * como `avisosEnMemoria.ts`: cada página lo pide, y preguntarle a Umami cada
 * vez sería una ida y vuelta por visita. El navegador lo guarda también una
 * hora. Una versión nueva de Umami tarda eso en llegar a los navegadores.
 */

const UNA_HORA_MS = 60 * 60 * 1000
const LLAVE = Symbol.for('traumahub.guionDelContador')

interface Guardado {
  codigo: string
  hasta: number
}

const almacen = () => globalThis as unknown as { [LLAVE]?: Guardado }

export async function GET() {
  const configuracion = configuracionDelContador()
  if (!configuracion) return new Response('', { status: 404, headers: { 'Cache-Control': 'no-store' } })

  const ahora = Date.now()
  let guardado = almacen()[LLAVE]
  if (!guardado || guardado.hasta <= ahora) {
    try {
      const respuesta = await fetch(`${configuracion.url}/script.js`, { signal: AbortSignal.timeout(3000) })
      if (!respuesta.ok) throw new Error(`Umami respondió ${respuesta.status}`)
      guardado = { codigo: await respuesta.text(), hasta: ahora + UNA_HORA_MS }
      almacen()[LLAVE] = guardado
    } catch {
      // Sin Umami la página sigue igual: el guion vacío no cuenta nada y no
      // rompe nada. No se guarda, para volver a intentarlo en la siguiente.
      return new Response('', {
        status: 200,
        headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }
  }

  return new Response(guardado.codigo, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

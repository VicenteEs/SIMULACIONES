import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

export const dynamic = 'force-dynamic'

/**
 * Comprobación de salud para el despliegue y la supervisión.
 *
 * Es el único extremo sin sesión de toda la plataforma (D-020), y por eso no
 * revela nada: responde si la aplicación está en pie y si la base contesta, sin
 * versiones, sin rutas y sin conteos. Con eso basta para que `docker compose`
 * sepa cuándo el contenedor está listo y para que el script de despliegue
 * decida si continuar o revertir.
 *
 * Consulta la base a propósito: un proceso que responde pero no alcanza
 * PostgreSQL está caído para todos los efectos prácticos, y un chequeo que solo
 * mira el puerto lo daría por sano.
 */
export async function GET() {
  const comienzo = Date.now()
  try {
    const payload = await getPayload({ config })
    await payload.count({ collection: 'usuarios', overrideAccess: true })
    return NextResponse.json(
      { estado: 'ok', base: 'ok', ms: Date.now() - comienzo },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return NextResponse.json(
      { estado: 'degradado', base: 'sin respuesta', ms: Date.now() - comienzo },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

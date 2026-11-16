'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { avisosDeLaCuenta } from '@/lib/avisosServidor'

/**
 * Cerrar los avisos de la barra (P-016 E6, D-406): la cuenta deja de verlos
 * como nuevos.
 *
 * Solo se anotan los que de verdad le llegan a la cuenta y siguen vigentes, y
 * se pregunta lo mismo que pinta la barra (`avisosDeLaCuenta`). Así un
 * identificador cualquiera, mandado a mano, no deja filas sueltas.
 *
 * `porElBoton` es el aviso cuyo botón se siguió, si fue así como se cerró la
 * ventana: esa lectura queda como `boton` y las demás como `ventana`.
 *
 * No propaga nada, como el latido: que no quede anotada una lectura no puede
 * dejar a nadie sin poder cerrar el aviso. Lo peor es que vuelva a salir.
 */
export async function marcarAvisosLeidos(ids: unknown, porElBoton?: unknown): Promise<void> {
  try {
    if (!Array.isArray(ids) || ids.length === 0) return
    const pedidos = new Set(ids.slice(0, 20).map(String))
    const { activo, usuario } = await obtenerSesion()
    if (!activo || !usuario) return
    const payload = await getPayload({ config })
    const avisos = await avisosDeLaCuenta(payload, usuario)
    for (const aviso of avisos) {
      if (aviso.leido || !pedidos.has(aviso.id)) continue
      try {
        await payload.create({
          collection: 'lecturas-de-avisos',
          overrideAccess: true,
          depth: 0,
          data: {
            usuario: Number(usuario.id),
            difusion: Number(aviso.id),
            leidaEn: new Date().toISOString(),
            via: String(porElBoton) === aviso.id ? 'boton' : 'ventana',
          },
        })
      } catch {
        // La fila ya está: otra pestaña lo cerró a la vez. El índice único de
        // la base no deja la segunda, y no hay nada más que hacer.
      }
    }
  } catch (error) {
    console.error('[avisos] no se pudo anotar la lectura de un aviso:', error)
  }
}

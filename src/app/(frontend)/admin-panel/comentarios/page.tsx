import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { clientePayload } from '../datos'
import { TablaComentarios, type ComentarioDelPanel } from './TablaComentarios'

export const dynamic = 'force-dynamic'

/**
 * Comentarios y sugerencias dejados en las fichas.
 *
 * Es el canal por el que el contenido mejora: alguien lee una ficha, ve que
 * falta algo y lo dice ahí mismo. Que ese canal quede desatendido es el fallo
 * más caro del panel, y por eso la barra lateral muestra el número de
 * pendientes en todo momento.
 */
export default async function PaginaComentarios() {
  // Entra también el editor: es quien escribe el contenido y, por tanto, quien
  // resuelve lo que se comenta sobre él. Eliminar sigue siendo cosa del
  // administrador, porque borra la observación de otra persona.
  const { esAdmin } = await exigirPanel()

  const payload = await clientePayload()
  const { docs } = await payload.find({
    collection: 'comentarios',
    limit: 500,
    sort: '-createdAt',
    depth: 1,
    overrideAccess: true,
  })

  const comentarios: ComentarioDelPanel[] = docs.map((d) => {
    const c = d as unknown as Record<string, unknown>
    const autor = c.usuario as { nombre?: string; email?: string } | null
    return {
      id: String(c.id),
      texto: String(c.texto ?? ''),
      estado: c.estado === 'resuelto' ? 'resuelto' : 'pendiente',
      coleccion: String(c.coleccion ?? ''),
      documentoId: String(c.documentoId ?? ''),
      creado: String(c.createdAt ?? ''),
      autorNombre: autor?.nombre ?? null,
      autorCorreo: autor?.email ?? null,
    }
  })

  return <TablaComentarios comentarios={comentarios} puedeEliminar={esAdmin} />
}

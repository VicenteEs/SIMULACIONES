import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { AUDIENCIAS_DE_DIFUSION } from '@/collections/Difusiones'
import { direccionPublica } from '@/collections/Usuarios'
import { condicionDeDestinatarios, correosPorHora, enCurso, pausaEntreCorreosMs } from '@/correo/difusion'
import { hayCorreo } from '@/correo/enviar'
import { clientePayload } from '../datos'
import { PanelDeDifusion, type DifusionDelHistorial, type GrupoDeDestinatarios } from './PanelDeDifusion'

export const dynamic = 'force-dynamic'

/** Cuántas difusiones enseña el historial. */
const TOPE_DEL_HISTORIAL = 20

/**
 * Difusión: un correo a todas las cuentas, o a un grupo.
 *
 * Existe para los avisos que antes se mandaban desde el correo personal con la
 * lista en copia oculta —«hay un caso nuevo en el simulador», «el lunes no hay
 * sesión»—: a mano, cada vez con la lista desactualizada y, un día u otro, con
 * las direcciones en «Para». Aquí sale a quien tiene cuenta activa en ese
 * momento, un correo por persona y con la plantilla de la plataforma.
 */
export default async function PaginaDifusion() {
  await exigirPanel('admin')

  const payload = await clientePayload()

  // Mismo criterio que `comentarios/page.tsx`: si la lectura falla —la tabla
  // `difusiones` falta porque se desplegó sin su migración—, se dice, y no se
  // pinta un historial vacío que se lee como «nunca se mandó ninguna».
  const lectura = await Promise.all([
    Promise.all(
      AUDIENCIAS_DE_DIFUSION.map(async (a) => {
        const { totalDocs } = await payload.count({
          collection: 'usuarios',
          where: condicionDeDestinatarios(a.value),
          overrideAccess: true,
        })
        return { valor: a.value, etiqueta: a.label, cuantos: totalDocs } satisfies GrupoDeDestinatarios
      }),
    ),
    payload.find({
      collection: 'difusiones',
      sort: '-createdAt',
      limit: TOPE_DEL_HISTORIAL,
      depth: 1,
      overrideAccess: true,
    }),
  ]).catch((error: unknown) => {
    console.error('[panel] no se pudo leer la difusión:', error)
    return null
  })

  if (!lectura) {
    return (
      <div>
        <header className="admin-header">
          <h1 className="admin-title">Difusión</h1>
        </header>
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudieron leer las difusiones ni las cuentas.</strong> La consulta falló; lo
          corriente es que falte la tabla de difusiones —un cambio de esquema desplegado sin su
          migración—. El detalle queda en el registro del servidor.
        </div>
      </div>
    )
  }

  const [grupos, { docs }] = lectura

  const historial: DifusionDelHistorial[] = docs.map((d) => {
    const autor = typeof d.autor === 'object' && d.autor ? d.autor : null
    return {
      id: String(d.id),
      asunto: d.asunto,
      audiencia: AUDIENCIAS_DE_DIFUSION.find((a) => a.value === d.audiencia)?.label ?? d.audiencia,
      autor: autor ? autor.nombre || autor.email : null,
      creada: d.createdAt,
      terminada: d.terminadaEn ?? null,
      estado: d.estado,
      enCurso: enCurso(d.id),
      total: d.total,
      enviados: d.enviados,
      fallidos: d.fallidos,
      pendientes: Array.isArray(d.pendientes) ? d.pendientes.length : 0,
      // Solo lo que la tabla enseña. `fallos` es JSON libre y lo escribe el
      // trabajador, pero no hay por qué mandar al navegador nada que no tenga
      // la forma que la tabla sabe pintar.
      fallos: (Array.isArray(d.fallos) ? d.fallos : []).flatMap((f) => {
        const fallo = f as { correo?: unknown; motivo?: unknown }
        return typeof fallo?.correo === 'string'
          ? [{ correo: fallo.correo, motivo: typeof fallo.motivo === 'string' ? fallo.motivo : '' }]
          : []
      }),
    }
  })

  return (
    <PanelDeDifusion
      grupos={grupos}
      historial={historial}
      hayCorreo={hayCorreo()}
      pausaMs={pausaEntreCorreosMs()}
      correosPorHora={correosPorHora()}
      direccionPlataforma={direccionPublica()}
    />
  )
}

import { exigirPanelCentral } from '@/app/(frontend)/admin-panel/acceso'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { direccionDelLugar } from '@/collections/Usuarios'
import { hayCorreo } from '@/correo/enviar'
import { idDeInstitucion } from '@/access/payload'
import { dominioDeInstituciones } from '@/lib/anfitrion'
import { diaEnChile, estadoDelPlazo, etapaDelBloqueo, type EtapaDelBloqueo, type Modalidad } from '@/lib/instituciones'
import { clientePayloadDeTodas } from '../datos'
import { PanelDeInstituciones, type InstitucionDelPanel } from './PanelDeInstituciones'
import './instituciones.css'

export const dynamic = 'force-dynamic'

/** Más que esto no se lista de una vez. Llegar cerca es otro problema. */
const TOPE = 1000

/** El bloqueo como lo pinta la tabla: la etapa y sus días en Chile, sin instantes que hidratar. */
function bloqueoDelPanel(etapa: EtapaDelBloqueo): InstitucionDelPanel['bloqueo'] {
  const dia = (fecha: Date | null) => (fecha ? diaEnChile(fecha) : undefined)
  switch (etapa.etapa) {
    case 'bloqueada':
    case 'por-avisar':
      return { etapa: etapa.etapa, avisoEl: dia(etapa.avisoEl) }
    case 'avisada':
    case 'por-borrar':
      return { etapa: etapa.etapa, avisadaEl: dia(etapa.avisadaEl), borradoEl: dia(etapa.borradoEl) }
    case 'borrada':
      return { etapa: etapa.etapa, borradaEl: dia(etapa.borradaEl) }
    default:
      return { etapa: 'abierta' }
  }
}

/**
 * La pestaña «Instituciones» (P-016 E5.5, D-371, D-400): crear una, y cambiar
 * su plazo y su cupo. Solo del administrador de TraumaHub.
 *
 * El plazo se calcula aquí y no en el navegador: depende de la hora, y si cada
 * lado usara la suya una institución que vence esta noche saldría con dos
 * estados, y React tiraría la tabla al hidratarla.
 */
export default async function PaginaDeInstituciones() {
  await exigirPanelCentral('admin')
  const payload = await clientePayloadDeTodas()

  const listado = await payload
    .find({ collection: 'instituciones', limit: TOPE, sort: 'nombre', depth: 0, overrideAccess: true })
    .catch((error) => {
      console.error('[panel] no se pudo leer la tabla de instituciones:', error)
      return null
    })

  if (!listado) {
    return (
      <div>
        <CabeceraDePagina titulo="Instituciones" />
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudo leer la tabla de instituciones.</strong> Esto no significa que no haya ninguna: la consulta
          falló. El detalle queda en el registro del servidor.
        </div>
      </div>
    )
  }

  const ids = listado.docs.map((d) => d.id)
  const [activas, administradores] = await Promise.all([
    Promise.all(
      ids.map((id) =>
        payload
          .count({
            collection: 'usuarios',
            where: { and: [{ institucion: { equals: id } }, { activo: { equals: true } }] },
            overrideAccess: true,
          })
          .then((r) => r.totalDocs),
      ),
    ),
    ids.length
      ? payload
          .find({
            collection: 'usuarios',
            where: { and: [{ rol: { equals: 'admin' } }, { institucion: { in: ids } }] },
            limit: TOPE,
            depth: 0,
            overrideAccess: true,
            select: { email: true, nombre: true, activo: true, ultimoAcceso: true, institucion: true },
          })
          .then((r) => r.docs as unknown as Record<string, unknown>[])
      : Promise.resolve([] as Record<string, unknown>[]),
  ])

  const ahora = new Date()
  const instituciones: InstitucionDelPanel[] = listado.docs.map((fila, i) => {
    const plazo = estadoDelPlazo(fila.vence ?? null, ahora)
    return {
      id: String(fila.id),
      nombre: fila.nombre,
      subdominio: fila.subdominio,
      direccion: direccionDelLugar(fila.subdominio),
      modalidad: fila.modalidad as Modalidad,
      inicio: fila.inicio ? diaEnChile(fila.inicio) : '',
      vence: fila.vence ? diaEnChile(fila.vence) : '',
      plazo: plazo.estado,
      dias: plazo.dias,
      bloqueo: bloqueoDelPanel(etapaDelBloqueo(fila, ahora)),
      cupo: fila.cupo,
      activas: activas[i] ?? 0,
      correoDelAdministrador: fila.correoDelAdministrador,
      administradores: administradores
        .filter((a) => idDeInstitucion(a.institucion) === String(fila.id))
        .map((a) => ({
          email: String(a.email),
          nombre: String(a.nombre ?? ''),
          activo: a.activo === true,
          haEntrado: Boolean(a.ultimoAcceso),
        })),
    }
  })

  return (
    <PanelDeInstituciones
      instituciones={instituciones}
      hoy={diaEnChile(ahora)}
      dominio={dominioDeInstituciones()}
      hayCorreo={hayCorreo()}
      hayMas={listado.totalDocs > TOPE}
    />
  )
}

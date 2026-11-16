import type { Where } from 'payload'
import { exigirPanelCentral } from '@/app/(frontend)/admin-panel/acceso'
import { AUDIENCIAS_DE_DIFUSION } from '@/collections/Difusiones'
import { direccionPublica } from '@/collections/Usuarios'
import { condicionDeDestinatarios, correosPorHora, pausaEntreCorreosMs, seEstaEnviando } from '@/correo/difusion'
import { hayCorreo } from '@/correo/enviar'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { LUGAR_DE_LA_CENTRAL } from '@/lib/anfitrion'
import { lugarDeLaCuenta, normalizarLugares } from '@/lib/destinoDeDifusion'
import { clientePayloadDeTodas } from '../datos'
import {
  PanelDeDifusion,
  type ConteoDeDestinatarios,
  type DifusionDelHistorial,
  type LugarDeDifusion,
} from './PanelDeDifusion'

export const dynamic = 'force-dynamic'

/** Cuántas difusiones enseña el historial. */
const TOPE_DEL_HISTORIAL = 20

/**
 * Difusión: un correo, un aviso dentro de la plataforma o los dos, a todas las
 * cuentas o a un grupo, en TraumaHub y en las instituciones (D-375, D-406).
 *
 * Existe para los avisos que antes se mandaban desde el correo personal con la
 * lista en copia oculta —«hay un caso nuevo en el simulador», «el lunes no hay
 * sesión»—: a mano, cada vez con la lista desactualizada y, un día u otro, con
 * las direcciones en «Para». Aquí sale a quien tiene cuenta activa en ese
 * momento, un correo por persona y con la plantilla de la plataforma.
 */
export default async function PaginaDifusion() {
  await exigirPanelCentral('admin')

  const payload = await clientePayloadDeTodas()

  // Mismo criterio que `comentarios/page.tsx`: si la lectura falla —la tabla
  // `difusiones` falta porque se desplegó sin su migración—, se dice, y no se
  // pinta un historial vacío que se lee como «nunca se mandó ninguna».
  const lectura = await Promise.all([
    // Las cuentas que recibirían algo, solo con su rol y su lugar, y en el orden
    // de la cola (`destinatariosDe`, por identificador). Con eso el formulario
    // cuenta cualquier combinación de lugares y rol sin volver a preguntar.
    // Antes eran un `count` y un `find` por grupo; con los lugares serían dos
    // por cada institución y rol, y una lectura sola de tres columnas cuesta
    // menos que eso incluso con miles de cuentas.
    payload.find({
      collection: 'usuarios',
      where: condicionDeDestinatarios('todas'),
      sort: 'id',
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { rol: true, institucion: true },
    }),
    payload.find({
      collection: 'instituciones',
      sort: 'nombre',
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { nombre: true },
    }),
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
        <CabeceraDePagina titulo="Difusión" />
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>No se pudieron leer las difusiones ni las cuentas.</strong> La consulta falló; lo
          corriente es que falte la tabla de difusiones —un cambio de esquema desplegado sin su
          migración—. El detalle queda en el registro del servidor.
        </div>
      </div>
    )
  }

  const [{ docs: cuentas }, { docs: instituciones }, { docs }] = lectura

  // Una fila por lugar y rol, con la primera cuenta de su cola. Como las
  // cuentas llegan por identificador, la primera que aparece de cada par es la
  // primera de su cola.
  const porGrupo = new Map<string, { lugar: string; rol: string; cuantos: number; primeraId: number }>()
  for (const cuenta of cuentas) {
    const lugar = lugarDeLaCuenta(
      typeof cuenta.institucion === 'object' && cuenta.institucion ? cuenta.institucion.id : cuenta.institucion,
    )
    const rol = String(cuenta.rol)
    const clave = `${lugar}|${rol}`
    const grupo = porGrupo.get(clave)
    if (grupo) grupo.cuantos += 1
    else porGrupo.set(clave, { lugar, rol, cuantos: 1, primeraId: Number(cuenta.id) })
  }
  // El nombre y la dirección solo de esas primeras: son para el saludo de la
  // vista previa, «Así le llega a Camila Rojas», y no hace falta leer los de
  // todas las demás.
  const idsDePrimeras = [...porGrupo.values()].map((g) => g.primeraId)
  const { docs: primeras } =
    idsDePrimeras.length > 0
      ? await payload.find({
          collection: 'usuarios',
          where: { id: { in: idsDePrimeras } },
          pagination: false,
          depth: 0,
          overrideAccess: true,
          select: { nombre: true, email: true },
        })
      : { docs: [] }
  const datosDe = new Map(primeras.map((p) => [Number(p.id), { nombre: p.nombre ?? '', email: p.email ?? '' }]))
  const conteos: ConteoDeDestinatarios[] = [...porGrupo.values()].map((g) => ({
    lugar: g.lugar,
    rol: g.rol,
    cuantos: g.cuantos,
    primera: { id: g.primeraId, ...(datosDe.get(g.primeraId) ?? { nombre: '', email: '' }) },
  }))

  const lugares: LugarDeDifusion[] = [
    { valor: LUGAR_DE_LA_CENTRAL, etiqueta: 'TraumaHub' },
    ...instituciones.map((i) => ({ valor: String(i.id), etiqueta: i.nombre })),
  ]
  const nombreDelLugar = new Map(lugares.map((l) => [l.valor, l.etiqueta]))
  const ahora = Date.now()

  const historial: DifusionDelHistorial[] = docs.map((d) => {
    const autor = typeof d.autor === 'object' && d.autor ? d.autor : null
    const lugaresDeLaDifusion = normalizarLugares(d.lugares)
    // El aviso se mira aquí, con la hora del servidor, y no en el navegador:
    // la tabla se pinta en los dos, y una difusión que vence en ese segundo
    // saldría distinta en cada uno.
    const comoAviso = d.comoAviso === true && Boolean(d.avisoHasta)
    const conBoton = Boolean(d.botonTexto?.trim() && d.botonEnlace?.trim())
    return {
      id: String(d.id),
      asunto: d.asunto,
      audiencia: AUDIENCIAS_DE_DIFUSION.find((a) => a.value === d.audiencia)?.label ?? d.audiencia,
      // Una institución que ya no existe se nombra como tal: la difusión le
      // llegó, y borrar la institución no cambia eso.
      lugares:
        lugaresDeLaDifusion === null
          ? null
          : lugaresDeLaDifusion.map((l) => nombreDelLugar.get(l) ?? 'Una institución que ya no existe'),
      porCorreo: d.porCorreo !== false,
      aviso: comoAviso
        ? {
            hasta: d.avisoHasta as string,
            vigente: new Date(d.avisoHasta as string).getTime() > ahora,
            leidos: 0,
            // Sin botón no hay a quién contar.
            porElBoton: conBoton ? 0 : null,
          }
        : null,
      autor: autor ? autor.nombre || autor.email : null,
      creada: d.createdAt,
      terminada: d.terminadaEn ?? null,
      estado: d.estado,
      // Por el latido del trabajador, que puede ser de otro proceso (D-393).
      enCurso: seEstaEnviando(d),
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

  // Cuántas cuentas cerraron cada aviso, y cuántas siguiendo su botón. Solo
  // los de las difusiones de la tabla que tuvieron aviso: son veinte como
  // mucho. Si falla, el historial se enseña igual y sin las cifras: son un
  // dato de más, no la razón de la pantalla.
  await Promise.all(
    historial.map(async (d) => {
      const aviso = d.aviso
      if (!aviso) return
      const contar = async (where: Where) =>
        (await payload.count({ collection: 'lecturas-de-avisos', where, overrideAccess: true })).totalDocs
      try {
        const deEsta = { difusion: { equals: Number(d.id) } }
        const [leidos, porElBoton] = await Promise.all([
          contar(deEsta),
          aviso.porElBoton === null ? null : contar({ and: [deEsta, { via: { equals: 'boton' } }] }),
        ])
        aviso.leidos = leidos
        aviso.porElBoton = porElBoton
      } catch (error) {
        console.error('[panel] no se pudieron contar las lecturas de un aviso:', error)
        aviso.leidos = null
        aviso.porElBoton = null
      }
    }),
  )

  return (
    <PanelDeDifusion
      audiencias={AUDIENCIAS_DE_DIFUSION.map((a) => ({ valor: a.value, etiqueta: a.label }))}
      lugares={lugares}
      conteos={conteos}
      historial={historial}
      hayCorreo={hayCorreo()}
      pausaMs={pausaEntreCorreosMs()}
      correosPorHora={correosPorHora()}
      direccionPlataforma={direccionPublica()}
    />
  )
}

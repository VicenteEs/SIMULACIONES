import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  Activity,
  Archive,
  ArrowRight,
  ClipboardCheck,
  Eye,
  FileText,
  Flag,
  MessageSquare,
  PenLine,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { PlegarTodo } from '@/components/admin/PlegarTodo'
import { SeccionPlegable } from '@/components/ui/SeccionPlegable'
import { IDENTIDAD_DE_MODULO } from '@/components/ui/modulos'
import { InsigniaMantencion } from '@/components/ui/InsigniaMantencion'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { puedeEditar } from '@/lib/guardias'
import { tamanoLegible, type Respaldo } from '@/lib/respaldos'
import { listarRespaldos } from '@/lib/respaldosServidor'
import {
  clientePayload,
  conteosPorModulo,
  resumenDeActividad,
  resumenDeComentarios,
  resumenDeUsuarios,
  rutaPublica,
  NOMBRE_DE_MODULO,
} from './datos'
import './resumen.css'

export const dynamic = 'force-dynamic'

const fecha = (valor: string | Date) =>
  new Date(valor).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })

/**
 * Resumen del panel.
 *
 * Responde de un vistazo a las preguntas que se hacen al entrar: qué hay
 * publicado y qué está a medias, qué falta por atender y —si quien mira es el
 * administrador— quién tiene acceso, qué se está leyendo y cuándo fue el
 * último respaldo. Esa última tarjeta importa porque el día que haga falta
 * será tarde para descubrir que el último es de hace dos meses.
 */
export default async function ResumenAdmin() {
  // Entra también el editor. La barra lateral le ofrece «Resumen» desde el
  // primer día, pero esta página exigía administrador y lo devolvía al inicio:
  // su primer clic en el panel terminaba fuera del panel. Lo que ve es lo suyo
  // —qué hay publicado, qué está a medias y qué se ha comentado—; las cuentas,
  // los respaldos y la lectura son del administrador y no se le muestran.
  const { sesion, esAdmin } = await exigirPanel()

  const payload = await clientePayload()
  // Los módulos en mantención (D-156), para marcarlos en su tarjeta.
  const enMantencion = await modulosEnMantencion()

  const [usuarios, comentarios, todosLosModulos, actividad, lecturaDeRespaldos, solicitudes, pendientes] =
    await Promise.all([
      esAdmin ? resumenDeUsuarios(payload) : null,
      resumenDeComentarios(payload),
      conteosPorModulo(payload),
      esAdmin ? resumenDeActividad(payload) : null,
      // El fallo viaja con su motivo: con la carpeta de respaldos sin permisos
      // esta página afirmaba «no hay ningún respaldo» y mandaba a crear el
      // primero, que fallaba igual por la misma causa (O-067).
      esAdmin
        ? listarRespaldos().then(
            (lista) => ({ lista, fallo: null as string | null }),
            (error: unknown) => ({
              lista: [] as Respaldo[],
              fallo: error instanceof Error ? error.message : String(error),
            }),
          )
        : { lista: [] as Respaldo[], fallo: null as string | null },
      // Solo para el administrador, que es quien puede resolverlas: al editor
      // no se le enseña un número que no le toca atender, igual que en la
      // barra. Si la base no contesta se queda en cero, sin aviso propio: la
      // tarjeta de cuentas, que lee la misma tabla, ya sale ilegible y levanta
      // el aviso general de arriba.
      esAdmin
        ? payload
            .count({
              collection: 'usuarios',
              where: { pendiente: { equals: true } },
              overrideAccess: true,
            })
            .then((conteo) => conteo.totalDocs)
            .catch(() => 0)
        : 0,
      // Los cinco comentarios pendientes más recientes. Iban en un `await`
      // suelto después de este bloque sin depender de nada de él: era una ida
      // y vuelta a la base de más en la pantalla que abre el panel (D-128).
      payload
        .find({
          collection: 'comentarios',
          where: { estado: { equals: 'pendiente' } },
          sort: '-createdAt',
          limit: 5,
          depth: 1,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] as Record<string, unknown>[] })),
    ])

  // Un editor con módulos asignados cuenta y ve los suyos: un resumen que suma
  // fichas que no puede tocar no le sirve para saber qué le queda por hacer.
  const modulos = todosLosModulos.filter((m) => puedeEditar(sesion.usuario, m.slug))

  // La revisión del contenido (D-142), de los módulos de quien mira. `null` si
  // la tabla no respondió: la tarjeta lo dice en vez de enseñar ceros.
  const usuarioId = String(sesion.usuario.id)
  const suyos = modulos.map((m) => m.slug)
  // Sin módulos que editar no hay nada que contar, y un `in` vacío no se deja
  // a la interpretación de cada versión de Payload.
  const contarRevisiones = async (where?: Record<string, unknown>) =>
    suyos.length === 0
      ? 0
      : (
          await payload.count({
            collection: 'revisiones',
            where: (where
              ? { and: [{ coleccion: { in: suyos } }, where] }
              : { coleccion: { in: suyos } }) as never,
            overrideAccess: true,
          })
        ).totalDocs
  const revision = await Promise.all([
    contarRevisiones(),
    contarRevisiones({ estado: { in: ['pendiente', 'en-revision', 'devuelta'] } }),
    contarRevisiones({
      and: [{ estado: { in: ['pendiente', 'en-revision', 'devuelta'] } }, { asignadaA: { equals: usuarioId } }],
    }),
    contarRevisiones({ estado: { equals: 'lista' } }),
    contarRevisiones({ and: [{ estado: { equals: 'lista' } }, { validacionRapida: { equals: true } }] }),
  ])
    .then(([total, porRevisar, mias, listas, senaladas]) => ({ total, porRevisar, mias, listas, senaladas }))
    .catch((error: unknown) => {
      console.error('[panel] no se pudo contar la revisión:', error)
      return null
    })

  // Los conteos que la base no supo responder vienen a cero y con `ilegible`
  // en alto (`datos.ts`). Sumarlos como ceros da un total que parece un
  // recuento y no lo es: si falla la tabla de patologías, «Contenido
  // publicado» baja sola y lo razonable es concluir que se perdió contenido.
  // Se suma solo lo que se pudo leer y se dice cuántos módulos faltan.
  const legibles = modulos.filter((m) => !m.ilegible)
  const modulosIlegibles = modulos.filter((m) => m.ilegible)
  const publicados = legibles.reduce((total, m) => total + m.publicados, 0)
  const borradores = legibles.reduce((total, m) => total + m.borradores, 0)
  const hayIlegibles =
    modulosIlegibles.length > 0 ||
    comentarios.ilegible ||
    usuarios?.ilegible === true ||
    actividad?.ilegible === true
  const respaldos = lecturaDeRespaldos.lista
  const respaldosIlegibles = lecturaDeRespaldos.fallo
  const ultimoRespaldo = respaldos.find((r) => r.tipo === 'base')
  const diasSinRespaldo = ultimoRespaldo
    ? Math.floor((Date.now() - new Date(ultimoRespaldo.creado).getTime()) / 86_400_000)
    : null

  // Las cinco filas de abajo decían el módulo —«Biblioteca de patologías» en
  // todas— y nunca de qué ficha hablaban: eso vive en `documentoId`, que en
  // `Comentarios` es un texto suelto y no una relación, así que la profundidad
  // con la que se leen trae al autor pero nunca el documento. Son cinco
  // consultas de profundidad 0 en una página que ya es `force-dynamic`, cada
  // una por su cuenta: la ficha pudo borrarse y el comentario sigue aquí.
  const titulosDeFichas = new Map<string, string>()
  await Promise.all(
    pendientes.docs.map(async (documento) => {
      const c = documento as { coleccion?: string; documentoId?: string }
      if (!c.coleccion || !c.documentoId) return
      try {
        const doc = (await payload.findByID({
          collection: c.coleccion as never,
          id: c.documentoId,
          depth: 0,
          overrideAccess: true,
        })) as Record<string, unknown> | null
        const nombre = doc?.nombre ?? doc?.titulo
        if (typeof nombre === 'string' && nombre.trim() !== '') {
          titulosDeFichas.set(`${c.coleccion}/${c.documentoId}`, nombre)
        }
      } catch {
        // La ficha ya no está: la fila se queda con el nombre del módulo.
      }
    }),
  )

  // Cuántas secciones plegables tiene la pantalla: con dos, «Plegar todo».
  const hayComentarios = pendientes.docs.length > 0

  return (
    <div>
      <CabeceraDePagina
        titulo="Resumen"
        subtitulo={`Estado general de la plataforma · ${new Date().toLocaleDateString('es-CL', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}`}
      />

      {/* Lo primero de la página, por encima del respaldo: quien pidió la
          cuenta está esperando ahora, sin poder hacer nada ni saber a quién
          preguntar, y la barra lateral solo enseña un número pequeño junto a
          una entrada que no se abre si no se va a hacer algo con las cuentas. */}
      {esAdmin && solicitudes > 0 ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>
            {solicitudes === 1
              ? '1 solicitud de cuenta espera revisión.'
              : `${solicitudes} solicitudes de cuenta esperan revisión.`}
          </strong>
          {solicitudes === 1
            ? ' Quien la pidió no puede entrar hasta que un administrador la active o la rechace en '
            : ' Quienes las pidieron no pueden entrar hasta que un administrador las active o las rechace en '}
          <Link href="/admin-panel/usuarios">Usuarios y permisos</Link>.
        </div>
      ) : null}

      {!esAdmin ? null : respaldosIlegibles ? (
        <div className="admin-aviso admin-aviso-error">
          <strong>No se pueden leer los respaldos.</strong> {respaldosIlegibles}
        </div>
      ) : diasSinRespaldo === null ? (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>No hay ningún respaldo de la base de datos.</strong>
          Cree el primero desde <Link href="/admin-panel/respaldos">Respaldos</Link>; en el
          servidor, además, se programa uno diario al desplegar.
        </div>
      ) : diasSinRespaldo > 2 ? (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>El último respaldo tiene {diasSinRespaldo} días.</strong>
          Compruebe que la tarea diaria del servidor esté corriendo, o cree uno ahora desde{' '}
          <Link href="/admin-panel/respaldos">Respaldos</Link>.
        </div>
      ) : null}

      {/* Una tabla que no responde se veía exactamente igual que un módulo
          recién instalado: tarjeta a cero, barra al 0 % y «sin contenido aún».
          El dato para distinguirlos existe desde que `datos.ts` dejó de
          confundir «cero» con «no se pudo leer», y hasta aquí no lo miraba
          nadie. El aviso va arriba del todo porque cambia cómo se leen todos
          los números de esta pantalla. */}
      {hayIlegibles ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>La base no respondió a parte de este resumen.</strong>
          Donde aparece «—» no hay un cero: es un recuento que no se pudo hacer
          {modulosIlegibles.length > 0
            ? ` (${modulosIlegibles.map((m) => m.nombre).join(', ')})`
            : ''}
          . Lo corriente es que falte una tabla —un cambio de esquema desplegado sin su
          migración—; el detalle queda en el registro del servidor.
        </div>
      ) : null}

      <div className="admin-grid">
        {usuarios ? (
          <Indicador
            href="/admin-panel/usuarios"
            titulo="Cuentas con acceso"
            icono={Users}
            tono="info"
            ilegible={usuarios.ilegible}
            valor={
              usuarios.ilegible ? (
                '—'
              ) : (
                <>
                  {usuarios.activos}
                  <span className="admin-numero-tenue"> / {usuarios.total}</span>
                </>
              )
            }
            nota={
              usuarios.ilegible ? (
                'no se pudo leer la tabla de cuentas'
              ) : (
                <>
                  {usuarios.admins} administrador{usuarios.admins === 1 ? '' : 'es'} ·{' '}
                  {usuarios.editores} editor{usuarios.editores === 1 ? '' : 'es'} ·{' '}
                  {usuarios.lectores} lector{usuarios.lectores === 1 ? '' : 'es'}
                  {/* Las solicitudes también están sin activar, pero no son
                      bajas, y ya tienen su aviso arriba: contadas aquí dos
                      veces, «3 sin activar» hacía buscar tres bajas donde
                      había una. `Math.max` porque los dos conteos son
                      consultas distintas, y entre ambas pudo llegar otra. */}
                  {Math.max(usuarios.inactivos - solicitudes, 0) > 0
                    ? ` · ${Math.max(usuarios.inactivos - solicitudes, 0)} sin activar`
                    : ''}
                  {solicitudes > 0
                    ? ` · ${solicitudes} solicitud${solicitudes === 1 ? '' : 'es'}`
                    : ''}
                </>
              )
            }
          />
        ) : null}

        <Indicador
          href="/admin-panel/contenido"
          titulo="Contenido publicado"
          icono={FileText}
          tono="ok"
          valor={publicados}
          nota={
            <>
              {borradores > 0
                ? `${borradores} borrador${borradores === 1 ? '' : 'es'} sin publicar`
                : 'sin borradores pendientes'}
              {modulosIlegibles.length > 0
                ? ` · sin contar ${modulosIlegibles.length} módulo${
                    modulosIlegibles.length === 1 ? '' : 's'
                  } que no se ${modulosIlegibles.length === 1 ? 'pudo' : 'pudieron'} leer`
                : ''}
            </>
          }
        />

        {revision === null || revision.total > 0 ? (
          <Indicador
            href="/admin-panel/revision"
            titulo="Revisión del contenido"
            icono={ClipboardCheck}
            tono={revision !== null && revision.porRevisar > 0 ? 'atencion' : 'info'}
            ilegible={revision === null}
            valor={revision === null ? '—' : revision.porRevisar}
            nota={
              revision === null ? (
                'no se pudo leer la tabla de revisiones'
              ) : esAdmin ? (
                <>
                  por revisar · {revision.listas} lista{revision.listas === 1 ? '' : 's'} para publicar
                  {revision.senaladas > 0 ? (
                    <>
                      {' · '}
                      <Flag aria-hidden size={13} className="resumen-bandera" />
                      {` ${revision.senaladas} con la validación señalada`}
                    </>
                  ) : null}
                </>
              ) : (
                `por revisar en sus módulos${
                  revision.mias > 0
                    ? ` · ${revision.mias} asignada${revision.mias === 1 ? '' : 's'} a usted`
                    : ''
                }`
              )
            }
            // La tarjeta tenía dos destinos —la cola y la auditoría— y por eso
            // dos botones. La tarjeta entera lleva a la cola, que es lo que se
            // hace al verla; la auditoría queda como enlace secundario, por
            // encima del enlace que cubre la tarjeta.
            secundario={
              esAdmin ? (
                <Link href="/admin-panel/auditoria" className="kpi-secundario">
                  Ver la auditoría
                </Link>
              ) : null
            }
          />
        ) : null}

        <Indicador
          href="/admin-panel/comentarios"
          titulo="Comentarios pendientes"
          icono={MessageSquare}
          tono={!comentarios.ilegible && comentarios.pendientes > 0 ? 'atencion' : 'info'}
          ilegible={comentarios.ilegible}
          // El ámbar de la cifra iba en línea (`'var(--ambar)'`, 3,7:1 sobre
          // blanco): ahora es una clase con el ámbar de texto, que llega a AA.
          claseValor={
            !comentarios.ilegible && comentarios.pendientes > 0 ? 'admin-card-value-atencion' : undefined
          }
          valor={
            comentarios.ilegible ? (
              '—'
            ) : (
              <>
                {comentarios.pendientes}
                <span className="admin-numero-tenue"> / {comentarios.total}</span>
              </>
            )
          }
          nota={
            comentarios.ilegible
              ? 'no se pudo leer la tabla de comentarios'
              : 'retroalimentación recibida en las fichas'
          }
        />

        {actividad ? (
          <Indicador
            href="/admin-panel/actividad"
            titulo="Lectura de los últimos 7 días"
            icono={Activity}
            tono="info"
            ilegible={actividad.ilegible}
            valor={actividad.ilegible ? '—' : actividad.ultimos7dias}
            nota={
              actividad.ilegible ? (
                // Un cero aquí se lee como «nadie entró esta semana», que es
                // una conclusión sobre los residentes y no sobre la base.
                'no se pudo leer el registro de lectura'
              ) : (
                <>
                  fichas abiertas por {actividad.lectoresActivos7dias} persona
                  {actividad.lectoresActivos7dias === 1 ? '' : 's'} · {actividad.completados}{' '}
                  marcadas como leídas
                </>
              )
            }
          />
        ) : null}

        {esAdmin ? (
          <Indicador
            href="/admin-panel/respaldos"
            titulo="Último respaldo"
            icono={Archive}
            tono={respaldosIlegibles || diasSinRespaldo === null || diasSinRespaldo > 2 ? 'atencion' : 'ok'}
            // Una fecha no cabe al tamaño de una cifra: va un paso más pequeña.
            claseValor="admin-card-value-sm"
            valor={respaldosIlegibles ? '—' : ultimoRespaldo ? fecha(ultimoRespaldo.creado) : 'ninguno'}
            nota={
              respaldosIlegibles
                ? 'no se pudo leer el directorio de respaldos'
                : ultimoRespaldo
                  ? `${tamanoLegible(ultimoRespaldo.bytes)} · ${respaldos.length} archivo${
                      respaldos.length === 1 ? '' : 's'
                    } conservado${respaldos.length === 1 ? '' : 's'}`
                  : 'la base no se ha respaldado nunca'
            }
          />
        ) : null}
      </div>

      {hayComentarios ? <PlegarTodo /> : null}

      <SeccionPlegable
        clave="resumen.modulos"
        titulo="Contenido por módulo"
        resumen={`${modulos.length} módulo${modulos.length === 1 ? '' : 's'}`}
      >
        <div className="admin-grid resumen-modulos">
          {modulos.map((m) => {
            const porcentaje = m.total === 0 ? 0 : Math.round((m.publicados / m.total) * 100)
            const identidad = IDENTIDAD_DE_MODULO[m.slug]
            const IconoDelModulo = identidad?.icono ?? FileText
            return (
              <div
                key={m.slug}
                className={`admin-card tarjeta-modulo ${identidad?.clase ?? ''}${m.ilegible ? ' admin-card-ilegible' : ''}`}
              >
                <div className="tarjeta-modulo-cabeza">
                  <span className="icono-modulo" aria-hidden>
                    <IconoDelModulo size={20} />
                  </span>
                  <div>
                    <div className="admin-card-numero">{m.numero}</div>
                    <h3 className="tarjeta-modulo-nombre">{m.nombre}</h3>
                  </div>
                  {enMantencion.includes(m.slug) ? <InsigniaMantencion /> : null}
                </div>
                <div className="admin-card-value">
                  {m.ilegible ? (
                    '—'
                  ) : (
                    <>
                      {m.publicados}
                      {m.borradores > 0 ? (
                        <span className="admin-numero-tenue"> +{m.borradores} en borrador</span>
                      ) : null}
                    </>
                  )}
                </div>
                {/* La barra al 0 % sobre un módulo ilegible es la mitad del
                    engaño: dibuja un dato que no se tiene. Lleva el color del
                    módulo (`--acento`, de `mod-N`). */}
                {m.ilegible ? null : (
                  <div className="admin-progreso" aria-hidden="true">
                    <div className="admin-progreso-relleno" style={{ width: `${porcentaje}%` }} />
                  </div>
                )}
                <p className="admin-card-note">
                  {m.ilegible
                    ? 'no se pudo leer este módulo'
                    : m.total === 0
                      ? 'sin contenido aún'
                      : `${porcentaje}% publicado`}
                </p>
                <div className="admin-card-actions">
                  {/* Apuntaba a `/admin/collections/…`, que es la interfaz de
                      Payload: se retiró de esta plataforma y esa ruta hoy solo
                      reenvía al panel. El botón abría una pestaña nueva,
                      prometía el módulo y entregaba la portada del panel. */}
                  <Link
                    href={`/admin-panel/contenido/${m.slug}`}
                    className="admin-btn admin-btn-secondary admin-btn-sm"
                    aria-label={`Editar ${m.nombre}`}
                  >
                    <PenLine aria-hidden size={15} />
                    Editar
                  </Link>
                  <Link
                    href={m.ruta}
                    className="admin-btn admin-btn-ghost admin-btn-sm"
                    aria-label={`Ver ${m.nombre} en la plataforma`}
                  >
                    <Eye aria-hidden size={15} />
                    Ver público
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      </SeccionPlegable>

      {hayComentarios ? (
        <SeccionPlegable
          clave="resumen.comentarios"
          titulo="Últimos comentarios sin resolver"
          resumen={`${pendientes.docs.length} de ${comentarios.ilegible ? '—' : comentarios.pendientes}`}
          acciones={
            <Link href="/admin-panel/comentarios" className="admin-btn admin-btn-ghost admin-btn-sm">
              Ver todos
            </Link>
          }
        >
          <div className="admin-table-container">
            <table className="admin-table tabla-apilable">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Comentario</th>
                  <th>Módulo</th>
                  <th>Fecha</th>
                  <th>
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendientes.docs.map((c) => {
                  const comentario = c as {
                    id: string | number
                    texto?: string
                    coleccion?: string
                    documentoId?: string
                    createdAt?: string
                    usuario?: { nombre?: string; email?: string }
                  }
                  const tituloDeFicha = titulosDeFichas.get(
                    `${comentario.coleccion}/${comentario.documentoId}`,
                  )
                  return (
                    <tr key={String(comentario.id)}>
                      <th scope="row">
                        <div className="admin-table-user-name">
                          {comentario.usuario?.nombre ?? 'Usuario'}
                        </div>
                        <div className="admin-table-user-email">
                          {comentario.usuario?.email ?? '—'}
                        </div>
                      </th>
                      <td className="admin-table-text" data-etiqueta="Comentario">
                        {comentario.texto}
                      </td>
                      <td data-etiqueta="Módulo">
                        <div>
                          <span className="insignia insignia-neutra">
                            {NOMBRE_DE_MODULO[comentario.coleccion ?? ''] ?? comentario.coleccion}
                          </span>
                          {tituloDeFicha ? (
                            <div className="admin-table-user-email">{tituloDeFicha}</div>
                          ) : null}
                        </div>
                      </td>
                      <td className="u-nowrap" data-etiqueta="Fecha">
                        {comentario.createdAt ? fecha(comentario.createdAt) : '—'}
                      </td>
                      <td className="admin-table-acciones">
                        {/* «Editar» y al editor del panel: un comentario
                            pendiente se atiende corrigiendo la ficha, y desde
                            la ruta pública eso costaba volver a Panel,
                            Contenido, el módulo y buscarla por nombre. El
                            editor además abre esté publicada o retirada. */}
                        {comentario.coleccion && comentario.documentoId ? (
                          <div className="admin-table-acciones-fila">
                            <Link
                              href={`/admin-panel/contenido/${comentario.coleccion}/${comentario.documentoId}`}
                              className="admin-btn admin-btn-sm admin-btn-secondary"
                            >
                              <PenLine aria-hidden size={15} />
                              Editar
                            </Link>
                            <Link
                              href={rutaPublica(comentario.coleccion, comentario.documentoId)}
                              className="admin-btn admin-btn-sm admin-btn-ghost"
                            >
                              <Eye aria-hidden size={15} />
                              Ver ficha
                            </Link>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </SeccionPlegable>
      ) : null}
    </div>
  )
}

type TonoDeIndicador = 'ok' | 'atencion' | 'info'

/**
 * Una tarjeta de indicador que lleva a su pantalla entera.
 *
 * Antes cada tarjeta acababa en un botón «Gestionar cuentas», «Ver contenido»,
 * «Revisar»…: el resto de la tarjeta parecía pulsable y no hacía nada, y la
 * rejilla eran seis botones del mismo peso compitiendo con las cifras. Ahora
 * el título es el enlace y lo estira sobre toda la tarjeta (`.kpi-enlace`, el
 * patrón de «enlace estirado»): así un segundo destino —la auditoría en la
 * tarjeta de revisión— puede ir encima sin anidar un `<a>` dentro de otro, que
 * HTML no permite. El lector de pantalla oye un enlace con el nombre del
 * indicador, no la tarjeta entera dictada como nombre del enlace.
 */
function Indicador({
  href,
  titulo,
  icono: Icono,
  tono,
  valor,
  nota,
  ilegible,
  claseValor,
  secundario,
}: {
  href: string
  titulo: string
  icono: LucideIcon
  tono: TonoDeIndicador
  valor: ReactNode
  nota: ReactNode
  ilegible?: boolean
  claseValor?: string
  secundario?: ReactNode
}) {
  return (
    <div className={`admin-card admin-card-enlace kpi${ilegible ? ' admin-card-ilegible' : ''}`}>
      <div className="kpi-cabeza">
        <span className={`icono-modulo icono-modulo-sm kpi-icono-${tono}`} aria-hidden>
          <Icono size={16} />
        </span>
        <Link href={href} className="admin-card-title kpi-enlace">
          {titulo}
        </Link>
        <ArrowRight aria-hidden size={18} className="kpi-flecha" />
      </div>
      <div className={`admin-card-value${claseValor ? ` ${claseValor}` : ''}`}>{valor}</div>
      <p className="admin-card-note">{nota}</p>
      {secundario}
    </div>
  )
}

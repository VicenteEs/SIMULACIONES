import Link from 'next/link'
import {
  Activity,
  Archive,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Flag,
  Inbox,
  MessageSquare,
  Plus,
  ReceiptText,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { BarrasApiladasPorFila, Dona, Lineas, NoSePudoLeer } from '@/components/admin/Graficos'
import { Cifra } from '@/components/admin/tablero/Cifra'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { puedeEditar } from '@/lib/guardias'
import { tamanoLegible, type Respaldo } from '@/lib/respaldos'
import { listarRespaldos } from '@/lib/respaldosServidor'
import { accionDelRegistroEnPalabras } from '@/lib/registro'
import { cifra, variacion } from '@/lib/graficos'
import { diasEntre, haceCuanto, ultimosYAnteriores } from '@/lib/series'
import { clientePayload, conteosPorModulo, resumenDeComentarios } from './datos'
import { actividadReciente, colaDelResumen, cuentasDelResumen, lecturasPorDia, publicadasEstaSemana } from './resumen'
import { NOMBRE_DE_DESTINO } from './modulos'
import './resumen.css'

export const dynamic = 'force-dynamic'

const fecha = (valor: string | Date) =>
  new Date(valor).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })

const plural = (n: number, singular: string, plural: string) => `${cifra(n)} ${n === 1 ? singular : plural}`

/**
 * Resumen del panel, con el tablero de Penpot (P-007 E5, D-238).
 *
 * Responde de un vistazo a las preguntas que se hacen al entrar: cuántas
 * cuentas hay y cómo crecen, qué hay publicado, qué espera revisión, cuánto se
 * lee —y quién—, qué hay que hacer hoy y qué hizo el equipo hace un rato. La
 * tarjeta del último respaldo pasó a «Para hoy»: el día que haga falta será
 * tarde para descubrir que el último es de hace dos meses.
 *
 * Entra también el editor. La barra lateral le ofrece «Resumen» desde el
 * primer día, y lo que ve es lo suyo —qué hay publicado, qué está en cola y
 * qué se ha comentado en sus módulos—; las cuentas, los respaldos, la lectura
 * y el registro son del administrador y no se le muestran.
 */
export default async function ResumenAdmin() {
  const { sesion, esAdmin } = await exigirPanel()

  const payload = await clientePayload()
  // Los módulos en mantención (D-156), para decirlo bajo el gráfico de contenido.
  const enMantencion = await modulosEnMantencion()

  const [cuentas, comentarios, todosLosModulos, lecturaDeRespaldos, solicitudes, pendientes, requisitos, cotizaciones, recientes] =
    await Promise.all([
      esAdmin ? cuentasDelResumen(payload) : null,
      resumenDeComentarios(payload),
      conteosPorModulo(payload),
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
      // El comentario pendiente más antiguo, para decir en «Para hoy» desde
      // cuándo espera alguien una respuesta.
      payload
        .find({
          collection: 'comentarios',
          where: { estado: { equals: 'pendiente' } },
          sort: 'createdAt',
          limit: 1,
          depth: 0,
          overrideAccess: true,
          select: { createdAt: true },
        })
        .catch(() => ({ docs: [] as Record<string, unknown>[] })),
      // Los requisitos que nadie ha atendido todavía (D-163): del administrador,
      // que es quien responde. `null` si la tabla no contestó.
      esAdmin
        ? payload
            .count({
              collection: 'requisitos',
              where: { estado: { equals: 'propuesto' } },
              overrideAccess: true,
            })
            .then((conteo) => conteo.totalDocs)
            .catch(() => null)
        : null,
      // Las cotizaciones que nadie ha abierto (D-236).
      esAdmin
        ? payload
            .count({ collection: 'cotizaciones', where: { estado: { equals: 'nueva' } }, overrideAccess: true })
            .then((conteo) => conteo.totalDocs)
            .catch(() => null)
        : null,
      esAdmin ? actividadReciente(payload) : null,
    ])

  // Un editor con módulos asignados cuenta y ve los suyos: un resumen que suma
  // fichas que no puede tocar no le sirve para saber qué le queda por hacer.
  const modulos = todosLosModulos.filter((m) => puedeEditar(sesion.usuario, m.slug))
  const suyos = modulos.map((m) => m.slug)

  // La revisión del contenido (D-142), de los módulos de quien mira. `null` si
  // la tabla no respondió: la tarjeta lo dice en vez de enseñar ceros.
  const usuarioId = String(sesion.usuario.id)
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
  const [revision, cola, lecturas, publicadasSemana] = await Promise.all([
    Promise.all([
      contarRevisiones(),
      contarRevisiones({ estado: { in: ['pendiente', 'en-revision', 'devuelta'] } }),
      contarRevisiones({
        and: [{ estado: { in: ['pendiente', 'en-revision', 'devuelta'] } }, { asignadaA: { equals: usuarioId } }],
      }),
      contarRevisiones({ estado: { equals: 'lista' } }),
      contarRevisiones({ and: [{ estado: { equals: 'lista' } }, { validacionRapida: { equals: true } }] }),
      // Las que nadie ha tomado. Con las asignadas a quien mira suman lo que
      // dice el aviso de la barra a un editor; sin ellas, la tarjeta decía
      // «9» y la barra «3», y no había cómo saber de dónde salían los seis.
      contarRevisiones({
        and: [{ estado: { in: ['pendiente', 'en-revision', 'devuelta'] } }, { asignadaA: { exists: false } }],
      }),
    ])
      .then(([total, porRevisar, mias, listas, senaladas, libres]) => ({ total, porRevisar, mias, listas, senaladas, libres }))
      .catch((error: unknown) => {
        console.error('[panel] no se pudo contar la revisión:', error)
        return null
      }),
    colaDelResumen(payload, suyos),
    // Treinta días para el gráfico, que dan también los catorce del
    // minigráfico y las dos semanas que compara la flecha de la tarjeta.
    esAdmin ? lecturasPorDia(payload, 30, cuentas?.etapaDe ?? new Map()) : null,
    publicadasEstaSemana(payload, suyos),
  ])

  // Los conteos que la base no supo responder vienen a cero y con `ilegible`
  // en alto (`datos.ts`). Sumarlos como ceros da un total que parece un
  // recuento y no lo es: si falla la tabla de patologías, «Fichas publicadas»
  // baja sola y lo razonable es concluir que se perdió contenido. Se suma solo
  // lo que se pudo leer y se dice cuántos módulos faltan.
  const legibles = modulos.filter((m) => !m.ilegible)
  const modulosIlegibles = modulos.filter((m) => m.ilegible)
  const publicados = legibles.reduce((total, m) => total + m.publicados, 0)
  const creadas = legibles.reduce((total, m) => total + m.total, 0)
  const hayIlegibles =
    modulosIlegibles.length > 0 ||
    comentarios.ilegible ||
    (esAdmin && cuentas === null) ||
    (esAdmin && lecturas === null)
  const respaldos = lecturaDeRespaldos.lista
  const respaldosIlegibles = lecturaDeRespaldos.fallo
  const ultimoRespaldo = respaldos.find((r) => r.tipo === 'base')
  const diasSinRespaldo = ultimoRespaldo
    ? Math.floor((Date.now() - new Date(ultimoRespaldo.creado).getTime()) / 86_400_000)
    : null

  const totalesDeLectura = lecturas ? lecturas.residentes.map((v, i) => v + lecturas.equipo[i]) : []
  const semanaDeLectura = ultimosYAnteriores(totalesDeLectura, 7)
  const masAntiguo = pendientes.docs[0] as { createdAt?: string } | undefined
  const diasDelMasAntiguo = diasEntre(masAntiguo?.createdAt)

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
        acciones={
          suyos.length > 0 ? (
            <Link href="/admin-panel/contenido" className="admin-btn admin-btn-primary">
              <Plus aria-hidden size={18} />
              Nueva ficha
            </Link>
          ) : null
        }
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
          El aviso va arriba del todo porque cambia cómo se leen todos los
          números de esta pantalla. */}
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

      {/* El editor tiene tres cifras y no cuatro: en la rejilla de cuatro le
          quedaba un hueco a la derecha que parecía una tarjeta que no cargó. */}
      <div className={esAdmin ? 'tablero-cifras' : 'tablero-cifras tablero-cifras-3'}>
        {esAdmin ? (
          <Cifra
            href="/admin-panel/usuarios"
            titulo="Cuentas activas"
            icono={Users}
            tono="info"
            ilegible={cuentas === null}
            valor={cuentas === null ? '—' : cifra(cuentas.activas)}
            cambio={
              cuentas
                ? (() => {
                    const antes = cuentas.activasPorMes[cuentas.activasPorMes.length - 2]
                    const v = variacion(cuentas.activas, antes)
                    return v === null ? null : { valor: v, respecto: 'que a fines del mes pasado' }
                  })()
                : null
            }
            serie={cuentas?.activasPorMes}
            descripcionDeLaSerie="Cuentas activas al cierre de cada uno de los últimos seis meses."
            nota={
              cuentas === null
                ? 'no se pudo leer la tabla de cuentas'
                : `${plural(cuentas.nuevasEsteMes, 'nueva', 'nuevas')} este mes · ${plural(cuentas.instituciones, 'institución', 'instituciones')}`
            }
          />
        ) : null}

        <Cifra
          href="/admin-panel/contenido"
          titulo="Fichas publicadas"
          icono={FileText}
          tono="ok"
          valor={cifra(publicados)}
          cambio={publicadasSemana ? { valor: publicadasSemana, unidad: '', respecto: 'publicadas en los últimos 7 días' } : null}
          nota={
            <>
              {creadas > 0 ? `de ${cifra(creadas)} creadas · ${Math.round((publicados / creadas) * 100)} %` : 'sin contenido aún'}
              {modulosIlegibles.length > 0
                ? ` · sin contar ${modulosIlegibles.length} módulo${
                    modulosIlegibles.length === 1 ? '' : 's'
                  } que no se ${modulosIlegibles.length === 1 ? 'pudo' : 'pudieron'} leer`
                : ''}
            </>
          }
        />

        {revision === null || revision.total > 0 ? (
          <Cifra
            href="/admin-panel/revision"
            titulo="Por revisar"
            icono={ClipboardCheck}
            tono={revision !== null && revision.porRevisar > 0 ? 'atencion' : 'info'}
            ilegible={revision === null}
            valor={revision === null ? '—' : cifra(revision.porRevisar)}
            // Más fichas en cola no es buena noticia: la flecha sube en rojo.
            cambio={
              cola && cola.entradas7dias > 0
                ? { valor: cola.entradas7dias, unidad: '', buenoSiSube: false, respecto: 'entradas a la cola en los últimos 7 días' }
                : null
            }
            serie={cola?.entradasPorSemana}
            descripcionDeLaSerie="Fichas que entraron a la cola cada una de las últimas ocho semanas."
            nota={
              revision === null ? (
                'no se pudo leer la tabla de revisiones'
              ) : esAdmin ? (
                <>
                  {cola && cola.atrasadas > 0
                    ? `${plural(cola.atrasadas, 'lleva', 'llevan')} más de una semana · `
                    : ''}
                  {plural(revision.listas, 'lista', 'listas')} para publicar
                  {revision.senaladas > 0 ? (
                    <>
                      {' · '}
                      <Flag aria-hidden size={13} className="resumen-bandera" />
                      {` ${revision.senaladas} con la validación señalada`}
                    </>
                  ) : null}
                </>
              ) : (
                `en sus módulos${
                  revision.mias > 0
                    ? ` · ${revision.mias} asignada${revision.mias === 1 ? '' : 's'} a usted`
                    : ''
                }${revision.libres > 0 ? ` · ${revision.libres} sin asignar` : ''}`
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

        {esAdmin ? (
          <Cifra
            href="/admin-panel/actividad"
            titulo="Lecturas · 7 días"
            icono={Activity}
            tono="info"
            ilegible={lecturas === null}
            valor={lecturas === null ? '—' : cifra(semanaDeLectura.ultimos)}
            cambio={(() => {
              const v = variacion(semanaDeLectura.ultimos, semanaDeLectura.anteriores)
              return v === null ? null : { valor: v, respecto: 'que los 7 días anteriores' }
            })()}
            serie={totalesDeLectura.slice(-14)}
            descripcionDeLaSerie="Fichas abiertas cada día de las últimas dos semanas."
            nota={
              lecturas === null ? (
                // Un cero aquí se lee como «nadie entró esta semana», que es
                // una conclusión sobre los residentes y no sobre la base.
                'no se pudo leer el registro de lectura'
              ) : (
                <>
                  {/* «Residentes» aparte (D-175): con cuentas de equipo probando la plataforma, las lecturas podían
                      ser todas de administradores y la tarjeta no lo decía. */}
                  {cifra(lecturas.residentes.slice(-7).reduce((t, v) => t + v, 0))} por residentes
                  {lecturas.primerAno7dias > 0 ? ` · ${cifra(lecturas.primerAno7dias)} de primer año` : ''}
                  {` · ${plural(lecturas.residentesActivos7dias, 'residente activo', 'residentes activos')}`}
                </>
              )
            }
          />
        ) : (
          <Cifra
            href="/admin-panel/comentarios"
            titulo="Comentarios pendientes"
            icono={MessageSquare}
            tono={!comentarios.ilegible && comentarios.pendientes > 0 ? 'atencion' : 'info'}
            ilegible={comentarios.ilegible}
            claseValor={!comentarios.ilegible && comentarios.pendientes > 0 ? 'admin-card-value-atencion' : undefined}
            valor={comentarios.ilegible ? '—' : cifra(comentarios.pendientes)}
            nota={comentarios.ilegible ? 'no se pudo leer la tabla de comentarios' : `de ${cifra(comentarios.total)} recibidos en las fichas`}
          />
        )}
      </div>

      {esAdmin ? (
        <div className="tablero-fila">
          <TarjetaDeGrafico
            titulo="Lecturas por día"
            bajada="Fichas abiertas en los últimos 30 días, según quién las abrió"
            ilegible={lecturas === null}
          >
            {lecturas === null ? (
              <NoSePudoLeer que="el registro de lecturas" />
            ) : (
              <Lineas
                titulo="Fichas abiertas por día en los últimos 30 días"
                etiquetas={lecturas.dias.map((d) => d.etiqueta)}
                detalles={lecturas.dias.map((d) => d.detalle)}
                series={[
                  { etiqueta: 'Residentes', color: 'var(--marca)', valores: lecturas.residentes },
                  { etiqueta: 'Equipo', color: 'var(--cian)', valores: lecturas.equipo },
                ]}
                unidad="fichas"
              />
            )}
          </TarjetaDeGrafico>
          <TarjetaDeGrafico
            titulo="Cuentas por rol"
            bajada={cuentas ? plural(cuentas.activas, 'cuenta activa', 'cuentas activas') : 'Las cuentas activas'}
            ilegible={cuentas === null}
          >
            {cuentas === null ? (
              <NoSePudoLeer que="la tabla de cuentas" />
            ) : (
              <Dona
                titulo="Cuentas activas por rol"
                rotuloDelTotal="cuentas"
                partes={[
                  { etiqueta: 'Lectores (residentes)', valor: cuentas.lectores, color: 'var(--marca)' },
                  { etiqueta: 'Editores (docentes)', valor: cuentas.editores, color: 'var(--mod-2)' },
                  { etiqueta: 'Administradores', valor: cuentas.admins, color: 'var(--mod-3)' },
                ]}
              />
            )}
          </TarjetaDeGrafico>
        </div>
      ) : null}

      <div className="tablero-fila">
        <TarjetaDeGrafico
          titulo="Contenido por módulo"
          bajada="Fichas según su estado de revisión"
          ilegible={modulosIlegibles.length > 0 || cola === null}
          acciones={
            <Link href="/admin-panel/contenido" className="admin-btn admin-btn-ghost admin-btn-sm">
              Ver contenido
              <ChevronRight aria-hidden size={15} />
            </Link>
          }
        >
          {cola === null ? <NoSePudoLeer que="la cola de revisión" /> : null}
          <BarrasApiladasPorFila
            titulo="Fichas de cada módulo según su estado: publicadas, validadas, por revisar y en borrador"
            series={[
              { etiqueta: 'Publicadas', color: 'var(--verde)' },
              { etiqueta: 'Validadas', color: 'var(--cian)' },
              { etiqueta: 'Por revisar', color: 'var(--ambar)' },
              { etiqueta: 'Borrador', color: 'var(--linea-fuerte)' },
            ]}
            filas={legibles.map((m) => {
              // Las validadas y las que están en cola son borradores con su
              // fila en `revisiones`; el resto de los borradores no ha entrado
              // a la cola. Restarlas evita contar dos veces la misma ficha.
              const enRevision = cola?.porModulo.get(m.slug) ?? { validadas: 0, enCola: 0 }
              return {
                etiqueta: `${m.numero} ${m.nombre}${enMantencion.includes(m.slug) ? ' (en mantención)' : ''}`,
                valores: [
                  m.publicados,
                  enRevision.validadas,
                  enRevision.enCola,
                  Math.max(0, m.borradores - enRevision.validadas - enRevision.enCola),
                ],
              }
            })}
          />
        </TarjetaDeGrafico>

        <TarjetaDeGrafico titulo="Para hoy" bajada="Lo que espera una acción suya">
          <ul className="para-hoy">
            {revision && revision.porRevisar > 0 ? (
              <TareaDeHoy
                href="/admin-panel/revision"
                icono={ClipboardCheck}
                tono="atencion"
                titulo={`${plural(revision.porRevisar, 'ficha', 'fichas')} por revisar`}
                detalle={
                  esAdmin
                    ? cola && cola.atrasadas > 0
                      ? `${plural(cola.atrasadas, 'lleva', 'llevan')} más de 7 días`
                      : 'ninguna lleva más de una semana'
                    : revision.mias > 0
                      ? `${plural(revision.mias, 'asignada', 'asignadas')} a usted`
                      : 'en sus módulos'
                }
              />
            ) : null}
            {!comentarios.ilegible && comentarios.pendientes > 0 ? (
              <TareaDeHoy
                href="/admin-panel/comentarios"
                icono={MessageSquare}
                tono="info"
                titulo={`${plural(comentarios.pendientes, 'comentario', 'comentarios')} sin responder`}
                detalle={
                  diasDelMasAntiguo === null
                    ? 'de residentes en las fichas'
                    : diasDelMasAntiguo === 0
                      ? 'el más antiguo es de hoy'
                      : `el más antiguo lleva ${plural(diasDelMasAntiguo, 'día', 'días')}`
                }
              />
            ) : null}
            {esAdmin && solicitudes > 0 ? (
              <TareaDeHoy
                href="/admin-panel/usuarios"
                icono={UserPlus}
                tono="atencion"
                titulo={`${plural(solicitudes, 'solicitud', 'solicitudes')} de cuenta`}
                detalle="no pueden entrar hasta que alguien las revise"
              />
            ) : null}
            {cotizaciones ? (
              <TareaDeHoy
                href="/admin-panel/cotizaciones"
                icono={ReceiptText}
                tono="atencion"
                titulo={`${plural(cotizaciones, 'cotización nueva', 'cotizaciones nuevas')}`}
                detalle="sin abrir todavía"
              />
            ) : null}
            {requisitos ? (
              <TareaDeHoy
                href="/planificacion"
                icono={Inbox}
                tono="info"
                titulo={`${plural(requisitos, 'requisito', 'requisitos')} por atender`}
                detalle="propuestos para el módulo 06, sin respuesta"
              />
            ) : null}
            {esAdmin && !respaldosIlegibles && ultimoRespaldo ? (
              <TareaDeHoy
                href="/admin-panel/respaldos"
                icono={Archive}
                tono={diasSinRespaldo !== null && diasSinRespaldo > 2 ? 'atencion' : 'ok'}
                titulo={diasSinRespaldo === 0 ? 'Respaldo de hoy correcto' : diasSinRespaldo === 1 ? 'Respaldo de anoche correcto' : `Último respaldo: ${fecha(ultimoRespaldo.creado)}`}
                detalle={`${tamanoLegible(ultimoRespaldo.bytes)} · ${plural(respaldos.length, 'archivo conservado', 'archivos conservados')}`}
              />
            ) : null}
          </ul>
          {/* Lo que la lista enseña, contado: sin nada de lo anterior la
              tarjeta no puede quedarse en blanco, que se lee como «no cargó». */}
          {(revision?.porRevisar ?? 0) + (comentarios.ilegible ? 0 : comentarios.pendientes) + (esAdmin ? solicitudes : 0) + (cotizaciones ?? 0) + (requisitos ?? 0) === 0 &&
          !(esAdmin && !respaldosIlegibles && ultimoRespaldo) ? (
            <p className="grafico-vacio">Nada espera por usted hoy.</p>
          ) : null}
        </TarjetaDeGrafico>
      </div>

      {esAdmin ? (
        <TarjetaDeGrafico
          titulo="Actividad reciente"
          bajada="Los últimos cambios hechos por el equipo"
          ilegible={recientes === null}
          acciones={
            <Link href="/admin-panel/registro" className="admin-btn admin-btn-ghost admin-btn-sm">
              Ver registro completo
              <ChevronRight aria-hidden size={15} />
            </Link>
          }
        >
          {recientes === null ? (
            <NoSePudoLeer que="el registro de acciones" />
          ) : recientes.length === 0 ? (
            <p className="grafico-vacio">Todavía no hay cambios registrados.</p>
          ) : (
            <div className="admin-table-container">
              <table className="admin-table tabla-apilable">
                <thead>
                  <tr>
                    <th scope="col">Quién</th>
                    <th scope="col">Qué hizo</th>
                    <th scope="col">Módulo</th>
                    <th scope="col">Cuándo</th>
                  </tr>
                </thead>
                <tbody>
                  {recientes.map((r) => (
                    <tr key={r.id}>
                      <th scope="row">
                        <span className="actividad-quien">
                          <span className="actividad-iniciales" aria-hidden>
                            {iniciales(r.quien)}
                          </span>
                          {r.quien}
                        </span>
                      </th>
                      <td data-etiqueta="Qué hizo">
                        {accionDelRegistroEnPalabras(r.accion)}
                        {r.titulo ? ` «${r.titulo}»` : r.detalle ? ` ${r.detalle}` : ''}
                      </td>
                      <td data-etiqueta="Módulo">
                        {r.coleccion ? (
                          <span className="insignia insignia-neutra">{NOMBRE_DE_DESTINO[r.coleccion] ?? r.coleccion}</span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="u-nowrap" data-etiqueta="Cuándo">
                        {haceCuanto(r.fecha)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TarjetaDeGrafico>
      ) : null}
    </div>
  )
}

/** «Docente revisor» → «DR»: el círculo de la persona en la tabla de actividad. */
const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter((p) => /^[\p{L}]/u.test(p) && !/^(dr|dra)\.?$/i.test(p))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || '·'

/**
 * Una fila de «Para hoy»: lo que espera, cuánto y desde cuándo, y la fila
 * entera lleva a donde se atiende.
 */
function TareaDeHoy({
  href,
  icono: Icono,
  tono,
  titulo,
  detalle,
}: {
  href: string
  icono: LucideIcon
  tono: 'ok' | 'atencion' | 'info'
  titulo: string
  detalle: string
}) {
  return (
    <li>
      <Link href={href} className="para-hoy-tarea">
        <span className={`icono-modulo icono-modulo-sm kpi-icono-${tono}`} aria-hidden>
          <Icono size={16} />
        </span>
        <span className="para-hoy-texto">
          <strong>{titulo}</strong>
          <span>{detalle}</span>
        </span>
        <ChevronRight aria-hidden size={18} className="para-hoy-flecha" />
      </Link>
    </li>
  )
}

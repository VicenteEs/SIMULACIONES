import Link from 'next/link'
import { CheckCircle2, CornerUpLeft, Hourglass, Inbox, UserRound, Users } from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { BarrasHorizontales, Lineas, NoSePudoLeer, SinDatos } from '@/components/admin/Graficos'
import { Cifra } from '@/components/admin/tablero/Cifra'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { Vacio } from '@/components/ui/Vacio'
import { claseDeInsignia, tonoDeRevision } from '@/lib/tonosDeEstado'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { puedeEditar } from '@/lib/guardias'
import { cifra } from '@/lib/graficos'
import { diasEntre } from '@/lib/series'
import { duracionEnPalabras, estadoEnPalabras, origenEnPalabras, type EstadoDeRevision } from '@/lib/revision'
import { clientePayload } from '../datos'
import { MODULOS, NOMBRE_DE_MODULO } from '../modulos'
import { DIAS_DEL_TIEMPO_MEDIO, SEMANAS_DEL_GRAFICO, leerTableroDeLaCola } from './tablero'
import { PROFESIONES, firmasDe, type FirmasDeLaFicha } from '@/lib/firmas'
import './revision.css'

export const dynamic = 'force-dynamic'

/**
 * La cola de revisión de quien entra (D-142), con el tablero de Penpot encima
 * (P-007 E5, D-238).
 *
 * Con cientos de fichas llegando de los libros, buscarlas módulo a módulo en
 * «Contenido» no es un flujo de trabajo. Aquí están juntas, de los módulos que
 * la cuenta puede editar: primero lo que el administrador devolvió —alguien
 * espera esa corrección—, después lo asignado a quien mira y después lo que
 * espera a cualquiera, de lo más antiguo a lo más nuevo. Cada fila lleva al
 * editor, que es donde se revisa y donde se mide.
 *
 * Encima, la cola contada: cuánto entra y cuánto sale cada semana, cuánto
 * tarda en salir y dónde se acumula. Son cifras de la cola de sus módulos y no
 * de nadie en particular: no enseña cuánto tardó cada revisor, que es de la
 * auditoría y del administrador. A cada uno sí se le dice cuánto lleva
 * dedicado a cada ficha.
 */

const VISTAS = [
  { valor: 'por-revisar', etiqueta: 'Por revisar', estados: ['devuelta', 'pendiente', 'en-revision'] },
  { valor: 'listas', etiqueta: 'Validadas, sin publicar', estados: ['lista'] },
  { valor: 'publicadas', etiqueta: 'Publicadas', estados: ['publicada'] },
] as const

/** El título de la tabla de abajo según la vista: dice qué fichas tiene delante. */
const TITULO_DE_LA_VISTA: Record<(typeof VISTAS)[number]['valor'], string> = {
  'por-revisar': 'Fichas en la cola',
  listas: 'Validadas, esperando publicación',
  publicadas: 'Publicadas tras revisión',
}

const PRIORIDAD: Record<EstadoDeRevision, number> = {
  devuelta: 0,
  pendiente: 1,
  'en-revision': 1,
  lista: 2,
  publicada: 3,
}

const fecha = (valor: unknown) =>
  typeof valor === 'string' && valor
    ? new Date(valor).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—'

const plural = (n: number, singular: string, plural: string) => `${cifra(n)} ${n === 1 ? singular : plural}`

// Con un decimal: entre «2 días» y «3 días» cabe toda la diferencia entre una
// cola que va bien y una que se atasca.
const enDias = (dias: number) => `${cifra(dias, 1)} días`

export default async function PaginaPorRevisar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { sesion } = await exigirPanel()
  const parametros = await searchParams
  const vista = VISTAS.find((v) => v.valor === parametros.ver) ?? VISTAS[0]
  const soloMias = parametros.quien === 'mias'
  const usuarioId = String(sesion.usuario.id)
  const modulos = MODULOS.filter((m) => puedeEditar(sesion.usuario, m.slug)).map((m) => m.slug)

  const payload = await clientePayload()
  // El tablero va aparte de la tabla y a la vez: si una de las dos consultas
  // falla, la otra sigue en pie, y cada una dice lo suyo.
  const tableroPedido = leerTableroDeLaCola(payload, modulos)
  let filas: Record<string, unknown>[] = []
  let ilegible = false
  const tiempoMio = new Map<string, number>()
  // Cuántas hay en cada vista, para el contador de cada pestaña: sin él había
  // que entrar en «Validadas, sin publicar» para saber si había alguna.
  // `null` si no se pudo contar: la pestaña se pinta sin número.
  let cuentas: (number | null)[] = VISTAS.map(() => null)
  try {
    const { docs } = await payload.find({
      collection: 'revisiones',
      where: {
        and: [
          { coleccion: { in: modulos } },
          { estado: { in: [...vista.estados] } },
          ...(soloMias ? [{ asignadaA: { equals: usuarioId } }] : []),
        ],
      } as never,
      limit: 1000,
      depth: 1,
      sort: 'createdAt',
      overrideAccess: true,
      pagination: false,
      select: {
        coleccion: true,
        documentoId: true,
        titulo: true,
        estado: true,
        asignadaA: true,
        origen: true,
        libro: true,
        capitulo: true,
        paginas: true,
        lote: true,
        motivoDeDevolucion: true,
        ultimaEdicion: true,
        createdAt: true,
        firmaMedicoPor: true,
        firmaMedicoEn: true,
        firmaKinesiologoPor: true,
        firmaKinesiologoEn: true,
      },
    })
    filas = docs as unknown as Record<string, unknown>[]
    cuentas = await Promise.all(
      VISTAS.map((v) =>
        v.valor === vista.valor
          ? Promise.resolve(filas.length)
          : payload
              .count({
                collection: 'revisiones',
                where: {
                  and: [
                    { coleccion: { in: modulos } },
                    { estado: { in: [...v.estados] } },
                    ...(soloMias ? [{ asignadaA: { equals: usuarioId } }] : []),
                  ],
                } as never,
                overrideAccess: true,
              })
              .then((c) => c.totalDocs)
              .catch(() => null),
      ),
    )
    if (filas.length > 0) {
      const { docs: sesiones } = await payload.find({
        collection: 'sesiones-de-revision',
        where: { usuario: { equals: usuarioId } },
        limit: 20_000,
        depth: 0,
        overrideAccess: true,
        pagination: false,
        select: { coleccion: true, documentoId: true, segundosActivos: true },
      })
      for (const s of sesiones as unknown as Record<string, unknown>[]) {
        const clave = `${String(s.coleccion)}/${String(s.documentoId)}`
        tiempoMio.set(clave, (tiempoMio.get(clave) ?? 0) + Number(s.segundosActivos ?? 0))
      }
    }
  } catch (error) {
    console.error('[panel] no se pudo leer la cola de revisión:', error)
    ilegible = true
  }
  const tablero = await tableroPedido

  const idDeLaAsignada = (fila: Record<string, unknown>) => {
    const a = fila.asignadaA as Record<string, unknown> | null
    return a && typeof a === 'object' ? String(a.id) : null
  }
  const ordenadas = [...filas].sort(
    (a, b) =>
      PRIORIDAD[a.estado as EstadoDeRevision] - PRIORIDAD[b.estado as EstadoDeRevision] ||
      Number(idDeLaAsignada(b) === usuarioId) - Number(idDeLaAsignada(a) === usuarioId) ||
      String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')),
  )
  const mias = filas.filter((f) => idDeLaAsignada(f) === usuarioId).length

  const enlace = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams()
    const ver = 'ver' in cambios ? cambios.ver : vista.valor
    const quien = 'quien' in cambios ? cambios.quien : soloMias ? 'mias' : null
    if (ver && ver !== 'por-revisar') p.set('ver', ver)
    if (quien) p.set('quien', quien)
    const texto = p.toString()
    return `/admin-panel/revision${texto ? `?${texto}` : ''}`
  }

  const sinTablero = 'no se pudo leer la tabla de revisiones'

  return (
    <div>
      <CabeceraDePagina
        titulo="Por revisar"
        subtitulo="Fichas de sus módulos que esperan la mirada de un docente antes de publicarse"
      />

      {/* Las vistas eran tres enlaces sueltos separados por puntos, con la
          activa en negrita: no se veía que eran pestañas de lo mismo ni
          cuántas fichas había detrás de cada una. Ahora es un control
          segmentado con su contador, y `aria-current` dice cuál está puesta.
          Arriba del todo, como en Penpot, aunque solo cambian la tabla de
          abajo: las cifras son de la cola entera y no dependen de la vista. */}
      <div className="revision-vistas">
        <nav className="segmentado" aria-label="Qué fichas ver">
          {VISTAS.map((v, i) => (
            <Link
              key={v.valor}
              href={enlace({ ver: v.valor })}
              className="segmentado-opcion"
              aria-current={v.valor === vista.valor ? 'page' : undefined}
            >
              {v.etiqueta}
              {cuentas[i] !== null ? <span className="segmentado-cuenta">{cuentas[i]}</span> : null}
            </Link>
          ))}
        </nav>
        {soloMias ? (
          <Link href={enlace({ quien: null })} className="admin-btn admin-btn-ghost admin-btn-sm">
            <Users aria-hidden size={15} />
            Ver las de todos
          </Link>
        ) : (
          <Link href={enlace({ quien: 'mias' })} className="admin-btn admin-btn-ghost admin-btn-sm">
            <UserRound aria-hidden size={15} />
            Solo las asignadas a mí
          </Link>
        )}
      </div>

      <div className="tablero-cifras">
        <Cifra
          titulo="En cola"
          icono={Inbox}
          tono={tablero && tablero.enCola > 0 ? 'atencion' : 'ok'}
          ilegible={tablero === null}
          valor={tablero ? cifra(tablero.enCola) : '—'}
          // Más fichas que entran no es buena noticia para la cola: la flecha
          // sube en rojo, como en el Resumen, que cuenta lo mismo.
          cambio={
            tablero && tablero.entradas7dias > 0
              ? { valor: tablero.entradas7dias, unidad: '', buenoSiSube: false, respecto: 'entradas a la cola en los últimos 7 días' }
              : null
          }
          serie={tablero?.entradasPorSemana}
          descripcionDeLaSerie={`Fichas que entraron a la cola cada una de las últimas ${SEMANAS_DEL_GRAFICO} semanas.`}
          nota={
            !tablero
              ? sinTablero
              : tablero.enCola === 0
                ? 'nada espera a un revisor'
                : tablero.atrasadas > 0
                  ? `${plural(tablero.atrasadas, 'lleva', 'llevan')} una semana o más`
                  : 'ninguna lleva una semana'
          }
        />

        <Cifra
          titulo="Tiempo medio en cola"
          icono={Hourglass}
          tono="info"
          ilegible={tablero === null}
          valor={tablero && tablero.diasMedios !== null ? enDias(tablero.diasMedios) : '—'}
          nota={
            !tablero
              ? sinTablero
              : tablero.diasMedios === null
                ? `ninguna validada en los últimos ${DIAS_DEL_TIEMPO_MEDIO} días`
                : `de llegar a validarse · ${plural(tablero.validadasEnElPeriodo, 'validada', 'validadas')} en ${DIAS_DEL_TIEMPO_MEDIO} días${
                    tablero.diasMediosAntes !== null ? ` · antes, ${enDias(tablero.diasMediosAntes)}` : ''
                  }`
          }
        />

        <Cifra
          titulo="Validadas · 7 días"
          icono={CheckCircle2}
          tono="ok"
          ilegible={tablero === null}
          valor={tablero ? cifra(tablero.validadas7dias) : '—'}
          cambio={
            tablero && (tablero.validadas7dias > 0 || tablero.validadasAntes7dias > 0)
              ? { valor: tablero.validadas7dias - tablero.validadasAntes7dias, unidad: '', respecto: 'que los 7 días anteriores' }
              : null
          }
          serie={tablero?.validadasPorSemana}
          descripcionDeLaSerie={`Fichas validadas cada una de las últimas ${SEMANAS_DEL_GRAFICO} semanas.`}
          nota={tablero ? `${cifra(tablero.validadasAntes7dias)} en los 7 días anteriores` : sinTablero}
        />

        <Cifra
          titulo="Devueltas al revisor"
          icono={CornerUpLeft}
          tono={tablero && tablero.devueltas > 0 ? 'atencion' : 'info'}
          ilegible={tablero === null}
          valor={tablero ? cifra(tablero.devueltas) : '—'}
          nota={
            !tablero
              ? sinTablero
              : tablero.revisadas === 0
                ? 'ninguna ficha se ha revisado todavía'
                : `${tablero.devueltas > 0 ? 'esperan su corrección · ' : ''}${Math.round(
                    (tablero.devueltasAlgunaVez / tablero.revisadas) * 100,
                  )} % de las revisadas volvió alguna vez`
          }
        />
      </div>

      <div className="tablero-fila">
        <TarjetaDeGrafico
          titulo="Entradas y salidas de la cola"
          // La última semana es la que corre: un martes lleva dos días, y su
          // caída al final de la línea no es una caída.
          bajada="Fichas que llegaron a revisión y fichas validadas, por semana · la última es la semana en curso"
          ilegible={tablero === null}
        >
          {tablero === null ? (
            <NoSePudoLeer que="la tabla de revisiones" />
          ) : (
            <Lineas
              titulo={`Fichas que llegaron a revisión y fichas validadas, cada una de las últimas ${SEMANAS_DEL_GRAFICO} semanas`}
              etiquetas={tablero.semanas.map((s) => s.etiqueta)}
              detalles={tablero.semanas.map((s) => s.detalle)}
              series={[
                { etiqueta: 'Llegaron a revisión', color: 'var(--ambar)', valores: tablero.entradasPorSemana },
                { etiqueta: 'Validadas', color: 'var(--verde)', valores: tablero.validadasPorSemana },
              ]}
              area={false}
              unidad="fichas"
            />
          )}
        </TarjetaDeGrafico>

        <TarjetaDeGrafico
          titulo="Cola por módulo"
          bajada={tablero ? `${plural(tablero.enCola, 'ficha espera', 'fichas esperan')} a un revisor` : 'Las fichas que esperan a un revisor'}
          ilegible={tablero === null}
          className="revision-por-modulo"
        >
          {tablero === null ? (
            <NoSePudoLeer que="la tabla de revisiones" />
          ) : tablero.enCola === 0 ? (
            <SinDatos texto="No hay nada en cola." />
          ) : (
            <BarrasHorizontales
              titulo="Fichas en cola en cada módulo"
              datos={tablero.porModulo.map((m) => ({ etiqueta: NOMBRE_DE_MODULO[m.slug] ?? m.slug, valor: m.enCola }))}
            />
          )}
        </TarjetaDeGrafico>
      </div>

      <div className="admin-aviso admin-aviso-info">
        <strong>Cómo se revisa una ficha.</strong>
        Ábrala, cotéjela con el libro y las páginas que indica, corrija lo que haga falta y fírmela:
        cada ficha necesita la firma de un médico y la de un kinesiólogo, y con las dos queda lista.
        Mientras está abierta se registra el tiempo de revisión activa y qué secciones se revisan; al
        guardar, cuánto cambia respecto del texto original. Si el texto cambia después de una firma, la
        firma se borra. La publica un administrador.
      </div>

      {ilegible ? (
        <div className="admin-aviso admin-aviso-error">
          <strong>No se pudo leer la cola de revisión.</strong>
          El detalle queda en el registro del servidor. Mientras tanto, las fichas se pueden abrir
          desde «Contenido».
        </div>
      ) : ordenadas.length === 0 ? (
        <Vacio
          icono={vista.valor === 'por-revisar' ? CheckCircle2 : Inbox}
          titulo={vista.valor === 'por-revisar' ? 'No hay nada esperando revisión.' : 'Nada en esta vista.'}
          accion={
            soloMias ? (
              <Link href={enlace({ quien: null })} className="admin-btn admin-btn-secondary">
                Ver las de todos
              </Link>
            ) : null
          }
        >
          {soloMias ? 'Solo se muestran las fichas asignadas a usted.' : null}
        </Vacio>
      ) : (
        <TarjetaDeGrafico
          titulo={TITULO_DE_LA_VISTA[vista.valor]}
          bajada={
            <>
              {plural(filas.length, 'ficha', 'fichas')} en esta vista
              {soloMias ? ', solo las asignadas a usted' : mias > 0 ? ` · ${mias} asignada${mias === 1 ? '' : 's'} a usted` : ''}
            </>
          }
        >
          <div className="admin-table-container">
            <table className="admin-table tabla-apilable">
              <thead>
                <tr>
                  <th>Ficha</th>
                  <th>Estado</th>
                  <th>Asignada a</th>
                  <th>Fuente</th>
                  <th>Firmas</th>
                  <th>Su revisión</th>
                  <th>En revisión desde</th>
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((f) => {
                  const coleccion = String(f.coleccion)
                  const id = String(f.documentoId)
                  const asignada = f.asignadaA as Record<string, unknown> | null
                  const segundos = tiempoMio.get(`${coleccion}/${id}`) ?? 0
                  const libro = [f.libro, f.capitulo && `cap. ${String(f.capitulo)}`, f.paginas && `págs. ${String(f.paginas)}`]
                    .filter(Boolean)
                    .join(' · ')
                  const dias = vista.valor === 'por-revisar' ? diasEntre(f.createdAt) : null
                  return (
                    <tr key={`${coleccion}/${id}`}>
                      <th scope="row" className="admin-table-user-name">
                        <Link href={`/admin-panel/contenido/${coleccion}/${id}`}>
                          {String(f.titulo || `#${id}`)}
                        </Link>
                        <div className="revision-tenue">{NOMBRE_DE_MODULO[coleccion] ?? coleccion}</div>
                        {f.estado === 'devuelta' && f.motivoDeDevolucion ? (
                          <div className="auditoria-motivos">
                            <CornerUpLeft aria-hidden size={13} />
                            Devuelta: {String(f.motivoDeDevolucion)}
                          </div>
                        ) : null}
                      </th>
                      <td data-etiqueta="Estado">
                        <span className={claseDeInsignia(tonoDeRevision(String(f.estado)))}>
                          {estadoEnPalabras(f.estado)}
                        </span>
                      </td>
                      <td data-etiqueta="Asignada a">
                        {asignada && typeof asignada === 'object'
                          ? String(asignada.id) === usuarioId
                            ? 'Usted'
                            : String(asignada.nombre || asignada.email || '')
                          : <span className="revision-tenue">sin asignar</span>}
                      </td>
                      {/* De dónde salió el texto —el modelo o un docente— y,
                          si se sabe, de qué libro, para cotejarlo. */}
                      <td data-etiqueta="Fuente">
                        <div>{origenEnPalabras(f.origen)}</div>
                        {libro ? <div className="revision-tenue">{libro}</div> : null}
                      </td>
                      {/* Las dos firmas (D-240): cuál está y cuál falta, para que
                          un médico vea de un vistazo las que esperan la suya. */}
                      <td data-etiqueta="Firmas">
                        <FirmasEnLaFila firmas={firmasDe(f)} />
                      </td>
                      <td className="auditoria-numero" data-etiqueta="Su revisión">
                        {segundos > 0 ? duracionEnPalabras(segundos) : '—'}
                      </td>
                      <td className="u-nowrap" data-etiqueta="Desde">
                        {fecha(f.createdAt)}
                        {dias !== null ? (
                          <div className="revision-tenue">
                            {dias === 0 ? 'llegó hoy' : `${plural(dias, 'día', 'días')} en cola`}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TarjetaDeGrafico>
      )}
    </div>
  )
}

/** Las dos casillas de firma de una fila: «M» y «K», en verde la puesta. */
function FirmasEnLaFila({ firmas }: { firmas: FirmasDeLaFicha }) {
  return (
    <span className="revision-firmas-fila">
      {PROFESIONES.map(({ valor, etiqueta }) => {
        const firma = firmas[valor]
        return (
          <span
            key={valor}
            className={`insignia ${firma ? 'insignia-ok' : 'insignia-neutra'}`}
            title={firma ? `${etiqueta}: ${firma.nombre ?? 'cuenta borrada'}` : `${etiqueta}: falta su firma`}
          >
            {etiqueta}
            <span className="sr-only">{firma ? `: firmada por ${firma.nombre ?? 'una cuenta borrada'}` : ': falta'}</span>
          </span>
        )
      })}
    </span>
  )
}

import Link from 'next/link'
import type { Payload, Where } from 'payload'
import { CalendarDays } from 'lucide-react'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import {
  BarrasApiladasPorFila,
  BarrasHorizontales,
  Dona,
  Lineas,
  NoSePudoLeer,
  type Punto,
  type SerieDeLineas,
} from '@/components/admin/Graficos'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { PlegarTodo } from '@/components/admin/PlegarTodo'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { SeccionPlegable } from '@/components/ui/SeccionPlegable'
import { leerTodas } from '@/lib/leerTodas'
import { cifra } from '@/lib/graficos'
import { claveDeMes, contarEn, ultimosMeses } from '@/lib/series'
import { QUIEN_EN_PALABRAS, filasDeQuien, lecturasPorMes, quienDeLaConsulta, type QuienLee } from '@/lib/seguimiento'
import { FiltroDeQuien } from '@/components/admin/FiltroDeQuien'
import { clientePayload } from '../datos'
import { MODULOS } from '../modulos'
import { leerTitulosDeFichas } from '../titulosDeFichas'
import { fichasConMasLecturas, modulosConTitulosIlegibles, rotularFichasLeidas } from './fichasMasLeidas'
import {
  PERIODOS,
  PERIODO_POR_OMISION,
  lecturasPorModulo,
  lectoresEnElPeriodo,
  periodoDeLaConsulta,
  rutaDeEstadisticas,
  type Periodo,
} from './periodo'
import '../seguimiento.css'
import './estadisticas.css'

export const dynamic = 'force-dynamic'

/**
 * Estadísticas de la plataforma.
 *
 * Responde a tres preguntas y ninguna más, porque un panel de métricas que
 * responde a treinta no se mira: cuánto contenido hay y a qué ritmo crece,
 * quién lo está leyendo, y qué se lee más. Es la composición del tablero de
 * Penpot (P-007 E5, D-238), con un periodo que se elige arriba y que cambia lo
 * que se pide a la base (`periodo.ts`).
 *
 * La cuarta sección que tenía —«Qué pide atención», con los comentarios sin
 * resolver y dónde se comenta— se mudó a la pestaña «Comentarios», que ahora
 * abre con esas mismas cifras contadas sobre la tabla entera. Dos pantallas con
 * el mismo número son dos sitios donde puede dejar de coincidir.
 *
 * Todo se calcula sobre lecturas acotadas y en paralelo: la página tiene que
 * abrir rápido o dejará de abrirse.
 *
 * Ninguna consulta que falle se convierte en un cero. Es la regla que gobierna
 * todo lo de abajo y el motivo de que haya tantos `=== null` en el marcado: en
 * una pantalla cuyo único trabajo es contar, un cero inventado no es un dato
 * degradado, es una respuesta falsa a la pregunta que se vino a hacer. Es el
 * mismo criterio que `datos.ts` adoptó con `ilegible`, y aquí muerde más
 * fuerte, porque allí un conteo mal leído afea una tarjeta y aquí deja doce
 * barras planas que se leen como «este año no se escribió nada».
 */

/**
 * Lo que hay en una colección, o `null` si la consulta no se pudo hacer.
 *
 * `null` y no `[]`, que es como estaba: una lista vacía por excepción viaja
 * hasta el marcado indistinguible de una colección de verdad vacía, y desde ahí
 * ya no hay forma de recuperar la diferencia. Con la tabla de `actividad` caída
 * —el caso que AGENTS.md advierte: un cambio de esquema desplegado sin su
 * migración— la página decía «0 lecturas registradas» y dibujaba los doce meses
 * a cero, que es una afirmación sobre los residentes y no sobre la base. Y lo
 * hacía sin dejar nada en el registro del servidor, así que ni siquiera después
 * se podía saber que había pasado.
 */
async function leerColeccion(
  payload: Payload,
  slug: string,
  opciones: { columnas: string[]; where?: Where },
): Promise<Record<string, unknown>[] | null> {
  try {
    // Todas las filas y solo las columnas que se cuentan (D-175). Antes se pedían las 1.000 o 2.000 más recientes con
    // todos sus campos, y pasado el tope los totales de esta pantalla eran los de las filas más recientes presentados
    // como el total; con 1.736 patologías escritas ya se estaba a un paso.
    const { docs } = await leerTodas(payload, {
      coleccion: slug,
      where: opciones.where,
      select: Object.fromEntries(opciones.columnas.map((c) => [c, true])),
    })
    return docs
  } catch (error) {
    console.error(`[panel] no se pudo leer «${slug}» para las estadísticas:`, error)
    return null
  }
}

/** Fechas de creación de todos los documentos de una colección, o `null`. */
async function fechasDeCreacion(payload: Payload, slug: string): Promise<string[] | null> {
  // Se leen los documentos de la tabla principal y no las versiones: el panel cuenta lo escrito, no lo publicado, y
  // una ficha en borrador tiene su fila ahí desde que nace, así que cae en la barra del mes en que se escribió.
  const docs = await leerColeccion(payload, slug, { columnas: ['createdAt'] })
  if (docs === null) return null
  return docs.map((d) => d.createdAt).filter((v): v is string => typeof v === 'string')
}

/**
 * «3 fichas», «1 ficha» o «— fichas» cuando el número sería de relleno.
 *
 * El guion es el mismo que usa el resumen del panel para lo ilegible, y va con
 * el plural a propósito: «— ficha» se lee como un uno mal pintado.
 */
const conteo = (valor: number, ilegible: boolean, singular: string, plural: string): string =>
  ilegible ? `— ${plural}` : `${cifra(valor)} ${valor === 1 ? singular : plural}`

/** El color de cada módulo, el suyo de siempre (`--mod-1` a `--mod-5`, en el orden de `MODULOS`). */
const colorDelModulo = (slug: string) => `var(--mod-${MODULOS.findIndex((m) => m.slug === slug) + 1})`

export default async function PaginaEstadisticas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirPanel('admin')
  const consulta = await searchParams
  const quien = quienDeLaConsulta(consulta.quien)
  const periodo = periodoDeLaConsulta(consulta.periodo)

  const payload = await clientePayload()
  const meses = ultimosMeses(periodo)
  const claves = meses.map((m) => m.clave)
  const enPalabras = `los últimos ${periodo} meses`
  const inicioDelPeriodo = new Date(`${claves[0]}-01T00:00:00`).toISOString()

  const [porModulo, actividadTodas, usuarios, aperturas] = await Promise.all([
    Promise.all(
      MODULOS.map(async (m) => ({
        slug: m.slug,
        nombre: m.nombre,
        fechas: await fechasDeCreacion(payload, m.slug),
      })),
    ),
    leerColeccion(payload, 'actividad', {
      columnas: ['usuario', 'coleccion', 'documentoId', 'ultimaVisita', 'completado'],
    }),
    leerColeccion(payload, 'usuarios', { columnas: ['rol', 'activo', 'pendiente', 'ultimoAcceso'] }),
    // Cada apertura de una ficha, con su fecha: de ahí sale «Lecturas por mes». La tabla `actividad` solo guarda la última
    // visita de cada persona a cada ficha, y con ella una ficha abierta en dos meses contaba solo en el último. Solo las
    // del periodo: es lo que cambia al elegir otro arriba.
    leerColeccion(payload, 'registro-de-acciones', {
      columnas: ['fecha', 'usuario', 'coleccion', 'documentoId'],
      where: { and: [{ accion: { equals: 'lectura' } }, { fecha: { greater_than_equal: inicioDelPeriodo } }] },
    }),
  ])

  // El rol de cada cuenta decide a quién se cuenta en la lectura (`?quien=`): el equipo que prueba la plataforma y los
  // residentes que la usan no son lo mismo, y juntos, con cinco cuentas de equipo y ningún residente, todo el seguimiento
  // era del equipo sin decirlo. Si no se pudieron leer las cuentas, no se puede separar a nadie: la lectura se da por
  // ilegible si se pidió una parte, y se dibuja junta, sin separar, si se pidió todo.
  const rolDe = new Map<string, string>(
    (usuarios ?? []).map((u) => [String(u.id), typeof u.rol === 'string' ? u.rol : '']),
  )
  const sinRoles = usuarios === null && quien !== 'todos'
  // La lectura entera se da por ilegible si falta cualquiera de sus dos fuentes: sin las aperturas, cada ficha
  // volvería a caer solo en el mes de su última visita, que es justo el defecto que D-175 corrigió.
  const lecturaIlegible = actividadTodas === null || aperturas === null || sinRoles
  const filasDe = (q: QuienLee) => filasDeQuien(actividadTodas ?? [], q, rolDe)
  const eventosDe = (q: QuienLee) => filasDeQuien(aperturas ?? [], q, rolDe)

  // Las fichas más leídas se cuentan aquí arriba, y no con el resto de la
  // lectura, porque piden una segunda vuelta a la base —sus títulos— y lo que
  // no se pueda leer en esa vuelta tiene que entrar en el aviso de abajo. Solo
  // se buscan los títulos de las ocho que se enseñan.
  const masLeidas = lecturaIlegible ? [] : fichasConMasLecturas(lectoresEnElPeriodo(claves, eventosDe(quien), filasDe(quien)), 8)
  const estadosDeLasMasLeidas = await leerTitulosDeFichas(payload, masLeidas)

  // Cada módulo falla por su cuenta: que se caiga la tabla de patologías no
  // invalida el recuento de cirugías. Se suma solo lo que se pudo leer y se
  // nombra arriba lo que falta, en vez de mezclar recuentos con ceros.
  // `flatMap` y no `filter` porque un `filter` no estrecha el `string[] | null`
  // de `fechas`: devolver la fila entera dentro de la rama donde ya se sabe que
  // no es nula es lo que le ahorra a todo lo de abajo un `!` o un `as`.
  const modulosLegibles = porModulo.flatMap((m) =>
    m.fechas === null ? [] : [{ slug: m.slug, nombre: m.nombre, fechas: m.fechas }],
  )
  const modulosIlegibles = porModulo.filter((m) => m.fechas === null)
  const contenidoIlegible = modulosLegibles.length === 0

  // Se nombra lo que faltó, y no un «algo falló» genérico: saber que lo caído
  // es la tabla de actividad y no la de patologías es la diferencia entre
  // mirar la migración correcta y mirarlas todas.
  const noSePudoLeer = [
    ...modulosIlegibles.map((m) => m.nombre),
    ...(actividadTodas === null ? ['el registro de lecturas'] : []),
    ...(aperturas === null ? ['las aperturas de fichas'] : []),
    ...(usuarios === null ? ['las cuentas'] : []),
    ...modulosConTitulosIlegibles(masLeidas, estadosDeLasMasLeidas).map(
      (nombre) => `los títulos de ${nombre}`,
    ),
  ]

  // --- contenido ----------------------------------------------------------
  const totalFichas = modulosLegibles.reduce((t, m) => t + m.fechas.length, 0)
  const creadasPorModulo = modulosLegibles.map((m) => contarEn(meses, m.fechas.map(claveDeMes)))
  const creadasEnElPeriodo = creadasPorModulo.flat().reduce((t, v) => t + v, 0)

  // --- lectura ------------------------------------------------------------
  // Cada punto son las fichas distintas que cada persona abrió ese mes, sacadas de las aperturas con su fecha (D-175).
  // Residentes y equipo van en dos líneas, como en Penpot; el filtro de arriba deja una sola. Sin las cuentas no hay
  // cómo separarlas, y va una línea con todas.
  const serieDe = (q: QuienLee) => lecturasPorMes(claves, eventosDe(q), filasDe(q))
  const residentes = serieDe('residentes')
  const equipo = serieDe('equipo')
  const series: SerieDeLineas[] =
    usuarios === null
      ? [{ etiqueta: 'Todas las cuentas', color: 'var(--marca)', valores: serieDe('todos') }]
      : [
          ...(quien !== 'equipo' ? [{ etiqueta: 'Residentes', color: 'var(--marca)', valores: residentes }] : []),
          ...(quien !== 'residentes' ? [{ etiqueta: 'Equipo', color: 'var(--cian)', valores: equipo }] : []),
        ]
  const totalLecturas = series.flatMap((s) => s.valores).reduce((t, v) => t + v, 0)
  const suma = (valores: number[]) => valores.reduce((t, v) => t + v, 0)

  const porModuloLeido = lecturasPorModulo(
    claves,
    eventosDe(quien),
    filasDe(quien),
    MODULOS.map((m) => m.slug),
  )
  const lecturaPorModulo: Punto[] = MODULOS.map((m, i) => ({ etiqueta: m.nombre, valor: porModuloLeido[i] })).sort(
    (a, b) => b.valor - a.valor,
  )

  // Con el título de cada ficha y no con su número de fila, que es como estaba:
  // «Biblioteca de patologías · #12» obligaba a abrir la tabla en otra ventana
  // para saber qué se estaba leyendo, que es la única pregunta de esta tarjeta.
  const fichasMasLeidas: Punto[] = rotularFichasLeidas(masLeidas, estadosDeLasMasLeidas)

  // --- cuentas ------------------------------------------------------------
  // Las activas, como en el Resumen: una solicitud sin aprobar no es una cuenta que lea.
  const listaUsuarios = usuarios ?? []
  const activas = listaUsuarios.filter((u) => u.activo === true && u.pendiente !== true)
  const deRol = (rol: string) => activas.filter((u) => u.rol === rol).length
  const hace30dias = Date.now() - 30 * 86_400_000
  const entraronEsteMes = listaUsuarios.filter(
    (u) => typeof u.ultimoAcceso === 'string' && new Date(u.ultimoAcceso).getTime() > hace30dias,
  ).length

  return (
    <div className="estadisticas">
      <CabeceraDePagina
        titulo="Estadísticas"
        subtitulo="Cuánto contenido hay, quién lo lee y qué se lee más"
        acciones={<SelectorDePeriodo actual={periodo} quien={quien} />}
      />

      {noSePudoLeer.length > 0 ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>La base no respondió a parte de estos recuentos.</strong>
          No se pudo leer: {noSePudoLeer.join(', ')}. Donde aparece «—» o falta un gráfico no hay un cero: es
          un recuento que no se pudo hacer, y lo que sí se dibuja está calculado solo sobre lo que sí se leyó.
          Lo corriente es que falte una tabla —un cambio de esquema desplegado sin su migración—; el detalle
          queda en el registro del servidor.
        </div>
      ) : null}

      {/* Las secciones se pliegan y recuerdan cómo se dejaron (pedido del
          dueño): quien viene a mirar solo lo que se lee más no tiene que bajar
          por encima de dos rejillas de gráficos. Aquí se pintan como los
          titulares de sección de Penpot y no como cajas (`estadisticas.css`). */}
      <PlegarTodo />

      <SeccionPlegable
        clave="estadisticas.contenido"
        titulo="Cuánto contenido hay y cómo crece"
        resumen={conteo(totalFichas, contenidoIlegible, 'ficha', 'fichas')}
      >
        <div className="tablero-fila">
          <TarjetaDeGrafico
            titulo="Fichas creadas por mes"
            bajada={
              contenidoIlegible
                ? 'Por módulo'
                : `Por módulo, en ${enPalabras}: ${conteo(creadasEnElPeriodo, false, 'ficha', 'fichas')}${
                    modulosIlegibles.length > 0 ? `, sin ${modulosIlegibles.map((m) => m.nombre).join(' ni ')}` : ''
                  }`
            }
            ilegible={modulosIlegibles.length > 0}
          >
            {contenidoIlegible ? (
              // Barras a cero sobre cero módulos leídos no es un gráfico vacío:
              // es un gráfico que afirma que no se escribió nada en meses.
              <NoSePudoLeer que="ninguna de las tablas de los módulos, y eso no significa que no haya contenido" />
            ) : (
              // Una fila por mes, con los módulos apilados. Penpot las dibuja de
              // pie, como columnas; el panel no tiene todavía columnas apiladas,
              // y las filas dicen lo mismo con cada mes rotulado entero.
              <BarrasApiladasPorFila
                titulo={`Fichas creadas cada mes en ${enPalabras}, por módulo`}
                series={modulosLegibles.map((m) => ({ etiqueta: m.nombre, color: colorDelModulo(m.slug) }))}
                filas={meses.map((mes, i) => ({
                  etiqueta: mes.detalle,
                  valores: creadasPorModulo.map((delModulo) => delModulo[i]),
                }))}
              />
            )}
          </TarjetaDeGrafico>

          {/* Solo los módulos que respondieron: un sector a cero sobre un módulo
              ilegible es indistinguible de un módulo sin escribir todavía. */}
          <TarjetaDeGrafico
            titulo="Fichas por módulo"
            bajada={`${contenidoIlegible ? '—' : cifra(totalFichas)} en total, hoy`}
            ilegible={modulosIlegibles.length > 0}
          >
            {contenidoIlegible ? (
              <NoSePudoLeer que="las tablas de los módulos" />
            ) : (
              <Dona
                titulo="Fichas escritas en cada módulo"
                rotuloDelTotal="fichas"
                partes={modulosLegibles.map((m) => ({ etiqueta: m.nombre, valor: m.fechas.length, color: colorDelModulo(m.slug) }))}
              />
            )}
            {modulosIlegibles.length > 0 && !contenidoIlegible ? (
              <p className="admin-card-note">
                Sin {modulosIlegibles.map((m) => m.nombre).join(' ni ')}: no se pudo leer.
              </p>
            ) : null}
          </TarjetaDeGrafico>
        </div>
      </SeccionPlegable>

      <SeccionPlegable
        clave="estadisticas.lectura"
        titulo="Quién lo está leyendo"
        resumen={conteo(totalLecturas, lecturaIlegible, 'lectura', 'lecturas')}
      >
        <FiltroDeQuien
          actual={quien}
          ruta="/admin-panel/estadisticas"
          parametros={periodo === PERIODO_POR_OMISION ? {} : { periodo: String(periodo) }}
          nota={
            lecturaIlegible || usuarios === null
              ? undefined
              : `En ${enPalabras}: ${cifra(suma(residentes))} de residentes · ${cifra(suma(equipo))} del equipo`
          }
        />
        <div className="estadisticas-tercios">
          <TarjetaDeGrafico
            titulo="Lecturas por mes"
            bajada={
              quien === 'todos'
                ? 'Fichas abiertas · residentes y equipo'
                : `Fichas abiertas · ${QUIEN_EN_PALABRAS[quien]}`
            }
            ilegible={lecturaIlegible}
          >
            {lecturaIlegible ? (
              // Una línea plana aquí se lee como «nadie entró», que es una
              // conclusión sobre los residentes y no sobre la base.
              <NoSePudoLeer que={sinRoles ? 'las cuentas, y sin ellas no se puede separar a nadie' : 'el registro de lecturas'} />
            ) : (
              <>
                <Lineas
                  titulo={`Fichas abiertas por mes en ${enPalabras}`}
                  etiquetas={meses.map((m) => m.etiqueta)}
                  detalles={meses.map((m) => m.detalle)}
                  series={series}
                  unidad="lecturas"
                />
                <p className="admin-card-note">
                  Cada punto cuenta las fichas distintas que cada persona abrió ese mes, no las visitas repetidas. Una
                  ficha abierta en dos meses cuenta en los dos.
                </p>
              </>
            )}
          </TarjetaDeGrafico>

          <TarjetaDeGrafico
            titulo="Lecturas por módulo"
            bajada={lecturaIlegible ? `En ${enPalabras}` : `En ${enPalabras} · ${conteo(totalLecturas, false, 'lectura', 'lecturas')}`}
            ilegible={lecturaIlegible}
          >
            {lecturaIlegible ? (
              <NoSePudoLeer que="el registro de lecturas" />
            ) : (
              <BarrasHorizontales titulo={`Lecturas de cada módulo en ${enPalabras}`} datos={lecturaPorModulo} />
            )}
          </TarjetaDeGrafico>

          <TarjetaDeGrafico
            titulo="Cuentas por rol"
            bajada={
              usuarios === null
                ? 'Las cuentas activas, hoy'
                : `${conteo(activas.length, false, 'activa', 'activas')} de ${cifra(listaUsuarios.length)}, hoy`
            }
            ilegible={usuarios === null}
          >
            {usuarios === null ? (
              <NoSePudoLeer que="la tabla de cuentas. Esto no dice que no haya cuentas" />
            ) : (
              <>
                <BarrasHorizontales
                  titulo="Cuentas activas por rol"
                  datos={[
                    { etiqueta: 'Lectores (residentes)', valor: deRol('lector') },
                    { etiqueta: 'Editores (docentes)', valor: deRol('editor') },
                    { etiqueta: 'Administradores', valor: deRol('admin') },
                  ]}
                />
                <p className="admin-card-note">
                  {conteo(entraronEsteMes, false, 'cuenta ha entrado', 'cuentas han entrado')} en los últimos 30 días.
                </p>
              </>
            )}
          </TarjetaDeGrafico>
        </div>
      </SeccionPlegable>

      {!lecturaIlegible && fichasMasLeidas.length > 0 ? (
        <SeccionPlegable
          clave="estadisticas.mas-leidas"
          titulo="Qué se lee más"
          resumen={`${fichasMasLeidas.length} fichas`}
        >
          <TarjetaDeGrafico
            titulo="Fichas más leídas"
            bajada={`Personas distintas que abrieron cada ficha en ${enPalabras}${
              quien === 'todos' ? '' : ` (${QUIEN_EN_PALABRAS[quien]})`
            }`}
          >
            <BarrasHorizontales titulo={`Fichas más leídas en ${enPalabras}`} datos={fichasMasLeidas} />
          </TarjetaDeGrafico>
        </SeccionPlegable>
      ) : null}
    </div>
  )
}

/**
 * «Últimos 3, 6 o 12 meses», arriba a la derecha como en Penpot.
 *
 * Enlaces y no un desplegable de cliente, por lo mismo que `FiltroDeQuien`: la
 * elección va en la dirección, la página sigue siendo de servidor y cada enlace
 * conserva el «quién» elegido, como `FiltroDeQuien` conserva el periodo.
 */
function SelectorDePeriodo({ actual, quien }: { actual: Periodo; quien: QuienLee }) {
  return (
    <div className="estadisticas-periodo" role="group" aria-label="Periodo de las estadísticas">
      <span className="estadisticas-periodo-rotulo">
        <CalendarDays aria-hidden size={16} />
        Últimos
      </span>
      {PERIODOS.map((p) => (
        <Link
          key={p}
          href={rutaDeEstadisticas(p, quien)}
          className={`estadisticas-periodo-opcion${p === actual ? ' activa' : ''}`}
          aria-current={p === actual ? 'true' : undefined}
          scroll={false}
        >
          {p} meses
        </Link>
      ))}
    </div>
  )
}

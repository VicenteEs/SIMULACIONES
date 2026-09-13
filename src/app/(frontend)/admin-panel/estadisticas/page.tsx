import type { Payload } from 'payload'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { BarraApilada, BarrasHorizontales, BarrasVerticales, type Punto } from '@/components/admin/Graficos'
import { clientePayload } from '../datos'
import { MODULOS, NOMBRE_DE_MODULO } from '../modulos'

export const dynamic = 'force-dynamic'

/**
 * Estadísticas de la plataforma.
 *
 * Responde a tres preguntas y ninguna más, porque un panel de métricas que
 * responde a treinta no se mira: cuánto contenido hay y a qué ritmo crece,
 * quién lo está leyendo, y qué material pide atención.
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

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Las últimas doce claves de mes, de la más antigua a la más reciente. */
function ultimosDoceMeses(): { clave: string; etiqueta: string; detalle: string }[] {
  const hoy = new Date()
  return Array.from({ length: 12 }, (_, i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - (11 - i), 1)
    return {
      clave: `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`,
      etiqueta: MESES[fecha.getMonth()],
      detalle: `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`,
    }
  })
}

const claveDeMes = (iso: unknown): string | null => {
  if (typeof iso !== 'string') return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

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
  opciones: { limite: number; orden?: string; borradores?: boolean },
): Promise<Record<string, unknown>[] | null> {
  try {
    const { docs } = await payload.find({
      collection: slug as never,
      limit: opciones.limite,
      depth: 0,
      draft: opciones.borradores === true,
      sort: opciones.orden,
      overrideAccess: true,
    })
    return docs as Record<string, unknown>[]
  } catch (error) {
    console.error(`[panel] no se pudo leer «${slug}» para las estadísticas:`, error)
    return null
  }
}

/** Fechas de creación de todos los documentos de una colección, o `null`. */
async function fechasDeCreacion(payload: Payload, slug: string): Promise<string[] | null> {
  // `borradores` va en alto porque el panel cuenta lo escrito, no lo publicado:
  // una ficha en borrador es trabajo hecho y tiene que aparecer en la barra del
  // mes en que se escribió.
  const docs = await leerColeccion(payload, slug, {
    limite: 2000,
    orden: 'createdAt',
    borradores: true,
  })
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
  ilegible ? `— ${plural}` : `${valor} ${valor === 1 ? singular : plural}`

export default async function PaginaEstadisticas() {
  await exigirPanel('admin')

  const payload = await clientePayload()
  const meses = ultimosDoceMeses()

  const [porModulo, actividad, comentarios, usuarios] = await Promise.all([
    Promise.all(
      MODULOS.map(async (m) => ({
        slug: m.slug,
        nombre: m.nombre,
        fechas: await fechasDeCreacion(payload, m.slug),
      })),
    ),
    leerColeccion(payload, 'actividad', { limite: 2000, orden: '-ultimaVisita' }),
    leerColeccion(payload, 'comentarios', { limite: 1000 }),
    leerColeccion(payload, 'usuarios', { limite: 500 }),
  ])

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
  // es la tabla de comentarios y no la de patologías es la diferencia entre
  // mirar la migración correcta y mirarlas todas.
  const noSePudoLeer = [
    ...modulosIlegibles.map((m) => m.nombre),
    ...(actividad === null ? ['el registro de lecturas'] : []),
    ...(comentarios === null ? ['los comentarios'] : []),
    ...(usuarios === null ? ['las cuentas'] : []),
  ]

  // --- contenido creado por mes -------------------------------------------
  const todasLasFechas = modulosLegibles.flatMap((m) => m.fechas)
  const creadoPorMes: Punto[] = meses.map((mes) => ({
    etiqueta: mes.etiqueta,
    detalle: mes.detalle,
    valor: todasLasFechas.filter((f) => claveDeMes(f) === mes.clave).length,
  }))

  // --- lectura ------------------------------------------------------------
  const registros = actividad ?? []
  const lecturaPorModulo: Punto[] = MODULOS.map((m) => ({
    etiqueta: m.nombre,
    valor: registros.filter((r) => r.coleccion === m.slug).length,
  })).sort((a, b) => b.valor - a.valor)

  const visitasPorMes: Punto[] = meses.map((mes) => ({
    etiqueta: mes.etiqueta,
    detalle: mes.detalle,
    valor: registros.filter((r) => claveDeMes(r.ultimaVisita) === mes.clave).length,
  }))

  const fichasMasLeidas: Punto[] = Object.entries(
    registros.reduce<Record<string, number>>((cuenta, r) => {
      const clave = `${r.coleccion}/${r.documentoId}`
      cuenta[clave] = (cuenta[clave] ?? 0) + 1
      return cuenta
    }, {}),
  )
    .map(([clave, valor]) => {
      const [coleccion, documento] = clave.split('/')
      return {
        etiqueta: `${NOMBRE_DE_MODULO[coleccion] ?? coleccion} · #${documento}`,
        valor,
      }
    })
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8)

  // --- comentarios --------------------------------------------------------
  const listaComentarios = comentarios ?? []
  const comentariosPorModulo: Punto[] = MODULOS.map((m) => ({
    etiqueta: m.nombre,
    valor: listaComentarios.filter((c) => c.coleccion === m.slug).length,
  })).sort((a, b) => b.valor - a.valor)

  const pendientes = listaComentarios.filter((c) => c.estado === 'pendiente').length

  // --- cuentas ------------------------------------------------------------
  const listaUsuarios = usuarios ?? []
  const cuenta = (rol: string) => listaUsuarios.filter((u) => u.rol === rol).length
  const activos = listaUsuarios.filter((u) => u.activo === true).length

  const hace30dias = Date.now() - 30 * 86_400_000
  const entraronEsteMes = listaUsuarios.filter(
    (u) => typeof u.ultimoAcceso === 'string' && new Date(u.ultimoAcceso).getTime() > hace30dias,
  ).length

  const totalFichas = todasLasFechas.length
  const totalVisitas = registros.length

  return (
    <div>
      <header className="admin-header">
        <h1 className="admin-title">Estadísticas</h1>
        <p className="admin-subtitle">
          {conteo(totalFichas, contenidoIlegible, 'ficha escrita', 'fichas escritas')} ·{' '}
          {conteo(totalVisitas, actividad === null, 'lectura registrada', 'lecturas registradas')}{' '}
          · {conteo(activos, usuarios === null, 'cuenta con acceso', 'cuentas con acceso')}
        </p>
      </header>

      {noSePudoLeer.length > 0 ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>La base no respondió a parte de estos recuentos.</strong>
          No se pudo leer: {noSePudoLeer.join(', ')}. Donde aparece «—» o falta un gráfico no hay
          un cero: es un recuento que no se pudo hacer, y lo que sí se dibuja está calculado solo
          sobre lo que sí se leyó. Lo corriente es que falte una tabla —un cambio de esquema
          desplegado sin su migración—; el detalle queda en el registro del servidor.
        </div>
      ) : null}

      <h2 className="admin-section-title">Cuánto contenido hay y cómo crece</h2>
      <div className="admin-grid">
        <div className={`admin-card admin-card-ancha${contenidoIlegible ? ' admin-card-ilegible' : ''}`}>
          <div className="admin-card-title">Fichas creadas por mes</div>
          {contenidoIlegible ? (
            // Doce barras a cero sobre cero módulos leídos no es un gráfico
            // vacío: es un gráfico que afirma que no se escribió nada en un año.
            <p className="admin-card-note">
              Ningún módulo respondió, así que no hay nada que dibujar aquí. No significa que no
              haya contenido.
            </p>
          ) : (
            <>
              <p className="admin-card-note">
                Últimos doce meses
                {modulosIlegibles.length > 0
                  ? `, sin ${modulosIlegibles.map((m) => m.nombre).join(' ni ')}`
                  : ', todos los módulos juntos'}
                .
              </p>
              <BarrasVerticales datos={creadoPorMes} titulo="Fichas creadas por mes" />
            </>
          )}
        </div>

        <div className={`admin-card${modulosIlegibles.length > 0 ? ' admin-card-ilegible' : ''}`}>
          <div className="admin-card-title">Reparto por módulo</div>
          <div className="admin-card-value" style={{ fontSize: '2rem' }}>
            {contenidoIlegible ? '—' : totalFichas}
          </div>
          {/* Solo los módulos que respondieron: una barra a cero sobre un módulo
              ilegible es indistinguible de un módulo sin escribir todavía. */}
          <BarrasHorizontales
            titulo="Fichas por módulo"
            datos={modulosLegibles
              .map((m) => ({ etiqueta: m.nombre, valor: m.fechas.length }))
              .sort((a, b) => b.valor - a.valor)}
          />
          {modulosIlegibles.length > 0 ? (
            <p className="admin-card-note">
              Sin {modulosIlegibles.map((m) => m.nombre).join(' ni ')}: no se pudo leer.
            </p>
          ) : null}
        </div>
      </div>

      <h2 className="admin-section-title">Quién lo está leyendo</h2>
      <div className="admin-grid">
        <div
          className={`admin-card admin-card-ancha${actividad === null ? ' admin-card-ilegible' : ''}`}
        >
          <div className="admin-card-title">Lecturas por mes</div>
          {actividad === null ? (
            <p className="admin-card-note">
              No se pudo leer el registro de actividad. Las barras están en blanco porque no hay
              dato, no porque nadie haya entrado.
            </p>
          ) : (
            <>
              <p className="admin-card-note">
                Cada barra cuenta las fichas visitadas en ese mes, no las visitas repetidas.
              </p>
              <BarrasVerticales datos={visitasPorMes} titulo="Lecturas por mes" />
            </>
          )}
        </div>

        <div className={`admin-card${actividad === null ? ' admin-card-ilegible' : ''}`}>
          <div className="admin-card-title">Módulos más leídos</div>
          {actividad === null ? (
            <p className="admin-card-note">Sin dato: el registro de actividad no respondió.</p>
          ) : (
            <BarrasHorizontales titulo="Lecturas por módulo" datos={lecturaPorModulo} />
          )}
        </div>

        <div className={`admin-card${usuarios === null ? ' admin-card-ilegible' : ''}`}>
          <div className="admin-card-title">Cuentas</div>
          <div className="admin-card-value" style={{ fontSize: '2rem' }}>
            {usuarios === null ? (
              '—'
            ) : (
              <>
                {activos}
                <span className="admin-numero-tenue"> de {listaUsuarios.length}</span>
              </>
            )}
          </div>
          {usuarios === null ? (
            <p className="admin-card-note">
              No se pudo leer la tabla de usuarios. Esto no dice que no haya cuentas.
            </p>
          ) : (
            <>
              <p className="admin-card-note">{entraronEsteMes} han entrado en los últimos 30 días</p>
              <BarraApilada
                titulo="Cuentas por rol"
                partes={[
                  {
                    etiqueta: 'Administradores',
                    valor: cuenta('admin'),
                    color: 'var(--marca-honda)',
                  },
                  { etiqueta: 'Editores', valor: cuenta('editor'), color: 'var(--marca)' },
                  { etiqueta: 'Lectores', valor: cuenta('lector'), color: '#8fb6e8' },
                ]}
              />
            </>
          )}
        </div>
      </div>

      {actividad !== null && fichasMasLeidas.length > 0 ? (
        <>
          <h2 className="admin-section-title">Qué se lee más</h2>
          <div className="admin-card admin-card-ancha">
            <BarrasHorizontales titulo="Fichas más leídas" datos={fichasMasLeidas} />
          </div>
        </>
      ) : null}

      <h2 className="admin-section-title">Qué pide atención</h2>
      <div className="admin-grid">
        <div className={`admin-card${comentarios === null ? ' admin-card-ilegible' : ''}`}>
          <div className="admin-card-title">Comentarios sin resolver</div>
          <div
            className="admin-card-value"
            style={{
              // El ámbar es la señal de «hay trabajo pendiente». Sobre un cero
              // de relleno diría lo contrario de lo que pasa: que no hay nada
              // que atender justo cuando no se sabe si lo hay.
              color: comentarios !== null && pendientes > 0 ? 'var(--ambar)' : undefined,
            }}
          >
            {comentarios === null ? '—' : pendientes}
          </div>
          <p className="admin-card-note">
            {comentarios === null
              ? 'No se pudo leer la tabla de comentarios.'
              : `de ${listaComentarios.length} recibidos en total`}
          </p>
        </div>

        <div
          className={`admin-card admin-card-ancha${comentarios === null ? ' admin-card-ilegible' : ''}`}
        >
          <div className="admin-card-title">Dónde se comenta</div>
          {comentarios === null ? (
            <p className="admin-card-note">Sin dato: la tabla de comentarios no respondió.</p>
          ) : (
            <>
              <p className="admin-card-note">
                El módulo con más comentarios suele ser el que más falta le hace crecer.
              </p>
              <BarrasHorizontales titulo="Comentarios por módulo" datos={comentariosPorModulo} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

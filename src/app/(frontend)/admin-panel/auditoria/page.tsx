import Link from 'next/link'
import { CheckCheck, ClipboardList, Download, Flag, PenLine, Send } from 'lucide-react'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { PlegarTodo } from '@/components/admin/PlegarTodo'
import { Cifra } from '@/components/admin/tablero/Cifra'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { SeccionPlegable } from '@/components/ui/SeccionPlegable'
import { Vacio } from '@/components/ui/Vacio'
import {
  BarrasApiladasPorFila,
  BarrasHorizontales,
  BarrasVerticales,
  type Punto,
} from '@/components/admin/Graficos'
import {
  TRAMOS_DE_EDICION,
  armarAuditoria,
  filtrarEntrada,
  porSemana,
  reparto,
  ritmoSospechoso,
  type FiltrosDeAuditoria,
} from '@/lib/auditoria'
import { leerEntradaDeAuditoria, type EntradaDeAuditoria } from '@/lib/auditoriaServidor'
import { iniciales } from '@/lib/iniciales'
import {
  ESTADOS_DE_REVISION,
  RITMO_MAXIMO_DE_LECTURA,
  duracionEnPalabras,
  type EstadoDeRevision,
} from '@/lib/revision'
import { ruta } from '@/lib/rutas'
import { TONO_DE_REVISION, colorDeTono } from '@/lib/tonosDeEstado'
import { clientePayload } from '../datos'
import { MODULOS } from '../modulos'
import { TablaDeAuditoria } from './TablaDeAuditoria'
import '../seguimiento.css'
import './auditoria.css'

export const dynamic = 'force-dynamic'

/**
 * Auditoría de la revisión del contenido (D-142), con el tablero de Penpot
 * (P-007 E5, D-238).
 *
 * Es la pantalla que pidió el dueño para «controlar a los traumatólogos y que
 * revisen de verdad el contenido»: cuánto se editó cada ficha respecto de como
 * la entregó el modelo de lenguaje, cuánto tiempo de revisión activa le dedicó
 * quien la dio por buena y a qué ritmo, y qué validaciones parecen hechas sin
 * leer. Arriba los filtros, que valen para todo lo de abajo; después las cuatro
 * cifras que se miran primero, los gráficos, los revisores y las fichas. Todo
 * sale de la misma cuenta que la planilla que se descarga (`armarAuditoria`),
 * para que lo que se filtre en Excel sea lo mismo que se ve aquí.
 *
 * Solo el administrador: dice cuánto tardó cada revisor en cada ficha.
 */

/**
 * Los estados en los gráficos, en este orden. El color sale del mismo mapa de
 * tonos que pinta las insignias de la tabla de abajo (`tonosDeEstado.ts`):
 * antes eran cinco variables propias y «Publicada» era violeta en la barra y
 * gris en la insignia. El orden se conserva —el rojo de «devuelta» al final,
 * lejos del verde de «lista»— porque la leyenda y las cifras siguen al lado.
 */
const SERIES_DE_ESTADO: { estado: EstadoDeRevision; color: string }[] = (
  ['pendiente', 'en-revision', 'lista', 'publicada', 'devuelta'] as const
).map((estado) => ({ estado, color: colorDeTono(TONO_DE_REVISION[estado]) }))

const ETIQUETA: Record<string, string> = Object.fromEntries(ESTADOS_DE_REVISION.map((e) => [e.value, e.label]))

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const cifra = (valor: number | null, decimales = 1) =>
  valor === null ? '—' : valor.toLocaleString('es-CL', { maximumFractionDigits: decimales })

const plural = (n: number, una: string, varias: string) => `${n} ${n === 1 ? una : varias}`

const primero = (valor: string | string[] | undefined): string | undefined => {
  const v = Array.isArray(valor) ? valor[0] : valor
  return typeof v === 'string' && v.trim() !== '' ? v.trim().slice(0, 200) : undefined
}

export default async function PaginaAuditoria({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirPanel('admin')
  const parametros = await searchParams
  const filtros: FiltrosDeAuditoria = {
    modulo: primero(parametros.modulo),
    lote: primero(parametros.lote),
    revisor: primero(parametros.revisor),
    estado: primero(parametros.estado),
  }
  const hayFiltro = Object.values(filtros).some(Boolean)

  // La misma pantalla con un filtro cambiado y los demás como estaban: la
  // cifra de las listas lleva a ellas sin soltar el módulo o el lote que ya se
  // había elegido, que era justo lo que se estaba mirando.
  const conFiltro = (cambio: Partial<FiltrosDeAuditoria>) => {
    const consulta = new URLSearchParams()
    for (const [clave, valor] of Object.entries({ ...filtros, ...cambio })) {
      if (valor) consulta.set(clave, valor)
    }
    const texto = consulta.toString()
    return `/admin-panel/auditoria${texto ? `?${texto}` : ''}`
  }

  let entrada: EntradaDeAuditoria | null = null
  try {
    entrada = await leerEntradaDeAuditoria(await clientePayload())
  } catch (error) {
    // Como en estadísticas: sin la tabla, no hay cero que enseñar.
    console.error('[panel] no se pudo leer la auditoría:', error)
  }

  if (!entrada) {
    return (
      <div>
        <CabeceraDePagina titulo="Auditoría de la revisión" />
        <div className="admin-aviso admin-aviso-error">
          <strong>La base no respondió a la auditoría.</strong>
          No se pudo leer el registro de revisiones. Lo corriente es un despliegue sin su migración
          (la de las tablas «revisiones» y «sesiones_de_revision»); el detalle queda en el registro
          del servidor.
        </div>
      </div>
    )
  }

  const auditoria = armarAuditoria(filtrarEntrada(entrada, filtros))
  const { totales, contenidos, revisores } = auditoria
  const lotes = [...new Set(entrada.revisiones.map((r) => r.lote).filter((l): l is string => typeof l === 'string' && l !== ''))].sort()
  const cuentasRevisoras = entrada.cuentas
    .filter((c) => c.activo && (c.rol === 'editor' || c.rol === 'admin'))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  // --- las cifras ---------------------------------------------------------
  const validadas = contenidos.filter((c) => c.validadaEn !== null)
  const porRevisar = totales.porEstado.pendiente + totales.porEstado['en-revision'] + totales.porEstado.devuelta
  const parteValidada = totales.fichas > 0 ? Math.round((validadas.length / totales.fichas) * 100) : null

  // --- los gráficos -------------------------------------------------------
  const estadoPorModulo = MODULOS.map((m) => ({
    etiqueta: m.nombre,
    valores: SERIES_DE_ESTADO.map(
      (s) => contenidos.filter((c) => c.coleccion === m.slug && c.estado === s.estado).length,
    ),
  })).filter((fila) => fila.valores.some((v) => v > 0))

  // Por semana desde el lunes y en la hora del servidor, como las demás
  // series del panel. `porSemana` ya lo hacía así antes del tablero; pasarse
  // aquí a `ultimasSemanas` (`series.ts`) daba los mismos lunes y dejaba
  // `porSemana` sin nadie que la usara.
  const semanas = porSemana(validadas.map((c) => c.validadaEn as string), 12)
  const validacionesPorSemana: Punto[] = semanas.map((s) => {
    const [anio, mes, dia] = s.lunes.split('-').map(Number)
    return { etiqueta: `${dia} ${MESES[mes - 1]}`, detalle: `semana del ${dia} ${MESES[mes - 1]} ${anio}`, valor: s.total }
  })
  const validadasEnLasSemanas = semanas.reduce((total, s) => total + s.total, 0)

  const cuantoSeEdita: Punto[] = reparto(validadas.map((c) => c.porcentaje)).map((valor, i) => ({
    etiqueta: TRAMOS_DE_EDICION[i].etiqueta,
    // Corto, porque es el globo de la barra: con «Fichas validadas con más de
    // 50 % editado» medía 250 px y se salía de la tarjeta.
    detalle: `${TRAMOS_DE_EDICION[i].etiqueta} editado`,
    valor,
  }))

  const conTiempo = revisores.filter((r) => r.minutosActivos > 0)
  const minutosPorRevisor: Punto[] = conTiempo
    .map((r) => ({ etiqueta: r.nombre, valor: r.minutosActivos }))
    .sort((a, b) => b.valor - a.valor)
  const ritmoPorRevisor: Punto[] = revisores
    .filter((r) => r.ritmoMedio !== null)
    .map((r) => ({ etiqueta: r.nombre, valor: r.ritmoMedio as number }))
    .sort((a, b) => b.valor - a.valor)
  // Quién valida más rápido de lo que se lee. Penpot remata el aviso con «sus
  // validadas pasan a la cola de segunda mirada», y esa cola no existe: aquí
  // se dice solo lo que la base sostiene, el ritmo, lo editado y cuántas de
  // sus validaciones quedaron señaladas.
  const demasiadoRapidos = revisores.filter((r) => ritmoSospechoso(r.ritmoMedio))

  const filasDeLaTabla = contenidos.slice(0, 500)

  return (
    <div>
      <CabeceraDePagina
        titulo="Auditoría de la revisión"
        subtitulo={
          <>
            {totales.fichas} ficha{totales.fichas === 1 ? '' : 's'} en revisión
            {hayFiltro ? ' con este filtro' : ''} · {revisores.length} revisor
            {revisores.length === 1 ? '' : 'es'} · {duracionEnPalabras(totales.minutosActivos * 60)} de
            revisión activa registrada
          </>
        }
        acciones={
          // Un enlace normal a una ruta, con `ruta()` porque se escribe a
          // mano: el navegador descarga el archivo con su nombre. La planilla
          // lleva todo, sin el filtro de la pantalla: filtrar es lo que se va
          // a hacer en Excel.
          <a className="admin-btn admin-btn-primary" href={ruta('/api/auditoria/planilla')} download>
            <Download aria-hidden size={16} />
            Descargar planilla (Excel)
          </a>
        }
      />

      {entrada.recortada ? (
        <div className="admin-aviso admin-aviso-atencion">
          <strong>Se llegó al techo de lectura.</strong>
          Hay más revisiones o sesiones de las que esta pantalla lee de una vez: lo que se ve es la
          parte más reciente. Filtre por módulo o por lote.
        </div>
      ) : null}

      <form className="admin-filters auditoria-filtros" method="get">
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="auditoria-modulo">
            Módulo
          </label>
          <select id="auditoria-modulo" name="modulo" className="admin-select" defaultValue={filtros.modulo ?? ''}>
            <option value="">Todos</option>
            {MODULOS.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="auditoria-lote">
            Lote
          </label>
          <select id="auditoria-lote" name="lote" className="admin-select" defaultValue={filtros.lote ?? ''}>
            <option value="">Todos</option>
            {lotes.map((lote) => (
              <option key={lote} value={lote}>
                {lote}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="auditoria-revisor">
            Revisor
          </label>
          <select id="auditoria-revisor" name="revisor" className="admin-select" defaultValue={filtros.revisor ?? ''}>
            <option value="">Todos</option>
            {cuentasRevisoras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="auditoria-estado">
            Estado
          </label>
          <select id="auditoria-estado" name="estado" className="admin-select" defaultValue={filtros.estado ?? ''}>
            <option value="">Todos</option>
            {ESTADOS_DE_REVISION.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="admin-btn admin-btn-secondary admin-btn-sm">
          Aplicar
        </button>
        {hayFiltro ? (
          <Link href="/admin-panel/auditoria" className="admin-btn admin-btn-secondary admin-btn-sm">
            Quitar filtros
          </Link>
        ) : null}
      </form>

      {totales.fichas === 0 ? (
        <Vacio
          icono={ClipboardList}
          titulo={hayFiltro ? 'Nada coincide con el filtro.' : 'Todavía no hay fichas en revisión.'}
          accion={
            hayFiltro ? (
              <Link href="/admin-panel/auditoria" className="admin-btn admin-btn-secondary">
                Quitar filtros
              </Link>
            ) : undefined
          }
        >
          {hayFiltro
            ? 'Quite algún filtro para ver más.'
            : 'Entran las que trae la ingesta de los libros y las que un administrador envía desde el editor de una ficha, con «Enviar a revisión…». Desde ese momento se mide cuánto se edita y cuánto tiempo se le dedica.'}
        </Vacio>
      ) : null}

      {/* Cuatro cifras donde antes había seis tarjetas, como en Penpot. Lo que
          decían las otras dos no se pierde: lo publicado sin validar va con
          las validadas, y los minutos por ficha, con la edición media, que es
          la otra mitad de la misma pregunta: ¿se leyó? */}
      <div className="tablero-cifras">
        <Cifra
          titulo="Validadas"
          icono={CheckCheck}
          tono="ok"
          valor={cifra(validadas.length, 0)}
          nota={
            <>
              {parteValidada === null ? 'ninguna ficha en revisión' : `${parteValidada} % de las ${totales.fichas} en revisión`}
              {totales.publicadasSinValidar > 0
                ? ` · ${plural(totales.publicadasSinValidar, 'publicada sin validar', 'publicadas sin validar')}`
                : ''}
            </>
          }
        />
        <Cifra
          href={conFiltro({ estado: 'lista' })}
          titulo="Listas para publicar"
          icono={Send}
          tono="atencion"
          valor={cifra(totales.porEstado.lista, 0)}
          claseValor={totales.porEstado.lista > 0 ? 'admin-card-value-atencion' : undefined}
          nota={
            <>
              {porRevisar} por revisar
              {totales.porEstado.devuelta > 0
                ? `, ${plural(totales.porEstado.devuelta, 'devuelta', 'devueltas')} al revisor`
                : ''}{' '}
              · {totales.porEstado.publicada} ya publicada{totales.porEstado.publicada === 1 ? '' : 's'}
            </>
          }
        />
        <Cifra
          titulo="Edición media"
          icono={PenLine}
          tono="info"
          valor={totales.porcentajeMedioDeLasValidadas === null ? '—' : `${cifra(totales.porcentajeMedioDeLasValidadas)} %`}
          nota={
            <>
              del texto original, en lo validado
              {totales.minutosMediosPorValidada === null
                ? ''
                : ` · ${cifra(totales.minutosMediosPorValidada)} min de revisión por ficha`}
            </>
          }
        />
        <Cifra
          titulo="Señaladas"
          icono={Flag}
          tono="atencion"
          valor={cifra(totales.senaladas, 0)}
          claseValor={totales.senaladas > 0 ? 'auditoria-cifra-alerta' : undefined}
          // Penpot dice «por posible error clínico», y no es lo que se mide:
          // la señal sale del tiempo y de las secciones abiertas
          // (`evaluarValidacion`), nunca de lo que dice la ficha.
          nota="validaciones demasiado rápidas o sin abrir alguna sección"
        />
      </div>

      {/* Tres bloques largos, plegables y con memoria (pedido del dueño): quien
          viene a publicar lo validado va directo a «Las fichas» sin bajar por
          encima de los gráficos y de la tabla de revisores. */}
      <PlegarTodo />

      {/* Los dos bloques de gráficos se pintan como los titulares de sección de
          Penpot, con las tarjetas blancas debajo (`auditoria.css`). «Las
          fichas» sigue siendo una caja, como las tablas de Actividad y
          Registro: es una tabla larga y no un tablero. */}
      <div className="auditoria-tablero">
        <SeccionPlegable
          clave="auditoria.como-va"
          titulo="Cómo va la revisión"
          resumen={plural(estadoPorModulo.length, 'módulo', 'módulos')}
        >
          {/* Penpot pone «Validaciones por semana» al lado del estado y no
              dibuja «Cuánto se edita». Aquí va al revés: el reparto de lo
              editado es una de las dos pistas de que se valida sin leer y no
              se quita, cabe en un tercio, y las doce semanas caben mejor a
              lo ancho que apretadas en media fila. */}
          <div className="tablero-fila">
            <TarjetaDeGrafico titulo="Estado de la revisión por módulo" bajada="Las fichas en revisión de cada módulo, por estado.">
              <BarrasApiladasPorFila
                titulo="Estado de la revisión por módulo"
                filas={estadoPorModulo}
                series={SERIES_DE_ESTADO.map((s) => ({ etiqueta: ETIQUETA[s.estado], color: s.color }))}
              />
            </TarjetaDeGrafico>
            <TarjetaDeGrafico
              titulo="Cuánto se edita"
              className="auditoria-columnas"
              bajada="Las validadas, según cuánto cambió su texto. Muchas en «0 %» con poco tiempo de revisión es la señal de que se valida sin leer."
            >
              <BarrasVerticales titulo="Fichas validadas por porcentaje editado" datos={cuantoSeEdita} />
            </TarjetaDeGrafico>
          </div>
          {/* Penpot lo dibuja como una línea. Con las pocas validaciones de
              cada semana, el eje de `Lineas` repetía «0, 0, 1, 1, 1» (marcas
              de 0,25 escritas sin decimales); en barras cada semana lleva su
              número debajo y no hace falta eje. */}
          <TarjetaDeGrafico
            titulo="Validaciones por semana"
            className="auditoria-columnas"
            bajada={`Fichas dadas por listas, las últimas doce semanas: ${plural(validadasEnLasSemanas, 'validación', 'validaciones')}.`}
          >
            <BarrasVerticales titulo="Validaciones por semana" datos={validacionesPorSemana} altura={160} />
          </TarjetaDeGrafico>
        </SeccionPlegable>

        <SeccionPlegable
          clave="auditoria.revisores"
          titulo="Quién revisa y cómo"
          resumen={plural(revisores.length, 'revisor', 'revisores')}
        >
          <div className="tablero-fila tablero-fila-mitades">
            {/* Penpot dice «últimos 30 días»: los minutos son todos los
                registrados, porque las sesiones de revisión se suman desde
                que la ficha entra y no se guardan por día. */}
            <TarjetaDeGrafico
              titulo="Minutos de revisión activa"
              bajada="Por revisor, todo lo registrado. Sin tocar nada durante 90 s, deja de contar."
            >
              <BarrasHorizontales
                titulo="Minutos de revisión activa por revisor"
                datos={minutosPorRevisor}
                formato={(v) => `${cifra(v, 0)} min`}
              />
            </TarjetaDeGrafico>
            <TarjetaDeGrafico
              titulo="Palabras por minuto al validar"
              bajada={`De media, por minuto de revisión activa. Sobre ${RITMO_MAXIMO_DE_LECTURA} es difícil haber leído con atención.`}
            >
              <BarrasHorizontales
                titulo="Palabras por minuto al validar, por revisor"
                datos={ritmoPorRevisor}
                destacar={(p) => ritmoSospechoso(p.valor)}
                formato={(v) => cifra(v, 0)}
                umbral={{ valor: RITMO_MAXIMO_DE_LECTURA, etiqueta: String(RITMO_MAXIMO_DE_LECTURA) }}
              />
            </TarjetaDeGrafico>
          </div>

          {revisores.length > 0 ? (
            <TarjetaDeGrafico
              titulo="Detalle por revisor"
              bajada="Pulse un nombre para ver toda la pantalla solo con lo suyo."
              className="auditoria-detalle"
            >
              <div className="admin-table-container auditoria-revisores">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Revisor</th>
                      <th>Asignadas</th>
                      <th>Sin terminar</th>
                      <th>Validadas</th>
                      <th>Señaladas</th>
                      <th>Devueltas</th>
                      <th>Min. activos</th>
                      <th>Min. por ficha validada</th>
                      <th>Palabras/min</th>
                      <th>% editado</th>
                      <th>Última actividad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revisores.map((r) => (
                      <tr key={r.id}>
                        <th scope="row" className="admin-table-user-name">
                          <div className="auditoria-revisor">
                            <span className="auditoria-revisor-circulo" aria-hidden>
                              {iniciales(r.nombre)}
                            </span>
                            <div>
                              <Link href={`/admin-panel/auditoria?revisor=${encodeURIComponent(r.id)}`}>{r.nombre}</Link>
                              <div className="revision-tenue">{r.rol === 'admin' ? 'administrador' : r.rol}</div>
                            </div>
                          </div>
                        </th>
                        <td className="auditoria-numero">{r.asignadas}</td>
                        <td className="auditoria-numero">{r.pendientes}</td>
                        <td className="auditoria-numero">{r.validadas}</td>
                        <td className={`auditoria-numero${r.senaladas > 0 ? ' auditoria-alerta' : ''}`}>
                          {r.senaladas > 0 ? (
                            <span className="seguimiento-senal">
                              <Flag aria-label="señaladas" size={14} />
                              {r.senaladas}
                            </span>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="auditoria-numero">{r.devueltas}</td>
                        <td className="auditoria-numero">{cifra(r.minutosActivos)}</td>
                        <td className="auditoria-numero">{cifra(r.minutosPorValidada)}</td>
                        <td className={`auditoria-numero${ritmoSospechoso(r.ritmoMedio) ? ' auditoria-alerta' : ''}`}>
                          {ritmoSospechoso(r.ritmoMedio) ? (
                            <span className="seguimiento-senal">
                              <Flag aria-label="ritmo sospechoso" size={14} />
                              {cifra(r.ritmoMedio, 0)}
                            </span>
                          ) : (
                            cifra(r.ritmoMedio, 0)
                          )}
                        </td>
                        <td className="auditoria-numero">
                          {r.porcentajeMedio === null ? (
                            '—'
                          ) : (
                            // La barra es de adorno para comparar a ojo: la
                            // cifra va al lado y es lo que lee el lector de
                            // pantalla.
                            <span className="auditoria-editado">
                              <span className="auditoria-editado-barra" aria-hidden>
                                <span
                                  className="auditoria-editado-relleno"
                                  style={{ width: `${Math.min(100, Math.max(0, r.porcentajeMedio))}%` }}
                                />
                              </span>
                              {cifra(r.porcentajeMedio)} %
                            </span>
                          )}
                        </td>
                        <td className="u-nowrap">
                          {/* En 24 horas: «11:29 p. m.» ocupaba la columna
                              que le faltaba a la tabla para caber entera. */}
                          {r.ultimaActividad
                            ? new Date(r.ultimaActividad).toLocaleString('es-CL', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                                hourCycle: 'h23',
                                timeZone: 'America/Santiago',
                              })
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {demasiadoRapidos.map((r) => (
                <div key={r.id} className="admin-aviso admin-aviso-error auditoria-aviso-ritmo" role="note">
                  <Flag aria-hidden size={16} />
                  <span>
                    <Link href={`/admin-panel/auditoria?revisor=${encodeURIComponent(r.id)}`}>{r.nombre}</Link> valida a{' '}
                    {cifra(r.ritmoMedio, 0)} palabras por minuto de media
                    {r.porcentajeMedio === null ? '' : ` y edita el ${cifra(r.porcentajeMedio)} % del texto`}: por encima de{' '}
                    {RITMO_MAXIMO_DE_LECTURA} no es una lectura atenta.
                    {r.senaladas === 0
                      ? ''
                      : r.validadas === 1
                        ? ' Su única validación quedó señalada.'
                        : ` ${r.senaladas} de sus ${r.validadas} validaciones quedaron señaladas.`}
                  </span>
                </div>
              ))}
            </TarjetaDeGrafico>
          ) : null}
        </SeccionPlegable>
      </div>

      <SeccionPlegable
        clave="auditoria.fichas"
        titulo="Las fichas"
        resumen={plural(contenidos.length, 'fila', 'filas')}
      >
        {contenidos.length > filasDeLaTabla.length ? (
          <p className="seguimiento-nota">
            Se enseñan {filasDeLaTabla.length} de {contenidos.length}. Filtre arriba, o descargue la
            planilla para verlas todas.
          </p>
        ) : null}
        <TablaDeAuditoria
          filas={filasDeLaTabla}
          revisores={cuentasRevisoras.map((c) => ({ id: c.id, nombre: c.nombre }))}
        />
      </SeccionPlegable>
    </div>
  )
}

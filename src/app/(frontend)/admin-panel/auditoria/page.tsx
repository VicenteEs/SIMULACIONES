import Link from 'next/link'
import { ClipboardList, Download, Flag } from 'lucide-react'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { PlegarTodo } from '@/components/admin/PlegarTodo'
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

export const dynamic = 'force-dynamic'

/**
 * Auditoría de la revisión del contenido (D-142).
 *
 * Es la pantalla que pidió el dueño para «controlar a los traumatólogos y que
 * revisen de verdad el contenido»: cuánto se editó cada ficha respecto de como
 * la entregó el modelo de lenguaje, cuánto tiempo de revisión activa le dedicó
 * quien la dio por buena y a qué ritmo, y qué validaciones parecen hechas sin
 * leer. Arriba los filtros, que valen para todo lo de abajo; después los
 * números que se miran primero, los gráficos, los revisores y las fichas. Todo
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

  // --- los gráficos -------------------------------------------------------
  const estadoPorModulo = MODULOS.map((m) => ({
    etiqueta: m.nombre,
    valores: SERIES_DE_ESTADO.map(
      (s) => contenidos.filter((c) => c.coleccion === m.slug && c.estado === s.estado).length,
    ),
  })).filter((fila) => fila.valores.some((v) => v > 0))

  const validadas = contenidos.filter((c) => c.validadaEn !== null)
  const semanas = porSemana(validadas.map((c) => c.validadaEn as string), 12)
  const validacionesPorSemana: Punto[] = semanas.map((s) => {
    const [anio, mes, dia] = s.lunes.split('-').map(Number)
    return {
      etiqueta: `${dia} ${MESES[mes - 1]}`,
      detalle: `Semana del ${dia} de ${MESES[mes - 1]} de ${anio}`,
      valor: s.total,
    }
  })

  const cuantoSeEdita: Punto[] = reparto(validadas.map((c) => c.porcentaje)).map((valor, i) => ({
    etiqueta: TRAMOS_DE_EDICION[i].etiqueta,
    detalle: `Fichas validadas con ${TRAMOS_DE_EDICION[i].etiqueta} editado`,
    valor,
  }))

  const conTiempo = revisores.filter((r) => r.minutosActivos > 0)
  const minutosPorRevisor: Punto[] = conTiempo.map((r) => ({ etiqueta: r.nombre, valor: r.minutosActivos }))
  const ritmoPorRevisor: Punto[] = revisores
    .filter((r) => r.ritmoMedio !== null)
    .map((r) => ({ etiqueta: r.nombre, valor: r.ritmoMedio as number }))
    .sort((a, b) => b.valor - a.valor)

  const porRevisar = totales.porEstado.pendiente + totales.porEstado['en-revision'] + totales.porEstado.devuelta
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

      <div className="auditoria-indicadores">
        <div className="admin-card">
          <div className="admin-card-title">Por revisar</div>
          <div className="admin-card-value">{porRevisar}</div>
          <p className="admin-card-note">
            {totales.porEstado.devuelta > 0
              ? `${totales.porEstado.devuelta} devuelta${totales.porEstado.devuelta === 1 ? '' : 's'} al revisor`
              : 'pendientes o en revisión'}
          </p>
        </div>
        <div className="admin-card">
          <div className="admin-card-title">Listas para publicar</div>
          <div className="admin-card-value">{totales.porEstado.lista}</div>
          <p className="admin-card-note">validadas y a la espera de publicarse</p>
        </div>
        <div className="admin-card">
          <div className="admin-card-title">Publicadas tras revisión</div>
          <div className="admin-card-value">{totales.porEstado.publicada}</div>
          <p className="admin-card-note">
            {totales.publicadasSinValidar > 0
              ? `${totales.publicadasSinValidar} sin validar`
              : 'todas validadas antes'}
          </p>
        </div>
        <div className="admin-card">
          <div className="admin-card-title">Edición media</div>
          <div className="admin-card-value">
            {totales.porcentajeMedioDeLasValidadas === null ? '—' : `${cifra(totales.porcentajeMedioDeLasValidadas)} %`}
          </div>
          <p className="admin-card-note">del texto original, en lo validado</p>
        </div>
        <div className="admin-card">
          <div className="admin-card-title">Revisión por ficha</div>
          <div className="admin-card-value">
            {totales.minutosMediosPorValidada === null ? '—' : `${cifra(totales.minutosMediosPorValidada)} min`}
          </div>
          <p className="admin-card-note">activos, de quien la validó, de media</p>
        </div>
        <div className={`admin-card${totales.senaladas > 0 ? ' auditoria-card-alerta' : ''}`}>
          <div className="admin-card-title">Validaciones señaladas</div>
          <div className="admin-card-value seguimiento-senal">
            {totales.senaladas > 0 ? <Flag aria-label="señaladas" size={22} /> : null}
            {totales.senaladas}
          </div>
          <p className="admin-card-note">demasiado rápidas o sin abrir alguna sección</p>
        </div>
      </div>

      {/* Tres bloques largos, plegables y con memoria (pedido del dueño): quien
          viene a publicar lo validado va directo a «Las fichas» sin bajar por
          encima de seis gráficos y de la tabla de revisores. */}
      <PlegarTodo />

      <SeccionPlegable
        clave="auditoria.como-va"
        titulo="Cómo va la revisión"
        resumen={`${estadoPorModulo.length} módulo${estadoPorModulo.length === 1 ? '' : 's'}`}
      >
        <div className="admin-grid">
          <div className="admin-card admin-card-ancha">
            <div className="admin-card-title">Estado por módulo</div>
            <p className="admin-card-note">Cada barra, las fichas en revisión de un módulo, por estado.</p>
            <BarrasApiladasPorFila
              titulo="Estado de la revisión por módulo"
              filas={estadoPorModulo}
              series={SERIES_DE_ESTADO.map((s) => ({ etiqueta: ETIQUETA[s.estado], color: s.color }))}
            />
          </div>
          <div className="admin-card">
            <div className="admin-card-title">Validaciones por semana</div>
            <p className="admin-card-note">Fichas dadas por listas, las últimas doce semanas.</p>
            <BarrasVerticales titulo="Validaciones por semana" datos={validacionesPorSemana} />
          </div>
          <div className="admin-card">
            <div className="admin-card-title">Cuánto se edita</div>
            <p className="admin-card-note">
              Fichas validadas según cuánto cambió su texto. Muchas en «0 %» con poco tiempo de revisión
              es la señal de que se valida sin leer.
            </p>
            <BarrasVerticales titulo="Fichas validadas por porcentaje editado" datos={cuantoSeEdita} />
          </div>
        </div>
      </SeccionPlegable>

      <SeccionPlegable
        clave="auditoria.revisores"
        titulo="Quién revisa y cómo"
        resumen={`${revisores.length} revisor${revisores.length === 1 ? '' : 'es'}`}
      >
        <div className="admin-grid">
          <div className="admin-card">
            <div className="admin-card-title">Minutos de revisión activa</div>
            <p className="admin-card-note">Con alguien delante: sin tocar nada durante 90 s, deja de contar.</p>
            <BarrasHorizontales
              titulo="Minutos de revisión activa por revisor"
              datos={minutosPorRevisor}
              formato={(v) => cifra(v)}
            />
          </div>
          <div className="admin-card">
            <div className="admin-card-title">Ritmo al validar</div>
            <p className="admin-card-note">
              Palabras por minuto de revisión activa, de media. Por encima de {RITMO_MAXIMO_DE_LECTURA}{' '}
              (<Flag aria-label="bandera" size={12} />) no es una lectura atenta.
            </p>
            <BarrasHorizontales
              titulo="Palabras por minuto al validar, por revisor"
              datos={ritmoPorRevisor}
              destacar={(p) => ritmoSospechoso(p.valor)}
              formato={(v) => cifra(v, 0)}
            />
          </div>
        </div>

        {revisores.length > 0 ? (
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
                      <Link href={`/admin-panel/auditoria?revisor=${encodeURIComponent(r.id)}`}>{r.nombre}</Link>
                      <div className="revision-tenue">{r.rol === 'admin' ? 'administrador' : r.rol}</div>
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
                    <td className="auditoria-numero">{r.porcentajeMedio === null ? '—' : `${cifra(r.porcentajeMedio)} %`}</td>
                    <td className="u-nowrap">
                      {r.ultimaActividad
                        ? new Date(r.ultimaActividad).toLocaleString('es-CL', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SeccionPlegable>

      <SeccionPlegable
        clave="auditoria.fichas"
        titulo="Las fichas"
        resumen={`${contenidos.length} fila${contenidos.length === 1 ? '' : 's'}`}
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

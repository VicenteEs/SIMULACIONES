'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DatabaseZap, SearchX } from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { Dona } from '@/components/admin/Graficos'
import { TarjetaDeGrafico } from '@/components/admin/tablero/TarjetaDeGrafico'
import { PanelDePestana, Pestanas } from '@/components/ui/Pestanas'
import { useAvisos } from '@/components/ui/Avisos'
import { Vacio } from '@/components/ui/Vacio'
import {
  ETIQUETA_DEL_CAMPO,
  ETIQUETA_DEL_ESTADO,
  ETIQUETA_DEL_LADO,
  casaConElFiltro,
  contarEstructuras,
  contarPorRegion,
  esPendiente,
  type Conteo,
  type EstadoDeEstructura,
} from '@/lib/estructuras'
import type { FilaDelListado, Listado } from '@/lib/listadoDeEstructuras'
import { claseDeInsignia, TONO_DE_ESTRUCTURA } from '@/lib/tonosDeEstado'
import { cargarPiezasDelAtlas } from '@/app/(frontend)/acciones/estructuras'
import { PlanillaPorRegion } from './PlanillaPorRegion'
import { VentanaDeEstructura } from './VentanaDeEstructura'

/** Cuántas filas se pintan de una vez: son 2.231 y no hace falta pintarlas todas para leer. */
const FILAS_POR_TANDA = 100

type Pestana = 'pendientes' | 'listado'

const formatoDeEntero = (n: number) => n.toLocaleString('es-CL')
const formatoDePorcentaje = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })} %`

/** Las opciones del filtro de estado, según la pestaña: en «Pendientes» no tiene sentido pedir las completas. */
const ESTADOS_POR_PESTANA: Record<Pestana, { valor: string; etiqueta: string }[]> = {
  pendientes: [
    { valor: 'todos', etiqueta: 'Todas las pendientes' },
    { valor: 'a-medias', etiqueta: 'A medias' },
    { valor: 'sin-empezar', etiqueta: 'Sin empezar' },
  ],
  listado: [
    { valor: 'todos', etiqueta: 'Todas (sin las ocultas)' },
    { valor: 'completa', etiqueta: 'Completas' },
    { valor: 'a-medias', etiqueta: 'A medias' },
    { valor: 'sin-empezar', etiqueta: 'Sin empezar' },
    { valor: 'oculta', etiqueta: 'Ocultas («No mostrar»)' },
    { valor: 'sin-pieza', etiqueta: 'Sin pieza en el atlas' },
  ],
}

/** ¿Entra esta fila en la pestaña y en el filtro de estado? */
function pasaElEstado(estado: EstadoDeEstructura, pestana: Pestana, filtro: string): boolean {
  if (pestana === 'pendientes') {
    if (!esPendiente(estado)) return false
    return filtro === 'todos' || filtro === estado
  }
  if (filtro === 'todos') return estado !== 'oculta' && estado !== 'sin-pieza'
  return filtro === estado
}

export function PantallaDeEstructuras({ listado, puedeCargar }: { listado: Listado; puedeCargar: boolean }) {
  const router = useRouter()
  const avisar = useAvisos()
  const [cargando, iniciarCarga] = useTransition()

  const [pestana, setPestana] = useState<Pestana>('pendientes')
  const [busqueda, setBusqueda] = useState('')
  const [region, setRegion] = useState('todas')
  const [sistema, setSistema] = useState('todos')
  const [estado, setEstado] = useState('todos')
  const [tanda, setTanda] = useState(1)
  const [abierta, setAbierta] = useState<FilaDelListado | null>(null)

  const nombreDeRegion = useMemo(() => new Map(listado.regiones.map((r) => [r.id, r.nombre])), [listado.regiones])
  const nombreDeSistema = useMemo(() => new Map(listado.sistemas.map((s) => [s.id, s.nombre])), [listado.sistemas])

  const conteo = useMemo(() => contarEstructuras(listado.filas), [listado.filas])
  const porRegion = useMemo(() => contarPorRegion(listado.filas), [listado.filas])
  const pendientesDelListado = conteo.pendientes
  const delListado = conteo.total - conteo.ocultas

  /** Cambiar un filtro lleva la lista de vuelta al principio. */
  const cambiar = (poner: () => void) => {
    poner()
    setTanda(1)
  }

  const visibles = useMemo(
    () =>
      listado.filas.filter((f) => {
        if (!pasaElEstado(f.estado, pestana, estado)) return false
        if (region !== 'todas' && f.region !== region) return false
        if (sistema !== 'todos' && f.sistema !== sistema) return false
        return casaConElFiltro([f.nombre, f.original], busqueda)
      }),
    [listado.filas, pestana, estado, region, sistema, busqueda],
  )

  const cambiarDePestana = (id: string) => {
    setPestana(id as Pestana)
    // Un estado que la otra pestaña no ofrece se vuelve a «todos»: de lo contrario la lista queda vacía sin explicación.
    setEstado('todos')
    setTanda(1)
  }

  const cargarLasPiezas = () =>
    iniciarCarga(async () => {
      const respuesta = await cargarPiezasDelAtlas()
      if (respuesta.exito && respuesta.datos) {
        avisar('ok', `Listo: ${respuesta.datos.resumen}.`)
        router.refresh()
      } else {
        avisar('error', respuesta.mensaje ?? 'No se pudieron cargar las piezas del atlas.')
      }
    })

  const regionesConPiezas = listado.regiones.filter((r) => porRegion.has(r.id))
  const hayFiltros = busqueda.trim() !== '' || region !== 'todas' || sistema !== 'todos' || estado !== 'todos'

  return (
    <div className="estructuras">
      <CabeceraDePagina
        titulo="Estructuras anatómicas"
        subtitulo="Una ficha por pieza del atlas, con los nombres del taller. Lo que se escribe aquí lo ven el taller, el simulador y el modelo que se exporta."
        acciones={
          listado.sinSembrar > 0 && puedeCargar ? (
            <button type="button" className="admin-btn admin-btn-primary" disabled={cargando} onClick={cargarLasPiezas}>
              <DatabaseZap aria-hidden size={16} />
              {cargando ? 'Cargando…' : `Cargar las piezas del atlas (${formatoDeEntero(listado.sinSembrar)})`}
            </button>
          ) : null
        }
      />

      {listado.sinSembrar > 0 ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          <strong>
            Faltan {formatoDeEntero(listado.sinSembrar)} piezas del atlas en el listado.
          </strong>{' '}
          {puedeCargar
            ? 'Pulse «Cargar las piezas del atlas»: crea la ficha vacía de cada una y no toca nada de lo ya escrito. Mientras tanto, se pueden llenar igual: la ficha se crea al guardar.'
            : 'Pídale a un administrador que las cargue. Mientras tanto, se pueden llenar igual: la ficha se crea al guardar.'}
        </div>
      ) : null}

      {/* El avance arriba, como en Penpot (P-007 E5, D-238): el total en una
          dona y cada región en su barra. Antes eran una barra suelta con tres
          tarjetas y una tabla «Por región» plegada, que había que abrir para
          ver lo único que se viene a mirar a esta pantalla: cuánto falta y dónde. */}
      <div className="estructuras-tablero">
        <AvanceTotal conteo={conteo} />
        <AvancePorRegion
          regiones={regionesConPiezas.map((r) => ({ id: r.id, nombre: r.nombre, conteo: porRegion.get(r.id) as Conteo }))}
          alElegir={(id) => {
            cambiar(() => setRegion(id))
            setPestana('pendientes')
            setEstado('todos')
            // La lista queda debajo de las dos tarjetas: sin bajar hasta ella,
            // pulsar una región no parecía hacer nada.
            document.getElementById('estructuras-lista')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        />
      </div>

      <div id="estructuras-lista" className="estructuras-ancla" />
      <Pestanas
        base="estructuras"
        etiqueta="Estructuras"
        activa={pestana}
        alCambiar={cambiarDePestana}
        pestanas={[
          { id: 'pendientes', etiqueta: `Pendientes (${formatoDeEntero(pendientesDelListado)})` },
          { id: 'listado', etiqueta: `Listado (${formatoDeEntero(delListado)})` },
        ]}
      />

      <PanelDePestana base="estructuras" id="pendientes" activa={pestana}>
        <PlanillaPorRegion
          regiones={regionesConPiezas.map((r) => {
            const c = porRegion.get(r.id) as Conteo
            return { id: r.id, nombre: r.nombre, pendientes: c.pendientes, total: c.porLlenar }
          })}
          puedeRespaldar={puedeCargar}
          alAplicar={() => router.refresh()}
        />
      </PanelDePestana>

      <div className="admin-filters">
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="buscar-estructura">
            Buscar
          </label>
          <input
            id="buscar-estructura"
            className="admin-input"
            placeholder="Nombre en español o en inglés"
            value={busqueda}
            onChange={(e) => cambiar(() => setBusqueda(e.target.value))}
          />
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="filtro-region-estructura">
            Región
          </label>
          <select
            id="filtro-region-estructura"
            className="admin-select"
            value={region}
            onChange={(e) => cambiar(() => setRegion(e.target.value))}
          >
            <option value="todas">Todas las regiones</option>
            {regionesConPiezas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="filtro-sistema-estructura">
            Sistema
          </label>
          <select
            id="filtro-sistema-estructura"
            className="admin-select"
            value={sistema}
            onChange={(e) => cambiar(() => setSistema(e.target.value))}
          >
            <option value="todos">Todos los sistemas</option>
            {listado.sistemas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="filtro-estado-estructura">
            Estado
          </label>
          <select
            id="filtro-estado-estructura"
            className="admin-select"
            value={estado}
            onChange={(e) => cambiar(() => setEstado(e.target.value))}
          >
            {ESTADOS_POR_PESTANA[pestana].map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </div>
        <span className="admin-filter-count" aria-live="polite">
          {formatoDeEntero(visibles.length)} piezas
        </span>
      </div>

      {visibles.length === 0 ? (
        <Vacio
          icono={SearchX}
          titulo={
            pestana === 'pendientes' && !hayFiltros
              ? 'No queda ninguna pieza pendiente.'
              : 'Ninguna pieza coincide con el filtro.'
          }
          accion={
            hayFiltros ? (
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => {
                  setBusqueda('')
                  setRegion('todas')
                  setSistema('todos')
                  setEstado('todos')
                  setTanda(1)
                }}
              >
                Quitar el filtro
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="admin-table-container">
            <table className="admin-table tabla-apilable estructuras-tabla">
              <thead>
                <tr>
                  <th>Estructura</th>
                  <th>Región</th>
                  <th>Sistema</th>
                  <th>Estado</th>
                  <th>Falta</th>
                </tr>
              </thead>
              <tbody>
                {visibles.slice(0, tanda * FILAS_POR_TANDA).map((f) => (
                  <FilaDeLaTabla
                    key={f.atlasId}
                    fila={f}
                    region={nombreDeRegion.get(f.region) ?? f.region}
                    sistema={nombreDeSistema.get(f.sistema) ?? f.sistema}
                    alAbrir={() => setAbierta(f)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {visibles.length > tanda * FILAS_POR_TANDA ? (
            <div className="estructuras-mas">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setTanda((t) => t + 1)}>
                Ver {formatoDeEntero(Math.min(FILAS_POR_TANDA, visibles.length - tanda * FILAS_POR_TANDA))} más
              </button>
              <span className="estructuras-mas-cuenta">
                {formatoDeEntero(tanda * FILAS_POR_TANDA)} de {formatoDeEntero(visibles.length)}
              </span>
            </div>
          ) : null}
        </>
      )}

      {abierta ? (
        <VentanaDeEstructura
          atlasId={abierta.atlasId}
          region={nombreDeRegion.get(abierta.region) ?? abierta.region}
          sistema={nombreDeSistema.get(abierta.sistema) ?? abierta.sistema}
          alCerrar={() => setAbierta(null)}
          alGuardar={() => router.refresh()}
        />
      ) : null}
    </div>
  )
}

/**
 * Los tres estados que cuentan para el avance, con el mismo color en la dona y
 * en las barras de cada región: verde lo terminado, ámbar lo empezado y el gris
 * de la pista lo que nadie ha tocado. Las ocultas y las que no tienen pieza no
 * entran: no son trabajo pendiente, y el 100 % es `porLlenar` (`estructuras.ts`).
 */
const COLOR_DE_ESTADO = { completas: 'var(--verde)', aMedias: 'var(--ambar)', sinEmpezar: 'var(--linea)' }

/**
 * «Avance total» de Penpot: cuántas fichas están completas sobre las que hay que
 * llenar. Penpot reparte en dos —completas y pendientes— y aquí van tres, porque
 * el listado ya distingue lo empezado de lo que no, y es lo que dice por dónde
 * seguir. El porcentaje va en la bajada y no en el centro de la dona, como lo
 * dibuja Penpot: `Dona` pone ahí el total y no tiene cómo poner otra cosa.
 */
function AvanceTotal({ conteo }: { conteo: Conteo }) {
  return (
    <TarjetaDeGrafico
      titulo="Avance total"
      bajada={
        <>
          <strong className="estructuras-avance-cifra">{formatoDePorcentaje(conteo.porcentajeCompletas)}</strong> con la
          ficha completa · {formatoDeEntero(conteo.porLlenar)} estructuras
        </>
      }
    >
      <Dona
        titulo="Estructuras según el estado de su ficha"
        rotuloDelTotal="estructuras"
        partes={[
          { etiqueta: 'Completas', valor: conteo.completas, color: COLOR_DE_ESTADO.completas },
          { etiqueta: 'A medias', valor: conteo.aMedias, color: COLOR_DE_ESTADO.aMedias },
          { etiqueta: 'Sin empezar', valor: conteo.sinEmpezar, color: COLOR_DE_ESTADO.sinEmpezar },
        ]}
      />
      {/* Lo que no cuenta se dice, para que el total de la dona no parezca
          haber perdido piezas: eran dos tarjetas de cifra propias. */}
      {conteo.ocultas > 0 || conteo.sinPieza > 0 ? (
        <p className="estructuras-avance-nota">
          {conteo.ocultas > 0 ? `${formatoDeEntero(conteo.ocultas)} ocultas («No mostrar») no cuentan` : ''}
          {conteo.ocultas > 0 && conteo.sinPieza > 0 ? ' · ' : ''}
          {conteo.sinPieza > 0
            ? `${formatoDeEntero(conteo.sinPieza)} sin pieza en el atlas se conservan, esperando casarlas`
            : ''}
          .
        </p>
      ) : null}
    </TarjetaDeGrafico>
  )
}

/**
 * «Por región» de Penpot: las fichas completas sobre el total de cada región,
 * con lo empezado a continuación.
 *
 * No es `BarrasApiladasPorFila`, y a propósito: aquella mide cada fila contra la
 * más larga —una región con el doble de piezas sale el doble de larga—, y lo que
 * aquí se compara es la proporción de cada una, con todas sobre el mismo 100 %.
 * Una región con cuarenta piezas y todas hechas tiene que verse terminada.
 *
 * El nombre es un botón, como lo era en la tabla que esto reemplaza: lleva a las
 * pendientes de esa región.
 */
function AvancePorRegion({
  regiones,
  alElegir,
}: {
  regiones: { id: string; nombre: string; conteo: Conteo }[]
  alElegir: (id: string) => void
}) {
  const parte = (n: number, total: number) => (total > 0 ? `${(n / total) * 100}%` : '0%')
  return (
    <TarjetaDeGrafico titulo="Por región" bajada="Fichas completas sobre el total de cada región; pulse una para ver sus pendientes">
      {regiones.length === 0 ? (
        <p className="grafico-vacio">Todavía no hay piezas en ninguna región.</p>
      ) : (
        <>
          <ul className="estructuras-avance-regiones">
            {regiones.map(({ id, nombre, conteo: c }) => {
              const detalle = `${formatoDeEntero(c.completas)} de ${formatoDeEntero(c.porLlenar)} completas · ${formatoDeEntero(
                c.aMedias,
              )} a medias · ${formatoDeEntero(c.sinEmpezar)} sin empezar`
              return (
                <li key={id} className="estructuras-avance-region">
                  <button
                    type="button"
                    className="estructuras-enlace estructuras-avance-nombre"
                    onClick={() => alElegir(id)}
                    aria-label={`${nombre}: ${formatoDePorcentaje(c.porcentajeCompletas)} completas, ${detalle}. Ver sus pendientes`}
                  >
                    {nombre}
                  </button>
                  <span className="estructuras-avance-barra" title={detalle} aria-hidden>
                    <span style={{ width: parte(c.completas, c.porLlenar), background: COLOR_DE_ESTADO.completas }} />
                    <span style={{ width: parte(c.aMedias, c.porLlenar), background: COLOR_DE_ESTADO.aMedias }} />
                  </span>
                  <span className="estructuras-avance-porcentaje" aria-hidden>
                    {formatoDePorcentaje(c.porcentajeCompletas)}
                  </span>
                </li>
              )
            })}
          </ul>
          <ul className="grafico-leyenda grafico-leyenda-en-fila" aria-hidden>
            <li>
              <span className="grafico-punto" style={{ background: COLOR_DE_ESTADO.completas }} />
              Completas
            </li>
            <li>
              <span className="grafico-punto" style={{ background: COLOR_DE_ESTADO.aMedias }} />
              A medias
            </li>
            <li>
              <span className="grafico-punto" style={{ background: COLOR_DE_ESTADO.sinEmpezar }} />
              Sin empezar
            </li>
          </ul>
        </>
      )}
    </TarjetaDeGrafico>
  )
}

function FilaDeLaTabla({
  fila,
  region,
  sistema,
  alAbrir,
}: {
  fila: FilaDelListado
  region: string
  sistema: string
  alAbrir: () => void
}) {
  return (
    <tr>
      <th scope="row">
        <button type="button" className="estructuras-nombre" onClick={alAbrir}>
          {fila.nombre}
        </button>
        <div className="admin-table-user-email">
          {fila.original}
          {fila.lado ? ` · ${ETIQUETA_DEL_LADO[fila.lado]}` : ''}
        </div>
      </th>
      <td data-etiqueta="Región">{region}</td>
      <td data-etiqueta="Sistema">{sistema}</td>
      <td data-etiqueta="Estado">
        <span className={claseDeInsignia(TONO_DE_ESTRUCTURA[fila.estado])}>{ETIQUETA_DEL_ESTADO[fila.estado]}</span>
      </td>
      <td data-etiqueta="Falta" className="estructuras-falta">
        {fila.estado === 'oculta' || fila.estado === 'completa'
          ? '—'
          : fila.faltan.map((c) => ETIQUETA_DEL_CAMPO[c]).join(', ') || '—'}
      </td>
    </tr>
  )
}


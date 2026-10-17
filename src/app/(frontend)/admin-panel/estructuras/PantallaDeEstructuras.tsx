'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DatabaseZap, SearchX } from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { Pestanas } from '@/components/ui/Pestanas'
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

function TarjetaDelContador({
  titulo,
  valor,
  detalle,
  tono,
}: {
  titulo: string
  valor: string
  detalle?: string
  tono?: 'ok' | 'atencion'
}) {
  return (
    <div className={`estructuras-tarjeta${tono ? ` estructuras-tarjeta-${tono}` : ''}`}>
      <div className="estructuras-tarjeta-titulo">{titulo}</div>
      <div className="estructuras-tarjeta-valor">{valor}</div>
      {detalle ? <div className="estructuras-tarjeta-detalle">{detalle}</div> : null}
    </div>
  )
}

function Barra({ porcentaje, etiqueta }: { porcentaje: number; etiqueta: string }) {
  return (
    <div
      className="estructuras-barra"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(porcentaje)}
      aria-label={etiqueta}
    >
      <div className="estructuras-barra-relleno" style={{ width: `${Math.min(100, porcentaje)}%` }} />
    </div>
  )
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

      <ContadorGlobal conteo={conteo} />

      <details className="estructuras-regiones">
        <summary>Por región</summary>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Región</th>
              <th>Completas</th>
              <th>Pendientes</th>
              <th className="estructuras-col-barra">Avance</th>
            </tr>
          </thead>
          <tbody>
            {regionesConPiezas.map((r) => {
              const c = porRegion.get(r.id) as Conteo
              return (
                <tr key={r.id}>
                  <th scope="row">
                    <button
                      type="button"
                      className="estructuras-enlace"
                      onClick={() => {
                        cambiar(() => setRegion(r.id))
                        setPestana('pendientes')
                        setEstado('todos')
                      }}
                    >
                      {r.nombre}
                    </button>
                  </th>
                  <td>
                    {formatoDeEntero(c.completas)} de {formatoDeEntero(c.porLlenar)}
                  </td>
                  <td>{formatoDeEntero(c.pendientes)}</td>
                  <td className="estructuras-col-barra">
                    <Barra porcentaje={c.porcentajeCompletas} etiqueta={`Avance de ${r.nombre}`} />
                    <span className="estructuras-porcentaje">{formatoDePorcentaje(c.porcentajeCompletas)}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>

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

function ContadorGlobal({ conteo }: { conteo: Conteo }) {
  return (
    <section className="estructuras-contador" aria-label="Avance del listado">
      <div className="estructuras-contador-barra">
        <Barra porcentaje={conteo.porcentajeCompletas} etiqueta="Avance del listado" />
        <div className="estructuras-contador-leyenda">
          <strong>{formatoDePorcentaje(conteo.porcentajeCompletas)}</strong> completo ·{' '}
          {formatoDePorcentaje(conteo.porcentajePendientes)} por llenar
        </div>
      </div>
      <div className="estructuras-tarjetas">
        <TarjetaDelContador
          titulo="Completas"
          valor={formatoDeEntero(conteo.completas)}
          detalle={`${formatoDePorcentaje(conteo.porcentajeCompletas)} de ${formatoDeEntero(conteo.porLlenar)}`}
          tono="ok"
        />
        <TarjetaDelContador
          titulo="Pendientes"
          valor={formatoDeEntero(conteo.pendientes)}
          detalle={`${formatoDeEntero(conteo.aMedias)} a medias · ${formatoDeEntero(conteo.sinEmpezar)} sin empezar`}
          tono="atencion"
        />
        <TarjetaDelContador
          titulo="Ocultas"
          valor={formatoDeEntero(conteo.ocultas)}
          detalle="«No mostrar»: no cuentan"
        />
        {conteo.sinPieza > 0 ? (
          <TarjetaDelContador
            titulo="Sin pieza en el atlas"
            valor={formatoDeEntero(conteo.sinPieza)}
            detalle="Se conservan, esperando casarlas"
          />
        ) : null}
      </div>
    </section>
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


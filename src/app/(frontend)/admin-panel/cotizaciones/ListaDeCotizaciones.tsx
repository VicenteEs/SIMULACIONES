'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Inbox, SearchX } from 'lucide-react'
import { CabeceraDePagina } from '@/components/admin/CabeceraDePagina'
import { Vacio } from '@/components/ui/Vacio'
import { ESTADOS_DE_COTIZACION, NOMBRE_CORTO_DE_MODULO, etiquetaDeEstado, type EstadoDeCotizacion } from '@/lib/cotizaciones'
import { TONO_DE_COTIZACION, claseDeInsignia } from '@/lib/tonosDeEstado'
import { fechaDeCotizacion, type CotizacionDelPanel } from './datos'

type Filtro = EstadoDeCotizacion | 'todas'

const FILTROS: readonly Filtro[] = ['todas', ...ESTADOS_DE_COTIZACION.map((e) => e.valor)]

/**
 * La lista, filtrada en el navegador como la de Comentarios: son pocas, y
 * cambiar de estado o buscar no debería esperar a una consulta.
 *
 * El filtro es una fila de botones con su cuenta y no un desplegable: lo que
 * se quiere saber al entrar es cuántas hay de cada una, y en un desplegable
 * eso queda escondido hasta abrirlo.
 */
export function ListaDeCotizaciones({ cotizaciones, hayMas }: { cotizaciones: CotizacionDelPanel[]; hayMas: boolean }) {
  const nuevas = cotizaciones.filter((c) => c.estado === 'nueva').length
  // Se abre en las nuevas si las hay, que son las que esperan respuesta.
  const [filtro, setFiltro] = useState<Filtro>(nuevas > 0 ? 'nueva' : 'todas')
  const [busqueda, setBusqueda] = useState('')

  const cuenta = (f: Filtro) => (f === 'todas' ? cotizaciones.length : cotizaciones.filter((c) => c.estado === f).length)

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase()
    return cotizaciones.filter((c) => {
      if (filtro !== 'todas' && c.estado !== filtro) return false
      if (!texto) return true
      return [c.nombre, c.correo, c.institucion, c.cargo, c.mensaje].join(' ').toLowerCase().includes(texto)
    })
  }, [cotizaciones, filtro, busqueda])

  const subtitulo =
    cotizaciones.length === 0
      ? 'Las solicitudes que llegan desde «Cotizar» de la portada.'
      : nuevas === 0
        ? 'No hay ninguna nueva esperando respuesta.'
        : `${nuevas} ${nuevas === 1 ? 'nueva espera' : 'nuevas esperan'} respuesta.`

  return (
    <div>
      <CabeceraDePagina titulo="Cotizaciones" subtitulo={subtitulo} />

      {hayMas ? (
        <div className="admin-aviso admin-aviso-atencion" role="status">
          Se muestran las {cotizaciones.length} más recientes. Las anteriores siguen guardadas.
        </div>
      ) : null}

      <div className="admin-filters">
        <div className="cot-filtro" role="group" aria-label="Filtrar por estado">
          {FILTROS.map((f) => (
            <button key={f} type="button" className="cot-filtro-opcion" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>
              {f === 'todas' ? 'Todas' : etiquetaDeEstado(f)}
              <span className="cot-filtro-cuenta">{cuenta(f)}</span>
            </button>
          ))}
        </div>
        <div className="admin-filter-group">
          <label className="admin-filter-label" htmlFor="buscar-cotizacion">
            Buscar
          </label>
          <input
            id="buscar-cotizacion"
            className="admin-input"
            placeholder="Nombre, correo o institución"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <span className="admin-filter-count">
          {visibles.length} de {cotizaciones.length}
        </span>
      </div>

      {visibles.length === 0 ? (
        cotizaciones.length === 0 ? (
          <Vacio icono={Inbox} titulo="Todavía no ha llegado ninguna solicitud.">
            Cuando alguien pida una cotización desde la portada aparecerá aquí, y a los administradores les llegará un
            correo.
          </Vacio>
        ) : (
          <Vacio
            icono={SearchX}
            titulo="Ninguna solicitud coincide con el filtro."
            accion={
              <button
                type="button"
                className="admin-btn admin-btn-secondary"
                onClick={() => {
                  setFiltro('todas')
                  setBusqueda('')
                }}
              >
                Ver todas
              </button>
            }
          />
        )
      ) : (
        <div className="admin-table-container">
          <table className="admin-table tabla-apilable">
            <thead>
              <tr>
                <th>Institución</th>
                <th>Contacto</th>
                <th>Residentes</th>
                <th>Módulos</th>
                <th>Recibida</th>
                <th>Estado</th>
                <th>
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => (
                <tr key={c.id} className={c.estado === 'nueva' ? 'cot-fila-nueva' : undefined}>
                  <th scope="row">
                    <div className="admin-table-user-name">{c.institucion}</div>
                    {c.cargo ? <div className="admin-table-user-email">{c.cargo}</div> : null}
                  </th>
                  <td data-etiqueta="Contacto">
                    <div className="admin-table-user-name">{c.nombre}</div>
                    <div className="admin-table-user-email">{c.correo}</div>
                  </td>
                  <td data-etiqueta="Residentes" className="u-nowrap">
                    {c.residentes}
                  </td>
                  <td data-etiqueta="Módulos">
                    {c.modulos.length === 0 ? (
                      <span className="admin-celda-tenue">Sin indicar</span>
                    ) : (
                      <span className="cot-modulos">{c.modulos.map((m) => NOMBRE_CORTO_DE_MODULO[m] ?? m).join(' · ')}</span>
                    )}
                  </td>
                  <td data-etiqueta="Recibida" className="u-nowrap admin-celda-tenue">
                    {fechaDeCotizacion(c.recibida)}
                  </td>
                  <td data-etiqueta="Estado">
                    <span className={claseDeInsignia(TONO_DE_COTIZACION[c.estado])}>{etiquetaDeEstado(c.estado)}</span>
                  </td>
                  <td className="admin-table-acciones">
                    <Link
                      href={`/admin-panel/cotizaciones/${c.id}`}
                      className="admin-btn admin-btn-sm admin-btn-secondary"
                      aria-label={`Abrir la solicitud de ${c.institucion}`}
                    >
                      Abrir <ChevronRight size={15} aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

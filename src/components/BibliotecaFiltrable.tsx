'use client'

import React from 'react'
import Link from 'next/link'
import { filtrarFichas, type FichaBuscable } from '@/lib/busqueda'

/**
 * Biblioteca con buscador y filtros.
 *
 * El filtrado ocurre en el navegador sobre la lista que el servidor ya envió,
 * de modo que escribir en el buscador no dispara peticiones. Lo que llega aquí
 * ya pasó por el control de acceso: un lector nunca recibe borradores, así que
 * este componente no tiene que decidir nada sobre permisos.
 */

interface Ficha extends FichaBuscable {
  segmentoNombre?: string
  borrador?: boolean
}

interface Segmento {
  id: number | string
  nombre: string
}

export function BibliotecaFiltrable({
  fichas,
  segmentos,
}: {
  fichas: Ficha[]
  segmentos: Segmento[]
}) {
  const [texto, setTexto] = React.useState('')
  const [tipo, setTipo] = React.useState('')
  const [segmentoId, setSegmentoId] = React.useState<string>('')

  const resultado = React.useMemo(
    () => filtrarFichas(fichas, { texto, tipo, segmentoId }),
    [fichas, texto, tipo, segmentoId],
  )

  const hayFiltros = texto.trim() !== '' || tipo !== '' || segmentoId !== ''

  function limpiar() {
    setTexto('')
    setTipo('')
    setSegmentoId('')
  }

  // Agrupadas por segmento, respetando el orden que definió el autor.
  const grupos = segmentos
    .map((s) => ({ segmento: s, fichas: resultado.filter((f) => String(f.segmentoId) === String(s.id)) }))
    .filter((g) => g.fichas.length > 0)

  return (
    <>
      <div className="barra-filtros">
        <div className="campo-busqueda">
          <svg viewBox="0 0 20 20" aria-hidden="true" className="icono-lupa">
            <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M12.5 12.5 L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre, subtítulo o código AO"
            aria-label="Buscar fichas"
          />
        </div>

        <select value={segmentoId} onChange={(e) => setSegmentoId(e.target.value)} aria-label="Filtrar por segmento">
          <option value="">Todos los segmentos</option>
          {segmentos.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.nombre}
            </option>
          ))}
        </select>

        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo">
          <option value="">Trauma y ortopedia</option>
          <option value="trauma">Solo trauma</option>
          <option value="ortopedia">Solo ortopedia</option>
        </select>

        {hayFiltros ? (
          <button type="button" className="limpiar" onClick={limpiar}>
            Limpiar
          </button>
        ) : null}
      </div>

      <p className="recuento" aria-live="polite">
        {hayFiltros
          ? `${resultado.length} ${resultado.length === 1 ? 'ficha' : 'fichas'} de ${fichas.length}`
          : `${fichas.length} ${fichas.length === 1 ? 'ficha' : 'fichas'}`}
      </p>

      {resultado.length === 0 ? (
        <div className="tarjeta">
          <p>Ninguna ficha coincide con la búsqueda.</p>
          <button type="button" className="boton secundario" onClick={limpiar}>
            Ver todas
          </button>
        </div>
      ) : (
        grupos.map(({ segmento, fichas: lista }) => (
          <section key={segmento.id} className="grupo-segmento">
            <h2>{segmento.nombre}</h2>
            <ul className="rejilla-fichas">
              {lista.map((f) => (
                <li key={f.id}>
                  <Link href={`/biblioteca/${f.id}`} className="tarjeta-ficha">
                    <div className="etiquetas">
                      {f.codigo ? <span className="codigo">{f.codigo}</span> : null}
                      {f.borrador ? <span className="borrador">Borrador</span> : null}
                    </div>
                    <h3>{f.nombre}</h3>
                    {f.subtitulo ? <p>{f.subtitulo}</p> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}

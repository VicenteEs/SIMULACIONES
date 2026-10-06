'use client'

import React from 'react'
import { Search, SearchX, X } from 'lucide-react'
import { filtrarFichas, type FichaBuscable } from '@/lib/busqueda'
import { agruparEnRegiones } from '@/lib/regiones'
import { Vacio } from '@/components/ui/Vacio'
import { TarjetaFicha } from '@/components/TarjetaFicha'

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
  /** Si este residente ya la marcó como leída: lo pregunta el servidor. */
  leida?: boolean
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

  const buscador = React.useRef<HTMLInputElement>(null)

  const hayFiltros = texto.trim() !== '' || tipo !== '' || segmentoId !== ''

  function limpiar() {
    setTexto('')
    setTipo('')
    setSegmentoId('')
    // Los dos botones que llaman aquí —«Limpiar» y «Ver todas»— se desmontan en
    // el mismo clic que los activa: uno depende de `hayFiltros` y el otro de que
    // el resultado esté vacío. React no reubica el foco de un elemento que
    // desaparece, así que caía en `<body>` y el siguiente Tab volvía a empezar
    // por la barra de módulos. Se devuelve al buscador, que es donde el
    // residente va a seguir trabajando.
    buscador.current?.focus()
  }

  // Agrupadas por segmento, respetando el orden que definió el autor.
  const grupos = segmentos
    .map((s) => ({ segmento: s, fichas: resultado.filter((f) => String(f.segmentoId) === String(s.id)) }))
    .filter((g) => g.fichas.length > 0)
  // Y por encima, las regiones (D-157), con los segmentos de proximal a distal.
  // `titulo` es lo que `agruparEnRegiones` compara con su tabla.
  const regiones = agruparEnRegiones(grupos.map((g) => ({ ...g, titulo: g.segmento.nombre })))

  return (
    <>
      <div className="barra-filtros">
        <div className="campo-busqueda">
          <Search size={18} aria-hidden="true" className="icono-lupa" />
          <input
            ref={buscador}
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
          <button type="button" className="boton boton-fantasma boton-sm" onClick={limpiar}>
            <X size={16} aria-hidden="true" />
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
        <Vacio
          icono={SearchX}
          titulo="Ninguna ficha coincide con la búsqueda"
          compacto
          accion={
            <button type="button" className="boton boton-secundario" onClick={limpiar}>
              Ver todas
            </button>
          }
        >
          <p>Pruebe con otra palabra, o quite el filtro de segmento o de tipo.</p>
        </Vacio>
      ) : (
        regiones.map(({ region, grupos: deLaRegion }) => (
          <section key={region.clave} className="region-anatomica" aria-labelledby={`titulo-region-${region.clave}`}>
            <h2 id={`titulo-region-${region.clave}`} className="region-titulo">
              {region.titulo}
            </h2>
            {deLaRegion.map(({ segmento, fichas: lista }) => (
              <section key={segmento.id} className="grupo-segmento">
                <h3>
                  {segmento.nombre}
                  <span className="grupo-segmento-cuenta">
                    {lista.length} {lista.length === 1 ? 'ficha' : 'fichas'}
                  </span>
                </h3>
                <ul className="rejilla-fichas">
                  {lista.map((f) => (
                    <li key={f.id}>
                      <TarjetaFicha
                        href={`/biblioteca/${f.id}`}
                        titulo={f.nombre ?? ""}
                        codigo={f.codigo}
                        resumen={f.subtitulo}
                        borrador={f.borrador}
                        leida={f.leida}
                        accion="Leer ficha"
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        ))
      )}
    </>
  )
}

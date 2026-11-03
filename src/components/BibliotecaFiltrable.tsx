'use client'

import React from 'react'
import { Search, SearchX, X } from 'lucide-react'
import { filtrarFichas, type FichaBuscable } from '@/lib/busqueda'
import { agruparEnRegiones } from '@/lib/regiones'
import { Vacio } from '@/components/ui/Vacio'
import { TarjetaFicha } from '@/components/TarjetaFicha'
import { FiguraDelSegmento, tieneFigura } from '@/components/FiguraDelSegmento'

/**
 * Biblioteca con buscador y filtros, con el tablero de Penpot (P-007 E4,
 * D-237): las pestañas «Todas», «Pendientes» y «Leídas», una ficha por
 * segmento para filtrar y las tarjetas con el recorte del atlas.
 *
 * El filtrado ocurre en el navegador sobre la lista que el servidor ya envió,
 * de modo que escribir en el buscador no dispara peticiones. Lo que llega aquí
 * ya pasó por el control de acceso: un lector nunca recibe borradores, así que
 * este componente no tiene que decidir nada sobre permisos.
 *
 * Las tarjetas van en una sola rejilla, ordenadas por región y por segmento de
 * proximal a distal (D-157), con el segmento escrito en cada una. Los
 * encabezados de región y de segmento se retiraron: con las fichas de segmento
 * arriba, que es como Penpot lo resuelve, repetían lo que ya dice el filtro.
 */

interface Ficha extends FichaBuscable {
  borrador?: boolean
  /** Si este residente ya la marcó como leída: lo pregunta el servidor. */
  leida?: boolean
}

interface Segmento {
  id: number | string
  nombre: string
}

type Lectura = 'todas' | 'pendientes' | 'leidas'

const LECTURAS: { valor: Lectura; texto: string }[] = [
  { valor: 'todas', texto: 'Todas' },
  { valor: 'pendientes', texto: 'Pendientes' },
  { valor: 'leidas', texto: 'Leídas' },
]

export function BibliotecaFiltrable({
  fichas,
  segmentos,
  tipos,
}: {
  fichas: Ficha[]
  segmentos: Segmento[]
  /** Los tipos del catálogo (trauma, ortopedia y los que se agreguen), para el desplegable. */
  tipos: Segmento[]
}) {
  const [texto, setTexto] = React.useState('')
  const [tipo, setTipo] = React.useState('')
  const [segmentoId, setSegmentoId] = React.useState<string>('')
  const [lectura, setLectura] = React.useState<Lectura>('todas')

  // Primero lo que no es la lectura: los números de las tres pestañas cuentan
  // sobre esto, así dicen cuántas quedan pendientes de lo que se está mirando.
  const filtradas = React.useMemo(
    () => filtrarFichas(fichas, { texto, tipo, segmentoId }),
    [fichas, texto, tipo, segmentoId],
  )
  const cuantas: Record<Lectura, number> = {
    todas: filtradas.length,
    pendientes: filtradas.filter((f) => !f.leida).length,
    leidas: filtradas.filter((f) => f.leida).length,
  }
  const resultado =
    lectura === 'todas' ? filtradas : filtradas.filter((f) => (lectura === 'leidas' ? f.leida : !f.leida))

  const buscador = React.useRef<HTMLInputElement>(null)

  const hayFiltros = texto.trim() !== '' || tipo !== '' || segmentoId !== '' || lectura !== 'todas'

  function limpiar() {
    setTexto('')
    setTipo('')
    setSegmentoId('')
    setLectura('todas')
    // Los dos botones que llaman aquí —«Limpiar» y «Ver todas»— se desmontan en
    // el mismo clic que los activa: uno depende de `hayFiltros` y el otro de que
    // el resultado esté vacío. React no reubica el foco de un elemento que
    // desaparece, así que caía en `<body>` y el siguiente Tab volvía a empezar
    // por la barra de módulos. Se devuelve al buscador, que es donde el
    // residente va a seguir trabajando.
    buscador.current?.focus()
  }

  // Solo los segmentos que tienen fichas: una ficha de filtro que deja la
  // rejilla vacía es un botón que no hace nada útil.
  const segmentosConFichas = segmentos.filter((s) => fichas.some((f) => String(f.segmentoId) === String(s.id)))
  const nombreDelSegmento = new Map(segmentos.map((s) => [String(s.id), s.nombre]))
  const nombreDelTipo = new Map(tipos.map((t) => [String(t.id), t.nombre]))

  // El orden de las regiones (D-157), con los segmentos de proximal a distal;
  // `titulo` es lo que `agruparEnRegiones` compara con su tabla.
  const ordenadas = agruparEnRegiones(
    segmentos.map((s) => ({ titulo: s.nombre, fichas: resultado.filter((f) => String(f.segmentoId) === String(s.id)) })),
  ).flatMap((r) => r.grupos.flatMap((g) => g.fichas))

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

        {/* Botones con `aria-pressed` y no pestañas: no hay un panel por cada
            una, es la misma rejilla filtrada de otro modo. */}
        <div className="conmutador-lectura" role="group" aria-label="Estado de lectura">
          {LECTURAS.map((l) => (
            <button key={l.valor} type="button" aria-pressed={lectura === l.valor} onClick={() => setLectura(l.valor)}>
              {l.texto}
              <span className="conmutador-cuenta">{cuantas[l.valor]}</span>
            </button>
          ))}
        </div>

        {tipos.length > 0 ? (
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo">
            <option value="">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.nombre}
              </option>
            ))}
          </select>
        ) : null}

        {hayFiltros ? (
          <button type="button" className="boton boton-fantasma boton-sm" onClick={limpiar}>
            <X size={16} aria-hidden="true" />
            Limpiar
          </button>
        ) : null}
      </div>

      {segmentosConFichas.length > 1 ? (
        <div className="fichas-de-filtro" role="group" aria-label="Filtrar por segmento">
          <button type="button" aria-pressed={segmentoId === ''} onClick={() => setSegmentoId('')}>
            Todos
          </button>
          {segmentosConFichas.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={segmentoId === String(s.id)}
              onClick={() => setSegmentoId(segmentoId === String(s.id) ? '' : String(s.id))}
            >
              {s.nombre}
            </button>
          ))}
        </div>
      ) : null}

      <p className="recuento" aria-live="polite">
        {resultado.length} {resultado.length === 1 ? 'ficha' : 'fichas'}
        {hayFiltros ? ` de ${fichas.length}` : ''} · ordenadas por segmento
      </p>

      {resultado.length === 0 ? (
        <Vacio
          icono={SearchX}
          titulo={
            !texto.trim() && !tipo && !segmentoId && lectura === 'leidas'
              ? 'Todavía no ha marcado ninguna ficha como leída'
              : !texto.trim() && !tipo && !segmentoId && lectura === 'pendientes'
                ? 'No le queda ninguna ficha por leer'
                : 'Ninguna ficha coincide con la búsqueda'
          }
          compacto
          accion={
            <button type="button" className="boton boton-secundario" onClick={limpiar}>
              Ver todas
            </button>
          }
        >
          <p>
            {lectura === 'todas'
              ? 'Pruebe con otra palabra, o quite el filtro de segmento o de tipo.'
              : 'La marca de leída se pone en cada ficha, con «Marcar como leída», bajo su título.'}
          </p>
        </Vacio>
      ) : (
        <ul className="rejilla-fichas">
          {ordenadas.map((f) => {
            const segmento = nombreDelSegmento.get(String(f.segmentoId))
            const nombreTipo = f.tipo ? nombreDelTipo.get(String(f.tipo)) : undefined
            return (
              <li key={f.id}>
                <TarjetaFicha
                  href={`/biblioteca/${f.id}`}
                  titulo={f.nombre ?? ''}
                  codigo={f.codigo}
                  resumen={f.subtitulo}
                  borrador={f.borrador}
                  leida={f.leida}
                  antetitulo={segmento}
                  figura={tieneFigura(segmento) ? <FiguraDelSegmento segmento={segmento} /> : undefined}
                  insignias={nombreTipo ? <span className="etiqueta">{nombreTipo}</span> : undefined}
                  accion="Leer ficha"
                />
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

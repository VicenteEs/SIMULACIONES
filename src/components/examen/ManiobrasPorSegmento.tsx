'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, CircleCheck, Search, SearchX, X } from 'lucide-react'
import { registrarVisita } from '@/app/(frontend)/acciones/actividad'
// Constantes puras, sin Payload detrás: lo mismo que importa
// `VisitaDeManiobraEnlazada`, y por lo mismo (su cabecera lo explica).
import { rutaPublica } from '@/app/(frontend)/admin-panel/modulos'
import {
  buscarManiobras,
  maniobraDelAncla,
  normalizarBusqueda,
  segmentoDe,
  vecinasDe,
  type SegmentoDeLaLista,
} from '@/lib/listaDeManiobras'

/**
 * El examen físico en dos columnas, como el tablero de Penpot (P-007 E4,
 * D-237): las fichas de segmento arriba, la lista de maniobras del segmento a
 * la izquierda y la maniobra elegida a la derecha.
 *
 * El detalle de cada maniobra lo sigue pintando el servidor, con su texto rico
 * y sus bloques, y llega aquí como `children`: este componente no lo vuelve a
 * pintar, solo decide cuál se ve. Mandar al navegador el contenido de
 * trescientas maniobras como datos, para pintarlas aquí, sería mandarlo dos
 * veces. Para la lista basta con el nombre, lo que evalúa y si está leída.
 *
 * Las que no se ven siguen montadas, con `hidden` y no desmontadas: la casilla
 * de «leída» y el comentario a medio escribir de una maniobra siguen ahí al
 * volver a ella, que es lo que ya prometía el buscador de antes.
 *
 * El ancla `#maniobra-<id>` sigue siendo la dirección de cada maniobra
 * (`rutaPublica`): al llegar con ella se elige esa, y elegir otra la reescribe,
 * para que copiar la dirección comparta lo que se está mirando.
 */

/** `#maniobra-`, sacado de quien compone los enlaces y no escrito otra vez. */
const PREFIJO_DEL_ANCLA = `#${rutaPublica('maniobras', '').split('#')[1] ?? ''}`

/**
 * Quién pidió enseñar una maniobra, porque cada uno merece algo distinto:
 *
 *   - `usuario`, un clic en la lista o en «Siguiente»: es abrirla, así que se
 *     anota la visita, se lleva el foco al título y, en una columna, se baja
 *     hasta el detalle.
 *   - `ancla`, la dirección con la que se llega: se baja hasta el detalle, pero
 *     la visita ya la anota `VisitaDeManiobraEnlazada` y el foco se queda donde
 *     lo dejó el navegador.
 *   - `segmento`, un clic en una ficha de segmento: se enseña la primera del
 *     segmento sin moverse de sitio, porque lo que se quería ver es la lista.
 */
type Origen = 'usuario' | 'ancla' | 'segmento'

interface Seleccion {
  seleccionada: string
  segmentos: SegmentoDeLaLista[]
  mostrar: (id: string, origen: Origen) => void
}

/** Un clic sin teclas: con Ctrl, Cmd o Mayús el enlace se abre donde pida el navegador. */
const esClicSimple = (e: React.MouseEvent) => !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)

const ContextoDeLaSeleccion = createContext<Seleccion | null>(null)

/** Ancho a partir del cual la lista y el detalle van uno encima del otro. Igual que en `estilos.css`. */
const UNA_COLUMNA = '(max-width: 900px)'

export function ManiobrasPorSegmento({
  segmentos,
  children,
}: {
  segmentos: SegmentoDeLaLista[]
  /** Un `PanelDeManiobra` por maniobra, en el mismo orden que `segmentos`. */
  children: ReactNode
}) {
  const [seleccionada, setSeleccionada] = useState(segmentos[0]?.maniobras[0]?.id ?? '')
  const [claveDelSegmento, setClaveDelSegmento] = useState(segmentos[0]?.clave ?? '')
  const [texto, setTexto] = useState('')
  // Lo marcado en esta visita. La lista nace con lo que dijo el servidor, y la
  // casilla está en el detalle, que es de otro componente: sin esto, marcar una
  // maniobra no se veía en la lista hasta recargar.
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({})
  const detalle = useRef<HTMLDivElement>(null)
  const buscador = useRef<HTMLInputElement>(null)
  // Quién pidió el último cambio, para el efecto que lo enseña (`Origen`).
  const pendiente = useRef<Origen | null>(null)

  const mostrar = useCallback(
    (id: string, origen: Origen) => {
      const segmento = segmentoDe(segmentos, id)
      if (!segmento) return
      pendiente.current = origen
      setSeleccionada(id)
      setClaveDelSegmento(segmento.clave)
      // `replaceState` y no `location.hash`, igual que las pestañas de la
      // ficha: el segundo salta al ancla y deja una entrada en el historial por
      // cada maniobra, y «atrás» se volvería un repaso de la lista.
      window.history.replaceState(null, '', `${PREFIJO_DEL_ANCLA}${id}`)
      // Elegir una maniobra en la lista sí es abrirla, a diferencia de cargar
      // el listado: es lo que pone a «Continúa leyendo» al tanto de este módulo.
      if (origen === 'usuario') registrarVisita('maniobras', id)
    },
    [segmentos],
  )

  // El ancla manda al llegar y cuando cambia sin recargar (un enlace a otra
  // maniobra dentro de la técnica, o el botón «atrás»).
  useEffect(() => {
    const leerAncla = () => {
      const id = maniobraDelAncla(segmentos, window.location.hash, PREFIJO_DEL_ANCLA)
      if (id) mostrar(id, 'ancla')
    }
    leerAncla()
    window.addEventListener('hashchange', leerAncla)
    return () => window.removeEventListener('hashchange', leerAncla)
  }, [segmentos, mostrar])

  useEffect(() => {
    const origen = pendiente.current
    pendiente.current = null
    if (!origen || origen === 'segmento') return
    const panel = detalle.current?.querySelector<HTMLElement>(`[data-maniobra="${CSS.escape(seleccionada)}"]`)
    if (!panel) return
    // En una columna el detalle queda debajo de la lista, fuera de la vista:
    // sin bajar hasta él, pulsar una maniobra parecía no hacer nada.
    if (window.matchMedia(UNA_COLUMNA).matches) {
      const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      panel.scrollIntoView({ behavior: suave ? 'smooth' : 'auto', block: 'start' })
    }
    // El foco al título del detalle, para que el lector de pantalla lea la
    // maniobra que se acaba de abrir y el siguiente Tab siga por ella.
    if (origen === 'usuario') panel.querySelector<HTMLElement>('[data-titulo-de-maniobra]')?.focus({ preventScroll: true })
  }, [seleccionada])

  // La casilla de «leída» es de `RastreadorActividad`, que no avisa a nadie.
  // Se escucha el `change` que sube desde el detalle en vez de darle una
  // devolución de llamada: el detalle lo pinta el servidor, y desde allí no se
  // le puede pasar una función a un componente de cliente.
  useEffect(() => {
    const caja = detalle.current
    if (!caja) return
    const alMarcar = (evento: Event) => {
      const casilla = evento.target
      if (!(casilla instanceof HTMLInputElement) || !casilla.closest('.checkbox-leida')) return
      const id = casilla.closest<HTMLElement>('[data-maniobra]')?.dataset.maniobra
      if (id) setMarcadas((antes) => ({ ...antes, [id]: casilla.checked }))
    }
    caja.addEventListener('change', alMarcar)
    return () => caja.removeEventListener('change', alMarcar)
  }, [])

  const buscando = normalizarBusqueda(texto) !== ''
  const resultados = useMemo(() => buscarManiobras(segmentos, texto), [segmentos, texto])
  const segmento = segmentos.find((s) => s.clave === claveDelSegmento) ?? segmentos[0]
  const filas = buscando ? resultados : (segmento?.maniobras ?? []).map((maniobra) => ({ maniobra, segmento }))

  function limpiar() {
    setTexto('')
    // El botón que llama aquí desaparece en el mismo clic: sin devolver el foco
    // al buscador caía en `<body>`.
    buscador.current?.focus()
  }

  const contexto = useMemo(() => ({ seleccionada, segmentos, mostrar }), [seleccionada, segmentos, mostrar])

  return (
    <ContextoDeLaSeleccion.Provider value={contexto}>
      <div className="examen-herramientas">
        {segmentos.length > 1 ? (
          // Botones con `aria-pressed`, como las fichas de la biblioteca: no hay
          // un panel por segmento, es la misma lista con otro contenido.
          <div className="fichas-de-filtro" role="group" aria-label="Segmentos">
            {segmentos.map((s) => (
              <button
                key={s.clave}
                type="button"
                aria-pressed={!buscando && s.clave === segmento?.clave}
                onClick={() => {
                  setTexto('')
                  // La primera del segmento, para que el detalle hable de lo que
                  // dice el título de la lista.
                  const primera = s.maniobras[0]
                  if (primera) mostrar(primera.id, 'segmento')
                }}
              >
                {s.titulo}
              </button>
            ))}
          </div>
        ) : null}
        <div className="campo-busqueda">
          <Search size={18} aria-hidden="true" className="icono-lupa" />
          <input
            ref={buscador}
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Busca una maniobra"
            aria-label="Buscar maniobras por nombre o por lo que evalúan"
          />
        </div>
      </div>

      <div className="examen-cuerpo">
        <nav className="examen-lista" aria-labelledby="titulo-de-la-lista">
          <h2 id="titulo-de-la-lista" className="examen-lista-titulo">
            {buscando ? 'Resultados' : segmento?.titulo}
            <span className="examen-lista-cuenta" aria-live="polite">
              {filas.length} {filas.length === 1 ? 'maniobra' : 'maniobras'}
            </span>
          </h2>
          {filas.length === 0 ? (
            <div className="examen-sin-resultados">
              <SearchX size={20} aria-hidden="true" />
              <p>Ninguna maniobra coincide con «{texto.trim()}».</p>
              <button type="button" className="boton boton-secundario boton-sm" onClick={limpiar}>
                <X size={16} aria-hidden="true" />
                Limpiar la búsqueda
              </button>
            </div>
          ) : (
            <ul>
              {filas.map(({ maniobra: m, segmento: s }) => {
                const viendo = m.id === seleccionada
                const leida = marcadas[m.id] ?? m.leida
                return (
                  <li key={m.id}>
                    {/* Un enlace de verdad a su ancla, que se abre en otra
                        pestaña con Ctrl o con el botón central; el clic normal
                        no salta, cambia el detalle. */}
                    <a
                      href={`${PREFIJO_DEL_ANCLA}${m.id}`}
                      className="examen-fila"
                      aria-current={viendo ? 'true' : undefined}
                      onClick={(e) => {
                        if (!esClicSimple(e)) return
                        e.preventDefault()
                        mostrar(m.id, 'usuario')
                      }}
                    >
                      <span className="examen-fila-texto">
                        <span className="examen-fila-nombre">{m.nombre}</span>
                        <span className="examen-fila-evalua">
                          {buscando ? `${s?.titulo} · ` : ''}
                          {m.evalua}
                        </span>
                      </span>
                      {viendo ? <span className="insignia">Viendo</span> : null}
                      {leida ? (
                        <span className="examen-fila-leida">
                          <CircleCheck size={16} aria-hidden="true" />
                          <span className="sr-only">Leída</span>
                        </span>
                      ) : null}
                      <ChevronRight size={18} aria-hidden="true" className="examen-fila-flecha" />
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
        </nav>

        <div className="examen-detalle" ref={detalle}>
          {children}
        </div>
      </div>
    </ContextoDeLaSeleccion.Provider>
  )
}

/**
 * El detalle de una maniobra, visible solo si es la elegida, con su anterior y
 * su siguiente al pie.
 *
 * `id` lo declara la página (`id={`maniobra-${m.id}`}`) y no se compone aquí:
 * es el ancla de `rutaPublica`, y la página es quien la promete a los tres
 * archivos que la usan (`paginasPublicas.test.ts` lo vigila allí).
 */
export function PanelDeManiobra({ id, maniobra, children }: { id: string; maniobra: string; children: ReactNode }) {
  const seleccion = useContext(ContextoDeLaSeleccion)
  // Fuera del contenedor se ve siempre: un panel suelto no tiene por qué
  // desaparecer porque nadie lo haya elegido.
  const visible = seleccion ? seleccion.seleccionada === maniobra : true
  const { anterior, siguiente } = seleccion ? vecinasDe(seleccion.segmentos, maniobra) : { anterior: null, siguiente: null }

  return (
    <article id={id} className="maniobra" data-maniobra={maniobra} hidden={!visible}>
      {children}
      {seleccion && (anterior || siguiente) ? (
        <nav className="maniobra-vecinas" aria-label="Otras maniobras del segmento">
          {anterior ? (
            <a
              href={`${PREFIJO_DEL_ANCLA}${anterior.id}`}
              onClick={(e) => {
                if (!esClicSimple(e)) return
                e.preventDefault()
                seleccion.mostrar(anterior.id, 'usuario')
              }}
            >
              <ChevronLeft size={18} aria-hidden="true" />
              <span>
                <span className="maniobra-vecinas-rotulo">Anterior</span>
                {anterior.nombre}
              </span>
            </a>
          ) : (
            <span />
          )}
          {siguiente ? (
            <a
              href={`${PREFIJO_DEL_ANCLA}${siguiente.id}`}
              className="maniobra-vecinas-siguiente"
              onClick={(e) => {
                if (!esClicSimple(e)) return
                e.preventDefault()
                seleccion.mostrar(siguiente.id, 'usuario')
              }}
            >
              <span>
                <span className="maniobra-vecinas-rotulo">Siguiente</span>
                {siguiente.nombre}
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </a>
          ) : null}
        </nav>
      ) : null}
    </article>
  )
}

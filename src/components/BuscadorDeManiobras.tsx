'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'

/**
 * Buscador e índice de segmentos del examen físico.
 *
 * El listado pinta hasta trescientas maniobras en una sola página —no tiene
 * página por maniobra, y las anclas `#maniobra-<id>` de `rutaPublica` dependen
 * de eso—, y llegar a la del hombro era bajar por todas las de la columna.
 *
 * Las maniobras las pinta el servidor, con su texto rico y sus bloques, y aquí
 * no se vuelven a pintar: se esconden con `hidden` las que no casan, buscando
 * en el `data-busqueda` que cada una lleva ya normalizado. Volver a pintar la
 * lista en el cliente obligaría a mandarle al navegador el contenido entero de
 * las trescientas como datos, además de como HTML.
 *
 * Esconder no desmonta: la casilla de «leída» y el comentario a medio escribir
 * de una maniobra filtrada siguen ahí al quitar el filtro.
 */

/**
 * Minúsculas y sin tildes, igual que el `data-busqueda` que escribe la página
 * (`examen-fisico/page.tsx`, con la misma receta: una función exportada desde
 * aquí no se podría llamar desde allí, que es de servidor).
 */
function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function BuscadorDeManiobras({
  regiones,
  total,
}: {
  /**
   * Los segmentos agrupados por región anatómica (D-157). El índice los enseña
   * bajo el nombre de su región, en el mismo orden en que la página los pinta.
   */
  regiones: {
    clave: string
    titulo: string
    segmentos: { clave: string; titulo: string; cuantas: number }[]
  }[]
  total: number
}) {
  const [texto, setTexto] = useState('')
  const [visibles, setVisibles] = useState(total)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const buscado = normalizarBusqueda(texto)
    let cuantas = 0
    for (const grupo of document.querySelectorAll<HTMLElement>('[data-grupo-maniobras]')) {
      let enElGrupo = 0
      for (const maniobra of grupo.querySelectorAll<HTMLElement>('[data-busqueda]')) {
        const casa = buscado === '' || (maniobra.dataset.busqueda ?? '').includes(buscado)
        maniobra.hidden = !casa
        if (casa) enElGrupo++
      }
      grupo.hidden = enElGrupo === 0
      cuantas += enElGrupo
    }
    // Una región se esconde cuando ya no le queda ningún segmento a la vista:
    // sin esto, buscar «Lachman» dejaba el encabezado «Miembro superior» solo,
    // con nada debajo.
    for (const region of document.querySelectorAll<HTMLElement>('[data-region-maniobras]')) {
      region.hidden = region.querySelector('[data-grupo-maniobras]:not([hidden])') === null
    }
    // Es el resultado de mirar el documento, no un estado derivado de otro
    // estado: no hay forma de calcularlo durante el pintado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibles(cuantas)
  }, [texto])

  const filtrando = texto.trim() !== ''

  return (
    <div className="herramientas-maniobras">
      <div className="campo-busqueda">
        <Search size={18} aria-hidden="true" className="icono-lupa" />
        <input
          ref={campo}
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar maniobra por nombre o por lo que evalúa"
          aria-label="Buscar maniobras"
        />
      </div>
      {filtrando ? (
        <p className="recuento" aria-live="polite">
          {visibles} de {total} maniobras{' '}
          <button
            type="button"
            className="boton boton-fantasma boton-sm"
            onClick={() => {
              setTexto('')
              campo.current?.focus()
            }}
          >
            <X size={16} aria-hidden="true" />
            Limpiar
          </button>
        </p>
      ) : (
        <nav className="indice-segmentos" aria-label="Segmentos">
          {regiones.map((r) => (
            // Un grupo con nombre y no solo una etiqueta suelta: quien navega con
            // lector de pantalla oye «Miembro superior, grupo» antes de los
            // segmentos que lo componen.
            <div key={r.clave} className="indice-region" role="group" aria-label={r.titulo}>
              <span className="indice-region-titulo" aria-hidden="true">
                {r.titulo}
              </span>
              {r.segmentos.map((s) => (
                <a key={s.clave} href={`#${s.clave}`}>
                  {s.titulo}
                  <span className="indice-segmentos-cuenta">{s.cuantas}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
      )}
    </div>
  )
}

'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { TextSearch } from 'lucide-react'
import { IconoInstrumento } from './IconoInstrumento'
import { instrumentosPedidos, MAXIMO_A_LA_VISTA, type InstrumentoParaPedir } from '@/lib/pedirInstrumento'

/** Lo que el buscador enseña de cada instrumento: lo de `InstrumentoParaPedir`, su dibujo y su familia. */
export type OpcionParaPedir = InstrumentoParaPedir & { icono?: string | null; familia: string }

/**
 * Pedir un instrumento por su nombre (P-012 E5), encima del lienzo: la tecla I lo abre desde cualquier sitio, Enter pone
 * en la mano el marcado y Esc lo cierra. El porqué y el orden de la lista, en `pedirInstrumento.ts`.
 *
 * Encima del lienzo y no en la columna de la mesa, porque con la columna plegada —que es como el lienzo gana sitio en una
 * pantalla de portátil— el buscador de la mesa no se ve. Es el patrón «combobox con lista» de ARIA, como
 * `SelectorConBusqueda`: el foco no sale del cuadro y la opción marcada se anuncia por `aria-activedescendant`, para poder
 * seguir escribiendo mientras se recorre la lista con las flechas.
 */
export function PedirInstrumento({
  opciones,
  enLaMano,
  alCoger,
  alCerrar,
}: {
  opciones: OpcionParaPedir[]
  enLaMano: string | null
  alCoger: (id: string) => void
  alCerrar: () => void
}) {
  const base = useId()
  const idDeLaLista = `${base}-lista`
  const entrada = useRef<HTMLInputElement>(null)
  const [escrito, setEscrito] = useState('')
  const [marcado, setMarcado] = useState(0)
  const todos = instrumentosPedidos(opciones, escrito)
  const lista = todos.slice(0, MAXIMO_A_LA_VISTA)
  const activo = lista.length === 0 ? -1 : Math.min(marcado, lista.length - 1)
  const fuera = todos.length - lista.length

  // El foco entra en el cuadro al abrir y vuelve al salir a donde estaba (el lienzo, casi siempre), como en cualquier
  // diálogo: sin devolverlo, la siguiente tecla —un 1 a 5, una F— caería en el cuerpo de la página y no en la consola.
  useEffect(() => {
    const antes = document.activeElement instanceof HTMLElement ? document.activeElement : null
    entrada.current?.focus()
    return () => {
      if (antes?.isConnected) antes.focus({ preventScroll: true })
    }
  }, [])

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Que no llegue a los oyentes del lienzo y de la broca, que con Esc retiran o devuelven lo de la mano: aquí Esc
      // solo cierra el buscador.
      e.preventDefault()
      e.stopPropagation()
      alCerrar()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (lista.length === 0) return
      e.preventDefault()
      const paso = e.key === 'ArrowDown' ? 1 : -1
      setMarcado((activo + paso + lista.length) % lista.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const elegido = lista[activo]
      if (elegido) alCoger(elegido.id)
    }
  }

  return (
    <>
      <div className="consola-pedir-fondo" onPointerDown={alCerrar} />
      <div className="consola-pedir" role="dialog" aria-modal="true" aria-label="Pedir un instrumento">
        <label className="consola-busqueda-envoltorio consola-pedir-cuadro">
          <TextSearch size={16} aria-hidden />
          <input
            ref={entrada}
            type="text"
            role="combobox"
            className="consola-busqueda"
            placeholder="Pida un instrumento: «farab», «broca 3,2»…"
            aria-label="Pedir un instrumento por su nombre"
            aria-expanded={lista.length > 0}
            aria-controls={lista.length > 0 ? idDeLaLista : undefined}
            aria-autocomplete="list"
            aria-activedescendant={activo >= 0 ? `${idDeLaLista}-${activo}` : undefined}
            autoComplete="off"
            spellCheck={false}
            value={escrito}
            onChange={(e) => {
              setEscrito(e.target.value)
              setMarcado(0)
            }}
            onKeyDown={alTeclear}
          />
        </label>
        {lista.length > 0 ? (
          <ul id={idDeLaLista} role="listbox" className="consola-pedir-lista" aria-label="Instrumentos que coinciden">
            {lista.map((i, n) => (
              <li
                key={i.id}
                id={`${idDeLaLista}-${n}`}
                role="option"
                aria-selected={n === activo}
                className={`consola-pedir-opcion${n === activo ? ' marcada' : ''}${i.id === enLaMano ? ' en-la-mano' : ''}`}
                // Sin esto, el clic le quita el foco al cuadro antes de llegar, y el buscador se queda sin teclado.
                onPointerDown={(e) => e.preventDefault()}
                onMouseEnter={() => setMarcado(n)}
                onClick={() => alCoger(i.id)}
              >
                <IconoInstrumento nombre={i.icono} />
                <span className="consola-pedir-nombre">{i.nombre}</span>
                <span className="consola-pedir-familia">{i.id === enLaMano ? 'En la mano' : i.familia}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="consola-pedir-vacio" role="status">
            {escrito.trim() === ''
              ? 'Escriba parte del nombre, sin preocuparse de tildes ni mayúsculas.'
              : 'Ningún instrumento de la mesa de instrumental se llama así.'}
          </p>
        )}
        {fuera > 0 ? (
          <p className="consola-pedir-mas">
            {fuera === 1
              ? 'Hay 1 más: escriba más del nombre para verlo.'
              : `Hay ${fuera} más: escriba más del nombre para verlos.`}
          </p>
        ) : null}
        <p className="consola-pedir-teclas" aria-hidden>
          <kbd>↑</kbd> <kbd>↓</kbd> elegir · <kbd>Enter</kbd> a la mano · <kbd>Esc</kbd> cerrar
        </p>
      </div>
    </>
  )
}

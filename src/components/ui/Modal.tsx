'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * La caja de diálogo de toda la plataforma.
 *
 * Nació como `EnvolturaModal` dentro de `usuarios/TablaUsuarios.tsx`, que era
 * el único diálogo de verdad del panel: el resto preguntaba con el
 * `confirm()` del navegador —veintiuno—, una caja gris que no sigue la
 * paleta, que en Chrome lleva el nombre del dominio de título y que no deja
 * distinguir una acción que borra de una que no. Se sube aquí tal cual,
 * con su porqué:
 *
 *   - El foco entra en la caja al abrir, cicla dentro (Tab y Shift+Tab no
 *     escapan a lo que el velo tapa: `aria-modal` lo promete) y vuelve al
 *     botón que la abrió al cerrar.
 *   - `onCerrar` se lee desde una referencia: el padre pasa una función nueva
 *     en cada pintado, y con ella en las dependencias el efecto se montaba
 *     otra vez en cada tecla y sacaba el foco del campo que se rellenaba.
 *   - `:disabled` y no `[disabled]` en la lista de enfocables: una casilla
 *     dentro de un `fieldset` desactivado no lleva el atributo pero tampoco
 *     acepta el foco, y con el selector por atributo el ciclo se clavaba.
 *
 * Las clases son `admin-modal-*` por historia: las fija
 * `tests/unit/modalesDelPanel.test.ts`, y desde ahora viven en `ui.css`, que
 * se carga también fuera del panel.
 */
export function Modal({
  titulo,
  error,
  onCerrar,
  ancho,
  children,
  rol = 'dialog',
}: {
  titulo: ReactNode
  error?: string | null
  onCerrar: () => void
  /** 'normal' (480 px) o 'ancho' (720 px). */
  ancho?: 'normal' | 'ancho'
  children: ReactNode
  /** `alertdialog` para las confirmaciones: el lector de pantalla las lee enteras. */
  rol?: 'dialog' | 'alertdialog'
}) {
  const caja = useRef<HTMLDivElement>(null)
  const idTitulo = useId()

  const cerrar = useRef(onCerrar)
  useEffect(() => {
    cerrar.current = onCerrar
  })

  useEffect(() => {
    const devolverA = document.activeElement as HTMLElement | null

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        cerrar.current()
        return
      }
      if (evento.key !== 'Tab') return
      const contenedor = caja.current
      if (!contenedor) return
      const enfocables = Array.from(
        contenedor.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (enfocables.length === 0) return
      const primero = enfocables[0]
      const ultimo = enfocables[enfocables.length - 1]
      const activo = document.activeElement
      if (!contenedor.contains(activo)) {
        evento.preventDefault()
        ;(evento.shiftKey ? ultimo : primero).focus()
        return
      }
      if (evento.shiftKey && (activo === primero || activo === contenedor)) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && activo === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', alTeclear)

    const desbordeOriginal = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Si la caja trae un elemento marcado para el foco inicial (el botón seguro
    // de una confirmación, el primer campo), va ahí; si no, a la caja.
    const inicial = caja.current?.querySelector<HTMLElement>('[data-foco-inicial]')
    ;(inicial ?? caja.current)?.focus()

    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = desbordeOriginal
      devolverA?.focus()
    }
  }, [])

  return (
    <div className="admin-modal-backdrop" onClick={onCerrar}>
      <div
        className={`admin-modal${ancho === 'ancho' ? ' admin-modal-ancho' : ''}`}
        role={rol}
        aria-modal="true"
        aria-labelledby={idTitulo}
        ref={caja}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="admin-modal-title" id={idTitulo}>
          {titulo}
        </h2>
        {error ? (
          <div className="admin-aviso admin-aviso-error" role="status">
            {error}
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}

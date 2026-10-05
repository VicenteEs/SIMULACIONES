'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'

/**
 * Confirmaciones propias, en sustitución de `confirm()`.
 *
 * `useConfirmar()` devuelve una función que se espera igual que se esperaba
 * `confirm()` —`if (!(await confirmar({...}))) return`—, así que cambiar una
 * llamada no obliga a reordenar el código de alrededor. Lo que gana:
 *
 *   - El botón dice lo que hace («Eliminar ficha», no «Aceptar»), y si la
 *     acción destruye algo va en rojo (`peligro`).
 *   - El foco empieza en «Cancelar» cuando hay peligro: un Intro apresurado
 *     no borra nada. Escape y el clic en el velo cancelan.
 *   - `palabra`: para lo irreversible de verdad (restaurar un respaldo), el
 *     botón no se habilita hasta escribirla.
 *
 * Sin proveedor —un componente montado fuera del layout, una prueba—, cae al
 * `confirm()` de siempre en vez de dejar la acción sin pregunta.
 */
export type OpcionesDeConfirmacion = {
  titulo: string
  mensaje?: ReactNode
  /** Rótulo del botón que confirma. Por omisión, «Confirmar». */
  confirmar?: string
  cancelar?: string
  peligro?: boolean
  /** Si se da, hay que escribirla para habilitar el botón. */
  palabra?: string
}

type Pendiente = OpcionesDeConfirmacion & { resolver: (si: boolean) => void }

const Contexto = createContext<((o: OpcionesDeConfirmacion) => Promise<boolean>) | null>(null)

export function ProveedorDeConfirmacion({ children }: { children: ReactNode }) {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null)
  const [escrito, setEscrito] = useState('')
  const actual = useRef<Pendiente | null>(null)

  const confirmar = useCallback(
    (opciones: OpcionesDeConfirmacion) =>
      new Promise<boolean>((resolver) => {
        // Una segunda pregunta mientras la primera sigue abierta cancela la
        // primera: no hay pila de diálogos.
        actual.current?.resolver(false)
        const nueva = { ...opciones, resolver }
        actual.current = nueva
        setEscrito('')
        setPendiente(nueva)
      }),
    [],
  )

  const cerrar = (si: boolean) => {
    actual.current?.resolver(si)
    actual.current = null
    setPendiente(null)
  }

  const bloqueado = Boolean(pendiente?.palabra) && escrito.trim() !== pendiente?.palabra

  return (
    <Contexto.Provider value={confirmar}>
      {children}
      {pendiente ? (
        <Modal titulo={pendiente.titulo} onCerrar={() => cerrar(false)} rol="alertdialog">
          <div className={`confirmar-cuerpo${pendiente.peligro ? ' confirmar-peligro' : ''}`}>
            {pendiente.peligro ? <AlertTriangle aria-hidden className="confirmar-icono" size={22} /> : null}
            <div className="confirmar-mensaje">{pendiente.mensaje}</div>
          </div>
          {pendiente.palabra ? (
            <label className="confirmar-palabra">
              Escriba <strong>{pendiente.palabra}</strong> para continuar
              <input
                className="admin-form-input"
                value={escrito}
                onChange={(e) => setEscrito(e.target.value)}
                autoComplete="off"
                data-foco-inicial
              />
            </label>
          ) : null}
          <div className="admin-modal-actions">
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={() => cerrar(false)}
              {...(pendiente.peligro && !pendiente.palabra ? { 'data-foco-inicial': true } : {})}
            >
              {pendiente.cancelar ?? 'Cancelar'}
            </button>
            <button
              type="button"
              className={`admin-btn ${pendiente.peligro ? 'admin-btn-danger' : 'admin-btn-primary'}`}
              onClick={() => cerrar(true)}
              disabled={bloqueado}
              {...(!pendiente.peligro && !pendiente.palabra ? { 'data-foco-inicial': true } : {})}
            >
              {pendiente.confirmar ?? 'Confirmar'}
            </button>
          </div>
        </Modal>
      ) : null}
    </Contexto.Provider>
  )
}

/** Texto plano de un mensaje, para el `confirm()` de reserva. */
function enTexto(o: OpcionesDeConfirmacion): string {
  const m = typeof o.mensaje === 'string' ? `\n\n${o.mensaje}` : ''
  return `${o.titulo}${m}`
}

export function useConfirmar() {
  const contexto = useContext(Contexto)
  return useCallback(
    async (o: OpcionesDeConfirmacion) => {
      if (contexto) return contexto(o)
      if (typeof window === 'undefined') return false
      if (o.palabra) return window.prompt(`${enTexto(o)}\n\nEscriba ${o.palabra}`) === o.palabra
      return window.confirm(enTexto(o))
    },
    [contexto],
  )
}

'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'

/**
 * Avisos flotantes («toasts») de toda la plataforma.
 *
 * Antes cada pantalla pintaba su resultado en un recuadro arriba del todo:
 * «Borrador guardado» aparecía donde no se veía si se había bajado a la
 * quinta pestaña, y el editor creía que no había pasado nada. Solo el taller
 * anatómico tenía avisos flotantes; esto generaliza aquel patrón.
 *
 * `role="status"` y `aria-live="polite"` en el contenedor: el lector de
 * pantalla lee el aviso sin robar el foco. Los de error se quedan hasta que
 * se cierran a mano —un error que desaparece solo es un error que no se leyó—;
 * los demás se van a los cinco segundos.
 */
export type TonoDeAviso = 'ok' | 'info' | 'atencion' | 'error'
type Aviso = { id: number; tono: TonoDeAviso; texto: ReactNode }

const Contexto = createContext<((tono: TonoDeAviso, texto: ReactNode) => void) | null>(null)

const ICONOS = { ok: CheckCircle2, info: Info, atencion: AlertTriangle, error: XCircle }

export function ProveedorDeAvisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const siguiente = useRef(1)

  const quitar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), [])

  const mostrar = useCallback((tono: TonoDeAviso, texto: ReactNode) => {
    const id = siguiente.current++
    // Como mucho cuatro a la vez: el quinto empuja fuera al más viejo.
    setAvisos((a) => [...a.slice(-3), { id, tono, texto }])
  }, [])

  return (
    <Contexto.Provider value={mostrar}>
      {children}
      <div className="avisos-flotantes" role="status" aria-live="polite">
        {avisos.map((a) => (
          <AvisoFlotante key={a.id} aviso={a} onCerrar={() => quitar(a.id)} />
        ))}
      </div>
    </Contexto.Provider>
  )
}

function AvisoFlotante({ aviso, onCerrar }: { aviso: Aviso; onCerrar: () => void }) {
  useEffect(() => {
    if (aviso.tono === 'error') return
    const t = setTimeout(onCerrar, 5000)
    return () => clearTimeout(t)
  }, [aviso.tono, onCerrar])
  const Icono = ICONOS[aviso.tono]
  return (
    <div className={`aviso-flotante aviso-flotante-${aviso.tono}`}>
      <Icono aria-hidden size={18} className="aviso-flotante-icono" />
      <div className="aviso-flotante-texto">{aviso.texto}</div>
      <button type="button" className="aviso-flotante-cerrar" onClick={onCerrar} aria-label="Cerrar el aviso">
        <X aria-hidden size={16} />
      </button>
    </div>
  )
}

/**
 * `const avisar = useAvisos(); avisar('ok', 'Borrador guardado.')`.
 * Sin proveedor no hace nada: el aviso en página sigue siendo la reserva.
 */
export function useAvisos() {
  const contexto = useContext(Contexto)
  return useCallback(
    (tono: TonoDeAviso, texto: ReactNode) => {
      contexto?.(tono, texto)
    },
    [contexto],
  )
}

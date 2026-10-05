'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Una sección que se pliega y se despliega, y recuerda cómo se dejó.
 *
 * Pedida para el panel, donde varias pantallas apilan listas largas una
 * debajo de otra (Auditoría, Actividad, Registro, Estadísticas): había que
 * desplazar por encima de doscientas filas para llegar a la tabla siguiente.
 *
 * Es un `<details>` de verdad, así que funciona con teclado y sin JavaScript;
 * lo único que añade el cliente es recordar el estado en `localStorage` bajo
 * `clave`. El almacenamiento puede fallar (ventana privada, bloqueado): se
 * envuelve y, si falla, la sección simplemente abre como venía.
 */
export function SeccionPlegable({
  clave,
  titulo,
  resumen,
  abierta = true,
  acciones,
  children,
}: {
  /** Única por pantalla y sección: `auditoria.fichas`. */
  clave: string
  titulo: ReactNode
  /** Lo que se ve al lado del título aunque esté plegada: «214 filas». */
  resumen?: ReactNode
  abierta?: boolean
  /** Botones a la derecha de la cabecera; el clic en ellos no pliega. */
  acciones?: ReactNode
  children: ReactNode
}) {
  const [abiertaAhora, setAbierta] = useState(abierta)

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(`plegable:${clave}`)
      // Se lee aquí y no al crear el estado: en el servidor no hay
      // `localStorage`, y un valor inicial distinto entre servidor y navegador
      // es un desajuste de hidratación. El coste es un pintado con el estado
      // por omisión antes de aplicar el recordado; con `<details>` no se nota.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (guardado !== null) setAbierta(guardado === '1')
    } catch {
      /* sin almacenamiento, se queda como venía */
    }
  }, [clave])

  return (
    <details
      className="plegable"
      open={abiertaAhora}
      onToggle={(e) => {
        const abierto = (e.currentTarget as HTMLDetailsElement).open
        setAbierta(abierto)
        try {
          localStorage.setItem(`plegable:${clave}`, abierto ? '1' : '0')
        } catch {
          /* idem */
        }
      }}
    >
      <summary className="plegable-cabecera">
        <ChevronDown aria-hidden size={18} className="plegable-flecha" />
        <span className="plegable-titulo">{titulo}</span>
        {resumen ? <span className="plegable-resumen">{resumen}</span> : null}
        {acciones ? (
          <span className="plegable-acciones" onClick={(e) => e.preventDefault()}>
            {acciones}
          </span>
        ) : null}
      </summary>
      <div className="plegable-cuerpo">{children}</div>
    </details>
  )
}

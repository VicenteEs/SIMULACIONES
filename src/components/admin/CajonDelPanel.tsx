'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'

/**
 * La barra lateral del panel, que en pantalla estrecha se vuelve cajón.
 *
 * Por debajo de 900 px la barra era una fila de iconos sin texto: doce enlaces
 * que un lector de pantalla anunciaba como «enlace» a secas, y que en un
 * teléfono se partían en dos renglones o se salían por la derecha. Ahora la
 * cabecera se queda arriba con un botón «Menú», y la navegación entera —con
 * sus nombres y sus contadores— sale de un cajón a la izquierda.
 *
 * Lo que va en `antes` (las notas del revisor, D-144) se queda fuera del
 * cajón y a la vista: con una ficha abierta son la razón de mirar la barra, y
 * esconderlas detrás de un botón sería perderlas.
 *
 * En escritorio el cajón es una columna más (`panel.css`) y el botón no
 * existe: este componente no cambia nada por encima de 900 px.
 *
 * Se cierra al navegar, con Escape, con el velo y con su botón; al abrir, el
 * foco va al primer enlace, y al cerrar vuelve al botón.
 */
export function CajonDelPanel({
  cabecera,
  antes,
  children,
}: {
  cabecera: ReactNode
  antes?: ReactNode
  children: ReactNode
}) {
  const ruta = usePathname()
  // Se guarda en qué pantalla se abrió y no un sí o un no: al llegar a otra,
  // el cajón ya está recogido sin un efecto que lo cierre. Si no, tapaba la
  // pantalla a la que se acababa de ir.
  const [abiertoEn, setAbiertoEn] = useState<string | null>(null)
  const abierto = abiertoEn !== null && abiertoEn === ruta
  const setAbierto = (si: boolean) => setAbiertoEn(si ? ruta : null)
  const cajon = useRef<HTMLDivElement>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!abierto) return
    cajon.current?.querySelector<HTMLElement>('a[href], button')?.focus()
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAbiertoEn(null)
        boton.current?.focus()
      }
    }
    document.addEventListener('keydown', alTeclear)
    const desborde = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = desborde
    }
  }, [abierto])

  return (
    <>
      <div className="admin-sidebar-header">
        {cabecera}
        <button
          ref={boton}
          type="button"
          className="admin-cajon-boton"
          aria-expanded={abierto}
          aria-controls={id}
          onClick={() => setAbierto(!abierto)}
        >
          {abierto ? <X aria-hidden size={18} /> : <Menu aria-hidden size={18} />}
          Menú
        </button>
      </div>
      {antes}
      <div ref={cajon} id={id} className={`admin-cajon${abierto ? ' admin-cajon-abierto' : ''}`}>
        {children}
      </div>
      {abierto ? <div className="admin-cajon-velo" aria-hidden onClick={() => setAbierto(false)} /> : null}
    </>
  )
}

'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'

/** Dónde se recuerda, en el navegador, si la barra quedó plegada. */
const CLAVE_PLEGADA = 'panel.barra.plegada'

// Un almacén mínimo para leer lo recordado sin `setState` dentro de un efecto: en el servidor la barra se pinta desplegada y en el
// navegador `useSyncExternalStore` la corrige al hidratar. `enMemoria` cubre un navegador sin `localStorage` (ventana privada): ahí el
// plegado vale hasta recargar.
let enMemoria: boolean | null = null
const oyentes = new Set<() => void>()
const suscribirse = (oyente: () => void) => {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}
const leerPlegada = (): boolean => {
  if (enMemoria !== null) return enMemoria
  try {
    return window.localStorage.getItem(CLAVE_PLEGADA) === 'si'
  } catch {
    return false
  }
}
const ponerPlegada = (valor: boolean) => {
  enMemoria = valor
  try {
    window.localStorage.setItem(CLAVE_PLEGADA, valor ? 'si' : 'no')
  } catch {
    // Se queda en memoria hasta recargar.
  }
  oyentes.forEach((o) => o())
}

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
 *
 * **En escritorio la barra se pliega** (pedido del dueño): un botón bajo la marca la deja en una columna angosta con solo el logotipo
 * —el libro, sobre su recuadro blanco, sin el nombre— y los iconos de cada pestaña, para dar el ancho a la pantalla de trabajo. Se
 * recuerda en el navegador. La marca va en un atributo del contorno (`data-plegada`) y no en una clase de React: la barra y el contenido
 * son hermanos que este componente no controla, y el CSS es quien sabe qué se esconde.
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
  const plegada = useSyncExternalStore(suscribirse, leerPlegada, () => false)
  useEffect(() => {
    cajon.current?.closest('.admin-layout')?.setAttribute('data-plegada', plegada ? 'si' : 'no')
  }, [plegada])
  const alternarPlegado = () => ponerPlegada(!plegada)

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
      <button
        type="button"
        className="admin-barra-plegar"
        aria-pressed={plegada}
        aria-label={plegada ? 'Desplegar la barra lateral' : 'Plegar la barra lateral'}
        title={plegada ? 'Desplegar la barra lateral' : 'Plegar la barra lateral'}
        onClick={alternarPlegado}
      >
        {plegada ? <PanelLeftOpen aria-hidden size={18} /> : <PanelLeftClose aria-hidden size={18} />}
        <span className="admin-barra-plegar-texto">Plegar</span>
      </button>
      {antes}
      <div ref={cajon} id={id} className={`admin-cajon${abierto ? ' admin-cajon-abierto' : ''}`}>
        {children}
      </div>
      {abierto ? <div className="admin-cajon-velo" aria-hidden onClick={() => setAbierto(false)} /> : null}
    </>
  )
}

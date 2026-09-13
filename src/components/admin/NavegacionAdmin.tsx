'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentProps, MouseEvent, ReactNode } from 'react'
import { puedeSalirSinPerderCambios } from '@/admin/salidaDelEditor'

/**
 * Barra lateral del panel.
 *
 * Es cliente por dos razones. La primera, marcar en qué sección se está: sin
 * esa marca, en un panel de siete secciones se pierde la referencia de dónde se
 * está trabajando, que es justo lo que una barra lateral existe para evitar.
 *
 * La segunda, preguntar antes de sacar a nadie de una ficha a medio escribir.
 * Los enlaces de aquí navegaban sin consultar, y la barra está a la vista en
 * todo momento mientras se edita: «Comentarios» para mirar uno, o «Contenido»
 * para comprobar un dato de otra ficha, se llevaban media hora de redacción sin
 * una sola advertencia. La barra no sabe nada del editor: le pregunta a
 * `src/admin/salidaDelEditor.ts`, donde se apunta cualquier pantalla con
 * cambios sin guardar.
 */

/**
 * Cancela la navegación si hay cambios sin guardar y la persona no confirma.
 *
 * Va en `onNavigate` y no en `onClick` a propósito: `onNavigate` solo corre en
 * la navegación de cliente, que es la que desmonta el editor. Un Ctrl+clic o
 * un clic central abren pestaña nueva, no se llevan nada y no deben preguntar.
 */
const alNavegar = (evento: { preventDefault: () => void }) => {
  if (!puedeSalirSinPerderCambios()) evento.preventDefault()
}

/**
 * Un `<Link>` que pregunta antes de salir, para los enlaces de la barra que
 * pinta `layout.tsx`.
 *
 * El `layout` es de servidor y no puede pasarle a `<Link>` una función: el
 * «Volver a la plataforma» de su pie se escapaba de la guardia por eso, y es
 * de los que más sacan del panel. Este envoltorio lleva la función puesta desde
 * el cliente y el `layout` solo le pasa lo serializable.
 */
export function EnlaceConGuardia(props: Omit<ComponentProps<typeof Link>, 'onNavigate'>) {
  return <Link {...props} onNavigate={alNavegar} />
}

/**
 * Pregunta antes de dejar actuar a un botón que saca del panel, sin tocar el
 * botón.
 *
 * Es para «Salir»: cierra la sesión y navega con `router.push`, así que se
 * lleva lo escrito igual que un enlace, pero no es un `<Link>` y no tiene
 * `onNavigate`. `BotonSalir` se usa también fuera del panel, donde no hay
 * ficha que perder, y enseñarle a él qué es el editor es justo el acoplamiento
 * que el registro evita.
 *
 * Se intercepta en la fase de captura: parar ahí la propagación hace que el
 * clic no llegue nunca al `onClick` del botón, de modo que no se cierra la
 * sesión para después preguntar. `display: contents` para que el envoltorio no
 * rompa el `flex` del pie de la barra.
 */
export function GuardiaDeSalida({ children }: { children: ReactNode }) {
  const alPulsar = (evento: MouseEvent) => {
    if (puedeSalirSinPerderCambios()) return
    evento.stopPropagation()
    evento.preventDefault()
  }
  return (
    <div style={{ display: 'contents' }} onClickCapture={alPulsar}>
      {children}
    </div>
  )
}

export interface EntradaDeMenu {
  ruta: string
  etiqueta: string
  icono: string
  /** Número que se muestra a la derecha, por ejemplo comentarios pendientes. */
  aviso?: number
  externa?: boolean
}

export interface SeccionDeMenu {
  titulo: string
  entradas: EntradaDeMenu[]
}

/**
 * Los iconos son trazos SVG sueltos para no arrastrar una librería entera por
 * ocho dibujos de veinte píxeles.
 */
const ICONOS: Record<string, string> = {
  panel: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  contenido: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8',
  actividad: 'M22 12h-4l-3 9L9 3l-3 9H2',
  comentarios: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  usuarios: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  respaldos: 'M21 8v13H3V8 M1 3h22v5H1z M10 12h4',
  atlas: 'M12 2a3 3 0 0 1 3 3v3h3a3 3 0 0 1 0 6h-3v3a3 3 0 0 1-6 0v-3H6a3 3 0 0 1 0-6h3V5a3 3 0 0 1 3-3z',
  estadisticas: 'M3 3v18h18 M7 15l4-6 4 3 5-8',
  sistema: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  externo: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14 21 3',
  volver: 'M19 12H5 M12 19l-7-7 7-7',
}

function Icono({ nombre }: { nombre: string }) {
  return (
    <svg
      className="admin-nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONOS[nombre] ?? ICONOS.panel} />
    </svg>
  )
}

/** El panel es la única ruta que hace coincidencia exacta; el resto, por prefijo. */
const estaActiva = (ruta: string, actual: string) =>
  ruta === '/admin-panel' ? actual === ruta : actual.startsWith(ruta)

export function NavegacionAdmin({ secciones }: { secciones: SeccionDeMenu[] }) {
  const actual = usePathname() ?? ''

  return (
    <nav className="admin-nav" aria-label="Secciones del panel">
      {secciones.map((seccion) => (
        <div key={seccion.titulo}>
          <div className="admin-nav-section">{seccion.titulo}</div>
          {seccion.entradas.map((entrada) => {
            const activa = !entrada.externa && estaActiva(entrada.ruta, actual)
            return (
              <Link
                key={entrada.ruta}
                href={entrada.ruta}
                className={`admin-nav-link${activa ? ' active' : ''}`}
                aria-current={activa ? 'page' : undefined}
                onNavigate={alNavegar}
                {...(entrada.externa
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                <Icono nombre={entrada.icono} />
                <span className="admin-nav-texto">{entrada.etiqueta}</span>
                {entrada.aviso ? <span className="admin-nav-aviso">{entrada.aviso}</span> : null}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

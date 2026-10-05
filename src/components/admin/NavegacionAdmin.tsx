'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ComponentProps, MouseEvent, ReactNode } from 'react'
import {
  Activity,
  Archive,
  ArrowLeft,
  Bone,
  ChartLine,
  ClipboardCheck,
  ExternalLink,
  FileSearch,
  FileText,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  ScrollText,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
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
    <div className="guardia-de-salida" onClickCapture={alPulsar}>
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
 * Los iconos, de lucide como el resto de la plataforma.
 *
 * Eran trazos SVG sueltos copiados a mano «para no arrastrar una librería
 * entera por ocho dibujos». Desde que la plataforma usa lucide para todo, los
 * propios eran los únicos con otro grosor y otras esquinas, y añadir uno
 * obligaba a copiar un `path` de quinientos caracteres. El nombre sigue
 * siendo una cadena porque lo elige `layout.tsx`, que es de servidor y no
 * puede pasar un componente a este.
 */
const ICONOS: Record<string, LucideIcon> = {
  panel: LayoutDashboard,
  revision: ClipboardCheck,
  contenido: FileText,
  atlas: Bone,
  comentarios: MessageSquare,
  estadisticas: ChartLine,
  actividad: Activity,
  registro: ScrollText,
  auditoria: FileSearch,
  usuarios: Users,
  difusion: Megaphone,
  respaldos: Archive,
  sistema: Settings,
  externo: ExternalLink,
  volver: ArrowLeft,
}

export function IconoDeMenu({ nombre }: { nombre: string }) {
  const Icono = ICONOS[nombre] ?? LayoutDashboard
  return <Icono className="admin-nav-icon" size={18} aria-hidden />
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
            // El nombre accesible lleva el contador dicho con palabras: el
            // número suelto al lado del texto se leía «Comentarios 3», sin
            // decir tres qué.
            const nombre = entrada.aviso
              ? `${entrada.etiqueta} (${entrada.aviso} pendientes)`
              : entrada.etiqueta
            return (
              <Link
                key={entrada.ruta}
                href={entrada.ruta}
                className={`admin-nav-link${activa ? ' active' : ''}`}
                aria-current={activa ? 'page' : undefined}
                aria-label={nombre}
                onNavigate={alNavegar}
                {...(entrada.externa
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                <IconoDeMenu nombre={entrada.icono} />
                <span className="admin-nav-texto">{entrada.etiqueta}</span>
                {entrada.aviso ? (
                  <span className="admin-nav-aviso" aria-hidden>
                    {entrada.aviso}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

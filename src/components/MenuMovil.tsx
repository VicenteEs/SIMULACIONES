'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConmutadorVista } from './ConmutadorVista'
import { BotonSalir } from './BotonSalir'

/**
 * Las dos navegaciones de módulos de la barra superior.
 *
 * Viven juntas y en cliente por la misma razón: las dos tienen que marcar el
 * módulo en el que está el residente, y eso exige la ruta actual, que un
 * componente de servidor no puede leer. Separarlas dejaba el cálculo duplicado,
 * y dos cálculos del módulo activo acaban discrepando el día que se añade una
 * ruta anidada.
 */

export interface EntradaDeMenu {
  ruta: string
  etiqueta: string
}

/**
 * ¿Está el residente dentro de este módulo?
 *
 * Con `startsWith` y no con igualdad, porque las fichas cuelgan del módulo
 * (`/biblioteca/12`) y desde una ficha se sigue estando en la biblioteca.
 */
function esModuloActivo(rutaActual: string | null, rutaModulo: string): boolean {
  return Boolean(rutaActual?.startsWith(rutaModulo))
}

/**
 * Fila de módulos de la pantalla ancha.
 *
 * Lleva `aria-current` y no solo una clase de color. Sin él, quien navega con
 * lector de pantalla recorre cinco enlaces idénticos en cualquier página de la
 * plataforma y no tiene forma de saber en cuál de los cinco está; y un estado
 * que solo se expresa con color deja fuera además a quien no distingue ese
 * azul. El mismo patrón está en `IndiceFicha` y en `NavegacionAdmin`.
 */
export function BarraDeModulos({ modulos }: { modulos: EntradaDeMenu[] }) {
  const rutaActual = usePathname()

  return (
    <nav className="modulos" aria-label="Módulos">
      {modulos.map((m) => (
        <Link
          key={m.ruta}
          href={m.ruta}
          aria-current={esModuloActivo(rutaActual, m.ruta) ? 'page' : undefined}
        >
          {m.etiqueta}
        </Link>
      ))}
    </nav>
  )
}

/**
 * Menú de navegación para pantallas estrechas.
 *
 * En un teléfono los cinco módulos más los controles de sesión no caben en una
 * barra, y dejarlos desplazándose en horizontal esconde opciones detrás de un
 * gesto que nadie descubre. Un panel que se abre muestra todo de una vez.
 *
 * Cuidados que hacen que sea usable de verdad y no un adorno:
 *  - se cierra solo al cambiar de página, o el panel quedaría abierto encima
 *    del contenido recién cargado;
 *  - se cierra con Escape y tocando fuera;
 *  - mientras está abierto, el fondo no se desplaza;
 *  - al abrirlo el foco entra en el panel, mientras está abierto no se sale de
 *    él, y al cerrarlo vuelve al botón, que es lo que espera quien navega con
 *    teclado o con lector de pantalla;
 *  - cerrado queda `inert`, porque el panel no se va del documento y si no el
 *    teclado y el lector de pantalla lo recorren entero sin verlo.
 */
export function MenuMovil({
  modulos,
  nombre,
  rolReal,
  simulando,
  hayPanel,
}: {
  modulos: EntradaDeMenu[]
  nombre?: string
  rolReal: string
  simulando: boolean
  hayPanel: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const ruta = usePathname()
  const boton = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  // Cerrar al cambiar de página.
  //
  // Se ajusta durante el pintado y no en un efecto. Con un efecto, el panel
  // llegaba a pintarse una vez sobre la página nueva antes de cerrarse: un
  // parpadeo, y un render de más en el móvil, que es donde este menú vive.
  // Llamar a `setEstado` aquí no es un ciclo: React descarta este pintado y
  // rehace el componente antes de enseñar nada.
  const [rutaPintada, setRutaPintada] = useState(ruta)
  if (ruta !== rutaPintada) {
    setRutaPintada(ruta)
    setAbierto(false)
  }

  // `useCallback` con dependencias vacías para que el efecto de abajo pueda
  // depender de esta función sin volver a montarse en cada pintado.
  const cerrar = useCallback(() => {
    setAbierto(false)
    // El foco vuelve al botón a mano, y en este mismo tick, antes de que React
    // pinte el cierre. Cerrar no lo mueve solo: el panel no desaparece del
    // documento, se va de la pantalla con `transform`, y lo que lo saca del
    // camino es el `inert` de más abajo, que al aplicarse suelta el foco en
    // `<body>`. Sin esta línea el siguiente Tab arranca desde el principio del
    // documento: en el teléfono, toda la cabecera otra vez para volver al menú
    // que se acaba de cerrar.
    boton.current?.focus()
  }, [])

  useEffect(() => {
    if (!abierto) return

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        // `cerrar()` y no `setAbierto(false)`: cerrar con Escape tiene que
        // dejar el foco donde lo dejan el aspa y el fondo, o Escape se
        // convierte en la única forma de cerrar que abandona al teclado.
        cerrar()
        return
      }

      if (evento.key !== 'Tab') return

      // El panel se anuncia `aria-modal="true"`, y eso le promete al lector de
      // pantalla que detrás no queda nada que alcanzar. Sin ciclar el foco la
      // promesa es falsa: Tab pasea por la ficha que el panel está tapando,
      // leyéndola en voz alta, y no hay manera de volver a los enlaces.
      const contenedor = panel.current
      if (!contenedor) return

      const enfocables = Array.from(
        contenedor.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      )
      if (enfocables.length === 0) return

      const primero = enfocables[0]
      const ultimo = enfocables[enfocables.length - 1]
      const activo = document.activeElement

      // El propio panel cuenta como «principio»: al abrirse el foco entra en él
      // y desde ahí Shift+Tab se iría a la página de detrás.
      if (evento.shiftKey && (activo === primero || activo === contenedor)) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && activo === ultimo) {
        evento.preventDefault()
        primero.focus()
      }
    }
    document.addEventListener('keydown', alTeclear)

    // El fondo no se desplaza mientras el panel está abierto.
    const desbordeOriginal = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    panel.current?.focus()

    return () => {
      document.removeEventListener('keydown', alTeclear)
      document.body.style.overflow = desbordeOriginal
    }
  }, [abierto, cerrar])

  return (
    <>
      <button
        ref={boton}
        type="button"
        className="menu-boton"
        aria-expanded={abierto}
        aria-controls="menu-movil"
        aria-label={abierto ? 'Cerrar el menú' : 'Abrir el menú'}
        onClick={() => setAbierto(!abierto)}
      >
        <span className={`menu-icono${abierto ? ' menu-icono-abierto' : ''}`} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      {abierto ? (
        <div className="menu-fondo" onClick={cerrar} aria-hidden="true" />
      ) : null}

      <div
        id="menu-movil"
        ref={panel}
        className={`menu-panel${abierto ? ' menu-panel-abierto' : ''}`}
        // `inert` y no solo `hidden`. Aquí `hidden` no oculta nada: la regla de
        // autor `.menu-panel { display: flex }` (estilos.css) gana a la del
        // navegador, y el panel cerrado se sigue maquetando, corrido fuera de
        // pantalla con `transform: translateX(100%)`. Sin `inert`, por debajo de
        // 1000px —donde la barra ancha se oculta y esta es la única navegación—
        // el Tab entraba en los cinco módulos, el aspa, el conmutador y «Cerrar
        // sesión» de un panel invisible, y el `aria-modal="true"` de abajo
        // quedaba anunciado de forma permanente. La trampa de foco no lo tapa:
        // su efecto sale por `if (!abierto) return`.
        //
        // No vale arreglarlo con `.menu-panel[hidden] { display: none }`: eso
        // mata el deslizamiento. `hidden` se queda como red por si algún día el
        // panel deja de declarar su propio `display`.
        hidden={!abierto}
        inert={!abierto}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Navegación"
      >
        <div className="menu-cabecera">
          <span className="menu-titulo">Ir a</span>
          <button type="button" className="menu-cerrar" onClick={cerrar} aria-label="Cerrar">
            ✕
          </button>
        </div>

        <nav className="menu-enlaces">
          {modulos.map((m) => {
            const activo = esModuloActivo(ruta, m.ruta)
            return (
              <Link
                key={m.ruta}
                href={m.ruta}
                className={`menu-enlace${activo ? ' menu-enlace-activo' : ''}`}
                // El dato ya estaba calculado, pero viajaba solo como color.
                aria-current={activo ? 'page' : undefined}
              >
                {m.etiqueta}
              </Link>
            )
          })}
        </nav>

        {hayPanel ? (
          <>
            <div className="menu-separador" />
            <nav className="menu-enlaces">
              <Link href="/admin-panel" className="menu-enlace">
                Panel de control
              </Link>
            </nav>
          </>
        ) : null}

        <div className="menu-pie">
          {/* El conmutador de vista y la salida viven aqui y no en la barra:
              en un telefono ocupaban el sitio del propio boton del menu. */}
          {rolReal !== 'lector' ? (
            <div className="menu-conmutador">
              <ConmutadorVista rolReal={rolReal} simulando={simulando} />
            </div>
          ) : null}

          <div className="menu-quien">
            {nombre ? <span className="menu-quien-nombre">{nombre}</span> : null}
            <span className="menu-quien-rol">
              {rolReal === 'admin'
                ? 'Administrador'
                : rolReal === 'editor'
                  ? 'Editor'
                  : 'Lector'}
            </span>
          </div>

          <BotonSalir clase="menu-salir" />
        </div>
      </div>
    </>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConmutadorVista } from './ConmutadorVista'
import { BotonSalir } from './BotonSalir'

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
 *  - al abrirlo el foco entra en el panel y al cerrarlo vuelve al botón, que es
 *    lo que espera quien navega con teclado o con lector de pantalla.
 */

export interface EntradaDeMenu {
  ruta: string
  etiqueta: string
}

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

  useEffect(() => {
    if (!abierto) return

    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierto(false)
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
  }, [abierto])

  const cerrar = () => {
    setAbierto(false)
    boton.current?.focus()
  }

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
        hidden={!abierto}
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
          {modulos.map((m) => (
            <Link
              key={m.ruta}
              href={m.ruta}
              className={`menu-enlace${ruta?.startsWith(m.ruta) ? ' menu-enlace-activo' : ''}`}
            >
              {m.etiqueta}
            </Link>
          ))}
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

'use client'

import React, { useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { ruta } from '@/lib/rutas'
import { Ancla } from './Ancla'

/** Las anclas de la barra, en el orden de la página; «Planes» va entre ellas. */
const ANTES_DE_PLANES = [
  { id: 'problema', etiqueta: 'Qué resuelve' },
  { id: 'modulos', etiqueta: 'Módulos' },
] as const
const DESPUES_DE_PLANES = [
  { id: 'nosotros', etiqueta: 'Equipo' },
  { id: 'preguntas', etiqueta: 'Preguntas' },
] as const

/**
 * La barra fija del visitante (P-007 E3): marca, cuatro anclas, «Entrar» y
 * «Cotizar».
 *
 * Marca el ancla de la sección que se está leyendo, como el «Salto · Estudia»
 * de Penpot: quien baja por una página larga pierde la cuenta de dónde está,
 * y la barra se lo dice sin que tenga que subir. «Módulos» cubre los cinco
 * capítulos y no solo el primero, que es el que lleva el `id`.
 *
 * En el teléfono las anclas no caben y van a un menú. «Cotizar» se queda
 * siempre a la vista: es lo único que esta página quiere que se pulse.
 *
 * La misma barra va en `/planes`, y allí las anclas llevan a la portada
 * (`Ancla`) y «Planes» se marca como la página en que se está.
 */
export function BarraDeVisitante({ textoCotizar, pagina = 'portada' }: { textoCotizar: string; pagina?: 'portada' | 'planes' }) {
  const enLaPortada = pagina === 'portada'
  const [abierto, setAbierto] = useState(false)
  const [activa, setActiva] = useState<string | null>(null)
  const idDelMenu = useId()

  useEffect(() => {
    // Cada sección cuenta como «a la vista» cuando cruza la franja central de
    // la pantalla; con márgenes negativos el observador mira esa franja y no
    // la pantalla entera, que tendría varias secciones a la vez.
    const secciones = [...document.querySelectorAll<HTMLElement>('[data-ancla]')]
    if (secciones.length === 0 || typeof IntersectionObserver === 'undefined') return
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) setActiva((entrada.target as HTMLElement).dataset.ancla ?? null)
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    for (const seccion of secciones) observador.observe(seccion)
    return () => observador.disconnect()
  }, [])

  useEffect(() => {
    if (!abierto) return
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    window.addEventListener('keydown', alPulsar)
    return () => window.removeEventListener('keydown', alPulsar)
  }, [abierto])

  const cerrar = () => setAbierto(false)

  // Las mismas entradas en la barra ancha y en el menú del teléfono; cambia
  // solo lo que cada una añade a cada enlace.
  const enlaces = (extra: (id: string) => React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <>
      {ANTES_DE_PLANES.map((a) => (
        <Ancla key={a.id} id={a.id} enLaPortada={enLaPortada} {...extra(a.id)}>
          {a.etiqueta}
        </Ancla>
      ))}
      {/* `extra` va antes: trae su propio `aria-current`, que aquí no vale. */}
      <Link href="/planes" {...extra('planes')} aria-current={pagina === 'planes' ? 'page' : undefined}>
        Planes
      </Link>
      {DESPUES_DE_PLANES.map((a) => (
        <Ancla key={a.id} id={a.id} enLaPortada={enLaPortada} {...extra(a.id)}>
          {a.etiqueta}
        </Ancla>
      ))}
    </>
  )

  return (
    <header className="p-barra">
      <div className="p-barra-interior">
        <Link href="/" className="p-marca" aria-label="TraumaHub, inicio">
          <img src={ruta('/icon.png')} alt="" width={30} height={30} />
          <span>
            TraumaHub
            <span className="p-marca-sub">Plataforma docente</span>
          </span>
        </Link>

        <nav className="p-barra-anclas" aria-label="Secciones de la página">
          {enlaces((a) => ({
            'aria-current': enLaPortada && activa === a ? 'location' : undefined,
          }))}
        </nav>

        <div className="p-barra-acciones">
          <Link href="/entrar" className="p-boton p-boton-contorno p-boton-sm p-barra-entrar">
            Entrar
          </Link>
          <Ancla id="cotizar" enLaPortada={enLaPortada} className="p-boton p-boton-cian p-boton-sm">
            {textoCotizar}
          </Ancla>
          <button
            type="button"
            className="p-barra-menu"
            aria-expanded={abierto}
            aria-controls={idDelMenu}
            aria-label={abierto ? 'Cerrar el menú' : 'Abrir el menú'}
            onClick={() => setAbierto((a) => !a)}
          >
            {abierto ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
      </div>

      <nav id={idDelMenu} className="p-barra-desplegable" hidden={!abierto} aria-label="Secciones de la página">
        {enlaces(() => ({ onClick: cerrar }))}
        <Link href="/entrar" onClick={cerrar}>
          Entrar
        </Link>
      </nav>
    </header>
  )
}

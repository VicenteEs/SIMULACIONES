'use client'

import { useEffect, useRef } from 'react'

/**
 * El asa con la que se ensancha o se angosta una columna de la consola arrastrando con el ratón (pedido del dueño: «que las pueda
 * agrandar en ancho o achicar en ancho, desplazando con el mouse»).
 *
 * El ancho vive en una **variable de CSS** de la consola (`--ancho-izq`, `--ancho-der`, `--ancho-herramienta`, `--ancho-info`) y no en el
 * estado de React: arrastrar cambia el ancho decenas de veces por segundo, y repintar una consola de cinco mil líneas con un lienzo 3D
 * dentro a cada movimiento era lo que la hacía torpe. Se escribe la variable directamente en el elemento y solo al soltar se guarda en el
 * navegador (`localStorage`), para que la próxima vez se abra como se dejó.
 *
 * Con el teclado: las flechas ← → cambian el ancho de 16 en 16 px; doble clic lo devuelve al de origen.
 */

const PASO_DEL_TECLADO = 16

const leer = (clave: string): number | null => {
  try {
    const v = Number(window.localStorage.getItem(clave))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}
const guardar = (clave: string, valor: number | null) => {
  try {
    if (valor === null) window.localStorage.removeItem(clave)
    else window.localStorage.setItem(clave, String(Math.round(valor)))
  } catch {
    // Sin almacenamiento (ventana privada) el ancho vale hasta recargar, que es lo mejor que se puede hacer.
  }
}

export const limitarAncho = (ancho: number, minimo: number, maximo: number): number => Math.min(maximo, Math.max(minimo, Math.round(ancho)))

export function AsaDeAncho({
  raiz,
  variable,
  clave,
  minimo,
  maximo,
  sentido,
  medir,
  etiqueta,
  className = '',
}: {
  /** El elemento donde se escribe la variable de CSS (la consola entera, para que la hereden todas las columnas). */
  raiz: React.RefObject<HTMLElement | null>
  variable: string
  /** Dónde se guarda en el navegador. */
  clave: string
  minimo: number
  maximo: number
  /** `1` si arrastrar a la derecha ensancha (la columna está a la izquierda del asa); `-1` si la ensancha arrastrar a la izquierda. */
  sentido: 1 | -1
  /** La columna que se mide al empezar a arrastrar. */
  medir: (asa: HTMLElement) => HTMLElement | null
  etiqueta: string
  className?: string
}) {
  const asa = useRef<HTMLDivElement>(null)
  const arrastre = useRef<{ x: number; ancho: number } | null>(null)

  // Al montar, el ancho que se dejó la última vez.
  useEffect(() => {
    const el = raiz.current
    const guardado = leer(clave)
    if (el && guardado) el.style.setProperty(variable, `${limitarAncho(guardado, minimo, maximo)}px`)
  }, [raiz, variable, clave, minimo, maximo])

  const anchoActual = (): number => {
    const columna = asa.current ? medir(asa.current) : null
    return columna ? columna.getBoundingClientRect().width : minimo
  }
  const poner = (ancho: number, persistir: boolean) => {
    const nuevo = limitarAncho(ancho, minimo, maximo)
    raiz.current?.style.setProperty(variable, `${nuevo}px`)
    asa.current?.setAttribute('aria-valuenow', String(nuevo))
    if (persistir) guardar(clave, nuevo)
  }

  return (
    <div
      ref={asa}
      className={`asa-de-ancho ${className}`.trim()}
      role="separator"
      aria-orientation="vertical"
      aria-label={etiqueta}
      aria-valuemin={minimo}
      aria-valuemax={maximo}
      tabIndex={0}
      title="Arrastre para cambiar el ancho (doble clic: el de origen)"
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        arrastre.current = { x: e.clientX, ancho: anchoActual() }
        e.currentTarget.classList.add('arrastrando')
      }}
      onPointerMove={(e) => {
        const a = arrastre.current
        if (!a) return
        poner(a.ancho + sentido * (e.clientX - a.x), false)
      }}
      onPointerUp={(e) => {
        const a = arrastre.current
        arrastre.current = null
        e.currentTarget.classList.remove('arrastrando')
        if (a) poner(a.ancho + sentido * (e.clientX - a.x), true)
      }}
      onPointerCancel={(e) => {
        arrastre.current = null
        e.currentTarget.classList.remove('arrastrando')
      }}
      onDoubleClick={() => {
        raiz.current?.style.removeProperty(variable)
        guardar(clave, null)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const hacia = e.key === 'ArrowRight' ? 1 : -1
        poner(anchoActual() + sentido * hacia * PASO_DEL_TECLADO, true)
      }}
    />
  )
}

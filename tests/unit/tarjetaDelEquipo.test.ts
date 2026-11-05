// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TarjetaDelEquipo } from '@/components/portada/TarjetaDelEquipo'

/**
 * Las tarjetas de «Sobre nosotros» miden todas lo mismo, y la que no cabe se
 * abre con «Ver más» (D-278).
 *
 * Se monta el componente de verdad. happy-dom no maqueta y todo mide 0, así
 * que los altos se le ponen a mano a la ventana y a su contenido, y el
 * `ResizeObserver` es uno falso que avisa cuando la prueba lo dice: como el
 * navegador al llegar la fuente o al cambiar el ancho de la columna.
 */

const observadores = new Set<ObservadorFalso>()

class ObservadorFalso {
  private readonly alCambiar: ResizeObserverCallback
  constructor(alCambiar: ResizeObserverCallback) {
    this.alCambiar = alCambiar
    observadores.add(this)
  }
  observe() {}
  unobserve() {}
  disconnect() {
    observadores.delete(this)
  }
  avisar() {
    this.alCambiar([], this as unknown as ResizeObserver)
  }
}

let raiz: Root | null = null
let contenedor: HTMLElement

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('ResizeObserver', ObservadorFalso)
  contenedor = document.createElement('div')
  document.body.appendChild(contenedor)
})

afterEach(() => {
  act(() => raiz?.unmount())
  raiz = null
  contenedor.remove()
  observadores.clear()
  vi.unstubAllGlobals()
})

function pintar() {
  act(() => {
    raiz = createRoot(contenedor)
    const tarjetaDeAna = createElement(TarjetaDelEquipo, { nombre: 'Ana Pérez', baja: true }, createElement('h3', null, 'Ana Pérez'))
    raiz.render(createElement(StrictMode, null, tarjetaDeAna))
  })
}

const tarjeta = () => contenedor.querySelector<HTMLElement>('article')!
const ventana = () => contenedor.querySelector<HTMLElement>('.p-tarjeta-ventana')!
const boton = () => contenedor.querySelector<HTMLButtonElement>('button.p-tarjeta-mas')

/** Lo que mediría el navegador: el contenido con su alto natural, la ventana con el que le deja la tarjeta. */
function medir({ contenido, hueco }: { contenido: number; hueco: number }) {
  Object.defineProperty(ventana(), 'clientHeight', { configurable: true, value: hueco })
  Object.defineProperty(ventana().firstElementChild!, 'offsetHeight', { configurable: true, value: contenido })
  act(() => {
    for (const observador of [...observadores]) observador.avisar()
  })
}

const pulsar = () => act(() => boton()!.click())

describe('una tarjeta de «Sobre nosotros»', () => {
  it('si su texto cabe, no lleva botón ni desvanecido', () => {
    pintar()
    medir({ contenido: 280, hueco: 300 })
    expect(boton()).toBeNull()
    expect(tarjeta().hasAttribute('data-recortada')).toBe(false)
    // La clase de la columna derecha sigue en la tarjeta (D-277).
    expect(tarjeta().className).toBe('p-tarjeta-equipo p-tarjeta-equipo-baja')
  })

  it('si no cabe, «Ver más» la abre y «Ver menos» la vuelve a cerrar', () => {
    pintar()
    medir({ contenido: 900, hueco: 300 })
    expect(tarjeta().hasAttribute('data-recortada')).toBe(true)
    expect(boton()!.textContent).toBe('Ver más sobre Ana Pérez')
    expect(boton()!.getAttribute('aria-expanded')).toBe('false')
    expect(boton()!.getAttribute('aria-controls')).toBe(ventana().id)
    expect(ventana().id).not.toBe('')

    pulsar()
    expect(tarjeta().hasAttribute('data-abierta')).toBe(true)
    expect(tarjeta().hasAttribute('data-recortada')).toBe(false)
    expect(boton()!.textContent).toBe('Ver menos sobre Ana Pérez')
    expect(boton()!.getAttribute('aria-expanded')).toBe('true')

    pulsar()
    expect(tarjeta().hasAttribute('data-abierta')).toBe(false)
    expect(tarjeta().hasAttribute('data-recortada')).toBe(true)
    expect(boton()!.textContent).toBe('Ver más sobre Ana Pérez')
  })

  it('vuelve a medir cuando cambia de tamaño: si la columna se ensancha y ahora cabe, el botón se va', () => {
    pintar()
    medir({ contenido: 900, hueco: 300 })
    expect(boton()).not.toBeNull()
    medir({ contenido: 290, hueco: 300 })
    expect(boton()).toBeNull()
    expect(tarjeta().hasAttribute('data-recortada')).toBe(false)
  })

  it('un píxel de más no cuenta: los altos llegan redondeados', () => {
    pintar()
    medir({ contenido: 301, hueco: 300 })
    expect(boton()).toBeNull()
    medir({ contenido: 302, hueco: 300 })
    expect(boton()).not.toBeNull()
  })

  it('al cerrarla con su comienzo fuera de la pantalla, la trae de vuelta; si se ve, no mueve nada', () => {
    pintar()
    medir({ contenido: 900, hueco: 300 })
    const desplazar = vi.fn()
    tarjeta().scrollIntoView = desplazar

    pulsar()
    tarjeta().getBoundingClientRect = () => ({ top: -400 }) as DOMRect
    pulsar()
    expect(desplazar).toHaveBeenCalledWith({ block: 'start' })

    desplazar.mockClear()
    pulsar()
    tarjeta().getBoundingClientRect = () => ({ top: 200 }) as DOMRect
    pulsar()
    expect(desplazar).not.toHaveBeenCalled()
  })
})

describe('el alto de las tarjetas, en la hoja de estilos', () => {
  const css = readFileSync(resolve('src/components/portada/portada.css'), 'utf8')

  it('es fijo y sigue al escalón de letra; abierta, la tarjeta mide lo que su texto', () => {
    expect(css).toMatch(
      /\.p-tarjeta-equipo \{ --alto-de-la-tarjeta: calc\(\d+px \* var\(--p-tipo\)\);[^}]*height: var\(--alto-de-la-tarjeta\);/,
    )
    expect(css).toMatch(/\.p-tarjeta-equipo\[data-abierta\] \{ height: auto; \}/)
  })

  it('en el teléfono, una debajo de otra, el alto es un tope y no un fijo', () => {
    expect(css).toMatch(
      /@media \(max-width: 600px\) \{[^@]*\.p-tarjeta-equipo \{ height: auto; max-height: var\(--alto-de-la-tarjeta\); \}\s*\.p-tarjeta-equipo\[data-abierta\] \{ max-height: none; \}/,
    )
  })

  it('sin JavaScript no hay botón, así que tampoco recorte', () => {
    expect(css).toMatch(
      /@media \(scripting: none\) \{\s*\.p-tarjetas-equipo > \.p-tarjeta-equipo \{ height: auto; max-height: none; \}\s*\.p-tarjeta-ventana \{ overflow: visible; \}/,
    )
  })
})

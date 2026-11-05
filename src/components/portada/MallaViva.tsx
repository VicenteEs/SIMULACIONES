'use client'

import { useEffect, useRef } from 'react'
import { MallaDeNodos } from '@/components/MallaDeNodos'

/**
 * La malla de nodos del fondo de la primera pantalla, viva (D-271): los nodos
 * derivan despacio, se enlazan con los que tienen cerca, se apartan del
 * puntero y, al pulsar, una onda los empuja hacia fuera.
 *
 * Solo en la primera pantalla, como pidió el dueño. El resto de la portada y
 * las pantallas de acceso siguen con `MallaDeNodos`, quieta: una red que se
 * mueve detrás de un formulario o de un párrafo largo distrae justo de lo que
 * hay que leer, y en la cabecera es la promesa de que esto se toca.
 *
 * Lo que se escucha es la sección entera y no el lienzo: el lienzo está detrás
 * del texto y de los botones, con `pointer-events: none`, y así sigue. Si el
 * lienzo recibiera el puntero, el botón principal de la cabecera dejaría de
 * poder pulsarse.
 *
 * Sin JavaScript, o con «reducir movimiento», se queda la malla de siempre: el
 * SVG va dentro y el lienzo solo lo tapa cuando ya ha dibujado (`data-malla`).
 * Cuando la cabecera sale de la pantalla, la animación se para; no tiene
 * sentido gastar batería en algo que nadie ve.
 *
 * Los nodos salen de un azar con semilla y repartidos por una rejilla con
 * holgura, no de `Math.random()` a pelo: con el mismo tamaño de ventana la red
 * parte siempre igual, y sin grumos ni huecos, que en un fondo es lo que se
 * nota (lo explica la cabecera de `MallaDeNodos`).
 */

interface Nodo {
  x: number
  y: number
  vx: number
  vy: number
  /** La deriva propia, a la que vuelve cuando el puntero o una onda dejan de empujarlo. */
  bx: number
  by: number
  r: number
  /** Unos pocos nodos más grandes y con halo, para que la red tenga profundidad. */
  centro: boolean
  fase: number
}

interface Onda {
  x: number
  y: number
  radio: number
}

type Rgb = readonly [number, number, number]

/** Un nodo por cada tantos píxeles cuadrados: la densidad no cambia con el tamaño de la pantalla. */
const PIXELES_POR_NODO = 14000
const NODOS_MINIMOS = 26
const NODOS_MAXIMOS = 110
/** Hasta dónde llega el puntero, en píxeles. */
const ALCANCE_DEL_PUNTERO = 210
/** La deriva, en píxeles por segundo: se tiene que notar sin llamar la atención. */
const DERIVA = 15
const VELOCIDAD_MAXIMA = 150
/** Con qué fuerza aparta el puntero a un nodo que tiene encima (px/s²). */
const EMPUJE = 1300
const VELOCIDAD_DE_LA_ONDA = 520
const RADIO_DE_LA_ONDA = 360
/** Más de cuatro ondas a la vez es alguien pulsando sin parar: no aporta nada. */
const ONDAS_A_LA_VEZ = 4
const SEMILLA = 20261105

/** mulberry32: corto, rápido y suficiente para repartir puntos. */
function azarConSemilla(semilla: number) {
  let s = semilla | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** El color de un token, que puede llegar como `#rrggbb` o como `rgb(…)` según de dónde se lea. */
function aRgb(color: string): Rgb | null {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return [n >> 16, (n >> 8) & 255, n & 255]
  }
  const rgb = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

const mezcla = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const rgba = (c: Rgb, alfa: number) =>
  `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${Math.max(0, Math.min(1, alfa)).toFixed(3)})`

export function MallaViva() {
  const contenedor = useRef<HTMLDivElement>(null)
  const lienzo = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const caja = contenedor.current
    const tela = lienzo.current
    const seccion = caja?.parentElement
    if (!caja || !tela || !seccion) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const ctx = tela.getContext('2d')
    if (!ctx) return

    // Los colores salen de los tokens (el contenedor lleva `color: var(--cian)`):
    // si la marca cambia de cian, la red cambia con ella.
    const estilo = getComputedStyle(caja)
    const base: Rgb = aRgb(estilo.color) ?? [30, 159, 224]
    const claro: Rgb = aRgb(estilo.getPropertyValue('--cian-claro')) ?? [127, 208, 245]

    const azar = azarConSemilla(SEMILLA)
    let ancho = 0
    let alto = 0
    let alcance = 150
    let nodos: Nodo[] = []
    let cercania = new Float32Array(0)
    const ondas: Onda[] = []
    const puntero = { x: 0, y: 0, activo: false }
    let cuadro = 0
    let anterior = 0
    let reloj = 0
    let enMarcha = false

    const nodoNuevo = (x: number, y: number, i: number): Nodo => {
      const angulo = azar() * Math.PI * 2
      const rapidez = DERIVA * (0.35 + azar() * 0.65)
      const bx = Math.cos(angulo) * rapidez
      const by = Math.sin(angulo) * rapidez
      const centro = i % 9 === 4
      return { x, y, vx: bx, vy: by, bx, by, r: centro ? 3 + azar() * 1.4 : 1.5 + azar() * 1.5, centro, fase: azar() * Math.PI * 2 }
    }

    const cuantosCaben = (w: number, h: number) =>
      Math.round(Math.min(NODOS_MAXIMOS, Math.max(NODOS_MINIMOS, (w * h) / PIXELES_POR_NODO)))

    // Una rejilla con un nodo por celda, cada uno movido al azar dentro de la
    // suya: cubre la pantalla parejo sin que se vea la rejilla.
    const sembrar = () => {
      const cuantos = cuantosCaben(ancho, alto)
      const columnas = Math.max(1, Math.round(Math.sqrt((cuantos * ancho) / alto)))
      const filas = Math.ceil(cuantos / columnas)
      const celdaX = ancho / columnas
      const celdaY = alto / filas
      nodos = Array.from({ length: cuantos }, (_, i) => {
        const x = ((i % columnas) + 0.15 + azar() * 0.7) * celdaX
        const y = (Math.floor(i / columnas) + 0.15 + azar() * 0.7) * celdaY
        return nodoNuevo(x, y, i)
      })
      cercania = new Float32Array(cuantos)
    }

    const medir = () => {
      const w = caja.clientWidth
      const h = caja.clientHeight
      if (!w || !h) return
      // Dos como mucho: a 3× el lienzo de una pantalla grande pesa el doble y
      // una línea de un píxel no se ve mejor.
      const densidad = Math.min(2, window.devicePixelRatio || 1)
      tela.width = Math.round(w * densidad)
      tela.height = Math.round(h * densidad)
      ctx.setTransform(densidad, 0, 0, densidad, 0, 0)
      const cuantos = cuantosCaben(w, h)
      if (nodos.length === 0 || Math.abs(cuantos - nodos.length) / nodos.length > 0.25) {
        // Primera vez, o la pantalla cambió tanto que la red quedaría rala o
        // apretada: se vuelve a sembrar.
        ancho = w
        alto = h
        sembrar()
      } else {
        for (const n of nodos) {
          n.x *= w / ancho
          n.y *= h / alto
        }
        ancho = w
        alto = h
      }
      alcance = Math.min(175, Math.max(110, Math.max(w, h) * 0.115))
    }

    const mover = (dt: number) => {
      const vuelta = Math.min(1, dt * 1.6)
      for (const n of nodos) {
        if (puntero.activo) {
          const dx = n.x - puntero.x
          const dy = n.y - puntero.y
          const d = Math.hypot(dx, dy)
          if (d > 0.5 && d < ALCANCE_DEL_PUNTERO) {
            const fuerza = EMPUJE * (1 - d / ALCANCE_DEL_PUNTERO) ** 2 * dt
            n.vx += (dx / d) * fuerza
            n.vy += (dy / d) * fuerza
          }
        }
        for (const o of ondas) {
          const dx = n.x - o.x
          const dy = n.y - o.y
          const d = Math.hypot(dx, dy)
          const alFrente = Math.abs(d - o.radio)
          if (d > 0.5 && alFrente < 26) {
            const golpe = 2800 * (1 - alFrente / 26) * (1 - o.radio / RADIO_DE_LA_ONDA) * dt
            n.vx += (dx / d) * golpe
            n.vy += (dy / d) * golpe
          }
        }
        // Lo que el puntero o la onda añadieron se va gastando y el nodo
        // vuelve a su deriva: la red se recompone sola.
        n.vx += (n.bx - n.vx) * vuelta
        n.vy += (n.by - n.vy) * vuelta
        const v = Math.hypot(n.vx, n.vy)
        if (v > VELOCIDAD_MAXIMA) {
          n.vx *= VELOCIDAD_MAXIMA / v
          n.vy *= VELOCIDAD_MAXIMA / v
        }
        n.x += n.vx * dt
        n.y += n.vy * dt
        // Rebotan contra el borde en vez de dar la vuelta por el otro lado: un
        // nodo que salta de un borde al opuesto arrastraría sus aristas a
        // través de toda la pantalla durante un cuadro.
        const margen = 6
        if (n.x < margen || n.x > ancho - margen) {
          n.x = Math.min(ancho - margen, Math.max(margen, n.x))
          const hacia = n.x < ancho / 2 ? 1 : -1
          n.vx = hacia * Math.abs(n.vx)
          n.bx = hacia * Math.abs(n.bx)
        }
        if (n.y < margen || n.y > alto - margen) {
          n.y = Math.min(alto - margen, Math.max(margen, n.y))
          const hacia = n.y < alto / 2 ? 1 : -1
          n.vy = hacia * Math.abs(n.vy)
          n.by = hacia * Math.abs(n.by)
        }
      }
      for (let i = ondas.length - 1; i >= 0; i--) {
        ondas[i].radio += VELOCIDAD_DE_LA_ONDA * dt
        if (ondas[i].radio > RADIO_DE_LA_ONDA) ondas.splice(i, 1)
      }
    }

    const dibujar = () => {
      ctx.clearRect(0, 0, ancho, alto)
      ctx.lineWidth = 1
      for (let i = 0; i < nodos.length; i++) {
        const n = nodos[i]
        cercania[i] = puntero.activo ? Math.max(0, 1 - Math.hypot(n.x - puntero.x, n.y - puntero.y) / ALCANCE_DEL_PUNTERO) : 0
      }

      // Las aristas: más tenues cuanto más largas, y encendidas cerca del puntero.
      const alcance2 = alcance * alcance
      for (let i = 0; i < nodos.length; i++) {
        const a = nodos[i]
        for (let j = i + 1; j < nodos.length; j++) {
          const b = nodos[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          if (dx > alcance || dx < -alcance || dy > alcance || dy < -alcance) continue
          const d2 = dx * dx + dy * dy
          if (d2 > alcance2) continue
          const encendida = Math.max(cercania[i], cercania[j])
          ctx.strokeStyle = rgba(mezcla(base, claro, encendida), (1 - Math.sqrt(d2) / alcance) * (0.3 + 0.5 * encendida))
          ctx.beginPath()
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
          ctx.stroke()
        }
      }

      // Los hilos que salen del puntero hacia los nodos que tiene cerca.
      if (puntero.activo) {
        for (let i = 0; i < nodos.length; i++) {
          if (cercania[i] <= 0) continue
          ctx.strokeStyle = rgba(claro, 0.6 * cercania[i] ** 1.2)
          ctx.beginPath()
          ctx.moveTo(puntero.x, puntero.y)
          ctx.lineTo(nodos[i].x, nodos[i].y)
          ctx.stroke()
        }
      }

      for (const o of ondas) {
        ctx.strokeStyle = rgba(claro, 0.4 * (1 - o.radio / RADIO_DE_LA_ONDA))
        ctx.beginPath()
        ctx.arc(o.x, o.y, o.radio, 0, Math.PI * 2)
        ctx.stroke()
      }

      for (let i = 0; i < nodos.length; i++) {
        const n = nodos[i]
        const c = cercania[i]
        const latido = 0.8 + 0.2 * Math.sin(reloj * 0.9 + n.fase)
        const color = mezcla(base, claro, c)
        const r = n.r * (1 + 0.6 * c)
        if (n.centro) {
          ctx.fillStyle = rgba(color, (0.12 + 0.2 * c) * latido)
          ctx.beginPath()
          ctx.arc(n.x, n.y, r * 2.6, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = rgba(color, (n.centro ? 0.8 : 0.6) * latido + 0.4 * c)
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const paso = (ahora: number) => {
      cuadro = requestAnimationFrame(paso)
      // Un cuadro tras una pausa larga (otra pestaña, la cabecera fuera de la
      // pantalla) no puede contar como un salto de varios segundos.
      const dt = anterior ? Math.min(0.05, (ahora - anterior) / 1000) : 1 / 60
      anterior = ahora
      reloj += dt
      mover(dt)
      dibujar()
    }

    const arrancar = () => {
      if (enMarcha) return
      enMarcha = true
      anterior = 0
      cuadro = requestAnimationFrame(paso)
    }
    const parar = () => {
      enMarcha = false
      cancelAnimationFrame(cuadro)
    }

    const enElLienzo = (e: PointerEvent) => {
      const marco = tela.getBoundingClientRect()
      return { x: e.clientX - marco.left, y: e.clientY - marco.top }
    }
    // Con el dedo no hay «pasar por encima»: un `pointermove` táctil es alguien
    // desplazando la página, y la red no tiene por qué seguirle. El toque sí
    // deja su onda.
    const alMover = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const p = enElLienzo(e)
      puntero.x = p.x
      puntero.y = p.y
      puntero.activo = true
    }
    const alSalir = () => {
      puntero.activo = false
    }
    const alPulsar = (e: PointerEvent) => {
      if (ondas.length >= ONDAS_A_LA_VEZ) return
      const p = enElLienzo(e)
      ondas.push({ x: p.x, y: p.y, radio: 0 })
    }

    medir()
    dibujar()
    // Hasta aquí se veía el SVG; desde ahora, el lienzo, que ya tiene su
    // primer cuadro dibujado y no deja un hueco al cambiar.
    caja.dataset.malla = 'viva'

    const tamano = new ResizeObserver(() => {
      medir()
      if (!enMarcha) dibujar()
    })
    tamano.observe(caja)
    const vista = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) arrancar()
      else parar()
    })
    vista.observe(seccion)
    seccion.addEventListener('pointermove', alMover, { passive: true })
    seccion.addEventListener('pointerleave', alSalir)
    seccion.addEventListener('pointerdown', alPulsar, { passive: true })

    return () => {
      parar()
      tamano.disconnect()
      vista.disconnect()
      seccion.removeEventListener('pointermove', alMover)
      seccion.removeEventListener('pointerleave', alSalir)
      seccion.removeEventListener('pointerdown', alPulsar)
      delete caja.dataset.malla
    }
  }, [])

  return (
    <div ref={contenedor} className="p-hero-fondo" aria-hidden="true">
      <MallaDeNodos className="p-hero-malla" />
      <canvas ref={lienzo} className="p-hero-lienzo" />
    </div>
  )
}

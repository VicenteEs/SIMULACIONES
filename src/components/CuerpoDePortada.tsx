'use client'

import { useEffect, useRef, useState } from 'react'
import descripcion from '@/atlas/portada.json'
import { ruta } from '@/lib/rutas'

/**
 * El cuerpo completo de la portada: una nube de puntos muestreada del atlas.
 *
 * No es el visor del atlas ni lo usa. Aquel descarga 33 MB y deja girar, apagar
 * y buscar; esto es la figura que acompaña al saludo, pesa 275 KB y no se puede
 * tocar. Qué archivo lee y por qué es de puntos está en
 * `scripts/atlas/portada.mjs`, que es quien lo genera.
 *
 * El movimiento es un vaivén de unos veinte grados a cada lado, con un periodo
 * de medio minuto. Se pidió sutil, y además está al lado de un texto que se
 * lee: una vuelta completa, o cualquier cosa que reaccione al ratón, compite con
 * el titular. Con «reducir movimiento» activado en el sistema no se mueve nada.
 */

/** Hasta dónde gira a cada lado, en radianes, y cuánto tarda en ir y volver. */
const AMPLITUD = 0.36
const PERIODO_S = 32

/** El ángulo en que se queda quieta: de tres cuartos se lee el volumen; de frente, no. */
const ANGULO_EN_REPOSO = 0.3

const COLOR_DE_ESQUELETO = 0xa9def8
const COLOR_DE_PIEL = 0x5cb8e8

/**
 * Deshace el empaquetado de `portada.mjs`: por cada capa, tres planos de enteros
 * de 16 bits —alturas como diferencias, luego x, luego z— que se convierten en
 * posiciones en metros, centradas en la caja para que el giro sea sobre el eje
 * del cuerpo y no sobre un pie.
 */
function desempaquetar(bufer: ArrayBuffer): Float32Array[] {
  if (bufer.byteLength !== descripcion.bytes) {
    // El mismo tropiezo que vigila `cargarPaquetes`: un proxy que toca el
    // `Content-Encoding: gzip` entrega el gzip crudo con un 200.
    throw new Error(`portada.bin.gz llegó con ${bufer.byteLength} bytes y se esperaban ${descripcion.bytes}.`)
  }
  const enteros = new Uint16Array(bufer)
  const [minimo, maximo] = descripcion.caja
  const escala = [0, 1, 2].map((k) => (maximo[k] - minimo[k]) / descripcion.pasos)
  const centro = [0, 1, 2].map((k) => (maximo[k] + minimo[k]) / 2)

  let desde = 0
  return descripcion.capas.map((capa) => {
    const n = capa.puntos
    const posiciones = new Float32Array(n * 3)
    let altura = 0
    for (let i = 0; i < n; i++) {
      altura += enteros[desde + i]
      posiciones[i * 3] = minimo[0] + enteros[desde + n + i] * escala[0] - centro[0]
      posiciones[i * 3 + 1] = minimo[1] + altura * escala[1] - centro[1]
      posiciones[i * 3 + 2] = minimo[2] + enteros[desde + 2 * n + i] * escala[2] - centro[2]
    }
    desde += n * 3
    return posiciones
  })
}

export function CuerpoDePortada() {
  const marco = useRef<HTMLDivElement>(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    const contenedor = marco.current
    if (!contenedor) return

    const aborto = new AbortController()
    let desmontar = () => {}

    const montar = async () => {
      // `three` se pide aquí y no arriba: importado en la cabecera entraría en
      // el paquete de la portada, que es la página que abre todo el mundo, para
      // pintar un adorno que puede no llegar a verse.
      const [THREE, respuesta] = await Promise.all([
        import('three'),
        fetch(ruta(`/atlas/portada.bin.gz?v=${descripcion.version}`), { signal: aborto.signal }),
      ])
      if (!respuesta.ok) throw new Error(`portada.bin.gz respondió ${respuesta.status}.`)
      const capas = desempaquetar(await respuesta.arrayBuffer())
      if (aborto.signal.aborted) return

      const render = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      render.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      render.setClearColor(0x000000, 0)
      contenedor.appendChild(render.domElement)

      const escena = new THREE.Scene()
      const cuerpo = new THREE.Group()
      escena.add(cuerpo)

      const desechables: { dispose(): void }[] = []
      capas.forEach((posiciones, i) => {
        const esEsqueleto = descripcion.capas[i].nombre === 'esqueleto'
        const geometria = new THREE.BufferGeometry()
        geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3))
        const material = new THREE.PointsMaterial({
          color: esEsqueleto ? COLOR_DE_ESQUELETO : COLOR_DE_PIEL,
          // En píxeles y sin atenuar con la distancia: el cuerpo no se acerca
          // ni se aleja, y un punto que cambia de tamaño al girar parpadea.
          size: esEsqueleto ? 1.4 : 1.2,
          sizeAttenuation: false,
          transparent: true,
          // Muy por debajo de lo que parecería razonable, y es a propósito: con
          // mezcla aditiva los 60.000 puntos del esqueleto se suman entre sí, y a
          // 0,85 —lo primero que se probó— el hueso salía quemado en blanco, una
          // mancha sin costillas. A 0,16 cada punto casi no se ve y es la
          // densidad la que dibuja.
          opacity: esEsqueleto ? 0.16 : 0.1,
          // Aditivo y sin escribir profundidad: donde se amontonan puntos —el
          // cráneo, la pelvis— brilla más, que es como se lee una tomografía, y
          // la piel de delante no tapa el hueso de detrás.
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        cuerpo.add(new THREE.Points(geometria, material))
        desechables.push(geometria, material)
      })

      const [minimo, maximo] = descripcion.caja
      const alto = maximo[1] - minimo[1]
      const ancho = maximo[0] - minimo[0]
      const camara = new THREE.PerspectiveCamera(28, 1, 0.1, 20)

      const ajustar = () => {
        const w = contenedor.clientWidth
        const h = contenedor.clientHeight
        if (w === 0 || h === 0) return
        render.setSize(w, h, false)
        camara.aspect = w / h
        // La distancia a la que cabe entero con algo de aire, mande el alto o
        // mande el ancho: en un móvil la tarjeta pasa de vertical a apaisada.
        const mitad = Math.tan((camara.fov * Math.PI) / 360)
        const porAlto = (alto * 1.08) / (2 * mitad)
        const porAncho = (ancho * 1.15) / (2 * mitad * camara.aspect)
        camara.position.set(0, 0, Math.max(porAlto, porAncho))
        camara.updateProjectionMatrix()
      }

      const quieto = window.matchMedia('(prefers-reduced-motion: reduce)')
      let cuadro = 0
      let aLaVista = true
      const inicio = performance.now()

      const pintar = (ahora: number) => {
        cuadro = 0
        const t = (ahora - inicio) / 1000
        cuerpo.rotation.y = quieto.matches
          ? ANGULO_EN_REPOSO
          : ANGULO_EN_REPOSO + AMPLITUD * Math.sin((2 * Math.PI * t) / PERIODO_S)
        render.render(escena, camara)
        // Con movimiento reducido basta un cuadro; los siguientes los pide
        // `ajustar` si cambia el tamaño.
        if (!quieto.matches && aLaVista && !document.hidden) cuadro = requestAnimationFrame(pintar)
      }
      const pedirCuadro = () => {
        if (cuadro === 0) cuadro = requestAnimationFrame(pintar)
      }

      // Fuera de pantalla o con la pestaña en segundo plano no se pinta: la
      // portada sigue abierta horas en la pestaña de alguien que está en otra.
      const vigia = new IntersectionObserver(([entrada]) => {
        aLaVista = entrada.isIntersecting
        if (aLaVista) pedirCuadro()
      })
      vigia.observe(contenedor)
      const medidor = new ResizeObserver(() => {
        ajustar()
        pedirCuadro()
      })
      medidor.observe(contenedor)
      document.addEventListener('visibilitychange', pedirCuadro)
      quieto.addEventListener('change', pedirCuadro)

      ajustar()
      pedirCuadro()
      setListo(true)

      desmontar = () => {
        cancelAnimationFrame(cuadro)
        vigia.disconnect()
        medidor.disconnect()
        document.removeEventListener('visibilitychange', pedirCuadro)
        quieto.removeEventListener('change', pedirCuadro)
        for (const d of desechables) d.dispose()
        // `dispose()` solo no suelta el contexto de WebGL (ver el mismo cierre
        // en `VisorAtlas`), y un navegador admite pocos a la vez: entrar y salir
        // de la portada unas cuantas veces dejaría sin contexto al visor de verdad.
        render.forceContextLoss()
        render.dispose()
        render.domElement.remove()
      }
    }

    montar().catch(() => {
      // Sin WebGL, sin el archivo o con la descarga abortada, la tarjeta se
      // queda con su fondo y su pie. Es un adorno: no merece un mensaje de error
      // en la primera pantalla que ve quien acaba de entrar.
    })

    return () => {
      aborto.abort()
      desmontar()
    }
  }, [])

  return (
    <div
      ref={marco}
      className={listo ? 'cuerpo-portada cuerpo-portada-listo' : 'cuerpo-portada'}
      role="img"
      aria-label="Cuerpo humano completo: esqueleto y silueta, reconstruidos a partir del atlas anatómico"
    />
  )
}

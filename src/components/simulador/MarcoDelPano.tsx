'use client'

import { useEffect, useRef, useState } from 'react'
import { ASAS_DEL_MARCO, NOMBRE_DEL_ASA, asasDelMarco, mismaZona, moverElMarco, type AsaDelMarco, type FormaDelRelieve, type ZonaDelPano } from '@/lib/campoQuirurgico'
import type { MandoDelLienzo } from './LienzoQuirurgico'

/**
 * El marco de la ventana del paño, encima del lienzo (P-014 E6).
 *
 * El dueño pidió elegir lo que queda descubierto con un «marco ajustable»: el borde de la ventana dibujado sobre
 * el paciente, con un asa en cada lado y otra en el centro. Se coge un asa y el paño se abre por donde va el
 * puntero, de verdad y mientras se arrastra —recortar la tela son diez milisegundos—; al soltar, la zona se
 * escribe en el caso.
 *
 * Va en HTML encima del lienzo y no dentro de la escena, por dos razones. La primera, que el lienzo ya reparte
 * el puntero entre quince gestos según el modo —trazar, mover, coser, perforar…— y un asa metida ahí tendría que
 * ganarles a todos sin romper ninguno; un botón que captura su propio puntero no se cruza con nadie. La segunda,
 * que un botón se alcanza con el tabulador y se mueve con las flechas, y una malla no.
 *
 * Dónde cae cada cosa lo dice el lienzo (`marcoDelPano`), que es quien tiene la cámara. Se le pregunta en cada
 * cuadro y se escribe directo en el DOM, sin pasar por el estado de React: mientras se orbita cambia sesenta
 * veces por segundo, y volver a pintar el componente cada vez no añade nada.
 */

/** Lo que se corre el borde con cada pulsación de flecha, y con mayúsculas. En metros. */
const PASO_DE_TECLADO = 0.005
const PASO_LARGO_DE_TECLADO = 0.02

const DIRECCION_DE_LA_TECLA: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

interface Arrastre {
  asa: AsaDelMarco
  puntero: number
  /** La altura de la escena a la que estaba el asa al cogerla: el plano sobre el que se arrastra. */
  altura: number
  limites: FormaDelRelieve
  /** La zona al cogerla: a ella se vuelve si el arrastre se cancela. */
  desde: ZonaDelPano
  /** Lo que va del puntero al asa, en el cuerpo: sin él, el borde daría un salto hasta el puntero al empezar. */
  agarre: [number, number]
}

export function MarcoDelPano({
  mando,
  zona,
  alCambiar,
}: {
  mando: React.RefObject<MandoDelLienzo | null>
  /** La ventana que tiene el paño del caso ahora. */
  zona: ZonaDelPano
  /** Se soltó un asa, o se movió con el teclado: la zona que queda. */
  alCambiar: (zona: ZonaDelPano) => void
}) {
  const raiz = useRef<HTMLDivElement>(null)
  const halo = useRef<SVGPathElement>(null)
  const linea = useRef<SVGPathElement>(null)
  const botones = useRef<Partial<Record<AsaDelMarco, HTMLButtonElement | null>>>({})
  /** La zona que se dibuja: la del caso, o la que se lleva en la mano mientras dura un arrastre. */
  const vigente = useRef(zona)
  const arrastre = useRef<Arrastre | null>(null)
  /** La zona que falta por probar en el lienzo. Se aplica una vez por cuadro, no una por evento del ratón. */
  const porProbar = useRef<ZonaDelPano | null>(null)
  const [cogida, setCogida] = useState<AsaDelMarco | null>(null)

  // Lo que diga el caso manda, salvo mientras se arrastra: ahí manda la mano.
  useEffect(() => {
    if (!arrastre.current) vigente.current = zona
  }, [zona])

  useEffect(() => {
    let cuadro = 0
    let trazoAnterior = ''
    const dibujar = () => {
      cuadro = requestAnimationFrame(dibujar)
      const lienzo = mando.current
      const caja = raiz.current
      if (!lienzo || !caja) return
      if (porProbar.current) {
        lienzo.probarLaZonaDelPano(porProbar.current)
        porProbar.current = null
      }
      const marco = lienzo.marcoDelPano(vigente.current)
      const padre = caja.offsetParent?.getBoundingClientRect()
      if (!marco || !padre) {
        caja.style.visibility = 'hidden'
        return
      }
      caja.style.visibility = ''
      caja.style.left = `${marco.caja.izquierda - padre.left}px`
      caja.style.top = `${marco.caja.arriba - padre.top}px`
      caja.style.width = `${marco.caja.ancho}px`
      caja.style.height = `${marco.caja.alto}px`
      // El borde, cortado donde un punto cae detrás de la cámara: unirlo con el siguiente cruzaría la pantalla.
      let trazo = ''
      let abierto = false
      let entero = true
      for (const punto of marco.contorno) {
        if (!punto) {
          abierto = false
          entero = false
          continue
        }
        trazo += `${abierto ? 'L' : 'M'}${punto.x.toFixed(1)} ${punto.y.toFixed(1)}`
        abierto = true
      }
      if (entero && trazo) trazo += 'Z'
      if (trazo !== trazoAnterior) {
        halo.current?.setAttribute('d', trazo)
        linea.current?.setAttribute('d', trazo)
        trazoAnterior = trazo
      }
      for (const asa of ASAS_DEL_MARCO) {
        const boton = botones.current[asa]
        if (!boton) continue
        const punto = marco.asas[asa]
        boton.style.visibility = punto ? '' : 'hidden'
        if (punto) boton.style.transform = `translate(${punto.x.toFixed(1)}px, ${punto.y.toFixed(1)}px)`
      }
    }
    cuadro = requestAnimationFrame(dibujar)
    return () => {
      cancelAnimationFrame(cuadro)
      // Si el marco se va con un asa en la mano —se cambió de pestaña a medio arrastre—, el paño vuelve al del caso.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- el mando es el del lienzo, no un nodo de este componente: se quiere el de ahora, que al montarse el marco aún podía no estar
      if (arrastre.current) mando.current?.probarLaZonaDelPano(null)
      arrastre.current = null
    }
  }, [mando])

  const coger = (asa: AsaDelMarco) => (evento: React.PointerEvent<HTMLButtonElement>) => {
    const lienzo = mando.current
    if (evento.button !== 0 || !lienzo || arrastre.current) return
    const punto = lienzo.marcoDelPano(vigente.current)?.asas[asa]
    const limites = lienzo.limitesDelPano()
    if (!punto || !limites) return
    evento.preventDefault()
    evento.currentTarget.setPointerCapture(evento.pointerId)
    evento.currentTarget.focus()
    const bajoElPuntero = lienzo.puntoDelCuerpo(evento.clientX, evento.clientY, punto.altura)
    const enElCuerpo = asasDelMarco(vigente.current)[asa]
    arrastre.current = {
      asa,
      puntero: evento.pointerId,
      altura: punto.altura,
      limites,
      desde: vigente.current,
      agarre: bajoElPuntero ? [enElCuerpo[0] - bajoElPuntero[0], enElCuerpo[1] - bajoElPuntero[1]] : [0, 0],
    }
    setCogida(asa)
  }

  const llevar = (evento: React.PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current
    if (!a || evento.pointerId !== a.puntero) return
    const bajoElPuntero = mando.current?.puntoDelCuerpo(evento.clientX, evento.clientY, a.altura)
    // Con la cámara de canto no hay punto que seguir: el borde se queda donde estaba hasta que el puntero vuelva.
    if (!bajoElPuntero) return
    const nueva = moverElMarco(a.desde, a.asa, [bajoElPuntero[0] + a.agarre[0], bajoElPuntero[1] + a.agarre[1]], a.limites)
    if (mismaZona(nueva, vigente.current)) return
    vigente.current = nueva
    porProbar.current = nueva
  }

  const soltar = (evento: React.PointerEvent<HTMLButtonElement>) => {
    const a = arrastre.current
    if (!a || evento.pointerId !== a.puntero) return
    arrastre.current = null
    setCogida(null)
    if (evento.type === 'pointercancel') {
      // El navegador se llevó el gesto (otra ventana, un desplazamiento táctil): no se guarda medio arrastre.
      vigente.current = a.desde
      porProbar.current = null
      mando.current?.probarLaZonaDelPano(null)
      return
    }
    if (!mismaZona(vigente.current, a.desde)) alCambiar(vigente.current)
  }

  const conElTeclado = (asa: AsaDelMarco) => (evento: React.KeyboardEvent<HTMLButtonElement>) => {
    const lienzo = mando.current
    if (evento.key === 'Escape' && arrastre.current) {
      // Soltar sin guardar: el puntero sigue capturado, pero ya no arrastra nada.
      vigente.current = arrastre.current.desde
      arrastre.current = null
      porProbar.current = null
      setCogida(null)
      lienzo?.probarLaZonaDelPano(null)
      return
    }
    const tecla = DIRECCION_DE_LA_TECLA[evento.key]
    const limites = lienzo?.limitesDelPano()
    if (!tecla || !lienzo || !limites || arrastre.current) return
    evento.preventDefault()
    // La flecha manda en la pantalla y el borde se mueve en el cuerpo, y entre los dos está la cámara: boca abajo
    // la derecha de la pantalla es la otra. Se prueban los movimientos que el asa admite y se queda el que más se
    // parece, en pantalla, a la flecha pulsada.
    const paso = evento.shiftKey ? PASO_LARGO_DE_TECLADO : PASO_DE_TECLADO
    const [x, y] = asasDelMarco(vigente.current)[asa]
    const candidatos: [number, number][] =
      asa === 'xMin' || asa === 'xMax'
        ? [[x - paso, y], [x + paso, y]]
        : asa === 'yMin' || asa === 'yMax'
          ? [[x, y - paso], [x, y + paso]]
          : [[x - paso, y], [x + paso, y], [x, y - paso], [x, y + paso]]
    const ahora = lienzo.marcoDelPano(vigente.current)?.asas[asa]
    if (!ahora) return
    let mejor: ZonaDelPano | null = null
    let parecido = 0.35
    for (const hasta of candidatos) {
      const candidata = moverElMarco(vigente.current, asa, hasta, limites)
      const donde = lienzo.marcoDelPano(candidata)?.asas[asa]
      if (!donde || mismaZona(candidata, vigente.current)) continue
      const dx = donde.x - ahora.x
      const dy = donde.y - ahora.y
      const largo = Math.hypot(dx, dy)
      if (largo < 1e-3) continue
      const coseno = (dx * tecla[0] + dy * tecla[1]) / largo
      if (coseno > parecido) {
        parecido = coseno
        mejor = candidata
      }
    }
    if (!mejor) return
    vigente.current = mejor
    lienzo.probarLaZonaDelPano(mejor)
    alCambiar(mejor)
  }

  return (
    <div className="consola-marco-pano" ref={raiz} style={{ visibility: 'hidden' }}>
      <svg aria-hidden focusable="false">
        <path className="consola-marco-pano-halo" ref={halo} />
        <path className="consola-marco-pano-linea" ref={linea} />
      </svg>
      {ASAS_DEL_MARCO.map((asa) => (
        <button
          key={asa}
          type="button"
          ref={(nodo) => {
            botones.current[asa] = nodo
          }}
          className={`consola-marco-pano-asa${asa === 'centro' ? ' del-centro' : ''}${cogida === asa ? ' cogida' : ''}`}
          aria-label={`${NOMBRE_DEL_ASA[asa]}. Arrastre, o use las flechas.`}
          title={NOMBRE_DEL_ASA[asa]}
          onPointerDown={coger(asa)}
          onPointerMove={llevar}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          onKeyDown={conElTeclado(asa)}
        />
      ))}
    </div>
  )
}

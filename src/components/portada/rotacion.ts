'use client'

import { useEffect, useState, useSyncExternalStore, type AnimationEvent, type RefObject } from 'react'

/**
 * Lo que comparten las dos cosas de la portada que cambian solas (D-272,
 * D-273): el carrusel de «El problema» y el selector de capas de Estudia.
 *
 * Ninguna de las dos lleva `setInterval`. El reloj es la animación de su barra
 * de progreso, y el paso siguiente llega con su `animationend`: así la barra
 * y el cambio no se pueden desacompasar, y pausar es pausar la animación
 * (`animation-play-state`), que se queda donde estaba y sigue desde ahí. Con un
 * intervalo de JavaScript, la barra seguía llenándose durante la pausa o el
 * cambio llegaba con la barra a medias.
 *
 * Esa elección tiene una trampa, y por eso existe `prefiereMenosMovimiento`:
 * con «reducir movimiento», `estilos.css` acorta toda animación a 0,01 ms con
 * `!important`. Una barra de progreso acortada termina al instante, y su
 * `animationend` haría girar el carrusel sin parar. Quien pidió menos
 * movimiento no tiene rotación automática, y el manejador lo comprueba otra
 * vez en el momento —no en el estado de React—, porque entre que el servidor
 * pinta y React hidrata la barra ya corre y puede terminar.
 */

const CONSULTA = '(prefers-reduced-motion: reduce)'

function suscribir(aviso: () => void) {
  const consulta = window.matchMedia(CONSULTA)
  consulta.addEventListener('change', aviso)
  return () => consulta.removeEventListener('change', aviso)
}

/** Si el sistema pide menos movimiento. El servidor dice que no, y el navegador corrige al hidratar. */
export function useMenosMovimiento(): boolean {
  return useSyncExternalStore(suscribir, () => window.matchMedia(CONSULTA).matches, () => false)
}

/** Lo mismo, preguntado en el momento: para los manejadores de eventos. */
export function prefiereMenosMovimiento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(CONSULTA).matches === true
}

/**
 * Si el elemento está a la vista. Mientras no lo está, lo que rota se queda
 * quieto: quien llega a la sección la encuentra en la primera tarjeta, no en
 * la que tocara por el tiempo que pasó leyendo arriba.
 *
 * Sin `IntersectionObserver` dice que no, y nada rota: la tarjeta y la capa
 * se quedan en la primera y los mandos siguen funcionando, que es lo mismo
 * que hace `RevelarAlBajar` sin él (no esconde nada). Ponerlo a `true` dentro
 * del efecto pintaba dos veces cada sección al hidratar, y el lint de React lo
 * marca como error.
 */
export function useEnPantalla(referencia: RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const nodo = referencia.current
    if (!nodo || typeof IntersectionObserver === 'undefined') return
    const observador = new IntersectionObserver((entradas) => setVisible(entradas.some((e) => e.isIntersecting)), {
      threshold: 0.35,
    })
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [referencia])
  return visible
}

/** Si un `animationend` es el de la barra de progreso misma y no el de algo que lleva dentro. */
export const esElFinDeLaBarra = (e: AnimationEvent<HTMLElement>) =>
  e.target === e.currentTarget && e.animationName === 'p-progreso'

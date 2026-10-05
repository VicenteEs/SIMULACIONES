'use client'

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { Hand, X } from 'lucide-react'

/**
 * ¿Se maneja esta pantalla con el dedo?
 *
 * Con `useSyncExternalStore` y no con un efecto que lo apunte en un estado: en
 * el servidor no hay pantalla, así que el primer pintado dice «no» en los dos
 * lados —y no hay desajuste de hidratación— y en cuanto el navegador contesta
 * se repinta. Si la tableta conecta un ratón a media sesión, también.
 */
const CONSULTA = '(pointer: coarse)'
function suscribir(aviso: () => void) {
  const consulta = window.matchMedia(CONSULTA)
  consulta.addEventListener('change', aviso)
  return () => consulta.removeEventListener('change', aviso)
}
export function useEsTactil(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  )
}

/**
 * Un lienzo 3D que no se queda con el pulgar.
 *
 * En un teléfono el visor ocupa casi toda la pantalla, y `OrbitControls` pide
 * `touch-action: none`: el dedo que bajaba por la ficha caía sobre el modelo y
 * en vez de desplazar la página giraba el hueso. El residente quedaba atrapado
 * en el visor, a veces sin forma de pasar al texto de debajo.
 *
 * En una pantalla táctil el lienzo nace dormido: una capa encima deja pasar el
 * desplazamiento (`touch-action: pan-y`) y, al tocarla, el lienzo despierta y
 * ya responde a uno y dos dedos. «Soltar» lo vuelve a dormir. Con ratón no hay
 * capa ni cambia nada: la rueda solo actúa con el puntero encima, que es un
 * gesto deliberado.
 *
 * La capa es un `<button>` porque es un control: lo encuentra el teclado y lo
 * anuncia el lector de pantalla, aunque con teclado el visor ya se maneja con
 * las flechas sin necesitarla.
 */
export function BloqueoTactil({ children, activo = true }: { children: ReactNode; activo?: boolean }) {
  const tactil = useEsTactil()
  const [despierto, setDespierto] = useState(false)

  if (!activo) return <>{children}</>
  const dormido = tactil && !despierto

  return (
    <div className={`bloqueo-tactil${dormido ? ' bloqueo-tactil-dormido' : ''}`}>
      {children}
      {dormido ? (
        <button
          type="button"
          className="bloqueo-tactil-capa"
          onClick={() => setDespierto(true)}
          aria-label="Activar el modelo para girarlo con el dedo"
        >
          <span className="bloqueo-tactil-pista" aria-hidden="true">
            <Hand size={16} />
            Toque para mover el modelo
          </span>
        </button>
      ) : null}
      {tactil && despierto ? (
        <button type="button" className="bloqueo-tactil-soltar" onClick={() => setDespierto(false)}>
          <X size={16} aria-hidden="true" />
          Soltar
        </button>
      ) : null}
    </div>
  )
}

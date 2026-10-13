import { esPasosCopiados, type PasosCopiados } from '@/lib/pasosCopiados'

/**
 * El portapapeles de pasos, en el navegador.
 *
 * Aparte de `pasosCopiados.ts` por lo único que lo distingue: toca
 * `localStorage`, que puede no estar (navegación privada, almacenamiento
 * bloqueado, cuota llena) o tirar al leerlo. Ninguna de esas cosas debe romper
 * el editor: sin almacenamiento, copiar avisa de que no pudo y pegar dice que no
 * hay nada, pero el caso se sigue pudiendo escribir.
 */

const CLAVE = 'trauma-portapapeles-de-pasos'

export function copiarAlPortapapeles(copia: PasosCopiados): boolean {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(copia))
    return true
  } catch {
    return false
  }
}

export function leerDelPortapapeles(): PasosCopiados | null {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) return null
    const valor: unknown = JSON.parse(crudo)
    return esPasosCopiados(valor) ? valor : null
  } catch {
    return null
  }
}

export function vaciarElPortapapeles(): void {
  try {
    localStorage.removeItem(CLAVE)
  } catch {
    // Nada que hacer: si no se puede escribir, tampoco hay nada guardado que molestar.
  }
}

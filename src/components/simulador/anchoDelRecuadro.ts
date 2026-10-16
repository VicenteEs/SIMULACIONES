import { ANCHO_INICIAL_DEL_RECUADRO, limitarAnchoDelRecuadro } from '@/lib/radiografia'

/**
 * El ancho que el residente le dio al recuadro de la fluoroscopia, guardado en su navegador (D-175).
 *
 * Es una comodidad de quien mira y no un dato del caso: no viaja al servidor y no lo ve nadie más. Se guarda con
 * `localStorage` y todo va dentro de un `try`: en una ventana privada, con los datos del sitio bloqueados o en el
 * servidor —donde esto también se llama, al montar el estado—, no hay almacenamiento, y la consola tiene que
 * pintarse igual con el ancho de siempre.
 */
const CLAVE = 'traumahub.fluoroscopia.ancho'

export function anchoGuardadoDelRecuadro(): number {
  try {
    if (typeof window === 'undefined') return ANCHO_INICIAL_DEL_RECUADRO
    const guardado = Number(window.localStorage.getItem(CLAVE))
    return Number.isFinite(guardado) && guardado > 0 ? limitarAnchoDelRecuadro(guardado) : ANCHO_INICIAL_DEL_RECUADRO
  } catch {
    return ANCHO_INICIAL_DEL_RECUADRO
  }
}

export function guardarAnchoDelRecuadro(ancho: number): void {
  try {
    window.localStorage.setItem(CLAVE, String(Math.round(ancho)))
  } catch {
    // Sin almacenamiento: el ancho vale esta visita y se olvida.
  }
}

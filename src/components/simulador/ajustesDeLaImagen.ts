import { AJUSTES_DE_LA_IMAGEN_POR_OMISION, limitarAjustes, type AjustesDeLaImagen } from '@/lib/radiografia'

/**
 * El modo de la fluoroscopia y los mandos de la imagen que cada quien eligió, guardados en su navegador (P-003, E2).
 *
 * Como el ancho del recuadro (`anchoDelRecuadro.ts`), es una comodidad de quien mira y no un dato del caso: no viaja
 * al servidor y no lo ve nadie más. `localStorage` y todo dentro de un `try`: en una ventana privada, con los datos del
 * sitio bloqueados o en el servidor —donde el estado también se arma— no hay almacenamiento, y la consola tiene que
 * pintarse igual con el modo y los valores de siempre.
 */

/** «disparo»: una toma por pulsación, la que se mira; «video»: la imagen en vivo, que cuenta segundos de exposición. */
export type ModoDeEscopia = 'disparo' | 'video'

export const MODOS_DE_ESCOPIA: readonly { valor: ModoDeEscopia; etiqueta: string; ayuda: string }[] = [
  { valor: 'disparo', etiqueta: 'Disparo', ayuda: 'Una toma cada vez que se pulsa «Disparar», como en pabellón. La imagen se queda.' },
  { valor: 'video', etiqueta: 'Vídeo', ayuda: 'La imagen en vivo mientras esté encendida. Cuenta los segundos de exposición.' },
]

const CLAVE_DEL_MODO = 'traumahub.fluoroscopia.modo'
const CLAVE_DE_LOS_AJUSTES = 'traumahub.fluoroscopia.ajustes'

/** Por omisión es el disparo: es lo que se hace en pabellón, y el vídeo es la opción (pedido de Cristóbal). */
export function modoGuardadoDeEscopia(): ModoDeEscopia {
  try {
    if (typeof window === 'undefined') return 'disparo'
    return window.localStorage.getItem(CLAVE_DEL_MODO) === 'video' ? 'video' : 'disparo'
  } catch {
    return 'disparo'
  }
}

export function guardarModoDeEscopia(modo: ModoDeEscopia): void {
  try {
    window.localStorage.setItem(CLAVE_DEL_MODO, modo)
  } catch {
    // Sin almacenamiento: el modo vale esta visita y se olvida.
  }
}

export function ajustesGuardadosDeLaImagen(): AjustesDeLaImagen {
  try {
    if (typeof window === 'undefined') return { ...AJUSTES_DE_LA_IMAGEN_POR_OMISION }
    const crudo = window.localStorage.getItem(CLAVE_DE_LOS_AJUSTES)
    // Lo guardado puede venir de una versión anterior o a mano: `limitarAjustes` deja pasar solo lo válido.
    return limitarAjustes(crudo ? (JSON.parse(crudo) as Partial<AjustesDeLaImagen>) : null)
  } catch {
    return { ...AJUSTES_DE_LA_IMAGEN_POR_OMISION }
  }
}

export function guardarAjustesDeLaImagen(ajustes: AjustesDeLaImagen): void {
  try {
    window.localStorage.setItem(CLAVE_DE_LOS_AJUSTES, JSON.stringify(ajustes))
  } catch {
    // Sin almacenamiento: los mandos valen esta visita y se olvidan.
  }
}

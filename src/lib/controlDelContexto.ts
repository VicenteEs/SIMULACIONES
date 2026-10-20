/**
 * Qué hacer cuando el navegador le quita a la página el contexto de WebGL (P-004 E2).
 *
 * Cristóbal lo contó así: «me maneé mucho y me fui a blanco; reinicio». El panel seguía vivo y el lienzo quedó
 * en blanco, así que no se cayó la página: se paró el dibujo. Las causas son dos y las dos acaban igual. El
 * navegador puede **quitar el contexto** (memoria de la tarjeta agotada, el equipo que cambia de gráfica, una
 * pestaña que lleva mucho abierta), y three.js sin un manejador de `webglcontextlost` deja el lienzo muerto
 * para siempre. O **una excepción dentro del bucle de dibujo** corta el `requestAnimationFrame`, y la próxima
 * vez que algo redimensiona el lienzo —abrir el panel de la fluoroscopia— el navegador lo borra y nadie lo
 * vuelve a pintar.
 *
 * Esto es la parte que se puede probar sin WebGL: en qué estado está el contexto, qué se le dice a quien opera
 * y cuándo se le ofrece volver a montar el lienzo. El lienzo solo avisa de lo que ocurre.
 */

/** Cuánto se espera a que el navegador devuelva solo el contexto antes de ofrecer volver a montar el lienzo. */
export const ESPERA_ANTES_DE_OFRECER_MS = 3000

export type EstadoDelContexto =
  | { fase: 'vivo' }
  | { fase: 'perdido'; desde: number }
  | { fase: 'recuperado'; en: number }

export const CONTEXTO_VIVO: EstadoDelContexto = { fase: 'vivo' }

/** El navegador quitó el contexto. Perderlo dos veces seguidas no reinicia la cuenta de la espera. */
export function alPerderse(estado: EstadoDelContexto, ahora: number): EstadoDelContexto {
  return estado.fase === 'perdido' ? estado : { fase: 'perdido', desde: ahora }
}

/** El navegador devolvió el contexto. Si nunca se había perdido, no hay nada que recuperar. */
export function alRestaurarse(estado: EstadoDelContexto, ahora: number): EstadoDelContexto {
  return estado.fase === 'perdido' ? { fase: 'recuperado', en: ahora } : estado
}

/** El aviso de «recuperado» se queda un rato a la vista y luego se va. */
export const TIEMPO_DEL_AVISO_DE_RECUPERADO_MS = 4000

export interface LoQueSeEnseña {
  /** El texto sobre el lienzo, o `null` si no hay nada que decir. */
  mensaje: string | null
  /** Si hay que ofrecer el botón de volver a montar el lienzo. */
  ofrecerRecuperar: boolean
  /** Una región viva anuncia el cambio; una alerta, solo lo que no se arregla solo. */
  urgente: boolean
}

export function loQueSeEnseña(estado: EstadoDelContexto, ahora: number): LoQueSeEnseña {
  if (estado.fase === 'perdido') {
    const esperado = ahora - estado.desde
    if (esperado >= ESPERA_ANTES_DE_OFRECER_MS) {
      return {
        mensaje:
          'La imagen se detuvo y el navegador no la ha devuelto. Pulse «Recuperar la vista»: el caso, los pasos y el puntaje se quedan como están.',
        ofrecerRecuperar: true,
        urgente: true,
      }
    }
    return { mensaje: 'La imagen se detuvo; se está recuperando…', ofrecerRecuperar: false, urgente: false }
  }
  if (estado.fase === 'recuperado' && ahora - estado.en < TIEMPO_DEL_AVISO_DE_RECUPERADO_MS) {
    return { mensaje: 'La imagen volvió.', ofrecerRecuperar: false, urgente: false }
  }
  return { mensaje: null, ofrecerRecuperar: false, urgente: false }
}

/**
 * Dice **una vez por etapa** que algo falló al dibujar.
 *
 * El bucle de dibujo corre sesenta veces por segundo: una excepción que se repite en cada cuadro llenaría la
 * consola y taparía la causa. Se avisa de la primera de cada etapa y se cuenta el resto; `repeticiones` dice
 * cuántas hubo para quien lo mire después.
 */
export function crearLimitadorDeFallos() {
  const vistos = new Map<string, number>()
  return {
    /** Devuelve `true` solo la primera vez que falla esa etapa. */
    registrar(etapa: string): boolean {
      const antes = vistos.get(etapa) ?? 0
      vistos.set(etapa, antes + 1)
      return antes === 0
    },
    repeticiones: (etapa: string) => vistos.get(etapa) ?? 0,
    etapas: () => [...vistos.keys()],
    reiniciar: () => vistos.clear(),
  }
}

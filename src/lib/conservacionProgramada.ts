/**
 * Cuándo corre la pasada de los plazos (D-290): al poco de arrancar el
 * servidor y después una vez al día, desde `src/instrumentation.ts`.
 *
 * Dentro de la aplicación y no en el cron del anfitrión, que es donde vive el
 * respaldo de cada noche, por tres razones:
 *
 *  - **Los plazos se escriben una vez.** La pasada y el aviso leen las mismas
 *    constantes (`conservacion.ts`). En el cron habría que repetirlas en SQL,
 *    con los nombres de tabla a mano, en un guion que el aviso no ve.
 *  - **Corre donde corra la plataforma**: Contabo, ved y el equipo de
 *    desarrollo, sin instalar nada en ninguno.
 *  - **La imagen de producción no trae `tsx`**, así que un guion en TypeScript
 *    desde el cron pediría construir la etapa `builder` del `Dockerfile` cada
 *    noche.
 *
 * Lo que se pierde: si la aplicación está caída un día entero, ese día no hay
 * pasada. Nadie lee la base mientras tanto, y la siguiente arranca a los cinco
 * minutos de volver. El respaldo de esa noche sí se hace, con un día de más de
 * lo vencido dentro; por eso el aviso dice que las copias conservan treinta
 * días lo que se borra, y no que nunca lo ven.
 *
 * Una sola vez por proceso: `register` corre una vez por servidor, pero en
 * desarrollo la recarga en caliente puede volver a evaluar este módulo, y dos
 * relojes harían dos pasadas a la vez sobre las mismas filas. La marca vive en
 * `globalThis`, que sobrevive a la recarga.
 */

/** Cuánto espera la primera pasada: que el servidor termine de arrancar y aplique sus migraciones. */
export const PRIMERA_PASADA_MS = 5 * 60 * 1000

/** Una pasada al día. */
export const CADA_PASADA_MS = 24 * 60 * 60 * 1000

const MARCA = Symbol.for('traumahub.conservacionProgramada')

interface Reloj {
  setTimeout: (fn: () => void, ms: number) => { unref?: () => void }
  setInterval: (fn: () => void, ms: number) => { unref?: () => void }
}

/**
 * Corre una pasada contra la base de este proceso y cuenta qué hizo.
 *
 * Payload se importa aquí dentro y no arriba: `register` tiene que terminar
 * antes de que el servidor atienda la primera petición, y cargar la
 * configuración de Payload al arrancar lo retrasaría sin necesidad. Nada de lo
 * que pase aquí puede tumbar el servidor: se anota y se sigue.
 */
export async function ejecutarLaConservacion(): Promise<void> {
  const { getPayload } = await import('payload')
  const config = (await import('@payload-config')).default
  const payload = await getPayload({ config })
  try {
    const { aplicarLaConservacion, resumenDeLaConservacion } = await import('./conservacionServidor')
    const resultado = await aplicarLaConservacion(payload)
    const resumen = resumenDeLaConservacion(resultado)
    payload.logger.info({ msg: `Plazos de conservación: ${resumen || 'nada que hacer'}` })
  } catch (error) {
    payload.logger.error({ msg: 'No se pudo aplicar los plazos de conservación', err: error })
  }
}

/**
 * Programa la pasada: la primera a los cinco minutos, después cada día.
 *
 * Los relojes se sueltan (`unref`): una pasada pendiente no puede impedir que
 * el proceso termine cuando el contenedor se detiene. Devuelve si programó,
 * para que la prueba pueda ver que la segunda llamada no lo hace.
 */
export function programarLaConservacion(
  ejecutar: () => Promise<void> = ejecutarLaConservacion,
  reloj: Reloj = globalThis,
): boolean {
  const global = globalThis as Record<symbol, unknown>
  if (global[MARCA]) return false
  global[MARCA] = true

  const correr = () => {
    ejecutar().catch((error) => console.error('[conservación]', error))
  }
  reloj.setTimeout(() => {
    correr()
    reloj.setInterval(correr, CADA_PASADA_MS).unref?.()
  }, PRIMERA_PASADA_MS).unref?.()
  return true
}

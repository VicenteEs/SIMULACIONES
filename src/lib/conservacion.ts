/**
 * Cuánto tiempo se guarda lo que no muere con la cuenta (D-290).
 *
 * Dos cosas de la plataforma no cuelgan de ninguna cuenta viva y, sin un plazo,
 * se quedaban para siempre:
 *
 *  - **El registro de acciones** (`RegistroDeAcciones.ts`): quién entró, qué
 *    abrió, qué cambió. Sirve para la seguridad y para responder «¿quién tocó
 *    esto?», y esa pregunta se hace en semanas, no en años.
 *  - **Las cotizaciones** (`Cotizaciones.ts`): el nombre y el correo de alguien
 *    de fuera que pidió una propuesta. Contestada o no, al año ya no hay nada
 *    que contestarle.
 *
 * Los dos plazos viven aquí y en ningún otro sitio. Los lee la purga diaria
 * (`conservacionServidor.ts`) y los lee el aviso de privacidad, que los escribe
 * con estas mismas constantes: si el plazo cambia, el aviso cambia con él en el
 * mismo cambio, y no puede quedarse prometiendo otro. Cambiar uno pide además
 * una versión nueva del aviso (`VERSION_DEL_AVISO_DE_PRIVACIDAD`), que es lo que
 * se le dijo a la persona.
 *
 * Puro y sin servidor: lo importa la página del aviso, que también se pinta
 * dentro de la pantalla de aceptación.
 */

/** Meses que se guarda cada entrada del registro de acciones, contados desde su fecha. */
export const MESES_DEL_REGISTRO_DE_ACCIONES = 12

/** Meses que se guarda una cotización, contados desde que llegó. */
export const MESES_DE_LAS_COTIZACIONES = 12

/**
 * El instante antes del cual lo guardado hace `meses` meses ya venció.
 *
 * En UTC y con meses de calendario, no con 30 días: «12 meses» es lo que dice
 * el aviso, y 360 días se comerían casi una semana de lo prometido. Al restar
 * un año a un día que no existe en el otro —un 29 de febrero— JavaScript pasa al
 * día siguiente: el corte cae un día después, y lo de ese día se borra uno antes
 * de cumplir el plazo. Es el lado bueno del error: el aviso promete que nada se
 * guarda más de doce meses, y un día de menos no rompe esa promesa; uno de más,
 * sí.
 */
export function vencimiento(meses: number, ahora: Date = new Date()): Date {
  const limite = new Date(ahora.getTime())
  limite.setUTCMonth(limite.getUTCMonth() - meses)
  return limite
}

/** «12 meses», «1 mes»: el plazo como lo lee la persona en el aviso. */
export const plazoEnPalabras = (meses: number): string => (meses === 1 ? '1 mes' : `${meses} meses`)

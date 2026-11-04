import { AUTORIA } from './autoria'

/**
 * El aviso de privacidad de `/privacidad` (Q-005, D-258): qué versión está
 * vigente y a quién se le escribe por él.
 *
 * Lo comparten tres sitios que tienen que decir lo mismo: la página que lo
 * publica, la casilla del último paso de `/registro` y `solicitarCuenta`, que
 * deja en la cuenta qué versión se aceptó. Con la versión escrita en cada uno,
 * el día que el texto cambie y uno de los tres se quede atrás, la cuenta diría
 * que su titular aceptó un texto que nunca leyó, que es justo lo que ese
 * registro existe para poder demostrar.
 *
 * Puro y sin servidor, como `solicitudDeCuenta.ts`: lo importa el formulario,
 * que corre en el navegador.
 */

/**
 * La versión vigente: el día en que se escribió el texto, en AAAA-MM-DD.
 *
 * Se cambia en el mismo cambio que el texto de la página, y solo cuando cambia
 * lo que se le dice a la persona —qué se guarda, para qué, dónde, cuánto
 * tiempo, a quién se escribe—, no por una errata. Las cuentas anteriores se
 * quedan con la versión que aceptaron, que es lo que tiene que quedar; volver
 * a pedirles la aceptación es otra decisión, y no la toma esta constante.
 */
export const VERSION_DEL_AVISO_DE_PRIVACIDAD = '2026-11-04'

/**
 * A quién se le escriben las preguntas y las solicitudes de privacidad.
 *
 * Es la dirección que el pie de cada página ya da para «cualquier consulta»
 * (`AUTORIA`), y no una inventada para el aviso: la plataforma no tiene otra.
 * El día que el responsable abra una propia, se cambia aquí y, con ella, la
 * versión del aviso, porque cambia a quién se le pide algo.
 */
export const CORREO_DE_PRIVACIDAD = AUTORIA.correo

/**
 * En UTC y no con la hora de Chile, que es la que usa `impresion.ts`: la
 * versión es un día sin hora, `new Date('2026-11-04')` es la medianoche UTC, y
 * en Santiago esa medianoche todavía es el día 3. Con la zona de Chile el aviso
 * diría un día menos que su propia versión.
 */
const FORMATO_DEL_DIA = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** El día de una versión del aviso, en palabras: «4 de noviembre de 2026». */
export const diaDeLaVersion = (version: string = VERSION_DEL_AVISO_DE_PRIVACIDAD): string =>
  FORMATO_DEL_DIA.format(new Date(`${version}T00:00:00Z`))

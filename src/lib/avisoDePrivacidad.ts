/**
 * El aviso de privacidad de `/privacidad` (Q-005, D-258): qué versión está
 * vigente, quién responde de los datos y a quién se le escribe por ellos.
 *
 * Lo comparten los sitios que tienen que decir lo mismo: la página que lo
 * publica, la pantalla que lo pide al entrar (D-292), la casilla del último
 * paso de `/registro`, `solicitarCuenta` y `aceptarElAvisoDePrivacidad`, que
 * dejan en la cuenta qué versión se aceptó. Con la versión escrita en cada uno,
 * el día que el texto cambie y uno de ellos se quede atrás, la cuenta diría
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
 * tiempo, quién responde, a quién se escribe—, no por una errata.
 *
 * **Cambiarla vuelve a pedir la aceptación a todas las cuentas** (D-292): la
 * plantilla de la plataforma compara esta constante con la versión que guarda
 * cada cuenta y, si no es la misma, enseña el aviso en lugar de la página hasta
 * que se acepte. Hasta D-292 eso era «otra decisión»; ahora es la consecuencia,
 * y por eso la versión no se mueve por una coma.
 *
 * Los dos datos de abajo se completaron el mismo día en que se escribió el
 * texto, y antes de desplegarlo (D-297): ninguna cuenta había aceptado esta
 * versión con los huecos, así que la versión no se movió. Cambiar cualquiera de
 * los dos más adelante cambia quién responde o a quién se escribe, y la versión
 * pasa al día del cambio. Cada cambio hace aceptar el aviso otra vez a todas
 * las cuentas: por eso conviene cambiarlos juntos.
 */
export const VERSION_DEL_AVISO_DE_PRIVACIDAD = '2026-11-05'

/**
 * Quién responde de los datos: el nombre de la persona o de la entidad que es
 * responsable de ellos ante la ley.
 *
 * Chesscore SpA, **por ahora** (D-297): lo decidió el dueño mientras define
 * quién responde a la larga. No vale el «TraumaHub, plataforma docente» de la
 * primera versión, que es el nombre de un servicio y no de alguien que pueda
 * responder (D-294). Vacío, el aviso enseña el hueco y no se pide aceptarlo al
 * entrar (`avisoCompleto`).
 */
export const RESPONSABLE_DE_LOS_DATOS = 'Chesscore SpA'

/**
 * A quién se le escriben las preguntas y las solicitudes de privacidad.
 *
 * `contacto@chesscore.cl`, **por ahora** (D-297), hasta que el dueño abra una
 * dirección propia para la privacidad, con el dominio nuevo. Es un buzón
 * general: lo que llegue ahí sobre datos personales se anota el mismo día en el
 * registro de solicitudes (D-296), porque el plazo de la ley corre desde que
 * llega, no desde que alguien lo separa de las demás consultas. La primera
 * versión daba la dirección general del pie (`AUTORIA.correo`), la de
 * «cualquier consulta».
 */
export const CORREO_DE_PRIVACIDAD = 'contacto@chesscore.cl'

/**
 * Si el aviso está entero, sin espacios en blanco.
 *
 * Mientras no lo esté, la plantilla **no pide aceptarlo al entrar**: hacerle
 * aceptar a todo el equipo un aviso que no dice quién responde ni a quién se
 * escribe sería un consentimiento que no prueba nada, y obligaría a aceptarlo
 * otra vez en cuanto se complete. La página lo publica igual, con los huecos a
 * la vista, porque lo demás ya es verdad y quien pide una cuenta tiene que poder
 * leerlo.
 */
export const avisoCompleto = (
  responsable: string = RESPONSABLE_DE_LOS_DATOS,
  correo: string = CORREO_DE_PRIVACIDAD,
): boolean => responsable.trim() !== '' && correo.trim() !== ''

/**
 * Si a esta cuenta hay que pedirle el aviso antes de dejarla seguir (D-292).
 *
 * La cuenta lo debe cuando la versión que aceptó no es la vigente: no lo
 * aceptó nunca —la crearon desde el panel, o es anterior al aviso— o aceptó una
 * anterior. Se mira la cuenta **real**, no la que simula un administrador con
 * «ver como residente»: quien acepta es la persona.
 */
export function debeAceptarElAviso(
  cuenta: { versionDelAvisoDePrivacidad?: unknown } | null | undefined,
  version: string = VERSION_DEL_AVISO_DE_PRIVACIDAD,
  completo: boolean = avisoCompleto(),
): boolean {
  if (!cuenta || !completo) return false
  return cuenta.versionDelAvisoDePrivacidad !== version
}

/** Lo que se le dice a quien acepta una versión que ya no es la vigente. */
export const AVISO_CAMBIADO =
  'El aviso de privacidad cambió mientras lo leías. Recarga la página, léelo otra vez y vuelve a aceptarlo.'

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

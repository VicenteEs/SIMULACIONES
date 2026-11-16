/**
 * Lo que vale para una institución sin preguntarle a la base (D-371, D-396).
 *
 * Puro a propósito, como `reglas.ts`: lo usan la colección al validar, el proxy
 * al leer el anfitrión y el panel al crear una, y las tres tienen que decir lo
 * mismo de qué subdominio sirve.
 */

/** Días que dura un piloto si el administrador no pone otra fecha (D-371). */
export const DIAS_DEL_PILOTO = 15

export const MODALIDADES = ['piloto', 'definitiva'] as const
export type Modalidad = (typeof MODALIDADES)[number]

/**
 * Subdominios que ninguna institución puede tomar.
 *
 * - `www` y la raíz son la central: `www` lleva a `traumahub.cl` (E2 de P-016).
 * - `mail` tiene su propio registro hacia Freehost, que le gana al comodín
 *   `*.traumahub.cl`: una institución con ese nombre no llegaría nunca aquí.
 * - `api`, `admin` y `traumahub` se confundirían con la plataforma misma.
 * - `ved`, `pruebas` y `estado` quedan para el servidor de pruebas y para una
 *   futura página de estado.
 *
 * Se agregan los que hagan falta; quitar uno que ya esté en uso por algo fuera
 * de la plataforma rompería ese algo, y por eso solo crece.
 */
export const NOMBRES_RESERVADOS: readonly string[] = [
  'www',
  'mail',
  'api',
  'admin',
  'traumahub',
  'ved',
  'pruebas',
  'estado',
]

const LARGO_MINIMO = 2
const LARGO_MAXIMO = 40

/**
 * El subdominio tal como se guarda: sin espacios y en minúsculas. Lo que el
 * administrador escriba con mayúsculas o un espacio al final es el mismo
 * nombre, y el navegador lo manda siempre en minúsculas.
 */
export function normalizarSubdominio(texto: string): string {
  return texto.trim().toLowerCase()
}

/**
 * ¿Sirve como subdominio? Devuelve el motivo si no, o `null` si sirve.
 *
 * Solo letras sin tilde, números y guiones, y sin guion al principio ni al
 * final: es lo que admite un nombre de DNS (RFC 1123), y una `ñ` obligaría a
 * escribirlo en punycode (`xn--…`), que nadie reconoce. Se valida ya
 * normalizado.
 */
export function motivoDeSubdominioInvalido(subdominio: string): string | null {
  if (subdominio.length < LARGO_MINIMO || subdominio.length > LARGO_MAXIMO) {
    return `El subdominio tiene que tener entre ${LARGO_MINIMO} y ${LARGO_MAXIMO} caracteres.`
  }
  if (!/^[a-z0-9-]+$/.test(subdominio)) {
    return 'El subdominio solo puede llevar letras sin tilde, números y guiones.'
  }
  if (subdominio.startsWith('-') || subdominio.endsWith('-')) {
    return 'El subdominio no puede empezar ni terminar con un guion.'
  }
  if (NOMBRES_RESERVADOS.includes(subdominio)) {
    return `«${subdominio}» está reservado para la plataforma.`
  }
  return null
}

/**
 * El vencimiento de un piloto que empieza en `inicio`, si no se da otro.
 * Se cuenta en días enteros desde el inicio, a la misma hora.
 */
export function vencimientoDelPiloto(inicio: Date, dias: number = DIAS_DEL_PILOTO): Date {
  return new Date(inicio.getTime() + dias * 24 * 60 * 60 * 1000)
}

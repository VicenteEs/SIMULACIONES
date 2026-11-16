import type { Where } from 'payload'
import { LUGAR_DE_LA_CENTRAL } from './anfitrion'

/**
 * A qué lugares va una difusión, y por qué canal (P-016 E6, D-375, D-406).
 *
 * Una difusión elige lugares —TraumaHub, una institución, varias o todas— y,
 * dentro de ellos, el rol de siempre. Sale por correo, como aviso dentro de la
 * plataforma o por los dos.
 *
 * Los lugares se guardan como una lista de textos: `traumahub` para la central
 * y el identificador de cada institución. `null` es «todos los lugares», y no
 * la lista de los que había: la institución que se cree mañana tampoco tiene
 * por qué quedarse sin el aviso de una actualización que se anunció ayer para
 * todas.
 *
 * Puro y sin servidor: lo usan el trabajador del correo, el aviso de la barra,
 * el panel en el navegador y las pruebas.
 */

/**
 * Cuántos días se ve un aviso si no se dice otra cosa, y el techo: más que eso
 * ya no es un aviso sino un tablón. Aquí y no en la acción, que por ser de
 * servidor solo puede exportar funciones, y el formulario también lo lee.
 */
export const DIAS_DEL_AVISO = { porOmision: 14, maximo: 90 } as const

/** Los lugares de una difusión: `null` son todos. */
export type LugaresDeDifusion = string[] | null

/** El lugar de una cuenta, con el mismo nombre que en la lista. */
export function lugarDeLaCuenta(institucion: string | number | null | undefined): string {
  return institucion === null || institucion === undefined || institucion === '' ? LUGAR_DE_LA_CENTRAL : String(institucion)
}

/**
 * Lo guardado o lo que llega del formulario, como lista limpia: sin repetidos,
 * solo `traumahub` o identificadores enteros. Cualquier otra cosa es `null`,
 * todos; y una lista vacía también lo sería, así que quien llama la rechaza
 * antes (`validarLugares`). Aquí no se mira que las instituciones existan.
 */
export function normalizarLugares(valor: unknown): LugaresDeDifusion {
  if (!Array.isArray(valor)) return null
  const lista = [
    ...new Set(
      valor
        .map((lugar) => (typeof lugar === 'number' ? String(lugar) : typeof lugar === 'string' ? lugar.trim() : ''))
        .filter((lugar) => lugar === LUGAR_DE_LA_CENTRAL || /^\d+$/.test(lugar)),
    ),
  ]
  return lista.length > 0 ? lista : null
}

/**
 * La condición de Payload sobre las cuentas para esos lugares, o `null` si son
 * todos. Va junto a la del rol y la de cuenta activa (`condicionDeDestinatarios`).
 */
export function condicionDeLugares(lugares: LugaresDeDifusion): Where | null {
  if (lugares === null) return null
  const instituciones = lugares.filter((lugar) => lugar !== LUGAR_DE_LA_CENTRAL).map(Number)
  const condiciones: Where[] = []
  if (lugares.includes(LUGAR_DE_LA_CENTRAL)) condiciones.push({ institucion: { exists: false } })
  if (instituciones.length > 0) condiciones.push({ institucion: { in: instituciones } })
  return { or: condiciones }
}

/** Lo que una difusión dice de a quién va. */
export interface AlcanceDeDifusion {
  audiencia: string
  lugares: LugaresDeDifusion
}

/**
 * ¿Es esta cuenta de las que reciben la difusión? Lo mismo que la condición
 * de arriba, para el aviso de la barra, que tiene la cuenta a mano y no la
 * pregunta a la base.
 */
export function difusionLlegaA(
  difusion: AlcanceDeDifusion,
  cuenta: { rol?: unknown; institucion?: string | number | null },
): boolean {
  if (difusion.audiencia !== 'todas' && difusion.audiencia !== cuenta.rol) return false
  return difusion.lugares === null || difusion.lugares.includes(lugarDeLaCuenta(cuenta.institucion))
}

/**
 * El enlace del botón para una cuenta de cierto lugar.
 *
 * Quien escribe la difusión pega una dirección de la plataforma tal como la ve
 * desde la central (`https://traumahub.cl/biblioteca`). Una cuenta de
 * institución entra solo desde su subdominio (D-396): con ese enlace llegaría a
 * la central, donde su cuenta no vale. Así que un enlace que empieza por la
 * dirección pública se lleva a la del lugar de quien lo recibe, y uno a otro
 * sitio queda igual.
 */
export function enlaceParaElLugar(enlace: string, direccionPublica: string, direccionDelLugar: string): string {
  const resto = restoDentroDeLaPlataforma(enlace, direccionPublica)
  return resto === null || !direccionDelLugar ? enlace : `${direccionDelLugar}${resto === '/' ? '' : resto}`
}

/**
 * Si el enlace es de la plataforma, la ruta dentro de ella (sin el prefijo,
 * que va dentro de la dirección pública), con su consulta; si no, `null`. El
 * aviso de la barra la usa para abrirlo en el lugar donde se está.
 */
export function restoDentroDeLaPlataforma(enlace: string, direccionPublica: string): string | null {
  const base = direccionPublica.replace(/\/+$/, '')
  if (!base || !enlace.startsWith(base)) return null
  const resto = enlace.slice(base.length)
  // `https://traumahub.cl.otro.sitio` empieza igual y no es la plataforma.
  if (resto !== '' && !/^[/?#]/.test(resto)) return null
  if (resto === '' || resto.startsWith('#')) return `/${resto}`
  return resto.startsWith('?') ? `/${resto}` : resto
}

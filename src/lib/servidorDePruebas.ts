/**
 * ¿Es este el servidor de pruebas? (D-385)
 *
 * Desde el 2026-11-15 la producción es `traumahub.cl`, en Contabo, y ved es el
 * servidor de pruebas, con las mismas cuentas del equipo y el mismo contenido
 * (D-384). Las dos se ven iguales, así que nada impedía crear una ficha en ved
 * por costumbre y perderla para producción: lo que se escribe en ved se queda
 * en ved. Por eso ved lleva una franja arriba de cada página que dice dónde se
 * está y a dónde hay que ir.
 *
 * Lo decide una variable del servidor, `SERVIDOR_DE_PRUEBAS`, y no el nombre de
 * la máquina ni `NEXT_PUBLIC_SERVER_URL`. Deducirlo de la dirección habría
 * marcado como «de pruebas» cualquier instalación que no fuera `traumahub.cl`,
 * la de desarrollo incluida, y el día que cambie la dirección de producción la
 * habría marcado a ella. Se lee en cada petición, no al compilar: la plantilla
 * es dinámica (`force-dynamic`), y así basta con tocar el `.env` y recrear el
 * contenedor, sin reconstruir la imagen.
 *
 * El valor es la dirección de producción, a la que lleva el aviso. Si no es
 * una dirección `https`, el aviso sale igual, sin el enlace: con la variable
 * puesta, alguien quiso marcar el servidor, y un valor raro no debe callarlo.
 * Vacía, `0`, `no` o `false`, no sale.
 *
 * Puro y sin servidor: lo llaman la plantilla y sus metadatos, y la prueba.
 */

/** Lo que necesita el aviso: a qué dirección de producción lleva, si se sabe. */
export type ServidorDePruebas = { produccion: string | null }

const APAGADO = new Set(['', '0', 'no', 'false'])

export function servidorDePruebas(valor: string | undefined): ServidorDePruebas | null {
  const limpio = (valor ?? '').trim()
  if (APAGADO.has(limpio.toLowerCase())) return null
  try {
    const url = new URL(limpio)
    // Solo el origen: una ruta en la variable (`https://traumahub.cl/entrar`)
    // llevaría a una página concreta que mañana puede no existir.
    if (url.protocol === 'https:') return { produccion: url.origin }
  } catch {
    // No es una dirección: el aviso sale sin enlace.
  }
  return { produccion: null }
}

/** Lo que se antepone al título de cada pestaña, para distinguirlas entre ventanas abiertas. */
export const PREFIJO_DEL_TITULO = '[Pruebas]'

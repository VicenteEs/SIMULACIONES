/**
 * Prefijo bajo el que vive la plataforma.
 *
 * En desarrollo la aplicación está en la raíz y esto es una cadena vacía. En el
 * servidor comparte dominio y puerto con otras páginas detrás del mismo proxy,
 * y cuelga de `/traumahub`.
 *
 * Next.js resuelve solo el prefijo de casi todo —`<Link>`, `redirect()`,
 * `router.push()`, `next/image`—, pero **no** de lo que se escribe a mano:
 *
 *   - `<img src="/logo.png">`
 *   - `fetch('/api/…')` y `new EventSource('/api/…')`
 *   - `<a href="/api/…">`
 *   - los iconos declarados en `metadata`
 *
 * Para todo eso está `ruta()`. Olvidarla es el fallo típico de una aplicación
 * montada bajo un prefijo: funciona en desarrollo y en el servidor devuelve
 * 404 sin decir por qué, porque la petición sale sin el prefijo y la atiende
 * otra página del mismo dominio.
 *
 * El valor se incrusta al compilar: `NEXT_PUBLIC_*` no se puede leer en el
 * navegador en tiempo de ejecución, así que la imagen se construye con el
 * prefijo que le corresponde a ese despliegue.
 */

/** Prefijo, siempre sin barra final. Vacío cuando la aplicación va en la raíz. */
export const PREFIJO = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '')

/**
 * Ruta absoluta dentro de la aplicación, con el prefijo puesto.
 *
 *   ruta('/api/salud')  →  '/api/salud'            en desarrollo
 *                       →  '/traumahub/api/salud'  en el servidor
 */
export function ruta(camino: string): string {
  if (!camino.startsWith('/')) return camino
  return `${PREFIJO}${camino}`
}

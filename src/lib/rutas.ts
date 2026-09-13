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
 *
 * **Lo que NO pasa por aquí: la `url` de un archivo subido.** Esa la arma
 * Payload con `formatAdminURL`, que antepone por su cuenta el `basePath` de
 * Next —`withPayload` lo copia a `NEXT_BASE_PATH` al compilar—, de modo que
 * llega con el prefijo ya puesto. Volver a ponérselo aquí es reproducir O-019:
 * el prefijo salía dos veces y toda imagen, todo vídeo y todo modelo 3D de toda
 * ficha era un 404 en el servidor. Esta función no es idempotente, y no debe
 * serlo: hacerla tolerante al prefijo doble taparía justo el error que hay que
 * ver.
 *
 * Y taparlo sería fácil, porque hoy el remiendo ni siquiera se nota. Con
 * `NEXT_PUBLIC_SERVER_URL` puesta, esa `url` es absoluta y el `if` de abajo la
 * devuelve intacta; el día que `serverURL` quedara vacía pasaría a ser relativa
 * —«/traumahub/api/medios/file/…»— y ahí sí se doblaría. O sea: un `ruta()` de
 * más sobre un medio no rompe nada hoy y rompe todo mañana, sin que nada avise.
 *
 * Queda escrito aquí, y no solo en la bitácora, porque la propuesta de
 * «arreglarlo en cada consumidor» vuelve cada vez que alguien lee un `<img
 * src={imagen.url}>` sin contexto. Lo que lo ata es
 * `tests/unit/archivosSubidos.test.ts`, que llama a la propia función de
 * Payload con `NEXT_BASE_PATH=/traumahub`.
 */
export function ruta(camino: string): string {
  if (!camino.startsWith('/')) return camino
  return `${PREFIJO}${camino}`
}

/**
 * Origen de una dirección: esquema, servidor y puerto, sin ruta.
 *
 * Es lo que el navegador manda en la cabecera `Origin`, y por tanto lo único
 * que Payload puede comparar contra su lista de CSRF. Si a `serverURL` se le
 * deja el prefijo —«https://servidor:10000/traumahub»—, la comparación falla
 * siempre y Payload **descarta la cookie de sesión** en toda petición que
 * lleve `Origin`: las páginas siguen abriéndose, porque una navegación no
 * manda esa cabecera, pero cualquier acción de servidor responde «acceso
 * denegado». Costó encontrarlo justamente por eso (ver O-018).
 *
 * Ante una dirección que no se puede analizar se devuelve tal cual: es mejor
 * que Payload compare algo que no casa a que arranque sin `serverURL`.
 */
export function origenDe(direccion: string): string {
  try {
    return new URL(direccion).origin
  } catch {
    return direccion
  }
}

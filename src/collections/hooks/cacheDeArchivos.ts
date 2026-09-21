/**
 * Cabeceras de caché de los archivos subidos.
 *
 * Estos archivos salen por una ruta que comprueba la sesión, y eso cambia lo
 * que se puede cachear y dónde. Sin cabecera, el navegador vuelve a pedir cada
 * imagen en cada página, y una ficha con seis radiografías tras un túnel se
 * nota. Con la cabecera equivocada —`public`— un proxy compartido guardaría la
 * respuesta y se la daría a quien no tiene sesión, que es exactamente lo que se
 * acaba de cerrar al sacar la carpeta de `public/`.
 *
 * De ahí las tres piezas:
 *
 *   private          solo el navegador de esa persona, nunca un intermediario.
 *   max-age=3600     una hora sin volver a preguntar. Un archivo subido no
 *                    cambia: para cambiarlo se sube otro, con otro nombre.
 *   must-revalidate  pasada la hora se pregunta de verdad, sin servir algo
 *                    caducado por estar sin red.
 *
 * `Vary: Cookie` es la otra mitad: le dice a cualquier caché que la respuesta
 * depende de quién la pidió, de modo que la copia de una persona no se le
 * entrega a otra.
 *
 * Y una cuarta que no es de caché, pero va aquí porque esta función es el único
 * sitio por el que pasan las cabeceras de todo archivo subido: un archivo subido
 * **no ejecuta nada**. `medios` admite SVG, y un SVG es un documento: puede
 * llevar `<script>`. Dentro de un `<img>` el navegador no lo ejecuta, pero la
 * dirección del archivo se puede abrir sola en una pestaña —basta con que un
 * editor se la pase al administrador en un comentario o en un enlace de una
 * ficha—, y ahí el guion corría en el origen de la plataforma, con la sesión de
 * quien lo abriera: un editor conseguía así lo que hace un administrador. Con
 * `sandbox` el documento se abre en un origen opaco, sin guiones y sin cookies
 * que leer; `script-src 'none'` dice lo mismo para el navegador que no entienda
 * lo primero. Nada de esto afecta a cómo se ve el archivo dentro de una ficha:
 * la CSP de una respuesta solo gobierna a esa respuesta cuando es ella el
 * documento. `frame-ancestors` se repite porque esta cabecera sustituye a la de
 * `next.config.mjs` en estas respuestas, y no debe perderse por el camino.
 *
 * `nosniff` cierra la otra mitad: que el navegador no decida por su cuenta que
 * un archivo con tipo de imagen «parece» HTML.
 */
export function cacheDeArchivoPrivado({ headers }: { headers: Headers }): Headers {
  headers.set('Cache-Control', 'private, max-age=3600, must-revalidate')
  headers.set('Vary', 'Cookie')
  headers.set('Content-Security-Policy', "script-src 'none'; sandbox; frame-ancestors 'none'")
  headers.set('X-Content-Type-Options', 'nosniff')
  return headers
}

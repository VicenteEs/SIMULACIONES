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
 */
export function cacheDeArchivoPrivado({ headers }: { headers: Headers }): Headers {
  headers.set('Cache-Control', 'private, max-age=3600, must-revalidate')
  headers.set('Vary', 'Cookie')
  return headers
}

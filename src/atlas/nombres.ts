import tabla from '@/atlas/nombres-es.json'

/**
 * Los nombres de las estructuras del atlas, en español.
 *
 * El atlas de origen (BodyParts3D) nombra en inglés, y hasta ahora se conservaba
 * así: el taller enseñaba «Right tibia», el archivo exportado llevaba un objeto
 * llamado «Right_tibia», y ese nombre no se parecía a nada de lo que la
 * plataforma usa en el resto de sitios. Un traumatólogo que prepara una pierna
 * en español para residentes que leen en español no tiene por qué traducir de
 * cabeza cada pieza que selecciona.
 *
 * ## Por qué una tabla y no el catálogo
 *
 * La traducción vive en `nombres-es.json`, indexada por el nombre ORIGINAL, y
 * no escrita dentro de `public/atlas/catalogo.json`. Ese catálogo lo reescribe
 * `scripts/atlas/preparar.mjs` cada vez que se regenera el atlas: una traducción
 * guardada allí desaparecería sin aviso. Indexada por el nombre original,
 * sobrevive a cualquier regeneración que no cambie la anatomía.
 *
 * ## Por qué el original no se tira
 *
 * La licencia del atlas (CC BY 4.0, ver `public/atlas/ATRIBUCION.md`) permite
 * traducir, pero obliga a decir que se modificó el material. Y el nombre
 * original es lo que se puede buscar en la bibliografía y en la Foundational
 * Model of Anatomy: quien quiera comprobar una pieza tiene que poder encontrarla.
 * Por eso se traduce para enseñar, y el original se conserva al lado.
 *
 * ## Lo que no tiene traducción
 *
 * Una estructura que no esté en la tabla se enseña con su nombre original, sin
 * inventar nada. Es preferible leer «Check ligament of left lateral rectus» a
 * leer una traducción automática equivocada presentada como terminología.
 */

const TRADUCCIONES: Readonly<Record<string, string>> = tabla

/** El nombre en español, o el original si no hay traducción. */
export function nombreEnEspanol(original: string): string {
  return TRADUCCIONES[original] ?? original
}

/** Si esta estructura tiene traducción. Para poder decir cuántas faltan. */
export function tieneTraduccion(original: string): boolean {
  return Object.prototype.hasOwnProperty.call(TRADUCCIONES, original)
}

/**
 * Quita tildes y diéresis.
 *
 * Se usa para los nombres de NODO de un archivo exportado, que el médico
 * escribe o compara a mano en las piezas de un caso: «Peroné_derecho» escrito
 * en un teclado puede llegar en otra forma de Unicode —la tilde como carácter
 * aparte— y no casar con el del archivo aunque en pantalla sean idénticos, sin
 * ningún error que lo explique. El nombre bonito, con sus tildes, va en la
 * etiqueta; el nodo, que es un identificador, va sin ellas.
 */
export function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Para buscar en el árbol y en el taller: casa en español y en el original, sin
 * tildes y sin mayúsculas. Quien escribe «perone» tiene que encontrar «Peroné
 * derecho», y quien viene de un libro en inglés tiene que encontrar la misma
 * pieza escribiendo «fibula».
 *
 * ## Todas las palabras, en cualquier orden
 *
 * Antes se buscaba la consulta entera, de corrido: «tibia derecha» encontraba y
 * «derecha tibia» no. Con las nueve traducciones con las que empezó la tabla no
 * se notaba, porque «Tibia derecha» se escribe tal cual se lee. Con la tabla
 * revisada los nombres llevan palabras en medio y el lado detrás —«Peroneo
 * corto derecho», «División anterior de la arteria renal derecha»—, y nadie
 * escribe eso seguido: escribe «peroneo derecho», que de corrido no está.
 * El árbol se quedaba sin nada y el taller decía que la pieza no estaba
 * encendida, sin ningún error. Cada palabra se busca como trozo y no como
 * palabra entera, porque el campo se usa mientras se escribe: «peron der» ya
 * tiene que ir encontrando.
 *
 * ## Todas en el MISMO nombre
 *
 * O todas en el español o todas en el original, no media consulta en cada uno.
 * Lo que se busca es un nombre que alguien ha leído, en un idioma o en el otro;
 * juntar palabras de los dos haría que «brevis derecho» casara con una pieza
 * que no se llama así en ningún sitio. El árbol encuentra aun así algunas
 * mezclas, pero por otra vía: `buscarPiezas` traduce al inglés las palabras que
 * conoce y las busca en el original, que es lo que hace falta para las
 * estructuras que todavía no tienen traducción.
 *
 * La usan el árbol (`src/atlas/arbolEnEspanol.ts`) y el taller de atlas. Que sea
 * una sola función es lo que impide que un buscador encuentre lo que el otro no.
 */
export function casaConLaBusqueda(original: string, busqueda: string): boolean {
  const palabras = sinTildes(busqueda.toLowerCase()).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return true
  const lasTiene = (nombre: string) => {
    const plano = sinTildes(nombre.toLowerCase())
    return palabras.every((palabra) => plano.includes(palabra))
  }
  return lasTiene(nombreEnEspanol(original)) || lasTiene(original)
}

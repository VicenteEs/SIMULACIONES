/**
 * Cómo se entera el panel de que dos personas están editando la misma ficha.
 *
 * `guardarDocumento` escribía el documento entero sin mirar qué había en la
 * base. Con el traumatólogo y un residente abriendo la misma patología por la
 * mañana, el que guardaba segundo borraba lo del primero, y ninguno de los dos
 * se enteraba: el primero veía «Borrador guardado.» y el segundo también. Lo
 * perdido solo aparecía días después, al leer la ficha publicada.
 *
 * ## Por qué `updatedAt` y no un número de versión
 *
 * Payload ya lo pone en cada escritura y lo devuelve en cada lectura, así que
 * no hace falta un campo nuevo —ni su migración— para tener una marca que
 * cambia cada vez que alguien guarda. El formulario manda la marca con la que
 * abrió; el servidor lee la de ahora y, si no es la misma, no escribe.
 *
 * ## La trampa del mismo editor guardando dos veces
 *
 * El formulario nace de `useState(documento)` y la página no se vuelve a
 * montar al guardar. Si la marca se tomara solo al abrir, el primer guardado
 * movería `updatedAt` en la base y el segundo —del mismo editor, un minuto
 * después— chocaría consigo mismo. Por eso `guardarDocumento` devuelve la marca
 * nueva y el formulario la adopta. Es la marca de lo que ESTA pantalla acaba de
 * escribir, no la de lo que venga en el siguiente refresco: esa podría traer ya
 * lo de la otra persona sin que nadie lo haya visto.
 *
 * Comprobado en `payload@3.88`: lo que devuelve `payload.update` y lo que
 * devuelve después `findByID` con `draft: true` llevan el mismo `updatedAt`,
 * tanto al guardar borrador —la versión nace con él
 * (`versions/saveVersion.js`)— como al publicar —la versión copia el del
 * documento, y `replaceWithDraftIfAvailable` no encuentra borrador más nuevo—.
 * Y medido contra PostgreSQL sobre una maniobra real, dentro de una
 * transacción deshecha al terminar: borrador, otro borrador, retirar con
 * `draft: false`, publicar y borrador tras publicar dieron, cada uno, la misma
 * marca al escribir y al leer, al milisegundo. Si una actualización de Payload
 * rompiera esa igualdad, el síntoma sería inconfundible: cada segundo guardado
 * del mismo editor pediría recargar.
 */

/** La marca de un documento tal como la dio Payload, o `null` si no la trae. */
export type Marca = string | null

export function marcaDe(documento: unknown): Marca {
  if (!documento || typeof documento !== 'object') return null
  const valor = (documento as Record<string, unknown>).updatedAt
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString()
  return typeof valor === 'string' && valor !== '' ? valor : null
}

/**
 * ¿Se guardó algo desde que se abrió la ficha?
 *
 * Se compara el instante y no la cadena: la misma hora puede llegar escrita de
 * dos maneras —con `Z` o con `+00:00`— según la ruta por la que la lea Payload,
 * y compararlas letra a letra daría un choque con uno mismo cada vez que
 * cambiara la ruta.
 *
 * Cualquier diferencia cuenta, también una marca actual ANTERIOR a la abierta:
 * eso es una ficha restaurada desde un respaldo o una versión devuelta atrás,
 * que tampoco ha visto quien está escribiendo.
 *
 * Sin marca actual no hay con qué comparar y se deja pasar. No es un caso de
 * hoy —todas las colecciones de Payload llevan marcas de tiempo—, pero cerrar
 * ahí dejaría la colección entera sin poder guardarse sin decir por qué.
 */
export function cambioDesde(marcaAlAbrir: string, marcaActual: Marca): boolean {
  if (marcaActual === null) return false
  const abierta = Date.parse(marcaAlAbrir)
  const actual = Date.parse(marcaActual)
  // Una marca que no se lee como fecha no viene del formulario —que la copia
  // tal cual de Payload—, sino de alguien llamando a la acción a mano. Se
  // compara como texto, que en la duda rechaza: mejor pedir recargar que
  // escribir encima.
  if (Number.isNaN(abierta) || Number.isNaN(actual)) return marcaAlAbrir !== marcaActual
  return abierta !== actual
}

/**
 * Lo que se le dice a quien choca.
 *
 * Tiene que decir tres cosas y en este orden, porque la persona que lo lee
 * lleva un rato escribiendo y lo primero que teme es haberlo perdido: que no se
 * guardó y por qué, que lo suyo sigue ahí, y qué hacer. «Otra persona, u otra
 * pestaña suya»: el caso más frecuente es el mismo traumatólogo con la ficha
 * abierta en dos ventanas, y acusar a un tercero lo despistaría.
 */
export const MENSAJE_DE_CONFLICTO =
  'No se guardó: esta ficha se guardó desde otro sitio después de que usted la abriera —otra persona, u otra pestaña suya—, y guardar ahora borraría esos cambios. Lo que usted escribió sigue en pantalla y no se ha perdido. Recargue sin perder lo escrito y vuelva a guardar; si quiere ver antes qué cambió, abra la versión guardada en otra pestaña.'

/**
 * La ficha desapareció mientras se editaba.
 *
 * Payload responde a eso con un «Not Found» en inglés que no dice qué pasó ni
 * que lo escrito sigue en pantalla, y es lo único que se puede salvar ya.
 */
export const MENSAJE_DE_FICHA_ELIMINADA =
  'No se guardó: esta ficha se eliminó mientras usted la editaba. Lo que escribió sigue en pantalla; cópielo antes de salir si quiere conservarlo.'

/**
 * Lo que la ficha impresa necesita saber antes de pintarse.
 *
 * «Guardar PDF» es la impresión del navegador, así que todo el aspecto del PDF
 * vive en el bloque `@media print` de `estilos.css`. Aquí está solo lo que el
 * CSS no puede resolver: dar a una cadena de texto forma de literal de CSS y la
 * fecha de emisión.
 */

/**
 * Un texto como literal de CSS, listo para `content: …` dentro de `@page`.
 *
 * El pie de cada hoja lleva el nombre de quien emitió el PDF y el de quien
 * auditó la ficha, y esos nombres los escribe una persona: una comilla o una
 * barra invertida dentro de uno de ellos cerraría el literal y se comería la
 * regla siguiente. Lo que no es letra, cifra o puntuación corriente se escribe
 * como escape hexadecimal (`\22 `), que además esquiva el escape de HTML de
 * React: dentro de `<style>` el texto es literal, no se decodifica, y un `&quot;`
 * no valdría como comilla.
 */
export function literalDeCss(texto: string): string {
  let salida = ''
  for (const caracter of texto.replace(/\s+/g, ' ').trim()) {
    salida += /[\p{L}\p{N} .,:;·()/-]/u.test(caracter)
      ? caracter
      : `\\${caracter.codePointAt(0)!.toString(16)} `
  }
  return `"${salida}"`
}

/**
 * La fecha con que se emite el PDF: el día, sin la hora.
 *
 * Con la zona fijada, porque el servidor la pinta y el navegador la repinta al
 * imprimir: si cada uno usara la suya, una plataforma alojada en UTC diría un
 * día y el equipo del traumatólogo otro cerca de la medianoche, y la página
 * hidrataría con el texto distinto. La hora no va: el dueño pidió quitarla, y
 * un comprobante de lo estudiado se cita por el día.
 */
const FORMATO_DE_FECHA = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Santiago',
})

export const fechaDeEmision = (fecha: Date = new Date()): string => FORMATO_DE_FECHA.format(fecha)

/** El día en que se validó la ficha, o `null` si la fecha no se puede leer. */
export function fechaDeAuditoria(iso: string | null): string | null {
  if (!iso) return null
  const fecha = new Date(iso)
  return Number.isNaN(fecha.getTime()) ? null : FORMATO_DE_FECHA.format(fecha)
}

/**
 * El registro de «Lo que va pasando» (D-311): todo lo que la consola fue diciendo en el recorrido, del más nuevo al más
 * viejo, con un tope por tamaño y no por número de líneas.
 *
 * Se recortaba a diez anotaciones, y D-266 prometía que «terminado el caso, debajo del resumen queda el registro
 * entero». No quedaba: en un caso de siete pasos se anotan medidas, tornillos, avisos y correcciones, y diez líneas
 * no llegaban ni a cubrir el último paso. Lo que el residente iba a repasar al terminar —dónde se equivocó y qué le
 * dijo la consola— se había caído por el principio.
 *
 * El tope es de caracteres para que lo pare el tamaño y no la cuenta: mil anotaciones cortas pesan menos que cien
 * largas, y lo que importa es que la columna no crezca sin freno en una pestaña que pasa media hora abierta. Al
 * pasarse se cae lo más viejo, y lo dice una línea al final: un registro que se calla lo que perdió vuelve a prometer
 * que está entero.
 */

/** Una línea del registro, con su tono. */
export interface Anotacion {
  texto: string
  clase: 'bien' | 'atencion' | 'grave'
}

/**
 * Lo más que guarda el registro, en caracteres de texto. Una anotación son unos cien; doscientos mil son un par de miles
 * de líneas, muy por encima de cualquier recorrido real.
 */
export const TOPE_DEL_REGISTRO = 200_000

/** La línea que dice que lo más viejo se cayó. */
export const SE_CAYO_LO_MAS_VIEJO: Anotacion = {
  texto: 'El registro llegó a su tope: lo más antiguo ya no se muestra.',
  clase: 'atencion',
}

/** El registro con una anotación nueva delante, recortado por el final si pasa del tope. */
export function conLaAnotacion(registro: readonly Anotacion[], nueva: Anotacion, tope = TOPE_DEL_REGISTRO): Anotacion[] {
  const lista = [nueva, ...registro.filter((a) => a !== SE_CAYO_LO_MAS_VIEJO)]
  let total = 0
  for (let i = 0; i < lista.length; i++) {
    total += lista[i].texto.length
    // La primera se queda siempre: es la que se acaba de decir, por larga que sea.
    if (total > tope && i > 0) return [...lista.slice(0, i), SE_CAYO_LO_MAS_VIEJO]
  }
  return lista
}

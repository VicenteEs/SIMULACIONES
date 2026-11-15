/**
 * La versión de formato de los casos del simulador (D-373, E3 de P-016).
 *
 * Un caso guarda con qué formato se escribió: qué campos tiene, qué quiere
 * decir cada uno y en qué unidades. Hasta el 2026-11-15 no lo guardaba, y las
 * correcciones de datos viejos se iban sumando en `casoParaLaConsola` sin
 * número: la escala vacía, el objetivo de los pasos antiguos, la bandeja, el
 * modo, el manguito. Con las instituciones usando casos propios, un cambio del
 * simulador que lea mal un caso viejo ya no lo ve solo el equipo.
 *
 * La regla, desde aquí:
 * - **Cada cambio de formato sube `VERSION_DEL_FORMATO_DEL_CASO` y añade su
 *   conversión al final de `CONVERSIONES`.** La conversión `n` lleva un caso de
 *   la versión `n` a la `n + 1`, y es una función pura sobre el documento tal
 *   como sale de Payload. Una prueba exige una conversión por versión.
 * - **La misma conversión va en la migración**, que reescribe los casos
 *   guardados, también las versiones de `_cirugias_v`. Al leer se vuelve a
 *   aplicar a lo que la migración no tocó, como un caso que llega de una copia
 *   vieja.
 * - **Un caso de un formato más nuevo que este código no se lee**: se para con
 *   un mensaje. Pasa si se vuelve a una imagen anterior después de una
 *   migración que subió la versión. `actualizar.sh` hace justo eso cuando un
 *   despliegue falla, y las migraciones no se deshacen solas. Leerlo igual
 *   daría un caso con los pasos mal interpretados y un puntaje que no es el
 *   suyo, sin que nadie lo notara.
 *
 * **La versión 1** es el formato del 2026-11-15 tal como lo lee
 * `casoParaLaConsola`, con sus correcciones al leer, que siguen ahí. Por eso la
 * conversión 0 → 1 no cambia nada: todos los casos de antes ya estaban en ese
 * formato, y la migración de D-373 les escribió el 1.
 *
 * Se descartó atar cada caso a la versión del simulador con que se creó
 * (D-373): obligaría a mantener vivas las versiones viejas del simulador.
 *
 * Puro y sin servidor: lo usan la colección, la consola, la nota del servidor
 * y el ensayo de los casos.
 */

type Documento = Record<string, unknown>

/** El formato con que este código escribe y lee los casos. */
export const VERSION_DEL_FORMATO_DEL_CASO = 1

/** `CONVERSIONES[n]` lleva un caso de la versión `n` a la `n + 1`. */
export const CONVERSIONES: ReadonlyArray<(documento: Documento) => Documento> = [
  // 0 → 1: los casos de antes de D-373. Ya estaban en el formato 1; solo les
  // faltaba decirlo.
  (documento) => documento,
]

/**
 * La versión con que se escribió el caso. Sin número, o con uno que no es un
 * entero positivo, es la 0: un caso de antes de D-373.
 */
export function versionDelCaso(documento: Documento): number {
  const valor = documento.versionDelFormato
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0 ? valor : 0
}

/** Un caso escrito por un simulador más nuevo que el que lo quiere leer. */
export class CasoDeUnFormatoMasNuevo extends Error {
  constructor(
    readonly version: number,
    readonly nombre: string,
  ) {
    super(
      `El caso «${nombre}» se guardó con el formato ${version} y esta versión de la plataforma solo sabe leer hasta el ${VERSION_DEL_FORMATO_DEL_CASO}. ` +
        'Hay que actualizar la plataforma: leerlo igual daría pasos mal interpretados y un puntaje que no es el suyo.',
    )
    this.name = 'CasoDeUnFormatoMasNuevo'
  }
}

/**
 * El caso en el formato de este código: con las conversiones que le falten, en
 * orden, y con su versión puesta. El mismo objeto si ya estaba al día.
 *
 * Lanza `CasoDeUnFormatoMasNuevo` si el caso es de un formato más nuevo.
 */
export function alFormatoActual(documento: Documento): Documento {
  const version = versionDelCaso(documento)
  if (version > VERSION_DEL_FORMATO_DEL_CASO) {
    const nombre = typeof documento.nombre === 'string' && documento.nombre.trim() ? documento.nombre : 'sin nombre'
    throw new CasoDeUnFormatoMasNuevo(version, nombre)
  }
  if (version === VERSION_DEL_FORMATO_DEL_CASO) return documento
  let convertido = documento
  for (let n = version; n < VERSION_DEL_FORMATO_DEL_CASO; n++) convertido = CONVERSIONES[n](convertido)
  return { ...convertido, versionDelFormato: VERSION_DEL_FORMATO_DEL_CASO }
}

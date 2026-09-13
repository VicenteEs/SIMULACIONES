/**
 * Qué fichas insertan una preparación del atlas.
 *
 * Borrar una preparación que alguna ficha usa no da ningún error. La columna
 * `preparacion_id` de cada tabla de bloques se declaró `ON DELETE set null`
 * (migración `20260909_231143_atlas`), así que la base borra sin quejarse y deja
 * el bloque con la relación vacía: la ficha publicada enseña un visor sin nada
 * dentro, el editor la abre con un campo obligatorio en blanco que no deja
 * guardar, y nadie sabe qué preparación había ahí. El traumatólogo tiene que
 * enterarse ANTES, con los títulos delante, para decidir.
 *
 * ## Por qué se leen los campos del esquema y no una lista escrita a mano
 *
 * El bloque se puede poner en cualquier pila de bloques, y hoy hay diez: seis
 * pestañas de patologías y el «Material adicional» de otros cuatro módulos. Una
 * lista a mano estaría completa el día que se escribe y dejaría de estarlo el
 * día que alguien añada `pilaDeBloques` a un módulo nuevo, sin avisar: el borrado
 * volvería a dejar huecos solo en ese módulo. Leyendo la configuración que
 * Payload ya tiene montada, el módulo nuevo entra solo.
 *
 * Se recorren los grupos, las pestañas con nombre y las listas, que Payload sabe
 * consultar con la ruta con puntos. Un bloque de preparación metido dentro de
 * OTRO bloque no se busca: esa consulta no se puede escribir con `where`, y hoy
 * no existe ninguno. El día que exista, este es el sitio.
 */

/** El `slug` del bloque en `src/blocks/index.ts`. */
export const BLOQUE_DE_PREPARACION = 'instancia-atlas'

/** El campo de relación dentro de ese bloque. */
export const CAMPO_DE_PREPARACION = 'preparacion'

/** La forma mínima de un campo ya aplanado por Payload. */
interface CampoAplanado {
  type?: string
  name?: string
  flattenedFields?: CampoAplanado[]
  blocks?: ({ slug?: string } | string)[]
  blockReferences?: ({ slug?: string } | string)[]
}

/** La forma mínima de una colección ya montada (`payload.config.collections`). */
export interface ColeccionMontada {
  slug: string
  flattenedFields?: CampoAplanado[]
  admin?: { useAsTitle?: string }
  labels?: { singular?: unknown }
  versions?: unknown
}

export interface ColeccionConPreparaciones {
  coleccion: string
  /** Campo que hace de título, para poder decir «cuál» y no «el número 14». */
  titulo: string
  /** Cómo se llama un documento de la colección, para el mensaje. */
  etiqueta: string
  /**
   * Si tiene borradores. Entonces hay que mirar dos veces: el documento
   * publicado y el último borrador pueden llevar bloques distintos, y
   * cualquiera de los dos se queda con el hueco.
   */
  versionada: boolean
  /** Rutas de consulta, ya con el campo de la relación al final. */
  rutas: string[]
}

function rutasEn(campos: CampoAplanado[] | undefined, prefijo: string): string[] {
  const rutas: string[] = []
  for (const campo of campos ?? []) {
    if (!campo.name) continue
    if (campo.type === 'blocks') {
      const bloques = campo.blockReferences ?? campo.blocks ?? []
      const insertaPreparacion = bloques.some(
        (b) => (typeof b === 'string' ? b : b.slug) === BLOQUE_DE_PREPARACION,
      )
      if (insertaPreparacion) rutas.push(`${prefijo}${campo.name}.${CAMPO_DE_PREPARACION}`)
      continue
    }
    if (campo.type === 'group' || campo.type === 'tab' || campo.type === 'array') {
      rutas.push(...rutasEn(campo.flattenedFields, `${prefijo}${campo.name}.`))
    }
  }
  return rutas
}

/** Las colecciones que pueden llevar el bloque, con dónde lo llevan. */
export function coleccionesQueInsertanPreparaciones(
  colecciones: ColeccionMontada[],
): ColeccionConPreparaciones[] {
  return colecciones.flatMap((coleccion) => {
    const rutas = rutasEn(coleccion.flattenedFields, '')
    if (rutas.length === 0) return []
    const singular = coleccion.labels?.singular
    const versiones = coleccion.versions as { drafts?: unknown } | false | undefined
    return [
      {
        coleccion: coleccion.slug,
        titulo: coleccion.admin?.useAsTitle ?? 'id',
        etiqueta: typeof singular === 'string' ? singular : coleccion.slug,
        versionada: Boolean(versiones && versiones.drafts),
        rutas,
      },
    ]
  })
}

export interface UsoDeLaPreparacion {
  coleccion: string
  id: string
  titulo: string
  etiqueta: string
}

/**
 * El rechazo, dicho de forma que se pueda actuar sobre él.
 *
 * Con los títulos y el tipo de ficha, porque «está en uso» a secas obliga a
 * abrir los cinco módulos uno por uno buscando un bloque. Se enseñan hasta ocho
 * y se dice cuántas más: la lista entera de una preparación muy usada no cabe
 * en un aviso, y callar el resto haría creer que al quitar esas ocho ya se
 * puede borrar.
 *
 * `puedeNombrar` decide qué fichas se nombran, y existe porque la búsqueda de
 * usos va con `overrideAccess: true` —a propósito: una ficha que el editor no
 * ve se rompe igual—. Sin este filtro, el aviso le enseñaba a un editor el
 * título de fichas de módulos que no tiene, borradores incluidos: lo que el
 * control de acceso le oculta en el listado se lo contaba el mensaje de error.
 * Las que no puede nombrar SIGUEN CONTANDO para negar el borrado; solo se
 * dicen como número, para que sepa que hay que pedírselo a quien las edita.
 */
export function mensajeDePreparacionEnUso(
  usos: UsoDeLaPreparacion[],
  puedeNombrar: (uso: UsoDeLaPreparacion) => boolean = () => true,
): string {
  const TOPE = 8
  const visibles = usos.filter(puedeNombrar)
  const ajenas = usos.length - visibles.length
  const nombradas = visibles
    .slice(0, TOPE)
    .map((u) => `«${u.titulo}» (${u.etiqueta})`)
    .join(', ')
  const cuantas = usos.length === 1 ? 'la usa una ficha' : `la usan ${usos.length} fichas`

  const partes: string[] = []
  if (nombradas) {
    const resto = visibles.length > TOPE ? ` y ${visibles.length - TOPE} más` : ''
    partes.push(nombradas + resto)
  }
  if (ajenas > 0) {
    partes.push(
      ajenas === 1
        ? 'una de un módulo que usted no edita'
        : `${ajenas} de módulos que usted no edita`,
    )
  }

  const queHacer =
    ajenas > 0 && visibles.length === 0
      ? 'Pídale a quien edita esas fichas que quite el bloque (o lo cambie por otra preparación).'
      : ajenas > 0
        ? 'Quite el bloque de las que puede editar, y pida lo mismo a quien edita las demás.'
        : 'Quite el bloque de esas fichas (o cámbielo por otra preparación) y vuelva a intentarlo.'

  return (
    `No se borró: ${cuantas}: ${partes.join('; ')}. ` +
    `Si se borrara, su visor se quedaría vacío. ${queHacer}`
  )
}

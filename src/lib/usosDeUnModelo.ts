/**
 * Qué usa un modelo 3D, y qué hacer si se quiere borrar (D-372, E3 de P-016).
 *
 * Borrar un modelo que algo usa no daba ningún error. Todas las columnas que
 * apuntan a `modelos_3d` se declararon `ON DELETE set null`, así que la base
 * borraba sin quejarse y dejaba:
 *  - el caso sin modelo, con los nombres de nodo de sus piezas y sus pasos
 *    apuntando a un archivo que ya no está;
 *  - el instrumento sin pieza;
 *  - el paso de técnica AO sin su modelo;
 *  - el bloque «Modelo 3D» de la ficha con la relación vacía, que además no
 *    valida al volver a guardarla.
 *
 * ## El inventario sale de la base, no de una lista
 *
 * Lo que se busca son exactamente las columnas que la base pondría a nulo, y
 * esas las dice el catálogo de PostgreSQL (`usosDeUnModeloServidor.ts`). Una
 * lista escrita aquí estaría completa el día que se escribe y dejaría de
 * estarlo el día que alguien añada un campo de modelo o ponga el bloque en un
 * módulo nuevo: el borrado volvería a dejar huecos solo ahí, sin avisar. Este
 * archivo solo sabe leer cada columna: de qué colección es y por dónde se llega
 * a su documento.
 *
 * ## Las versiones antiguas no cuentan
 *
 * Cuentan el documento publicado y su último borrador, porque los dos se
 * rompen. Las versiones de antes son historia: un modelo que usó una versión de
 * hace tres meses no se podría borrar nunca, y restaurar esa versión ya dejaba
 * fuera lo que se hubiera borrado desde entonces (D-372, consecuencias).
 */

/** Una columna que apunta a `modelos_3d`, tal como la da el catálogo. */
export interface ColumnaDeModelo {
  tabla: string
  columna: string
  /** La tabla a la que apunta su `_parent_id`, si es una tabla hija (bloques, listas). */
  padre: string | null
}

/**
 * Cómo se llega desde la columna al documento que usa el modelo.
 *
 *  - `documento`: la columna es del documento (`cirugias.modelo_id`).
 *  - `hija`: de una fila de bloque o de lista del documento (`casos_ao_pasos`).
 *  - `version`: de la versión del documento (`_cirugias_v.version_modelo_id`);
 *    solo cuenta la última.
 *  - `hija-de-version`: de una fila hija de una versión; también solo la última.
 */
export type Via = 'documento' | 'hija' | 'version' | 'hija-de-version'

export interface DondeSeUsa extends ColumnaDeModelo {
  coleccion: string
  via: Via
}

/** La tabla de una colección: Payload cambia los guiones por guiones bajos (`casos-ao` → `casos_ao`). */
export const tablaDe = (slug: string): string => slug.replace(/-/g, '_')
const tablaDeVersiones = (slug: string): string => `_${tablaDe(slug)}_v`

/**
 * Clasifica cada columna por su colección y su vía.
 *
 * Las de Payload que no son de ningún documento (`payload_locked_documents_rels`)
 * se dejan fuera: el panel propio no bloquea documentos. Lo que no encaja en
 * ninguna vía sale en `sinClasificar`, y la prueba de integración exige que esa
 * lista esté vacía: una columna nueva que este archivo no sepa leer tiene que
 * pararlo todo, no quedarse sin mirar.
 */
export function clasificarColumnas(
  columnas: readonly ColumnaDeModelo[],
  slugs: readonly string[],
): { donde: DondeSeUsa[]; sinClasificar: ColumnaDeModelo[] } {
  const donde: DondeSeUsa[] = []
  const sinClasificar: ColumnaDeModelo[] = []
  for (const c of columnas) {
    if (c.tabla.startsWith('payload_')) continue
    const encontrada = slugs.flatMap((slug): DondeSeUsa[] => {
      if (c.tabla === tablaDe(slug)) return [{ ...c, coleccion: slug, via: 'documento' }]
      if (c.tabla === tablaDeVersiones(slug)) return [{ ...c, coleccion: slug, via: 'version' }]
      if (c.padre === tablaDe(slug)) return [{ ...c, coleccion: slug, via: 'hija' }]
      if (c.padre === tablaDeVersiones(slug)) return [{ ...c, coleccion: slug, via: 'hija-de-version' }]
      return []
    })
    if (encontrada.length === 1) donde.push(encontrada[0])
    else sinClasificar.push(c)
  }
  return { donde, sinClasificar }
}

// ------------------------------------------------------------ el mensaje

export interface UsoDelModelo {
  coleccion: string
  id: string
  titulo: string
  /** Cómo se llama un documento de la colección: «Cirugía», «Instrumento»… */
  etiqueta: string
}

/**
 * El rechazo de un borrado, dicho de forma que se pueda actuar sobre él.
 *
 * Con los títulos, como el de las preparaciones (`mensajeDePreparacionEnUso`),
 * y por lo mismo: «está en uso» a secas obliga a abrir los cinco módulos uno por
 * uno. Se nombran hasta ocho y se dice cuántos más: callar el resto haría creer
 * que al cambiar esos ocho ya se puede borrar.
 *
 * `puedeNombrar` existe por lo mismo que allí: la búsqueda va con
 * `overrideAccess`, y sin el filtro el aviso le contaría a un editor
 * restringido los títulos —borradores incluidos— de módulos que el control de
 * acceso le oculta. Los que no puede nombrar siguen contando para negar el
 * borrado, y entonces el reemplazo tampoco es suyo: «Reemplazar por…» cambia
 * todos a la vez (`reemplazarModeloEnTodo`), y no puede tocar fichas que no
 * edita.
 */
export function mensajeDeModeloEnUso(
  usos: readonly UsoDelModelo[],
  puedeNombrar: (uso: UsoDelModelo) => boolean = () => true,
): string {
  const TOPE = 8
  const visibles = usos.filter(puedeNombrar)
  const ajenos = usos.length - visibles.length
  const partes: string[] = []
  if (visibles.length > 0) {
    const nombrados = visibles
      .slice(0, TOPE)
      // La etiqueta tal cual: en minúsculas, «Caso AO» salía «caso ao».
      .map((u) => `«${u.titulo}» (${u.etiqueta})`)
      .join(', ')
    partes.push(nombrados + (visibles.length > TOPE ? ` y ${visibles.length - TOPE} más` : ''))
  }
  if (ajenos > 0) partes.push(ajenos === 1 ? 'uno de un módulo que usted no edita' : `${ajenos} de módulos que usted no edita`)
  // «lo usa «X»» y «lo usan 3: «X», «Y»…»: con uno solo, los dos puntos sobraban.
  const verbo = usos.length === 1 ? 'lo usa ' : `lo usan ${usos.length}: `
  const quedaria = usos.length === 1 ? 'se quedaría' : 'se quedarían'
  const queHacer =
    ajenos > 0
      ? 'Pídale a un administrador que lo cambie en todos con «Reemplazar por…», en la ficha del modelo.'
      : 'Cámbielo en todos a la vez con «Reemplazar por…», en la ficha del modelo, y vuelva a intentarlo.'
  return `No se borró: ${verbo}${partes.join('; ')}. Si se borrara, ${quedaria} sin modelo. ${queHacer}`
}

/**
 * El error del borrado de un modelo en uso.
 *
 * Con `status` e `isPublic`, como `CuentaDesactivada` (`Usuarios.ts`) y por lo
 * mismo: sin ellos, por la API el mensaje llega como «Something went wrong». El
 * 409 porque el modelo existe y el borrado es válido; lo que lo impide es el
 * estado de lo demás.
 */
export class ModeloEnUso extends Error {
  readonly status = 409
  readonly isPublic = true

  constructor(
    readonly usos: readonly UsoDelModelo[],
    puedeNombrar?: (uso: UsoDelModelo) => boolean,
  ) {
    super(mensajeDeModeloEnUso(usos, puedeNombrar))
    this.name = 'ModeloEnUso'
  }
}

// ------------------------------------------------------------ el desplegable

const FECHA = new Intl.DateTimeFormat('es-CL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Santiago',
})

/**
 * Cómo se nombra un modelo en un desplegable (D-372).
 *
 * Con el nombre solo no se distinguían: cada exportación del atlas y cada
 * «Volver a exportar» crean un modelo nuevo con la misma etiqueta, y en ved
 * había tres «ejemplo_vicente · del atlas» seguidos sin forma de saber cuál
 * era cuál. El número y la fecha los separan, y «sin usar» dice cuál se puede
 * borrar sin mirar más. `enUso` sin dar (`undefined`) no dice nada: no saberlo
 * no es lo mismo que no usarse.
 */
export function etiquetaDeModelo(
  modelo: { id?: unknown; nombre?: unknown; createdAt?: unknown },
  enUso?: boolean,
): string {
  const nombre = typeof modelo.nombre === 'string' && modelo.nombre.trim() ? modelo.nombre : 'Sin nombre'
  const fecha = typeof modelo.createdAt === 'string' ? new Date(modelo.createdAt) : null
  const partes = [nombre, `#${String(modelo.id)}`]
  if (fecha && !Number.isNaN(fecha.getTime())) partes.push(FECHA.format(fecha))
  if (enUso === false) partes.push('sin usar')
  return partes.join(' · ')
}

/**
 * Lo que se dice al borrar una preparación (D-372): cuántos modelos se fueron
 * con ella y cuáles se quedan porque algo los usa. Sin datos —una respuesta
 * vieja, un fallo al contar—, lo de antes.
 */
export function mensajeDePreparacionEliminada(
  datos: { modelosBorrados?: number; modelosQueSeQuedan?: string[] } | null | undefined,
): string {
  const borrados = datos?.modelosBorrados ?? 0
  const quedan = datos?.modelosQueSeQuedan ?? []
  const partes = ['Preparación eliminada']
  if (borrados > 0) partes[0] += borrados === 1 ? ', con el modelo que exportó.' : `, con los ${borrados} modelos que exportó.`
  else partes[0] += '.'
  if (quedan.length > 0) {
    partes.push(
      `${quedan.length === 1 ? 'Se queda' : 'Se quedan'} ${quedan.map((q) => `«${q}»`).join(', ')}, porque algo ${quedan.length === 1 ? 'lo usa' : 'los usa'}: en la ficha del modelo se ve qué.`,
    )
  }
  return partes.join(' ')
}

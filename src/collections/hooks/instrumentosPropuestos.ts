import type { CollectionAfterChangeHook } from 'payload'

/**
 * Convierte en comentario cada instrumento que un paso pide y el catálogo no
 * tiene.
 *
 * El editor que arma un guion no puede crear instrumentos: el catálogo es de
 * la administración, porque cada uno se dibuja en la bandeja con su icono y su
 * modelo, y una lista que crece desde cada cirugía acaba con «Pinza Kocher»,
 * «pinza kocher» y «Kocher» como tres herramientas distintas. Antes de esto, al
 * no encontrarlo, dejaba el paso sin instrumento o elegía el más parecido, y
 * nadie se enteraba de que faltaba uno.
 *
 * Ahora escribe el nombre en `instrumentoPropuesto` y, al guardar, sale un
 * comentario pendiente sobre la cirugía. Va por comentario y no por un aviso
 * nuevo a propósito: los comentarios ya tienen su bandeja en el panel, su
 * contador de pendientes en la barra lateral, su correo a los administradores
 * y su «resuelto». Un canal paralelo para lo mismo es uno más que mirar.
 *
 * Se avisa solo de lo que cambia. El gancho corre en cada guardado, también en
 * cada borrador, y un paso que conserva su propuesta no debe repetir el aviso
 * diez veces: se compara con el mismo paso —por su `id` de fila— en la versión
 * anterior. Y como un paso duplicado o reordenado cambia de fila, se mira
 * además si ese mismo texto ya está pendiente en la ficha.
 */

type Paso = { id?: unknown; titulo?: unknown; instrumentoPropuesto?: unknown }

const nombreLimpio = (valor: unknown): string =>
  typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim() : ''

/** Mayúsculas y espacios no hacen un instrumento distinto. */
const clave = (nombre: string): string => nombre.toLocaleLowerCase('es')

export function textoDeLaPropuesta(nombre: string, numero: number, titulo: string): string {
  const paso = titulo ? `el paso ${numero} («${titulo}»)` : `el paso ${numero}`
  return `Instrumento propuesto: «${nombre}», para ${paso}. No está en el catálogo de instrumental: hay que crearlo y elegirlo en ese paso.`
}

/**
 * Qué propuestas son nuevas respecto de la versión anterior.
 *
 * Separada del gancho para poder probarla sin base de datos.
 */
export function propuestasNuevas(
  pasos: unknown,
  pasosAnteriores: unknown,
): { nombre: string; numero: number; titulo: string }[] {
  const anteriores = new Map<string, string>()
  for (const paso of (Array.isArray(pasosAnteriores) ? pasosAnteriores : []) as Paso[]) {
    if (paso?.id !== undefined && paso.id !== null) {
      anteriores.set(String(paso.id), clave(nombreLimpio(paso.instrumentoPropuesto)))
    }
  }
  const nuevas: { nombre: string; numero: number; titulo: string }[] = []
  ;((Array.isArray(pasos) ? pasos : []) as Paso[]).forEach((paso, indice) => {
    const nombre = nombreLimpio(paso?.instrumentoPropuesto)
    if (!nombre) return
    if (paso.id !== undefined && paso.id !== null && anteriores.get(String(paso.id)) === clave(nombre)) {
      return
    }
    nuevas.push({ nombre, numero: indice + 1, titulo: nombreLimpio(paso.titulo) })
  })
  return nuevas
}

export const avisarDeInstrumentosPropuestos: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  const nuevas = propuestasNuevas(
    (doc as { pasos?: unknown }).pasos,
    (previousDoc as { pasos?: unknown } | undefined)?.pasos,
  )
  if (nuevas.length === 0 || !req.payload) return doc

  const documentoId = String((doc as { id: unknown }).id)
  for (const { nombre, numero, titulo } of nuevas) {
    // Si ya está en el catálogo, el editor no lo vio en la lista: se le
    // contesta igual por comentario, porque es él quien tiene que elegirlo.
    const yaExiste = await req.payload.find({
      collection: 'instrumental',
      where: { nombre: { like: nombre } },
      limit: 20,
      depth: 0,
      req,
    })
    const existente = yaExiste.docs.find(
      (i) => clave(nombreLimpio((i as { nombre?: unknown }).nombre)) === clave(nombre),
    )
    const texto = existente
      ? `Instrumento propuesto: «${nombre}», para el paso ${numero}${titulo ? ` («${titulo}»)` : ''}. Ya existe en el catálogo como «${String((existente as { nombre?: unknown }).nombre)}»: basta con elegirlo en ese paso.`
      : textoDeLaPropuesta(nombre, numero, titulo)

    const repetido = await req.payload.count({
      collection: 'comentarios',
      where: {
        and: [
          { coleccion: { equals: 'cirugias' } },
          { documentoId: { equals: documentoId } },
          { estado: { equals: 'pendiente' } },
          { texto: { equals: texto } },
        ],
      },
      req,
    })
    if (repetido.totalDocs > 0) continue

    // Con el `req` de la escritura: el comentario queda a nombre de quien
    // guardó la cirugía —lo pone el gancho de `Comentarios`— y dentro de la
    // misma transacción, así que si la cirugía no llega a guardarse tampoco
    // queda un aviso de algo que no existe.
    await req.payload.create({
      collection: 'comentarios',
      data: { coleccion: 'cirugias', documentoId, texto, estado: 'pendiente' },
      req,
    })
  }
  return doc
}

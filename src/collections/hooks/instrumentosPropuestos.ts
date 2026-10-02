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

/**
 * Techos del aviso. Este gancho crea comentarios sin pasar por `crearComentario`
 * y, por tanto, sin su freno por cuenta ni su largo máximo: cada comentario
 * manda un correo a cada administrador, con el mismo cupo de envío que la
 * recuperación de clave. Sin techo, una cirugía de 500 pasos con 500 nombres
 * distintos eran 500 correos por administrador en un solo guardado, y cambiar
 * los nombres y guardar otra vez, otros 500 (O-076).
 */
export const LARGO_MAXIMO_DEL_NOMBRE = 120
export const MAXIMO_DE_INSTRUMENTOS_POR_GUARDADO = 10

const nombreLimpio = (valor: unknown): string =>
  typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim().slice(0, LARGO_MAXIMO_DEL_NOMBRE) : ''

/** Mayúsculas y espacios no hacen un instrumento distinto. */
const clave = (nombre: string): string => nombre.toLocaleLowerCase('es')

type PasoPropuesto = { numero: number; titulo: string }
export type Propuesta = { nombre: string; pasos: PasoPropuesto[] }

function describirPasos(pasos: PasoPropuesto[]): string {
  if (pasos.length === 1) {
    const [{ numero, titulo }] = pasos
    return titulo ? `el paso ${numero} («${titulo}»)` : `el paso ${numero}`
  }
  const numeros = pasos.map((p) => p.numero)
  return `los pasos ${numeros.slice(0, -1).join(', ')} y ${numeros[numeros.length - 1]}`
}

export function textoDeLaPropuesta(nombre: string, pasos: PasoPropuesto[]): string {
  return `Instrumento propuesto: «${nombre}», para ${describirPasos(pasos)}. No está en el catálogo de instrumental: hay que crearlo y elegirlo en ${pasos.length === 1 ? 'ese paso' : 'esos pasos'}.`
}

/**
 * Qué propuestas son nuevas respecto de la versión anterior, agrupadas por
 * instrumento.
 *
 * Agrupadas porque el mismo instrumento que falta suele faltar en varios pasos
 * —la grapadora del cierre, en cada plano—, y antes eso era un comentario y un
 * correo por paso aunque la administración tenga que crearlo una sola vez.
 *
 * Separada del gancho para poder probarla sin base de datos.
 */
export function propuestasNuevas(pasos: unknown, pasosAnteriores: unknown): Propuesta[] {
  const anteriores = new Map<string, string>()
  for (const paso of (Array.isArray(pasosAnteriores) ? pasosAnteriores : []) as Paso[]) {
    if (paso?.id !== undefined && paso.id !== null) {
      anteriores.set(String(paso.id), clave(nombreLimpio(paso.instrumentoPropuesto)))
    }
  }
  const porNombre = new Map<string, Propuesta>()
  ;((Array.isArray(pasos) ? pasos : []) as Paso[]).forEach((paso, indice) => {
    const nombre = nombreLimpio(paso?.instrumentoPropuesto)
    if (!nombre) return
    if (paso.id !== undefined && paso.id !== null && anteriores.get(String(paso.id)) === clave(nombre)) {
      return
    }
    const lugar = { numero: indice + 1, titulo: nombreLimpio(paso.titulo) }
    const existente = porNombre.get(clave(nombre))
    if (existente) existente.pasos.push(lugar)
    else porNombre.set(clave(nombre), { nombre, pasos: [lugar] })
  })
  return [...porNombre.values()]
}

export const avisarDeInstrumentosPropuestos: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  req,
}) => {
  const todas = propuestasNuevas(
    (doc as { pasos?: unknown }).pasos,
    (previousDoc as { pasos?: unknown } | undefined)?.pasos,
  )
  if (todas.length === 0 || !req.payload) return doc

  // El catálogo entero y de una vez, y no un `like` por propuesta: en
  // PostgreSQL `like` parte el nombre en palabras y busca cada una suelta, así
  // que con un nombre corto y más de veinte coincidencias el exacto podía no
  // volver, y el comentario decía «no está» de uno que sí estaba. El catálogo
  // es de decenas de filas; solo se pide el nombre.
  const catalogo = await req.payload.find({
    collection: 'instrumental',
    pagination: false,
    select: { nombre: true },
    depth: 0,
    req,
  })
  const enCatalogo = new Map<string, string>()
  for (const instrumento of catalogo.docs) {
    const nombre = (instrumento as { nombre?: unknown }).nombre
    if (typeof nombre === 'string') enCatalogo.set(clave(nombreLimpio(nombre)), nombre)
  }

  const documentoId = String((doc as { id: unknown }).id)
  const textos = todas.slice(0, MAXIMO_DE_INSTRUMENTOS_POR_GUARDADO).map(({ nombre, pasos }) => {
    // Si ya está en el catálogo, el editor no lo vio en la lista: se le
    // contesta igual por comentario, porque es él quien tiene que elegirlo.
    const existente = enCatalogo.get(clave(nombre))
    return existente
      ? `Instrumento propuesto: «${nombre}», para ${describirPasos(pasos)}. Ya existe en el catálogo como «${existente}»: basta con elegirlo.`
      : textoDeLaPropuesta(nombre, pasos)
  })
  const sobrantes = todas.length - MAXIMO_DE_INSTRUMENTOS_POR_GUARDADO
  if (sobrantes > 0) {
    textos.push(
      `Hay ${sobrantes} instrumento${sobrantes === 1 ? '' : 's'} propuesto${sobrantes === 1 ? '' : 's'} más en esta cirugía, sin aviso propio: revise el campo «Instrumento que falta en la lista» de cada paso.`,
    )
  }

  for (const texto of textos) {
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
    // misma transacción, así que si la cirugía no llega a guardarse el
    // comentario tampoco queda. El correo a los administradores, en cambio, sí
    // puede salir: el gancho de `Comentarios` lo dispara sin esperar al commit,
    // y un fallo después de este punto deja un aviso de algo que no se guardó.
    // Se acepta: es raro, y el remedio —avisar desde la acción, ya fuera de la
    // transacción— dejaría sin aviso los guardados que no pasan por ella.
    await req.payload.create({
      collection: 'comentarios',
      data: { coleccion: 'cirugias', documentoId, texto, estado: 'pendiente' },
      req,
    })
  }
  return doc
}

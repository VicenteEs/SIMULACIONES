/**
 * El equipo que enseña la portada pública, después de la tarjeta de Chesscore
 * (D-277).
 *
 * Son las filas de la pestaña «Equipo» (D-217), y la portada las lee por aquí y
 * no con la regla de la colección: quien mira la portada no tiene sesión, y
 * `lecturaSimple` le contestaría que no. Por eso se lee con `overrideAccess`,
 * como `leerCambios` de «Medios de la página» —quien pregunta es la
 * plataforma—, y con `select`: de cada fila sale solo lo que la tarjeta pinta.
 * La colección sigue cerrada por la API (D-020); lo público son estas cuatro
 * cosas y la ruta de la foto, nada más.
 *
 * Lo que el administrador guarda en «Equipo» se publica al guardarlo, porque la
 * colección no tiene borrador. Es lo que pidió el dueño —que salgan los cargos
 * de la pestaña y no una tarjeta escrita a mano—, y por eso lo dice la ayuda de
 * la pestaña: nadie debería dar de alta a alguien sin saber que queda a la vista
 * de cualquiera.
 */
import type { Payload } from 'payload'
import { ruta } from './rutas'

export type ClienteDeLectura = Pick<Payload, 'find'>

/** Una tarjeta del equipo, tal como la pinta la portada. */
export interface ColaboradorPublico {
  id: string
  nombre: string
  cargo: string
  /** Vacía si no la tiene: la tarjeta no pinta el párrafo. */
  descripcion: string
  /** La dirección pública de su foto, con el prefijo puesto, o `null` para pintar las iniciales. */
  foto: string | null
}

/**
 * Los tipos que la ruta pública entrega. Son los que ofrece el campo de la foto
 * en el panel (`acepta`), y no los de la colección `medios`, que admite también
 * SVG y vídeo: elegir otro archivo es posible por la API, y lo que no está en
 * esta lista se queda sin servir y la tarjeta pinta las iniciales.
 */
const TIPOS_DE_FOTO = ['image/png', 'image/jpeg', 'image/webp']

/** El número de un archivo de `medios`, tal como llega en la dirección: solo cifras. */
const NUMERO_DE_MEDIO = /^[1-9]\d{0,11}$/

interface FilaDelEquipo {
  id: string | number
  nombre?: unknown
  cargo?: unknown
  descripcion?: unknown
  foto?: unknown
  orden?: unknown
}

interface Tamano {
  filename?: unknown
  mimeType?: unknown
}

interface FilaDeMedio extends Tamano {
  id: string | number
  sizes?: { ancho?: Tamano | null } | null
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '')

/**
 * El orden de la pestaña y de la portada: el que da el administrador (`orden`)
 * y, a igual orden, el nombre.
 *
 * Se ordena en el servidor de la aplicación y no en la consulta para que el
 * desempate use el alfabeto del español: la base pondría «Álvaro» después de
 * «Zoe». Son unas pocas filas. La usan las dos páginas, para que la portada y
 * la pestaña no puedan enseñar el mismo equipo en dos órdenes.
 */
export const ordenDelEquipo = (
  a: { orden?: number | null; nombre: string },
  b: { orden?: number | null; nombre: string },
): number => (a.orden ?? 0) - (b.orden ?? 0) || a.nombre.localeCompare(b.nombre, 'es')

/**
 * La dirección pública de la foto de un colaborador: el número de su archivo
 * en `medios`. Con `ruta()`, porque es una cadena escrita a mano (AGENTS.md).
 */
export const direccionDeFotoDelEquipo = (medio: string | number): string => ruta(`/api/foto-del-equipo/${medio}`)

/** El número del archivo de la foto, venga como número o como fila poblada; `null` si no tiene. */
function numeroDeLaFoto(foto: unknown): string | null {
  const id = typeof foto === 'object' && foto !== null ? (foto as { id?: unknown }).id : foto
  const numero = typeof id === 'number' || typeof id === 'string' ? String(id) : ''
  return NUMERO_DE_MEDIO.test(numero) ? numero : null
}

/**
 * El archivo que se sirve de una foto: el tamaño `ancho` si Payload lo hizo
 * —una foto de cámara de 6000 px se queda en 1400—, y si no, el original, que
 * entonces ya es más estrecho que eso (Payload no agranda).
 */
function archivoQueSeSirve(medio: FilaDeMedio): { nombre: string; tipo: string } | null {
  for (const candidato of [medio.sizes?.ancho, medio]) {
    const nombre = texto(candidato?.filename)
    const tipo = texto(candidato?.mimeType)
    if (nombre && TIPOS_DE_FOTO.includes(tipo)) return { nombre, tipo }
  }
  return null
}

/**
 * El equipo de la portada, ya ordenado.
 *
 * Dos consultas y no una con `depth`: la segunda pide de cada foto solo su
 * nombre y su tipo, y así una foto que no es imagen —o cuyo archivo se borró de
 * `medios`— se descarta aquí y la tarjeta pinta las iniciales, en lugar de un
 * recuadro roto que la ruta contestaría con un 404.
 */
export async function leerEquipoPublico(payload: ClienteDeLectura): Promise<ColaboradorPublico[]> {
  const { docs } = await payload.find({
    collection: 'equipo',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    select: { nombre: true, cargo: true, descripcion: true, foto: true, orden: true },
  })

  const filas = (docs as FilaDelEquipo[])
    .map((fila) => ({
      id: String(fila.id),
      nombre: texto(fila.nombre),
      cargo: texto(fila.cargo),
      descripcion: texto(fila.descripcion),
      medio: numeroDeLaFoto(fila.foto),
      orden: typeof fila.orden === 'number' ? fila.orden : null,
    }))
    // Nombre y cargo son obligatorios en la colección; una fila sin nombre solo
    // llega de una base tocada a mano, y una tarjeta sin título no se pinta.
    .filter((fila) => fila.nombre !== '')
    .sort(ordenDelEquipo)

  const numeros = [...new Set(filas.flatMap((fila) => (fila.medio ? [Number(fila.medio)] : [])))]
  const servibles = new Set<string>()
  if (numeros.length > 0) {
    const { docs: medios } = await payload.find({
      collection: 'medios',
      where: { id: { in: numeros } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      select: { filename: true, mimeType: true, sizes: true },
    })
    for (const medio of medios as FilaDeMedio[]) {
      if (archivoQueSeSirve(medio)) servibles.add(String(medio.id))
    }
  }

  return filas.map(({ id, nombre, cargo, descripcion, medio }) => ({
    id,
    nombre,
    cargo,
    descripcion,
    foto: medio && servibles.has(medio) ? direccionDeFotoDelEquipo(medio) : null,
  }))
}

/**
 * ¿Se puede entregar en público este archivo de `medios`? Solo si es la foto de
 * alguien del equipo y es una imagen. Devuelve lo que la ruta necesita para
 * servirlo, o `null`.
 *
 * Es la misma pregunta que se hace `leerEquipoPublico` al pintar la tarjeta, y
 * por eso vive en el mismo archivo: si la ruta decidiera por su cuenta, podría
 * servir una foto que la portada ya no enseña. Cualquier otro archivo de
 * `medios` —la radiografía de una ficha— sigue detrás de la sesión (D-020),
 * aunque alguien pruebe números: el que no es la foto de nadie no se entrega.
 */
export async function fotoDelEquipoPublica(
  payload: ClienteDeLectura,
  medio: string,
): Promise<{ nombre: string; tipo: string } | null> {
  if (!NUMERO_DE_MEDIO.test(medio)) return null
  const id = Number(medio)

  const [colaboradores, medios] = await Promise.all([
    payload.find({
      collection: 'equipo',
      where: { foto: { equals: id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { foto: true },
    }),
    payload.find({
      collection: 'medios',
      where: { id: { equals: id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      select: { filename: true, mimeType: true, sizes: true },
    }),
  ])
  const fila = medios.docs[0] as FilaDeMedio | undefined
  if (colaboradores.docs.length === 0 || !fila) return null
  return archivoQueSeSirve(fila)
}

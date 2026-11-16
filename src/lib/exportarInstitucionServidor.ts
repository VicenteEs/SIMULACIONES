/**
 * El contenido de una institución en un ZIP (P-016 E5.8, D-371, D-403), para
 * devolvérselo antes de que se borren sus cuentas.
 *
 * Lo descarga el administrador de TraumaHub desde «Instituciones»
 * (`api/instituciones/[id]/contenido`): para entonces la institución está
 * bloqueada y nadie de ella puede entrar a llevárselo.
 *
 * Lleva lo que la institución creó, y nada de quienes lo crearon:
 *
 * - la última versión de cada documento de los cinco módulos, borradores
 *   incluidos, en JSON y con los nombres de campo de la base. No es un formato
 *   para volver a importar, sino para no perder lo escrito: el texto, las
 *   imágenes y los modelos se pueden llevar a cualquier otra parte;
 * - los medios y los modelos 3D, con sus archivos;
 * - la ficha de la institución, sin su código de invitación.
 *
 * Las cuentas, la actividad y el registro no salen: son datos personales, y el
 * aviso no promete entregárselos a nadie más que a su titular (D-293).
 *
 * Se arma en memoria, con un techo para los archivos (`TECHO_DE_ARCHIVOS`). Lo
 * que no cabe queda nombrado en el `LEEME.txt`, para pedirlo aparte.
 */
import { readFile, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import type { CollectionSlug, Payload } from 'payload'
import { COLECCIONES_COMPARTIDAS } from '@/collections/hooks/marcaDeInstitucion'
import { diaEnPalabras } from './instituciones'
import { crearZip, type ArchivoDelZip } from './zip'

/**
 * Cuántos bytes de archivos caben en una exportación. El ZIP se arma en
 * memoria y se copia una vez al cerrarlo, así que el proceso llega a tener el
 * doble un momento: 200 MB son 400 en uno de los cuatro procesos de Contabo
 * (D-393), que se pueden permitir una vez y no muchas a la vez.
 */
export const TECHO_DE_ARCHIVOS = 200 * 1024 * 1024

export interface ExportacionDeInstitucion {
  nombre: string
  subdominio: string
  zip: Uint8Array
  /** Cuántos documentos de cada colección. */
  documentos: Record<string, number>
  /** Cuántos archivos van dentro, y cuántos bytes suman. */
  archivos: number
  bytes: number
  /** Los archivos que no entraron, con el motivo. */
  fuera: string[]
}

/**
 * La carpeta de los archivos de una colección, o `null` si no los tiene. Sale
 * de la configuración de Payload, que la resuelve contra el directorio de
 * trabajo igual que aquí: así no se escribe en dos sitios.
 */
function carpetaDe(payload: Payload, coleccion: string): string | null {
  const subida = payload.collections[coleccion as CollectionSlug]?.config.upload as { staticDir?: string } | undefined
  return subida?.staticDir ? resolve(subida.staticDir) : null
}

const enMegas = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`

function leeme(datos: { nombre: string; fecha: Date; documentos: Record<string, number>; archivos: number; bytes: number; fuera: string[] }): string {
  const lineas = [
    `Contenido de ${datos.nombre} en TraumaHub`,
    `Exportado el ${diaEnPalabras(datos.fecha)} (${datos.fecha.toISOString()}).`,
    '',
    'Qué hay dentro:',
    '- institucion.json: la ficha de la institución, con su plazo y su cupo.',
    '- contenido/<colección>.json: cada documento creado en la institución, en su última versión y con sus borradores. Los campos llevan los nombres de la base de TraumaHub.',
    '- archivos/<colección>/: las imágenes, los vídeos y los modelos 3D que subió la institución. Cada documento de medios y de modelos nombra el suyo en «filename».',
    '',
    'Cuántos documentos:',
    ...Object.entries(datos.documentos).map(([coleccion, n]) => `- ${coleccion}: ${n}`),
    `- archivos: ${datos.archivos} (${enMegas(datos.bytes)})`,
    '',
    'Qué no está:',
    '- las cuentas, ni lo que hizo cada persona: son datos personales y no salen con el contenido;',
    '- las versiones anteriores de cada documento, solo la última;',
    '- el contenido de TraumaHub que la institución veía, que no es suyo.',
  ]
  if (datos.fuera.length > 0) {
    lineas.push('', 'Archivos que no se incluyeron (pídalos aparte a TraumaHub):', ...datos.fuera.map((f) => `- ${f}`))
  }
  return lineas.join('\n') + '\n'
}

/** Arma la exportación de la institución `id`, o `null` si no existe. */
export async function exportarInstitucion(
  payload: Payload,
  id: number,
  ahora: Date = new Date(),
  techo: number = TECHO_DE_ARCHIVOS,
): Promise<ExportacionDeInstitucion | null> {
  const fila = (await payload.findByID({
    collection: 'instituciones',
    id,
    depth: 0,
    overrideAccess: true,
    disableErrors: true,
  })) as Record<string, unknown> | null
  if (!fila) return null

  const documentos: Record<string, number> = {}
  const contenido: ArchivoDelZip[] = []
  const archivos: ArchivoDelZip[] = []
  const fuera: string[] = []
  let bytes = 0

  for (const coleccion of COLECCIONES_COMPARTIDAS) {
    const { docs } = await payload.find({
      collection: coleccion as CollectionSlug,
      where: { institucion: { equals: id } },
      pagination: false,
      depth: 0,
      draft: true,
      overrideAccess: true,
    })
    documentos[coleccion] = docs.length
    contenido.push({ nombre: `contenido/${coleccion}.json`, datos: JSON.stringify(docs, null, 2) + '\n' })

    const carpeta = carpetaDe(payload, coleccion)
    if (!carpeta) continue
    for (const doc of docs as unknown as { filename?: unknown }[]) {
      if (typeof doc.filename !== 'string' || !doc.filename) continue
      const camino = resolve(carpeta, doc.filename)
      // El nombre sale de la fila, pero se comprueba igual que en las rutas que
      // sirven archivos: una fila que traiga «../» no saca nada de fuera.
      if (!camino.startsWith(carpeta + sep)) {
        fuera.push(`${coleccion}/${doc.filename}: el nombre no es válido`)
        continue
      }
      const datos = await stat(camino).catch(() => null)
      if (!datos?.isFile()) {
        fuera.push(`${coleccion}/${doc.filename}: no está en el disco del servidor`)
        continue
      }
      if (bytes + datos.size > techo) {
        fuera.push(`${coleccion}/${doc.filename}: no cupo (${enMegas(datos.size)})`)
        continue
      }
      // Sin comprimir: imágenes, vídeos y glTF ya vienen comprimidos.
      archivos.push({ nombre: `archivos/${coleccion}/${doc.filename}`, datos: new Uint8Array(await readFile(camino)), comprimir: false })
      bytes += datos.size
    }
  }

  const nombre = String(fila.nombre ?? '')
  const subdominio = String(fila.subdominio ?? '')
  // La ficha, armada a mano: leída con `overrideAccess` trae también el código
  // de invitación, que no tiene por qué salir de la plataforma.
  const ficha = {
    nombre,
    subdominio,
    modalidad: fila.modalidad ?? null,
    inicio: fila.inicio ?? null,
    vence: fila.vence ?? null,
    cupo: fila.cupo ?? null,
    correoDelAdministrador: fila.correoDelAdministrador ?? null,
    exportadaEl: ahora.toISOString(),
  }
  const zip = crearZip(
    [
      { nombre: 'LEEME.txt', datos: leeme({ nombre, fecha: ahora, documentos, archivos: archivos.length, bytes, fuera }) },
      { nombre: 'institucion.json', datos: JSON.stringify(ficha, null, 2) + '\n' },
      ...contenido,
      ...archivos,
    ],
    ahora,
  )
  return { nombre, subdominio, zip, documentos, archivos: archivos.length, bytes, fuera }
}

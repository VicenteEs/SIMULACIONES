/**
 * Lo que el administrador cambió en las páginas públicas, leído de la base y
 * juntado con los originales (P-007 E2).
 *
 * Lo usan la portada y `/planes` para pintarse, la pestaña «Medios de la
 * página» para enseñar qué está cambiado, y la ruta pública de las fotos para
 * decidir si entrega un archivo. Las tres preguntan lo mismo —cuál es la foto
 * vigente de un espacio— y por eso la respuesta vive en un solo sitio: si la
 * ruta pública decidiera por su cuenta, podría servir una foto que la portada
 * ya no enseña, o negarse a servir la que enseña.
 *
 * Como `leerMantencion`, recibe el cliente de Payload de fuera y lee con
 * `overrideAccess`: quien pregunta es la plataforma, y quien mira la portada no
 * tiene sesión.
 */
import type { Payload } from 'payload'
import {
  ESPACIOS_DE_FOTO,
  ESPACIOS_DE_TEXTO,
  NOMBRE_DE_FOTO,
  espacioDeFoto,
  espacioDeTexto,
  sustituirCifras,
} from './espaciosDeLaPagina'
import { cifra } from './graficos'
import { ruta } from './rutas'

export type ClienteDeLectura = Pick<Payload, 'find'>

export const SLUG_DE_FOTOS = 'medios-pagina'
export const SLUG_DE_TEXTOS = 'textos-pagina'

/** Una foto subida, tal como la pinta la página. */
export interface FotoSubida {
  id: string
  /** Con el prefijo puesto: `next/image` no se lo pone a una cadena (ver `ruta()`). */
  src: string
  alt: string
  ancho: number | null
  alto: number | null
  subidaEn: string
}

export interface TextoCambiado {
  id: string
  texto: string
  cambiadoEn: string
}

export interface CambiosDeLaPagina {
  /** La foto vigente de cada espacio cambiado: la más reciente. */
  fotos: Map<string, FotoSubida>
  /** Las anteriores, que la pestaña retira al terminar una subida. */
  fotosAnteriores: Map<string, string[]>
  textos: Map<string, TextoCambiado>
}

interface FilaDeFoto {
  id: string | number
  espacio?: unknown
  alt?: unknown
  filename?: unknown
  width?: unknown
  height?: unknown
  createdAt?: unknown
}

interface FilaDeTexto {
  id: string | number
  espacio?: unknown
  texto?: unknown
  updatedAt?: unknown
}

/** La dirección pública de una foto. Solo la arma con un nombre que pasaría el filtro de la ruta. */
export const direccionDeFoto = (nombre: string): string | null =>
  NOMBRE_DE_FOTO.test(nombre) ? ruta(`/api/pagina/${nombre}`) : null

/**
 * Todo lo cambiado, en dos consultas.
 *
 * Ordenado de la más reciente a la más antigua, y de ahí sale la vigente: la
 * primera de su espacio. A igual fecha decide el id, que es creciente, para que
 * dos subidas del mismo milisegundo no dejen la decisión al orden en que las
 * devuelva PostgreSQL. Los espacios que ya no existen en el registro se
 * ignoran: son de una versión anterior de la página y no se pintan en ningún
 * sitio.
 */
export async function leerCambios(payload: ClienteDeLectura): Promise<CambiosDeLaPagina> {
  const [fotos, textos] = await Promise.all([
    payload.find({
      collection: SLUG_DE_FOTOS as never,
      sort: ['-createdAt', '-id'] as never,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
    payload.find({
      collection: SLUG_DE_TEXTOS as never,
      sort: ['-updatedAt', '-id'] as never,
      depth: 0,
      pagination: false,
      overrideAccess: true,
    }),
  ])

  const cambios: CambiosDeLaPagina = { fotos: new Map(), fotosAnteriores: new Map(), textos: new Map() }

  for (const fila of fotos.docs as FilaDeFoto[]) {
    const espacio = espacioDeFoto(fila.espacio)
    const src = typeof fila.filename === 'string' ? direccionDeFoto(fila.filename) : null
    if (!espacio || !src) continue
    if (cambios.fotos.has(espacio.id)) {
      cambios.fotosAnteriores.set(espacio.id, [...(cambios.fotosAnteriores.get(espacio.id) ?? []), String(fila.id)])
      continue
    }
    cambios.fotos.set(espacio.id, {
      id: String(fila.id),
      src,
      alt: typeof fila.alt === 'string' ? fila.alt : espacio.descripcion,
      ancho: typeof fila.width === 'number' ? fila.width : null,
      alto: typeof fila.height === 'number' ? fila.height : null,
      subidaEn: typeof fila.createdAt === 'string' ? fila.createdAt : '',
    })
  }

  for (const fila of textos.docs as FilaDeTexto[]) {
    const espacio = espacioDeTexto(fila.espacio)
    if (!espacio || cambios.textos.has(espacio.id)) continue
    cambios.textos.set(espacio.id, {
      id: String(fila.id),
      texto: typeof fila.texto === 'string' ? fila.texto : '',
      cambiadoEn: typeof fila.updatedAt === 'string' ? fila.updatedAt : '',
    })
  }

  return cambios
}

/** Lo que una página pública necesita para pintarse. */
export interface PaginaLeida {
  /** El texto del espacio: el cambiado, o el original. Vacío significa «no se pinta». */
  texto: (id: string) => string
  /** La foto subida del espacio, o `null` para pintar la original. */
  foto: (id: string) => FotoSubida | null
  /** Las piezas del atlas, si se pudieron contar; las cifras de la portada no se escriben a mano. */
  piezas: number | null
  /** La base no respondió y todo sale con su original. */
  sinBase: boolean
}

/**
 * La lectura de las páginas públicas, que no se cae nunca.
 *
 * Si la base no responde, la portada sale entera con sus originales en lugar
 * de con la página de error: un visitante que llega a cotizar no tiene por qué
 * enterarse de que PostgreSQL se reinicia, y la portada es la única página que
 * puede pintarse sin ella. Lo que sí se pierde —lo cambiado— vuelve solo en la
 * siguiente visita.
 */
export async function leerLaPagina(
  payload: ClienteDeLectura | null,
  { piezas = null }: { piezas?: number | null } = {},
): Promise<PaginaLeida> {
  let cambios: CambiosDeLaPagina | null = null
  if (payload) {
    try {
      cambios = await leerCambios(payload)
    } catch (fallo) {
      console.error('[pagina] no se pudo leer lo cambiado; salen los originales', fallo)
    }
  }

  return {
    texto: (id) => {
      const espacio = espacioDeTexto(id)
      if (!espacio) return ''
      const texto = cambios?.textos.get(id)?.texto ?? espacio.original
      return sustituirCifras(texto, { piezas }, (n) => cifra(n))
    },
    foto: (id) => cambios?.fotos.get(id) ?? null,
    piezas,
    sinBase: cambios === null,
  }
}

/**
 * ¿Se puede entregar este archivo en público? Solo si es la foto vigente de su
 * espacio. Devuelve lo que la ruta necesita para servirlo, o `null`.
 *
 * Una subida anterior que aún no se retiró, la de un espacio que ya no existe,
 * o cualquier otro archivo de `medios/pagina` que no tenga fila, no se
 * entregan: lo público es lo que la portada enseña, y nada más.
 */
export async function fotoPublica(
  payload: ClienteDeLectura,
  nombre: string,
): Promise<{ nombre: string; tipo: string } | null> {
  if (!NOMBRE_DE_FOTO.test(nombre)) return null
  const { docs } = await payload.find({
    collection: SLUG_DE_FOTOS as never,
    where: { filename: { equals: nombre } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const fila = docs[0] as (FilaDeFoto & { mimeType?: unknown }) | undefined
  const espacio = fila ? espacioDeFoto(fila.espacio) : undefined
  if (!fila || !espacio) return null

  const { docs: vigentes } = await payload.find({
    collection: SLUG_DE_FOTOS as never,
    where: { espacio: { equals: espacio.id } },
    sort: ['-createdAt', '-id'] as never,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (String((vigentes[0] as FilaDeFoto | undefined)?.id) !== String(fila.id)) return null

  const tipo = typeof fila.mimeType === 'string' ? fila.mimeType : ''
  return tipo ? { nombre, tipo } : null
}

/** Cuántos espacios hay de cada clase y cuántos están cambiados: el resumen de la pestaña. */
export function resumenDeCambios(cambios: CambiosDeLaPagina) {
  return {
    fotos: { total: ESPACIOS_DE_FOTO.length, cambiadas: cambios.fotos.size },
    textos: { total: ESPACIOS_DE_TEXTO.length, cambiados: cambios.textos.size },
  }
}

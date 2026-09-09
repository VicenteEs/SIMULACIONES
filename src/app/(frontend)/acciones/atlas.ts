'use server'

/**
 * Acciones del taller del atlas.
 *
 * Una preparación no guarda geometría sino la lista de piezas que sobreviven,
 * de modo que estas acciones nunca tocan el atlas: leen el catálogo para
 * validar y escriben una lista. El atlas es material estático y no hay aquí
 * —ni en ninguna otra parte— código capaz de modificarlo.
 *
 * La selección se vuelve a normalizar en el servidor aunque el taller ya lo
 * haga. Una acción de servidor es un extremo HTTP: el tipo de TypeScript se
 * evapora al compilar y lo que llega es lo que el navegador quiso enviar.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { revalidatePath } from 'next/cache'
import { accion, exigirEditor, type Respuesta } from '@/lib/guardias'
import { exigirIdentificador, exigirTexto, textoOpcional } from '@/lib/validacion'
import { normalizarSeleccion, piezasPerdidas } from '@/atlas/catalogo'
import type { CatalogoDelAtlas, ContenidoDeInstancia } from '@/atlas/formato'

const RUTA_PANEL = '/admin-panel/atlas'

/**
 * El catálogo, leído del disco y recordado.
 *
 * Son 0,7 MB de JSON que no cambian mientras el proceso viva: volver a leerlos
 * y analizarlos en cada guardado sería gastar por nada.
 */
let catalogoEnMemoria: CatalogoDelAtlas | null = null

async function leerCatalogo(): Promise<CatalogoDelAtlas> {
  if (catalogoEnMemoria) return catalogoEnMemoria
  try {
    const crudo = await readFile(join(process.cwd(), 'public', 'atlas', 'catalogo.json'), 'utf8')
    catalogoEnMemoria = JSON.parse(crudo) as CatalogoDelAtlas
    return catalogoEnMemoria
  } catch {
    throw new Error(
      'El atlas anatómico no está instalado en este servidor. ' +
        'Falta public/atlas/catalogo.json.',
    )
  }
}

/** Versión del atlas instalado, para la página de sistema. */
export async function versionDelAtlas(): Promise<Respuesta<{ version: string; piezas: number }>> {
  return accion(async () => {
    const catalogo = await leerCatalogo()
    return { version: catalogo.version, piezas: catalogo.piezas.length }
  })
}

export interface ResumenDeInstancia {
  id: string
  nombre: string
  descripcion: string | null
  piezas: number
  actualizada: string
  desfasada: boolean
}

export async function listarInstancias(): Promise<Respuesta<ResumenDeInstancia[]>> {
  return accion(async () => {
    const { payload } = await exigirEditor()
    const catalogo = await leerCatalogo()

    const { docs } = await payload.find({
      collection: 'instancias-atlas',
      limit: 200,
      sort: '-updatedAt',
      depth: 0,
      overrideAccess: true,
    })

    return (docs as unknown as Record<string, unknown>[]).map((doc) => ({
      id: String(doc.id),
      nombre: String(doc.nombre ?? ''),
      descripcion: (doc.descripcion as string) ?? null,
      piezas: Number(doc.numeroDePiezas ?? 0),
      actualizada: String(doc.updatedAt ?? ''),
      // Se avisa en vez de descartar en silencio: una preparación que perdió
      // media pierna sin decir nada es peor que un aviso.
      desfasada: Boolean(doc.atlasVersion) && doc.atlasVersion !== catalogo.version,
    }))
  })
}

export async function obtenerInstancia(
  id: unknown,
): Promise<
  Respuesta<{
    id: string
    nombre: string
    descripcion: string | null
    segmento: string | null
    contenido: ContenidoDeInstancia
    perdidas: string[]
  }>
> {
  return accion(async () => {
    const { payload } = await exigirEditor()
    const catalogo = await leerCatalogo()

    const doc = (await payload.findByID({
      collection: 'instancias-atlas',
      id: exigirIdentificador(id, 'La preparación'),
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    const bruto = doc.contenido as Record<string, unknown> | null
    const contenido = normalizarSeleccion(catalogo, bruto?.piezas, bruto?.vista)

    return {
      id: String(doc.id),
      nombre: String(doc.nombre ?? ''),
      descripcion: (doc.descripcion as string) ?? null,
      segmento: doc.segmento === null || doc.segmento === undefined ? null : String(doc.segmento),
      contenido,
      perdidas: piezasPerdidas(catalogo, {
        ...contenido,
        // Se comparan los identificadores tal como se guardaron, no los ya
        // filtrados: si no, nunca habría nada que avisar.
        piezas: Array.isArray(bruto?.piezas)
          ? (bruto.piezas as { id?: string }[])
              .map((p) => ({ id: typeof p === 'string' ? p : String(p?.id ?? '') }))
              .filter((p) => p.id)
          : [],
      }),
    }
  })
}

export async function guardarInstancia(
  id: unknown,
  datos: unknown,
): Promise<Respuesta<{ id: string; piezas: number }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const catalogo = await leerCatalogo()

    if (!datos || typeof datos !== 'object') throw new Error('No llegó nada que guardar.')
    const entrada = datos as Record<string, unknown>

    const contenido = normalizarSeleccion(catalogo, entrada.piezas, entrada.vista)
    if (contenido.piezas.length === 0) {
      throw new Error('Encienda al menos una pieza antes de guardar la preparación.')
    }

    const documento = {
      nombre: exigirTexto(entrada.nombre, 'El nombre', 120),
      descripcion: textoOpcional(entrada.descripcion, 'La descripción', 600) ?? null,
      segmento: entrada.segmento ? exigirIdentificador(entrada.segmento, 'El segmento') : null,
      contenido,
      atlasVersion: catalogo.version,
    }

    const guardada =
      id === null || id === undefined || id === ''
        ? await payload.create({
            collection: 'instancias-atlas',
            data: documento as never,
            user: usuario as never,
          })
        : await payload.update({
            collection: 'instancias-atlas',
            id: exigirIdentificador(id, 'La preparación'),
            data: documento as never,
            user: usuario as never,
          })

    revalidatePath(RUTA_PANEL)
    return { id: String((guardada as { id: unknown }).id), piezas: contenido.piezas.length }
  })
}

/**
 * Copia una preparación.
 *
 * Es el gesto que hace barato explorar: partir de «rodilla completa» y quitarle
 * cosas hasta llegar a «solo los ligamentos cruzados», sin perder la primera.
 */
export async function duplicarInstancia(id: unknown): Promise<Respuesta<{ id: string }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()

    const original = (await payload.findByID({
      collection: 'instancias-atlas',
      id: exigirIdentificador(id, 'La preparación'),
      depth: 0,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    const copia = await payload.create({
      collection: 'instancias-atlas',
      data: {
        nombre: `${String(original.nombre ?? 'Preparación')} (copia)`,
        descripcion: original.descripcion ?? null,
        segmento: original.segmento ?? null,
        contenido: original.contenido,
        atlasVersion: original.atlasVersion ?? null,
      } as never,
      user: usuario as never,
    })

    revalidatePath(RUTA_PANEL)
    return { id: String((copia as { id: unknown }).id) }
  })
}

export async function eliminarInstancia(id: unknown): Promise<Respuesta> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    await payload.delete({
      collection: 'instancias-atlas',
      id: exigirIdentificador(id, 'La preparación'),
      user: usuario as never,
    })
    revalidatePath(RUTA_PANEL)
    return null
  })
}

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
import { gunzip } from 'node:zlib'
import { join } from 'node:path'
import { revalidatePath } from 'next/cache'
import { accion, exigirEditor, type Respuesta } from '@/lib/guardias'
import { exigirIdentificador, exigirTexto, textoOpcional } from '@/lib/validacion'
import { normalizarSeleccion, piezasPerdidas } from '@/atlas/catalogo'
import type { CatalogoDelAtlas, ContenidoDeInstancia } from '@/atlas/formato'
import { escribirGlb } from '@/lib/glb'
import {
  agruparParaGlb,
  nombresDelArchivo,
  piezasDeLaPreparacion,
  TECHO_BYTES,
  type PiezaLeida,
} from '@/lib/exportarAtlas'

const RUTA_PANEL = '/admin-panel/atlas'

/**
 * Un paquete de geometría del atlas, descomprimido en memoria.
 *
 * En el navegador no hay ni una línea de descompresión porque los paquetes se
 * sirven con `Content-Encoding: gzip` y la hace el propio navegador. Aquí se
 * leen del disco, donde están comprimidos, así que hay que hacerla a mano.
 *
 * No se recuerdan entre llamadas a propósito: son decenas de megabytes y una
 * exportación es algo que se hace de vez en cuando, no en cada petición.
 */
async function leerPaquete(catalogo: CatalogoDelAtlas, indice: number): Promise<ArrayBuffer> {
  const paquete = catalogo.paquetes[indice]
  if (!paquete) throw new Error(`El atlas no tiene el paquete ${indice}.`)
  const ruta = join(process.cwd(), 'public', 'atlas', paquete.archivo)
  const comprimido = await readFile(ruta)
  const crudo = await new Promise<Buffer>((resolver, rechazar) => {
    gunzip(comprimido, (error, salida) => (error ? rechazar(error) : resolver(salida)))
  })
  // Se copia a un ArrayBuffer propio: el de un Buffer de Node puede estar
  // compartido con otros, y las vistas tipadas leerían bytes ajenos.
  return crudo.buffer.slice(crudo.byteOffset, crudo.byteOffset + crudo.byteLength) as ArrayBuffer
}

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

/**
 * Exporta una preparación a un modelo 3D que la consola quirúrgica pueda abrir.
 *
 * El atlas y el simulador son dos motores distintos: el atlas funde las piezas
 * de cada sistema en una malla y decide qué se ve con una textura; la consola
 * carga objetos con nombre, mueve uno y mide milímetros. En vez de enseñarle el
 * atlas a la consola —que es reescribir el simulador— se escribe un archivo del
 * mismo formato que sale de Blender, y la consola no se entera de que el atlas
 * existe.
 *
 * El archivo es una copia: el atlas no se toca, y la preparación tampoco.
 */
export async function exportarComoModelo(
  id: unknown,
  opciones?: { protagonistas?: unknown },
): Promise<Respuesta<{ id: string; nombre: string; bytes: number; nodos: string[]; perdidas: string[] }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const identificador = exigirIdentificador(id, 'La preparación')

    const instancia = (await payload.findByID({
      collection: 'instancias-atlas',
      id: identificador,
      user: usuario as never,
    })) as unknown as Record<string, unknown>

    const contenido = (instancia.contenido ?? {}) as Partial<ContenidoDeInstancia>
    const ids = Array.isArray(contenido.piezas)
      ? contenido.piezas.map((p) => String((p as { id?: unknown })?.id ?? '')).filter(Boolean)
      : []
    if (ids.length === 0) throw new Error('Esa preparación no tiene ninguna pieza.')

    const catalogo = await leerCatalogo()
    const { encontradas, perdidas } = piezasDeLaPreparacion(catalogo, ids)
    if (encontradas.length === 0) {
      throw new Error(
        'Ninguna de las piezas de esa preparación existe en el atlas instalado. ' +
          'Puede que se haya regenerado con otra versión.',
      )
    }

    // Un paquete se lee y descomprime una sola vez aunque le toquen cien
    // piezas: son decenas de megabytes y descomprimirlos por pieza sería
    // repetir el trabajo ciento treinta y nueve veces.
    const necesarios = [...new Set(encontradas.map((p) => p.paquete))]
    const buferes = new Map<number, ArrayBuffer>()
    for (const indice of necesarios) {
      buferes.set(indice, await leerPaquete(catalogo, indice))
    }

    const leidas: PiezaLeida[] = encontradas.map((pieza) => {
      const bufer = buferes.get(pieza.paquete)!
      return {
        id: pieza.id,
        nombre: pieza.nombre,
        sistema: pieza.sistema,
        // Copias, no vistas: las vistas apuntan al paquete entero y al
        // reindexar se escribiría sobre él.
        posiciones: new Float32Array(
          new Float32Array(bufer, pieza.pos, pieza.vertices * 3),
        ),
        normales: new Int16Array(new Int16Array(bufer, pieza.nor, pieza.vertices * 3)),
        indices: new Uint32Array(new Uint32Array(bufer, pieza.idx, pieza.indices)),
      }
    })

    const colores = Object.fromEntries(catalogo.sistemas.map((s) => [s.id, s.color]))
    const protagonistas = Array.isArray(opciones?.protagonistas)
      ? opciones.protagonistas.map((p) => String(p)).filter(Boolean)
      : []

    const objetos = agruparParaGlb(leidas, { protagonistas, colores })
    const glb = escribirGlb(objetos, 'TraumaHub · exportado del atlas anatómico')

    if (glb.byteLength > TECHO_BYTES) {
      const mb = (n: number) => (n / 1024 / 1024).toFixed(1)
      throw new Error(
        `El modelo pesaría ${mb(glb.byteLength)} MB y el techo son ${mb(TECHO_BYTES)} MB. ` +
          'Quite sistemas de la preparación —la piel es una pieza de cuerpo entero y ' +
          'ella sola pesa más de un megabyte— o quédese con el esqueleto.',
      )
    }

    const nombre = `${String(instancia.nombre ?? 'Preparación')} · del atlas`
    const archivo = `${String(instancia.nombre ?? 'preparacion')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')}.glb`

    const creado = await payload.create({
      collection: 'modelos-3d',
      data: {
        nombre,
        origen: 'sintetico',
        anonimizado: true,
        notas:
          `Exportado de la preparación «${String(instancia.nombre ?? '')}» del atlas anatómico ` +
          `(${catalogo.version}), con ${encontradas.length} piezas. ` +
          `Objetos del archivo: ${nombresDelArchivo(objetos).join(', ')}.`,
      } as never,
      file: {
        data: Buffer.from(glb),
        mimetype: 'model/gltf-binary',
        name: archivo,
        size: glb.byteLength,
      },
      user: usuario as never,
    })

    revalidatePath(RUTA_PANEL)
    return {
      id: String((creado as { id: unknown }).id),
      nombre,
      bytes: glb.byteLength,
      nodos: nombresDelArchivo(objetos),
      perdidas,
    }
  })
}

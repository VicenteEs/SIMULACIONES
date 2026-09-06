'use server'

/**
 * Acciones del editor de contenido del panel propio.
 *
 * Una sola implementación para las ocho colecciones: qué campos tiene cada una
 * lo dice `src/admin/esquema.ts`, y `depurarDocumento` reconstruye el documento
 * a partir de ese esquema antes de que Payload lo vea. Eso significa que
 * agregar una colección al panel no añade superficie de ataque nueva.
 *
 * Todas comprueban el rol real de quien llama. El estado de publicación lo
 * decide esta capa y nunca el formulario: quien no puede publicar no publica
 * aunque envíe `_status` a mano, porque ese campo no sale de aquí.
 */

import { revalidatePath } from 'next/cache'
import { accion, exigirEdicionDe, exigirEditor, type Respuesta } from '@/lib/guardias'
import { esColeccionEditable, esquemaDe, type EsquemaDeColeccion } from '@/admin/esquema'
import { depurarDocumento, faltantes } from '@/admin/depurar'
import { exigirIdentificador } from '@/lib/validacion'

const rutaDeLista = (slug: string) => `/admin-panel/contenido/${slug}`

/** Traduce el argumento `coleccion` en un esquema, o rechaza la llamada. */
function esquemaValidado(slug: unknown): EsquemaDeColeccion {
  if (!esColeccionEditable(slug)) {
    throw new Error('Esa colección no se edita desde el panel de contenido.')
  }
  return esquemaDe(slug)
}

// ------------------------------------------------------------------ listar

export interface FilaDeLista {
  id: string
  valores: Record<string, unknown>
  publicado: boolean
}

export interface Pagina {
  filas: FilaDeLista[]
  total: number
  pagina: number
  paginas: number
}

export async function listarDocumentos(
  slug: unknown,
  opciones: {
    pagina?: number
    busqueda?: string
    estado?: 'todos' | 'publicado' | 'borrador'
    orden?: string
  } = {},
): Promise<Respuesta<Pagina>> {
  return accion(async () => {
    const esquema = esquemaValidado(slug)
    const { payload } = await exigirEditor()

    const pagina = Math.max(1, Math.floor(Number(opciones.pagina) || 1))
    const condiciones: Record<string, unknown>[] = []

    const busqueda = typeof opciones.busqueda === 'string' ? opciones.busqueda.trim() : ''
    if (busqueda) {
      condiciones.push({
        or: esquema.buscarEn.map((campo) => ({ [campo]: { like: busqueda } })),
      })
    }
    if (esquema.versionada && opciones.estado && opciones.estado !== 'todos') {
      condiciones.push({
        _status: { equals: opciones.estado === 'publicado' ? 'published' : 'draft' },
      })
    }

    const resultado = await payload.find({
      collection: esquema.slug as never,
      where: (condiciones.length > 0 ? { and: condiciones } : undefined) as never,
      sort: typeof opciones.orden === 'string' && opciones.orden ? opciones.orden : '-updatedAt',
      limit: 25,
      page: pagina,
      depth: 1,
      // El panel muestra borradores: son justo lo que hay que terminar.
      draft: esquema.versionada,
      overrideAccess: true,
    })

    return {
      filas: resultado.docs.map((documento) => {
        const doc = documento as unknown as Record<string, unknown>
        const valores: Record<string, unknown> = { id: doc.id }
        for (const columna of esquema.columnas) {
          const bruto = doc[columna.nombre]
          valores[columna.nombre] =
            columna.formato === 'relacion' && bruto && typeof bruto === 'object'
              ? ((bruto as Record<string, unknown>).nombre ??
                (bruto as Record<string, unknown>).alt ??
                null)
              : (bruto ?? null)
        }
        return {
          id: String(doc.id),
          valores,
          publicado: doc._status === 'published' || !esquema.versionada,
        }
      }),
      total: resultado.totalDocs,
      pagina: resultado.page ?? pagina,
      paginas: resultado.totalPages ?? 1,
    }
  })
}

/** Opciones de un desplegable de relación (segmentos, modelos, medios). */
export async function opcionesDeRelacion(
  coleccion: unknown,
): Promise<Respuesta<{ id: string; etiqueta: string; url?: string; tipo?: string }[]>> {
  return accion(async () => {
    const esquema = esquemaValidado(coleccion)
    const { payload } = await exigirEditor()
    const { docs } = await payload.find({
      collection: esquema.slug as never,
      limit: 500,
      sort: esquema.slug === 'segmentos' ? 'orden' : esquema.titulo,
      depth: 0,
      overrideAccess: true,
    })
    return docs.map((documento) => {
      const doc = documento as unknown as Record<string, unknown>
      return {
        id: String(doc.id),
        etiqueta: String(doc[esquema.titulo] ?? doc.filename ?? `#${doc.id}`),
        url: typeof doc.url === 'string' ? doc.url : undefined,
        tipo: typeof doc.mimeType === 'string' ? doc.mimeType : undefined,
      }
    })
  })
}

// ------------------------------------------------------------------ leer

export async function obtenerDocumento(
  slug: unknown,
  id: unknown,
): Promise<Respuesta<Record<string, unknown>>> {
  return accion(async () => {
    const esquema = esquemaValidado(slug)
    const { payload } = await exigirEditor()
    const documento = await payload.findByID({
      collection: esquema.slug as never,
      id: exigirIdentificador(id, 'El documento'),
      depth: 1,
      draft: esquema.versionada,
      overrideAccess: true,
    })
    return documento as unknown as Record<string, unknown>
  })
}

// ---------------------------------------------------------------- escribir

export async function guardarDocumento(
  slug: unknown,
  id: unknown,
  datos: unknown,
  publicar: unknown,
): Promise<Respuesta<{ id: string; publicado: boolean }>> {
  return accion(async () => {
    const esquema = esquemaValidado(slug)
    const { payload, usuario } = await exigirEdicionDe(esquema.slug)

    if (!datos || typeof datos !== 'object') throw new Error('No llegó ningún dato que guardar.')
    const documento = depurarDocumento(esquema, datos as Record<string, unknown>)

    const problemas = faltantes(esquema, documento)
    if (problemas.length > 0) throw new Error(problemas.join(' '))

    // Aquí se decide el estado, no en el formulario.
    if (esquema.versionada) {
      documento._status = publicar === true ? 'published' : 'draft'
    }

    const comun = {
      collection: esquema.slug as never,
      data: documento as never,
      user: usuario as never,
      ...(esquema.versionada ? { draft: publicar !== true } : {}),
    }

    const guardado =
      id === null || id === undefined || id === ''
        ? await payload.create(comun)
        : await payload.update({ ...comun, id: exigirIdentificador(id, 'El documento') })

    revalidatePath(rutaDeLista(esquema.slug))
    revalidatePath('/admin-panel')
    return { id: String((guardado as { id: unknown }).id), publicado: publicar === true }
  })
}

export async function cambiarPublicacion(
  slug: unknown,
  id: unknown,
  publicar: unknown,
): Promise<Respuesta> {
  return accion(async () => {
    const esquema = esquemaValidado(slug)
    if (!esquema.versionada) throw new Error('Esta colección no distingue borrador de publicado.')
    const { payload, usuario } = await exigirEdicionDe(esquema.slug)

    await payload.update({
      collection: esquema.slug as never,
      id: exigirIdentificador(id, 'El documento'),
      data: { _status: publicar === true ? 'published' : 'draft' } as never,
      draft: publicar !== true,
      user: usuario as never,
    })
    revalidatePath(rutaDeLista(esquema.slug))
    return null
  })
}

export async function eliminarDocumento(slug: unknown, id: unknown): Promise<Respuesta> {
  return accion(async () => {
    const esquema = esquemaValidado(slug)
    const { payload, usuario } = await exigirEdicionDe(esquema.slug)
    await payload.delete({
      collection: esquema.slug as never,
      id: exigirIdentificador(id, 'El documento'),
      user: usuario as never,
    })
    revalidatePath(rutaDeLista(esquema.slug))
    return null
  })
}

/**
 * Copia un documento como borrador nuevo.
 *
 * Escribir la segunda ficha de una serie —otro tipo de la misma clasificación,
 * otra maniobra del mismo segmento— es sobre todo cambiar detalles de la
 * primera. Sin esto, se hace copiando y pegando campo por campo.
 */
export async function duplicarDocumento(
  slug: unknown,
  id: unknown,
): Promise<Respuesta<{ id: string }>> {
  return accion(async () => {
    const esquema = esquemaValidado(slug)
    if (esquema.subida) throw new Error('Un archivo subido no se duplica; súbalo otra vez.')
    const { payload, usuario } = await exigirEdicionDe(esquema.slug)

    const original = (await payload.findByID({
      collection: esquema.slug as never,
      id: exigirIdentificador(id, 'El documento'),
      depth: 0,
      draft: true,
      overrideAccess: true,
    })) as unknown as Record<string, unknown>

    const copia = depurarDocumento(esquema, original)
    const titulo = copia[esquema.titulo]
    if (typeof titulo === 'string') copia[esquema.titulo] = `${titulo} (copia)`
    // La copia nace siempre como borrador: duplicar no es publicar.
    if (esquema.versionada) copia._status = 'draft'

    const creado = await payload.create({
      collection: esquema.slug as never,
      data: copia as never,
      user: usuario as never,
      ...(esquema.versionada ? { draft: true } : {}),
    })

    revalidatePath(rutaDeLista(esquema.slug))
    return { id: String((creado as { id: unknown }).id) }
  })
}

// ------------------------------------------------------------------ subidas

/**
 * Sube un archivo a `medios` o `modelos-3d`.
 *
 * Llega como FormData porque un archivo no cabe en un JSON sin inflarlo un
 * tercio en base64. La validación real del contenido —que un .glb sea de
 * verdad un .glb— la hace el gancho de la colección, mirando la firma del
 * archivo y no su extensión.
 */
export async function subirArchivo(formulario: FormData): Promise<Respuesta<{ id: string }>> {
  return accion(async () => {
    const esquema = esquemaValidado(formulario.get('coleccion'))
    if (!esquema.subida) throw new Error('Esa colección no recibe archivos.')
    const { payload, usuario } = await exigirEditor()

    const archivo = formulario.get('archivo')
    if (!(archivo instanceof File) || archivo.size === 0) {
      throw new Error('No llegó ningún archivo.')
    }

    const datos: Record<string, unknown> = {}
    for (const campo of esquema.secciones.flatMap((s) => s.campos)) {
      const valor = formulario.get(campo.nombre)
      if (valor !== null) datos[campo.nombre] = valor
    }

    const creado = await payload.create({
      collection: esquema.slug as never,
      data: depurarDocumento(esquema, datos) as never,
      file: {
        name: archivo.name,
        data: Buffer.from(await archivo.arrayBuffer()),
        mimetype: archivo.type,
        size: archivo.size,
      },
      user: usuario as never,
    })

    revalidatePath(rutaDeLista(esquema.slug))
    return { id: String((creado as { id: unknown }).id) }
  })
}

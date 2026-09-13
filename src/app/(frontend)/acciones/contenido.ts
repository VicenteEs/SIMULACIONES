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
import { camposDe, esColeccionEditable, esquemaDe, type EsquemaDeColeccion } from '@/admin/esquema'
import {
  avisoDeContenidoQueSeBorraria,
  depurarDocumento,
  faltantes,
  sinIdentificadoresDeFila,
} from '@/admin/depurar'
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
    // `exigirEdicionDe` y no `exigirEditor`: la consulta de abajo va con
    // `overrideAccess: true` —el panel tiene que enseñar borradores—, así que
    // ni `lecturaDeModulo` ni `escrituraDeModulo` intervienen y esta guardia es
    // lo único que mira el módulo. Con `exigirEditor` a secas, un editor
    // limitado a «patologías» llamaba a la acción desde la consola con otro
    // slug —su identificador ya viaja en el paquete de `TablaDocumentos`— y
    // recibía el listado ajeno entero, borradores incluidos. La página que la
    // ofrece ya para en la puerta con `exigirPanelPara`, que pregunta lo mismo;
    // una acción de servidor es otro extremo HTTP y se alcanza sin pasar por
    // ella.
    const { payload } = await exigirEdicionDe(esquema.slug)

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
/**
 * Colecciones que se pueden **listar** para llenar un desplegable, aunque no se
 * editen desde el editor genérico.
 *
 * «Se puede listar» y «se puede editar» son permisos distintos y conviene que
 * no se confundan: las preparaciones anatómicas se arman en el taller del
 * atlas, con su propio visor, y dejarlas caer en el editor de campos genérico
 * mostraría un cuadro de texto con miles de identificadores dentro.
 */
const LISTABLES_APARTE: Record<string, string> = {
  'instancias-atlas': 'nombre',
}

export async function opcionesDeRelacion(
  coleccion: unknown,
): Promise<Respuesta<{ id: string; etiqueta: string; url?: string; tipo?: string }[]>> {
  return accion(async () => {
    const aparte =
      typeof coleccion === 'string' ? LISTABLES_APARTE[coleccion] : undefined
    const slug = aparte ? (coleccion as string) : esquemaValidado(coleccion).slug
    const titulo = aparte ?? esquemaDe(slug).titulo

    // Misma razón que en `listarDocumentos`: lee con `overrideAccess: true`, de
    // modo que el permiso por módulo solo se comprueba aquí. No estrecha ningún
    // desplegable real: `puedeEditar` solo restringe los cinco módulos
    // (`SLUGS_DE_MODULOS`), y ninguna relación del esquema apunta a uno —van a
    // medios, modelos, segmentos, catálogos y preparaciones del atlas—, así que
    // cualquier editor las sigue listando igual.
    const { payload } = await exigirEdicionDe(slug)
    const { docs } = await payload.find({
      collection: slug as never,
      limit: 500,
      sort: slug === 'segmentos' ? 'orden' : titulo,
      depth: 0,
      overrideAccess: true,
    })
    return docs.map((documento) => {
      const doc = documento as unknown as Record<string, unknown>
      const piezas = doc.numeroDePiezas
      return {
        id: String(doc.id),
        etiqueta:
          String(doc[titulo] ?? doc.filename ?? `#${doc.id}`) +
          (typeof piezas === 'number' ? ` · ${piezas} piezas` : ''),
        url: typeof doc.url === 'string' ? doc.url : undefined,
        tipo: typeof doc.mimeType === 'string' ? doc.mimeType : undefined,
      }
    })
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

    // Se pregunta por lo que llega crudo, porque lo que se pierde lo pierde la
    // línea siguiente. Ver `avisoDeContenidoQueSeBorraria`.
    const aviso = avisoDeContenidoQueSeBorraria(esquema, datos as Record<string, unknown>)
    if (aviso) throw new Error(aviso)

    const documento = depurarDocumento(esquema, datos as Record<string, unknown>)

    // Solo al publicar se exige la ficha entera (D-011). Aquí iba `faltantes`
    // a secas, o sea `profundo: true` siempre, y eso cortaba también «Guardar
    // borrador»: una maniobra con «Técnica» todavía en blanco —el caso normal
    // de una ficha que se escribe a lo largo de varios días— respondía «Falta
    // «técnica».» y no guardaba nada, de modo que lo escrito esa tarde se
    // perdía al cerrar la pestaña. Payload hace la misma distinción: salta lo
    // obligatorio cuando escribe con `draft: true`. El formulario ya la hacía
    // por su lado (`seccionIncompleta(publicar)`), así que era el servidor el
    // que iba por libre.
    const problemas = faltantes(esquema, documento, { profundo: publicar === true })
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

    // `draft: false` en los dos sentidos, y esto importa.
    //
    // Retirar de publicacion escribia con `draft: true`, que en Payload guarda
    // una version de borrador nueva y **deja intacto el documento publicado**:
    // el boton respondia «retirada», el panel la mostraba como borrador y el
    // residente seguia viendo la ficha. Comprobado contra la base: tras la
    // llamada, `_status` seguia siendo `published` y una consulta de lector la
    // devolvia igual. Con `draft: false` el estado se escribe en el documento
    // y deja de verse, que es lo que el boton promete.
    await payload.update({
      collection: esquema.slug as never,
      id: exigirIdentificador(id, 'El documento'),
      data: { _status: publicar === true ? 'published' : 'draft' } as never,
      draft: false,
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

    const copia = sinIdentificadoresDeFila(depurarDocumento(esquema, original))
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
 * Sube un archivo a `medios` o `modelos-3d`. **Es la vía vieja**, y le queda un
 * solo consumidor.
 *
 * La vía buena es `src/app/(frontend)/api/subidas/[coleccion]/route.ts`, y la
 * diferencia no es de estilo: una acción de servidor recibe el cuerpo ya
 * reunido, de modo que el archivo entero se queda en la memoria del servidor
 * durante toda la subida, y además Next corta ese cuerpo en
 * `serverActions.bodySizeLimit` **antes** de invocar la acción, así que lo que
 * se pase de ahí ni siquiera llega a este `try/catch` y la pantalla se queda
 * muda. El porqué entero, en `src/admin/subidas.ts`.
 *
 * Quien todavía llama aquí es `src/components/admin/formulario/Campos.tsx`,
 * para insertar un archivo dentro de un bloque sin salir de la ficha. Mientras
 * siga haciéndolo, `bodySizeLimit` tiene que quedar **por encima** del techo
 * que la colección anuncia —hoy 52 MB contra 50— o esta pantalla se convierte
 * en el eslabón corto y el corte mudo vuelve, esta vez solo en el editor de
 * bloques. Eso está escrito también en `next.config.mjs`, que es donde se
 * tropieza con el número.
 *
 * Llega como FormData porque un archivo no cabe en un JSON sin inflarlo un
 * tercio en base64. La validación real del contenido —que un .glb sea de
 * verdad un .glb— la hace el gancho de la colección, mirando la firma del
 * archivo y no su extensión.
 */
export async function subirArchivo(formulario: FormData): Promise<Respuesta<{ id: string }>> {
  return accion(async () => {
    const esquema = esquemaValidado(formulario.get('coleccion'))
    const subida = esquema.subida
    if (!subida) throw new Error('Esa colección no recibe archivos.')
    const { payload, usuario } = await exigirEditor()

    const archivo = formulario.get('archivo')
    if (!(archivo instanceof File) || archivo.size === 0) {
      throw new Error('No llegó ningún archivo.')
    }

    // El techo, comprobado y no solo anunciado.
    //
    // Hasta aquí el peso vivía en una frase que nadie comparaba con nada: quien
    // se pasaba no recibía este mensaje sino el corte mudo de Next, que
    // descarta el cuerpo **antes** de invocar la acción y deja la pantalla sin
    // una palabra. La comprobación sale del mismo sitio que esa frase —el
    // esquema del panel— y cubre lo que el corte del marco no puede cubrir: el
    // archivo que cabe en el cuerpo pero se pasa del techo de la colección, y
    // el camino de quien llame a esta acción sin pasar por el panel.
    if (archivo.size > subida.maximoBytes) {
      const techo = (subida.maximoBytes / 1024 / 1024).toFixed(0)
      const pesa = (archivo.size / 1024 / 1024).toFixed(1)
      throw new Error(
        `«${archivo.name}» pesa ${pesa} MB y el máximo son ${techo} MB. Redúzcalo y vuelva a subirlo.`,
      )
    }

    const datos: Record<string, unknown> = {}
    for (const campo of camposDe(esquema)) {
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

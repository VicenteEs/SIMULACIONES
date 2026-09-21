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
import { accion, exigirEdicionDe, type Respuesta } from '@/lib/guardias'
import { esColeccionEditable, esquemaDe, type EsquemaDeColeccion } from '@/admin/esquema'
import {
  avisoDeContenidoQueSeBorraria,
  depurarDocumento,
  faltantes,
  sinIdentificadoresDeFila,
} from '@/admin/depurar'
import { exigirIdentificador } from '@/lib/validacion'
import {
  cambioDesde,
  marcaDe,
  MENSAJE_DE_CONFLICTO,
  MENSAJE_DE_FICHA_ELIMINADA,
  type Marca,
} from '@/admin/concurrencia'

const rutaDeLista = (slug: string) => `/admin-panel/contenido/${slug}`

/** Traduce el argumento `coleccion` en un esquema, o rechaza la llamada. */
function esquemaValidado(slug: unknown): EsquemaDeColeccion {
  if (!esColeccionEditable(slug)) {
    throw new Error('Esa colección no se edita desde el panel de contenido.')
  }
  return esquemaDe(slug)
}

// ------------------------------------------------------------------ listar

/**
 * El orden del listado, o el de siempre si lo pedido no es una columna suya.
 *
 * Se le pasaba a Payload tal cual llegaba del navegador, y `sort` no es un
 * nombre de columna sino un **camino de campo**: admite cruzar relaciones, de
 * modo que el texto de esta llamada decidía qué tablas entraban en la consulta.
 * La pantalla solo ordena por las columnas que pinta, así que esas —y las dos
 * fechas— son todo lo que se acepta.
 */
function ordenValido(esquema: EsquemaDeColeccion, pedido: unknown): string {
  if (typeof pedido !== 'string') return '-updatedAt'
  const campo = pedido.startsWith('-') ? pedido.slice(1) : pedido
  const admitidos = [...esquema.columnas.map((columna) => columna.nombre), 'updatedAt', 'createdAt']
  return admitidos.includes(campo) ? pedido : '-updatedAt'
}

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

    // Llega del navegador: puede venir `null` o cualquier otra cosa.
    if (!opciones || typeof opciones !== 'object') opciones = {}

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
      sort: ordenValido(esquema, opciones.orden),
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

/**
 * Lo que responden las dos acciones que escriben sobre una ficha abierta.
 *
 * `conflicto` va fuera de `mensaje` para que el formulario lo reconozca sin
 * comparar frases: el día que alguien retocara la redacción del aviso, el
 * formulario dejaría de ofrecer «recargar» y enseñaría un error sin salida.
 * Trae la marca que hay ahora en la base, que es la que el formulario adopta
 * si la persona decide recargar conservando lo escrito.
 */
export interface RespuestaSobreFichaAbierta<T> extends Respuesta<T> {
  conflicto?: { marcaActual: Marca }
}

/**
 * Se lanza desde dentro de `accion()` para salir por su mismo camino —el
 * `mensaje` en español y la escritura sin hacer— y se reconoce fuera para
 * añadir `conflicto` a la respuesta, que `accion()` no sabe poner.
 */
class ChoqueDeEdicion extends Error {
  constructor(readonly marcaActual: Marca) {
    super(MENSAJE_DE_CONFLICTO)
  }
}

/**
 * Para la escritura si la ficha cambió desde que se abrió. Ver
 * `src/admin/concurrencia.ts`.
 *
 * Se lee igual que la lee la página del editor —`draft` si la colección se
 * versiona—, porque la marca con la que se compara salió de ahí. Leída sin
 * `draft`, una ficha publicada con un borrador encima daría la marca de lo
 * publicado, que nunca es la del borrador abierto, y cada guardado chocaría.
 *
 * Sin marca no se comprueba nada. Hoy la manda el único llamador, el
 * formulario del panel, y esa llamada la fija
 * `tests/unit/concurrenciaDelEditor.test.ts`. Rechazar sin ella rompería a
 * quien llama a la acción sin haber abierto la ficha, que no tiene marca que
 * mandar; la pega es que un llamador nuevo que olvide mandarla escribe encima
 * sin aviso, igual que antes de esto.
 *
 * Entre esta lectura y la escritura queda una ventana: dos guardados que
 * lleguen en el mismo instante pueden pasar los dos. Por eso se llama justo
 * antes de escribir y no al principio de la acción —las validaciones de en
 * medio no tocan la base, pero sí tardan—. Cerrarla del todo pediría escribir
 * con la condición dentro de la consulta, y Payload no lo ofrece para un
 * borrador, que vive en la tabla de versiones y no en la del documento.
 */
async function exigirQueNoCambio(
  payload: Awaited<ReturnType<typeof exigirEdicionDe>>['payload'],
  esquema: EsquemaDeColeccion,
  id: string,
  marcaAlAbrir: unknown,
): Promise<void> {
  if (typeof marcaAlAbrir !== 'string') return
  const actual = await payload
    .findByID({
      collection: esquema.slug as never,
      id,
      depth: 0,
      draft: esquema.versionada,
      overrideAccess: true,
    })
    .catch((error: unknown) => {
      // Solo el 404 se traduce. Cualquier otro fallo —la base caída— tiene que
      // subir tal cual: contarlo como «se eliminó» mandaría a copiar a mano una
      // ficha que sigue ahí.
      if ((error as { status?: unknown } | null)?.status === 404) return null
      throw error
    })
  if (!actual) throw new Error(MENSAJE_DE_FICHA_ELIMINADA)
  const marcaActual = marcaDe(actual)
  if (cambioDesde(marcaAlAbrir, marcaActual)) throw new ChoqueDeEdicion(marcaActual)
}

/**
 * `accion()` con una sola cosa más: si lo que falló fue un choque de edición,
 * la respuesta lo dice en `conflicto`.
 *
 * `accion()` vive en `src/lib/guardias.ts` y la comparten todas las acciones
 * del panel; enseñarle qué es un choque de edición la ataría a esta. El choque
 * se anota aquí al pasar y se le pone a la respuesta a la salida.
 */
async function conChoqueReconocido<T>(tarea: () => Promise<T>): Promise<RespuestaSobreFichaAbierta<T>> {
  // Un objeto y no un `let`: asignado dentro de la función de abajo, el
  // compilador da el `let` por `null` para siempre y el `if` de la salida
  // quedaría como código muerto a sus ojos.
  const visto: { choque?: ChoqueDeEdicion } = {}
  const respuesta = await accion(async () => {
    try {
      return await tarea()
    } catch (error) {
      if (error instanceof ChoqueDeEdicion) visto.choque = error
      throw error
    }
  })
  return visto.choque ? { ...respuesta, conflicto: { marcaActual: visto.choque.marcaActual } } : respuesta
}

/**
 * Guarda una ficha, nueva o existente.
 *
 * `marcaAlAbrir` es el `updatedAt` con el que el formulario abrió la ficha, o
 * el que le devolvió su último guardado. La respuesta trae la marca nueva en
 * `datos.marca`, y el formulario tiene que adoptarla: sin eso, su segundo
 * guardado seguido chocaría consigo mismo.
 */
export async function guardarDocumento(
  slug: unknown,
  id: unknown,
  datos: unknown,
  publicar: unknown,
  marcaAlAbrir?: unknown,
): Promise<RespuestaSobreFichaAbierta<{ id: string; publicado: boolean; marca: Marca }>> {
  return conChoqueReconocido(async () => {
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

    let guardado: unknown
    if (id === null || id === undefined || id === '') {
      guardado = await payload.create(comun)
    } else {
      const idValido = exigirIdentificador(id, 'El documento')
      // Lo último antes de escribir: ver la ventana en `exigirQueNoCambio`.
      await exigirQueNoCambio(payload, esquema, idValido, marcaAlAbrir)
      guardado = await payload.update({ ...comun, id: idValido })
    }

    revalidatePath(rutaDeLista(esquema.slug))
    revalidatePath('/admin-panel')
    return {
      id: String((guardado as { id: unknown }).id),
      publicado: publicar === true,
      marca: marcaDe(guardado),
    }
  })
}

/**
 * Publica o retira una ficha.
 *
 * Desde el editor también recibe la marca y la devuelve nueva, por la misma
 * trampa que `guardarDocumento`: retirar mueve `updatedAt`, y si el formulario
 * no adoptara la marca, el «Guardar borrador» siguiente a un «Retirar» chocaría
 * consigo mismo. Y la comprueba antes, porque adoptar a ciegas la marca de
 * después de retirar taparía lo que otra persona hubiera guardado entre medias:
 * el siguiente guardado lo borraría sin choque.
 *
 * El listado la llama sin marca —no tiene ninguna ficha abierta— y ahí no se
 * comprueba nada.
 */
export async function cambiarPublicacion(
  slug: unknown,
  id: unknown,
  publicar: unknown,
  marcaAlAbrir?: unknown,
): Promise<RespuestaSobreFichaAbierta<{ marca: Marca }>> {
  return conChoqueReconocido(async () => {
    const esquema = esquemaValidado(slug)
    if (!esquema.versionada) throw new Error('Esta colección no distingue borrador de publicado.')
    const { payload, usuario } = await exigirEdicionDe(esquema.slug)
    const idValido = exigirIdentificador(id, 'El documento')

    await exigirQueNoCambio(payload, esquema, idValido, marcaAlAbrir)

    // `draft: false` en los dos sentidos, y esto importa.
    //
    // Retirar de publicacion escribia con `draft: true`, que en Payload guarda
    // una version de borrador nueva y **deja intacto el documento publicado**:
    // el boton respondia «retirada», el panel la mostraba como borrador y el
    // residente seguia viendo la ficha. Comprobado contra la base: tras la
    // llamada, `_status` seguia siendo `published` y una consulta de lector la
    // devolvia igual. Con `draft: false` el estado se escribe en el documento
    // y deja de verse, que es lo que el boton promete.
    const cambiado = await payload.update({
      collection: esquema.slug as never,
      id: idValido,
      data: { _status: publicar === true ? 'published' : 'draft' } as never,
      draft: false,
      user: usuario as never,
    })
    revalidatePath(rutaDeLista(esquema.slug))
    return { marca: marcaDe(cambiado) }
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

// Aquí hubo una acción `subirArchivo`, y no la hay a propósito.
//
// Subir un archivo por una acción de servidor falla de dos maneras que no se
// arreglan desde dentro: Next reúne el cuerpo entero en la memoria antes de
// invocarla —un vídeo de quirófano, minutos por un túnel doméstico— y lo
// descarta sin invocarla si pasa de `serverActions.bodySizeLimit`, de modo que
// la pantalla se queda muda. Las dos pantallas que suben van por
// `src/app/(frontend)/api/subidas/[coleccion]/route.ts`; el porqué entero, en
// `src/admin/subidas.ts`.
//
// Se retiró cuando se quedó sin consumidores, y no se dejó «por si acaso»
// porque una acción exportada desde un archivo `'use server'` es un extremo
// HTTP aunque ninguna pantalla la llame: aceptaba cuerpos de hasta el límite
// de las acciones de cualquiera con sesión de editor y escribía en la base.
// Volver a ponerla obligaría además a subir ese límite por encima del techo de
// los medios, que es justo lo que se bajó (`next.config.mjs`).
// `tests/unit/subidaDeVideo.test.ts` falla si alguna acción vuelve a recibir
// un archivo.

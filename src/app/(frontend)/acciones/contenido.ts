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
import { exigirIdentificador, exigirTexto, textoOpcional } from '@/lib/validacion'
import {
  CATALOGOS_AMPLIABLES,
  esCatalogoAmpliable,
  opcionIgualA,
  textoDelAvisoDeCatalogo,
  tipoDeLaClasificacion,
  type OrigenDelAgregado,
} from '@/lib/catalogosAmpliables'
import {
  cambioDesde,
  marcaDe,
  MENSAJE_DE_CONFLICTO,
  MENSAJE_DE_FICHA_ELIMINADA,
  type Marca,
} from '@/admin/concurrencia'
import {
  MENSAJE_DE_PUBLICAR_EN_REVISION,
  anotarGuardado,
  anotarGuardadoEnLaSesion,
  anotarPublicacion,
  esModuloEnRevision,
  quitarDeRevision,
  registrarParaRevision,
  revisionDe,
} from '@/lib/revisionServidor'
import type { OrigenDeContenido } from '@/lib/revision'

/**
 * La revisión de una ficha, si está en revisión (D-142), sin que un fallo de su
 * tabla deje sin guardar la ficha.
 *
 * Solo importa de verdad cuando un editor intenta publicar —una ficha en
 * revisión la publica el administrador—, y ahí se falla cerrado: si no se puede
 * saber, no se publica. En cualquier otro caso —un borrador, el administrador—
 * se sigue sin ella y queda en el registro: un despliegue con la tabla de
 * revisiones rota no puede dejar a los traumatólogos sin poder guardar.
 */
async function revisionSiSePuede(
  payload: Awaited<ReturnType<typeof exigirEdicionDe>>['payload'],
  coleccion: string,
  id: string,
  quiereDecidirPublicar: boolean,
): Promise<Record<string, unknown> | null> {
  try {
    return await revisionDe(payload, coleccion, id)
  } catch (error) {
    if (quiereDecidirPublicar) {
      throw new Error('No se pudo comprobar si la ficha está en revisión. Inténtelo de nuevo en un momento.')
    }
    console.error('[revision] no se pudo leer la revisión de la ficha:', error)
    return null
  }
}

/**
 * Lo que la revisión anota después de escribir la ficha (D-142) no puede tumbar
 * la respuesta: la ficha ya está guardada, y decirle al traumatólogo que no se
 * guardó por un fallo en la medida sería mentirle sobre su trabajo. El fallo
 * queda en el registro del servidor.
 */
async function sinTumbarLaRespuesta(que: string, tarea: () => Promise<unknown>) {
  try {
    await tarea()
  } catch (error) {
    console.error(`[revision] no se pudo anotar ${que}:`, error)
  }
}

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
  /** Si la ficha está en revisión (D-142): en qué estado y a quién le toca. */
  revision?: { estado: string; asignada: string | null; rapida: boolean } | null
}

/**
 * Los filtros de revisión del listado (D-142). `mias` son las asignadas a quien
 * mira; `por-revisar`, las que esperan a un revisor: pendientes, en revisión o
 * devueltas.
 */
export type FiltroDeRevision =
  | 'todas'
  | 'por-revisar'
  | 'listas'
  | 'devueltas'
  | 'publicadas'
  | 'sin-revision'
  | 'mias'

const ESTADOS_DEL_FILTRO: Partial<Record<FiltroDeRevision, string[]>> = {
  'por-revisar': ['pendiente', 'en-revision', 'devuelta'],
  listas: ['lista'],
  devueltas: ['devuelta'],
  publicadas: ['publicada'],
}

export interface Pagina {
  filas: FilaDeLista[]
  total: number
  pagina: number
  paginas: number
  /** Cuántos documentos hay en cada carpeta del esquema (`carpetas`), sin mirar la búsqueda: la cuenta de cada pestaña. */
  cuentasPorCarpeta?: Record<string, number>
}

export async function listarDocumentos(
  slug: unknown,
  opciones: {
    pagina?: number
    busqueda?: string
    estado?: 'todos' | 'publicado' | 'borrador'
    orden?: string
    revision?: FiltroDeRevision
    /** El valor de la carpeta elegida (P-004 E1), si el esquema parte el listado en carpetas. */
    carpeta?: string
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
    const { payload, usuarioId } = await exigirEdicionDe(esquema.slug)

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
    // Una carpeta (P-004 E1): solo vale un valor que el esquema declare; lo demás se ignora y se enseña todo.
    const carpeta =
      esquema.carpetas && typeof opciones.carpeta === 'string'
        ? esquema.carpetas.opciones.find((o) => o.valor === opciones.carpeta)
        : undefined
    if (esquema.carpetas && carpeta) {
      condiciones.push({ [esquema.carpetas.campo]: { equals: carpeta.valor } })
    }
    if (esquema.versionada && opciones.estado && opciones.estado !== 'todos') {
      condiciones.push({
        _status: { equals: opciones.estado === 'publicado' ? 'published' : 'draft' },
      })
    }

    // El filtro de revisión se resuelve en dos pasos: qué fichas de este módulo
    // tienen una revisión como la pedida, y después esas fichas. Las revisiones
    // viven en su propia colección y Payload no cruza por un campo de texto.
    const enRevision = esModuloEnRevision(esquema.slug)
    const filtro = typeof opciones.revision === 'string' ? opciones.revision : 'todas'
    if (enRevision && filtro !== 'todas') {
      const estados = ESTADOS_DEL_FILTRO[filtro]
      const { docs: revisiones } = await payload.find({
        collection: 'revisiones',
        where: {
          and: [
            { coleccion: { equals: esquema.slug } },
            ...(estados ? [{ estado: { in: estados } }] : []),
            ...(filtro === 'mias' ? [{ asignadaA: { equals: usuarioId } }] : []),
          ],
        } as never,
        limit: 10_000,
        depth: 0,
        overrideAccess: true,
        pagination: false,
        select: { documentoId: true },
      })
      const ids = (revisiones as unknown as { documentoId: string }[])
        .map((r) => Number(r.documentoId))
        .filter(Number.isFinite)
      if (filtro === 'sin-revision') {
        if (ids.length > 0) condiciones.push({ id: { not_in: ids } })
      } else {
        // Sin ninguna, un `in` vacío: Payload lo lee como «sin filtro» en
        // algunas versiones, y el listado enseñaría todo en vez de nada.
        condiciones.push({ id: { in: ids.length > 0 ? ids : [-1] } })
      }
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

    // La revisión de cada fila de esta página, en una sola consulta.
    const revisionPorFicha = new Map<string, FilaDeLista['revision']>()
    if (enRevision && resultado.docs.length > 0) {
      const { docs: revisiones } = await payload.find({
        collection: 'revisiones',
        where: {
          and: [
            { coleccion: { equals: esquema.slug } },
            {
              documentoId: {
                in: resultado.docs.map((d) => String((d as unknown as { id: unknown }).id)),
              },
            },
          ],
        } as never,
        limit: resultado.docs.length,
        depth: 1,
        overrideAccess: true,
        select: { documentoId: true, estado: true, asignadaA: true, validacionRapida: true },
      })
      for (const bruta of revisiones as unknown as Record<string, unknown>[]) {
        const asignada = bruta.asignadaA as Record<string, unknown> | null
        revisionPorFicha.set(String(bruta.documentoId), {
          estado: String(bruta.estado),
          asignada:
            asignada && typeof asignada === 'object'
              ? String(asignada.nombre || asignada.email || `#${String(asignada.id)}`)
              : null,
          rapida: bruta.validacionRapida === true,
        })
      }
    }

    // La cuenta de cada pestaña de carpeta, aparte de la búsqueda: es lo que dice cuántos hay en cada una.
    const cuentasPorCarpeta: Record<string, number> = {}
    if (esquema.carpetas) {
      for (const opcion of esquema.carpetas.opciones) {
        const { totalDocs } = await payload.count({
          collection: esquema.slug as never,
          where: { [esquema.carpetas.campo]: { equals: opcion.valor } } as never,
          overrideAccess: true,
        })
        cuentasPorCarpeta[opcion.valor] = totalDocs
      }
    }

    return {
      ...(esquema.carpetas ? { cuentasPorCarpeta } : {}),
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
          ...(enRevision ? { revision: revisionPorFicha.get(String(doc.id)) ?? null } : {}),
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
): Promise<Respuesta<{ id: string; etiqueta: string; url?: string; tipo?: string; clase?: string }[]>> {
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
        // La carpeta de un modelo 3D (P-004 E1): con ella el desplegable ofrece solo la suya.
        clase: typeof doc.clase === 'string' ? doc.clase : undefined,
      }
    })
  })
}

// ------------------------------------------------------ buscar un archivo

/** Un archivo de `medios` (o de otra colección de subida), con lo justo para elegirlo y enseñarlo. */
export interface ArchivoBuscado {
  id: string
  /** El texto alternativo, o el nombre del archivo si no lo tiene. */
  etiqueta: string
  nombre: string
  url?: string
  tipo?: string
}

/** Cuántos resultados devuelve una búsqueda: los más recientes si no se escribe nada, los mejores si se escribe. */
const ARCHIVOS_POR_BUSQUEDA = 20

const archivoDe = (documento: unknown, titulo: string): ArchivoBuscado => {
  const doc = documento as Record<string, unknown>
  const nombre = typeof doc.filename === 'string' ? doc.filename : ''
  return {
    id: String(doc.id),
    etiqueta: String(doc[titulo] ?? '') || nombre || `#${doc.id}`,
    nombre,
    url: typeof doc.url === 'string' ? doc.url : undefined,
    tipo: typeof doc.mimeType === 'string' ? doc.mimeType : undefined,
  }
}

/**
 * Busca archivos de una colección de subida por lo que se escribió, para el selector de archivo del editor.
 *
 * Existe porque el desplegable de antes cargaba las primeras 500 filas de `medios` (`opcionesDeRelacion`): con las
 * 3.300 figuras que trajo la ingesta (D-144), las que pasaban de esa cifra no se podían elegir, y las 500 se traían
 * enteras —con su dirección— en cada ficha que se abría. Aquí se pide solo lo que se escribe, de veinte en veinte, y
 * se busca por la descripción y por el nombre del archivo (`buscarEn` del esquema).
 *
 * `tipos` son prefijos de tipo MIME (`image/`, `video/`): el bloque de imagen no debe ofrecer vídeos ni al revés. Llegan
 * del navegador, así que se limpian antes de ir a la consulta.
 *
 * Con `exigirEdicionDe`, como `opcionesDeRelacion`: lee con `overrideAccess: true` y esta guardia es lo único que mira
 * quién pregunta.
 */
export async function buscarArchivos(
  coleccion: unknown,
  opciones: { busqueda?: unknown; tipos?: unknown } = {},
): Promise<Respuesta<{ archivos: ArchivoBuscado[]; total: number }>> {
  return accion(async () => {
    const esquema = esquemaValidado(coleccion)
    const { payload } = await exigirEdicionDe(esquema.slug)
    if (!esquema.subida) throw new Error('Esa colección no guarda archivos.')
    if (!opciones || typeof opciones !== 'object') opciones = {}

    const busqueda = typeof opciones.busqueda === 'string' ? opciones.busqueda.trim().slice(0, 120) : ''
    const tipos = (Array.isArray(opciones.tipos) ? opciones.tipos : [])
      .filter((t): t is string => typeof t === 'string' && /^[a-z]+\/[a-z0-9.+-]*$/i.test(t))
      .slice(0, 8)

    const condiciones: Record<string, unknown>[] = []
    // Cada palabra por separado y todas a la vez, como el resto de los buscadores: «weber figura» encuentra
    // «Figura 3. Fractura de Weber B» aunque no estén juntas.
    for (const palabra of busqueda.split(/\s+/).filter(Boolean)) {
      condiciones.push({ or: esquema.buscarEn.map((campo) => ({ [campo]: { like: palabra } })) })
    }
    if (tipos.length > 0) condiciones.push({ or: tipos.map((t) => ({ mimeType: { like: t } })) })

    const resultado = await payload.find({
      collection: esquema.slug as never,
      where: (condiciones.length > 0 ? { and: condiciones } : undefined) as never,
      limit: ARCHIVOS_POR_BUSQUEDA,
      sort: '-updatedAt',
      depth: 0,
      overrideAccess: true,
    })
    return {
      archivos: resultado.docs.map((d) => archivoDe(d, esquema.titulo)),
      total: resultado.totalDocs,
    }
  })
}

/** Un archivo por su identificador: lo que el selector enseña cuando el documento solo trae el número. */
export async function archivoPorId(coleccion: unknown, id: unknown): Promise<Respuesta<ArchivoBuscado | null>> {
  return accion(async () => {
    const esquema = esquemaValidado(coleccion)
    const { payload } = await exigirEdicionDe(esquema.slug)
    if (!esquema.subida) throw new Error('Esa colección no guarda archivos.')
    const identificador = exigirIdentificador(id, 'El archivo')
    const documento = await payload
      .findByID({ collection: esquema.slug as never, id: identificador, depth: 0, overrideAccess: true })
      .catch(() => null)
    return documento ? archivoDe(documento, esquema.titulo) : null
  })
}

// ------------------------------------------------- ensanchar un catálogo

/**
 * Agrega una fila a un catálogo del simulador desde el propio formulario del
 * caso: el «¿No está? Agregar» del buscador de hueso, clasificación, técnica y
 * fase (`SelectorConBusqueda`).
 *
 * Quien llama es un editor con el caso abierto, no la administración: por eso
 * pasa por `exigirEdicionDe`, que le exige el rol y el permiso del módulo, y no
 * por `exigirAdmin`. Es lo que se pidió: que las técnicas y los huesos nuevos los
 * ponga quien escribe el caso, en el momento en que se da cuenta de que faltan.
 *
 * **Nunca duplica.** Si ya hay una fila con ese nombre —sin mirar tildes ni
 * mayúsculas— devuelve la que hay y lo dice (`yaExistia`): dos editores
 * escribiendo «Fijador externo» a la vez, o uno que no vio la lista porque
 * todavía no había cargado, no deben dejar dos filas que se ven iguales y que
 * ningún caso sabe distinguir. La comparación es la de `opcionIgualA`, la misma
 * que usa el control para decidir si ofrece agregar.
 *
 * Solo catálogos de `CATALOGOS_AMPLIABLES`: la acción se puede invocar a mano con
 * cualquier slug, y no está pensada para crear filas en colecciones que tienen
 * su propio formulario y sus propias reglas.
 *
 * **Avisa** (P-003, E1): cada fila nueva deja un comentario pendiente sobre ella, a nombre de quien la agregó,
 * que dice desde qué campo de qué ficha (`desde`), y le llega por correo a los administradores como cualquier
 * comentario. Si la fila ya existía no se avisa: no se agregó nada. Un fallo al avisar no deshace la fila —ya está
 * en el catálogo y el editor la está usando— y queda en el registro del servidor.
 */
export async function agregarAlCatalogo(
  coleccion: unknown,
  entrada: unknown,
  desde?: unknown,
): Promise<Respuesta<{ id: string; etiqueta: string; yaExistia: boolean }>> {
  return accion(async () => {
    if (!esCatalogoAmpliable(coleccion)) {
      throw new Error('A ese catálogo no se le agregan filas desde el caso.')
    }
    const slug = coleccion
    const catalogo = CATALOGOS_AMPLIABLES[slug]
    const { payload, usuario } = await exigirEdicionDe(slug)
    if (!entrada || typeof entrada !== 'object') throw new Error('No llegó nada que agregar.')
    const e = entrada as Record<string, unknown>

    const nombre = exigirTexto(e.nombre, `El nombre de ${catalogo.conArticulo}`, 120)
    const extra = catalogo.extra
    const codigo = extra
      ? extra.requerido
        ? exigirTexto(e.codigo, extra.etiqueta, extra.maximo)
        : textoOpcional(e.codigo, extra.etiqueta, extra.maximo)
      : undefined

    const existentes = await payload.find({
      collection: slug as never,
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    const filas = existentes.docs as unknown as Record<string, unknown>[]
    const repetida = opcionIgualA(
      filas.map((f) => ({ id: String(f.id), etiqueta: String(f.nombre ?? '') })),
      nombre,
    )
    if (repetida) return { id: repetida.id, etiqueta: repetida.etiqueta, yaExistia: true }

    // Al final de la lista y no al principio: lo añadido se encuentra donde se
    // espera, y el orden de lo que ya había —que alguien ordenó a propósito— no
    // se toca. De diez en diez para que el administrador pueda meter una entre medias.
    const orden = filas.reduce((mayor, f) => Math.max(mayor, typeof f.orden === 'number' ? f.orden : 0), 0) + 10

    const datos: Record<string, unknown> = { nombre, orden }
    if (codigo) datos.codigo = codigo
    if (slug === 'clasificaciones-ao' && codigo) {
      const tipo = tipoDeLaClasificacion(codigo)
      if (tipo) datos.tipo = tipo
    }

    const creada = await payload.create({
      collection: slug as never,
      data: datos as never,
      user: usuario as never,
    })
    revalidatePath(rutaDeLista(slug))
    const idNuevo = String((creada as { id: unknown }).id)
    await avisarDeLaFilaNueva(payload, usuario, { catalogo: slug, id: idNuevo, nombre, codigo, desde })
    return { id: idNuevo, etiqueta: nombre, yaExistia: false }
  })
}

/** Lo que el navegador dice sobre de dónde agregó la fila, validado: la acción se puede invocar a mano. */
function origenDelAgregado(valor: unknown): OrigenDelAgregado | null {
  if (!valor || typeof valor !== 'object') return null
  const v = valor as Record<string, unknown>
  if (!esColeccionEditable(v.coleccion)) return null
  let documentoId: string | null = null
  if (v.documentoId !== null && v.documentoId !== undefined && v.documentoId !== '') {
    try {
      documentoId = exigirIdentificador(v.documentoId, 'La ficha')
    } catch {
      documentoId = null
    }
  }
  const campo = typeof v.campo === 'string' ? v.campo.trim().slice(0, 80) : ''
  return { coleccion: v.coleccion, documentoId, campo: campo || 'este campo' }
}

/**
 * Deja el comentario que cuenta quién agregó una fila al catálogo y desde dónde.
 *
 * Cuelga de la fila nueva (`coleccion` del catálogo, `documentoId` de la fila): es sobre ella que hay que actuar, y
 * existe siempre, a diferencia de la ficha desde la que se agregó, que puede estar sin guardar. Va con
 * `payload.create` y el usuario: el gancho de `Comentarios` pone el autor y manda el correo.
 */
async function avisarDeLaFilaNueva(
  payload: Awaited<ReturnType<typeof exigirEdicionDe>>['payload'],
  usuario: Record<string, unknown>,
  p: { catalogo: string; id: string; nombre: string; codigo?: string; desde: unknown },
): Promise<void> {
  try {
    const origen = origenDelAgregado(p.desde)
    let ficha: { articulo: 'el' | 'la'; singular: string; titulo: string | null } | null = null
    let fichaNueva: string | null = null
    if (origen) {
      const esquema = esquemaDe(origen.coleccion)
      const singular = esquema.singular.toLowerCase()
      if (origen.documentoId) {
        const doc = await payload
          .findByID({
            collection: origen.coleccion as never,
            id: origen.documentoId,
            depth: 0,
            draft: esquema.versionada,
            overrideAccess: true,
          })
          .catch(() => null)
        const titulo = (doc as Record<string, unknown> | null)?.[esquema.titulo]
        ficha = {
          articulo: esquema.genero === 'f' ? 'la' : 'el',
          singular,
          titulo: typeof titulo === 'string' && titulo.trim() ? titulo.trim() : null,
        }
      } else {
        fichaNueva = `${esquema.genero === 'f' ? 'una' : 'un'} ${singular}`
      }
    }
    const quien =
      (typeof usuario.nombre === 'string' && usuario.nombre.trim()) ||
      (typeof usuario.email === 'string' && usuario.email) ||
      'Una cuenta'
    await payload.create({
      collection: 'comentarios',
      data: {
        coleccion: p.catalogo,
        documentoId: p.id,
        texto: textoDelAvisoDeCatalogo({
          quien,
          catalogo: CATALOGOS_AMPLIABLES[p.catalogo],
          nombre: p.nombre,
          codigo: p.codigo,
          campo: origen?.campo ?? null,
          ficha,
          fichaNueva,
        }),
        estado: 'pendiente',
      } as never,
      user: usuario as never,
    })
  } catch (error) {
    console.error('[catalogo] la fila se agregó pero no se pudo dejar el aviso:', error)
  }
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
  /** La sesión de revisión del editor que guarda, si la ficha está en revisión (D-142). */
  sesionDeRevision?: unknown,
): Promise<RespuestaSobreFichaAbierta<{ id: string; publicado: boolean; marca: Marca }>> {
  return conChoqueReconocido(async () => {
    const esquema = esquemaValidado(slug)
    const { payload, usuario, usuarioId } = await exigirEdicionDe(esquema.slug)

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
      // Una ficha en revisión la publica el administrador (D-142): el editor
      // la da por lista y ahí se queda. Se comprueba antes de escribir, porque
      // después ya estaría publicada. El formulario no le ofrece el botón; esto
      // es para el listado y para quien llame a la acción a mano.
      const esAdmin = usuario.rol === 'admin'
      const revision = await revisionSiSePuede(payload, esquema.slug, idValido, publicar === true && !esAdmin)
      if (revision && publicar === true && !esAdmin) throw new Error(MENSAJE_DE_PUBLICAR_EN_REVISION)
      // Lo último antes de escribir: ver la ventana en `exigirQueNoCambio`.
      await exigirQueNoCambio(payload, esquema, idValido, marcaAlAbrir)
      guardado = await payload.update({ ...comun, id: idValido })
      if (revision) {
        await sinTumbarLaRespuesta('el guardado', async () => {
          await anotarGuardado(payload, {
            esquema,
            documentoId: idValido,
            documento,
            usuarioId,
            esAdmin,
            publicada: publicar === true,
          })
          await anotarGuardadoEnLaSesion(payload, sesionDeRevision, usuarioId)
        })
        revalidatePath('/admin-panel/revision')
        revalidatePath('/admin-panel/auditoria')
      }
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
    const { payload, usuario, usuarioId } = await exigirEdicionDe(esquema.slug)
    const idValido = exigirIdentificador(id, 'El documento')

    // Como en `guardarDocumento`: una ficha en revisión solo la publica el
    // administrador (D-142). Retirarla sí puede el editor, igual que antes.
    const revision = await revisionSiSePuede(
      payload,
      esquema.slug,
      idValido,
      publicar === true && usuario.rol !== 'admin',
    )
    if (revision && publicar === true && usuario.rol !== 'admin') {
      throw new Error(MENSAJE_DE_PUBLICAR_EN_REVISION)
    }

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
    if (revision) {
      await sinTumbarLaRespuesta('la publicación', () =>
        anotarPublicacion(payload, {
          coleccion: esquema.slug,
          documentoId: idValido,
          usuarioId,
          publicar: publicar === true,
        }),
      )
      revalidatePath('/admin-panel/revision')
      revalidatePath('/admin-panel/auditoria')
    }
    revalidatePath(rutaDeLista(esquema.slug))
    return { marca: marcaDe(cambiado) }
  })
}

/**
 * Lo que se le dice al editor que intenta borrar una ficha en revisión.
 *
 * Borrarla se lleva su revisión y su tiempo (`quitarDeRevision`), y con eso la
 * única constancia de que llegó redactada por un modelo y de quién la tocó.
 * Junto con `duplicarDocumento` era la salida del flujo de D-142: copiar la
 * ficha, publicar la copia —que nacía sin revisión— y borrar la original.
 */
const MENSAJE_DE_BORRAR_EN_REVISION =
  'Esta ficha está en revisión: solo un administrador puede eliminarla, porque con ella se borra su registro de revisión.'

export async function eliminarDocumento(slug: unknown, id: unknown): Promise<Respuesta> {
  return accion(async () => {
    const esquema = esquemaValidado(slug)
    const { payload, usuario } = await exigirEdicionDe(esquema.slug)
    const idValido = exigirIdentificador(id, 'El documento')
    // Cerrado si no se puede saber: un fallo de la tabla de revisiones no puede
    // ser la puerta para borrar lo que está en ella. Al administrador no se le
    // pregunta, como al publicar.
    if (usuario.rol !== 'admin') {
      const revision = await revisionSiSePuede(payload, esquema.slug, idValido, true)
      if (revision) throw new Error(MENSAJE_DE_BORRAR_EN_REVISION)
    }
    await payload.delete({
      collection: esquema.slug as never,
      id: idValido,
      user: usuario as never,
    })
    // Su revisión y su tiempo se van con ella: una fila de auditoría de una
    // ficha que ya no existe no se puede abrir ni revisar.
    await sinTumbarLaRespuesta('el borrado', () => quitarDeRevision(payload, esquema.slug, idValido))
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
 *
 * La copia de una ficha en revisión entra en revisión (D-142). Nacía sin ella,
 * y eso era la salida del flujo entero: un editor duplicaba el texto que llegó
 * del modelo, publicaba la copia —sin revisión no hay nada que se lo impida— y
 * borraba la original. Hereda la procedencia, las notas, la asignación y la
 * versión original de la otra, para que lo editado se siga midiendo contra lo
 * que escribió el modelo y no contra la copia.
 */
export async function duplicarDocumento(
  slug: unknown,
  id: unknown,
): Promise<Respuesta<{ id: string }>> {
  return accion(async () => {
    const esquema = esquemaValidado(slug)
    if (esquema.subida) throw new Error('Un archivo subido no se duplica; súbalo otra vez.')
    const { payload, usuario, usuarioId } = await exigirEdicionDe(esquema.slug)
    const idOriginal = exigirIdentificador(id, 'El documento')

    // Cerrado si no se puede saber, como al publicar: una copia que tendría
    // que estar en revisión y no lo está es la misma puerta abierta.
    const revision = esModuloEnRevision(esquema.slug)
      ? await revisionSiSePuede(payload, esquema.slug, idOriginal, true)
      : null

    const original = (await payload.findByID({
      collection: esquema.slug as never,
      id: idOriginal,
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
    const idCopia = String((creado as { id: unknown }).id)

    if (revision) {
      try {
        const conOriginal = await revisionDe(payload, esquema.slug, idOriginal, { conOriginal: true })
        const texto = (valor: unknown) => (typeof valor === 'string' && valor !== '' ? valor : undefined)
        const asignada = revision.asignadaA
        await registrarParaRevision(payload, {
          coleccion: esquema.slug,
          documentoId: idCopia,
          usuarioId,
          origen: revision.origen as OrigenDeContenido | undefined,
          libro: texto(revision.libro),
          capitulo: texto(revision.capitulo),
          paginas: texto(revision.paginas),
          lote: texto(revision.lote),
          modelo: texto(revision.modelo),
          archivoFuente: texto(revision.archivoFuente),
          notasParaElRevisor: Array.isArray(revision.notasParaElRevisor)
            ? (revision.notasParaElRevisor as unknown[]).filter((n): n is string => typeof n === 'string')
            : undefined,
          asignadaA:
            asignada === null || asignada === undefined
              ? null
              : String(typeof asignada === 'object' ? (asignada as { id: unknown }).id : asignada),
          original: (conOriginal?.original as Record<string, unknown> | undefined) ?? undefined,
          copiaDe: idOriginal,
        })
      } catch (error) {
        // Sin su revisión la copia es la puerta que esto cierra: se borra, y el
        // fallo sube. Con `overrideAccess` porque quien la acaba de crear es
        // quien llama, y el borrado no puede depender de nada más.
        await payload
          .delete({ collection: esquema.slug as never, id: idCopia, overrideAccess: true })
          .catch((fallo: unknown) => console.error('[revision] no se pudo borrar la copia sin revisión:', fallo))
        console.error('[revision] no se pudo meter en revisión la copia:', error)
        throw new Error('No se pudo duplicar: la copia de una ficha en revisión tiene que entrar en revisión, y eso falló.')
      }
      revalidatePath('/admin-panel/revision')
      revalidatePath('/admin-panel/auditoria')
    }

    revalidatePath(rutaDeLista(esquema.slug))
    return { id: idCopia }
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

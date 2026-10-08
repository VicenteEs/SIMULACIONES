'use server'

/**
 * Acciones de la pestaña «Instrumental» del taller anatómico (D-165).
 *
 * El reparto es el que se pidió: **el editor crea el instrumento** (nombre,
 * categoría, para qué sirve, medidas) y **el administrador carga su modelo 3D y
 * lo retoca**. Por eso las que describen son del editor y las que tocan el
 * archivo —cargar, quitar, retocar, borrar— son del administrador, con su rol
 * real: el modelo es lo que ve el residente en la bandeja de la consola.
 *
 * El modelo se sube como cualquier otro a `modelos-3d` (por la ruta de subidas) y
 * se enlaza en el campo `modelo` del instrumento, que es el que la consola ya
 * lee; no hay un segundo sitio donde viva el archivo.
 */

import { revalidatePath } from 'next/cache'
import { accion, exigirAdmin, exigirEditor, type Respuesta } from '@/lib/guardias'
import { exigirIdentificador, exigirTexto, textoOpcional } from '@/lib/validacion'
import {
  CATEGORIAS_DE_INSTRUMENTAL,
  INSTRUMENTAL_BASE,
  slugDeArchivo,
  slugDeInstrumento,
} from '@/lib/instrumental'
import { ajustesValidos, type AjustesDeInstrumento } from '@/instrumental/modelo'

const RUTA_PANEL = '/admin-panel/atlas'

export interface InstrumentoDelTaller {
  id: string
  nombre: string
  slug: string
  categoria: string
  icono: string
  descripcion: string
  especificaciones: string
  orden: number
  modelo: { id: string; nombre: string; url: string; bytes: number | null } | null
  ajustes: AjustesDeInstrumento | null
}

const texto = (v: unknown) => (typeof v === 'string' ? v : '')

/**
 * Un identificador para una relación: con la base en enteros, Payload rechaza «49»
 * como valor de un campo de relación y contesta «el siguiente campo es inválido».
 * Es el mismo tropiezo que los votos del buzón.
 */
const idParaRelacion = (id: string): string | number => (/^\d+$/.test(id) ? Number(id) : id)

function aInstrumento(doc: Record<string, unknown>): InstrumentoDelTaller {
  const m = doc.modelo && typeof doc.modelo === 'object' ? (doc.modelo as Record<string, unknown>) : null
  const url = m ? texto(m.url) : ''
  return {
    id: String(doc.id),
    nombre: texto(doc.nombre),
    slug: texto(doc.slug) || slugDeInstrumento(texto(doc.nombre)),
    categoria: texto(doc.categoria) || 'fijacion',
    icono: texto(doc.icono) || 'generico',
    descripcion: texto(doc.descripcion),
    especificaciones: texto(doc.especificaciones),
    orden: typeof doc.orden === 'number' ? doc.orden : 0,
    modelo: m && url ? { id: String(m.id), nombre: texto(m.nombre), url, bytes: typeof m.filesize === 'number' ? m.filesize : null } : null,
    ajustes: doc.ajustes && typeof doc.ajustes === 'object' ? ajustesValidos(doc.ajustes) : null,
  }
}

const CATEGORIAS = new Set<string>(CATEGORIAS_DE_INSTRUMENTAL.map((c) => c.value))
const ICONOS = new Set(['generico', 'bisturi', 'separador', 'pinza', 'tijera', 'punzon', 'guia', 'fresa', 'martillo', 'atornillador', 'aguja'])

function datosDescriptivos(entrada: unknown) {
  if (!entrada || typeof entrada !== 'object') throw new Error('No llegó nada que guardar.')
  const e = entrada as Record<string, unknown>
  const categoria = typeof e.categoria === 'string' && CATEGORIAS.has(e.categoria) ? e.categoria : 'fijacion'
  const icono = typeof e.icono === 'string' && ICONOS.has(e.icono) ? e.icono : 'generico'
  const nombre = exigirTexto(e.nombre, 'El nombre', 120)
  return {
    nombre,
    slug: slugDeInstrumento(typeof e.slug === 'string' && e.slug.trim() ? e.slug : nombre) || undefined,
    categoria,
    icono,
    descripcion: textoOpcional(e.descripcion, 'Para qué sirve', 600) ?? '',
    especificaciones: textoOpcional(e.especificaciones, 'Las medidas', 1200) ?? '',
  }
}

/** Todo el instrumental, con el estado de su modelo: es lo que dibuja el listado del taller. */
export async function listarInstrumental(): Promise<Respuesta<InstrumentoDelTaller[]>> {
  return accion(async () => {
    const { payload } = await exigirEditor()
    const { docs } = await payload.find({
      collection: 'instrumental',
      limit: 500,
      sort: 'orden',
      depth: 1,
      overrideAccess: true,
    })
    return (docs as unknown as Record<string, unknown>[]).map(aInstrumento)
  })
}

/** Un instrumento nuevo, sin modelo: queda «pendiente» hasta que el administrador cargue el archivo. */
export async function crearInstrumento(entrada: unknown): Promise<Respuesta<{ id: string }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const datos = datosDescriptivos(entrada)
    const repetido = await payload.find({
      collection: 'instrumental',
      where: { slug: { equals: datos.slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (repetido.docs.length > 0) throw new Error(`Ya hay un instrumento con el identificador «${datos.slug}».`)
    const creado = await payload.create({
      collection: 'instrumental',
      data: { ...datos, orden: 1000 } as never,
      user: usuario as never,
    })
    revalidatePath(RUTA_PANEL)
    return { id: String((creado as { id: unknown }).id) }
  })
}

/** Cambia lo que describe al instrumento. El modelo y los retoques no se tocan desde aquí. */
export async function editarInstrumento(id: unknown, entrada: unknown): Promise<Respuesta<void>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const datos = datosDescriptivos(entrada)
    await payload.update({
      collection: 'instrumental',
      id: exigirIdentificador(id, 'El instrumento'),
      data: datos as never,
      user: usuario as never,
    })
    revalidatePath(RUTA_PANEL)
  })
}

/**
 * Añade al catálogo los instrumentos de `INSTRUMENTAL_BASE` que todavía no están,
 * por identificador. No toca los que ya existen: si se renombró o se corrigió uno
 * a mano, se queda como está.
 */
export async function completarElCatalogo(): Promise<Respuesta<{ creados: number; yaEstaban: number }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    const existentes = await payload.find({ collection: 'instrumental', limit: 1000, depth: 0, overrideAccess: true })
    const slugs = new Set((existentes.docs as unknown as Record<string, unknown>[]).map((d) => texto(d.slug) || slugDeInstrumento(texto(d.nombre))))
    let creados = 0
    for (const [i, base] of INSTRUMENTAL_BASE.entries()) {
      if (slugs.has(base.slug)) continue
      await payload.create({
        collection: 'instrumental',
        data: { ...base, orden: i + 1 } as never,
        user: usuario as never,
      })
      creados += 1
    }
    revalidatePath(RUTA_PANEL)
    return { creados, yaEstaban: INSTRUMENTAL_BASE.length - creados }
  })
}

/**
 * Enlaza un modelo ya subido con su instrumento. Si el enlace falla, el modelo se
 * borra: un archivo en la biblioteca que nadie usa y que nadie va a encontrar es
 * peor que no haberlo subido.
 *
 * El archivo **no viaja por aquí**: la pantalla lo sube por `/api/subidas/modelos-3d`
 * (`subidorQueAvisa`) y solo manda el identificador que esa ruta devolvió. Una
 * acción de servidor que recibiera el `.glb` se toparía con
 * `serverActions.bodySizeLimit` sin mensaje alguno, y es lo que
 * `tests/unit/subidaDeVideo.test.ts` vigila que no vuelva a pasar.
 */
async function enlazarModelo(
  payload: Awaited<ReturnType<typeof exigirAdmin>>['payload'],
  usuario: Record<string, unknown>,
  instrumento: string,
  modelo: string,
): Promise<void> {
  try {
    await payload.update({
      collection: 'instrumental',
      id: instrumento,
      // Un modelo nuevo trae sus nodos: los retoques del anterior apuntaban a
      // nombres que pueden ya no existir.
      data: { modelo: idParaRelacion(modelo), ajustes: null } as never,
      overrideAccess: true,
      user: usuario as never,
    })
  } catch (error) {
    await payload.delete({ collection: 'modelos-3d', id: modelo, overrideAccess: true }).catch(() => {})
    throw error
  }
}

/** Enlaza el modelo recién subido con UN instrumento elegido. */
export async function enlazarModeloDeInstrumento(id: unknown, modelo: unknown): Promise<Respuesta<void>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    await enlazarModelo(payload, usuario, exigirIdentificador(id, 'El instrumento'), exigirIdentificador(modelo, 'El modelo'))
    revalidatePath(RUTA_PANEL)
  })
}

/**
 * Enlaza el modelo recién subido **por el nombre del archivo**: `tijera-mayo.glb`
 * va con el instrumento de identificador `tijera-mayo`. Es la vía para cargar los
 * cuarenta y siete de una vez, uno por llamada. Si ningún instrumento lleva ese
 * identificador, el modelo subido se borra y se dice cuál era.
 */
export async function enlazarModeloPorNombre(nombreDeArchivo: unknown, modelo: unknown): Promise<Respuesta<{ instrumento: string; nombre: string }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    const idDelModelo = exigirIdentificador(modelo, 'El modelo')
    const slug = slugDeArchivo(typeof nombreDeArchivo === 'string' ? nombreDeArchivo : '')
    const encontrados = slug
      ? await payload.find({ collection: 'instrumental', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
      : null
    const doc = encontrados?.docs[0] as unknown as Record<string, unknown> | undefined
    if (!doc) {
      await payload.delete({ collection: 'modelos-3d', id: idDelModelo, overrideAccess: true }).catch(() => {})
      throw new Error(`No hay un instrumento con el identificador «${slug || 'sin nombre'}». Créelo primero, o cambie el nombre del archivo.`)
    }
    await enlazarModelo(payload, usuario, String(doc.id), idDelModelo)
    revalidatePath(RUTA_PANEL)
    return { instrumento: String(doc.id), nombre: texto(doc.nombre) }
  })
}

/** Deja al instrumento sin modelo. El archivo se queda en la biblioteca: otro caso puede estar usándolo. */
export async function quitarModeloDeInstrumento(id: unknown): Promise<Respuesta<void>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    await payload.update({
      collection: 'instrumental',
      id: exigirIdentificador(id, 'El instrumento'),
      data: { modelo: null, ajustes: null } as never,
      overrideAccess: true,
      user: usuario as never,
    })
    revalidatePath(RUTA_PANEL)
  })
}

/** Guarda lo retocado en el taller: partes ocultas, recoloreadas o movidas y el estado inicial de las articulaciones. */
export async function guardarRetoquesDeInstrumento(id: unknown, ajustes: unknown): Promise<Respuesta<{ retocadas: number }>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    const limpios = ajustesValidos(ajustes)
    const hay = Object.keys(limpios.partes ?? {}).length + Object.keys(limpios.articulaciones ?? {}).length > 0
    await payload.update({
      collection: 'instrumental',
      id: exigirIdentificador(id, 'El instrumento'),
      data: { ajustes: hay ? limpios : null } as never,
      overrideAccess: true,
      user: usuario as never,
    })
    revalidatePath(RUTA_PANEL)
    return { retocadas: Object.keys(limpios.partes ?? {}).length }
  })
}

/** Borra el instrumento. Los pasos de cirugía que lo pedían quedan sin instrumento: hay que avisarlo antes (el taller lo hace). */
export async function eliminarInstrumento(id: unknown): Promise<Respuesta<void>> {
  return accion(async () => {
    const { payload, usuario } = await exigirAdmin()
    await payload.delete({
      collection: 'instrumental',
      id: exigirIdentificador(id, 'El instrumento'),
      overrideAccess: true,
      user: usuario as never,
    })
    revalidatePath(RUTA_PANEL)
  })
}

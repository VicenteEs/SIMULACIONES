import type { Payload, Where } from 'payload'
import type { EsquemaDeColeccion } from '@/admin/esquema'
import { leerTodas } from '@/lib/leerTodas'
import { claveDeDia, claveDeMes, contarEn, leerFecha, ultimosDias, ultimosMeses, type Casilla } from '@/lib/series'
import { APERTURAS } from '../resumen'
import { ESTADOS_DE_REVISION_DE_LA_VISTA, VISTAS_DEL_LISTADO, type CuentasDeLasVistas } from './vistas'

/**
 * Lo que «Contenido» y el listado de cada módulo dibujan además de sus
 * fichas (P-007 E5, D-238): cuánto de cada módulo está publicado, cuánto se
 * lee, cuántas fichas se crean al mes y cómo está el material de apoyo.
 *
 * Cada lectura devuelve `null` si su consulta falló, nunca ceros de relleno,
 * por lo mismo que `contar` en `datos.ts`: un módulo a cero se lee como «se
 * perdió el contenido», y si la tabla no contestó no es verdad.
 *
 * **Las lecturas** son las aperturas del registro de acciones, con el mismo
 * filtro que `lecturasPorDia` del Resumen: acción «lectura» con detalle «la
 * abrió» o sin detalle —las de antes de que se escribiera—. Las marcas de
 * «leída» van en la misma acción y no son aperturas. Las ve solo el
 * administrador, como en el Resumen: quién lee y cuánto no es del editor.
 */

/** Los días de lectura que cuentan las tarjetas de módulo y la columna del listado. */
export const DIAS_DE_LECTURA = 30

/** Los meses de «Fichas creadas por mes». */
export const MESES_DE_ALTAS = 6

/**
 * La medianoche del primero de los últimos `dias` días, hoy incluido: el mismo
 * borde que la primera casilla de `ultimosDias`. Restando milisegundos a
 * «ahora» se colaba la tarde del día anterior, y la suma de la columna del
 * listado no coincidía con la de la tarjeta del módulo.
 */
const desdeHace = (dias: number, hoy: Date) =>
  new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1)).toISOString()

/**
 * Cuántas filas enseña el listado con estas condiciones, o `null` si la base no
 * contestó.
 *
 * Con `find` y `draft`, como `listarDocumentos`, y no con `count`, que no admite
 * `draft` y cuenta el documento principal: una ficha publicada a la que después
 * se le guardó un borrador sigue `published` en el documento —es lo que ve el
 * residente— y el listado la enseña como borrador, porque lee la última
 * versión. Contadas con `count`, la pestaña «Publicadas» decía una ficha más de
 * las que abría.
 */
async function contarComoElListado(
  payload: Payload,
  esquema: Pick<EsquemaDeColeccion, 'slug' | 'versionada'>,
  where?: Record<string, unknown>,
): Promise<number | null> {
  try {
    const { totalDocs } = await payload.find({
      collection: esquema.slug as never,
      ...(where ? { where: where as never } : {}),
      limit: 1,
      depth: 0,
      draft: esquema.versionada,
      overrideAccess: true,
    })
    return totalDocs
  } catch (error) {
    console.error(`[panel] no se pudieron contar las fichas de «${esquema.slug}» como las enseña el listado:`, error)
    return null
  }
}

/** Cuántos hay, o `null` si la base no supo responder. */
async function contar(payload: Payload, coleccion: string, where?: Record<string, unknown>): Promise<number | null> {
  try {
    const { totalDocs } = await payload.count({
      collection: coleccion as never,
      ...(where ? { where: where as never } : {}),
      overrideAccess: true,
    })
    return totalDocs
  } catch (error) {
    console.error(`[panel] no se pudo contar «${coleccion}»:`, error)
    return null
  }
}

// ------------------------------------------------------------- las lecturas

/** Las aperturas de cada módulo, día a día. */
export interface LecturasDeLosModulos {
  dias: Casilla[]
  porModulo: Record<string, number[]>
}

/** Reparte las aperturas por módulo y por día. Lo de otras colecciones o fuera de los días no cuenta. */
export function repartirPorModulo(
  aperturas: readonly { coleccion?: unknown; fecha?: unknown }[],
  modulos: readonly string[],
  dias: readonly Casilla[],
): Record<string, number[]> {
  return Object.fromEntries(
    modulos.map((m) => [m, contarEn(dias, aperturas.filter((a) => a.coleccion === m).map((a) => claveDeDia(a.fecha)))]),
  )
}

export async function lecturasDeLosModulos(
  payload: Payload,
  modulos: readonly string[],
  hoy: Date = new Date(),
): Promise<LecturasDeLosModulos | null> {
  const dias = ultimosDias(DIAS_DE_LECTURA, hoy)
  if (modulos.length === 0) return { dias, porModulo: {} }
  try {
    const { docs } = await leerTodas(payload, {
      coleccion: 'registro-de-acciones',
      where: {
        and: [...APERTURAS, { coleccion: { in: [...modulos] } }, { fecha: { greater_than_equal: desdeHace(DIAS_DE_LECTURA, hoy) } }],
      },
      select: { coleccion: true, fecha: true },
    })
    return { dias, porModulo: repartirPorModulo(docs, modulos, dias) }
  } catch (error) {
    console.error('[panel] no se pudieron leer las lecturas de los módulos:', error)
    return null
  }
}

/** Cuántas veces se abrió cada ficha, por su identificador. */
export function contarPorFicha(aperturas: readonly { documentoId?: unknown }[]): Record<string, number> {
  const cuentas: Record<string, number> = {}
  for (const a of aperturas) {
    if (typeof a.documentoId !== 'string' || a.documentoId === '') continue
    cuentas[a.documentoId] = (cuentas[a.documentoId] ?? 0) + 1
  }
  return cuentas
}

/**
 * Las aperturas de cada ficha de un módulo en los últimos `DIAS_DE_LECTURA`
 * días, para la columna «Lecturas · 30 d» del listado.
 *
 * Se lee el módulo entero y no la página que se ve: el listado pagina en el
 * navegador, y pedirlo página a página obligaría a tocar `listarDocumentos`,
 * que es de lo que viven el filtro y las acciones. Las fichas sin ninguna
 * apertura no viajan: la columna las pinta a cero.
 */
export async function lecturasPorFicha(payload: Payload, slug: string, hoy: Date = new Date()): Promise<Record<string, number> | null> {
  try {
    const { docs } = await leerTodas(payload, {
      coleccion: 'registro-de-acciones',
      where: {
        and: [...APERTURAS, { coleccion: { equals: slug } }, { fecha: { greater_than_equal: desdeHace(DIAS_DE_LECTURA, hoy) } }],
      },
      select: { documentoId: true },
    })
    return contarPorFicha(docs)
  } catch (error) {
    console.error(`[panel] no se pudieron leer las lecturas de «${slug}»:`, error)
    return null
  }
}

// ---------------------------------------------------------- las altas

export interface AltasPorMes {
  meses: Casilla[]
  valores: number[]
}

/**
 * Cuántas fichas de los módulos se crearon cada uno de los últimos meses,
 * borradores incluidos.
 *
 * Por `createdAt` de las fichas que existen hoy: una ficha creada en agosto y
 * borrada en octubre ya no está en agosto. Lo dice la bajada del gráfico.
 */
export async function altasPorMes(payload: Payload, modulos: readonly string[], hoy: Date = new Date()): Promise<AltasPorMes | null> {
  const meses = ultimosMeses(MESES_DE_ALTAS, hoy)
  try {
    const listas = await Promise.all(
      modulos.map((m) => leerTodas(payload, { coleccion: m, select: { createdAt: true } }).then((r) => r.docs)),
    )
    return { meses, valores: contarEn(meses, listas.flat().map((d) => claveDeMes(d.createdAt))) }
  } catch (error) {
    console.error('[panel] no se pudieron contar las fichas creadas por mes:', error)
    return null
  }
}

// ---------------------------------------------------------- los módulos

export interface ConteoDelModulo {
  publicadas: number
  total: number
}

/**
 * Publicadas y total de un módulo, o `null` si la base no contestó a alguna de
 * las dos.
 *
 * Publicadas en el sitio: con `count`, sobre el documento principal, que es lo
 * que lee el residente y lo que contaba esta pantalla antes del tablero. Las
 * pestañas del listado cuentan otra cosa —la última versión— y por eso la
 * cabecera del listado dice «en el sitio».
 */
export async function conteoDelModulo(payload: Payload, slug: string): Promise<ConteoDelModulo | null> {
  const [publicadas, total] = await Promise.all([
    contar(payload, slug, { _status: { equals: 'published' } }),
    contar(payload, slug),
  ])
  return publicadas === null || total === null ? null : { publicadas, total }
}

export interface FichaReciente {
  coleccion: string
  id: string
  titulo: string
  publicada: boolean
  editada: string | null
}

/** Las `n` fichas editadas hace menos, de un módulo; lista vacía si no contestó. */
export async function recientesDe(payload: Payload, esquema: EsquemaDeColeccion, n = 5): Promise<FichaReciente[]> {
  try {
    const { docs } = await payload.find({
      collection: esquema.slug as never,
      limit: n,
      sort: '-updatedAt',
      depth: 0,
      draft: esquema.versionada,
      overrideAccess: true,
    })
    return (docs as unknown as Record<string, unknown>[]).map((doc) => ({
      coleccion: esquema.slug,
      id: String(doc.id),
      titulo: String(doc[esquema.titulo] ?? doc.filename ?? `#${String(doc.id)}`),
      publicada: doc._status === 'published' || !esquema.versionada,
      editada: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
    }))
  } catch (error) {
    console.error(`[panel] no se pudieron leer las últimas fichas de «${esquema.slug}»:`, error)
    return []
  }
}

/** Las `n` más recientes de varias listas juntas, de la más nueva a la más vieja. */
export function masRecientes(listas: readonly FichaReciente[][], n: number): FichaReciente[] {
  const instante = (f: FichaReciente) => leerFecha(f.editada)?.getTime() ?? 0
  return listas
    .flat()
    .sort((a, b) => instante(b) - instante(a))
    .slice(0, n)
}

// ---------------------------------------------------- el material de apoyo

export interface ResumenDeApoyo {
  slug: string
  /** Cuántas filas tiene; `null` si no se pudo contar. */
  filas: number | null
  /** Cuántas se crearon en los últimos 7 días; `null` si no se pudo contar. */
  nuevas: number | null
  /** Cuándo se editó la última; `null` si no hay ninguna o no se pudo leer. */
  ultimaEdicion: string | null
}

/** Las filas, las nuevas de la semana y la última edición de un catálogo de apoyo. */
export async function resumenDeApoyo(payload: Payload, slug: string, hoy: Date = new Date()): Promise<ResumenDeApoyo> {
  const [filas, nuevas, ultima] = await Promise.all([
    contar(payload, slug),
    contar(payload, slug, { createdAt: { greater_than_equal: desdeHace(7, hoy) } }),
    payload
      .find({
        collection: slug as never,
        limit: 1,
        sort: '-updatedAt',
        depth: 0,
        overrideAccess: true,
        select: { updatedAt: true } as never,
      })
      .then((r) => (r.docs as unknown as Record<string, unknown>[])[0]?.updatedAt)
      .catch(() => null),
  ])
  return { slug, filas, nuevas, ultimaEdicion: typeof ultima === 'string' ? ultima : null }
}

// ------------------------------------------------ las pestañas del listado

/**
 * Cuántas fichas hay detrás de cada pestaña del listado de un módulo.
 *
 * Con las mismas condiciones que `listarDocumentos`: el estado de publicación
 * se cuenta sobre la última versión de cada ficha, como la enseña el listado
 * (`contarComoElListado`), y las pestañas de revisión, sobre las fichas
 * cuya revisión está en esos estados —se buscan primero en `revisiones` y
 * después se cuentan en la colección, igual que hace el listado, para que una
 * fila de revisión sin su ficha no sume aquí lo que allí no aparece—. Sin mirar
 * la búsqueda, como las cuentas de carpeta: dicen cuántas hay en cada estado,
 * no cuántas coinciden con lo que se está tecleando.
 */
export async function cuentasDeLasVistas(
  payload: Payload,
  esquema: Pick<EsquemaDeColeccion, 'slug' | 'versionada'>,
): Promise<CuentasDeLasVistas> {
  const { slug } = esquema
  let revisiones: Record<string, unknown>[] | null = null
  try {
    revisiones = (
      await leerTodas(payload, {
        coleccion: 'revisiones',
        where: { coleccion: { equals: slug } },
        select: { documentoId: true, estado: true },
      })
    ).docs
  } catch (error) {
    console.error(`[panel] no se pudieron leer las revisiones de «${slug}»:`, error)
  }

  const contarVista = async (vista: (typeof VISTAS_DEL_LISTADO)[number]): Promise<number | null> => {
    const estados = ESTADOS_DE_REVISION_DE_LA_VISTA[vista.id]
    if (!estados) {
      return contarComoElListado(
        payload,
        esquema,
        vista.estado === 'todos' ? undefined : { _status: { equals: vista.estado === 'publicado' ? 'published' : 'draft' } },
      )
    }
    if (revisiones === null) return null
    const ids = revisiones
      .filter((r) => estados.includes(String(r.estado)))
      .map((r) => Number(r.documentoId))
      .filter(Number.isFinite)
    return ids.length === 0 ? 0 : contarComoElListado(payload, esquema, { id: { in: ids } })
  }

  const cuentas = await Promise.all(VISTAS_DEL_LISTADO.map(contarVista))
  return Object.fromEntries(VISTAS_DEL_LISTADO.map((v, i) => [v.id, cuentas[i]])) as CuentasDeLasVistas
}

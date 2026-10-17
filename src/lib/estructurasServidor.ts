/**
 * El listado global de estructuras: la parte que toca la base (D-179, P-003 E8).
 *
 * Lo puro está en `src/lib/estructuras.ts` y `src/lib/listadoDeEstructuras.ts`.
 * Aquí se sincroniza la colección `estructuras-anatomicas` con el atlas
 * instalado. No lleva `'use server'` y no debe llevarlo: con esa línea cada
 * exportación sería un extremo HTTP sin guardia. Quien la llama desde una acción
 * ya pasó por `exigirAdmin`, y un guion ya tiene la base en la mano.
 *
 * ## La siembra no pisa nada
 *
 * `sincronizarConElAtlas` es **idempotente** y solo crea lo que falta. Lo que ya
 * está escrito no se toca: de una fila existente solo se refrescan los datos que
 * son del atlas (`nombreOriginal`, `sistema`, `region`, `lado`, `huerfana`), que
 * nadie escribe a mano y que pueden haber cambiado si se corrigió una
 * clasificación. Ningún campo de la ficha se escribe jamás desde aquí.
 *
 * ## Si el atlas se regenera
 *
 * `scripts/atlas/preparar.mjs` reescribe el catálogo y los identificadores `FJ…`
 * podrían cambiar. Una fila cuyo `atlasId` ya no está **no se borra**: queda
 * `huerfana`, con todo lo escrito, y se enseña en un filtro aparte. Si el atlas
 * nuevo trae una pieza con el mismo nombre original y esa es la única candidata
 * (y la única huérfana con ese nombre: hay 231 nombres repetidos, uno por dedo en
 * las arterias digitales, y ahí adivinar sería escribir la ficha de un dedo en
 * otro), la ficha se **casa** con ella: cambia su `atlasId` y sigue viva.
 */
import type { Payload, PayloadRequest } from 'payload'
import type { CatalogoDelAtlas } from '@/atlas/formato'
import { ladoDeLaPieza, type FichaDeEstructura, type LadoDeLaPieza } from '@/lib/estructuras'
import { registrarAccion } from '@/lib/registroServidor'

/** Una fila de la colección, con lo que la sincronización mira. */
export interface FilaDeEstructura extends FichaDeEstructura {
  id: number | string
  atlasId: string
  nombreOriginal: string
  sistema?: string | null
  region?: string | null
  lado?: LadoDeLaPieza | null
  oculta?: boolean | null
  huerfana?: boolean | null
  updatedAt?: string
}

export interface ResultadoDeLaSiembra {
  /** Fichas nuevas, una por pieza que no tenía. */
  creadas: number
  /** Piezas que ya tenían su ficha y no cambiaron. */
  yaEstaban: number
  /** Fichas a las que se les refrescó un dato del atlas (sistema, región, lado). */
  actualizadas: number
  /** Fichas cuya pieza ya no está en el atlas: quedan marcadas, no se borran. */
  huerfanas: number
  /** Huérfanas cuya pieza volvió a aparecer. */
  recuperadas: number
  /** Huérfanas que se casaron con una pieza nueva por su nombre original. */
  casadasPorNombre: number
}

/** Los campos de la colección que `sincronizarConElAtlas` necesita leer. */
const COLUMNAS_DE_LA_SIEMBRA = {
  atlasId: true,
  nombreOriginal: true,
  sistema: true,
  region: true,
  lado: true,
  huerfana: true,
} as const

/** Todas las filas de la colección, sin paginar. Son unas 2.300: caben de sobra en memoria. */
export async function leerTodasLasEstructuras(
  payload: Payload,
  columnas?: Record<string, true>,
  req?: Partial<PayloadRequest>,
): Promise<FilaDeEstructura[]> {
  const { docs } = await payload.find({
    collection: 'estructuras-anatomicas',
    limit: 0,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    sort: 'atlasId',
    ...(columnas ? { select: columnas as never } : {}),
    ...(req ? { req: req as PayloadRequest } : {}),
  })
  return docs as unknown as FilaDeEstructura[]
}

/** Lo que el atlas dice de una pieza, ya listo para escribirse en su fila. */
function datosDelAtlas(pieza: CatalogoDelAtlas['piezas'][number]) {
  return {
    atlasId: pieza.id,
    nombreOriginal: pieza.nombre,
    sistema: pieza.sistema,
    region: pieza.region,
    lado: ladoDeLaPieza(pieza.nombre, pieza.region),
  }
}

/**
 * Pone la colección al día con el catálogo del atlas instalado.
 *
 * `catalogo` tiene que venir de `leerCatalogo` (`src/lib/exportarPreparacion.ts`),
 * que ya le aplicó `corregirCatalogo`: el sistema de «Right fibularis brevis» es
 * `muscular` y no el `skeletal` de origen, y de eso depende qué campos se le piden.
 *
 * Las escrituras van **sin** registro individual (`context.sinRegistro`): una
 * siembra son 2.231 filas y 2.231 líneas iguales en el registro de acciones no
 * dicen nada. Se anota una sola, con el resumen.
 */
export async function sincronizarConElAtlas(
  payload: Payload,
  catalogo: CatalogoDelAtlas,
  quien: {
    usuario?: unknown
    origen?: string
    /**
     * La petición con su transacción, para hacerlo todo dentro de ella. Las
     * pruebas de integración la usan para sembrar el atlas entero y deshacerlo
     * después sin dejar una sola fila en la base de desarrollo.
     */
    req?: Partial<PayloadRequest>
  } = {},
): Promise<ResultadoDeLaSiembra> {
  const conReq = quien.req ? { req: quien.req as PayloadRequest } : {}
  const resultado: ResultadoDeLaSiembra = {
    creadas: 0,
    yaEstaban: 0,
    actualizadas: 0,
    huerfanas: 0,
    recuperadas: 0,
    casadasPorNombre: 0,
  }
  const contexto = { sinRegistro: true }

  const existentes = await leerTodasLasEstructuras(payload, COLUMNAS_DE_LA_SIEMBRA, quien.req)
  const porAtlasId = new Map(existentes.map((fila) => [fila.atlasId, fila]))
  const idsDelAtlas = new Set(catalogo.piezas.map((p) => p.id))

  // Las huérfanas de antes y las que van a quedar huérfanas ahora, por nombre
  // original: son las candidatas a casarse con una pieza nueva del atlas.
  const sinPieza = existentes.filter((fila) => !idsDelAtlas.has(fila.atlasId))
  const huerfanasPorNombre = new Map<string, FilaDeEstructura[]>()
  for (const fila of sinPieza) {
    const lista = huerfanasPorNombre.get(fila.nombreOriginal)
    if (lista) lista.push(fila)
    else huerfanasPorNombre.set(fila.nombreOriginal, [fila])
  }
  const nuevasPorNombre = new Map<string, number>()
  for (const pieza of catalogo.piezas) {
    if (porAtlasId.has(pieza.id)) continue
    nuevasPorNombre.set(pieza.nombre, (nuevasPorNombre.get(pieza.nombre) ?? 0) + 1)
  }
  const casadas = new Set<string>()

  for (const pieza of catalogo.piezas) {
    const datos = datosDelAtlas(pieza)
    const existente = porAtlasId.get(pieza.id)

    if (existente) {
      const cambia =
        existente.nombreOriginal !== datos.nombreOriginal ||
        (existente.sistema ?? null) !== datos.sistema ||
        (existente.region ?? null) !== datos.region ||
        (existente.lado ?? null) !== datos.lado ||
        existente.huerfana === true
      if (!cambia) {
        resultado.yaEstaban += 1
        continue
      }
      await payload.update({
        collection: 'estructuras-anatomicas',
        id: existente.id,
        data: { ...datos, huerfana: false } as never,
        overrideAccess: true,
        context: contexto,
        ...conReq,
      })
      if (existente.huerfana === true) resultado.recuperadas += 1
      else resultado.actualizadas += 1
      continue
    }

    // Una pieza nueva: si tiene exactamente una huérfana con su nombre y es la
    // única pieza nueva con ese nombre, es la misma estructura con otro
    // identificador. Con más de una de cada lado no se adivina.
    const candidatas = huerfanasPorNombre.get(pieza.nombre) ?? []
    if (candidatas.length === 1 && nuevasPorNombre.get(pieza.nombre) === 1 && !casadas.has(String(candidatas[0].id))) {
      const huerfana = candidatas[0]
      await payload.update({
        collection: 'estructuras-anatomicas',
        id: huerfana.id,
        data: { ...datos, huerfana: false } as never,
        overrideAccess: true,
        context: contexto,
        ...conReq,
      })
      casadas.add(String(huerfana.id))
      resultado.casadasPorNombre += 1
      continue
    }

    try {
      await payload.create({
        collection: 'estructuras-anatomicas',
        data: { ...datos, oculta: false, huerfana: false } as never,
        overrideAccess: true,
        context: contexto,
        ...conReq,
      })
      resultado.creadas += 1
    } catch (error) {
      // Dos sincronizaciones a la vez: la otra ganó la carrera y el índice único
      // de `atlasId` paró a esta. No es un fallo, la ficha existe.
      const ya = await payload.count({
        collection: 'estructuras-anatomicas',
        where: { atlasId: { equals: pieza.id } },
        overrideAccess: true,
        ...conReq,
      })
      if (ya.totalDocs === 0) throw error
      resultado.yaEstaban += 1
    }
  }

  // Lo que ya no está en el atlas y no se casó: se marca, no se borra.
  for (const fila of sinPieza) {
    if (casadas.has(String(fila.id)) || fila.huerfana === true) continue
    await payload.update({
      collection: 'estructuras-anatomicas',
      id: fila.id,
      data: { huerfana: true } as never,
      overrideAccess: true,
      context: contexto,
    })
    resultado.huerfanas += 1
  }

  const hizoAlgo = Object.entries(resultado).some(([campo, n]) => campo !== 'yaEstaban' && n > 0)
  if (hizoAlgo) {
    await registrarAccion(payload, {
      accion: 'importacion',
      usuario: quien.usuario,
      origen: quien.origen,
      coleccion: 'estructuras-anatomicas',
      titulo: 'Sincronización del listado de estructuras con el atlas',
      detalle: resumenDeLaSiembra(resultado),
    }, quien.req)
  }
  return resultado
}

/** El resultado en una frase, para el registro y para la pantalla. */
export function resumenDeLaSiembra(r: ResultadoDeLaSiembra): string {
  const partes = [
    `${r.creadas} fichas nuevas`,
    `${r.yaEstaban} ya estaban`,
    r.actualizadas ? `${r.actualizadas} con algún dato del atlas refrescado` : null,
    r.casadasPorNombre ? `${r.casadasPorNombre} casadas con una pieza nueva por su nombre original` : null,
    r.recuperadas ? `${r.recuperadas} recuperadas` : null,
    r.huerfanas ? `${r.huerfanas} sin pieza en el atlas (no se borraron)` : null,
  ]
  return partes.filter((p): p is string => p !== null).join(' · ')
}

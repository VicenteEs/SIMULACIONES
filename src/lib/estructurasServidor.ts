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
import { nombreEnEspanol } from '@/atlas/nombres'
import {
  CAMPOS_DE_LA_FICHA,
  ETIQUETA_DEL_CAMPO,
  LARGO_MAXIMO_DEL_CAMPO,
  ladoDeLaPieza,
  normalizarTexto,
  type CampoDeLaFicha,
  type FichaCompleta,
  type FilaDeEstructura,
} from '@/lib/estructuras'
import { registrarAccion } from '@/lib/registroServidor'
import { ErrorDeValidacion } from '@/lib/validacion'

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

// ---------------------------------------------------------------- una ficha

/** Las columnas de la ficha: lo que hay que leer para enseñarla. */
const COLUMNAS_DE_LA_FICHA: Record<string, true> = {
  atlasId: true,
  nombreOriginal: true,
  sistema: true,
  region: true,
  lado: true,
  oculta: true,
  huerfana: true,
  updatedAt: true,
  ...Object.fromEntries(CAMPOS_DE_LA_FICHA.map((campo) => [campo, true as const])),
}

async function filaDeLaPieza(
  payload: Payload,
  atlasId: string,
  req?: Partial<PayloadRequest>,
): Promise<FilaDeEstructura | null> {
  const { docs } = await payload.find({
    collection: 'estructuras-anatomicas',
    where: { atlasId: { equals: atlasId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    select: COLUMNAS_DE_LA_FICHA as never,
    ...(req ? { req: req as PayloadRequest } : {}),
  })
  return (docs[0] as unknown as FilaDeEstructura | undefined) ?? null
}

/** La ficha tal como la lee la ventana de edición: los textos sin escribir, vacíos. */
function aFichaCompleta(
  atlasId: string,
  fila: FilaDeEstructura | null,
  pieza: CatalogoDelAtlas['piezas'][number] | undefined,
): FichaCompleta {
  const original = pieza?.nombre ?? fila?.nombreOriginal ?? ''
  const textos = Object.fromEntries(
    CAMPOS_DE_LA_FICHA.map((campo) => [campo, normalizarTexto(fila?.[campo])]),
  ) as Record<CampoDeLaFicha, string>
  return {
    ...textos,
    atlasId,
    nombre: nombreEnEspanol(original),
    original,
    // Del catálogo de hoy cuando la pieza existe; de lo guardado si ya no está.
    sistema: pieza?.sistema ?? fila?.sistema ?? '',
    region: pieza?.region ?? fila?.region ?? '',
    lado: pieza ? ladoDeLaPieza(pieza.nombre, pieza.region) : (fila?.lado ?? null),
    oculta: fila?.oculta === true,
    huerfana: !pieza && fila !== null,
    sembrada: fila !== null,
    actualizada: fila?.updatedAt ?? null,
  }
}

/** La ficha de una pieza, o `null` si ni el atlas ni la base la conocen. */
export async function leerFicha(
  payload: Payload,
  catalogo: CatalogoDelAtlas,
  atlasId: string,
  req?: Partial<PayloadRequest>,
): Promise<FichaCompleta | null> {
  const pieza = catalogo.piezas.find((p) => p.id === atlasId)
  const fila = await filaDeLaPieza(payload, atlasId, req)
  if (!pieza && !fila) return null
  return aFichaCompleta(atlasId, fila, pieza)
}

/** Lo que el navegador manda al guardar una ficha. */
export interface CambiosDeLaFicha {
  /** Los textos como están ahora en el formulario. */
  campos: Partial<Record<CampoDeLaFicha, unknown>>
  /** Los textos como estaban cuando se abrió la ventana: lo que permite saber qué tocó esta persona. */
  base: Partial<Record<CampoDeLaFicha, unknown>>
  oculta?: unknown
  ocultaBase?: unknown
}

export type ResultadoDeGuardar =
  | { tipo: 'guardada'; ficha: FichaCompleta; cambiados: (CampoDeLaFicha | 'oculta')[] }
  | { tipo: 'conflicto'; campos: CampoDeLaFicha[]; actual: FichaCompleta }

/** Rechaza un texto que pasa del tope de su campo, nombrándolo; no lo corta. */
export function exigirLargoDelCampo(campo: CampoDeLaFicha, texto: string): void {
  const maximo = LARGO_MAXIMO_DEL_CAMPO[campo]
  if (texto.length > maximo) {
    throw new ErrorDeValidacion(
      `«${ETIQUETA_DEL_CAMPO[campo]}» pasa de ${maximo} caracteres (tiene ${texto.length}). No se guardó nada; acórtelo.`,
    )
  }
}

/**
 * Guarda los cambios de una ficha **sin pisar lo que otra persona haya escrito
 * mientras tanto**.
 *
 * El navegador manda cómo estaban los textos al abrir la ventana (`base`) y cómo
 * están ahora (`campos`). De ahí sale qué tocó esta persona: solo eso se escribe, y
 * lo que no tocó no se vuelve a mandar a la base. Si un campo que tocó **ya no
 * vale lo que valía al abrir** —alguien más lo escribió—, no se guarda nada y se
 * devuelve el conflicto con la ficha actual: la pantalla le enseña las dos cosas y
 * le deja decidir. Dos personas que tocan campos distintos de la misma ficha no
 * se estorban. Con `forzar` se escribe igual, y lo que había queda en las
 * versiones de la ficha (veinte por pieza).
 *
 * Una pieza que todavía no tiene fila (falta sembrar) se crea aquí, con los datos
 * del atlas; una que no está ni en el atlas ni en la base no existe.
 *
 * Sin guardia, a propósito: la pone quien lo llama (`exigirEditor`).
 */
export async function guardarFicha(
  payload: Payload,
  catalogo: CatalogoDelAtlas,
  atlasId: string,
  cambios: CambiosDeLaFicha,
  opciones: { forzar?: boolean; req?: Partial<PayloadRequest> } = {},
): Promise<ResultadoDeGuardar> {
  const { req } = opciones
  const conReq = req ? { req: req as PayloadRequest } : {}
  const pieza = catalogo.piezas.find((p) => p.id === atlasId)
  const fila = await filaDeLaPieza(payload, atlasId, req)
  if (!pieza && !fila) throw new ErrorDeValidacion('Esa pieza no está en el atlas ni en el listado.')

  const nuevos: Partial<Record<CampoDeLaFicha, string>> = {}
  const conflictos: CampoDeLaFicha[] = []
  for (const campo of CAMPOS_DE_LA_FICHA) {
    if (!(campo in cambios.campos)) continue
    const ahora = normalizarTexto(cambios.campos[campo])
    const alAbrir = normalizarTexto(cambios.base?.[campo])
    if (ahora === alAbrir) continue
    exigirLargoDelCampo(campo, ahora)
    const actual = normalizarTexto(fila?.[campo])
    // Ya vale lo que esta persona quiere escribir: nada que hacer.
    if (actual === ahora) continue
    if (actual !== alAbrir) conflictos.push(campo)
    nuevos[campo] = ahora
  }

  // «No mostrar» es una casilla: si esta persona la cambió, ya vale lo que quiere o sigue como estaba al
  // abrir, así que no hay conflicto posible que enseñar —solo dos valores—.
  let oculta: boolean | undefined
  if (cambios.oculta !== undefined) {
    const ahora = cambios.oculta === true
    const alAbrir = cambios.ocultaBase === true
    if (ahora !== alAbrir && ahora !== (fila?.oculta === true)) oculta = ahora
  }

  if (conflictos.length > 0 && !opciones.forzar) {
    return { tipo: 'conflicto', campos: conflictos, actual: aFichaCompleta(atlasId, fila, pieza) }
  }

  const cambiados: (CampoDeLaFicha | 'oculta')[] = Object.keys(nuevos) as CampoDeLaFicha[]
  const datos: Record<string, unknown> = { ...nuevos }
  if (oculta !== undefined) {
    datos.oculta = oculta
    cambiados.push('oculta')
  }
  if (cambiados.length === 0) return { tipo: 'guardada', ficha: aFichaCompleta(atlasId, fila, pieza), cambiados }

  const guardada = fila
    ? await payload.update({
        collection: 'estructuras-anatomicas',
        id: fila.id,
        data: datos as never,
        overrideAccess: true,
        select: COLUMNAS_DE_LA_FICHA as never,
        ...conReq,
      })
    : await payload.create({
        collection: 'estructuras-anatomicas',
        data: { ...(pieza ? datosDelAtlas(pieza) : {}), oculta: false, huerfana: false, ...datos } as never,
        overrideAccess: true,
        select: COLUMNAS_DE_LA_FICHA as never,
        ...conReq,
      })
  return {
    tipo: 'guardada',
    ficha: aFichaCompleta(atlasId, guardada as unknown as FilaDeEstructura, pieza),
    cambiados,
  }
}

// ---------------------------------------------------------------- versiones

/** Una versión anterior de la ficha, con lo escrito en ella. */
export interface VersionDeLaFicha {
  id: string
  guardada: string
  oculta: boolean
  textos: Partial<Record<CampoDeLaFicha, string>>
}

/** La versión más reciente guardada es la ficha de hoy: no es una «anterior». */
function coincideConLaVigente(version: VersionDeLaFicha, fila: FilaDeEstructura): boolean {
  if (version.oculta !== (fila.oculta === true)) return false
  return CAMPOS_DE_LA_FICHA.every((campo) => (version.textos[campo] ?? '') === normalizarTexto(fila[campo]))
}

/**
 * Las versiones anteriores de una ficha, la más reciente primero, **sin contar la
 * vigente**. Cada guardado deja la ficha como estaba (`versions` de la colección,
 * veinte por pieza).
 */
export async function leerVersiones(
  payload: Payload,
  atlasId: string,
  req?: Partial<PayloadRequest>,
): Promise<VersionDeLaFicha[]> {
  const fila = await filaDeLaPieza(payload, atlasId, req)
  if (!fila) return []
  const { docs } = await payload.findVersions({
    collection: 'estructuras-anatomicas',
    where: { parent: { equals: fila.id } },
    sort: '-updatedAt',
    limit: 21,
    depth: 0,
    overrideAccess: true,
    ...(req ? { req: req as PayloadRequest } : {}),
  })
  return docs
    .map((v) => {
      const version = v as unknown as { id: number | string; updatedAt: string; version: Record<string, unknown> }
      const textos: Partial<Record<CampoDeLaFicha, string>> = {}
      for (const campo of CAMPOS_DE_LA_FICHA) {
        const texto = normalizarTexto(version.version[campo])
        if (texto !== '') textos[campo] = texto
      }
      return {
        id: String(version.id),
        guardada: version.updatedAt,
        oculta: version.version.oculta === true,
        textos,
      }
    })
    .filter((v) => !coincideConLaVigente(v, fila))
    .slice(0, 20)
}

/**
 * Devuelve una ficha a como estaba en una de sus versiones.
 *
 * Escribe solo lo que es de la ficha —los ocho textos y «No mostrar»—, no lo del
 * atlas: una versión vieja trae el sistema y la región de entonces, y restaurarlos
 * deshacería una corrección de clasificación. Lo que había **antes de restaurar**
 * queda en las versiones como cualquier otro guardado, así que restaurar tampoco
 * pierde nada, y se puede volver atrás.
 */
export async function restaurarVersion(
  payload: Payload,
  atlasId: string,
  versionId: string,
  req?: Partial<PayloadRequest>,
): Promise<void> {
  const fila = await filaDeLaPieza(payload, atlasId, req)
  if (!fila) throw new ErrorDeValidacion('Esa ficha no existe.')
  const versiones = await leerVersiones(payload, atlasId, req)
  const version = versiones.find((v) => v.id === versionId)
  // Solo una versión de ESTA ficha: el identificador viene del navegador.
  if (!version) throw new ErrorDeValidacion('Esa versión no es de esta ficha, o ya no se conserva.')
  const datos: Record<string, unknown> = { oculta: version.oculta }
  for (const campo of CAMPOS_DE_LA_FICHA) datos[campo] = version.textos[campo] ?? null
  await payload.update({
    collection: 'estructuras-anatomicas',
    id: fila.id,
    data: datos as never,
    overrideAccess: true,
    ...(req ? { req: req as PayloadRequest } : {}),
  })
}

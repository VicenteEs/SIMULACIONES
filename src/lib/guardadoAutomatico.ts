/**
 * Lo que el editor guarda sin que nadie pulse nada, en dos sitios.
 *
 * El dueño lo pidió así: «que se vayan guardando cada x tiempo por si a alguien
 * se le va el internet no tenga que empezar desde cero». Antes de esto, una
 * ficha con media hora de redacción vivía solo en la memoria de la pestaña: un
 * corte de luz, un navegador que se cierra por una actualización o un túnel que
 * se cae al pulsar «Guardar borrador» se la llevaban entera.
 *
 * Son dos piezas distintas, a propósito:
 *
 *  - **La copia local**, en el `localStorage` de este navegador, cada pocos
 *    segundos mientras haya cambios sin guardar. No necesita red, no toca la
 *    base, no mide nada y no cambia el estado de ninguna revisión: es la red de
 *    seguridad contra el corte. Al guardar con éxito se borra.
 *  - **El guardado automático en el servidor**, mucho más espaciado y solo
 *    cuando no puede sorprender a nadie (`puedeGuardarSolo`). Ese sí es un
 *    guardado de verdad, con su detección de choque y su medida de edición.
 *
 * Aquí está todo lo que decide, sin `window` ni React, para que se pruebe sin
 * navegador (`tests/unit/guardadoAutomatico.test.ts`). Quien lee y escribe el
 * almacén de verdad es `FormularioDocumento.tsx`.
 */

import { CLAVE_DE_FILA } from '@/admin/identidadDeBloques'
import { cambioDesde, type Marca } from '@/admin/concurrencia'

// ------------------------------------------------------------------ tiempos

/**
 * Cada cuánto se escribe la copia local mientras hay cambios.
 *
 * Cinco segundos es lo que se puede perder en el peor caso, y escribir un JSON
 * de una ficha larga —unas decenas de KB— cada cinco segundos no se nota. Más
 * a menudo habría que escribir en cada tecla, y serializar una ficha de siete
 * pestañas en cada tecla sí se notaría al escribir deprisa.
 */
export const COPIA_LOCAL_CADA_MS = 5_000

/**
 * Cada cuánto se intenta guardar en el servidor.
 *
 * Un minuto y no menos: cada guardado es una versión nueva en Payload, una
 * medida de edición si la ficha está en revisión y un `updatedAt` que mueve la
 * marca de choque de cualquiera que tenga la ficha abierta. Con la copia local
 * cubriendo los segundos, el servidor solo tiene que cubrir lo que la copia no
 * puede: el disco del computador que se pierde, o seguir en otro.
 */
export const GUARDADO_AUTOMATICO_CADA_MS = 60_000

/**
 * Cuánto vive una copia local que nadie recuperó.
 *
 * Sin techo, la copia de una ficha que se abandonó a medias seguiría
 * ofreciéndose meses después, sobre una ficha que ya habrá cambiado tres
 * veces: recuperarla entonces es más peligroso que útil. Dos semanas cubren
 * unas vacaciones y unas guardias seguidas.
 */
export const VIDA_DE_LA_COPIA_MS = 14 * 24 * 60 * 60 * 1000

// ------------------------------------------------------------------ copia local

/** Lo que se escribe en el navegador por cada ficha con cambios sin guardar. */
export interface CopiaLocal {
  /** Para poder cambiar la forma mañana sin leer como buena una copia de hoy. */
  version: 1
  /** Cuándo se escribió, en milisegundos. */
  guardadaEn: number
  /**
   * La versión del servidor sobre la que se estaba escribiendo: la `marca` de
   * `src/admin/concurrencia.ts` que el editor tenía en ese momento. Es lo que
   * permite decir «otra persona guardó después» al recuperarla y, sobre todo,
   * que el guardado posterior choque como debe en vez de pisar lo ajeno.
   */
  marca: Marca
  valores: Record<string, unknown>
}

/**
 * La clave en el almacén, una por persona, colección y ficha.
 *
 * La persona va dentro porque el navegador puede ser compartido —el
 * computador de la sala de residentes— y la copia de una no debe ofrecérsele a
 * otra que entre después con su cuenta. Una ficha nueva no tiene `id` todavía:
 * se apunta como «nuevo» de su colección, y solo hay una por persona y
 * colección, que es lo que hay en pantalla a la vez.
 */
export const claveDeCopia = (usuarioId: string, coleccion: string, id: string | null): string =>
  `traumahub:copia:${usuarioId}:${coleccion}:${id ?? 'nuevo'}`

export const serializarCopia = (copia: CopiaLocal): string => JSON.stringify(copia)

/**
 * Lee una copia del almacén, o `null` si no hay nada que se pueda usar.
 *
 * Todo lo que no tenga la forma exacta se descarta en vez de cargarse a
 * medias: lo que se recupera va derecho al formulario, y un objeto torcido ahí
 * es una ficha que se rompe al pintar. También se descarta la copia caducada
 * (`VIDA_DE_LA_COPIA_MS`).
 */
export function leerCopia(texto: string | null, ahora: number): CopiaLocal | null {
  if (!texto) return null
  let crudo: unknown
  try {
    crudo = JSON.parse(texto)
  } catch {
    return null
  }
  if (!crudo || typeof crudo !== 'object') return null
  const c = crudo as Record<string, unknown>
  if (c.version !== 1) return null
  if (typeof c.guardadaEn !== 'number' || !Number.isFinite(c.guardadaEn)) return null
  if (c.marca !== null && typeof c.marca !== 'string') return null
  if (!c.valores || typeof c.valores !== 'object' || Array.isArray(c.valores)) return null
  if (ahora - c.guardadaEn > VIDA_DE_LA_COPIA_MS) return null
  return {
    version: 1,
    guardadaEn: c.guardadaEn,
    marca: c.marca as Marca,
    valores: c.valores as Record<string, unknown>,
  }
}

/** Qué hacer con una copia encontrada al abrir la ficha. */
export type DecisionDeRecuperacion =
  | { tipo: 'nada' }
  /** La copia no aporta nada —dice lo mismo que el servidor—: se borra sin preguntar. */
  | { tipo: 'descartar' }
  /** Se ofrece. `otraVersion` es que el servidor se guardó después de la copia. */
  | { tipo: 'ofrecer'; copia: CopiaLocal; otraVersion: boolean }

/**
 * ¿Se ofrece recuperar esta copia?
 *
 * La copia solo existe mientras hubo cambios sin guardar —el guardado bueno la
 * borra—, así que encontrarla ya dice que algo no llegó. Lo que queda por
 * mirar es si de verdad trae algo distinto de lo guardado: puede que lo
 * escrito llegara por otro camino (la misma ficha guardada desde otra pestaña,
 * o un guardado que volvió bien justo cuando se cerraba la pestaña y no le dio
 * tiempo a borrarla). Ofrecer recuperar una ficha idéntica a la que hay en
 * pantalla solo enseña a pulsar «Descartar» sin leer.
 *
 * `otraVersion` compara marcas con la misma regla que el choque
 * (`cambioDesde`): si la base cambió desde la marca de la copia, alguien —otra
 * persona, u otra pestaña— guardó encima después, y la banda tiene que decirlo
 * antes de que se recupere.
 */
export function decidirRecuperacion(
  copia: CopiaLocal | null,
  servidor: { marca: Marca; valores: Record<string, unknown> },
): DecisionDeRecuperacion {
  if (!copia) return { tipo: 'nada' }
  if (mismoContenido(copia.valores, servidor.valores)) return { tipo: 'descartar' }
  const otraVersion = copia.marca !== null && cambioDesde(copia.marca, servidor.marca)
  return { tipo: 'ofrecer', copia, otraVersion }
}

/**
 * ¿Dicen lo mismo dos documentos?
 *
 * Por JSON con las claves ordenadas: el servidor y el formulario no escriben
 * los campos en el mismo orden, y lo que importa es el contenido. Las claves de
 * cliente de las filas (`CLAVE_DE_FILA`) se ignoran: son de la pantalla, no del
 * documento, y una fila recién creada las lleva mientras el servidor no.
 */
export function mismoContenido(a: unknown, b: unknown): boolean {
  return JSON.stringify(ordenado(a)) === JSON.stringify(ordenado(b))
}

function ordenado(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenado)
  if (valor && typeof valor === 'object') {
    const salida: Record<string, unknown> = {}
    for (const clave of Object.keys(valor).sort()) {
      if (clave === CLAVE_DE_FILA) continue
      const v = (valor as Record<string, unknown>)[clave]
      if (v === undefined) continue
      salida[clave] = ordenado(v)
    }
    return salida
  }
  return valor
}

/**
 * Cambia las claves de cliente de las filas por otras nuevas.
 *
 * Las claves de una fila sin guardar salen de un contador del módulo
 * (`nuevaClave`, en `src/admin/identidadDeBloques.ts`) que vuelve a empezar en
 * cada carga de la página. Una copia escrita antes de recargar trae `c1`, `c2`…
 * y la primera fila que se agregue después de recuperarla también se llamaría
 * `c1`: dos filas con la misma clave, que React confunde entre sí y que el
 * apunte de una subida (`escritorPorClave`) podría escribir en la que no es.
 * Se renuevan al recuperar, con el contador de esta carga.
 */
export function renovarClaves<T>(valor: T, nueva: () => string): T {
  if (Array.isArray(valor)) return valor.map((v) => renovarClaves(v, nueva)) as T
  if (valor && typeof valor === 'object') {
    const salida: Record<string, unknown> = {}
    for (const [clave, v] of Object.entries(valor)) {
      salida[clave] = clave === CLAVE_DE_FILA && typeof v === 'string' ? nueva() : renovarClaves(v, nueva)
    }
    return salida as T
  }
  return valor
}

// ------------------------------------------------------------------ servidor

/** Todo lo que hace falta saber para decidir un guardado automático. */
export interface EstadoDelEditor {
  /** La ficha ya existe en la base. Una nueva no se crea sola: ver abajo. */
  existe: boolean
  /** La colección tiene borrador y publicación (`esquema.versionada`). */
  versionada: boolean
  /** Lo que hay en la base está publicado. */
  publicada: boolean
  sucio: boolean
  conectado: boolean
  hayChoque: boolean
  guardando: boolean
  /** El estado de la revisión, si la ficha está en revisión (D-142). */
  estadoDeRevision: string | null
  /**
   * El guardado automático anterior falló por algo que no es la red —un campo
   * que el servidor rechaza— y desde entonces no se ha tocado nada. Repetir el
   * mismo envío cada minuto daría el mismo rechazo cada minuto.
   */
  falloSinCambiosDesde: boolean
}

/** Por qué no se guarda solo, en palabras para el indicador de la barra. */
export type MotivoParaNoGuardarSolo =
  | 'sin-cambios'
  | 'nueva'
  | 'no-versionada'
  | 'publicada'
  | 'lista'
  | 'sin-conexion'
  | 'choque'
  | 'guardando'
  | 'rechazado'

/**
 * ¿Toca guardar en el servidor sin que nadie lo pida? `null` es que sí.
 *
 * Cada «no» tiene su porqué, y todos son el mismo: un guardado que nadie pidió
 * no puede cambiar nada que la persona no habría cambiado al pulsar el botón
 * por su cuenta.
 *
 *  - **Ficha nueva**: guardarla la crea, aparece en el listado de todos y la
 *    pantalla salta a su dirección definitiva. Eso es una decisión, no una
 *    precaución. La copia local la cubre igual.
 *  - **Colección sin borrador** (medios, catálogos): allí guardar es publicar,
 *    lo que se escribe se ve al instante en la plataforma.
 *  - **Ficha publicada**: un borrador encima de una publicada cambia lo que
 *    queda pendiente de publicar, y en una ficha en revisión la devuelve a «en
 *    revisión» (`anotarGuardado`). Solo copia local, y el indicador lo dice.
 *  - **Revisión «lista»**: guardarla la devuelve a «en revisión» y borra la
 *    firma de quien la validó. Eso tiene que decidirlo una persona. Lo mismo
 *    la revisión «publicada», que por el mismo camino se reabre.
 *  - **Sin conexión, con un choque abierto o con un guardado en curso**: no
 *    llegaría, chocaría otra vez o se cruzaría con el que ya viaja.
 */
export function motivoParaNoGuardarSolo(e: EstadoDelEditor): MotivoParaNoGuardarSolo | null {
  if (!e.sucio) return 'sin-cambios'
  if (!e.existe) return 'nueva'
  if (!e.versionada) return 'no-versionada'
  if (e.publicada) return 'publicada'
  if (e.estadoDeRevision === 'lista' || e.estadoDeRevision === 'publicada') return 'lista'
  if (!e.conectado) return 'sin-conexion'
  if (e.hayChoque) return 'choque'
  if (e.guardando) return 'guardando'
  if (e.falloSinCambiosDesde) return 'rechazado'
  return null
}

/**
 * ¿Parece un corte de red lo que hizo fallar un guardado?
 *
 * Una acción de servidor que no llega no devuelve una `Respuesta`: lanza, y
 * lo que lanza depende del navegador —«Failed to fetch» en Chrome,
 * «NetworkError when attempting to fetch resource» en Firefox, «Load failed»
 * en Safari—. `navigator.onLine` falso lo confirma, pero no al revés: con el
 * wifi conectado y el túnel caído sigue diciendo que hay red.
 */
export function pareceCorteDeRed(fallo: unknown, enLinea: boolean): boolean {
  if (!enLinea) return true
  const texto = fallo instanceof Error ? fallo.message : String(fallo ?? '')
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(texto)
}

// ------------------------------------------------------------------ tiempo

/** «hace 12 s», «hace 3 min», «hace 2 h»: lo que lleva guardada la ficha. */
export function haceCuanto(desde: number, ahora: number): string {
  const segundos = Math.max(0, Math.round((ahora - desde) / 1000))
  if (segundos < 5) return 'ahora mismo'
  if (segundos < 60) return `hace ${segundos} s`
  const minutos = Math.floor(segundos / 60)
  if (minutos < 60) return `hace ${minutos} min`
  return `hace ${Math.floor(minutos / 60)} h`
}

/** La hora en que pasó algo, como se lee en Chile: «14:05». */
export const horaDe = (instante: number): string =>
  new Date(instante).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })

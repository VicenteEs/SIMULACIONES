/**
 * Lo que la consola cuenta del tiempo y de los rayos de un recorrido (P-012 E5): el reloj del procedimiento, el del
 * manguito y la exposición del arco en C.
 *
 * En pabellón hay un reloj en la pared y otro en el manguito, y el arco lleva la cuenta de lo que ha disparado. La
 * consola no tenía ninguno de los tres: un caso se podía hacer con el manguito inflado tres horas o con cien disparos, y
 * nada lo decía ni lo dejaba escrito. Aquí viven las reglas, sin React ni three, para que las usen igual la consola, la
 * acción que guarda y las pruebas.
 *
 * **Tiempo de verdad, no simulado.** Los relojes cuentan lo que tarda quien opera, como el de la pared. Un caso de práctica
 * dura media hora y no llega a los 90 minutos del manguito; uno que se deja a medias y se sigue otro día sí puede, porque
 * lo contado se guarda con el avance y sigue desde ahí. No se cuenta el tiempo con la consola cerrada: no se estaba
 * operando.
 */

/** Los rayos que lleva el caso: los disparos y los segundos de vídeo, desde que empezó. */
export interface ExposicionDelCaso {
  disparos: number
  segundosDeVideo: number
}

export const SIN_EXPOSICION: ExposicionDelCaso = { disparos: 0, segundosDeVideo: 0 }

/** Un reloj que se para y se reanuda: lo contado hasta la última parada y, si está en marcha, desde cuándo. */
export interface Reloj {
  /** Segundos contados antes de `desde`. */
  acumulado: number
  /** Cuándo se puso en marcha (milisegundos de `Date.now()`), o `null` si está parado. */
  desde: number | null
}

export const RELOJ_PARADO: Reloj = { acumulado: 0, desde: null }

/** Los segundos enteros que marca el reloj a la hora `ahora`. */
export function segundosDelReloj(reloj: Reloj, ahora: number): number {
  const corriendo = reloj.desde === null ? 0 : Math.max(0, ahora - reloj.desde) / 1000
  return Math.floor(reloj.acumulado + corriendo)
}

/** El reloj en marcha desde `ahora`, o como estaba si ya corría. */
export const ponerEnMarcha = (reloj: Reloj, ahora: number): Reloj => (reloj.desde === null ? { ...reloj, desde: ahora } : reloj)

/**
 * El reloj parado en `ahora`, con lo que corrió sumado. Sin redondear: los segundos enteros se sacan al leerlo
 * (`segundosDelReloj`), y redondear en cada parada perdería hasta un segundo cada vez.
 */
export const parar = (reloj: Reloj, ahora: number): Reloj =>
  reloj.desde === null ? reloj : { acumulado: reloj.acumulado + Math.max(0, ahora - reloj.desde) / 1000, desde: null }

/** «0:07» para menos de una hora, «1:05:09» desde ahí: como un reloj de pabellón, sin unidades que leer. */
export function relojEnTexto(segundos: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(segundos) ? segundos : 0))
  const horas = Math.floor(s / 3600)
  const minutos = Math.floor((s % 3600) / 60)
  const resto = s % 60
  const dos = (n: number) => String(n).padStart(2, '0')
  return horas > 0 ? `${horas}:${dos(minutos)}:${dos(resto)}` : `${minutos}:${dos(resto)}`
}

/** El mismo tiempo dicho, para el lector de pantalla y los avisos: «1 h 5 min», «12 min», «40 s». */
export function relojEnPalabras(segundos: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(segundos) ? segundos : 0))
  const horas = Math.floor(s / 3600)
  const minutos = Math.floor((s % 3600) / 60)
  if (horas > 0) return minutos > 0 ? `${horas} h ${minutos} min` : `${horas} h`
  if (minutos > 0) return `${minutos} min`
  return `${s} s`
}

// ------------------------------------------------------------------------------------------------------------ manguito

/**
 * El manguito de isquemia del caso, como lo escribe el editor. Sin `usa`, el caso no lo lleva y la consola no enseña su
 * reloj.
 */
export interface ManguitoDelCaso {
  /** Presión de inflado, en mmHg: se enseña junto al reloj, como en el aparato. */
  presion: number
  /** Minutos seguidos que no se deben pasar. */
  tope: number
}

/** Lo habitual en el miembro inferior (manguito en el muslo): 300 mmHg y dos horas seguidas como mucho. */
export const PRESION_DEL_MANGUITO_POR_OMISION = 300
export const TOPE_DEL_MANGUITO_POR_OMISION = 120

/**
 * Cuándo avisa el reloj del manguito, en minutos: media hora antes del tope —a los 90 de 120, que es lo que se hace en el
 * miembro inferior—, y nunca antes de la mitad del tope, para que un tope corto no avise casi al inflar.
 */
export const avisoDelManguito = (topeMinutos: number): number => Math.max(topeMinutos - 30, Math.round(topeMinutos / 2))

/** Cómo va el período de isquemia de ahora: en tiempo, en el aviso o pasado del tope. */
export type EstadoDelManguito = 'en-tiempo' | 'aviso' | 'pasado'

export function estadoDelManguito(segundosSeguidos: number, topeMinutos: number): EstadoDelManguito {
  if (segundosSeguidos >= topeMinutos * 60) return 'pasado'
  if (segundosSeguidos >= avisoDelManguito(topeMinutos) * 60) return 'aviso'
  return 'en-tiempo'
}

/**
 * El manguito del caso tal como llega del documento, o `null` si no lo usa. Una presión o un tope rotos o fuera de lo
 * razonable toman el valor por omisión: un caso mal escrito no deja al residente sin reloj, ni con uno que avise al minuto.
 */
export function manguitoDelDocumento(usa: unknown, presion: unknown, tope: unknown): ManguitoDelCaso | null {
  if (usa !== true) return null
  const numero = (v: unknown, min: number, max: number, porOmision: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : porOmision
  return {
    presion: numero(presion, 50, 500, PRESION_DEL_MANGUITO_POR_OMISION),
    tope: numero(tope, 10, 240, TOPE_DEL_MANGUITO_POR_OMISION),
  }
}

/**
 * El manguito mientras se opera: lo inflado en los períodos ya soltados y el período de ahora.
 *
 * Hacen falta las dos cuentas porque miden cosas distintas. El tope es de **un** período seguido: soltar y volver a
 * inflar reparte la isquemia, y es lo que se hace cuando un caso se alarga. El total es lo que el docente quiere ver al
 * lado. Con una sola cuenta, quien suelta a los 100 minutos y vuelve a inflar se vería pasado del tope sin estarlo.
 */
export interface ManguitoEnLaConsola {
  /** Segundos inflado en los períodos que ya se soltaron. */
  soltados: number
  /** El más largo de esos períodos, en segundos. */
  masLargo: number
  /** El período de ahora; `null` con el manguito desinflado. */
  periodo: Reloj | null
}

export const MANGUITO_DESINFLADO: ManguitoEnLaConsola = { soltados: 0, masLargo: 0, periodo: null }

/** Inflado desde `ahora`: un período nuevo, que empieza en cero. Si ya estaba inflado, se queda como estaba. */
export const inflar = (m: ManguitoEnLaConsola, ahora: number): ManguitoEnLaConsola =>
  m.periodo ? m : { ...m, periodo: { acumulado: 0, desde: ahora } }

/** Soltado en `ahora`: el período se suma a lo inflado y cuenta para el más largo. */
export function desinflar(m: ManguitoEnLaConsola, ahora: number): ManguitoEnLaConsola {
  if (!m.periodo) return m
  const segundos = segundosDelReloj(m.periodo, ahora)
  return { soltados: m.soltados + segundos, masLargo: Math.max(m.masLargo, segundos), periodo: null }
}

/**
 * El período de ahora parado o puesto en marcha, sin soltar el manguito. Al terminar el caso, el reloj se para con el
 * manguito como esté: el caso acabó, y lo que pase después no es tiempo de isquemia de este recorrido.
 */
export const pararElManguito = (m: ManguitoEnLaConsola, ahora: number): ManguitoEnLaConsola =>
  m.periodo ? { ...m, periodo: parar(m.periodo, ahora) } : m
export const reanudarElManguito = (m: ManguitoEnLaConsola, ahora: number): ManguitoEnLaConsola =>
  m.periodo ? { ...m, periodo: ponerEnMarcha(m.periodo, ahora) } : m

/** Lo que marca a la hora `ahora`: el período de ahora (cero si está desinflado), lo inflado en total y el período más largo. */
export function lecturaDelManguito(m: ManguitoEnLaConsola, ahora: number) {
  const periodo = m.periodo ? segundosDelReloj(m.periodo, ahora) : 0
  return { inflado: m.periodo !== null, periodo, total: m.soltados + periodo, masLargo: Math.max(m.masLargo, periodo) }
}

// ------------------------------------------------------------------------------------------------- lo que se guarda

/**
 * Lo contado en un recorrido, como se guarda con el resultado (para el docente) y con el avance (para seguir otro día).
 * Todo en segundos o en cuentas enteras; lo que falta no se contó.
 *
 * Es una sola forma para los dos sitios a propósito: con dos, la del avance y la del resultado acabarían diciendo cosas
 * distintas del mismo recorrido. Por eso lleva `manguitoInflado`, que al docente le dice con qué terminó y a la consola
 * le basta para seguir el período donde se quedó.
 */
export interface TiemposDelRecorrido {
  /** Desde la primera incisión. */
  procedimiento?: number
  /** Con el manguito inflado, sumando cada vez. */
  manguito?: number
  /** El período más largo con el manguito inflado sin soltarlo: el que se compara con el tope. */
  manguitoSeguido?: number
  /** Lo que lleva el período de ahora, si el manguito seguía inflado; falta si estaba desinflado. */
  manguitoInflado?: number
  /**
   * El tope con que se juzgó, en **minutos**. Se guarda con el recorrido por lo mismo que `puntajeMaximo`: el editor
   * puede cambiar el del caso mañana, y entonces «pasó del tope» dejaría de poder leerse en los recorridos de hoy.
   */
  topeDelManguito?: number
  /** Disparos del arco en C. */
  disparos?: number
  /** Segundos de escopia en vídeo. */
  escopia?: number
}

const CLAVES_DE_LOS_TIEMPOS = [
  'procedimiento',
  'manguito',
  'manguitoSeguido',
  'manguitoInflado',
  'topeDelManguito',
  'disparos',
  'escopia',
] as const

/**
 * Lo que marcan los relojes y el arco a la hora `ahora`, listo para guardar. El reloj del procedimiento solo cuenta si
 * llegó a ponerse en marcha (hubo incisión), y el manguito solo si el caso lo usa. Los disparos y el vídeo van siempre:
 * cero disparos también es una cuenta, y le dice al docente que el caso se hizo sin mirar.
 */
export function tiemposDeAhora(
  procedimiento: Reloj,
  manguito: ManguitoEnLaConsola | null,
  datosDelManguito: ManguitoDelCaso | null,
  exposicion: ExposicionDelCaso,
  ahora: number,
): TiemposDelRecorrido {
  const tiempos: TiemposDelRecorrido = { disparos: exposicion.disparos, escopia: exposicion.segundosDeVideo }
  if (procedimiento.desde !== null || procedimiento.acumulado > 0) tiempos.procedimiento = segundosDelReloj(procedimiento, ahora)
  if (manguito && datosDelManguito) {
    const lectura = lecturaDelManguito(manguito, ahora)
    tiempos.manguito = lectura.total
    tiempos.manguitoSeguido = lectura.masLargo
    if (lectura.inflado) tiempos.manguitoInflado = lectura.periodo
    tiempos.topeDelManguito = datosDelManguito.tope
  }
  return tiempos
}

/**
 * Los relojes devueltos desde lo guardado con el avance, **parados**: la consola los pone en marcha al seguir, que es
 * cuando se vuelve a operar. Lo que no cuadre (un período inflado más largo que el total) se recorta en vez de dar
 * cuentas negativas.
 */
export function relojesGuardados(tiempos: TiemposDelRecorrido | undefined): {
  procedimiento: Reloj
  manguito: ManguitoEnLaConsola
  exposicion: ExposicionDelCaso
} {
  const t = tiempos ?? {}
  const inflado = t.manguitoInflado
  return {
    procedimiento: { acumulado: t.procedimiento ?? 0, desde: null },
    manguito: {
      soltados: Math.max(0, (t.manguito ?? 0) - (inflado ?? 0)),
      // Si el período de ahora es el más largo, el más largo de los soltados no hace falta: el de ahora solo puede crecer.
      masLargo: t.manguitoSeguido ?? 0,
      periodo: inflado === undefined ? null : { acumulado: inflado, desde: null },
    },
    exposicion: { disparos: t.disparos ?? 0, segundosDeVideo: t.escopia ?? 0 },
  }
}

/** Una semana: más que eso no es un recorrido, es un número roto. */
const TOPE_DE_UNA_CUENTA = 7 * 24 * 3600

/**
 * Los tiempos que llegan del navegador, rehechos campo a campo. Lo que no sea un entero entre cero y una semana se queda
 * fuera, y no tira el resto: un reloj mal contado no es motivo para perder el resultado del caso.
 */
export function tiemposValidos(valor: unknown): TiemposDelRecorrido {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
  const v = valor as Record<string, unknown>
  const tiempos: TiemposDelRecorrido = {}
  for (const clave of CLAVES_DE_LOS_TIEMPOS) {
    const n = v[clave]
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= TOPE_DE_UNA_CUENTA) tiempos[clave] = n
  }
  return tiempos
}

/** `true` si no hay nada contado: entonces la fila guarda `null` y no un objeto vacío. */
export const sinTiempos = (t: TiemposDelRecorrido): boolean => CLAVES_DE_LOS_TIEMPOS.every((c) => t[c] === undefined)

/**
 * Lo contado, dicho para el residente al terminar y para su recorrido anterior: «42 min desde la incisión · manguito
 * 1 h 5 min (el período más largo, 1 h 5 min) · 14 disparos y 20 s de vídeo». Vacío si no hay nada que decir.
 */
export function tiemposEnPalabras(t: TiemposDelRecorrido): string {
  const partes: string[] = []
  if (t.procedimiento !== undefined) partes.push(`${relojEnPalabras(t.procedimiento)} desde la incisión`)
  if (t.manguito !== undefined) {
    const seguido = t.manguitoSeguido ?? t.manguito
    const pasado = t.topeDelManguito !== undefined && seguido >= t.topeDelManguito * 60
    partes.push(
      `manguito ${relojEnPalabras(t.manguito)}` +
        (seguido !== t.manguito ? ` (el período más largo, ${relojEnPalabras(seguido)})` : '') +
        (pasado ? `, pasado del tope de ${t.topeDelManguito} min` : ''),
    )
  }
  if (t.disparos !== undefined) {
    const disparos = `${t.disparos} ${t.disparos === 1 ? 'disparo' : 'disparos'}`
    partes.push(t.escopia ? `${disparos} y ${relojEnPalabras(t.escopia)} de vídeo` : disparos)
  }
  return partes.join(' · ')
}

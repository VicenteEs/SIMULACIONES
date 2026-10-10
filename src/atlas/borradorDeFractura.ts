/**
 * Lo que el asistente «Fractura» lleva a medias mientras se elige (D-161, E4).
 *
 * El borrador vive en el taller y no en la pestaña: las pestañas del panel solo
 * montan la abierta, y quien pasa a «Pieza» a mover algo no debe volver y
 * encontrar el asistente en blanco. Aquí está lo que no depende de React: qué
 * trae cada paso y cómo un borrador pasa a ser una receta.
 *
 * Sin `three`.
 */

import type { EjeDelHueso } from '@/lib/planoDeCorte'
import {
  grupoAO,
  gruposDe,
  tiposDe,
  type GrupoAO,
  type HuesoAO,
  type SegmentoAO,
  type TipoAO,
} from './clasificacionAO'
import {
  EXTENSION_MAXIMA,
  EXTENSION_MINIMA,
  INCLINACION_OBLICUA_MINIMA,
  INCLINACION_TRANSVERSA_MAXIMA,
  ajustarAlSegmento,
  limitesDelCentro,
  normalizarReceta,
  recetaPorOmision,
} from './patronesDeFractura'
import type { RecetaDeFractura } from './formato'
import { INCLINACION_MAXIMA } from '@/lib/planoDeCorte'
import type { SegmentosDelHueso } from './segmentosAO'

export interface BorradorDeFractura {
  segmento: SegmentoAO | null
  tipo: TipoAO | null
  grupo: GrupoAO | null
  /** `null`: lo que propone el grupo. */
  centro: number | null
  extension: number | null
  inclinacion: number | null
  giro: number
  semilla: number
}

export const BORRADOR_VACIO: BorradorDeFractura = {
  segmento: null,
  tipo: null,
  grupo: null,
  centro: null,
  extension: null,
  inclinacion: null,
  giro: 0,
  semilla: 1,
}

/** Lo medido de un hueso, que es lo que hace falta para colocar una porción. */
export interface MedidaDelHueso {
  eje: EjeDelHueso
  segmentos: SegmentosDelHueso
}

/** Elegir un segmento borra lo que dependía del anterior: el tipo, el grupo y la porción. */
export function conSegmento(b: BorradorDeFractura, segmento: SegmentoAO): BorradorDeFractura {
  return { ...BORRADOR_VACIO, segmento, giro: b.giro, semilla: b.semilla }
}

/** Elegir un tipo borra el grupo y la porción; si el tipo solo tiene un grupo disponible, lo elige. */
export function conTipo(b: BorradorDeFractura, tipo: TipoAO): BorradorDeFractura {
  const base = { ...BORRADOR_VACIO, segmento: b.segmento, tipo, giro: b.giro, semilla: b.semilla }
  const disponibles = b.segmento ? gruposDe(b.segmento, tipo).filter((g) => g.disponible) : []
  return disponibles.length === 1 ? { ...base, grupo: disponibles[0].id } : base
}

/** Elegir un grupo borra la porción: cada grupo propone la suya. */
export function conGrupo(b: BorradorDeFractura, grupo: GrupoAO): BorradorDeFractura {
  const g = grupoAO(grupo)
  return {
    ...b,
    grupo: g?.disponible ? grupo : null,
    tipo: g?.tipo ?? b.tipo,
    centro: null,
    extension: null,
    inclinacion: null,
  }
}

/** El borrador de una receta ya guardada: para volver a editarla. */
export function borradorDeLaReceta(receta: RecetaDeFractura): BorradorDeFractura {
  return {
    segmento: receta.segmento,
    tipo: grupoAO(receta.grupo)?.tipo ?? null,
    grupo: receta.grupo,
    centro: receta.porcion.centro,
    extension: receta.porcion.extension,
    inclinacion: receta.inclinacion,
    giro: receta.giro,
    semilla: receta.semilla,
  }
}

/**
 * La receta que sale de un borrador, o `null` si falta algo por elegir.
 *
 * El centro se lleva al segmento —una cuña no se sale del extremo en el que se
 * pidió— y todo pasa por `normalizarReceta`, la misma barrera que el servidor: lo
 * que el asistente enseña es lo que se guardaría.
 */
export function recetaDelBorrador(
  pieza: string,
  hueso: HuesoAO,
  b: BorradorDeFractura,
  medida: MedidaDelHueso,
): RecetaDeFractura | null {
  if (!b.segmento || !b.grupo) return null
  const g = grupoAO(b.grupo)
  if (!g?.disponible || !g.segmentos.includes(b.segmento)) return null
  const base = recetaPorOmision(pieza, hueso, b.segmento, b.grupo, medida)
  const receta: RecetaDeFractura = {
    ...base,
    porcion: { centro: b.centro ?? base.porcion.centro, extension: b.extension ?? base.porcion.extension },
    inclinacion: b.inclinacion ?? base.inclinacion,
    giro: b.giro,
    semilla: b.semilla,
  }
  return normalizarReceta(ajustarAlSegmento(receta, medida.eje, medida.segmentos))
}

// ----------------------------------------------------- qué mandos trae cada grupo

export interface MandosDelGrupo {
  /** Se mueve el centro de la porción. */
  centro: boolean
  /** Cuánto ocupa: la altura de la cuña o del segmento. */
  extension: boolean
  /** Entre qué grados se inclina el corte, o `null` si no se inclina. */
  inclinacion: { min: number; max: number } | null
  /** De qué cara sube el corte. */
  cara: boolean
  /** Hay un detalle que cambia con la semilla: «otra variante». */
  variante: boolean
}

/** Los mandos de cada patrón: lo que el asistente enseña en el paso de la porción. */
export function mandosDelGrupo(grupo: GrupoAO): MandosDelGrupo {
  switch (grupoAO(grupo)?.patron) {
    case 'transversa':
      return { centro: true, extension: false, inclinacion: { min: 0, max: INCLINACION_TRANSVERSA_MAXIMA }, cara: false, variante: false }
    case 'oblicua':
      return { centro: true, extension: false, inclinacion: { min: INCLINACION_OBLICUA_MINIMA, max: INCLINACION_MAXIMA }, cara: true, variante: false }
    case 'cuna-integra':
      return { centro: true, extension: true, inclinacion: null, cara: true, variante: false }
    case 'cuna-fragmentada':
      return { centro: true, extension: true, inclinacion: null, cara: true, variante: true }
    case 'segmentaria-integra':
      return { centro: true, extension: true, inclinacion: { min: 0, max: INCLINACION_TRANSVERSA_MAXIMA }, cara: false, variante: false }
    case 'segmentaria-fragmentada':
      return { centro: true, extension: true, inclinacion: { min: 0, max: INCLINACION_TRANSVERSA_MAXIMA }, cara: true, variante: true }
    case 'conminuta-focal':
      return { centro: true, extension: true, inclinacion: { min: 0, max: INCLINACION_TRANSVERSA_MAXIMA }, cara: true, variante: true }
    default:
      return { centro: false, extension: false, inclinacion: null, cara: false, variante: false }
  }
}

/** Los límites del mando del centro, ya con la extensión que se lleva. */
export function limitesDelMandoDelCentro(
  medida: MedidaDelHueso,
  segmento: SegmentoAO,
  grupo: GrupoAO,
  extension: number,
): { min: number; max: number } {
  return limitesDelCentro(medida.eje, medida.segmentos, segmento, mandosDelGrupo(grupo).extension ? extension : 0)
}

export const LIMITES_DE_LA_EXTENSION = { min: EXTENSION_MINIMA, max: EXTENSION_MAXIMA } as const

/** Los pasos del asistente que ya se pueden dar, según lo elegido. Para pintar y para probar. */
export function pasoActual(b: BorradorDeFractura): 2 | 3 | 4 | 5 {
  if (!b.segmento) return 2
  if (!b.tipo || tiposDe(b.segmento).every((t) => t.id !== b.tipo)) return 3
  if (!b.grupo) return 4
  return 5
}

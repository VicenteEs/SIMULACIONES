/**
 * Los tornillos por tipo, sus diámetros y la secuencia brocar · medir · atornillar (P-004 E9, pedidos 11 y 12 de Cristóbal).
 *
 * «Los tornillos, separados por tipo (bloqueado, cortical, esponjosa, rosca parcial…); al elegir uno, escribir el diámetro de un
 * listado y luego el largo en números.» «La secuencia brocar–medir–poner tornillo: que se despliegue el instrumento que viene
 * después, porque siempre es ese orden.» Aquí está lo que se puede decidir sin pantalla: de qué tipo es un tornillo, qué diámetros
 * ofrece cada tipo, qué viene después en la secuencia y qué instrumento de la bandeja corresponde a cada tiempo.
 *
 * Es puro y sin three: lo lee la consola y se prueba con números.
 */

import { calibreDeBrocaParaElTornillo, type ClaseDelTornillo, type EstadoDelAgujero } from './fijacion'

export type TipoDeTornillo = 'cortical' | 'esponjosa' | 'rosca-parcial' | 'bloqueado' | 'canulado' | 'otro'

export interface DefinicionDeTipo {
  tipo: TipoDeTornillo
  etiqueta: string
  /** Los diámetros que se ofrecen, en mm. */
  diametrosMm: readonly number[]
  /** Cuánto mide la parte roscada, en mm, si el tipo es de rosca parcial (lo usa la compresión, E10). */
  roscaMm?: number
}

/** El orden es el de los subgrupos de la bandeja. «Otro» es lo que no se reconoce y va al final. */
export const TIPOS_DE_TORNILLO: readonly DefinicionDeTipo[] = [
  { tipo: 'cortical', etiqueta: 'Corticales', diametrosMm: [2.7, 3.5, 4.5] },
  { tipo: 'esponjosa', etiqueta: 'De esponjosa', diametrosMm: [4.0, 6.5] },
  { tipo: 'rosca-parcial', etiqueta: 'De rosca parcial', diametrosMm: [4.0, 6.5], roscaMm: 16 },
  { tipo: 'bloqueado', etiqueta: 'Bloqueados', diametrosMm: [2.4, 3.5, 5.0] },
  { tipo: 'canulado', etiqueta: 'Canulados', diametrosMm: [3.5, 4.0, 7.0] },
  { tipo: 'otro', etiqueta: 'Otros', diametrosMm: [2.7, 3.5, 4.0, 4.5, 5.0, 6.5] },
]

export const TIPOS_VALIDOS: readonly string[] = TIPOS_DE_TORNILLO.map((t) => t.tipo)

/** Lo que se acepta como tipo declarado: uno de la lista o nada. */
export function tipoDeTornilloValido(valor: unknown): TipoDeTornillo | null {
  return typeof valor === 'string' && TIPOS_VALIDOS.includes(valor) ? (valor as TipoDeTornillo) : null
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * De qué tipo es un tornillo: el que escribió el editor en el instrumento y, si no escribió ninguno, el que se deduce del
 * nombre y del identificador. «Bloqueo de clavo» es un tornillo bloqueado; «maleolar» y «parcial», de rosca parcial.
 */
export function tipoDelTornillo(i: { slug?: string | null; nombre?: string | null; tipoDeTornillo?: string | null }): TipoDeTornillo {
  const declarado = tipoDeTornilloValido(i.tipoDeTornillo)
  if (declarado) return declarado
  const texto = sinTildes(`${i.slug ?? ''} ${i.nombre ?? ''}`)
  if (/canulad|cannulad/.test(texto)) return 'canulado'
  if (/bloqueo|bloqueado|locking/.test(texto)) return 'bloqueado'
  if (/rosca[- ]?parcial|parcial|maleolar/.test(texto)) return 'rosca-parcial'
  if (/esponjosa|cancellous/.test(texto)) return 'esponjosa'
  if (/cortical/.test(texto)) return 'cortical'
  return 'otro'
}

export function definicionDelTipo(tipo: TipoDeTornillo): DefinicionDeTipo {
  return TIPOS_DE_TORNILLO.find((t) => t.tipo === tipo) as DefinicionDeTipo
}

/**
 * Los diámetros que se ofrecen para un tipo, con el del propio modelo siempre incluido (un tornillo de 5,5 que el editor
 * cargó no se queda sin poder elegirse), ordenados de menor a mayor.
 */
export function diametrosDelTipo(tipo: TipoDeTornillo, delModeloMm?: number | null): number[] {
  const lista = new Set<number>(definicionDelTipo(tipo).diametrosMm)
  if (typeof delModeloMm === 'number' && Number.isFinite(delModeloMm) && delModeloMm > 0) lista.add(Math.round(delModeloMm * 10) / 10)
  return [...lista].sort((a, b) => a - b)
}

// ------------------------------------------------------------------ la secuencia

export type EtapaDeFijacion = 'brocar' | 'medir' | 'atornillar'

export const ETAPAS_DE_FIJACION: readonly { etapa: EtapaDeFijacion; numero: number; etiqueta: string }[] = [
  { etapa: 'brocar', numero: 1, etiqueta: 'Brocar' },
  { etapa: 'medir', numero: 2, etiqueta: 'Medir' },
  { etapa: 'atornillar', numero: 3, etiqueta: 'Atornillar' },
]

/**
 * Qué toca ahora en un orificio: **brocar, medir, atornillar**, siempre en ese orden. Con el orificio ya atornillado, lo que
 * viene es el orificio siguiente, que empieza por brocar. Sin ningún orificio en curso (`undefined`), también se empieza por brocar.
 */
export function siguienteDeLaSecuencia(estado: EstadoDelAgujero | null | undefined, tieneTornillo: boolean): EtapaDeFijacion {
  if (!estado?.perforado) return 'brocar'
  if (!estado.medido) return 'medir'
  if (!tieneTornillo) return 'atornillar'
  return 'brocar'
}

/** Un instrumento de la bandeja, con lo mínimo que hace falta para elegirlo por su tiempo. */
export interface CandidatoDeLaSecuencia {
  id: string
  slug?: string | null
  nombre?: string | null
}

export interface QueHaceElCandidato {
  perfora: boolean
  mide: boolean
  tornillo: boolean
  /** Diámetro de la broca o del tornillo, si lo declara. */
  diametroMm?: number
  /** La clase del tornillo (cortical, bloqueado, perno de clavo…): con el diámetro, dice qué broca lleva. */
  clase?: ClaseDelTornillo
}

/** Con qué se elige el instrumento de un tiempo: lo que ya se usó, lo que pide la placa y lo que se perforó. */
export interface PreferenciasDeLaSecuencia {
  ultimoTornilloId?: string | null
  diametroDelTornilloMm?: number | null
  claseDelTornillo?: ClaseDelTornillo
  /**
   * El calibre con que se perforó el orificio que toca atornillar. Manda sobre lo demás: entra el tornillo de esa broca, como en
   * pabellón, donde la broca ya decidió entre el cortical (2,5) y el bloqueado (2,8) de 3,5.
   */
  brocaDelOrificioMm?: number | null
}

const mismoCalibre = (a: number | null | undefined, b: number | null | undefined) =>
  typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.05

/**
 * Qué instrumento de la bandeja corresponde a un tiempo de la secuencia, o `null` si no hay ninguno. Para **brocar**, la broca cuyo
 * calibre es el que lleva el último tornillo (o la primera que haya); para **medir**, el medidor; para **atornillar**, uno que
 * entre en lo perforado y, de esos, el último que se usó, el del diámetro que pide la placa o el primero. No decide en qué orden
 * ofrecer cosas distintas: elige el mejor de entre los que pueden hacer ese tiempo.
 */
export function instrumentoDeLaEtapa<T extends CandidatoDeLaSecuencia>(
  etapa: EtapaDeFijacion,
  bandeja: readonly T[],
  queHace: (i: T) => QueHaceElCandidato,
  preferencias: PreferenciasDeLaSecuencia = {},
): T | null {
  if (etapa === 'medir') return bandeja.find((i) => queHace(i).mide) ?? null
  if (etapa === 'atornillar') {
    // Hasta P-013 salía el último tornillo y, sin él, el primero de la bandeja. En una placa de tercio de caña recién fijada
    // ese primero era el bloqueado LCP de 3,5, que no se traba en sus orificios y lleva la broca de 2,8 en un orificio hecho
    // con la de 2,5. Ahora se filtra por lo perforado o, sin ese dato, por la broca del diámetro y la clase que pide la placa.
    const tornillos = bandeja.filter((i) => queHace(i).tornillo)
    const brocaDe = (i: T) => {
      const { diametroMm, clase } = queHace(i)
      return diametroMm ? calibreDeBrocaParaElTornillo(diametroMm, clase) : null
    }
    const broca =
      preferencias.brocaDelOrificioMm ??
      (preferencias.diametroDelTornilloMm ? calibreDeBrocaParaElTornillo(preferencias.diametroDelTornilloMm, preferencias.claseDelTornillo) : null)
    const queEntran = broca ? tornillos.filter((i) => mismoCalibre(brocaDe(i), broca)) : []
    // Si ninguno entra (se perforó con una broca que no es de ningún tornillo de la bandeja), se elige entre todos, como antes:
    // el aviso de la broca equivocada es de la evaluación, no de la secuencia.
    const entre = queEntran.length > 0 ? queEntran : tornillos
    return (
      entre.find((i) => i.id === preferencias.ultimoTornilloId) ??
      entre.find((i) => mismoCalibre(queHace(i).diametroMm, preferencias.diametroDelTornilloMm)) ??
      entre[0] ??
      null
    )
  }
  const brocas = bandeja.filter((i) => queHace(i).perfora)
  if (preferencias.diametroDelTornilloMm) {
    // Con la clase (D-300): después de un bloqueado de 3,5 se ofrece la de 2,8, no la de 2,5 del cortical.
    const calibre = calibreDeBrocaParaElTornillo(preferencias.diametroDelTornilloMm, preferencias.claseDelTornillo)
    const justa = brocas.find((i) => Math.abs((queHace(i).diametroMm ?? -1) - calibre) < 0.05)
    if (justa) return justa
  }
  return brocas[0] ?? null
}

/** El último tornillo que se usó, con lo que hace falta para elegir la broca que le corresponde. */
export interface UltimoTornilloDeLaSecuencia {
  id: string
  diametroMm: number
  clase: ClaseDelTornillo
}

/**
 * Con qué se elige la broca al **fijar la placa** (P-013, pedido 3 de Cristóbal: «al fijar la placa, que se despliegue al tiro
 * la broca, y no ir a buscarla al menú»). Hasta aquí la secuencia arrancaba con el primer orificio perforado y el primer tiempo,
 * el de buscar la broca, quedaba a cargo del residente.
 *
 * El diámetro lo pone el sistema de la placa (el 3,5 de una LC-DCP 3,5; el 4,5 de una ancha), no el último tornillo de la
 * consola, que puede ser de otra placa. La clase, **cortical**: en una placa de orificios combinados lo primero que entra es un
 * tornillo convencional, que aprieta la placa contra el hueso; un bloqueado puesto antes la deja fija donde quedó, separada (la
 * regla de AO del montaje híbrido). Si la placa se soltó y se volvió a fijar y ya hubo un tornillo de ese mismo diámetro, manda
 * ese: el residente ya eligió con qué seguir.
 */
export function preferenciasDeLaPlacaFijada(
  diametroDelSistemaMm: number,
  ultimo: UltimoTornilloDeLaSecuencia | null,
): { ultimoTornilloId: string | null; diametroDelTornilloMm: number; claseDelTornillo: ClaseDelTornillo } {
  if (ultimo && Math.abs(ultimo.diametroMm - diametroDelSistemaMm) < 0.05) {
    return { ultimoTornilloId: ultimo.id, diametroDelTornilloMm: ultimo.diametroMm, claseDelTornillo: ultimo.clase }
  }
  return { ultimoTornilloId: null, diametroDelTornilloMm: diametroDelSistemaMm, claseDelTornillo: { tipo: 'cortical' } }
}

/**
 * La frase de qué viene ahora, para el panel. `hayTornilloPuesto` separa el primer orificio («Primero se broca») de los que
 * siguen («Orificio terminado»). La consola lo sacaba de que hubiera algo ofrecido en la bandeja, y desde que fijar la placa
 * ofrece la broca (P-013, pedido 3) la frase daba por terminado un orificio que nadie había empezado.
 */
export function textoDeLaSecuencia(etapa: EtapaDeFijacion, hayTornilloPuesto: boolean): string {
  if (etapa === 'brocar') return hayTornilloPuesto ? 'Orificio terminado. Siguiente: broque el siguiente.' : 'Primero se broca.'
  if (etapa === 'medir') return 'Perforado. Siguiente: medir con el medidor de profundidad.'
  return 'Medido. Siguiente: el tornillo, del largo que dijo el medidor.'
}

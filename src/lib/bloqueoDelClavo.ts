/**
 * El bloqueo del clavo y el apriete de los tornillos (P-005 E6): por qué orificio pasa cada tornillo de bloqueo, con qué puntería, y con qué destornillador
 * y qué limitador de torque se aprieta cada tornillo.
 *
 * Como `enclavado.ts`, es puro y sin `three`: la geometría la pone la escena, pero lo que significa —si un tornillo a pulso acertó el orificio, si el
 * destornillador calza en la cabeza, si el limitador salta antes o después de lo debido— son reglas que se prueban con números. Todas las cifras son una
 * propuesta de partida que el traumatólogo debe revisar.
 */

// ------------------------------------------------------------------------------------------------ orificios del clavo

export type ZonaDelOrificio = 'proximal' | 'distal'

export interface OrificioDelClavo {
  /** «P1», «P2», «D1»…: como los nombra el cirujano. */
  id: string
  zona: ZonaDelOrificio
  /**
   * Dónde está, a lo largo del clavo: los proximales se miden desde el extremo proximal (el que queda a la entrada) y los distales desde la punta, en mm.
   */
  desdeElExtremoMm: number
  /** Es el orificio dinámico (oval): deja que el clavo se deslice y se compacte la fractura. */
  dinamico: boolean
}

/** Separación entre orificios contiguos de una misma zona, en mm. */
export const SEPARACION_ENTRE_ORIFICIOS_MM = 15
/** El primer orificio de cada zona está a esta distancia de su extremo, en mm. */
export const PRIMER_ORIFICIO_DESDE_EL_EXTREMO_MM = 15

function repartir(zona: ZonaDelOrificio, cantidad: number, dinamicoEnElSegundo = false): OrificioDelClavo[] {
  return Array.from({ length: cantidad }, (_, i) => ({
    id: `${zona === 'proximal' ? 'P' : 'D'}${i + 1}`,
    zona,
    desdeElExtremoMm: PRIMER_ORIFICIO_DESDE_EL_EXTREMO_MM + i * SEPARACION_ENTRE_ORIFICIOS_MM,
    dinamico: dinamicoEnElSegundo && i === 1,
  }))
}

/**
 * Los orificios de un clavo, por lo que dice su nombre: el tibial trae tres proximales (el del medio dinámico) y tres distales; el femoral, dos proximales
 * y tres distales; el cefalomedular se bloquea con su tornillo cefálico y no con estos, así que no trae ninguno. Otro, dos y dos.
 */
export function orificiosDelClavo(nombre: string): OrificioDelClavo[] {
  const n = nombre.toLowerCase()
  if (/cefalomedular|pfn/.test(n)) return []
  if (/tibi/.test(n)) return [...repartir('proximal', 3, true), ...repartir('distal', 3)]
  if (/f[eé]mur|femor/.test(n)) return [...repartir('proximal', 2), ...repartir('distal', 3)]
  return [...repartir('proximal', 2), ...repartir('distal', 2)]
}

/**
 * Dónde cae un orificio, en mm desde la entrada a lo largo del canal: la punta del clavo está a `avanceMm` y su extremo proximal a `avanceMm - largoMm`. Los
 * proximales se cuentan desde ese extremo hacia abajo y los distales desde la punta hacia arriba.
 */
export function posicionDelOrificioMm(clavo: { avanceMm: number; largoMm: number }, o: OrificioDelClavo): number {
  return o.zona === 'proximal' ? clavo.avanceMm - clavo.largoMm + o.desdeElExtremoMm : clavo.avanceMm - o.desdeElExtremoMm
}

// ------------------------------------------------------------------------------------------------ puntería

/** Hasta cuánto se puede apartar el tornillo del centro del orificio y seguir entrando limpio, en mm (a pulso). */
export const PUNTERIA_QUE_ACIERTA_MM = 2
/** Hasta aquí roza el borde del orificio: pasa, pero apenas agarra el clavo. Más allá, pasa junto al clavo. */
export const PUNTERIA_QUE_ROZA_MM = 4

export type Punteria = 'acierta' | 'roza' | 'falla'

export interface JuicioDeLaPunteria {
  punteria: Punteria
  /** El tornillo traba el clavo (acierta, o roza). */
  bloquea: boolean
  aviso: string | null
}

/**
 * ¿Acertó el tornillo el orificio? Los proximales, con el arco de inserción montado, van **guiados**: el arco fija la trayectoria y siempre aciertan. Los
 * distales y los proximales sin arco van **a pulso**, mirando la fluoroscopia con el orificio en círculo perfecto: de ahí que se juzgue la distancia al
 * centro del orificio.
 */
export function juzgarLaPunteria(p: { desviacionMm: number; guiadoPorElArco: boolean; orificio: string }): JuicioDeLaPunteria {
  const f = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
  if (p.guiadoPorElArco) return { punteria: 'acierta', bloquea: true, aviso: null }
  const d = Math.abs(p.desviacionMm)
  if (d <= PUNTERIA_QUE_ACIERTA_MM) return { punteria: 'acierta', bloquea: true, aviso: null }
  if (d <= PUNTERIA_QUE_ROZA_MM) {
    return { punteria: 'roza', bloquea: true, aviso: `El tornillo de ${p.orificio} roza el borde del orificio (${f(d)} mm fuera del centro): traba poco el clavo. Mejor retirarlo y repetirlo.` }
  }
  return {
    punteria: 'falla',
    bloquea: false,
    aviso: `El tornillo de ${p.orificio} pasó ${f(d)} mm fuera del orificio: queda junto al clavo y no lo bloquea. Hay que retirarlo y apuntar mejor.`,
  }
}

/** La fractura y su bloqueo: cuántos tornillos de cada zona traban de verdad. */
export function juzgarElBloqueo(p: { proximales: number; distales: number }): { suficiente: boolean; aviso: string | null } {
  if (p.distales === 0 && p.proximales === 0) {
    return { suficiente: false, aviso: 'El clavo no está bloqueado: la fractura puede rotar y acortarse. En una diáfisis inestable se bloquea arriba y abajo.' }
  }
  if (p.distales === 0) return { suficiente: false, aviso: 'Falta el bloqueo distal: el fragmento de abajo puede rotar sobre el clavo.' }
  if (p.proximales === 0) return { suficiente: false, aviso: 'Falta el bloqueo proximal: el fragmento de arriba puede rotar y el clavo, migrar.' }
  if (p.distales < 2) return { suficiente: false, aviso: 'Con un solo tornillo distal el bloqueo es débil: lo habitual son dos.' }
  return { suficiente: true, aviso: null }
}

// ------------------------------------------------------------------------------------------------ destornilladores y limitador

export type TipoDeDestornillador = 'hexagonal' | 'stardrive'

/** Un destornillador por su nombre: el hexagonal («Destornillador hexagonal 2,5…») o el Stardrive («Stardrive T15», «Atornillador de bloqueo»). */
export function destornilladorDelNombre(nombre: string): { tipo: TipoDeDestornillador; talla: number | null } {
  const n = nombre.toLowerCase()
  if (/stardrive|bloqueo|\bt\s?\d{1,2}\b/.test(n)) {
    const t = /\bt\s?(\d{1,2})\b/.exec(n)
    return { tipo: 'stardrive', talla: t ? Number(t[1]) : null }
  }
  return { tipo: 'hexagonal', talla: null }
}

/** Cuántos N·m admite una cabeza bloqueada, por su diámetro: es lo que marca el limitador que le corresponde. */
export function torqueDelTornillo(diametroMm: number): number {
  if (diametroMm <= 2.4 + 1e-9) return 0.8
  if (diametroMm <= 3.5 + 1e-9) return 1.5
  return 4
}

/** La talla Stardrive de la cabeza: T8 hasta 2,4 mm, T15 hasta 3,5 y T25 en 5,0. */
export function tallaDeLaCabeza(diametroMm: number): number {
  if (diametroMm <= 2.4 + 1e-9) return 8
  if (diametroMm <= 3.5 + 1e-9) return 15
  return 25
}

/** «Limitador de torque 1,5 N·m» → 1.5; `null` si el nombre no lo dice. */
export function torqueEnElNombre(nombre: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*N\s*[·.\-]?\s*m/i.exec(nombre)
  if (!m) return null
  const v = Number(m[1].replace(',', '.'))
  return v > 0 && v < 20 ? v : null
}

export interface JuicioDelApriete {
  /** Quedó apretado. `false`: el destornillador no calza o el limitador salta antes de apretar. */
  apretado: boolean
  aviso: string | null
  /** Qué se anota en el tornillo: «con Stardrive T15 y limitador de 1,5 N·m». */
  texto: string
}

/**
 * Juzga apretar un tornillo. La cabeza decide el destornillador: la bloqueada lleva Stardrive de su talla y la normal, hexágono. Una cabeza bloqueada de
 * una **placa** se aprieta con el limitador que le corresponde (0,8 / 1,5 / 4,0 N·m): sin él, o con otro, se la sobre-aprieta —y se traba en la placa— o
 * queda floja. Los tornillos de bloqueo del clavo no llevan limitador.
 */
export function juzgarElApriete(p: {
  tornillo: { bloqueado: boolean; diametroMm: number; deClavo: boolean }
  destornillador: { tipo: TipoDeDestornillador; talla: number | null }
  limitadorNm: number | null
}): JuicioDelApriete {
  const f = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
  const { tornillo, destornillador, limitadorNm } = p
  const necesita: TipoDeDestornillador = tornillo.bloqueado ? 'stardrive' : 'hexagonal'
  const tallaNecesaria = tallaDeLaCabeza(tornillo.diametroMm)
  const nombreDelDestornillador = destornillador.tipo === 'stardrive' ? `Stardrive${destornillador.talla ? ` T${destornillador.talla}` : ''}` : 'hexagonal'
  if (destornillador.tipo !== necesita) {
    return {
      apretado: false,
      texto: '',
      aviso: tornillo.bloqueado
        ? `La cabeza bloqueada de ${f(tornillo.diametroMm)} mm lleva Stardrive T${tallaNecesaria}: el hexagonal no calza y la barre.`
        : `Esta cabeza lleva destornillador hexagonal: el Stardrive no calza.`,
    }
  }
  if (necesita === 'stardrive' && destornillador.talla !== null && destornillador.talla !== tallaNecesaria) {
    return {
      apretado: false,
      texto: '',
      aviso: `El Stardrive T${destornillador.talla} no calza en una cabeza T${tallaNecesaria} (tornillo de ${f(tornillo.diametroMm)} mm): se barre la cabeza.`,
    }
  }
  const base = `con ${nombreDelDestornillador}`
  if (!tornillo.bloqueado || tornillo.deClavo) {
    return { apretado: true, aviso: null, texto: base }
  }
  const justo = torqueDelTornillo(tornillo.diametroMm)
  if (limitadorNm === null) {
    return {
      apretado: true,
      texto: `${base}, sin limitador`,
      aviso: `Se apretó la cabeza bloqueada sin limitador de torque: se puede sobre-apretar, trabar la cabeza en la placa y barrer la rosca. Para este tornillo, limitador de ${f(justo)} N·m.`,
    }
  }
  if (Math.abs(limitadorNm - justo) < 0.05) return { apretado: true, aviso: null, texto: `${base} y limitador de ${f(limitadorNm)} N·m` }
  if (limitadorNm < justo) {
    return {
      apretado: false,
      texto: '',
      aviso: `El limitador de ${f(limitadorNm)} N·m salta antes de apretar: este tornillo pide ${f(justo)} N·m.`,
    }
  }
  return {
    apretado: true,
    texto: `${base} y limitador de ${f(limitadorNm)} N·m`,
    aviso: `El limitador de ${f(limitadorNm)} N·m deja pasar más de lo que admite este tornillo (${f(justo)} N·m): riesgo de barrer la rosca y de trabar la cabeza.`,
  }
}

/**
 * La aguja de Kirschner (P-005 E3): un alambre liso de 1,6 mm que se clava con el motor para **fijar provisionalmente** una reducción o para **guiar** otro implante.
 *
 * A diferencia de una broca, **se queda puesta**: atraviesa la cortical cercana (y, si es bicortical, la opuesta), asoma por fuera, se ve en la fluoroscopia y se retira al
 * final o se deja. Lo que se juzga es lo mismo que de una perforación —si agarra las dos corticales, si se pasó de largo y lastima los blandos de detrás—, y es lo que vive aquí,
 * sin lienzo y con pruebas. Las cifras (cuánto es «pasarse», cuántas agujas caben) son una propuesta que el traumatólogo debe revisar.
 */

/** El calibre de la aguja, en mm. */
export const DIAMETRO_DEL_ALAMBRE_MM = 1.6
/** Lo que mide la aguja de punta a punta, en mm: de ahí sale cuánto asoma fuera del hueso. */
export const LARGO_DEL_ALAMBRE_MM = 150
/** Cuántas agujas se dejan puestas a la vez: más no enseñan nada y cuestan geometría. */
export const MAXIMO_DE_ALAMBRES = 6
/** Hasta cuánto puede pasar de la cortical opuesta sin que haya riesgo para los blandos, en mm. */
export const SE_PASA_SIN_RIESGO_MM = 3
/** Menos que esto es que apenas tocó el hueso. */
export const PROFUNDIDAD_MINIMA_MM = 2

export interface JuicioDelAlambre {
  /** Cruzó la cortical opuesta. */
  bicortical: boolean
  /** Cuánto pasó de largo la cortical opuesta, en mm (0 si no la cruzó). */
  sePasoMm: number
  /** Cuánto asoma por fuera del hueso del lado de la entrada, en mm. */
  asomaMm: number
  /** Qué decir, o `null` si está bien. */
  aviso: string | null
  /** Sujeta lo que tiene que sujetar: bicortical y sin pasarse. */
  sujeta: boolean
}

/**
 * Juzga una aguja ya clavada: `profundidadMm` es lo que entró y `salidaPorLaOpuestaMm` la distancia desde la entrada hasta la cara de afuera de la cortical opuesta.
 * Una aguja de una sola cortical sujeta poco; una que pasa más de `SE_PASA_SIN_RIESGO_MM` de la opuesta pone en riesgo los vasos y nervios de detrás.
 */
export function juzgarElAlambre(p: { profundidadMm: number; salidaPorLaOpuestaMm: number }): JuicioDelAlambre {
  const bicortical = p.profundidadMm >= p.salidaPorLaOpuestaMm - 0.5
  const sePasoMm = Math.max(0, p.profundidadMm - p.salidaPorLaOpuestaMm)
  const asomaMm = Math.max(0, LARGO_DEL_ALAMBRE_MM - p.profundidadMm)
  if (p.profundidadMm < PROFUNDIDAD_MINIMA_MM) {
    return { bicortical: false, sePasoMm: 0, asomaMm, aviso: 'La aguja apenas entró en el hueso: no sujeta nada.', sujeta: false }
  }
  if (!bicortical) {
    return {
      bicortical,
      sePasoMm,
      asomaMm,
      aviso: 'La aguja quedó en la cortical cercana: sujeta poco. Para fijar provisionalmente hay que cruzar también la cortical opuesta.',
      sujeta: false,
    }
  }
  if (sePasoMm > SE_PASA_SIN_RIESGO_MM) {
    return {
      bicortical,
      sePasoMm,
      asomaMm,
      aviso: `La aguja pasó ${sePasoMm.toFixed(1).replace('.', ',')} mm de la cortical opuesta: asoma entre los blandos y puede lesionar vasos o nervios. Retírela hasta que la punta quede justo fuera del hueso.`,
      sujeta: false,
    }
  }
  return { bicortical, sePasoMm, asomaMm, aviso: null, sujeta: true }
}

/** Una línea por aguja para el recuadro: «Aguja 2 · 34 mm · bicortical · asoma 116 mm». */
export function textoDelAlambre(numero: number, profundidadMm: number, juicio: JuicioDelAlambre): string {
  const coma = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',')
  const donde = juicio.bicortical ? (juicio.sePasoMm > SE_PASA_SIN_RIESGO_MM ? 'se pasó' : 'bicortical') : 'solo la cortical cercana'
  return `Aguja ${numero} · ${coma(profundidadMm)} mm · ${donde} · asoma ${Math.round(juicio.asomaMm)} mm`
}

/** Lo que el lienzo le dice a la consola de las agujas puestas, una por una y en el orden en que se pusieron. */
export interface EstadoDeLosAlambres {
  lista: { numero: number; profundidadMm: number; texto: string; aviso: string | null; sujeta: boolean }[]
}

export function resumenDeLosAlambres(puestos: readonly { profundidadMm: number; salidaPorLaOpuestaMm: number }[]): EstadoDeLosAlambres {
  return {
    lista: puestos.map((a, i) => {
      const juicio = juzgarElAlambre(a)
      return { numero: i + 1, profundidadMm: a.profundidadMm, texto: textoDelAlambre(i + 1, a.profundidadMm, juicio), aviso: juicio.aviso, sujeta: juicio.sujeta }
    }),
  }
}

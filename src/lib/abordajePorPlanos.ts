/**
 * Qué hace un clic del separador en un abordaje por planos (P-004 E5).
 *
 * Antes el residente tenía que decir en un selector si apoyaba el separador en «Piel» o en «Músculo», y un clic en el
 * plano equivocado no encontraba herida: el Farabeuf «no quedaba puesto» (pedido 8 de Cristóbal). Ahora el plano sale
 * de lo que se pincha: lo que se ve bajo el cursor y la herida más cercana. Con el plano forzado (el selector del
 * panel, que sigue existiendo para quien lo quiera) el clic se comporta como antes.
 *
 * Es una decisión pura, sin three.js, para poder probarla con todas las combinaciones. El lienzo mide —qué hay bajo el
 * cursor y a cuántos milímetros está el borde de cada herida— y esta función dice qué hacer con eso.
 */

export type PlanoDeHerida = 'piel' | 'musculo'

/** Una herida abierta en un plano, y a qué distancia de su borde más cercano cayó el clic (`null`: no hay herida ahí). */
export interface CandidatoDeHerida {
  plano: PlanoDeHerida
  cercaMm: number | null
}

export type DecisionDelClic =
  /** Apoyar el separador en el borde de la herida de ese plano. */
  | { accion: 'colocar'; plano: PlanoDeHerida }
  /** Retraer el músculo que se pinchó, sin herida de por medio. */
  | { accion: 'separar-musculo' }
  /** No hay nada que hacer con este clic; `motivo` decide qué se le dice a quien lo hizo. */
  | { accion: 'nada'; motivo: 'sin-herida' | 'lejos' }

/**
 * Hasta dónde un clic cuenta como «en el labio de la herida». Más lejos que esto, sobre un músculo, el clic es para el
 * músculo y no para la herida: una incisión abierta deja a la vista el músculo de debajo, y pincharlo en la ventana
 * tiene que retraerlo en vez de ir a buscar el borde de la piel.
 */
export const LIMITE_DEL_LABIO_MM = 8

/** Hasta dónde se acepta un clic como «junto a la herida» para apoyar el separador (lo de siempre). */
export const LIMITE_PARA_COLOCAR_MM = 30

export interface EntradaDelClic {
  /** El papel de la pieza que se ve primero bajo el cursor (`piel`, `musculo`, `hueso`…), o `null` si no hay ninguna. */
  rolDelGolpe: string | null
  /** Las heridas que hay, una por plano. */
  candidatos: readonly CandidatoDeHerida[]
  /** El plano que el usuario fijó en el panel, o `auto`/`undefined` para que lo decida el clic. */
  planoForzado?: PlanoDeHerida | 'auto'
  /** ¿El separador en la mano puede retraer un músculo? (todos los de mano; el Hohmann se apoya en el hueso). */
  puedeSepararMusculos: boolean
  /**
   * Cuántos milímetros cuenta como «el labio» en la vista de ahora. Con la pierna entera en pantalla un píxel son varios
   * milímetros y 8 mm serían cuatro píxeles: el lienzo lo sube a lo que mide un puñado de píxeles. Nunca baja de
   * `LIMITE_DEL_LABIO_MM`.
   */
  limiteDelLabioMm?: number
}

/** Los planos en el orden en que se prueban: primero lo que se ve bajo el cursor y, después, lo más profundo. */
export function ordenDeLosPlanos(rolDelGolpe: string | null): PlanoDeHerida[] {
  const profundoPrimero: PlanoDeHerida[] = ['musculo', 'piel']
  if (rolDelGolpe === 'piel') return ['piel', 'musculo']
  return profundoPrimero
}

export function decidirElClicDelSeparador(entrada: EntradaDelClic): DecisionDelClic {
  const { rolDelGolpe, candidatos, planoForzado, puedeSepararMusculos } = entrada
  const limiteDelLabio = Math.max(LIMITE_DEL_LABIO_MM, entrada.limiteDelLabioMm ?? 0)
  const conHerida = candidatos.filter((c) => c.cercaMm !== null)

  // Plano forzado: lo de antes, un solo plano y un solo criterio.
  if (planoForzado === 'piel' || planoForzado === 'musculo') {
    const c = candidatos.find((x) => x.plano === planoForzado)
    if (!c || c.cercaMm === null) return { accion: 'nada', motivo: 'sin-herida' }
    return c.cercaMm <= LIMITE_PARA_COLOCAR_MM ? { accion: 'colocar', plano: planoForzado } : { accion: 'nada', motivo: 'lejos' }
  }

  const orden = ordenDeLosPlanos(rolDelGolpe)
  const mejorEn = (limite: number): PlanoDeHerida | null => {
    for (const plano of orden) {
      const c = conHerida.find((x) => x.plano === plano)
      if (c && (c.cercaMm as number) <= limite) return plano
    }
    return null
  }

  // 1. Un clic sobre el labio de una herida es para la herida, en el plano que se ve.
  const enElLabio = mejorEn(limiteDelLabio)
  if (enElLabio) return { accion: 'colocar', plano: enElLabio }

  // 2. Lejos del labio y sobre un músculo: el músculo se retrae de una vez, sin pasar por la ficha.
  if (rolDelGolpe === 'musculo' && puedeSepararMusculos) return { accion: 'separar-musculo' }

  // 3. Junto a una herida, aunque no sobre su labio.
  const cerca = mejorEn(Math.max(LIMITE_PARA_COLOCAR_MM, limiteDelLabio))
  if (cerca) return { accion: 'colocar', plano: cerca }

  if (conHerida.length === 0) return { accion: 'nada', motivo: 'sin-herida' }
  return { accion: 'nada', motivo: 'lejos' }
}

/** La frase para cuando el clic no hizo nada: dice qué falta y no solo «no se pudo». */
export function avisoDelClicSinEfecto(motivo: 'sin-herida' | 'lejos', hayHeridas: boolean, puedeSepararMusculos: boolean): string {
  if (motivo === 'sin-herida' && !hayHeridas) {
    return puedeSepararMusculos
      ? 'No hay herida que separar: corte primero con un bisturí, o haga clic en un músculo para retraerlo.'
      : 'No hay herida que separar: corte primero con un bisturí, en modo Trazar.'
  }
  if (motivo === 'sin-herida') return 'No hay herida en ese plano: elija «Automático» para que el clic busque la herida donde esté.'
  return 'Acerque el separador al borde de la herida y haga clic para colocarlo.'
}

/**
 * Cambia el sentido en que se retrae un músculo (pedido 10: «que se desplace hacia delante o hacia atrás»). El apoyo
 * se queda donde se pinchó y la dirección se invierte; la cuenta de `retraccion.ts` parte siempre de las posiciones
 * originales, así que alternar no acumula nada.
 */
export function invertirLaDireccion(direccion: readonly [number, number, number]): [number, number, number] {
  return [-direccion[0], -direccion[1], -direccion[2]]
}

/**
 * Corre el apoyo de una retracción a lo largo de un eje (el del hueso) para desplazar la zona que se retrae por el
 * músculo sin volver a pinchar. `eje` es unitario; `delta` está en las unidades del espacio del apoyo.
 */
export function correrElApoyo(
  apoyo: readonly [number, number, number],
  eje: readonly [number, number, number],
  delta: number,
): [number, number, number] {
  return [apoyo[0] + eje[0] * delta, apoyo[1] + eje[1] * delta, apoyo[2] + eje[2] * delta]
}

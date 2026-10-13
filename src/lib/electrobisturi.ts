/**
 * El electrobisturí del simulador: potencia en vatios y modo (petición de Cristóbal).
 *
 * El lápiz de dos botones del catálogo tiene dos modos: **corte** (amarillo, CUT)
 * y **coagulación** (azul, COAG). En el generador se gradúa la potencia en vatios;
 * lo habitual es dejar la escala de 0 a 100 W, y de esa escala sale el control.
 *
 * Los rangos son los de cirugía ortopédica de partes blandas: unos 30 a 50 W
 * cortando y 25 a 45 W coagulando. No son una prescripción —cada generador y cada
 * cirujano tienen su costumbre—, sino la franja en que el gesto sale limpio, y por
 * eso el juicio de aquí abajo habla de «lo habitual» y no de lo correcto.
 *
 * Qué pasa con cada potencia lo decide esta función y no el lienzo, para que el
 * mensaje que lee el residente y el efecto sobre la herida salgan de la misma
 * cuenta (el lienzo corta o no según `corta`, la consola dice `texto`).
 */

export const POTENCIA_MAXIMA_W = 100
export const POTENCIA_INICIAL_W = 35

export type ModoDelElectrobisturi = 'corte' | 'coagulacion'

export const RANGO_HABITUAL: Readonly<Record<ModoDelElectrobisturi, readonly [number, number]>> = {
  corte: [30, 50],
  coagulacion: [25, 45],
}

/** Por debajo de esto el electrodo solo arrastra el tejido: no hay arco, no hay corte. */
export const POTENCIA_MINIMA_PARA_CORTAR_W = 10
/** Por encima de esto se carboniza el borde de la herida. */
export const POTENCIA_QUE_QUEMA_W = 75

export interface JuicioDeLaPotencia {
  texto: string
  /** Si la consola lo anota como aviso y no como acierto. */
  atencion: boolean
  /** Si el gesto llega a cortar. En coagulación nunca: sella, no abre. */
  corta: boolean
  /** Si deja el borde quemado. */
  quema: boolean
}

export function limitarPotencia(watts: number): number {
  if (!Number.isFinite(watts)) return 0
  return Math.min(POTENCIA_MAXIMA_W, Math.max(0, Math.round(watts)))
}

export function juicioDeLaPotencia(modo: ModoDelElectrobisturi, potencia: number): JuicioDeLaPotencia {
  const w = limitarPotencia(potencia)
  const [minimo, maximo] = RANGO_HABITUAL[modo]
  const rango = `${minimo}–${maximo} W`

  if (modo === 'coagulacion') {
    if (w === 0) {
      return { texto: 'El generador está en 0 W: no coagula. Suba la potencia.', atencion: true, corta: false, quema: false }
    }
    if (w < minimo) {
      return {
        texto: `Con ${w} W la coagulación es floja y el vaso sigue sangrando: lo habitual son ${rango}.`,
        atencion: true,
        corta: false,
        quema: false,
      }
    }
    if (w > POTENCIA_QUE_QUEMA_W) {
      return {
        texto: `${w} W coagulando carboniza el tejido y puede lesionar lo que hay debajo: baje a ${rango}.`,
        atencion: true,
        corta: false,
        quema: true,
      }
    }
    if (w > maximo) {
      return {
        texto: `${w} W es más de lo habitual para coagular (${rango}): sella, pero deja más tejido quemado.`,
        atencion: true,
        corta: false,
        quema: false,
      }
    }
    return {
      texto: `Coagulación a ${w} W, dentro de lo habitual (${rango}). Sella los vasos; para cortar, pase a corte.`,
      atencion: false,
      corta: false,
      quema: false,
    }
  }

  if (w < POTENCIA_MINIMA_PARA_CORTAR_W) {
    return {
      texto:
        w === 0
          ? 'El generador está en 0 W: el lápiz no corta. Suba la potencia.'
          : `Con ${w} W el electrodo solo arrastra el tejido y no llega a cortar: lo habitual son ${rango}.`,
      atencion: true,
      corta: false,
      quema: false,
    }
  }
  if (w < minimo) {
    return {
      texto: `${w} W corta pero arrastra y deja el borde irregular: lo habitual son ${rango}.`,
      atencion: true,
      corta: true,
      quema: false,
    }
  }
  if (w > POTENCIA_QUE_QUEMA_W) {
    return {
      texto: `${w} W es excesivo: el corte carboniza los bordes y la lesión térmica llega a lo que hay debajo. Lo habitual son ${rango}.`,
      atencion: true,
      corta: true,
      quema: true,
    }
  }
  if (w > maximo) {
    return {
      texto: `${w} W corta rápido pero quema algo los bordes: lo habitual son ${rango}.`,
      atencion: true,
      corta: true,
      quema: false,
    }
  }
  return { texto: `Corte a ${w} W, dentro de lo habitual (${rango}).`, atencion: false, corta: true, quema: false }
}

/** ¿Es este instrumento el electrobisturí? Por identificador y, si el panel lo creó a mano, por nombre. */
export function esElectrobisturi(i: { slug?: string | null; nombre: string }): boolean {
  return i.slug === 'electrobisturi' || /electrobistur|diatermia|termocauterio/i.test(i.nombre)
}

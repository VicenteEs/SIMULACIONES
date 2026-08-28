/**
 * Motor del simulador quirúrgico.
 *
 * El módulo enseña por error: cada gesto tiene un instrumento correcto y un
 * rango de fuerza útil. Por debajo del rango la maniobra no se completa; por
 * encima se produce una complicación. Esa distinción es la que convierte una
 * animación en un ejercicio evaluable, y por eso se separa el fallo inocuo del
 * que deja secuelas.
 *
 * La lógica vive aquí, aislada de la interfaz, para poder probarla entera.
 */

export const RESULTADOS = {
  SIN_INSTRUMENTO: 'sin-instrumento',
  INSTRUMENTO_INCORRECTO: 'instrumento-incorrecto',
  FUERZA_INSUFICIENTE: 'fuerza-insuficiente',
  FUERZA_EXCESIVA: 'fuerza-excesiva',
  CORRECTO: 'correcto',
} as const

export type Resultado = (typeof RESULTADOS)[keyof typeof RESULTADOS]

export interface PasoQuirurgico {
  titulo?: string
  instrumento?: string
  fuerzaMinima?: number
  fuerzaMaxima?: number
  exito?: string
  insuficiente?: string
  excesivo?: string
  riesgo?: string
}

export interface Gesto {
  instrumento: string | null
  fuerza: number
}

export interface Evaluacion {
  resultado: Resultado
  mensaje: string
  /** El paso se da por completado y se puede continuar. */
  avanza: boolean
  /** Hubo daño: cuenta como complicación en el registro, no como reintento. */
  complicacion: boolean
}

export function evaluarGesto(paso: PasoQuirurgico, gesto: Gesto): Evaluacion {
  if (!gesto.instrumento) {
    return {
      resultado: RESULTADOS.SIN_INSTRUMENTO,
      mensaje: 'Seleccione un instrumento antes de ejecutar el paso.',
      avanza: false,
      complicacion: false,
    }
  }

  if (paso.instrumento && gesto.instrumento !== paso.instrumento) {
    return {
      resultado: RESULTADOS.INSTRUMENTO_INCORRECTO,
      mensaje: `Instrumento incorrecto: se eligió ${gesto.instrumento} y el paso requiere ${paso.instrumento}.`,
      avanza: false,
      complicacion: false,
    }
  }

  const { fuerzaMinima, fuerzaMaxima } = paso

  if (typeof fuerzaMinima === 'number' && gesto.fuerza < fuerzaMinima) {
    return {
      resultado: RESULTADOS.FUERZA_INSUFICIENTE,
      mensaje: `${paso.insuficiente ?? 'La maniobra no se completa.'} (${gesto.fuerza} N · rango útil ${fuerzaMinima}–${fuerzaMaxima ?? '?'} N)`,
      avanza: false,
      complicacion: false,
    }
  }

  if (typeof fuerzaMaxima === 'number' && gesto.fuerza > fuerzaMaxima) {
    return {
      resultado: RESULTADOS.FUERZA_EXCESIVA,
      mensaje: `${paso.excesivo ?? 'Se produce una complicación.'} (${gesto.fuerza} N · rango útil ${fuerzaMinima ?? '?'}–${fuerzaMaxima} N)`,
      avanza: false,
      complicacion: true,
    }
  }

  return {
    resultado: RESULTADOS.CORRECTO,
    mensaje: paso.exito ?? 'Gesto completado.',
    avanza: true,
    complicacion: false,
  }
}

/** Punto medio del rango útil: la posición de partida razonable del control. */
export function fuerzaInicial(paso: PasoQuirurgico): number {
  const { fuerzaMinima, fuerzaMaxima } = paso
  if (typeof fuerzaMinima === 'number' && typeof fuerzaMaxima === 'number') {
    return Math.round((fuerzaMinima + fuerzaMaxima) / 2)
  }
  return fuerzaMinima ?? 10
}

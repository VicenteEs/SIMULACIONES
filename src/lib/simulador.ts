/**
 * Motor del simulador quirúrgico.
 *
 * El módulo enseña por error: cada gesto tiene un instrumento correcto y una
 * ventana en la que sale bien. Por debajo la maniobra no se completa; por
 * encima se produce una complicación. Esa distinción es la que convierte una
 * animación en un ejercicio evaluable, y por eso se separa el fallo inocuo del
 * que deja secuelas.
 *
 * **Cada paso declara qué se le mide.** La primera versión medía siempre lo
 * mismo, una fuerza en newtons, y obligaba al traumatólogo a inventar un rango
 * de fuerza para el gesto de trazar una incisión. Ahora hay cuatro objetivos:
 * elegir el instrumento, trazar con la longitud correcta, reducir dentro de la
 * tolerancia y aplicar la fuerza correcta. Todos exigen además el instrumento
 * en la mano: sin instrumento no hay gesto.
 *
 * La lógica vive aquí, aislada de la interfaz, para poder probarla entera.
 */

export const RESULTADOS = {
  SIN_INSTRUMENTO: 'sin-instrumento',
  INSTRUMENTO_INCORRECTO: 'instrumento-incorrecto',
  SIN_TRAZO: 'sin-trazo',
  TRAZO_CORTO: 'trazo-corto',
  TRAZO_LARGO: 'trazo-largo',
  REDUCCION_INSUFICIENTE: 'reduccion-insuficiente',
  FUERZA_INSUFICIENTE: 'fuerza-insuficiente',
  FUERZA_EXCESIVA: 'fuerza-excesiva',
  CORRECTO: 'correcto',
} as const

export type Resultado = (typeof RESULTADOS)[keyof typeof RESULTADOS]

export type Objetivo = 'instrumento' | 'trazo' | 'reduccion' | 'fuerza'

export interface PasoQuirurgico {
  titulo?: string
  objetivo?: Objetivo
  /** Identificador del instrumento correcto, o su nombre en los casos antiguos. */
  instrumento?: string | null
  puntos?: number
  trazoMinimo?: number | null
  trazoMaximo?: number | null
  toleranciaDesplazamiento?: number | null
  toleranciaDiastasis?: number | null
  toleranciaAngulacion?: number | null
  fuerzaMinima?: number | null
  fuerzaMaxima?: number | null
  exito?: string | null
  insuficiente?: string | null
  excesivo?: string | null
}

/** Lo que el residente tiene hecho cuando pulsa «Aplicar paso». */
export interface Gesto {
  instrumento: string | null
  /** Nombre del instrumento elegido, solo para poder nombrarlo al corregir. */
  instrumentoNombre?: string | null
  /** Longitud del trazo dibujado, en milímetros. */
  trazo?: number
  /** Cuánto queda desplazado de lado, en milímetros. */
  desplazamiento?: number
  /** Cuánto hueco queda entre los fragmentos, en milímetros. */
  diastasis?: number
  /** Cuánto queda angulado, en grados. */
  angulacion?: number
  fuerza?: number
}

export interface Evaluacion {
  resultado: Resultado
  mensaje: string
  /** El paso se da por completado y se puede continuar. */
  avanza: boolean
  /** Hubo daño: cuenta como complicación en el registro, no como reintento. */
  complicacion: boolean
  /** Puntos ganados. Solo se ganan al primer intento correcto; eso lo lleva quien llama. */
  puntos: number
}

const PUNTOS_POR_OMISION = 10

const nada = (mensaje: string, resultado: Resultado, complicacion = false): Evaluacion => ({
  resultado,
  mensaje,
  avanza: false,
  complicacion,
  puntos: 0,
})

const redondear1 = (n: number) => Math.round(n * 10) / 10

/**
 * Qué se le mide a este paso.
 *
 * Lo normal es que el paso lo diga: el campo tiene valor por omisión en la
 * colección y el médico lo elige de una lista. Cuando falta —un caso escrito
 * antes de que existieran los cuatro objetivos, o una fila importada— se deduce
 * de lo que el paso sí declara, en vez de dar por hecho que basta con elegir el
 * instrumento. Suponerlo sería peor que quedarse corto: un paso con su rango de
 * fuerza guardado se aprobaría sin mirar la fuerza, y nadie vería el fallo,
 * porque no hay error que enseñar. Un rango escrito y no evaluado es una regla
 * que el residente cree estar cumpliendo.
 */
export function objetivoDelPaso(paso: PasoQuirurgico): Objetivo {
  if (paso.objetivo) return paso.objetivo
  const declara = (...valores: Array<number | null | undefined>) =>
    valores.some((v) => typeof v === 'number')

  if (declara(paso.fuerzaMinima, paso.fuerzaMaxima)) return 'fuerza'
  if (declara(paso.trazoMinimo, paso.trazoMaximo)) return 'trazo'
  if (
    declara(
      paso.toleranciaDesplazamiento,
      paso.toleranciaDiastasis,
      paso.toleranciaAngulacion,
    )
  ) {
    return 'reduccion'
  }
  return 'instrumento'
}

export function evaluarGesto(paso: PasoQuirurgico, gesto: Gesto): Evaluacion {
  // El instrumento se exige siempre, sea cual sea el objetivo. Es lo primero
  // que se aprende en pabellón: no se toca al paciente con la mano vacía ni con
  // lo que se tenga más cerca.
  if (!gesto.instrumento) {
    return nada('Seleccione un instrumento antes de ejecutar el paso.', RESULTADOS.SIN_INSTRUMENTO)
  }
  if (paso.instrumento && gesto.instrumento !== paso.instrumento) {
    // Se nombra lo que cogió, no lo que debía coger: decirle cuál era el bueno
    // convierte el error en una respuesta regalada, y el sentido del módulo es
    // que la deduzca. Nombrarlo a él sí sirve, porque en la bandeja hay
    // instrumentos que se parecen y conviene que sepa cuál pulsó.
    const elegido = gesto.instrumentoNombre
    return nada(
      elegido
        ? `${elegido} no es el instrumento de este paso.`
        : 'Instrumento incorrecto para este paso.',
      RESULTADOS.INSTRUMENTO_INCORRECTO,
    )
  }

  const puntos = typeof paso.puntos === 'number' ? paso.puntos : PUNTOS_POR_OMISION
  const bien = (mensaje?: string | null): Evaluacion => ({
    resultado: RESULTADOS.CORRECTO,
    mensaje: mensaje || 'Gesto completado.',
    avanza: true,
    complicacion: false,
    puntos,
  })

  switch (objetivoDelPaso(paso)) {
    case 'trazo': {
      const largo = gesto.trazo ?? 0
      if (largo <= 0) {
        return nada(
          'Todavía no hay ninguna incisión trazada. Active el modo Trazar y arrastre sobre el modelo.',
          RESULTADOS.SIN_TRAZO,
        )
      }
      const { trazoMinimo, trazoMaximo } = paso
      if (typeof trazoMinimo === 'number' && largo < trazoMinimo) {
        return nada(
          `${paso.insuficiente || 'La incisión es demasiado corta para trabajar por ella.'} (${redondear1(largo)} mm · se esperan ${trazoMinimo}–${trazoMaximo ?? '?'} mm)`,
          RESULTADOS.TRAZO_CORTO,
        )
      }
      if (typeof trazoMaximo === 'number' && largo > trazoMaximo) {
        // Una incisión de más no impide seguir, pero deja cicatriz y expone
        // tejido sin necesidad: es complicación, no reintento.
        return nada(
          `${paso.excesivo || 'La incisión es mayor de lo necesario.'} (${redondear1(largo)} mm · se esperan ${trazoMinimo ?? '?'}–${trazoMaximo} mm)`,
          RESULTADOS.TRAZO_LARGO,
          true,
        )
      }
      return bien(paso.exito)
    }

    case 'reduccion': {
      // Las tres cifras que la consola enseña se evalúan las tres. Mostrar una
      // medida que no cuenta enseña justo lo contrario de lo que se pretende:
      // el residente aprendería que un hueco de 18 mm entre los fragmentos da
      // igual, porque la consola le dejó pasar.
      const desplazamiento = gesto.desplazamiento ?? Infinity
      const diastasis = gesto.diastasis ?? Infinity
      const angulacion = gesto.angulacion ?? Infinity
      const topeDesplazamiento = paso.toleranciaDesplazamiento ?? 5
      const topeDiastasis = paso.toleranciaDiastasis ?? topeDesplazamiento
      const topeAngulacion = paso.toleranciaAngulacion ?? 5

      if (
        desplazamiento > topeDesplazamiento ||
        diastasis > topeDiastasis ||
        angulacion > topeAngulacion
      ) {
        return nada(
          `${paso.insuficiente || 'La reducción todavía no es aceptable.'} (${redondear1(desplazamiento)} mm de desplazamiento, ${redondear1(diastasis)} mm de diástasis y ${redondear1(angulacion)}° · se aceptan hasta ${topeDesplazamiento} mm, ${topeDiastasis} mm y ${topeAngulacion}°)`,
          RESULTADOS.REDUCCION_INSUFICIENTE,
        )
      }
      return bien(paso.exito)
    }

    case 'fuerza': {
      const fuerza = gesto.fuerza ?? 0
      const { fuerzaMinima, fuerzaMaxima } = paso
      if (typeof fuerzaMinima === 'number' && fuerza < fuerzaMinima) {
        return nada(
          `${paso.insuficiente || 'La maniobra no se completa.'} (${fuerza} N · rango útil ${fuerzaMinima}–${fuerzaMaxima ?? '?'} N)`,
          RESULTADOS.FUERZA_INSUFICIENTE,
        )
      }
      if (typeof fuerzaMaxima === 'number' && fuerza > fuerzaMaxima) {
        return nada(
          `${paso.excesivo || 'Se produce una complicación.'} (${fuerza} N · rango útil ${fuerzaMinima ?? '?'}–${fuerzaMaxima} N)`,
          RESULTADOS.FUERZA_EXCESIVA,
          true,
        )
      }
      return bien(paso.exito)
    }

    default:
      // Objetivo «instrumento»: bastaba con elegirlo bien, y ya se comprobó.
      return bien(paso.exito)
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

/** Lo que vale el caso entero: la suma de sus pasos. */
export function puntajeMaximo(pasos: PasoQuirurgico[]): number {
  return pasos.reduce(
    (total, paso) => total + (typeof paso.puntos === 'number' ? paso.puntos : PUNTOS_POR_OMISION),
    0,
  )
}

/**
 * Qué necesita el residente tener hecho para que el paso se pueda aplicar.
 *
 * Sirve para escribir la instrucción en pantalla sin repetir la lógica de
 * evaluación en la interfaz.
 */
export function instruccionDelPaso(paso: PasoQuirurgico): string {
  switch (objetivoDelPaso(paso)) {
    case 'trazo': {
      const { trazoMinimo, trazoMaximo } = paso
      const rango =
        typeof trazoMinimo === 'number' && typeof trazoMaximo === 'number'
          ? ` Objetivo: ${trazoMinimo}–${trazoMaximo} mm.`
          : ''
      return `Active el modo Trazar y arrastre sobre el modelo.${rango}`
    }
    case 'reduccion': {
      const tope = paso.toleranciaDesplazamiento ?? 5
      return `Active el modo Mover, arrastre el fragmento a su sitio y corrija la angulación. Se aceptan hasta ${tope} mm de desplazamiento, ${paso.toleranciaDiastasis ?? tope} mm de diástasis y ${paso.toleranciaAngulacion ?? 5}° de angulación.`
    }
    case 'fuerza':
      return 'Elija el instrumento y gradúe la fuerza antes de aplicar el paso.'
    default:
      return 'Elija el instrumento correcto de la bandeja y aplique el paso.'
  }
}

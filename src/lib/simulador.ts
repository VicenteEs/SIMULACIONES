/**
 * Motor del simulador quirúrgico.
 *
 * El módulo enseña por error: cada gesto tiene un instrumento correcto y una
 * ventana en la que sale bien. Por debajo la maniobra no se completa; por
 * encima se produce una complicación. Esa distinción es la que convierte una
 * animación en un ejercicio evaluable, y por eso se separa el fallo inocuo del
 * que deja secuelas. Los dos obligan a repetir el gesto, pero no cuestan lo
 * mismo: la diferencia se cobra en `puntosDelPaso`, que es donde está escrito
 * el porqué.
 *
 * **Cada paso declara qué se le mide.** La primera versión medía siempre lo
 * mismo, una fuerza en newtons, y obligaba al traumatólogo a inventar un rango
 * de fuerza para el gesto de trazar una incisión. Ahora hay cuatro objetivos:
 * elegir el instrumento, trazar con la longitud correcta, reducir dentro de la
 * tolerancia y aplicar la fuerza correcta. Todos exigen además el instrumento
 * en la mano: sin instrumento no hay gesto.
 *
 * La lógica vive aquí, aislada de la interfaz, para poder probarla entera. Eso
 * incluye, al final del archivo, las reglas puras que la consola necesita para
 * decidir qué se ve y con qué se mide: estaban dentro del componente, donde
 * ninguna prueba llegaba.
 */

import {
  desplazamientoCompleto,
  medirReduccion,
  type Desplazamiento,
  type EjeLargo,
  type Medidas,
} from '@/lib/reduccion'

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
  /**
   * Hubo daño: el gesto se pasó, no se quedó corto.
   *
   * No avanza —ninguno de los dos lo hace— pero tampoco cuesta lo mismo: quien
   * llama tiene que apuntarlo y pasárselo después a `puntosDelPaso`, que es
   * donde la diferencia se cobra. Ver ahí el porqué.
   */
  complicacion: boolean
  /**
   * Lo que vale el paso hecho bien **a la primera**.
   *
   * El motor no tiene memoria: evalúa un gesto suelto y no sabe si es el primer
   * intento o el séptimo, así que entrega siempre el valor entero y quien llama
   * decide cuánto cobra con `puntosDelPaso`. Para eso hay que llevar la cuenta
   * de los **fallos** de cada paso, no la de los aciertos: un paso se acierta
   * una sola vez y después se avanza, de modo que preguntar «¿ya estaba
   * resuelto?» antes de sumar es una guarda que nunca se cumple en falso, y
   * deja el mismo puntaje para quien acierta a la primera y para quien
   * reintenta veinte veces (D-059).
   */
  puntos: number
}

const PUNTOS_POR_OMISION = 10

/** Lo que vale el paso entero. En un solo sitio: lo preguntan tres funciones. */
const valorDelPaso = (paso: PasoQuirurgico): number =>
  typeof paso.puntos === 'number' ? paso.puntos : PUNTOS_POR_OMISION

const nada = (mensaje: string, resultado: Resultado, complicacion = false): Evaluacion => ({
  resultado,
  mensaje,
  avanza: false,
  complicacion,
  puntos: 0,
})

const redondear1 = (n: number) => Math.round(n * 10) / 10

/**
 * Los tres topes contra los que se mide la reducción, ya resueltos.
 *
 * Está fuera de `evaluarGesto` para que no haya dos sitios que decidan lo
 * mismo. Los respaldos —el 5, y la diástasis heredando el tope del
 * desplazamiento— estaban escritos dentro de la evaluación y repetidos en
 * `instruccionDelPaso`, y el panel de medidas de la consola prefería no enseñar
 * ningún tope antes que arriesgarse a enseñar un número y medir contra otro.
 * Con la regla en un solo sitio la consola puede pintar el número exacto con el
 * que se la va a juzgar, que es lo que evita que «Aplicar paso» se acabe usando
 * de sonda.
 *
 * La diástasis hereda el tope del desplazamiento y no el 5 fijo: un paso que
 * aprieta la alineación a 2 mm y no dice nada del hueco no está pidiendo que el
 * hueco sea más laxo que la alineación. En la práctica toda fila trae los tres
 * escritos (`defaultValue: 5` en `Cirugias.ts`); los respaldos son para lo que
 * devuelva la API de antes de esa migración.
 */
export function topesDeReduccion(paso: PasoQuirurgico): {
  desplazamiento: number
  diastasis: number
  angulacion: number
} {
  const desplazamiento = paso.toleranciaDesplazamiento ?? 5
  return {
    desplazamiento,
    diastasis: paso.toleranciaDiastasis ?? desplazamiento,
    angulacion: paso.toleranciaAngulacion ?? 5,
  }
}

/** «8–20 N», «desde 8 N», «hasta 20 N»: un rango con un extremo o con los dos. */
const rangoEnTexto = (
  minimo: number | null | undefined,
  maximo: number | null | undefined,
  unidad: string,
): string | null => {
  if (typeof minimo === 'number' && typeof maximo === 'number') return `${minimo}–${maximo} ${unidad}`
  if (typeof minimo === 'number') return `desde ${minimo} ${unidad}`
  if (typeof maximo === 'number') return `hasta ${maximo} ${unidad}`
  return null
}

/**
 * El rango útil de fuerza del paso, escrito; `null` si el paso no lo acota.
 *
 * Lo usan la instrucción de pantalla y el rótulo del deslizador de la consola.
 * Los dos campos son independientes y opcionales, así que «no más de 8 N» es un
 * paso válido: por eso hay tres formas y no una.
 */
export const rangoDeFuerzaEnTexto = (paso: PasoQuirurgico): string | null =>
  rangoEnTexto(paso.fuerzaMinima, paso.fuerzaMaxima, 'N')

/** Lo mismo para la longitud de la incisión. */
export const rangoDeTrazoEnTexto = (paso: PasoQuirurgico): string | null =>
  rangoEnTexto(paso.trazoMinimo, paso.trazoMaximo, 'mm')

/**
 * Qué se le mide a este paso.
 *
 * Lo normal es que el paso lo diga: el médico lo elige de una lista. Pero
 * `'instrumento'` no prueba que lo eligiera nadie, y por eso no se toma como
 * una declaración:
 *
 * - es el valor con el que `casoParaLaConsola` rellena el campo ausente
 *   (`casoQuirurgico.ts`, `texto(p.objetivo) ?? 'instrumento'`), de modo que a
 *   la consola nunca llega un paso sin objetivo y la deducción de más abajo
 *   quedaba como código muerto —ese mismo sitio resuelve ahora el objetivo con
 *   esta función antes de mandarlo al navegador, porque la consola pinta sus
 *   mandos por el campo y tiene que ver lo mismo que se mide aquí—;
 * - y es lo que la migración de D-059 escribió, como `DEFAULT` de la columna
 *   nueva, en **toda** fila que ya existía: los pasos anteriores al 10 de
 *   septiembre con su rango de fuerza escrito quedaron marcados así.
 *
 * Ante ese valor se sigue deduciendo del **rango** que el paso declara, pero
 * solo del que nadie pudo escribir por él. Suponer lo contrario sería peor que
 * quedarse corto: un paso con su rango de fuerza guardado se aprobaría sin
 * mirar la fuerza, y nadie vería el fallo, porque no hay error que enseñar. Un
 * rango escrito y no evaluado es una regla que el residente cree estar
 * cumpliendo.
 *
 * Los cuatro números de la fuerza y del trazo sí prueban una intención: sus
 * columnas se crearon sin `DEFAULT` (`20260906_150718_inicial.ts`, fuerza; y
 * `20260910_125801_caso_quirurgico.ts`, trazo) y los campos no tienen
 * `defaultValue`, así que un número ahí lo tecleó alguien.
 *
 * El precio es el inverso, y se acepta a sabiendas: quien elija «elegir el
 * instrumento» y deje escrito el rango de la fuerza o del trazo —el panel
 * pinta los siete números siempre, uno debajo de otro— obtiene ese otro. Ese
 * descuido se ve en la instrucción de pantalla, que sale de aquí mismo; el
 * silencio del caso contrario no se ve en ninguna parte.
 */
export function objetivoDelPaso(paso: PasoQuirurgico): Objetivo {
  if (paso.objetivo && paso.objetivo !== 'instrumento') return paso.objetivo
  const declara = (...valores: Array<number | null | undefined>) =>
    valores.some((v) => typeof v === 'number')

  if (declara(paso.fuerzaMinima, paso.fuerzaMaxima)) return 'fuerza'
  if (declara(paso.trazoMinimo, paso.trazoMaximo)) return 'trazo'
  // Las tres tolerancias no deducen nada cuando el paso ya trae 'instrumento'
  // escrito: tienen `defaultValue: 5` en `Cirugias.ts` y `DEFAULT 5` en la
  // migración, de modo que **toda** fila las lleva puestas. Deducir de ellas
  // convertía cada paso de instrumento en uno de reducción imposible: el caso
  // de prueba arranca con 9.8° de angulación, la consola solo pinta los mandos
  // de girar cuando el paso dice 'reduccion', y el segundo paso —que solo pedía
  // coger el punzón— no se podía superar. Solo hablan cuando el paso llega sin
  // objetivo ninguno, que es la forma que ya no produce la consola pero sí
  // puede llegar de la API.
  if (
    !paso.objetivo &&
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

  const puntos = valorDelPaso(paso)
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
        // Una incisión de más deja cicatriz y expone tejido sin necesidad: se
        // marca como complicación, y **no** se avanza.
        //
        // Que no avance es deliberado, y es la mitad de la lectura de D-059
        // («quedarse corto es reintento, pasarse es complicación»). La otra
        // mitad —que pasarse tenía que costar más— vive en `puntosDelPaso`:
        // repetir se repite igual, pero el paso ya no puntúa. Sin eso los dos
        // desenlaces salían por el mismo sitio y terminaban con el mismo
        // número.
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
      const {
        desplazamiento: topeDesplazamiento,
        diastasis: topeDiastasis,
        angulacion: topeAngulacion,
      } = topesDeReduccion(paso)

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
  // Con un solo extremo declarado el mando también tiene que arrancar dentro.
  // Los dos campos son independientes y opcionales, así que «no más de 8 N» es
  // un paso perfectamente válido, y devolver el 10 de siempre dejaba el control
  // por encima del techo: el residente aplicaba el paso sin haber tocado nada y
  // se le anotaba una complicación que había puesto el código al colocar el
  // mando, no él al decidir.
  if (typeof fuerzaMinima === 'number') return fuerzaMinima
  if (typeof fuerzaMaxima === 'number') return Math.min(10, fuerzaMaxima)
  return 10
}

/**
 * Lo que vale el caso entero: la suma de sus pasos, todos enteros.
 *
 * Es la **referencia** del caso, no un tope alcanzable, y quien venga a tocar
 * este número tiene que saberlo antes de tocarlo: `puntosDelPaso` cobra la
 * mitad tras un fallo y cero tras una complicación, así que el «/ máximo» del
 * marcador deja de poder igualarse en cuanto se falla un paso, y con una
 * complicación se aleja el doble. Está puesto así a propósito —un tope que
 * bajara con cada tropiezo escondería lo que costó el caso—, pero son dos
 * cuentas de lo mismo: cambiar esta sin mirar la otra deja un marcador que
 * miente en una dirección o en la otra.
 */
export function puntajeMaximo(pasos: PasoQuirurgico[]): number {
  return pasos.reduce((total, paso) => total + valorDelPaso(paso), 0)
}

/** Lo que el residente arrastra de este mismo paso cuando por fin lo acierta. */
export interface HistorialDelPaso {
  /** Hubo antes un gesto que no completó el paso y no dañó nada. */
  fallo: boolean
  /** Hubo antes un gesto que dañó: el trazo o la fuerza se pasaron. */
  complicacion: boolean
}

/**
 * Lo que se cobra por acertar el paso, contando lo que costó llegar.
 *
 * Aquí se cierra la decisión que llevaba dos olas dando vueltas: **pasarse
 * tenía que costar más que quedarse corto, y costaba exactamente lo mismo**.
 * Los dos desenlaces devuelven `avanza: false`, o sea reintento, y la
 * complicación no salía de la consola —llegaba a `anotar`, diez líneas de
 * estado local que se pierden al recargar—, así que seccionar la fascia y no
 * llegar a la dermis terminaban con el mismo número. En un módulo que enseña
 * por error, eso enseña que el exceso es gratis.
 *
 * La regla queda así:
 *
 * - a la primera, el paso entero;
 * - tras un fallo inocuo, la mitad hacia abajo: acertar después de que la
 *   consola te corrija sigue siendo haber aprendido el gesto, y cero igualaría
 *   al que se atasca con el que abandona;
 * - tras una complicación, cero. El daño no se compensa acertando después.
 *
 * De las dos salidas que se plantearon se toma esta y no la otra. La otra era
 * que el gesto que daña avanzara, marcado y sin puntos, y se descarta por dos
 * razones. Avanzar es un premio, y dárselo a quien seccionó lo que no debía
 * —mientras el que se queda corto tiene que repetir— enseña justo al revés. Y
 * para que esa marca significara algo tendría que sobrevivir al recargado, lo
 * que exige un campo nuevo en `Actividad` y su migración: sin eso el exceso
 * volvería a ser gratis y además sin rastro. El puntaje, en cambio, dura todo
 * el caso y se lee al terminar, que es donde el residente mira.
 *
 * Lo que esto cuesta, y hay que saberlo antes de tocarlo: `puntajeMaximo` suma
 * los pasos enteros, así que el tope del marcador deja de ser alcanzable en
 * cuanto se falla un paso, y con una complicación se aleja el doble. Es la
 * referencia del caso, no una promesa de que se pueda igualar; son dos cuentas
 * de lo mismo y quien cambie una tiene que mirar la otra.
 *
 * Son dos banderas y no dos contadores a propósito: el segundo fallo del mismo
 * paso no empeora nada. Cobrar por intento invitaría a dejar el paso a medias
 * antes que a insistir, y lo que el módulo mide es si el gesto acabó saliendo.
 */
export function puntosDelPaso(paso: PasoQuirurgico, historial: HistorialDelPaso): number {
  if (historial.complicacion) return 0
  const valor = valorDelPaso(paso)
  return historial.fallo ? Math.floor(valor / 2) : valor
}

/**
 * Qué necesita el residente tener hecho para que el paso se pueda aplicar.
 *
 * Sirve para escribir la instrucción en pantalla sin repetir la lógica de
 * evaluación en la interfaz.
 */
export function instruccionDelPaso(paso: PasoQuirurgico): string {
  // Las cuatro ramas empiezan por el instrumento porque `evaluarGesto` lo exige
  // en las cuatro: sin instrumento no hay gesto, sea cual sea el objetivo. Solo
  // dos lo nombraban, y en un paso de trazo la instrucción decía «active el modo
  // Trazar y arrastre» sin una palabra de la bandeja: el residente trazaba,
  // pulsaba y recibía un «Seleccione un instrumento» que contradecía la única
  // frase que la consola le había dado.
  const conInstrumento = (resto: string) => `Coja el instrumento de la bandeja y ${resto}`

  switch (objetivoDelPaso(paso)) {
    case 'trazo': {
      const rango = rangoDeTrazoEnTexto(paso)
      return conInstrumento(
        `active el modo Trazar para arrastrar sobre el modelo.${rango ? ` Objetivo: ${rango}.` : ''}`,
      )
    }
    case 'reduccion': {
      const topes = topesDeReduccion(paso)
      return conInstrumento(
        `active el modo Mover, arrastre el fragmento a su sitio y corrija la angulación. Se aceptan hasta ${topes.desplazamiento} mm de desplazamiento, ${topes.diastasis} mm de diástasis y ${topes.angulacion}° de angulación.`,
      )
    }
    case 'fuerza': {
      // El rango se escribe también aquí, y no solo en el rótulo del
      // deslizador: la instrucción es lo que se lee antes de tocar nada, y
      // mandar graduar una fuerza sin decir hacia dónde convierte el paso en
      // una adivinanza cuyo error se anota como complicación quirúrgica.
      const rango = rangoDeFuerzaEnTexto(paso)
      return conInstrumento(
        `gradúe la fuerza antes de aplicar el paso.${rango ? ` Rango útil: ${rango}.` : ''}`,
      )
    }
    default:
      return 'Elija el instrumento correcto de la bandeja y aplique el paso.'
  }
}

// ---------------------------------------------------------------------------
// Lo que la consola decide antes de pintar
//
// Las cinco de abajo vivían dentro de `ConsolaQuirurgica.tsx`. Ninguna toca
// React ni three.js, pero ahí ninguna prueba las alcanzaba: un lienzo en negro,
// un deslizador imposible de acertar o una medida inicial mal convertida pasan
// la suite entera en verde y solo se ven recorriendo el caso en el navegador.
//
// Están en este módulo y no en `piezasDelCaso.ts`, que es donde las mandaba el
// encargo de la ola anterior: aquel describe la lista de piezas **mientras se
// edita en el panel** (`PiezaEnEdicion`, con sus campos todavía sin depurar), y
// estas hablan del caso ya listo para jugarse, que es de lo que trata este
// archivo. La pieza se pide por su forma —`nodo` y `rol`— y no por el tipo de
// `LienzoQuirurgico`, para que el motor no dependa del componente al que sirve:
// un `import` de ahí arrastraría three.js a un módulo que se prueba en Node.
// ---------------------------------------------------------------------------

/** Lo único que estas reglas necesitan saber de una pieza del modelo. */
export interface PiezaConRol {
  nodo: string
  rol: string
}

/** Lo único que necesitan saber de un paso: qué declara ver. */
export interface PasoConMuestra {
  muestra?: string[]
}

/**
 * Lo que un paso declara ver, heredando del último que dijera algo.
 *
 * Es la promesa que el panel le hace al traumatólogo: «Deje la lista vacía para
 * que se vea lo mismo que en el paso anterior» (`Cirugias.ts`).
 */
export function declaracionDelPaso(
  pasos: PasoConMuestra[],
  indicePaso: number,
): string[] | null {
  for (let i = indicePaso; i >= 0; i--) {
    const muestra = pasos[i]?.muestra
    if (muestra && muestra.length > 0) return muestra
  }
  return null
}

/**
 * Qué nodos se encienden ahora, y qué capas hubo que devolver a la vista.
 *
 * El cruce con las capas apagadas tiene un suelo, y el suelo es lo que arregla
 * el fallo: sin él, un paso que declara ver solo la piel —una incisión se traza
 * sobre la piel, es exactamente lo que el traumatólogo va a escribir— salía de
 * aquí como lista vacía, y `mostrar([])` apaga TODAS las mallas del modelo. El
 * lienzo se quedaba gris sin un mensaje, «Encuadrar» no respondía porque no hay
 * caja que encuadrar, y la única salida era una casilla del panel izquierdo que
 * nadie relaciona con lo que acaba de pasar. Antes que no enseñar nada, se
 * enciende lo que haga falta y se dice por qué.
 */
export function visibilidadDelPaso(
  pasos: PasoConMuestra[],
  piezas: PiezaConRol[],
  indicePaso: number,
  capasApagadas: Set<string>,
): { nodos: string[] | null; encender: string[] } {
  const declarados = declaracionDelPaso(pasos, indicePaso)
  const base = declarados ?? piezas.filter((p) => p.rol !== 'implante').map((p) => p.nodo)
  // Un caso sin piezas escritas no es un caso sin nada que ver: es uno cuya
  // lista todavía no se ha rellenado. `null` enseña el modelo entero, que es lo
  // único útil que se puede hacer con él; `[]` lo apagaría del todo.
  if (base.length === 0) return { nodos: null, encender: [] }

  const rolDe = new Map(piezas.map((p) => [p.nodo, p.rol]))
  const visibles = base.filter((nodo) => {
    const rol = rolDe.get(nodo)
    return !rol || !capasApagadas.has(rol)
  })
  if (visibles.length > 0) return { nodos: visibles, encender: [] }

  const encender: string[] = []
  for (const nodo of base) {
    const rol = rolDe.get(nodo)
    if (rol && capasApagadas.has(rol) && !encender.includes(rol)) encender.push(rol)
  }
  return { nodos: base, encender }
}

/**
 * Las capas apagadas que el paso declara ver: al entrar en él se encienden.
 *
 * El paso manda sobre el interruptor, que es para lo que existe `muestra`. Al
 * revés —restando las capas a lo que el paso declara— una incisión escrita
 * sobre la piel acababa trazada sobre el hueso desnudo, y lo único que lo
 * indicaba era una casilla desmarcada en la otra punta de la pantalla.
 */
export function capasQueEnciendeElPaso(
  pasos: PasoConMuestra[],
  piezas: PiezaConRol[],
  indicePaso: number,
  capasApagadas: Set<string>,
): string[] {
  const declarados = declaracionDelPaso(pasos, indicePaso)
  if (!declarados) return []
  const rolDe = new Map(piezas.map((p) => [p.nodo, p.rol]))
  const roles: string[] = []
  for (const nodo of declarados) {
    const rol = rolDe.get(nodo)
    if (rol && capasApagadas.has(rol) && !roles.includes(rol)) roles.push(rol)
  }
  return roles
}

/**
 * Los topes del deslizador de fuerza.
 *
 * El 0-120 fijo que había aquí era un número inventado, y con un paso de
 * `fuerzaMinima: 200` el rótulo se quedaba en «Fuerza · 200 N» con el pulgar
 * clavado en el tope: el residente no podía acertar nunca. Se acota al rango
 * del paso, pero **con margen a los dos lados**, y el margen es la parte que no
 * se puede quitar: un deslizador que empieza y acaba dentro de la ventana buena
 * aprueba cualquier posición, y un paso en el que no se puede fallar no enseña
 * nada, que es justo lo contrario de D-059.
 */
export function rangoDelDeslizadorDeFuerza(paso: PasoQuirurgico): { min: number; max: number } {
  const { fuerzaMinima: minima, fuerzaMaxima: maxima } = paso
  if (typeof minima === 'number' && typeof maxima === 'number') {
    const margen = Math.max(5, Math.round((maxima - minima) / 2))
    return { min: Math.max(0, Math.round(minima - margen)), max: Math.round(maxima + margen) }
  }
  // Con un solo extremo declarado, el otro lado no existe; el declarado hay que
  // poder cruzarlo igual, por arriba o por abajo.
  if (typeof minima === 'number') {
    return { min: Math.max(0, Math.round(minima / 2)), max: Math.round(minima * 2) + 5 }
  }
  if (typeof maxima === 'number') return { min: 0, max: Math.round(maxima * 1.5) + 5 }
  // Sin ningún tope cualquier fuerza vale. `Cirugias.ts` no deja publicar un
  // paso de fuerza así, pero la API puede devolver uno antiguo.
  return { min: 0, max: 120 }
}

/**
 * Las medidas del caso recién abierto, antes de tocar nada.
 *
 * El caso guarda **cuánto está desplazado el fragmento al empezar**, no dónde
 * está, y lo guarda en milímetros; de ahí salen las tres cifras del panel antes
 * del primer arrastre. Se pasa por `desplazamientoCompleto` y no se leen los
 * seis campos a pelo porque un caso a medio escribir los trae a medias, y un
 * `undefined` colándose en la aritmética deja las tres medidas en `NaN`: el
 * panel enseña «NaN mm» y `evaluarGesto` no aprueba nunca, porque toda
 * comparación contra `NaN` es falsa.
 */
export function medidaInicial(caso: {
  desplazamientoInicial?: Desplazamiento | null
  ejeLargo?: EjeLargo
}): Medidas {
  const d = desplazamientoCompleto(caso.desplazamientoInicial)
  return medirReduccion(
    { x: d.x, y: d.y, z: d.z },
    { x: d.giroX, y: d.giroY, z: d.giroZ },
    caso.ejeLargo,
  )
}

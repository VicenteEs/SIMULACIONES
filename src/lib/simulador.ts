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

import type { LecturaClinica } from '@/atlas/lecturaClinica'
import type { GestoDeMas } from './gestoDeMas'
import { esEstructuraNoble } from '@/lib/piezasDelCaso'
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
  // D-169: la broca y la fijación con placa también se miden.
  SIN_PERFORACION: 'sin-perforacion',
  PERFORACION_CALIBRE: 'perforacion-calibre',
  PERFORACION_TORCIDA: 'perforacion-torcida',
  PERFORACION_UNICORTICAL: 'perforacion-unicortical',
  PERFORACION_PASADA: 'perforacion-pasada',
  SIN_PLACA: 'sin-placa',
  TORNILLOS_INSUFICIENTES: 'tornillos-insuficientes',
  TORNILLO_UNICORTICAL: 'tornillo-unicortical',
  TORNILLO_LARGO: 'tornillo-largo',
  // D-309: un fragmento principal sin los tornillos que lo sostienen, o la placa entera sobre uno solo.
  TORNILLOS_POR_FRAGMENTO: 'tornillos-por-fragmento',
  // D-308: el implante bloqueó el foco con la fractura fuera de los topes de la reducción.
  FIJACION_SIN_REDUCIR: 'fijacion-sin-reducir',
  // P-004 E10: la fijación que tiene que comprimir y no comprime.
  SIN_COMPRESION: 'sin-compresion',
  // P-003 E10: trabajar por planos, un músculo concreto.
  SIN_MUSCULO_ELEGIDO: 'sin-musculo-elegido',
  PLANO_SIN_HACER: 'plano-sin-hacer',
  // P-012 E6: cortar o perforar un vaso o un nervio.
  LESION_VASCULAR: 'lesion-vascular',
  LESION_NERVIOSA: 'lesion-nerviosa',
  // D-330: en evaluación, una segunda incisión aparte o una segunda trayectoria en el paso que mide la primera.
  INCISION_DE_MAS: 'incision-de-mas',
  TRAYECTORIA_DE_MAS: 'trayectoria-de-mas',
  CORRECTO: 'correcto',
} as const

export type Resultado = (typeof RESULTADOS)[keyof typeof RESULTADOS]

export type Objetivo = 'instrumento' | 'trazo' | 'reduccion' | 'fuerza' | 'perforacion' | 'fijacion' | 'planos'

/** Cuánto tiene que haber retraído un músculo, como mínimo, para dar por hecho «separarlo» (P-003 E10). */
export const RETRACCION_MINIMA_MM = 5

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
  /**
   * Reducción (D-305): la técnica que decide los topes por omisión de cada plano. «Alineación» es la estabilidad
   * relativa (clavo, placa puente), con los criterios de Trafton; «anatómica», la absoluta (tracción, compresión, foco
   * articular). Vacía, el paso se mide como antes: un solo tope para el giro total.
   */
  tecnicaDeReduccion?: TecnicaDeReduccion | null
  /** Reducción (D-305): el tope de cada plano, en grados, y el del acortamiento, en mm. Vacíos, los de la técnica. */
  toleranciaCoronal?: number | null
  toleranciaSagital?: number | null
  toleranciaRotacion?: number | null
  toleranciaAcortamiento?: number | null
  fuerzaMinima?: number | null
  fuerzaMaxima?: number | null
  /** Perforación (D-169): el calibre que debe tener la broca, en mm. Vacío: cualquiera. */
  calibreBroca?: number | null
  /** Perforación: entre qué ángulos con el eje del hueso se acepta (90° es perpendicular). */
  anguloMinimo?: number | null
  anguloMaximo?: number | null
  /** Perforación y fijación: se exige que crucen las dos corticales. */
  exigeBicortical?: boolean | null
  /** Fijación: cuántos tornillos hacen falta como mínimo, contados todos juntos. */
  tornillosMinimos?: number | null
  /**
   * Fijación (D-309): cuántos tornillos de la placa pide **cada** fragmento principal. Vacío, lo de la AO para una placa
   * en la diáfisis (`tornillosPorFragmentoPorOmision`); 0, el paso no los cuenta por fragmento.
   */
  tornillosPorFragmento?: number | null
  /**
   * Fijación (P-004 E10): la fijación tiene que comprimir la fractura —con un orificio oval y un tornillo excéntrico, con la broca de
   * deslizamiento o con rosca parcial—. Opcional: sin marcar, el paso no mira la compresión.
   */
  exigeCompresion?: boolean | null
  /** Planos (P-003 E10): el nombre del objeto del músculo sobre el que se trabaja, y si hay que cortarlo o separarlo. */
  musculoDelPlano?: string | null
  accionDelPlano?: 'cortar' | 'separar' | null
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
  /**
   * La reducción leída como en la ficha (D-303): de ella salen el tope por plano y la diferencia entre diástasis y
   * acortamiento. Sin ella —un gesto armado a mano, o de antes— se juzga con las tres cifras de arriba.
   */
  lectura?: LecturaClinica | null
  fuerza?: number
  /** La última perforación hecha en el paso, o `undefined` si no hay ninguna. */
  perforacion?: {
    diametroMm: number
    anguloConElEje: number
    bicortical: boolean
    /** Cuánto pasó de largo la cortical opuesta, en mm. */
    sePasoMm: number
  }
  /**
   * Lo que hay fijado: si hay placa, cuántos tornillos, cuántos bicorticales y cuántos largos.
   *
   * `porFragmento` (D-309) son los tornillos de la placa en cada fragmento principal: los dos trozos con más agujeros
   * debajo. Solo llega con fractura y con la placa asentada; sin él, el paso cuenta los tornillos todos juntos, como antes.
   * Con un solo trozo en la lista, la placa entera cae sobre un fragmento y no cruza la fractura.
   */
  fijacion?: {
    placa: boolean
    tornillos: number
    bicorticales: number
    largos: number
    compresionMm?: number
    porFragmento?: TornillosDelFragmento[]
  }
  /**
   * El músculo elegido con «Info» y lo hecho con él (P-003 E10): su nodo, si se va a cortar o a separar, si se cortó
   * y cuánto está retraído. `nodo` es `null` mientras no se haya elegido ninguno.
   */
  plano?: { nodo: string | null; accion: 'cortar' | 'separar' | null; cortado: boolean; retraidoMm: number }
}

/** Los tornillos de la placa en un fragmento principal (D-309). */
export interface TornillosDelFragmento {
  /** El nodo de la malla del trozo: de él sale el hueso, y del hueso lo que pide la AO. */
  nodo: string
  /** Cómo lo ve quien opera: la etiqueta de la pieza o, sin ella, el nodo. */
  nombre: string
  tornillos: number
  /** Cuántos de esos son bloqueados: con todos bloqueados bastan tres también en el fémur y el húmero. */
  bloqueados: number
}

/**
 * Cuántos tornillos de la placa pide un fragmento principal por omisión (D-309): lo de la AO para una placa en la
 * diáfisis.
 *
 * - Tres bicorticales, seis corticales, en la tibia, el antebrazo y lo que no se reconozca.
 * - Cuatro en el fémur y el húmero, que cargan más: siete u ocho corticales.
 * - Tres cuando todos los del fragmento son bloqueados, como en una placa puente, sea cual sea el hueso.
 *
 * Los valida Cristóbal; hasta entonces mandan estos. El hueso sale del nombre del nodo («femur_distal»,
 * «humero_proximal») porque es lo único que el motor sabe de él: un modelo con otros nombres pide tres, que es lo menos
 * que la AO acepta en una diáfisis, y el editor lo cambia en el paso.
 */
export function tornillosPorFragmentoPorOmision(trozo: Pick<TornillosDelFragmento, 'nodo' | 'tornillos' | 'bloqueados'>): number {
  if (trozo.tornillos > 0 && trozo.bloqueados >= trozo.tornillos) return 3
  return /f[eé]mur|h[uú]mer/i.test(trozo.nodo) ? 4 : 3
}

/** Lo que un paso pide a un fragmento: lo que escribió el editor o, sin nada escrito, lo de la AO. */
export const tornillosQuePideElFragmento = (paso: PasoQuirurgico, trozo: TornillosDelFragmento): number =>
  typeof paso.tornillosPorFragmento === 'number' ? paso.tornillosPorFragmento : tornillosPorFragmentoPorOmision(trozo)

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
const conComa = (n: number) => String(redondear1(n)).replace('.', ',')

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
export function topesDeReduccion(paso: PasoQuirurgico): TopesDeReduccion {
  const tecnica = paso.tecnicaDeReduccion && paso.tecnicaDeReduccion in TOPES_POR_TECNICA ? TOPES_POR_TECNICA[paso.tecnicaDeReduccion] : null
  // La técnica pone techo y no suelo (D-305): el desplazamiento y la diástasis llevan `DEFAULT 5` en la base, así que
  // un 5 ahí no prueba que nadie lo eligiera, y una reducción anatómica con 5 mm de escalón no lo es. Lo que sí se
  // tecleó más estricto, manda.
  const conTecho = (valor: number, techo: number | undefined) => (typeof techo === 'number' ? Math.min(valor, techo) : valor)
  const desplazamientoEscrito = paso.toleranciaDesplazamiento ?? 5
  const desplazamiento = conTecho(desplazamientoEscrito, tecnica?.desplazamiento)
  const diastasis = conTecho(paso.toleranciaDiastasis ?? desplazamientoEscrito, tecnica?.diastasis)
  const angulacion = paso.toleranciaAngulacion ?? 5
  const coronal = paso.toleranciaCoronal ?? tecnica?.coronal ?? null
  const sagital = paso.toleranciaSagital ?? tecnica?.sagital ?? null
  const rotacion = paso.toleranciaRotacion ?? tecnica?.rotacion ?? null
  const porPlano = coronal !== null || sagital !== null || rotacion !== null
  return {
    desplazamiento,
    diastasis,
    angulacion,
    // Con un plano pedido, los que no se pidieron toman el tope del giro total: medirlos «sin tope» los regalaría.
    coronal: porPlano ? (coronal ?? angulacion) : null,
    sagital: porPlano ? (sagital ?? angulacion) : null,
    rotacion: porPlano ? (rotacion ?? angulacion) : null,
    acortamiento: paso.toleranciaAcortamiento ?? tecnica?.acortamiento ?? diastasis,
  }
}

/**
 * Lo que una reducción tiene fuera de sus topes, dicho cifra a cifra; vacío si está dentro (D-305).
 *
 * Con la lectura clínica del gesto, el giro se juzga plano a plano si el paso lo pide, y a lo largo del eje se separa
 * lo que los trozos se abren (diástasis) de lo que cabalgan (acortamiento). Sin ella —un gesto de antes, o armado a
 * mano— se juzga como siempre: el giro total y lo de a lo largo en los dos sentidos. Si el paso pide topes por plano y
 * el gesto no trae con qué partir el giro, se le exige al total el más estricto: no hay forma de saber de qué plano es.
 *
 * Los planos se nombran sin varo ni valgo: el motor no sabe de qué lado es el hueso, y la consola, que sí, ya lo dice
 * en su panel. Un «8° de valgo» escrito aquí en una pierna izquierda podría ser un varo.
 */
export function reduccionFueraDeLosTopes(gesto: MedidaDeLaReduccion, topes: TopesDeReduccion): string[] {
  const l = gesto.lectura ?? null
  const fuera: string[] = []
  const mira = (valor: number, tope: number, texto: string, unidad: 'mm' | '°') => {
    if (!(valor <= tope)) {
      // Con un decimal y no con `cifra`, que redondea a entero desde 10: «10° (hasta 10°)» para un 10,4 que no pasa.
      const cuanto = Number.isFinite(valor) ? conComa(valor) : '?'
      fuera.push(unidad === '°' ? `${cuanto}° ${texto} (hasta ${conComa(tope)}°)` : `${cuanto} mm ${texto} (hasta ${conComa(tope)} mm)`)
    }
  }
  mira(gesto.desplazamiento ?? Infinity, topes.desplazamiento, 'de desplazamiento', 'mm')
  if (l) {
    mira(Math.max(0, redondear1(l.axial)), topes.diastasis, 'de diástasis', 'mm')
    mira(Math.max(0, redondear1(-l.axial)), topes.acortamiento, 'de acortamiento', 'mm')
  } else {
    // Sin la lectura no se sabe hacia dónde: la cifra de siempre, contra el más estricto de los dos.
    mira(gesto.diastasis ?? Infinity, Math.min(topes.diastasis, topes.acortamiento), 'de diástasis', 'mm')
  }
  if (topes.coronal !== null && topes.sagital !== null && topes.rotacion !== null) {
    if (l) {
      mira(Math.abs(redondear1(l.valgo)), topes.coronal, 'en el plano coronal', '°')
      mira(Math.abs(redondear1(l.recurvatum)), topes.sagital, 'en el plano sagital', '°')
      mira(Math.abs(redondear1(l.rotacion)), topes.rotacion, 'de rotación', '°')
    } else {
      mira(gesto.angulacion ?? Infinity, Math.min(topes.coronal, topes.sagital, topes.rotacion), 'de angulación', '°')
    }
  } else {
    mira(gesto.angulacion ?? Infinity, topes.angulacion, 'de angulación', '°')
  }
  return fuera
}

/**
 * Los topes dichos en una frase, para la instrucción: «5 mm de desplazamiento, 5 mm de diástasis y 5° de angulación».
 * El acortamiento y los planos solo salen si el paso los pide, para que un caso de antes lea lo mismo que leía.
 */
export function topesEnTexto(topes: TopesDeReduccion): string {
  const partes = [`${conComa(topes.desplazamiento)} mm de desplazamiento`, `${conComa(topes.diastasis)} mm de diástasis`]
  if (topes.acortamiento !== topes.diastasis) partes.push(`${conComa(topes.acortamiento)} mm de acortamiento`)
  if (topes.coronal !== null && topes.sagital !== null && topes.rotacion !== null) {
    partes.push(`${conComa(topes.coronal)}° en el plano coronal`, `${conComa(topes.sagital)}° en el sagital`, `${conComa(topes.rotacion)}° de rotación`)
  } else {
    partes.push(`${conComa(topes.angulacion)}° de angulación`)
  }
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/** Lo de un gesto que mira la reducción: las tres cifras y, si la hay, la lectura clínica que las parte (D-303). */
export type MedidaDeLaReduccion = Pick<Gesto, 'desplazamiento' | 'diastasis' | 'angulacion' | 'lectura'>

/**
 * Lo que se le dice a quien recorre un paso de reducción que no tiene nada que reducir (D-306).
 *
 * Nombra las dos causas porque la consola no sabe cuál es: un trozo que empieza en su sitio puede ser un caso sin
 * referencia —exportado reducido y sin desplazamiento escrito, o desplazado y sin su posición reducida, que lee la pose
 * del archivo como la buena— o un desplazamiento escrito más pequeño que los topes. Las dos las arregla el editor, y
 * las dos dejan el paso sin nada que medir.
 */
export const SIN_NADA_QUE_REDUCIR =
  'Este paso no tiene nada que reducir: el trozo empieza ya dentro de lo que se acepta, porque el caso no sabe dónde va o no lo desplazó. Se puede aplicar, pero no suma puntos ni cuenta en el máximo.'

/**
 * Los pasos de reducción que el caso regala: los que se aprobarían sin mover nada (D-306).
 *
 * Se juzgan con la medida **de partida**, la del trozo recién colocado en su desplazamiento inicial, y no con la de
 * cuando empieza cada paso: un segundo paso de reducción —alinear y después ajustar— empieza donde lo dejó el primero,
 * y estar dentro de sus topes ahí es haberlo hecho bien, no un regalo. Lo que se pregunta es del caso: si el trozo
 * empieza en algún sitio del que haya que traerlo.
 *
 * `null` es que no hay qué medir —el modelo no trae el fragmento—, y deja fuera todos los pasos de reducción: la
 * consola mide ceros sobre un hueso que no se mueve, y antes eso aprobaba el paso.
 *
 * Es la otra cara de la regla que corta al publicar (`motivoSinNadaQueReducir`): aquella mira lo que guarda la fila y
 * no deja publicar el caso que seguro regala; esta mira la escena, que es la única que sabe si el desplazamiento
 * escrito cabe dentro de los topes o si el modelo trae su referencia. Hacen falta las dos porque los casos ya publicados
 * no pasan otra vez por la primera hasta que alguien los guarda.
 */
export function pasosSinNadaQueReducir(
  pasos: readonly (PasoQuirurgico & { id: string })[],
  partida: MedidaDeLaReduccion | null,
): Set<string> {
  const sin = new Set<string>()
  for (const paso of pasos) {
    if (objetivoDelPaso(paso) !== 'reduccion') continue
    if (!partida || reduccionFueraDeLosTopes(partida, topesDeReduccion(paso)).length === 0) sin.add(paso.id)
  }
  return sin
}

/**
 * Los topes con que se juzga la reducción cuando el implante bloquea el foco (D-308).
 *
 * Son los del último paso de reducción hasta el paso en que se está: es la reducción que el caso acaba de pedir, y la
 * que el implante congela. Si el caso todavía no ha pedido ninguna —se fija antes de reducir—, los del primero que la
 * pida. Un caso sin pasos de reducción se juzga con los topes por omisión de `topesDeReduccion`, 5 mm y 5°, que son los
 * mismos de `FOCO_PARA_FIJAR` (`fijacion.ts`): lo que la placa ya avisaba al apoyarse.
 */
export function topesDelFoco(pasos: readonly PasoQuirurgico[], indice: number): TopesDeReduccion {
  for (let i = Math.min(indice, pasos.length - 1); i >= 0; i--) {
    if (objetivoDelPaso(pasos[i]) === 'reduccion') return topesDeReduccion(pasos[i])
  }
  const primero = pasos.find((p) => objetivoDelPaso(p) === 'reduccion')
  return topesDeReduccion(primero ?? {})
}

/**
 * Lo que pasa cuando un implante bloquea el foco: `null` si la reducción estaba dentro de los topes, y una complicación
 * si no (D-308).
 *
 * Bloquear el foco es lo que lo deja quieto: un tornillo que cruza el trazo, la placa con tornillos en los dos
 * fragmentos o el clavo bloqueado arriba y abajo (`focoBloqueado`, en `fijacion.ts`). En pabellón es lo peor que puede
 * pasar con una reducción mala, porque el implante la congela, y por eso es una complicación y no un fallo: cuesta el
 * paso entero. Antes `FOCO_PARA_FIJAR` solo avisaba al apoyar la placa, y fijar sin reducir daba todos los puntos.
 *
 * Se juzga en ese momento y no al pulsar «Aplicar paso», porque la escena deja seguir moviendo el trozo con los
 * tornillos puestos: medido al aplicar, bastaba con fijar mal y reducir después.
 */
export function juicioDelBloqueo(medida: MedidaDeLaReduccion, topes: TopesDeReduccion): Evaluacion | null {
  const fuera = reduccionFueraDeLosTopes(medida, topes)
  if (fuera.length === 0) return null
  return nada(
    `Fijó en mala posición: el implante bloqueó el foco con la fractura sin reducir (${fuera.join(' · ')}). En pabellón habría que retirarlo, reducir y volver a fijar.`,
    RESULTADOS.FIJACION_SIN_REDUCIR,
    true,
  )
}

/** Un vaso o un nervio cortado o perforado (P-012 E6), tal como lo cuenta el lienzo. */
export interface LesionDeEstructura {
  rol: 'vaso' | 'nervio'
  /** El nombre con que el caso enseña la pieza, o el del objeto si no tiene. */
  nombre: string
  /** El bisturí que lo partió, o la broca o la aguja que lo atravesó al pasarse de la cortical opuesta. */
  como: 'corte' | 'perforacion'
}

/**
 * Lo que cuesta cortar o perforar un vaso o un nervio: una complicación del paso, siempre (P-012 E6).
 *
 * Hasta E6 los vasos y los nervios eran «músculo», y el trazo que partía la arteria tibial anterior costaba lo mismo
 * que el que partía el tibial anterior: nada. En pabellón es lo que se teme de cada abordaje —una arteria cortada
 * sangra y hay que repararla; un nervio cortado deja su déficit—, y por eso es una complicación y no un fallo: cuesta
 * el paso entero, como fijar sin reducir (D-308). Y como aquel, se juzga cuando pasa y no al pulsar «Aplicar paso»:
 * lo cortado no se descorta, y medido al aplicar bastaría con cortar en un paso y aplicar en otro.
 *
 * No hay medida que estar dentro o fuera: el lienzo ya decidió que se tocó. Por eso esto no devuelve `null`.
 */
export function juicioDeLaLesion(lesion: LesionDeEstructura): Evaluacion {
  const que = lesion.rol === 'vaso' ? 'un vaso' : 'un nervio'
  const como =
    lesion.como === 'corte' ? `El trazo cortó ${que}` : `Al pasarse de la cortical opuesta, la perforación atravesó ${que}`
  const consecuencia =
    lesion.rol === 'vaso'
      ? 'En pabellón habría que controlar el sangrado y reparar o ligar el vaso.'
      : 'En pabellón habría que buscar los cabos y repararlo, y el déficit puede quedar.'
  return nada(
    `${como}: ${lesion.nombre}. ${consecuencia}`,
    lesion.rol === 'vaso' ? RESULTADOS.LESION_VASCULAR : RESULTADOS.LESION_NERVIOSA,
    true,
  )
}

/**
 * Lo que cuesta, en evaluación, el gesto de más (D-330): una complicación del paso, como lesionar un vaso. Se juzga
 * cuando pasa y no al aplicar, por lo mismo que aquella: la incisión de antes no se descose, y medido al aplicar bastaría
 * con hacer la segunda en el paso siguiente.
 */
export function juicioDelGestoDeMas(que: GestoDeMas): Evaluacion {
  return que === 'incision'
    ? nada(
        'Una segunda incisión aparte, en el paso que mide la incisión: la primera queda en el paciente. En pabellón son dos heridas que cerrar y dos cicatrices.',
        RESULTADOS.INCISION_DE_MAS,
        true,
      )
    : nada(
        'Una segunda trayectoria, en el paso que mide la perforación: el primer agujero queda en el hueso. En pabellón, un agujero de más debilita el hueso y puede llevarse la broca o el tornillo que vengan después.',
        RESULTADOS.TRAYECTORIA_DE_MAS,
        true,
      )
}

/** Las dos técnicas de reducción, con sus topes por omisión (D-305). */
export type TecnicaDeReduccion = 'alineacion' | 'anatomica'

/**
 * Los topes por omisión de cada técnica (D-305). Los valida Cristóbal; hasta entonces mandan estos, y están aquí, en un
 * solo sitio, con su fuente.
 *
 * - **Alineación** (estabilidad relativa: clavo, placa puente). Los criterios de Trafton para la diáfisis de tibia:
 *   varo o valgo hasta 5°, angulación sagital hasta 10°, rotación hasta 10° y acortamiento hasta 10 mm (hay fuentes
 *   que aceptan 15; se toma el más estricto mientras no se valide). No pone techo a la traslación: Trafton la pide como
 *   contacto cortical, y eso ya lo dice el % del diámetro.
 * - **Anatómica** (estabilidad absoluta: tornillo de tracción, placa de compresión, foco articular): 2° en cada plano y
 *   2 mm de traslación, de diástasis y de acortamiento. Es la tolerancia de un escalón articular, y la de una fractura
 *   simple que se va a comprimir: con más hueco no hay compresión que valga.
 */
export const TOPES_POR_TECNICA: Readonly<
  Record<
    TecnicaDeReduccion,
    { coronal: number; sagital: number; rotacion: number; acortamiento: number; desplazamiento?: number; diastasis?: number }
  >
> = {
  alineacion: { coronal: 5, sagital: 10, rotacion: 10, acortamiento: 10 },
  anatomica: { coronal: 2, sagital: 2, rotacion: 2, acortamiento: 2, desplazamiento: 2, diastasis: 2 },
}

/** Los topes de la reducción ya resueltos: lo que pinta la consola y contra lo que se juzga. */
export interface TopesDeReduccion {
  desplazamiento: number
  /** Lo que se pueden separar los trozos a lo largo del eje. */
  diastasis: number
  /** El giro total. Es el que manda mientras el paso no pida un tope por plano. */
  angulacion: number
  /** Por plano, en grados; `null` mientras el paso no pida ninguno (D-305). */
  coronal: number | null
  sagital: number | null
  rotacion: number | null
  /** Lo que pueden cabalgar los trozos. Sin pedirlo, el de la diástasis: antes las dos cosas eran una sola cifra. */
  acortamiento: number
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
  // Los números de la perforación y de la fijación se crearon sin `DEFAULT`
  // (D-169): un número ahí lo tecleó una persona, igual que el rango de la fuerza.
  if (declara(paso.anguloMinimo, paso.anguloMaximo)) return 'perforacion'
  // Los tornillos por fragmento (D-309) tampoco tienen `DEFAULT`: un número ahí también lo tecleó alguien.
  if (declara(paso.tornillosMinimos, paso.tornillosPorFragmento)) return 'fijacion'
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
      const fuera = reduccionFueraDeLosTopes(gesto, topesDeReduccion(paso))
      if (fuera.length > 0) {
        return nada(
          `${paso.insuficiente || 'La reducción todavía no es aceptable.'} (${fuera.join(' · ')})`,
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

    case 'perforacion': {
      const p = gesto.perforacion
      if (!p) {
        return nada(
          'Todavía no hay ninguna perforación. Active el modo Perforar, apunte al hueso y mantenga pulsado.',
          RESULTADOS.SIN_PERFORACION,
        )
      }
      const { calibreBroca, anguloMinimo, anguloMaximo } = paso
      // Pasarse de la cortical opuesta daña lo que hay detrás —tendones, nervios, vasos—: es una complicación, no un
      // reintento, y cuesta el paso entero (`puntosDelPaso`).
      //
      // Va primero, antes que el calibre y el ángulo (D-307). Iba al final, y la broca equivocada que además se pasaba
      // 12 mm salía como «calibre»: un fallo inocuo que al reintentar deja la mitad del paso. El daño ya estaba hecho y
      // no costaba nada, porque se miraba antes lo que no dañaba. Lo que dañó se cobra aunque falte otra cosa.
      if (p.sePasoMm > PASARSE_DE_LA_CORTICAL_MM) {
        return nada(
          `${paso.excesivo || 'La broca pasó de largo la cortical opuesta: riesgo para las partes blandas.'} (${redondear1(p.sePasoMm)} mm de más · hasta ${PASARSE_DE_LA_CORTICAL_MM} mm se tolera)`,
          RESULTADOS.PERFORACION_PASADA,
          true,
        )
      }
      // El calibre se compara a la décima: 3,2 y 3,25 son la misma broca en pabellón.
      if (typeof calibreBroca === 'number' && Math.abs(p.diametroMm - calibreBroca) > 0.05) {
        return nada(
          `${paso.insuficiente || 'La broca no es del calibre que pide este paso.'} (Ø ${redondear1(p.diametroMm)} mm · se pide Ø ${calibreBroca} mm)`,
          RESULTADOS.PERFORACION_CALIBRE,
        )
      }
      const minimo = typeof anguloMinimo === 'number' ? anguloMinimo : 0
      const maximo = typeof anguloMaximo === 'number' ? anguloMaximo : 180
      if (p.anguloConElEje < minimo || p.anguloConElEje > maximo) {
        return nada(
          `${paso.insuficiente || 'La perforación no quedó con la inclinación correcta.'} (${Math.round(p.anguloConElEje)}° con el eje del hueso · se aceptan ${Math.round(minimo)}–${Math.round(maximo)}°)`,
          RESULTADOS.PERFORACION_TORCIDA,
        )
      }
      if (paso.exigeBicortical && !p.bicortical) {
        return nada(
          `${paso.insuficiente || 'La perforación no atravesó la cortical opuesta.'} (se pide bicortical)`,
          RESULTADOS.PERFORACION_UNICORTICAL,
        )
      }
      return bien(paso.exito)
    }

    case 'fijacion': {
      const f = gesto.fijacion
      // Con `exigeCompresion` un tornillo de tracción sin placa también es una fijación que se puede juzgar (P-004 E10).
      if (!f || (!f.placa && !(paso.exigeCompresion && f.tornillos > 0))) {
        return nada(
          'Todavía no hay ninguna placa sobre el hueso. Coja una placa, active el modo Fijar y pique sobre el hueso.',
          RESULTADOS.SIN_PLACA,
        )
      }
      // El tornillo largo primero, por lo mismo que la broca pasada (D-307): ya dañó, y cuenta aunque falte un tornillo.
      if (f.largos > 0) {
        return nada(
          `${paso.excesivo || 'Hay tornillos largos: la punta asoma de más por la cortical opuesta y roza las partes blandas.'} (${f.largos} ${f.largos === 1 ? 'tornillo largo' : 'tornillos largos'})`,
          RESULTADOS.TORNILLO_LARGO,
          true,
        )
      }
      const necesarios = paso.tornillosMinimos ?? 1
      if (f.tornillos < necesarios) {
        return nada(
          `${paso.insuficiente || 'La placa no tiene los tornillos que hacen falta.'} (${f.tornillos} de ${necesarios} tornillos)`,
          RESULTADOS.TORNILLOS_INSUFICIENTES,
        )
      }
      // Por fragmento principal (D-309): el total no basta. Seis tornillos en un solo trozo aprobaban un paso que pedía
      // seis, y una placa así no sostiene nada: el otro fragmento queda colgando. Un 0 escrito en el paso lo apaga.
      const porFragmento = paso.tornillosPorFragmento === 0 ? undefined : f.porFragmento
      if (porFragmento && porFragmento.length < 2) {
        return nada(
          `${paso.insuficiente || 'La placa no cruza la fractura: cada fragmento principal necesita sus tornillos.'} (${
            porFragmento.length === 1 ? `todos sus agujeros caen en ${porFragmento[0].nombre}` : 'ningún agujero cae sobre el hueso'
          })`,
          RESULTADOS.TORNILLOS_POR_FRAGMENTO,
        )
      }
      const cortos = (porFragmento ?? []).filter((t) => t.tornillos < tornillosQuePideElFragmento(paso, t))
      if (cortos.length > 0) {
        return nada(
          `${paso.insuficiente || 'Un fragmento principal no queda sostenido: la placa necesita sus tornillos a cada lado de la fractura.'} (${cortos
            .map((t) => `${t.nombre}: ${t.tornillos} de ${tornillosQuePideElFragmento(paso, t)} tornillos`)
            .join(' · ')})`,
          RESULTADOS.TORNILLOS_POR_FRAGMENTO,
        )
      }
      if (paso.exigeBicortical && f.bicorticales < f.tornillos) {
        return nada(
          `${paso.insuficiente || 'Hay tornillos que no cruzan las dos corticales.'} (${f.bicorticales} de ${f.tornillos} bicorticales)`,
          RESULTADOS.TORNILLO_UNICORTICAL,
        )
      }
      if (paso.exigeCompresion && !((f.compresionMm ?? 0) > 0)) {
        return nada(
          `${paso.insuficiente || 'La fijación no comprime la fractura.'} Con un orificio oval se broca excéntrico, lejos de la fractura; con un tornillo de tracción, con la broca de deslizamiento o con rosca parcial.`,
          RESULTADOS.SIN_COMPRESION,
        )
      }
      return bien(paso.exito)
    }

    case 'planos': {
      const pedido = paso.musculoDelPlano ?? ''
      const accion = paso.accionDelPlano === 'separar' ? 'separar' : 'cortar'
      const p = gesto.plano
      if (!p?.nodo || p.nodo !== pedido || p.accion !== accion) {
        return nada(
          `Elija con «Seleccionar estructura» el músculo de este paso y pulse «${accion === 'cortar' ? 'Cortar' : 'Separar'}».`,
          RESULTADOS.SIN_MUSCULO_ELEGIDO,
        )
      }
      if (accion === 'cortar' && !p.cortado) {
        return nada(
          `${paso.insuficiente || 'Todavía no cortó ese músculo.'} Trace la incisión sobre él con el instrumento en la mano.`,
          RESULTADOS.PLANO_SIN_HACER,
        )
      }
      if (accion === 'separar' && p.retraidoMm < RETRACCION_MINIMA_MM) {
        return nada(
          `${paso.insuficiente || 'El músculo no está retraído.'} Apoye el separador en él y ábralo arrastrando con el botón derecho hacia arriba (al menos ${RETRACCION_MINIMA_MM} mm).`,
          RESULTADOS.PLANO_SIN_HACER,
        )
      }
      return bien(paso.exito)
    }

    default:
      // Objetivo «instrumento»: bastaba con elegirlo bien, y ya se comprobó.
      return bien(paso.exito)
  }
}

/** Cuánto puede pasarse la broca de la cortical opuesta sin que cuente como daño, en mm. */
export const PASARSE_DE_LA_CORTICAL_MM = 3

/**
 * Cuánto del agujero se dibuja: hasta la cortical opuesta y ni un milímetro más.
 *
 * La broca puede pasarse de largo —es un error que el paso puntúa—, pero el hueso no tiene agujero donde no hay
 * hueso. Dibujado entero, el cilindro negro asomaba por el otro lado y quedaba flotando fuera de la pierna. Lo que
 * se pasó se avisa y se evalúa con `sePasoMm`; aquí solo se decide qué se ve. Nunca negativo, aunque la salida
 * venga de un rayo que no cruzó nada.
 */
export function largoVisibleDelAgujero(profundidad: number, salidaPorLaOpuesta: number): number {
  return Math.max(0, Math.min(profundidad, salidaPorLaOpuesta))
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
 *
 * Los `excluidos` son los pasos que no miden nada (D-306, `pasosSinNadaQueReducir`): no dan puntos, y dejarlos en el
 * máximo bajaría el porcentaje de todos los residentes por un defecto del caso, que no es suyo. Así el recorrido se lee
 * igual que si el caso no trajera ese paso.
 */
export function puntajeMaximo(
  pasos: readonly (PasoQuirurgico & { id?: string })[],
  excluidos: ReadonlySet<string> = new Set(),
): number {
  return pasos.reduce(
    (total, paso) => total + (paso.id !== undefined && excluidos.has(paso.id) ? 0 : valorDelPaso(paso)),
    0,
  )
}

/** Lo que el residente arrastra de este mismo paso cuando por fin lo acierta. */
export interface HistorialDelPaso {
  /** Hubo antes un gesto que no completó el paso y no dañó nada. */
  fallo: boolean
  /** Hubo antes un gesto que dañó: el trazo o la fuerza se pasaron. */
  complicacion: boolean
  /**
   * El residente eligió la reducción **automática** en este paso (P-004 E7, pedido 6 de Cristóbal): el desplazamiento se
   * llevó a cero sin mover nada a mano, así que el ejercicio de reducir no puntúa. Solo cuenta en un paso de reducción.
   */
  reduccionAutomatica?: boolean
  /**
   * El paso no tenía nada que reducir: el trozo empezaba ya dentro de los topes (D-306, `pasosSinNadaQueReducir`). Se
   * aprueba sin mover nada, así que no puntúa. Solo cuenta en un paso de reducción.
   */
  sinNadaQueReducir?: boolean
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
  // La automática da el paso por hecho para no entramparse si el objetivo docente es otro, pero no vale lo mismo que
  // reducirlo a mano: el ejercicio se mantiene «porque da realidad» y por eso se puede evitar, no regalar.
  if (historial.reduccionAutomatica && objetivoDelPaso(paso) === 'reduccion') return 0
  // Lo mismo que la automática, con otra causa: lo que se aprueba sin mover nada no se cobra (D-306).
  if (historial.sinNadaQueReducir && objetivoDelPaso(paso) === 'reduccion') return 0
  const valor = valorDelPaso(paso)
  return historial.fallo ? Math.floor(valor / 2) : valor
}

/**
 * Qué necesita el residente tener hecho para que el paso se pueda aplicar.
 *
 * Sirve para escribir la instrucción en pantalla sin repetir la lógica de
 * evaluación en la interfaz.
 *
 * `conTopes: false` es la de evaluación (D-329): sin el largo de la incisión ni
 * los topes de la reducción, que son lo que las medidas ya no dicen ahí. Lo
 * demás se queda —la broca, la inclinación, los tornillos, la fuerza—, porque
 * el dueño decidió sobre las medidas, y lo que sigue escrito aquí está anotado
 * en la decisión para que lo vea.
 */
export function instruccionDelPaso(paso: PasoQuirurgico, { conTopes = true }: { conTopes?: boolean } = {}): string {
  // Las cuatro ramas empiezan por el instrumento porque `evaluarGesto` lo exige
  // en las cuatro: sin instrumento no hay gesto, sea cual sea el objetivo. Solo
  // dos lo nombraban, y en un paso de trazo la instrucción decía «active el modo
  // Trazar y arrastre» sin una palabra de la bandeja: el residente trazaba,
  // pulsaba y recibía un «Seleccione un instrumento» que contradecía la única
  // frase que la consola le había dado.
  const conInstrumento = (resto: string) => `Coja el instrumento de la mesa de instrumental y ${resto}`

  switch (objetivoDelPaso(paso)) {
    case 'trazo': {
      const rango = conTopes ? rangoDeTrazoEnTexto(paso) : null
      return conInstrumento(
        `active el modo Trazar para arrastrar sobre el modelo.${rango ? ` Objetivo: ${rango}.` : ''}`,
      )
    }
    case 'reduccion': {
      const topes = conTopes ? ` Se aceptan hasta ${topesEnTexto(topesDeReduccion(paso))}.` : ''
      return conInstrumento(`active el modo Mover, arrastre el fragmento a su sitio y corrija la angulación.${topes}`)
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
    case 'perforacion': {
      const minimo = paso.anguloMinimo
      const maximo = paso.anguloMaximo
      const rango =
        typeof minimo === 'number' || typeof maximo === 'number'
          ? ` Se acepta entre ${typeof minimo === 'number' ? Math.round(minimo) : 0}° y ${typeof maximo === 'number' ? Math.round(maximo) : 180}° con el eje del hueso (90° es perpendicular).`
          : ''
      const calibre = typeof paso.calibreBroca === 'number' ? ` La broca es de Ø ${paso.calibreBroca} mm.` : ''
      const bicortical = paso.exigeBicortical ? ' Tiene que cruzar las dos corticales, sin pasarse.' : ''
      return conInstrumento(
        `active el modo Perforar, elija la inclinación y mantenga pulsado sobre el hueso.${calibre}${rango}${bicortical}`,
      )
    }
    case 'fijacion': {
      const n = paso.tornillosMinimos ?? 1
      // Lo que pide cada fragmento (D-309), dicho antes de operar: contado sin avisar, el paso se suspendería por una
      // regla que la instrucción no nombra.
      const porFragmento =
        paso.tornillosPorFragmento === 0
          ? ''
          : typeof paso.tornillosPorFragmento === 'number'
            ? ` Cada fragmento principal lleva al menos ${paso.tornillosPorFragmento}.`
            : ' Cada fragmento principal lleva los suyos: 3 en la tibia y el antebrazo, 4 en el fémur y el húmero, y 3 si todos son bloqueados.'
      return conInstrumento(
        `active el modo Fijar: apoye la placa sobre el hueso y ponga ${n} ${n === 1 ? 'tornillo' : 'tornillos'} en sus agujeros.${porFragmento}${paso.exigeBicortical ? ' Los tornillos tienen que cruzar las dos corticales.' : ''}${paso.exigeCompresion ? ' La fijación tiene que comprimir la fractura.' : ''} Mida antes con el medidor de profundidad.`,
      )
    }
    case 'planos': {
      const accion = paso.accionDelPlano === 'separar' ? 'separe' : 'corte'
      return conInstrumento(
        `active «Seleccionar estructura», pinche el músculo del paso, pulse «${accion === 'corte' ? 'Cortar' : 'Separar'}» y ${accion} ese músculo${accion === 'separe' ? ` hasta retraerlo al menos ${RETRACCION_MINIMA_MM} mm` : ''}.`,
      )
    }
    default:
      return 'Elija el instrumento correcto de la mesa de instrumental y aplique el paso.'
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
  capasForzadas: Set<string> = new Set(),
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
    return !rol || !capasApagadas.has(capaDelRol(rol))
  })
  // Una capa que el residente enciende a mano enseña **todas** sus piezas, las declare el paso o no.
  // Sin esto, con un paso que declara «solo la piel» el interruptor del hueso se movía y no pasaba nada:
  // la casilla decía una cosa y el lienzo otra, que es lo que el taller anatómico nunca hace (D-171).
  for (const p of piezas) {
    if (p.rol === 'implante' || !p.nodo) continue
    const capa = capaDelRol(p.rol)
    if (capasForzadas.has(capa) && !capasApagadas.has(capa) && !visibles.includes(p.nodo)) visibles.push(p.nodo)
  }
  if (visibles.length > 0) return { nodos: visibles, encender: [] }

  const encender: string[] = []
  for (const nodo of base) {
    const rol = rolDe.get(nodo)
    const capa = rol ? capaDelRol(rol) : null
    if (capa && capasApagadas.has(capa) && !encender.includes(capa)) encender.push(capa)
  }
  return { nodos: base, encender }
}

/**
 * A qué interruptor de la consola pertenece un papel: el fragmento móvil es hueso y se apaga con el hueso.
 * Antes el fragmento no tenía capa —ningún interruptor se llamaba «fragmento»— y se quedaba a la vista con
 * el hueso apagado.
 *
 * Los vasos y los nervios, con el músculo (P-012 E6). Tampoco tienen interruptor propio, y sin esta línea
 * pasaría lo mismo que con el fragmento: con el músculo apagado, la arteria y el nervio flotarían solos
 * delante del hueso.
 */
export function capaDelRol(rol: string): string {
  if (rol === 'fragmento') return 'hueso'
  return esEstructuraNoble(rol) ? 'musculo' : rol
}

/**
 * Cómo quedan los interruptores al entrar en un paso.
 *
 * Un paso que declara lo que se ve manda sobre los interruptores y **los deja diciendo la verdad**: se
 * encienden las capas de lo declarado y se apagan las demás, porque una casilla encendida de una capa que el
 * paso no enseña es una casilla que miente. Un paso que no declara nada deja los interruptores como los puso
 * el residente. El residente puede volver a encender lo que quiera: eso es `capasForzadas`.
 */
export function capasAlEntrarEnPaso(
  pasos: PasoConMuestra[],
  piezas: PiezaConRol[],
  indicePaso: number,
  capasApagadas: Set<string>,
): Set<string> {
  const siguientes = new Set(capasApagadas)
  const declarados = declaracionDelPaso(pasos, indicePaso)
  if (!declarados) return siguientes
  const rolDe = new Map(piezas.map((p) => [p.nodo, p.rol]))
  const conDeclaradas = new Set<string>()
  for (const nodo of declarados) {
    const rol = rolDe.get(nodo)
    if (rol && rol !== 'implante') conDeclaradas.add(capaDelRol(rol))
  }
  // Sin ninguna pieza reconocible en lo declarado (otro archivo) no se toca nada: eso lo resuelve el lienzo.
  if (conDeclaradas.size === 0) return siguientes
  for (const p of piezas) {
    if (p.rol === 'implante') continue
    const capa = capaDelRol(p.rol)
    if (conDeclaradas.has(capa)) siguientes.delete(capa)
    else siguientes.add(capa)
  }
  return siguientes
}

/**
 * Cruza lo que el caso quiere ver con lo que el archivo de verdad trae (O-078).
 *
 * `visibilidadDelPaso` sabe qué nodos declara el caso, pero no cuáles existen:
 * eso solo lo sabe el lienzo, con el modelo abierto. Y el caso y el archivo se
 * separan sin ruido —alguien vuelve a exportar el hueso fundido en un solo
 * objeto («Esqueleto») y las noventa y nueve piezas que el caso declaraba, de la
 * exportación anterior, ya no están en ninguna parte—. Con esos nombres,
 * `mostrar` apagaba **todas** las mallas, porque ninguna estaba en la lista: el
 * lienzo en negro, sin un mensaje, y el modelo perfectamente cargado detrás.
 * Es el mismo fallo que corrigió D-078 para las capas apagadas, llegando por
 * otra puerta.
 *
 * Regla: se enseña lo declarado **que exista**. Si no existe nada de lo
 * declarado, se enseña el modelo entero (`nodos: null`) y `sinCoincidencias`
 * lo dice para que la consola avise. Antes que no enseñar nada, se enseña algo y
 * se explica.
 *
 * Los `ausentes` son los declarados que el archivo no tiene, en el orden en que
 * llegaron y sin repetir: con ellos el taller de piezas y la consola dicen
 * cuáles son, en vez de un «hay piezas que faltan» que nadie puede arreglar.
 */
export function reconciliarConElModelo(
  nodos: string[] | null,
  existentes: string[],
): { nodos: string[] | null; ausentes: string[]; sinCoincidencias: boolean } {
  if (nodos === null) return { nodos: null, ausentes: [], sinCoincidencias: false }
  const hay = new Set(existentes)
  const presentes: string[] = []
  const ausentes: string[] = []
  for (const nodo of nodos) {
    if (hay.has(nodo)) presentes.push(nodo)
    else if (!ausentes.includes(nodo)) ausentes.push(nodo)
  }
  // Un modelo sin mallas con nombre no permite decidir nada: no hay a qué
  // aplicar la lista, y apagarlo tampoco serviría.
  if (presentes.length === 0) return { nodos: null, ausentes, sinCoincidencias: nodos.length > 0 }
  return { nodos: presentes, ausentes, sinCoincidencias: false }
}

/**
 * Las piezas del caso que el archivo no tiene, y cuántas son del total.
 *
 * Para decirlo una vez al abrir el caso y para el aviso permanente del editor:
 * es lo que separa «el modelo no carga» de «el modelo carga y el caso habla de
 * otro archivo», dos fallos que en pantalla se ven igual.
 */
export function piezasQueFaltanEnElArchivo(
  piezas: PiezaConRol[],
  existentes: string[],
): { ausentes: string[]; total: number } {
  const hay = new Set(existentes)
  const ausentes: string[] = []
  for (const p of piezas) if (p.nodo && !hay.has(p.nodo) && !ausentes.includes(p.nodo)) ausentes.push(p.nodo)
  return { ausentes, total: new Set(piezas.map((p) => p.nodo).filter(Boolean)).size }
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

/**
 * La exposición del campo: pinzas que tensan la piel y separadores colocados en
 * la herida (petición de Cristóbal).
 *
 * Es la parte aritmética de cómo se manejan en pabellón, separada del lienzo para
 * poder probarla sin navegador:
 *
 * - **La pinza con dientes pellizca la piel hacia arriba.** Dos —una la toma quien
 *   opera, la otra el ayudante— dan tensión a los bordes, que es lo que permite
 *   cortar la piel por completo; solo la primera incisión es con bisturí de piel.
 * - **El Farabeuf y el Senn-Miller empujan la piel hacia un lado** (y el otro): son
 *   de mano, uno por labio, y se usan en pareja. **El Hohmann se apoya en el borde
 *   del hueso** y retrae lo blando de ese lado. **Los autoestáticos** (Gelpi,
 *   Weitlaner, Beckman-Adson) se clavan a los dos lados y se quedan abiertos solos.
 *
 * Se elige el separador, se hace clic en el punto de la incisión donde se quiere
 * poner y se abre con la rueda —o con una barra deslizante, que es lo que hay en
 * una tableta—. La apertura no es pareja a lo largo de toda la herida: se abre
 * donde está el separador y se va cerrando hacia los extremos, como la piel de
 * verdad, y eso es lo que calcula `aperturaEnLaPosicion`.
 */

/**
 * Cómo actúa cada tipo de separador. `roma` no es un instrumento: es la separación por tensión de una
 * disección roma con la tijera de Metzenbaum (el punto donde las ramas se abren), que abre la herida del
 * plano que se está disecando mientras las ramas están abiertas y nada más.
 */
export type TipoDeSeparador = 'mano' | 'autoestatico' | 'palanca' | 'roma'

/** Las capas de partes blandas donde hay herida: la piel y los planos profundos. */
export type CapaDeLaHerida = 'piel' | 'musculo'

/**
 * A qué profundidad está apoyado un separador (petición de Cristóbal): en la piel, en el músculo o —el Hohmann—
 * en el hueso. Decide qué heridas abre: un separador abre **su plano y todos los de encima**, porque la hoja
 * que está apoyada en el músculo tiene que pasar por la piel para llegar y la lleva consigo. Un Farabeuf en la
 * piel abre solo la piel; el mismo Farabeuf, apoyado más profundo, abre la piel y el músculo.
 */
export type PlanoDelSeparador = 'piel' | 'musculo' | 'hueso'

export const ETIQUETA_DEL_PLANO: Readonly<Record<PlanoDelSeparador, string>> = {
  piel: 'piel',
  musculo: 'músculo',
  hueso: 'hueso',
}

/** «en la piel», «en el músculo», «en el hueso»: para escribirlo dentro de una frase. */
export function enElPlano(plano: PlanoDelSeparador): string {
  return plano === 'piel' ? 'en la piel' : `en el ${ETIQUETA_DEL_PLANO[plano]}`
}

/** Qué heridas abre un separador apoyado en cada plano. */
const CAPAS_QUE_ABRE: Readonly<Record<PlanoDelSeparador, readonly CapaDeLaHerida[]>> = {
  piel: ['piel'],
  musculo: ['piel', 'musculo'],
  hueso: ['piel', 'musculo'],
}

/** ¿Este separador abre la herida de esta capa? La separación roma solo abre la de su propio plano. */
export function abreLaCapa(s: Pick<SeparadorColocado, 'plano' | 'tipo'>, capa: CapaDeLaHerida): boolean {
  if (s.tipo === 'roma') return s.plano === capa
  return CAPAS_QUE_ABRE[s.plano].includes(capa)
}

export interface SeparadorColocado {
  id: number
  /** El instrumento del catálogo, para volver a dibujarlo y para decirlo en pantalla. */
  instrumentoId: string
  nombre: string
  tipo: TipoDeSeparador
  /** En qué plano está apoyado: qué heridas abre. */
  plano: PlanoDelSeparador
  /** A qué labio de la herida se agarra: +1, −1, o 0 si abraza los dos (autoestático). */
  lado: 1 | -1 | 0
  /** Dónde está a lo largo de la incisión, de 0 (inicio) a 1 (final). */
  posicion: number
  /** Hasta dónde puede abrir, en milímetros. */
  maximoMm: number
  /** Cuánto lleva abierto, en milímetros. */
  aperturaMm: number
}

/** La anchura, como fracción del largo de la herida, de la zona que abre cada tipo. */
export const ALCANCE_POR_TIPO: Readonly<Record<TipoDeSeparador, number>> = {
  // Una hoja sola tira de un tramo corto de piel.
  mano: 0.22,
  // Los rastrillos se clavan y arrastran un tramo largo.
  autoestatico: 0.4,
  // La palanca retrae músculo y no piel: su zona es ancha y blanda.
  palanca: 0.3,
  // Las ramas de la tijera abren un tramo corto: lo que cabe entre sus puntas.
  roma: 0.07,
}

export function tipoDelSeparador(separa: { autoestatico: boolean; apoyoEnHueso?: boolean }): TipoDeSeparador {
  if (separa.apoyoEnHueso) return 'palanca'
  return separa.autoestatico ? 'autoestatico' : 'mano'
}

/** Cuántos separadores caben a la vez: más no entran en una herida de abordaje. */
export const MAXIMO_DE_SEPARADORES = 6

// ------------------------------------------------- hacia dónde se inclina el mango

export type Vector3Plano = readonly [number, number, number]

/**
 * Cuánto se abre el mango de un separador respecto de la normal, en grados. Con 40° el mango sale claramente
 * hacia fuera de la herida sin tumbarse sobre la piel: a 0° taparía el centro del campo, a 90° iría pegado a ella.
 */
export const ANGULO_DEL_MANGO_GRADOS = 40

/**
 * Hacia dónde apunta el mango de un separador: de la herida hacia fuera, del lado del labio que sostiene
 * (`normal·cos θ + dirección·sen θ`). Antes se inclinaba hacia «arriba de la cámara», sin mirar el lado: todos
 * los separadores se acostaban hacia el mismo sitio de la pantalla y se cruzaban sobre la herida (la captura
 * de Cristóbal con cuatro Farabeuf cruzados). Con el signo del lado, ningún mango puede cruzar la línea de la
 * herida. El autoestático (lado 0) abraza los dos labios y va derecho, sobre el centro.
 *
 * `direccion` es la del labio «más» (la que da `ladoDeLaHerida`), sin signo: el signo lo pone `lado`.
 */
export function direccionDelMango(normal: Vector3Plano, direccion: Vector3Plano, lado: 1 | -1 | 0): Vector3Plano {
  const radianes = (ANGULO_DEL_MANGO_GRADOS * Math.PI) / 180
  const hacia = lado === 0 ? 0 : Math.sin(radianes) * lado
  const arriba = lado === 0 ? 1 : Math.cos(radianes)
  const v: [number, number, number] = [
    normal[0] * arriba + direccion[0] * hacia,
    normal[1] * arriba + direccion[1] * hacia,
    normal[2] * arriba + direccion[2] * hacia,
  ]
  const largo = Math.hypot(v[0], v[1], v[2])
  // Una normal nula no debería llegar: se devuelve la normal tal cual antes que dividir por cero.
  return largo < 1e-12 ? normal : [v[0] / largo, v[1] / largo, v[2] / largo]
}

/**
 * Dónde queda, a lo largo de la herida, lo que acompaña al bisturí: unos milímetros por detrás de la punta, sin
 * salirse de la herida. Con una herida de largo cero se queda en la punta, que es lo único que se sabe.
 */
export function posicionQueAcompana(tPunta: number, largoMm: number, retrasoMm: number): number {
  const t = Math.min(1, Math.max(0, tPunta))
  if (!(largoMm > 0)) return t
  return Math.min(1, Math.max(0, t - Math.max(0, retrasoMm) / largoMm))
}

/** Cuánto va por detrás de la punta lo que acompaña al bisturí, en milímetros. */
export const RETRASO_AL_ACOMPANAR_MM = 15

/**
 * Los lados de una pareja de separadores de mano: uno por labio, a la misma altura. Si ya hay uno puesto en
 * ese sitio, la pareja se completa solo con el lado que falta, igual que hace la pareja de pinzas.
 */
export function ladosParaLaPareja(ocupados: readonly (1 | -1 | 0)[]): (1 | -1)[] {
  const faltan: (1 | -1)[] = []
  if (!ocupados.includes(1)) faltan.push(1)
  if (!ocupados.includes(-1)) faltan.push(-1)
  return faltan
}

/** ¿Caben `cuantos` separadores más sin pasar del tope? La pareja cuenta dos. */
export const caben = (puestos: number, cuantos: number): boolean => puestos + cuantos <= MAXIMO_DE_SEPARADORES

/**
 * Cuánto abre cada labio en un punto de la herida, en milímetros.
 *
 * Cada separador abre en forma de campana alrededor de donde está; donde dos se
 * solapan manda el que más abre (no se suman: dos hojas a la vez no abren el doble
 * de lo que abre cada una en ese punto). `posicion` es 0 al inicio y 1 al final.
 */
export function aperturaEnLaPosicion(
  separadores: readonly SeparadorColocado[],
  posicion: number,
): { mas: number; menos: number } {
  let mas = 0
  let menos = 0
  for (const s of separadores) {
    const sigma = ALCANCE_POR_TIPO[s.tipo]
    const d = (posicion - s.posicion) / sigma
    const campana = Math.exp(-0.5 * d * d)
    const abre = Math.max(0, s.aperturaMm) * campana
    if (s.lado >= 0) mas = Math.max(mas, abre)
    if (s.lado <= 0) menos = Math.max(menos, abre)
  }
  return { mas, menos }
}

/**
 * Cuánto abre cada labio de la herida de **una capa** en un punto, con lo que haya puesto: los separadores que
 * llegan a esa capa, las pinzas (solo en la piel: sujetan piel) y la separación roma que se esté haciendo.
 * Donde se solapan manda el que más abre, como entre separadores.
 */
export function aperturaDeLaCapa(
  capa: CapaDeLaHerida,
  posicion: number,
  separadores: readonly SeparadorColocado[],
  pellizcos: readonly Pellizco[] = [],
): { mas: number; menos: number } {
  const dePinzas = capa === 'piel' ? aperturaPorLasPinzas(pellizcos, posicion) : { mas: 0, menos: 0 }
  const deSeparadores = aperturaEnLaPosicion(
    separadores.filter((s) => abreLaCapa(s, capa)),
    posicion,
  )
  return { mas: Math.max(deSeparadores.mas, dePinzas.mas), menos: Math.max(deSeparadores.menos, dePinzas.menos) }
}

/** La apertura máxima de la herida, en milímetros: lo que dice el panel. */
export function aperturaMaxima(separadores: readonly SeparadorColocado[]): number {
  let mayor = 0
  for (const s of separadores) mayor = Math.max(mayor, s.aperturaMm * (s.lado === 0 ? 2 : 1))
  return mayor
}

/** Un valor de apertura que respeta el tope del separador y los milímetros enteros. */
export const limitarApertura = (mm: number, maximoMm: number): number =>
  Math.min(maximoMm, Math.max(0, Math.round(mm)))

/**
 * A qué labio se agarra una hoja de mano según de qué lado de la incisión se
 * hizo clic. Una hoja de mano abre solo el borde que sostiene; el otro lo
 * sostiene otro (el ayudante, u otra hoja).
 */
export function ladoAlColocar(tipo: TipoDeSeparador, ladoDelClic: 1 | -1): 1 | -1 | 0 {
  return tipo === 'autoestatico' ? 0 : ladoDelClic
}

// ---------------------------------------------------------------- pinzas

export interface Pellizco {
  id: number
  /** Si la pinza lleva dientes: con ellos la piel no se resbala y se puede tensar. */
  conDientes: boolean
  /** A qué labio de la herida sostiene: +1, −1, o 0 si no hay herida todavía. */
  lado: 1 | -1 | 0
  /** Cuánto levanta la piel, en milímetros. */
  alturaMm: number
  /** Dónde está a lo largo de la incisión, de 0 (inicio) a 1 (final); la mitad si todavía no hay herida. */
  posicion: number
  /**
   * Cuánto se ha alejado de la herida, en milímetros: las dos pinzas de la pareja se separan tirando de los
   * bordes de la piel hacia fuera, y eso abre la herida un poco (la tensión).
   */
  separacionMm: number
  /**
   * Cuánto están cerradas las mandíbulas, de 0 (abiertas, sueltan la piel) a 1 (cerradas sobre el pliegue). Una
   * pinza abierta no sostiene nada: no levanta el pliegue ni tensa.
   */
  agarre: number
}

export const ALTURA_MAXIMA_DEL_PELLIZCO_MM = 16
export const ALTURA_INICIAL_DEL_PELLIZCO_MM = 8
/** Cuántas pinzas a la vez: la de quien opera y la del ayudante. */
export const MAXIMO_DE_PELLIZCOS = 2
/** Hasta dónde se aleja cada pinza de la pareja de la herida, en milímetros. */
export const SEPARACION_MAXIMA_DE_PINZAS_MM = 14
/** Cuánto cambian las mandíbulas con cada muesca de la rueda (con Mayúsculas). */
export const PASO_DE_AGARRE = 0.1
/** Con menos agarre que esto la pinza suelta la piel: ni levanta ni tensa. */
export const AGARRE_MINIMO_PARA_SOSTENER = 0.5
/** La anchura de lo que tira una pinza, como fracción del largo de la herida: es un tramo corto de piel. */
export const ALCANCE_DE_LA_PINZA = 0.1

export const limitarSeparacionDePinzas = (mm: number): number =>
  Math.min(SEPARACION_MAXIMA_DE_PINZAS_MM, Math.max(0, Math.round(mm * 10) / 10))
export const limitarAgarre = (valor: number): number => Math.min(1, Math.max(0, Math.round(valor * 100) / 100))

/** Cuánto levanta de verdad el pliegue: la altura que se le dio, por lo cerradas que estén las mandíbulas. */
export const alturaEfectivaDelPellizco = (p: Pick<Pellizco, 'alturaMm' | 'agarre'>): number =>
  p.agarre >= AGARRE_MINIMO_PARA_SOSTENER ? p.alturaMm * p.agarre : 0

/**
 * Cuánto abren las pinzas cada labio de la **piel** en un punto: tiran de él hacia fuera lo que se han separado,
 * y solo mientras lo sostienen (las mandíbulas cerradas). Es la tensión con que el ayudante y quien opera
 * ponen la piel antes de cortar; es poco, unos milímetros, frente a lo que abre un separador.
 */
export function aperturaPorLasPinzas(pellizcos: readonly Pellizco[], posicion: number): { mas: number; menos: number } {
  let mas = 0
  let menos = 0
  for (const p of pellizcos) {
    if (p.lado === 0 || p.agarre < AGARRE_MINIMO_PARA_SOSTENER) continue
    const d = (posicion - p.posicion) / ALCANCE_DE_LA_PINZA
    const abre = Math.max(0, p.separacionMm) * Math.exp(-0.5 * d * d)
    if (p.lado > 0) mas = Math.max(mas, abre)
    else menos = Math.max(menos, abre)
  }
  return { mas, menos }
}

export type TensionDeLaPiel = 'ninguna' | 'un-borde' | 'tensa'

/**
 * Si los bordes de la piel están tensos: hace falta una pinza **con dientes** en
 * cada labio. Con una sola, la piel cede hacia el otro lado y el bisturí corta a
 * medias, que es justo lo que se aprende a evitar.
 */
export function tensionDeLaPiel(pellizcos: readonly Pellizco[]): TensionDeLaPiel {
  const firmes = pellizcos.filter((p) => p.conDientes && p.alturaMm >= 3 && p.agarre >= AGARRE_MINIMO_PARA_SOSTENER)
  const mas = firmes.some((p) => p.lado >= 0)
  const menos = firmes.some((p) => p.lado <= 0)
  if (firmes.length >= 2 && mas && menos) return 'tensa'
  return firmes.length > 0 ? 'un-borde' : 'ninguna'
}

/** Lo que se le dice a quien va a cortar los planos profundos según cómo dejó la piel. */
export function adviertePorLaTension(tension: TensionDeLaPiel): string | null {
  if (tension === 'tensa') return null
  return tension === 'un-borde'
    ? 'Solo hay un borde de la piel tomado con pinza. Tome los dos —una la sostiene quien opera y la otra el ayudante—: así la piel queda tensa y el corte es completo.'
    : 'Antes de profundizar se toman los bordes de la piel con pinzas con dientes —una quien opera y la otra el ayudante—: así se les da tensión para cortar la piel por completo.'
}

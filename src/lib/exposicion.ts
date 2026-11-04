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
 * una tableta—. La apertura no es pareja a lo largo de toda la herida: bajo la hoja
 * abre lo que dice el panel, al milímetro, y de ahí a cada punta el labio va en
 * recta, tenso, como la piel de verdad. Eso es lo que calcula `perfilDeLaCapa`.
 */

import type { PlanoBlando } from './planosBlandos'

/**
 * Cómo actúa cada tipo de separador. `roma` no es un instrumento: es la separación por tensión de una
 * disección roma con la tijera de Metzenbaum (el punto donde las ramas se abren), que abre la herida del
 * plano que se está disecando mientras las ramas están abiertas y nada más.
 */
export type TipoDeSeparador = 'mano' | 'autoestatico' | 'palanca' | 'roma'

/** Las capas de partes blandas donde hay herida: la piel, la fascia y los planos musculares. */
export type CapaDeLaHerida = PlanoBlando

/**
 * A qué profundidad está apoyado un separador (petición de Cristóbal): en la piel, en el músculo o —el Hohmann—
 * en el hueso. Decide qué heridas abre: un separador abre **su plano y todos los de encima**, porque la hoja
 * que está apoyada en el músculo tiene que pasar por la piel para llegar y la lleva consigo. Un Farabeuf en la
 * piel abre solo la piel; el mismo Farabeuf, apoyado más profundo, abre la piel y el músculo.
 */
export type PlanoDelSeparador = PlanoBlando | 'hueso'

export const ETIQUETA_DEL_PLANO: Readonly<Record<PlanoDelSeparador, string>> = {
  piel: 'piel',
  fascia: 'fascia',
  musculo: 'músculo',
  hueso: 'hueso',
}

/**
 * El plano al que baja un separador la siguiente vez que se pulsa su botón: uno más profundo cada vez —piel, fascia (si el
 * caso la trae), músculo— y de vuelta a la piel después del último. Un plano que no está en la lista (el hueso, del Hohmann)
 * baja al primero más profundo que haya, que es la piel.
 */
export function planoSiguiente(planos: readonly CapaDeLaHerida[], actual: PlanoDelSeparador): CapaDeLaHerida {
  const i = planos.indexOf(actual as CapaDeLaHerida)
  return planos[(i + 1) % planos.length]
}

/** «en la piel», «en el músculo», «en el hueso»: para escribirlo dentro de una frase. */
export function enElPlano(plano: PlanoDelSeparador): string {
  return plano === 'piel' || plano === 'fascia' ? `en la ${ETIQUETA_DEL_PLANO[plano]}` : `en el ${ETIQUETA_DEL_PLANO[plano]}`
}

/** Qué heridas abre un separador apoyado en cada plano. */
const CAPAS_QUE_ABRE: Readonly<Record<PlanoDelSeparador, readonly CapaDeLaHerida[]>> = {
  piel: ['piel'],
  fascia: ['piel', 'fascia'],
  musculo: ['piel', 'fascia', 'musculo'],
  hueso: ['piel', 'fascia', 'musculo'],
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
  /** Cuánto lleva abierto, en milímetros. En un autoestático, lo que se aparta cada labio. */
  aperturaMm: number
  /**
   * Lo ancha que es la hoja a lo largo de la herida, en milímetros: el tramo que abre del todo (P-008 E2). Sin él, lo
   * de su tipo (`ANCHO_DE_LA_HOJA_POR_TIPO_MM`).
   */
  anchoMm?: number
  /**
   * En un autoestático, lo que hay del eje de las ramas al rastrillo, en milímetros: convierte los grados que se abren
   * las ramas en los milímetros que se aparta cada labio, y así el rastrillo queda donde está el borde.
   */
  brazoMm?: number
  /**
   * A qué incisión pertenece (P-003 E4): su `posicion` es a lo largo de esa incisión y solo la abre a ella. Sin él
   * —lo que se puso antes de que hubiera herida, o la separación roma de una disección— abre la de su capa.
   */
  incision?: number
}

/**
 * La anchura, como fracción del largo de la herida, de la campana con que abría cada tipo. Hoy solo la usa la
 * separación roma, que abre un tramo corto entre las puntas de la tijera: las hojas abren con la cuerda de
 * `perfilDeLosSeparadores` (P-008 E2).
 */
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

/**
 * Lo ancha que es la hoja de cada tipo, en milímetros, cuando el instrumento no lo dice: la pala chica del Farabeuf
 * mide 10, el rastrillo de un Weitlaner unos 16, la pala de un Hohmann unos 20. Es el tramo del labio que abre del
 * todo: la hoja es rígida y no se dobla con la piel.
 */
export const ANCHO_DE_LA_HOJA_POR_TIPO_MM: Readonly<Record<TipoDeSeparador, number>> = {
  mano: 12,
  autoestatico: 16,
  palanca: 20,
  roma: 4,
}

/**
 * Cuánto se puede apartar el labio por cada milímetro que lo separa de la punta de la herida. La punta no se abre
 * nunca —la piel sigue entera ahí—, y una hoja puesta a tres milímetros de ella y abierta veinte haría una uve que
 * ningún tejido aguanta (y que daba vuelta los triángulos de la malla).
 */
export const PENDIENTE_MAXIMA_DEL_LABIO = 2

/** El tramo de cada punta en el que se cierra lo que abren las pinzas y la disección roma, en milímetros. */
export const PUNTA_QUE_SE_CIERRA_MM = 6

/** El largo que se supone a una herida cuando no se sabe: una incisión de abordaje corriente. */
export const LARGO_DE_REFERENCIA_MM = 60

export function tipoDelSeparador(separa: { autoestatico: boolean; apoyoEnHueso?: boolean }): TipoDeSeparador {
  if (separa.apoyoEnHueso) return 'palanca'
  return separa.autoestatico ? 'autoestatico' : 'mano'
}

/** Cuántos separadores caben a la vez: más no entran en una herida de abordaje. */
export const MAXIMO_DE_SEPARADORES = 6

// ------------------------------------------------- hacia dónde se inclina el mango

export type Vector3Plano = readonly [number, number, number]

/**
 * Cuánto se abre el mango de un separador de mano respecto de la normal, en grados.
 *
 * Fue de 40° (P-003 E3): salía hacia fuera de la herida, pero casi de pie, y con el mango de pie la pala, que forma
 * ángulo recto con él, quedaba acostada. El dueño lo dibujó sobre una captura (P-008): el mango va bajo, hacia fuera
 * y sobre su labio, despejando el campo, y la pala baja metida en la herida, enganchando el borde y traccionando del
 * centro hacia fuera, «así es como se usa la herramienta». Con 75° el mango queda a 15° de la piel —tendido del
 * todo, en una pierna convexa rozaría la piel lejos de la herida— y la pala baja casi vertical, un poco por debajo
 * del labio que sostiene.
 */
export const ANGULO_DEL_MANGO_GRADOS = 75

/**
 * El mango del Hohmann apoyado en el hueso sigue a 40°: su pala va por detrás del hueso y lo que abre es la báscula
 * del mango hacia el lado que aparta (35° más). Tendido como el de una hoja de mano, la báscula lo metería en la piel.
 */
export const ANGULO_DEL_MANGO_DE_LA_PALANCA_GRADOS = 40

/**
 * Hacia dónde apunta el mango de un separador: de la herida hacia fuera, del lado del labio que sostiene
 * (`normal·cos θ + dirección·sen θ`). Antes se inclinaba hacia «arriba de la cámara», sin mirar el lado: todos
 * los separadores se acostaban hacia el mismo sitio de la pantalla y se cruzaban sobre la herida (la captura
 * de Cristóbal con cuatro Farabeuf cruzados). Con el signo del lado, ningún mango puede cruzar la línea de la
 * herida. El autoestático (lado 0) abraza los dos labios y va derecho, sobre el centro.
 *
 * `direccion` es la del labio «más» (la que da `ladoDeLaHerida`), sin signo: el signo lo pone `lado`.
 */
export function direccionDelMango(
  normal: Vector3Plano,
  direccion: Vector3Plano,
  lado: 1 | -1 | 0,
  grados: number = ANGULO_DEL_MANGO_GRADOS,
): Vector3Plano {
  const radianes = (grados * Math.PI) / 180
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

/**
 * Los separadores que van con este en pareja: los del mismo instrumento y plano, en el borde de enfrente y a la
 * misma altura de la herida (menos de 0,08 del largo). La rueda abre la pareja por igual; la barra del panel, solo el
 * elegido. Un autoestático o un Hohmann no tienen pareja.
 */
export function laPareja<T extends Pick<SeparadorColocado, 'id' | 'instrumentoId' | 'plano' | 'tipo' | 'lado' | 'posicion'>>(
  lista: readonly T[],
  de: T,
): T[] {
  if (de.tipo !== 'mano' || de.lado === 0) return []
  return lista.filter(
    (q) =>
      q.id !== de.id &&
      q.tipo === 'mano' &&
      q.instrumentoId === de.instrumentoId &&
      q.plano === de.plano &&
      q.lado === -de.lado &&
      Math.abs(q.posicion - de.posicion) < 0.08,
  )
}

/** ¿Caben `cuantos` separadores más sin pasar del tope? La pareja cuenta dos. */
export const caben = (puestos: number, cuantos: number): boolean => puestos + cuantos <= MAXIMO_DE_SEPARADORES

/** Cuánto abre cada labio a lo largo de la herida: de la posición (0 al inicio, 1 al final) a milímetros. */
export type PerfilDeApertura = (posicion: number) => { mas: number; menos: number }

const suave = (x: number) => {
  const k = Math.min(1, Math.max(0, x))
  return k * k * (3 - 2 * k)
}

/** De 0 en la punta a 1 a `PUNTA_QUE_SE_CIERRA_MM` de ella: lo que se cierra lo que abre en campana. */
const cierreEnLasPuntas = (posicion: number, largoMm: number) =>
  suave((Math.min(posicion, 1 - posicion) * largoMm) / PUNTA_QUE_SE_CIERRA_MM)

/** Un tramo del labio sostenido por una hoja: de dónde a dónde (fracción del largo) y cuánto lo aparta. */
interface Apoyo {
  desde: number
  hasta: number
  mm: number
}

/**
 * La forma del labio que sostienen las hojas: una cuerda tensa de una punta de la herida a la otra, que pasa por
 * encima de cada hoja (P-008 E2).
 *
 * Antes cada separador abría en campana alrededor de su sitio, y la malla además estrechaba la apertura hacia las
 * puntas: un Farabeuf a un cuarto del largo, abierto 12 mm, abría 6 en su sitio, y la hoja no estaba donde estaba el
 * borde. Lo que hace el labio de verdad es otra cosa: el tramo que apoya en la hoja se aparta entero —la hoja es
 * rígida—, y de ahí a cada punta la piel va tensa, en recta. Con dos hojas en el mismo labio, entre ellas también va
 * en recta: no se hunde, porque las dos tiran de él. Es la envolvente de arriba de los apoyos y de las dos puntas.
 *
 * Cerca de una punta, lo que se aparta tiene tope (`PENDIENTE_MAXIMA_DEL_LABIO`): la punta no se abre. El tope es
 * el del borde de la hoja más cercano a la punta, y vale para toda la hoja: es rígida, no abre más por un lado que
 * por el otro. Lo que la hoja tapa a menos de `PUNTA_QUE_SE_CIERRA_MM` de la punta no cuenta: una hoja puesta encima
 * de la punta abriría la punta, y con el tope de ese borde —cero— no abriría nada.
 */
function cuerdaDelLabio(apoyos: readonly Apoyo[], largoMm: number): (posicion: number) => number {
  if (apoyos.length === 0) return () => 0
  const puntos: [number, number][] = [
    [0, 0],
    [1, 0],
  ]
  const tope = (x: number) => PENDIENTE_MAXIMA_DEL_LABIO * Math.min(x, 1 - x) * largoMm
  const margen = Math.min(0.5, PUNTA_QUE_SE_CIERRA_MM / largoMm)
  const dentro = (x: number) => Math.min(1 - margen, Math.max(margen, x))
  for (const a of apoyos) {
    const desde = dentro(a.desde)
    const hasta = dentro(a.hasta)
    const mm = Math.min(a.mm, tope(desde), tope(hasta))
    puntos.push([desde, mm], [hasta, mm])
  }
  // La envolvente de arriba (cadena monótona): se quita todo punto que quede por debajo de la recta entre sus vecinos.
  puntos.sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const cuerda: [number, number][] = []
  for (const p of puntos) {
    while (cuerda.length >= 2) {
      const o = cuerda[cuerda.length - 2]
      const a = cuerda[cuerda.length - 1]
      if ((a[0] - o[0]) * (p[1] - o[1]) - (a[1] - o[1]) * (p[0] - o[0]) >= 0) cuerda.pop()
      else break
    }
    cuerda.push(p)
  }
  return (posicion) => {
    const x = Math.min(1, Math.max(0, posicion))
    for (let i = 0; i + 1 < cuerda.length; i++) {
      const [x0, y0] = cuerda[i]
      const [x1, y1] = cuerda[i + 1]
      if (x <= x1) return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : Math.max(y0, y1)
    }
    return 0
  }
}

/**
 * Cuánto abre cada labio a lo largo de una herida de `largoMm`, con estos separadores.
 *
 * Las hojas —de mano, autoestáticos, el Hohmann— abren con la cuerda de `cuerdaDelLabio`: bajo la hoja, lo que dice
 * el panel, al milímetro. La separación roma abre en campana un tramo corto (lo que cabe entre las puntas de la
 * tijera), cerrada en las puntas. Donde dos se solapan manda el que más abre: no se suman.
 */
export function perfilDeLosSeparadores(
  separadores: readonly SeparadorColocado[],
  largoMm: number = LARGO_DE_REFERENCIA_MM,
): PerfilDeApertura {
  const largo = largoMm > 0 ? largoMm : LARGO_DE_REFERENCIA_MM
  const mas: Apoyo[] = []
  const menos: Apoyo[] = []
  const romas: SeparadorColocado[] = []
  for (const s of separadores) {
    if (s.tipo === 'roma') {
      romas.push(s)
      continue
    }
    const mm = Math.max(0, s.aperturaMm)
    if (mm === 0) continue
    const medio = (s.anchoMm ?? ANCHO_DE_LA_HOJA_POR_TIPO_MM[s.tipo]) / 2 / largo
    const apoyo = { desde: s.posicion - medio, hasta: s.posicion + medio, mm }
    if (s.lado >= 0) mas.push(apoyo)
    if (s.lado <= 0) menos.push(apoyo)
  }
  const cuerdaMas = cuerdaDelLabio(mas, largo)
  const cuerdaMenos = cuerdaDelLabio(menos, largo)
  return (posicion) => {
    let m = cuerdaMas(posicion)
    let n = cuerdaMenos(posicion)
    for (const s of romas) {
      const d = (posicion - s.posicion) / ALCANCE_POR_TIPO.roma
      const abre = Math.max(0, s.aperturaMm) * Math.exp(-0.5 * d * d) * cierreEnLasPuntas(posicion, largo)
      if (s.lado >= 0) m = Math.max(m, abre)
      if (s.lado <= 0) n = Math.max(n, abre)
    }
    return { mas: m, menos: n }
  }
}

/** Cuánto abre cada labio en un punto de la herida, en milímetros (`perfilDeLosSeparadores` en ese punto). */
export function aperturaEnLaPosicion(
  separadores: readonly SeparadorColocado[],
  posicion: number,
  largoMm: number = LARGO_DE_REFERENCIA_MM,
): { mas: number; menos: number } {
  return perfilDeLosSeparadores(separadores, largoMm)(posicion)
}

/**
 * Cuánto abre cada labio de la herida de **una capa** a lo largo de ella, con lo que haya puesto: los separadores que
 * llegan a esa capa, las pinzas (solo en la piel: sujetan piel) y la separación roma que se esté haciendo.
 * Donde se solapan manda el que más abre, como entre separadores. Se arma una vez y se pregunta por cada vértice.
 */
export function perfilDeLaCapa(
  capa: CapaDeLaHerida,
  separadores: readonly SeparadorColocado[],
  pellizcos: readonly Pellizco[] = [],
  largoMm: number = LARGO_DE_REFERENCIA_MM,
): PerfilDeApertura {
  const deSeparadores = perfilDeLosSeparadores(
    separadores.filter((s) => abreLaCapa(s, capa)),
    largoMm,
  )
  if (capa !== 'piel' || pellizcos.length === 0) return deSeparadores
  return (posicion) => {
    const s = deSeparadores(posicion)
    const p = aperturaPorLasPinzas(pellizcos, posicion)
    const k = cierreEnLasPuntas(posicion, largoMm > 0 ? largoMm : LARGO_DE_REFERENCIA_MM)
    return { mas: Math.max(s.mas, p.mas * k), menos: Math.max(s.menos, p.menos * k) }
  }
}

/** Cuánto abre cada labio de la herida de una capa en un punto (`perfilDeLaCapa` en ese punto). */
export function aperturaDeLaCapa(
  capa: CapaDeLaHerida,
  posicion: number,
  separadores: readonly SeparadorColocado[],
  pellizcos: readonly Pellizco[] = [],
  largoMm: number = LARGO_DE_REFERENCIA_MM,
): { mas: number; menos: number } {
  return perfilDeLaCapa(capa, separadores, pellizcos, largoMm)(posicion)
}

/**
 * Lo que de una lista abre una incisión: lo que se puso en ella y lo que no es de ninguna todavía (pinzas puestas
 * antes de que hubiera herida). Con dos incisiones en la misma capa, un separador de una no abre la otra, aunque
 * su `posicion` caiga en un punto que las dos tienen (P-003 E4).
 */
export function deLaIncision<T extends { incision?: number }>(lista: readonly T[], incision: number): T[] {
  return lista.filter((x) => x.incision === undefined || x.incision === incision)
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
  /** A qué incisión de la piel tira (P-003 E4). Sin él, a la que se haga después. */
  incision?: number
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

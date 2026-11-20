/**
 * Varias incisiones en una misma capa, y qué hacer con un trazo nuevo (P-003 E4).
 *
 * Hasta aquí cada capa tenía **una** herida: un trazo nuevo cerraba la anterior («un trazo nuevo es una incisión
 * nueva»), y por eso un segundo abordaje en la piel borraba el primero. Cristóbal pidió lo contrario: más de un
 * abordaje en la misma cirugía, y cortes discontinuos que se unen y quedan abiertos. Esto es la parte que se prueba
 * sin `three`: dado un trazo nuevo y las incisiones que ya hay en su capa, decide si es **otra** incisión o si
 * **alarga** una.
 *
 * Un trazo alarga una incisión cuando arranca o termina a menos de `UMBRAL_PARA_ALARGAR_MM` de uno de sus extremos:
 * es el gesto de abrir en dos tiempos (empezar donde terminó el corte anterior). Si no toca ninguna, es otra. Si va por
 * encima de una, la repasa (D-410), y si la cruza, se une a ella en el cruce (D-415).
 */

export type Punto = readonly [number, number, number]

export interface TrazoDeIncision {
  puntos: Punto[]
  normales: Punto[]
}

/** A cuántos milímetros del extremo de una incisión tiene que empezar un trazo para considerarse su continuación. */
export const UMBRAL_PARA_ALARGAR_MM = 5

const distancia = (a: Punto, b: Punto) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const alReves = (t: TrazoDeIncision): TrazoDeIncision => ({ puntos: [...t.puntos].reverse(), normales: [...t.normales].reverse() })

/** `x` y después `y`. El primer punto de `y` se quita: es donde se unen, ya está en `x`, y dos puntos casi pegados solo estorban. */
const unir = (x: TrazoDeIncision, y: TrazoDeIncision): TrazoDeIncision => ({
  puntos: [...x.puntos, ...y.puntos.slice(1)],
  normales: [...x.normales, ...y.normales.slice(1)],
})

/**
 * Une el trazo nuevo a una incisión que ya existe, si alguno de sus extremos queda a menos de `umbral` (en las
 * mismas unidades que los puntos) de un extremo de ella. Devuelve la incisión alargada, en el orden en que se dibuja
 * —de un extremo al otro, sin invertir el sentido de la que ya estaba salvo que haga falta—, o `null` si no se tocan.
 *
 * Se elige el par de extremos **más cercano**: un trazo en U cuyos dos extremos tocan la incisión se une por el que
 * esté más cerca, no por el primero que se mire. El punto donde se unen no se repite.
 */
export function alargarIncision(
  base: TrazoDeIncision,
  nuevo: TrazoDeIncision,
  umbral: number,
  /** Qué puntas de `base` se pueden alargar: la que da a otra incisión de la misma no tiene punta (D-420). */
  libres: PuntasLibres = AMBAS_LIBRES,
): TrazoDeIncision | null {
  if (base.puntos.length < 2 || nuevo.puntos.length < 2) return null
  const a0 = base.puntos[0]
  const a1 = base.puntos[base.puntos.length - 1]
  const b0 = nuevo.puntos[0]
  const b1 = nuevo.puntos[nuevo.puntos.length - 1]
  const opciones = [
    { d: libres.final ? distancia(a1, b0) : Infinity, orden: 'base-nuevo' as const },
    { d: libres.final ? distancia(a1, b1) : Infinity, orden: 'base-nuevoAlReves' as const },
    { d: libres.inicio ? distancia(a0, b1) : Infinity, orden: 'nuevo-base' as const },
    { d: libres.inicio ? distancia(a0, b0) : Infinity, orden: 'nuevoAlReves-base' as const },
  ].sort((x, y) => x.d - y.d)
  const mejor = opciones[0]
  if (!(mejor.d <= umbral)) return null

  switch (mejor.orden) {
    case 'base-nuevo':
      return unir(base, nuevo)
    case 'base-nuevoAlReves':
      return unir(base, alReves(nuevo))
    case 'nuevo-base':
      return unir(nuevo, base)
    case 'nuevoAlReves-base':
      return unir(alReves(nuevo), base)
  }
}

/** Qué puntas de una incisión son puntas de verdad: la que da a otra de la misma, no (D-420). */
export interface PuntasLibres {
  inicio: boolean
  final: boolean
}

const AMBAS_LIBRES: PuntasLibres = { inicio: true, final: true }

/** Una incisión de las que hay en una capa, para decidir contra cuál se mide un trazo. */
export interface IncisionExistente extends TrazoDeIncision {
  id: number
  capa: string
  /** Qué puntas suyas se pueden alargar o acortar en un cruce (D-420). Sin él, las dos. */
  libres?: PuntasLibres
}

/**
 * Qué incisión alarga un trazo nuevo, si alarga alguna: de las de su misma capa, la que tenga el extremo más
 * cercano. Devuelve su `id` y la incisión ya unida.
 */
export function incisionQueAlarga(
  existentes: readonly IncisionExistente[],
  capa: string,
  nuevo: TrazoDeIncision,
  umbral: number,
): { id: number; unida: TrazoDeIncision } | null {
  let mejor: { id: number; unida: TrazoDeIncision; d: number } | null = null
  for (const e of existentes) {
    if (e.capa !== capa) continue
    const libres = e.libres ?? AMBAS_LIBRES
    const unida = alargarIncision(e, nuevo, umbral, libres)
    if (!unida) continue
    const a0 = e.puntos[0]
    const a1 = e.puntos[e.puntos.length - 1]
    const b0 = nuevo.puntos[0]
    const b1 = nuevo.puntos[nuevo.puntos.length - 1]
    const d = Math.min(
      libres.inicio ? Math.min(distancia(a0, b0), distancia(a0, b1)) : Infinity,
      libres.final ? Math.min(distancia(a1, b0), distancia(a1, b1)) : Infinity,
    )
    if (!mejor || d < mejor.d) mejor = { id: e.id, unida, d }
  }
  return mejor ? { id: mejor.id, unida: mejor.unida } : null
}

// ----------------------------------------------------------------------------------------------- el repaso

/**
 * Un trazo que va **por encima** de una incisión de su capa la repasa: no es otra incisión ni la alarga (pedido del dueño
 * del 2026-11-17, D-410).
 *
 * Quien siente que el corte quedó corto de hondo vuelve a pasar el bisturí por la misma línea, y las dos maneras de
 * leerlo que había rompían la piel:
 *
 * - Si el trazo nuevo no tocaba ninguna punta, era **otra incisión**, tendida sobre la primera. Las dos se abrían por su
 *   cuenta sobre la misma franja (`componerCortes`), y con los Farabeuf la piel del caso 4 quedaba con 373 triángulos
 *   doblados: en pedazos.
 * - Si empezaba junto a una punta y volvía por encima, **la alargaba**: `alargarIncision` unía las dos en una línea que
 *   iba y volvía sobre sí misma. La incisión de 90 mm pasaba a «medir 138», la malla se partía dos veces en ese tramo,
 *   y solo ese extremo salía destrozado. Es la foto del dueño: la mitad de la herida limpia y la otra hecha jirones.
 *
 * Un trazo la repasa donde corre **a lo largo** de ella: cerca (`corredor`), en la misma dirección o en la contraria, y
 * a la altura de su tramo y no pasada una punta. Por encima de ella el trazo no corta nada nuevo: la capa ya está
 * partida ahí, y para ir más hondo está el bisturí profundo. Lo que sale de ella por una punta la alarga, y lo que sale
 * por un lado, en medio, es otra incisión que nace en ella.
 *
 * El cruce no es repaso: un trazo que atraviesa la incisión en ángulo no va a lo largo de ella. Lo que hace es otra cosa
 * (D-415, `cruzarLasIncisiones`).
 */
export type DecisionDelTrazo =
  /**
   * Otra incisión: el trazo entero, o lo que queda de él fuera de la que repasa o cruza. `ramas` son los otros pedazos del
   * mismo trazo que salen de ella. Cada pedazo que da a una incisión de antes nace en ella (`nace`), y con ella es una
   * sola incisión en T o en cruz (D-420).
   */
  | { tipo: 'nueva'; trazo: PedazoDeIncision; ramas?: PedazoDeIncision[] }
  /**
   * Alarga la incisión `id`, o la cambia por `unida`; `repasado` es lo que fue por encima de ella, en las unidades de los
   * puntos (0 si nada). `enElCruce`: el trazo la cruzó cerca de una punta, y `unida` es ella acortada hasta el cruce, que
   * nace en la `barra`: el trazo nuevo, que pasa por su nueva punta y se corta antes que ella (D-415, D-420). `tramo` es
   * lo que queda de ella, en fracciones de lo que medía: con eso se recoloca lo que estaba puesto a lo largo de ella.
   * `codo`: el trazo salió de una punta en ángulo (D-420). `unida` es ella pasada un poco de frente por esa punta
   * (`PASADO_DEL_CODO_MM`) y el trazo es una de las `ramas`, que nace donde estaba la punta: una incisión en L.
   */
  | {
      tipo: 'alarga'
      id: number
      unida: PedazoDeIncision
      repasado: number
      enElCruce?: boolean
      tramo?: readonly [number, number]
      barra?: PedazoDeIncision
      ramas?: PedazoDeIncision[]
      codo?: boolean
    }
  /** Va entero por encima de la incisión `id`: no corta nada. */
  | { tipo: 'repaso'; id: number; repasado: number }

/**
 * Dónde nace un pedazo de incisión en otra (D-420): en cuál —el `id` de una de antes, o `'barra'`, el trazo nuevo que en
 * la T junto a una punta se corta antes que él— y el punto de su línea en que la toca, que es una punta del pedazo.
 */
export interface Nacimiento {
  en: number | 'barra'
  punto: Punto
}

/** Un pedazo de incisión: su trazo y, si da a otras incisiones, dónde nace en cada una (D-420). */
export interface PedazoDeIncision extends TrazoDeIncision {
  nace?: Nacimiento[]
}

/**
 * Lo que tiene que ir por encima de una incisión para que cuente como repasarla, en milímetros: lo mismo que se deja
 * para alargarla. Un trazo que nace junto a una punta y se va pisa un par de milímetros de ella, y eso es alargar.
 */
export const MINIMO_PARA_REPASAR_MM = UMBRAL_PARA_ALARGAR_MM
/**
 * Lo que sale de la incisión y es más corto que esto es el pulso, no un trazo: se deja. Quien repasa empieza o
 * termina un par de milímetros pasada la punta sin querer alargar nada.
 */
export const MINIMO_FUERA_DE_LA_INCISION_MM = 4
/**
 * Cuánto se puede torcer el trazo respecto de la incisión y seguir yendo a lo largo de ella, en grados: lo que avanza
 * sobre ella un tramo del trazo, contra lo que mide el tramo, no baja del coseno de esto. Más que el temblor de una mano
 * alzada y que los quiebres del trazo hondo (D-365), y bastante menos que un cruce en ángulo.
 *
 * Se mira el tramo entero y no cada punto: una línea recta tendida sobre una herida abierta baja al fondo y trepa por la
 * pared donde la pantalla la lleva, y punto a punto esas subidas parecían otro trazo. En el navegador, un repaso del
 * caso 4 dejaba así una incisión nueva de 22 mm.
 */
export const ANGULO_DEL_REPASO_GRADOS = 40
/** Cada cuánto se mira el trazo nuevo, en milímetros. */
export const PASO_DEL_REPASO_MM = 0.5

/**
 * Hasta dónde **de lado** de la línea de una incisión cae todavía un trazo que la repasa, en milímetros, según lo que
 * mide abierta: media abertura por cada lado, con dos de holgura para el pulso. Una incisión recién hecha, de 7 mm de
 * hueco, da 5,5; con los Farabeuf a 14 mm por labio, unos 20.
 *
 * Lo hondo va aparte (`HONDURA_DEL_REPASO_MM`). Antes las dos cosas iban en una sola distancia, con el grosor de la piel
 * como hondura, y no alcanzaba: el trazo se pincha donde se ve, y dentro de una herida abierta eso es el fondo, que en
 * el caso 4 quedaba de 8 a 12 mm bajo la línea. Medido así, el repaso caía fuera y volvía a ser otra incisión.
 */
export function corredorDelRepasoMm(aberturaMm: number): number {
  return Math.max(UMBRAL_PARA_ALARGAR_MM, Math.max(0, aberturaMm) / 2 + 2)
}

/**
 * Hasta dónde **bajo** la línea de una incisión, a lo largo de la normal de la piel, cae todavía un trazo que la repasa,
 * en milímetros. Lo que alcanza el fondo de una herida ya abierta hasta el músculo: piel, grasa, fascia y algo de
 * vientre muscular en la pierna del caso 4. Más hondo que esto es otra superficie, el hueso o el otro lado de la pierna,
 * y un trazo ahí no repasa nada.
 */
export const HONDURA_DEL_REPASO_MM = 25
/**
 * Lo que un trazo que repasa puede quedar **sobre** la línea, en milímetros. La piel junto a la herida se curva y los
 * labios se levantan un poco al abrirse; más arriba que esto ya no es la piel de esa incisión.
 */
export const ALTURA_DEL_REPASO_MM = 3

/** Una línea de puntos con lo que lleva recorrido en cada uno. */
interface Linea {
  puntos: readonly Punto[]
  recorrido: number[]
  largo: number
}

function linea(puntos: readonly Punto[]): Linea {
  const recorrido = [0]
  for (let i = 1; i < puntos.length; i++) recorrido.push(recorrido[i - 1] + distancia(puntos[i - 1], puntos[i]))
  return { puntos, recorrido, largo: recorrido[recorrido.length - 1] ?? 0 }
}

/** El punto de la línea a `s` de su inicio, y entre qué dos puntos cae (`i`, `i + 1`) y a qué fracción (`f`). */
function enLaLinea(l: Linea, s: number): { p: Punto; i: number; f: number } {
  const t = Math.min(l.largo, Math.max(0, s))
  let i = 0
  while (i < l.puntos.length - 2 && l.recorrido[i + 1] < t) i++
  const tramo = l.recorrido[i + 1] - l.recorrido[i]
  const f = tramo > 0 ? (t - l.recorrido[i]) / tramo : 0
  const a = l.puntos[i]
  const b = l.puntos[Math.min(i + 1, l.puntos.length - 1)]
  return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], i, f }
}

/**
 * El punto de la línea más cerca de `p`: a qué distancia y a qué recorrido de su inicio, y entre qué dos puntos cae
 * (`i`, `i + 1`) y a qué fracción (`u`), para leer ahí la normal.
 */
function proyectar(l: Linea, p: Punto): { distancia: number; s: number; i: number; u: number; q: Punto } {
  let mejor = { distancia: Infinity, s: 0, i: 0, u: 0, q: l.puntos[0] ?? p }
  for (let i = 0; i < l.puntos.length - 1; i++) {
    const a = l.puntos[i]
    const b = l.puntos[i + 1]
    const ab: Punto = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const n2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2]
    const u = n2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / n2)) : 0
    const q: Punto = [a[0] + ab[0] * u, a[1] + ab[1] * u, a[2] + ab[2] * u]
    const d = distancia(p, q)
    if (d < mejor.distancia) mejor = { distancia: d, s: l.recorrido[i] + Math.sqrt(n2) * u, i, u, q }
  }
  return mejor
}

/**
 * Lo que separa `p` de la línea de una incisión, partido en dos: de lado, sobre la piel, y de hondo, por la normal de la
 * piel en ese punto de la línea (negativo hacia dentro). Sin normal que leer —una incisión sin ellas—, todo es de lado.
 */
function apartamiento(l: Linea, normales: readonly Punto[], p: Punto): { s: number; lado: number; hondo: number } {
  const cerca = proyectar(l, p)
  const a = normales[cerca.i]
  const b = normales[Math.min(cerca.i + 1, normales.length - 1)]
  const d: Punto = [p[0] - cerca.q[0], p[1] - cerca.q[1], p[2] - cerca.q[2]]
  if (!a || !b) return { s: cerca.s, lado: cerca.distancia, hondo: 0 }
  const n: Punto = [a[0] + (b[0] - a[0]) * cerca.u, a[1] + (b[1] - a[1]) * cerca.u, a[2] + (b[2] - a[2]) * cerca.u]
  const largo = Math.hypot(n[0], n[1], n[2])
  if (largo < 1e-9) return { s: cerca.s, lado: cerca.distancia, hondo: 0 }
  const hondo = (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / largo
  const lado = Math.sqrt(Math.max(0, cerca.distancia * cerca.distancia - hondo * hondo))
  return { s: cerca.s, lado, hondo }
}

/**
 * El pedazo del trazo entre los recorridos `desde` y `hasta`, con sus normales. Los extremos caen entre dos puntos del
 * trazo y se interpolan; la normal, además, se vuelve a hacer unitaria.
 */
function pedazo(t: TrazoDeIncision, l: Linea, desde: number, hasta: number): TrazoDeIncision {
  const inicio = enLaLinea(l, desde)
  const fin = enLaLinea(l, hasta)
  const puntos: Punto[] = [inicio.p]
  const normales: Punto[] = [normalEntre(t.normales, inicio.i, inicio.f)]
  for (let k = 0; k < t.puntos.length; k++) {
    if (l.recorrido[k] > desde && l.recorrido[k] < hasta) {
      puntos.push(t.puntos[k])
      normales.push(t.normales[k] ?? normalEntre(t.normales, k, 0))
    }
  }
  puntos.push(fin.p)
  normales.push(normalEntre(t.normales, fin.i, fin.f))
  return { puntos, normales }
}

/** La normal entre la `i` y la siguiente, a la fracción `f`, unitaria. Sin normales que leer, la de +Z. */
function normalEntre(normales: readonly Punto[], i: number, f: number): Punto {
  const a = normales[Math.min(i, normales.length - 1)] ?? [0, 0, 1]
  const b = normales[Math.min(i + 1, normales.length - 1)] ?? a
  const n: Punto = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
  const largo = Math.hypot(n[0], n[1], n[2]) || 1
  return [n[0] / largo, n[1] / largo, n[2] / largo]
}

/** El punto de una incisión a `s` de su inicio, sobre su línea, con la normal de la piel ahí. */
function sobreLaIncision(e: TrazoDeIncision, l: Linea, s: number): { p: Punto; n: Punto } {
  const en = enLaLinea(l, s)
  return { p: en.p, n: normalEntre(e.normales, en.i, en.f) }
}

/**
 * Lo que un pedazo que nace en una incisión **pasa** de su línea al cortarse, en milímetros (D-420; `cruzarLaLinea`).
 *
 * D-415 lo dejaba a 1 mm **antes** de la línea, de su lado: sobre la línea, la malla tiene los dos labios repetidos en el
 * mismo sitio, y el corte que empezaba ahí partía también el de enfrente, que quedaba como una franja de piel tendida
 * sobre la herida abierta. Pero ese milímetro sin cortar era lo que hacía de la T dos incisiones que se tocan: la punta
 * del brazo quedaba cerrada contra el labio de la otra, y la esquina no se abría. Ahora el brazo pasa la línea, para que
 * su grieta llegue al labio de la otra y se abra ahí, y lo de enfrente no se corta porque se deja aparte
 * (`ParametrosDeCorte.naceDe`, en `heridas.ts`).
 */
export const PASADO_DE_LA_LINEA_MM = 1

/** El trazo con un punto más delante (`antes`) o detrás (`despues`): donde nace en la incisión que cruzó. */
function anclado(t: TrazoDeIncision, antes?: { p: Punto; n: Punto }, despues?: { p: Punto; n: Punto }): TrazoDeIncision {
  return {
    puntos: [...(antes ? [antes.p] : []), ...t.puntos, ...(despues ? [despues.p] : [])],
    normales: [...(antes ? [antes.n] : []), ...t.normales, ...(despues ? [despues.n] : [])],
  }
}

/**
 * El pedazo con cada punta que da a otra incisión prolongada `d` más allá de su línea, en la dirección en que llega
 * (`PASADO_DE_LA_LINEA_MM`, D-420). El corte tiene que cruzar las aristas del labio de la otra, que caen sobre la línea:
 * acabado justo en ella, la grieta se quedaba a medio triángulo del labio, con su punta cerrada.
 *
 * Se hace con el pedazo ya en reposo (D-416): la línea de la otra está guardada así, y la dirección en que llega el
 * trazo a ella, medida sobre la herida abierta, cruzaba el hueco y no la piel.
 */
export function cruzarLaLinea(pedazo: PedazoDeIncision, d: number): PedazoDeIncision {
  const n = pedazo.puntos.length
  if (!pedazo.nace?.length || n < 2 || !(d > 0)) return pedazo
  const cerca = (p: Punto) => pedazo.nace!.some((x) => distancia(x.punto, p) <= d / 2)
  const mas = (a: Punto, b: Punto): Punto | null => {
    const l = distancia(a, b)
    return l > 0 ? [a[0] + ((a[0] - b[0]) * d) / l, a[1] + ((a[1] - b[1]) * d) / l, a[2] + ((a[2] - b[2]) * d) / l] : null
  }
  const puntos = [...pedazo.puntos]
  const normales = [...pedazo.normales]
  const alInicio = cerca(pedazo.puntos[0]) ? mas(pedazo.puntos[0], pedazo.puntos[1]) : null
  const alFinal = cerca(pedazo.puntos[n - 1]) ? mas(pedazo.puntos[n - 1], pedazo.puntos[n - 2]) : null
  if (alInicio) {
    puntos.unshift(alInicio)
    normales.unshift(normales[0])
  }
  if (alFinal) {
    puntos.push(alFinal)
    normales.push(normales[normales.length - 1])
  }
  return { ...pedazo, puntos, normales }
}

/**
 * Desde cuánto giro un trazo que sale de una punta deja de alargar la incisión y nace en ella, en L, en grados (D-420).
 *
 * Alargar une los dos en una sola línea quebrada, y la malla no sabe abrir una esquina: cada labio se aparta en
 * perpendicular a la línea, y en el codo las dos perpendiculares tiran del mismo tejido hacia sitios distintos. En una
 * lámina plana, 92 mm y 40 más desde la punta, con un Farabeuf a cada lado de la esquina: 0 triángulos doblados con el
 * trazo recto, 47 girando 45°, 63 a 90° y 68 a 135° (la L de D-415 dio 168 en la pierna). El valor es el que se midió en la
 * pierna del caso 3 (ver D-420): por debajo, alargar dobla tan poco como la incisión recta.
 */
export const ANGULO_DEL_CODO_GRADOS = 30

/** Sobre cuánto de cada lado se mide hacia dónde va, en milímetros: el pulso no cuenta como giro. */
const LARGO_PARA_LA_DIRECCION_MM = 5

/**
 * Lo que la incisión sigue de frente más allá del codo de una L, en milímetros (D-420).
 *
 * La pierna nueva tiene que nacer **dentro** de la grieta de la otra, como el brazo de una T: su punta pasa la línea y
 * cruza los labios, y ahí queda abierta. En la punta misma no hay grieta que cruzar —la grieta acaba en la última arista
 * que el trazo partió, hasta 3 mm antes de él (`ARISTA_JUNTO_AL_CORTE_MM`)—, y nacida ahí, la pierna empezaba en piel
 * sana: las dos puntas cerradas, la de cada una con su huso, y entre las dos un puente de piel en la esquina. Probado en la
 * pierna del caso 3. Por eso la incisión se alarga esto de frente y la pierna nace donde estaba su punta. Menos que
 * `EXTREMO_QUE_DA_A_LA_OTRA_MM` (4), para que su nueva punta siga contando como la de la esquina y no se pueda alargar.
 */
export const PASADO_DEL_CODO_MM = 3.5

/** Un trazo que sale en ángulo de una punta (`codoEnLaPunta`): la pierna, de qué punta sale y hacia dónde apuntaba ella. */
export interface CodoEnLaPunta {
  pedazo: PedazoDeIncision
  alFinal: boolean
  /** La dirección de la incisión al salir por esa punta, unitaria. */
  fuera: Punto
}

/**
 * El trazo llevado a que empiece en `punta` sin quebrarse: cada punto se mueve lo que separa su primer punto de la punta,
 * menos cuanto más lejos va, hasta no moverse nada el último (D-421).
 *
 * Antes la punta se ponía delante del trazo (`anclado`), y la mano casi nunca empieza justo en ella: en la pierna del
 * taller del caso 86, el brazo de la L arrancaba 2 mm al lado, y la pierna salía con un gancho de 54° en sus primeros 2 mm.
 * La herida se abre en perpendicular a la pierna según por dónde de ella cae cada vértice (`cuantoSeAparta`), y junto a un
 * gancho dos vértices vecinos del lado de dentro caen uno en su punta y otro 30 % más allá: uno no se movía y el de al
 * lado 9 mm, y con los dos Farabeuf la esquina daba 100 triángulos vueltos. Llevando todo el trazo, lo que se tuerce es
 * esos 2 mm repartidos en lo que mida la pierna, y el otro extremo queda donde terminó la mano.
 */
function desdeLaPunta(t: TrazoDeIncision, punta: Punto, n: Punto): TrazoDeIncision {
  const recorrido = [0]
  for (let i = 1; i < t.puntos.length; i++) recorrido.push(recorrido[i - 1] + distancia(t.puntos[i - 1], t.puntos[i]))
  const largo = recorrido[recorrido.length - 1]
  if (!(largo > 0)) return anclado(t, { p: punta, n })
  const p0 = t.puntos[0]
  const hasta: Punto = [punta[0] - p0[0], punta[1] - p0[1], punta[2] - p0[2]]
  return {
    puntos: t.puntos.map((p, i): Punto => {
      const f = 1 - recorrido[i] / largo
      return [p[0] + hasta[0] * f, p[1] + hasta[1] * f, p[2] + hasta[2] * f]
    }),
    normales: [n, ...t.normales.slice(1)],
  }
}

/**
 * El trazo que sale de una punta libre de `e` (a menos de `alcance`) en ángulo, como pierna que nace en ella (D-420), o
 * `null` si sigue de frente y la alarga. La pierna empieza en la punta misma (`desdeLaPunta`): lo que el trazo tenga a
 * menos de un milímetro de ella se quita, porque de ahí sale la dirección con que `cruzarLaLinea` pasa la esquina, y un
 * tramo de una décima apuntaría a cualquier parte.
 */
export function codoEnLaPunta(e: IncisionExistente, nuevo: TrazoDeIncision, alcance: number, mm: number): CodoEnLaPunta | null {
  if (e.puntos.length < 2 || nuevo.puntos.length < 2) return null
  const libres = e.libres ?? AMBAS_LIBRES
  const a0 = e.puntos[0]
  const a1 = e.puntos[e.puntos.length - 1]
  const b0 = nuevo.puntos[0]
  const b1 = nuevo.puntos[nuevo.puntos.length - 1]
  // El mismo par de extremos que uniría `alargarIncision`.
  const opciones = [
    { d: libres.final ? distancia(a1, b0) : Infinity, alFinal: true, alReves: false },
    { d: libres.final ? distancia(a1, b1) : Infinity, alFinal: true, alReves: true },
    { d: libres.inicio ? distancia(a0, b1) : Infinity, alFinal: false, alReves: true },
    { d: libres.inicio ? distancia(a0, b0) : Infinity, alFinal: false, alReves: false },
  ].sort((x, y) => x.d - y.d)
  const mejor = opciones[0]
  if (!(mejor.d <= alcance)) return null
  const trazo = mejor.alReves ? alReves(nuevo) : nuevo
  const deLaIncision = linea(e.puntos)
  const delTrazo = linea(trazo.puntos)
  const tramo = LARGO_PARA_LA_DIRECCION_MM * mm
  if (deLaIncision.largo <= 0 || delTrazo.largo <= tramo / 2) return null
  const punta = mejor.alFinal ? a1 : a0
  const atras = enLaLinea(deLaIncision, mejor.alFinal ? deLaIncision.largo - tramo : tramo).p
  const adelante = enLaLinea(delTrazo, tramo).p
  const fuera: Punto = [punta[0] - atras[0], punta[1] - atras[1], punta[2] - atras[2]]
  const sale: Punto = [adelante[0] - trazo.puntos[0][0], adelante[1] - trazo.puntos[0][1], adelante[2] - trazo.puntos[0][2]]
  const largoFuera = Math.hypot(...fuera)
  const largos = largoFuera * Math.hypot(...sale)
  if (!(largos > 0)) return null
  const coseno = (fuera[0] * sale[0] + fuera[1] * sale[1] + fuera[2] * sale[2]) / largos
  if (coseno >= Math.cos((ANGULO_DEL_CODO_GRADOS * Math.PI) / 180)) return null
  let desde = 0
  while (desde < trazo.puntos.length - 2 && distancia(trazo.puntos[desde], punta) < mm) desde++
  const resto = { puntos: trazo.puntos.slice(desde), normales: trazo.normales.slice(desde) }
  const n = e.normales[mejor.alFinal ? e.normales.length - 1 : 0] ?? resto.normales[0] ?? [0, 0, 1]
  return {
    pedazo: { ...desdeLaPunta(resto, punta, n), nace: [{ en: e.id, punto: punta }] },
    alFinal: mejor.alFinal,
    fuera: [fuera[0] / largoFuera, fuera[1] / largoFuera, fuera[2] / largoFuera],
  }
}

/** La incisión pasada de frente `PASADO_DEL_CODO_MM` por la punta del codo (D-420), sin cambiar su sentido. */
function pasarElCodo(t: TrazoDeIncision, codo: CodoEnLaPunta, mm: number): TrazoDeIncision {
  const d = PASADO_DEL_CODO_MM * mm
  const i = codo.alFinal ? t.puntos.length - 1 : 0
  const p = t.puntos[i]
  const mas: Punto = [p[0] + codo.fuera[0] * d, p[1] + codo.fuera[1] * d, p[2] + codo.fuera[2] * d]
  const n = t.normales[i] ?? [0, 0, 1]
  return codo.alFinal
    ? { puntos: [...t.puntos, mas], normales: [...t.normales, n] }
    : { puntos: [mas, ...t.puntos], normales: [n, ...t.normales] }
}

/**
 * Qué hacer con un trazo nuevo en una capa que ya tiene incisiones: repasar una, alargarla o abrir otra (D-410).
 *
 * Todas las distancias van en las unidades de los puntos. `umbral` es el de alargar (`UMBRAL_PARA_ALARGAR_MM`), `mm` lo
 * que mide un milímetro, y `corredor(id)` hasta dónde de lado de la incisión `id` cae un trazo que la repasa
 * (`corredorDelRepasoMm`, que depende de lo abierta que esté); `corredor(id, s)`, lo mismo a `s` de su inicio, con lo
 * abierta que está ahí. De hondo, hasta `HONDURA_DEL_REPASO_MM` bajo la línea y
 * `ALTURA_DEL_REPASO_MM` sobre ella.
 */
export function decidirElTrazo(
  existentes: readonly IncisionExistente[],
  capa: string,
  nuevo: TrazoDeIncision,
  { umbral, mm, corredor }: { umbral: number; mm: number; corredor: (id: number, s?: number) => number },
): DecisionDelTrazo {
  const hondura = HONDURA_DEL_REPASO_MM * mm
  const altura = ALTURA_DEL_REPASO_MM * mm
  const delTrazo = linea(nuevo.puntos)
  const paso = PASO_DEL_REPASO_MM * mm
  const cosenoMinimo = Math.cos((ANGULO_DEL_REPASO_GRADOS * Math.PI) / 180)
  const muestras = delTrazo.largo > 0 ? Math.max(1, Math.ceil(delTrazo.largo / paso)) : 0
  const enLaMuestra: Punto[] = []
  for (let k = 0; k <= muestras; k++) enLaMuestra.push(enLaLinea(delTrazo, Math.min(delTrazo.largo, k * paso)).p)
  // La incisión que más repasa, y dónde: para cada muestra del trazo, si va por encima de ella.
  let mejor: { e: IncisionExistente; deLaIncision: Linea; encima: boolean[]; repasado: number } | null = null
  // Dónde pisa el trazo cada incisión de su capa, vaya a lo largo de ella o no: lo que mira el cruce.
  const huellas: Huella[] = []
  for (const e of existentes) {
    if (e.capa !== capa || e.puntos.length < 2) continue
    const deLaIncision = linea(e.puntos)
    if (deLaIncision.largo <= 0) continue
    const ancho = corredor(e.id)
    // Primero, qué muestras caen sobre ella: cerca de lado, no más hondo que el fondo de la herida, y a la altura de su
    // tramo. Pasada una punta, la más cercana es la punta misma: ahí el trazo ya no va por encima, se sale (y la alarga).
    // De lado, lo que la herida está abierta **ahí** (`corredor(id, s)`), si se sabe, y nunca más que lo que más se abre:
    // junto a la punta casi no se abre, y medido con lo del medio, un cruce allí caía entero en piel sana que «ya estaba
    // cortada» (D-415).
    const sobre: (number | null)[] = []
    const hondoEn: number[] = []
    const ladoEn: number[] = []
    for (let k = 0; k <= muestras; k++) {
      const m = apartamiento(deLaIncision, e.normales, enLaMuestra[k])
      const enSuTramo = m.s > paso / 2 && m.s < deLaIncision.largo - paso / 2
      const cerca = m.lado <= ancho && m.lado <= corredor(e.id, m.s) && m.hondo >= -hondura && m.hondo <= altura
      sobre.push(cerca && enSuTramo ? m.s : null)
      hondoEn.push(m.hondo)
      ladoEn.push(m.lado)
    }
    huellas.push({ e, deLaIncision, sobre, lado: ladoEn })
    // Después, cada tramo seguido de ellas: va a lo largo si avanza sobre la incisión casi lo que mide **sobre la piel**.
    // Un cruce la atraviesa sin avanzar sobre ella. Lo que el trazo baja o sube no se cuenta: quien vuelve desde una punta
    // cae enseguida al fondo de la herida abierta, y en el caso 4 esa caída eran 10 mm de trazo en el mismo milímetro de
    // incisión, que bastaban para que un repaso de 47 mm no «avanzara» lo suficiente y la alargara a 138.
    const encima = sobre.map(() => false)
    let cuantas = 0
    for (let k = 0; k <= muestras; ) {
      if (sobre[k] === null) {
        k++
        continue
      }
      let fin = k
      let menor = sobre[k]!
      let mayor = sobre[k]!
      let mide = 0
      while (fin + 1 <= muestras && sobre[fin + 1] !== null) {
        fin++
        menor = Math.min(menor, sobre[fin]!)
        mayor = Math.max(mayor, sobre[fin]!)
        const tramo = distancia(enLaMuestra[fin - 1], enLaMuestra[fin])
        const baja = hondoEn[fin] - hondoEn[fin - 1]
        mide += Math.sqrt(Math.max(0, tramo * tramo - baja * baja))
      }
      if (fin > k && mayor > menor && mayor - menor >= cosenoMinimo * mide) {
        for (let j = k; j <= fin; j++) encima[j] = true
        cuantas += fin - k + 1
      }
      k = fin + 1
    }
    const repasado = Math.min(delTrazo.largo, cuantas * paso)
    if (!mejor || repasado > mejor.repasado) mejor = { e, deLaIncision, encima, repasado }
  }

  const sDe = (k: number) => Math.min(delTrazo.largo, k * paso)
  const minimoFuera = MINIMO_FUERA_DE_LA_INCISION_MM * mm

  // Lo que apenas pisa una incisión a lo largo es lo de siempre: alargarla si nace junto a una punta, cruzarla si pasa por
  // encima de ella en ángulo (D-415), y si no la toca, otra incisión.
  if (!mejor || mejor.repasado < MINIMO_PARA_REPASAR_MM * mm) {
    const alarga = incisionQueAlarga(existentes, capa, nuevo, umbral)
    if (alarga) {
      // La que alargaría, si el trazo sale de ella en ángulo, es la incisión en que nace la L (D-420).
      const base = existentes.find((x) => x.id === alarga.id)
      const codo = base ? codoEnLaPunta(base, nuevo, umbral, mm) : null
      if (base && codo) return { tipo: 'alarga', id: base.id, unida: pasarElCodo(base, codo, mm), repasado: 0, ramas: [codo.pedazo], codo: true }
      return { tipo: 'alarga', id: alarga.id, unida: alarga.unida, repasado: 0 }
    }
    return cruzarLasIncisiones(huellas, nuevo, delTrazo, sDe, mm) ?? { tipo: 'nueva', trazo: nuevo }
  }

  const { e, deLaIncision, encima, repasado } = mejor
  const libres = e.libres ?? AMBAS_LIBRES
  // Solo cuenta lo que sobra por delante o por detrás de lo repasado. Un hueco entre dos tramos encima —la mano que
  // tiembla, un quiebre del trazo hondo— es parte del repaso.
  const primera = encima.indexOf(true)
  const ultima = encima.lastIndexOf(true)
  const sobrantes: { trazo: TrazoDeIncision; enLaPunta: boolean; ancla: { p: Punto; n: Punto }; alInicio: boolean; codo?: boolean }[] = []
  const mirarSobrante = (desde: number, hasta: number, union: number) => {
    if (hasta - desde < minimoFuera) return
    // Sale por una punta si donde deja la incisión está junto a uno de sus extremos. El que da a otra incisión de la misma
    // no es una punta (D-420): lo que sale por ahí sale de su lado, y nace en ella.
    const donde = proyectar(deLaIncision, enLaLinea(delTrazo, union).p)
    const enLaPunta = (libres.inicio && donde.s <= umbral + paso) || (libres.final && donde.s >= deLaIncision.largo - umbral - paso)
    sobrantes.push({ trazo: pedazo(nuevo, delTrazo, desde, hasta), enLaPunta, ancla: sobreLaIncision(e, deLaIncision, donde.s), alInicio: union === desde })
  }
  if (primera > 0) mirarSobrante(0, sDe(primera), sDe(primera))
  if (ultima < encima.length - 1) mirarSobrante(sDe(ultima), delTrazo.largo, sDe(ultima))

  // Lo que sale por un lado nace en la incisión: desde su línea, y no desde donde el trazo dejó de pisarla, que con la
  // herida abierta cae en el labio o en el fondo y dejaba entre las dos un puente de piel (D-415). Con ella es una sola
  // incisión en T (D-420). Si sale por los dos lados, el pedazo más largo es el principal y el otro una rama, que antes
  // se perdía.
  // Lo que se sale por una punta y gira (D-420) no la alarga quebrada: es la pierna de una L, como sin repaso.
  const alcanceDelRepaso = Math.hypot(corredor(e.id), hondura) + umbral
  const codos: CodoEnLaPunta[] = []
  for (const x of sobrantes) {
    if (!x.enLaPunta) continue
    const codo = codoEnLaPunta(e, x.trazo, alcanceDelRepaso, mm)
    if (codo) {
      codos.push(codo)
      x.codo = true
    }
  }
  const porUnLado: PedazoDeIncision[] = sobrantes
    .filter((x) => !x.enLaPunta)
    .map(
      (x): PedazoDeIncision => ({
        ...(x.alInicio ? anclado(x.trazo, x.ancla) : anclado(x.trazo, undefined, x.ancla)),
        nace: [{ en: e.id, punto: x.ancla.p }],
      }),
    )
    .sort((a, b) => linea(b.puntos).largo - linea(a.puntos).largo)
  const conRamas = (ramas: PedazoDeIncision[]) => (ramas.length > 0 ? { ramas } : {})
  const porLasPuntas = sobrantes.filter((x) => x.enLaPunta && !x.codo)
  if (porLasPuntas.length > 0 || codos.length > 0) {
    // Se une por la punta más cercana, aunque el pedazo arranque a un lado de la línea o en el fondo de la herida: es lo
    // que se repasó de ella. Por eso la distancia para unir es todo el corredor, de lado y de hondo.
    let unida: TrazoDeIncision = { puntos: [...e.puntos], normales: [...e.normales] }
    for (const s of porLasPuntas) unida = alargarIncision(unida, s.trazo, alcanceDelRepaso, libres) ?? unida
    for (const c of codos) unida = pasarElCodo(unida, c, mm)
    const ramas = [...porUnLado, ...codos.map((c) => c.pedazo)]
    return { tipo: 'alarga', id: e.id, unida, repasado, ...conRamas(ramas), ...(codos.length > 0 ? { codo: true } : {}) }
  }
  const [principal, ...ramas] = porUnLado
  if (principal) return { tipo: 'nueva', trazo: principal, ...conRamas(ramas) }
  return { tipo: 'repaso', id: e.id, repasado }
}

// ----------------------------------------------------------------------------------------------- el cruce

/**
 * Cuán cerca de una punta de la incisión tiene que cruzarla un trazo para que el pedacito de punta del otro lado se
 * cierre, en milímetros (D-415). Nunca más de un tercio de lo que mide: en una de 45 mm, el cruce a 20 de una punta ya es
 * su medio.
 */
export const PUNTA_DEL_CRUCE_MM = 20

/** Dónde pisa un trazo una incisión: en cada muestra, a qué recorrido de ella si cae en su corredor (o `null`), y a qué distancia de lado. */
interface Huella {
  e: IncisionExistente
  deLaIncision: Linea
  sobre: (number | null)[]
  lado: number[]
}

/** Dónde cruza el trazo una incisión: en cuál, a qué recorrido de ella, y el punto de su línea con la normal de la piel ahí. */
interface Cruce {
  huella: Huella
  s: number
  p: Punto
  n: Punto
}

/** Un pedazo del trazo fuera de toda incisión, con dónde nace (`inicio`) y dónde muere (`fin`) si da a una. */
interface Brazo {
  trazo: TrazoDeIncision
  largo: number
  inicio?: Cruce
  fin?: Cruce
}

/**
 * Un trazo que **cruza** una incisión de su capa (pedido del dueño del 2026-11-17, D-415): «si hago dos cortes, que se
 * puedan unificar si se cruzan sin que quede la cagada».
 *
 * Antes el cruce era otra incisión, entera, y la malla quedaba mal de dos maneras:
 *
 * - El trazo corta también **sobre la herida abierta**. Ahí se pincha el fondo o la pared, y el corte toma la normal de esa
 *   pared, casi de lado: el campo que parte la malla se tumbaba y la piel del cruce se desgarraba en láminas.
 * - Cerca de una punta quedaba un **pedacito de incisión** al otro lado del cruce, un colgajo de unos milímetros entre
 *   las dos heridas que cada una abría hacia un lado. Es la foto del dueño: la piel «achurrascada» en la esquina, con 23
 *   triángulos vueltos sobre la piel nada más cortar y 28 al abrirla con los Farabeuf.
 *
 * Ahora el trazo no corta nada dentro del corredor de la incisión (`corredorDelRepasoMm`): la capa ya está partida ahí.
 * Cada pedazo que sale de él empieza o termina **en la línea** de la incisión, que es donde estaba la piel antes de
 * abrirse, y no en el labio ni en el fondo. Nace en ella (`nace`), y con ella es una sola incisión (D-420): al cortarse
 * pasa la línea un milímetro (`cruzarLaLinea`) y se abre en el labio de la otra, como la esquina de una T. D-415 lo
 * dejaba a un milímetro de la línea, y eran dos incisiones que se tocaban.
 *
 * - Si el cruce cae en medio, el pedazo más largo es el principal y los demás, ramas: una cruz, o una T que nace del
 *   borde de la herida.
 * - Si cae a menos de `PUNTA_DEL_CRUCE_MM` de una punta libre y el trazo pasa de lado a lado, la incisión se acorta hasta
 *   el cruce: el pedacito de punta del otro lado se cierra. El trazo nuevo, la barra, queda entero y recto por la nueva
 *   punta, y la incisión vieja es el pie de una T que nace en ella.
 *
 * Un trazo que llega al corredor por un solo lado, en medio o junto a una punta, es esa T: nace en la línea.
 *
 * Devuelve `null` si el trazo no pisa ninguna incisión, y la repasa si no queda fuera nada que cortar.
 */
function cruzarLasIncisiones(
  huellas: readonly Huella[],
  nuevo: TrazoDeIncision,
  delTrazo: Linea,
  sDe: (k: number) => number,
  mm: number,
): DecisionDelTrazo | null {
  const muestras = huellas[0]?.sobre.length ?? 0
  // En cada muestra, la incisión en cuyo corredor cae (la más cercana de lado, si son dos), o −1.
  const deCual: number[] = []
  for (let k = 0; k < muestras; k++) {
    let cual = -1
    for (let h = 0; h < huellas.length; h++) {
      if (huellas[h].sobre[k] === null) continue
      if (cual < 0 || huellas[h].lado[k] < huellas[cual].lado[k]) cual = h
    }
    deCual.push(cual)
  }
  if (deCual.every((cual) => cual < 0)) return null

  // Los tramos seguidos: dentro de una incisión, o fuera de todas (−1).
  const tramos: { desde: number; hasta: number; cual: number }[] = []
  for (let k = 0; k < muestras; k++) {
    const ultimo = tramos[tramos.length - 1]
    if (ultimo && ultimo.cual === deCual[k]) ultimo.hasta = k
    else tramos.push({ desde: k, hasta: k, cual: deCual[k] })
  }
  // Dónde cruza un tramo de dentro: en la muestra más cerca de la línea. Sobre la herida abierta el trazo cae al fondo,
  // que queda bajo ella, y en el labio queda a un lado: lo más cercano de lado es la línea que se cruzó.
  const cruceDe = (tramo: { desde: number; hasta: number; cual: number }): Cruce | undefined => {
    if (tramo.cual < 0) return undefined
    const huella = huellas[tramo.cual]
    let cerca = tramo.desde
    for (let k = tramo.desde + 1; k <= tramo.hasta; k++) if (huella.lado[k] < huella.lado[cerca]) cerca = k
    const s = huella.sobre[cerca]!
    return { huella, s, ...sobreLaIncision(huella.e, huella.deLaIncision, s) }
  }

  // Los pedazos de fuera, cada uno desde la línea de la incisión que deja hasta la de la que alcanza. Lo que no llega a
  // `MINIMO_FUERA_DE_LA_INCISION_MM` es el pulso, que se sale un momento del corredor, y no se corta.
  // Uno por tramo: los dos brazos que salen de un mismo cruce comparten el suyo, y así se reconocen.
  const cruces = tramos.map((tramo) => cruceDe(tramo))
  const brazos: Brazo[] = []
  tramos.forEach((tramo, i) => {
    if (tramo.cual >= 0) return
    const desde = sDe(tramo.desde)
    const hasta = sDe(tramo.hasta)
    if (hasta - desde < MINIMO_FUERA_DE_LA_INCISION_MM * mm) return
    const inicio = cruces[i - 1]
    const fin = cruces[i + 1]
    const trazo = anclado(pedazo(nuevo, delTrazo, desde, hasta), inicio, fin)
    brazos.push({ trazo, largo: linea(trazo.puntos).largo, inicio, fin })
  })
  if (brazos.length === 0) {
    // Todo dentro: un trazo corto que atraviesa la herida de labio a labio. No queda nada que cortar.
    const mas = tramos.filter((t) => t.cual >= 0).sort((a, b) => b.hasta - b.desde - (a.hasta - a.desde))[0]
    return { tipo: 'repaso', id: huellas[mas.cual].e.id, repasado: 0 }
  }

  // Un cruce de lado a lado junto a una punta: un brazo llega a él y otro sale. La incisión se acorta hasta el cruce y el
  // trazo nuevo pasa entero por su nueva punta. Antes de esto se probó lo que se le propuso al dueño, la incisión que dobla
  // en el cruce y sigue por el brazo más largo: una sola incisión en L. Abierta con dos Farabeuf a 14 mm, la esquina de
  // dentro recibía el empuje de los dos tramos y la piel se plegaba, con 168 triángulos vueltos junto al cruce contra los
  // 28 que dejaba el cruce de antes.
  let enLaPunta: { antes: Brazo; despues: Brazo; cruce: Cruce; alInicio: boolean } | null = null
  for (const antes of brazos) {
    const cruce = antes.fin
    const despues = cruce && brazos.find((b) => b.inicio === cruce)
    if (!cruce || !despues) continue
    const largo = cruce.huella.deLaIncision.largo
    const tope = Math.min(PUNTA_DEL_CRUCE_MM * mm, largo / 3)
    // Solo una punta de verdad: la que da a otra incisión de la misma no se acorta, que la separaría de ella (D-420).
    const libres = cruce.huella.e.libres ?? AMBAS_LIBRES
    const alInicio = libres.inicio && cruce.s <= tope
    if (!alInicio && !(libres.final && cruce.s >= largo - tope)) continue
    if (!enLaPunta || antes.largo + despues.largo > enLaPunta.antes.largo + enLaPunta.despues.largo) enLaPunta = { antes, despues, cruce, alInicio }
  }
  const conRamas = (ramas: PedazoDeIncision[]) => (ramas.length > 0 ? { ramas } : {})
  // Cada brazo nace en la línea de la incisión que deja o a la que llega (D-420): con ella es una sola. Al cortarse pasa
  // la línea (`cruzarLaLinea`), y lo de enfrente se deja aparte.
  const nacimientos = (inicio?: Cruce, fin?: Cruce): { nace?: Nacimiento[] } => {
    const nace = [inicio, fin].filter((c): c is Cruce => c !== undefined).map((c) => ({ en: c.huella.e.id, punto: c.p }))
    return nace.length > 0 ? { nace } : {}
  }
  const naciente = (b: Brazo): PedazoDeIncision => ({ ...b.trazo, ...nacimientos(b.inicio, b.fin) })
  if (enLaPunta) {
    const { antes, despues, cruce, alInicio } = enLaPunta
    const { e, deLaIncision } = cruce.huella
    // Lo que queda de la incisión, de su punta lejana al cruce, en el sentido en que se trazó: sus separadores y sus pinzas
    // siguen donde estaban. El pedacito del otro lado se cierra. Queda un milímetro pasado el cruce, por su propia línea:
    // así su grieta llega al labio de la barra (D-420).
    const largo = deLaIncision.largo
    const pasa = PASADO_DE_LA_LINEA_MM * mm
    const tramo: [number, number] = alInicio ? [Math.max(0, cruce.s - pasa) / largo, 1] : [0, Math.min(largo, cruce.s + pasa) / largo]
    const queda: PedazoDeIncision = { ...pedazo(e, deLaIncision, tramo[0] * largo, tramo[1] * largo), nace: [{ en: 'barra', punto: cruce.p }] }
    // El trazo nuevo, recto por el cruce: sin lo que cayó sobre la herida, que en la línea es donde estaba la piel. Se
    // corta antes que la incisión acortada, que nace en él.
    const barra: PedazoDeIncision = { ...unir(antes.trazo, despues.trazo), ...nacimientos(antes.inicio, despues.fin) }
    const otras = brazos.filter((b) => b !== antes && b !== despues).map(naciente)
    return { tipo: 'alarga', id: e.id, unida: queda, repasado: 0, enElCruce: true, tramo, barra, ...conRamas(otras) }
  }
  const [principal, ...ramas] = [...brazos].sort((a, b) => b.largo - a.largo)
  return { tipo: 'nueva', trazo: naciente(principal), ...conRamas(ramas.map(naciente)) }
}

// ----------------------------------------------------------------------------------------------- la unión (D-420)

/**
 * Qué incisiones son una sola (D-420): de cada una, la primera de su grupo. Un grupo son las que nacen unas en otras
 * (`nace`), por mucho que se encadenen: la cruz que nace en una incisión y la rama que después nace en un brazo de la
 * cruz son la misma. Una incisión que no nace en ninguna ni tiene nada que nazca en ella es su propio grupo.
 *
 * Se calcula de los cortes y no se guarda: cerrar uno de los pedazos —deshacer el último gesto— rompe los lazos que
 * salían de él, y el grupo que queda es el que dicen los que siguen.
 */
export function unionesDe(cortes: readonly { id?: number; nace?: readonly { incision: number }[] }[]): Map<number, number> {
  const padre = new Map<number, number>()
  const raiz = (x: number): number => {
    let r = x
    while (padre.get(r) !== undefined && padre.get(r) !== r) r = padre.get(r)!
    padre.set(x, r)
    return r
  }
  const ids = new Set(cortes.map((c) => c.id).filter((id): id is number => id !== undefined))
  for (const id of ids) padre.set(id, id)
  for (const c of cortes) {
    if (c.id === undefined) continue
    for (const n of c.nace ?? []) {
      if (!ids.has(n.incision)) continue
      const a = raiz(c.id)
      const b = raiz(n.incision)
      // La primera de todas da nombre al grupo: es la que se ve en el recuadro y la que se cuenta en el paso.
      if (a !== b) padre.set(Math.max(a, b), Math.min(a, b))
    }
  }
  const salida = new Map<number, number>()
  for (const id of ids) salida.set(id, raiz(id))
  return salida
}

/**
 * Las incisiones que nacen en la `id`, directa o indirectamente (D-420), en el orden de `cortes`: la rama que nace en un
 * brazo de la cruz que nace en ella, también. Rehacer la `id` obliga a rehacerlas después, porque cada una deja aparte lo
 * de enfrente de aquella en que nace, y eso se mira con ella ya cortada. Cada corte va después de aquellos en que nace,
 * así que basta una pasada.
 */
export function lasQueNacenEn<C extends { id?: number; nace?: readonly { incision: number }[] }>(cortes: readonly C[], id: number): C[] {
  const dentro = new Set([id])
  const salida: C[] = []
  for (const c of cortes) {
    if (c.id === undefined || dentro.has(c.id)) continue
    if (!(c.nace ?? []).some((n) => dentro.has(n.incision))) continue
    dentro.add(c.id)
    salida.push(c)
  }
  return salida
}

/**
 * Qué puntas de cada incisión son puntas de verdad (D-420): la que da a otra incisión de la misma —porque nace en ella,
 * o porque otra nace ahí— no lo es. Es la esquina de la T, que no se alarga ni se acorta en un cruce, y no lleva la
 * punta amarilla de alargar. `cerca` es hasta dónde del extremo puede caer el punto en que se tocan, en las unidades
 * de los puntos: el que el pedazo pasa la línea y algo de holgura.
 */
export function puntasLibresDe(
  cortes: readonly { id?: number; puntos: readonly Punto[]; nace?: readonly { incision: number; punto: Punto }[] }[],
  cerca: number,
): Map<number, PuntasLibres> {
  const salida = new Map<number, PuntasLibres>()
  for (const c of cortes) {
    if (c.id === undefined || c.puntos.length < 2) continue
    const toques = [
      ...(c.nace ?? []).map((n) => n.punto),
      ...cortes.flatMap((o) => (o === c ? [] : (o.nace ?? []).filter((n) => n.incision === c.id).map((n) => n.punto))),
    ]
    const libre = (p: Punto) => toques.every((q) => distancia(p, q) > cerca)
    salida.set(c.id, { inicio: libre(c.puntos[0]), final: libre(c.puntos[c.puntos.length - 1]) })
  }
  return salida
}

/**
 * Lo que mide cada trazo de una incisión de varios pedazos (D-420), en el orden de `pedazos`. Un trazo que cruza una
 * incisión entera la deja en dos brazos, uno a cada lado, que nacen en el mismo punto de ella: se leen juntos, «93 + 73»,
 * porque son la raya que se hizo, y «93 + 41 + 32» contaba tres cortes donde se dieron dos. Dos pedazos van juntos si
 * nacen en la misma incisión a menos de `cerca` (en las unidades de los puntos), y eso se encadena: el trazo que cruza
 * dos incisiones paralelas son tres pedazos y un solo tramo. La barra de una T y el brazo que nace en ella no se juntan:
 * uno nace en el otro, no los dos en una tercera.
 */
export function tramosDeLosTrazos(
  pedazos: readonly { largoMm: number; nace?: readonly { incision: number; punto: Punto }[] }[],
  cerca: number,
): number[] {
  const padre = pedazos.map((_, i) => i)
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])))
  for (let i = 0; i < pedazos.length; i++) {
    for (let j = i + 1; j < pedazos.length; j++) {
      const juntos = (pedazos[i].nace ?? []).some((a) =>
        (pedazos[j].nace ?? []).some((b) => a.incision === b.incision && distancia(a.punto, b.punto) <= cerca),
      )
      if (juntos) padre[raiz(j)] = raiz(i)
    }
  }
  const porTrazo = new Map<number, number>()
  pedazos.forEach((p, i) => porTrazo.set(raiz(i), (porTrazo.get(raiz(i)) ?? 0) + p.largoMm))
  return [...porTrazo.values()]
}

/**
 * Lo que el panel «Incisiones» dice de cada una: «Incisión 2 · músculo · 30 mm». Una incisión en T o en cruz es una
 * sola, con lo que mide cada uno de sus pedazos (`tramosMm`, D-420): `largoMm` es la suma.
 */
export interface ResumenDeIncision {
  id: number
  capa: 'piel' | 'fascia' | 'musculo'
  largoMm: number
  aperturaMm: number
  tramosMm?: number[]
  /** Los números de sus pedazos, si tiene más de uno: `id` es el del primero. */
  pedazos?: number[]
}

/**
 * Lo que mide una incisión de varios pedazos, como se dice (D-420): «85 + 60 mm», el más largo primero. Con uno solo,
 * «92 mm». Así se lee de qué está hecha, y no un total que no se ve en ninguna parte de la piel.
 */
export function medidaDeLaIncision(r: Pick<ResumenDeIncision, 'largoMm' | 'tramosMm'>): string {
  const tramos = (r.tramosMm ?? []).filter((x) => x > 0)
  if (tramos.length < 2) return `${Math.round(r.largoMm)} mm`
  return `${[...tramos].sort((a, b) => b - a).map((x) => Math.round(x)).join(' + ')} mm`
}

/** El texto de una incisión en el panel, con su número de orden (1, 2…) y no su `id` interno. */
export function rotuloDeLaIncision(orden: number, r: Pick<ResumenDeIncision, 'capa' | 'largoMm' | 'aperturaMm' | 'tramosMm'>): string {
  const capa = r.capa === 'piel' ? 'piel' : r.capa === 'fascia' ? 'fascia' : 'músculo'
  const abierta = r.aperturaMm >= 1 ? ` · abierta ${Math.round(r.aperturaMm)} mm` : ''
  return `Incisión ${orden} · ${capa} · ${medidaDeLaIncision(r)}${abierta}`
}

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
export function alargarIncision(base: TrazoDeIncision, nuevo: TrazoDeIncision, umbral: number): TrazoDeIncision | null {
  if (base.puntos.length < 2 || nuevo.puntos.length < 2) return null
  const a0 = base.puntos[0]
  const a1 = base.puntos[base.puntos.length - 1]
  const b0 = nuevo.puntos[0]
  const b1 = nuevo.puntos[nuevo.puntos.length - 1]
  const opciones = [
    { d: distancia(a1, b0), orden: 'base-nuevo' as const },
    { d: distancia(a1, b1), orden: 'base-nuevoAlReves' as const },
    { d: distancia(a0, b1), orden: 'nuevo-base' as const },
    { d: distancia(a0, b0), orden: 'nuevoAlReves-base' as const },
  ].sort((x, y) => x.d - y.d)
  const mejor = opciones[0]
  if (mejor.d > umbral) return null

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

/** Una incisión de las que hay en una capa, para decidir contra cuál se mide un trazo. */
export interface IncisionExistente extends TrazoDeIncision {
  id: number
  capa: string
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
    const unida = alargarIncision(e, nuevo, umbral)
    if (!unida) continue
    const a0 = e.puntos[0]
    const a1 = e.puntos[e.puntos.length - 1]
    const b0 = nuevo.puntos[0]
    const b1 = nuevo.puntos[nuevo.puntos.length - 1]
    const d = Math.min(distancia(a0, b0), distancia(a0, b1), distancia(a1, b0), distancia(a1, b1))
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
   * mismo trazo que salen de ella, cada uno su incisión, que nace en el borde de la que se cruzó (D-415).
   */
  | { tipo: 'nueva'; trazo: TrazoDeIncision; ramas?: TrazoDeIncision[] }
  /**
   * Alarga la incisión `id`, o la cambia por `unida`; `repasado` es lo que fue por encima de ella, en las unidades de los
   * puntos (0 si nada). `enElCruce`: el trazo la cruzó cerca de una punta, y `unida` es ella acortada hasta el cruce; el
   * trazo nuevo es la primera de `ramas`, que pasa por su nueva punta (D-415). `tramo` es lo que queda de ella, en
   * fracciones de lo que medía: con eso se recoloca lo que estaba puesto a lo largo de ella.
   */
  | {
      tipo: 'alarga'
      id: number
      unida: TrazoDeIncision
      repasado: number
      enElCruce?: boolean
      tramo?: readonly [number, number]
      ramas?: TrazoDeIncision[]
    }
  /** Va entero por encima de la incisión `id`: no corta nada. */
  | { tipo: 'repaso'; id: number; repasado: number }

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
 * Lo que un pedazo que nace en una incisión empieza **al lado** de su línea, hacia el suyo, en milímetros (D-415).
 *
 * Sobre la línea misma, la malla tiene los vértices de los dos labios repetidos en el mismo sitio, y el corte que
 * empezaba ahí partía también el borde del labio de enfrente: su pared quedaba colgada de un labio al otro. Recién hecha
 * no se notaba, una raya oscura en el cruce; abierta con los Farabeuf a 35 mm, era una franja de piel tendida de lado a
 * lado sobre la herida. Un milímetro es menos que la arista de la malla junto al corte (`ARISTA_JUNTO_AL_CORTE_MM`, 3), y
 * la punta de un corte no se abre: no queda a la vista.
 */
export const APARTE_DE_LA_LINEA_MM = 1

/** El trazo con la primera punta (`alInicio`) o la última (`alFinal`) corrida `d` hacia la de al lado, si hay sitio. */
function despegado(t: TrazoDeIncision, alInicio: boolean, alFinal: boolean, d: number): TrazoDeIncision {
  const puntos = [...t.puntos]
  const correr = (i: number, hacia: number) => {
    const a = puntos[i]
    const b = puntos[hacia]
    if (!a || !b) return
    const l = distancia(a, b)
    if (l <= 2 * d) return
    puntos[i] = [a[0] + ((b[0] - a[0]) * d) / l, a[1] + ((b[1] - a[1]) * d) / l, a[2] + ((b[2] - a[2]) * d) / l]
  }
  if (alInicio) correr(0, 1)
  if (alFinal) correr(puntos.length - 1, puntos.length - 2)
  return { puntos, normales: t.normales }
}

/** El trazo con un punto más delante (`antes`) o detrás (`despues`): donde nace en la incisión que cruzó. */
function anclado(t: TrazoDeIncision, antes?: { p: Punto; n: Punto }, despues?: { p: Punto; n: Punto }): TrazoDeIncision {
  return {
    puntos: [...(antes ? [antes.p] : []), ...t.puntos, ...(despues ? [despues.p] : [])],
    normales: [...(antes ? [antes.n] : []), ...t.normales, ...(despues ? [despues.n] : [])],
  }
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
    if (alarga) return { tipo: 'alarga', id: alarga.id, unida: alarga.unida, repasado: 0 }
    return cruzarLasIncisiones(huellas, nuevo, delTrazo, sDe, mm) ?? { tipo: 'nueva', trazo: nuevo }
  }

  const { e, deLaIncision, encima, repasado } = mejor
  // Solo cuenta lo que sobra por delante o por detrás de lo repasado. Un hueco entre dos tramos encima —la mano que
  // tiembla, un quiebre del trazo hondo— es parte del repaso.
  const primera = encima.indexOf(true)
  const ultima = encima.lastIndexOf(true)
  const sobrantes: { trazo: TrazoDeIncision; enLaPunta: boolean; ancla: { p: Punto; n: Punto }; alInicio: boolean }[] = []
  const mirarSobrante = (desde: number, hasta: number, union: number) => {
    if (hasta - desde < minimoFuera) return
    // Sale por una punta si donde deja la incisión está junto a uno de sus extremos.
    const donde = proyectar(deLaIncision, enLaLinea(delTrazo, union).p)
    const enLaPunta = donde.s <= umbral + paso || donde.s >= deLaIncision.largo - umbral - paso
    sobrantes.push({ trazo: pedazo(nuevo, delTrazo, desde, hasta), enLaPunta, ancla: sobreLaIncision(e, deLaIncision, donde.s), alInicio: union === desde })
  }
  if (primera > 0) mirarSobrante(0, sDe(primera), sDe(primera))
  if (ultima < encima.length - 1) mirarSobrante(sDe(ultima), delTrazo.largo, sDe(ultima))

  // Lo que sale por un lado nace en la incisión, y es otra: desde su línea, y no desde donde el trazo dejó de pisarla, que
  // con la herida abierta cae en el labio o en el fondo y dejaba entre las dos un puente de piel (D-415). Si sale por los
  // dos lados, el pedazo más largo es la incisión y el otro una rama, que antes se perdía.
  const porUnLado = sobrantes
    .filter((x) => !x.enLaPunta)
    .map((x) =>
      despegado(x.alInicio ? anclado(x.trazo, x.ancla) : anclado(x.trazo, undefined, x.ancla), x.alInicio, !x.alInicio, APARTE_DE_LA_LINEA_MM * mm),
    )
    .sort((a, b) => linea(b.puntos).largo - linea(a.puntos).largo)
  const conRamas = (ramas: TrazoDeIncision[]) => (ramas.length > 0 ? { ramas } : {})
  const porLasPuntas = sobrantes.filter((x) => x.enLaPunta)
  if (porLasPuntas.length > 0) {
    // Se une por la punta más cercana, aunque el pedazo arranque a un lado de la línea o en el fondo de la herida: es lo
    // que se repasó de ella. Por eso la distancia para unir es todo el corredor, de lado y de hondo.
    let unida: TrazoDeIncision = { puntos: [...e.puntos], normales: [...e.normales] }
    const alcance = Math.hypot(corredor(e.id), hondura) + umbral
    for (const s of porLasPuntas) unida = alargarIncision(unida, s.trazo, alcance) ?? unida
    return { tipo: 'alarga', id: e.id, unida, repasado, ...conRamas(porUnLado) }
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
 * Cada pedazo que sale de él empieza o termina **junto a la línea** de la incisión, que es donde estaba la piel antes de
 * abrirse, y no en el labio ni en el fondo: a `APARTE_DE_LA_LINEA_MM` de ella, de su lado.
 *
 * - Si el cruce cae en medio, el pedazo más largo es la incisión nueva y los demás, ramas: lo mismo que una T, que nace
 *   del borde de la herida.
 * - Si cae a menos de `PUNTA_DEL_CRUCE_MM` de una punta y el trazo pasa de lado a lado, la incisión se acorta hasta el
 *   cruce: el pedacito de punta del otro lado se cierra. El trazo nuevo queda entero y recto por la nueva punta, y la
 *   incisión vieja es el pie de una T.
 *
 * Un trazo que llega al corredor por un solo lado, en medio o junto a una punta, es esa T: nace junto a la línea.
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
  let enLaPunta: { antes: Brazo; despues: Brazo; cruce: Cruce } | null = null
  for (const antes of brazos) {
    const cruce = antes.fin
    const despues = cruce && brazos.find((b) => b.inicio === cruce)
    if (!cruce || !despues) continue
    const largo = cruce.huella.deLaIncision.largo
    const tope = Math.min(PUNTA_DEL_CRUCE_MM * mm, largo / 3)
    if (cruce.s > tope && cruce.s < largo - tope) continue
    if (!enLaPunta || antes.largo + despues.largo > enLaPunta.antes.largo + enLaPunta.despues.largo) enLaPunta = { antes, despues, cruce }
  }
  const conRamas = (ramas: TrazoDeIncision[]) => (ramas.length > 0 ? { ramas } : {})
  // Lo que nace en una incisión empieza un poco a su lado (`APARTE_DE_LA_LINEA_MM`). El trazo que pasa por la nueva punta
  // de una acortada, no: la cruza, y tiene que tocarla.
  const aparte = (b: Brazo) => despegado(b.trazo, b.inicio !== undefined, b.fin !== undefined, APARTE_DE_LA_LINEA_MM * mm)
  if (enLaPunta) {
    const { antes, despues, cruce } = enLaPunta
    const { e, deLaIncision } = cruce.huella
    // Lo que queda de la incisión, de su punta lejana al cruce, en el sentido en que se trazó: sus separadores y sus pinzas
    // siguen donde estaban. El pedacito del otro lado se cierra.
    const largo = deLaIncision.largo
    const tramo: [number, number] = cruce.s <= largo / 2 ? [cruce.s / largo, 1] : [0, cruce.s / largo]
    const queda = pedazo(e, deLaIncision, tramo[0] * largo, tramo[1] * largo)
    // El trazo nuevo, recto por el cruce: sin lo que cayó sobre la herida, que en la línea es donde estaba la piel.
    const barra = unir(antes.trazo, despues.trazo)
    const otras = brazos.filter((b) => b !== antes && b !== despues).map(aparte)
    return { tipo: 'alarga', id: e.id, unida: queda, repasado: 0, enElCruce: true, tramo, ramas: [barra, ...otras] }
  }
  const [principal, ...ramas] = [...brazos].sort((a, b) => b.largo - a.largo)
  return { tipo: 'nueva', trazo: aparte(principal), ...conRamas(ramas.map(aparte)) }
}

/** Lo que el panel «Incisiones» dice de cada una: «Incisión 2 · músculo · 30 mm». */
export interface ResumenDeIncision {
  id: number
  capa: 'piel' | 'fascia' | 'musculo'
  largoMm: number
  aperturaMm: number
}

/** El texto de una incisión en el panel, con su número de orden (1, 2…) y no su `id` interno. */
export function rotuloDeLaIncision(orden: number, r: Pick<ResumenDeIncision, 'capa' | 'largoMm' | 'aperturaMm'>): string {
  const capa = r.capa === 'piel' ? 'piel' : r.capa === 'fascia' ? 'fascia' : 'músculo'
  const abierta = r.aperturaMm >= 1 ? ` · abierta ${Math.round(r.aperturaMm)} mm` : ''
  return `Incisión ${orden} · ${capa} · ${Math.round(r.largoMm)} mm${abierta}`
}

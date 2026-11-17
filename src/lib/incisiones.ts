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
 * es el gesto de abrir en dos tiempos (empezar donde terminó el corte anterior). Si no toca ninguna, es otra.
 */

export type Punto = readonly [number, number, number]

export interface TrazoDeIncision {
  puntos: Punto[]
  normales: Punto[]
}

/** A cuántos milímetros del extremo de una incisión tiene que empezar un trazo para considerarse su continuación. */
export const UMBRAL_PARA_ALARGAR_MM = 5

const distancia = (a: Punto, b: Punto) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

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

  const alReves = (t: TrazoDeIncision): TrazoDeIncision => ({ puntos: [...t.puntos].reverse(), normales: [...t.normales].reverse() })
  // El extremo que se une se quita del trazo que llega: ya está en el otro, y dos puntos casi pegados solo estorban.
  const sinElPrimero = (t: TrazoDeIncision): TrazoDeIncision => ({ puntos: t.puntos.slice(1), normales: t.normales.slice(1) })
  const unir = (x: TrazoDeIncision, y: TrazoDeIncision): TrazoDeIncision => ({
    puntos: [...x.puntos, ...sinElPrimero(y).puntos],
    normales: [...x.normales, ...sinElPrimero(y).normales],
  })
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
 * El cruce no es repaso: un trazo que atraviesa la incisión en ángulo sigue siendo otra incisión, como antes.
 */
export type DecisionDelTrazo =
  /** Otra incisión: el trazo entero, o lo que queda de él fuera de la que repasa. */
  | { tipo: 'nueva'; trazo: TrazoDeIncision }
  /** Alarga la incisión `id`; `repasado` es lo que fue por encima de ella, en las unidades de los puntos (0 si nada). */
  | { tipo: 'alarga'; id: number; unida: TrazoDeIncision; repasado: number }
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
  const normalEn = (i: number, f: number): Punto => {
    const a = t.normales[i]
    const b = t.normales[Math.min(i + 1, t.normales.length - 1)]
    const n: Punto = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
    const largo = Math.hypot(n[0], n[1], n[2]) || 1
    return [n[0] / largo, n[1] / largo, n[2] / largo]
  }
  const inicio = enLaLinea(l, desde)
  const fin = enLaLinea(l, hasta)
  const puntos: Punto[] = [inicio.p]
  const normales: Punto[] = [normalEn(inicio.i, inicio.f)]
  for (let k = 0; k < t.puntos.length; k++) {
    if (l.recorrido[k] > desde && l.recorrido[k] < hasta) {
      puntos.push(t.puntos[k])
      normales.push(t.normales[k])
    }
  }
  puntos.push(fin.p)
  normales.push(normalEn(fin.i, fin.f))
  return { puntos, normales }
}

/**
 * Qué hacer con un trazo nuevo en una capa que ya tiene incisiones: repasar una, alargarla o abrir otra (D-410).
 *
 * Todas las distancias van en las unidades de los puntos. `umbral` es el de alargar (`UMBRAL_PARA_ALARGAR_MM`), `mm` lo
 * que mide un milímetro, y `corredor(id)` hasta dónde de lado de la incisión `id` cae un trazo que la repasa
 * (`corredorDelRepasoMm`, que depende de lo abierta que esté). De hondo, hasta `HONDURA_DEL_REPASO_MM` bajo la línea y
 * `ALTURA_DEL_REPASO_MM` sobre ella.
 */
export function decidirElTrazo(
  existentes: readonly IncisionExistente[],
  capa: string,
  nuevo: TrazoDeIncision,
  { umbral, mm, corredor }: { umbral: number; mm: number; corredor: (id: number) => number },
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
  for (const e of existentes) {
    if (e.capa !== capa || e.puntos.length < 2) continue
    const deLaIncision = linea(e.puntos)
    if (deLaIncision.largo <= 0) continue
    const ancho = corredor(e.id)
    // Primero, qué muestras caen sobre ella: cerca de lado, no más hondo que el fondo de la herida, y a la altura de su
    // tramo. Pasada una punta, la más cercana es la punta misma: ahí el trazo ya no va por encima, se sale (y la alarga).
    const sobre: (number | null)[] = []
    const hondoEn: number[] = []
    for (let k = 0; k <= muestras; k++) {
      const m = apartamiento(deLaIncision, e.normales, enLaMuestra[k])
      const enSuTramo = m.s > paso / 2 && m.s < deLaIncision.largo - paso / 2
      const cerca = m.lado <= ancho && m.hondo >= -hondura && m.hondo <= altura
      sobre.push(cerca && enSuTramo ? m.s : null)
      hondoEn.push(m.hondo)
    }
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

  // Lo que apenas pisa una incisión es lo de siempre: otra incisión, o alargar si nace junto a una punta.
  if (!mejor || mejor.repasado < MINIMO_PARA_REPASAR_MM * mm) {
    const alarga = incisionQueAlarga(existentes, capa, nuevo, umbral)
    return alarga ? { tipo: 'alarga', id: alarga.id, unida: alarga.unida, repasado: 0 } : { tipo: 'nueva', trazo: nuevo }
  }

  const { e, deLaIncision, encima, repasado } = mejor
  const sDe = (k: number) => Math.min(delTrazo.largo, k * paso)
  // Solo cuenta lo que sobra por delante o por detrás de lo repasado. Un hueco entre dos tramos encima —la mano que
  // tiembla, un quiebre del trazo hondo— es parte del repaso.
  const primera = encima.indexOf(true)
  const ultima = encima.lastIndexOf(true)
  const minimoFuera = MINIMO_FUERA_DE_LA_INCISION_MM * mm
  const sobrantes: { trazo: TrazoDeIncision; enLaPunta: boolean }[] = []
  const mirarSobrante = (desde: number, hasta: number, union: number) => {
    if (hasta - desde < minimoFuera) return
    // Sale por una punta si donde deja la incisión está junto a uno de sus extremos.
    const donde = proyectar(deLaIncision, enLaLinea(delTrazo, union).p)
    const enLaPunta = donde.s <= umbral + paso || donde.s >= deLaIncision.largo - umbral - paso
    sobrantes.push({ trazo: pedazo(nuevo, delTrazo, desde, hasta), enLaPunta })
  }
  if (primera > 0) mirarSobrante(0, sDe(primera), sDe(primera))
  if (ultima < encima.length - 1) mirarSobrante(sDe(ultima), delTrazo.largo, sDe(ultima))

  const porLasPuntas = sobrantes.filter((x) => x.enLaPunta)
  if (porLasPuntas.length > 0) {
    // Se une por la punta más cercana, aunque el pedazo arranque a un lado de la línea o en el fondo de la herida: es lo
    // que se repasó de ella. Por eso la distancia para unir es todo el corredor, de lado y de hondo.
    let unida: TrazoDeIncision = { puntos: [...e.puntos], normales: [...e.normales] }
    const alcance = Math.hypot(corredor(e.id), hondura) + umbral
    for (const s of porLasPuntas) unida = alargarIncision(unida, s.trazo, alcance) ?? unida
    return { tipo: 'alarga', id: e.id, unida, repasado }
  }
  // Lo que sale por un lado nace en la incisión, y es otra.
  const porUnLado = sobrantes.sort((a, b) => linea(b.trazo.puntos).largo - linea(a.trazo.puntos).largo)[0]
  if (porUnLado) return { tipo: 'nueva', trazo: porUnLado.trazo }
  return { tipo: 'repaso', id: e.id, repasado }
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

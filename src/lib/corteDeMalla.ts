/**
 * Cortar una malla de partes blandas a lo largo de una incisión, y abrirla (D-167).
 *
 * Es lo que hace que el bisturí «corte» y que un separador «abra»: la piel y el
 * músculo del modelo son mallas, y una incisión tiene que partir *esa* malla, no
 * pintar una línea roja encima. Sin `three`: trabaja con arreglos tipados para
 * poder probarse sin navegador y para que el lienzo solo tenga que copiar los
 * resultados a un `BufferGeometry`.
 *
 * ## Cómo se corta
 *
 * La incisión es una polilínea sobre la superficie, con la normal de la malla en
 * cada punto. De ella sale un campo escalar sobre el espacio, `f`: la distancia
 * con signo al «telón» que cuelga de la polilínea (hacia dentro de la malla). Es
 * el mismo recurso que partir una malla con un plano, pero con una superficie de
 * corte curva: allí donde `f` cambia de signo a lo largo de una arista, la
 * arista se parte en el punto donde `f` vale cero.
 *
 *  - Un triángulo con **dos** aristas partidas se rehace en tres (uno en el
 *    vértice solitario y dos en el cuadrilátero que queda al otro lado).
 *  - Con **una** (la incisión termina dentro del triángulo) se rehace en dos.
 *  - Los vértices nuevos que quedan en medio de la herida se **duplican**, uno
 *    para cada labio: es lo que deja de unir los dos lados. Los de la punta (donde
 *    la herida acaba) se quedan sencillos, así la herida termina en un vértice y
 *    no en una grieta que sigue rompiéndose.
 *
 * La superficie queda cerrada fuera de la herida —la suma de áreas no cambia— y
 * abierta a lo largo de ella; abrir es solo separar los dos labios.
 *
 * ## Cómo se abre
 *
 * Cada vértice cercano guarda un **peso** (1 en el borde de la herida, 0 a
 * `alcance` de ella, y 0 también en las puntas y en lo que queda muy por debajo
 * de la superficie) y la **dirección** lateral en que se separa. `abrir` mueve
 * cada labio por esa dirección, con su peso, tanto como diga la apertura: el
 * tejido cercano se arrastra y el lejano no se entera, que es lo que hace un
 * separador de verdad.
 *
 * ## La pared, en la piel (D-333)
 *
 * La piel tiene dos caras: la de fuera y la de dentro, 4 mm más abajo en el cuerpo
 * y 2 en la cabeza (D-331). El telón parte las dos, y cada una abre sus labios;
 * entre el labio de fuera y el de dentro de un mismo lado no había nada, y por el
 * hueco se veía el otro lado de la herida. Con `pared`, cada lado se cierra con una
 * tira de triángulos de un labio al otro: lo que se ve de la dermis y de la grasa
 * al abrir. Sus vértices son copias de los de los labios, con su mismo lado, su
 * peso y su dirección: la pared se abre con ellos, y su normal es la suya y no la
 * de la piel. Cada copia dice lo que queda bajo la superficie (`pared`), que es lo
 * que el sombreador usa para pintar la dermis arriba y la grasa debajo.
 *
 * ## La retracción (P-015)
 *
 * Un tejido cortado no se queda donde estaba: la piel está tensa, y al partirla sus labios se apartan solos; la fascia
 * y el músculo hacen lo mismo, cada uno lo suyo. Hasta P-015 un corte dejaba los labios pegados, con apertura cero, y
 * lo único que se veía de él era una cinta roja pintada encima. Ahora cada apertura lleva además un `reposo`: lo que
 * cada labio se retrae en lo más ancho de la herida, sin que nadie lo sostenga. Se reparte en **huso** —nada en las
 * puntas de la grieta, todo en el tramo central (`huso`, `husoDeLaGrieta`)— y se **suma** a lo que abran los
 * separadores: una hoja aparta el labio desde donde el labio ya estaba, que es lo que hace una hoja.
 *
 * ## La franja afinada (P-015)
 *
 * Abrir es mover vértices, y entre dos vértices la malla es plana. La fascia y el músculo del atlas traen aristas de
 * uno a nueve centímetros: el labio tenía un vértice cada 2 mm (P-008 E2), pero el abanico que lo unía al resto
 * arrancaba de vértices que estaban a centímetros, y al apartarlo cada abanico era una faceta plana —la «gema» que se
 * veía por la herida abierta—. Con `afinar`, antes de cortar se parte por la mitad toda arista larga de la franja que
 * rodea a la incisión (`afinarLaFranja`), más fina cuanto más cerca: el tejido que se aparta tiene con qué curvarse.
 */

export type Vec3 = [number, number, number]

/** Una incisión: puntos sobre la superficie y la normal de la malla en cada uno. */
export interface IncisionSobreLaMalla {
  puntos: Vec3[]
  normales: Vec3[]
  /**
   * La normal de la piel que queda encima de cada punto, en un plano hondo (P-015): con ella, y no con la de la malla,
   * sale la dirección en que el tejido se **aparta** (`CurvaDeIncision.deApertura`). Por dónde se parte la malla no
   * cambia: eso lo dice su propia normal. Un punto sin piel encima (`null`) se queda con la suya.
   *
   * Un separador hondo aparta la pared entera, y cada capa se corría por su propia tangente: sobre la cresta de la
   * tibia del caso 4 la fascia crural va a 30° de la piel, casi pegada a ella, y su labio abierto 12 mm subía 6 por
   * encima de la piel y asomaba como una solapa. Paralelas a la piel, las capas se apartan apiladas, como las lleva la
   * hoja.
   */
  normalesDeEncima?: (Vec3 | null)[]
}

export interface MallaPlana {
  posiciones: Float32Array
  /** De tres en tres. */
  indices: Uint32Array
}

export interface OpcionesDeCorte {
  /**
   * Hasta dónde llega el corte hacia dentro de la malla, en las unidades de la
   * malla. Una pierna es un tubo cerrado: sin este tope, la incisión de arriba
   * cortaría también la piel de abajo, que está justo debajo del mismo trazo.
   */
  profundidad: number
  /** Cuánto se arrastra el tejido a los lados al abrir. */
  alcance: number
  /**
   * A qué distancia de la incisión se mira un vértice. Fuera de esta franja el
   * campo no se evalúa: una malla de cien mil vértices no se recorre entera por
   * cada trazo. Tiene que ser mayor que la arista más larga de la zona.
   */
  holgura: number
  /**
   * Cada cuánto, como mucho, hay un vértice en los labios, en las unidades de la malla (P-008 E2). Sin él, los labios
   * tienen solo los vértices donde el trazo cruza una arista: en una malla de triángulos largos quedan a uno o dos
   * centímetros, el labio es una recta entre ellos y una hoja de 10 mm apoyada en medio no tiene tejido que mover.
   */
  pasoDelLabio?: number
  /**
   * Si la capa tiene grosor —la piel, con su cara de dentro (D-331)—, hasta dónde por debajo de la cara de fuera se
   * busca la de dentro, en las unidades de la malla. Con él, el corte levanta la pared de cada labio (D-333). Sin él,
   * o si no hay otra cara a esa distancia, el corte es el de siempre.
   */
  pared?: number
  /**
   * Lo que mide, como mucho, una arista pegada a la incisión después del corte, en las unidades de la malla (P-015).
   * Con él, la franja que rodea a la incisión se afina antes de cortar (`afinarLaFranja`); sin él, la malla se corta
   * con los triángulos que traiga.
   */
  afinar?: number
}

/**
 * De qué dos vértices sale cada vértice que el corte añadió, y cuánto de cada uno (P-015).
 *
 * `desde` es cuántos vértices traía la malla que entró: los nuevos van detrás, y el vértice `desde + j` vale
 * `(1 − peso[j])` del vértice `de[2j]` más `peso[j]` del `de[2j + 1]`. Los dos son siempre vértices anteriores a él, de
 * la malla que entró o añadidos antes, así que recorriéndolos en orden cada uno encuentra a los suyos ya resueltos.
 *
 * - Los de la franja afinada salen del medio de su arista.
 * - Los de la grieta, del punto en que el trazo cruzó la suya; los que el labio lleva en medio de un triángulo, de los
 *   dos cruces entre los que están.
 * - Los de la pared son copias de su labio: los dos índices son el mismo.
 */
export interface MezclaDeVertices {
  desde: number
  de: Uint32Array
  peso: Float32Array
}

/**
 * Entre qué fracciones del trazo queda la grieta, y cómo acaba en cada extremo (P-015).
 *
 * El trazo es lo que se dibujó sobre la piel; la grieta, lo que la malla se partió, y acaba donde el trazo cruza la
 * última arista: un poco antes que él. Lo que la herida se abre sola se reparte a lo largo de **la grieta** —nada
 * donde acaba, todo en el medio—. Repartido a lo largo del trazo, en la punta de la grieta todavía quedaba un quinto
 * de la abertura: el último vértice del labio se apartaba un milímetro del vértice de la punta, que no se mueve, y la
 * herida acababa en cuña roma en vez de en punta.
 *
 * Un extremo queda **cerrado** si la grieta acaba dentro de la malla, en un vértice sencillo; **abierto**, si llega
 * al borde de la malla. Por un extremo abierto la herida no se cierra: una lámina partida hasta su borde se abre ahí
 * lo que en el medio. Salvo que la malla siga entera bajo el trazo más allá de ese borde: entonces también es cerrado
 * (`cerrarLasPuntasConTejidoEntero`, P-015).
 */
export interface TramoDeLaGrieta {
  desde: number
  hasta: number
  cerradaAlInicio: boolean
  cerradaAlFinal: boolean
}

export interface MallaCortada extends MallaPlana {
  /** Entre qué fracciones del trazo queda la grieta, y si se cierra en cada extremo: lo que pide `husoDeLaGrieta`. */
  grieta: TramoDeLaGrieta
  /**
   * El vértice de la malla original del que sale cada vértice (los nuevos, un extremo de su arista). Vale para lo que
   * no se puede promediar; lo que sí —el color, la textura, el arrastre de otra herida— va por `mezcla`.
   */
  origen: Uint32Array
  /**
   * De qué dos vértices sale cada vértice nuevo, y cuánto de cada uno: lo que vale la malla **en su sitio**, y no en
   * un vértice vecino.
   *
   * Hasta P-015 bastaba con `origen`: los vértices nuevos eran solo los de la grieta, pegados a su arista. Con la
   * franja afinada son miles y están repartidos por toda la zona que el tejido se arrastra. Copiándoles a cada uno el
   * arrastre de un extremo de su arista, sobre una malla que ya tenía otra herida abierta, dos vértices vecinos
   * heredaban arrastres de vértices que estaban a un centímetro uno de otro, se cruzaban, y los triángulos entre
   * ellos quedaban del revés. Interpolado, cada vértice nuevo va exactamente adonde lo lleva el triángulo en que
   * nació: la malla afinada se deforma como la que había, que es lo que es.
   */
  mezcla: MezclaDeVertices
  /** 0 en reposo, 1 en el borde de la herida, siempre entre los dos. */
  peso: Float32Array
  /**
   * El mismo peso sin el estrechamiento hacia las puntas: solo lo cerca que está el vértice de la incisión. Es el que
   * usa la apertura con perfil, que ya se cierra en las puntas por su cuenta (P-008 E2). Multiplicar las dos cosas
   * dejaba un Farabeuf puesto a un cuarto del largo, y abierto 12 mm, abriendo 6 en su sitio.
   */
  pesoLateral: Float32Array
  /** Unitario, el sentido (positivo) en que se separa el labio «más». */
  direccion: Float32Array
  /** +1 labio «más», −1 labio «menos», 0 lo que no pertenece a la herida. */
  lado: Int8Array
  /**
   * Dónde cae cada vértice a lo largo de la incisión, de 0 (inicio) a 1 (final).
   * Es lo que permite abrir la herida **donde está el separador** y no por igual
   * en todo su largo (`abrirHerida` con perfil).
   */
  largoT: Float32Array
  /**
   * Lo lejos que queda cada vértice de la punta más cercana de la grieta, en las unidades de la malla, hasta `alcance`;
   * más allá, `Infinity` (P-015). Es con lo que la retracción se cierra junto a **cada** punta y no solo en las dos
   * puntas del trazo (`retraccionDelVertice`).
   */
  hastaLaPunta: { distancia: Float32Array; alcance: number }
  /**
   * La incisión ya preparada: sus nodos son los puntos que se trazaron sobre la piel, que están **en la superficie**,
   * con la normal y el lateral de cada uno. Los vértices de los labios, en cambio, caen donde el trazo cruza una
   * arista, y en una malla de triángulos largos quedan a decenas de milímetros unos de otros: una cinta tendida entre
   * ellos queda por dentro de la pierna y se ve a trozos. La cinta de la herida se tiende por aquí.
   */
  curva: CurvaDeIncision
  /**
   * Cada labio, de un extremo de la incisión al otro: para dibujar su borde. Con pared, solo los de la cara de fuera:
   * los de dentro, mezclados por su posición a lo largo, hacían del borde un serrucho de 4 mm de alto, y la hoja de
   * un separador apoyada en medio agarraba un poco de cada cara.
   */
  labios: { mas: number[]; menos: number[] }
  /**
   * Lo que cada vértice de la pared de la herida queda bajo la superficie, en las unidades de la malla, y −1 en los
   * que no son de la pared (D-333).
   */
  pared: Float32Array
  /** Cuántas aristas se partieron: 0 quiere decir que la incisión no tocó la malla. */
  aristasPartidas: number
}

// ------------------------------------------------------------------ vectores

const resta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const suma = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const por = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cruz = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const largo = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const unitario = (a: Vec3): Vec3 => {
  const l = largo(a)
  return l > 1e-12 ? por(a, 1 / l) : [0, 0, 0]
}
const mezclar = (a: Vec3, b: Vec3, k: number): Vec3 => suma(por(a, 1 - k), por(b, k))

const leer = (arreglo: Float32Array, i: number): Vec3 => [arreglo[3 * i], arreglo[3 * i + 1], arreglo[3 * i + 2]]

// ----------------------------------------------------------- la incisión como curva

interface Tramo {
  a: Vec3
  d: Vec3
  largo: number
  /** Cuánto llevaba recorrido la curva al llegar a `a`. */
  desde: number
}

/** La curva ya preparada: sus tramos y, en cada nodo, la normal y el lateral suavizados. */
export interface CurvaDeIncision {
  tramos: Tramo[]
  largoTotal: number
  /** Por nodo (tramos + 1): normal de la malla y dirección lateral (normal × avance). */
  normales: Vec3[]
  laterales: Vec3[]
  /**
   * El lateral de la curva de apertura en cada nodo (`deApertura`): hacia donde se **aparta** el tejido en ese punto
   * del trazo. Sin curva de apertura, una copia de `laterales`.
   */
  lateralesSuaves: Vec3[]
  /**
   * La curva con que se **aparta** el tejido (P-015): el trazo promediado sobre sí mismo, con sus mismos nodos y sus dos
   * puntas en su sitio. Con ella se decide hacia dónde se mueve cada vértice y a qué altura del largo cae; con el trazo,
   * de qué lado queda y por dónde se parte, que no cambia.
   *
   * El trazo hondo se apoya en lo que el ratón encuentra —un músculo, un vaso, el fondo de la herida— y quiebra: su
   * lateral giraba 0,15 rad en tres décimas de milímetro, y una vena retraída 4,7 mm movía dos vértices vecinos 0,6 mm
   * uno respecto de otro y volvía del revés sus triángulos de medio milímetro (33 en el caso 4). Y lejos del trazo, el
   * punto más cercano de un trazo quebrado salta de un tramo a otro entre una fila de vértices y la siguiente: la
   * fracción del largo en que «caen» salta con él, y el huso con ella. Promediar solo el lateral arreglaba lo primero y
   * no lo segundo; sobre la curva promediada, las dos cosas cambian sin saltos. Sin suavizado, no hay.
   */
  deApertura?: CurvaDeApertura
}

/** Lo que `proyectar` necesita de una curva. */
type CurvaMedible = Pick<CurvaDeIncision, 'tramos' | 'largoTotal' | 'normales' | 'laterales'>

/** La curva de apertura de un trazo (`CurvaDeIncision.deApertura`). */
export interface CurvaDeApertura extends CurvaMedible {
  /**
   * La fracción del largo **del trazo** a que está cada nodo. La curva promediada es más corta que un trazo quebrado, y
   * lo que se pregunta de un vértice es dónde cae en el trazo: ahí está puesto cada separador.
   */
  tDelNodo: number[]
}

/**
 * Deja la incisión lista para medir contra ella: sin puntos casi pegados (un
 * temblor de la mano añade cien por centímetro y solo estorba) y con la normal y
 * el lateral de cada nodo.
 */
export function prepararIncision(
  incision: IncisionSobreLaMalla,
  separacionMinima: number,
  /** A cuánto, a lo largo del trazo y en las unidades de la malla, llega el promedio de la curva de apertura. Sin él, no hay. */
  suavizado = 0,
): CurvaDeIncision | null {
  const puntos: Vec3[] = []
  const normales: Vec3[] = []
  const deEncima: (Vec3 | null)[] = []
  incision.puntos.forEach((p, i) => {
    const n = incision.normales[i] ?? incision.normales[incision.normales.length - 1] ?? [0, 0, 1]
    const ultimo = puntos[puntos.length - 1]
    if (ultimo && largo(resta(p, ultimo)) < separacionMinima) return
    puntos.push(p)
    normales.push(unitario(n))
    const arriba = incision.normalesDeEncima?.[i]
    deEncima.push(arriba && largo(arriba) > 0 ? unitario(arriba) : null)
  })
  if (suavizado > 0) recortarLosSaltosDeLasPuntas(puntos, normales, suavizado, deEncima)
  if (puntos.length < 2) return null

  const tramos: Tramo[] = []
  let acumulado = 0
  for (let i = 0; i < puntos.length - 1; i++) {
    const v = resta(puntos[i + 1], puntos[i])
    const l = largo(v)
    tramos.push({ a: puntos[i], d: unitario(v), largo: l, desde: acumulado })
    acumulado += l
  }

  // La normal de un nodo es la media de las de sus vecinos; el lateral, el de la
  // media de los avances. Suavizar aquí es lo que evita que la herida se
  // «quiebre» en cada punto del trazo.
  const normalesNodo: Vec3[] = puntos.map((_, k) => {
    const vecinos = [normales[k - 1], normales[k], normales[k + 1]].filter((x): x is Vec3 => !!x)
    return unitario(vecinos.reduce((s, x) => suma(s, x), [0, 0, 0] as Vec3))
  })
  const lateralesNodo: Vec3[] = puntos.map((_, k) => {
    const entra = tramos[k - 1]?.d
    const sale = tramos[k]?.d
    const avance = unitario(suma(entra ?? [0, 0, 0], sale ?? [0, 0, 0]))
    // Normal × avance: apunta a la izquierda de quien traza, mirando desde fuera.
    return unitario(cruz(normalesNodo[k], avance))
  })

  // Hacia dónde se aparta, con la normal de la piel de encima donde la hay (`normalesDeEncima`): la de la malla en el
  // resto. Se mezclan nodo a nodo y el promedio de la curva de apertura cose el paso de una a otra.
  const conEncima = deEncima.some((x) => x !== null)
  const normalesDeApertura = conEncima ? normalesNodo.map((n, k) => deEncima[k] ?? n) : normalesNodo
  const lateralesDeApertura = conEncima
    ? puntos.map((_, k) => (deEncima[k] ? lateralDelNodo(normalesDeApertura[k], tramos[k - 1]?.d, tramos[k]?.d) : lateralesNodo[k]))
    : lateralesNodo
  const deApertura = promediarElTrazo(tramos, normalesDeApertura, lateralesDeApertura, acumulado, suavizado) ?? undefined
  return {
    tramos,
    largoTotal: acumulado,
    normales: normalesNodo,
    laterales: lateralesNodo,
    lateralesSuaves: deApertura ? deApertura.laterales : lateralesDeApertura.map((x) => [x[0], x[1], x[2]] as Vec3),
    deApertura,
  }
}

/**
 * Cuánto puede salirse un tramo del plano de la superficie —el seno del ángulo— para seguir siendo trazo sobre ella.
 * Más, es el cursor que salta de una superficie a otra (P-015). Un trazo sobre la piel se sale lo que su cuerda: los
 * tramos de 7 mm del bisturí sobre una pierna de 5 cm de radio, 4°; la normal del clic cabecea hasta 20°. Con 45°, el
 * tramo con que el trazo de la fascia del caso 4 trepaba al final (a 42° del fondo) se quedaba.
 */
const SALTO_ENTRE_SUPERFICIES = Math.sin(Math.PI / 6)

/**
 * Quita de cada punta del trazo lo que no se trazó sobre el plano que se corta: los saltos del cursor de una superficie
 * a otra, hasta `alcance` de largo desde la punta, y lo que quede más allá de ellos (P-015).
 *
 * El bisturí hondo se traza sobre la herida abierta, y el primer y el último clic caen casi siempre en la piel de su
 * borde: el trazo baja 6 mm por la pared al empezar y sube 11 al acabar. Esos tramos van casi por su normal, y no son
 * corte: el telón colgaba de ellos de lado, la esquina con el fondo partía en abanico lo que había más allá
 * (`ABANICO_DE_LOS_QUIEBRES`), y la curva de apertura, con las puntas fijas, subía con ellos y giraba la dirección en
 * que se aparta el tejido: con los separadores al plano muscular, la fascia del caso 4 se levantaba en la punta como
 * un colgajo. Un trazo sobre la piel no tiene tramos así: va por la superficie, aunque la superficie se curve.
 *
 * Solo en las puntas: un salto en medio —el cursor que pasa sobre un vaso— deja trazo a los dos lados, y quitarlo
 * partiría la incisión en dos. Si no queda trazo, no se recorta nada.
 */
function recortarLosSaltosDeLasPuntas(puntos: Vec3[], normales: Vec3[], alcance: number, deEncima?: (Vec3 | null)[]): void {
  // Contra la normal de cada extremo, y basta con uno: el que salta tiene un pie en el fondo y otro en la pared o en la
  // piel, y la media de las dos normales lo disimulaba.
  const esSalto = (a: number, b: number) => {
    const v = resta(puntos[b], puntos[a])
    const l = largo(v)
    return l > 0 && Math.max(Math.abs(punto(v, normales[a])), Math.abs(punto(v, normales[b]))) / l > SALTO_ENTRE_SUPERFICIES
  }
  let desde = 0
  let recorrido = 0
  for (let i = 0; i + 1 < puntos.length && recorrido <= alcance; i++) {
    if (esSalto(i, i + 1)) desde = i + 1
    recorrido += largo(resta(puntos[i + 1], puntos[i]))
  }
  let hasta = puntos.length
  recorrido = 0
  for (let i = puntos.length - 1; i > 0 && recorrido <= alcance; i--) {
    if (esSalto(i - 1, i)) hasta = i
    recorrido += largo(resta(puntos[i], puntos[i - 1]))
  }
  if (hasta - desde < 2 || (desde === 0 && hasta === puntos.length)) return
  for (const lista of [puntos, normales, deEncima ?? []]) {
    lista.splice(hasta)
    lista.splice(0, desde)
  }
}

/** El lateral de un nodo con esa normal, entre el tramo que entra y el que sale: a la izquierda de quien traza. */
function lateralDelNodo(normal: Vec3, entra: Vec3 | undefined, sale: Vec3 | undefined): Vec3 {
  const avance = unitario(suma(entra ?? [0, 0, 0], sale ?? [0, 0, 0]))
  return unitario(cruz(normal, avance))
}

/**
 * La curva de apertura (`CurvaDeIncision.deApertura`): cada nodo, la media del trazo a su alrededor hasta `alcance` de
 * largo hacia cada lado, con peso en tienda. La ventana es **simétrica** —en las puntas se estrecha hasta el propio
 * nodo— para que un trazo recto quede exactamente donde estaba: promediar a un solo lado lo acortaría por sus puntas, y
 * la herida acabaría antes que la grieta. Se muestrea el trazo a lo largo, y no en sus nodos, para que un tramo trazado
 * despacio, con más puntos, no pese más que uno rápido. Las normales se promedian igual.
 */
function promediarElTrazo(tramos: Tramo[], normales: Vec3[], laterales: Vec3[], largoTotal: number, alcance: number): CurvaDeApertura | null {
  if (!(alcance > 0) || tramos.length < 2 || !(largoTotal > 0)) return null
  const nodos = tramos.length + 1
  const enElTrazo = Array.from({ length: nodos }, (_, k) => (k < tramos.length ? tramos[k].desde : largoTotal))
  // El punto del trazo y su normal a `s` de su inicio. Los tramos van en orden: se buscan por bisección.
  const enS = (s: number): { p: Vec3; n: Vec3 } => {
    let bajo = 0
    let alto = tramos.length - 1
    while (bajo < alto) {
      const medio = (bajo + alto + 1) >> 1
      if (tramos[medio].desde <= s) bajo = medio
      else alto = medio - 1
    }
    const tr = tramos[bajo]
    const u = tr.largo > 0 ? Math.min(1, Math.max(0, (s - tr.desde) / tr.largo)) : 0
    return { p: suma(tr.a, por(tr.d, u * tr.largo)), n: mezclar(normales[bajo], normales[bajo + 1], u) }
  }
  const MUESTRAS = 16
  const puntos: Vec3[] = []
  const normalesSuaves: Vec3[] = []
  for (let k = 0; k < nodos; k++) {
    const s = enElTrazo[k]
    const h = Math.min(alcance, s, largoTotal - s)
    const centro = enS(s)
    if (!(h > 1e-9 * largoTotal)) {
      puntos.push(centro.p)
      normalesSuaves.push(unitario(centro.n))
      continue
    }
    let p: Vec3 = centro.p
    let n: Vec3 = centro.n
    let suma_ = 1
    for (let j = 1; j <= MUESTRAS; j++) {
      const w = 1 - j / (MUESTRAS + 1)
      const antes = enS(s - (j / MUESTRAS) * h)
      const despues = enS(s + (j / MUESTRAS) * h)
      p = suma(p, por(suma(antes.p, despues.p), w))
      n = suma(n, por(suma(antes.n, despues.n), w))
      suma_ += 2 * w
    }
    puntos.push(por(p, 1 / suma_))
    normalesSuaves.push(unitario(n))
  }
  const tramosSuaves: Tramo[] = []
  let acumulado = 0
  for (let k = 0; k < nodos - 1; k++) {
    const v = resta(puntos[k + 1], puntos[k])
    const l = largo(v)
    tramosSuaves.push({ a: puntos[k], d: unitario(v), largo: l, desde: acumulado })
    acumulado += l
  }
  // Un nodo que el promedio dejó encima del vecino no tiene avance: se queda con el lateral que tenía en el trazo.
  const lateralesSuaves = puntos.map((_, k) => {
    const l = lateralDelNodo(normalesSuaves[k], tramosSuaves[k - 1]?.largo ? tramosSuaves[k - 1].d : undefined, tramosSuaves[k]?.largo ? tramosSuaves[k].d : undefined)
    return largo(l) > 0.5 ? l : ([laterales[k][0], laterales[k][1], laterales[k][2]] as Vec3)
  })
  return { tramos: tramosSuaves, largoTotal: acumulado, normales: normalesSuaves, laterales: lateralesSuaves, tDelNodo: enElTrazo.map((s) => s / largoTotal) }
}

interface Proyeccion {
  /** Lugar de la curva más cercano. */
  cercano: Vec3
  /** 0 al principio de la incisión, 1 al final. */
  t: number
  /** Distancia lateral con signo: el lado «más» es positivo. */
  lateral: number
  /** Cuánto por debajo (negativo) o por encima de la superficie. */
  altura: number
  /** El lateral unitario en ese punto de la curva. */
  direccion: Vec3
  /** El punto cae dentro del largo de la incisión (no antes del inicio ni después del final). */
  dentro: boolean
  /** Distancia al lugar más cercano. */
  distancia: number
  /** En qué tramo cae, y en qué fracción de él: para leer otra cosa de sus nodos, como el lateral suavizado. */
  tramo: number
  u: number
  /**
   * Lo que el punto se sale del telón **a lo largo** del trazo: la parte de su distancia que no es ni lateral ni
   * hondura. Bajo un tramo cuya normal es la de la piel es cero; crece más allá de un quiebre del trazo y al lado de un
   * tramo que sube casi por su normal (ver `ABANICO_DE_LOS_QUIEBRES`).
   */
  aLoLargo: number
}

/** Dónde cae un punto respecto de la incisión. */
export function proyectar(curva: CurvaMedible, p: Vec3): Proyeccion {
  let mejor = -1
  let mejorDistancia = Infinity
  let mejorU = 0
  let mejorUSinAcotar = 0
  const n = curva.tramos.length
  for (let i = 0; i < n; i++) {
    const tr = curva.tramos[i]
    const uSin = tr.largo > 0 ? punto(resta(p, tr.a), tr.d) / tr.largo : 0
    const u = Math.min(1, Math.max(0, uSin))
    const c: Vec3 = suma(tr.a, por(tr.d, u * tr.largo))
    const dx = p[0] - c[0]
    const dy = p[1] - c[1]
    const dz = p[2] - c[2]
    const d2 = dx * dx + dy * dy + dz * dz
    if (d2 < mejorDistancia) {
      mejorDistancia = d2
      mejor = i
      mejorU = u
      mejorUSinAcotar = uSin
    }
  }
  const tr = curva.tramos[mejor]
  const cercano: Vec3 = suma(tr.a, por(tr.d, mejorU * tr.largo))
  const normal = unitario(mezclar(curva.normales[mejor], curva.normales[mejor + 1], mejorU))
  const direccion = unitario(mezclar(curva.laterales[mejor], curva.laterales[mejor + 1], mejorU))
  const w = resta(p, cercano)
  // Empezar antes del primer punto o acabar después del último no es «dentro»:
  // en los nodos interiores, el tramo vecino se hace cargo.
  const dentro = !((mejor === 0 && mejorUSinAcotar < 0) || (mejor === n - 1 && mejorUSinAcotar > 1))
  const lateral = punto(w, direccion)
  const altura = punto(w, normal)
  return {
    cercano,
    t: curva.largoTotal > 0 ? (tr.desde + mejorU * tr.largo) / curva.largoTotal : 0,
    lateral,
    altura,
    direccion,
    dentro,
    distancia: Math.sqrt(mejorDistancia),
    tramo: mejor,
    u: mejorU,
    aLoLargo: Math.sqrt(Math.max(0, mejorDistancia - lateral * lateral - altura * altura)),
  }
}

/**
 * Hasta qué ángulo, medido desde la hondura, el telón se abre en abanico bajo un quiebre del trazo: su tangente (P-015).
 *
 * Bajo un tramo, el telón cuelga hacia dentro de la piel. En un nodo donde el trazo se quiebra hacia arriba —baja al
 * fondo de la herida, vuelve a subir—, los telones de los dos tramos cuelgan cada uno a su lado y entre ellos queda una
 * cuña: todo lo que cae en ella tiene ese nodo por lo más cercano del trazo. El campo la partía entera por el plano del
 * nodo, sin fondo hacia delante: el trazo hondo del caso 4 acaba trepando 11 mm por la pared de la herida, porque el
 * último clic cae en la piel, y el poplíteo se cortaba de 17 a 29 mm más allá de donde pasó la hoja, con la grieta
 * entera en un solo punto del trazo. Lo mismo hacía el tramo que trepa: cuelga de lado, no hacia dentro.
 *
 * Con el abanico, el corte cubre lo que haya hasta 30° de la hondura bajo cada quiebre —un quiebre de la mano de hasta
 * 60° se rellena entero y la grieta no se interrumpe— y no pasa de ahí. Más estrecho, un trazo con un bache de unos
 * milímetros sobre el fondo dejaba sin cortar la franja de músculo bajo el bache.
 */
export const ABANICO_DE_LOS_QUIEBRES = Math.tan(Math.PI / 6)

/** Lo que un punto se sale del abanico bajo el trazo, a lo largo de él: 0 dentro (`ABANICO_DE_LOS_QUIEBRES`). */
const fueraDelAbanico = (pr: Proyeccion): number => Math.max(0, pr.aLoLargo - Math.abs(pr.altura) * ABANICO_DE_LOS_QUIEBRES)

/**
 * Dónde queda un punto respecto de un trazo ya cortado, en las unidades de la malla: a qué fracción del largo cae, a
 * cuánto se aparta de él **de lado** —lateral y, pasadas las puntas, a lo largo—, a qué hondura y con qué normal encima
 * (P-015). Lo pide un separador de un plano más hondo para saber si abre la herida de encima, y el corte de un plano
 * hondo para apartarse paralelo a la piel.
 *
 * Se preguntaba la distancia en el espacio al vértice de labio más cercano, que lleva la hondura dentro: un Farabeuf
 * bajado al músculo del caso 4 apoya a unos 20 mm bajo la piel, quedaba a 36,8 mm de los labios de ella y a 30,1 de los
 * de la fascia, y con el límite de colocar en 30 mm sostenía un labio de la fascia y no el otro, por dos décimas. Lo
 * que dice si está debajo es lo que se aparta de lado; la hondura se mira aparte.
 *
 * La fracción se mide como la de los labios, con la curva de apertura si la hay: si no, abriría en otro sitio que el
 * que tiene encima.
 */
export function bajoElTrazo(curva: CurvaDeIncision, p: Vec3): { t: number; deLado: number; altura: number; normal: Vec3 } | null {
  if (curva.tramos.length === 0 || !(curva.largoTotal > 0)) return null
  const ap = curva.deApertura
  const medible = ap ?? curva
  const pr = proyectar(medible, p)
  const t = ap ? ap.tDelNodo[pr.tramo] * (1 - pr.u) + ap.tDelNodo[pr.tramo + 1] * pr.u : pr.t
  // La normal de ahí, la que mide la altura: la de la superficie que tiene encima un plano hondo.
  const normal = unitario(mezclar(medible.normales[pr.tramo], medible.normales[pr.tramo + 1], pr.u))
  return { t, deLado: Math.hypot(pr.lateral, pr.aLoLargo), altura: pr.altura, normal }
}

// ------------------------------------------------------------------- la franja afinada

export interface OpcionesDeAfinado {
  /** Lo que mide, como mucho, una arista pegada a la incisión. */
  arista: number
  /** Hasta qué distancia del corte se afina, hacia los lados: lo que el tejido se arrastra al abrir. */
  banda: number
  /**
   * Hasta dónde baja el corte por debajo del trazo, como la `profundidad` de `cortarMalla`. La distancia se mide al
   * **telón** que cuelga del trazo y no al trazo: un músculo que el bisturí profundo parte a tres centímetros bajo la
   * piel está pegado al corte, aunque el trazo le quede lejos. Sin ella, el telón no tiene fondo.
   */
  profundidad?: number
  /**
   * Cuánto se mira alrededor de la incisión para buscar triángulos de la franja. Mayor que la arista más larga de la
   * zona, como la `holgura` del corte: un triángulo con sus tres vértices más lejos que esto no se ve.
   */
  margen: number
  /** Cuánto crece la arista permitida por cada unidad que el triángulo se aleja de la incisión. */
  pendiente?: number
}

/**
 * Lo que una arista puede crecer por cada milímetro que se aleja de la incisión. Junto al labio el tejido se dobla en
 * poco sitio; a tres centímetros se arrastra entero y casi no cambia de forma. Con malla fina hasta el final de la
 * franja, una incisión de piel añadía cuatro veces más vértices para un doblez que no se ve.
 */
const PENDIENTE_DEL_AFINADO = 0.25

/** Las vueltas que hacen falta para llevar una arista de 9 cm a 3 mm partiendo cada vez solo la más larga, y margen. */
const VUELTAS_DEL_AFINADO = 24

/**
 * Afina la malla alrededor de la incisión: parte por la mitad la arista más larga de cada triángulo de la franja
 * mientras mida más de lo que le toca por su distancia al corte (P-015).
 *
 * La distancia es al **telón** que cuelga del trazo hacia dentro —la superficie por la que pasa la hoja—, que es
 * donde la malla se va a partir: lo que un vértice se aparta de él hacia el lado, más lo que se salga del corte por
 * arriba, por abajo o más allá de sus puntas. Medida al trazo, que está sobre la piel, el sóleo quedaba a tres
 * centímetros de su propia herida y se cortaba con sus triángulos de seis.
 *
 * Es bisección por la arista más larga, que no estropea los ángulos: cada triángulo se parte por su lado mayor, y el
 * vecino que comparte esa arista se parte con él por el mismo punto, así la malla sigue cerrada, sin un vértice de
 * uno apoyado en medio del lado del otro. La superficie es exactamente la misma: los puntos nuevos caen sobre las
 * aristas que había.
 *
 * Los vértices que había conservan su índice y los nuevos van al final, como en `cortarMalla`. De cada nuevo se dice
 * de qué dos vértices es el punto medio (`padres`, dos índices por cada uno, siempre anteriores a él): con eso se le
 * lleva el color y lo que otra herida lo arrastra, interpolados (`MezclaDeVertices`). `origen` dice además de qué
 * vértice de la malla original sale, para lo que no se puede promediar.
 *
 * Solo se parte una arista con algún extremo dentro del `margen`. Así todos los triángulos que la comparten están
 * entre los que se miran, y no hace falta recorrer la malla entera para encontrar al vecino: una arista con los dos
 * extremos fuera se queda como está, que deja un triángulo grande pero no una grieta.
 */
export function afinarLaFranja(
  malla: MallaPlana,
  curva: CurvaDeIncision,
  opciones: OpcionesDeAfinado,
): { malla: MallaPlana; origen: Uint32Array; padres: Uint32Array } {
  const nOriginales = malla.posiciones.length / 3
  const identidad = () => {
    const origen = new Uint32Array(nOriginales)
    for (let i = 0; i < nOriginales; i++) origen[i] = i
    return { malla, origen, padres: new Uint32Array(0) }
  }
  if (!(opciones.arista > 0) || curva.tramos.length === 0) return identidad()
  const pendiente = opciones.pendiente ?? PENDIENTE_DEL_AFINADO

  // Dos cajas. La del trazo con su margen dice qué vértices se miran: es la misma en que `cortarMalla` evalúa su
  // campo. La del telón —el trazo, y lo que el corte baja y sube desde él— descarta sin medir casi todos los demás.
  const hondo = opciones.profundidad !== undefined && opciones.profundidad > 0 ? opciones.profundidad : 0
  let minimo: Vec3 = [Infinity, Infinity, Infinity]
  let maximo: Vec3 = [-Infinity, -Infinity, -Infinity]
  const cajaMinima: Vec3 = [Infinity, Infinity, Infinity]
  const cajaMaxima: Vec3 = [-Infinity, -Infinity, -Infinity]
  const nodos = curva.tramos.length + 1
  for (let k = 0; k < nodos; k++) {
    const tramo = curva.tramos[Math.min(k, nodos - 2)]
    const p: Vec3 = k < nodos - 1 ? tramo.a : suma(tramo.a, por(tramo.d, tramo.largo))
    const n = curva.normales[k]
    const delTelon: Vec3[] = hondo > 0 ? [suma(p, por(n, hondo * 0.5)), suma(p, por(n, -hondo))] : [p]
    for (let e = 0; e < 3; e++) {
      minimo[e] = Math.min(minimo[e], p[e])
      maximo[e] = Math.max(maximo[e], p[e])
      for (const q of delTelon) {
        cajaMinima[e] = Math.min(cajaMinima[e], q[e])
        cajaMaxima[e] = Math.max(cajaMaxima[e], q[e])
      }
    }
  }
  minimo = [minimo[0] - opciones.margen, minimo[1] - opciones.margen, minimo[2] - opciones.margen]
  maximo = [maximo[0] + opciones.margen, maximo[1] + opciones.margen, maximo[2] + opciones.margen]

  const posiciones = Array.from(malla.posiciones) as number[]
  const origen: number[] = Array.from({ length: nOriginales }, (_, i) => i)
  const padres: number[] = []
  const leerVertice = (i: number): Vec3 => [posiciones[3 * i], posiciones[3 * i + 1], posiciones[3 * i + 2]]
  const cerca = (i: number) => {
    const x = posiciones[3 * i]
    const y = posiciones[3 * i + 1]
    const z = posiciones[3 * i + 2]
    return x >= minimo[0] && x <= maximo[0] && y >= minimo[1] && y <= maximo[1] && z >= minimo[2] && z <= maximo[2]
  }
  const dentro: boolean[] = []
  for (let i = 0; i < nOriginales; i++) dentro.push(cerca(i))

  // Los triángulos que se miran (alguno de sus vértices cae en el margen) y los que no se tocan.
  const intactos: number[] = []
  let vivos: number[] = []
  for (let t = 0; t + 2 < malla.indices.length; t += 3) {
    const a = malla.indices[t]
    const b = malla.indices[t + 1]
    const c = malla.indices[t + 2]
    if (dentro[a] || dentro[b] || dentro[c]) vivos.push(a, b, c)
    else intactos.push(a, b, c)
  }
  if (vivos.length === 0) return identidad()

  const clave = (a: number, b: number) => (a < b ? a * 67108864 + b : b * 67108864 + a)
  const largoDe = (a: number, b: number) => Math.hypot(posiciones[3 * a] - posiciones[3 * b], posiciones[3 * a + 1] - posiciones[3 * b + 1], posiciones[3 * a + 2] - posiciones[3 * b + 2])
  // De cada vértice, lo que se aparta del telón hacia el lado (con su signo: a qué lado queda) y lo que se sale del
  // corte por arriba, por abajo o más allá de las puntas del trazo. Se mide una vez, cuando hace falta: los vértices
  // no se mueven, y los nuevos se miden al pedirlos.
  const lateralDe: number[] = []
  const fueraDe: number[] = []
  const medir = (i: number) => {
    if (lateralDe[i] !== undefined) return
    if (!dentro[i]) {
      lateralDe[i] = Number.NaN
      fueraDe[i] = Infinity
      return
    }
    const pr = proyectar(curva, leerVertice(i))
    const porAltura = hondo > 0 ? (pr.altura < -hondo ? -hondo - pr.altura : pr.altura > hondo * 0.5 ? pr.altura - hondo * 0.5 : 0) : 0
    // Más allá de las puntas, todo lo que se sale a lo largo; entre ellas, lo que se salga del abanico de un quiebre, que
    // tampoco se va a cortar (`ABANICO_DE_LOS_QUIEBRES`).
    const porLaPunta = pr.dentro ? fueraDelAbanico(pr) : pr.aLoLargo
    lateralDe[i] = pr.lateral
    fueraDe[i] = Math.hypot(porAltura, porLaPunta)
  }
  const delVertice = (i: number) => (Number.isNaN(lateralDe[i]) ? Infinity : Math.hypot(lateralDe[i], fueraDe[i]))
  // El telón pasa por la arista: sus extremos quedan a lados distintos, alguno dentro del corte, y no más lejos uno
  // de otro, a lo ancho, de lo que la arista mide. Esto último descarta el cambio de signo que da el campo lejos de
  // un trazo curvo, donde el punto más cercano salta de un tramo a otro.
  const loCruza = (x: number, y: number) =>
    lateralDe[x] * lateralDe[y] < 0 && (fueraDe[x] === 0 || fueraDe[y] === 0) && Math.abs(lateralDe[x] - lateralDe[y]) <= 1.5 * largoDe(x, y)
  const alTelon = (a: number, b: number, c: number, mayor: number) => {
    // Casi todos los triángulos que se miran están lejos de la franja: con la caja del telón se descartan sin medir.
    let lejos = 0
    for (let k = 0; k < 3; k++) {
      const g = (posiciones[3 * a + k] + posiciones[3 * b + k] + posiciones[3 * c + k]) / 3
      const d = g < cajaMinima[k] ? cajaMinima[k] - g : g > cajaMaxima[k] ? g - cajaMaxima[k] : 0
      lejos += d * d
    }
    if (Math.sqrt(lejos) > opciones.banda + mayor) return Infinity
    medir(a)
    medir(b)
    medir(c)
    if (loCruza(a, b) || loCruza(b, c) || loCruza(c, a)) return 0
    return Math.min(delVertice(a), delVertice(b), delVertice(c))
  }

  for (let vuelta = 0; vuelta < VUELTAS_DEL_AFINADO; vuelta++) {
    // Qué aristas se parten en esta vuelta: la más larga de cada triángulo de la franja que pase de su medida.
    const partir = new Map<number, number>()
    for (let t = 0; t < vivos.length; t += 3) {
      const v = [vivos[t], vivos[t + 1], vivos[t + 2]]
      let mayor = 0
      let cual = 0
      for (let k = 0; k < 3; k++) {
        const l = largoDe(v[k], v[(k + 1) % 3])
        if (l > mayor) {
          mayor = l
          cual = k
        }
      }
      if (mayor <= opciones.arista) continue
      const d = alTelon(v[0], v[1], v[2], mayor)
      if (d > opciones.banda || mayor <= opciones.arista + pendiente * d) continue
      const x = v[cual]
      const y = v[(cual + 1) % 3]
      if (!dentro[x] && !dentro[y]) continue
      partir.set(clave(x, y), -1)
    }
    if (partir.size === 0) break
    const medio = (x: number, y: number): number => {
      const k = clave(x, y)
      const hecho = partir.get(k)
      if (hecho === undefined) return -1
      if (hecho >= 0) return hecho
      const i = origen.length
      posiciones.push((posiciones[3 * x] + posiciones[3 * y]) / 2, (posiciones[3 * x + 1] + posiciones[3 * y + 1]) / 2, (posiciones[3 * x + 2] + posiciones[3 * y + 2]) / 2)
      // El punto medio queda igual de cerca de los dos extremos: sale del de menor índice, para que el corte sea el
      // mismo cada vez que se repite (la sesión guardada lo rehace desde el trazo).
      origen.push(origen[Math.min(x, y)])
      padres.push(Math.min(x, y), Math.max(x, y))
      dentro.push(cerca(i))
      partir.set(k, i)
      return i
    }
    const siguientes: number[] = []
    for (let t = 0; t < vivos.length; t += 3) {
      const a = vivos[t]
      const b = vivos[t + 1]
      const c = vivos[t + 2]
      const ab = medio(a, b)
      const bc = medio(b, c)
      const ca = medio(c, a)
      const cuantas = (ab >= 0 ? 1 : 0) + (bc >= 0 ? 1 : 0) + (ca >= 0 ? 1 : 0)
      if (cuantas === 0) {
        siguientes.push(a, b, c)
      } else if (cuantas === 3) {
        siguientes.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca)
      } else if (cuantas === 1) {
        // Se gira hasta que la arista partida sea la primera.
        const [p, q, r, m] = ab >= 0 ? [a, b, c, ab] : bc >= 0 ? [b, c, a, bc] : [c, a, b, ca]
        siguientes.push(p, m, r, m, q, r)
      } else {
        // Dos partidas: comparten un vértice, `q`. Queda su esquina y un cuadrilátero, que se cierra por su diagonal corta.
        const [p, q, r, m1, m2] = ca < 0 ? [a, b, c, ab, bc] : ab < 0 ? [b, c, a, bc, ca] : [c, a, b, ca, ab]
        siguientes.push(m1, q, m2)
        if (largoDe(p, m2) <= largoDe(m1, r)) siguientes.push(p, m1, m2, p, m2, r)
        else siguientes.push(p, m1, r, m1, m2, r)
      }
    }
    vivos = siguientes
  }

  const indices = new Uint32Array(intactos.length + vivos.length)
  indices.set(intactos, 0)
  indices.set(vivos, intactos.length)
  return { malla: { posiciones: Float32Array.from(posiciones), indices }, origen: Uint32Array.from(origen), padres: Uint32Array.from(padres) }
}

// ------------------------------------------------------------------------ la pared

/** A qué cáscara suelta pertenece cada vértice: las que no comparten ningún triángulo son cáscaras distintas. */
function cascarasDe(indices: Uint32Array, n: number): Int32Array {
  const padre = new Int32Array(n)
  for (let i = 0; i < n; i++) padre[i] = i
  const raiz = (i: number) => {
    while (padre[i] !== i) {
      padre[i] = padre[padre[i]]
      i = padre[i]
    }
    return i
  }
  const unir = (x: number, y: number) => {
    const a = raiz(x)
    const b = raiz(y)
    if (a !== b) padre[a] = b
  }
  for (let t = 0; t + 2 < indices.length; t += 3) {
    unir(indices[t], indices[t + 1])
    unir(indices[t + 1], indices[t + 2])
  }
  for (let i = 0; i < n; i++) padre[i] = raiz(i)
  return padre
}

interface VerticeDelLabio {
  i: number
  t: number
}

/** Lo más cerca que queda `p` de la polilínea que forman `cadena` (posiciones por `leerVertice`). */
function distanciaACadena(p: Vec3, cadena: readonly number[], leerVertice: (i: number) => Vec3): number {
  let mejor = Infinity
  for (let k = 0; k < cadena.length; k++) {
    const a = leerVertice(cadena[k])
    if (k + 1 === cadena.length) {
      mejor = Math.min(mejor, largo(resta(p, a)))
      break
    }
    const ab = resta(leerVertice(cadena[k + 1]), a)
    const l2 = punto(ab, ab)
    const u = l2 > 0 ? Math.min(1, Math.max(0, punto(resta(p, a), ab) / l2)) : 0
    mejor = Math.min(mejor, largo(resta(p, suma(a, por(ab, u)))))
  }
  return mejor
}

/**
 * Las dos tiras de la pared, una por lado (D-333). La cara de fuera es la cáscara cuyos labios quedan más altos —es
 * la que se trazó—; la de dentro, la que queda más cerca por debajo de ella, y nunca a más de `grosorMaximo`. Si no
 * la hay (la oreja, que es una cáscara sin cara de dentro), no se levanta nada.
 *
 * Cada lado es la cadena de fuera y la de dentro, cada una con sus puntas, ordenadas a lo largo, y se cosen como una
 * cremallera: avanza la que tiene el siguiente vértice antes. Las puntas son de los dos lados: ahí las dos tiras se
 * juntan y la herida queda cerrada en sus extremos, sin un agujero hacia el grosor de la piel.
 */
function levantarLaPared({
  curva,
  cascara,
  leerVertice,
  ladoDe,
  origenDe,
  labios,
  puntas,
  grosorMaximo,
  nuevoVertice,
  indices,
}: {
  curva: CurvaDeIncision
  cascara: (i: number) => number
  leerVertice: (i: number) => Vec3
  ladoDe: (i: number) => number
  origenDe: (i: number) => number
  labios: { mas: VerticeDelLabio[]; menos: VerticeDelLabio[] }
  puntas: VerticeDelLabio[]
  grosorMaximo: number
  nuevoVertice: (p: Vec3, origen: number, lado: number, t: number, entre?: readonly [number, number, number]) => number
  indices: number[]
}): { labios: { mas: VerticeDelLabio[]; menos: VerticeDelLabio[] }; hondura: Map<number, number> } | null {
  const todos = [...labios.mas, ...labios.menos]
  const alturas = new Map<number, { suma: number; n: number }>()
  for (const v of todos) {
    const c = cascara(v.i)
    const e = alturas.get(c) ?? { suma: 0, n: 0 }
    e.suma += proyectar(curva, leerVertice(v.i)).altura
    e.n++
    alturas.set(c, e)
  }
  if (alturas.size < 2) return null
  const fuera = [...alturas].sort((a, b) => b[1].suma / b[1].n - a[1].suma / a[1].n)[0][0]
  const deFuera = todos.filter((v) => cascara(v.i) === fuera).map((v) => v.i)
  let dentro = -1
  let mejor = Infinity
  for (const [c] of alturas) {
    if (c === fuera) continue
    const suyos = todos.filter((v) => cascara(v.i) === c)
    // Con dos docenas de muestras basta para saber cuál está debajo: las cadenas tienen cientos de vértices.
    const paso = Math.max(1, Math.floor(suyos.length / 24))
    let suma = 0
    let n = 0
    for (let k = 0; k < suyos.length; k += paso) {
      const p = leerVertice(suyos[k].i)
      let cerca = Infinity
      for (const w of deFuera) cerca = Math.min(cerca, largo(resta(p, leerVertice(w))))
      suma += cerca
      n++
    }
    if (suma / n < mejor) {
      mejor = suma / n
      dentro = c
    }
  }
  if (dentro < 0 || mejor > grosorMaximo) return null
  // La de dentro tiene que quedar debajo, y no al lado: dos islas de una misma lámina cortadas a la vez están a la
  // misma altura, y coserlas sería tender una pared entre ellas.
  const media = (c: number) => alturas.get(c)!.suma / alturas.get(c)!.n
  if (media(fuera) - media(dentro) < 0.5 * mejor) return null

  const hondura = new Map<number, number>()
  // Una arista más larga que esto no es de la pared: es una cadena que se quedó sin pareja en un extremo.
  const limite = 3 * grosorMaximo
  for (const lado of [1, -1] as const) {
    const delLado = lado > 0 ? labios.mas : labios.menos
    const cadena = (c: number) =>
      [...delLado.filter((v) => cascara(v.i) === c), ...puntas.filter((v) => cascara(v.i) === c)].sort((a, b) => a.t - b.t)
    const a = cadena(fuera)
    const b = cadena(dentro)
    if (a.length < 2 || b.length < 2) continue
    // Copias, con el lado de su vértice: las de las puntas, sin lado, no se mueven al abrir, como ellas.
    const copia = (v: VerticeDelLabio) => nuevoVertice(leerVertice(v.i), origenDe(v.i), ladoDe(v.i), v.t, [v.i, v.i, 0])
    const enA = a.map(copia)
    const enB = b.map(copia)
    for (const v of enA) hondura.set(v, 0)
    const cadenaDeFuera = a.map((v) => v.i)
    b.forEach((v, k) => hondura.set(enB[k], distanciaACadena(leerVertice(v.i), cadenaDeFuera, leerVertice)))
    const poner = (x: number, y: number, z: number) => {
      const px = leerVertice(x)
      const py = leerVertice(y)
      const pz = leerVertice(z)
      const lados = [largo(resta(py, px)), largo(resta(pz, py)), largo(resta(px, pz))]
      const mayor = Math.max(...lados)
      if (mayor > limite) return
      const normal = cruz(resta(py, px), resta(pz, px))
      // Sin área no tiene normal: dos copias de la misma punta.
      if (largo(normal) <= 1e-6 * mayor * mayor) return
      // La pared de un lado mira hacia el otro: la normal, contra el sentido en que se separa su labio.
      const centro = por(suma(suma(px, py), pz), 1 / 3)
      const quiere = por(proyectar(curva, centro).direccion, -lado)
      if (punto(normal, quiere) >= 0) indices.push(x, y, z)
      else indices.push(x, z, y)
    }
    let i = 0
    let j = 0
    while (i < a.length - 1 || j < b.length - 1) {
      const avanzaFuera = j >= b.length - 1 || (i < a.length - 1 && a[i + 1].t <= b[j + 1].t)
      if (avanzaFuera) {
        poner(enA[i], enA[i + 1], enB[j])
        i++
      } else {
        poner(enA[i], enB[j + 1], enB[j])
        j++
      }
    }
  }
  return {
    labios: { mas: labios.mas.filter((v) => cascara(v.i) === fuera), menos: labios.menos.filter((v) => cascara(v.i) === fuera) },
    hondura,
  }
}

// ------------------------------------------------------------------------ cortar

const suave = (x: number) => {
  const k = Math.min(1, Math.max(0, x))
  return k * k * (3 - 2 * k)
}

/**
 * El borde de la herida se cierra en las puntas: sin esto, un corte de 5 cm
 * abriría en rectángulo. Y se cierra a lo largo de media herida, en forma de
 * lente, y no en un tramo corto: con el 18 % de cada punta, los triángulos
 * delgados pegados a la grieta —los hay siempre que el corte pasa cerca de una
 * fila de vértices— se daban la vuelta al abrir, porque el peso cambiaba más
 * deprisa de lo que su altura toleraba.
 */
const AFILADO = 0.5
export const afilado = (t: number) => suave(Math.min(t, 1 - t) / AFILADO)

/**
 * La forma de una herida que se abre sola (P-015): de 0 en cada punta a 1 en el tramo central, en arco de parábola.
 *
 * Es un huso y no una elipse. Una grieta en una lámina elástica abre en elipse, con las puntas romas; una incisión
 * no, porque en la punta la piel sigue entera y sujeta los dos labios: se ve como un ojal de puntas agudas, dos arcos
 * que se juntan. La parábola llega a la punta con pendiente finita, que además es lo que la malla tolera —con la
 * pendiente infinita de la elipse, los triángulos de la punta se darían la vuelta—, y al tramo central con pendiente
 * cero, sin esquina.
 *
 * `punta` es la fracción del largo que tarda en abrirse del todo desde cada extremo: con 0,5 —lo más que admite— el
 * huso es un solo arco de punta a punta; con menos, una incisión larga abre pareja en el medio y se cierra solo cerca
 * de las puntas, como se ve en una herida de quince centímetros.
 */
export const huso = (t: number, punta = 0.5): number => {
  const p = Math.min(0.5, Math.max(1e-6, punta))
  const u = Math.min(1, Math.max(0, Math.min(t, 1 - t)) / p)
  return u * (2 - u)
}

/**
 * El huso de una herida, para un punto que está a la fracción `t` del **trazo**: lo que le toca de la retracción por
 * su sitio a lo largo de la grieta (`TramoDeLaGrieta`). Es `huso` medido desde donde la grieta empieza y acaba de
 * verdad; `punta` es, igual, la fracción del largo de la grieta que tarda en abrirse del todo.
 *
 * Fuera de la grieta no hay herida: el tejido que el trazo recorrió sin llegar a partir no se aparta. Por un extremo
 * abierto —la grieta llegó al borde de la malla— no se cierra.
 */
/**
 * Cuánto puede crecer la retracción por cada unidad de largo que se aleja de una punta de la grieta. A 1, un vértice
 * del labio llega adonde estaba su vecino y el triángulo que los une se vuelve del revés; dos tercios dejan margen para
 * lo que la curva del trazo y el arrastre a lo ancho añaden. Lo usan el cierre junto a las puntas y el tope de
 * `retraccionDelCorte.ts`.
 */
export const PENDIENTE_MAXIMA_EN_LA_PUNTA = 2 / 3

/** Hasta qué fracción del `alcance` se mide lo lejos que queda cada vértice de una punta: más allá ya no se cierra. */
const ALCANCE_DE_LAS_PUNTAS = 0.5

/** A qué fracción del `alcance` llega, hacia cada lado, el promedio de la curva de apertura (`deApertura`). */
const SUAVIZADO_DE_LA_DIRECCION = 1 / 3

/**
 * Lo lejos que queda cada vértice que la herida arrastra de la punta más cercana de su grieta, hasta `alcance` (P-015).
 *
 * Son puntas los vértices sencillos donde acaba una grieta y los de cada triángulo que, ya cortada la malla, sigue
 * teniendo un vértice de cada labio: el tejido que queda entero de un lado al otro. La grieta de un músculo no acaba
 * solo en las dos puntas del trazo: el telón lo cruza por arriba y por abajo, sale de su hondura, lo roza de lado, y cada
 * rama acaba donde acaba. Contando solo los dos extremos (`husoDeLaGrieta`), el tibial posterior del caso 4 se retraía
 * entero junto a una punta de en medio y plegaba diez triángulos. La distancia es en recto, y se busca en una rejilla
 * de celdas de `alcance`: lo que no está en las 27 vecinas está más lejos que eso.
 */
function distanciaALasPuntas(
  posiciones: Float32Array,
  indices: number[],
  lado: Int8Array,
  pesoLateral: Float32Array,
  nVertices: number,
  alcance: number,
): { distancia: Float32Array; alcance: number } {
  const total = lado.length
  const distancia = new Float32Array(total).fill(Infinity)
  if (!(alcance > 0)) return { distancia, alcance: 0 }
  const esPunta = new Uint8Array(total)
  for (let i = nVertices; i < total; i++) if (lado[i] === 0) esPunta[i] = 1
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = lado[indices[t]]
    const b = lado[indices[t + 1]]
    const c = lado[indices[t + 2]]
    if ((a > 0 || b > 0 || c > 0) && (a < 0 || b < 0 || c < 0)) esPunta[indices[t]] = esPunta[indices[t + 1]] = esPunta[indices[t + 2]] = 1
  }
  const celda = (x: number) => Math.floor(x / alcance)
  const clave = (x: number, y: number, z: number) => `${x},${y},${z}`
  const rejilla = new Map<string, number[]>()
  for (let i = 0; i < total; i++) {
    if (!esPunta[i]) continue
    const k = clave(celda(posiciones[3 * i]), celda(posiciones[3 * i + 1]), celda(posiciones[3 * i + 2]))
    const lista = rejilla.get(k)
    if (lista) lista.push(i)
    else rejilla.set(k, [i])
  }
  if (rejilla.size === 0) return { distancia, alcance }
  for (let i = 0; i < total; i++) {
    if (esPunta[i]) {
      distancia[i] = 0
      continue
    }
    if (lado[i] === 0 || pesoLateral[i] === 0) continue
    const x = posiciones[3 * i]
    const y = posiciones[3 * i + 1]
    const z = posiciones[3 * i + 2]
    const cx = celda(x)
    const cy = celda(y)
    const cz = celda(z)
    let cerca = Infinity
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const lista = rejilla.get(clave(cx + dx, cy + dy, cz + dz))
          if (!lista) continue
          for (const j of lista) {
            const d = Math.hypot(posiciones[3 * j] - x, posiciones[3 * j + 1] - y, posiciones[3 * j + 2] - z)
            if (d < cerca) cerca = d
          }
        }
    if (cerca <= alcance) distancia[i] = cerca
  }
  return { distancia, alcance }
}

/**
 * Cierra el extremo de la grieta que llega al borde de la malla si más allá, bajo el trazo, la malla sigue **entera**:
 * algún triángulo con un vértice de cada labio sin partir, del todo fuera de la grieta (P-015).
 *
 * Abierto quería decir «la herida no se cierra ahí: la lámina está partida hasta su borde», y vale para el vaso cortado
 * de lado a lado. Pero el sóleo del caso 4 se partió de 0,06 a 0,20 del trazo hasta su borde y seguía, sin cortar, bajo
 * el resto: con ese extremo abierto, los Farabeuf en 0,64 lo estiraban a los dos lados y sus triángulos se daban la
 * vuelta (de 5 a 25 mm²). Cerrar la punta por la t, en cambio, cizallaba los vasos: la vena tibial pasó de 10 a 42.
 */
export function cerrarLasPuntasConTejidoEntero(
  grieta: TramoDeLaGrieta,
  indices: readonly number[],
  lado: Int8Array,
  pesoLateral: Float32Array,
  largoT: Float32Array,
) {
  if (grieta.cerradaAlInicio && grieta.cerradaAlFinal) return
  for (let t = 0; t + 2 < indices.length; t += 3) {
    // Solo cuenta lo que la herida arrastra: lo demás no tiene su sitio a lo largo medido, y no se desgarra.
    let mas = false
    let menos = false
    let tMenor = Infinity
    let tMayor = -Infinity
    for (let k = 0; k < 3; k++) {
      const v = indices[t + k]
      if (!(pesoLateral[v] > 0)) continue
      if (lado[v] > 0) mas = true
      if (lado[v] < 0) menos = true
      tMenor = Math.min(tMenor, largoT[v])
      tMayor = Math.max(tMayor, largoT[v])
    }
    if (!mas || !menos) continue
    if (tMenor > grieta.hasta) grieta.cerradaAlFinal = true
    if (tMayor < grieta.desde) grieta.cerradaAlInicio = true
    if (grieta.cerradaAlInicio && grieta.cerradaAlFinal) return
  }
}

export function husoDeLaGrieta(grieta: TramoDeLaGrieta, t: number, punta = 0.5): number {
  const ancho = grieta.hasta - grieta.desde
  if (!(ancho > 1e-9)) return 0
  const x = (t - grieta.desde) / ancho
  const alInicio = grieta.cerradaAlInicio ? x : Infinity
  const alFinal = grieta.cerradaAlFinal ? 1 - x : Infinity
  const d = Math.min(alInicio, alFinal)
  if (d === Infinity) return 1
  if (d <= 0) return 0
  const u = Math.min(1, d / Math.min(0.5, Math.max(1e-6, punta)))
  return u * (2 - u)
}

/**
 * Parte la malla a lo largo de la incisión. Devuelve `null` si la incisión no
 * toca la malla (no cortó ninguna arista): quien llama deja la malla como estaba.
 */
export function cortarMalla(entrada: MallaPlana, incision: IncisionSobreLaMalla, opciones: OpcionesDeCorte): MallaCortada | null {
  const curva = prepararIncision(incision, opciones.alcance * 0.02, opciones.alcance * SUAVIZADO_DE_LA_DIRECCION)
  if (!curva) return null

  // -- 0. la franja, afinada: lo que sigue corta la malla que sale de aquí --------
  const afinada =
    opciones.afinar && opciones.afinar > 0
      ? afinarLaFranja(entrada, curva, { arista: opciones.afinar, banda: opciones.alcance, margen: opciones.holgura + opciones.profundidad, profundidad: opciones.profundidad })
      : null
  const malla = afinada ? afinada.malla : entrada

  const nVertices = malla.posiciones.length / 3
  const nTriangulos = malla.indices.length / 3

  // A qué altura del largo del trazo cae un punto: con la curva de apertura, si la hay (`deApertura`). La grieta, los
  // labios y el arrastre lo miden igual, o no casan. Medido con el trazo, donde el bisturí hondo hace esquina todo lo
  // que queda al otro lado cae en el mismo nodo: el poplíteo del caso 4 tenía su grieta entera en t = 0,8188, de largo
  // cero, y ni se abría ni ordenaba sus labios.
  const enElLargo = (p: Vec3, delTrazo: { t: number }): number => {
    const ap = curva.deApertura
    if (!ap) return delTrazo.t
    const q = proyectar(ap, p)
    return ap.tDelNodo[q.tramo] * (1 - q.u) + ap.tDelNodo[q.tramo + 1] * q.u
  }

  // -- 1. el campo, solo en la franja que rodea a la incisión ------------------
  let minimo: Vec3 = [Infinity, Infinity, Infinity]
  let maximo: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of incision.puntos) {
    for (let k = 0; k < 3; k++) {
      minimo[k] = Math.min(minimo[k], p[k])
      maximo[k] = Math.max(maximo[k], p[k])
    }
  }
  const margen = opciones.holgura + opciones.profundidad
  minimo = [minimo[0] - margen, minimo[1] - margen, minimo[2] - margen]
  maximo = [maximo[0] + margen, maximo[1] + margen, maximo[2] + margen]

  const campo = new Float32Array(nVertices).fill(Number.NaN)
  for (let i = 0; i < nVertices; i++) {
    const p = leer(malla.posiciones, i)
    if (p[0] < minimo[0] || p[0] > maximo[0] || p[1] < minimo[1] || p[1] > maximo[1] || p[2] < minimo[2] || p[2] > maximo[2]) continue
    const pr = proyectar(curva, p)
    // Un cero exacto se trata como positivo: así ningún vértice cae «sobre» el
    // corte y no se parten aristas en su mismo extremo.
    campo[i] = pr.lateral === 0 ? 1e-9 : pr.lateral
  }

  // -- 2. qué aristas se parten ---------------------------------------------
  const claveDeArista = (a: number, b: number) => (a < b ? a * nVertices + b : b * nVertices + a)
  /** Cada arista partida: el vértice nuevo (o los dos, si se duplica). */
  interface Partida {
    a: number
    b: number
    /** Dónde cae el cruce entre `a` (0) y `b` (1): lo que el vértice nuevo toma de cada extremo. */
    k: number
    posicion: Vec3
    t: number
    mas: number
    menos: number
    pasa: boolean
  }
  const partidas = new Map<number, Partida>()
  const recorrerTriangulo = (i: number): [number, number, number] => [
    malla.indices[3 * i],
    malla.indices[3 * i + 1],
    malla.indices[3 * i + 2],
  ]
  const probarArista = (a: number, b: number): boolean => {
    const clave = claveDeArista(a, b)
    const antes = partidas.get(clave)
    if (antes) return true
    const fa = campo[a]
    const fb = campo[b]
    if (Number.isNaN(fa) || Number.isNaN(fb) || fa * fb >= 0) return false
    // El cruce no se acerca a un vértice más del 5 % de la arista: una incisión
    // que pasa casi por encima de un vértice dejaba un triángulo de área casi
    // cero —sin normal, sin forma— justo en el borde de la herida. Desplazar el
    // corte un 5 % de arista (décimas de milímetro) no se ve y evita el sliver.
    const k = Math.min(0.95, Math.max(0.05, fa / (fa - fb)))
    const pa = leer(malla.posiciones, a)
    const pb = leer(malla.posiciones, b)
    const m = mezclar(pa, pb, k)
    const pr = proyectar(curva, m)
    // El cruce tiene que caer sobre la incisión de verdad: dentro de su largo,
    // a la profundidad de corte y sin que el campo, que cambia de tramo en las
    // curvas, lo haya cruzado por casualidad lejos de la línea.
    const tolerancia = Math.max(1e-9, 0.35 * largo(resta(pb, pa)))
    if (!pr.dentro || Math.abs(pr.lateral) > tolerancia) return false
    if (pr.altura < -opciones.profundidad || pr.altura > opciones.profundidad * 0.5) return false
    // Ni más allá de un quiebre del trazo, fuera del abanico que cuelga de él: ahí la hoja no pasó.
    if (fueraDelAbanico(pr) > tolerancia) return false
    partidas.set(clave, { a, b, k, posicion: m, t: enElLargo(m, pr), mas: -1, menos: -1, pasa: false })
    return true
  }

  // Cuántas aristas partidas tiene cada triángulo (0, 1 o 2): tres no puede ser.
  const cortesDe = new Uint8Array(nTriangulos)
  for (let t = 0; t < nTriangulos; t++) {
    const [a, b, c] = recorrerTriangulo(t)
    let n = 0
    if (probarArista(a, b)) n++
    if (probarArista(b, c)) n++
    if (probarArista(c, a)) n++
    cortesDe[t] = n
  }
  if (partidas.size === 0) return null

  // -- 3. por qué aristas pasa la herida de lado a lado -----------------------
  // Una arista «pasa» si todos los triángulos que la comparten tienen dos
  // cortes: la grieta sigue por ambos lados. Si alguno tiene uno solo, la herida
  // acaba ahí, y el vértice se queda sencillo.
  const vecinos = new Map<number, number[]>()
  for (let t = 0; t < nTriangulos; t++) {
    const [a, b, c] = recorrerTriangulo(t)
    for (const [x, y] of [[a, b], [b, c], [c, a]] as [number, number][]) {
      const clave = claveDeArista(x, y)
      if (!partidas.has(clave)) continue
      const lista = vecinos.get(clave)
      if (lista) lista.push(t)
      else vecinos.set(clave, [t])
    }
  }
  for (const [clave, p] of partidas) {
    p.pasa = (vecinos.get(clave) ?? []).every((t) => cortesDe[t] === 2)
  }
  // Entre qué fracciones del trazo queda la grieta. Un extremo acaba cerrado si su último cruce no pasa: es la punta.
  let primera: Partida | null = null
  let ultima: Partida | null = null
  for (const p of partidas.values()) {
    if (!primera || p.t < primera.t) primera = p
    if (!ultima || p.t > ultima.t) ultima = p
  }
  const grieta: TramoDeLaGrieta = {
    desde: primera ? primera.t : 0,
    hasta: ultima ? ultima.t : 1,
    cerradaAlInicio: !primera?.pasa,
    cerradaAlFinal: !ultima?.pasa,
  }

  // -- 4. los vértices: los originales y, por cada arista, el nuevo (o los dos) ---
  const lista = {
    posiciones: Array.from(malla.posiciones) as number[],
    origen: Array.from({ length: nVertices }, (_, i) => i),
    lado: new Array<number>(nVertices).fill(0),
    t: new Array<number>(nVertices).fill(0),
    /** De qué dos vértices sale cada uno de los que añade el corte, y cuánto del segundo (`MezclaDeVertices`). */
    de: [] as number[],
    cuanto: [] as number[],
  }
  for (let i = 0; i < nVertices; i++) lista.lado[i] = Number.isNaN(campo[i]) ? 0 : campo[i] > 0 ? 1 : -1
  /** `entre` dice de qué dos vértices sale y cuánto del segundo; sin él, es una copia de `origen`. */
  const nuevoVertice = (p: Vec3, origen: number, lado: number, t: number, entre?: readonly [number, number, number]) => {
    lista.posiciones.push(p[0], p[1], p[2])
    lista.origen.push(origen)
    lista.lado.push(lado)
    lista.t.push(t)
    lista.de.push(entre ? entre[0] : origen, entre ? entre[1] : origen)
    lista.cuanto.push(entre ? entre[2] : 0)
    return lista.origen.length - 1
  }
  const labios = { mas: [] as VerticeDelLabio[], menos: [] as VerticeDelLabio[] }
  /** Los vértices sencillos donde acaba cada grieta: la pared los necesita para cerrarse en las puntas. */
  const puntas: VerticeDelLabio[] = []
  for (const p of partidas.values()) {
    // Los dos labios salen del mismo punto de la arista: lo que otra herida arrastre a uno se lo arrastra igual al
    // otro, y la grieta nueva no se abre ni se monta por culpa de la vieja.
    const entre = [p.a, p.b, p.k] as const
    if (p.pasa) {
      p.mas = nuevoVertice(p.posicion, p.a, 1, p.t, entre)
      p.menos = nuevoVertice(p.posicion, p.a, -1, p.t, entre)
      labios.mas.push({ i: p.mas, t: p.t })
      labios.menos.push({ i: p.menos, t: p.t })
    } else {
      p.mas = p.menos = nuevoVertice(p.posicion, p.a, 0, p.t, entre)
      puntas.push({ i: p.mas, t: p.t })
    }
  }
  /** Los puntos de la grieta entre dos cruces, sin los extremos, a no más de `pasoDelLabio` uno de otro, y dónde cae cada uno entre los dos (de 0 a 1). */
  const puntosDeLaGrieta = (desde: Vec3, hasta: Vec3): { q: Vec3; f: number }[] => {
    const paso = opciones.pasoDelLabio
    if (!paso || paso <= 0) return []
    const n = Math.min(64, Math.ceil(largo(resta(hasta, desde)) / paso))
    const salida: { q: Vec3; f: number }[] = []
    for (let j = 1; j < n; j++) salida.push({ q: mezclar(desde, hasta, j / n), f: j / n })
    return salida
  }
  /** El vértice de la arista que usa el labio de ese lado. */
  const deLaArista = (a: number, b: number, lado: number): number => {
    const p = partidas.get(claveDeArista(a, b))!
    return lado > 0 ? p.mas : p.menos
  }

  // -- 5. los triángulos ----------------------------------------------------------
  const indices: number[] = []
  for (let t = 0; t < nTriangulos; t++) {
    const [v0, v1, v2] = recorrerTriangulo(t)
    const cortes = cortesDe[t]
    if (cortes === 0) {
      indices.push(v0, v1, v2)
      continue
    }
    const v = [v0, v1, v2]
    const cortada = (i: number) => partidas.has(claveDeArista(v[i], v[(i + 1) % 3]))
    if (cortes === 1) {
      // Se gira el triángulo hasta que la arista partida sea la 0-1.
      const k = [0, 1, 2].find((i) => cortada(i))!
      const [a, b, c] = [v[k], v[(k + 1) % 3], v[(k + 2) % 3]]
      const ladoA = lista.lado[a] || 1
      const ladoB = lista.lado[b] || -1
      indices.push(a, deLaArista(a, b, ladoA), c)
      indices.push(deLaArista(a, b, ladoB), b, c)
      continue
    }
    // Dos cortes: el vértice solitario es el que tiene ambas aristas partidas.
    const k = [0, 1, 2].find((i) => cortada(i) && cortada((i + 2) % 3))!
    const [a, b, c] = [v[k], v[(k + 1) % 3], v[(k + 2) % 3]]
    const ladoA = lista.lado[a] || 1
    const ladoResto = -ladoA
    const mab = (lado: number) => deLaArista(a, b, lado)
    const mca = (lado: number) => deLaArista(c, a, lado)
    // La grieta cruza el triángulo en recta, de una arista a la otra. Con `pasoDelLabio` se le ponen vértices en medio,
    // uno para cada labio, y cada lado se rehace en abanico desde su vértice: la superficie es la misma, pero el labio
    // ya puede doblarse donde apoya una hoja (P-008 E2). Sin vértices en medio, el abanico es el triángulo de siempre.
    const enMedio = puntosDeLaGrieta(partidas.get(claveDeArista(a, b))!.posicion, partidas.get(claveDeArista(c, a))!.posicion).map(
      ({ q, f }) => {
        const t = enElLargo(q, proyectar(curva, q))
        // Lo que no se promedia se copia del vértice más cercano de su lado, como en las aristas; lo demás, de los dos
        // cruces entre los que está, cada labio de los de su lado.
        const delResto = largo(resta(q, leer(malla.posiciones, b))) <= largo(resta(q, leer(malla.posiciones, c))) ? b : c
        const enA = nuevoVertice(q, a, ladoA, t, [mab(ladoA), mca(ladoA), f])
        const enElResto = nuevoVertice(q, delResto, ladoResto, t, [mab(ladoResto), mca(ladoResto), f])
        labios[ladoA > 0 ? 'mas' : 'menos'].push({ i: enA, t })
        labios[ladoA > 0 ? 'menos' : 'mas'].push({ i: enElResto, t })
        return { enA, enElResto }
      },
    )
    const cadenaA = [mab(ladoA), ...enMedio.map((x) => x.enA), mca(ladoA)]
    const cadenaResto = [mab(ladoResto), ...enMedio.map((x) => x.enElResto), mca(ladoResto)]
    for (let j = 0; j + 1 < cadenaA.length; j++) indices.push(a, cadenaA[j], cadenaA[j + 1])
    indices.push(mab(ladoResto), b, c)
    for (let j = cadenaResto.length - 2; j >= 0; j--) indices.push(c, cadenaResto[j + 1], cadenaResto[j])
  }

  // -- 6. la pared, si la capa tiene grosor (D-333) -------------------------------
  // Antes de los pesos: las copias toman los suyos por su posición, que es la de su labio, y se abren con él.
  let deLaPared: ReturnType<typeof levantarLaPared> = null
  if (opciones.pared && opciones.pared > 0) {
    const cascaras = cascarasDe(malla.indices, nVertices)
    const leerVertice = (i: number): Vec3 => [lista.posiciones[3 * i], lista.posiciones[3 * i + 1], lista.posiciones[3 * i + 2]]
    deLaPared = levantarLaPared({
      curva,
      cascara: (i) => cascaras[lista.origen[i]],
      leerVertice,
      ladoDe: (i) => lista.lado[i],
      origenDe: (i) => lista.origen[i],
      labios,
      puntas,
      grosorMaximo: opciones.pared,
      nuevoVertice,
      indices,
    })
  }

  // -- 7. peso y dirección de cada vértice ---------------------------------------
  const total = lista.origen.length
  const posiciones = Float32Array.from(lista.posiciones)
  const peso = new Float32Array(total)
  const pesoLateral = new Float32Array(total)
  const direccion = new Float32Array(total * 3)
  const lado = Int8Array.from(lista.lado)
  const largoT = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    if (lado[i] === 0 && i < nVertices) continue
    const p = leer(posiciones, i)
    if (i < nVertices && Number.isNaN(campo[i])) continue
    const pr = proyectar(curva, p)
    if (pr.altura < -opciones.profundidad || pr.altura > opciones.profundidad * 0.5) continue
    // A qué altura del largo cae, hacia dónde se aparta y cuánto se arrastra, con la curva de apertura (`deApertura`):
    // con el trazo quebrado, las tres cosas saltaban de un vértice al vecino. Lo que se arrastra, sobre todo en hondo:
    // la normal del trazo crudo cabecea hasta 20° de un nodo a otro, y a 24 mm bajo él el lateral de dos vértices de la
    // fascia crural a 3 mm uno de otro medía 11 y 19 mm; con los separadores, uno se apartaba 9 mm y el otro 3, y el
    // triángulo entre ellos se daba la vuelta.
    const ap = curva.deApertura ? proyectar(curva.deApertura, p) : null
    const medida = ap ?? pr
    // Lo que queda más allá de un quiebre, fuera del abanico, no se cortó: se arrastra menos cuanto más se sale. Medido
    // solo de lado, el músculo que seguía entero al otro lado del quiebre se estiraba con los separadores como si lo
    // estuviera, y daba triángulos vueltos.
    const cerca = 1 - suave(Math.hypot(medida.lateral, fueraDelAbanico(medida)) / Math.max(opciones.alcance, 1e-9))
    const t = ap && curva.deApertura ? curva.deApertura.tDelNodo[ap.tramo] * (1 - ap.u) + curva.deApertura.tDelNodo[ap.tramo + 1] * ap.u : enElLargo(p, pr)
    largoT[i] = t
    peso[i] = cerca * afilado(t)
    pesoLateral[i] = cerca
    const haciaDonde = ap ? ap.direccion : pr.direccion
    direccion[3 * i] = haciaDonde[0]
    direccion[3 * i + 1] = haciaDonde[1]
    direccion[3 * i + 2] = haciaDonde[2]
  }
  // Los vértices de la punta (sencillos) no se mueven: la herida acaba cerrada.
  for (let i = nVertices; i < total; i++) if (lado[i] === 0) peso[i] = pesoLateral[i] = 0
  cerrarLasPuntasConTejidoEntero(grieta, indices, lado, pesoLateral, largoT)
  const hastaLaPunta = distanciaALasPuntas(posiciones, indices, lado, pesoLateral, nVertices, opciones.alcance * ALCANCE_DE_LAS_PUNTAS)
  const pared = new Float32Array(total).fill(-1)
  if (deLaPared) for (const [v, h] of deLaPared.hondura) pared[v] = h

  const ordenar = (cadena: VerticeDelLabio[]) => [...cadena].sort((x, y) => x.t - y.t).map((x) => x.i)
  const visibles = deLaPared ? deLaPared.labios : labios

  // De qué vértice de la malla **que entró** sale cada uno: los de la franja afinada, a través de su arista.
  const origen = Uint32Array.from(lista.origen)
  if (afinada) for (let i = 0; i < origen.length; i++) origen[i] = afinada.origen[origen[i]]

  // Y de qué dos, para lo que se interpola: primero los de la franja (el medio de su arista), detrás los del corte.
  const nEntrada = entrada.posiciones.length / 3
  const deLaFranja = afinada ? afinada.padres : new Uint32Array(0)
  const nuevos = total - nEntrada
  const mezcla: MezclaDeVertices = { desde: nEntrada, de: new Uint32Array(2 * nuevos), peso: new Float32Array(nuevos) }
  mezcla.de.set(deLaFranja, 0)
  mezcla.peso.fill(0.5, 0, deLaFranja.length / 2)
  mezcla.de.set(lista.de, deLaFranja.length)
  mezcla.peso.set(lista.cuanto, deLaFranja.length / 2)

  return {
    posiciones,
    indices: Uint32Array.from(indices),
    grieta,
    origen,
    mezcla,
    peso,
    pesoLateral,
    direccion,
    lado,
    largoT,
    hastaLaPunta,
    curva,
    labios: { mas: ordenar(visibles.mas), menos: ordenar(visibles.menos) },
    pared,
    aristasPartidas: partidas.size,
  }
}

// -------------------------------------------------------------------------- abrir

/**
 * Las posiciones con la herida abierta: el labio «más» separado `mas` y el
 * «menos» separado `menos`, en las unidades de la malla.
 *
 * Son dos números y no uno porque un Farabeuf sostiene un solo borde mientras
 * el ayudante sostiene el otro; un Weitlaner, que se queda abierto solo, mueve
 * los dos por igual.
 */
export function abrirHerida(
  corte: MallaCortada,
  mas: number,
  menos: number,
  /**
   * Cuánto abre cada labio en cada punto de la herida (de 0 a 1 a lo largo de
   * ella), en las mismas unidades. Con perfil, `mas` y `menos` no se usan: cada
   * vértice abre lo que el perfil diga de su posición. Es lo que deja que un
   * separador abra la herida donde está puesto y la cierre hacia los extremos.
   */
  perfil?: (t: number) => { mas: number; menos: number },
  /** Lo que cada labio se retrae solo, y el tramo de cada punta en que esa retracción se cierra (ver `AperturaDeUnCorte`). */
  reposo?: number,
  punta?: number,
): Float32Array {
  const salida = Float32Array.from(corte.posiciones)
  const apertura: AperturaDeUnCorte = { mas, menos, perfil, reposo, punta }
  const n = corte.lado.length
  for (let i = 0; i < n; i++) {
    const k = cuantoSeAparta(corte, i, apertura)
    if (k === 0) continue
    salida[3 * i] += corte.direccion[3 * i] * k
    salida[3 * i + 1] += corte.direccion[3 * i + 1] * k
    salida[3 * i + 2] += corte.direccion[3 * i + 2] * k
  }
  return salida
}

/** Cuánto abre cada labio de un corte: lo mismo que pide `abrirHerida`. */
export interface AperturaDeUnCorte {
  mas: number
  menos: number
  perfil?: (t: number) => { mas: number; menos: number }
  /**
   * Lo que cada labio se retrae solo en lo más ancho de la herida, en las unidades de la malla (P-015). Va repartido en
   * huso y se suma a `mas`, a `menos` y al perfil: lo que sostiene una hoja se cuenta desde donde el labio descansa.
   */
  reposo?: number
  /** La fracción del largo de la grieta que tarda el huso en abrirse del todo desde cada punta (ver `husoDeLaGrieta`). Sin ella, la mitad. */
  punta?: number
}

/**
 * Lo que un vértice se desplaza a lo largo de su `direccion` con esa apertura, con su signo: el labio «más» hacia
 * `+direccion` y el «menos» hacia `-direccion`.
 */
function cuantoSeAparta(corte: MallaCortada, i: number, apertura: AperturaDeUnCorte): number {
  const lado = corte.lado[i]
  if (lado === 0) return 0
  let k = 0
  // El perfil ya se cierra en las puntas: el peso no vuelve a estrecharlas (P-008 E2).
  const peso = apertura.perfil ? corte.pesoLateral[i] : corte.peso[i]
  if (peso !== 0) {
    const aqui = apertura.perfil ? apertura.perfil(corte.largoT[i]) : null
    k = peso * (lado > 0 ? (aqui ? aqui.mas : apertura.mas) : aqui ? aqui.menos : apertura.menos)
  }
  if (apertura.reposo) k += retraccionDelVertice(corte, i, apertura.reposo, apertura.punta)
  return lado > 0 ? k : -k
}

/**
 * Lo que la retracción `reposo` aparta a ese vértice, sin signo, en las unidades de la malla (P-015). Lleva su propio
 * huso a lo largo de la grieta, y por eso va con el peso que no estrecha las puntas, como el perfil; y se cierra junto a
 * cada punta de la grieta (`hastaLaPunta`), en un tramo que crece con lo que se retrae, para no pasar de
 * `PENDIENTE_MAXIMA_EN_LA_PUNTA`. Lo usa la apertura y lo usa quien pregunta dónde descansa un labio: las dos cuentas
 * tienen que ser la misma.
 */
export function retraccionDelVertice(corte: MallaCortada, i: number, reposo: number, punta?: number): number {
  if (!reposo || corte.lado[i] === 0) return 0
  const peso = corte.pesoLateral[i]
  if (peso === 0) return 0
  return peso * reposo * husoDeLaGrieta(corte.grieta, corte.largoT[i], punta) * cierreJuntoALaPunta(corte, i, reposo)
}

/**
 * De 0 en una punta de la grieta a 1 a `tramo` de ella, en curva suave. El tramo es el que deja la pendiente en
 * `PENDIENTE_MAXIMA_EN_LA_PUNTA`: la curva (3x² − 2x³) sube como mucho 1,5 veces su media, así que a `reposo · 1,5 /
 * pendiente` la retracción crece a lo sumo eso por unidad de largo. Hasta el alcance con que se midió la distancia.
 */
function cierreJuntoALaPunta(corte: MallaCortada, i: number, reposo: number): number {
  const { distancia, alcance } = corte.hastaLaPunta
  const tramo = Math.min(alcance, (1.5 * Math.abs(reposo)) / PENDIENTE_MAXIMA_EN_LA_PUNTA)
  const d = distancia[i]
  if (!(tramo > 0) || d >= tramo) return 1
  return suave(d / tramo)
}

/** El borrador de `componerCortes`: crece hasta la malla más grande que se haya compuesto y no sale de aquí. */
let arrastreDeLosCortes = new Float64Array(0)

/**
 * Las posiciones de una malla cortada **varias veces**, con cada herida abierta lo suyo (P-003 E4).
 *
 * Cada corte se hizo sobre la malla que dejó el anterior: partió una geometría que ya tenía su herida (cerrada, en
 * reposo). `cortarMalla` conserva los índices de los vértices que ya había y añade los nuevos al final, y de cada
 * nuevo dice de qué dos vértices sale y cuánto de cada uno (`mezcla`). Eso basta para componer: la posición final de
 * un vértice es la **base del último corte** más lo que cada corte lo desplaza. Lo que un corte desplaza a un vértice
 * que añadió otro posterior es lo que desplaza al punto de la arista en que ese vértice nació: va adonde lo lleva el
 * triángulo de la piel en que está, que es la misma piel.
 *
 * Hasta P-015 heredaba el arrastre de un solo extremo de su arista. Valía mientras los vértices nuevos eran los de la
 * grieta; con la franja afinada (`afinarLaFranja`) son miles, y dos vecinos que heredaban de extremos distintos se
 * cruzaban.
 *
 * Con un solo corte es exactamente `abrirHerida`. Con dos cortes lejanos, cada uno abre lo suyo; con el primero
 * cerrado, sale el segundo solo.
 *
 * `cortes` va del primero al último y cada uno es una malla cortada sobre la anterior.
 */
export function componerCortes(cortes: readonly { corte: MallaCortada; apertura: AperturaDeUnCorte }[]): Float32Array {
  const ultimo = cortes[cortes.length - 1]
  if (!ultimo) return new Float32Array(0)
  const total = ultimo.corte.lado.length
  // Lo que lleva desplazado cada vértice, sumado de corte en corte. En doble precisión y en un arreglo aparte: sumando
  // sobre las posiciones, que son de simple, el resultado de un solo corte dejaba de ser el de `abrirHerida` por el
  // último bit. Se reutiliza de una llamada a otra: mientras una herida se abre, esto corre en cada fotograma.
  if (arrastreDeLosCortes.length < 3 * total) arrastreDeLosCortes = new Float64Array(3 * total)
  const arrastre = arrastreDeLosCortes
  arrastre.fill(0, 0, 3 * total)
  let yaEstaban = 0
  for (const { corte, apertura } of cortes) {
    const n = Math.min(total, corte.lado.length)
    // Los vértices que ya estaban conservan su índice y lo que llevaban. Los que añadió este corte toman lo de los dos
    // de que salen, que van siempre antes que ellos: recorridos en orden, cada uno los encuentra ya resueltos.
    if (yaEstaban > 0) {
      const { desde, de, peso } = corte.mezcla
      for (let v = desde; v < n; v++) {
        const j = v - desde
        const a = 3 * de[2 * j]
        const b = 3 * de[2 * j + 1]
        const w = peso[j]
        arrastre[3 * v] = arrastre[a] + (arrastre[b] - arrastre[a]) * w
        arrastre[3 * v + 1] = arrastre[a + 1] + (arrastre[b + 1] - arrastre[a + 1]) * w
        arrastre[3 * v + 2] = arrastre[a + 2] + (arrastre[b + 2] - arrastre[a + 2]) * w
      }
    }
    for (let v = 0; v < n; v++) {
      const k = cuantoSeAparta(corte, v, apertura)
      if (k === 0) continue
      arrastre[3 * v] += corte.direccion[3 * v] * k
      arrastre[3 * v + 1] += corte.direccion[3 * v + 1] * k
      arrastre[3 * v + 2] += corte.direccion[3 * v + 2] * k
    }
    yaEstaban = n
  }
  const salida = Float32Array.from(ultimo.corte.posiciones)
  for (let i = 0; i < 3 * total; i++) if (arrastre[i] !== 0) salida[i] += arrastre[i]
  return salida
}

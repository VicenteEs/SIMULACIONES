/**
 * Dónde se parte un hueso: los mandos del corte, el eje largo y el plano.
 *
 * Es la mitad del corte que se puede leer desde cualquier sitio, y por eso vive
 * aparte de `osteotomia.ts`, que es la que parte la malla. La razón es de peso y
 * ya pasó una vez en este repositorio (ver `aritmeticaDelEncuadre.ts`): partir y
 * tapar necesita el triangulador de three, y el taller del atlas —que tiene que
 * conocer los límites de los mandos y describir el corte con palabras— no puede
 * importar nada que arrastre three de forma estática sin deshacer el `dynamic()`
 * de su visor. Así que **aquí no se importa `three`, ni directa ni
 * indirectamente**: el taller lo importa sin miedo, el visor lo usa para la
 * vista previa y el servidor para exportar, y los tres calculan el mismo plano
 * con las mismas cuentas.
 *
 * Que los tres calculen con la MISMA función no es un adorno: si la vista previa
 * y la exportación sacaran el eje cada una a su manera, el traumatólogo vería el
 * plano en un sitio y el archivo saldría partido en otro, y nada lo diría.
 */

export type Vector3 = [number, number, number]

/** Qué trozo es el fragmento que el residente reduce en la consola. */
export type TrozoDelHueso = 'proximal' | 'distal'

/**
 * Lo que el traumatólogo decide del corte, tal como se guarda y se envía.
 *
 * Todo en las unidades de los mandos —porcentaje y grados— y no en metros ni en
 * vectores: así lo que viaja al servidor es lo que se ve en pantalla, y el
 * plano se recalcula allí con la geometría de verdad.
 */
export interface CorteDeHueso {
  /** Identificador de la pieza en el atlas («FJ3387»). */
  pieza: string
  /** Dónde corta, en % de la longitud del hueso contada de proximal a distal. */
  posicion: number
  /** Grados entre el plano y el transversal: 0 es transversal. */
  inclinacion: number
  /**
   * Hacia qué cara sube el corte, en grados alrededor del eje largo: 0 por
   * delante, 90 por fuera, 180 por detrás, 270 por dentro (ver `ejeDelHueso`).
   */
  giro: number
  /** El trozo que se mueve en la reducción. El otro sale como hueso fijo. */
  fragmento: TrozoDelHueso
}

/**
 * Los límites de los mandos.
 *
 * Del 5 al 95 % y no del 0 al 100: en los extremos el plano roza la superficie
 * articular y deja un casquete de milímetros que no es un fragmento de nada, o
 * no corta y la exportación falla. Sesenta grados de inclinación porque más allá
 * ya no es una oblicua sino un corte casi longitudinal, que no es lo que se pidió
 * y deja dos láminas que ninguna reducción mueve con sentido.
 */
export const POSICION_MINIMA = 5
export const POSICION_MAXIMA = 95
export const INCLINACION_MAXIMA = 60

/**
 * El corte con el que nace la opción: transversal, a media diáfisis, y el
 * fragmento distal.
 *
 * Distal por omisión porque es como se reduce en quirófano casi siempre: el
 * segmento proximal queda fijado por el resto del cuerpo y lo que se tracciona y
 * se rota es el distal.
 */
export const CORTE_POR_OMISION: Omit<CorteDeHueso, 'pieza'> = {
  posicion: 50,
  inclinacion: 0,
  giro: 0,
  fragmento: 'distal',
}

/**
 * Normaliza un corte que llega de fuera: del navegador, que es un extremo HTTP,
 * o de un guion.
 *
 * `null` si no se pidió corte. Un corte pedido con valores imposibles es un
 * error y no se corrige en silencio: acercar al 95 % un 98 % escrito en un guion
 * exportaría un hueso partido donde nadie lo pidió, y el traumatólogo lo vería
 * solo al abrir el caso.
 *
 * El giro sí se lleva a 0–360: 370° y 10° son el mismo corte, y no hay error
 * posible en eso.
 */
export function normalizarCorte(valor: unknown): CorteDeHueso | null {
  if (valor === null || valor === undefined || valor === false) return null
  if (typeof valor !== 'object') throw new Error('El corte no es válido.')
  const entrada = valor as Record<string, unknown>

  const pieza = entrada.pieza
  if (typeof pieza !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(pieza)) {
    throw new Error('El corte no dice qué pieza se parte.')
  }

  const numero = (clave: string, porOmision: number): number => {
    const v = entrada[clave] ?? porOmision
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`El corte trae un valor no numérico en «${clave}».`)
    }
    return v
  }

  const posicion = numero('posicion', CORTE_POR_OMISION.posicion)
  if (posicion < POSICION_MINIMA || posicion > POSICION_MAXIMA) {
    throw new Error(
      `La posición del corte tiene que estar entre el ${POSICION_MINIMA} y el ${POSICION_MAXIMA} % del hueso.`,
    )
  }
  const inclinacion = numero('inclinacion', CORTE_POR_OMISION.inclinacion)
  if (inclinacion < 0 || inclinacion > INCLINACION_MAXIMA) {
    throw new Error(`La inclinación del corte tiene que estar entre 0 y ${INCLINACION_MAXIMA} grados.`)
  }
  const giro = ((numero('giro', CORTE_POR_OMISION.giro) % 360) + 360) % 360

  const fragmento = entrada.fragmento ?? CORTE_POR_OMISION.fragmento
  if (fragmento !== 'proximal' && fragmento !== 'distal') {
    throw new Error('El fragmento del corte tiene que ser el proximal o el distal.')
  }

  return { pieza, posicion, inclinacion, giro, fragmento }
}

// ------------------------------------------------------------------ el eje

/**
 * El eje largo de un hueso, orientado y con su marco de referencia.
 *
 * Todas las coordenadas en las del cuerpo del atlas: metros, y del mismo
 * espacio que las posiciones que se le pasaron.
 */
export interface EjeDelHueso {
  /** Centroide de la superficie. El eje pasa por aquí. */
  centro: Vector3
  /** Unitario, de proximal a distal. */
  direccion: Vector3
  /** Coordenada a lo largo de `direccion`, desde `centro`, del extremo proximal. */
  proximal: number
  /** Ídem del extremo distal. Siempre mayor que `proximal`. */
  distal: number
  /** La distancia máxima de un vértice al eje: cuánto mide de ancho, a lo sumo. */
  radio: number
  /** Unitario y perpendicular al eje: la cara desde la que se cuenta el giro, 0°. */
  delante: Vector3
  /** Unitario y perpendicular a los dos: la cara del giro de 90°. */
  fuera: Vector3
}

const resta = (a: Vector3, b: Vector3): Vector3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const punto = (a: Vector3, b: Vector3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cruz = (a: Vector3, b: Vector3): Vector3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const escalar = (a: Vector3, k: number): Vector3 => [a[0] * k, a[1] * k, a[2] * k]
const largo = (a: Vector3) => Math.hypot(a[0], a[1], a[2])
const unitario = (a: Vector3): Vector3 => {
  const l = largo(a)
  return l > 0 ? escalar(a, 1 / l) : [0, 0, 0]
}

/**
 * Saca el eje largo de un hueso de su GEOMETRÍA, no de su caja.
 *
 * ## Por qué no la caja
 *
 * `catalogo.piezas[].caja` está alineada con los ejes del cuerpo, así que su
 * lado más largo solo puede decir «vertical», «transversal» o
 * «anteroposterior». Para una tibia casi da igual, pero el fémur tiene su eje
 * anatómico a unos siete grados de la vertical, la clavícula va sesgada hacia
 * atrás y los metatarsianos bajan en diagonal. Con la caja, un corte
 * «transversal» de fémur saldría oblicuo respecto del hueso, y la inclinación que
 * se le pone encima se sumaría a un error que nadie ha pedido.
 *
 * ## Qué se calcula
 *
 * Es la dirección principal de la SUPERFICIE: la de mayor varianza de la
 * distribución de área de sus triángulos, con su segundo momento exacto
 * (∫ x·xᵀ dA = A/12 · (Σ vᵢvᵢᵀ + (Σ vᵢ)(Σ vᵢ)ᵀ) para cada triángulo). Por área y
 * no por vértices a propósito: las epífisis del atlas llevan muchos más
 * vértices que la diáfisis, y una cuenta por vértices tiraría del eje hacia
 * donde el modelador fue más minucioso, no hacia donde el hueso es más largo.
 *
 * El vector propio se busca por potencias, empezando por el lado más largo de la
 * caja de lo que se mide: así la caja sigue siendo el punto de partida y el
 * resultado es determinista —la vista previa y la exportación, con las mismas
 * posiciones, dan el mismo eje hasta el último decimal—.
 *
 * Un hueso redondo, como la rótula o un hueso del carpo, no tiene eje largo
 * claro y el que salga es el que sea: la vista previa lo enseña y el
 * traumatólogo lo ve antes de exportar.
 *
 * ## Qué es proximal
 *
 * El eje sale sin sentido y hay que dárselo. Si va más vertical que horizontal
 * (más de 30° sobre el suelo), proximal es el extremo de arriba: vale para la
 * pierna, el muslo y, en la posición anatómica del atlas, para el brazo y el
 * antebrazo colgando. Si va horizontal, proximal es el extremo más cerca del eje
 * vertical del cuerpo (x = 0, z = 0): el medial de la clavícula, la base de un
 * metatarsiano. Es una regla de sentido común y no un dato del atlas, que no
 * trae la orientación de nadie; para las costillas o la pelvis no significa
 * gran cosa, pero allí tampoco hay «fragmento distal» que valga.
 *
 * ## Las caras del giro
 *
 * `delante` es la dirección anterior del cuerpo (+z en el atlas: la cámara por
 * omisión mira el cuerpo de frente desde +z) quitándole lo que tenga a lo largo
 * del eje. Si el eje va casi de delante atrás —un metatarsiano— eso se queda en
 * nada y se toma la de arriba (+y), que en el pie es la cara dorsal.
 *
 * `fuera` es la perpendicular a las dos, girada hacia el lado de la pieza: la
 * mitad derecha del atlas está en x negativa, así que para una pieza derecha
 * «fuera» apunta a −x y para una izquierda a +x. Con eso 90° es lateral en las
 * dos piernas, y el mismo caso escrito para la izquierda no sale en espejo.
 *
 * `inicio` y `cuenta` delimitan los ÍNDICES que se miden, para poder medir una
 * pieza dentro de la malla fundida de su sistema, que es como la tiene el visor.
 * Devuelve `null` si no hay un solo triángulo con área.
 */
export function ejeDelHueso(
  posiciones: ArrayLike<number>,
  indices: ArrayLike<number>,
  inicio = 0,
  cuenta = indices.length - inicio,
): EjeDelHueso | null {
  const fin = inicio + cuenta - (cuenta % 3)
  const vertices = Math.floor(posiciones.length / 3)
  const leer = (i: number): Vector3 => [
    posiciones[i * 3],
    posiciones[i * 3 + 1],
    posiciones[i * 3 + 2],
  ]

  let area = 0
  const primero: Vector3 = [0, 0, 0]
  // Segundo momento, simétrico: xx, xy, xz, yy, yz, zz.
  const segundo = [0, 0, 0, 0, 0, 0]
  const min: Vector3 = [Infinity, Infinity, Infinity]
  const max: Vector3 = [-Infinity, -Infinity, -Infinity]

  for (let t = inicio; t < fin; t += 3) {
    const ia = indices[t]
    const ib = indices[t + 1]
    const ic = indices[t + 2]
    if (ia >= vertices || ib >= vertices || ic >= vertices) continue
    const a = leer(ia)
    const b = leer(ib)
    const c = leer(ic)
    const doble = largo(cruz(resta(b, a), resta(c, a)))
    if (!(doble > 0)) continue
    const at = doble / 2
    area += at

    const suma: Vector3 = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]]
    for (let e = 0; e < 3; e += 1) primero[e] += (at * suma[e]) / 3

    const momento = (p: number, q: number) =>
      a[p] * a[q] + b[p] * b[q] + c[p] * c[q] + suma[p] * suma[q]
    segundo[0] += (at / 12) * momento(0, 0)
    segundo[1] += (at / 12) * momento(0, 1)
    segundo[2] += (at / 12) * momento(0, 2)
    segundo[3] += (at / 12) * momento(1, 1)
    segundo[4] += (at / 12) * momento(1, 2)
    segundo[5] += (at / 12) * momento(2, 2)

    for (const v of [a, b, c]) {
      for (let e = 0; e < 3; e += 1) {
        if (v[e] < min[e]) min[e] = v[e]
        if (v[e] > max[e]) max[e] = v[e]
      }
    }
  }
  if (!(area > 0)) return null

  const centro = escalar(primero, 1 / area)
  const cov = [
    segundo[0] / area - centro[0] * centro[0],
    segundo[1] / area - centro[0] * centro[1],
    segundo[2] / area - centro[0] * centro[2],
    segundo[3] / area - centro[1] * centro[1],
    segundo[4] / area - centro[1] * centro[2],
    segundo[5] / area - centro[2] * centro[2],
  ]
  const aplicar = (v: Vector3): Vector3 => [
    cov[0] * v[0] + cov[1] * v[1] + cov[2] * v[2],
    cov[1] * v[0] + cov[3] * v[1] + cov[4] * v[2],
    cov[2] * v[0] + cov[4] * v[1] + cov[5] * v[2],
  ]

  const lados = resta(max, min)
  const ladoMayor = lados.indexOf(Math.max(...lados))
  let direccion: Vector3 = [0, 0, 0]
  direccion[ladoMayor] = 1
  // Cien pasos sobran para un hueso largo, donde el primer valor propio dobla
  // con creces al segundo y converge en una decena. Si no converge es que el
  // hueso es redondo y cualquier dirección vale lo mismo.
  for (let paso = 0; paso < 100; paso += 1) {
    const siguiente = unitario(aplicar(direccion))
    if (largo(siguiente) === 0) break
    const cambio = largo(resta(siguiente, direccion))
    direccion = siguiente
    if (cambio < 1e-12) break
  }

  let proximal = Infinity
  let distal = -Infinity
  let radio = 0
  for (let t = inicio; t < fin; t += 1) {
    const i = indices[t]
    if (i >= vertices) continue
    const rel = resta(leer(i), centro)
    const s = punto(rel, direccion)
    if (s < proximal) proximal = s
    if (s > distal) distal = s
    const r = largo(resta(rel, escalar(direccion, s)))
    if (r > radio) radio = r
  }

  const extremoMenor = [0, 1, 2].map((e) => centro[e] + direccion[e] * proximal) as Vector3
  const extremoMayor = [0, 1, 2].map((e) => centro[e] + direccion[e] * distal) as Vector3
  const mayorEsProximal =
    Math.abs(direccion[1]) >= 0.5
      ? extremoMayor[1] > extremoMenor[1]
      : Math.hypot(extremoMayor[0], extremoMayor[2]) < Math.hypot(extremoMenor[0], extremoMenor[2])
  if (mayorEsProximal) {
    direccion = escalar(direccion, -1)
    ;[proximal, distal] = [-distal, -proximal]
  }

  const quitarEje = (v: Vector3) => resta(v, escalar(direccion, punto(v, direccion)))
  let delante = quitarEje([0, 0, 1])
  if (largo(delante) < 0.3) delante = quitarEje([0, 1, 0])
  delante = unitario(delante)
  let fuera = unitario(cruz(direccion, delante))
  const lado = centro[0] < 0 ? -1 : 1
  if (fuera[0] * lado < 0) fuera = escalar(fuera, -1)

  return { centro, direccion, proximal, distal, radio, delante, fuera }
}

/** Un plano: un punto suyo y su normal unitaria. */
export interface PlanoDeCorte {
  punto: Vector3
  /** Apunta hacia el lado DISTAL: lo que queda hacia la normal es el trozo distal. */
  normal: Vector3
}

/**
 * El plano de un corte sobre un eje ya medido.
 *
 * Pasa por el eje a `posicion` % de la longitud, contada de proximal a distal.
 * Con inclinación 0 su normal es el eje: transversal. Con inclinación θ la
 * normal se tumba θ grados hacia la cara que dice el giro, y eso hace que el
 * plano quede MÁS PROXIMAL por esa cara: en un punto de esa cara a distancia r
 * del eje, el plano corta a r·tan θ por encima del centro del corte. Es la forma
 * en que se nombra una oblicua en clínica («de proximal-lateral a
 * distal-medial»), y la que devuelve `describirCorte`.
 *
 * La normal apunta al lado distal (su componente sobre el eje es cos θ, siempre
 * positiva con θ ≤ 60°), de modo que quien parta la malla sabe sin más cuentas
 * cuál de los dos trozos es cuál.
 */
export function planoDelCorte(
  eje: EjeDelHueso,
  corte: Pick<CorteDeHueso, 'posicion' | 'inclinacion' | 'giro'>,
): PlanoDeCorte {
  const s = eje.proximal + (corte.posicion / 100) * (eje.distal - eje.proximal)
  const puntoDelCorte = [0, 1, 2].map((e) => eje.centro[e] + eje.direccion[e] * s) as Vector3
  const theta = (corte.inclinacion * Math.PI) / 180
  const phi = (corte.giro * Math.PI) / 180
  const cara = [0, 1, 2].map(
    (e) => eje.delante[e] * Math.cos(phi) + eje.fuera[e] * Math.sin(phi),
  ) as Vector3
  const normal = unitario(
    [0, 1, 2].map(
      (e) => eje.direccion[e] * Math.cos(theta) + cara[e] * Math.sin(theta),
    ) as Vector3,
  )
  return { punto: puntoDelCorte, normal }
}

/**
 * Lo contrario de `planoDelCorte`: de un plano cualquiera —el que se trazó con
 * una línea en el taller (D-130)— a la posición, la inclinación y el giro con
 * los que la exportación nombra un corte (D-137).
 *
 * Existe para que el corte sea UNO: el que se ve en la ficha y el que se opera
 * en el simulador. Antes había que trazarlo en el taller y, para exportarlo,
 * volver a buscarlo a ojo con tres deslizadores.
 *
 * No todo plano tiene nombre aquí. Uno casi paralelo al eje del hueso —una
 * fractura longitudinal— pasa de los 60° de inclinación que admite la
 * exportación, y uno que cruza el eje fuera del 5–95 % cae en una epífisis.
 * Los dos se acotan al límite y se dice en `acotado`, para que quien exporta
 * sepa que lo que sale no es exactamente lo que trazó.
 */
export function corteDesdeElPlano(
  eje: EjeDelHueso,
  plano: PlanoDeCorte,
): { posicion: number; inclinacion: number; giro: number; acotado: boolean } {
  const punto = (a: Vector3, b: Vector3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  let normal = unitario(plano.normal)
  // Hacia distal, como la de `planoDelCorte`: un plano no tiene cara, y la
  // normal que llegue puede mirar a cualquiera de los dos lados.
  if (punto(normal, eje.direccion) < 0) normal = [-normal[0], -normal[1], -normal[2]]

  const coseno = Math.min(1, punto(normal, eje.direccion))
  const inclinacionExacta = (Math.acos(coseno) * 180) / Math.PI
  // Dónde cruza el plano al eje: el `s` de `centro + direccion·s` que cae en él.
  const desdeElCentro: Vector3 = [
    plano.punto[0] - eje.centro[0],
    plano.punto[1] - eje.centro[1],
    plano.punto[2] - eje.centro[2],
  ]
  const s = coseno > 1e-6 ? punto(desdeElCentro, normal) / coseno : 0
  const posicionExacta = ((s - eje.proximal) / (eje.distal - eje.proximal)) * 100
  // El giro es hacia qué cara se tumba la normal. Con el corte transversal no
  // se tumba hacia ninguna y el ángulo no significa nada: se deja en 0.
  const giroExacto =
    inclinacionExacta < 0.05
      ? 0
      : (Math.atan2(punto(normal, eje.fuera), punto(normal, eje.delante)) * 180) / Math.PI

  const posicion = Math.min(POSICION_MAXIMA, Math.max(POSICION_MINIMA, posicionExacta))
  const inclinacion = Math.min(INCLINACION_MAXIMA, inclinacionExacta)
  return {
    posicion: Math.round(posicion * 10) / 10,
    inclinacion: Math.round(inclinacion * 10) / 10,
    giro: Math.round(((giroExacto % 360) + 360) % 360),
    acotado: posicion !== posicionExacta || inclinacion !== inclinacionExacta,
  }
}

/** Las ocho caras con nombre, cada 45° desde delante y hacia fuera. */
const CARAS = [
  'anterior',
  'anterolateral',
  'lateral',
  'posterolateral',
  'posterior',
  'posteromedial',
  'medial',
  'anteromedial',
]

/** El nombre de la cara más cercana a un giro. */
export function caraDelGiro(giro: number): string {
  const normalizado = ((giro % 360) + 360) % 360
  return CARAS[Math.round(normalizado / 45) % 8]
}

/**
 * El corte dicho con palabras, para el taller y para las notas del modelo.
 *
 * Por debajo de medio grado se llama transversal: los mandos van de grado en
 * grado y un 0,3 que llegue de un guion no es una oblicua que nadie vaya a ver.
 */
export function describirCorte(corte: Omit<CorteDeHueso, 'pieza'>): string {
  const donde = `a un ${Math.round(corte.posicion)} % de su longitud, contado desde proximal`
  const forma =
    corte.inclinacion < 0.5
      ? 'transversal'
      : `oblicuo de ${Math.round(corte.inclinacion)}°, más proximal por la cara ${caraDelGiro(corte.giro)}`
  return `corte ${forma}, ${donde}; se mueve el fragmento ${corte.fragmento}`
}

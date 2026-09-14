import { ShapeUtils, Vector2 } from 'three'

/**
 * Parte una malla por un plano, con un corte limpio y tapado.
 *
 * Lo pidió el dueño con estas palabras: «quiero poder por ejemplo quebrar el
 * hueso o la malla que tengo», y al preguntarle eligió «un corte limpio sirve».
 * Hasta aquí, para tener un fragmento que reducir en la consola, el hueso tenía
 * que llegar ya partido de Blender: era la única pieza de un caso que no se
 * podía armar desde la plataforma.
 *
 * Tres decisiones, y las tres son las que se ven al abrir el archivo:
 *
 *  1. **Los triángulos que cruzan el plano se parten por el plano.** Quedarse
 *     con los triángulos enteros de cada lado deja el borde en dientes de
 *     sierra, con huecos entre los dos trozos del tamaño de un triángulo del
 *     atlas —en la diáfisis de la tibia, más de un centímetro—, y el residente
 *     no podría encajar un fragmento contra el otro.
 *  2. **Se tapa la superficie de corte en los dos trozos.** El hueso del atlas
 *     es una cáscara: sin tapa, al separar el fragmento en la consola se ve
 *     hueco por dentro, y se ve justo donde el residente está mirando.
 *  3. **Cada trozo sale cerrado**: cada arista la comparten dos triángulos, en
 *     sentidos opuestos, y la tapa mira hacia fuera de su trozo. Es lo que
 *     prueba `tests/unit/osteotomia.test.ts`, con volúmenes: una malla que no
 *     cierra no tiene volumen que sumar.
 *
 * Aquí se importa three, pero solo por su triangulador (`ShapeUtils`, que es
 * Earcut): el taller del atlas no puede importar este archivo de forma estática.
 * Lo que el taller necesita del corte —los límites, el eje y las palabras— está
 * en `planoDeCorte.ts`, que no toca three.
 */

/** Una malla indexada con normales, en la forma en que viaja el atlas. */
export interface MallaIndexada {
  posiciones: Float32Array
  /** Flotantes, o enteros de 16 bits normalizados como en los paquetes del atlas. */
  normales: Float32Array | Int16Array
  indices: Uint32Array
}

export interface PlanoDeLaMalla {
  punto: readonly [number, number, number]
  /** No hace falta que llegue unitaria; no puede ser nula. */
  normal: readonly [number, number, number]
}

export interface ResultadoDelCorte {
  /** Lo que queda hacia donde apunta la normal del plano. */
  haciaLaNormal: MallaIndexada
  /** Lo que queda al otro lado. */
  contraLaNormal: MallaIndexada
  /** Cuántos contornos de corte cerraron y se taparon, y cuántos no. */
  lazos: { tapados: number; abiertos: number }
  /** Lo que no salió como se pidió, dicho para quien lo va a leer. Vacío si nada. */
  avisos: string[]
}

/**
 * Cuánto se aparta el plano de un vértice que cae encima: una micra.
 *
 * Un vértice justo en el plano no es de ningún lado, y un triángulo con uno así
 * no se sabe si cruza o no: las cuentas de interpolación dividen por cero, o
 * sacan un punto de corte idéntico al vértice que deja un triángulo sin área y
 * un contorno con dos puntos iguales que el triangulador descarta. En vez de
 * tratar ese caso aparte en cada sitio, se mueve el plano una micra —nadie
 * reduce una fractura con esa precisión, y los paquetes guardan las posiciones
 * en flotantes de 32 bits, que a medio metro del origen ya redondean a unas
 * centésimas de micra— hasta que ningún vértice quede encima. Con eso todo
 * vértice es de un lado, y todo lo demás es el caso general.
 */
const HOLGURA = 1e-6

/**
 * A qué distancia dos vértices se consideran el mismo: una décima de micra.
 *
 * Soldar por igualdad exacta bastaba para el atlas, que repite las costuras bit
 * a bit, y no bastaba para una malla de three o de Blender: el cilindro de three
 * cierra su costura con `sin(2π)`, que no es cero sino −2,4·10⁻¹⁶, y ese vértice
 * y el del ángulo cero ya no casaban; el contorno del corte quedaba abierto por
 * la costura y el trozo, sin tapa. Una décima de micra está muy por encima de
 * ese ruido y muy por debajo de la distancia entre dos vértices de verdad del
 * atlas, que se mide en milímetros. Y es menor que la mitad de `HOLGURA`, que es
 * lo que garantiza que dos vértices soldados caigan siempre del mismo lado del
 * plano.
 */
const SOLDADURA = 1e-7

/** Cuántas veces se intenta apartar el plano antes de rendirse. */
const INTENTOS = 16

type V3 = [number, number, number]

/**
 * Parte `malla` por `plano`.
 *
 * Lanza un error, con palabras, si el plano no la corta: un «corte» que deja
 * todo de un lado no produce dos trozos, y exportar uno vacío sería peor que no
 * exportar.
 *
 * Si la malla no es cerrada, corta igual: los contornos que cierran se tapan, y
 * de los que no cierran se avisa en `avisos` (la malla queda abierta por ahí,
 * igual que ya lo estaba antes de cortarla).
 *
 * ## Cómo reconoce los vértices repetidos
 *
 * Las piezas del atlas repiten vértices en la misma posición con normales
 * distintas —las costuras donde la superficie cambia de dirección—: la tibia
 * derecha trae 334 vértices en 319 posiciones. Por índice, esa malla tiene
 * cincuenta aristas con un solo triángulo y parece abierta; por posición está
 * cerrada. El corte tiene que mirarla por posición, o partiría cada costura en
 * dos puntos de corte distintos y el contorno no cerraría nunca.
 *
 * Por eso cada punto de corte se identifica por la arista GEOMÉTRICA —el par de
 * posiciones— y su posición se calcula desde esas dos posiciones en un orden
 * fijo, de modo que las dos copias de una costura dan el mismo punto bit a bit.
 * La normal, en cambio, se interpola de los dos vértices de verdad: la costura
 * sigue siendo costura después del corte.
 */
export function partirMalla(malla: MallaIndexada, plano: PlanoDeLaMalla): ResultadoDelCorte {
  const { posiciones, normales, indices } = malla
  const vertices = Math.floor(posiciones.length / 3)
  const completos = indices.length - (indices.length % 3)

  for (let k = 0; k < completos; k += 1) {
    // Se rechaza en vez de saltar el triángulo, a diferencia del recorte de la
    // piel: allí quitar uno de más es un borde algo más corto; aquí es un
    // agujero en un trozo que se promete cerrado.
    if (indices[k] >= vertices) {
      throw new Error('La malla trae índices que apuntan fuera de sus vértices; no se puede partir.')
    }
  }

  const largoNormal = Math.hypot(plano.normal[0], plano.normal[1], plano.normal[2])
  if (!(largoNormal > 0)) throw new Error('El plano de corte no tiene dirección.')
  const n: V3 = [
    plano.normal[0] / largoNormal,
    plano.normal[1] / largoNormal,
    plano.normal[2] / largoNormal,
  ]

  // --- vértices soldados por posición -------------------------------------
  const canonico = soldar(posiciones, vertices)
  const representante: number[] = []
  for (let v = 0; v < vertices; v += 1) {
    if (representante[canonico[v]] === undefined) representante[canonico[v]] = v
  }

  // --- distancias al plano, apartándolo de los vértices que caen encima ----
  const distancia = new Float64Array(vertices)
  const base = n[0] * plano.punto[0] + n[1] * plano.punto[1] + n[2] * plano.punto[2]
  let desplazado = 0
  for (let intento = 0; ; intento += 1) {
    let encima = false
    for (let v = 0; v < vertices; v += 1) {
      const d =
        n[0] * posiciones[v * 3] + n[1] * posiciones[v * 3 + 1] + n[2] * posiciones[v * 3 + 2] -
        (base + desplazado)
      distancia[v] = d
      if (Math.abs(d) < HOLGURA) encima = true
    }
    if (!encima) break
    if (intento >= INTENTOS) {
      throw new Error('No se encontró dónde cortar sin rozar un vértice; mueva un poco el corte.')
    }
    // 2, −4, 6, −8… micras: alterna de lado para quedarse lo más cerca posible
    // de donde se pidió.
    desplazado = (intento % 2 === 0 ? 1 : -1) * 2 * HOLGURA * (intento + 1)
  }

  // --- partir los triángulos ----------------------------------------------
  const esInt16 = normales instanceof Int16Array
  const leerNormal = (v: number): V3 => {
    const x = normales[v * 3]
    const y = normales[v * 3 + 1]
    const z = normales[v * 3 + 2]
    // La regla de glTF para un entero normalizado con signo: c / 32767, y el
    // −32768 se queda en −1.
    return esInt16
      ? [Math.max(x / 32767, -1), Math.max(y / 32767, -1), Math.max(z / 32767, -1)]
      : [x, y, z]
  }

  const positivo = new TrozoEnObra(vertices, esInt16)
  const negativo = new TrozoEnObra(vertices, esInt16)

  /** Posición del punto de corte de una arista geométrica, idéntica en sus copias. */
  const puntosDeCorte = new Map<string, V3>()
  const claveGeometrica = (a: number, b: number) => {
    const ca = canonico[a]
    const cb = canonico[b]
    return ca < cb ? `${ca}:${cb}` : `${cb}:${ca}`
  }
  const posicionDeCorte = (a: number, b: number): V3 => {
    const clave = claveGeometrica(a, b)
    const hecha = puntosDeCorte.get(clave)
    if (hecha) return hecha
    const ca = canonico[a]
    const cb = canonico[b]
    const lo = representante[Math.min(ca, cb)]
    const hi = representante[Math.max(ca, cb)]
    const t = distancia[lo] / (distancia[lo] - distancia[hi])
    const p: V3 = [
      posiciones[lo * 3] + t * (posiciones[hi * 3] - posiciones[lo * 3]),
      posiciones[lo * 3 + 1] + t * (posiciones[hi * 3 + 1] - posiciones[lo * 3 + 1]),
      posiciones[lo * 3 + 2] + t * (posiciones[hi * 3 + 2] - posiciones[lo * 3 + 2]),
    ]
    puntosDeCorte.set(clave, p)
    return p
  }
  const normalDeCorte = (a: number, b: number): V3 => {
    const t = distancia[a] / (distancia[a] - distancia[b])
    const na = leerNormal(a)
    const nb = leerNormal(b)
    const mezcla: V3 = [
      na[0] + t * (nb[0] - na[0]),
      na[1] + t * (nb[1] - na[1]),
      na[2] + t * (nb[2] - na[2]),
    ]
    const l = Math.hypot(mezcla[0], mezcla[1], mezcla[2])
    // Dos normales opuestas se anulan a medio camino; entonces vale cualquiera
    // de las dos, y la del primero es tan buena como otra.
    return l > 1e-9 ? [mezcla[0] / l, mezcla[1] / l, mezcla[2] / l] : na
  }

  /** Los segmentos del corte, de punto de corte a punto de corte: uno por triángulo que cruza. */
  const segmentos: [string, string][] = []
  let soloPositivos = true
  let soloNegativos = true

  for (let t = 0; t < completos; t += 3) {
    const tri = [indices[t], indices[t + 1], indices[t + 2]]
    const lado = tri.map((v) => distancia[v] > 0)
    const positivos = lado.filter(Boolean).length
    if (positivos === 3) {
      soloNegativos = false
      positivo.triangulo(tri[0], tri[1], tri[2], posiciones, normales)
      continue
    }
    if (positivos === 0) {
      soloPositivos = false
      negativo.triangulo(tri[0], tri[1], tri[2], posiciones, normales)
      continue
    }
    soloPositivos = false
    soloNegativos = false

    // El vértice que se queda solo en su lado va primero, sin romper el orden
    // de giro: A, B, C siguen siendo el triángulo de antes.
    const solo = positivos === 1 ? lado.indexOf(true) : lado.indexOf(false)
    const A = tri[solo]
    const B = tri[(solo + 1) % 3]
    const C = tri[(solo + 2) % 3]
    const ladoDeA = positivos === 1 ? positivo : negativo
    const ladoDeBC = positivos === 1 ? negativo : positivo

    const P = claveGeometrica(A, B)
    const Q = claveGeometrica(A, C)
    const pP = posicionDeCorte(A, B)
    const pQ = posicionDeCorte(A, C)

    for (const destino of [ladoDeA, ladoDeBC]) {
      destino.puntoDeCorte(`${Math.min(A, B)}_${Math.max(A, B)}`, pP, normalDeCorte(A, B))
      destino.puntoDeCorte(`${Math.min(A, C)}_${Math.max(A, C)}`, pQ, normalDeCorte(A, C))
    }
    const iP = (lado: TrozoEnObra) => lado.corte(`${Math.min(A, B)}_${Math.max(A, B)}`)
    const iQ = (lado: TrozoEnObra) => lado.corte(`${Math.min(A, C)}_${Math.max(A, C)}`)

    // Lado de A: el triángulo A → P → Q.
    ladoDeA.indicesDirectos(ladoDeA.original(A, posiciones, normales), iP(ladoDeA), iQ(ladoDeA))
    // Lado de B y C: el cuadrilátero P → B → C → Q, en dos triángulos. Es
    // convexo siempre —es un triángulo menos una esquina—, así que cualquier
    // diagonal vale.
    const b = ladoDeBC.original(B, posiciones, normales)
    const c = ladoDeBC.original(C, posiciones, normales)
    ladoDeBC.indicesDirectos(iP(ladoDeBC), b, c)
    ladoDeBC.indicesDirectos(iP(ladoDeBC), c, iQ(ladoDeBC))

    segmentos.push([P, Q])
  }

  // Sin triángulos que crucen pero con los dos lados llenos no es un error: es
  // una malla de varias piezas sueltas con el plano entre ellas, y cada trozo
  // sale cerrado sin necesidad de tapa.
  if (soloPositivos || soloNegativos) {
    throw new Error(
      'El plano no corta la malla: queda entera a un lado. Mueva el corte hacia dentro del hueso.',
    )
  }

  // --- encadenar los contornos --------------------------------------------
  const { cerrados, abiertos } = encadenar(segmentos)

  // --- tapar --------------------------------------------------------------
  const tapa = triangularTapa(cerrados, puntosDeCorte, n)
  const avisos: string[] = []

  for (const [lado, sentido] of [
    [negativo, 1],
    [positivo, -1],
  ] as const) {
    // La tapa del lado negativo mira hacia la normal, que es su fuera; la del
    // positivo, al revés. La normal de sus vértices es la del plano, sin
    // suavizar con la cáscara: el borde del corte es una arista viva, y
    // promediarla haría que la tapa pareciera abombada.
    const normalDeTapa: V3 = [n[0] * sentido, n[1] * sentido, n[2] * sentido]
    for (const [a, b, c] of tapa.triangulos) {
      const ia = lado.tapa(a, puntosDeCorte.get(a)!, normalDeTapa)
      const ib = lado.tapa(b, puntosDeCorte.get(b)!, normalDeTapa)
      const ic = lado.tapa(c, puntosDeCorte.get(c)!, normalDeTapa)
      // `triangularTapa` los devuelve mirando hacia +n.
      if (sentido === 1) lado.indicesDirectos(ia, ib, ic)
      else lado.indicesDirectos(ia, ic, ib)
    }
  }

  const tapados = cerrados.length - tapa.incompletos
  if (abiertos > 0) {
    avisos.push(
      abiertos === 1
        ? 'Un borde del corte no cierra, porque la malla no es cerrada por ahí: ese contorno no se tapó y el hueso partido se verá hueco por esa parte.'
        : `${abiertos} bordes del corte no cierran, porque la malla no es cerrada por ahí: esos contornos no se taparon y el hueso partido se verá hueco por esas partes.`,
    )
  }
  if (tapa.incompletos > 0) {
    avisos.push(
      'La tapa de una superficie de corte quedó incompleta: el contorno se cruza consigo mismo y el triangulador no pudo cubrirlo entero.',
    )
  }

  return {
    haciaLaNormal: positivo.malla(),
    contraLaNormal: negativo.malla(),
    lazos: { tapados, abiertos },
    avisos,
  }
}

/**
 * Los vértices y triángulos de uno de los dos trozos, mientras se construye.
 *
 * Cada trozo guarda tres clases de vértice por separado, y la separación es lo
 * que mantiene las normales en su sitio: los originales —copiados sin tocar—,
 * los puntos de corte de la cáscara —con la normal interpolada de su arista— y
 * los de la tapa —en la misma posición que los de la cáscara, pero con la
 * normal del plano—.
 */
class TrozoEnObra {
  private readonly posiciones: number[] = []
  private readonly normales: number[] = []
  private readonly indices: number[] = []
  private readonly deOriginal: Int32Array
  private readonly deCorte = new Map<string, number>()
  private readonly deTapa = new Map<string, number>()

  constructor(
    vertices: number,
    private readonly esInt16: boolean,
  ) {
    this.deOriginal = new Int32Array(vertices).fill(-1)
  }

  /** Un vértice original, copiado la primera vez que se usa. */
  original(v: number, posiciones: Float32Array, normales: Float32Array | Int16Array): number {
    const hecho = this.deOriginal[v]
    if (hecho >= 0) return hecho
    const nuevo = this.posiciones.length / 3
    this.posiciones.push(posiciones[v * 3], posiciones[v * 3 + 1], posiciones[v * 3 + 2])
    // Tal cual, sin pasar por flotante: un vértice que no se cortó tiene que
    // salir con los mismos bytes con los que entró.
    this.normales.push(normales[v * 3], normales[v * 3 + 1], normales[v * 3 + 2])
    this.deOriginal[v] = nuevo
    return nuevo
  }

  triangulo(
    a: number,
    b: number,
    c: number,
    posiciones: Float32Array,
    normales: Float32Array | Int16Array,
  ) {
    this.indices.push(
      this.original(a, posiciones, normales),
      this.original(b, posiciones, normales),
      this.original(c, posiciones, normales),
    )
  }

  private nuevoVertice(p: V3, normal: V3): number {
    const nuevo = this.posiciones.length / 3
    this.posiciones.push(p[0], p[1], p[2])
    this.normales.push(...this.cuantizar(normal))
    return nuevo
  }

  /**
   * Las normales interpoladas vuelven al tipo en que llegaron. Si llegaron en
   * enteros de 16 bits se interpolan en flotante —interpolar los enteros
   * directamente acorta la normal y la luz se apaga en el borde del corte— y se
   * vuelven a cuantizar, porque `escribirGlb` decide si las declara
   * normalizadas mirando el tipo del array.
   */
  private cuantizar(normal: V3): V3 {
    if (!this.esInt16) return normal
    return normal.map((x) => Math.round(Math.min(1, Math.max(-1, x)) * 32767)) as V3
  }

  /** Registra el punto de corte de una arista de verdad (índices originales). */
  puntoDeCorte(clave: string, p: V3, normal: V3) {
    if (this.deCorte.has(clave)) return
    this.deCorte.set(clave, this.nuevoVertice(p, normal))
  }

  corte(clave: string): number {
    return this.deCorte.get(clave)!
  }

  /** El vértice de la tapa en un punto de corte geométrico. */
  tapa(clave: string, p: V3, normal: V3): number {
    const hecho = this.deTapa.get(clave)
    if (hecho !== undefined) return hecho
    const nuevo = this.nuevoVertice(p, normal)
    this.deTapa.set(clave, nuevo)
    return nuevo
  }

  indicesDirectos(a: number, b: number, c: number) {
    this.indices.push(a, b, c)
  }

  malla(): MallaIndexada {
    return {
      posiciones: new Float32Array(this.posiciones),
      normales: this.esInt16 ? new Int16Array(this.normales) : new Float32Array(this.normales),
      indices: new Uint32Array(this.indices),
    }
  }
}

/**
 * Encadena los segmentos del corte en contornos.
 *
 * En una malla cerrada y bien hecha cada punto de corte es el extremo de
 * exactamente dos segmentos, y los contornos cierran solos. En una malla abierta
 * hay puntos con uno solo: esa cadena se cuenta como abierta y no se tapa. Las
 * cadenas abiertas se recorren desde uno de sus extremos, para no contar la
 * misma partida en dos.
 *
 * Sin sentido de recorrido a propósito. Con el sentido de los bordes, un solo
 * triángulo con el giro al revés —cosa que en una malla de Blender pasa— rompía
 * la cadena en ese punto y el contorno entero se quedaba sin tapa. La orientación
 * de la tapa no depende de esto: la decide `triangularTapa` por geometría.
 *
 * Si un punto es extremo de cuatro segmentos —un vértice donde se tocan dos
 * superficies, que el atlas no trae pero una malla de Blender puede traer—, se
 * sigue por cualquiera de los libres: los contornos siguen cerrando, solo que
 * cómo se reparten entre ellos es arbitrario.
 */
function encadenar(segmentos: [string, string][]): {
  cerrados: string[][]
  abiertos: number
} {
  const deCadaPunto = new Map<string, number[]>()
  segmentos.forEach(([a, b], i) => {
    for (const p of [a, b]) {
      const lista = deCadaPunto.get(p)
      if (lista) lista.push(i)
      else deCadaPunto.set(p, [i])
    }
  })

  const usado = new Uint8Array(segmentos.length)
  const siguienteLibre = (punto: string): number => {
    for (const i of deCadaPunto.get(punto) ?? []) if (!usado[i]) return i
    return -1
  }
  const otroExtremo = (i: number, punto: string) =>
    segmentos[i][0] === punto ? segmentos[i][1] : segmentos[i][0]

  const cerrados: string[][] = []
  let abiertos = 0
  // Primero los extremos sueltos, que son el principio de una cadena abierta.
  const principios = [...deCadaPunto.entries()]
    .filter(([, lista]) => lista.length % 2 === 1)
    .map(([punto]) => punto)
  const recorrer = (inicio: string, primero: number) => {
    usado[primero] = 1
    const lazo = [inicio]
    let actual = otroExtremo(primero, inicio)
    for (;;) {
      if (actual === inicio) {
        if (lazo.length >= 3) cerrados.push(lazo)
        else abiertos += 1
        return
      }
      const i = siguienteLibre(actual)
      if (i < 0) {
        abiertos += 1
        return
      }
      usado[i] = 1
      lazo.push(actual)
      actual = otroExtremo(i, actual)
    }
  }
  for (const punto of principios) {
    const i = siguienteLibre(punto)
    if (i >= 0) recorrer(punto, i)
  }
  segmentos.forEach(([a], i) => {
    if (!usado[i]) recorrer(a, i)
  })
  return { cerrados, abiertos }
}

/**
 * Triangula los contornos cerrados de un corte, con sus agujeros.
 *
 * Una sección de hueso puede ser un anillo —una cortical con su canal medular,
 * si la malla lo trae— o varias islas —el corte que pasa a la vez por dos
 * cóndilos—, así que primero se decide quién está dentro de quién: un contorno
 * dentro de un número impar de otros es un agujero del más pequeño que lo
 * contiene; dentro de un número par, es un contorno exterior con sus propios
 * agujeros. Eso es lo que Earcut necesita, y lo que `ShapeUtils` le pasa.
 *
 * Devuelve los triángulos en claves de punto de corte, mirando TODOS hacia +n,
 * decidido por su área con signo y no por el orden en que los entrega Earcut,
 * que no se compromete a ninguno.
 *
 * ## Los puntos alineados
 *
 * Earcut quita de un contorno los puntos que caen exactamente en la recta de sus
 * dos vecinos (`filterPoints`, con área exactamente cero). Para dibujar un
 * polígono da igual; para cerrar una malla, no: el punto quitado sigue siendo un
 * vértice de la cáscara, y la tapa, sin él, deja una arista de la cáscara sin
 * pareja —una grieta de anchura cero que rompe el trozo cerrado—. No es un caso
 * de laboratorio: una caja cortada por la mitad deja tres puntos alineados en
 * cada cara, porque la diagonal de la cara también se corta. Así que después de
 * triangular se busca cada arista de la tapa que salte puntos no usados de su
 * contorno y se abre su triángulo en abanico por ellos, que es válido porque
 * esos puntos están en la propia arista.
 */
function triangularTapa(
  lazos: string[][],
  puntos: Map<string, V3>,
  n: V3,
): { triangulos: [string, string, string][]; incompletos: number } {
  // Una base del plano con e1 × e2 = n: un polígono con área positiva en ella
  // mira hacia +n.
  const auxiliar: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const e1 = normalizar(cruzar(n, auxiliar))
  const e2 = cruzar(n, e1)
  const plano2D = (clave: string) => {
    const p = puntos.get(clave)!
    return new Vector2(
      p[0] * e1[0] + p[1] * e1[1] + p[2] * e1[2],
      p[0] * e2[0] + p[1] * e2[1] + p[2] * e2[2],
    )
  }

  const contornos = lazos
    .map((claves) => {
      const pts = claves.map(plano2D)
      return { claves, pts, area: areaConSigno(pts) }
    })
    .filter((c) => Math.abs(c.area) > 0)

  // Profundidad de anidamiento: cuántos contornos mayores contienen a cada uno.
  const profundidad = contornos.map((c, i) =>
    contornos.filter(
      (otro, j) =>
        j !== i && Math.abs(otro.area) > Math.abs(c.area) && dentroDelPoligono(c.pts[0], otro.pts),
    ).length,
  )
  const hijos = new Map<number, number[]>()
  contornos.forEach((c, i) => {
    if (profundidad[i] % 2 === 0) return
    let padre = -1
    contornos.forEach((otro, j) => {
      if (j === i || profundidad[j] !== profundidad[i] - 1) return
      if (!(Math.abs(otro.area) > Math.abs(c.area)) || !dentroDelPoligono(c.pts[0], otro.pts)) return
      if (padre < 0 || Math.abs(otro.area) < Math.abs(contornos[padre].area)) padre = j
    })
    if (padre >= 0) hijos.set(padre, [...(hijos.get(padre) ?? []), i])
  })

  const triangulos: [string, string, string][] = []
  let incompletos = 0

  contornos.forEach((exterior, i) => {
    if (profundidad[i] % 2 !== 0) return
    const agujeros = (hijos.get(i) ?? []).map((j) => contornos[j])
    const anillos = [exterior, ...agujeros]
    const claves = anillos.flatMap((a) => a.claves)
    // Copias: `triangulateShape` quita el último punto si repite el primero, y
    // lo hace sobre el array que recibe.
    const caras = ShapeUtils.triangulateShape(
      exterior.pts.map((p) => p.clone()),
      agujeros.map((a) => a.pts.map((p) => p.clone())),
    )

    // Dónde empieza cada anillo en la lista plana, para saber qué es vecino de
    // qué al reparar los puntos alineados.
    const inicios: number[] = []
    let acumulado = 0
    for (const anillo of anillos) {
      inicios.push(acumulado)
      acumulado += anillo.claves.length
    }
    const anilloDe = (k: number) => {
      let a = inicios.length - 1
      while (inicios[a] > k) a -= 1
      return a
    }

    const usado = new Uint8Array(claves.length)
    for (const cara of caras) for (const k of cara) usado[k] = 1

    let lista: number[][] = caras.map((c) => [...c])
    if (usado.some((u) => !u)) lista = abrirEnAbanico(lista, usado, anillos, inicios, anilloDe)

    if (!cubreElContorno(lista, anillos, inicios)) incompletos += 1

    const pts = anillos.flatMap((a) => a.pts)
    for (const [a, b, c] of lista) {
      const area = (pts[b].x - pts[a].x) * (pts[c].y - pts[a].y) - (pts[c].x - pts[a].x) * (pts[b].y - pts[a].y)
      if (area >= 0) triangulos.push([claves[a], claves[b], claves[c]])
      else triangulos.push([claves[a], claves[c], claves[b]])
    }
  })

  // Un contorno sin área —todos sus puntos en una recta— no se puede tapar.
  incompletos += lazos.length - contornos.length
  return { triangulos, incompletos }
}

/**
 * Si los triángulos de una tapa la cubren sin huecos ni solapes, mirado por sus
 * aristas: cada lado del contorno en exactamente un triángulo, y cada arista de
 * dentro en exactamente dos.
 *
 * Earcut no se compromete a tanto con un contorno casi degenerado —la sección de
 * una lámina de un milímetro de grueso, que se toca consigo misma—, y allí puede
 * dejar un triángulo suelto encima de otros. Contar solo si cada punto se usa no
 * lo ve: el trozo sale sin cerrar y sin decirlo, que es el defecto de siempre.
 * Con esto sale igual, pero con su aviso.
 */
function cubreElContorno(
  caras: number[][],
  anillos: { claves: string[] }[],
  inicios: number[],
): boolean {
  const cuenta = new Map<string, number>()
  const clave = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)
  for (const [a, b, c] of caras) {
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      if (u === v) return false
      cuenta.set(clave(u, v), (cuenta.get(clave(u, v)) ?? 0) + 1)
    }
  }
  const lados = new Set<string>()
  anillos.forEach((anillo, r) => {
    const n = anillo.claves.length
    for (let k = 0; k < n; k += 1) lados.add(clave(inicios[r] + k, inicios[r] + ((k + 1) % n)))
  })
  for (const lado of lados) if (cuenta.get(lado) !== 1) return false
  for (const [arista, veces] of cuenta) if (!lados.has(arista) && veces !== 2) return false
  return true
}

/**
 * Abre en abanico los triángulos de la tapa que saltan puntos del contorno que
 * Earcut quitó por alineados (ver `triangularTapa`).
 *
 * Una arista de la tapa (i, j) salta puntos si, recorriendo su anillo desde i
 * hacia un lado, todo lo que hay antes de llegar a j son puntos que ningún
 * triángulo usa. Esos puntos están sobre la recta i–j —es la única razón por la
 * que Earcut quita un punto que no está repetido—, así que el triángulo (i, j, x)
 * se puede cambiar por (i, w₁, x), (w₁, w₂, x), …, (wₖ, j, x) sin que cambie la
 * superficie cubierta.
 */
function abrirEnAbanico(
  caras: number[][],
  usado: Uint8Array,
  anillos: { claves: string[] }[],
  inicios: number[],
  anilloDe: (k: number) => number,
): number[][] {
  const saltados = (i: number, j: number): number[] | null => {
    const a = anilloDe(i)
    if (anilloDe(j) !== a) return null
    const inicio = inicios[a]
    const tamano = anillos[a].claves.length
    for (const paso of [1, -1]) {
      const entre: number[] = []
      let k = ((i - inicio + paso + tamano) % tamano) + inicio
      while (k !== j && !usado[k] && entre.length < tamano) {
        entre.push(k)
        k = ((k - inicio + paso + tamano) % tamano) + inicio
      }
      if (k === j && entre.length > 0) return entre
    }
    return null
  }

  const salida: number[][] = []
  const pendientes = [...caras]
  while (pendientes.length > 0) {
    const cara = pendientes.pop()!
    let abierta = false
    for (let e = 0; e < 3; e += 1) {
      const i = cara[e]
      const j = cara[(e + 1) % 3]
      const x = cara[(e + 2) % 3]
      const entre = saltados(i, j)
      if (!entre) continue
      const cadena = [i, ...entre, j]
      for (const k of entre) usado[k] = 1
      for (let s = 0; s + 1 < cadena.length; s += 1) pendientes.push([cadena[s], cadena[s + 1], x])
      abierta = true
      break
    }
    if (!abierta) salida.push(cara)
  }
  return salida
}

/**
 * Da a cada vértice el identificador de su posición, soldando los que están a
 * menos de `SOLDADURA` (ver allí por qué no basta la igualdad).
 *
 * Por celdas y mirando las veintisiete vecinas, y no redondeando las
 * coordenadas: redondear parte en dos a los vértices que caen a ambos lados de
 * una línea de la rejilla, por cerca que estén, y con cincuenta costuras en una
 * pieza eso pasa más de lo que parece.
 */
function soldar(posiciones: Float32Array, vertices: number): Uint32Array {
  const canonico = new Uint32Array(vertices)
  const celdas = new Map<string, number[]>()
  const primeros: number[] = []
  for (let v = 0; v < vertices; v += 1) {
    const x = posiciones[v * 3]
    const y = posiciones[v * 3 + 1]
    const z = posiciones[v * 3 + 2]
    const cx = Math.floor(x / SOLDADURA)
    const cy = Math.floor(y / SOLDADURA)
    const cz = Math.floor(z / SOLDADURA)
    let encontrado = -1
    for (let dx = -1; dx <= 1 && encontrado < 0; dx += 1) {
      for (let dy = -1; dy <= 1 && encontrado < 0; dy += 1) {
        for (let dz = -1; dz <= 1 && encontrado < 0; dz += 1) {
          for (const id of celdas.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            const w = primeros[id]
            if (
              Math.abs(posiciones[w * 3] - x) <= SOLDADURA &&
              Math.abs(posiciones[w * 3 + 1] - y) <= SOLDADURA &&
              Math.abs(posiciones[w * 3 + 2] - z) <= SOLDADURA
            ) {
              encontrado = id
              break
            }
          }
        }
      }
    }
    if (encontrado < 0) {
      encontrado = primeros.length
      primeros.push(v)
      const clave = `${cx},${cy},${cz}`
      const lista = celdas.get(clave)
      if (lista) lista.push(encontrado)
      else celdas.set(clave, [encontrado])
    }
    canonico[v] = encontrado
  }
  return canonico
}

function cruzar(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normalizar(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2])
  return [a[0] / l, a[1] / l, a[2] / l]
}

function areaConSigno(pts: Vector2[]): number {
  let doble = 0
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    doble += a.x * b.y - b.x * a.y
  }
  return doble / 2
}

/** Punto en polígono por paridad de cruces. */
function dentroDelPoligono(p: Vector2, poligono: Vector2[]): boolean {
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
    const a = poligono[i]
    const b = poligono[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      dentro = !dentro
    }
  }
  return dentro
}

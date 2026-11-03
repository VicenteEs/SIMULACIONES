/**
 * La aritmética del aspecto del paciente en el simulador (D-225): qué parte de un hueso es la tapa de un corte y a
 * qué distancia de su borde queda cada punto de ella, hacia dónde corren las fibras de un músculo, dónde nace cada
 * vello y qué lo esconde, y de qué tamaño se calcula la oclusión ambiental.
 *
 * Va sin three a propósito: se prueba en node (`tests/unit/aspectoAnatomico.test.ts`), y lo que se equivoque aquí
 * —una tapa que no se reconoce, un vello que crece hacia dentro— no se ve hasta que alguien abre el caso. El
 * pegamento con la escena está en `src/components/simulador/aspectoDelPaciente.ts`.
 */

export type Vec3 = [number, number, number]

/** Lado, en celdas, del campo de distancias de una tapa: 64 dan medio milímetro por celda en una tibia. */
export const LADO_DEL_CAMPO_DE_LA_TAPA = 64

export interface TapaDeCorte {
  /** Los vértices que forman la tapa. */
  vertices: number[]
  normal: Vec3
  /**
   * El rectángulo que la contiene, en su plano: una esquina y los dos ejes divididos por su largo, de modo que
   * `dot(p − origen, ejeU)` va de 0 a 1 dentro. Así lo lee el sombreador sin más cuentas.
   */
  origen: Vec3
  ejeU: Vec3
  ejeV: Vec3
  /** Lo más que un punto de la tapa se aleja de su borde, en unidades de la malla. */
  radio: number
  /** La distancia al borde de cada celda, de 0 (en el borde o fuera) a 255 (`radio`), fila a fila. */
  distancia: Uint8Array
}

const resta = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cruz = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unitario = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}
const leer = (arreglo: ArrayLike<number>, i: number): Vec3 => [arreglo[i * 3], arreglo[i * 3 + 1], arreglo[i * 3 + 2]]

/** Los triángulos de la malla como tríos de vértices; sin índice, cada tres vértices seguidos son uno. */
function triangulosDe(indices: ArrayLike<number> | null, vertices: number): ArrayLike<number> {
  if (indices) return indices
  return Uint32Array.from({ length: vertices - (vertices % 3) }, (_, i) => i)
}

/**
 * Las tapas de los cortes de una malla de hueso: lo que `partirMalla` (`src/lib/osteotomia.ts`) cerró al partirla.
 *
 * Se reconocen por cómo las escribe: todos los vértices de una tapa llevan **la misma** normal, la del plano, y están
 * en ese plano. Una superficie de hueso no tiene doce vértices con la normal idéntica al último decimal; una tapa
 * siempre. No hace falta que el archivo diga nada, y por eso vale para los casos ya exportados.
 *
 * `minimo` es cuántos vértices hacen falta para creérselo, y `maximo` cuántas tapas se guardan (las mayores): el
 * sombreador tiene sitio para cuatro.
 */
export function tapasDeCorte(
  posiciones: ArrayLike<number>,
  normales: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  { minimo = 12, maximo = 4 }: { minimo?: number; maximo?: number } = {},
): TapaDeCorte[] {
  const n = Math.floor(posiciones.length / 3)
  if (n === 0) return []
  let lo: Vec3 = [Infinity, Infinity, Infinity]
  let hi: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < n; i++) {
    const p = leer(posiciones, i)
    lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1]), Math.min(lo[2], p[2])]
    hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1]), Math.max(hi[2], p[2])]
  }
  const diagonal = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1
  // La normal se compara a una diezmilésima, y el plano a una cienmilésima de la malla: las normales de una tapa son
  // la misma cifra escrita varias veces, pero pasan por un Int16 al exportarse.
  const grupos = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const m = leer(normales, i)
    if (Math.abs(Math.hypot(m[0], m[1], m[2]) - 1) > 0.01) continue
    const d = punto(m, leer(posiciones, i)) / diagonal
    const clave = `${Math.round(m[0] * 1e4)},${Math.round(m[1] * 1e4)},${Math.round(m[2] * 1e4)},${Math.round(d * 1e5)}`
    const g = grupos.get(clave)
    if (g) g.push(i)
    else grupos.set(clave, [i])
  }
  const triangulos = triangulosDe(indices, n)
  const tapas: TapaDeCorte[] = []
  for (const vertices of grupos.values()) {
    if (vertices.length < minimo) continue
    const enLaTapa = new Set(vertices)
    // Los vértices de la tapa, soldados por posición: si vinieran sin soldar, cada arista saldría como borde.
    const soldado = new Map<string, number>()
    const canonico = (v: number) => {
      const p = leer(posiciones, v)
      const clave = `${Math.round((p[0] / diagonal) * 1e6)},${Math.round((p[1] / diagonal) * 1e6)},${Math.round((p[2] / diagonal) * 1e6)}`
      const c = soldado.get(clave)
      if (c !== undefined) return c
      soldado.set(clave, v)
      return v
    }
    const usos = new Map<string, { a: number; b: number; veces: number }>()
    let suyos = 0
    for (let t = 0; t + 2 < triangulos.length; t += 3) {
      const a = triangulos[t], b = triangulos[t + 1], c = triangulos[t + 2]
      if (!enLaTapa.has(a) || !enLaTapa.has(b) || !enLaTapa.has(c)) continue
      // `partirMalla` escribe cada punto del contorno dos veces, y entre las copias quedan triángulos sin área. Si
      // contaran, el borde verdadero saldría usado dos veces —por el triángulo bueno y por el degenerado— y como
      // borde quedarían solo aristas de largo cero: la tapa se perdía entera, también en los casos exportados.
      const ca = canonico(a), cb = canonico(b), cc = canonico(c)
      if (ca === cb || cb === cc || cc === ca) continue
      suyos++
      for (const [p, q] of [
        [ca, cb],
        [cb, cc],
        [cc, ca],
      ]) {
        const clave = p < q ? `${p},${q}` : `${q},${p}`
        const u = usos.get(clave)
        if (u) u.veces++
        else usos.set(clave, { a: p, b: q, veces: 1 })
      }
    }
    if (suyos < 2) continue
    const borde = [...usos.values()].filter((u) => u.veces === 1)
    if (borde.length < 3) continue

    const normal = unitario(leer(normales, vertices[0]))
    const ejeU = unitario(cruz(normal, Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]))
    const ejeV = cruz(normal, ejeU)
    const base = leer(posiciones, vertices[0])
    const enElPlano = (v: number): [number, number] => {
      const d = resta(leer(posiciones, v), base)
      return [punto(d, ejeU), punto(d, ejeV)]
    }
    let smin = Infinity, smax = -Infinity, tmin = Infinity, tmax = -Infinity
    for (const v of vertices) {
      const [s, t] = enElPlano(v)
      smin = Math.min(smin, s)
      smax = Math.max(smax, s)
      tmin = Math.min(tmin, t)
      tmax = Math.max(tmax, t)
    }
    const margen = Math.max(smax - smin, tmax - tmin) * 0.02 || 1e-6
    smin -= margen
    smax += margen
    tmin -= margen
    tmax += margen
    const segmentos = borde.map((u) => [...enElPlano(u.a), ...enElPlano(u.b)])
    const lado = LADO_DEL_CAMPO_DE_LA_TAPA
    const crudo = new Float64Array(lado * lado)
    let radio = 0
    for (let j = 0; j < lado; j++) {
      for (let i = 0; i < lado; i++) {
        const s = smin + ((i + 0.5) / lado) * (smax - smin)
        const t = tmin + ((j + 0.5) / lado) * (tmax - tmin)
        let cerca = Infinity
        let cruces = 0
        for (const [s0, t0, s1, t1] of segmentos) {
          // Dentro o fuera por la paridad de un rayo hacia +s, que no necesita saber hacia dónde va cada arista.
          if (t0 > t !== t1 > t && s < s0 + ((t - t0) / (t1 - t0)) * (s1 - s0)) cruces++
          const ds = s1 - s0, dt = t1 - t0
          const l2 = ds * ds + dt * dt
          const k = l2 > 0 ? Math.max(0, Math.min(1, ((s - s0) * ds + (t - t0) * dt) / l2)) : 0
          cerca = Math.min(cerca, Math.hypot(s - s0 - k * ds, t - t0 - k * dt))
        }
        if (cruces % 2 === 1) {
          crudo[j * lado + i] = cerca
          radio = Math.max(radio, cerca)
        }
      }
    }
    if (radio === 0) continue
    const distancia = Uint8Array.from(crudo, (d) => Math.round((255 * d) / radio))
    const anchoU = smax - smin, anchoV = tmax - tmin
    tapas.push({
      vertices,
      normal,
      origen: [
        base[0] + ejeU[0] * smin + ejeV[0] * tmin,
        base[1] + ejeU[1] * smin + ejeV[1] * tmin,
        base[2] + ejeU[2] * smin + ejeV[2] * tmin,
      ],
      ejeU: [ejeU[0] / anchoU, ejeU[1] / anchoU, ejeU[2] / anchoU],
      ejeV: [ejeV[0] / anchoV, ejeV[1] / anchoV, ejeV[2] / anchoV],
      radio,
      distancia,
    })
  }
  return tapas.sort((a, b) => b.vertices.length - a.vertices.length).slice(0, maximo)
}

/**
 * Hacia dónde es más larga una malla: el eje principal de sus vértices. Es la dirección de las fibras de un
 * músculo, que casi siempre van de un extremo al otro; con eso el estriado del sombreador corre a lo largo del
 * vientre y no en una dirección fija del mundo, que en el bíceps acertaba y en el pectoral no.
 */
export function ejePrincipal(posiciones: ArrayLike<number>): Vec3 {
  const n = Math.floor(posiciones.length / 3)
  if (n < 2) return [0, 1, 0]
  // Con unos miles de vértices basta: el eje de un músculo no cambia por mirar todos.
  const paso = Math.max(1, Math.floor(n / 4000))
  let cuenta = 0
  const media: Vec3 = [0, 0, 0]
  for (let i = 0; i < n; i += paso) {
    for (let k = 0; k < 3; k++) media[k] += posiciones[i * 3 + k]
    cuenta++
  }
  for (let k = 0; k < 3; k++) media[k] /= cuenta
  const c = [0, 0, 0, 0, 0, 0] // xx, xy, xz, yy, yz, zz
  for (let i = 0; i < n; i += paso) {
    const x = posiciones[i * 3] - media[0], y = posiciones[i * 3 + 1] - media[1], z = posiciones[i * 3 + 2] - media[2]
    c[0] += x * x
    c[1] += x * y
    c[2] += x * z
    c[3] += y * y
    c[4] += y * z
    c[5] += z * z
  }
  // Iteración de potencia: la matriz es 3×3 y simétrica, y treinta vueltas sobran para separar el eje mayor.
  let v: Vec3 = [0.3, 0.9, 0.3]
  for (let k = 0; k < 30; k++) {
    v = unitario([c[0] * v[0] + c[1] * v[1] + c[2] * v[2], c[1] * v[0] + c[3] * v[1] + c[4] * v[2], c[2] * v[0] + c[4] * v[1] + c[5] * v[2]])
  }
  return v
}

/**
 * Qué triángulos son de una cáscara vuelta hacia dentro: la cara de dentro de la piel del atlas (D-224), que mira al
 * cuerpo. Se separan por conectividad y se mira el volumen con signo de cada parte, medido desde el centro de la
 * malla: el de la cáscara de fuera sale positivo y el de la de dentro, negativo. Al vello le hace falta: en la cara
 * de dentro crecería hacia el músculo y asomaría por cualquier herida abierta.
 */
export function triangulosHaciaDentro(posiciones: ArrayLike<number>, indices: ArrayLike<number> | null): Uint8Array {
  const n = Math.floor(posiciones.length / 3)
  const tri = triangulosDe(indices, n)
  const nt = Math.floor(tri.length / 3)
  const padre = Int32Array.from({ length: n }, (_, i) => i)
  const raiz = (v: number) => {
    while (padre[v] !== v) {
      padre[v] = padre[padre[v]]
      v = padre[v]
    }
    return v
  }
  for (let t = 0; t < nt; t++) {
    const a = raiz(tri[t * 3]), b = raiz(tri[t * 3 + 1]), c = raiz(tri[t * 3 + 2])
    padre[b] = a
    padre[raiz(c)] = a
  }
  const centro: Vec3 = [0, 0, 0]
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) centro[k] += posiciones[i * 3 + k] / n
  const volumen = new Map<number, number>()
  for (let t = 0; t < nt; t++) {
    const a = resta(leer(posiciones, tri[t * 3]), centro)
    const b = resta(leer(posiciones, tri[t * 3 + 1]), centro)
    const c = resta(leer(posiciones, tri[t * 3 + 2]), centro)
    const r = raiz(tri[t * 3])
    volumen.set(r, (volumen.get(r) ?? 0) + punto(a, cruz(b, c)) / 6)
  }
  const salida = new Uint8Array(nt)
  for (let t = 0; t < nt; t++) if ((volumen.get(raiz(tri[t * 3])) ?? 0) < 0) salida[t] = 1
  return salida
}

/**
 * Qué triángulos son de piel sin vello según el color por vértice del archivo (D-227): los labios y las areolas, que
 * la pigmentación deja rojizos y con el verde muy apagado. El umbral es el mismo con que el sombreador de la piel
 * decide que algo está húmedo (`vColor.g`), así que lo que brilla como mucosa tampoco tiene pelos.
 *
 * Se pide además que sea rojizo (rojo ≥ 1,35 veces el verde): la ceja y el cuero cabelludo también son oscuros en el
 * verde, pero son de pelo, y un vello fino sobre ellos se lee bien. `colores` es RGB o RGBA en 0–1, `paso` 3 o 4.
 */
export function triangulosSinVello(colores: ArrayLike<number>, paso: 3 | 4, indices: ArrayLike<number> | null): Uint8Array {
  const n = Math.floor(colores.length / paso)
  const tri = triangulosDe(indices, n)
  const nt = Math.floor(tri.length / 3)
  const salida = new Uint8Array(nt)
  for (let t = 0; t < nt; t++) {
    let r = 0, g = 0
    for (let k = 0; k < 3; k++) {
      r += colores[tri[t * 3 + k] * paso]
      g += colores[tri[t * 3 + k] * paso + 1]
    }
    // La media de los tres vértices y no «alguno»: en el borde de un labio basta un vértice rojo para pintar un
    // triángulo entero de piel de al lado, y quedaría un contorno sin vello a todo lo largo de la boca.
    if (g / 3 < 0.55 && r > g * 1.35) salida[t] = 1
  }
  return salida
}

export interface SitiosDelVello {
  cuantos: number
  /** Dónde nace cada uno, en las unidades de la malla. */
  bases: Float32Array
  /** Hacia dónde crece (unitario): casi tumbado sobre la piel, y hacia abajo, como el vello de los miembros. */
  direcciones: Float32Array
  /** La normal de la piel en su base: la cinta del vello se orienta con ella para dar la cara. */
  normales: Float32Array
  /** Su largo, en unidades de la malla. */
  largos: Float32Array
  /** Más claro o más oscuro que el color base, alrededor de 1. */
  tonos: Float32Array
}

/** Un generador de azar con semilla (mulberry32): el mismo vello en cada carga, y no uno que baila al recargar. */
function azarConSemilla(semilla: number) {
  let s = semilla >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Dónde nace cada vello sobre una malla de piel: repartido por área, `densidadPorCm2` por centímetro cuadrado y
 * nunca más de `maximo` en total (en la piel del cuerpo entero son 1,8 m²). Los triángulos que `excluir` marca no
 * reciben ninguno. Las medidas van en milímetros y se pasan a las unidades de la malla con `mmPorUnidad`.
 */
export function sitiosDelVello(
  posiciones: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  {
    mmPorUnidad,
    densidadPorCm2 = 2.5,
    maximo = 30000,
    semilla = 1,
    excluir,
  }: { mmPorUnidad: number; densidadPorCm2?: number; maximo?: number; semilla?: number; excluir?: Uint8Array },
): SitiosDelVello {
  const n = Math.floor(posiciones.length / 3)
  const tri = triangulosDe(indices, n)
  const nt = Math.floor(tri.length / 3)
  const acumulada = new Float64Array(nt)
  let area = 0
  for (let t = 0; t < nt; t++) {
    if (!excluir?.[t]) {
      const a = leer(posiciones, tri[t * 3])
      const c = cruz(resta(leer(posiciones, tri[t * 3 + 1]), a), resta(leer(posiciones, tri[t * 3 + 2]), a))
      area += Math.hypot(c[0], c[1], c[2]) / 2
    }
    acumulada[t] = area
  }
  const areaCm2 = (area * mmPorUnidad * mmPorUnidad) / 100
  const cuantos = area > 0 ? Math.min(maximo, Math.round(areaCm2 * densidadPorCm2)) : 0
  const salida: SitiosDelVello = {
    cuantos,
    bases: new Float32Array(cuantos * 3),
    direcciones: new Float32Array(cuantos * 3),
    normales: new Float32Array(cuantos * 3),
    largos: new Float32Array(cuantos),
    tonos: new Float32Array(cuantos),
  }
  const azar = azarConSemilla(semilla)
  for (let h = 0; h < cuantos; h++) {
    // El triángulo, por búsqueda binaria en el área acumulada: uno grande recibe más vello que uno pequeño.
    const objetivo = azar() * area
    let lo = 0, hi = nt - 1
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (acumulada[m] < objetivo) lo = m + 1
      else hi = m
    }
    const a = leer(posiciones, tri[lo * 3]), b = leer(posiciones, tri[lo * 3 + 1]), c = leer(posiciones, tri[lo * 3 + 2])
    let u = azar(), v = azar()
    if (u + v > 1) {
      u = 1 - u
      v = 1 - v
    }
    const p: Vec3 = [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u + (c[k] - a[k]) * v) as Vec3
    const normal = unitario(cruz(resta(b, a), resta(c, a)))
    // Hacia abajo sobre la piel, con su desvío: el vello de los miembros apunta a los pies. Donde la piel mira
    // arriba o abajo (el hombro, la planta) no hay «abajo» en el plano, y se elige uno cualquiera.
    const haciaAbajo = -normal[1]
    let flujo: Vec3 = [-normal[0] * haciaAbajo, -1 - normal[1] * haciaAbajo, -normal[2] * haciaAbajo]
    if (Math.hypot(...flujo) < 0.2) flujo = cruz(normal, [1, 0, 0])
    flujo = unitario(flujo)
    const lateral = cruz(normal, flujo)
    const giro = (azar() - 0.5) * 1.2
    const tangente = unitario([0, 1, 2].map((k) => flujo[k] * Math.cos(giro) + lateral[k] * Math.sin(giro)) as Vec3)
    const tumbado = ((62 + azar() * 18) * Math.PI) / 180
    const direccion = unitario([0, 1, 2].map((k) => normal[k] * Math.cos(tumbado) + tangente[k] * Math.sin(tumbado)) as Vec3)
    salida.bases.set(p, h * 3)
    salida.direcciones.set(direccion, h * 3)
    salida.normales.set(normal, h * 3)
    salida.largos[h] = (2 + azar() * 3.5) / mmPorUnidad
    salida.tonos[h] = 0.75 + azar() * 0.45
  }
  return salida
}

/**
 * Qué vellos quedan lejos de las heridas: 1 los que se ven, 0 los que están a menos de `radio` de algún punto de una
 * incisión. Sin esto, el vello de la piel cortada seguía en su sitio flotando sobre la herida abierta.
 */
export function velloLejosDeLasHeridas(bases: Float32Array, puntos: readonly Vec3[], radio: number): Uint8Array {
  const n = bases.length / 3
  const visible = new Uint8Array(n).fill(1)
  if (puntos.length === 0) return visible
  const r2 = radio * radio
  for (let h = 0; h < n; h++) {
    const x = bases[h * 3], y = bases[h * 3 + 1], z = bases[h * 3 + 2]
    for (const p of puntos) {
      if ((x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2 < r2) {
        visible[h] = 0
        break
      }
    }
  }
  return visible
}

/**
 * El tamaño de la oclusión ambiental: la mitad del lienzo por lado, sin pasar de `pixelesMaximos`. A media
 * resolución no se nota (es una sombra suave y se difumina después), y cuesta la cuarta parte de memoria, que en un
 * lienzo de 16 millones de píxeles (`PIXELES_MAXIMOS_DEL_LIENZO`) era la diferencia entre caber y perder el contexto.
 */
export function tamanoDeLaOclusion(ancho: number, alto: number, pixelesMaximos = 2_000_000): { ancho: number; alto: number } {
  const factor = Math.min(0.5, Math.sqrt(pixelesMaximos / Math.max(1, ancho * alto)))
  return { ancho: Math.max(1, Math.round(ancho * factor)), alto: Math.max(1, Math.round(alto * factor)) }
}

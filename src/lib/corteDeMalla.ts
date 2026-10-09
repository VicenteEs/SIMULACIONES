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
 */

export type Vec3 = [number, number, number]

/** Una incisión: puntos sobre la superficie y la normal de la malla en cada uno. */
export interface IncisionSobreLaMalla {
  puntos: Vec3[]
  normales: Vec3[]
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
}

export interface MallaCortada extends MallaPlana {
  /** El vértice de la malla original del que sale cada vértice (los nuevos, el de su arista). */
  origen: Uint32Array
  /** 0 en reposo, 1 en el borde de la herida, siempre entre los dos. */
  peso: Float32Array
  /** Unitario, el sentido (positivo) en que se separa el labio «más». */
  direccion: Float32Array
  /** +1 labio «más», −1 labio «menos», 0 lo que no pertenece a la herida. */
  lado: Int8Array
  /** Cada labio, de un extremo de la incisión al otro: para dibujar su borde. */
  labios: { mas: number[]; menos: number[] }
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
}

/**
 * Deja la incisión lista para medir contra ella: sin puntos casi pegados (un
 * temblor de la mano añade cien por centímetro y solo estorba) y con la normal y
 * el lateral de cada nodo.
 */
export function prepararIncision(incision: IncisionSobreLaMalla, separacionMinima: number): CurvaDeIncision | null {
  const puntos: Vec3[] = []
  const normales: Vec3[] = []
  incision.puntos.forEach((p, i) => {
    const n = incision.normales[i] ?? incision.normales[incision.normales.length - 1] ?? [0, 0, 1]
    const ultimo = puntos[puntos.length - 1]
    if (ultimo && largo(resta(p, ultimo)) < separacionMinima) return
    puntos.push(p)
    normales.push(unitario(n))
  })
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

  return { tramos, largoTotal: acumulado, normales: normalesNodo, laterales: lateralesNodo }
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
}

/** Dónde cae un punto respecto de la incisión. */
export function proyectar(curva: CurvaDeIncision, p: Vec3): Proyeccion {
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
  return {
    cercano,
    t: curva.largoTotal > 0 ? (tr.desde + mejorU * tr.largo) / curva.largoTotal : 0,
    lateral: punto(w, direccion),
    altura: punto(w, normal),
    direccion,
    dentro,
    distancia: Math.sqrt(mejorDistancia),
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
const afilado = (t: number) => suave(Math.min(t, 1 - t) / AFILADO)

/**
 * Parte la malla a lo largo de la incisión. Devuelve `null` si la incisión no
 * toca la malla (no cortó ninguna arista): quien llama deja la malla como estaba.
 */
export function cortarMalla(malla: MallaPlana, incision: IncisionSobreLaMalla, opciones: OpcionesDeCorte): MallaCortada | null {
  const curva = prepararIncision(incision, opciones.alcance * 0.02)
  if (!curva) return null

  const nVertices = malla.posiciones.length / 3
  const nTriangulos = malla.indices.length / 3

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
    partidas.set(clave, { a, b, posicion: m, t: pr.t, mas: -1, menos: -1, pasa: false })
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

  // -- 4. los vértices: los originales y, por cada arista, el nuevo (o los dos) ---
  const lista = {
    posiciones: Array.from(malla.posiciones) as number[],
    origen: Array.from({ length: nVertices }, (_, i) => i),
    lado: new Array<number>(nVertices).fill(0),
    t: new Array<number>(nVertices).fill(0),
  }
  for (let i = 0; i < nVertices; i++) lista.lado[i] = Number.isNaN(campo[i]) ? 0 : campo[i] > 0 ? 1 : -1
  const nuevoVertice = (p: Vec3, origen: number, lado: number, t: number) => {
    lista.posiciones.push(p[0], p[1], p[2])
    lista.origen.push(origen)
    lista.lado.push(lado)
    lista.t.push(t)
    return lista.origen.length - 1
  }
  const labios = { mas: [] as { i: number; t: number }[], menos: [] as { i: number; t: number }[] }
  for (const p of partidas.values()) {
    if (p.pasa) {
      p.mas = nuevoVertice(p.posicion, p.a, 1, p.t)
      p.menos = nuevoVertice(p.posicion, p.a, -1, p.t)
      labios.mas.push({ i: p.mas, t: p.t })
      labios.menos.push({ i: p.menos, t: p.t })
    } else {
      p.mas = p.menos = nuevoVertice(p.posicion, p.a, 0, p.t)
    }
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
    indices.push(a, mab(ladoA), mca(ladoA))
    indices.push(mab(ladoResto), b, c)
    indices.push(mab(ladoResto), c, mca(ladoResto))
  }

  // -- 6. peso y dirección de cada vértice ---------------------------------------
  const total = lista.origen.length
  const posiciones = Float32Array.from(lista.posiciones)
  const peso = new Float32Array(total)
  const direccion = new Float32Array(total * 3)
  const lado = Int8Array.from(lista.lado)
  for (let i = 0; i < total; i++) {
    if (lado[i] === 0 && i < nVertices) continue
    const p = leer(posiciones, i)
    if (i < nVertices && Number.isNaN(campo[i])) continue
    const pr = proyectar(curva, p)
    if (pr.altura < -opciones.profundidad || pr.altura > opciones.profundidad * 0.5) continue
    const cerca = 1 - suave(Math.abs(pr.lateral) / Math.max(opciones.alcance, 1e-9))
    peso[i] = cerca * afilado(pr.t)
    direccion[3 * i] = pr.direccion[0]
    direccion[3 * i + 1] = pr.direccion[1]
    direccion[3 * i + 2] = pr.direccion[2]
  }
  // Los vértices de la punta (sencillos) no se mueven: la herida acaba cerrada.
  for (let i = nVertices; i < total; i++) if (lado[i] === 0) peso[i] = 0

  const ordenar = (cadena: { i: number; t: number }[]) => cadena.sort((x, y) => x.t - y.t).map((x) => x.i)

  return {
    posiciones,
    indices: Uint32Array.from(indices),
    origen: Uint32Array.from(lista.origen),
    peso,
    direccion,
    lado,
    labios: { mas: ordenar(labios.mas), menos: ordenar(labios.menos) },
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
export function abrirHerida(corte: MallaCortada, mas: number, menos: number): Float32Array {
  const salida = Float32Array.from(corte.posiciones)
  const n = corte.lado.length
  for (let i = 0; i < n; i++) {
    const peso = corte.peso[i]
    if (peso === 0) continue
    const lado = corte.lado[i]
    if (lado === 0) continue
    const k = peso * (lado > 0 ? mas : -menos)
    salida[3 * i] += corte.direccion[3 * i] * k
    salida[3 * i + 1] += corte.direccion[3 * i + 1] * k
    salida[3 * i + 2] += corte.direccion[3 * i + 2] * k
  }
  return salida
}

/** Cuánto mide la herida de largo (la incisión), en las unidades de la malla. */
export function largoDeLaHerida(incision: IncisionSobreLaMalla): number {
  const curva = prepararIncision(incision, 0)
  return curva?.largoTotal ?? 0
}

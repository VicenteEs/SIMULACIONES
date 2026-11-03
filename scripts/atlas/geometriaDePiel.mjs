/**
 * La geometría que necesita `recalcular-piel.mjs` (D-224), sin tocar archivos.
 *
 * Está aparte para poder probarla con una cáscara sintética
 * (`tests/unit/geometriaDePiel.test.ts`) y no solo mirando el atlas: un guion
 * que reescribe la piel del cuerpo y cuya única prueba es «se ve bien» no se
 * puede arreglar con confianza. Y para que la prueba que vigila la holgura de
 * la piel del atlas mida con lo mismo que midió el guion al escribirla.
 *
 * Todo trabaja con `Float32Array` de posiciones (x, y, z seguidos) y `Uint32Array`
 * de índices, que es como vive la piel en los paquetes del atlas.
 */

/** La pieza de la piel en el catálogo y la de la oreja anatómica, que lleva su propia piel (D-224). */
export const NOMBRE_DE_LA_PIEL = 'Skin'
export const NOMBRE_DE_LA_OREJA = 'External ear'

/** Lo que ya es piel por clasificación: uñas, pelo. No cuenta como «lo de dentro». */
export const SISTEMAS_APARTE = new Set(['integumentary'])

/**
 * Ojos y labios: no son «lo de dentro» que la piel tenga que tapar. El globo ocular
 * asoma porque la piel del atlas no tiene párpados abiertos —subirla lo taparía—, y
 * el labio es el borde de la boca. Se nombran las estructuras del ojo una a una
 * porque una expresión suelta como `rectus` también cogería el recto del abdomen, y
 * `oblique` el oblicuo externo (se vio al medir, D-159).
 */
export const APARTE_POR_NOMBRE =
  /eyeball|check ligament|\blens\b|\biris\b|sclera|cornea|choroid|retina|vitreous|ciliaris|anterior chamber|posterior chamber|tarsal plate|lacrimal|eyelid|levator palpebrae|optic (nerve|part|disc)|^(left |right )?(superior|inferior|medial|lateral) rectus|^(left |right )?(superior|inferior) oblique|orbital|trochlear|oculomotor|abducens|ophthalmic|nasociliary|frontal nerve|^lip$|^(left |right )?upper lip|^(left |right )?lower lip/i

/**
 * La fascia superficial tampoco. Es la tela que hay entre la piel y la envolvente profunda, y se calcula a partir de
 * la piel (`scripts/atlas/fascias/capas.py`, a lo sumo un milímetro bajo ella): empujar la piel por ella era empujarla
 * por sí misma. Sacada de la piel de D-159, conservaba sus facetas y sus pirámides, y la piel de D-224 las calcaba en la
 * sien y alrededor de la oreja, abollonada. Se regenera después de la piel, y `comprobarPiel.mjs` mira aparte que quede
 * por dentro.
 */
export const SISTEMA_DE_LA_FASCIA_SUPERFICIAL = 'fascia-superficial'

/** Si una pieza del catálogo es «lo de dentro» que la cáscara del cuerpo tiene que cubrir con holgura. */
export function cubiertaPorElCuerpo(pieza) {
  return (
    pieza.nombre !== NOMBRE_DE_LA_PIEL &&
    pieza.nombre !== NOMBRE_DE_LA_OREJA &&
    pieza.sistema !== SISTEMA_DE_LA_FASCIA_SUPERFICIAL &&
    !SISTEMAS_APARTE.has(pieza.sistema) &&
    !APARTE_POR_NOMBRE.test(pieza.nombre)
  )
}

/**
 * Las cáscaras de una malla por conectividad, cada una con sus triángulos y el
 * volumen con signo que encierra (positivo si las caras miran hacia fuera).
 *
 * Por conectividad **sin soldar**: la piel nueva (D-224) son varias superficies
 * cerradas —el cuerpo, cada oreja, la cara de dentro— que no comparten vértices,
 * y así se separan sin mirar el dibujo. Ordenadas de mayor a menor.
 */
export function cascarasPorConectividad(pos, idx, vertices) {
  const padre = Int32Array.from({ length: vertices }, (_, i) => i)
  const raiz = (a) => {
    while (padre[a] !== a) {
      padre[a] = padre[padre[a]]
      a = padre[a]
    }
    return a
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = raiz(idx[t])
    padre[raiz(idx[t + 1])] = a
    padre[raiz(idx[t + 2])] = a
  }
  const grupos = new Map()
  for (let t = 0; t < idx.length; t += 3) {
    const r = raiz(idx[t])
    let g = grupos.get(r)
    if (!g) grupos.set(r, (g = { triangulos: [], volumen: 0 }))
    g.triangulos.push(idx[t], idx[t + 1], idx[t + 2])
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    g.volumen +=
      (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
        pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
        pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6
  }
  return [...grupos.values()]
    .map((g) => ({ triangulos: Uint32Array.from(g.triangulos), volumen: g.volumen }))
    .sort((p, q) => q.triangulos.length - p.triangulos.length)
}

/**
 * Cada cuánto se mide un triángulo de una pieza generada (las fascias de D-218). Se decimaron hasta triángulos de un
 * centímetro o dos, y están a dos milímetros de la piel en casi todo el cuerpo: midiendo solo sus vértices y su
 * centro, cada uno levantaba un bulto y entre ellos la piel quedaba más baja, y sobre la fascia temporal la sien salía
 * abollonada, con las pirámides de D-159 a escala de un centímetro. Entre dos puntos, además, la cara de la fascia
 * podía quedar por encima de la piel sin que nadie lo viera. Las de BodyParts3D no lo necesitan donde importa: cerca
 * de la piel sus triángulos son de milímetros, y partirlas todas a 4 mm daba trece millones de puntos en vez de tres.
 */
export const PASO_DE_LAS_GENERADAS = 0.003

/** Si una pieza del catálogo la generó TraumaHub (como `esGenerada` de `fascias/empaquetar.mjs`). */
const generada = (pieza) => typeof pieza.generada === 'string' && pieza.generada.length > 0

/**
 * Los puntos que se miden de un triángulo `a b c` de `pos`: el centro de cada triángulo de su partición regular en
 * `n²`, con `n` el que deja los lados en `paso` o menos, y se los da a `punto(x, y, z)`. Con un triángulo menor que el
 * paso, o sin paso, es solo su centro.
 */
export function muestrasDelTriangulo(pos, a, b, c, paso, punto) {
  const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2]
  const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2]
  const cx = pos[c * 3], cy = pos[c * 3 + 1], cz = pos[c * 3 + 2]
  const lado = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz))
  const n = paso > 0 ? Math.max(1, Math.ceil(lado / paso)) : 1
  if (n === 1) {
    punto((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3)
    return
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; i + j < n; j++) {
      // Los triángulos «de pie» de la partición, y entre ellos los «de cabeza», que no caben en la última fila.
      for (const d of i + j < n - 1 ? [1 / 3, 2 / 3] : [1 / 3]) {
        const u = (i + d) / n, w = (j + d) / n
        punto(ax + (bx - ax) * u + (cx - ax) * w, ay + (by - ay) * u + (cy - ay) * w, az + (bz - az) * u + (cz - az) * w)
      }
    }
  }
}

/**
 * Los puntos de lo de dentro que pueden quedar cerca de la piel: los vértices y el
 * centro de cada triángulo de las piezas que `elegir` acepta, si caen en una celda
 * que `cerca` da por buena. El centro, porque un triángulo grande asoma por el medio
 * aunque sus tres vértices queden dentro; y de las piezas generadas, una rejilla de
 * puntos por triángulo (`PASO_DE_LAS_GENERADAS`).
 *
 * `leer(pieza)` da sus posiciones y sus índices. Devuelve los puntos seguidos y, por
 * cada uno, el número de la pieza de la que sale (para decir quién falla).
 */
export function puntosDeLoDeDentro(piezas, leer, elegir, cerca) {
  const puntos = []
  const origen = []
  piezas.forEach((p, n) => {
    if (!elegir(p)) return
    const { pos, idx } = leer(p)
    for (let i = 0; i < p.vertices; i++) {
      if (cerca(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])) {
        puntos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
        origen.push(n)
      }
    }
    const paso = generada(p) ? PASO_DE_LAS_GENERADAS : 0
    const anotar = (x, y, z) => {
      if (!cerca(x, y, z)) return
      puntos.push(x, y, z)
      origen.push(n)
    }
    for (let t = 0; t < idx.length; t += 3) muestrasDelTriangulo(pos, idx[t], idx[t + 1], idx[t + 2], paso, anotar)
  })
  return { puntos: Float32Array.from(puntos), origen: Int32Array.from(origen) }
}

/**
 * Un filtro de «está a menos de `alcance` de alguno de estos vértices», por celdas:
 * descarta de un vistazo los millones de puntos que están en el medio del cuerpo.
 * Es generoso (mira la celda y las vecinas), nunca deja fuera lo que está cerca.
 */
export function filtroDeCercania(pos, vertices, alcance) {
  const celda = alcance
  const ocupadas = new Set()
  const clave = (i, j, l) => (i + 512) * 1048576 + (j + 512) * 1024 + (l + 512)
  for (let v = 0; v < vertices; v++) {
    const ci = Math.floor(pos[v * 3] / celda), cj = Math.floor(pos[v * 3 + 1] / celda), cl = Math.floor(pos[v * 3 + 2] / celda)
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) ocupadas.add(clave(ci + i, cj + j, cl + l))
  }
  return (x, y, z) => ocupadas.has(clave(Math.floor(x / celda), Math.floor(y / celda), Math.floor(z / celda)))
}

/** Punto más cercano de un triángulo (Ericson, «Real-Time Collision Detection»). */
export function cercanoEnTriangulo(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az
  const d1 = abx * (px - ax) + aby * (py - ay) + abz * (pz - az)
  const d2 = acx * (px - ax) + acy * (py - ay) + acz * (pz - az)
  if (d1 <= 0 && d2 <= 0) return [ax, ay, az]
  const d3 = abx * (px - bx) + aby * (py - by) + abz * (pz - bz)
  const d4 = acx * (px - bx) + acy * (py - by) + acz * (pz - bz)
  if (d3 >= 0 && d4 <= d3) return [bx, by, bz]
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3)
    return [ax + v * abx, ay + v * aby, az + v * abz]
  }
  const d5 = abx * (px - cx) + aby * (py - cy) + abz * (pz - cz)
  const d6 = acx * (px - cx) + acy * (py - cy) + acz * (pz - cz)
  if (d6 >= 0 && d5 <= d6) return [cx, cy, cz]
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6)
    return [ax + w * acx, ay + w * acy, az + w * acz]
  }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6))
    return [bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz)]
  }
  const den = 1 / (va + vb + vc)
  const v = vb * den, w = vc * den
  return [ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w]
}

/** Qué vértice es «el mismo» que otro: los que comparten posición (a una micra). */
export function verticesSoldados(pos, vertices) {
  const por = new Map()
  const canon = new Int32Array(vertices)
  for (let i = 0; i < vertices; i++) {
    const k = `${Math.round(pos[i * 3] * 1e6)},${Math.round(pos[i * 3 + 1] * 1e6)},${Math.round(pos[i * 3 + 2] * 1e6)}`
    const antes = por.get(k)
    if (antes === undefined) por.set(k, i)
    canon[i] = antes ?? i
  }
  return canon
}

/** Normales por vértice, promediando las caras con su área, sobre vértices ya soldados. */
export function normalesDeVertice(pos, tri, canon, vertices) {
  const n = new Float64Array(vertices * 3)
  for (let t = 0; t < tri.length; t += 3) {
    const a = canon[tri[t]], b = canon[tri[t + 1]], c = canon[tri[t + 2]]
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2]
    const vx = pos[c * 3] - pos[a * 3], vy = pos[c * 3 + 1] - pos[a * 3 + 1], vz = pos[c * 3 + 2] - pos[a * 3 + 2]
    // El producto cruzado ya pesa por el área de la cara.
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    for (const i of [a, b, c]) {
      n[i * 3] += nx
      n[i * 3 + 1] += ny
      n[i * 3 + 2] += nz
    }
  }
  for (let i = 0; i < vertices; i++) {
    const l = Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]) || 1
    n[i * 3] /= l
    n[i * 3 + 1] /= l
    n[i * 3 + 2] /= l
  }
  return n
}

/** Vecinos por arista, sobre vértices soldados. */
export function vecinosDe(tri, canon, vertices) {
  const conjuntos = Array.from({ length: vertices }, () => new Set())
  for (let t = 0; t < tri.length; t += 3) {
    const v = [canon[tri[t]], canon[tri[t + 1]], canon[tri[t + 2]]]
    for (let i = 0; i < 3; i++) {
      conjuntos[v[i]].add(v[(i + 1) % 3])
      conjuntos[v[i]].add(v[(i + 2) % 3])
    }
  }
  return conjuntos.map((s) => Int32Array.from(s))
}

/**
 * Reparte lo que cada vértice **necesita** subir entre sus vecinos, de modo que
 * la piel se hinche como una lona y no como una aguja.
 *
 * Es `d[v] = max(necesita[v], amortiguacion · media(d[vecinos]))` repetido: nunca
 * baja de lo que hace falta en su sitio, y a su alrededor decae con la distancia.
 * Sin la media, subir un vértice dejaría un pico de un centímetro rodeado de piel
 * intacta; con una media sin tope (`amortiguacion = 1`), un hueso que asoma
 * levantaría el cuerpo entero. La amortiguación fija cuánto se extiende.
 */
export function relajarEmpuje(necesita, vecinos, { amortiguacion = 0.9, vueltas = 80 } = {}) {
  const n = necesita.length
  const d = Float64Array.from(necesita, (x) => Math.max(0, x))
  for (let k = 0; k < vueltas; k++) {
    let cambio = 0
    for (let v = 0; v < n; v++) {
      const ve = vecinos[v]
      if (ve.length === 0) continue
      let suma = 0
      for (const w of ve) suma += d[w]
      const nuevo = Math.max(Math.max(0, necesita[v]), (amortiguacion * suma) / ve.length)
      cambio = Math.max(cambio, Math.abs(nuevo - d[v]))
      d[v] = nuevo
    }
    if (cambio < 1e-7) break
  }
  return d
}

/**
 * El menor campo de subida que no baja de lo que cada vértice **necesita** y que no cambia más de `pendiente`
 * metros por metro entre dos vecinos (D-228): una tienda de campaña sobre cada punto que asoma, con una pendiente
 * que se elige, y no un cono con la que sale.
 *
 * `relajarEmpuje` no sirve donde lo que asoma es pequeño y aislado, como el cartílago de un ala de la nariz: el
 * punto pide 12 mm, la media de sus vecinos le da a cada uno poco más de uno, y entre dos vértices de 4 mm
 * la piel pasa de 12 mm a 3: un diente. Aquí la subida de un vértice nunca baja más de `pendiente · distancia`
 * respecto a la de su vecino, y el diente es una loma. Se resuelve como una transformada de distancia: barridos de ida
 * y vuelta hasta que nada cambia (Gauss-Seidel, unos pocos si lo que asoma está en una zona pequeña).
 */
export function envolventeConPendiente(necesita, vecinos, posiciones, pendiente, { barridos = 400 } = {}) {
  const n = necesita.length
  const d = Float64Array.from(necesita, (x) => Math.max(0, x))
  for (let b = 0; b < barridos; b++) {
    let cambio = 0
    const ida = b % 2 === 0
    for (let k = 0; k < n; k++) {
      const v = ida ? k : n - 1 - k
      const ve = vecinos[v]
      let mejor = d[v]
      for (let j = 0; j < ve.length; j++) {
        const w = ve[j]
        if (d[w] <= mejor) continue
        const largo = Math.hypot(posiciones[v * 3] - posiciones[w * 3], posiciones[v * 3 + 1] - posiciones[w * 3 + 1], posiciones[v * 3 + 2] - posiciones[w * 3 + 2])
        const candidato = d[w] - pendiente * largo
        if (candidato > mejor) mejor = candidato
      }
      if (mejor > d[v]) {
        cambio = Math.max(cambio, mejor - d[v])
        d[v] = mejor
      }
    }
    if (cambio < 1e-7) break
  }
  return d
}

/**
 * Las normales de los vértices `activos` promediadas con las de sus vecinos, `vueltas` veces (D-228), para que los
 * vértices que suben juntos suban casi en paralelo.
 *
 * En lo cóncavo —la base de la nariz, donde la punta se pliega sobre el labio— las normales de dos vértices vecinos
 * convergen, y subirlos a lo largo de ellas junta sus posiciones hasta que una cara se da la vuelta. El freno de
 * `recalcular-piel.mjs` lo evita partiendo el paso de esos vértices a la mitad o anulándolo, y el vértice frenado
 * queda 5 mm por debajo de los de su alrededor: un diente hacia dentro, que con la luz de lado se ve como un trozo
 * roto. Si todos suben en la misma dirección, la piel se traslada y la cara no se da la vuelta, así que el freno no
 * tiene a quién frenar. Los vértices que no son `activos` conservan la suya, y las unitarias salen unitarias.
 */
export function suavizarNormales(normales, vecinos, activos, vueltas = 8) {
  let actual = Float64Array.from(normales)
  for (let k = 0; k < vueltas; k++) {
    const siguiente = Float64Array.from(actual)
    for (let v = 0; v < activos.length; v++) {
      if (!activos[v]) continue
      let x = actual[v * 3], y = actual[v * 3 + 1], z = actual[v * 3 + 2]
      for (const w of vecinos[v]) {
        x += actual[w * 3]
        y += actual[w * 3 + 1]
        z += actual[w * 3 + 2]
      }
      const l = Math.hypot(x, y, z) || 1
      siguiente[v * 3] = x / l
      siguiente[v * 3 + 1] = y / l
      siguiente[v * 3 + 2] = z / l
    }
    actual = siguiente
  }
  return actual
}

/**
 * Un buscador de «dentro o fuera» y de «a cuánto» sobre una cáscara.
 *
 * `dentro(x, y, z)` lanza tres rayos, uno por eje, y se queda con lo que digan
 * dos de ellos. Con uno solo bastaba si la cáscara fuera una superficie cerrada
 * y sin cruzarse, pero la piel del atlas es la unión de varias —la cara, las
 * orejas, las manos— que se solapan en sus encuentros: un rayo que pasa por una
 * zona solapada cruza cuatro veces en vez de una, y un punto del abdomen salía
 * «fuera» de la piel por un rayo vertical que atravesaba la cara. Se midió: a
 * 3 cm de la piel, esos puntos pedían empujes de 3 cm. Una votación de tres
 * rayos por ejes distintos no coincide en fallar en el mismo sitio. Desde D-224
 * cada rayo cuenta vueltas y no paridad (ver `vueltas`), que ya no se equivoca en
 * los solapes; la votación sigue haciendo falta por los agujeros de la piel —la
 * boca, los ojos, las fosas nasales—, por donde un rayo sale sin cruzar nada.
 *
 * Se desplaza el punto una fracción de micra para no caer justo sobre una
 * arista, donde el rayo cruzaría dos caras o ninguna. `cercano(x, y, z, maximo)`
 * da el triángulo más próximo, su punto y la distancia, o `null` si no hay ninguno
 * a menos de `maximo`.
 *
 * `cercano` admite un `lado`: +1 solo mira las caras que tienen el punto por
 * delante (por fuera), -1 solo las que lo tienen por detrás (por dentro), 0 todas.
 * Hace falta porque la piel se toca consigo misma —un dedo contra el de al lado,
 * el brazo contra el costado—: un punto dentro de un dedo puede tener más cerca
 * la cara del dedo vecino, que lo mira de espaldas. Empujar esa cara «para darle
 * holgura» la mete en el dedo; la primera versión lo hacía, y cada pasada
 * empeoraba la anterior.
 *
 * `tambienEnterradas` marca, cara a cara, otras que tampoco se miran: las de la
 * cara de dentro de la piel cuya cara de fuera está enterrada. La de dentro es
 * una copia de la de fuera hundida unas décimas, y donde la de fuera se toca
 * consigo misma —el ángulo del ojo— la copia se toca igual, pero a una distancia
 * que su propio buscador ya no ve como enterrada. Un punto de la fascia temporal
 * metido en ese pliegue, a 1,14 mm bajo la piel que se ve, quedaba 0,02 mm por
 * encima de la copia del pliegue, y ninguna cara de dentro lo podía arreglar: el
 * pliegue tiene 0,11 mm de grueso y el punto está entre sus dos hojas.
 */
export function crearBuscador(pos, tri, { celda = 0.02, tambienEnterradas = null } = {}) {
  const nt = tri.length / 3
  const clave = (i, j, l) => (i + 512) * 1048576 + (j + 512) * 1024 + (l + 512)
  const rej3 = new Map()
  // Una rejilla por eje de rayo: la del rayo en Y mira el plano XZ, etc.
  const rej2 = [new Map(), new Map(), new Map()]
  const plano = [
    [1, 2],
    [2, 0],
    [0, 1],
  ]
  // El centro de cada cara y lo que se aleja de él: una celda trae decenas de caras y casi todas quedan
  // más lejos que lo ya encontrado; con esto se descartan sin calcular su punto más cercano.
  const centro = new Float64Array(nt * 3)
  const radio = new Float64Array(nt)
  for (let t = 0; t < nt; t++) {
    const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3
    const lo = [0, 1, 2].map((k) => Math.min(pos[a + k], pos[b + k], pos[c + k]))
    const hi = [0, 1, 2].map((k) => Math.max(pos[a + k], pos[b + k], pos[c + k]))
    for (let k = 0; k < 3; k++) centro[t * 3 + k] = (pos[a + k] + pos[b + k] + pos[c + k]) / 3
    for (const v of [a, b, c]) {
      radio[t] = Math.max(radio[t], Math.hypot(pos[v] - centro[t * 3], pos[v + 1] - centro[t * 3 + 1], pos[v + 2] - centro[t * 3 + 2]))
    }
    for (let i = Math.floor(lo[0] / celda); i <= Math.floor(hi[0] / celda); i++) {
      for (let j = Math.floor(lo[1] / celda); j <= Math.floor(hi[1] / celda); j++) {
        for (let l = Math.floor(lo[2] / celda); l <= Math.floor(hi[2] / celda); l++) {
          const k3 = clave(i, j, l)
          ;(rej3.get(k3) ?? rej3.set(k3, []).get(k3)).push(t)
        }
      }
    }
    for (let e = 0; e < 3; e++) {
      const [u, v] = plano[e]
      for (let i = Math.floor(lo[u] / celda); i <= Math.floor(hi[u] / celda); i++) {
        for (let j = Math.floor(lo[v] / celda); j <= Math.floor(hi[v] / celda); j++) {
          const k2 = clave(i, 0, j)
          ;(rej2[e].get(k2) ?? rej2[e].set(k2, []).get(k2)).push(t)
        }
      }
    }
  }
  /**
   * Cuántas vueltas da la cáscara alrededor del punto, contadas por el rayo que sale de él hacia +eje: cada cara
   * que cruza suma uno si sale (su normal apunta como el rayo) y resta uno si entra. Fuera da cero, dentro uno, y
   * dentro de dos cáscaras que se solapan, dos.
   *
   * Antes se contaba la paridad de los cruces, y eso es lo mismo mientras nada se solape. Pero empujar la piel de
   * un dedo que roza el muslo la mete en el muslo, y en lo que queda dentro de los dos la paridad da «fuera»: el
   * punto pedía más empuje, el dedo entraba más y la pasada siguiente salía peor que la anterior (D-224). Con las
   * vueltas, lo de dentro es lo que está dentro de alguna, que es lo que se ve desde fuera.
   */
  const vueltas = (p, e) => {
    const [u, v] = plano[e]
    const pu = p[u] + 1.3e-7
    const pv = p[v] + 0.7e-7
    const lista = rej2[e].get(clave(Math.floor(pu / celda), 0, Math.floor(pv / celda)))
    if (!lista) return 0
    let suma = 0
    for (const t of lista) {
      const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3
      const au = pos[a + u] - pu, av = pos[a + v] - pv
      const bu = pos[b + u] - pu, bv = pos[b + v] - pv
      const cu = pos[c + u] - pu, cv = pos[c + v] - pv
      const d1 = au * bv - av * bu, d2 = bu * cv - bv * cu, d3 = cu * av - cv * au
      if (!((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0))) continue
      // El área con signo del triángulo proyectado: su signo es el de la componente de la normal sobre el eje
      // (los tres planos están en orden cíclico, así que la proyección no da la vuelta a ninguno).
      const area = d1 + d2 + d3
      if (area === 0) continue
      const w = (d2 * pos[a + e] + d3 * pos[b + e] + d1 * pos[c + e]) / area
      if (w > p[e]) suma += area > 0 ? 1 : -1
    }
    return suma
  }
  const dentro = (x, y, z) => {
    const p = [x, y, z]
    return Number(vueltas(p, 0) > 0) + Number(vueltas(p, 1) > 0) + Number(vueltas(p, 2) > 0) >= 2
  }
  /**
   * Las caras enterradas: las que tienen delante, a una décima de milímetro, otra parte de la piel. Son las del
   * dedo que se metió en el muslo, y desde fuera no se ven. `cercano` no las mira: un punto del muslo que tiene
   * más cerca la cara enterrada del dedo que la del muslo no está a esa distancia de la piel, sino de la del muslo.
   */
  const enterrada = new Uint8Array(nt)
  for (let t = 0; t < nt; t++) {
    const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const largo = Math.hypot(nx, ny, nz)
    if (largo === 0) continue
    const fuera = 1e-4 / largo
    if (dentro(centro[t * 3] + nx * fuera, centro[t * 3 + 1] + ny * fuera, centro[t * 3 + 2] + nz * fuera)) enterrada[t] = 1
  }
  if (tambienEnterradas) for (let t = 0; t < nt; t++) if (tambienEnterradas[t]) enterrada[t] = 1
  // Qué triángulos ya miró la consulta en curso: un sello por consulta en vez de un `Set` nuevo, que
  // con la piel de D-224 (cien mil caras) y un millón de puntos era la mitad del tiempo.
  const visto = new Uint32Array(nt)
  let consulta = 0
  /**
   * Busca por anillos de celdas, del más cercano hacia fuera, y para en cuanto lo encontrado está
   * más cerca que cualquier celda que quede por mirar. Recorrer el cubo entero de `maximo` daba el
   * mismo resultado y costaba mil celdas por punto.
   */
  const cercano = (x, y, z, maximo, lado = 0) => {
    let mejor = null
    let md = maximo * maximo
    const r = Math.ceil(maximo / celda)
    const ci = Math.floor(x / celda), cj = Math.floor(y / celda), cl = Math.floor(z / celda)
    // Lo que queda de la celda propia hasta su borde: un anillo k está al menos a (k − 1)·celda + eso.
    const holguraEnLaCelda = Math.min(x - ci * celda, (ci + 1) * celda - x, y - cj * celda, (cj + 1) * celda - y, z - cl * celda, (cl + 1) * celda - z)
    consulta = (consulta + 1) >>> 0 || 1
    const mirar = (i, j, l) => {
      const q = rej3.get(clave(ci + i, cj + j, cl + l))
      if (!q) return
      for (const t of q) {
        if (visto[t] === consulta) continue
        visto[t] = consulta
        if (enterrada[t]) continue
        const hasta = Math.hypot(centro[t * 3] - x, centro[t * 3 + 1] - y, centro[t * 3 + 2] - z) - radio[t]
        if (hasta > 0 && hasta * hasta >= md) continue
        const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3
        const p = cercanoEnTriangulo(x, y, z, pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], pos[c], pos[c + 1], pos[c + 2])
        const d = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2
        if (d >= md) continue
        // La normal de la cara (producto cruzado) contra el vector de la cara al punto.
        const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
        const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
        const frente = (uy * vz - uz * vy) * (x - p[0]) + (uz * vx - ux * vz) * (y - p[1]) + (ux * vy - uy * vx) * (z - p[2])
        if (lado !== 0 && frente * lado < 0) continue
        md = d
        mejor = { triangulo: t, punto: p, distancia: Math.sqrt(d), detras: frente < 0 }
      }
    }
    for (let k = 0; k <= r; k++) {
      if (mejor && (k - 1) * celda + holguraEnLaCelda >= mejor.distancia) break
      for (let i = -k; i <= k; i++) {
        for (let j = -k; j <= k; j++) {
          if (Math.abs(i) === k || Math.abs(j) === k) {
            for (let l = -k; l <= k; l++) mirar(i, j, l)
          } else {
            mirar(i, j, -k)
            if (k > 0) mirar(i, j, k)
          }
        }
      }
    }
    return mejor
  }
  return { dentro, cercano, enterrada, enterradas: () => enterrada.reduce((n, e) => n + e, 0) }
}

/**
 * A qué profundidad bajo la piel queda un punto: positiva dentro, negativa fuera, y el
 * triángulo que la rige. `null` si la piel está a más de `alcance`.
 *
 * Lo directo es mirar si está dentro y buscar la cara más cercana del lado que toca, y así
 * lo hacía el `empujeNecesario` de D-159. Esto es lo mismo con dos atajos. Uno: casi todos
 * los puntos están por debajo de la cara más cercana y a más de `seguro`, y para esos
 * basta esa cara. No puede
 * dar por bueno un punto que no lo está: un punto de fuera tiene la cara más cercana por
 * delante, salvo donde la piel se toca consigo misma —un dedo contra otro— y allí la cara
 * de enfrente es la del dedo vecino, que está dentro de la piel igualmente.
 *
 * El otro: la cara más cercana se busca primero solo hasta `cerca`. Lo que no tiene
 * ninguna a esa distancia y está dentro queda a `cerca` por lo menos, y de un punto así no
 * hace falta saber más; se devuelve esa cota, sin triángulo (-1). Buscar hasta `alcance`
 * recorría cientos de celdas vacías por punto: con la piel de D-224 y tres millones de
 * puntos, 155 s por pasada.
 */
export function profundidadBajoLaPiel(buscador, x, y, z, alcance, seguro = 0) {
  const cerca = Math.min(alcance, Math.max(2 * seguro, 0.004))
  const primera = buscador.cercano(x, y, z, cerca)
  if (primera && primera.detras && primera.distancia >= seguro) return { profundidad: primera.distancia, triangulo: primera.triangulo }
  const adentro = buscador.dentro(x, y, z)
  if (!primera && adentro) return { profundidad: cerca, triangulo: -1 }
  const m = buscador.cercano(x, y, z, alcance, adentro ? -1 : 1)
  if (!m) return adentro ? { profundidad: alcance, triangulo: primera?.triangulo ?? -1 } : null
  return { profundidad: adentro ? m.distancia : -m.distancia, triangulo: m.triangulo }
}

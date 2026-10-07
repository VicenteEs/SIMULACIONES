/**
 * La geometría que necesita `ajustar-piel.mjs`, sin tocar archivos.
 *
 * Está aparte para poder probarla con una cáscara sintética
 * (`tests/unit/geometriaDePiel.test.ts`) y no solo mirando el atlas: un guion
 * que reescribe la piel del cuerpo y cuya única prueba es «se ve bien» no se
 * puede arreglar con confianza.
 *
 * Todo trabaja con `Float32Array` de posiciones (x, y, z seguidos) y `Uint32Array`
 * de índices, que es como vive la piel en los paquetes del atlas.
 */

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

/**
 * Separa la piel en sus cáscaras por conectividad y se queda con las dos grandes.
 *
 * La piel de BodyParts3D no es una lámina: son dos superficies, la de fuera y una
 * de dentro, a unos 3 mm, con las caras hacia el cuerpo. Lo único que las
 * distingue sin mirar el dibujo es el signo del volumen que encierran: positivo,
 * la exterior; negativo, la interior. Medir contra las dos juntas, como se hizo
 * la primera vez, da la mitad de los puntos «por fuera de la piel».
 *
 * @returns {{ exterior: Uint32Array, interior: Uint32Array }} triángulos (índices) de cada una
 */
export function cascarasDeLaPiel(pos, idx, vertices) {
  const padre = new Int32Array(vertices).map((_, i) => i)
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
  const cuenta = new Map()
  const volumen = new Map()
  for (let i = 0; i < vertices; i++) cuenta.set(raiz(i), (cuenta.get(raiz(i)) ?? 0) + 1)
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    const v =
      (pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1]) -
        pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c]) +
        pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c])) / 6
    const r = raiz(idx[t])
    volumen.set(r, (volumen.get(r) ?? 0) + v)
  }
  const mayor = (signo) => {
    let mejor = -1
    let n = 0
    for (const [r, k] of cuenta) {
      if (Math.sign(volumen.get(r) ?? 0) === signo && k > n) {
        mejor = r
        n = k
      }
    }
    return mejor
  }
  const quedarse = (r) => {
    const salida = []
    for (let t = 0; t < idx.length; t += 3) if (raiz(idx[t]) === r) salida.push(idx[t], idx[t + 1], idx[t + 2])
    return Uint32Array.from(salida)
  }
  const exterior = mayor(1)
  const interior = mayor(-1)
  if (exterior < 0) throw new Error('La piel no tiene una cáscara exterior (volumen positivo).')
  return { exterior: quedarse(exterior), interior: interior < 0 ? new Uint32Array(0) : quedarse(interior) }
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
 * Un buscador de «dentro o fuera» y de «a cuánto» sobre una cáscara.
 *
 * `dentro(x, y, z)` lanza tres rayos, uno por eje, y se queda con lo que digan
 * dos de ellos. Con uno solo bastaba si la cáscara fuera una superficie cerrada
 * y sin cruzarse, pero la piel del atlas es la unión de varias —la cara, las
 * orejas, las manos— que se solapan en sus encuentros: un rayo que pasa por una
 * zona solapada cruza cuatro veces en vez de una, y un punto del abdomen salía
 * «fuera» de la piel por un rayo vertical que atravesaba la cara. Se midió: a
 * 3 cm de la piel, esos puntos pedían empujes de 3 cm. Una votación de tres
 * rayos por ejes distintos no coincide en fallar en el mismo sitio.
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
 */
export function crearBuscador(pos, tri, { celda = 0.02 } = {}) {
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
  for (let t = 0; t < nt; t++) {
    const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3
    const lo = [0, 1, 2].map((k) => Math.min(pos[a + k], pos[b + k], pos[c + k]))
    const hi = [0, 1, 2].map((k) => Math.max(pos[a + k], pos[b + k], pos[c + k]))
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
  /** ¿El rayo que sale del punto hacia +eje cruza un número impar de caras? */
  const rayo = (p, e) => {
    const [u, v] = plano[e]
    const pu = p[u] + 1.3e-7
    const pv = p[v] + 0.7e-7
    const lista = rej2[e].get(clave(Math.floor(pu / celda), 0, Math.floor(pv / celda)))
    if (!lista) return false
    let cruces = 0
    for (const t of lista) {
      const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3
      const au = pos[a + u] - pu, av = pos[a + v] - pv
      const bu = pos[b + u] - pu, bv = pos[b + v] - pv
      const cu = pos[c + u] - pu, cv = pos[c + v] - pv
      const d1 = au * bv - av * bu, d2 = bu * cv - bv * cu, d3 = cu * av - cv * au
      if (!((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0))) continue
      const area = d1 + d2 + d3
      if (area === 0) continue
      const w = (d2 * pos[a + e] + d3 * pos[b + e] + d1 * pos[c + e]) / area
      if (w > p[e]) cruces++
    }
    return (cruces & 1) === 1
  }
  const dentro = (x, y, z) => {
    const p = [x, y, z]
    return Number(rayo(p, 0)) + Number(rayo(p, 1)) + Number(rayo(p, 2)) >= 2
  }
  const cercano = (x, y, z, maximo, lado = 0) => {
    let mejor = null
    let md = maximo * maximo
    const r = Math.ceil(maximo / celda)
    const ci = Math.floor(x / celda), cj = Math.floor(y / celda), cl = Math.floor(z / celda)
    const vistos = new Set()
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        for (let l = -r; l <= r; l++) {
          const q = rej3.get(clave(ci + i, cj + j, cl + l))
          if (!q) continue
          for (const t of q) {
            if (vistos.has(t)) continue
            vistos.add(t)
            const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3
            const p = cercanoEnTriangulo(x, y, z, pos[a], pos[a + 1], pos[a + 2], pos[b], pos[b + 1], pos[b + 2], pos[c], pos[c + 1], pos[c + 2])
            const d = (p[0] - x) ** 2 + (p[1] - y) ** 2 + (p[2] - z) ** 2
            if (d >= md) continue
            if (lado !== 0) {
              // La normal de la cara (producto cruzado) contra el vector de la cara al punto.
              const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2]
              const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2]
              const frente =
                (uy * vz - uz * vy) * (x - p[0]) + (uz * vx - ux * vz) * (y - p[1]) + (ux * vy - uy * vx) * (z - p[2])
              if (frente * lado < 0) continue
            }
            md = d
            mejor = { triangulo: t, punto: p, distancia: Math.sqrt(d) }
          }
        }
      }
    }
    return mejor
  }
  return { dentro, cercano }
}

/**
 * Cuánto hay que subir la piel para que `(x, y, z)` quede `holgura` metros por
 * debajo de ella, y qué triángulo la rige. Positivo: hay que subirla; cero o
 * negativo: ya queda de sobra. `null` si la piel está a más de `alcance`.
 */
export function empujeNecesario(buscador, x, y, z, holgura, alcance) {
  const adentro = buscador.dentro(x, y, z)
  const m = buscador.cercano(x, y, z, alcance, adentro ? -1 : 1)
  if (!m) return null
  const profundidad = adentro ? m.distancia : -m.distancia
  return { empuje: holgura - profundidad, triangulo: m.triangulo }
}

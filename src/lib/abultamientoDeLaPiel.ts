/**
 * Cuánto se hincha la piel sobre lo que tiene debajo (P-013, pedidos 1 y 8 de Cristóbal).
 *
 * - 1: «con el nylon también tuve problemas: al cerrar, la mitad de la placa quedó afuera de la piel».
 * - 8: «hacer que la piel se hinche y no que el fragmento óseo se salga por encima de ella».
 *
 * La piel del modelo está hecha para cubrir el hueso en su sitio, no un hueso desplazado ni una placa de 3 o 4 mm sobre un
 * peroné que tiene apenas la piel encima. Cerrar la herida devolvía los labios a donde estaban, y lo que sobresalía quedaba
 * fuera. Aquí se calcula cuánto tiene que subir cada vértice de la piel para que lo de debajo quede tapado; el lienzo lo
 * suma a la piel como la última capa de todo lo que la mueve (`abultamientoEnLaEscena.ts`).
 *
 * Es una cuenta de geometría, sin three ni escena, y en milímetros del mundo: así se prueba sola.
 */

/**
 * Lo que la cara de fuera de la piel queda, como poco, por encima de lo que tiene debajo: la dermis (`DERMIS_MM`, 2 mm) y
 * la holgura de la cara de dentro. La grasa se aplasta: sobre una placa la piel queda con su dermis y nada más, que es lo
 * que hace la grasa donde no cabe (D-331).
 */
export const HOLGURA_DE_LA_CARA_DE_FUERA_MM = 2.8
/** Lo que la cara de dentro queda por encima de lo que tiene debajo: la misma holgura que le dio D-331 (`HOLGURA_DE_DENTRO`). */
export const HOLGURA_DE_LA_CARA_DE_DENTRO_MM = 0.8
/**
 * Hasta dónde, de lado, se reparte lo que sube un punto: la piel no hace un pico sobre el borde de la placa, se tiende sobre
 * ella como una sábana. Doce milímetros: el ancho de una placa de 3,5 y algo más, para que la caída a cada lado sea suave.
 */
export const RADIO_DEL_ABULTAMIENTO_MM = 12
/**
 * Más que esto no sube: un trozo lanzado lejos del hueso no estira la piel hasta él. Ya es más de lo que se tiende una piel
 * de verdad, y es a propósito: en el simulador las partes blandas no acompañan al trozo, y la piel tapa lo que en el
 * paciente taparía todo lo demás. Un peroné que se arrastra buscando su sitio sale 10 o 20 mm, y queda tapado.
 *
 * Se probó con 50: el trozo distal del caso de prueba, desplazado 12,5 y 18 mm y girado 9,8°, asoma unos 45 mm por el
 * maléolo, y la piel se tendía hacia la otra pierna como una cortina. Es peor que ver el hueso: un desplazamiento así es
 * el de una fractura abierta, y así se ve.
 */
export const ABULTAMIENTO_MAXIMO_MM = 30
/**
 * Lo más empinada que queda la piel tendida, en milímetros que sube por milímetro de piel (`tenderLaPiel`): 1, cuarenta y
 * cinco grados. La campana sola hace bien un bulto de una placa; uno de cuarenta milímetros con doce de radio era un dedo.
 */
export const PENDIENTE_DE_LA_PIEL = 1
/**
 * Hasta dónde, hacia fuera, se mira lo que empuja. Pasado el máximo, la piel suelta el trozo poco a poco a lo largo de un
 * radio más, y aquí ya no lo ve: está fuera del cuerpo, y una tienda de 30 mm apuntando a un hueso que flota a ocho
 * centímetros no tapa nada. Se suelta sin saltos porque el trozo se arrastra: un salto se vería en cada cuadro.
 *
 * Antes de este alcance lo decidía la rejilla, entre 12 y 24 mm según dónde cayera el vértice dentro de su celda: con un
 * trozo a 15 o 20 mm, unos vértices todavía lo veían y los de al lado ya no, y la piel se rompía en dientes.
 */
export const ALCANCE_MM = ABULTAMIENTO_MAXIMO_MM + RADIO_DEL_ABULTAMIENTO_MM
/**
 * Cada cuánto se toma un punto de la superficie de lo que empuja: la placa recta tiene caras largas, sin vértices en medio.
 * Empezó en 1,5 mm, y con la tibia distal desplazada eran 12 000 puntos y casi millón y medio de comprobaciones en cada
 * cuadro del arrastre: 27 ms. A 3 mm son la cuarta parte; lo que se pierde de alto entre dos puntos lo tapa la meseta.
 */
export const PASO_DE_LAS_MUESTRAS_MM = 3
/**
 * La campana no baja hasta pasada esta distancia de lado: lo que haya entre dos puntos de lo que empuja sube como ellos.
 * Sin meseta, con un punto cada 3 mm la piel se ondulaba sobre un trozo grande —un 7 % de su alto en el centro de cada
 * cuadro de puntos—, y sobre un bulto de 10 mm eso se ve como una piel de naranja.
 */
export const MESETA_DEL_ABULTAMIENTO_MM = 2.5

/** Los vértices de la piel que pueden subir, ya en el mundo y en milímetros. */
export interface PielQueSeAbulta {
  /** x, y, z de cada vértice. */
  posiciones: Float32Array
  /**
   * Hacia dónde sube cada uno, unitario: la normal en la cara de fuera; en la de dentro, que mira al cuerpo, la contraria.
   * Las dos caras suben hacia fuera, cada una con su holgura.
   */
  haciaFuera: Float32Array
  /** Lo que tiene que quedar por encima de lo de debajo, en mm, vértice por vértice. */
  holguras: Float32Array
}

const campana = (x: number) => (x >= 1 ? 0 : 0.5 * (1 + Math.cos(Math.PI * x)))

/**
 * Los puntos de lo que empuja por celdas de `lado`, en un arreglo denso que cubre las celdas ocupadas: la celda `c` tiene
 * sus puntos de `inicio[c]` a `inicio[c + 1]`, y sus coordenadas seguidas en `xyz`. Se consulta decenas de veces por
 * vértice y en cada cuadro de un arrastre: con un `Map` y los puntos leídos salteados de donde venían, la piel tardaba
 * 27 ms en cada cuadro con la tibia distal desplazada.
 */
interface Rejilla {
  lado: number
  min: [number, number, number]
  max: [number, number, number]
  inicio: Uint32Array
  xyz: Float32Array
}

/** Más celdas que esto no: los puntos de lo que empuja ya vienen recortados a la piel, y esto es por si no bastara. */
const CELDAS_MAXIMAS = 1 << 21

const indiceDe = (g: Pick<Rejilla, 'min' | 'max'>, x: number, y: number, z: number) =>
  ((x - g.min[0]) * (g.max[1] - g.min[1] + 1) + (y - g.min[1])) * (g.max[2] - g.min[2] + 1) + (z - g.min[2])

/**
 * La rejilla de los puntos `cuales`. Si hicieran falta demasiadas celdas —puntos repartidos por metros—, se agrandan hasta
 * caber: la cuenta sigue siendo la misma, con celdas más grandes se descarta menos de una vez.
 */
function rejilla(puntos: Float32Array, cuales: Uint32Array, ladoPedido: number): Rejilla {
  let lado = ladoPedido
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (;;) {
    min.fill(Infinity)
    max.fill(-Infinity)
    for (const k of cuales) {
      for (let e = 0; e < 3; e++) {
        const c = Math.floor(puntos[k * 3 + e] / lado)
        if (c < min[e]) min[e] = c
        if (c > max[e]) max[e] = c
      }
    }
    if ((max[0] - min[0] + 1) * (max[1] - min[1] + 1) * (max[2] - min[2] + 1) <= CELDAS_MAXIMAS) break
    lado *= 2
  }
  const total = (max[0] - min[0] + 1) * (max[1] - min[1] + 1) * (max[2] - min[2] + 1)
  const g: Rejilla = { lado, min, max, inicio: new Uint32Array(total + 1), xyz: new Float32Array(cuales.length * 3) }
  const celdaDe = (k: number) =>
    indiceDe(g, Math.floor(puntos[k * 3] / lado), Math.floor(puntos[k * 3 + 1] / lado), Math.floor(puntos[k * 3 + 2] / lado))
  for (const k of cuales) g.inicio[celdaDe(k) + 1]++
  for (let c = 0; c < total; c++) g.inicio[c + 1] += g.inicio[c]
  const lleno = g.inicio.slice(0, total)
  for (const k of cuales) {
    const j = lleno[celdaDe(k)]++
    g.xyz[j * 3] = puntos[k * 3]
    g.xyz[j * 3 + 1] = puntos[k * 3 + 1]
    g.xyz[j * 3 + 2] = puntos[k * 3 + 2]
  }
  return g
}

/** Los puntos que pueden empujar algún vértice: dentro de la caja de la piel agrandada con lo que alcanza un punto. */
function puntosCercaDeLaPiel(piel: Float32Array, empujan: Float32Array, margen: number): Uint32Array {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < piel.length; i++) {
    const e = i % 3
    if (piel[i] < min[e]) min[e] = piel[i]
    if (piel[i] > max[e]) max[e] = piel[i]
  }
  const cuales: number[] = []
  for (let k = 0; k < empujan.length / 3; k++) {
    let dentro = true
    for (let e = 0; e < 3 && dentro; e++) dentro = empujan[k * 3 + e] >= min[e] - margen && empujan[k * 3 + e] <= max[e] + margen
    if (dentro) cuales.push(k)
  }
  return Uint32Array.from(cuales)
}

/**
 * Cuánto sube cada vértice, en mm, a lo largo de su `haciaFuera`.
 *
 * Por cada punto de lo que empuja que cae en la columna del vértice —a menos de `radio` de la recta que sale de él hacia
 * fuera—, lo que el punto sobresale de la holgura (`s + holgura`, con `s` la altura del punto sobre el vértice, y nunca más
 * que el máximo) pesado por una campana de la distancia de lado, plana en la meseta. Manda el mayor: sobre la placa sube lo que pide la placa,
 * y a los lados cae solo. Lo que está hondo, por debajo de la holgura, no pide nada; lo que está más allá del máximo se
 * va soltando hasta `ALCANCE_MM` (máximo + radio).
 *
 * Se miran solo las celdas que toca la columna de cada vértice, de la holgura hacia dentro hasta el alcance hacia fuera, y
 * recortadas a las que tienen puntos: el alcance es el mismo para todos los vértices, caiga cada uno donde caiga.
 */
export function abultamientoMm(
  piel: PielQueSeAbulta,
  empujan: Float32Array,
  {
    radioMm = RADIO_DEL_ABULTAMIENTO_MM,
    maximoMm = ABULTAMIENTO_MAXIMO_MM,
    mesetaMm = MESETA_DEL_ABULTAMIENTO_MM,
  }: { radioMm?: number; maximoMm?: number; mesetaMm?: number } = {},
): Float32Array {
  const n = Math.floor(piel.posiciones.length / 3)
  const salida = new Float32Array(n)
  if (empujan.length < 3 || n === 0) return salida
  const r2 = radioMm * radioMm
  const alcance = maximoMm + radioMm
  const meseta = Math.min(mesetaMm, radioMm / 2)
  const caida = radioMm - meseta
  const cerca = puntosCercaDeLaPiel(piel.posiciones, empujan, alcance + radioMm)
  if (cerca.length === 0) return salida
  const g = rejilla(empujan, cerca, radioMm)
  const lado = g.lado
  const medio = lado / 2
  const radioDeLaCelda = (Math.sqrt(3) * lado) / 2
  /** Las celdas que toca la columna en un eje, de `a` a `b` y con el radio de lado, recortadas a las ocupadas. */
  const desde = (a: number, b: number, e: number) => Math.max(g.min[e], Math.floor((Math.min(a, b) - radioMm) / lado))
  const hasta = (a: number, b: number, e: number) => Math.min(g.max[e], Math.floor((Math.max(a, b) + radioMm) / lado))
  // La caja de todo lo que empuja (las celdas ocupadas), para descartar de una vez el vértice que lo tiene todo detrás.
  const centro = [0, 1, 2].map((e) => (g.min[e] + g.max[e] + 1) * medio)
  const mitad = [0, 1, 2].map((e) => (g.max[e] - g.min[e] + 1) * medio)
  for (let i = 0; i < n; i++) {
    const px = piel.posiciones[i * 3], py = piel.posiciones[i * 3 + 1], pz = piel.posiciones[i * 3 + 2]
    const ox = piel.haciaFuera[i * 3], oy = piel.haciaFuera[i * 3 + 1], oz = piel.haciaFuera[i * 3 + 2]
    const holgura = piel.holguras[i]
    // Lo más que asoma la caja por encima del vértice: si ni eso llega a la holgura, todo está hondo. Es lo que les pasa a
    // la piel del otro lado de la pierna y a la que tiene el hueso en su sitio debajo, que son casi todos los vértices.
    const asoma =
      (centro[0] - px) * ox + (centro[1] - py) * oy + (centro[2] - pz) * oz + Math.abs(ox) * mitad[0] + Math.abs(oy) * mitad[1] + Math.abs(oz) * mitad[2]
    if (asoma < -holgura) continue
    /** Lo que mide una celda a lo largo de la columna, de su centro a su cara más lejana. */
    const fondoDeLaCelda = (Math.abs(ox) + Math.abs(oy) + Math.abs(oz)) * medio
    const ax = px - holgura * ox, bx = px + alcance * ox
    const ay = py - holgura * oy, by = py + alcance * oy
    const az = pz - holgura * oz, bz = pz + alcance * oz
    const x0 = desde(ax, bx, 0), x1 = hasta(ax, bx, 0)
    const y0 = desde(ay, by, 1), y1 = hasta(ay, by, 1)
    const z0 = desde(az, bz, 2), z1 = hasta(az, bz, 2)
    let mayor = 0
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          const c = indiceDe(g, x, y, z)
          const primero = g.inicio[c], ultimo = g.inicio[c + 1]
          if (primero === ultimo) continue
          // La celda entera se descarta si todo lo suyo queda hondo, más allá del alcance, fuera de la columna o por
          // debajo de lo que ya se tiene: mirarla punto por punto es lo que cuesta.
          const qx = (x + 0.5) * lado - px, qy = (y + 0.5) * lado - py, qz = (z + 0.5) * lado - pz
          const sc = qx * ox + qy * oy + qz * oz
          if (sc + fondoDeLaCelda < -holgura || sc - fondoDeLaCelda >= alcance) continue
          if (Math.min(maximoMm, sc + fondoDeLaCelda + holgura) <= mayor) continue
          const ladoDeLaCelda2 = qx * qx + qy * qy + qz * qz - sc * sc
          if (ladoDeLaCelda2 > 0 && Math.sqrt(ladoDeLaCelda2) - radioDeLaCelda >= radioMm) continue
          for (let j = primero; j < ultimo; j++) {
            const dx = g.xyz[j * 3] - px, dy = g.xyz[j * 3 + 1] - py, dz = g.xyz[j * 3 + 2] - pz
            const s = dx * ox + dy * oy + dz * oz
            if (s >= alcance) continue
            const pide = Math.min(maximoMm, s + holgura)
            if (pide <= mayor) continue
            const lado2 = dx * dx + dy * dy + dz * dz - s * s
            if (lado2 >= r2) continue
            const suelta = s <= maximoMm ? 1 : campana((s - maximoMm) / radioMm)
            const valor = pide * campana(Math.max(0, Math.sqrt(Math.max(0, lado2)) - meseta) / caida) * suelta
            if (valor > mayor) mayor = valor
          }
        }
      }
    }
    salida[i] = mayor
  }
  return salida
}

/**
 * Puntos repartidos por la superficie de una malla, uno cada `paso` como mucho, en sus mismas unidades. Los vértices no
 * bastan: la placa recta generada tiene la cara de arriba con vértices solo en los orificios y en el contorno, y entre dos
 * orificios la piel volvía a bajar sobre el metal. Se reparte por cada triángulo según su lado más largo y después se deja
 * uno por celda de `paso`, que en un hueso con miles de triángulos chicos es lo que hace que la cuenta quepa en un cuadro.
 */
export function muestrasDeLaSuperficie(posiciones: ArrayLike<number>, indices: ArrayLike<number> | null, paso: number): Float32Array {
  const vistas = new Set<string>()
  const salida: number[] = []
  const poner = (x: number, y: number, z: number) => {
    const clave = `${Math.floor(x / paso)},${Math.floor(y / paso)},${Math.floor(z / paso)}`
    if (vistas.has(clave)) return
    vistas.add(clave)
    salida.push(x, y, z)
  }
  const nv = Math.floor(posiciones.length / 3)
  for (let i = 0; i < nv; i++) poner(posiciones[i * 3], posiciones[i * 3 + 1], posiciones[i * 3 + 2])
  const nt = indices ? Math.floor(indices.length / 3) : Math.floor(nv / 3)
  const vertice = (t: number, k: number) => (indices ? indices[t * 3 + k] : t * 3 + k)
  for (let t = 0; t < nt; t++) {
    const a = vertice(t, 0), b = vertice(t, 1), c = vertice(t, 2)
    const ax = posiciones[a * 3], ay = posiciones[a * 3 + 1], az = posiciones[a * 3 + 2]
    const bx = posiciones[b * 3], by = posiciones[b * 3 + 1], bz = posiciones[b * 3 + 2]
    const cx = posiciones[c * 3], cy = posiciones[c * 3 + 1], cz = posiciones[c * 3 + 2]
    const lado = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz))
    const partes = Math.min(64, Math.ceil(lado / paso))
    if (partes <= 1) continue
    for (let i = 0; i <= partes; i++) {
      for (let j = 0; j <= partes - i; j++) {
        const u = i / partes, v = j / partes, w = 1 - u - v
        poner(ax * w + bx * u + cx * v, ay * w + by * u + cy * v, az * w + bz * u + cz * v)
      }
    }
  }
  return Float32Array.from(salida)
}

/** Los vértices de la cara de dentro de la piel, a partir de sus triángulos (`triangulosHaciaDentro`): 1 si es de ella. */
export function verticesDeLaCaraDeDentro(haciaDentro: Uint8Array, indices: ArrayLike<number> | null, vertices: number): Uint8Array {
  const salida = new Uint8Array(vertices)
  for (let t = 0; t < haciaDentro.length; t++) {
    if (!haciaDentro[t]) continue
    for (let k = 0; k < 3; k++) salida[indices ? indices[t * 3 + k] : t * 3 + k] = 1
  }
  return salida
}

/**
 * Tiende la piel alrededor de lo que subió, para que en ninguna parte quede más empinada que `pendiente`: cada vértice sube,
 * como poco, lo que sube su vecino menos la pendiente por lo que los separa. Nunca baja ninguno, así que lo que tapaba lo
 * sigue tapando.
 *
 * Es un Dijkstra al revés, del más alto hacia abajo, por las aristas de la piel: la distancia es la de la piel y no la del
 * aire, y no cruza de una cara a la otra ni salta a la otra pierna. Solo recorre lo que cambia —el bulto y su falda—, que
 * con la tibia distal desplazada son unos pocos miles de vértices.
 *
 * `vecinos(k, visitar)` llama a `visitar(j)` con cada vecino de `k`; los índices son los de `sube` y `posiciones` (mm).
 */
export function tenderLaPiel(
  sube: Float32Array,
  posiciones: Float32Array,
  vecinos: (k: number, visitar: (j: number) => void) => void,
  pendiente = PENDIENTE_DE_LA_PIEL,
): Float32Array {
  const monticulo = new MonticuloDelMasAlto()
  for (let k = 0; k < sube.length; k++) if (sube[k] > 0) monticulo.poner(k, sube[k])
  for (;;) {
    const k = monticulo.sacar()
    if (k < 0) break
    const alto = monticulo.ultimoValor
    if (alto < sube[k]) continue
    vecinos(k, (j) => {
      const dx = posiciones[j * 3] - posiciones[k * 3]
      const dy = posiciones[j * 3 + 1] - posiciones[k * 3 + 1]
      const dz = posiciones[j * 3 + 2] - posiciones[k * 3 + 2]
      // Redondeado como lo guarda `sube`, que es de 32 bits: con el valor de 64, al sacarlo del montículo salía menor que el
      // guardado, el vértice se daba por viejo y la piel dejaba de tenderse más allá de él, con un escalón de 9 mm.
      const puede = Math.fround(alto - pendiente * Math.sqrt(dx * dx + dy * dy + dz * dz))
      // Una centésima de margen: sin ella, los redondeos vuelven a meter en el montículo vértices que ya están.
      if (puede > sube[j] + 0.01) {
        sube[j] = puede
        monticulo.poner(j, puede)
      }
    })
  }
  return sube
}

/** Un montículo binario de índices por su valor, el mayor arriba. */
class MonticuloDelMasAlto {
  private indices: number[] = []
  private valores: number[] = []
  /** El valor del último que se sacó. */
  ultimoValor = 0

  poner(indice: number, valor: number) {
    let i = this.indices.length
    this.indices.push(indice)
    this.valores.push(valor)
    while (i > 0) {
      const padre = (i - 1) >> 1
      if (this.valores[padre] >= valor) break
      this.indices[i] = this.indices[padre]
      this.valores[i] = this.valores[padre]
      i = padre
    }
    this.indices[i] = indice
    this.valores[i] = valor
  }

  /** El índice del mayor, o -1 si no queda ninguno. */
  sacar(): number {
    const n = this.indices.length
    if (n === 0) return -1
    const arriba = this.indices[0]
    this.ultimoValor = this.valores[0]
    const indice = this.indices.pop()!
    const valor = this.valores.pop()!
    if (n > 1) {
      let i = 0
      for (;;) {
        const a = i * 2 + 1
        if (a >= n - 1) break
        const b = a + 1
        const hijo = b < n - 1 && this.valores[b] > this.valores[a] ? b : a
        if (this.valores[hijo] <= valor) break
        this.indices[i] = this.indices[hijo]
        this.valores[i] = this.valores[hijo]
        i = hijo
      }
      this.indices[i] = indice
      this.valores[i] = valor
    }
    return arriba
  }
}

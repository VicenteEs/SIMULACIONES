import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

/**
 * La piel recalculada del atlas (D-224, que supera a D-159).
 *
 * Dos mitades. La geometría se prueba con esferas, que tienen respuesta
 * conocida: el centro está dentro, un punto lejano está fuera, un hueso a un
 * milímetro de la superficie está a un milímetro de profundidad. Y el atlas
 * real, con la misma comprobación con que lo escribe `recalcular-piel.mjs`
 * (`comprobarPiel.mjs`): que todo lo de dentro quede bajo la piel con su
 * holgura. Si alguien regenera el atlas con `preparar.mjs` y se olvida de volver
 * a pasar el guion, esta es la prueba que lo dice.
 */

interface Cercano {
  triangulo: number
  punto: number[]
  distancia: number
  detras: boolean
}
interface Buscador {
  dentro: (x: number, y: number, z: number) => boolean
  cercano: (x: number, y: number, z: number, maximo: number, lado?: number) => Cercano | null
  enterradas: () => number
  enterrada: Uint8Array
}
interface Geometria {
  cascarasPorConectividad: (pos: Float32Array, idx: Uint32Array, vertices: number) => { triangulos: Uint32Array; volumen: number }[]
  crearBuscador: (pos: Float32Array, tri: Uint32Array, opciones?: { celda?: number; tambienEnterradas?: Uint8Array | null }) => Buscador
  profundidadBajoLaPiel: (
    b: Buscador,
    x: number,
    y: number,
    z: number,
    alcance: number,
    seguro?: number,
  ) => { profundidad: number; triangulo: number } | null
  relajarEmpuje: (necesita: Float64Array, vecinos: Int32Array[], opciones?: { amortiguacion?: number; vueltas?: number }) => Float64Array
  envolventeConPendiente: (
    necesita: Float64Array,
    vecinos: Int32Array[],
    posiciones: Float32Array | Float64Array,
    pendiente: number,
    opciones?: { barridos?: number },
  ) => Float64Array
  suavizarNormales: (normales: Float64Array, vecinos: Int32Array[], activos: Uint8Array, vueltas?: number) => Float64Array
  normalesDeVertice: (pos: Float32Array, tri: Uint32Array, canon: Int32Array, vertices: number) => Float64Array
  verticesSoldados: (pos: Float32Array, vertices: number) => Int32Array
  muestrasDelTriangulo: (pos: Float32Array, a: number, b: number, c: number, paso: number, punto: (x: number, y: number, z: number) => void) => void
  puntosDeLoDeDentro: (
    piezas: { nombre: string; sistema: string; vertices: number; generada?: string }[],
    leer: () => { pos: Float32Array; idx: Uint32Array },
    elegir: () => boolean,
    cerca: () => boolean,
  ) => { puntos: Float32Array; origen: Int32Array }
  PASO_DE_LAS_GENERADAS: number
}
interface Comprobacion {
  cascarasDeLaPiel: (pos: Float32Array, idx: Uint32Array, vertices: number) => { cuerpo: Uint32Array; orejas: Uint32Array[]; dentro: Uint32Array | null }
  comprobarLaPiel: (a: {
    pieza: { pos: Float32Array; idx: Uint32Array; vertices: number }
    piezas: unknown[]
    leer: (p: never) => { pos: Float32Array; idx: Uint32Array }
  }) => { cumple: boolean; lineas: string[]; medidas: { peor: number; peorBajoLaCaraDeDentro: number; orejas: number } }
  HOLGURA_MINIMA: number
}
const geometria = () => import('../../scripts/atlas/geometriaDePiel.mjs') as unknown as Promise<Geometria>
const comprobacion = () => import('../../scripts/atlas/comprobarPiel.mjs') as unknown as Promise<Comprobacion>

/**
 * Una esfera de radio `r` hecha de franjas y meridianos, con las caras hacia
 * fuera (volumen positivo) o hacia dentro (negativo). Los polos se repiten por
 * meridiano a propósito: así tiene vértices duplicados, como la piel del atlas.
 */
function esfera(r: number, haciaFuera: boolean, franjas = 16, meridianos = 32, desplazar = 0) {
  const pos: number[] = []
  for (let i = 0; i <= franjas; i++) {
    const phi = (Math.PI * i) / franjas
    for (let j = 0; j < meridianos; j++) {
      const theta = (2 * Math.PI * j) / meridianos
      pos.push(r * Math.sin(phi) * Math.cos(theta) + desplazar, r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta))
    }
  }
  const idx: number[] = []
  for (let i = 0; i < franjas; i++) {
    for (let j = 0; j < meridianos; j++) {
      const a = i * meridianos + j
      const b = i * meridianos + ((j + 1) % meridianos)
      const c = (i + 1) * meridianos + j
      const d = (i + 1) * meridianos + ((j + 1) % meridianos)
      // Con theta creciendo hacia +z y phi hacia -y, este orden mira hacia fuera.
      if (haciaFuera) idx.push(a, b, c, b, d, c)
      else idx.push(a, c, b, b, c, d)
    }
  }
  return { pos: Float32Array.from(pos), idx: Uint32Array.from(idx), vertices: pos.length / 3 }
}

describe('la geometría de la piel, con una esfera', () => {
  it('separa las cáscaras por conectividad, cada una con el signo de su volumen', async () => {
    const g = await geometria()
    const c = await comprobacion()
    // La piel de D-224 es así: el cuerpo, dos orejas que se le solapan y la cara de dentro, con las caras al revés.
    const cuerpo = esfera(1, true)
    const oreja = esfera(0.1, true, 8, 16, 1)
    const otra = esfera(0.1, true, 8, 16, -1)
    const dentro = esfera(0.99, false)
    const todas = [cuerpo, oreja, otra, dentro]
    const desde = todas.map((_, i) => todas.slice(0, i).reduce((n, e) => n + e.vertices, 0))
    const pos = Float32Array.from(todas.flatMap((e) => [...e.pos]))
    const idx = Uint32Array.from(todas.flatMap((e, i) => Array.from(e.idx, (v) => v + desde[i])))
    const cascaras = g.cascarasPorConectividad(pos, idx, pos.length / 3)
    expect(cascaras.map((k) => Math.sign(k.volumen))).toEqual([1, -1, 1, 1])
    const piel = c.cascarasDeLaPiel(pos, idx, pos.length / 3)
    expect(piel.cuerpo.length).toBe(cuerpo.idx.length)
    expect(Math.max(...piel.cuerpo)).toBeLessThan(cuerpo.vertices)
    expect(piel.orejas).toHaveLength(2)
    expect(piel.dentro?.length).toBe(dentro.idx.length)
    expect(Math.min(...piel.dentro!)).toBeGreaterThanOrEqual(desde[3])
  })

  it('sabe qué está dentro y qué fuera', async () => {
    const g = await geometria()
    const e = esfera(1, true)
    const b = g.crearBuscador(e.pos, e.idx)
    expect(b.dentro(0, 0, 0)).toBe(true)
    expect(b.dentro(0.5, 0.3, -0.2)).toBe(true)
    expect(b.dentro(1.5, 0, 0)).toBe(false)
    expect(b.dentro(0, -3, 0)).toBe(false)
  })

  it('un solo rayo no basta: una pieza solapada no engaña al voto', async () => {
    const g = await geometria()
    // Dos esferas que se cortan, como la cara y la oreja de la piel real. Un
    // punto del cuerpo grande, bajo la pequeña, vería cuatro cruces con un rayo
    // vertical y se creería fuera.
    const grande = esfera(1, true)
    const chica = esfera(0.3, true, 12, 24)
    const arriba = Float32Array.from(chica.pos, (v, i) => (i % 3 === 1 ? v + 0.9 : v))
    const pos = Float32Array.from([...grande.pos, ...arriba])
    const idx = Uint32Array.from([...grande.idx, ...Array.from(chica.idx, (i) => i + grande.vertices)])
    const b = g.crearBuscador(pos, idx)
    expect(b.dentro(0, -0.2, 0)).toBe(true)
  })

  it('mide a cuánto está y de qué lado', async () => {
    const g = await geometria()
    const e = esfera(1, true, 32, 64)
    const b = g.crearBuscador(e.pos, e.idx)
    // A 5 mm por dentro de la superficie (la malla es poligonal: un poco más de margen que el radio exacto).
    const m = b.cercano(0.995, 0, 0, 0.03)
    expect(m).not.toBeNull()
    expect(m!.distancia).toBeLessThan(0.007)
    expect(b.cercano(0, 0, 0, 0.03)).toBeNull()
  })

  it('`lado` descarta las caras que miran al punto de espaldas', async () => {
    const g = await geometria()
    const e = esfera(1, true, 32, 64)
    const b = g.crearBuscador(e.pos, e.idx)
    // Un punto por dentro tiene detrás la cara de fuera: con lado -1 la encuentra y con +1, no.
    expect(b.cercano(0.99, 0, 0, 0.03, -1)).not.toBeNull()
    expect(b.cercano(0.99, 0, 0, 0.03, 1)).toBeNull()
    // Y uno por fuera, al revés.
    expect(b.cercano(1.01, 0, 0, 0.03, 1)).not.toBeNull()
    expect(b.cercano(1.01, 0, 0, 0.03, -1)).toBeNull()
  })

  it('donde la piel se solapa consigo misma cuenta vueltas, no paridad', async () => {
    const g = await geometria()
    // Una mano apoyada en el muslo: dos cáscaras que se meten una en la otra. Un punto de lo que comparten cruza
    // dos caras en cada rayo, y por paridad salía fuera de las dos; por vueltas está dentro dos veces.
    const muslo = esfera(1, true)
    const mano = esfera(0.4, true, 16, 32, 1.2)
    const pos = Float32Array.from([...muslo.pos, ...mano.pos])
    const idx = Uint32Array.from([...muslo.idx, ...Array.from(mano.idx, (i) => i + muslo.vertices)])
    const b = g.crearBuscador(pos, idx)
    expect(b.dentro(0.9, 0.05, 0.03)).toBe(true)
    expect(b.dentro(1.5, 0.05, 0.03)).toBe(true)
    expect(b.dentro(1.7, 0.05, 0.03)).toBe(false)
  })

  it('lo que queda enterrado en otra parte de la piel no cuenta como superficie', async () => {
    const g = await geometria()
    const muslo = esfera(1, true, 32, 64)
    const mano = esfera(0.4, true, 16, 32, 1.2)
    const pos = Float32Array.from([...muslo.pos, ...mano.pos])
    const idx = Uint32Array.from([...muslo.idx, ...Array.from(mano.idx, (i) => i + muslo.vertices)])
    const b = g.crearBuscador(pos, idx)
    // Lo del muslo que queda dentro de la mano, y lo de la mano dentro del muslo.
    expect(b.enterradas()).toBeGreaterThan(20)
    // Junto a la cara de la mano que está dentro del muslo (en x = 0,8), la superficie de verdad es la del muslo de
    // alrededor o la mano de fuera, no ella: medir contra ella daba holgura a lo que asomaba.
    const m = b.cercano(0.82, 0, 0, 0.5)
    expect(m).not.toBeNull()
    expect(m!.distancia).toBeGreaterThan(0.05)
  })

  it('la cara de dentro tampoco mira lo que copia una cara de fuera enterrada', async () => {
    const g = await geometria()
    // La cara de dentro es la de fuera hundida, cara a cara. Donde la de fuera se toca consigo misma la copia no se ve
    // enterrada desde su propio buscador, y se le dice cuáles con `tambienEnterradas`: aquí, media esfera.
    const e = esfera(1, true, 32, 64)
    const marca = new Uint8Array(e.idx.length / 3)
    for (let t = 0; t < marca.length; t++) if (e.pos[e.idx[t * 3] * 3] > 0.5) marca[t] = 1
    expect(g.crearBuscador(e.pos, e.idx).cercano(0.99, 0, 0, 0.03)).not.toBeNull()
    const b = g.crearBuscador(e.pos, e.idx, { tambienEnterradas: marca })
    expect(b.cercano(0.99, 0, 0, 0.03)).toBeNull()
    expect(b.enterradas()).toBe(marca.reduce((n, m) => n + m, 0))
  })

  it('la profundidad bajo la piel es positiva dentro, negativa fuera, y nula lejos', async () => {
    const g = await geometria()
    const e = esfera(1, true, 48, 96)
    const b = g.crearBuscador(e.pos, e.idx)
    // Cinco milímetros por dentro, uno por dentro y tres por fuera. Con `seguro` de 3 mm se busca hasta 6 y se mide;
    // sin él solo se busca hasta 4, y de lo que está más hondo se devuelve esa cota.
    expect(g.profundidadBajoLaPiel(b, 0.995, 0, 0, 0.03, 0.003)!.profundidad).toBeCloseTo(0.005, 3)
    expect(g.profundidadBajoLaPiel(b, 0.995, 0, 0, 0.03)).toEqual({ profundidad: 0.004, triangulo: -1 })
    const justo = g.profundidadBajoLaPiel(b, 0.999, 0, 0, 0.03, 0.002)!.profundidad
    expect(justo).toBeGreaterThan(0.0005)
    expect(justo).toBeLessThan(0.0015)
    expect(g.profundidadBajoLaPiel(b, 1.003, 0, 0, 0.03)!.profundidad).toBeCloseTo(-0.003, 3)
    // Muy hondo: basta saber que está a más de lo que se pregunta, y no se busca más.
    const hondo = g.profundidadBajoLaPiel(b, 0, 0, 0, 0.03, 0.001)!
    expect(hondo.profundidad).toBeGreaterThanOrEqual(0.002)
    expect(hondo.triangulo).toBe(-1)
    // Lejos, por fuera, no se mide.
    expect(g.profundidadBajoLaPiel(b, 2, 0, 0, 0.03)).toBeNull()
  })

  it('las normales de una esfera apuntan hacia fuera, con los vértices repetidos soldados', async () => {
    const g = await geometria()
    const e = esfera(1, true)
    const canon = g.verticesSoldados(e.pos, e.vertices)
    // Los polos se repiten 32 veces cada uno y quedan soldados en uno.
    expect(new Set(canon).size).toBeLessThan(e.vertices)
    const n = g.normalesDeVertice(e.pos, e.idx, canon, e.vertices)
    let hacia = 0
    for (let i = 0; i < e.vertices; i++) {
      const c = canon[i]
      const dot = n[c * 3] * e.pos[i * 3] + n[c * 3 + 1] * e.pos[i * 3 + 1] + n[c * 3 + 2] * e.pos[i * 3 + 2]
      if (dot > 0.9) hacia++
    }
    expect(hacia / e.vertices).toBeGreaterThan(0.95)
  })
})

describe('repartir el empuje', () => {
  /** Una fila de vértices, cada uno vecino del anterior y del siguiente. */
  const fila = (n: number) =>
    Array.from({ length: n }, (_, i) => Int32Array.from([i - 1, i + 1].filter((v) => v >= 0 && v < n)))

  it('nunca baja de lo que cada vértice necesita', async () => {
    const g = await geometria()
    const necesita = new Float64Array(21)
    necesita[10] = 0.01
    necesita[3] = 0.004
    const d = g.relajarEmpuje(necesita, fila(21))
    expect(d[10]).toBeCloseTo(0.01, 9)
    expect(d[3]).toBeGreaterThanOrEqual(0.004)
  })

  it('decae con la distancia, de modo que un empuje es un abultamiento y no una aguja', async () => {
    const g = await geometria()
    const necesita = new Float64Array(41)
    necesita[20] = 0.01
    const d = g.relajarEmpuje(necesita, fila(41))
    expect(d[19]).toBeGreaterThan(0.005)
    expect(d[19]).toBeLessThan(0.01)
    expect(d[15]).toBeLessThan(d[19])
    expect(d[5]).toBeLessThan(0.0006)
    for (let i = 20; i < 40; i++) expect(d[i + 1]).toBeLessThanOrEqual(d[i] + 1e-12)
  })

  it('lo que no hace falta no se mueve', async () => {
    const g = await geometria()
    const d = g.relajarEmpuje(new Float64Array(10), fila(10))
    expect(Math.max(...d)).toBe(0)
  })

  it('los negativos —lo que ya sobra— cuentan como cero', async () => {
    const g = await geometria()
    const d = g.relajarEmpuje(Float64Array.from([-0.01, -0.02, -0.03]), fila(3))
    expect(Math.max(...d)).toBe(0)
  })
})

describe('la envolvente con pendiente (D-228)', () => {
  /** Una rejilla de `n`×`n` vértices a 4 mm, cada uno vecino de sus ocho de alrededor, y sus posiciones. */
  const rejilla = (n: number, paso = 0.004) => {
    const posiciones = new Float64Array(n * n * 3)
    const vecinos: Int32Array[] = []
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        posiciones.set([i * paso, j * paso, 0], (j * n + i) * 3)
        const ve: number[] = []
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const a = i + di, b = j + dj
            if ((di || dj) && a >= 0 && a < n && b >= 0 && b < n) ve.push(b * n + a)
          }
        }
        vecinos.push(Int32Array.from(ve))
      }
    }
    return { posiciones, vecinos }
  }

  it('nunca baja de lo que cada vértice necesita', async () => {
    const g = await geometria()
    const { posiciones, vecinos } = rejilla(9)
    const necesita = new Float64Array(81)
    necesita[40] = 0.012
    necesita[10] = 0.003
    const d = g.envolventeConPendiente(necesita, vecinos, posiciones, 0.6)
    expect(d[40]).toBeCloseTo(0.012, 9)
    expect(d[10]).toBeGreaterThanOrEqual(0.003)
  })

  it('entre dos vecinos la subida no cambia más que la pendiente por su distancia', async () => {
    const g = await geometria()
    const { posiciones, vecinos } = rejilla(15)
    const necesita = new Float64Array(225)
    necesita[112] = 0.012
    const d = g.envolventeConPendiente(necesita, vecinos, posiciones, 0.6)
    for (let v = 0; v < 225; v++) {
      for (const w of vecinos[v]) {
        const largo = Math.hypot(posiciones[v * 3] - posiciones[w * 3], posiciones[v * 3 + 1] - posiciones[w * 3 + 1])
        expect(Math.abs(d[v] - d[w])).toBeLessThanOrEqual(0.6 * largo + 1e-12)
      }
    }
    // La loma llega a unos 20 mm (12 / 0,6) y se acaba ahí: cinco vértices a un lado, aún sube; siete, ya no.
    expect(d[112 + 4]).toBeGreaterThan(0.012 - 0.6 * 0.004 * 4 - 1e-9)
    expect(d[112 + 7]).toBe(0)
  })

  it('donde relajarEmpuje deja un diente, la envolvente deja una loma', async () => {
    const g = await geometria()
    const { posiciones, vecinos } = rejilla(15)
    const necesita = new Float64Array(225)
    necesita[112] = 0.012
    const diente = g.relajarEmpuje(necesita, vecinos)
    const loma = g.envolventeConPendiente(necesita, vecinos, posiciones, 0.6)
    const caida = (d: Float64Array) => Math.max(...[...vecinos[112]].map((w) => d[112] - d[w]))
    // El reparto de siempre pierde casi todo en un paso (con ocho vecinos); la envolvente, 3,4 mm como mucho (en diagonal).
    expect(caida(diente)).toBeGreaterThan(0.007)
    expect(caida(loma)).toBeLessThanOrEqual(0.6 * 0.004 * Math.SQRT2 + 1e-12)
  })

  it('lo que no hace falta no se mueve, y lo que sobra cuenta como cero', async () => {
    const g = await geometria()
    const { posiciones, vecinos } = rejilla(5)
    expect(Math.max(...g.envolventeConPendiente(new Float64Array(25), vecinos, posiciones, 0.6))).toBe(0)
    expect(Math.max(...g.envolventeConPendiente(new Float64Array(25).fill(-0.01), vecinos, posiciones, 0.6))).toBe(0)
  })
})

describe('las normales suavizadas (D-228)', () => {
  /** Una tira de cinco vértices en fila, cada uno vecino del anterior y del siguiente, con normales que se abren en abanico. */
  const abanico = () => {
    const grados = [-60, -30, 0, 30, 60]
    const normales = new Float64Array(15)
    grados.forEach((g, i) => normales.set([Math.sin((g * Math.PI) / 180), Math.cos((g * Math.PI) / 180), 0], i * 3))
    const vecinos = [[1], [0, 2], [1, 3], [2, 4], [3]].map((v) => Int32Array.from(v))
    return { normales, vecinos }
  }
  const anguloEntre = (n: Float64Array, a: number, b: number) =>
    Math.acos(Math.min(1, n[a * 3] * n[b * 3] + n[a * 3 + 1] * n[b * 3 + 1] + n[a * 3 + 2] * n[b * 3 + 2]))

  it('junta las normales que se abren: dos vecinos pasan a mirar casi igual', async () => {
    const g = await geometria()
    const { normales, vecinos } = abanico()
    const suaves = g.suavizarNormales(normales, vecinos, new Uint8Array(5).fill(1), 6)
    expect(anguloEntre(suaves, 0, 4)).toBeLessThan(anguloEntre(normales, 0, 4) / 3)
  })

  it('no toca los vértices que no se piden y devuelve normales unitarias', async () => {
    const g = await geometria()
    const { normales, vecinos } = abanico()
    const activos = Uint8Array.from([0, 1, 1, 1, 0])
    const suaves = g.suavizarNormales(normales, vecinos, activos, 4)
    for (const v of [0, 4]) for (let k = 0; k < 3; k++) expect(suaves[v * 3 + k]).toBe(normales[v * 3 + k])
    for (let v = 0; v < 5; v++) expect(Math.hypot(suaves[v * 3], suaves[v * 3 + 1], suaves[v * 3 + 2])).toBeCloseTo(1, 12)
  })

  it('sin vueltas no cambia nada', async () => {
    const g = await geometria()
    const { normales, vecinos } = abanico()
    expect([...g.suavizarNormales(normales, vecinos, new Uint8Array(5).fill(1), 0)]).toEqual([...normales])
  })
})

describe('qué se mide de un triángulo', () => {
  // Un triángulo rectángulo de 9 mm de cateto (12,7 de hipotenusa) y uno de un milímetro.
  const grande = Float32Array.from([0, 0, 0, 0.009, 0, 0, 0, 0.009, 0])
  const chico = Float32Array.from([0, 0, 0, 0.001, 0, 0, 0, 0.001, 0])
  const muestras = (g: Geometria, pos: Float32Array, paso: number) => {
    const p: number[][] = []
    g.muestrasDelTriangulo(pos, 0, 1, 2, paso, (x, y, z) => p.push([x, y, z]))
    return p
  }

  it('de uno menor que el paso, o sin paso, solo el centro', async () => {
    const g = await geometria()
    for (const [pos, paso] of [[chico, 0.003], [grande, 0]] as const) {
      const p = muestras(g, pos, paso)
      expect(p).toHaveLength(1)
      expect(p[0][0]).toBeCloseTo((pos[0] + pos[3] + pos[6]) / 3, 9)
      expect(p[0][1]).toBeCloseTo((pos[1] + pos[4] + pos[7]) / 3, 9)
    }
  })

  it('de uno grande, el centro de cada triángulo de su partición: todos dentro y a menos del paso unos de otros', async () => {
    const g = await geometria()
    const p = muestras(g, grande, 0.003)
    // La hipotenusa pide cinco partes: veinticinco triángulos.
    expect(p).toHaveLength(25)
    for (const [x, y, z] of p) {
      expect(x).toBeGreaterThan(0)
      expect(y).toBeGreaterThan(0)
      expect(x + y).toBeLessThan(0.009)
      expect(z).toBe(0)
    }
    // Repartidos: su media es el centro del triángulo.
    expect(p.reduce((s, q) => s + q[0], 0) / p.length).toBeCloseTo(0.003, 9)
    expect(p.reduce((s, q) => s + q[1], 0) / p.length).toBeCloseTo(0.003, 9)
  })

  it('las piezas generadas se miden por rejilla y las de BodyParts3D, por su centro', async () => {
    const g = await geometria()
    const idx = Uint32Array.from([0, 1, 2])
    const { puntos, origen } = g.puntosDeLoDeDentro(
      [
        { nombre: 'Fascia', sistema: 'fascia-profunda', vertices: 3, generada: 'fascia' },
        { nombre: 'Hueso', sistema: 'skeletal', vertices: 3 },
      ],
      () => ({ pos: grande, idx }),
      () => true,
      () => true,
    )
    expect(g.PASO_DE_LAS_GENERADAS).toBe(0.003)
    expect(puntos.length / 3).toBe(3 + 25 + 3 + 1)
    expect([...origen].filter((n) => n === 0)).toHaveLength(28)
  })
})

describe('el atlas con la piel recalculada', () => {
  const RAIZ = process.cwd()
  const catalogo = JSON.parse(readFileSync(join(RAIZ, 'public', 'atlas', 'catalogo.json'), 'utf8')) as {
    version: string
    paquetes: { archivo: string }[]
    piezas: {
      id: string
      nombre: string
      paquete: number
      pos: number
      idx: number
      vertices: number
      indices: number
      caja: number[][]
      recalculada?: string
      ajustada?: string
    }[]
  }
  const paquete = new Map<number, Buffer>()
  const bufer = (n: number) => {
    if (!paquete.has(n)) paquete.set(n, gunzipSync(readFileSync(join(RAIZ, 'public', 'atlas', catalogo.paquetes[n].archivo))))
    return paquete.get(n)!
  }
  const posiciones = (p: { paquete: number; pos: number; vertices: number }) => {
    const b = bufer(p.paquete)
    return new Float32Array(b.buffer.slice(b.byteOffset + p.pos, b.byteOffset + p.pos + p.vertices * 12))
  }
  const indices = (p: { paquete: number; idx: number; indices: number }) => {
    const b = bufer(p.paquete)
    return new Uint32Array(b.buffer.slice(b.byteOffset + p.idx, b.byteOffset + p.idx + p.indices * 4))
  }
  const piel = catalogo.piezas.find((p) => p.nombre === 'Skin')!

  it('la piel lleva la marca de haber sido recalculada, y no la de D-159', () => {
    // La de `preparar.mjs` es la de origen, sin marca: así se distingue de esta sin abrir la geometría.
    expect(piel.recalculada).toMatch(/D-224/)
    expect(piel.ajustada).toBeUndefined()
  })

  it('es el cuerpo, las dos orejas y la cara de dentro', async () => {
    const c = await comprobacion()
    const { cuerpo, orejas, dentro } = c.cascarasDeLaPiel(posiciones(piel), indices(piel), piel.vertices)
    expect(cuerpo.length).toBeGreaterThan(0)
    expect(orejas).toHaveLength(2)
    expect(dentro?.length).toBe(cuerpo.length)
  })

  it('mide 4 mm con la grasa en el cuerpo y 2 en la cabeza, y no más en ninguna parte (D-331)', async () => {
    // El dueño eligió un grosor fijo: 2 mm de grasa bajo los 2 de piel, sin grasa en la cabeza, y más delgada solo donde
    // no cabe. La cara de dentro es la de fuera hundida vértice a vértice (`recalcular-piel.mjs`), así que el grosor de
    // cada vértice es lo que lo separa de su copia. Medido al escribirla: entera en el 72,4 % del cuerpo sin la cabeza y
    // sin grasa en el 12,8 %. El suelo de la prueba queda un poco por debajo, para que la pida y no la copie.
    expect(piel.recalculada).toMatch(/D-331/)
    const c = await comprobacion()
    const pos = posiciones(piel)
    const { cuerpo, dentro } = c.cascarasDeLaPiel(pos, indices(piel), piel.vertices)
    const corrimiento = dentro![0] - cuerpo[0]
    const grosor = new Map<number, number>()
    for (const v of cuerpo) {
      if (grosor.has(v)) continue
      const w = v + corrimiento
      grosor.set(v, Math.hypot(pos[v * 3] - pos[w * 3], pos[v * 3 + 1] - pos[w * 3 + 1], pos[v * 3 + 2] - pos[w * 3 + 2]))
    }
    let enElCuerpo = 0
    let entera = 0
    let masGruesa = 0
    let enLaCabeza = 0
    let masGruesaEnLaCabeza = 0
    for (const [v, g] of grosor) {
      const y = pos[v * 3 + 1]
      if (y < 1.44) {
        enElCuerpo++
        if (g >= 0.0039) entera++
        masGruesa = Math.max(masGruesa, g)
      } else if (y > 1.5) {
        enLaCabeza++
        masGruesaEnLaCabeza = Math.max(masGruesaEnLaCabeza, g)
      }
    }
    expect(enElCuerpo).toBeGreaterThan(50_000)
    expect(enLaCabeza).toBeGreaterThan(5_000)
    expect(masGruesa).toBeLessThan(0.00401)
    expect(masGruesaEnLaCabeza).toBeLessThan(0.00201)
    expect(entera / enElCuerpo).toBeGreaterThan(0.7)
  })

  it('la caja de la piel es la de sus vértices', () => {
    const pos = posiciones(piel)
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < piel.vertices; i++) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], pos[i * 3 + k])
        max[k] = Math.max(max[k], pos[i * 3 + k])
      }
    }
    for (let k = 0; k < 3; k++) {
      expect(piel.caja[0][k]).toBeCloseTo(min[k], 4)
      expect(piel.caja[1][k]).toBeCloseTo(max[k], 4)
    }
  })

  it('la base de la nariz no tiene dientes: ningún vértice se aparta más de 2,5 mm de la media de sus vecinos', () => {
    // La subida que repartía `relajarEmpuje` dejaba ahí el cartílago de un ala como una aguja de 12 mm junto a vértices
    // de 3, y el freno contra el giro de las caras bajaba tres vértices más: 5,2 mm medidos, y se veía como un trozo
    // roto bajo la punta (D-228). Con la envolvente y las normales suavizadas, 1,5; la forma generada tiene 0,6.
    const pos = posiciones(piel)
    const idx = indices(piel)
    const suma = new Float64Array(piel.vertices * 3)
    const grado = new Uint32Array(piel.vertices)
    for (let t = 0; t < idx.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const v = idx[t + k]
        for (const w of [idx[t + ((k + 1) % 3)], idx[t + ((k + 2) % 3)]]) {
          for (let e = 0; e < 3; e++) suma[v * 3 + e] += pos[w * 3 + e]
          grado[v]++
        }
      }
    }
    let peor = 0
    let enLaZona = 0
    for (let v = 0; v < piel.vertices; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]
      if (!(Math.abs(x) < 0.045 && y > 1.52 && y < 1.585 && z > 0.055) || grado[v] === 0) continue
      enLaZona++
      peor = Math.max(peor, Math.hypot(x - suma[v * 3] / grado[v], y - suma[v * 3 + 1] / grado[v], z - suma[v * 3 + 2] / grado[v]))
    }
    expect(enLaZona).toBeGreaterThan(500)
    expect(peor).toBeLessThan(0.0025)
  })

  it('nada de lo de dentro asoma: todo queda bajo la piel con su holgura, y bajo la cara de dentro', async () => {
    // Es la misma comprobación con que `recalcular-piel.mjs` decide si escribe (`comprobarPiel.mjs`): casi cinco millones
    // de puntos del atlas contra la piel, por eso tarda. Un minuto con la máquina libre y hasta cuatro cuando Windows
    // limita a `node` en segundo plano (medido el mismo día con el mismo código y los mismos datos): con cinco minutos de
    // margen, `npm run test:coverage` —la suite entera en paralelo— la dejaba sin tiempo.
    const c = await comprobacion()
    const r = c.comprobarLaPiel({
      pieza: { pos: posiciones(piel), idx: indices(piel), vertices: piel.vertices },
      piezas: catalogo.piezas,
      leer: ((p: (typeof catalogo.piezas)[number]) => ({ pos: posiciones(p), idx: indices(p) })) as never,
    })
    expect(r.lineas.filter((l) => l.includes('falla'))).toEqual([])
    expect(r.cumple).toBe(true)
    expect(r.medidas.peor).toBeGreaterThanOrEqual(c.HOLGURA_MINIMA)
  }, 900_000)

  it('no se movió ninguna otra pieza: la rodilla sigue donde estaba', () => {
    // La tibia izquierda está entera dentro de la caja de la piel, y su caja del
    // catálogo coincide con sus vértices: nada la tocó.
    const tibia = catalogo.piezas.find((p) => /^Left tibia$/i.test(p.nombre))
    expect(tibia).toBeDefined()
    const v = posiciones(tibia!)
    for (let k = 0; k < 3; k++) {
      let min = Infinity
      for (let i = 0; i < tibia!.vertices; i++) min = Math.min(min, v[i * 3 + k])
      expect(tibia!.caja[0][k]).toBeCloseTo(min, 4)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

/**
 * Ensanchar la piel donde lo de dentro la atraviesa (D-159).
 *
 * Dos mitades. La geometría se prueba con una esfera, que tiene respuesta
 * conocida: el centro está dentro, un punto lejano está fuera, un hueso a un
 * milímetro de la superficie necesita un milímetro más de holgura. Y el atlas
 * real, para que la piel que se entrega siga cubriendo lo que se midió que la
 * atravesaba: si alguien regenera el atlas desde el origen y se olvida de
 * volver a pasar `ajustar-piel.mjs`, esta es la prueba que lo dice.
 */

interface Buscador {
  dentro: (x: number, y: number, z: number) => boolean
  cercano: (
    x: number,
    y: number,
    z: number,
    maximo: number,
    lado?: number,
  ) => { triangulo: number; punto: number[]; distancia: number } | null
}
interface Geometria {
  cascarasDeLaPiel: (pos: Float32Array, idx: Uint32Array, vertices: number) => { exterior: Uint32Array; interior: Uint32Array }
  crearBuscador: (pos: Float32Array, tri: Uint32Array) => Buscador
  empujeNecesario: (
    b: Buscador,
    x: number,
    y: number,
    z: number,
    holgura: number,
    alcance: number,
  ) => { empuje: number; triangulo: number } | null
  relajarEmpuje: (necesita: Float64Array, vecinos: Int32Array[], opciones?: { amortiguacion?: number; vueltas?: number }) => Float64Array
  normalesDeVertice: (pos: Float32Array, tri: Uint32Array, canon: Int32Array, vertices: number) => Float64Array
  verticesSoldados: (pos: Float32Array, vertices: number) => Int32Array
  vecinosDe: (tri: Uint32Array, canon: Int32Array, vertices: number) => Int32Array[]
  cercanoEnTriangulo: (...n: number[]) => number[]
}
const geometria = () => import('../../scripts/atlas/geometriaDePiel.mjs') as unknown as Promise<Geometria>

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
  it('distingue la cáscara de fuera, de volumen positivo, de la de dentro', async () => {
    const g = await geometria()
    const fuera = esfera(1, true)
    const dentro = esfera(0.99, false)
    const pos = Float32Array.from([...fuera.pos, ...dentro.pos])
    const idx = Uint32Array.from([...fuera.idx, ...Array.from(dentro.idx, (i) => i + fuera.vertices)])
    const { exterior, interior } = g.cascarasDeLaPiel(pos, idx, pos.length / 3)
    expect(exterior.length).toBe(fuera.idx.length)
    expect(interior.length).toBe(dentro.idx.length)
    // La exterior son los índices de la primera esfera: ninguno pasa de su último vértice.
    expect(Math.max(...exterior)).toBeLessThan(fuera.vertices)
    expect(Math.min(...interior)).toBeGreaterThanOrEqual(fuera.vertices)
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

  it('el empuje es lo que falta para tener la holgura', async () => {
    const g = await geometria()
    const e = esfera(1, true, 48, 96)
    const b = g.crearBuscador(e.pos, e.idx)
    const holgura = 0.002
    // Cinco milímetros por dentro: de sobra, no hace falta empujar.
    expect(g.empujeNecesario(b, 0.995, 0, 0, holgura, 0.03)!.empuje).toBeLessThan(0)
    // Un milímetro por dentro: falta otro.
    const justo = g.empujeNecesario(b, 0.999, 0, 0, holgura, 0.03)!.empuje
    expect(justo).toBeGreaterThan(0.0005)
    expect(justo).toBeLessThan(0.0015)
    // Tres milímetros por fuera: hay que subir lo que sobresale más la holgura.
    const asomado = g.empujeNecesario(b, 1.003, 0, 0, holgura, 0.03)!.empuje
    expect(asomado).toBeGreaterThan(0.004)
    expect(asomado).toBeLessThan(0.006)
    // Lejos de la piel no se mide.
    expect(g.empujeNecesario(b, 0, 0, 0, holgura, 0.03)).toBeNull()
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

describe('el atlas con la piel ajustada', () => {
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

  it('la piel lleva la marca de haber sido ajustada', () => {
    // Sin la marca, `ajustar-piel.mjs` volvería a empujar lo que ninguna pasada
    // resuelve cada vez que alguien lo corriera.
    expect(piel.ajustada).toMatch(/D-159/)
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

  it('lo que antes asomaba por fuera de la piel queda dentro', async () => {
    const g = await geometria()
    const pos = posiciones(piel)
    const { exterior } = g.cascarasDeLaPiel(pos, indices(piel), piel.vertices)
    const buscador = g.crearBuscador(pos, exterior)
    // Son las estructuras que se midieron asomando antes del ajuste: el tracto
    // iliotibial (el «tendón» del muslo), las safenas, el platisma y el cartílago
    // lateral de la nariz. La oreja no está: la piel sube hasta 12 mm y a ella le
    // pedía 16, así que unos pocos vértices suyos siguen fuera.
    for (const nombre of [
      'Left iliotibial tract',
      'Right iliotibial tract',
      'Left great saphenous vein',
      'Right great saphenous vein',
      'Left platysma',
      'Right platysma',
      'Left lateral nasal cartilage',
    ]) {
      const p = catalogo.piezas.find((q) => q.nombre === nombre)
      expect(p, nombre).toBeDefined()
      const v = posiciones(p!)
      let fuera = 0
      for (let i = 0; i < p!.vertices; i++) if (!buscador.dentro(v[i * 3], v[i * 3 + 1], v[i * 3 + 2])) fuera++
      expect(fuera, nombre).toBe(0)
    }
  })

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

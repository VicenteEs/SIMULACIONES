import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  ejePrincipal,
  sitiosDelVello,
  tamanoDeLaOclusion,
  tapasDeCorte,
  triangulosHaciaDentro,
  triangulosSinVello,
  velloLejosDeLasHeridas,
} from '@/lib/aspectoAnatomico'
import { partirMalla, type MallaIndexada } from '@/lib/osteotomia'

/** Una geometría de three como la malla indexada de `osteotomia.ts`. */
function indexada(g: THREE.BufferGeometry): MallaIndexada {
  return {
    posiciones: Float32Array.from(g.getAttribute('position').array as ArrayLike<number>),
    normales: Float32Array.from(g.getAttribute('normal').array as ArrayLike<number>),
    indices: Uint32Array.from(g.getIndex()!.array as ArrayLike<number>),
  }
}

describe('las tapas de un corte', () => {
  // Un «hueso» de 12 mm de radio y 10 cm de largo, en milímetros, partido por la mitad con el mismo corte que el taller.
  const cilindro = new THREE.CylinderGeometry(12, 12, 100, 48, 20, true)
  const { haciaLaNormal } = partirMalla(indexada(cilindro), { punto: [0, 5, 0], normal: [0, 1, 0] })

  it('reconoce la tapa que dejó partirMalla, con su radio y su campo de distancias', () => {
    const tapas = tapasDeCorte(haciaLaNormal.posiciones, haciaLaNormal.normales, haciaLaNormal.indices)
    expect(tapas).toHaveLength(1)
    const [t] = tapas
    // La tapa del trozo de arriba mira hacia abajo, hacia el otro trozo.
    expect(t.normal[1]).toBeCloseTo(-1, 3)
    // Lo más hondo de un círculo es su centro, a un radio del borde (el polígono de 48 lados queda un pelo dentro).
    expect(t.radio).toBeGreaterThan(11.5)
    expect(t.radio).toBeLessThan(12.1)
    // En el centro del rectángulo, lo más lejos del borde; en la esquina, fuera del círculo, nada.
    const lado = Math.sqrt(t.distancia.length)
    expect(t.distancia[(lado / 2) * lado + lado / 2]).toBeGreaterThan(240)
    expect(t.distancia[0]).toBe(0)
    // El rectángulo cubre la tapa: cada vértice de ella cae dentro, entre 0 y 1 por los dos ejes.
    for (const v of t.vertices) {
      const d = [0, 1, 2].map((k) => haciaLaNormal.posiciones[v * 3 + k] - t.origen[k])
      const u = d[0] * t.ejeU[0] + d[1] * t.ejeU[1] + d[2] * t.ejeU[2]
      const w = d[0] * t.ejeV[0] + d[1] * t.ejeV[1] + d[2] * t.ejeV[2]
      expect(u).toBeGreaterThanOrEqual(0)
      expect(u).toBeLessThanOrEqual(1)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThanOrEqual(1)
    }
  })

  it('no ve tapas en un hueso sin cortar, ni en el que viene sin índice y con normales suaves', () => {
    const esfera = new THREE.SphereGeometry(20, 32, 16)
    const m = indexada(esfera)
    expect(tapasDeCorte(m.posiciones, m.normales, m.indices)).toEqual([])
    const suelta = esfera.toNonIndexed()
    expect(tapasDeCorte(suelta.getAttribute('position').array as Float32Array, suelta.getAttribute('normal').array as Float32Array, null)).toEqual([])
  })

  it('guarda las más grandes, hasta el máximo', () => {
    const { haciaLaNormal: medio } = partirMalla(haciaLaNormal, { punto: [0, 30, 0], normal: [0, -1, 0] })
    const tapas = tapasDeCorte(medio.posiciones, medio.normales, medio.indices)
    expect(tapas).toHaveLength(2)
    expect(tapasDeCorte(medio.posiciones, medio.normales, medio.indices, { maximo: 1 })).toHaveLength(1)
  })
})

describe('el eje de las fibras', () => {
  it('es el largo de la pieza, sea cual sea su orientación', () => {
    const caja = new THREE.BoxGeometry(10, 12, 80, 2, 2, 8)
    const eje = ejePrincipal(caja.getAttribute('position').array as Float32Array)
    expect(Math.abs(eje[2])).toBeCloseTo(1, 2)
    caja.rotateX(Math.PI / 2)
    expect(Math.abs(ejePrincipal(caja.getAttribute('position').array as Float32Array)[1])).toBeCloseTo(1, 2)
  })

  it('con menos de dos vértices no hay eje, y se queda el vertical', () => {
    expect(ejePrincipal(new Float32Array(3))).toEqual([0, 1, 0])
  })
})

describe('la cara de dentro de la piel', () => {
  it('se reconoce por el volumen de su cáscara, que es negativo', () => {
    const fuera = new THREE.SphereGeometry(50, 24, 12)
    const dentro = new THREE.SphereGeometry(47, 24, 12)
    // La de dentro, con las caras al revés: mira al centro, como la de la piel del atlas.
    const i = dentro.getIndex()!.array as Uint16Array
    for (let t = 0; t < i.length; t += 3) [i[t + 1], i[t + 2]] = [i[t + 2], i[t + 1]]
    const posiciones = new Float32Array([...(fuera.getAttribute('position').array as Float32Array), ...(dentro.getAttribute('position').array as Float32Array)])
    const desfase = fuera.getAttribute('position').count
    const indices = new Uint32Array([...(fuera.getIndex()!.array as Uint16Array), ...[...i].map((x) => x + desfase)])
    const marcados = triangulosHaciaDentro(posiciones, indices)
    const deFuera = fuera.getIndex()!.count / 3
    expect([...marcados.subarray(0, deFuera)].every((m) => m === 0)).toBe(true)
    expect([...marcados.subarray(deFuera)].every((m) => m === 1)).toBe(true)
  })
})

describe('el vello', () => {
  // Una esfera de 5 cm de radio, en milímetros: 314 cm².
  const esfera = new THREE.SphereGeometry(50, 48, 24)
  const posiciones = esfera.getAttribute('position').array as Float32Array
  const indices = esfera.getIndex()!.array as Uint16Array

  it('se reparte por área, con la densidad pedida y sin pasar del máximo', () => {
    const v = sitiosDelVello(posiciones, indices, { mmPorUnidad: 1, densidadPorCm2: 2 })
    expect(v.cuantos).toBeGreaterThan(590)
    expect(v.cuantos).toBeLessThan(640)
    expect(sitiosDelVello(posiciones, indices, { mmPorUnidad: 1, maximo: 100 }).cuantos).toBe(100)
    // En metros, la misma esfera es la misma piel.
    const enMetros = Float32Array.from(posiciones, (x) => x / 1000)
    expect(sitiosDelVello(enMetros, indices, { mmPorUnidad: 1000, densidadPorCm2: 2 }).cuantos).toBe(v.cuantos)
  })

  it('crece casi tumbado sobre la piel y hacia fuera, mide de 2 a 5,5 mm y sale igual cada vez', () => {
    const v = sitiosDelVello(posiciones, indices, { mmPorUnidad: 1, semilla: 3 })
    for (let h = 0; h < v.cuantos; h++) {
      const d = new THREE.Vector3().fromArray(v.direcciones, h * 3)
      const n = new THREE.Vector3().fromArray(v.normales, h * 3)
      const base = new THREE.Vector3().fromArray(v.bases, h * 3)
      expect(d.length()).toBeCloseTo(1, 4)
      // Entre 62° y 80° de la normal, siempre hacia fuera de la esfera.
      expect(d.dot(n)).toBeGreaterThan(Math.cos((81 * Math.PI) / 180))
      expect(d.dot(n)).toBeLessThan(Math.cos((61 * Math.PI) / 180))
      expect(n.dot(base.normalize())).toBeGreaterThan(0.9)
      expect(v.largos[h]).toBeGreaterThanOrEqual(2)
      expect(v.largos[h]).toBeLessThanOrEqual(5.5)
    }
    expect(sitiosDelVello(posiciones, indices, { mmPorUnidad: 1, semilla: 3 }).bases).toEqual(v.bases)
  })

  it('no nace en los triángulos excluidos', () => {
    const excluir = new Uint8Array(indices.length / 3).fill(1)
    expect(sitiosDelVello(posiciones, indices, { mmPorUnidad: 1, excluir }).cuantos).toBe(0)
    // Solo la mitad de arriba: todo el vello queda arriba.
    for (let t = 0; t < excluir.length; t++) if ([0, 1, 2].every((k) => posiciones[indices[t * 3 + k] * 3 + 1] > 0)) excluir[t] = 0
    const v = sitiosDelVello(posiciones, indices, { mmPorUnidad: 1, excluir })
    expect(v.cuantos).toBeGreaterThan(0)
    for (let h = 0; h < v.cuantos; h++) expect(v.bases[h * 3 + 1]).toBeGreaterThan(0)
  })

  it('se esconde junto a una herida y solo allí', () => {
    const bases = new Float32Array([0, 0, 0, 5, 0, 0, 30, 0, 0])
    expect([...velloLejosDeLasHeridas(bases, [[1, 0, 0]], 12)]).toEqual([0, 0, 1])
    expect([...velloLejosDeLasHeridas(bases, [], 12)]).toEqual([1, 1, 1])
  })
})

describe('donde el archivo pinta mucosa no hay vello', () => {
  // Un triángulo por color: los tres vértices del mismo, que es lo que importa para la media.
  const triangulo = (rgb: [number, number, number]) => [...rgb, ...rgb, ...rgb]
  const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

  it('marca el labio y la areola, rojizos con el verde apagado, y deja la piel, la ceja y el pelo', () => {
    const colores = [
      ...triangulo([0.9, 0.5, 0.52]), // labio
      ...triangulo([0.62, 0.42, 0.38]), // areola
      ...triangulo([0.42, 0.37, 0.34]), // ceja: oscura pero no rojiza, es de pelo
      ...triangulo([0.97, 0.9, 0.88]), // piel sana
    ]
    expect([...triangulosSinVello(colores, 3, indices)]).toEqual([1, 1, 0, 0])
  })

  it('acepta colores con alfa, que es como los trae un COLOR_0 de cuatro bytes', () => {
    const conAlfa = [0.9, 0.5, 0.52, 1, 0.9, 0.5, 0.52, 1, 0.9, 0.5, 0.52, 1]
    expect([...triangulosSinVello(conAlfa, 4, [0, 1, 2])]).toEqual([1])
  })

  it('en el borde de la boca manda la media de los tres vértices, no uno solo', () => {
    // Dos vértices de piel y uno de labio: si bastara uno, la boca tendría un contorno pelado de un triángulo.
    const borde = [0.97, 0.9, 0.88, 0.97, 0.9, 0.88, 0.9, 0.5, 0.52]
    expect([...triangulosSinVello(borde, 3, [0, 1, 2])]).toEqual([0])
  })

  it('sin índices toma los vértices de tres en tres', () => {
    const colores = [...triangulo([0.9, 0.5, 0.52]), ...triangulo([0.97, 0.9, 0.88])]
    expect([...triangulosSinVello(colores, 3, null)]).toEqual([1, 0])
  })
})

describe('el tamaño de la oclusión', () => {
  it('es la mitad del lienzo por lado, sin pasar del techo de píxeles', () => {
    expect(tamanoDeLaOclusion(1600, 900)).toEqual({ ancho: 800, alto: 450 })
    const grande = tamanoDeLaOclusion(4000, 4000)
    expect(grande.ancho * grande.alto).toBeLessThanOrEqual(2_000_000 * 1.001)
    expect(tamanoDeLaOclusion(0, 0)).toEqual({ ancho: 1, alto: 1 })
  })
})

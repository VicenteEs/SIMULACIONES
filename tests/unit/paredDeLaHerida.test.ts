import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { abrirHerida, cortarMalla, type IncisionSobreLaMalla, type MallaPlana, type Vec3 } from '@/lib/corteDeMalla'
import { ATRIBUTO_DE_LA_PARED, cerrarCapa, cortarCapa } from '@/components/simulador/heridas'
import { aplicarAlSombreador, DERMIS_MM } from '@/components/simulador/aspectoDelPaciente'

/**
 * La pared de la herida en la piel (D-333). La piel tiene dos caras, la de fuera y la de dentro, 4 mm más abajo en el
 * cuerpo (D-331): el corte parte las dos, y sin pared, entre el labio de fuera y el de dentro de un mismo lado quedaba
 * un hueco por el que se veía el otro lado. Se prueba sobre una losa de piel: una rejilla de 20 × 20 mm mirando hacia
 * fuera y su copia 4 mm más abajo mirando hacia dentro, sueltas como en el atlas.
 */

const GROSOR = 4

/** Una rejilla de `n` × `n` vértices en el plano z, desde `desde` en y, mirando a +z o, `alReves`, a −z. */
function rejilla(n: number, lado: number, z: number, { alReves = false, desde = 0, alto = lado } = {}) {
  const posiciones: number[] = []
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) posiciones.push((i * lado) / (n - 1), desde + (j * alto) / (n - 1), z)
  const indices: number[] = []
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i
      const [b, c, d] = [a + 1, a + n, a + n + 1]
      if (alReves) indices.push(a, d, b, a, c, d)
      else indices.push(a, b, d, a, d, c)
    }
  }
  return { posiciones, indices }
}

/** Varias rejillas en una sola malla, con los índices corridos y sin compartir vértices: cáscaras sueltas. */
function juntas(...partes: { posiciones: number[]; indices: number[] }[]): MallaPlana {
  const posiciones: number[] = []
  const indices: number[] = []
  for (const p of partes) {
    const desde = posiciones.length / 3
    posiciones.push(...p.posiciones)
    indices.push(...p.indices.map((i) => i + desde))
  }
  return { posiciones: Float32Array.from(posiciones), indices: Uint32Array.from(indices) }
}

const losa = () => juntas(rejilla(21, 20, 0), rejilla(21, 20, -GROSOR, { alReves: true }))

const incisionRecta = (de: number, a: number, y: number): IncisionSobreLaMalla => {
  const puntos: Vec3[] = []
  const normales: Vec3[] = []
  for (let x = de; x <= a + 1e-9; x += 0.5) {
    puntos.push([x, y, 0])
    normales.push([0, 0, 1])
  }
  return { puntos, normales }
}

const OPCIONES = { profundidad: 14, alcance: 6, holgura: 6, pasoDelLabio: 2 }
const CON_PARED = { ...OPCIONES, pared: 6 }

const z = (posiciones: Float32Array, i: number) => posiciones[3 * i + 2]
const triangulos = (indices: Uint32Array, desde = 0) => {
  const lista: [number, number, number][] = []
  for (let t = desde; t < indices.length; t += 3) lista.push([indices[t], indices[t + 1], indices[t + 2]])
  return lista
}
const normal = (p: Float32Array, [a, b, c]: [number, number, number]): Vec3 => {
  const u = [0, 1, 2].map((k) => p[3 * b + k] - p[3 * a + k])
  const w = [0, 1, 2].map((k) => p[3 * c + k] - p[3 * a + k])
  return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
}

describe('la pared de la herida', () => {
  it('sin pared, el corte es el de siempre: las dos caras abren sus labios y nada las une', () => {
    const corte = cortarMalla(losa(), incisionRecta(5, 15, 10.3), OPCIONES)!
    expect(corte.pared.every((h) => h === -1)).toBe(true)
    // Los labios mezclan las dos caras: es el serrucho que la pared quita.
    const alturas = new Set(corte.labios.mas.map((i) => Math.round(z(corte.posiciones, i))))
    expect([...alturas].sort()).toEqual([-GROSOR, 0])
  })

  it('con pared, cada lado se cierra de la cara de fuera a la de dentro, con la hondura de cada vértice', () => {
    const corte = cortarMalla(losa(), incisionRecta(5, 15, 10.3), CON_PARED)!
    const deLaPared = [...corte.pared.keys()].filter((i) => corte.pared[i] >= 0)
    expect(deLaPared.length).toBeGreaterThan(20)
    for (const i of deLaPared) {
      // Arriba, en la cara de fuera, hondura 0; abajo, en la de dentro, el grosor de la piel.
      if (Math.abs(z(corte.posiciones, i)) < 1e-6) expect(corte.pared[i]).toBe(0)
      else {
        expect(z(corte.posiciones, i)).toBeCloseTo(-GROSOR, 5)
        expect(corte.pared[i]).toBeCloseTo(GROSOR, 4)
      }
    }
    // Las copias de la pared son vértices aparte: su normal sale de la pared y no de la piel.
    const conPared = triangulos(corte.indices).filter((t) => t.every((i) => corte.pared[i] >= 0))
    expect(conPared.length).toBeGreaterThan(20)
    for (const t of conPared) expect(Math.abs(normal(corte.posiciones, t)[2])).toBeLessThan(1e-6)
  })

  it('la pared de cada lado mira hacia el otro, que es desde donde se la ve', () => {
    const corte = cortarMalla(losa(), incisionRecta(5, 15, 10.3), CON_PARED)!
    let vistos = 0
    for (const t of triangulos(corte.indices).filter((x) => x.every((i) => corte.pared[i] >= 0))) {
      const lado = t.map((i) => corte.lado[i]).find((l) => l !== 0)
      if (!lado) continue
      // El labio «más» se aparta hacia +y (normal × avance): su pared mira a −y, y la del «menos», a +y.
      expect(Math.sign(normal(corte.posiciones, t)[1])).toBe(-lado)
      vistos++
    }
    expect(vistos).toBeGreaterThan(20)
  })

  it('los labios son solo los de la cara de fuera: el borde y la hoja del separador van por lo que se ve', () => {
    const corte = cortarMalla(losa(), incisionRecta(5, 15, 10.3), CON_PARED)!
    for (const i of [...corte.labios.mas, ...corte.labios.menos]) expect(z(corte.posiciones, i)).toBeCloseTo(0, 6)
    expect(corte.labios.mas.length).toBeGreaterThanOrEqual(6)
  })

  it('se abre con los labios: cada vértice de la pared se mueve lo mismo que el labio que copia', () => {
    const corte = cortarMalla(losa(), incisionRecta(5, 15, 10.3), CON_PARED)!
    const abierta = abrirHerida(corte, 3, 3)
    const n = corte.lado.length
    const clave = (p: Float32Array, i: number) => [0, 1, 2].map((k) => p[3 * i + k].toFixed(5)).join(',')
    const enReposo = new Map<string, number[]>()
    for (let i = 0; i < n; i++) {
      if (corte.pared[i] >= 0) continue
      const k = `${clave(corte.posiciones, i)}:${corte.lado[i]}`
      enReposo.set(k, [...(enReposo.get(k) ?? []), i])
    }
    let comprobados = 0
    for (let i = 0; i < n; i++) {
      if (corte.pared[i] < 0 || corte.lado[i] === 0) continue
      const [labio] = enReposo.get(`${clave(corte.posiciones, i)}:${corte.lado[i]}`) ?? []
      expect(labio).toBeDefined()
      for (let k = 0; k < 3; k++) expect(abierta[3 * i + k]).toBeCloseTo(abierta[3 * labio + k], 6)
      comprobados++
    }
    expect(comprobados).toBeGreaterThan(20)
    // Y de verdad se abrió: algún vértice de la pared se movió.
    expect([...Array(n).keys()].some((i) => corte.pared[i] >= 0 && Math.abs(abierta[3 * i + 1] - corte.posiciones[3 * i + 1]) > 1)).toBe(true)
  })

  it('una lámina sola no tiene pared: la fascia superficial se corta con la piel y no la encuentra', () => {
    const corte = cortarMalla(juntas(rejilla(21, 20, 0)), incisionRecta(5, 15, 10.3), CON_PARED)!
    expect(corte.pared.every((h) => h === -1)).toBe(true)
  })

  it('dos islas de una lámina, una al lado de la otra, no se cosen entre sí', () => {
    const islas = juntas(rejilla(21, 20, 0, { alto: 9.5 }), rejilla(21, 20, 0, { desde: 10.5, alto: 9.5 }))
    const puntos: Vec3[] = []
    const normales: Vec3[] = []
    for (let y = 2; y <= 18 + 1e-9; y += 0.5) {
      puntos.push([10.3, y, 0])
      normales.push([0, 0, 1])
    }
    const corte = cortarMalla(islas, { puntos, normales }, CON_PARED)!
    expect(corte).not.toBeNull()
    expect(corte.pared.every((h) => h === -1)).toBe(true)
  })

  it('la cara de dentro más honda que el grosor que se busca no es la suya', () => {
    const honda = juntas(rejilla(21, 20, 0), rejilla(21, 20, -10, { alReves: true }))
    const corte = cortarMalla(honda, incisionRecta(5, 15, 10.3), CON_PARED)!
    expect(corte.pared.every((h) => h === -1)).toBe(true)
  })
})

describe('la pared en la escena', () => {
  /** La losa como malla de three, en milímetros: una unidad del mundo es un milímetro. */
  function pielConGrosor(): THREE.Mesh {
    const { posiciones, indices } = losa()
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(posiciones, 3))
    g.setIndex(new THREE.BufferAttribute(indices, 1))
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
    m.name = 'Skin'
    m.updateMatrixWorld(true)
    return m
  }
  const trazo = () => {
    const { puntos, normales } = incisionRecta(5, 15, 10.3)
    return { puntos: puntos.map((p) => new THREE.Vector3(...p)), normales: normales.map((n) => new THREE.Vector3(...n)) }
  }

  it('la geometría cortada lleva el atributo: 0 fuera de la pared y 1 más los milímetros bajo la superficie', () => {
    const malla = pielConGrosor()
    const { puntos, normales } = trazo()
    const herida = cortarCapa(malla, puntos, normales, { profundidad: 14, alcance: 6, unidadesPorMm: 1, pared: 6 })!
    const marca = malla.geometry.getAttribute(ATRIBUTO_DE_LA_PARED)
    expect(marca).toBeDefined()
    const valores = [...(marca.array as Float32Array)]
    expect(valores.filter((v) => v === 0).length).toBeGreaterThan(800)
    expect(valores.some((v) => Math.abs(v - 1) < 1e-6)).toBe(true)
    expect(valores.some((v) => Math.abs(v - (1 + GROSOR)) < 1e-3)).toBe(true)
    // La de antes del corte también lo lleva, en cero: es la que vuelve al cerrar.
    const original = herida.original.getAttribute(ATRIBUTO_DE_LA_PARED)
    expect([...(original.array as Float32Array)].every((v) => v === 0)).toBe(true)
    cerrarCapa(herida)
    expect(malla.geometry.getAttribute(ATRIBUTO_DE_LA_PARED)).toBe(original)
  })

  it('sin pedir pared, la escena corta como siempre y no pone el atributo', () => {
    const malla = pielConGrosor()
    const { puntos, normales } = trazo()
    cortarCapa(malla, puntos, normales, { profundidad: 14, alcance: 6, unidadesPorMm: 1 })
    expect(malla.geometry.getAttribute(ATRIBUTO_DE_LA_PARED)).toBeUndefined()
  })

  it('el lienzo la pide solo para la piel, con el grosor máximo de la piel', () => {
    const lienzo = readFileSync('src/components/simulador/LienzoQuirurgico.tsx', 'utf8')
    expect(lienzo).toContain("pared: plano === 'piel' ? GROSOR_MAXIMO_DE_LA_PIEL_MM * unidadesPorMm : undefined,")
  })
})

describe('el sombreador de la pared', () => {
  const conAspecto = (aspecto: 'piel' | 'musculo') => {
    const s = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} }
    aplicarAlSombreador(s, aspecto, { uMmPorUnidad: { value: 1 } })
    return s
  }

  it('la piel lee el atributo y pinta la dermis hasta los milímetros de la dermis y la grasa debajo', () => {
    const piel = conAspecto('piel')
    expect(piel.vertexShader).toContain(`attribute float ${ATRIBUTO_DE_LA_PARED};`)
    expect(piel.vertexShader).toContain(`vPared = ${ATRIBUTO_DE_LA_PARED};`)
    expect(piel.fragmentShader).toContain('varying float vPared;')
    expect(piel.fragmentShader).toContain('if ( vPared > 0.5 ) {')
    expect(piel.fragmentShader).toContain(`smoothstep( ${DERMIS_MM.toFixed(1)} - 0.25, ${DERMIS_MM.toFixed(1)} + 0.25, hondo )`)
  })

  it('lo demás no lo lee: el músculo no tiene pared', () => {
    const musculo = conAspecto('musculo')
    expect(musculo.vertexShader).not.toContain(ATRIBUTO_DE_LA_PARED)
    expect(musculo.fragmentShader).not.toContain('vPared')
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as THREE from 'three'
import type { Punto } from '@/lib/incisiones'
import { llevarAlReposo, porElTrazo, type MallaConReposo } from '@/components/simulador/trazoEnReposo'

/**
 * El trazo llevado a la piel en reposo antes de cortar (D-416): se pincha en la malla de ahora, abierta y apartada, y se
 * corta en la cerrada. Antes el corte caía en el tejido que en reposo tenía esas coordenadas, y no en el que se veía.
 */

/**
 * Una lámina de 10 × 10 en z = 0, un vértice por unidad. Ahora, la mitad de arriba (y ≥ 5) está corrida 3 hacia +y, como
 * la piel que aparta un Farabeuf, y la franja entre y = 4 y y = 5 quedó estirada al cuádruple.
 */
function lamina(aMundo = new THREE.Matrix4()): MallaConReposo {
  const reposo: number[] = []
  const ahora: number[] = []
  for (let y = 0; y <= 10; y++) {
    for (let x = 0; x <= 10; x++) {
      reposo.push(x, y, 0)
      ahora.push(x, y >= 5 ? y + 3 : y, 0)
    }
  }
  const indices: number[] = []
  const v = (x: number, y: number) => y * 11 + x
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) indices.push(v(x, y), v(x + 1, y), v(x + 1, y + 1), v(x, y), v(x + 1, y + 1), v(x, y + 1))
  }
  return { ahora, reposo, indices, aMundo }
}

const arriba: Punto = [0, 0, 1]
const cerca = (a: Punto, b: Punto) => a.forEach((x, k) => expect(x).toBeCloseTo(b[k], 9))

describe('cada punto del trazo, al tejido que tenía debajo (D-416)', () => {
  it('lo pinchado en la piel corrida va a donde estaba esa piel', () => {
    const [l] = llevarAlReposo([[2.5, 8.5, 0]], [arriba], [lamina()], 0.01, 0.001)
    cerca(l!.punto, [2.5, 5.5, 0])
    cerca(l!.normal, [0, 0, 1])
  })

  it('en la franja estirada, a la misma fracción del triángulo', () => {
    // A mitad de la franja, que ahora va de 4 a 8: en reposo, a mitad de 4 a 5.
    const [l] = llevarAlReposo([[2.5, 6, 0]], [arriba], [lamina()], 0.01, 0.001)
    cerca(l!.punto, [2.5, 4.5, 0])
  })

  it('lo que no se movió, y lo que no está sobre la malla, se queda donde está', () => {
    const [quieto, enElAire] = llevarAlReposo(
      [
        [2.5, 2.5, 0],
        [2.5, 8.5, 1],
      ],
      [arriba, arriba],
      [lamina()],
      0.01,
      0.001,
    )
    expect(quieto).toBeNull()
    expect(enElAire).toBeNull()
  })

  it('en el mundo, con la malla escalada y movida como en el atlas', () => {
    // Un milímetro por unidad de la malla, y la pierna a 2 m del origen.
    const aMundo = new THREE.Matrix4().makeTranslation(2, 0, 0).multiply(new THREE.Matrix4().makeScale(0.001, 0.001, 0.001))
    const [l] = llevarAlReposo([[2 + 0.0025, 0.0085, 0]], [arriba], [lamina(aMundo)], 0.00001, 0.000001)
    cerca(l!.punto, [2 + 0.0025, 0.0055, 0])
  })

  it('la normal es la de la piel en reposo, hacia el lado de la que se dio', () => {
    const [l] = llevarAlReposo([[2.5, 8.5, 0]], [[0, 0, -1]], [lamina()], 0.01, 0.001)
    cerca(l!.normal, [0, 0, -1])
  })

  it('con dos mallas, la más cercana', () => {
    // La segunda, 0,5 por debajo: la fascia bajo la piel. El punto está en la piel.
    const abajo = lamina(new THREE.Matrix4().makeTranslation(0, 0, -0.5))
    const [l] = llevarAlReposo([[2.5, 8.5, 0]], [arriba], [abajo, lamina()], 0.6, 0.001)
    cerca(l!.punto, [2.5, 5.5, 0])
  })
})

describe('lo que sale del trazo va con él, y lo demás se queda (D-416)', () => {
  // Tres muestras pinchadas; la segunda y la tercera estaban en reposo 3 más abajo.
  const trazo: Punto[] = [
    [0, 0, 0],
    [0, 10, 0],
    [0, 20, 0],
  ]
  const llevar = porElTrazo(
    trazo,
    [null, { punto: [0, 7, 0], normal: [1, 0, 0] }, { punto: [0, 17, 0], normal: [1, 0, 0] }],
    [arriba, arriba, arriba],
    1e-6,
  )

  it('una muestra, a su reposo', () => {
    cerca(llevar([0, 10, 0], arriba).p, [0, 7, 0])
  })

  it('un punto entre dos muestras, a la misma fracción entre sus reposos, con la normal mezclada', () => {
    const { p, n } = llevar([0, 15, 0], arriba)
    cerca(p, [0, 12, 0])
    cerca(n, [1, 0, 0])
    // Entre una quieta y una corrida: la mitad.
    const medio = llevar([0, 5, 0], arriba)
    cerca(medio.p, [0, 3.5, 0])
    cerca(medio.n, [Math.SQRT1_2, 0, Math.SQRT1_2])
  })

  it('lo que no está en el trazo —una incisión de antes, el sitio donde nace una rama— no se toca', () => {
    expect(llevar([1, 10, 0], arriba)).toEqual({ p: [1, 10, 0], n: arriba })
  })
})

describe('el lienzo lleva al reposo lo que va a cortar (D-416)', () => {
  const lienzo = readFileSync(join(process.cwd(), 'src/components/simulador/LienzoQuirurgico.tsx'), 'utf8')
  const corte = lienzo.slice(lienzo.indexOf('const aplicarElCorte = '), lienzo.indexOf('const terminarPerforacion = '))

  it('mide el trazo en la malla de ahora antes de decidir y de cerrar nada', () => {
    const mide = corte.indexOf('llevarAlReposo(puntosDelCorte, normalesDelCorte, conReposo')
    expect(mide).toBeGreaterThan(0)
    expect(mide).toBeLessThan(corte.indexOf('const decision = decidirElTrazo('))
    // Solo con un trazo de verdad: lo que rehace la sesión ya está en reposo.
    expect(corte.slice(0, mide)).toContain('if (deUnTrazo) {\n        const conReposo')
  })

  it('lleva lo principal y las ramas antes de cerrar la incisión que se alarga y antes de cortar', () => {
    const lleva = corte.indexOf('ramas = ramas.map(aReposo)')
    expect(lleva).toBeGreaterThan(corte.indexOf('const decision = decidirElTrazo('))
    expect(lleva).toBeLessThan(corte.indexOf('if (previo) cerrarLaIncision(t, id, { conSusSeparadores: true })'))
    expect(lleva).toBeLessThan(corte.indexOf('cortarCapa(malla, puntos, normales, parametrosDe(malla))'))
  })
})

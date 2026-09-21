import { describe, expect, it } from 'vitest'
import {
  anclaDeLaMarca,
  anguloEnGrados,
  distanciaEnMilimetros,
  marcasValidas,
  textoDeLaMarca,
  vistasValidas,
} from '@/atlas/marcas'
import { normalizarSeleccion } from '@/atlas/catalogo'
import type { CatalogoDelAtlas } from '@/atlas/formato'

/** Rótulos, medidas y vistas con nombre (D-135). */

describe('medir', () => {
  it('la distancia sale en milímetros y el ángulo se mide en el punto del medio', () => {
    expect(distanciaEnMilimetros([0, 0, 0], [0.03, 0.04, 0])).toBeCloseTo(50, 9)
    expect(anguloEnGrados([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(90, 9)
    expect(anguloEnGrados([1, 0, 0], [0, 0, 0], [-1, 0, 0])).toBeCloseTo(180, 9)
  })

  it('un ángulo con dos puntos iguales da cero en vez de NaN', () => {
    expect(anguloEnGrados([0, 0, 0], [0, 0, 0], [0, 1, 0])).toBe(0)
  })

  it('el texto va con coma decimal, y se ancla donde se lee mejor', () => {
    expect(textoDeLaMarca({ tipo: 'distancia', puntos: [[0, 0, 0], [0.0085, 0, 0]] })).toBe('8,5 mm')
    expect(textoDeLaMarca({ tipo: 'angulo', puntos: [[1, 0, 0], [0, 0, 0], [0, 1, 0]] })).toBe('90,0°')
    expect(anclaDeLaMarca({ tipo: 'distancia', puntos: [[0, 0, 0], [2, 0, 0]] })).toEqual([1, 0, 0])
    expect(anclaDeLaMarca({ tipo: 'angulo', puntos: [[1, 0, 0], [0, 5, 0], [0, 1, 0]] })).toEqual([0, 5, 0])
  })
})

describe('lo que se deja guardar', () => {
  it('guarda lo bien formado y descarta lo demás pieza a pieza', () => {
    const limpias = marcasValidas([
      { tipo: 'rotulo', punto: [0, 1, 0], texto: '  Foco de fractura  ' },
      { tipo: 'rotulo', punto: [0, 1, 0], texto: '   ' },
      { tipo: 'distancia', puntos: [[0, 0, 0], [0, 0.1, 0]] },
      { tipo: 'distancia', puntos: [[0, 0, 0]] },
      { tipo: 'angulo', puntos: [[0, 0, 0], [0, Number.NaN, 0], [1, 0, 0]] },
      { tipo: 'otra', punto: [0, 0, 0] },
      'no es un objeto',
    ])
    expect(limpias).toEqual([
      { tipo: 'rotulo', punto: [0, 1, 0], texto: 'Foco de fractura' },
      { tipo: 'distancia', puntos: [[0, 0, 0], [0, 0.1, 0]] },
    ])
  })

  it('un punto a kilómetros no es un punto del cuerpo', () => {
    expect(marcasValidas([{ tipo: 'rotulo', punto: [5000, 0, 0], texto: 'x' }])).toEqual([])
  })

  it('las vistas piden nombre, cámara y objetivo; y tienen techo', () => {
    expect(vistasValidas([{ nombre: ' Lateral ', camara: [1, 1, 1], objetivo: [0, 1, 0] }])).toEqual([
      { nombre: 'Lateral', camara: [1, 1, 1], objetivo: [0, 1, 0] },
    ])
    expect(vistasValidas([{ nombre: '', camara: [1, 1, 1], objetivo: [0, 1, 0] }])).toEqual([])
    const muchas = Array.from({ length: 20 }, (_, i) => ({ nombre: `v${i}`, camara: [1, 1, 1], objetivo: [0, 0, 0] }))
    expect(vistasValidas(muchas)).toHaveLength(8)
  })

  // Lo guardado antes de D-135 no cambia de forma: sin apuntes, los campos no existen.
  it('sin marcas ni vistas, el contenido no lleva esos campos', () => {
    const catalogo = { version: 'p', piezas: [{ id: 'a' }] } as unknown as CatalogoDelAtlas
    const contenido = normalizarSeleccion(catalogo, ['a'], null)
    expect('marcas' in contenido).toBe(false)
    expect('vistas' in contenido).toBe(false)
  })
})

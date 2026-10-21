import { describe, expect, it } from 'vitest'
import {
  acotar,
  direccionesAnatomicas,
  numeroEscrito,
  rangosDeLaPlaca,
  sentidoSobreElEje,
  textoDelDesplazamiento,
} from '@/lib/ejesAnatomicos'

/**
 * Las direcciones del paciente y los rangos del ajuste de la placa (P-004 E6, pedido 2 de Cristóbal).
 */

describe('direccionesAnatomicas', () => {
  it('con el hueso en Y: proximal arriba, distal abajo, anterior de frente', () => {
    const d = direccionesAnatomicas('y')
    expect(d.proximal).toEqual([0, 1, 0])
    expect(d.distal).toEqual([-0, -1, -0])
    expect(d.anterior).toEqual([0, 0, 1])
    expect(d.posterior).toEqual([-0, -0, -1])
  })

  it('con el hueso en X o en Z, el proximal sigue al eje largo', () => {
    expect(direccionesAnatomicas('x').proximal).toEqual([1, 0, 0])
    expect(direccionesAnatomicas('z').proximal).toEqual([0, 0, 1])
  })

  it('proximal y distal son opuestos; anterior y posterior, también', () => {
    for (const eje of ['x', 'y', 'z'] as const) {
      const d = direccionesAnatomicas(eje)
      for (let i = 0; i < 3; i++) {
        expect(d.proximal[i] + d.distal[i]).toBeCloseTo(0, 9)
        expect(d.anterior[i] + d.posterior[i]).toBeCloseTo(0, 9)
      }
    }
  })
})

describe('sentidoSobreElEje', () => {
  it('dice a qué lado del eje va un vector, o 0 si va de través', () => {
    expect(sentidoSobreElEje([0, 0, 3], [0, 0, 1])).toBe(1)
    expect(sentidoSobreElEje([0, 0, -3], [0, 0, 1])).toBe(-1)
    expect(sentidoSobreElEje([1, 0, 0], [0, 0, 1])).toBe(0)
    expect(sentidoSobreElEje([0, 0, 0], [0, 0, 1])).toBe(0)
  })

  it('un vector casi perpendicular no dice nada: a menos de 0,15 de coseno no se sabe', () => {
    expect(sentidoSobreElEje([1, 0, 0.1], [0, 0, 1])).toBe(0)
    expect(sentidoSobreElEje([1, 0, 0.3], [0, 0, 1])).toBe(1)
  })
})

describe('textoDelDesplazamiento', () => {
  it('«75 mm hacia distal» con el valor negativo dicho con la dirección contraria', () => {
    expect(textoDelDesplazamiento(-75, 'proximal', 'distal')).toBe('75 mm hacia distal')
    expect(textoDelDesplazamiento(12, 'proximal', 'distal')).toBe('12 mm hacia proximal')
    expect(textoDelDesplazamiento(-3.5, 'anterior', 'posterior')).toBe('3,5 mm hacia posterior')
  })

  it('en cero no hay dirección', () => {
    expect(textoDelDesplazamiento(0, 'proximal', 'distal')).toBe('sin desplazar')
    expect(textoDelDesplazamiento(0.04, 'proximal', 'distal')).toBe('sin desplazar')
  })

  it('sin saber a qué sentido lleva el signo, se dice con el signo', () => {
    expect(textoDelDesplazamiento(5, null, null)).toBe('+5 mm')
    expect(textoDelDesplazamiento(-5, null, null)).toBe('−5 mm')
  })
})

describe('rangosDeLaPlaca', () => {
  it('a lo largo: el largo del hueso menos medio largo de placa, a cada lado (ya no el −40 fijo)', () => {
    const r = rangosDeLaPlaca({ largoDelHuesoMm: 380, anchoDelHuesoMm: 30, largoDeLaPlacaMm: 130 })
    expect(r.largoMm).toEqual({ min: -315, max: 315 })
    expect(r.ladoMm).toEqual({ min: -30, max: 30 })
    expect(r.giroGrados).toEqual({ min: -90, max: 90 })
  })

  it('rodear el hueso tiene tope: un esqueleto de una sola malla no da un ancho de 216 mm', () => {
    const r = rangosDeLaPlaca({ largoDelHuesoMm: 900, anchoDelHuesoMm: 216, largoDeLaPlacaMm: 110 })
    expect(r.ladoMm).toEqual({ min: -60, max: 60 })
  })

  it('un hueso muy corto o sin medir deja un recorrido mínimo: el control nunca se queda sin rango', () => {
    const r = rangosDeLaPlaca({ largoDelHuesoMm: 0, anchoDelHuesoMm: 0, largoDeLaPlacaMm: 100 })
    expect(r.largoMm.max).toBe(15)
    expect(r.ladoMm.max).toBe(15)
  })

  it('el simétrico: lo que va hacia proximal cabe hacia distal', () => {
    const r = rangosDeLaPlaca({ largoDelHuesoMm: 200, anchoDelHuesoMm: 20, largoDeLaPlacaMm: 80 })
    expect(r.largoMm.min).toBe(-r.largoMm.max)
    expect(r.ladoMm.min).toBe(-r.ladoMm.max)
  })
})

describe('numeroEscrito y acotar', () => {
  it('lee la cifra como se escribe en español', () => {
    expect(numeroEscrito('75')).toBe(75)
    expect(numeroEscrito('-75')).toBe(-75)
    expect(numeroEscrito('−75')).toBe(-75)
    expect(numeroEscrito('+3')).toBe(3)
    expect(numeroEscrito(' 7,5 ')).toBe(7.5)
    expect(numeroEscrito('1 200')).toBe(1200)
  })

  it('lo que no es un número es null, y un campo vacío no es 0', () => {
    expect(numeroEscrito('')).toBeNull()
    expect(numeroEscrito('  ')).toBeNull()
    expect(numeroEscrito('-')).toBeNull()
    expect(numeroEscrito('abc')).toBeNull()
    expect(numeroEscrito('12abc')).toBeNull()
    expect(numeroEscrito('1.2.3')).toBeNull()
  })

  it('acotar deja el valor dentro del rango', () => {
    expect(acotar(500, -315, 315)).toBe(315)
    expect(acotar(-500, -315, 315)).toBe(-315)
    expect(acotar(7, -315, 315)).toBe(7)
  })
})

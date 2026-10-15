import { describe, expect, it } from 'vitest'
import {
  AVANCE_MINIMO_MM,
  FRACCION_QUE_SEPARA,
  LARGO_DE_LA_RANURA_MM,
  PROLONGACION_MM,
  aperturaPorLabioEnMm,
  avanzo,
  capaBlandaDelRol,
  separaElPlano,
  textoDeLaDiseccion,
  trazoDeLaDiseccion,
  type NodoDeDiseccion,
} from '@/lib/diseccionRoma'

/**
 * La disección roma: las ramas de la Metzenbaum se abren dentro del tejido y el plano se separa por tensión.
 * Se prueba la geometría de la herida que queda y cuánto abren las ramas; el dibujo es del lienzo.
 */

const MM = 0.001 // 1 unidad = 1 m, que es como vienen los modelos del atlas
const nodo = (x: number, y: number, z = 0): NodoDeDiseccion => ({ punto: [x * MM, y * MM, z * MM], normal: [0, 0, 1] })
const largoDe = (puntos: number[][]) => {
  let l = 0
  for (let i = 1; i < puntos.length; i++) l += Math.hypot(...puntos[i].map((c, k) => c - puntos[i - 1][k]))
  return l
}

describe('cuándo separa el plano', () => {
  it('con las ramas casi cerradas no separa; abiertas lo bastante, sí', () => {
    expect(separaElPlano(0)).toBe(false)
    expect(separaElPlano(FRACCION_QUE_SEPARA - 0.01)).toBe(false)
    expect(separaElPlano(FRACCION_QUE_SEPARA)).toBe(true)
    expect(separaElPlano(1)).toBe(true)
  })

  it('cada labio se aparta la mitad de lo que separan las puntas', () => {
    expect(aperturaPorLabioEnMm(1, 14)).toBe(7)
    expect(aperturaPorLabioEnMm(0.5, 14)).toBe(3.5)
    expect(aperturaPorLabioEnMm(0, 14)).toBe(0)
  })

  it('no se sale de su rango', () => {
    expect(aperturaPorLabioEnMm(3, 14)).toBe(7)
    expect(aperturaPorLabioEnMm(-1, 14)).toBe(0)
  })
})

describe('la herida de una sola apertura', () => {
  it('es una ranura corta alrededor del punto, a lo largo de la dirección dada', () => {
    const t = trazoDeLaDiseccion([nodo(10, 20)], [0, 1, 0], MM)
    expect(t.posiciones).toEqual([0.5])
    // Mide lo que miden las ramas que entran.
    expect(largoDe(t.puntos) / MM).toBeCloseTo(LARGO_DE_LA_RANURA_MM, 3)
    // Va a lo largo de Y y está centrada en el punto.
    const xs = t.puntos.map((p) => p[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-9)
    const centro = t.puntos.reduce((s, p) => s + p[1], 0) / t.puntos.length
    expect(centro / MM).toBeCloseTo(20, 6)
  })

  it('la ranura queda pegada a la superficie aunque se pida una dirección que sale de ella', () => {
    const t = trazoDeLaDiseccion([nodo(0, 0)], [0, 1, 1], MM)
    for (const p of t.puntos) expect(p[2]).toBeCloseTo(0, 9)
  })

  it('con una dirección que no sirve (la normal) elige otra en vez de romper', () => {
    const t = trazoDeLaDiseccion([nodo(0, 0)], [0, 0, 1], MM)
    expect(t.puntos.length).toBeGreaterThan(2)
    expect(largoDe(t.puntos) / MM).toBeCloseTo(LARGO_DE_LA_RANURA_MM, 3)
  })
})

describe('la herida de varias aperturas', () => {
  it('pasa por todos los puntos donde se separó, en el orden en que se fueron abriendo', () => {
    const nodos = [nodo(0, 0), nodo(0, 12), nodo(0, 24)]
    const t = trazoDeLaDiseccion(nodos, [0, 1, 0], MM)
    // Los nodos están en la línea, de menor a mayor posición.
    expect(t.posiciones).toHaveLength(3)
    expect(t.posiciones[0]).toBeLessThan(t.posiciones[1])
    expect(t.posiciones[1]).toBeLessThan(t.posiciones[2])
    // Se prolonga más allá del primero y el último: la herida cubre las puntas.
    expect(largoDe(t.puntos) / MM).toBeCloseTo(24 + 2 * PROLONGACION_MM, 3)
  })

  it('las posiciones de los nodos son las mismas distancias que mide la línea', () => {
    const t = trazoDeLaDiseccion([nodo(0, 0), nodo(0, 10), nodo(0, 40)], [0, 1, 0], MM)
    const total = 40 + 2 * PROLONGACION_MM
    expect(t.posiciones[0]).toBeCloseTo(PROLONGACION_MM / total, 6)
    expect(t.posiciones[1]).toBeCloseTo((10 + PROLONGACION_MM) / total, 6)
    expect(t.posiciones[2]).toBeCloseTo((40 + PROLONGACION_MM) / total, 6)
  })

  it('tiene un punto cada pocos milímetros, para que el corte siga la curva de la piel', () => {
    const t = trazoDeLaDiseccion([nodo(0, 0), nodo(0, 30)], [0, 1, 0], MM)
    for (let i = 1; i < t.puntos.length; i++) {
      const paso = Math.hypot(...t.puntos[i].map((c, k) => c - t.puntos[i - 1][k])) / MM
      expect(paso).toBeLessThanOrEqual(PROLONGACION_MM + 1e-6)
    }
    expect(t.puntos.length).toBeGreaterThan(8)
    expect(t.normales).toHaveLength(t.puntos.length)
  })

  it('sin nodos no hay herida', () => {
    expect(trazoDeLaDiseccion([], [0, 1, 0], MM)).toEqual({ puntos: [], normales: [], posiciones: [] })
  })
})

describe('avanzar', () => {
  it('el primer apoyo siempre cuenta', () => {
    expect(avanzo(undefined, [0, 0, 0], MM)).toBe(true)
  })

  it('apoyar la punta casi donde estaba no es avanzar: es abrir otra vez en el mismo sitio', () => {
    expect(avanzo([0, 0, 0], [0, (AVANCE_MINIMO_MM - 1) * MM, 0], MM)).toBe(false)
  })

  it('apoyarla más allá, sí', () => {
    expect(avanzo([0, 0, 0], [0, (AVANCE_MINIMO_MM + 1) * MM, 0], MM)).toBe(true)
  })
})

describe('qué se puede disecar', () => {
  it('la piel y el músculo; el hueso no', () => {
    expect(capaBlandaDelRol('piel')).toBe('piel')
    expect(capaBlandaDelRol('musculo')).toBe('musculo')
    expect(capaBlandaDelRol('hueso')).toBeNull()
    expect(capaBlandaDelRol('fragmento')).toBeNull()
    expect(capaBlandaDelRol(undefined)).toBeNull()
  })

  it('el registro dice que se separó por tensión, no por corte', () => {
    expect(textoDeLaDiseccion('musculo', 1)).toMatch(/por tensión, sin cortar/)
    expect(textoDeLaDiseccion('musculo', 3)).toMatch(/3 aperturas/)
  })
})

import { describe, expect, it } from 'vitest'
import {
  cifra,
  escalaLineal,
  escalonDeIntensidad,
  indiceMasCercano,
  marcasDelEje,
  posicionesX,
  sectoresDeDona,
  trazoDeArea,
  trazoDeLinea,
  variacion,
} from '@/lib/graficos'

/**
 * La aritmética de los gráficos del panel (P-007 E1).
 *
 * Es lo único de un gráfico que se equivoca sin que se note: un eje que acaba
 * en 97 o una dona que no cierra la vuelta se dibujan igual de bien que los
 * buenos. Por eso vive aparte de los componentes, en `src/lib/graficos.ts`, y
 * se prueba aquí sin navegador.
 */
describe('las marcas del eje', () => {
  it('terminan en un número redondo que cubre el máximo', () => {
    expect(marcasDelEje(83)).toEqual([0, 25, 50, 75, 100])
    expect(marcasDelEje(7)).toEqual([0, 2, 4, 6, 8])
    expect(marcasDelEje(1284)).toEqual([0, 500, 1000, 1500, 2000])
  })

  it('contando cosas, las marcas son enteras', () => {
    expect(marcasDelEje(2, 4, true)).toEqual([0, 1, 2])
    expect(marcasDelEje(3, 4, true)).toEqual([0, 1, 2, 3])
    expect(marcasDelEje(9, 4, true)).toEqual([0, 5, 10, 15, 20])
    expect(marcasDelEje(9, 4, true).every(Number.isInteger)).toBe(true)
  })

  it('no arrastran el ruido de la coma flotante', () => {
    // 0,1 × 3 da 0,30000000000000004, y el eje lo escribía tal cual.
    expect(marcasDelEje(0.3, 3)).toEqual([0, 0.1, 0.2, 0.3])
  })

  it('con todo en cero siguen teniendo cinco marcas, para que la tarjeta no salte', () => {
    expect(marcasDelEje(0)).toEqual([0, 1, 2, 3, 4])
    expect(marcasDelEje(Number.NaN)).toEqual([0, 1, 2, 3, 4])
    expect(marcasDelEje(-5)).toEqual([0, 1, 2, 3, 4])
  })

  it('el último escalón nunca queda por debajo del máximo', () => {
    for (const maximo of [1, 3, 9, 11, 49, 51, 99, 101, 250, 999, 1001, 12345]) {
      const marcas = marcasDelEje(maximo)
      expect(marcas[marcas.length - 1]).toBeGreaterThanOrEqual(maximo)
    }
  })
})

describe('la escala y las posiciones', () => {
  it('lleva el dominio al rango, también al revés (el eje vertical sube hacia arriba)', () => {
    const y = escalaLineal([0, 100], [200, 0])
    expect(y(0)).toBe(200)
    expect(y(50)).toBe(100)
    expect(y(100)).toBe(0)
  })

  it('un dominio de ancho cero cae al centro y no divide por cero', () => {
    expect(escalaLineal([5, 5], [0, 10])(5)).toBe(5)
  })

  it('reparte los puntos de borde a borde, y uno solo va al medio', () => {
    expect(posicionesX(3, 0, 100)).toEqual([0, 50, 100])
    expect(posicionesX(1, 0, 100)).toEqual([50])
    expect(posicionesX(0, 0, 100)).toEqual([])
  })

  it('encuentra el punto más cercano al ratón', () => {
    expect(indiceMasCercano([0, 50, 100], 70)).toBe(1)
    expect(indiceMasCercano([0, 50, 100], 80)).toBe(2)
    expect(indiceMasCercano([], 10)).toBe(-1)
  })
})

describe('los trazos', () => {
  const puntos = [
    { x: 0, y: 10 },
    { x: 10.123, y: 5 },
  ]

  it('la línea va de punto a punto, con dos decimales como mucho', () => {
    expect(trazoDeLinea(puntos)).toBe('M0 10 L10.12 5')
  })

  it('el área baja por los extremos y se cierra', () => {
    expect(trazoDeArea(puntos, 20)).toBe('M0 10 L10.12 5 L10.12 20 L0 20 Z')
  })

  it('sin puntos no hay área: un trazo vacío no pinta un triángulo suelto', () => {
    expect(trazoDeArea([], 20)).toBe('')
    expect(trazoDeLinea([])).toBe('')
  })
})

describe('los sectores de la dona', () => {
  const caja = { cx: 50, cy: 50, exterior: 40, interior: 25 }

  it('las fracciones suman la vuelta entera', () => {
    const sectores = sectoresDeDona([3, 1, 4, 0, 2], caja)
    const suma = sectores.reduce((t, s) => t + s.fraccion, 0)
    expect(suma).toBeCloseTo(1, 10)
    expect(sectores[3]).toEqual({ d: '', fraccion: 0 })
  })

  it('empiezan arriba y giran con el reloj', () => {
    const [primero] = sectoresDeDona([1, 1], caja)
    // El primer punto del arco exterior está en lo alto del círculo.
    expect(primero.d.startsWith('M50 10 ')).toBe(true)
    // Media vuelta: el arco termina abajo, en (50, 90).
    expect(primero.d).toContain(' 50 90 ')
  })

  it('un sector que es la vuelta entera va en dos medias vueltas, o el navegador no lo dibuja', () => {
    const [unico] = sectoresDeDona([7], caja)
    expect(unico.fraccion).toBe(1)
    expect(unico.d.match(/M/g)).toHaveLength(2)
  })

  it('los valores negativos o no finitos cuentan como cero', () => {
    const sectores = sectoresDeDona([-3, Number.NaN, 2], caja)
    expect(sectores.map((s) => s.fraccion)).toEqual([0, 0, 1])
  })

  it('sin total, ningún sector', () => {
    expect(sectoresDeDona([0, 0], caja).every((s) => s.d === '')).toBe(true)
  })
})

describe('el escalón del mapa de calor', () => {
  it('cero es vacío y el máximo es el último escalón', () => {
    expect(escalonDeIntensidad(0, 10)).toBe(0)
    expect(escalonDeIntensidad(10, 10)).toBe(4)
  })

  it('un valor pequeño pero no nulo nunca queda en blanco', () => {
    expect(escalonDeIntensidad(0.1, 100)).toBe(1)
  })

  it('reparte el resto por cuartos', () => {
    expect(escalonDeIntensidad(25, 100)).toBe(1)
    expect(escalonDeIntensidad(26, 100)).toBe(2)
    expect(escalonDeIntensidad(75, 100)).toBe(3)
  })

  it('sin máximo todo es vacío', () => {
    expect(escalonDeIntensidad(5, 0)).toBe(0)
  })
})

describe('las cifras', () => {
  it('llevan el punto de miles y la coma decimal de aquí', () => {
    expect(cifra(1284)).toBe('1.284')
    expect(cifra(2231)).toBe('2.231')
    expect(cifra(1234567.891, 2)).toBe('1.234.567,89')
    expect(cifra(-4200)).toBe('-4.200')
    expect(cifra(12)).toBe('12')
  })

  it('un número que no es número se escribe como raya, no como «NaN»', () => {
    expect(cifra(Number.NaN)).toBe('—')
    expect(cifra(Number.POSITIVE_INFINITY)).toBe('—')
  })
})

describe('la variación', () => {
  it('es el porcentaje redondo respecto del periodo anterior', () => {
    expect(variacion(120, 100)).toBe(20)
    expect(variacion(75, 100)).toBe(-25)
  })

  it('sin periodo anterior, o con el anterior en cero, no hay variación que mostrar', () => {
    expect(variacion(10, 0)).toBeNull()
    expect(variacion(10, null)).toBeNull()
    expect(variacion(10, undefined)).toBeNull()
    expect(variacion(Number.NaN, 4)).toBeNull()
  })
})

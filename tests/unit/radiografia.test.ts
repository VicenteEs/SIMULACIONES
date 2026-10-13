import { describe, expect, it } from 'vitest'
import {
  ANGULO_DE_LA_PROYECCION,
  aFluoroscopia,
  aporteDeLaSuperficie,
  densidadDelPapel,
  densidadDelSistema,
  DENSIDAD_POR_SISTEMA,
  PROYECCIONES_DE_FLUOROSCOPIA,
} from '@/lib/radiografia'

/**
 * Radiografía y fluoroscopia: la misma física mostrada al revés.
 *
 * Lo que se fija aquí es lo que el traumatólogo corrigió: en la radiografía el
 * hueso es lo más blanco y no se ven vasos ni nervios; en la fluoroscopia lo más
 * denso es lo más negro, dentro de un círculo.
 */
describe('densidades', () => {
  it('el hueso es lo más denso del cuerpo y el pulmón lo menos', () => {
    const valores = Object.values(DENSIDAD_POR_SISTEMA).filter((v): v is number => v !== null)
    expect(Math.max(...valores)).toBe(DENSIDAD_POR_SISTEMA.skeletal)
    expect(Math.min(...valores)).toBe(DENSIDAD_POR_SISTEMA.respiratory)
  })

  it('los vasos, los nervios y los linfáticos no se ven', () => {
    for (const sistema of ['arterial', 'venous', 'nervous', 'lymphatic']) {
      expect(densidadDelSistema(sistema), sistema).toBeNull()
    }
  })

  it('un sistema que no se conoce se trata como tejido blando, ni invisible ni hueso', () => {
    const d = densidadDelSistema('inventado')
    expect(d).not.toBeNull()
    expect(d as number).toBeGreaterThan(0.1)
    expect(d as number).toBeLessThan(0.5)
  })

  it('en el simulador el metal absorbe más que el hueso, y el hueso más que lo blando', () => {
    expect(densidadDelPapel('implante')).toBeGreaterThan(densidadDelPapel('hueso'))
    expect(densidadDelPapel('hueso')).toBeGreaterThan(densidadDelPapel('musculo'))
    expect(densidadDelPapel('musculo')).toBeGreaterThan(densidadDelPapel('piel'))
    expect(densidadDelPapel('fragmento')).toBe(densidadDelPapel('hueso'))
  })

  it('una superficie rasante suma más que una de frente, y más densidad suma más', () => {
    expect(aporteDeLaSuperficie(1, 1)).toBeGreaterThan(aporteDeLaSuperficie(1, 0))
    expect(aporteDeLaSuperficie(1, 0.5)).toBeGreaterThan(aporteDeLaSuperficie(0.3, 0.5))
    expect(aporteDeLaSuperficie(0, 1)).toBe(0)
    // Un valor fuera de rango no se sale de la curva.
    expect(aporteDeLaSuperficie(1, 5)).toBe(aporteDeLaSuperficie(1, 1))
    expect(aporteDeLaSuperficie(1, -2)).toBe(aporteDeLaSuperficie(1, 0))
  })
})

describe('aFluoroscopia', () => {
  const ancho = 64
  const alto = 64
  const rellenar = (r: number, g: number, b: number) => {
    const p = new Uint8ClampedArray(ancho * alto * 4)
    for (let i = 0; i < ancho * alto; i++) {
      p[i * 4] = r
      p[i * 4 + 1] = g
      p[i * 4 + 2] = b
      p[i * 4 + 3] = 255
    }
    return p
  }
  const en = (img: Uint8ClampedArray, x: number, y: number) => img[(y * ancho + x) * 4]

  it('recorta un círculo: las esquinas son negras', () => {
    const img = aFluoroscopia(rellenar(0, 0, 0), ancho, alto, { ruido: 0 })
    expect(en(img, 0, 0)).toBe(0)
    expect(en(img, ancho - 1, alto - 1)).toBe(0)
    expect(en(img, ancho / 2, alto / 2)).toBeGreaterThan(150)
  })

  it('sin materia el fondo es gris claro, y lo denso sale oscuro (el negativo de la radiografía)', () => {
    const vacio = aFluoroscopia(rellenar(0, 0, 0), ancho, alto, { ruido: 0 })
    const hueso = aFluoroscopia(rellenar(255, 255, 255), ancho, alto, { ruido: 0 })
    const centro = (img: Uint8ClampedArray) => en(img, ancho / 2, alto / 2)
    expect(centro(vacio)).toBeGreaterThan(190)
    expect(centro(hueso)).toBeLessThan(60)
    expect(centro(hueso)).toBeLessThan(centro(vacio))
  })

  it('los grises intermedios quedan entre los dos extremos', () => {
    const medio = aFluoroscopia(rellenar(110, 110, 110), ancho, alto, { ruido: 0 })
    const v = en(medio, ancho / 2, alto / 2)
    expect(v).toBeGreaterThan(60)
    expect(v).toBeLessThan(190)
  })

  it('la fila de abajo de lo que entrega WebGL queda abajo en la imagen', () => {
    // Fila 0 de WebGL (abajo) con materia, el resto vacío: en la imagen, la materia debe verse abajo.
    const p = rellenar(0, 0, 0)
    for (let x = 0; x < ancho; x++) {
      const i = (0 * ancho + x) * 4
      p[i] = p[i + 1] = p[i + 2] = 255
    }
    const img = aFluoroscopia(p, ancho, alto, { ruido: 0 })
    // Cerca del centro horizontal y casi en el borde inferior, que sigue dentro del círculo.
    const abajo = en(img, ancho / 2, alto - 2)
    const arriba = en(img, ancho / 2, 2)
    expect(abajo).toBeLessThan(arriba)
  })

  it('el ruido es repetible con la misma semilla y cambia con otra', () => {
    const a = aFluoroscopia(rellenar(60, 60, 60), ancho, alto, { ruido: 1, semilla: 3 })
    const b = aFluoroscopia(rellenar(60, 60, 60), ancho, alto, { ruido: 1, semilla: 3 })
    const c = aFluoroscopia(rellenar(60, 60, 60), ancho, alto, { ruido: 1, semilla: 4 })
    expect(Array.from(a)).toEqual(Array.from(b))
    expect(Array.from(a)).not.toEqual(Array.from(c))
  })
})

describe('las tres proyecciones del arco', () => {
  it('son AP, lateral y oblicua, de frente a de lado', () => {
    expect(PROYECCIONES_DE_FLUOROSCOPIA.map((p) => p.valor)).toEqual(['ap', 'lateral', 'oblicua'])
    expect(ANGULO_DE_LA_PROYECCION.ap).toBe(0)
    expect(ANGULO_DE_LA_PROYECCION.lateral).toBe(90)
    expect(ANGULO_DE_LA_PROYECCION.oblicua).toBe(45)
  })
})

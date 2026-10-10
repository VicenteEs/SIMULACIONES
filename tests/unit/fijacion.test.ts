import { describe, expect, it } from 'vitest'
import {
  PUNTA_FUERA_MAXIMA_MM,
  agujeroMasCercano,
  juzgarTornillo,
  largoSugerido,
  resumenDeLaFijacion,
  type EstadoDeLaFijacion,
} from '@/lib/fijacion'

/** Las reglas de la fijación con placa y tornillos (D-169). */

describe('largoSugerido', () => {
  it('pide lo medido y dos milímetros, en pasos de dos', () => {
    expect(largoSugerido(20)).toBe(22)
    expect(largoSugerido(21)).toBe(24)
    expect(largoSugerido(12.2)).toBe(16)
  })
  it('no sale del rango del catálogo: de 10 a 60 mm', () => {
    expect(largoSugerido(2)).toBe(10)
    expect(largoSugerido(90)).toBe(60)
    expect(largoSugerido(0)).toBe(10)
  })
  it('cuenta la placa y la holgura: el medidor lee desde la placa, no desde el hueso', () => {
    expect(largoSugerido(34, 14)).toBe(50)
    expect(largoSugerido(34, 0)).toBe(36)
  })
  it('lo que sugiere lo juzga bien el propio juicio: bicortical y sin pasarse', () => {
    // Regresión del servidor: se pedían 36 mm para un hueso de 34 con 14 mm de placa y holgura
    // y ese tornillo se quedaba en la cortical cercana.
    for (const espesorMm of [12, 20.4, 34, 41.7]) {
      for (const holgura of [0, 1.5, 3, 14]) {
        const grosorDeLaPlacaMm = 3
        const distanciaAlHuesoMm = holgura
        const largoMm = largoSugerido(espesorMm, grosorDeLaPlacaMm + distanciaAlHuesoMm)
        if (largoMm >= 60) continue
        const j = juzgarTornillo({ largoMm, grosorDeLaPlacaMm, distanciaAlHuesoMm, espesorMm })
        expect(j.bicortical).toBe(true)
        expect(j.largo).toBe(false)
      }
    }
  })
})

describe('juzgarTornillo', () => {
  const base = { grosorDeLaPlacaMm: 3, distanciaAlHuesoMm: 0, espesorMm: 12 }

  it('un tornillo de lo medido más dos milímetros es bicortical y no se pasa', () => {
    const j = juzgarTornillo({ ...base, largoMm: 3 + 12 + 2 })
    expect(j.bicortical).toBe(true)
    expect(j.puntaFueraMm).toBeCloseTo(2, 6)
    expect(j.largo).toBe(false)
    expect(j.aviso).toBeNull()
  })

  it('uno corto se queda en la cortical cercana y lo dice', () => {
    const j = juzgarTornillo({ ...base, largoMm: 3 + 6 })
    expect(j.bicortical).toBe(false)
    expect(j.aviso).toMatch(/solo una cortical/)
  })

  it('uno que ni llega al hueso es demasiado corto', () => {
    const j = juzgarTornillo({ ...base, largoMm: 3 })
    expect(j.aviso).toMatch(/no llega al hueso/)
  })

  it('uno largo asoma por la cortical opuesta y avisa si pasa del tope', () => {
    const justo = juzgarTornillo({ ...base, largoMm: 3 + 12 + PUNTA_FUERA_MAXIMA_MM })
    expect(justo.largo).toBe(false)
    const largo = juzgarTornillo({ ...base, largoMm: 3 + 12 + 8 })
    expect(largo.bicortical).toBe(true)
    expect(largo.largo).toBe(true)
    expect(largo.aviso).toMatch(/roza las partes blandas/)
  })

  it('con la placa separada del hueso, lo que entra es menos', () => {
    // 2 mm de hueco: el mismo tornillo de 17 mm ya solo asoma 0 mm.
    const j = juzgarTornillo({ ...base, distanciaAlHuesoMm: 2, largoMm: 17 })
    expect(j.puntaFueraMm).toBeCloseTo(0, 6)
  })
})

describe('agujeroMasCercano', () => {
  const agujeros: [number, number, number][] = [
    [0, 0, 0],
    [13, 0, 0],
    [26, 0, 0],
  ]
  it('elige el más cercano dentro del radio', () => {
    expect(agujeroMasCercano(agujeros, [12, 1, 0], 6)).toBe(1)
  })
  it('devuelve null si ninguno cae a esa distancia', () => {
    expect(agujeroMasCercano(agujeros, [6.5, 0, 0], 3)).toBeNull()
  })
})

describe('resumenDeLaFijacion', () => {
  const tornillo = (agujero: number, bicortical: boolean, puntaFueraMm: number) => ({
    agujero,
    largoMm: 20,
    diametroMm: 3.5,
    bicortical,
    puntaFueraMm,
    espesorMm: 12,
    bloqueado: false,
    aviso: null,
  })
  it('sin placa no hay fijación', () => {
    expect(resumenDeLaFijacion(null)).toEqual({ placa: false, tornillos: 0, bicorticales: 0, largos: 0 })
  })
  it('cuenta los tornillos, los bicorticales y los largos', () => {
    const estado: EstadoDeLaFijacion = {
      placa: { nombre: 'x', agujeros: 8, apoyada: true, separadaDelHuesoMm: 0 },
      tornillos: [tornillo(0, true, 2), tornillo(1, true, 7), tornillo(2, false, -4)],
    }
    expect(resumenDeLaFijacion(estado)).toEqual({ placa: true, tornillos: 3, bicorticales: 2, largos: 1 })
  })
})

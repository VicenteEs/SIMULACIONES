import { describe, it, expect } from 'vitest'
import { evaluarGesto, RESULTADOS } from '@/lib/simulador'

const paso = {
  titulo: 'Incisión cutánea',
  instrumento: 'Bisturí hoja 23',
  fuerzaMinima: 8,
  fuerzaMaxima: 20,
  exito: 'Incisión limpia hasta el subcutáneo.',
  insuficiente: 'La hoja no atraviesa la dermis.',
  excesivo: 'Se secciona a ciegas la fascia.',
}

describe('evaluarGesto', () => {
  it('exige elegir un instrumento antes de ejecutar', () => {
    const r = evaluarGesto(paso, { instrumento: null, fuerza: 12 })
    expect(r.resultado).toBe(RESULTADOS.SIN_INSTRUMENTO)
    expect(r.avanza).toBe(false)
  })

  it('rechaza el instrumento equivocado y lo dice con nombre y apellido', () => {
    const r = evaluarGesto(paso, { instrumento: 'Separador de Farabeuf', fuerza: 12 })
    expect(r.resultado).toBe(RESULTADOS.INSTRUMENTO_INCORRECTO)
    expect(r.mensaje).toContain('Separador de Farabeuf')
    expect(r.mensaje).toContain('Bisturí hoja 23')
    expect(r.avanza).toBe(false)
  })

  it('con fuerza insuficiente la maniobra falla, pero no daña', () => {
    const r = evaluarGesto(paso, { instrumento: paso.instrumento, fuerza: 5 })
    expect(r.resultado).toBe(RESULTADOS.FUERZA_INSUFICIENTE)
    expect(r.mensaje).toContain(paso.insuficiente)
    expect(r.complicacion).toBe(false)
    expect(r.avanza).toBe(false)
  })

  it('con fuerza excesiva se produce una complicación', () => {
    const r = evaluarGesto(paso, { instrumento: paso.instrumento, fuerza: 30 })
    expect(r.resultado).toBe(RESULTADOS.FUERZA_EXCESIVA)
    expect(r.mensaje).toContain(paso.excesivo)
    expect(r.complicacion).toBe(true)
    expect(r.avanza).toBe(false)
  })

  it('dentro del rango el gesto se completa y el paso avanza', () => {
    const r = evaluarGesto(paso, { instrumento: paso.instrumento, fuerza: 14 })
    expect(r.resultado).toBe(RESULTADOS.CORRECTO)
    expect(r.mensaje).toContain(paso.exito)
    expect(r.avanza).toBe(true)
    expect(r.complicacion).toBe(false)
  })

  it('los extremos del rango son válidos: el límite se incluye', () => {
    expect(evaluarGesto(paso, { instrumento: paso.instrumento, fuerza: 8 }).avanza).toBe(true)
    expect(evaluarGesto(paso, { instrumento: paso.instrumento, fuerza: 20 }).avanza).toBe(true)
  })

  it('un newton por fuera del rango ya cuenta como error', () => {
    expect(evaluarGesto(paso, { instrumento: paso.instrumento, fuerza: 7 }).avanza).toBe(false)
    expect(evaluarGesto(paso, { instrumento: paso.instrumento, fuerza: 21 }).complicacion).toBe(true)
  })

  it('un paso sin rango declarado no puede producir una complicación', () => {
    const sinRango = { ...paso, fuerzaMinima: undefined, fuerzaMaxima: undefined }
    const r = evaluarGesto(sinRango, { instrumento: paso.instrumento, fuerza: 999 })
    expect(r.avanza).toBe(true)
    expect(r.complicacion).toBe(false)
  })
})

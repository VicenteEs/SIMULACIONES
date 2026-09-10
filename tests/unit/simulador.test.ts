import { describe, it, expect } from 'vitest'
import { evaluarGesto, objetivoDelPaso, RESULTADOS } from '@/lib/simulador'

/**
 * Un paso de fuerza escrito **sin** declarar el objetivo, como los que había
 * antes de que existieran los cuatro. Se prueba así a propósito: es el caso en
 * el que el motor tiene que deducir qué se mide, y el que fallaría en silencio
 * si volviera a darse por hecho que basta con elegir el instrumento.
 */
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

  it('rechaza el instrumento equivocado y nombra el que se cogió', () => {
    const r = evaluarGesto(paso, {
      instrumento: 'separador',
      instrumentoNombre: 'Separador de Farabeuf',
      fuerza: 12,
    })
    expect(r.resultado).toBe(RESULTADOS.INSTRUMENTO_INCORRECTO)
    expect(r.mensaje).toContain('Separador de Farabeuf')
    // Y no nombra el correcto: el residente tiene que deducirlo, no leerlo.
    expect(r.mensaje).not.toContain('Bisturí hoja 23')
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

  it('deduce qué se mide cuando el paso no lo dice', () => {
    // Un paso guardado con su rango de fuerza y sin objetivo se evaluaba como
    // si bastara con elegir el instrumento: el rango estaba escrito y nadie lo
    // miraba. Un límite que no se comprueba enseña que no existe.
    expect(objetivoDelPaso(paso)).toBe('fuerza')
    expect(objetivoDelPaso({ trazoMinimo: 40, trazoMaximo: 80 })).toBe('trazo')
    expect(objetivoDelPaso({ toleranciaAngulacion: 5 })).toBe('reduccion')
    expect(objetivoDelPaso({ instrumento: 'bisturi' })).toBe('instrumento')
    // Lo que el paso declara manda sobre la deducción.
    expect(objetivoDelPaso({ objetivo: 'trazo', fuerzaMinima: 8 })).toBe('trazo')
  })

  it('un paso sin rango declarado no puede producir una complicación', () => {
    const sinRango = { ...paso, fuerzaMinima: undefined, fuerzaMaxima: undefined }
    const r = evaluarGesto(sinRango, { instrumento: paso.instrumento, fuerza: 999 })
    expect(r.avanza).toBe(true)
    expect(r.complicacion).toBe(false)
  })
})

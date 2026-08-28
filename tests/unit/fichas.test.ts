import { describe, it, expect } from 'vitest'
import { pestanasConContenido, PESTANAS_FICHA, hayContenido } from '@/lib/fichas'

describe('PESTANAS_FICHA', () => {
  it('declara las seis pestañas fijas en el orden acordado', () => {
    expect(PESTANAS_FICHA.map((p) => p.campo)).toEqual([
      'definicion',
      'mecanismo',
      'clasificacion',
      'evaluacion',
      'manejo',
      'rehabilitacion',
    ])
  })

  it('cada pestaña tiene una etiqueta legible en español', () => {
    for (const p of PESTANAS_FICHA) {
      expect(p.etiqueta.length).toBeGreaterThan(0)
      expect(p.etiqueta).not.toBe(p.campo)
    }
  })
})

describe('hayContenido', () => {
  it('un campo ausente no tiene contenido', () => {
    expect(hayContenido(undefined)).toBe(false)
    expect(hayContenido(null)).toBe(false)
  })

  it('una lista vacía de bloques no tiene contenido', () => {
    expect(hayContenido([])).toBe(false)
  })

  it('un solo bloque ya cuenta como contenido', () => {
    expect(hayContenido([{ blockType: 'texto' }])).toBe(true)
  })
})

describe('pestanasConContenido', () => {
  it('devuelve solo las pestañas que el autor llenó', () => {
    const ficha = {
      definicion: [{ blockType: 'texto' }],
      mecanismo: [],
      manejo: [{ blockType: 'lista-clinica' }],
    }
    expect(pestanasConContenido(ficha).map((p) => p.campo)).toEqual(['definicion', 'manejo'])
  })

  it('respeta el orden fijo aunque el autor haya llenado la última primero', () => {
    const ficha = {
      rehabilitacion: [{ blockType: 'texto' }],
      definicion: [{ blockType: 'texto' }],
    }
    expect(pestanasConContenido(ficha).map((p) => p.campo)).toEqual(['definicion', 'rehabilitacion'])
  })

  it('una ficha recién creada no muestra ninguna pestaña', () => {
    expect(pestanasConContenido({})).toEqual([])
  })

  it('la pestaña de rehabilitación cuenta también si solo tiene fases', () => {
    const ficha = { fases: [{ cuando: 'Semanas 0 a 3', titulo: 'Protección' }] }
    expect(pestanasConContenido(ficha).map((p) => p.campo)).toContain('rehabilitacion')
  })
})

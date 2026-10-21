import { describe, expect, it } from 'vitest'
import { causaProbable, type RegistroDeUnaPerdida } from '@/lib/diagnosticoDelLienzo'

const base: RegistroDeUnaPerdida = {
  cuando: '2026-10-21T22:00:00.000Z',
  tarjeta: 'NVIDIA GeForce RTX 3060',
  pixeles: { ancho: 1200, alto: 800, razon: 1 },
  geometrias: 80,
  texturas: 10,
  programas: 20,
  objetos: 300,
  verticesM: 1,
  memoriaJsMb: 600,
  carga: { tornillos: 4, trozosDeInjerto: 0, huellasDePeriostio: 0, clavo: true, placa: true },
  perdidasEnEsteEquipo: 1,
  pestana: 'visible',
}

describe('la causa probable de una pérdida de contexto', () => {
  it('con la pestaña oculta no es por la carga', () => {
    expect(causaProbable({ ...base, pestana: 'oculta' })).toMatch(/oculta/)
  })

  it('un dibujo enorme es lo primero que se reduce', () => {
    expect(causaProbable({ ...base, pixeles: { ancho: 3000, alto: 2500, razon: 3 } })).toMatch(/millones de píxeles/)
  })

  it('una escena con millones de vértices pesa para una tarjeta integrada', () => {
    expect(causaProbable({ ...base, verticesM: 4.2 })).toMatch(/4,?\.?2? millones de vértices|4\.2 millones de vértices/)
  })

  it('una tarjeta integrada se nombra', () => {
    expect(causaProbable({ ...base, tarjeta: 'Intel(R) UHD Graphics 620' })).toMatch(/integrada/)
  })

  it('la memoria de JavaScript cerca del techo se dice', () => {
    expect(causaProbable({ ...base, memoriaJsMb: 1900 })).toMatch(/1900 MB/)
  })

  it('sin nada que destaque, no se inventa una causa', () => {
    expect(causaProbable(base)).toMatch(/no hay una causa clara/)
  })
})

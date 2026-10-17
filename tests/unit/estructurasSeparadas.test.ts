import { describe, expect, it } from 'vitest'
import { agruparParaGlb, type PiezaLeida } from '@/lib/exportarAtlas'

/** Un triángulo: lo mínimo para que una pieza sea una malla. */
function pieza(id: string, nombre: string, sistema: string): PiezaLeida {
  return {
    id,
    nombre,
    sistema,
    posiciones: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normales: new Int16Array([0, 0, 32767, 0, 0, 32767, 0, 0, 32767]),
    indices: new Uint32Array([0, 1, 2]),
  }
}

const PIEZAS = [
  pieza('FJ1', 'Tibia', 'skeletal'),
  pieza('FJ2', 'Tibialis anterior', 'muscular'),
  pieza('FJ3', 'Extensor hallucis longus', 'muscular'),
  pieza('FJ4', 'Anterior tibial artery', 'arterial'),
  pieza('FJ5', 'Deep peroneal nerve', 'nervous'),
]

describe('exportar con las estructuras separadas (P-003 E9)', () => {
  it('sin la opción todo se funde por sistema, como antes', () => {
    const o = agruparParaGlb(PIEZAS, { protagonistas: ['FJ1'] })
    expect(o.map((x) => x.nombre)).toEqual(['Tibia', 'muscular', 'arterial', 'nervous'])
    expect(o.find((x) => x.nombre === 'muscular')!.extras).not.toHaveProperty('atlasId')
    // La protagonista ya llevaba su id: es lo que permite abrir la ficha de la tibia.
    expect(o[0].extras).toHaveProperty('atlasId', 'FJ1')
  })

  it('con la opción cada pieza es un objeto y lleva su atlasId', () => {
    const o = agruparParaGlb(PIEZAS, { separarEstructuras: true })
    expect(o).toHaveLength(5)
    expect(o.map((x) => x.extras?.atlasId)).toEqual(['FJ1', 'FJ2', 'FJ3', 'FJ4', 'FJ5'])
    // El rol sale del sistema, como en las protagonistas.
    expect(o.map((x) => x.extras?.rol)).toEqual(['hueso', 'musculo', 'musculo', 'musculo', 'musculo'])
    expect(o.every((x) => typeof x.extras?.nombreOriginal === 'string')).toBe(true)
  })

  it('los dos trozos de un hueso partido comparten el atlasId del hueso entero', () => {
    const a = { ...pieza('FJ1', 'Tibia', 'skeletal'), trozo: { lado: 'proximal' as const, fragmento: false } }
    const b = { ...pieza('FJ1', 'Tibia', 'skeletal'), trozo: { lado: 'distal' as const, fragmento: true } }
    const o = agruparParaGlb([a, b], { separarEstructuras: true, protagonistas: ['FJ1'] })
    expect(o.map((x) => x.extras?.atlasId)).toEqual(['FJ1', 'FJ1'])
    expect(o.map((x) => x.extras?.rol)).toEqual(['hueso', 'fragmento'])
  })

  it('por encima del umbral se funden solo los vasos; músculos y nervios siguen sueltos', () => {
    const o = agruparParaGlb(PIEZAS, { separarEstructuras: true, maximoDePiezasSueltas: 4 })
    expect(o.map((x) => x.nombre).sort()).toEqual(['Deep peroneal nerve', 'Extensor hallucis longus', 'Tibia', 'Tibialis anterior', 'arterial'].sort())
    expect(o.find((x) => x.nombre === 'arterial')!.extras).not.toHaveProperty('atlasId')
  })

  it('en el umbral justo no se funde nada', () => {
    const o = agruparParaGlb(PIEZAS, { separarEstructuras: true, maximoDePiezasSueltas: 5 })
    expect(o).toHaveLength(5)
  })
})

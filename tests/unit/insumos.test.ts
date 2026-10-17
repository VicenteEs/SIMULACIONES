import { describe, expect, it } from 'vitest'
import { agruparInsumos, anotarUso, filasParaLaBandeja, type RegistroDeInsumos } from '@/lib/insumos'

describe('insumos usados', () => {
  it('un instrumento que corta diez veces cuenta una vez, y el registro no cambia', () => {
    let r: RegistroDeInsumos = {}
    r = anotarUso(r, { instrumentoId: '1', nombre: 'Bisturí', categoria: 'corte' })
    const otra = anotarUso(r, { instrumentoId: '1', nombre: 'Bisturí', categoria: 'corte' })
    expect(otra).toBe(r)
    expect(Object.values(r)).toHaveLength(1)
    expect(Object.values(r)[0].cantidad).toBe(1)
  })

  it('los tornillos se cuentan por largo y suman', () => {
    let r: RegistroDeInsumos = {}
    for (const largo of [36, 36, 30, 36]) {
      r = anotarUso(r, { instrumentoId: '7', nombre: 'Tornillo cortical 3,5 mm', categoria: 'tornillos', largoMm: largo })
    }
    const por = Object.fromEntries(Object.values(r).map((u) => [u.nombre, u.cantidad]))
    expect(por).toEqual({ 'Tornillo cortical 3,5 mm × 36 mm': 3, 'Tornillo cortical 3,5 mm × 30 mm': 1 })
  })

  it('un largo con decimales se escribe con coma', () => {
    const r = anotarUso({}, { instrumentoId: '7', nombre: 'Tornillo', largoMm: 37.5 })
    expect(Object.values(r)[0].nombre).toBe('Tornillo × 37,5 mm')
  })

  it('agrupa por categoría en el orden de la bandeja y deja lo desconocido al final', () => {
    let r: RegistroDeInsumos = {}
    r = anotarUso(r, { instrumentoId: '2', nombre: 'Placa', categoria: 'placas' })
    r = anotarUso(r, { instrumentoId: '1', nombre: 'Bisturí', categoria: 'corte' })
    r = anotarUso(r, { nombre: 'Cosa rara', categoria: 'inventada' })
    r = anotarUso(r, { instrumentoId: '3', nombre: 'Aguja', categoria: null })
    const g = agruparInsumos(r, ['corte', 'placas'])
    expect(g.map((x) => x.categoria)).toEqual(['corte', 'placas', 'otros'])
    expect(g[2].insumos.map((i) => i.nombre)).toEqual(['Aguja', 'Cosa rara'])
  })

  it('las filas del editor: lo usado marcado primero y lo que no se usó, desmarcado y al final', () => {
    let r: RegistroDeInsumos = {}
    r = anotarUso(r, { instrumentoId: '1', nombre: 'Bisturí' })
    r = anotarUso(r, { instrumentoId: '7', nombre: 'Tornillo cortical', largoMm: 36 })
    r = anotarUso(r, { instrumentoId: '7', nombre: 'Tornillo cortical', largoMm: 30 })
    const filas = filasParaLaBandeja(r, [
      { id: '1', nombre: 'Bisturí' },
      { id: '9', nombre: 'Separador' },
    ])
    expect(filas).toEqual([
      { id: '1', nombre: 'Bisturí', usado: true, enLaBandeja: true },
      // Un tornillo usado con dos largos es un solo instrumento en la bandeja, con el nombre sin el largo.
      { id: '7', nombre: 'Tornillo cortical', usado: true, enLaBandeja: false },
      { id: '9', nombre: 'Separador', usado: false, enLaBandeja: true },
    ])
  })
})

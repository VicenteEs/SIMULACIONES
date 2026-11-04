import { describe, expect, it } from 'vitest'
import { apilar, avanceDeLaFila, avanceValido, INSTANTANEA_VACIA, TOPE_DEL_AVANCE, type AvanceDelCaso } from '@/lib/avanceDelCaso'
import { EN_EL_MENU, instrumentoDeLaTecla, instrumentosDelMenu, posicionEnElAro } from '@/lib/menuRadial'

const avance = (cambios: Partial<AvanceDelCaso> = {}): AvanceDelCaso => ({
  v: 1,
  paso: 3,
  modo: 'practica',
  puntaje: 20,
  resueltos: ['a', 'b'],
  fallados: ['b'],
  complicados: [],
  automaticas: [],
  complicaciones: [],
  insumos: {},
  instantanea: { sesion: '{"v":3}', colocado: '' },
  guardadoEn: '2026-11-04T10:00:00.000Z',
  ...cambios,
})

describe('el avance guardado en la cuenta (P-009, mejora de uso 12)', () => {
  it('pasa entero lo que manda la consola, y `null` es «no hay avance»', () => {
    expect(avanceValido(avance())).toEqual(avance())
    expect(avanceValido(null)).toBeNull()
  })

  it('rechaza lo que no es un avance, con un mensaje que dice qué falla', () => {
    expect(() => avanceValido({ ...avance(), v: 2 })).toThrow(/versión/)
    expect(() => avanceValido({ ...avance(), paso: -1 })).toThrow(/paso/)
    expect(() => avanceValido({ ...avance(), modo: 'examen' })).toThrow(/modo/)
    expect(() => avanceValido({ ...avance(), instantanea: { sesion: 3 } })).toThrow(/paciente/)
    expect(() => avanceValido({ ...avance(), resueltos: [1, 2] })).toThrow(/superados/)
    expect(() => avanceValido({ ...avance(), guardadoEn: 'ayer' })).toThrow(/fecha/)
    expect(() => avanceValido('{}')).toThrow()
  })

  it('no deja que la fila crezca sin freno', () => {
    const enorme = avance({ instantanea: { sesion: 'x'.repeat(TOPE_DEL_AVANCE), colocado: '' } })
    expect(() => avanceValido(enorme)).toThrow(/demasiado/)
  })

  it('al leer la fila no se cae: lo raro y el paso que ya no existe son «sin avance»', () => {
    expect(avanceDeLaFila({ avance: avance() }, 7)?.paso).toBe(3)
    expect(avanceDeLaFila({ avance: avance({ paso: 7 }) }, 7)).toBeNull()
    expect(avanceDeLaFila({ avance: { v: 1 } }, 7)).toBeNull()
    expect(avanceDeLaFila({}, 7)).toBeNull()
    expect(avanceDeLaFila(null, 7)).toBeNull()
  })
})

describe('la pila de «Deshacer» (P-009, mejora de uso 10)', () => {
  const de = (n: number) => ({ sesion: `s${n}`, colocado: '' })

  it('no repite el último estado: la escena que vuelve tras deshacer no se apila otra vez', () => {
    const pila = apilar([INSTANTANEA_VACIA], de(1))
    expect(apilar(pila, de(1))).toBe(pila)
    expect(apilar(pila, de(2))).toHaveLength(3)
  })

  it('con el tope, se cae lo más viejo menos el principio del paso', () => {
    let pila = [de(0)]
    for (let i = 1; i <= 40; i++) pila = apilar(pila, de(i), 10)
    expect(pila).toHaveLength(10)
    expect(pila[0]).toEqual(de(0))
    expect(pila[pila.length - 1]).toEqual(de(40))
    expect(pila[1]).toEqual(de(32))
  })
})

describe('el menú radial y los atajos (P-009, mejora de uso 9)', () => {
  it('los cinco últimos cogidos, sin repetidos', () => {
    expect(instrumentosDelMenu(['a', 'b', 'a', 'c', 'd', 'e', 'f', 'g'])).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(EN_EL_MENU).toBe(5)
  })

  it('el primero arriba y los demás en el sentido del reloj', () => {
    expect(posicionEnElAro(0, 4, 60)).toEqual({ x: 0, y: -60 })
    expect(posicionEnElAro(1, 4, 60)).toEqual({ x: 60, y: 0 })
    expect(posicionEnElAro(2, 4, 60)).toEqual({ x: 0, y: 60 })
  })

  it('1 a 5 cogen por orden; Q vuelve al anterior, o al último si la mano está vacía', () => {
    const recientes = ['broca', 'medidor', 'tornillo']
    expect(instrumentoDeLaTecla('2', recientes, 'broca')).toBe('medidor')
    expect(instrumentoDeLaTecla('5', recientes, 'broca')).toBeNull()
    expect(instrumentoDeLaTecla('q', recientes, 'broca')).toBe('medidor')
    expect(instrumentoDeLaTecla('Q', recientes, null)).toBe('broca')
    expect(instrumentoDeLaTecla('q', ['broca'], 'broca')).toBeNull()
    expect(instrumentoDeLaTecla('x', recientes, null)).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { identificadoresDeInstrumento, instrumentosParaActuar } from '@/lib/abordajeDelMusculo'

const bandeja = [
  { id: '1', nombre: 'Bisturí profundo (hoja 15)', slug: 'bisturi-profundo-n15' },
  { id: '2', nombre: 'Tijera de Metzenbaum', slug: 'tijera-metzenbaum' },
  { id: '3', nombre: 'Electrobisturí', slug: 'electrobisturi' },
  { id: '4', nombre: 'Separador de Farabeuf', slug: 'separador-farabeuf' },
  { id: '5', nombre: 'Separador de Hohmann', slug: 'separador-hohmann' },
  { id: '6', nombre: 'Pinza de disección', slug: 'pinza-diseccion-con-dientes' },
]

describe('con qué instrumentos se corta o se separa un músculo (P-003 E10)', () => {
  it('los identificadores se leen sin vacíos, sin repetidos y en minúsculas', () => {
    expect(identificadoresDeInstrumento(' Farabeuf, senn-miller;\nFARABEUF ,, ')).toEqual(['farabeuf', 'senn-miller'])
    expect(identificadoresDeInstrumento(null)).toEqual([])
    expect(identificadoresDeInstrumento('')).toEqual([])
  })

  it('para cortar, los de siempre en su orden de preferencia, y solo lo que corta músculo', () => {
    expect(instrumentosParaActuar('cortar', bandeja).map((i) => i.id)).toEqual(['2', '1', '3'])
  })

  it('para separar, el Farabeuf antes que el Hohmann, y nada que no separe', () => {
    expect(instrumentosParaActuar('separar', bandeja).map((i) => i.id)).toEqual(['4', '5'])
  })

  it('lo que el editor dejó escrito en la ficha va primero y solo, en su orden', () => {
    expect(instrumentosParaActuar('separar', bandeja, ['separador-hohmann', 'separador-farabeuf']).map((i) => i.id)).toEqual(['5', '4'])
    expect(instrumentosParaActuar('cortar', bandeja, ['electrobisturi']).map((i) => i.id)).toEqual(['3'])
  })

  it('si ninguno de los escritos está en la bandeja, valen los de siempre', () => {
    expect(instrumentosParaActuar('separar', bandeja, ['senn-miller']).map((i) => i.id)).toEqual(['4', '5'])
  })

  it('una bandeja sin nada que sirva devuelve una lista vacía', () => {
    expect(instrumentosParaActuar('cortar', [bandeja[5]])).toEqual([])
  })
})

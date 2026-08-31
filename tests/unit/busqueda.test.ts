import { describe, it, expect } from 'vitest'
import { normalizar, filtrarFichas, type FichaBuscable } from '@/lib/busqueda'

const fichas: FichaBuscable[] = [
  { id: 1, nombre: 'Fractura de la diáfisis femoral', subtitulo: 'Adulto', codigo: '32', tipo: 'trauma', segmentoId: 10 },
  { id: 2, nombre: 'Luxación glenohumeral', subtitulo: 'Anterior recidivante', codigo: '11', tipo: 'trauma', segmentoId: 20 },
  { id: 3, nombre: 'Artrosis de rodilla', subtitulo: 'Escalonamiento terapéutico', codigo: 'GA', tipo: 'ortopedia', segmentoId: 30 },
  { id: 4, nombre: 'Tendinopatía del Aquiles', subtitulo: null, codigo: null, tipo: 'ortopedia', segmentoId: 40 },
]

describe('normalizar', () => {
  it('ignora mayúsculas', () => {
    expect(normalizar('FÉMUR')).toBe(normalizar('fémur'))
  })

  it('ignora las tildes: nadie las escribe al buscar', () => {
    expect(normalizar('diáfisis')).toBe(normalizar('diafisis'))
    expect(normalizar('luxación')).toBe(normalizar('luxacion'))
  })

  it('conserva la eñe como letra propia', () => {
    expect(normalizar('año')).not.toBe(normalizar('ano'))
  })

  it('colapsa los espacios sobrantes', () => {
    expect(normalizar('  fractura   femoral ')).toBe('fractura femoral')
  })
})

describe('filtrarFichas', () => {
  it('sin criterios devuelve todo', () => {
    expect(filtrarFichas(fichas, {})).toHaveLength(4)
  })

  it('busca en el nombre sin tildes ni mayúsculas', () => {
    expect(filtrarFichas(fichas, { texto: 'DIAFISIS' }).map((f) => f.id)).toEqual([1])
  })

  it('busca también en el subtítulo', () => {
    expect(filtrarFichas(fichas, { texto: 'recidivante' }).map((f) => f.id)).toEqual([2])
  })

  it('busca por código AO', () => {
    expect(filtrarFichas(fichas, { texto: '32' }).map((f) => f.id)).toEqual([1])
  })

  it('tolera que falten subtítulo o código', () => {
    expect(() => filtrarFichas(fichas, { texto: 'aquiles' })).not.toThrow()
    expect(filtrarFichas(fichas, { texto: 'aquiles' }).map((f) => f.id)).toEqual([4])
  })

  it('filtra por tipo', () => {
    expect(filtrarFichas(fichas, { tipo: 'ortopedia' }).map((f) => f.id)).toEqual([3, 4])
  })

  it('filtra por segmento', () => {
    expect(filtrarFichas(fichas, { segmentoId: 20 }).map((f) => f.id)).toEqual([2])
  })

  it('combina los criterios con Y, no con O', () => {
    expect(filtrarFichas(fichas, { texto: 'a', tipo: 'ortopedia', segmentoId: 30 }).map((f) => f.id)).toEqual([3])
  })

  it('busca por palabras sueltas en cualquier orden', () => {
    expect(filtrarFichas(fichas, { texto: 'femoral fractura' }).map((f) => f.id)).toEqual([1])
  })

  it('devuelve vacío cuando nada coincide, sin fallar', () => {
    expect(filtrarFichas(fichas, { texto: 'escafoides' })).toEqual([])
  })

  it('un texto en blanco no filtra nada', () => {
    expect(filtrarFichas(fichas, { texto: '   ' })).toHaveLength(4)
  })
})

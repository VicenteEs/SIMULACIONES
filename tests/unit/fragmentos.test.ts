import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { planoDeLaLinea } from '@/atlas/fragmentos'
import { normalizarSeleccion } from '@/atlas/catalogo'
import { idDeFragmento, partesDeFragmento, piezaDe, type CatalogoDelAtlas } from '@/atlas/formato'

/**
 * Quebrar un hueso en el taller (D-130): el plano que sale de la línea trazada,
 * los nombres de los fragmentos y lo que se deja guardar.
 */

describe('planoDeLaLinea', () => {
  const haciaDentro = new THREE.Vector3(0, 0, -1)

  // Una línea horizontal vista de frente tiene que dar un corte horizontal: el
  // plano contiene la línea y la dirección de la mirada, así que su normal es
  // vertical.
  it('una línea horizontal vista de frente corta en horizontal, por su punto medio', () => {
    const plano = planoDeLaLinea(new THREE.Vector3(-1, 0.4, 0), new THREE.Vector3(1, 0.4, 0), haciaDentro)
    expect(plano).not.toBeNull()
    expect(Math.abs(plano!.normal[1])).toBeCloseTo(1, 6)
    expect(plano!.normal[0]).toBeCloseTo(0, 6)
    expect(plano!.punto).toEqual([0, 0.4, 0])
  })

  it('no hay plano si la línea no tiene largo o se mira a lo largo de ella', () => {
    const p = new THREE.Vector3(1, 1, 1)
    expect(planoDeLaLinea(p, p.clone(), haciaDentro)).toBeNull()
    expect(planoDeLaLinea(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2), haciaDentro)).toBeNull()
  })
})

describe('los nombres de los fragmentos', () => {
  it('van y vuelven', () => {
    expect(idDeFragmento('FJ3387', 'a')).toBe('FJ3387#a')
    expect(partesDeFragmento('FJ3387#b')).toEqual({ pieza: 'FJ3387', lado: 'b' })
    expect(piezaDe('FJ3387#a')).toBe('FJ3387')
  })

  it('una pieza entera no es un fragmento', () => {
    expect(partesDeFragmento('FJ3387')).toBeNull()
    expect(partesDeFragmento('FJ3387#c')).toBeNull()
    expect(piezaDe('FJ3387')).toBe('FJ3387')
  })
})

describe('los cortes que se dejan guardar', () => {
  const catalogo = {
    version: 'prueba',
    piezas: [{ id: 'tibia' }, { id: 'femur' }],
  } as unknown as CatalogoDelAtlas
  const guardar = (cortes: unknown, piezas: unknown = ['tibia', 'femur']) =>
    normalizarSeleccion(catalogo, piezas, null, cortes).cortes

  it('guarda el plano con la normal unitaria y lo movido de cada fragmento', () => {
    const cortes = guardar([
      { pieza: 'tibia', punto: [0, 0.4, 0], normal: [0, 2, 0], a: { mover: [0.01, 0, 0] }, b: {} },
    ])
    expect(cortes).toEqual([
      { pieza: 'tibia', punto: [0, 0.4, 0], normal: [0, 1, 0], a: { mover: [0.01, 0, 0] } },
    ])
  })

  it('sin cortes válidos el campo no existe: lo guardado antes de D-130 no cambia', () => {
    expect(guardar(undefined)).toBeUndefined()
    expect(guardar([])).toBeUndefined()
    expect(guardar('no es una lista')).toBeUndefined()
  })

  // Llega del navegador. Un plano roto haría fallar el corte al abrir la ficha,
  // semanas después de haberse guardado.
  it('descarta planos mal formados, normales nulas y piezas que no están en la preparación', () => {
    expect(guardar([{ pieza: 'tibia', punto: [0, Number.NaN, 0], normal: [0, 1, 0] }])).toBeUndefined()
    expect(guardar([{ pieza: 'tibia', punto: [0, 0, 0], normal: [0, 0, 0] }])).toBeUndefined()
    expect(guardar([{ pieza: 'rotula', punto: [0, 0, 0], normal: [0, 1, 0] }])).toBeUndefined()
    expect(guardar([{ pieza: 'femur', punto: [0, 0, 0], normal: [0, 1, 0] }], ['tibia'])).toBeUndefined()
  })

  it('un solo corte por pieza: el segundo se ignora', () => {
    const cortes = guardar([
      { pieza: 'tibia', punto: [0, 0.4, 0], normal: [0, 1, 0] },
      { pieza: 'tibia', punto: [0, 0.2, 0], normal: [1, 0, 0] },
    ])
    expect(cortes).toHaveLength(1)
    expect(cortes![0].punto).toEqual([0, 0.4, 0])
  })
})

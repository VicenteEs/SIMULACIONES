import { describe, it, expect } from 'vitest'
import {
  colocarLaMesa,
  haciaLaBandeja,
  ladoDerecho,
  lugarDeLaMesa,
  LUGARES_DE_LA_MESA,
  MEDIDAS_DE_LA_SALA as M,
  type ColocacionDeLaMesa,
  type DecubitoDeLaMesa,
} from '@/lib/mesaDeArsenalera'

/**
 * Los sitios de la mesa de la arsenalera son geometría: se prueban con números, en el marco del colchón.
 *
 * Lo que importa es lo que se ve: que la mesa no se meta dentro del colchón ni de la camilla, que «Derecha» sea la
 * derecha del paciente también boca abajo, y que la bandeja que va sobre él pase por encima.
 */

/** La caja de la base en el suelo, en el marco del colchón: el ancho de la base por el largo de la bandeja y el poste. */
function huellaDeLaBase(c: ColocacionDeLaMesa) {
  const largo = haciaLaBandeja(c.giro)
  const ancho = { x: -largo.z, z: largo.x }
  const puntos: { x: number; z: number }[] = []
  for (const a of [-(M.delCentroAlPoste + 0.12), M.medioLargoDeLaBandeja]) {
    for (const b of [-M.medioAnchoDeLaBase, M.medioAnchoDeLaBase]) {
      puntos.push({ x: c.x + largo.x * a + ancho.x * b, z: c.z + largo.z * a + ancho.z * b })
    }
  }
  return puntos
}

const DECUBITOS: DecubitoDeLaMesa[] = ['supino', 'prono']

describe('colocarLaMesa', () => {
  it('hay cuatro sitios fijos y uno libre, que es lo que pidió el dueño', () => {
    expect(LUGARES_DE_LA_MESA.map((l) => l.valor)).toEqual(['derecha', 'izquierda', 'pies', 'encima', 'libre'])
  })

  it.each(DECUBITOS)('a los lados y a los pies la base no entra en el colchón (%s)', (decubito) => {
    for (const lugar of ['derecha', 'izquierda', 'pies'] as const) {
      const c = colocarLaMesa(lugar, { decubito, zDeLaZona: 0.75 })
      expect(c.subida).toBe(0)
      for (const p of huellaDeLaBase(c)) {
        const dentro = Math.abs(p.x) < M.medioAnchoDelColchon && Math.abs(p.z) < M.medioLargoDelColchon
        expect(dentro, `${lugar}: (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`).toBe(false)
      }
    }
  })

  it('«Derecha» es la derecha del paciente: en el atlas la pierna derecha está en X negativa, y boca abajo al revés', () => {
    expect(ladoDerecho('supino')).toBe(-1)
    expect(ladoDerecho('prono')).toBe(1)
    expect(colocarLaMesa('derecha', { decubito: 'supino', zDeLaZona: 0.7 }).x).toBeLessThan(0)
    expect(colocarLaMesa('derecha', { decubito: 'prono', zDeLaZona: 0.7 }).x).toBeGreaterThan(0)
    expect(colocarLaMesa('izquierda', { decubito: 'supino', zDeLaZona: 0.7 }).x).toBeGreaterThan(0)
  })

  it('a los lados va a la altura de lo que se opera, sin pasarse de los extremos de la camilla', () => {
    expect(colocarLaMesa('derecha', { decubito: 'supino', zDeLaZona: 0.4 }).z).toBeCloseTo(0.4, 6)
    const alFondo = colocarLaMesa('derecha', { decubito: 'supino', zDeLaZona: 3 })
    expect(alFondo.z + M.medioLargoDeLaBandeja).toBeLessThanOrEqual(M.medioLargoDelColchon + 1e-9)
  })

  it('a los lados la bandeja va paralela al colchón, con el poste hacia la cabeza', () => {
    const c = colocarLaMesa('derecha', { decubito: 'supino', zDeLaZona: 0.7 })
    const bandeja = haciaLaBandeja(c.giro)
    expect(bandeja.z).toBeCloseTo(1, 6)
    expect(bandeja.x).toBeCloseTo(0, 6)
  })

  it.each(DECUBITOS)('sobre el paciente: el poste fuera del colchón por la derecha y la bandeja subida (%s)', (decubito) => {
    const c = colocarLaMesa('encima', { decubito, zDeLaZona: 0.8 })
    const bandeja = haciaLaBandeja(c.giro)
    const poste = { x: c.x - bandeja.x * M.delCentroAlPoste, z: c.z - bandeja.z * M.delCentroAlPoste }
    expect(Math.abs(poste.x)).toBeGreaterThan(M.medioAnchoDelColchon)
    expect(Math.sign(poste.x)).toBe(ladoDerecho(decubito))
    // El centro de la bandeja, sobre el colchón.
    expect(Math.abs(c.x)).toBeLessThan(M.medioAnchoDelColchon)
    expect(c.subida).toBeGreaterThan(0.25)
    // Antes de lo que se opera, hacia la cabeza, para no taparlo.
    expect(c.z).toBeLessThan(0.8)
  })

  it('sobre el paciente no pasa de la mitad de la camilla hacia la cabeza: ahí está la columna y la base no entra', () => {
    expect(colocarLaMesa('encima', { decubito: 'supino', zDeLaZona: -0.5 }).z).toBeGreaterThanOrEqual(0.33)
  })

  it('libre: donde se dejó, con el giro del último sitio, y subida si la bandeja cae sobre el colchón', () => {
    const fuera = colocarLaMesa('libre', { decubito: 'supino', zDeLaZona: 0, libre: { x: 1.2, z: 0.3 }, giroAnterior: 0.5 })
    expect(fuera).toEqual({ x: 1.2, z: 0.3, giro: 0.5, subida: 0 })
    const encima = colocarLaMesa('libre', { decubito: 'supino', zDeLaZona: 0, libre: { x: 0.1, z: 0.6 } })
    expect(encima.subida).toBeGreaterThan(0)
  })

  it('libre no deja llevarla más lejos de lo que se ve desde la camilla', () => {
    const c = colocarLaMesa('libre', { decubito: 'supino', zDeLaZona: 0, libre: { x: 30, z: -40 } })
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(M.alcanceLibre, 6)
  })
})

describe('lugarDeLaMesa', () => {
  it('lo que no es un sitio conocido es «Derecha»', () => {
    expect(lugarDeLaMesa('pies')).toBe('pies')
    expect(lugarDeLaMesa('cabecera')).toBe('derecha')
    expect(lugarDeLaMesa(undefined)).toBe('derecha')
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { OPACIDAD_DE_LA_PIEL, idDeLaPiel, sinLaPielSiHayMas } from '@/atlas/piel'

/**
 * El interruptor «Piel» y lo que hace con el clic y el marco (D-162, E5.1).
 */

const leer = (...partes: string[]) => readFileSync(join(process.cwd(), ...partes), 'utf8').replace(/\r\n/g, '\n')

describe('la piel en el catálogo', () => {
  it('es la pieza «Skin», y el atlas real la trae', () => {
    const catalogo = JSON.parse(leer('public', 'atlas', 'catalogo.json'))
    expect(idDeLaPiel(catalogo)).toBe('FJ2810')
  })

  it('un atlas sin piel no tiene interruptor', () => {
    expect(idDeLaPiel({ piezas: [] })).toBeNull()
    expect(idDeLaPiel(null)).toBeNull()
  })

  it('nace al 30 %', () => {
    expect(OPACIDAD_DE_LA_PIEL).toBe(0.3)
  })
})

describe('lo que un marco se lleva', () => {
  it('la piel se queda fuera si hay algo más', () => {
    expect(sinLaPielSiHayMas(['FJ1', 'FJ2810', 'FJ2'], 'FJ2810')).toEqual(['FJ1', 'FJ2'])
  })

  it('si es lo único que hay dentro, se deja', () => {
    expect(sinLaPielSiHayMas(['FJ2810'], 'FJ2810')).toEqual(['FJ2810'])
  })

  it('sin piel en el marco o sin piel en el atlas, todo igual', () => {
    expect(sinLaPielSiHayMas(['FJ1', 'FJ2'], 'FJ2810')).toEqual(['FJ1', 'FJ2'])
    expect(sinLaPielSiHayMas(['FJ1', 'FJ2810'], null)).toEqual(['FJ1', 'FJ2810'])
  })
})

describe('cableado', () => {
  const taller = leer('src', 'components', 'admin', 'atlas', 'TallerDeAtlas.tsx')
  const visor = leer('src', 'components', 'atlas', 'VisorAtlas.tsx')

  it('el taller tiene su botón y le dice al visor cuál es la piel', () => {
    expect(taller).toContain('onClick={alternarLaPiel}')
    expect(taller).toContain('pielQueDejaPasar={idDeLaPiel(catalogo)}')
  })

  it('encender la piel es un paso del historial y la deja al 30 % solo la primera vez', () => {
    const cuerpo = taller.slice(taller.indexOf('const alternarLaPiel = '), taller.indexOf('/** Todo el cuerpo encendido'))
    expect(cuerpo).toContain('cambiarVisibles(nuevas)')
    expect(cuerpo).toContain('propio?.opacidad === undefined')
    expect(cuerpo).toContain('OPACIDAD_DE_LA_PIEL')
  })

  it('el visor deja pasar el clic y el marco, y solo si la piel es lo primero que toca', () => {
    expect(visor).toContain('pielQueDejaPasar')
    expect(visor).toContain('new Set([entera.indice])')
    expect(visor).toContain('sinLaPielSiHayMas(')
    // Las fichas no la usan: el residente no selecciona nada.
    expect(leer('src', 'components', 'atlas', 'VisorInstancia.tsx')).not.toContain('pielQueDejaPasar')
  })
})

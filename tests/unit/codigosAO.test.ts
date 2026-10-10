import { describe, expect, it } from 'vitest'
import { coincideConLaClasificacion, leerCodigos } from '@/atlas/codigosAO'
import { codigoAO, GRUPOS_AO, HUESOS_AO } from '@/atlas/clasificacionAO'

/** Los códigos que traen las fichas de Técnica AO, escritos a mano y cada uno a su manera (D-169, E6). */

const uno = (texto: string) => {
  const c = leerCodigos(texto)
  expect(c, texto).toHaveLength(1)
  return c[0]
}

describe('leerCodigos', () => {
  it('lee hueso, segmento, tipo y grupo', () => {
    expect(uno('42-A2')).toMatchObject({ huesos: ['tibia'], segmento: 2, tipo: 'A', grupo: 'A2' })
    expect(uno('12A1')).toMatchObject({ huesos: ['humero'], segmento: 2, tipo: 'A', grupo: 'A1' })
    expect(uno('31-B3')).toMatchObject({ huesos: ['femur'], segmento: 1, tipo: 'B', grupo: 'B3' })
  })

  it('un código sin grupo, o sin tipo, se lee hasta donde llega', () => {
    expect(uno('43-C')).toMatchObject({ segmento: 3, tipo: 'C', grupo: null })
    expect(uno('42')).toMatchObject({ huesos: ['tibia'], segmento: 2, tipo: null, grupo: null })
  })

  it('el antebrazo antiguo (22) vale para el radio y el cúbito', () => {
    expect(uno('22-A3').huesos).toEqual(['radio', 'cubito'])
  })

  it('los códigos de 2018 con letra: radio, cúbito y peroné', () => {
    expect(uno('2R2-A3')).toMatchObject({ huesos: ['radio'], segmento: 2, tipo: 'A', grupo: 'A3' })
    expect(uno('2U2-A3').huesos).toEqual(['cubito'])
    expect(uno('4F2-B').huesos).toEqual(['peroneo'])
    // Y los de la edición anterior de esta plataforma, con la letra tras el segmento.
    expect(uno('22R-A3').huesos).toEqual(['radio'])
  })

  it('la clavícula lleva punto', () => {
    expect(uno('15.2-A2')).toMatchObject({ huesos: ['clavicula'], segmento: 2, grupo: 'A2' })
  })

  it('mano y pie: el rayo o el dedo no se confunden con el segmento', () => {
    expect(uno('77.3.2-A3')).toMatchObject({ huesos: ['metacarpiano'], segmento: 2, tipo: 'A' })
    expect(uno('78.2.1.2')).toMatchObject({ huesos: ['falange_mano'], segmento: 2 })
    expect(uno('88.1.2.1')).toMatchObject({ huesos: ['falange_pie'], segmento: 1 })
    expect(uno('87.1.3-C')).toMatchObject({ huesos: ['metatarsiano'], segmento: 3, tipo: 'C' })
  })

  it('una lista son varios códigos, y las letras sueltas heredan hueso y segmento', () => {
    const c = leerCodigos('43-C2 / 43-C3')
    expect(c.map((x) => x.grupo)).toEqual(['C2', 'C3'])
    const heredados = leerCodigos('43-C2, C3')
    expect(heredados).toHaveLength(2)
    expect(heredados[1]).toMatchObject({ huesos: ['tibia'], segmento: 3, grupo: 'C3' })
  })

  it('el maléolo (44) es de la pierna y no tiene segmento de los tres', () => {
    expect(uno('44-B2')).toMatchObject({ huesos: ['tibia'], segmento: null, tipo: 'B', grupo: 'B2' })
    // 14 y 34 no son «húmero, cuarto segmento»: son la escápula y la rótula, que no se leen.
    expect(leerCodigos('14')).toEqual([])
    expect(leerCodigos('34-A')).toEqual([])
  })

  it('lo que no es un código no sale: «AO A2, A3, C1» sin hueso, un clasificador de otro tipo, el vacío', () => {
    expect(leerCodigos('AO A2, A3, C1')).toEqual([])
    expect(leerCodigos('Mason II-III')).toEqual([])
    expect(leerCodigos('Salter-Harris')).toEqual([])
    expect(leerCodigos('')).toEqual([])
    expect(leerCodigos(null)).toEqual([])
  })

  it('lee todos los códigos que escribe el propio asistente de fracturas', () => {
    // Si el taller escribe un código que el navegador no entiende, las fichas hechas con él no se encuentran.
    for (const h of HUESOS_AO) {
      for (const g of GRUPOS_AO.filter((x) => x.disponible)) {
        for (const s of g.segmentos) {
          const codigo = codigoAO(h.id, s, g.id)
          if (!codigo) continue
          const leidos = leerCodigos(codigo)
          expect(leidos, `${h.id} ${s} ${g.id} → ${codigo}`).toHaveLength(1)
          expect(leidos[0].huesos, codigo).toContain(h.id)
          expect(leidos[0].segmento, codigo).toBe(s)
          // La conminuta focal escribe solo el tipo (`42-C`): sin grupo, pero con tipo.
          expect(leidos[0].tipo, codigo).toBe(g.tipo)
        }
      }
    }
  })
})

describe('coincideConLaClasificacion', () => {
  const tibiaA2 = leerCodigos('42-A2')
  const tibiaC = leerCodigos('43-C')
  const varios = leerCodigos('43-C2 / 43-C3')

  it('sin filtro, todo coincide (también lo que no trae código)', () => {
    expect(coincideConLaClasificacion([], {})).toBe(true)
  })

  it('un filtro afina: hueso, luego segmento, tipo y grupo', () => {
    expect(coincideConLaClasificacion(tibiaA2, { hueso: 'tibia' })).toBe(true)
    expect(coincideConLaClasificacion(tibiaA2, { hueso: 'femur' })).toBe(false)
    expect(coincideConLaClasificacion(tibiaA2, { hueso: 'tibia', segmento: 2 })).toBe(true)
    expect(coincideConLaClasificacion(tibiaA2, { hueso: 'tibia', segmento: 3 })).toBe(false)
    expect(coincideConLaClasificacion(tibiaA2, { hueso: 'tibia', segmento: 2, tipo: 'A', grupo: 'A2' })).toBe(true)
    expect(coincideConLaClasificacion(tibiaA2, { hueso: 'tibia', segmento: 2, tipo: 'A', grupo: 'A3' })).toBe(false)
  })

  it('un código menos detallado que el filtro sí coincide: no dice que no lo sea', () => {
    expect(coincideConLaClasificacion(tibiaC, { hueso: 'tibia', segmento: 3, tipo: 'C', grupo: 'C2' })).toBe(true)
    expect(coincideConLaClasificacion(tibiaC, { hueso: 'tibia', segmento: 3, tipo: 'B' })).toBe(false)
  })

  it('una ficha con varios códigos coincide si cualquiera coincide', () => {
    expect(coincideConLaClasificacion(varios, { hueso: 'tibia', segmento: 3, tipo: 'C', grupo: 'C3' })).toBe(true)
    expect(coincideConLaClasificacion(varios, { hueso: 'tibia', segmento: 3, tipo: 'C', grupo: 'C1' })).toBe(false)
  })

  it('una ficha sin código no coincide con ningún filtro concreto', () => {
    expect(coincideConLaClasificacion([], { hueso: 'tibia' })).toBe(false)
  })

  it('el antebrazo antiguo responde al radio y al cúbito', () => {
    const antiguo = leerCodigos('22-A3')
    expect(coincideConLaClasificacion(antiguo, { hueso: 'radio' })).toBe(true)
    expect(coincideConLaClasificacion(antiguo, { hueso: 'cubito' })).toBe(true)
    expect(coincideConLaClasificacion(antiguo, { hueso: 'tibia' })).toBe(false)
  })
})

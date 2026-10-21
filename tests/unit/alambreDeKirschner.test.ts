import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comportamientoDelInstrumento } from '@/lib/comportamientoDelInstrumento'
import {
  LARGO_DEL_ALAMBRE_MM,
  MAXIMO_DE_ALAMBRES,
  PROFUNDIDAD_MINIMA_MM,
  SE_PASA_SIN_RIESGO_MM,
  juzgarElAlambre,
  resumenDeLosAlambres,
  textoDelAlambre,
} from '@/lib/alambreDeKirschner'

/** La aguja de Kirschner: se clava, se queda puesta y se juzga (P-005 E3). */

describe('juzgar la aguja', () => {
  // El hueso: la cortical opuesta está a 30 mm de la entrada.
  const salida = 30

  it('una aguja que apenas entró no sujeta nada', () => {
    const j = juzgarElAlambre({ profundidadMm: PROFUNDIDAD_MINIMA_MM - 0.5, salidaPorLaOpuestaMm: salida })
    expect(j.sujeta).toBe(false)
    expect(j.aviso).toMatch(/apenas entró/)
  })

  it('una que se quedó en la cortical cercana sujeta poco', () => {
    const j = juzgarElAlambre({ profundidadMm: 12, salidaPorLaOpuestaMm: salida })
    expect(j.bicortical).toBe(false)
    expect(j.sujeta).toBe(false)
    expect(j.aviso).toMatch(/cortical cercana.*sujeta poco/)
  })

  it('una bicortical que no se pasa sujeta y no avisa', () => {
    const j = juzgarElAlambre({ profundidadMm: salida + 1, salidaPorLaOpuestaMm: salida })
    expect(j.bicortical).toBe(true)
    expect(j.sePasoMm).toBeCloseTo(1, 6)
    expect(j.sujeta).toBe(true)
    expect(j.aviso).toBeNull()
  })

  it('llegar justo a la cortical opuesta (con media muesca de tolerancia) ya es bicortical', () => {
    expect(juzgarElAlambre({ profundidadMm: salida - 0.4, salidaPorLaOpuestaMm: salida }).bicortical).toBe(true)
    expect(juzgarElAlambre({ profundidadMm: salida - 0.6, salidaPorLaOpuestaMm: salida }).bicortical).toBe(false)
  })

  it('pasarse de la opuesta más de lo tolerado avisa del riesgo para los blandos', () => {
    const justo = juzgarElAlambre({ profundidadMm: salida + SE_PASA_SIN_RIESGO_MM, salidaPorLaOpuestaMm: salida })
    expect(justo.sujeta).toBe(true)
    const largo = juzgarElAlambre({ profundidadMm: salida + SE_PASA_SIN_RIESGO_MM + 4, salidaPorLaOpuestaMm: salida })
    expect(largo.sujeta).toBe(false)
    expect(largo.aviso).toMatch(/pasó 7,0 mm.*vasos o nervios/)
  })

  it('asoma lo que sobra del largo de la aguja, y no menos de cero', () => {
    expect(juzgarElAlambre({ profundidadMm: 40, salidaPorLaOpuestaMm: salida }).asomaMm).toBe(LARGO_DEL_ALAMBRE_MM - 40)
    expect(juzgarElAlambre({ profundidadMm: LARGO_DEL_ALAMBRE_MM + 20, salidaPorLaOpuestaMm: salida }).asomaMm).toBe(0)
  })

  it('el texto de cada aguja dice su número, la profundidad y dónde quedó', () => {
    expect(textoDelAlambre(2, 32.2, juzgarElAlambre({ profundidadMm: 32.2, salidaPorLaOpuestaMm: salida }))).toBe('Aguja 2 · 32,2 mm · bicortical · asoma 118 mm')
    expect(textoDelAlambre(1, 12, juzgarElAlambre({ profundidadMm: 12, salidaPorLaOpuestaMm: salida }))).toMatch(/solo la cortical cercana/)
    expect(textoDelAlambre(3, 50, juzgarElAlambre({ profundidadMm: 50, salidaPorLaOpuestaMm: salida }))).toMatch(/se pasó/)
  })

  it('el resumen numera las agujas en el orden en que se pusieron y dice cuáles sujetan', () => {
    const r = resumenDeLosAlambres([
      { profundidadMm: 12, salidaPorLaOpuestaMm: salida },
      { profundidadMm: 31, salidaPorLaOpuestaMm: salida },
    ])
    expect(r.lista.map((a) => a.numero)).toEqual([1, 2])
    expect(r.lista.map((a) => a.sujeta)).toEqual([false, true])
    expect(r.lista[0].aviso).toMatch(/cortical cercana/)
    expect(r.lista[1].aviso).toBeNull()
    expect(resumenDeLosAlambres([]).lista).toEqual([])
  })

  it('caben unas pocas agujas a la vez', () => {
    expect(MAXIMO_DE_ALAMBRES).toBeGreaterThanOrEqual(4)
  })
})

describe('la aguja es una perforación que se queda puesta', () => {
  it('la aguja de Kirschner perfora con su calibre y deja el alambre; las brocas no', () => {
    const aguja = comportamientoDelInstrumento({ slug: 'aguja-kirschner', nombre: 'Aguja de Kirschner 1,6 mm' })
    expect(aguja.perfora).toMatchObject({ diametroMm: 1.6, alambre: true })
    expect(comportamientoDelInstrumento({ nombre: 'Aguja de Kirschner de 2 mm' }).perfora?.alambre).toBe(true)
    expect(comportamientoDelInstrumento({ slug: 'broca-2-5', nombre: 'Broca AO 2,5 mm' }).perfora?.alambre).toBeUndefined()
  })

  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')
  const lienzo = leer('src/components/simulador/LienzoQuirurgico.tsx')
  const consola = leer('src/components/simulador/ConsolaQuirurgica.tsx')

  it('al retirar la perforación de una aguja queda el alambre en la escena, y la fluoroscopia lo ve (no es de interfaz)', () => {
    expect(lienzo).toContain('config.alambre')
    expect(lienzo).toContain('alambre-de-kirschner')
    expect(lienzo).not.toMatch(/alambre-de-kirschner[\s\S]{0,200}deInterfaz/)
  })

  it('la consola ofrece quitar los alambres y los reinicios los quitan', () => {
    expect(consola).toContain('quitarLosAlambres')
    expect(consola).toContain('Quitar las agujas')
  })
})

import { describe, expect, it } from 'vitest'
import { INSTRUMENTAL_BASE } from '@/lib/instrumental'
import { comportamientoDelInstrumento, diametroEnElNombre } from '@/lib/comportamientoDelInstrumento'

/**
 * Qué hace cada instrumento en la escena (D-167). La tabla se escribió a mano,
 * así que lo que se prueba es que no se desvía del catálogo: un instrumento que
 * cambie de slug dejaría de cortar o de separar sin ningún error.
 */

const base = (slug: string) => INSTRUMENTAL_BASE.find((i) => i.slug === slug)!

describe('comportamiento del instrumental', () => {
  it('todo instrumento de la tabla existe en el catálogo base', () => {
    for (const slug of [
      'bisturi-piel-n22',
      'bisturi-profundo-n15',
      'electrobisturi',
      'tijera-mayo',
      'tijera-metzenbaum',
      'separador-senn-miller',
      'separador-farabeuf',
      'separador-hohmann',
      'separador-gelpi',
      'separador-weitlaner',
      'separador-beckman-adson',
      'broca-1-5',
      'broca-2-0',
      'broca-2-5',
      'broca-3-2',
      'broca-3-5',
      'broca-4-5',
      'avellanador',
      'machuelo-3-5',
      'fresa-flexible',
    ]) {
      expect(base(slug), slug).toBeTruthy()
    }
  })

  it('el bisturí de piel corta la piel y el profundo los planos de abajo', () => {
    expect(comportamientoDelInstrumento(base('bisturi-piel-n22')).corta).toBe('piel')
    expect(comportamientoDelInstrumento(base('bisturi-profundo-n15')).corta).toBe('musculo')
  })

  it('un separador de mano abre menos que uno autoestático, y solo este se queda abierto', () => {
    const farabeuf = comportamientoDelInstrumento(base('separador-farabeuf')).separa!
    const weitlaner = comportamientoDelInstrumento(base('separador-weitlaner')).separa!
    expect(farabeuf.autoestatico).toBe(false)
    expect(weitlaner.autoestatico).toBe(true)
    expect(weitlaner.maximoMm).toBeGreaterThan(farabeuf.maximoMm)
  })

  it('las brocas perforan con su calibre, y el instrumental común no hace nada', () => {
    expect(comportamientoDelInstrumento(base('broca-2-5')).perfora?.diametroMm).toBe(2.5)
    expect(comportamientoDelInstrumento(base('broca-3-2')).perfora?.diametroMm).toBe(3.2)
    // Las de minifragmentos y la de deslizamiento: cada calibre es el suyo.
    expect(comportamientoDelInstrumento(base('broca-1-5')).perfora?.diametroMm).toBe(1.5)
    expect(comportamientoDelInstrumento(base('broca-4-5')).perfora?.diametroMm).toBe(4.5)
    const pinza = comportamientoDelInstrumento(base('pinza-diseccion-con-dientes'))
    expect(pinza).toEqual({ corta: null, separa: null, perfora: null })
    // Los implantes no actúan sobre el paciente: se colocan, no se usan.
    for (const i of INSTRUMENTAL_BASE.filter((x) => ['placas', 'tornillos', 'clavos', 'injerto'].includes(x.categoria))) {
      expect(comportamientoDelInstrumento(i), i.slug).toEqual({ corta: null, separa: null, perfora: null })
    }
  })

  it('un instrumento creado a mano se reconoce por su nombre', () => {
    expect(comportamientoDelInstrumento({ nombre: 'Bisturí de hoja 11' }).corta).toBe('piel')
    expect(comportamientoDelInstrumento({ nombre: 'Bisturí de hoja 15' }).corta).toBe('musculo')
    expect(comportamientoDelInstrumento({ nombre: 'Separador de Langenbeck' }).separa).not.toBeNull()
    expect(comportamientoDelInstrumento({ nombre: 'Broca 4,5 mm' }).perfora?.diametroMm).toBe(4.5)
  })

  it('el calibre se lee del nombre con coma o punto', () => {
    expect(diametroEnElNombre('Broca AO 3,2 mm')).toBe(3.2)
    expect(diametroEnElNombre('Broca 2.7mm')).toBe(2.7)
    expect(diametroEnElNombre('Broca sin medida')).toBe(3)
  })
})

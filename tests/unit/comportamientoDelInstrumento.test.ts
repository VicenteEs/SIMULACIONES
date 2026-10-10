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
    expect(pinza).toEqual({ corta: null, separa: null, perfora: null, sutura: null, coloca: null, mide: false })
    // Los implantes no cortan, separan ni perforan: se colocan (D-169). Los clavos y el
    // injerto, por ahora, solo se ven en la escena.
    for (const i of INSTRUMENTAL_BASE.filter((x) => ['placas', 'tornillos', 'clavos', 'injerto'].includes(x.categoria))) {
      const que = comportamientoDelInstrumento(i)
      expect([que.corta, que.separa, que.perfora, que.sutura], i.slug).toEqual([null, null, null, null])
      expect(!!que.coloca, i.slug).toBe(['placas', 'tornillos'].includes(i.categoria) && i.slug !== 'tornillo-bloqueo-clavo-5-0')
    }
  })

  it('las placas se colocan, los tornillos de placa se ponen y el medidor mide (D-169)', () => {
    expect(comportamientoDelInstrumento(base('placa-lcp-recta-3-5')).coloca).toEqual({ tipo: 'placa' })
    expect(comportamientoDelInstrumento(base('tornillo-cortical-3-5')).coloca).toMatchObject({
      tipo: 'tornillo',
      diametroMm: 3.5,
      bloqueado: false,
    })
    expect(comportamientoDelInstrumento(base('tornillo-bloqueado-lcp-3-5')).coloca).toMatchObject({ bloqueado: true })
    expect(comportamientoDelInstrumento(base('medidor-profundidad')).mide).toBe(true)
    // El tornillo de bloqueo de un clavo no va en una placa.
    expect(comportamientoDelInstrumento(base('tornillo-bloqueo-clavo-5-0')).coloca).toBeNull()
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

describe('las suturas cosen (D-169)', () => {
  it('cada hilo del catálogo coser, y solo ellos', () => {
    for (const slug of ['sutura-vicryl-2-0', 'sutura-vicryl-3-0', 'sutura-nylon-3-0', 'sutura-monocryl-5-0']) {
      const hilo = comportamientoDelInstrumento({ slug, nombre: slug }).sutura
      expect(hilo, slug).not.toBeNull()
      expect(hilo!.grosorMm).toBeGreaterThan(0)
    }
    const quienesCosen = INSTRUMENTAL_BASE.filter((i) => comportamientoDelInstrumento(i).sutura).map((i) => i.slug)
    expect(quienesCosen.sort()).toEqual(['sutura-monocryl-5-0', 'sutura-nylon-3-0', 'sutura-vicryl-2-0', 'sutura-vicryl-3-0'])
  })

  it('un instrumento que ya corta, separa o perfora no cose aunque su nombre suene a hilo', () => {
    expect(comportamientoDelInstrumento({ nombre: 'Bisturí con hilo de seda' }).sutura).toBeNull()
  })

  it('una sutura creada a mano se reconoce por el nombre', () => {
    expect(comportamientoDelInstrumento({ nombre: 'Prolene 4-0' }).sutura).not.toBeNull()
    expect(comportamientoDelInstrumento({ nombre: 'Pinza de disección' }).sutura).toBeNull()
  })
})

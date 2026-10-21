import { describe, expect, it } from 'vitest'
import { INSTRUMENTAL_BASE } from '@/lib/instrumental'
import {
  AGUJERO_VIRGEN,
  COMPANEROS_DE_LA_PLACA,
  PUNTA_FUERA_MAXIMA_MM,
  agujeroMasCercano,
  avisoDeCalibre,
  calibreDeBrocaParaElTornillo,
  companerosDeLasPlacas,
  loQueFaltaPara,
  quePuedeColocar,
  textoDeLoQueFalta,
  juzgarTornillo,
  largoSugerido,
  resumenDeLaFijacion,
  type EstadoDeLaFijacion,
} from '@/lib/fijacion'

/** Las reglas de la fijación con placa y tornillos (D-169). */

describe('largoSugerido', () => {
  it('pide lo medido y dos milímetros, en pasos de dos', () => {
    expect(largoSugerido(20)).toBe(22)
    expect(largoSugerido(21)).toBe(24)
    expect(largoSugerido(12.2)).toBe(16)
  })
  it('no sale del rango del catálogo: de 10 a 60 mm', () => {
    expect(largoSugerido(2)).toBe(10)
    expect(largoSugerido(90)).toBe(60)
    expect(largoSugerido(0)).toBe(10)
  })
  it('cuenta la placa y la holgura: el medidor lee desde la placa, no desde el hueso', () => {
    expect(largoSugerido(34, 14)).toBe(50)
    expect(largoSugerido(34, 0)).toBe(36)
  })
  it('lo que sugiere lo juzga bien el propio juicio: bicortical y sin pasarse', () => {
    // Regresión del servidor: se pedían 36 mm para un hueso de 34 con 14 mm de placa y holgura
    // y ese tornillo se quedaba en la cortical cercana.
    for (const espesorMm of [12, 20.4, 34, 41.7]) {
      for (const holgura of [0, 1.5, 3, 14]) {
        const grosorDeLaPlacaMm = 3
        const distanciaAlHuesoMm = holgura
        const largoMm = largoSugerido(espesorMm, grosorDeLaPlacaMm + distanciaAlHuesoMm)
        if (largoMm >= 60) continue
        const j = juzgarTornillo({ largoMm, grosorDeLaPlacaMm, distanciaAlHuesoMm, espesorMm })
        expect(j.bicortical).toBe(true)
        expect(j.largo).toBe(false)
      }
    }
  })
})

describe('juzgarTornillo', () => {
  const base = { grosorDeLaPlacaMm: 3, distanciaAlHuesoMm: 0, espesorMm: 12 }

  it('un tornillo de lo medido más dos milímetros es bicortical y no se pasa', () => {
    const j = juzgarTornillo({ ...base, largoMm: 3 + 12 + 2 })
    expect(j.bicortical).toBe(true)
    expect(j.puntaFueraMm).toBeCloseTo(2, 6)
    expect(j.largo).toBe(false)
    expect(j.aviso).toBeNull()
  })

  it('uno corto se queda en la cortical cercana y lo dice', () => {
    const j = juzgarTornillo({ ...base, largoMm: 3 + 6 })
    expect(j.bicortical).toBe(false)
    expect(j.aviso).toMatch(/solo una cortical/)
  })

  it('uno que ni llega al hueso es demasiado corto', () => {
    const j = juzgarTornillo({ ...base, largoMm: 3 })
    expect(j.aviso).toMatch(/no llega al hueso/)
  })

  it('uno largo asoma por la cortical opuesta y avisa si pasa del tope', () => {
    const justo = juzgarTornillo({ ...base, largoMm: 3 + 12 + PUNTA_FUERA_MAXIMA_MM })
    expect(justo.largo).toBe(false)
    const largo = juzgarTornillo({ ...base, largoMm: 3 + 12 + 8 })
    expect(largo.bicortical).toBe(true)
    expect(largo.largo).toBe(true)
    expect(largo.aviso).toMatch(/roza las partes blandas/)
  })

  it('con la placa separada del hueso, lo que entra es menos', () => {
    // 2 mm de hueco: el mismo tornillo de 17 mm ya solo asoma 0 mm.
    const j = juzgarTornillo({ ...base, distanciaAlHuesoMm: 2, largoMm: 17 })
    expect(j.puntaFueraMm).toBeCloseTo(0, 6)
  })
})

describe('agujeroMasCercano', () => {
  const agujeros: [number, number, number][] = [
    [0, 0, 0],
    [13, 0, 0],
    [26, 0, 0],
  ]
  it('elige el más cercano dentro del radio', () => {
    expect(agujeroMasCercano(agujeros, [12, 1, 0], 6)).toBe(1)
  })
  it('devuelve null si ninguno cae a esa distancia', () => {
    expect(agujeroMasCercano(agujeros, [6.5, 0, 0], 3)).toBeNull()
  })
})

describe('resumenDeLaFijacion', () => {
  const tornillo = (agujero: number, bicortical: boolean, puntaFueraMm: number) => ({
    agujero,
    largoMm: 20,
    diametroMm: 3.5,
    bicortical,
    puntaFueraMm,
    espesorMm: 12,
    bloqueado: false,
    aviso: null,
  })
  it('sin placa no hay fijación', () => {
    expect(resumenDeLaFijacion(null)).toEqual({ placa: false, tornillos: 0, bicorticales: 0, largos: 0, compresionMm: 0 })
  })
  it('sin placa pero con tornillos de una trayectoria (P-004 E9) los cuenta, sin dar por hecha una placa', () => {
    const estado: EstadoDeLaFijacion = { placa: null, tornillos: [{ ...tornillo(-1, true, 1), libre: true }, { ...tornillo(-2, false, -3), libre: true }] }
    expect(resumenDeLaFijacion(estado)).toEqual({ placa: false, tornillos: 2, bicorticales: 1, largos: 0, compresionMm: 0 })
  })
  it('lleva lo comprimido (P-004 E10)', () => {
    const estado: EstadoDeLaFijacion = {
      placa: { nombre: 'x', agujeros: 8, apoyada: true, separadaDelHuesoMm: 0 },
      tornillos: [tornillo(0, true, 2)],
      compresion: { mm: 1.5, tecnicas: ['excentrico'] },
    }
    expect(resumenDeLaFijacion(estado).compresionMm).toBe(1.5)
  })
  it('cuenta los tornillos, los bicorticales y los largos', () => {
    const estado: EstadoDeLaFijacion = {
      placa: { nombre: 'x', agujeros: 8, apoyada: true, separadaDelHuesoMm: 0 },
      tornillos: [tornillo(0, true, 2), tornillo(1, true, 7), tornillo(2, false, -4)],
    }
    expect(resumenDeLaFijacion(estado)).toEqual({ placa: true, tornillos: 3, bicorticales: 2, largos: 1, compresionMm: 0 })
  })
})

describe('lo que acompaña a cada placa (P-003 E6)', () => {
  const slugsDelCatalogo = new Set(INSTRUMENTAL_BASE.map((i) => i.slug))

  it('toda placa del catálogo base declara sus compañeros, y cada compañero existe en el catálogo', () => {
    const placas = INSTRUMENTAL_BASE.filter((i) => quePuedeColocar(i)?.tipo === 'placa').map((i) => i.slug)
    expect(placas.length).toBeGreaterThan(5)
    for (const placa of placas) {
      expect(COMPANEROS_DE_LA_PLACA[placa!], `la placa ${placa} no declara compañeros`).toBeDefined()
      for (const c of COMPANEROS_DE_LA_PLACA[placa!]) expect(slugsDelCatalogo.has(c), `${placa} nombra «${c}», que no existe`).toBe(true)
    }
  })

  it('cada placa admite al menos un tornillo, una broca, el medidor y un destornillador', () => {
    for (const [placa, lista] of Object.entries(COMPANEROS_DE_LA_PLACA)) {
      expect(lista.some((c) => quePuedeColocar({ slug: c })?.tipo === 'tornillo'), `${placa}: sin tornillos`).toBe(true)
      expect(lista.some((c) => c.startsWith('broca-')), `${placa}: sin broca`).toBe(true)
      expect(lista).toContain('medidor-profundidad')
      expect(lista.some((c) => c.startsWith('destornillador-')), `${placa}: sin destornillador`).toBe(true)
    }
  })

  it('la LCP admite el tornillo bloqueado y la DCP no', () => {
    expect(COMPANEROS_DE_LA_PLACA['placa-lcp-recta-3-5']).toContain('tornillo-bloqueado-lcp-3-5')
    expect(COMPANEROS_DE_LA_PLACA['placa-dcp-4-5']).not.toContain('tornillo-bloqueado-lcp-3-5')
  })

  it('varias placas suman sin repetir, y una placa que no se conoce no suma nada', () => {
    const dos = companerosDeLasPlacas(['placa-lcp-recta-3-5', 'placa-t-3-5'])
    expect(new Set(dos).size).toBe(dos.length)
    expect(companerosDeLasPlacas(['bisturi-piel-n22', null, undefined])).toEqual([])
  })

  it('el tornillo de bloqueo de clavo se reconoce como tornillo, pero solo con clavo', () => {
    const c = quePuedeColocar({ slug: 'tornillo-bloqueo-clavo-5-0' })
    expect(c).toMatchObject({ tipo: 'tornillo', diametroMm: 5, soloConClavo: true })
  })
})

describe('la broca de cada tornillo (P-003 E6)', () => {
  it('2,5 para el cortical y el bloqueado de 3,5; 3,2 para el de esponjosa; 4,3 para el de bloqueo de clavo', () => {
    expect(calibreDeBrocaParaElTornillo(3.5)).toBe(2.5)
    expect(calibreDeBrocaParaElTornillo(6.5)).toBe(3.2)
    expect(calibreDeBrocaParaElTornillo(4.5)).toBe(3.2)
    expect(calibreDeBrocaParaElTornillo(5)).toBe(4.3)
  })

  it('otro calibre sale del 70 % redondeado a décimas', () => {
    expect(calibreDeBrocaParaElTornillo(2.7)).toBe(1.9)
  })

  it('avisa si el agujero quedó estrecho o ancho, y calla si es el que toca', () => {
    expect(avisoDeCalibre(2.5, 3.5)).toBeNull()
    expect(avisoDeCalibre(2.0, 3.5)).toMatch(/estrecho/)
    expect(avisoDeCalibre(3.2, 3.5)).toMatch(/ancho/)
    expect(avisoDeCalibre(3.2, 6.5)).toBeNull()
  })
})

describe('el orden: se perfora, se mide y se atornilla (P-003 E6)', () => {
  const perforado = { diametroMm: 2.5, profundidadMm: 30, bicortical: true }
  const medido = { espesorMm: 28, sugeridoMm: 30 }

  it('sin perforar no se puede medir ni atornillar', () => {
    expect(loQueFaltaPara('medir', undefined)).toBe('perforar')
    expect(loQueFaltaPara('atornillar', AGUJERO_VIRGEN)).toBe('perforar')
    expect(loQueFaltaPara('atornillar', { perforado: null, medido })).toBe('perforar')
  })

  it('perforado se puede medir, pero para atornillar falta medir', () => {
    expect(loQueFaltaPara('medir', { perforado, medido: null })).toBeNull()
    expect(loQueFaltaPara('atornillar', { perforado, medido: null })).toBe('medir')
  })

  it('perforado y medido se puede atornillar', () => {
    expect(loQueFaltaPara('atornillar', { perforado, medido })).toBeNull()
  })

  it('el aviso dice qué falta y en qué agujero, contando desde 1', () => {
    expect(textoDeLoQueFalta('perforar', 0, 'atornillar')).toMatch(/agujero 1 .*perfor/)
    expect(textoDeLoQueFalta('perforar', 2, 'medir')).toMatch(/agujero 3 .*medidor/)
    expect(textoDeLoQueFalta('medir', 4, 'atornillar')).toMatch(/medir el agujero 5/)
  })
})

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comportamientoDelInstrumento } from '@/lib/comportamientoDelInstrumento'
import {
  LARGOS_DEL_BLOQUE_MM,
  RELLENO_MAXIMO,
  RELLENO_MINIMO,
  TOLERANCIA_DEL_BLOQUE_MM,
  VOLUMEN_POR_PUNADO_CC,
  injertoDelNombre,
  juzgarElBloque,
  juzgarElInjerto,
  juzgarElRelleno,
  largoDeBloqueParaElDefecto,
  listaDelInjerto,
  volumenDelDefectoCc,
} from '@/lib/injertoOseo'

/** Los injertos óseos: el esponjoso que se compacta y el bloque estructural (P-005 E7). */

describe('qué injerto es', () => {
  it('se reconoce por slug y por nombre', () => {
    expect(injertoDelNombre({ slug: 'injerto-oseo-esponjoso', nombre: 'Injerto óseo esponjoso en trozos' })).toBe('esponjoso')
    expect(injertoDelNombre({ slug: 'injerto-oseo-tricortical', nombre: 'Injerto óseo tricortical de cresta ilíaca' })).toBe('estructural')
    expect(injertoDelNombre({ nombre: 'Injerto en bloque' })).toBe('estructural')
  })

  it('un instrumento que no es un injerto no lo es', () => {
    expect(injertoDelNombre({ nombre: 'Broca AO 3,2 mm' })).toBeNull()
  })
})

describe('el volumen del defecto', () => {
  it('es el cilindro del ancho del hueso por la separación, en cc', () => {
    // Ø 30 mm × 18 mm = 12,7 cc.
    expect(volumenDelDefectoCc(18, 30)).toBeCloseTo(12.72, 1)
  })

  it('sin separación o sin ancho no hay defecto', () => {
    expect(volumenDelDefectoCc(0, 30)).toBe(0)
    expect(volumenDelDefectoCc(18, 0)).toBe(0)
  })
})

describe('el relleno con esponjoso', () => {
  it('entre el 60 y el 120 % está bien', () => {
    expect(juzgarElRelleno({ puestoCc: 10, defectoCc: 12 })).toMatchObject({ nivel: 'bien', aviso: null })
    expect(juzgarElRelleno({ puestoCc: 12 * RELLENO_MINIMO, defectoCc: 12 }).nivel).toBe('bien')
    expect(juzgarElRelleno({ puestoCc: 12 * RELLENO_MAXIMO, defectoCc: 12 }).nivel).toBe('bien')
  })

  it('con menos falta y con más sobra', () => {
    const falta = juzgarElRelleno({ puestoCc: 4, defectoCc: 12 })
    expect(falta.nivel).toBe('falta')
    expect(falta.aviso).toMatch(/Falta injerto: hay 4 cc en un defecto de unos 12 cc \(33 %\)/)
    const demas = juzgarElRelleno({ puestoCc: 20, defectoCc: 12 })
    expect(demas.nivel).toBe('de-mas')
    expect(demas.aviso).toMatch(/Lo que sobra se sale del foco/)
  })

  it('sin defecto, poner injerto es un error; no ponerlo, no dice nada', () => {
    expect(juzgarElRelleno({ puestoCc: 2, defectoCc: 0 }).aviso).toMatch(/No hay defecto/)
    expect(juzgarElRelleno({ puestoCc: 0, defectoCc: 0 })).toMatchObject({ nivel: 'sin-defecto', aviso: null })
  })

  it('cada puñado son 2 cc: seis puñados llenan un defecto de 12 cc', () => {
    expect(VOLUMEN_POR_PUNADO_CC * 6).toBe(12)
  })
})

describe('el bloque estructural', () => {
  it('con el largo del defecto, con 2 mm de tolerancia, encaja', () => {
    expect(juzgarElBloque({ largoMm: 20, defectoMm: 18 })).toEqual({ encaja: true, aviso: null })
    expect(juzgarElBloque({ largoMm: 20 + TOLERANCIA_DEL_BLOQUE_MM, defectoMm: 20 }).encaja).toBe(true)
  })

  it('uno corto deja hueco y uno largo no entra', () => {
    expect(juzgarElBloque({ largoMm: 10, defectoMm: 18 }).aviso).toMatch(/corto: deja un hueco de 8 mm/)
    expect(juzgarElBloque({ largoMm: 30, defectoMm: 18 }).aviso).toMatch(/largo: sobran 12 mm.*18 mm/)
  })

  it('sin defecto no hay dónde ponerlo', () => {
    expect(juzgarElBloque({ largoMm: 20, defectoMm: 0 }).encaja).toBe(false)
  })

  it('el largo que se talla es el más cercano al defecto', () => {
    expect(largoDeBloqueParaElDefecto(18)).toBe(20)
    expect(largoDeBloqueParaElDefecto(31)).toBe(30)
    expect(largoDeBloqueParaElDefecto(200)).toBe(LARGOS_DEL_BLOQUE_MM[LARGOS_DEL_BLOQUE_MM.length - 1])
  })
})

describe('juzgar lo puesto con el defecto de ahora', () => {
  const puesto = { esponjosoCc: 10, bloqueLargoMm: null, anchoDelHuesoMm: 30, sinFijacion: true }

  it('el mismo injerto vale distinto según cuánto defecto queda', () => {
    expect(juzgarElInjerto(puesto, 18).relleno.nivel).toBe('bien')
    // Al reducir la fractura el defecto desaparece y el injerto puesto sobra.
    expect(juzgarElInjerto(puesto, 0).relleno.nivel).toBe('sin-defecto')
    expect(juzgarElInjerto(puesto, 6).relleno.nivel).toBe('de-mas')
  })

  it('el bloque se juzga contra el defecto de ahora y recuerda si falta fijarlo', () => {
    const e = juzgarElInjerto({ ...puesto, esponjosoCc: 0, bloqueLargoMm: 20 }, 18)
    expect(e.bloque).toMatchObject({ largoMm: 20, encaja: true, sinFijacion: true })
    expect(juzgarElInjerto({ ...puesto, bloqueLargoMm: 20 }, 40).bloque?.encaja).toBe(false)
    expect(juzgarElInjerto(puesto, 18).bloque).toBeNull()
  })
})

describe('la lista del recuadro', () => {
  it('dice cada cosa puesta', () => {
    const l = listaDelInjerto({
      defectoMm: 18,
      defectoCc: 12,
      esponjosoCc: 6,
      relleno: { nivel: 'falta', proporcion: 0.5, aviso: null },
      bloque: { largoMm: 20, encaja: true, aviso: null, sinFijacion: false },
    })
    expect(l).toEqual(['Esponjoso: 6 cc de 12 cc del defecto (50 %)', 'Bloque tricortical de 20 mm en un defecto de 18 mm: encaja'])
    expect(listaDelInjerto(null)).toEqual([])
  })
})

describe('los injertos como herramienta y su cableado', () => {
  it('los dos injertos del catálogo se reconocen', () => {
    expect(comportamientoDelInstrumento({ slug: 'injerto-oseo-esponjoso', nombre: 'Injerto óseo esponjoso en trozos' }).injerta).toBe('esponjoso')
    expect(comportamientoDelInstrumento({ slug: 'injerto-oseo-tricortical', nombre: 'Injerto óseo tricortical de cresta ilíaca' }).injerta).toBe('estructural')
    expect(comportamientoDelInstrumento({ slug: 'broca-3-2', nombre: 'Broca AO 3,2 mm' }).injerta).toBeNull()
  })

  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')

  it('el lienzo deposita el injerto y la fluoroscopia lo ve; la consola ofrece el recuadro y quitarlo', () => {
    expect(leer('src/components/simulador/LienzoQuirurgico.tsx')).toContain('injertarConClic')
    expect(leer('src/components/simulador/injertoEnLaEscena.ts')).toContain('bloque-de-injerto')
    const consola = leer('src/components/simulador/ConsolaQuirurgica.tsx')
    expect(consola).toContain('bloqueDelInjerto')
    expect(consola).toContain('quitarElInjerto')
  })
})

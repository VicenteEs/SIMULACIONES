import { describe, expect, it } from 'vitest'
import {
  PASARSE_DE_LA_CORTICAL_MM,
  RESULTADOS,
  evaluarGesto,
  instruccionDelPaso,
  objetivoDelPaso,
  puntosDelPaso,
  type Gesto,
  type PasoQuirurgico,
} from '@/lib/simulador'
import { NOMBRE_DEL_DESENLACE } from '@/lib/progresoDelSimulador'

/**
 * La broca y la fijación con placa puntúan (D-169): dos objetivos nuevos del paso,
 * que se miden con lo que el lienzo anota al perforar y al atornillar.
 */

const BROCA = 'broca-3-2'

const perforar = (extra: Partial<Gesto['perforacion'] & object> = {}): Gesto => ({
  instrumento: BROCA,
  perforacion: { diametroMm: 3.2, anguloConElEje: 90, bicortical: true, sePasoMm: 1, ...extra },
})

describe('un paso que evalúa la perforación', () => {
  const paso: PasoQuirurgico = {
    objetivo: 'perforacion',
    instrumento: BROCA,
    calibreBroca: 3.2,
    anguloMinimo: 80,
    anguloMaximo: 100,
    exigeBicortical: true,
    puntos: 10,
  }

  it('sin perforación hecha, pide hacerla', () => {
    const e = evaluarGesto(paso, { instrumento: BROCA })
    expect(e.resultado).toBe(RESULTADOS.SIN_PERFORACION)
    expect(e.avanza).toBe(false)
  })

  it('perpendicular, del calibre y bicortical, sin pasarse: sale bien', () => {
    const e = evaluarGesto(paso, perforar())
    expect(e.resultado).toBe(RESULTADOS.CORRECTO)
    expect(e.avanza).toBe(true)
    expect(e.puntos).toBe(10)
  })

  it('una broca de otro calibre se rechaza y dice cuál se pide', () => {
    const e = evaluarGesto(paso, perforar({ diametroMm: 2.5 }))
    expect(e.resultado).toBe(RESULTADOS.PERFORACION_CALIBRE)
    expect(e.mensaje).toContain('Ø 3.2 mm')
  })

  it('el calibre se compara a la décima', () => {
    expect(evaluarGesto(paso, perforar({ diametroMm: 3.22 })).resultado).toBe(RESULTADOS.CORRECTO)
  })

  it('torcida fuera del rango es un fallo, no una complicación', () => {
    const e = evaluarGesto(paso, perforar({ anguloConElEje: 65 }))
    expect(e.resultado).toBe(RESULTADOS.PERFORACION_TORCIDA)
    expect(e.complicacion).toBe(false)
    expect(e.mensaje).toContain('65°')
    expect(e.mensaje).toContain('80–100°')
  })

  it('el ángulo de 80 y el de 100 están dentro', () => {
    expect(evaluarGesto(paso, perforar({ anguloConElEje: 80 })).avanza).toBe(true)
    expect(evaluarGesto(paso, perforar({ anguloConElEje: 100 })).avanza).toBe(true)
  })

  it('si se pide bicortical y no llegó a la cortical opuesta, no avanza', () => {
    const e = evaluarGesto(paso, perforar({ bicortical: false }))
    expect(e.resultado).toBe(RESULTADOS.PERFORACION_UNICORTICAL)
    // Sin esa exigencia, una perforación unicortical vale.
    expect(evaluarGesto({ ...paso, exigeBicortical: false }, perforar({ bicortical: false })).avanza).toBe(true)
  })

  it('pasarse de la cortical opuesta es una complicación, y no avanza', () => {
    const e = evaluarGesto(paso, perforar({ sePasoMm: PASARSE_DE_LA_CORTICAL_MM + 1 }))
    expect(e.resultado).toBe(RESULTADOS.PERFORACION_PASADA)
    expect(e.complicacion).toBe(true)
    expect(e.avanza).toBe(false)
    // Hasta el tope se tolera.
    expect(evaluarGesto(paso, perforar({ sePasoMm: PASARSE_DE_LA_CORTICAL_MM })).avanza).toBe(true)
  })

  it('la complicación cuesta el paso entero y el fallo, la mitad (puntosDelPaso)', () => {
    expect(puntosDelPaso(paso, { fallo: false, complicacion: false })).toBe(10)
    expect(puntosDelPaso(paso, { fallo: true, complicacion: false })).toBe(5)
    expect(puntosDelPaso(paso, { fallo: true, complicacion: true })).toBe(0)
  })

  it('sin calibre ni ángulos declarados, evalúa solo lo que haya', () => {
    const abierto: PasoQuirurgico = { objetivo: 'perforacion', instrumento: BROCA }
    expect(evaluarGesto(abierto, perforar({ diametroMm: 1.5, anguloConElEje: 30, bicortical: false })).avanza).toBe(true)
    expect(evaluarGesto(abierto, perforar({ sePasoMm: 10 })).complicacion).toBe(true)
  })

  it('con un solo extremo de ángulo declarado, el otro queda abierto', () => {
    const soloMinimo: PasoQuirurgico = { objetivo: 'perforacion', instrumento: BROCA, anguloMinimo: 85 }
    expect(evaluarGesto(soloMinimo, perforar({ anguloConElEje: 120 })).avanza).toBe(true)
    expect(evaluarGesto(soloMinimo, perforar({ anguloConElEje: 70 })).resultado).toBe(RESULTADOS.PERFORACION_TORCIDA)
  })

  it('exige el instrumento igual que los demás objetivos', () => {
    expect(evaluarGesto(paso, { instrumento: null }).resultado).toBe(RESULTADOS.SIN_INSTRUMENTO)
    expect(evaluarGesto(paso, { ...perforar(), instrumento: 'broca-4-5' }).resultado).toBe(RESULTADOS.INSTRUMENTO_INCORRECTO)
  })
})

describe('un paso que evalúa la fijación', () => {
  const paso: PasoQuirurgico = {
    objetivo: 'fijacion',
    instrumento: 'tornillo-cortical-3-5',
    tornillosMinimos: 2,
    exigeBicortical: true,
  }
  const gesto = (fijacion: NonNullable<Gesto['fijacion']>): Gesto => ({ instrumento: 'tornillo-cortical-3-5', fijacion })

  it('sin placa, pide colocarla', () => {
    const e = evaluarGesto(paso, gesto({ placa: false, tornillos: 0, bicorticales: 0, largos: 0 }))
    expect(e.resultado).toBe(RESULTADOS.SIN_PLACA)
  })

  it('con menos tornillos de los que hacen falta, no avanza y dice cuántos', () => {
    const e = evaluarGesto(paso, gesto({ placa: true, tornillos: 1, bicorticales: 1, largos: 0 }))
    expect(e.resultado).toBe(RESULTADOS.TORNILLOS_INSUFICIENTES)
    expect(e.mensaje).toContain('1 de 2')
  })

  it('con todos los tornillos bicorticales y sin pasarse, sale bien', () => {
    const e = evaluarGesto(paso, gesto({ placa: true, tornillos: 3, bicorticales: 3, largos: 0 }))
    expect(e.resultado).toBe(RESULTADOS.CORRECTO)
  })

  it('un tornillo unicortical no vale cuando se pide bicortical', () => {
    const e = evaluarGesto(paso, gesto({ placa: true, tornillos: 2, bicorticales: 1, largos: 0 }))
    expect(e.resultado).toBe(RESULTADOS.TORNILLO_UNICORTICAL)
    expect(evaluarGesto({ ...paso, exigeBicortical: false }, gesto({ placa: true, tornillos: 2, bicorticales: 1, largos: 0 })).avanza).toBe(true)
  })

  it('un tornillo largo es una complicación', () => {
    const e = evaluarGesto(paso, gesto({ placa: true, tornillos: 2, bicorticales: 2, largos: 1 }))
    expect(e.resultado).toBe(RESULTADOS.TORNILLO_LARGO)
    expect(e.complicacion).toBe(true)
  })

  it('sin número de tornillos declarado, con uno basta', () => {
    const sin: PasoQuirurgico = { objetivo: 'fijacion', instrumento: 'tornillo-cortical-3-5' }
    expect(evaluarGesto(sin, gesto({ placa: true, tornillos: 1, bicorticales: 0, largos: 0 })).avanza).toBe(true)
  })
})

describe('el objetivo y la instrucción', () => {
  it('un paso con objetivo perforación o fijación es de ese objetivo', () => {
    expect(objetivoDelPaso({ objetivo: 'perforacion' })).toBe('perforacion')
    expect(objetivoDelPaso({ objetivo: 'fijacion' })).toBe('fijacion')
  })

  it('un paso sin objetivo que declara ángulos o tornillos se deduce de ellos', () => {
    expect(objetivoDelPaso({ anguloMinimo: 80 })).toBe('perforacion')
    expect(objetivoDelPaso({ tornillosMinimos: 3 })).toBe('fijacion')
  })

  it('un paso marcado «instrumento» con esos números escritos se mide por ellos, no se aprueba solo', () => {
    // Lo mismo que el rango de fuerza: un número escrito y no evaluado es una regla que el residente
    // cree estar cumpliendo.
    expect(objetivoDelPaso({ objetivo: 'instrumento', anguloMaximo: 100 })).toBe('perforacion')
    expect(objetivoDelPaso({ objetivo: 'instrumento', tornillosMinimos: 2 })).toBe('fijacion')
  })

  it('la instrucción dice qué hacer y contra qué se mide', () => {
    const p = instruccionDelPaso({ objetivo: 'perforacion', calibreBroca: 3.2, anguloMinimo: 80, anguloMaximo: 100, exigeBicortical: true })
    expect(p).toContain('modo Perforar')
    expect(p).toContain('Ø 3.2 mm')
    expect(p).toContain('entre 80° y 100°')
    expect(p).toContain('dos corticales')
    const f = instruccionDelPaso({ objetivo: 'fijacion', tornillosMinimos: 3 })
    expect(f).toContain('modo Fijar')
    expect(f).toContain('3 tornillos')
  })

  it('cada desenlace nuevo tiene nombre en el panel', () => {
    for (const r of Object.values(RESULTADOS)) expect(NOMBRE_DEL_DESENLACE[r], r).toBeTruthy()
  })
})

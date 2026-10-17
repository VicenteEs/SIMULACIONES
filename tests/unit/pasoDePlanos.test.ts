import { describe, expect, it } from 'vitest'
import {
  evaluarGesto,
  instruccionDelPaso,
  objetivoDelPaso,
  RESULTADOS,
  RETRACCION_MINIMA_MM,
  type PasoQuirurgico,
} from '@/lib/simulador'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'
import { NOMBRE_DEL_DESENLACE } from '@/lib/progresoDelSimulador'

const separar: PasoQuirurgico = {
  objetivo: 'planos',
  instrumento: 'farabeuf',
  musculoDelPlano: 'Tibial_anterior',
  accionDelPlano: 'separar',
  puntos: 10,
}
const cortar: PasoQuirurgico = { ...separar, instrumento: 'metz', accionDelPlano: 'cortar' }

describe('el paso de planos (P-003 E10, respuesta E10-Q2)', () => {
  it('es un objetivo propio: no se deduce a otra cosa', () => {
    expect(objetivoDelPaso(separar)).toBe('planos')
  })

  it('sin instrumento no hay gesto, como en todos los objetivos', () => {
    const e = evaluarGesto(separar, { instrumento: null })
    expect(e.resultado).toBe(RESULTADOS.SIN_INSTRUMENTO)
  })

  it('sin elegir el músculo del paso, o eligiendo otro, o con otra acción, no avanza', () => {
    const sin = evaluarGesto(separar, { instrumento: 'farabeuf' })
    expect(sin.resultado).toBe(RESULTADOS.SIN_MUSCULO_ELEGIDO)
    expect(sin.avanza).toBe(false)
    const otro = evaluarGesto(separar, {
      instrumento: 'farabeuf',
      plano: { nodo: 'Peroneo', accion: 'separar', cortado: false, retraidoMm: 20 },
    })
    expect(otro.resultado).toBe(RESULTADOS.SIN_MUSCULO_ELEGIDO)
    const acciónAjena = evaluarGesto(separar, {
      instrumento: 'farabeuf',
      plano: { nodo: 'Tibial_anterior', accion: 'cortar', cortado: true, retraidoMm: 0 },
    })
    expect(acciónAjena.resultado).toBe(RESULTADOS.SIN_MUSCULO_ELEGIDO)
  })

  it('separar exige retraer al menos lo mínimo', () => {
    const poco = evaluarGesto(separar, {
      instrumento: 'farabeuf',
      plano: { nodo: 'Tibial_anterior', accion: 'separar', cortado: false, retraidoMm: RETRACCION_MINIMA_MM - 1 },
    })
    expect(poco.resultado).toBe(RESULTADOS.PLANO_SIN_HACER)
    expect(poco.avanza).toBe(false)
    const bien = evaluarGesto(separar, {
      instrumento: 'farabeuf',
      plano: { nodo: 'Tibial_anterior', accion: 'separar', cortado: false, retraidoMm: RETRACCION_MINIMA_MM },
    })
    expect(bien.resultado).toBe(RESULTADOS.CORRECTO)
    expect(bien.avanza).toBe(true)
  })

  it('cortar exige haber cortado', () => {
    const sin = evaluarGesto(cortar, {
      instrumento: 'metz',
      plano: { nodo: 'Tibial_anterior', accion: 'cortar', cortado: false, retraidoMm: 0 },
    })
    expect(sin.resultado).toBe(RESULTADOS.PLANO_SIN_HACER)
    const hecho = evaluarGesto(cortar, {
      instrumento: 'metz',
      plano: { nodo: 'Tibial_anterior', accion: 'cortar', cortado: true, retraidoMm: 0 },
    })
    expect(hecho.resultado).toBe(RESULTADOS.CORRECTO)
  })

  it('la instrucción dice qué hacer con el músculo y cuánto retraer', () => {
    expect(instruccionDelPaso(separar)).toContain('Separar')
    expect(instruccionDelPaso(separar)).toContain(`${RETRACCION_MINIMA_MM} mm`)
    expect(instruccionDelPaso(cortar)).toContain('Cortar')
  })

  it('los desenlaces nuevos tienen su nombre en el panel', () => {
    expect(NOMBRE_DEL_DESENLACE[RESULTADOS.SIN_MUSCULO_ELEGIDO]).toBeTruthy()
    expect(NOMBRE_DEL_DESENLACE[RESULTADOS.PLANO_SIN_HACER]).toBeTruthy()
  })

  it('el caso lleva el músculo y la acción del paso hasta la consola', () => {
    const caso = casoParaLaConsola({
      titulo: 'Abordaje',
      pasos: [{ id: 'a', titulo: 'Separar el tibial', objetivo: 'planos', musculoDelPlano: ' Tibial_anterior ', accionDelPlano: 'separar' }],
    })
    expect(caso.pasos[0]).toMatchObject({ objetivo: 'planos', musculoDelPlano: 'Tibial_anterior', accionDelPlano: 'separar' })
  })
})

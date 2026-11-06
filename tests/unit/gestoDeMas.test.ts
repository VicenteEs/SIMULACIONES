import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  conIncision,
  conTrayectoria,
  gestoQueMide,
  MISMA_DIRECCION_GRADOS,
  MISMA_ENTRADA_MM,
  mismaTrayectoria,
  pasoEnCurso,
  type TrayectoriaDeLaBroca,
} from '@/lib/gestoDeMas'
import { juicioDelGestoDeMas, puntosDelPaso, RESULTADOS, type PasoQuirurgico } from '@/lib/simulador'
import { conGestoDeMas, conIntento, notaDelRecorrido, RECORRIDO_VACIO, recorridoValido } from '@/lib/notaDelRecorrido'
import { esDesenlaceConDano, NOMBRE_DEL_DESENLACE } from '@/lib/progresoDelSimulador'

/**
 * El gesto de más en evaluación (D-330): una segunda incisión aparte en el paso que mide la incisión, o una segunda
 * trayectoria en el que mide la perforación, deja el paso en cero. Lo que se prueba es qué cuenta como «otro» —alargar la
 * incisión o repasar el agujero con otra broca no— y que la nota del servidor lo cobre igual que la consola.
 */

const leer = (...ruta: string[]) => readFileSync(join(process.cwd(), ...ruta), 'utf8')

const perpendicular: TrayectoriaDeLaBroca = { entradaMm: [10, 200, 30], direccion: [1, 0, 0] }
const girada = (grados: number): TrayectoriaDeLaBroca => {
  const r = (grados * Math.PI) / 180
  return { entradaMm: perpendicular.entradaMm, direccion: [Math.cos(r), Math.sin(r), 0] }
}

describe('qué es otro gesto', () => {
  it('cada objetivo mide el suyo: el trazo, la incisión; la perforación, la trayectoria', () => {
    expect(gestoQueMide('trazo')).toBe('incision')
    expect(gestoQueMide('perforacion')).toBe('trayectoria')
    // En la fijación se perfora un agujero por tornillo, y en los demás no se mide ni lo uno ni lo otro.
    for (const objetivo of ['fijacion', 'reduccion', 'fuerza', 'planos', 'instrumento'] as const) expect(gestoQueMide(objetivo)).toBeNull()
  })

  it('la misma trayectoria: la misma entrada con otra broca, o con el pulso de quien vuelve a entrar', () => {
    expect(mismaTrayectoria(perpendicular, perpendicular)).toBe(true)
    // Por el otro lado del mismo agujero sigue siendo el mismo.
    expect(mismaTrayectoria(perpendicular, { ...perpendicular, direccion: [-1, 0, 0] })).toBe(true)
    const corrida = (mm: number): TrayectoriaDeLaBroca => ({ ...perpendicular, entradaMm: [10, 200 + mm, 30] })
    expect(mismaTrayectoria(perpendicular, corrida(MISMA_ENTRADA_MM - 0.5))).toBe(true)
    expect(mismaTrayectoria(perpendicular, corrida(MISMA_ENTRADA_MM + 0.5))).toBe(false)
    expect(mismaTrayectoria(perpendicular, girada(MISMA_DIRECCION_GRADOS - 2))).toBe(true)
    expect(mismaTrayectoria(perpendicular, girada(MISMA_DIRECCION_GRADOS + 2))).toBe(false)
  })

  it('las incisiones se cuentan por capa: la segunda aparte en la misma es de más; la fascia de debajo, no', () => {
    let hecho = pasoEnCurso('p1')
    let r = conIncision(hecho, { id: 1, capa: 'piel' })
    expect(r.deMas).toBe(false)
    hecho = r.hecho
    // La misma otra vez —el lienzo no la manda, pero si llegase— no es otra.
    expect(conIncision(hecho, { id: 1, capa: 'piel' })).toEqual({ hecho, deMas: false })
    r = conIncision(hecho, { id: 2, capa: 'fascia' })
    expect(r.deMas).toBe(false)
    hecho = r.hecho
    expect(conIncision(hecho, { id: 3, capa: 'piel' }).deMas).toBe(true)
  })

  it('las trayectorias: la de deslizamiento y la de núcleo son una; otro agujero al lado es de más', () => {
    let r = conTrayectoria(pasoEnCurso('p1'), perpendicular)
    expect(r.deMas).toBe(false)
    r = conTrayectoria(r.hecho, { ...perpendicular, entradaMm: [10.4, 200.3, 30] })
    expect(r.deMas).toBe(false)
    expect(r.hecho.trayectorias).toHaveLength(1)
    expect(conTrayectoria(r.hecho, { ...perpendicular, entradaMm: [10, 212, 30] }).deMas).toBe(true)
  })
})

describe('lo que cuesta', () => {
  it('es una complicación con nombre, y el paso vale cero', () => {
    for (const [que, resultado] of [
      ['incision', RESULTADOS.INCISION_DE_MAS],
      ['trayectoria', RESULTADOS.TRAYECTORIA_DE_MAS],
    ] as const) {
      const juicio = juicioDelGestoDeMas(que)
      expect(juicio).toMatchObject({ resultado, complicacion: true, avanza: false, puntos: 0 })
      expect(esDesenlaceConDano(resultado)).toBe(true)
      expect(NOMBRE_DEL_DESENLACE[resultado]).toMatch(/de más$/)
    }
    expect(juicioDelGestoDeMas('incision').mensaje).toContain('la primera queda en el paciente')
    expect(puntosDelPaso({ objetivo: 'trazo', puntos: 10 }, { fallo: false, complicacion: true })).toBe(0)
  })

  const PASOS: (PasoQuirurgico & { id: string })[] = [
    { id: 'p1', objetivo: 'trazo', instrumento: 'bisturi', puntos: 10, trazoMinimo: 50, trazoMaximo: 100 },
    { id: 'p2', objetivo: 'instrumento', instrumento: 'separador', puntos: 10 },
  ]
  const acertado = conIntento(
    conIntento(RECORRIDO_VACIO, PASOS[0], { instrumento: 'bisturi', trazo: 80 }),
    PASOS[1],
    { instrumento: 'separador' },
  )

  it('el servidor lo cobra igual que la consola: el paso no suma, los demás sí', () => {
    expect(notaDelRecorrido(PASOS, acertado).puntaje).toBe(20)
    expect(notaDelRecorrido(PASOS, conGestoDeMas(acertado, 'p1', 'incision')).puntaje).toBe(10)
    // Se guarda el primero del paso: el segundo no cambia la nota.
    const dos = conGestoDeMas(conGestoDeMas(RECORRIDO_VACIO, 'p1', 'incision'), 'p1', 'trayectoria')
    expect(dos.pasos[0].deMas).toBe('incision')
  })

  it('lo que llega por HTTP se rehace, y uno roto se rechaza entero', () => {
    const conElGesto = { ...conGestoDeMas(acertado, 'p1', 'trayectoria'), modo: 'evaluacion' as const }
    expect(recorridoValido(JSON.parse(JSON.stringify(conElGesto)))).toEqual(conElGesto)
    for (const roto of ['otra', 1, true, {}]) {
      expect(() => recorridoValido({ v: 1, pasos: [{ paso: 'p1', intentos: [], deMas: roto }] }), String(roto)).toThrow(
        /gesto de más del paso 1/,
      )
    }
    // Uno de antes, sin la marca, sigue entrando igual.
    expect(recorridoValido({ v: 1, pasos: [{ paso: 'p1', intentos: [] }] }).pasos[0]).not.toHaveProperty('deMas')
  })
})

describe('el lienzo lo dice y la consola lo cobra, solo en evaluación', () => {
  const lienzo = leer('src', 'components', 'simulador', 'LienzoQuirurgico.tsx')
  const consola = leer('src', 'components', 'simulador', 'ConsolaQuirurgica.tsx')

  it('el lienzo avisa de la incisión nueva solo con un trazo de verdad, y no de la que alarga otra', () => {
    const corte = lienzo.slice(lienzo.indexOf('const aplicarElCorte = '), lienzo.indexOf('const terminarPerforacion = '))
    const guarda = corte.indexOf('if (!desdeLaSesion && !esRehacer && !deDiseccion) {')
    const aviso = corte.indexOf('if (!previo) ultimas.current.alIncidir?.({ id, capa: plano })')
    expect(guarda).toBeGreaterThan(0)
    expect(aviso).toBeGreaterThan(guarda)
    expect(lienzo.match(/alIncidir\?\.\(/g)).toHaveLength(1)
  })

  it('las dos perforaciones dicen dónde entró la broca', () => {
    expect(lienzo.match(/\.\.\.trayectoriaDeLaBroca\(p, unidadesPorMm\),/g)).toHaveLength(2)
  })

  it('la consola lo cuenta solo en evaluación, fuera del editor y del repaso, y en el paso que mide ese gesto', () => {
    const vigilar = consola.slice(consola.indexOf('function vigilarElGestoDeMas('), consola.indexOf('function vigilarLaLesion('))
    expect(vigilar).toContain("const enEvaluacion = modoDeJuego === 'evaluacion'")
    expect(vigilar).toContain('if (!paso || !enEvaluacion || editor || repaso || resueltos.has(paso.id)) return')
    expect(vigilar).toContain('if (gestoQueMide(objetivoDelPaso(paso)) !== que) return')
    expect(vigilar).toContain('conGestoDeMas(recorridoDeLaNota.current, paso.id, que)')
    expect(vigilar).toContain('setComplicados(')
    expect(consola).toContain("alIncidir={(incision) => vigilarElGestoDeMas('incision', (hecho) => conIncision(hecho, incision))}")
    expect(consola).toContain("vigilarElGestoDeMas('trayectoria', (hecho) => conTrayectoria(hecho, trayectoria))")
  })
})

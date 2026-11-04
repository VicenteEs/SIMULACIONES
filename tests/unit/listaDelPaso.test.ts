import { describe, expect, it } from 'vitest'
import { evaluarGesto, type Gesto, type PasoQuirurgico } from '@/lib/simulador'
import { instruccionBreve, listaDelPaso, MEDIDAS_DEL_OBJETIVO } from '@/lib/listaDelPaso'

/**
 * La lista viva del paso (P-009, mejora de uso 3). Lo que importa es que no mienta: si todos sus puntos están hechos,
 * «Aplicar paso» avanza, y si uno se pasó, aplicar es una complicación. Por eso se cruza con `evaluarGesto`.
 */
const practica = { revelarElInstrumento: true, nombreDelInstrumento: 'Bisturí n.º 10' }
const evaluacion = { revelarElInstrumento: false, nombreDelInstrumento: 'Bisturí n.º 10' }

const estados = (paso: PasoQuirurgico, gesto: Gesto, opciones = practica) =>
  Object.fromEntries(listaDelPaso(paso, gesto, opciones).map((p) => [p.clave, p.estado]))
const todoHecho = (paso: PasoQuirurgico, gesto: Gesto, opciones = practica) =>
  listaDelPaso(paso, gesto, opciones).every((p) => p.estado === 'hecho')

describe('la lista del paso', () => {
  const trazo: PasoQuirurgico = { objetivo: 'trazo', instrumento: 'bisturi', trazoMinimo: 80, trazoMaximo: 120 }

  it('en práctica nombra el instrumento; en evaluación no dice cuál es', () => {
    const [enPractica] = listaDelPaso(trazo, { instrumento: 'otro' }, practica)
    expect(enPractica).toMatchObject({ texto: 'En la mano: Bisturí n.º 10', estado: 'falta' })
    const [enEvaluacion] = listaDelPaso(trazo, { instrumento: 'otro' }, evaluacion)
    expect(enEvaluacion).toMatchObject({ texto: 'Un instrumento en la mano', estado: 'hecho' })
    expect(enEvaluacion.texto).not.toContain('Bisturí')
  })

  it('la incisión: corta falta, en el rango está hecha y larga se pasó, con la cifra de ahora', () => {
    expect(estados(trazo, { instrumento: 'bisturi', trazo: 0 }).trazo).toBe('falta')
    expect(estados(trazo, { instrumento: 'bisturi', trazo: 60 }).trazo).toBe('falta')
    expect(estados(trazo, { instrumento: 'bisturi', trazo: 100 }).trazo).toBe('hecho')
    expect(estados(trazo, { instrumento: 'bisturi', trazo: 140 }).trazo).toBe('pasado')
    const punto = listaDelPaso(trazo, { instrumento: 'bisturi', trazo: 101.24 }, practica).find((p) => p.clave === 'trazo')
    expect(punto).toMatchObject({ texto: 'Incisión de 80–120 mm', ahora: '101,2 mm' })
    // Pasarse es justo lo que `evaluarGesto` marca como complicación.
    expect(evaluarGesto(trazo, { instrumento: 'bisturi', trazo: 140 }).complicacion).toBe(true)
  })

  it('la reducción: los tres topes, cada uno con lo que mide ahora', () => {
    const paso: PasoQuirurgico = { objetivo: 'reduccion', toleranciaDesplazamiento: 2, toleranciaAngulacion: 5, toleranciaDiastasis: 2 }
    const lista = listaDelPaso(paso, { instrumento: 'pinza', desplazamiento: 1.5, angulacion: 9.8, diastasis: 0.4 }, practica)
    expect(lista.map((p) => [p.clave, p.estado, p.ahora])).toEqual([
      ['instrumento', 'hecho', undefined],
      ['desplazamiento', 'hecho', '1,5 mm'],
      ['angulacion', 'falta', '9,8°'],
      ['diastasis', 'hecho', '0,4 mm'],
    ])
  })

  it('con toda la lista hecha el gesto avanza, en cada objetivo', () => {
    const casos: [PasoQuirurgico, Gesto][] = [
      [trazo, { instrumento: 'bisturi', trazo: 95 }],
      [{ objetivo: 'reduccion' }, { instrumento: 'x', desplazamiento: 1, angulacion: 2, diastasis: 0 }],
      [{ objetivo: 'fuerza', fuerzaMinima: 200, fuerzaMaxima: 400 }, { instrumento: 'x', fuerza: 300 }],
      [
        { objetivo: 'perforacion', calibreBroca: 3.2, anguloMinimo: 80, anguloMaximo: 100, exigeBicortical: true },
        { instrumento: 'x', perforacion: { diametroMm: 3.2, anguloConElEje: 88, bicortical: true, sePasoMm: 1 } },
      ],
      [
        { objetivo: 'fijacion', tornillosMinimos: 6, exigeBicortical: true, exigeCompresion: true },
        { instrumento: 'x', fijacion: { placa: true, tornillos: 6, bicorticales: 6, largos: 0, compresionMm: 0.8 } },
      ],
      [
        { objetivo: 'planos', musculoDelPlano: 'tibial_anterior', accionDelPlano: 'separar' },
        { instrumento: 'x', plano: { nodo: 'tibial_anterior', accion: 'separar', cortado: false, retraidoMm: 7 } },
      ],
      [{ objetivo: 'instrumento', instrumento: 'punzon' }, { instrumento: 'punzon' }],
    ]
    for (const [paso, gesto] of casos) {
      expect(todoHecho(paso, gesto), JSON.stringify(paso)).toBe(true)
      expect(evaluarGesto(paso, gesto).avanza, JSON.stringify(paso)).toBe(true)
    }
  })

  it('y con un punto sin hacer, no avanza', () => {
    const casos: [PasoQuirurgico, Gesto][] = [
      [{ objetivo: 'fijacion', tornillosMinimos: 6 }, { instrumento: 'x', fijacion: { placa: true, tornillos: 4, bicorticales: 4, largos: 0 } }],
      [
        { objetivo: 'perforacion', calibreBroca: 3.2 },
        { instrumento: 'x', perforacion: { diametroMm: 4.5, anguloConElEje: 90, bicortical: true, sePasoMm: 0 } },
      ],
      [{ objetivo: 'planos', musculoDelPlano: 'tibial_anterior', accionDelPlano: 'cortar' }, { instrumento: 'x', plano: { nodo: 'tibial_anterior', accion: 'cortar', cortado: false, retraidoMm: 0 } }],
    ]
    for (const [paso, gesto] of casos) {
      expect(todoHecho(paso, gesto), JSON.stringify(paso)).toBe(false)
      expect(evaluarGesto(paso, gesto).avanza, JSON.stringify(paso)).toBe(false)
    }
  })

  it('pasarse de la cortical y un tornillo largo salen como «pasado», que es complicación', () => {
    const broca: PasoQuirurgico = { objetivo: 'perforacion' }
    const pasada: Gesto = { instrumento: 'x', perforacion: { diametroMm: 3.2, anguloConElEje: 90, bicortical: true, sePasoMm: 6 } }
    expect(estados(broca, pasada).sinPasarse).toBe('pasado')
    expect(evaluarGesto(broca, pasada).complicacion).toBe(true)
    const placa: PasoQuirurgico = { objetivo: 'fijacion', tornillosMinimos: 2 }
    const larga: Gesto = { instrumento: 'x', fijacion: { placa: true, tornillos: 2, bicorticales: 2, largos: 1 } }
    expect(estados(placa, larga).largos).toBe('pasado')
    expect(evaluarGesto(placa, larga).complicacion).toBe(true)
  })

  it('en evaluación, el músculo se marca con cualquiera elegido: con el del paso diría cuál era', () => {
    const paso: PasoQuirurgico = { objetivo: 'planos', musculoDelPlano: 'tibial_anterior', accionDelPlano: 'cortar' }
    const otro: Gesto = { instrumento: 'x', plano: { nodo: 'gastrocnemio', accion: 'cortar', cortado: false, retraidoMm: 0 } }
    expect(estados(paso, otro, practica).musculo).toBe('falta')
    expect(estados(paso, otro, evaluacion).musculo).toBe('hecho')
  })

  it('una línea de instrucción por objetivo, sin cifras; y las medidas que cuentan en cada uno', () => {
    expect(instruccionBreve(trazo)).toBe('Trace la incisión sobre la piel con el instrumento del paso.')
    expect(instruccionBreve({ objetivo: 'planos', accionDelPlano: 'separar' })).toBe('Separe el músculo del paso, sin cortarlo.')
    for (const objetivo of ['trazo', 'reduccion', 'fuerza', 'perforacion', 'fijacion', 'planos', 'instrumento'] as const) {
      expect(instruccionBreve({ objetivo })).not.toMatch(/\d/)
    }
    expect(MEDIDAS_DEL_OBJETIVO.trazo).toEqual(['Incisión'])
    expect(MEDIDAS_DEL_OBJETIVO.fijacion).toContain('Desplazamiento')
    expect(MEDIDAS_DEL_OBJETIVO.perforacion).toEqual([])
  })
})

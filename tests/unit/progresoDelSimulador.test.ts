import { describe, it, expect } from 'vitest'
import {
  MAXIMO_DE_COMPLICACIONES,
  NOMBRE_DEL_DESENLACE,
  esDesenlaceConDano,
  recorridoGuardado,
  resumirRecorridos,
} from '@/lib/progresoDelSimulador'
import { RESULTADOS, evaluarGesto } from '@/lib/simulador'

/**
 * La ida y la vuelta de lo que el simulador guarda.
 *
 * Lo que se prueba aquí es la parte que puede estar mal sin que falle nada: la
 * fila se guarda igual, la pantalla se pinta igual, y lo que enseña es otra
 * cosa. Un recorrido que no se reconoce sale de la portada como si el residente
 * no hubiera jugado; una fila de lectura que se toma por partida llena el panel
 * de casos de cero puntos que nadie recorrió; y un paso que se agrupa mal
 * convierte «dónde se atasca su gente» en una lista de tropiezos sueltos.
 */

const complicacion = (extra: Record<string, unknown> = {}) => ({
  paso: 'p1',
  numero: 2,
  titulo: 'Fresado',
  resultado: RESULTADOS.FUERZA_EXCESIVA,
  detalle: 'Se produce una complicación. (95 N · rango útil 20–60 N)',
  ...extra,
})

const fila = (extra: Record<string, unknown> = {}) => ({
  coleccion: 'cirugias',
  documentoId: '7',
  puntaje: 18,
  puntajeMaximo: 40,
  complicaciones: [complicacion()],
  ...extra,
})

describe('reconocer un recorrido guardado', () => {
  it('devuelve el puntaje, su máximo y las complicaciones de la fila', () => {
    const recorrido = recorridoGuardado(fila())
    expect(recorrido?.puntaje).toBe(18)
    expect(recorrido?.puntajeMaximo).toBe(40)
    expect(recorrido?.complicaciones).toHaveLength(1)
    expect(recorrido?.complicaciones[0].detalle).toContain('95 N')
  })

  it('una ficha de lectura no es una partida', () => {
    // Las cinco colecciones escriben en la misma tabla. Si la fila de una
    // patología leída se leyera como un recorrido de cero puntos, la portada le
    // ofrecería al residente «volver al caso» de una ficha de texto y el panel
    // contaría partidas que nadie jugó.
    expect(recorridoGuardado({ coleccion: 'patologias', documentoId: '3', completado: true })).toBeNull()
  })

  it('una cirugía abierta y no jugada tampoco', () => {
    // El nulo de la columna es el «todavía no»: por eso no lleva
    // `defaultValue: 0` (`src/collections/Actividad.ts`).
    expect(recorridoGuardado(fila({ puntaje: null, puntajeMaximo: null, complicaciones: [] }))).toBeNull()
  })

  it('cero puntos con una complicación sí es un recorrido', () => {
    // Es el caso que más importa enseñar: se entró, se dañó y no se puntuó.
    const recorrido = recorridoGuardado(fila({ puntaje: 0 }))
    expect(recorrido?.puntaje).toBe(0)
    expect(recorrido?.complicaciones).toHaveLength(1)
  })

  it('sin el máximo de entonces no inventa un denominador', () => {
    // «12 de 0» es un marcador imposible. Quien pinta decide, y para eso tiene
    // que poder distinguirlo del cero.
    expect(recorridoGuardado(fila({ puntajeMaximo: null }))?.puntajeMaximo).toBeNull()
    expect(recorridoGuardado(fila({ puntajeMaximo: 0 }))?.puntajeMaximo).toBe(0)
  })

  it('descarta la complicación que no nombra su paso', () => {
    // Sin paso, la lista es un montón de frases sueltas y el registro existe
    // para poder volver al gesto que dañó.
    const recorrido = recorridoGuardado(
      fila({ complicaciones: [complicacion(), { detalle: 'algo pasó' }] }),
    )
    expect(recorrido?.complicaciones).toHaveLength(1)
  })

  it('conserva la complicación cuyo desenlace no reconoce, pero sin etiquetarla', () => {
    // Perder la fila entera por una etiqueta que ya no existe borraría del
    // historial del residente una corrección que sí recibió. El detalle sigue
    // diciendo qué pasó.
    const recorrido = recorridoGuardado(
      fila({ complicaciones: [complicacion({ resultado: 'hemorragia-masiva' })] }),
    )
    expect(recorrido?.complicaciones).toHaveLength(1)
    expect(recorrido?.complicaciones[0].resultado).toBeNull()
    expect(recorrido?.complicaciones[0].detalle).toContain('95 N')
  })

  it('recorta la lista al tope de la columna', () => {
    const muchas = Array.from({ length: MAXIMO_DE_COMPLICACIONES + 30 }, () => complicacion())
    expect(recorridoGuardado(fila({ complicaciones: muchas }))?.complicaciones).toHaveLength(
      MAXIMO_DE_COMPLICACIONES,
    )
  })

  it('no se cae con lo que no es una fila', () => {
    for (const basura of [null, undefined, 7, 'fila', [], { complicaciones: 'no' }]) {
      expect(recorridoGuardado(basura)).toBeNull()
    }
  })
})

describe('los desenlaces que cuentan como daño', () => {
  it('son todos los del motor menos el que sale bien', () => {
    for (const resultado of Object.values(RESULTADOS)) {
      expect(esDesenlaceConDano(resultado), resultado).toBe(resultado !== RESULTADOS.CORRECTO)
    }
  })

  it('nada inventado pasa por uno', () => {
    for (const basura of ['hemorragia', '', null, undefined, 7, {}]) {
      expect(esDesenlaceConDano(basura)).toBe(false)
    }
  })

  it('lo que el motor marca como complicación se reconoce sin traducir', () => {
    // El eslabón que recorre los dos lados: se evalúa un gesto que daña y el
    // valor que sale del motor entra tal cual en la fila.
    const trazoLargo = evaluarGesto(
      { objetivo: 'trazo', trazoMinimo: 8, trazoMaximo: 15 },
      { instrumento: 'bisturi', trazo: 40 },
    )
    expect(trazoLargo.complicacion).toBe(true)
    expect(esDesenlaceConDano(trazoLargo.resultado)).toBe(true)
  })

  it('todos tienen nombre en castellano para las tablas del panel', () => {
    // El tipo obliga a que estén los nueve; esto vigila que ninguno se haya
    // quedado con el identificador de la constante como «nombre».
    for (const resultado of Object.values(RESULTADOS)) {
      const nombre = NOMBRE_DEL_DESENLACE[resultado]
      expect(nombre, resultado).toBeTruthy()
      expect(nombre, resultado).not.toContain('-')
    }
  })
})

describe('resumir los recorridos de mucha gente', () => {
  it('cuenta casos jugados, casos con daño y gestos que dañaron', () => {
    const resumen = resumirRecorridos([
      fila(),
      fila({ documentoId: '8', complicaciones: [] }),
      fila({ documentoId: '9', complicaciones: [complicacion(), complicacion({ paso: 'p2' })] }),
      // Una lectura de la biblioteca, que no cuenta como nada.
      { coleccion: 'patologias', documentoId: '3', completado: true },
    ])
    expect(resumen.casos).toBe(3)
    expect(resumen.casosConComplicacion).toBe(2)
    expect(resumen.complicaciones).toBe(3)
  })

  it('agrupa por caso y paso, y separa veces de residentes', () => {
    // Un paso donde una persona insistió tres veces es un tropiezo suyo; uno
    // donde tropezaron tres personas es el guion. Contar solo gestos los
    // confunde, y es la diferencia entre reescribir un paso y no tocarlo.
    const resumen = resumirRecorridos([
      fila({ complicaciones: [complicacion(), complicacion(), complicacion()] }),
      fila({ complicaciones: [complicacion()] }),
    ])
    expect(resumen.atascos).toHaveLength(1)
    expect(resumen.atascos[0].veces).toBe(4)
    expect(resumen.atascos[0].residentes).toBe(2)
    expect(resumen.atascos[0].documentoId).toBe('7')
    expect(resumen.atascos[0].paso).toBe('p1')
  })

  it('el mismo identificador de paso en dos casos distintos no se mezcla', () => {
    // Los pasos viven dentro del documento del caso, así que `paso-0` es el
    // primero de todos los casos: agrupar solo por él juntaría las
    // complicaciones de dos cirugías que no tienen nada que ver.
    const resumen = resumirRecorridos([
      fila({ documentoId: '7', complicaciones: [complicacion({ paso: 'paso-0' })] }),
      fila({ documentoId: '8', complicaciones: [complicacion({ paso: 'paso-0' })] }),
    ])
    expect(resumen.atascos).toHaveLength(2)
  })

  it('ordena por gestos y desempata por cuánta gente', () => {
    const resumen = resumirRecorridos([
      fila({ complicaciones: [complicacion({ paso: 'flojo' })] }),
      fila({ complicaciones: [complicacion({ paso: 'duro' }), complicacion({ paso: 'duro' })] }),
      fila({ complicaciones: [complicacion({ paso: 'duro' })] }),
    ])
    expect(resumen.atascos.map((a) => a.paso)).toEqual(['duro', 'flojo'])
  })

  it('guarda los desenlaces vistos sin repetirlos', () => {
    const resumen = resumirRecorridos([
      fila({
        complicaciones: [
          complicacion(),
          complicacion(),
          complicacion({ resultado: RESULTADOS.TRAZO_LARGO }),
        ],
      }),
    ])
    expect(resumen.atascos[0].desenlaces).toEqual([
      RESULTADOS.FUERZA_EXCESIVA,
      RESULTADOS.TRAZO_LARGO,
    ])
  })

  it('el número y el título del paso sobreviven aunque una fila no los traiga', () => {
    // Son la copia de cómo vio el paso quien lo jugó, y es lo único que lo
    // nombra cuando el traumatólogo reordena el guion.
    const resumen = resumirRecorridos([
      fila({ complicaciones: [complicacion({ numero: null, titulo: null })] }),
      fila({ complicaciones: [complicacion()] }),
    ])
    expect(resumen.atascos[0].numero).toBe(2)
    expect(resumen.atascos[0].titulo).toBe('Fresado')
  })

  it('sin filas no inventa nada', () => {
    expect(resumirRecorridos([])).toEqual({
      casos: 0,
      casosConComplicacion: 0,
      complicaciones: 0,
      atascos: [],
    })
  })
})

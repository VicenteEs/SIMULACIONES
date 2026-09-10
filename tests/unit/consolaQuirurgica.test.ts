import { describe, it, expect } from 'vitest'
import { evaluarGesto, puntajeMaximo, RESULTADOS, type PasoQuirurgico } from '@/lib/simulador'
import { anguloTotal, largoDelTrazo, medirReduccion } from '@/lib/reduccion'
import { casoParaLaConsola, codigoDelCaso } from '@/lib/casoQuirurgico'

/**
 * La consola quirúrgica: lo que se evalúa y lo que se mide.
 *
 * Las dos cosas pueden estar mal sin que nadie lo note. Una evaluación
 * demasiado indulgente enseña a operar mal y no da ningún error; un eje
 * confundido en las medidas da números creíbles y enseña a reducir al revés.
 */

const paso = (extra: Partial<PasoQuirurgico> = {}): PasoQuirurgico => ({
  titulo: 'Paso',
  objetivo: 'instrumento',
  instrumento: 'bisturi',
  puntos: 20,
  ...extra,
})

describe('el instrumento se exige siempre', () => {
  it('sin instrumento no hay gesto, sea cual sea el objetivo', () => {
    // Es lo primero que se aprende en pabellón, y por eso se comprueba antes
    // que nada: no se toca al paciente con la mano vacía.
    for (const objetivo of ['instrumento', 'trazo', 'reduccion', 'fuerza'] as const) {
      const r = evaluarGesto(paso({ objetivo }), { instrumento: null })
      expect(r.resultado, objetivo).toBe(RESULTADOS.SIN_INSTRUMENTO)
      expect(r.avanza).toBe(false)
      expect(r.puntos).toBe(0)
    }
  })

  it('el instrumento equivocado no avanza y no es complicación', () => {
    const r = evaluarGesto(paso(), { instrumento: 'martillo' })
    expect(r.resultado).toBe(RESULTADOS.INSTRUMENTO_INCORRECTO)
    expect(r.complicacion, 'elegir mal y no llegar a usarlo no daña a nadie').toBe(false)
  })

  it('no delata cuál era el correcto', () => {
    // Decir «se esperaba el punzón» convierte el ejercicio en adivinar por
    // descarte: al segundo intento acierta cualquiera sin saber por qué.
    const r = evaluarGesto(paso({ instrumento: 'punzon-de-entrada' }), { instrumento: 'martillo' })
    expect(r.mensaje).not.toContain('punzon')
  })
})

describe('objetivo: trazar la incisión', () => {
  const trazar = paso({ objetivo: 'trazo', trazoMinimo: 25, trazoMaximo: 80 })

  it('sin trazo no se puede aplicar', () => {
    expect(evaluarGesto(trazar, { instrumento: 'bisturi', trazo: 0 }).resultado).toBe(
      RESULTADOS.SIN_TRAZO,
    )
  })

  it('corta se rechaza, larga es complicación', () => {
    // La distinción es la que enseña: una incisión corta obliga a repetir; una
    // larga deja cicatriz y ya no se puede deshacer.
    const corta = evaluarGesto(trazar, { instrumento: 'bisturi', trazo: 12 })
    expect(corta.resultado).toBe(RESULTADOS.TRAZO_CORTO)
    expect(corta.complicacion).toBe(false)

    const larga = evaluarGesto(trazar, { instrumento: 'bisturi', trazo: 140 })
    expect(larga.resultado).toBe(RESULTADOS.TRAZO_LARGO)
    expect(larga.complicacion).toBe(true)
  })

  it('dentro del rango puntúa', () => {
    const r = evaluarGesto(trazar, { instrumento: 'bisturi', trazo: 59 })
    expect(r.resultado).toBe(RESULTADOS.CORRECTO)
    expect(r.puntos).toBe(20)
  })

  it('los extremos del rango cuentan como buenos', () => {
    for (const largo of [25, 80]) {
      expect(evaluarGesto(trazar, { instrumento: 'bisturi', trazo: largo }).avanza, `${largo} mm`).toBe(
        true,
      )
    }
  })
})

describe('objetivo: reducir la fractura', () => {
  const reducir = paso({
    objetivo: 'reduccion',
    toleranciaDesplazamiento: 5,
    toleranciaAngulacion: 5,
  })

  const bien = { instrumento: 'bisturi', desplazamiento: 2, diastasis: 2, angulacion: 3 }

  it('exige las tres medidas a la vez', () => {
    // Las tres se enseñan en pantalla, así que las tres cuentan. Alinear bien y
    // dejar el hueso girado no es una reducción aceptable, y dejar dos
    // centímetros de hueco entre los fragmentos tampoco, por muy recto que
    // quede: consolida distinto o no consolida.
    expect(evaluarGesto(reducir, { ...bien, angulacion: 22 }).avanza, 'angulación').toBe(false)
    expect(evaluarGesto(reducir, { ...bien, desplazamiento: 19 }).avanza, 'desplazamiento').toBe(
      false,
    )
    expect(evaluarGesto(reducir, { ...bien, diastasis: 20 }).avanza, 'diástasis').toBe(false)
    expect(evaluarGesto(reducir, bien).avanza).toBe(true)
  })

  it('la diástasis usa su propia tolerancia cuando el paso la declara', () => {
    const estricto = paso({
      objetivo: 'reduccion',
      toleranciaDesplazamiento: 5,
      toleranciaDiastasis: 2,
      toleranciaAngulacion: 5,
    })
    expect(evaluarGesto(estricto, { ...bien, diastasis: 4 }).avanza).toBe(false)
    expect(evaluarGesto(estricto, { ...bien, diastasis: 1 }).avanza).toBe(true)
  })

  it('sin declararla, la diástasis se mide con la tolerancia del desplazamiento', () => {
    // Un caso escrito antes de que existiera ese campo no debe volverse
    // imposible ni volverse gratis.
    expect(evaluarGesto(reducir, { ...bien, diastasis: 4.9 }).avanza).toBe(true)
    expect(evaluarGesto(reducir, { ...bien, diastasis: 5.1 }).avanza).toBe(false)
  })

  it('sin haber tocado nada no se da por reducida', () => {
    // Si faltara el dato y se tomara como cero, el residente aplicaría el paso
    // sin mover el hueso y la consola lo daría por bueno.
    expect(evaluarGesto(reducir, { instrumento: 'bisturi' }).avanza).toBe(false)
  })
})

describe('objetivo: la fuerza', () => {
  const fresar = paso({ objetivo: 'fuerza', fuerzaMinima: 20, fuerzaMaxima: 60 })

  it('quedarse corto se reintenta; pasarse es complicación', () => {
    expect(evaluarGesto(fresar, { instrumento: 'bisturi', fuerza: 5 }).complicacion).toBe(false)
    expect(evaluarGesto(fresar, { instrumento: 'bisturi', fuerza: 95 }).complicacion).toBe(true)
  })
})

describe('el puntaje del caso', () => {
  it('es la suma de sus pasos', () => {
    expect(puntajeMaximo([paso({ puntos: 20 }), paso({ puntos: 30 }), paso({ puntos: 20 })])).toBe(70)
  })

  it('un paso sin puntos declarados vale diez', () => {
    expect(puntajeMaximo([paso({ puntos: undefined })])).toBe(10)
  })
})

// ---------------------------------------------------------------- geometría

describe('las medidas de la reducción', () => {
  it('separa el hueco del desalineamiento', () => {
    // Irse a lo largo del eje es diástasis: el hueco entre los trozos. Irse de
    // lado es desplazamiento. Confundirlos enseñaría a reducir mirando el
    // número equivocado.
    const m = medirReduccion({ x: 0, y: 18, z: 0 }, { x: 0, y: 0, z: 0 }, 'y')
    expect(m.diastasis).toBe(18)
    expect(m.desplazamiento).toBe(0)
  })

  it('combina los dos ejes laterales con Pitágoras', () => {
    // Irse 3 mm hacia delante y 4 hacia el lado es irse 5, no 7.
    const m = medirReduccion({ x: 3, y: 0, z: 4 }, { x: 0, y: 0, z: 0 }, 'y')
    expect(m.desplazamiento).toBe(5)
  })

  it('dice de qué eje viene el desplazamiento, no solo cuánto', () => {
    // Recorriendo el caso en el navegador me quedé encallado en 8,7 mm: lo que
    // faltaba estaba en profundidad, invisible desde esa vista, y arrastrar de
    // lado no bajaba el número. El desglose es la pista de que hay que girar la
    // cámara.
    const m = medirReduccion({ x: 1.8, y: 0, z: 8.5 }, { x: 0, y: 0, z: 0 }, 'y')
    expect(m.lateral).toEqual([
      { eje: 'x', mm: 1.8 },
      { eje: 'z', mm: 8.5 },
    ])
    // El eje largo no aparece en el desglose: eso es la diástasis.
    expect(m.lateral.some((l) => l.eje === 'y')).toBe(false)
  })

  it('respeta el eje largo que declare el caso', () => {
    const enX = medirReduccion({ x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 'x')
    expect(enX.diastasis).toBe(10)
    expect(enX.desplazamiento).toBe(0)
  })

  it('el ángulo no es la suma de los tres giros', () => {
    // Girar 90° en X y 90° en Y no son 180° de desalineación.
    expect(anguloTotal({ x: 90, y: 90, z: 0 })).toBeLessThan(180)
    expect(anguloTotal({ x: 0, y: 0, z: 9.8 })).toBeCloseTo(9.8, 1)
    expect(anguloTotal({ x: 0, y: 0, z: 0 })).toBe(0)
  })

  it('el giro se mide por el camino más corto', () => {
    // 350° de giro son 10° de desalineación, no 350.
    expect(anguloTotal({ x: 0, y: 0, z: 350 })).toBeCloseTo(10, 1)
  })
})

describe('el largo del trazo', () => {
  it('suma los tramos, no la distancia entre los extremos', () => {
    // Una incisión curva es más larga que la línea recta que la cierra, y es la
    // curva la que hay que suturar.
    const enEle = [
      { x: 0, y: 0, z: 0 },
      { x: 0.03, y: 0, z: 0 },
      { x: 0.03, y: 0.04, z: 0 },
    ]
    expect(largoDelTrazo(enEle, 1000)).toBe(70)
  })

  it('un solo punto no es un trazo', () => {
    expect(largoDelTrazo([{ x: 0, y: 0, z: 0 }], 1000)).toBe(0)
    expect(largoDelTrazo([], 1000)).toBe(0)
  })

  it('respeta la unidad del archivo', () => {
    const dos = [
      { x: 0, y: 0, z: 0 },
      { x: 0.05, y: 0, z: 0 },
    ]
    expect(largoDelTrazo(dos, 1000), 'archivo en metros').toBe(50)
    expect(largoDelTrazo(dos, 1), 'archivo en milímetros').toBe(0.1)
  })
})

// ------------------------------------------------------------ el documento

describe('traducir el documento a lo que usa la consola', () => {
  it('compone el código con el hueso y la clasificación', () => {
    expect(
      codigoDelCaso({ hueso: { codigo: '42' }, clasificacion: { codigo: 'A2' } }),
    ).toBe('42-A2')
  })

  it('el código escrito a mano manda sobre el compuesto', () => {
    expect(
      codigoDelCaso({ codigo: '42-A2.3', hueso: { codigo: '42' }, clasificacion: { codigo: 'A2' } }),
    ).toBe('42-A2.3')
  })

  it('un caso a medio escribir no revienta', () => {
    // El traumatólogo guarda borradores incompletos todo el tiempo.
    const caso = casoParaLaConsola({ nombre: 'A medias' })
    expect(caso.nombre).toBe('A medias')
    expect(caso.modeloUrl).toBeNull()
    expect(caso.pasos).toEqual([])
    expect(caso.instrumental).toEqual([])
    expect(caso.milimetrosPorUnidad, 'glTF trabaja en metros').toBe(1000)
    expect(caso.ejeLargo).toBe('y')
  })

  it('la bandeja la forman los instrumentos que usan los pasos, sin repetir', () => {
    const caso = casoParaLaConsola({
      nombre: 'Caso',
      pasos: [
        { titulo: 'Uno', instrumento: { id: 3, nombre: 'Bisturí', icono: 'bisturi' } },
        { titulo: 'Dos', instrumento: { id: 3, nombre: 'Bisturí', icono: 'bisturi' } },
        { titulo: 'Tres', instrumento: { id: 7, nombre: 'Punzón', icono: 'punzon' } },
      ],
    })
    expect(caso.instrumental).toHaveLength(2)
    expect(caso.instrumental.map((i) => i.nombre)).toEqual(['Bisturí', 'Punzón'])
  })

  it('el paso guarda el identificador del instrumento, que es con lo que se compara', () => {
    const caso = casoParaLaConsola({
      nombre: 'Caso',
      pasos: [{ titulo: 'Uno', instrumento: { id: 3, nombre: 'Bisturí' } }],
    })
    expect(caso.pasos[0].instrumento).toBe('3')
    expect(caso.instrumental[0].id).toBe('3')
  })

  it('lleva las tres tolerancias del paso hasta la consola', () => {
    // Una tolerancia guardada que no llega al navegador se ignora en silencio:
    // el caso dice cuatro milímetros, la consola acepta cinco, y no hay ningún
    // error que lo delate. Pasó de verdad.
    const caso = casoParaLaConsola({
      nombre: 'Caso',
      pasos: [
        {
          titulo: 'Reducir',
          objetivo: 'reduccion',
          toleranciaDesplazamiento: 6,
          toleranciaDiastasis: 4,
          toleranciaAngulacion: 3,
        },
      ],
    })
    expect(caso.pasos[0].toleranciaDesplazamiento).toBe(6)
    expect(caso.pasos[0].toleranciaDiastasis).toBe(4)
    expect(caso.pasos[0].toleranciaAngulacion).toBe(3)
  })

  it('descarta las piezas que no nombran ningún objeto del archivo', () => {
    const caso = casoParaLaConsola({
      nombre: 'Caso',
      piezas: [
        { nodo: 'tibia_distal', rol: 'fragmento' },
        { nodo: '', rol: 'hueso' },
        { rol: 'piel' },
      ],
    })
    expect(caso.piezas).toHaveLength(1)
    expect(caso.piezas[0].nodo).toBe('tibia_distal')
  })
})

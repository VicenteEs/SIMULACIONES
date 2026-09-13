import { describe, it, expect } from 'vitest'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'
import { evaluarGesto, fuerzaInicial, objetivoDelPaso, RESULTADOS } from '@/lib/simulador'
import { largoDelTrazo } from '@/lib/reduccion'

/**
 * El caso tal como llega a la consola, no como se escribe a mano en una prueba.
 *
 * `casoParaLaConsola` es el único camino entre la base y el navegador
 * (`src/app/(frontend)/simulador/[id]/page.tsx`), y rellena campos por su
 * cuenta. Una prueba que construya el paso a mano puede estar cubriendo una
 * forma que la aplicación no produce nunca: pasaba con la deducción del
 * objetivo, que se probaba sobre un paso sin `objetivo` cuando aquí siempre se
 * escribe uno.
 */

const casoCon = (documento: Record<string, unknown>) =>
  casoParaLaConsola({ nombre: 'Caso', ...documento })

describe('la escala del modelo', () => {
  it('mantiene la que declare el caso', () => {
    expect(casoCon({ milimetrosPorUnidad: 1 }).milimetrosPorUnidad).toBe(1)
  })

  it('el cero no es una escala: es el campo mal escrito', () => {
    // `Number.isFinite(0)` es cierto, así que el cero se colaba entero. Con
    // escala cero el largo del trazo se multiplica hasta desaparecer y el paso
    // de incisión responde «todavía no hay ninguna incisión trazada» por larga
    // que sea: un caso que no se puede terminar y nada que señale por qué.
    expect(casoCon({ milimetrosPorUnidad: 0 }).milimetrosPorUnidad).toBe(1000)
    expect(casoCon({ milimetrosPorUnidad: -1000 }).milimetrosPorUnidad).toBe(1000)
  })

  it('con la escala saneada, una incisión trazada mide y el paso se puede superar', () => {
    const caso = casoCon({
      milimetrosPorUnidad: 0,
      pasos: [
        {
          titulo: 'Incisión de abordaje',
          objetivo: 'trazo',
          instrumento: { id: 1, nombre: 'Bisturí' },
          trazoMinimo: 40,
          trazoMaximo: 90,
        },
      ],
    })
    // 60 mm de muslo: lo que el residente arrastra de punta a punta.
    const trazo = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0.06, z: 0 },
    ]
    const largo = largoDelTrazo(trazo, caso.milimetrosPorUnidad)
    expect(largo).toBe(60)
    expect(evaluarGesto(caso.pasos[0], { instrumento: '1', trazo: largo }).avanza).toBe(true)
  })
})

describe('qué se le mide a un paso que llega marcado como «instrumento»', () => {
  /**
   * `casoParaLaConsola` escribe 'instrumento' cuando el campo falta, y la
   * migración de D-059 lo escribió como DEFAULT en toda fila anterior. Así que
   * ese valor no distingue lo que el autor eligió de lo que le pusieron, y un
   * rango guardado manda sobre él.
   *
   * Con una excepción, que es la mitad de estas pruebas: las tres tolerancias
   * de la reducción no son un rango guardado, porque también las escribe la
   * base por su cuenta. Solo la fuerza y el trazo prueban que alguien tecleó.
   *
   * Y lo que sale de aquí ya es el objetivo **deducido**: la consola pinta sus
   * mandos comparando `paso.objetivo` a pelo, así que si el campo cruzara con
   * el valor guardado el motor mediría una cosa y la pantalla ofrecería otra.
   */
  const conRango = (extra: Record<string, unknown>) =>
    casoCon({
      pasos: [
        {
          titulo: 'Paso',
          instrumento: { id: 1, nombre: 'Bisturí' },
          // Las tres las pone Payload por omisión (`defaultValue: 5` en
          // Cirugias.ts) y la migración las rellenó a 5 en toda fila anterior
          // (`DEFAULT 5`): un paso sin ellas no existe en la base. Escribirlas
          // aquí es lo único que hace que la prueba mida lo que devuelve la
          // aplicación y no una forma inventada.
          toleranciaDesplazamiento: 5,
          toleranciaDiastasis: 5,
          toleranciaAngulacion: 5,
          ...extra,
        },
      ],
    }).pasos[0]

  it('un paso sin objetivo escrito llega con «instrumento» puesto', () => {
    expect(conRango({}).objetivo).toBe('instrumento')
  })

  it('un rango de fuerza guardado se evalúa aunque el paso diga «instrumento»', () => {
    const paso = conRango({ objetivo: 'instrumento', fuerzaMinima: 8, fuerzaMaxima: 20 })
    // El campo que cruza al navegador es el deducido, y de él depende que la
    // consola pinte el deslizador. Si aquí saliera 'instrumento' el paso se
    // evaluaría por una fuerza que el residente no tiene cómo graduar, y
    // `fuerzaInicial` cae dentro del rango por construcción: se aprobaría solo.
    expect(paso.objetivo).toBe('fuerza')
    expect(objetivoDelPaso(paso)).toBe('fuerza')
    const r = evaluarGesto(paso, { instrumento: '1', fuerza: 30 })
    expect(r.resultado, 'el rango escrito se aprobaba sin mirarlo').toBe(
      RESULTADOS.FUERZA_EXCESIVA,
    )
    expect(r.complicacion).toBe(true)
  })

  it('lo mismo con el trazo, que tampoco tiene quien lo escriba por el autor', () => {
    expect(conRango({ trazoMinimo: 40, trazoMaximo: 90 }).objetivo).toBe('trazo')
  })

  it('las tolerancias no deducen: las lleva puestas toda fila', () => {
    // Deducir de ellas convertía TODO paso de instrumento en uno de reducción.
    // Aquí se ve por qué no es una tolerancia «guardada»: el paso no declara
    // ninguna y llega con las tres a 5 de todas formas.
    const paso = conRango({})
    expect(paso.toleranciaAngulacion).toBe(5)
    expect(paso.objetivo).toBe('instrumento')
    expect(objetivoDelPaso(paso)).toBe('instrumento')
    // Ni siquiera una tolerancia distinta de la de omisión manda sobre el
    // objetivo escrito: no hay forma de distinguirla del relleno.
    expect(conRango({ toleranciaAngulacion: 3 }).objetivo).toBe('instrumento')
  })

  it('una fila sin objetivo tampoco se vuelve una reducción', () => {
    // El campo no puede faltar en la base —`DEFAULT 'instrumento'`— pero si
    // faltara, el relleno tiene que ganarle a la deducción: con las tres
    // tolerancias puestas a 5 en toda fila, tratarlo como silencio devolvería
    // 'reduccion' y dejaría el paso imposible por el otro lado.
    const sinObjetivo = casoCon({
      pasos: [
        {
          titulo: 'Paso',
          instrumento: { id: 1, nombre: 'Bisturí' },
          toleranciaDesplazamiento: 5,
          toleranciaDiastasis: 5,
          toleranciaAngulacion: 5,
        },
      ],
    }).pasos[0]
    expect(sinObjetivo.objetivo).toBe('instrumento')
  })

  it('el paso que solo pide coger el instrumento no se convierte en uno de reducción', () => {
    // El paso 2 del caso de prueba, «Apertura del punto de entrada»: pedía el
    // punzón y nada más. Con el caso arrancando en 12.5 mm y 9.8° —y los mandos
    // de girar sin pintar, porque la consola los enseña por `paso.objetivo`—
    // exigirle una reducción dejaba el caso imposible de terminar.
    const paso = conRango({ objetivo: 'instrumento' })
    expect(paso.objetivo).toBe('instrumento')
    expect(objetivoDelPaso(paso)).toBe('instrumento')
    expect(
      evaluarGesto(paso, { instrumento: '1', desplazamiento: 12.5, diastasis: 0, angulacion: 9.8 })
        .avanza,
    ).toBe(true)
  })

  it('sin ningún rango guardado sigue siendo elegir el instrumento', () => {
    const paso = conRango({})
    expect(objetivoDelPaso(paso)).toBe('instrumento')
    expect(evaluarGesto(paso, { instrumento: '1' }).avanza).toBe(true)
  })

  it('un objetivo distinto de «instrumento» manda sobre la deducción', () => {
    // Ese sí lo eligió alguien: no hay DEFAULT ni relleno que lo escriba.
    const paso = conRango({ objetivo: 'trazo', trazoMinimo: 40, fuerzaMinima: 8 })
    expect(objetivoDelPaso(paso)).toBe('trazo')
  })
})

describe('dónde arranca el mando de la fuerza', () => {
  it('en el punto medio cuando el paso declara los dos extremos', () => {
    expect(fuerzaInicial({ fuerzaMinima: 20, fuerzaMaxima: 60 })).toBe(40)
  })

  it('dentro del rango cuando solo hay techo', () => {
    // Arrancaba en 10 sobre un techo de 8, y aplicar el paso sin tocar nada se
    // anotaba como complicación: la habría puesto el código al colocar el
    // mando, no el residente al decidir.
    expect(fuerzaInicial({ fuerzaMaxima: 8 })).toBe(8)
    expect(fuerzaInicial({ fuerzaMaxima: 60 })).toBe(10)

    const delicado = { instrumento: 'bisturi', objetivo: 'fuerza', fuerzaMaxima: 8 } as const
    const sinTocarElMando = evaluarGesto(delicado, {
      instrumento: 'bisturi',
      fuerza: fuerzaInicial(delicado),
    })
    expect(sinTocarElMando.complicacion).toBe(false)
    expect(sinTocarElMando.avanza).toBe(true)
  })

  it('en el mínimo cuando solo hay suelo, y en diez cuando no hay rango', () => {
    expect(fuerzaInicial({ fuerzaMinima: 25 })).toBe(25)
    expect(fuerzaInicial({})).toBe(10)
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  comprobacionDeLaNota,
  conAutomatica,
  conBloqueo,
  conIntento,
  conPartida,
  gestoParaLaNota,
  MAXIMO_DE_INTENTOS_POR_PASO,
  notaDelRecorrido,
  RECORRIDO_VACIO,
  recorridoValido,
  TOPE_DEL_RECORRIDO,
  type RecorridoDelCaso,
} from '@/lib/notaDelRecorrido'
import { evaluarGesto, puntosDelPaso, RESULTADOS, type Gesto, type PasoQuirurgico } from '@/lib/simulador'
import { avanceValido, type AvanceDelCaso } from '@/lib/avanceDelCaso'

/**
 * La nota rehecha en el servidor (D-310).
 *
 * El navegador manda, con el puntaje, lo que se hizo en cada paso, y el servidor lo vuelve a pasar por el motor. Lo que
 * se vigila es que esa cuenta sea la de la consola —la regla de D-059— aunque de cada paso viajen solo tres gestos, y que
 * lo que llega por HTTP se rehaga entero antes de evaluarlo.
 */

type Paso = PasoQuirurgico & { id: string }

const PASOS: Paso[] = [
  { id: 'p1', objetivo: 'instrumento', instrumento: 'bisturi', puntos: 10 },
  { id: 'p2', objetivo: 'trazo', instrumento: 'bisturi', trazoMinimo: 40, trazoMaximo: 60, puntos: 10 },
  {
    id: 'p3',
    objetivo: 'reduccion',
    instrumento: 'pinza',
    toleranciaDesplazamiento: 2,
    toleranciaDiastasis: 2,
    toleranciaAngulacion: 5,
    puntos: 10,
  },
  { id: 'p4', objetivo: 'fijacion', instrumento: 'tornillo', tornillosMinimos: 2, puntos: 10 },
]
const [P1, P2, P3, P4] = PASOS

const LECTURA = { lateral: 0, anteroposterior: 0, axial: 0, valgo: 0, recurvatum: 0, rotacion: 0 }

const G = {
  bisturi: { instrumento: 'bisturi' },
  pinzaEnElPrimero: { instrumento: 'pinza' },
  sinInstrumento: { instrumento: null },
  trazoCorto: { instrumento: 'bisturi', trazo: 30 },
  trazoLargo: { instrumento: 'bisturi', trazo: 80 },
  trazoBueno: { instrumento: 'bisturi', trazo: 50 },
  reducido: { instrumento: 'pinza', desplazamiento: 1, diastasis: 0.5, angulacion: 2, lectura: null },
  sinReducir: { instrumento: 'pinza', desplazamiento: 4, diastasis: 0.5, angulacion: 2, lectura: null },
  fijado: { instrumento: 'tornillo', fijacion: { placa: true, tornillos: 2, bicorticales: 2, largos: 0 } },
  faltaUnTornillo: { instrumento: 'tornillo', fijacion: { placa: true, tornillos: 1, bicorticales: 1, largos: 0 } },
  tornilloLargo: { instrumento: 'tornillo', fijacion: { placa: true, tornillos: 2, bicorticales: 2, largos: 1 } },
} satisfies Record<string, Gesto>

/** Lo que va haciendo la consola: cada gesto evaluado pasa por `conIntento`. */
const recorrer = (secuencia: [Paso, Gesto][], desde: RecorridoDelCaso = RECORRIDO_VACIO): RecorridoDelCaso =>
  secuencia.reduce((recorrido, [paso, gesto]) => conIntento(recorrido, paso, gesto), desde)

describe('la nota del recorrido es la regla de D-059', () => {
  it('a la primera, el paso entero; tras un fallo, la mitad; tras un daño, nada', () => {
    const recorrido = recorrer([
      [P1, G.bisturi],
      [P2, G.trazoCorto],
      [P2, G.trazoBueno],
      [P3, G.reducido],
      [P4, G.tornilloLargo],
      [P4, G.fijado],
    ])
    expect(notaDelRecorrido(PASOS, recorrido)).toEqual({ puntaje: 10 + 5 + 10 + 0, puntajeMaximo: 40 })
  })

  it('un instrumento equivocado es un fallo; pulsar sin ninguno no cuenta y ni se guarda', () => {
    expect(notaDelRecorrido(PASOS, recorrer([[P1, G.pinzaEnElPrimero], [P1, G.bisturi]])).puntaje).toBe(5)
    expect(conIntento(RECORRIDO_VACIO, P1, G.sinInstrumento)).toBe(RECORRIDO_VACIO)
    expect(notaDelRecorrido(PASOS, recorrer([[P1, G.sinInstrumento], [P1, G.bisturi]])).puntaje).toBe(10)
  })

  it('de cada paso se guarda el primer gesto de cada clase, y nada más', () => {
    const recorrido = recorrer([
      [P2, G.trazoCorto],
      [P2, { instrumento: 'bisturi', trazo: 20 }],
      [P2, G.trazoLargo],
      [P2, { instrumento: 'bisturi', trazo: 95 }],
      [P2, G.trazoBueno],
      [P2, { instrumento: 'bisturi', trazo: 45 }],
    ])
    expect(recorrido.pasos).toHaveLength(1)
    expect(recorrido.pasos[0].intentos.map((g) => g.trazo)).toEqual([30, 80, 50])
  })

  it('guardar solo esos da la misma nota que rehacer todos los gestos', () => {
    // La regla de `aplicarPaso` con todos los gestos de cada paso, hasta el que lo supera: es lo que la nota del
    // servidor tiene que reproducir con los tres que viajan.
    const conTodos = (secuencias: Map<string, Gesto[]>): number => {
      let total = 0
      for (const paso of PASOS) {
        let fallo = false
        let complicacion = false
        for (const gesto of secuencias.get(paso.id) ?? []) {
          const e = evaluarGesto(paso, gesto)
          if (e.avanza) {
            total += puntosDelPaso(paso, { fallo, complicacion })
            break
          }
          if (e.complicacion) complicacion = true
          else if (e.resultado !== RESULTADOS.SIN_INSTRUMENTO) fallo = true
        }
      }
      return total
    }
    const POZO: Record<string, Gesto[]> = {
      p1: [G.bisturi, G.pinzaEnElPrimero, G.sinInstrumento],
      p2: [G.trazoCorto, G.trazoLargo, G.trazoBueno, G.sinInstrumento],
      p3: [G.reducido, G.sinReducir, G.sinInstrumento],
      p4: [G.fijado, G.faltaUnTornillo, G.tornilloLargo, G.sinInstrumento],
    }
    // Un generador con semilla, para que una diferencia se pueda repetir.
    let semilla = 20261105
    const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647
    for (let vuelta = 0; vuelta < 300; vuelta++) {
      const secuencias = new Map<string, Gesto[]>()
      let recorrido = RECORRIDO_VACIO
      for (const paso of PASOS) {
        const gestos: Gesto[] = []
        const cuantos = Math.floor(azar() * 7)
        for (let i = 0; i < cuantos; i++) {
          const gesto = POZO[paso.id][Math.floor(azar() * POZO[paso.id].length)]
          gestos.push(gesto)
          recorrido = conIntento(recorrido, paso, gesto)
          // La consola pasa al paso siguiente en cuanto uno lo supera.
          if (evaluarGesto(paso, gesto).avanza) break
        }
        secuencias.set(paso.id, gestos)
      }
      expect(notaDelRecorrido(PASOS, recorrido).puntaje, `vuelta ${vuelta}`).toBe(conTodos(secuencias))
      for (const hecho of recorrido.pasos) expect(hecho.intentos.length).toBeLessThanOrEqual(3)
    }
  })

  it('un paso sin gesto que lo supere no suma; uno que el caso ya no tiene no cuenta; el orden de llegada no importa', () => {
    expect(notaDelRecorrido(PASOS, recorrer([[P2, G.trazoCorto]])).puntaje).toBe(0)
    const fantasma: Paso = { id: 'p9', objetivo: 'instrumento', instrumento: 'bisturi', puntos: 50 }
    expect(notaDelRecorrido(PASOS, recorrer([[fantasma, G.bisturi]])).puntaje).toBe(0)
    const recorrido = recorrer([[P1, G.bisturi], [P2, G.trazoCorto], [P2, G.trazoBueno]])
    expect(notaDelRecorrido(PASOS, { ...recorrido, pasos: [...recorrido.pasos].reverse() })).toEqual(notaDelRecorrido(PASOS, recorrido))
  })
})

describe('lo que no sale del gesto', () => {
  it('la reducción automática no puntúa en un paso de reducción', () => {
    expect(notaDelRecorrido(PASOS, conAutomatica(recorrer([[P3, G.reducido]]), 'p3')).puntaje).toBe(0)
    // Fuera de uno de reducción no cambia nada, como en `puntosDelPaso`.
    expect(notaDelRecorrido(PASOS, conAutomatica(recorrer([[P1, G.bisturi]]), 'p1')).puntaje).toBe(10)
  })

  it('el bloqueo fuera de los topes del foco cuesta el paso en que ocurrió; dentro, nada (D-308)', () => {
    const fijado = recorrer([[P4, G.fijado]])
    const medida = (desplazamiento: number) => ({ desplazamiento, diastasis: 0, angulacion: 1, lectura: null })
    expect(notaDelRecorrido(PASOS, conBloqueo(fijado, 'p4', medida(8))).puntaje).toBe(0)
    expect(notaDelRecorrido(PASOS, conBloqueo(fijado, 'p4', medida(1))).puntaje).toBe(10)
    // Los topes son los del último paso de reducción (2 mm), no los 5 por omisión: 3 mm es fijar sin reducir.
    expect(notaDelRecorrido(PASOS, conBloqueo(fijado, 'p4', medida(3))).puntaje).toBe(0)
  })

  it('del bloqueo se guarda el primero: los siguientes no cambian la nota', () => {
    const medida = (desplazamiento: number) => ({ desplazamiento, diastasis: 0, angulacion: 1, lectura: null })
    const dos = conBloqueo(conBloqueo(RECORRIDO_VACIO, 'p4', medida(8)), 'p4', medida(1))
    expect(dos.pasos[0].bloqueo?.desplazamiento).toBe(8)
  })

  it('los pasos sin nada que reducir no suman ni cuentan en el máximo (D-306)', () => {
    const reducido = recorrer([[P3, G.reducido]])
    const partida = (desplazamiento: number) => ({ desplazamiento, diastasis: 0, angulacion: 0, lectura: null })
    // Empezaba ya dentro de los topes: se aprueba sin mover nada.
    expect(notaDelRecorrido(PASOS, conPartida(reducido, partida(0)))).toEqual({ puntaje: 0, puntajeMaximo: 30 })
    // El modelo no trae fragmento: tampoco hay qué medir.
    expect(notaDelRecorrido(PASOS, conPartida(reducido, null))).toEqual({ puntaje: 0, puntajeMaximo: 30 })
    expect(notaDelRecorrido(PASOS, conPartida(reducido, partida(6)))).toEqual({ puntaje: 10, puntajeMaximo: 40 })
    // Sin medida de partida —todavía no se colocó, o un avance de antes—, como si hubiera algo que reducir.
    expect(notaDelRecorrido(PASOS, reducido)).toEqual({ puntaje: 10, puntajeMaximo: 40 })
  })
})

describe('lo que viaja de cada gesto', () => {
  it('lo que mira el motor, sin el nombre del instrumento ni lo que la escena lleve de más', () => {
    const completo: Gesto = { ...G.reducido, instrumentoNombre: 'Pinza de reducción', lectura: { ...LECTURA, anchoLateralMm: 22 } }
    const ligero = gestoParaLaNota(completo)
    expect(ligero).not.toHaveProperty('instrumentoNombre')
    expect(ligero.lectura).not.toHaveProperty('anchoLateralMm')
    expect(evaluarGesto(P3, ligero)).toEqual(evaluarGesto(P3, completo))
  })
})

describe('la comprobación de la nota', () => {
  it('sin la del servidor, la del navegador, marcada «sin comprobar»', () => {
    expect(comprobacionDeLaNota(null, { puntaje: 15, puntajeMaximo: 20 })).toEqual({
      puntaje: 15,
      puntajeMaximo: 20,
      comprobacion: 'sin-comprobar',
      delNavegador: null,
    })
  })

  it('iguales, con el margen de una suma de decimales hecha en otro orden', () => {
    expect(comprobacionDeLaNota({ puntaje: 0.1 + 0.2, puntajeMaximo: 20 }, { puntaje: 0.3, puntajeMaximo: 20 })).toMatchObject({
      comprobacion: 'coincide',
      delNavegador: null,
    })
  })

  it('distintas, manda la del servidor y la del navegador queda al lado', () => {
    expect(comprobacionDeLaNota({ puntaje: 15, puntajeMaximo: 20 }, { puntaje: 20, puntajeMaximo: 20 })).toEqual({
      puntaje: 15,
      puntajeMaximo: 20,
      comprobacion: 'no-coincide',
      delNavegador: { puntaje: 20, puntajeMaximo: 20 },
    })
    // El denominador también: una nota es las dos cifras juntas.
    expect(comprobacionDeLaNota({ puntaje: 15, puntajeMaximo: 20 }, { puntaje: 15, puntajeMaximo: 30 }).comprobacion).toBe('no-coincide')
  })
})

describe('el recorrido que llega por HTTP', () => {
  const COMPLETO: RecorridoDelCaso = conPartida(
    conBloqueo(
      conAutomatica(
        recorrer([
          [P1, G.bisturi],
          [P2, G.trazoCorto],
          [P2, G.trazoLargo],
          [P2, G.trazoBueno],
          [P3, { ...G.reducido, lectura: { ...LECTURA, valgo: 1 } }],
          [P4, G.fijado],
        ]),
        'p3',
      ),
      'p4',
      { desplazamiento: 8, diastasis: 0, angulacion: 1, lectura: null },
    ),
    { desplazamiento: 6, diastasis: 1, angulacion: 4, lectura: { ...LECTURA, axial: 1 } },
  )

  it('pasa entero y da la misma nota', () => {
    const llegado = recorridoValido(JSON.parse(JSON.stringify(COMPLETO)))
    expect(llegado).toEqual(COMPLETO)
    expect(notaDelRecorrido(PASOS, llegado)).toEqual(notaDelRecorrido(PASOS, COMPLETO))
  })

  it('rechaza lo que no es un recorrido, diciendo qué falla', () => {
    for (const roto of [null, [], 'x', 3, { v: 2, pasos: [] }]) expect(() => recorridoValido(roto)).toThrow(/recorrido/)
    expect(() => recorridoValido({ v: 1 })).toThrow(/lista/)
    expect(() => recorridoValido({ v: 1, pasos: [{ intentos: [] }] })).toThrow(/no nombra su paso/)
    expect(() => recorridoValido({ v: 1, pasos: [{ paso: 'p1', intentos: 'todos' }] })).toThrow(/gestos/)
    expect(() => recorridoValido({ v: 1, pasos: [{ paso: 'p1', intentos: [3] }] })).toThrow(/gesto 1/)
    expect(() => recorridoValido({ v: 1, pasos: [{ paso: 'p4', intentos: [], bloqueo: 'mucho' }] })).toThrow(/bloqueo/)
    expect(() => recorridoValido({ v: 1, pasos: [], partida: 3 })).toThrow(/partida/)
  })

  it('con sus topes: de gestos por paso, de pasos y de tamaño', () => {
    const intentos = Array.from({ length: MAXIMO_DE_INTENTOS_POR_PASO + 1 }, () => G.bisturi)
    expect(() => recorridoValido({ v: 1, pasos: [{ paso: 'p1', intentos }] })).toThrow(/demasiados/)
    expect(() => recorridoValido({ v: 1, pasos: Array.from({ length: 501 }, (_, i) => ({ paso: `p${i}`, intentos: [] })) })).toThrow()
    expect(() => recorridoValido({ v: 1, pasos: [], relleno: 'x'.repeat(TOPE_DEL_RECORRIDO) })).toThrow(/demasiado/)
  })

  it('de cada gesto se queda solo lo que el motor sabe leer, y con la forma que espera', () => {
    const llegado = recorridoValido({
      v: 1,
      pasos: [
        {
          paso: 'p4',
          automatica: 'sí',
          intentos: [
            {
              instrumento: 'tornillo',
              inventado: true,
              perforacion: { diametroMm: 3.2 },
              fijacion: {
                placa: true,
                tornillos: 6,
                bicorticales: 6,
                largos: 0,
                porFragmento: [
                  { nodo: 'a', nombre: 'a', tornillos: 3, bloqueados: 0 },
                  { nodo: 'b', nombre: 'b', tornillos: -1, bloqueados: 0 },
                ],
              },
              lectura: { lateral: 1 },
            },
          ],
        },
      ],
    })
    const [gesto] = llegado.pasos[0].intentos
    expect(gesto).not.toHaveProperty('inventado')
    // Una perforación a medias no es una perforación.
    expect(gesto.perforacion).toBeUndefined()
    // Un fragmento roto deja fuera la lista entera, no a medias: con uno de menos, la placa «no cruzaría la fractura».
    expect(gesto.fijacion).not.toHaveProperty('porFragmento')
    expect(gesto.lectura).toBeNull()
    expect(llegado.pasos[0]).not.toHaveProperty('automatica')
  })

  it('un número que no es número se queda fuera, y el motor lo lee como lo peor: un dato roto nunca aprueba', () => {
    const llegado = recorridoValido({ v: 1, pasos: [{ paso: 'p2', intentos: [{ instrumento: 'bisturi', trazo: '50' }] }] })
    expect(llegado.pasos[0].intentos[0].trazo).toBeUndefined()
    expect(notaDelRecorrido(PASOS, llegado).puntaje).toBe(0)
    const sinCifras = recorridoValido({ v: 1, pasos: [{ paso: 'p3', intentos: [{ instrumento: 'pinza', desplazamiento: null }] }] })
    expect(notaDelRecorrido(PASOS, sinCifras).puntaje).toBe(0)
  })

  it('la partida: `null` se conserva —no hay fragmento— y sin ella no se inventa', () => {
    expect(recorridoValido({ v: 1, pasos: [], partida: null }).partida).toBeNull()
    expect(recorridoValido({ v: 1, pasos: [] })).not.toHaveProperty('partida')
  })

  it('viaja también dentro del avance guardado, con las mismas reglas', () => {
    const avance = (cambios: Partial<AvanceDelCaso> = {}): AvanceDelCaso => ({
      v: 1,
      paso: 3,
      modo: 'practica',
      puntaje: 20,
      resueltos: ['p1', 'p2'],
      fallados: ['p2'],
      complicados: [],
      automaticas: [],
      complicaciones: [],
      insumos: {},
      instantanea: { sesion: '{"v":3}', colocado: '' },
      guardadoEn: '2026-11-05T10:00:00.000Z',
      ...cambios,
    })
    expect(avanceValido(avance({ recorrido: COMPLETO }))?.recorrido).toEqual(COMPLETO)
    // Un avance de antes no trae recorrido, y sigue valiendo.
    expect(avanceValido(avance())).not.toHaveProperty('recorrido')
    expect(() => avanceValido({ ...avance(), recorrido: { v: 9 } })).toThrow(/recorrido/)
  })
})

describe('la consola lleva el recorrido', () => {
  const consola = readFileSync(join(process.cwd(), 'src', 'components', 'simulador', 'ConsolaQuirurgica.tsx'), 'utf8')

  it('cada gesto evaluado, salvo al repasar o con el paso ya superado', () => {
    expect(consola).toContain('if (!repaso && !resueltos.has(paso.id)) recorridoDeLaNota.current = conIntento(recorridoDeLaNota.current, paso, gesto)')
  })

  it('la automática, y lo manda con cada hito con la medida de partida', () => {
    expect(consola).toContain('recorridoDeLaNota.current = conAutomatica(recorridoDeLaNota.current, pasoDeAhora.id)')
    expect(consola).toContain('...recorridoDeLaNota.current,')
    expect(consola).toContain('partida: partidaDeLaReduccion ? medidaParaLaNota(partidaDeLaReduccion) : null')
  })

  it('empieza vacío al reiniciar y al empezar el caso, y al seguir donde se dejó trae el guardado; los dos, con su modo', () => {
    expect(consola.split('recorridoDeLaNota.current = RECORRIDO_VACIO').length - 1).toBe(1)
    // El modo entra al empezar y no cambia (E4 de P-012).
    expect(consola).toContain('recorridoDeLaNota.current = { ...RECORRIDO_VACIO, modo: elegido }')
    expect(consola).toContain('recorridoDeLaNota.current = { ...(avance.recorrido ?? RECORRIDO_VACIO), modo: avance.modo }')
  })
})

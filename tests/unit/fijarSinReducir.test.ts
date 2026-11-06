import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  juicioDelBloqueo,
  puntosDelPaso,
  RESULTADOS,
  topesDeReduccion,
  topesDelFoco,
  type PasoQuirurgico,
} from '@/lib/simulador'
import { focoBloqueado, type EstadoDeLaFijacion, type TornilloPuesto } from '@/lib/fijacion'

/**
 * Fijar sin haber reducido (D-308).
 *
 * Daba todos los puntos: `FOCO_PARA_FIJAR` avisaba al apoyar la placa y nada más, y la escena deja seguir moviendo el
 * trozo con los tornillos puestos, así que bastaba con fijar mal y reducir después. Ahora la reducción se mide en el
 * momento en que el implante bloquea el foco, y fuera de los topes es una complicación.
 */

const tornillo = (agujero: number, extra: Partial<TornilloPuesto> = {}): TornilloPuesto => ({
  agujero,
  largoMm: 30,
  diametroMm: 3.5,
  bicortical: true,
  puntaFueraMm: 1,
  espesorMm: 20,
  bloqueado: false,
  aviso: null,
  ...extra,
})

/** Una placa de cuatro agujeros, dos sobre cada fragmento; el último, sin hueso debajo. */
const conPlaca = (tornillos: TornilloPuesto[], trozoDeCadaAgujero: (string | null)[] | null = ['proximal', 'proximal', 'distal', null]): EstadoDeLaFijacion => ({
  placa: {
    nombre: 'Placa LC-DCP',
    agujeros: 4,
    apoyada: true,
    separadaDelHuesoMm: 0.2,
    asiento: {
      contactoPct: 90,
      sinHuesoPct: 10,
      holguraMediaMm: 0.2,
      trozos: [
        { nodo: 'proximal', agujeros: 2, holguraMinimaMm: 0.1 },
        { nodo: 'distal', agujeros: 1, holguraMinimaMm: 0.1 },
      ],
      agujerosSinHueso: 1,
      ...(trozoDeCadaAgujero ? { trozoDeCadaAgujero } : {}),
    },
  },
  tornillos,
})
const sinPlaca = (tornillos: TornilloPuesto[]): EstadoDeLaFijacion => ({ placa: null, tornillos })

describe('cuándo el implante bloquea el foco', () => {
  it('nada puesto no bloquea nada', () => {
    expect(focoBloqueado(null)).toBe(false)
    expect(focoBloqueado(conPlaca([]))).toBe(false)
  })

  it('la placa con tornillos en un solo fragmento todavía se puede corregir; el que entra en el otro es el que fija', () => {
    expect(focoBloqueado(conPlaca([tornillo(0)]))).toBe(false)
    expect(focoBloqueado(conPlaca([tornillo(0), tornillo(1)]))).toBe(false)
    expect(focoBloqueado(conPlaca([tornillo(0), tornillo(2)]))).toBe(true)
  })

  it('un agujero sin hueso debajo no es un fragmento', () => {
    expect(focoBloqueado(conPlaca([tornillo(0), tornillo(3)]))).toBe(false)
  })

  it('una sesión de antes, sin el trozo de cada agujero, no se da por bloqueada por la placa', () => {
    expect(focoBloqueado(conPlaca([tornillo(0), tornillo(2)], null))).toBe(false)
  })

  it('los tornillos de una trayectoria o del clavo no son de la placa, aunque su índice caiga en un agujero', () => {
    expect(focoBloqueado(conPlaca([tornillo(0), tornillo(2, { libre: true })]))).toBe(false)
    expect(focoBloqueado(conPlaca([tornillo(0), tornillo(2, { deClavo: 'D1', punteria: 'falla' })]))).toBe(false)
  })

  it('un tornillo que cruza la fractura bloquea solo, con placa o sin ella', () => {
    expect(focoBloqueado(sinPlaca([tornillo(-1, { libre: true })]))).toBe(false)
    expect(focoBloqueado(sinPlaca([tornillo(-1, { libre: true, cruzaLaFractura: true })]))).toBe(true)
    expect(focoBloqueado(conPlaca([tornillo(-1, { libre: true, cruzaLaFractura: true })]))).toBe(true)
  })

  it('el clavo, con un bloqueo arriba y otro abajo que agarraron su orificio; rozar agarra, fallar no', () => {
    const p = (punteria: TornilloPuesto['punteria']) => tornillo(-1, { deClavo: 'P1', punteria })
    const d = (punteria: TornilloPuesto['punteria']) => tornillo(-1, { deClavo: 'D1', punteria })
    expect(focoBloqueado(sinPlaca([p('acierta')]))).toBe(false)
    expect(focoBloqueado(sinPlaca([p('acierta'), tornillo(-1, { deClavo: 'P2', punteria: 'acierta' })]))).toBe(false)
    expect(focoBloqueado(sinPlaca([p('acierta'), d('acierta')]))).toBe(true)
    expect(focoBloqueado(sinPlaca([p('roza'), d('acierta')]))).toBe(true)
    expect(focoBloqueado(sinPlaca([p('acierta'), d('falla')]))).toBe(false)
  })
})

describe('con qué topes se juzga la reducción al bloquear', () => {
  const PASOS: PasoQuirurgico[] = [
    { objetivo: 'trazo', trazoMinimo: 40, trazoMaximo: 60 },
    { objetivo: 'reduccion', toleranciaDesplazamiento: 2, toleranciaDiastasis: 2, toleranciaAngulacion: 4 },
    { objetivo: 'fijacion', tornillosMinimos: 2 },
    { objetivo: 'reduccion', toleranciaDesplazamiento: 1, toleranciaDiastasis: 1, toleranciaAngulacion: 2 },
    { objetivo: 'fijacion', tornillosMinimos: 4 },
  ]

  it('los del último paso de reducción hasta el paso en que se está', () => {
    expect(topesDelFoco(PASOS, 1).desplazamiento).toBe(2)
    expect(topesDelFoco(PASOS, 2).desplazamiento).toBe(2)
    expect(topesDelFoco(PASOS, 2).angulacion).toBe(4)
    expect(topesDelFoco(PASOS, 4).desplazamiento).toBe(1)
  })

  it('fijando antes de que el caso pida reducir, los del primero que lo pida', () => {
    expect(topesDelFoco(PASOS, 0).desplazamiento).toBe(2)
  })

  it('con el caso terminado, los del último', () => {
    expect(topesDelFoco(PASOS, 99).desplazamiento).toBe(1)
  })

  it('un caso sin pasos de reducción, los de siempre: 5 mm y 5°, lo mismo que avisaba la placa', () => {
    expect(topesDelFoco([{ objetivo: 'fijacion', tornillosMinimos: 2 }], 0)).toEqual(topesDeReduccion({}))
    expect(topesDelFoco([{ objetivo: 'fijacion' }], 0)).toMatchObject({ desplazamiento: 5, diastasis: 5, angulacion: 5 })
  })
})

describe('el juicio del bloqueo', () => {
  const topes = topesDeReduccion({})

  it('dentro de los topes no pasa nada', () => {
    expect(juicioDelBloqueo({ desplazamiento: 1, diastasis: 0.5, angulacion: 2, lectura: null }, topes)).toBeNull()
  })

  it('fuera, una complicación que dice qué cifra y qué habría que hacer en pabellón', () => {
    const juicio = juicioDelBloqueo({ desplazamiento: 12.5, diastasis: 1, angulacion: 9.8, lectura: null }, topes)
    expect(juicio).not.toBeNull()
    expect(juicio!.resultado).toBe(RESULTADOS.FIJACION_SIN_REDUCIR)
    expect(juicio!.complicacion).toBe(true)
    expect(juicio!.avanza).toBe(false)
    expect(juicio!.mensaje).toContain('Fijó en mala posición')
    expect(juicio!.mensaje).toContain('12,5 mm de desplazamiento')
    expect(juicio!.mensaje).toContain('9,8° de angulación')
    expect(juicio!.mensaje).toContain('retirarlo, reducir y volver a fijar')
  })

  it('una medida sin cifras no está dentro de nada: un dato roto nunca aprueba', () => {
    expect(juicioDelBloqueo({}, topes)?.resultado).toBe(RESULTADOS.FIJACION_SIN_REDUCIR)
  })

  it('con la técnica anatómica se juzga plano a plano', () => {
    const anatomica = topesDeReduccion({ tecnicaDeReduccion: 'anatomica' })
    const lectura = { lateral: 0, anteroposterior: 0, axial: 0, valgo: 3, recurvatum: 0, rotacion: 0 }
    const juicio = juicioDelBloqueo({ desplazamiento: 0.5, diastasis: 0, angulacion: 3, lectura }, anatomica)
    expect(juicio?.mensaje).toContain('en el plano coronal')
    // Con el giro total de 3° dentro de los 5° por omisión, sin la técnica habría pasado.
    expect(juicioDelBloqueo({ desplazamiento: 0.5, diastasis: 0, angulacion: 3, lectura }, topes)).toBeNull()
  })

  it('es una complicación, así que cuesta el paso entero aunque después se acierte', () => {
    expect(puntosDelPaso({ objetivo: 'fijacion', puntos: 10 }, { fallo: false, complicacion: true })).toBe(0)
  })
})

describe('la consola lo mide al bloquear, una vez, y solo con un tornillo recién puesto', () => {
  const consola = readFileSync(join(process.cwd(), 'src', 'components', 'simulador', 'ConsolaQuirurgica.tsx'), 'utf8').replace(/\r\n/g, '\n')
  const vigilar = consola.slice(consola.indexOf('function vigilarElBloqueo('), consola.indexOf('function aplicarPaso()'))

  it('cada cambio de la fijación pasa por la vigilancia', () => {
    expect(consola).toMatch(/setFijacion\(estado\)\s*vigilarElBloqueo\(estado, suceso\)/)
  })

  it('el foco se mira con el caso: sin un trozo marcado como fragmento no hay foco que bloquear', () => {
    expect(vigilar).toContain("piezas.some((p) => p.rol === 'fragmento') && focoBloqueado(estado)")
  })

  it('un bloqueo ya visto no se vuelve a juzgar, y lo restaurado no se juzga: se juzgó cuando pasó', () => {
    const marca = vigilar.indexOf('focoYaBloqueado.current = true')
    expect(vigilar.indexOf('if (focoYaBloqueado.current) return')).toBeLessThan(marca)
    // Lo restaurado llega sin suceso: se marca como bloqueado y se sale sin medir.
    expect(vigilar.indexOf("if (suceso?.tipo !== 'tornillo' || !paso || !g) return")).toBeGreaterThan(marca)
    expect(vigilar.indexOf("if (suceso?.tipo !== 'tornillo' || !paso || !g) return")).toBeLessThan(vigilar.indexOf('juicioDelBloqueo('))
  })

  it('con los topes del foco, y la complicación entra en la nota y en el recorrido', () => {
    expect(vigilar).toContain('juicioDelBloqueo(medida, topesDelFoco(caso.pasos, indice))')
    expect(vigilar).toContain('conBloqueo(recorridoDeLaNota.current, paso.id, medida)')
    expect(vigilar).toContain('setComplicados(')
    // En el editor, al repasar o con el paso ya superado se dice, pero no cuenta.
    expect(vigilar.indexOf('if (editor || repaso || resueltos.has(paso.id)) return')).toBeLessThan(vigilar.indexOf('conBloqueo('))
  })

  it('un modelo recién cargado empieza sin foco bloqueado', () => {
    const cargar = consola.slice(consola.indexOf('alCargar={() => {'))
    expect(cargar.slice(0, cargar.indexOf('setPosicion('))).toContain('focoYaBloqueado.current = false')
  })
})

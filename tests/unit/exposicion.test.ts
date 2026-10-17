import { describe, expect, it } from 'vitest'
import {
  abreLaCapa,
  adviertePorLaTension,
  alturaEfectivaDelPellizco,
  ALCANCE_POR_TIPO,
  AGARRE_MINIMO_PARA_SOSTENER,
  aperturaDeLaCapa,
  aperturaEnLaPosicion,
  aperturaMaxima,
  aperturaPorLasPinzas,
  caben,
  direccionDelMango,
  ladosParaLaPareja,
  laPareja,
  MAXIMO_DE_SEPARADORES,
  posicionQueAcompana,
  ladoAlColocar,
  limitarAgarre,
  limitarApertura,
  limitarSeparacionDePinzas,
  SEPARACION_MAXIMA_DE_PINZAS_MM,
  tensionDeLaPiel,
  tipoDelSeparador,
  type Pellizco,
  type SeparadorColocado,
} from '@/lib/exposicion'
import { comportamientoDelInstrumento, guiaDelInstrumento } from '@/lib/comportamientoDelInstrumento'

const separador = (extra: Partial<SeparadorColocado> = {}): SeparadorColocado => ({
  id: 1,
  instrumentoId: '10',
  nombre: 'Farabeuf',
  tipo: 'mano',
  plano: 'piel',
  lado: 1,
  posicion: 0.5,
  maximoMm: 30,
  aperturaMm: 20,
  ...extra,
})

describe('los separadores colocados abren donde están', () => {
  it('abre del todo en su posición y se cierra hacia los extremos', () => {
    const s = [separador({ posicion: 0.5, aperturaMm: 20 })]
    expect(aperturaEnLaPosicion(s, 0.5).mas).toBeCloseTo(20, 5)
    expect(aperturaEnLaPosicion(s, 0.5 + ALCANCE_POR_TIPO.mano).mas).toBeLessThan(13)
    expect(aperturaEnLaPosicion(s, 0).mas).toBeLessThan(3)
    expect(aperturaEnLaPosicion(s, 1).mas).toBeLessThan(3)
  })

  it('una hoja de mano abre solo el labio que sostiene', () => {
    expect(aperturaEnLaPosicion([separador({ lado: 1 })], 0.5)).toEqual({ mas: 20, menos: 0 })
    expect(aperturaEnLaPosicion([separador({ lado: -1 })], 0.5)).toEqual({ mas: 0, menos: 20 })
  })

  it('un autoestático abre los dos labios por igual', () => {
    const r = aperturaEnLaPosicion([separador({ tipo: 'autoestatico', lado: 0, aperturaMm: 15 })], 0.5)
    expect(r.mas).toBeCloseTo(15, 5)
    expect(r.menos).toBeCloseTo(15, 5)
  })

  it('dos hojas, una por borde, abren cada una el suyo (se usan en pareja)', () => {
    const r = aperturaEnLaPosicion(
      [separador({ id: 1, lado: 1, aperturaMm: 12 }), separador({ id: 2, lado: -1, aperturaMm: 18 })],
      0.5,
    )
    expect(r.mas).toBeCloseTo(12, 5)
    expect(r.menos).toBeCloseTo(18, 5)
  })

  it('donde dos se solapan manda el que más abre: no se suman', () => {
    const r = aperturaEnLaPosicion(
      [separador({ id: 1, aperturaMm: 10 }), separador({ id: 2, aperturaMm: 14, posicion: 0.5 })],
      0.5,
    )
    expect(r.mas).toBeCloseTo(14, 5)
  })

  it('sin separadores no se abre nada', () => {
    expect(aperturaEnLaPosicion([], 0.5)).toEqual({ mas: 0, menos: 0 })
    expect(aperturaMaxima([])).toBe(0)
  })

  it('la apertura máxima cuenta los dos lados de un autoestático', () => {
    expect(aperturaMaxima([separador({ tipo: 'autoestatico', lado: 0, aperturaMm: 15 })])).toBe(30)
    expect(aperturaMaxima([separador({ aperturaMm: 22 })])).toBe(22)
  })

  it('respeta el tope del separador y los milímetros enteros', () => {
    expect(limitarApertura(55, 30)).toBe(30)
    expect(limitarApertura(-4, 30)).toBe(0)
    expect(limitarApertura(12.6, 30)).toBe(13)
  })

  it('el tipo sale de lo que declara el instrumento', () => {
    expect(tipoDelSeparador({ autoestatico: false })).toBe('mano')
    expect(tipoDelSeparador({ autoestatico: true })).toBe('autoestatico')
    expect(tipoDelSeparador({ autoestatico: false, apoyoEnHueso: true })).toBe('palanca')
    expect(ladoAlColocar('mano', -1)).toBe(-1)
    expect(ladoAlColocar('autoestatico', 1)).toBe(0)
  })

  it('el Farabeuf y el Senn-Miller son de mano, los autoestáticos no, y el Hohmann se apoya en el hueso', () => {
    const q = (slug: string) => comportamientoDelInstrumento({ slug, nombre: slug }).separa
    expect(q('separador-farabeuf')?.autoestatico).toBe(false)
    expect(q('separador-senn-miller')?.autoestatico).toBe(false)
    expect(q('separador-gelpi')?.autoestatico).toBe(true)
    expect(q('separador-weitlaner')?.autoestatico).toBe(true)
    expect(q('separador-hohmann')?.apoyoEnHueso).toBe(true)
    expect(q('separador-farabeuf')?.apoyoEnHueso).toBeFalsy()
  })
})

describe('las pinzas tensan la piel', () => {
  const pinza = (extra: Partial<Pellizco> = {}): Pellizco => ({
    id: 1,
    conDientes: true,
    lado: 1,
    alturaMm: 8,
    posicion: 0.5,
    separacionMm: 0,
    agarre: 1,
    ...extra,
  })

  it('hacen falta dos con dientes, una en cada borde, para que la piel quede tensa', () => {
    expect(tensionDeLaPiel([])).toBe('ninguna')
    expect(tensionDeLaPiel([pinza()])).toBe('un-borde')
    expect(tensionDeLaPiel([pinza({ id: 1, lado: 1 }), pinza({ id: 2, lado: 1 })])).toBe('un-borde')
    expect(tensionDeLaPiel([pinza({ id: 1, lado: 1 }), pinza({ id: 2, lado: -1 })])).toBe('tensa')
  })

  it('sin dientes la pinza pellizca pero no da tensión', () => {
    expect(tensionDeLaPiel([pinza({ conDientes: false }), pinza({ id: 2, conDientes: false, lado: -1 })])).toBe('ninguna')
  })

  it('una pinza que casi no levanta la piel no cuenta como tomada', () => {
    expect(tensionDeLaPiel([pinza({ alturaMm: 1 }), pinza({ id: 2, lado: -1, alturaMm: 1 })])).toBe('ninguna')
  })

  it('avisa antes de profundizar salvo que la piel esté tensa', () => {
    expect(adviertePorLaTension('tensa')).toBeNull()
    expect(adviertePorLaTension('ninguna')).toMatch(/pinzas con dientes/)
    expect(adviertePorLaTension('un-borde')).toMatch(/los dos/)
  })

  it('las pinzas de disección pellizcan; las de reducción no', () => {
    expect(comportamientoDelInstrumento({ slug: 'pinza-diseccion-con-dientes', nombre: 'Pinza' }).pellizca).toEqual({ conDientes: true })
    expect(comportamientoDelInstrumento({ slug: 'pinza-diseccion-sin-dientes', nombre: 'Pinza' }).pellizca).toEqual({ conDientes: false })
    expect(comportamientoDelInstrumento({ slug: 'pinza-reduccion-verbrugge', nombre: 'Pinza de reducción' }).pellizca).toBeNull()
  })
})

describe('la guía de cada instrumento cuenta el abordaje como lo cuenta el traumatólogo', () => {
  const guia = (slug: string, nombre = slug) => guiaDelInstrumento({ slug, nombre }) ?? ''
  it('el bisturí de piel es solo para la primera incisión', () => {
    expect(guia('bisturi-piel-n22')).toMatch(/primera incisión/)
  })
  it('la pinza con dientes se toma de a dos y tensa para cortar la piel por completo', () => {
    expect(guia('pinza-diseccion-con-dientes')).toMatch(/ayudante/)
    expect(guia('pinza-diseccion-con-dientes')).toMatch(/tensión/)
  })
  it('el bisturí profundo y el electrobisturí hablan de la fascia', () => {
    expect(guia('bisturi-profundo-n15')).toMatch(/fascia/)
    expect(guia('electrobisturi')).toMatch(/coagulación/)
    expect(guia('electrobisturi')).toMatch(/0 a 100/)
  })
  it('la Metzenbaum entra cerrada y se abre al avanzar', () => {
    expect(guia('tijera-metzenbaum')).toMatch(/cerrada/)
  })
  it('el Farabeuf empuja la piel a un lado y el Hohmann se apoya en el hueso', () => {
    expect(guia('separador-farabeuf')).toMatch(/empujan la piel/)
    expect(guia('separador-hohmann')).toMatch(/hueso/)
  })
  it('un instrumento sin nada que contar no inventa una guía', () => {
    expect(guiaDelInstrumento({ slug: 'martillo', nombre: 'Martillo' })).toBeNull()
  })
})

describe('cada separador abre su plano y los de encima', () => {
  it('uno apoyado en la piel abre solo la piel', () => {
    const s = separador({ plano: 'piel' })
    expect(abreLaCapa(s, 'piel')).toBe(true)
    expect(abreLaCapa(s, 'musculo')).toBe(false)
  })

  it('apoyado más profundo, en el músculo, abre el músculo y la piel que tiene encima', () => {
    // La hoja tiene que pasar por la piel para llegar al músculo y la lleva consigo.
    const s = separador({ plano: 'musculo' })
    expect(abreLaCapa(s, 'piel')).toBe(true)
    expect(abreLaCapa(s, 'musculo')).toBe(true)
  })

  it('el Hohmann, apoyado en el hueso, retrae todo lo blando', () => {
    const s = separador({ plano: 'hueso', tipo: 'palanca' })
    expect(abreLaCapa(s, 'piel')).toBe(true)
    expect(abreLaCapa(s, 'musculo')).toBe(true)
  })

  it('la separación roma de una disección solo abre el plano que se está disecando', () => {
    const s = separador({ plano: 'musculo', tipo: 'roma', lado: 0 })
    expect(abreLaCapa(s, 'musculo')).toBe(true)
    expect(abreLaCapa(s, 'piel')).toBe(false)
  })

  it('la apertura de una capa cuenta solo los separadores que le llegan', () => {
    const enLaPiel = separador({ id: 1, plano: 'piel', aperturaMm: 10 })
    const enElMusculo = separador({ id: 2, plano: 'musculo', aperturaMm: 25 })
    expect(aperturaDeLaCapa('piel', 0.5, [enLaPiel, enElMusculo]).mas).toBeCloseTo(25, 5)
    // Con solo el de la piel, el músculo no se abre.
    expect(aperturaDeLaCapa('musculo', 0.5, [enLaPiel]).mas).toBe(0)
    expect(aperturaDeLaCapa('musculo', 0.5, [enLaPiel, enElMusculo]).mas).toBeCloseTo(25, 5)
  })
})

describe('la pareja de pinzas de Adson', () => {
  const pinza = (extra: Partial<Pellizco> = {}): Pellizco => ({
    id: 1,
    conDientes: true,
    lado: 1,
    alturaMm: 8,
    posicion: 0.5,
    separacionMm: 0,
    agarre: 1,
    ...extra,
  })

  it('separadas tiran de cada borde de la piel hacia fuera, y abren la herida', () => {
    const par = [pinza({ id: 1, lado: 1, separacionMm: 6 }), pinza({ id: 2, lado: -1, separacionMm: 6 })]
    const abre = aperturaPorLasPinzas(par, 0.5)
    expect(abre.mas).toBeCloseTo(6, 5)
    expect(abre.menos).toBeCloseTo(6, 5)
    // Tiran de un tramo corto: lejos de donde están, la herida no se mueve.
    expect(aperturaPorLasPinzas(par, 0.95).mas).toBeLessThan(0.1)
  })

  it('cerradas sin separar no abren nada', () => {
    expect(aperturaPorLasPinzas([pinza({ separacionMm: 0 })], 0.5)).toEqual({ mas: 0, menos: 0 })
  })

  it('con las mandíbulas abiertas la pinza suelta la piel: ni tensa, ni levanta, ni abre', () => {
    const suelta = pinza({ agarre: 0.2, separacionMm: 8 })
    expect(aperturaPorLasPinzas([suelta], 0.5)).toEqual({ mas: 0, menos: 0 })
    expect(alturaEfectivaDelPellizco(suelta)).toBe(0)
    expect(tensionDeLaPiel([suelta, pinza({ id: 2, lado: -1, agarre: 0.2 })])).toBe('ninguna')
  })

  it('el pliegue sube en proporción a lo cerradas que estén las mandíbulas', () => {
    expect(alturaEfectivaDelPellizco(pinza({ alturaMm: 10, agarre: 1 }))).toBe(10)
    expect(alturaEfectivaDelPellizco(pinza({ alturaMm: 10, agarre: AGARRE_MINIMO_PARA_SOSTENER }))).toBe(5)
  })

  it('las pinzas solo abren la piel: el músculo no se entera', () => {
    const par = [pinza({ id: 1, lado: 1, separacionMm: 6 }), pinza({ id: 2, lado: -1, separacionMm: 6 })]
    expect(aperturaDeLaCapa('piel', 0.5, [], par).mas).toBeCloseTo(6, 5)
    expect(aperturaDeLaCapa('musculo', 0.5, [], par).mas).toBe(0)
  })

  it('con un separador y las pinzas a la vez manda el que más abre, no la suma', () => {
    const par = [pinza({ id: 1, lado: 1, separacionMm: 6 })]
    const s = separador({ lado: 1, aperturaMm: 20 })
    expect(aperturaDeLaCapa('piel', 0.5, [s], par).mas).toBeCloseTo(20, 5)
  })

  it('los topes: la separación y el agarre se quedan en su rango', () => {
    expect(limitarSeparacionDePinzas(100)).toBe(SEPARACION_MAXIMA_DE_PINZAS_MM)
    expect(limitarSeparacionDePinzas(-3)).toBe(0)
    expect(limitarAgarre(1.7)).toBe(1)
    expect(limitarAgarre(-0.2)).toBe(0)
  })
})

describe('el mango del separador sale hacia fuera de la herida (P-003 E3)', () => {
  const normal = [0, 0, 1] as const
  // La dirección del labio «más»: hacia +X. La herida corre a lo largo de Y.
  const direccion = [1, 0, 0] as const

  it('el mango nunca apunta al lado contrario de su labio', () => {
    const mas = direccionDelMango(normal, direccion, 1)
    const menos = direccionDelMango(normal, direccion, -1)
    expect(mas[0]).toBeGreaterThan(0)
    expect(menos[0]).toBeLessThan(0)
    // Y los dos salen hacia arriba, no hacia dentro de la piel.
    expect(mas[2]).toBeGreaterThan(0)
    expect(menos[2]).toBeGreaterThan(0)
  })

  it('dos separadores de bordes opuestos no se cruzan: sus mangos se alejan entre sí', () => {
    const mas = direccionDelMango(normal, direccion, 1)
    const menos = direccionDelMango(normal, direccion, -1)
    // Sobre la herida (x = 0) el de + está a la derecha y el de − a la izquierda; sus mangos siguen de su lado.
    expect(mas[0] - menos[0]).toBeGreaterThan(0)
  })

  it('es unitario y forma 40° con la normal', () => {
    const v = direccionDelMango(normal, direccion, 1)
    expect(Math.hypot(...v)).toBeCloseTo(1, 10)
    expect((Math.acos(v[2]) * 180) / Math.PI).toBeCloseTo(40, 6)
  })

  it('el autoestático va vertical, en el centro', () => {
    expect(direccionDelMango(normal, direccion, 0)).toEqual([0, 0, 1])
  })

  it('no depende de hacia dónde mire la cámara: solo de la normal y del lado', () => {
    const a = direccionDelMango([0, 1, 0], [0, 0, 1], 1)
    expect(a[2]).toBeGreaterThan(0)
    expect(a[1]).toBeGreaterThan(0)
  })

  it('una normal nula no produce NaN', () => {
    expect(direccionDelMango([0, 0, 0], [0, 0, 0], 1).every(Number.isFinite)).toBe(true)
  })
})

describe('lo que acompaña al bisturí (P-003 E3)', () => {
  it('va por detrás de la punta y nunca se sale de la herida', () => {
    expect(posicionQueAcompana(0.5, 100, 15)).toBeCloseTo(0.35, 10)
    expect(posicionQueAcompana(0.05, 100, 15)).toBe(0)
    expect(posicionQueAcompana(1.5, 100, 15)).toBeCloseTo(0.85, 10)
    expect(posicionQueAcompana(-1, 100, 15)).toBe(0)
  })

  it('con una herida sin largo se queda en la punta', () => {
    expect(posicionQueAcompana(0.7, 0, 15)).toBe(0.7)
  })

  it('un retraso negativo no adelanta a la punta', () => {
    expect(posicionQueAcompana(0.4, 100, -20)).toBe(0.4)
  })
})

describe('la pareja de separadores (P-003 E3)', () => {
  it('pone uno por borde, y si ya hay uno, completa con el otro', () => {
    expect(ladosParaLaPareja([])).toEqual([1, -1])
    expect(ladosParaLaPareja([1])).toEqual([-1])
    expect(ladosParaLaPareja([-1])).toEqual([1])
    expect(ladosParaLaPareja([1, -1])).toEqual([])
  })

  it('un autoestático ya puesto no cuenta como lado: no se completa con él', () => {
    expect(ladosParaLaPareja([0])).toEqual([1, -1])
  })

  it('la pareja cuenta dos para el tope', () => {
    expect(caben(MAXIMO_DE_SEPARADORES - 2, 2)).toBe(true)
    expect(caben(MAXIMO_DE_SEPARADORES - 1, 2)).toBe(false)
    expect(caben(MAXIMO_DE_SEPARADORES, 1)).toBe(false)
  })
})

describe('quién va en pareja con quién (P-003 E3)', () => {
  const a = separador({ id: 1, lado: 1, posicion: 0.5 })
  const b = separador({ id: 2, lado: -1, posicion: 0.52 })

  it('la pareja es el del borde de enfrente, del mismo instrumento, plano y altura', () => {
    expect(laPareja([a, b], a)).toEqual([b])
    expect(laPareja([a, b], b)).toEqual([a])
  })

  it('otro instrumento, otro plano, el mismo borde o muy lejos no son pareja', () => {
    expect(laPareja([a, separador({ id: 3, lado: -1, instrumentoId: '99' })], a)).toEqual([])
    expect(laPareja([a, separador({ id: 3, lado: -1, plano: 'musculo' })], a)).toEqual([])
    expect(laPareja([a, separador({ id: 3, lado: 1, posicion: 0.5 })], a)).toEqual([])
    expect(laPareja([a, separador({ id: 3, lado: -1, posicion: 0.9 })], a)).toEqual([])
  })

  it('un autoestático y un Hohmann no tienen pareja', () => {
    const auto = separador({ id: 4, tipo: 'autoestatico', lado: 0 })
    const palanca = separador({ id: 5, tipo: 'palanca', lado: 1 })
    expect(laPareja([auto, a], auto)).toEqual([])
    expect(laPareja([palanca, separador({ id: 6, tipo: 'palanca', lado: -1 })], palanca)).toEqual([])
  })
})

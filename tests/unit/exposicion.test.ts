import { describe, expect, it } from 'vitest'
import {
  abreLaCapa,
  adviertePorLaTension,
  alturaEfectivaDelPellizco,
  AGARRE_MINIMO_PARA_SOSTENER,
  ANGULO_DEL_MANGO_DE_LA_PALANCA_GRADOS,
  aperturaDeLaCapa,
  aperturaEnLaPosicion,
  aperturaMaxima,
  aperturaPorLasPinzas,
  caben,
  deLaIncision,
  direccionDelMango,
  ladosParaLaPareja,
  laPareja,
  MAXIMO_DE_SEPARADORES,
  PENDIENTE_MAXIMA_DEL_LABIO,
  perfilDeLaCapa,
  posicionQueAcompana,
  puntasDeLaGrieta,
  puntasDeLosLabios,
  ladoAlColocar,
  limitarAgarre,
  limitarApertura,
  limitarSeparacionDePinzas,
  SEPARACION_MAXIMA_DE_PINZAS_MM,
  tensionDeLaPiel,
  tipoDelSeparador,
  type Pellizco,
  type SeparadorColocado,
  enElPlano,
  planoSiguiente,
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
  it('bajo la hoja abre lo del panel y de ahí a cada punta el labio va en arco (P-008 E2, P-015)', () => {
    const s = [separador({ posicion: 0.5, aperturaMm: 20 })]
    // Una herida de 60 mm y una hoja de 12: de 0,4 a 0,6 del largo abre los 20 enteros.
    expect(aperturaEnLaPosicion(s, 0.5, 60).mas).toBeCloseTo(20, 5)
    expect(aperturaEnLaPosicion(s, 0.41, 60).mas).toBeCloseTo(20, 5)
    // De la hoja a la punta va en arco de parábola: a mitad de camino lleva ya tres cuartos, y no la mitad de la recta
    // de D-253, que con una hoja en cada labio hacía de la herida un rombo.
    expect(aperturaEnLaPosicion(s, 0.2, 60).mas).toBeCloseTo(15, 5)
    // Llega a la hoja sin esquina: pegado a ella ya casi no sube.
    expect(aperturaEnLaPosicion(s, 0.39, 60).mas).toBeGreaterThan(19.9)
    // Y sale de la punta con el doble de la pendiente de la recta, sin pasar de lo que la punta aguanta.
    const juntoALaPunta = aperturaEnLaPosicion(s, 0.01, 60).mas
    expect(juntoALaPunta).toBeGreaterThan(0.6 * 20 * (0.01 / 0.4) * 2)
    expect(juntoALaPunta).toBeLessThanOrEqual(PENDIENTE_MAXIMA_DEL_LABIO * 0.01 * 60 + 1e-9)
    // Las puntas no se abren nunca.
    expect(aperturaEnLaPosicion(s, 0, 60).mas).toBe(0)
    expect(aperturaEnLaPosicion(s, 1, 60).mas).toBe(0)
  })

  it('a un cuarto del largo abre lo mismo que en el medio: antes abría la mitad (P-008 E2)', () => {
    expect(aperturaEnLaPosicion([separador({ posicion: 0.25, aperturaMm: 12 })], 0.25, 60).mas).toBeCloseTo(12, 5)
  })

  it('la hoja ancha aparta entero un tramo más largo que la angosta', () => {
    const angosta = aperturaEnLaPosicion([separador({ anchoMm: 10 })], 0.6, 60).mas
    const ancha = aperturaEnLaPosicion([separador({ anchoMm: 20 })], 0.6, 60).mas
    expect(ancha).toBeCloseTo(20, 5)
    expect(angosta).toBeLessThan(ancha)
  })

  it('con dos hojas en el mismo labio, entre ellas el borde se comba hacia la herida (D-423)', () => {
    // Hasta D-423 iba en recta, a 12 mm de un gancho al otro. Las hojas de 12 mm en 0,3 y 0,7 de una herida de 60 dejan
    // 12 mm de piel suelta entre sus bordes: en el medio baja a 12 / cosh(12 / 40).
    const s = [separador({ id: 1, posicion: 0.3, aperturaMm: 12 }), separador({ id: 2, posicion: 0.7, aperturaMm: 12 })]
    expect(aperturaEnLaPosicion(s, 0.5, 60).mas).toBeCloseTo(12 / Math.cosh(12 / 40), 5)
    // Bajo cada hoja, lo del panel entero: es rígida.
    expect(aperturaEnLaPosicion(s, 0.35, 60).mas).toBeCloseTo(12, 5)
    expect(aperturaEnLaPosicion(s, 0.65, 60).mas).toBeCloseTo(12, 5)
    // Más separadas, se comban más: en una herida de 120, con 60 mm de piel suelta entre ellas, baja casi a la mitad.
    const lejos = [separador({ id: 1, posicion: 0.2, aperturaMm: 12 }), separador({ id: 2, posicion: 0.8, aperturaMm: 12 })]
    expect(aperturaEnLaPosicion(lejos, 0.5, 120).mas).toBeCloseTo(12 / Math.cosh(60 / 40), 5)
    // Y baja de una hoja a la otra sin saltos: lo más empinado, al salir de cada hoja, es κ·y·tanh(κD/2) = 0,54 mm por
    // mm, 0,65 en cada paso de 1,2 mm.
    let antes = aperturaEnLaPosicion(lejos, 0.25, 120).mas
    for (let x = 0.26; x <= 0.75; x += 0.01) {
      const ahora = aperturaEnLaPosicion(lejos, x, 120).mas
      expect(Math.abs(ahora - antes)).toBeLessThan(0.66)
      antes = ahora
    }
  })

  it('una hoja más baja entre dos altas, que la recta dejaba en el aire, sostiene el labio bajo la comba (D-423)', () => {
    const s = [
      separador({ id: 1, posicion: 0.2, aperturaMm: 12 }),
      separador({ id: 2, posicion: 0.5, aperturaMm: 9 }),
      separador({ id: 3, posicion: 0.8, aperturaMm: 12 }),
    ]
    // Sin la del medio, el borde bajaría ahí a 12 / cosh(1,5) = 5,1 mm; con ella, la sostiene a 9.
    expect(aperturaEnLaPosicion(s, 0.5, 120).mas).toBeCloseTo(9, 5)
    // Y entre ella y cada una de las altas, otra vez combado: por debajo de la recta.
    const entre = aperturaEnLaPosicion(s, 0.35, 120).mas
    expect(entre).toBeLessThan(10.5)
    expect(entre).toBeGreaterThan(5)
  })

  it('pegada a una punta no abre más de lo que la piel aguanta, y la punta sigue cerrada', () => {
    // A 3 mm de la punta de una herida de 60: la hoja de 12 la tapa, pero la punta no se abre.
    const s = [separador({ posicion: 0.05, aperturaMm: 20 })]
    const enLaHoja = aperturaEnLaPosicion(s, 0.05, 60).mas
    expect(enLaHoja).toBeLessThanOrEqual(PENDIENTE_MAXIMA_DEL_LABIO * 0.05 * 60 + 1e-9)
    expect(enLaHoja).toBeGreaterThan(0)
    expect(aperturaEnLaPosicion(s, 0, 60).mas).toBe(0)
  })

  it('la hoja es rígida: cerca de una punta abre menos, pero pareja en todo su ancho', () => {
    // A 12 mm de la punta, la hoja de 12 tiene su borde a 6: ese borde manda, 2 por milímetro, 12 mm en toda la hoja.
    const s = [separador({ posicion: 0.2, aperturaMm: 20 })]
    expect(aperturaEnLaPosicion(s, 0.1, 60).mas).toBeCloseTo(12, 5)
    expect(aperturaEnLaPosicion(s, 0.2, 60).mas).toBeCloseTo(12, 5)
    expect(aperturaEnLaPosicion(s, 0.3, 60).mas).toBeCloseTo(12, 5)
    // Y de ahí a la punta, en recta: la hoja ya abre todo lo que la punta aguanta y no queda margen para combarse.
    expect(aperturaEnLaPosicion(s, 0.05, 60).mas).toBeCloseTo(6, 5)
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

  it('en una malla cuya grieta acaba antes que el trazo, el labio se cierra en la punta de la grieta (P-015)', () => {
    // Como la fascia del caso 4: el trazo hondo sigue hasta 1 trepando por la pared, pero la fascia se partió solo
    // hasta 0,85. Más allá está entera, y tirar de ella a los dos lados la doblaba en un colgajo.
    const s = [separador({ posicion: 0.5, aperturaMm: 12 })]
    const puntas = { desde: 0, hasta: 0.85 }
    const perfil = perfilDeLaCapa('piel', s, [], 60, puntas)
    expect(perfil(0.5).mas).toBeCloseTo(12, 5)
    expect(perfil(0.85).mas).toBe(0)
    expect(perfil(0.9).mas).toBe(0)
    expect(perfil(1).mas).toBe(0)
    // Y de la hoja a esa punta en arco, sin pasar de lo que la punta aguanta.
    const cerca = perfil(0.84).mas
    expect(cerca).toBeGreaterThan(0)
    expect(cerca).toBeLessThanOrEqual(PENDIENTE_MAXIMA_DEL_LABIO * 0.01 * 60 + 1e-9)
    // Con el trazo entero, como antes, en 0,9 todavía abría.
    expect(perfilDeLaCapa('piel', s, [], 60)(0.9).mas).toBeGreaterThan(2)
  })

  it('una grieta sin largo no abre nada, ni con la hoja encima', () => {
    const perfil = perfilDeLaCapa('piel', [separador({ posicion: 0.5, aperturaMm: 12 })], [], 60, { desde: 0.5, hasta: 0.5 })
    for (const t of [0.3, 0.5, 0.7]) expect(perfil(t)).toEqual({ mas: 0, menos: 0 })
    const abierta = puntasDeLaGrieta({ desde: 0.5, hasta: 0.5, cerradaAlInicio: false, cerradaAlFinal: false })
    expect(perfilDeLaCapa('piel', [separador({ posicion: 0.5, aperturaMm: 12 })], [], 60, abierta)(0.5).mas).toBe(0)
  })

  it('una hoja que cae del todo fuera de la grieta de la malla no la abre (P-015)', () => {
    // El sóleo del caso 4 se partió solo de 0,06 a 0,20 del trazo; los Farabeuf, en 0,64, lo abrían 4 mm en su punta.
    const puntas = { desde: 0.06, hasta: 0.2 }
    const lejos = perfilDeLaCapa('musculo', [separador({ plano: 'musculo', posicion: 0.64, aperturaMm: 14 })], [], 60, puntas)
    for (const t of [0.07, 0.13, 0.19]) expect(lejos(t).mas).toBe(0)
    // Dentro, abre.
    const dentro = perfilDeLaCapa('musculo', [separador({ plano: 'musculo', posicion: 0.13, aperturaMm: 4 })], [], 60, puntas)
    expect(dentro(0.13).mas).toBeGreaterThan(0)
  })

  // Las puntas de la herida de cada malla salen de su grieta (P-015).
  it('una punta cerrada se queda donde acaba la grieta; por una abierta vale el trazo entero', () => {
    expect(puntasDeLaGrieta({ desde: 0.1, hasta: 0.85, cerradaAlInicio: true, cerradaAlFinal: true })).toEqual({ desde: 0.1, hasta: 0.85 })
    expect(puntasDeLaGrieta({ desde: 0.1, hasta: 0.85, cerradaAlInicio: false, cerradaAlFinal: true })).toEqual({ desde: 0, hasta: 0.85 })
    expect(puntasDeLaGrieta({ desde: 0.4, hasta: 0.45, cerradaAlInicio: false, cerradaAlFinal: false })).toEqual({ desde: 0, hasta: 1 })
  })

  // En el extremo que da a otra incisión, cada labio tiene sus puntas (D-420).
  describe('las puntas de cada labio en el cruce con otra incisión', () => {
    // La pierna de una L de 31 mm: nace en la primera, con su grieta desde que cruza la de ella, a un milímetro.
    const grieta = { desde: 1 / 31, hasta: 0.97, cerradaAlInicio: false, cerradaAlFinal: true }
    const cruces = (detras = 0) => ({ alInicio: { mas: { partida: 91, detras }, menos: { partida: 3, detras: 0 } } })
    const enLaPierna = [separador({ lado: 1, posicion: 0.5, aperturaMm: 14 }), separador({ id: 2, lado: -1, posicion: 0.5, aperturaMm: 14 })]
    const junto = grieta.desde + 0.01

    it('sin cruces son las de la grieta', () => {
      expect(puntasDeLosLabios(grieta, undefined, 10, 31)).toEqual(puntasDeLaGrieta(grieta))
      expect(puntasDeLosLabios({ ...grieta, cerradaAlInicio: true }, cruces(), 10, 31)).toEqual(puntasDeLaGrieta({ ...grieta, cerradaAlInicio: true }))
    })

    it('el labio que da a un tramo largo de la otra llega suelto al cruce; el que da a su punta se cierra en la grieta', () => {
      const perfil = perfilDeLaCapa('piel', enLaPierna, [], 31, puntasDeLosLabios(grieta, cruces(), 10, 31))
      // Con las puntas de la grieta, los dos subían desde la punta del trazo con la pendiente de una punta.
      const antes = perfilDeLaCapa('piel', enLaPierna, [], 31, puntasDeLaGrieta(grieta))
      expect(antes(junto).mas).toBeLessThan(4)
      expect(antes(junto).menos).toBeLessThan(4)
      expect(perfil(junto).mas).toBeGreaterThan(13)
      expect(perfil(junto).menos).toBeLessThan(antes(junto).menos * 0.6)
    })

    it('suelto a medias, la punta de su cuerda queda donde estaba: en la del trazo', () => {
      // A 5 mm de la punta de la otra, con 10 de fundido, el labio está suelto a medias (`solturaDelLabio`).
      const puntas = puntasDeLosLabios(grieta, { alInicio: { mas: { partida: 5, detras: 0 }, menos: { partida: 5, detras: 0 } } }, 10, 31)
      expect(puntas.porLabio?.mas.desde).toBeCloseTo(0, 6)
      expect(puntas.porLabio?.menos.desde).toBeCloseTo(0, 6)
    })

    it('el brazo en sesgo no suelta del todo el labio que deja piel detrás de su arranque', () => {
      const deFrente = perfilDeLaCapa('piel', enLaPierna, [], 31, puntasDeLosLabios(grieta, cruces(0), 10, 31))(junto).mas
      const enSesgo = perfilDeLaCapa('piel', enLaPierna, [], 31, puntasDeLosLabios(grieta, cruces(Math.SQRT1_2), 10, 31))(junto).mas
      const cerrado = perfilDeLaCapa('piel', enLaPierna, [], 31, puntasDeLosLabios(grieta, cruces(), 10, 31))(junto).menos
      expect(enSesgo).toBeLessThan(deFrente - 3)
      expect(enSesgo).toBeGreaterThan(cerrado)
    })
  })

  it('el vaso cortado de lado a lado, sin nada que lo sujete, se aparta entero aunque su grieta sea corta', () => {
    // La vena tibial del caso 4: 2 mm de grieta, cruzada en sesgo. Con el perfil cerrándose junto a ella, cambiaba
    // dentro del propio vaso y lo cizallaba.
    const puntas = puntasDeLaGrieta({ desde: 0.4, hasta: 0.43, cerradaAlInicio: false, cerradaAlFinal: false })
    const perfil = perfilDeLaCapa('musculo', [separador({ plano: 'musculo', posicion: 0.5, aperturaMm: 12 })], [], 60, puntas)
    const enElVaso = [0.36, 0.4, 0.415, 0.43, 0.47].map((t) => perfil(t).mas)
    for (const mm of enElVaso) expect(mm).toBeCloseTo(enElVaso[0], 0)
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

  it('es unitario y va tendido, a 75° de la normal: despeja el campo (P-008)', () => {
    const v = direccionDelMango(normal, direccion, 1)
    expect(Math.hypot(...v)).toBeCloseTo(1, 10)
    expect((Math.acos(v[2]) * 180) / Math.PI).toBeCloseTo(75, 6)
  })

  it('el del Hohmann en el hueso conserva sus 40°: la báscula lo tumba después', () => {
    const v = direccionDelMango(normal, direccion, 1, ANGULO_DEL_MANGO_DE_LA_PALANCA_GRADOS)
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

describe('cada separador y cada pinza abren su incisión (P-003 E4)', () => {
  it('se quedan los de esa incisión y los que todavía no son de ninguna', () => {
    const lista = [separador({ id: 1, incision: 1 }), separador({ id: 2, incision: 2 }), separador({ id: 3 })]
    expect(deLaIncision(lista, 1).map((s) => s.id)).toEqual([1, 3])
    expect(deLaIncision(lista, 2).map((s) => s.id)).toEqual([2, 3])
    expect(deLaIncision(lista, 9).map((s) => s.id)).toEqual([3])
  })

  it('con dos incisiones en la misma capa, el separador de una no abre la otra', () => {
    const a = separador({ id: 1, incision: 1, aperturaMm: 20 })
    const b = separador({ id: 2, incision: 2, aperturaMm: 8 })
    const deLaPrimera = aperturaDeLaCapa('piel', 0.5, deLaIncision([a, b], 1))
    const deLaSegunda = aperturaDeLaCapa('piel', 0.5, deLaIncision([a, b], 2))
    expect(deLaPrimera.mas).toBeCloseTo(20, 5)
    expect(deLaSegunda.mas).toBeCloseTo(8, 5)
  })
})

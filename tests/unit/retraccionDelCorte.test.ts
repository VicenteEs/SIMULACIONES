import { describe, expect, it } from 'vitest'
import {
  PENDIENTE_MAXIMA_EN_LA_PUNTA,
  PUNTA_DEL_HUSO_MM,
  RETRACCION_DE_LA_FASCIA,
  RETRACCION_DE_LA_PIEL,
  RETRACCION_DEL_MUSCULO_A_LO_LARGO,
  RETRACCION_DEL_MUSCULO_A_TRAVES,
  avanceDeLaRetraccion,
  cuantoCruzaLasFibras,
  puntaDelHuso,
  retraccionDelLabioMm,
  topeDeLaRetraccionMm,
} from '@/lib/retraccionDelCorte'
import {
  abrirHerida,
  afinarLaFranja,
  componerCortes,
  cortarMalla,
  huso,
  husoDeLaGrieta,
  prepararIncision,
  retraccionDelVertice,
  type IncisionSobreLaMalla,
  type MallaPlana,
  type Vec3,
} from '@/lib/corteDeMalla'

/**
 * Lo que una herida se abre sola al cortarla, y la malla afinada con que se dobla (P-015).
 *
 * Pedido del dueño: «cuando se corta la piel no parece un corte limpio sino que parece cristal; quiero que cuando se
 * corte piel, fascias, músculos se puedan retraer como en la realidad». Antes de esto un corte dejaba los labios
 * pegados; aquí se fija cuánto se apartan, con qué forma, y que la malla tenga con qué curvarse.
 */

describe('cuánto se retrae cada tejido', () => {
  it('la piel es la que más se abre, y crece con el largo hasta su tope', () => {
    expect(retraccionDelLabioMm('piel', 10)).toBeCloseTo(0.7, 6)
    expect(retraccionDelLabioMm('piel', 30)).toBeCloseTo(2.1, 6)
    // Una incisión de abordaje de 5 cm: 3,5 mm por labio, un ojal de 7.
    expect(retraccionDelLabioMm('piel', 50)).toBeCloseTo(RETRACCION_DE_LA_PIEL.topeMm, 6)
    expect(retraccionDelLabioMm('piel', 200)).toBe(RETRACCION_DE_LA_PIEL.topeMm)
  })

  it('la fascia se abre menos que la piel, y el músculo abierto a lo largo menos que la fascia: la herida es una escalera', () => {
    for (const largo of [8, 20, 50, 120]) {
      const piel = retraccionDelLabioMm('piel', largo)
      const fascia = retraccionDelLabioMm('fascia', largo)
      const musculo = retraccionDelLabioMm('musculo', largo, 0)
      expect(fascia).toBeLessThan(piel)
      expect(musculo).toBeLessThan(fascia)
      expect(musculo).toBeGreaterThan(0)
    }
    expect(retraccionDelLabioMm('fascia', 100)).toBe(RETRACCION_DE_LA_FASCIA.topeMm)
  })

  it('el músculo cortado a través se retrae de verdad: sus fibras partidas se encogen', () => {
    const aLoLargo = retraccionDelLabioMm('musculo', 60, 0)
    const aTraves = retraccionDelLabioMm('musculo', 60, 1)
    expect(aLoLargo).toBe(RETRACCION_DEL_MUSCULO_A_LO_LARGO.topeMm)
    expect(aTraves).toBe(RETRACCION_DEL_MUSCULO_A_TRAVES.topeMm)
    expect(aTraves).toBeGreaterThan(3 * aLoLargo)
    // En diagonal queda entre los dos, y lo que cruza de más o de menos no se sale del rango.
    const enDiagonal = retraccionDelLabioMm('musculo', 60, 0.5)
    expect(enDiagonal).toBeGreaterThan(aLoLargo)
    expect(enDiagonal).toBeLessThan(aTraves)
    expect(retraccionDelLabioMm('musculo', 60, 7)).toBe(aTraves)
    expect(retraccionDelLabioMm('musculo', 60, -2)).toBe(aLoLargo)
    // En la piel y en la fascia no cuenta cómo cruce nada.
    expect(retraccionDelLabioMm('piel', 60, 1)).toBe(retraccionDelLabioMm('piel', 60, 0))
  })

  it('una incisión sin largo no se abre', () => {
    expect(retraccionDelLabioMm('piel', 0)).toBe(0)
    expect(retraccionDelLabioMm('musculo', -3, 1)).toBe(0)
    expect(retraccionDelLabioMm('fascia', Number.NaN)).toBe(0)
  })
})

describe('cuánto cruza el trazo las fibras', () => {
  it('a lo largo no las cruza, en ángulo recto las cruza del todo, y a 45° la mitad', () => {
    expect(cuantoCruzaLasFibras([0, 3, 0], [0, 1, 0])).toBeCloseTo(0, 9)
    expect(cuantoCruzaLasFibras([5, 0, 0], [0, 1, 0])).toBeCloseTo(1, 9)
    expect(cuantoCruzaLasFibras([1, 1, 0], [0, 1, 0])).toBeCloseTo(0.5, 9)
  })

  it('el eje de un músculo no tiene delante ni detrás: en un sentido o en el otro da lo mismo', () => {
    expect(cuantoCruzaLasFibras([1, 2, 0.5], [0, -1, 0])).toBeCloseTo(cuantoCruzaLasFibras([1, 2, 0.5], [0, 1, 0]), 9)
    expect(cuantoCruzaLasFibras([-1, -2, -0.5], [0, 1, 0])).toBeCloseTo(cuantoCruzaLasFibras([1, 2, 0.5], [0, 1, 0]), 9)
  })

  it('sin trazo o sin eje no cruza nada, y no da un número roto', () => {
    expect(cuantoCruzaLasFibras([0, 0, 0], [0, 1, 0])).toBe(0)
    expect(cuantoCruzaLasFibras([1, 0, 0], [0, 0, 0])).toBe(0)
  })
})

describe('el huso: la forma de la herida que se abre sola', () => {
  it('cerrada en las dos puntas, abierta del todo en el medio, y simétrica', () => {
    expect(huso(0)).toBe(0)
    expect(huso(1)).toBe(0)
    expect(huso(0.5)).toBe(1)
    for (const t of [0.05, 0.2, 0.37]) expect(huso(t)).toBeCloseTo(huso(1 - t), 12)
  })

  it('es un arco y no un rombo: a un cuarto del largo lleva ya tres cuartos de lo que abre', () => {
    expect(huso(0.25)).toBeCloseTo(0.75, 12)
    // Y crece sin parar hasta el medio, cada vez más despacio: llega sin esquina.
    let antes = 0
    let pasoAnterior = Infinity
    for (let k = 1; k <= 50; k++) {
      const ahora = huso(k / 100)
      expect(ahora).toBeGreaterThan(antes)
      expect(ahora - antes).toBeLessThan(pasoAnterior + 1e-12)
      pasoAnterior = ahora - antes
      antes = ahora
    }
  })

  it('una incisión larga abre pareja en el medio y solo se cierra cerca de las puntas', () => {
    // 150 mm: cada punta se cierra en sus últimos 30, que es un quinto del largo.
    const punta = puntaDelHuso(150)
    expect(punta).toBeCloseTo(PUNTA_DEL_HUSO_MM / 150, 12)
    expect(huso(0.2, punta)).toBe(1)
    expect(huso(0.5, punta)).toBe(1)
    expect(huso(0.8, punta)).toBe(1)
    expect(huso(0.1, punta)).toBeCloseTo(0.75, 12)
    // Hasta 60 mm es un solo arco de punta a punta.
    expect(puntaDelHuso(60)).toBe(0.5)
    expect(puntaDelHuso(20)).toBe(0.5)
    expect(puntaDelHuso(0)).toBe(0.5)
  })

  it('lo que aguanta una grieta: una de un milímetro no se abre como la incisión de cuatro centímetros que la hizo', () => {
    // La vena del caso 4: el trazo de 39 mm la cruzaba de través y pedía 4,7 mm; su grieta medía uno.
    expect(topeDeLaRetraccionMm(1, true)).toBeCloseTo(1 / 6, 12)
    expect(topeDeLaRetraccionMm(1, true)).toBeLessThan(retraccionDelLabioMm('musculo', 39, 1))
    // En una incisión corriente el tope queda lejos de lo que piden las reglas: la piel y su fascia se abren igual.
    for (const largo of [10, 30, 60, 150]) {
      expect(topeDeLaRetraccionMm(largo, true)).toBeGreaterThan(retraccionDelLabioMm('piel', largo))
      expect(topeDeLaRetraccionMm(largo, true)).toBeGreaterThan(retraccionDelLabioMm('musculo', largo, 1))
    }
    // Más allá de 60 mm el tramo de la punta es fijo, y el tope también.
    expect(topeDeLaRetraccionMm(150, true)).toBeCloseTo((PENDIENTE_MAXIMA_EN_LA_PUNTA * PUNTA_DEL_HUSO_MM) / 2, 12)
    // Partida de lado a lado no tiene punta que la cierre: sin tope.
    expect(topeDeLaRetraccionMm(1, false)).toBe(Infinity)
    expect(topeDeLaRetraccionMm(0, true)).toBe(0)
    expect(topeDeLaRetraccionMm(Number.NaN, true)).toBe(0)
  })

  it('con el tope, la pendiente del huso en la punta no pasa de la que se permite', () => {
    for (const largo of [0.8, 3, 12, 45, 200]) {
      const tope = topeDeLaRetraccionMm(largo, true)
      const punta = puntaDelHuso(largo)
      // El primer milímetro de cada punta, en pasos de una centésima: lo más que crece la retracción por milímetro.
      let mayor = 0
      const paso = 0.01 / largo
      for (let x = 0; x < Math.min(1, 1 / largo); x += paso) {
        mayor = Math.max(mayor, ((huso(x + paso, punta) - huso(x, punta)) * tope) / (paso * largo))
      }
      expect(mayor).toBeLessThanOrEqual(PENDIENTE_MAXIMA_EN_LA_PUNTA + 1e-6)
    }
  })

  it('una posición fuera de la herida no abre, ni una punta absurda rompe la cuenta', () => {
    expect(huso(-0.3)).toBe(0)
    expect(huso(1.4)).toBe(0)
    expect(Number.isFinite(huso(0.5, 0))).toBe(true)
    expect(huso(0.5, 9)).toBe(1)
  })

  it('se mide a lo largo de la grieta, que acaba antes que el trazo, y fuera de ella no abre', () => {
    const grieta = { desde: 0.1, hasta: 0.9, cerradaAlInicio: true, cerradaAlFinal: true }
    expect(husoDeLaGrieta(grieta, 0.1)).toBe(0)
    expect(husoDeLaGrieta(grieta, 0.9)).toBe(0)
    expect(husoDeLaGrieta(grieta, 0.5)).toBe(1)
    // A un cuarto de la grieta, que es el 0,3 del trazo.
    expect(husoDeLaGrieta(grieta, 0.3)).toBeCloseTo(0.75, 12)
    expect(husoDeLaGrieta(grieta, 0.05)).toBe(0)
    expect(husoDeLaGrieta(grieta, 0.97)).toBe(0)
    // Con las dos puntas cerradas y la grieta de punta a punta del trazo, es el huso sin más.
    const entera = { desde: 0, hasta: 1, cerradaAlInicio: true, cerradaAlFinal: true }
    for (const t of [0, 0.1, 0.33, 0.5, 0.8, 1]) {
      expect(husoDeLaGrieta(entera, t)).toBeCloseTo(huso(t), 12)
      expect(husoDeLaGrieta(entera, t, 0.2)).toBeCloseTo(huso(t, 0.2), 12)
    }
  })

  it('por el extremo en que la grieta llega al borde de la malla no se cierra', () => {
    const alBorde = { desde: 0, hasta: 0.8, cerradaAlInicio: false, cerradaAlFinal: true }
    expect(husoDeLaGrieta(alBorde, 0)).toBe(1)
    expect(husoDeLaGrieta(alBorde, 0.3)).toBe(1)
    expect(husoDeLaGrieta(alBorde, 0.8)).toBe(0)
    // A un cuarto de la grieta de su única punta: tres cuartos, como en la otra.
    expect(husoDeLaGrieta(alBorde, 0.6)).toBeCloseTo(0.75, 12)
    // Una lámina partida de lado a lado se abre pareja.
    const partida = { desde: 0, hasta: 1, cerradaAlInicio: false, cerradaAlFinal: false }
    for (const t of [0, 0.5, 1]) expect(husoDeLaGrieta(partida, t)).toBe(1)
    // Y una grieta sin largo no abre.
    expect(husoDeLaGrieta({ desde: 0.4, hasta: 0.4, cerradaAlInicio: true, cerradaAlFinal: true }, 0.4)).toBe(0)
  })

  it('la herida se abre deprisa al soltarse y frenando: a un tercio del rato lleva más de dos tercios', () => {
    expect(avanceDeLaRetraccion(0)).toBe(0)
    expect(avanceDeLaRetraccion(1)).toBe(1)
    expect(avanceDeLaRetraccion(1 / 3)).toBeGreaterThan(2 / 3)
    expect(avanceDeLaRetraccion(-1)).toBe(0)
    expect(avanceDeLaRetraccion(4)).toBe(1)
  })
})

// ------------------------------------------------------------------ la malla

function rejilla(n: number, lado: number, z = 0): MallaPlana {
  const posiciones = new Float32Array(n * n * 3)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = 3 * (j * n + i)
      posiciones[k] = (i * lado) / (n - 1)
      posiciones[k + 1] = (j * lado) / (n - 1)
      posiciones[k + 2] = z
    }
  }
  const indices: number[] = []
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i
      const b = a + 1
      const c = a + n
      const d = c + 1
      indices.push(a, b, d, a, d, c)
    }
  }
  return { posiciones, indices: Uint32Array.from(indices) }
}

const area = (m: MallaPlana, posiciones = m.posiciones) => {
  let total = 0
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [posiciones[3 * i], posiciones[3 * i + 1], posiciones[3 * i + 2]])
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    total += 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
  }
  return total
}

/** Cuántos triángulos comparten cada arista. */
const usoDeLasAristas = (m: MallaPlana) => {
  const cuenta = new Map<string, number>()
  for (let t = 0; t < m.indices.length; t += 3) {
    for (const [x, y] of [[m.indices[t], m.indices[t + 1]], [m.indices[t + 1], m.indices[t + 2]], [m.indices[t + 2], m.indices[t]]]) {
      const clave = x < y ? `${x}-${y}` : `${y}-${x}`
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)
    }
  }
  return cuenta
}
const aristasDeBorde = (m: MallaPlana) => [...usoDeLasAristas(m).values()].filter((v) => v === 1).length

const largoDeLaArista = (p: Float32Array, a: number, b: number) => Math.hypot(p[3 * a] - p[3 * b], p[3 * a + 1] - p[3 * b + 1], p[3 * a + 2] - p[3 * b + 2])

const incisionRecta = (de: number, a: number, y: number, paso = 0.5): IncisionSobreLaMalla => {
  const puntos: Vec3[] = []
  const normales: Vec3[] = []
  for (let x = de; x <= a + 1e-9; x += paso) {
    puntos.push([x, y, 0])
    normales.push([0, 0, 1])
  }
  return { puntos, normales }
}

/** Triángulos que al abrir quedaron del revés, mirados desde arriba. */
const invertidos = (m: MallaPlana, antes: Float32Array, despues: Float32Array) => {
  let n = 0
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]]
    const orientacion = (p: Float32Array) => (p[3 * b] - p[3 * a]) * (p[3 * c + 1] - p[3 * a + 1]) - (p[3 * b + 1] - p[3 * a + 1]) * (p[3 * c] - p[3 * a])
    if (orientacion(antes) > 0 && orientacion(despues) <= 0) n++
  }
  return n
}

describe('afinarLaFranja: la malla se afina alrededor de la incisión', () => {
  // Una «fascia» de 100 mm con triángulos de 12,5: como la del atlas, que los trae de uno a cinco centímetros.
  const gruesa = rejilla(9, 100)
  const incision = incisionRecta(30, 70, 50.7, 2)
  const curva = prepararIncision(incision, 0.01)!
  const opciones = { arista: 3, banda: 30, margen: 40 }

  it('pegadas a la incisión no quedan aristas largas, y lejos de ella la malla sigue como estaba', () => {
    const { malla } = afinarLaFranja(gruesa, curva, opciones)
    let mayorJuntoAlCorte = 0
    let largasLejos = 0
    for (let t = 0; t < malla.indices.length; t += 3) {
      const ids = [malla.indices[t], malla.indices[t + 1], malla.indices[t + 2]]
      const centro = [0, 1].map((k) => (malla.posiciones[3 * ids[0] + k] + malla.posiciones[3 * ids[1] + k] + malla.posiciones[3 * ids[2] + k]) / 3)
      const mayor = Math.max(largoDeLaArista(malla.posiciones, ids[0], ids[1]), largoDeLaArista(malla.posiciones, ids[1], ids[2]), largoDeLaArista(malla.posiciones, ids[2], ids[0]))
      const alCorte = Math.hypot(Math.max(0, 30 - centro[0], centro[0] - 70), centro[1] - 50.7)
      if (alCorte < 2) mayorJuntoAlCorte = Math.max(mayorJuntoAlCorte, mayor)
      if (alCorte > 45 && mayor > 12) largasLejos++
    }
    // Junto al labio, la medida pedida y lo poco que deja crecer la pendiente en dos milímetros.
    expect(mayorJuntoAlCorte).toBeLessThanOrEqual(3 + 0.25 * 4)
    expect(mayorJuntoAlCorte).toBeGreaterThan(0)
    // Las esquinas de la lámina, a más de 45 mm, conservan sus triángulos de 12,5.
    expect(largasLejos).toBeGreaterThan(0)
  })

  it('la superficie es la misma: los puntos nuevos caen sobre las aristas que había', () => {
    const { malla } = afinarLaFranja(gruesa, curva, opciones)
    expect(area(malla)).toBeCloseTo(area(gruesa), 3)
    for (let i = 0; i < malla.posiciones.length; i += 3) expect(malla.posiciones[i + 2]).toBe(0)
  })

  it('no abre grietas: ninguna arista queda con un vértice de otro triángulo apoyado en medio', () => {
    const { malla } = afinarLaFranja(gruesa, curva, opciones)
    // El borde de la lámina sigue siendo el único borde: cada arista de dentro la comparten dos triángulos, ni uno ni tres.
    const usos = [...usoDeLasAristas(malla).values()]
    expect(Math.max(...usos)).toBe(2)
    // Lo que mide el borde no cambia: los cuatro lados de la lámina, partidos o no, suman 400.
    let perimetro = 0
    for (const [clave, n] of usoDeLasAristas(malla)) {
      if (n !== 1) continue
      const [a, b] = clave.split('-').map(Number)
      perimetro += largoDeLaArista(malla.posiciones, a, b)
    }
    expect(perimetro).toBeCloseTo(400, 3)
  })

  it('los vértices que había conservan su índice y su sitio, y de cada nuevo se sabe de cuál sale', () => {
    const { malla, origen } = afinarLaFranja(gruesa, curva, opciones)
    const n = gruesa.posiciones.length / 3
    expect(malla.posiciones.length / 3).toBeGreaterThan(n)
    expect([...malla.posiciones.subarray(0, n * 3)]).toEqual([...gruesa.posiciones])
    expect(origen.length).toBe(malla.posiciones.length / 3)
    for (let i = 0; i < n; i++) expect(origen[i]).toBe(i)
    // El de cada nuevo es un vértice de la malla que entró, y uno de los que tenía cerca: es de quien copia el color.
    for (let i = n; i < origen.length; i++) {
      expect(origen[i]).toBeLessThan(n)
      expect(largoDeLaArista(malla.posiciones, i, origen[i])).toBeLessThanOrEqual(12.5 * Math.SQRT2 + 1e-6)
    }
  })

  it('más fina junto al corte que en el borde de la franja: no gasta vértices donde el tejido apenas se dobla', () => {
    const { malla } = afinarLaFranja(gruesa, curva, opciones)
    const media = (desde: number, hasta: number) => {
      let suma = 0
      let cuantas = 0
      for (let t = 0; t < malla.indices.length; t += 3) {
        const ids = [malla.indices[t], malla.indices[t + 1], malla.indices[t + 2]]
        const y = (malla.posiciones[3 * ids[0] + 1] + malla.posiciones[3 * ids[1] + 1] + malla.posiciones[3 * ids[2] + 1]) / 3
        const x = (malla.posiciones[3 * ids[0]] + malla.posiciones[3 * ids[1]] + malla.posiciones[3 * ids[2]]) / 3
        const d = Math.abs(y - 50.7)
        if (x < 35 || x > 65 || d < desde || d >= hasta) continue
        suma += largoDeLaArista(malla.posiciones, ids[0], ids[1])
        cuantas++
      }
      return suma / cuantas
    }
    expect(media(0, 5)).toBeLessThan(media(20, 28))
  })

  it('afinar dos veces lo mismo da lo mismo: la sesión guardada rehace el corte desde el trazo', () => {
    const una = afinarLaFranja(gruesa, curva, opciones)
    const otra = afinarLaFranja(gruesa, curva, opciones)
    expect([...una.malla.indices]).toEqual([...otra.malla.indices])
    expect([...una.malla.posiciones]).toEqual([...otra.malla.posiciones])
    expect([...una.origen]).toEqual([...otra.origen])
  })

  it('una malla que ya es fina, o una incisión que no pasa por ella, se quedan como estaban', () => {
    const fina = rejilla(51, 100)
    const igual = afinarLaFranja(fina, curva, opciones)
    expect(igual.malla.indices.length).toBe(fina.indices.length)
    expect(igual.malla.posiciones.length).toBe(fina.posiciones.length)
    const lejos = prepararIncision({ puntos: [[500, 500, 0], [540, 500, 0]], normales: [[0, 0, 1], [0, 0, 1]] }, 0.01)!
    const intacta = afinarLaFranja(gruesa, lejos, opciones)
    expect(intacta.malla).toBe(gruesa)
  })
})

describe('cortar con la franja afinada', () => {
  const gruesa = rejilla(9, 100)
  const incision = incisionRecta(30, 70, 50.7, 2)
  const OPCIONES = { profundidad: 10, alcance: 30, holgura: 30, pasoDelLabio: 2 }

  it('corta la misma superficie, con muchos más vértices con que doblarse, y la grieta llega hasta las puntas del trazo', () => {
    const sin = cortarMalla(gruesa, incision, OPCIONES)!
    const con = cortarMalla(gruesa, incision, { ...OPCIONES, afinar: 3 })!
    expect(area(con)).toBeCloseTo(area(gruesa), 3)
    expect(con.posiciones.length).toBeGreaterThan(sin.posiciones.length * 3)
    const extremos = (c: typeof con) => {
      const xs = [...c.labios.mas, ...c.labios.menos].map((i) => c.posiciones[3 * i])
      return [Math.min(...xs), Math.max(...xs)]
    }
    // Una grieta acaba en el último cruce del trazo con una arista. En la malla gruesa ese cruce queda a más de 7 mm
    // de cada punta del trazo —la herida salía un centímetro y medio más corta que lo que se había cortado—; afinada,
    // a menos de una de sus aristas.
    expect(extremos(sin)[0] - 30).toBeGreaterThan(7)
    expect(70 - extremos(sin)[1]).toBeGreaterThan(7)
    expect(extremos(con)[0] - 30).toBeLessThanOrEqual(3)
    expect(70 - extremos(con)[1]).toBeLessThanOrEqual(3)
    expect(extremos(con)[0]).toBeGreaterThanOrEqual(30 - 1e-6)
    expect(extremos(con)[1]).toBeLessThanOrEqual(70 + 1e-6)
    // Y sigue siendo una sola grieta: el borde de la lámina más los dos labios.
    expect(aristasDeBorde(con)).toBeGreaterThan(aristasDeBorde(gruesa))
  })

  it('de cada vértice se sigue sabiendo de cuál de la malla que entró sale, también de los de la franja', () => {
    const con = cortarMalla(gruesa, incision, { ...OPCIONES, afinar: 3 })!
    const n = gruesa.posiciones.length / 3
    expect(con.origen.length).toBe(con.posiciones.length / 3)
    for (let i = 0; i < n; i++) expect(con.origen[i]).toBe(i)
    for (let i = n; i < con.origen.length; i++) expect(con.origen[i]).toBeLessThan(n)
  })

  it('y de qué dos sale, y cuánto de cada uno: cada vértice nuevo está justo donde dice su mezcla', () => {
    for (const afinar of [undefined, 3]) {
      const corte = cortarMalla(gruesa, incision, { ...OPCIONES, afinar })!
      const n = gruesa.posiciones.length / 3
      const total = corte.posiciones.length / 3
      const { desde, de, peso } = corte.mezcla
      expect(desde).toBe(n)
      expect(de.length).toBe(2 * (total - n))
      expect(peso.length).toBe(total - n)
      for (let v = desde; v < total; v++) {
        const j = v - desde
        // Los dos son anteriores a él: recorriéndolos en orden, cada uno encuentra a los suyos ya resueltos.
        expect(de[2 * j]).toBeLessThan(v)
        expect(de[2 * j + 1]).toBeLessThan(v)
        expect(peso[j]).toBeGreaterThanOrEqual(0)
        expect(peso[j]).toBeLessThanOrEqual(1)
        for (let k = 0; k < 3; k++) {
          const a = corte.posiciones[3 * de[2 * j] + k]
          const b = corte.posiciones[3 * de[2 * j + 1] + k]
          expect(corte.posiciones[3 * v + k]).toBeCloseTo(a + (b - a) * peso[j], 3)
        }
      }
    }
  })

  it('abierta 14 mm por labio, el tejido se dobla en curva: ningún triángulo se da la vuelta', () => {
    const con = cortarMalla(gruesa, incision, { ...OPCIONES, afinar: 3 })!
    const abierta = abrirHerida(con, 14, 14)
    expect(invertidos(con, con.posiciones, abierta)).toBe(0)
    // Sin afinar, el abanico que sale de un vértice lejano es una sola faceta: entre el labio y ese vértice no hay nada
    // que pueda curvarse. Afinada, a medio camino hay vértices, y se han movido menos que el labio y más que nada.
    const aMedioCamino: number[] = []
    for (let i = 0; i < con.lado.length; i++) {
      const y = con.posiciones[3 * i + 1]
      const x = con.posiciones[3 * i]
      if (con.lado[i] > 0 && x > 45 && x < 55 && y - 50.7 > 8 && y - 50.7 < 12) aMedioCamino.push(abierta[3 * i + 1] - y)
    }
    expect(aMedioCamino.length).toBeGreaterThan(3)
    for (const d of aMedioCamino) {
      expect(d).toBeGreaterThan(1)
      expect(d).toBeLessThan(14)
    }
  })

  it('una segunda incisión sobre la malla ya afinada y cortada se compone con la primera', () => {
    const primera = cortarMalla(gruesa, incision, { ...OPCIONES, afinar: 3 })!
    const segunda = cortarMalla({ posiciones: primera.posiciones, indices: primera.indices }, incisionRecta(30, 70, 20.3, 2), { ...OPCIONES, afinar: 3 })!
    // Los vértices de la primera siguen en su sitio y con su índice.
    expect([...segunda.posiciones.subarray(0, primera.posiciones.length)]).toEqual([...primera.posiciones])
    const juntas = componerCortes([
      { corte: primera, apertura: { mas: 5, menos: 5 } },
      { corte: segunda, apertura: { mas: 3, menos: 3 } },
    ])
    expect(juntas.every((x) => Number.isFinite(x))).toBe(true)
    expect(invertidos(segunda, segunda.posiciones, juntas)).toBe(0)
  })

  it('los vértices que la segunda incisión añade donde la primera arrastra van adonde los lleva su triángulo', () => {
    // La primera, abierta 14 mm por labio; la segunda, a 30 mm, afina la franja que llega hasta ella y no se abre.
    const primera = cortarMalla(gruesa, incision, { ...OPCIONES, afinar: 3 })!
    const segunda = cortarMalla({ posiciones: primera.posiciones, indices: primera.indices }, incisionRecta(30, 70, 20.3, 2), { ...OPCIONES, afinar: 3 })!
    const nPrimera = primera.posiciones.length / 3
    const total = segunda.posiciones.length / 3
    expect(total).toBeGreaterThan(nPrimera)
    const sola = abrirHerida(primera, 14, 14)
    const juntas = componerCortes([
      { corte: primera, apertura: { mas: 14, menos: 14 } },
      { corte: segunda, apertura: { mas: 0, menos: 0 } },
    ])
    // Los que ya estaban, igual que con la primera sola.
    for (let i = 0; i < 3 * nPrimera; i++) expect(juntas[i]).toBeCloseTo(sola[i], 4)
    // Los nuevos, entre los dos de que salen: ninguno se queda atrás ni se adelanta a su arista.
    const { desde, de, peso } = segunda.mezcla
    let arrastrados = 0
    for (let v = desde; v < total; v++) {
      const j = v - desde
      for (let k = 0; k < 3; k++) {
        const a = juntas[3 * de[2 * j] + k]
        const b = juntas[3 * de[2 * j + 1] + k]
        expect(juntas[3 * v + k]).toBeCloseTo(a + (b - a) * peso[j], 3)
      }
      if (Math.abs(juntas[3 * v + 1] - segunda.posiciones[3 * v + 1]) > 0.5) arrastrados++
    }
    // Y no es una comprobación vacía: bastantes de los nuevos caen donde la primera herida mueve el tejido.
    expect(arrastrados).toBeGreaterThan(10)
    // Con la primera abierta 14 mm, que es lo que abre un separador, ningún triángulo queda del revés. Heredando el
    // arrastre de un solo extremo de su arista, como antes de P-015, quedaban decenas.
    expect(invertidos(segunda, segunda.posiciones, juntas)).toBe(0)
  })
})

describe('la herida que se abre sola', () => {
  const malla = rejilla(41, 40)
  const corte = cortarMalla(malla, incisionRecta(8, 32, 20.3), { profundidad: 4, alcance: 6, holgura: 4, pasoDelLabio: 1 })!
  const enElLabio = (lado: 'mas' | 'menos', t: number) => corte.labios[lado].reduce((m, i) => (Math.abs(corte.largoT[i] - t) < Math.abs(corte.largoT[m] - t) ? i : m))
  const separacion = (p: Float32Array, t: number) => p[3 * enElLabio('mas', t) + 1] - p[3 * enElLabio('menos', t) + 1]

  it('sin que nadie la abra, los labios se apartan lo que el tejido se retrae, en huso', () => {
    const sola = abrirHerida(corte, 0, 0, undefined, 1.5)
    // En el medio, lo de los dos labios; a un cuarto, tres cuartos.
    expect(separacion(sola, 0.5)).toBeCloseTo(3, 1)
    expect(separacion(sola, 0.25)).toBeCloseTo(3 * 0.75, 1)
    // Cada vértice de cada labio, lo que el huso dice de su sitio a lo largo, cada uno hacia su lado; junto a una punta
    // de la grieta, menos: ahí se cierra también por lo cerca que queda de ella (`retraccionDelVertice`).
    let lejosDeLasPuntas = 0
    for (const [lado, signo] of [['mas', 1], ['menos', -1]] as const) {
      expect(corte.labios[lado].length).toBeGreaterThan(20)
      for (const i of corte.labios[lado]) {
        expect(sola[3 * i + 1] - corte.posiciones[3 * i + 1]).toBeCloseTo(signo * retraccionDelVertice(corte, i, 1.5), 4)
        expect(sola[3 * i]).toBeCloseTo(corte.posiciones[3 * i], 4)
        const delHuso = 1.5 * husoDeLaGrieta(corte.grieta, corte.largoT[i])
        if (corte.hastaLaPunta.distancia[i] >= corte.hastaLaPunta.alcance) {
          expect(retraccionDelVertice(corte, i, 1.5)).toBeCloseTo(delHuso, 6)
          lejosDeLasPuntas++
        } else expect(retraccionDelVertice(corte, i, 1.5)).toBeLessThanOrEqual(delHuso + 1e-9)
      }
    }
    expect(lejosDeLasPuntas).toBeGreaterThan(20)
  })

  it('se cierra donde acaba la grieta, que es un poco antes de donde acaba el trazo: la herida termina en punta', () => {
    // La grieta acaba en el último cruce del trazo con una arista, dentro de la malla, en un vértice sencillo.
    expect(corte.grieta.cerradaAlInicio).toBe(true)
    expect(corte.grieta.cerradaAlFinal).toBe(true)
    expect(corte.grieta.desde).toBeGreaterThanOrEqual(0)
    expect(corte.grieta.desde).toBeLessThan(0.1)
    expect(corte.grieta.hasta).toBeGreaterThan(0.9)
    expect(corte.grieta.hasta).toBeLessThanOrEqual(1)
    const sola = abrirHerida(corte, 0, 0, undefined, 1.5)
    // El primer vértice de cada labio y el último están a un paso de la punta: se apartan una fracción de lo que abre
    // el medio. Con el huso repartido a lo largo del trazo, el de una grieta que acabara 3 mm antes que él se apartaba
    // ya un quinto: una cuña roma en vez de una punta.
    for (const lado of ['mas', 'menos'] as const) {
      const cadena = corte.labios[lado]
      for (const i of [cadena[0], cadena[cadena.length - 1]]) {
        expect(Math.abs(sola[3 * i + 1] - corte.posiciones[3 * i + 1])).toBeLessThan(0.3)
      }
    }
    // Y lo que el trazo recorrió sin llegar a partir no se aparta: ahí no hay herida.
    let fuera = 0
    for (let i = 0; i < corte.lado.length; i++) {
      const t = corte.largoT[i]
      if (corte.lado[i] === 0 || (t >= corte.grieta.desde && t <= corte.grieta.hasta)) continue
      fuera = Math.max(fuera, Math.abs(sola[3 * i + 1] - corte.posiciones[3 * i + 1]))
    }
    expect(fuera).toBe(0)
  })

  it('una grieta que llega al borde de la malla no se cierra por ese lado', () => {
    // El trazo empieza fuera de la lámina: la corta desde su borde.
    const desdeElBorde = cortarMalla(malla, incisionRecta(-5, 20, 20.3), { profundidad: 4, alcance: 6, holgura: 4, pasoDelLabio: 1 })!
    expect(desdeElBorde.grieta.cerradaAlInicio).toBe(false)
    expect(desdeElBorde.grieta.cerradaAlFinal).toBe(true)
    const sola = abrirHerida(desdeElBorde, 0, 0, undefined, 1.5)
    const enElBorde = (lado: 'mas' | 'menos') => desdeElBorde.labios[lado].reduce((m, i) => (desdeElBorde.posiciones[3 * i] < desdeElBorde.posiciones[3 * m] ? i : m))
    const mas = enElBorde('mas')
    const menos = enElBorde('menos')
    expect(desdeElBorde.posiciones[3 * mas]).toBeLessThan(0.5)
    // En el borde abre lo que en el medio: los dos labios, 3 mm.
    expect(sola[3 * mas + 1] - sola[3 * menos + 1]).toBeCloseTo(3, 1)
  })

  it('sin retracción, abrir sigue siendo exactamente lo de siempre', () => {
    expect([...abrirHerida(corte, 2, 1, undefined, 0)]).toEqual([...abrirHerida(corte, 2, 1)])
    expect([...abrirHerida(corte, 0, 0, undefined, 0)]).toEqual([...corte.posiciones])
  })

  it('lo que aparta una hoja se suma a lo que la herida ya se había abierto: no hay un tramo muerto de la rueda', () => {
    // Una hoja que sostiene el labio «más» a 6 de su reposo, en toda la herida menos las puntas.
    const perfil = (t: number) => ({ mas: 6 * huso(t), menos: 0 })
    const sola = abrirHerida(corte, 0, 0, undefined, 1.5)
    const conHoja = abrirHerida(corte, 0, 0, perfil, 1.5)
    const medioMas = enElLabio('mas', 0.5)
    const medioMenos = enElLabio('menos', 0.5)
    // El labio de la hoja está 6 más allá de donde descansaba; el de enfrente, donde descansaba.
    expect(conHoja[3 * medioMas + 1] - sola[3 * medioMas + 1]).toBeCloseTo(6, 2)
    expect(conHoja[3 * medioMenos + 1]).toBeCloseTo(sola[3 * medioMenos + 1], 6)
    // Y con un milímetro de hoja ya se mueve un milímetro: antes de sumar, hasta pasar del reposo no se movía nada.
    const unMilimetro = abrirHerida(corte, 0, 0, (t) => ({ mas: huso(t), menos: 0 }), 1.5)
    expect(unMilimetro[3 * medioMas + 1] - sola[3 * medioMas + 1]).toBeCloseTo(1, 2)
  })

  it('el tejido de al lado se arrastra con el labio y el lejano no se entera', () => {
    const sola = abrirHerida(corte, 0, 0, undefined, 1.5)
    let lejos = 0
    let cerca = 0
    for (let i = 0; i < malla.posiciones.length / 3; i++) {
      const d = Math.abs(corte.posiciones[3 * i + 1] - 20.3)
      const movido = Math.abs(sola[3 * i + 1] - corte.posiciones[3 * i + 1])
      const x = corte.posiciones[3 * i]
      if (d > 7) lejos = Math.max(lejos, movido)
      if (d < 2 && x > 16 && x < 24) cerca = Math.max(cerca, movido)
    }
    expect(lejos).toBe(0)
    expect(cerca).toBeGreaterThan(0.8)
    expect(cerca).toBeLessThanOrEqual(1.5 + 1e-6)
  })

  it('al abrirse sola ningún triángulo se da la vuelta, ni con la retracción del músculo cortado a través', () => {
    // Con el alcance del simulador (30 mm), como lo corta el lienzo: la piel, la fascia y lo más que da el músculo.
    const ancha = rejilla(61, 60)
    const comoEnElLienzo = cortarMalla(ancha, incisionRecta(10, 50, 30.3), { profundidad: 4, alcance: 30, holgura: 30, pasoDelLabio: 2 })!
    for (const reposo of [RETRACCION_DE_LA_PIEL.topeMm, RETRACCION_DE_LA_FASCIA.topeMm, RETRACCION_DEL_MUSCULO_A_TRAVES.topeMm]) {
      expect(invertidos(comoEnElLienzo, comoEnElLienzo.posiciones, abrirHerida(comoEnElLienzo, 0, 0, undefined, reposo))).toBe(0)
      // Y sumada a un separador abierto 12 mm por labio.
      expect(invertidos(comoEnElLienzo, comoEnElLienzo.posiciones, abrirHerida(comoEnElLienzo, 12, 12, undefined, reposo))).toBe(0)
    }
  })

  it('lo que el tejido tolera sin plegarse depende del alcance: lo que se aparta el labio no puede pasar de dos tercios de él', () => {
    // El arrastre cae de 1 a 0 a lo largo del alcance con una curva suave cuya pendiente máxima es 1,5/alcance. Si el
    // labio se aparta más de alcance/1,5, a medio camino un vértice adelanta al que tenía delante. Es el límite que
    // deja a la retracción dentro de lo seguro: 5 mm, como mucho, sobre 30 de alcance.
    expect(RETRACCION_DEL_MUSCULO_A_TRAVES.topeMm * 1.5).toBeLessThan(30 / 2)
    const estrecha = cortarMalla(malla, incisionRecta(8, 32, 20.3), { profundidad: 4, alcance: 6, holgura: 6, pasoDelLabio: 1 })!
    expect(invertidos(estrecha, estrecha.posiciones, abrirHerida(estrecha, 0, 0, undefined, 3.5))).toBe(0)
    expect(invertidos(estrecha, estrecha.posiciones, abrirHerida(estrecha, 0, 0, undefined, 5))).toBeGreaterThan(0)
  })

  it('en una herida larga, el tramo de las puntas se le dice aparte: en el medio abre pareja', () => {
    const conPunta = abrirHerida(corte, 0, 0, undefined, 1.5, 0.2)
    expect(separacion(conPunta, 0.3)).toBeCloseTo(3, 1)
    expect(separacion(conPunta, 0.5)).toBeCloseTo(3, 1)
    const cerca = enElLabio('mas', 0.1)
    expect(conPunta[3 * cerca + 1] - corte.posiciones[3 * cerca + 1]).toBeCloseTo(retraccionDelVertice(corte, cerca, 1.5, 0.2), 4)
    expect(husoDeLaGrieta(corte.grieta, corte.largoT[cerca], 0.2)).toBeGreaterThan(0.5)
    expect(husoDeLaGrieta(corte.grieta, corte.largoT[cerca], 0.2)).toBeLessThan(0.9)
  })

  it('componerCortes lo suma igual, y con una sola herida es abrirHerida', () => {
    const una = componerCortes([{ corte, apertura: { mas: 2, menos: 0, reposo: 1.5, punta: 0.3 } }])
    expect([...una]).toEqual([...abrirHerida(corte, 2, 0, undefined, 1.5, 0.3)])
  })
})

describe('hacia dónde se aparta el tejido, y dónde se cierra', () => {
  /**
   * Una incisión a lo largo de X que avanza en escalera: un milímetro y medio recto y un escalón corto en diagonal, una y
   * otra vez. Es lo que deja el bisturí hondo cuando el ratón salta de una superficie a otra: el lateral de cada nodo
   * promedia sus dos tramos, y donde uno es largo y el otro corto y torcido, el nodo queda torcido.
   */
  const enEscalera = (de: number, a: number, y: number, escalon: number): IncisionSobreLaMalla => {
    const puntos: Vec3[] = []
    const normales: Vec3[] = []
    let x = de
    let altura = y
    while (x <= a + 1e-9) {
      puntos.push([x, altura, 0])
      normales.push([0, 0, 1])
      x += 1.5
      if (x > a + 1e-9) break
      puntos.push([x, altura, 0])
      normales.push([0, 0, 1])
      x += 0.7
      altura += escalon
    }
    return { puntos, normales }
  }
  const angulo = (c: ReturnType<typeof cortarMalla> & object, i: number, j: number) =>
    Math.acos(Math.min(1, c.direccion[3 * i] * c.direccion[3 * j] + c.direccion[3 * i + 1] * c.direccion[3 * j + 1] + c.direccion[3 * i + 2] * c.direccion[3 * j + 2]))

  it('un trazo recto no cambia: el lateral suavizado es el de cada nodo', () => {
    const curva = prepararIncision(incisionRecta(8, 32, 20.3), 0.01, 10)!
    curva.laterales.forEach((l, k) => {
      for (let e = 0; e < 3; e++) expect(curva.lateralesSuaves[k][e]).toBeCloseTo(l[e], 9)
    })
    // Y sin suavizado, son una copia de los laterales.
    const sin = prepararIncision(incisionRecta(8, 32, 20.3), 0.01)!
    expect(sin.lateralesSuaves).toEqual(sin.laterales)
    expect(sin.lateralesSuaves[0]).not.toBe(sin.laterales[0])
  })

  it('un trazo en escalera aparta el tejido en una dirección que no quiebra, y no lo pliega', () => {
    // Cada escalón tuerce el lateral de sus nodos y lo devuelve en el siguiente tramo recto: es el quiebro de la vena
    // del caso 4, que retraída 4,7 mm volvía del revés sus triángulos de medio milímetro.
    const fina = rejilla(81, 40)
    const incision = enEscalera(8, 32, 18.3, 0.3)
    const curva = prepararIncision(incision, 0.6, 10)!
    let quiebroDelNodo = 0
    for (let k = 1; k < curva.laterales.length; k++) {
      const a = curva.laterales[k - 1]
      const b = curva.laterales[k]
      quiebroDelNodo = Math.max(quiebroDelNodo, Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
    }
    expect(quiebroDelNodo).toBeGreaterThan(0.15)
    const corte = cortarMalla(fina, incision, { profundidad: 4, alcance: 30, holgura: 30, pasoDelLabio: 1 })!
    const cadena = corte.labios.mas
    let quiebroDelLabio = 0
    for (let k = 1; k < cadena.length; k++) quiebroDelLabio = Math.max(quiebroDelLabio, angulo(corte, cadena[k - 1], cadena[k]))
    expect(quiebroDelLabio).toBeLessThan(0.05)
    expect(invertidos(corte, corte.posiciones, abrirHerida(corte, 0, 0, undefined, RETRACCION_DEL_MUSCULO_A_TRAVES.topeMm))).toBe(0)
  })

  it('dónde corta no depende de hacia dónde se aparta: los lados son los del lateral de cada nodo', () => {
    const fina = rejilla(81, 40)
    const incision = enEscalera(8, 32, 18.3, 0.3)
    const corte = cortarMalla(fina, incision, { profundidad: 4, alcance: 30, holgura: 30, pasoDelLabio: 1 })!
    const curva = prepararIncision(incision, 30 * 0.02)!
    for (let i = 0; i < fina.posiciones.length / 3; i++) {
      if (corte.lado[i] === 0) continue
      const p: Vec3 = [fina.posiciones[3 * i], fina.posiciones[3 * i + 1], fina.posiciones[3 * i + 2]]
      const lateral = (() => {
        let mejor = Infinity
        let lado = 0
        curva.tramos.forEach((tr, k) => {
          const w: Vec3 = [p[0] - tr.a[0], p[1] - tr.a[1], p[2] - tr.a[2]]
          const u = Math.min(1, Math.max(0, (w[0] * tr.d[0] + w[1] * tr.d[1] + w[2] * tr.d[2]) / tr.largo))
          const c: Vec3 = [tr.a[0] + tr.d[0] * u * tr.largo, tr.a[1] + tr.d[1] * u * tr.largo, tr.a[2]]
          const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])
          if (d >= mejor) return
          mejor = d
          const l = [0, 1, 2].map((e) => curva.laterales[k][e] * (1 - u) + curva.laterales[k + 1][e] * u)
          lado = (p[0] - c[0]) * l[0] + (p[1] - c[1]) * l[1] + (p[2] - c[2]) * l[2]
        })
        return lado
      })()
      if (Math.abs(lateral) > 1e-6) expect(corte.lado[i]).toBe(lateral > 0 ? 1 : -1)
    }
  })

  it('una grieta con una punta en medio de la malla se cierra junto a ella, y no solo en las puntas del trazo', () => {
    // Dos láminas, como las dos caras de un músculo: la de arriba, a la altura del trazo, se parte entera de x = 8 a 72;
    // la de abajo baja hacia x y sale de la hondura del corte en x = 40, a media grieta. Su punta queda donde el huso de
    // la grieta entera abre todo.
    const arriba = rejilla(81, 80)
    const abajo = rejilla(81, 80)
    for (let i = 0; i < abajo.posiciones.length / 3; i++) abajo.posiciones[3 * i + 2] = -1 - (3 / 32) * (abajo.posiciones[3 * i] - 8)
    const n = arriba.posiciones.length / 3
    const juntas: MallaPlana = {
      posiciones: Float32Array.from([...arriba.posiciones, ...abajo.posiciones]),
      indices: Uint32Array.from([...arriba.indices, ...[...abajo.indices].map((i) => i + n)]),
    }
    const corte = cortarMalla(juntas, incisionRecta(8, 72, 40.3), { profundidad: 4, alcance: 30, holgura: 30, pasoDelLabio: 1 })!
    expect(corte.grieta.cerradaAlInicio && corte.grieta.cerradaAlFinal).toBe(true)
    const deAbajo = (i: number) => corte.posiciones[3 * i + 2] < -0.5
    const labioDeAbajo = corte.labios.mas.filter(deAbajo)
    const labioDeArriba = corte.labios.mas.filter((i) => !deAbajo(i))
    const finDeAbajo = Math.max(...labioDeAbajo.map((i) => corte.posiciones[3 * i]))
    expect(finDeAbajo).toBeGreaterThan(38)
    expect(finDeAbajo).toBeLessThan(41)
    const cerca = (lista: number[], x: number) => lista.filter((i) => Math.abs(corte.posiciones[3 * i] - x) < 0.6)
    for (const reposo of [RETRACCION_DE_LA_PIEL.topeMm, RETRACCION_DEL_MUSCULO_A_TRAVES.topeMm]) {
      const sola = abrirHerida(corte, 0, 0, undefined, reposo)
      // Ninguna de las dos láminas se pliega: tampoco la de abajo, junto a su punta.
      expect(invertidos(corte, corte.posiciones, sola)).toBe(0)
      const movido = (i: number) => Math.abs(sola[3 * i + 1] - corte.posiciones[3 * i + 1])
      const delHuso = (i: number) => reposo * husoDeLaGrieta(corte.grieta, corte.largoT[i])
      // Junto a su punta, el labio de abajo apenas se mueve; a media grieta suya, se retrae de verdad.
      const junto = labioDeAbajo.filter((i) => corte.posiciones[3 * i] > finDeAbajo - 0.6)
      expect(junto.length).toBeGreaterThan(0)
      for (const i of junto) expect(movido(i)).toBeLessThan(0.15 * reposo)
      expect(Math.max(...cerca(labioDeAbajo, 24).map(movido))).toBeGreaterThan(0.5 * reposo)
      // La de arriba, donde no tiene ninguna punta a su alcance, abre lo que pide el huso.
      expect(cerca(labioDeArriba, 24).length).toBeGreaterThan(0)
      for (const i of cerca(labioDeArriba, 24)) expect(movido(i)).toBeCloseTo(delHuso(i), 3)
      // Y encima de lo que abajo quedó entero, a 5,5 mm, menos: el tejido sin cortar de debajo la sujeta. La distancia a
      // las puntas es en recto y no por la superficie, y en un músculo, que es macizo, eso es lo que pasa.
      expect(cerca(labioDeArriba, 56).length).toBeGreaterThan(0)
      for (const i of cerca(labioDeArriba, 56)) expect(movido(i)).toBeLessThan(delHuso(i) - 0.1 * reposo)
    }
  })
})

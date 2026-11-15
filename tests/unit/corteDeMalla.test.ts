import { describe, expect, it } from 'vitest'
import {
  ABANICO_DE_LOS_QUIEBRES,
  abrirHerida,
  cerrarLasPuntasConTejidoEntero,
  componerCortes,
  cortarMalla,
  proyectar,
  prepararIncision,
  type IncisionSobreLaMalla,
  type MallaPlana,
  type Vec3,
} from '@/lib/corteDeMalla'

/**
 * El corte de mallas de partes blandas (D-167).
 *
 * Se prueba sobre una malla plana de 21 × 21 vértices —una «piel» de 20 mm de
 * lado— y sobre un tubo, que es lo que de verdad es una pierna: el corte de
 * arriba no puede abrir la piel de abajo.
 */

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
    const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [
      posiciones[3 * i],
      posiciones[3 * i + 1],
      posiciones[3 * i + 2],
    ])
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    total += 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
  }
  return total
}

/** Aristas que pertenecen a un solo triángulo: el borde de la malla, y la grieta. */
const aristasDeBorde = (m: MallaPlana) => {
  const cuenta = new Map<string, number>()
  for (let t = 0; t < m.indices.length; t += 3) {
    for (const [x, y] of [
      [m.indices[t], m.indices[t + 1]],
      [m.indices[t + 1], m.indices[t + 2]],
      [m.indices[t + 2], m.indices[t]],
    ]) {
      const clave = x < y ? `${x}-${y}` : `${y}-${x}`
      cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1)
    }
  }
  return [...cuenta.values()].filter((v) => v === 1).length
}

const incisionRecta = (de: number, a: number, y: number): IncisionSobreLaMalla => {
  const puntos: Vec3[] = []
  const normales: Vec3[] = []
  for (let x = de; x <= a + 1e-9; x += 0.5) {
    puntos.push([x, y, 0])
    normales.push([0, 0, 1])
  }
  return { puntos, normales }
}

const OPCIONES = { profundidad: 4, alcance: 6, holgura: 4 }

describe('proyectar: dónde cae un punto respecto de la incisión', () => {
  const curva = prepararIncision(incisionRecta(5, 15, 10.3), 0.01)!

  it('da el lado y la distancia lateral', () => {
    const arriba = proyectar(curva, [10, 12.3, 0])
    const abajo = proyectar(curva, [10, 8.3, 0])
    expect(arriba.lateral).toBeCloseTo(2, 5)
    expect(abajo.lateral).toBeCloseTo(-2, 5)
    expect(arriba.t).toBeCloseTo(0.5, 2)
  })

  it('no considera «dentro» lo que queda antes del inicio o después del final', () => {
    expect(proyectar(curva, [2, 10.3, 0]).dentro).toBe(false)
    expect(proyectar(curva, [18, 10.3, 0]).dentro).toBe(false)
    expect(proyectar(curva, [8, 10.3, 0]).dentro).toBe(true)
  })

  it('mide la altura sobre la superficie', () => {
    expect(proyectar(curva, [10, 10.3, -3]).altura).toBeCloseTo(-3, 5)
  })
})

describe('cortarMalla', () => {
  const malla = rejilla(21, 20)

  it('una incisión que no toca la malla no la corta', () => {
    expect(cortarMalla(malla, incisionRecta(30, 40, 10.3), OPCIONES)).toBeNull()
  })

  it('conserva el área: el corte solo reparte la superficie, no la pierde', () => {
    const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!
    expect(corte).not.toBeNull()
    expect(area(corte, corte.posiciones)).toBeCloseTo(area(malla), 4)
  })

  it('abre una grieta: aparecen aristas de borde a lo largo de la herida', () => {
    const antes = aristasDeBorde(malla)
    const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!
    const despues = aristasDeBorde(corte)
    // La grieta tiene dos labios: cada tramo suma una arista por lado.
    expect(despues).toBeGreaterThan(antes + 8)
    expect(corte.labios.mas.length).toBeGreaterThanOrEqual(6)
    expect(corte.labios.mas.length).toBe(corte.labios.menos.length)
  })

  it('cada vértice de la herida se duplica: un labio por lado, en el mismo sitio', () => {
    const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!
    const [i, j] = [corte.labios.mas[2], corte.labios.menos[2]]
    expect(i).not.toBe(j)
    for (let k = 0; k < 3; k++) expect(corte.posiciones[3 * i + k]).toBeCloseTo(corte.posiciones[3 * j + k], 6)
  })

  it('no deja triángulos degenerados ni números rotos', () => {
    const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!
    expect([...corte.posiciones].every(Number.isFinite)).toBe(true)
    let minimo = Infinity
    for (let t = 0; t < corte.indices.length; t += 3) {
      const una = rejilla(2, 1)
      una.indices = Uint32Array.from([corte.indices[t], corte.indices[t + 1], corte.indices[t + 2]])
      minimo = Math.min(minimo, area({ ...una, posiciones: corte.posiciones }, corte.posiciones))
    }
    // Ninguna esquirla de área casi nula (el corte se aleja un 5 % de los vértices).
    expect(minimo).toBeGreaterThan(1e-3)
  })

  it('la herida acaba antes del borde de la malla: las puntas no se desgarran', () => {
    const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!
    // Ni el primero ni el último vértice del labio llegan a los extremos de la incisión.
    const xs = corte.labios.mas.map((i) => corte.posiciones[3 * i])
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(5 - 1)
    expect(Math.max(...xs)).toBeLessThanOrEqual(15 + 1)
  })

  it('con paso del labio, los labios tienen un vértice cada tanto y la superficie es la misma (P-008 E2)', () => {
    // La rejilla gruesa: triángulos de 5 mm, como los de la espinilla del atlas a otra escala.
    const gruesa = rejilla(5, 20)
    const sinPaso = cortarMalla(gruesa, incisionRecta(2, 18, 10.3), OPCIONES)!
    const conPaso = cortarMalla(gruesa, incisionRecta(2, 18, 10.3), { ...OPCIONES, pasoDelLabio: 1 })!
    expect(conPaso.labios.mas.length).toBeGreaterThan(sinPaso.labios.mas.length * 2)
    expect(conPaso.labios.mas.length).toBe(conPaso.labios.menos.length)
    expect(area(conPaso, conPaso.posiciones)).toBeCloseTo(area(gruesa), 4)
    // Entre dos vértices seguidos del labio, nunca más que el paso (con el margen de la diagonal del triángulo).
    const ts = conPaso.labios.mas.map((i) => conPaso.posiciones[3 * i])
    for (let k = 1; k < ts.length; k++) expect(Math.abs(ts[k] - ts[k - 1])).toBeLessThanOrEqual(1 + 1e-6)
  })

  it('con paso del labio, al abrir ningún triángulo se da la vuelta y el labio sigue al perfil donde apoya la hoja', () => {
    const gruesa = rejilla(5, 20)
    const corte = cortarMalla(gruesa, incisionRecta(2, 18, 10.3), { ...OPCIONES, pasoDelLabio: 1 })!
    // Una hoja de 4 mm en el medio que abre 3: la cuerda de `perfilDeLosSeparadores`, a mano.
    const perfil = (t: number) => {
      const mm = t < 0.375 ? (3 * t) / 0.375 : t > 0.625 ? (3 * (1 - t)) / 0.375 : 3
      return { mas: mm, menos: 0 }
    }
    const abierta = abrirHerida(corte, 0, 0, perfil)
    let invertidos = 0
    for (let t = 0; t < corte.indices.length; t += 3) {
      const [a, b, c] = [corte.indices[t], corte.indices[t + 1], corte.indices[t + 2]]
      const orientacion = (p: Float32Array) =>
        (p[3 * b] - p[3 * a]) * (p[3 * c + 1] - p[3 * a + 1]) - (p[3 * b + 1] - p[3 * a + 1]) * (p[3 * c] - p[3 * a])
      if (orientacion(corte.posiciones) > 0 && orientacion(abierta) < 0) invertidos++
    }
    expect(invertidos).toBe(0)
    // En el medio, el labio se apartó lo que dice el perfil, sin el estrechamiento de las puntas encima.
    const medio = corte.labios.mas.reduce((m, i) => (Math.abs(corte.largoT[i] - 0.5) < Math.abs(corte.largoT[m] - 0.5) ? i : m))
    const movido = Math.hypot(abierta[3 * medio] - corte.posiciones[3 * medio], abierta[3 * medio + 1] - corte.posiciones[3 * medio + 1])
    expect(movido).toBeCloseTo(3, 3)
  })

  it('una incisión curva también se corta, y sigue conservando el área', () => {
    const puntos: Vec3[] = []
    const normales: Vec3[] = []
    for (let a = 0; a <= 1; a += 0.04) {
      puntos.push([4 + a * 12, 10 + 3 * Math.sin(a * Math.PI), 0])
      normales.push([0, 0, 1])
    }
    const corte = cortarMalla(malla, { puntos, normales }, OPCIONES)!
    expect(corte).not.toBeNull()
    expect(area(corte, corte.posiciones)).toBeCloseTo(area(malla), 3)
    expect(corte.labios.mas.length).toBeGreaterThan(6)
  })
})

describe('abrirHerida', () => {
  const malla = rejilla(21, 20)
  const corte = cortarMalla(malla, incisionRecta(5, 15, 10.3), OPCIONES)!

  it('en reposo, no mueve nada', () => {
    const quieta = abrirHerida(corte, 0, 0)
    expect([...quieta]).toEqual([...corte.posiciones])
  })

  it('separa los dos labios tanto como se pide en el centro de la herida', () => {
    const abierta = abrirHerida(corte, 2, 2)
    const medio = Math.floor(corte.labios.mas.length / 2)
    const [i, j] = [corte.labios.mas[medio], corte.labios.menos[medio]]
    const separacion = Math.hypot(
      abierta[3 * i] - abierta[3 * j],
      abierta[3 * i + 1] - abierta[3 * j + 1],
      abierta[3 * i + 2] - abierta[3 * j + 2],
    )
    // El peso en el centro de una herida de 10 mm es 1: la separación es la suma de los dos labios.
    expect(separacion).toBeGreaterThan(3.2)
    expect(separacion).toBeLessThanOrEqual(4.0001)
  })

  it('un solo labio se mueve si solo se separa uno (un Farabeuf sostiene un borde)', () => {
    const abierta = abrirHerida(corte, 3, 0)
    const medio = Math.floor(corte.labios.mas.length / 2)
    const [i, j] = [corte.labios.mas[medio], corte.labios.menos[medio]]
    expect(Math.hypot(abierta[3 * j] - corte.posiciones[3 * j], abierta[3 * j + 1] - corte.posiciones[3 * j + 1])).toBeCloseTo(0, 6)
    expect(Math.abs(abierta[3 * i + 1] - corte.posiciones[3 * i + 1])).toBeGreaterThan(2)
  })

  it('cada vértice sabe dónde cae a lo largo de la incisión, de 0 a 1 y creciendo con la x', () => {
    expect(corte.largoT.length).toBe(corte.lado.length)
    const lista = corte.labios.mas
    const ts = lista.map((i) => corte.largoT[i])
    for (const t of ts) {
      expect(t).toBeGreaterThanOrEqual(0)
      expect(t).toBeLessThanOrEqual(1)
    }
    // La incisión de la prueba va de x = 5 a x = 15: el labio, ordenado de un extremo a otro, recorre ese rango.
    const x = lista.map((i) => corte.posiciones[3 * i])
    for (let k = 1; k < lista.length; k++) {
      expect(Math.sign(ts[k] - ts[k - 1])).toBe(Math.sign(x[k] - x[k - 1]) || 0)
    }
  })

  it('con perfil, la herida abre donde el perfil lo pide y se queda cerrada donde no (un separador puesto en un extremo)', () => {
    // Un separador colocado a un tercio: abre 3 mm hasta ahí y nada después.
    const abierta = abrirHerida(corte, 0, 0, (t) => (t < 0.4 ? { mas: 3, menos: 3 } : { mas: 0, menos: 0 }))
    const separacionEn = (t: number) => {
      const k = corte.labios.mas.reduce((mejor, i, idx) => (Math.abs(corte.largoT[i] - t) < Math.abs(corte.largoT[corte.labios.mas[mejor]] - t) ? idx : mejor), 0)
      const [i, j] = [corte.labios.mas[k], corte.labios.menos[k]]
      return Math.hypot(abierta[3 * i] - abierta[3 * j], abierta[3 * i + 1] - abierta[3 * j + 1])
    }
    expect(separacionEn(0.25)).toBeGreaterThan(separacionEn(0.9) + 1)
    // Y donde el perfil dice cero, los labios quedan juntos como estaban.
    const [i, j] = [corte.labios.mas.at(-1)!, corte.labios.menos.at(-1)!]
    const juntos = Math.hypot(corte.posiciones[3 * i] - corte.posiciones[3 * j], corte.posiciones[3 * i + 1] - corte.posiciones[3 * j + 1])
    expect(separacionEn(1)).toBeCloseTo(juntos, 3)
  })

  it('sin perfil, abrir sigue siendo igual a lo de siempre: el perfil es opcional', () => {
    const a = abrirHerida(corte, 2, 1)
    const b = abrirHerida(corte, 2, 1, undefined)
    expect([...a]).toEqual([...b])
  })

  it('con perfil, el peso ya no estrecha las puntas: lo hace el perfil (P-008 E2)', () => {
    const sinPerfil = abrirHerida(corte, 2, 1)
    const constante = abrirHerida(corte, 0, 0, () => ({ mas: 2, menos: 1 }))
    const movido = (p: Float32Array, i: number) => Math.abs(p[3 * i + 1] - corte.posiciones[3 * i + 1])
    // En el medio de la herida el estrechamiento casi no cuenta: los dos abren lo mismo.
    const medio = corte.labios.mas.reduce((m, i) => (Math.abs(corte.largoT[i] - 0.5) < Math.abs(corte.largoT[m] - 0.5) ? i : m))
    expect(movido(constante, medio)).toBeCloseTo(movido(sinPerfil, medio), 1)
    // Cerca de una punta, el perfil constante abre lo que dice: el peso ya no lo estrecha.
    const cerca = corte.labios.mas.reduce((m, i) => (corte.largoT[i] < corte.largoT[m] ? i : m))
    expect(movido(constante, cerca)).toBeCloseTo(2, 3)
    expect(movido(sinPerfil, cerca)).toBeLessThan(movido(constante, cerca))
  })

  it('el tejido lejano de la herida no se entera', () => {
    const abierta = abrirHerida(corte, 4, 4)
    // El vértice de la esquina (0,0) está a más de 10 mm del corte: no se mueve.
    expect(abierta[0]).toBe(corte.posiciones[0])
    expect(abierta[1]).toBe(corte.posiciones[1])
  })

  it('al abrir, ningún triángulo se da la vuelta', () => {
    const abierta = abrirHerida(corte, 3, 3)
    let invertidos = 0
    for (let t = 0; t < corte.indices.length; t += 3) {
      const [a, b, c] = [corte.indices[t], corte.indices[t + 1], corte.indices[t + 2]]
      const orientacion = (p: Float32Array) =>
        (p[3 * b] - p[3 * a]) * (p[3 * c + 1] - p[3 * a + 1]) - (p[3 * b + 1] - p[3 * a + 1]) * (p[3 * c] - p[3 * a])
      if (orientacion(corte.posiciones) > 0 && orientacion(abierta) < 0) invertidos++
    }
    expect(invertidos).toBe(0)
  })
})

describe('un trazo que sube un escalón por la pared de la herida (P-015)', () => {
  // Como el bisturí hondo del caso 4: el trazo corre por el fondo de la herida y trepa 11 mm por su pared. Al final del
  // trazo eso se recorta (ver «los saltos del cursor en las puntas»), pero en medio se queda: aquí el trazo sigue por
  // arriba 9 mm más. Bajo el fondo, a 10 mm, una lámina de músculo que sigue más allá del escalón.
  const lamina = rejilla(61, 60, -10)
  const trazo: IncisionSobreLaMalla = { puntos: [], normales: [] }
  for (let x = 5; x <= 30 + 1e-9; x += 0.5) {
    trazo.puntos.push([x, 30.3, 0])
    trazo.normales.push([0, 0, 1])
  }
  for (let x = 31; x <= 40 + 1e-9; x += 0.5) {
    trazo.puntos.push([x, 30.3, 11])
    trazo.normales.push([0, 0, 1])
  }
  const HONDO = { profundidad: 14, alcance: 6, holgura: 4 }
  const corte = cortarMalla(lamina, trazo, HONDO)!
  const xDe = (i: number) => corte.posiciones[3 * i]
  // Lo que llega el abanico a 10 mm de hondura: 10 · tan 30°. Escrito aparte, y no con la constante, para que la prueba
  // falle si el abanico se abre.
  const hastaElAbanico = 30 + 10 * Math.tan(Math.PI / 6)

  it('proyectar dice cuánto se sale el punto a lo largo: nada bajo el trazo, todo pasado el quiebre', () => {
    const curva = prepararIncision(trazo, 0.01)!
    expect(proyectar(curva, [20, 30.3, -10]).aLoLargo).toBeCloseTo(0, 6)
    const pasado = proyectar(curva, [42, 30.3, -10])
    // El punto más cercano del trazo es el quiebre, en x = 30: lo «dentro» no lo descarta.
    expect(pasado.dentro).toBe(true)
    expect(pasado.aLoLargo).toBeCloseTo(12, 1)
  })

  it('la lámina se corta bajo el trazo y no más allá del abanico del quiebre', () => {
    expect(corte).not.toBeNull()
    const labios = [...corte.labios.mas, ...corte.labios.menos]
    expect(Math.min(...labios.map(xDe))).toBeLessThan(6)
    // A 10 mm de hondura, el abanico llega a 5,8 mm del quiebre. Sin él, el corte seguía hasta el borde de la caja que
    // se mira, a 18 mm.
    expect(Math.max(...labios.map(xDe))).toBeLessThan(hastaElAbanico + 1)
    expect(ABANICO_DE_LOS_QUIEBRES).toBeCloseTo(Math.tan(Math.PI / 6), 9)
    expect(Math.max(...labios.map(xDe))).toBeGreaterThan(30)
  })

  it('al abrir, el músculo entero que sigue más allá del quiebre no se estira', () => {
    const abierta = abrirHerida(corte, 3, 3)
    let lejos = 0
    let enMedio = 0
    for (let i = 0; i < corte.lado.length; i++) {
      const movido = Math.hypot(abierta[3 * i] - corte.posiciones[3 * i], abierta[3 * i + 1] - corte.posiciones[3 * i + 1], abierta[3 * i + 2] - corte.posiciones[3 * i + 2])
      if (xDe(i) > hastaElAbanico + HONDO.alcance) lejos = Math.max(lejos, movido)
      if (Math.abs(xDe(i) - 17) < 1) enMedio = Math.max(enMedio, movido)
    }
    // Lo cortado se aparta (a un cuarto del trazo, la mitad de los 3 mm: el afilado de las puntas).
    expect(enMedio).toBeGreaterThan(1)
    expect(lejos).toBe(0)
  })
})

describe('un plano hondo se aparta paralelo a la piel de encima (P-015)', () => {
  // Sobre la cresta de la tibia del caso 4 la fascia crural va a 30° de la piel y casi pegada a ella: apartada por su
  // propia tangente, su labio abierto 12 mm subía 6 por encima de la piel y asomaba como una solapa.
  const inclinacion = Math.PI / 6
  const lamina = (): MallaPlana => {
    const m = rejilla(21, 20)
    for (let i = 0; i < m.posiciones.length; i += 3) m.posiciones[i + 2] = m.posiciones[i] * Math.tan(inclinacion)
    return m
  }
  const normal: Vec3 = [-Math.sin(inclinacion), 0, Math.cos(inclinacion)]
  const trazo = (encima?: (Vec3 | null)[]): IncisionSobreLaMalla => {
    const puntos: Vec3[] = []
    for (let y = 2; y <= 18 + 1e-9; y += 0.5) puntos.push([10.3, y, 10.3 * Math.tan(inclinacion)])
    return { puntos, normales: puntos.map(() => normal), normalesDeEncima: encima ?? undefined }
  }
  const lasQueSeMueven = (c: NonNullable<ReturnType<typeof cortarMalla>>) =>
    Array.from({ length: c.pesoLateral.length }, (_, i) => i).filter((i) => c.pesoLateral[i] > 0)

  it('con la normal de la piel encima, lo que se aparta no sube ni baja respecto de ella', () => {
    const piel: Vec3 = [0, 0, 1]
    const c = cortarMalla(lamina(), trazo(trazo().puntos.map(() => piel)), OPCIONES)!
    const movidos = lasQueSeMueven(c)
    expect(movidos.length).toBeGreaterThan(20)
    for (const i of movidos) expect(Math.abs(c.direccion[3 * i + 2])).toBeLessThan(0.02)
  })

  it('sin ella, por su tangente, como la piel: sube lo que la lámina sube', () => {
    for (const c of [cortarMalla(lamina(), trazo(), OPCIONES)!, cortarMalla(lamina(), trazo(trazo().puntos.map(() => null)), OPCIONES)!]) {
      for (const i of lasQueSeMueven(c)) expect(Math.abs(c.direccion[3 * i + 2])).toBeCloseTo(Math.sin(inclinacion), 2)
    }
  })

  it('por dónde se parte no cambia: eso lo dice la normal de la malla', () => {
    const sin = cortarMalla(lamina(), trazo(), OPCIONES)!
    const con = cortarMalla(lamina(), trazo(trazo().puntos.map(() => [0, 0, 1] as Vec3)), OPCIONES)!
    expect(Array.from(con.indices)).toEqual(Array.from(sin.indices))
    expect(Array.from(con.lado)).toEqual(Array.from(sin.lado))
  })
})

describe('una punta que llega al borde de la malla con la malla entera más allá (P-015)', () => {
  // El sóleo del caso 4: partido de 0,06 a 0,20 del trazo hasta su borde, y bajo el resto del trazo, entero. Un
  // triángulo con un vértice de cada labio, sin partir, del todo más allá de la grieta, es ese tejido.
  const grieta = () => ({ desde: 0.06, hasta: 0.2, cerradaAlInicio: true, cerradaAlFinal: false })
  const lado = Int8Array.from([1, -1, 1, 1])
  const arrastrados = Float32Array.from([1, 1, 1, 1])

  it('se cierra: los separadores no la estiran a los dos lados', () => {
    const g = grieta()
    cerrarLasPuntasConTejidoEntero(g, [0, 1, 2], lado, arrastrados, Float32Array.from([0.45, 0.46, 0.47, 0]))
    expect(g.cerradaAlFinal).toBe(true)
    expect(g.cerradaAlInicio).toBe(true)
  })

  it('sigue abierta si lo que hay más allá es de un solo labio, o no se arrastra, o toca la grieta', () => {
    const g = grieta()
    const t = Float32Array.from([0.45, 0.46, 0.47, 0.48])
    cerrarLasPuntasConTejidoEntero(g, [0, 2, 3], lado, arrastrados, t)
    expect(g.cerradaAlFinal).toBe(false)
    cerrarLasPuntasConTejidoEntero(g, [0, 1, 2], lado, Float32Array.from([1, 0, 1, 1]), t)
    expect(g.cerradaAlFinal).toBe(false)
    // El del vaso cortado de lado a lado: lo que queda entero está junto a su grieta, no más allá.
    cerrarLasPuntasConTejidoEntero(g, [0, 1, 2], lado, arrastrados, Float32Array.from([0.19, 0.21, 0.2, 0]))
    expect(g.cerradaAlFinal).toBe(false)
  })
})

describe('los saltos del cursor en las puntas del trazo (P-015)', () => {
  // El bisturí hondo trazado de borde a borde de la herida: el primer clic en la piel, 6 mm por encima del fondo; el
  // último, 11 mm. Lo que va por la pared no es corte.
  const trazo: IncisionSobreLaMalla = { puntos: [[5, 30.3, 6], [5.6, 30.3, 6]], normales: [[0, 0, 1], [0, 0, 1]] }
  for (let x = 6; x <= 30 + 1e-9; x += 0.5) {
    trazo.puntos.push([x, 30.3, 0])
    trazo.normales.push([0, 0, 1])
  }
  trazo.puntos.push([31, 30.3, 11])
  trazo.normales.push([0, 0, 1])

  it('con curva de apertura, el trazo empieza y acaba en el fondo', () => {
    const curva = prepararIncision(trazo, 0.01, 2)!
    const ultimo = curva.tramos.at(-1)!
    const fin = [0, 1, 2].map((k) => ultimo.a[k] + ultimo.d[k] * ultimo.largo)
    expect(curva.tramos[0].a).toEqual([6, 30.3, 0])
    expect(fin[0]).toBeCloseTo(30, 6)
    expect(fin[2]).toBeCloseTo(0, 6)
    expect(curva.largoTotal).toBeCloseTo(24, 6)
  })

  it('sin ella, el trazo se mide entero, como siempre', () => {
    expect(prepararIncision(trazo, 0.01)!.largoTotal).toBeGreaterThan(24 + 6 + 11)
  })

  it('un trazo sobre una piel curva no pierde nada, aunque la piel se doble', () => {
    // Un arco de 90° sobre un cilindro de radio 10: cada tramo va por la superficie, con su normal.
    const arco: IncisionSobreLaMalla = { puntos: [], normales: [] }
    for (let k = 0; k <= 30; k++) {
      const a = (k / 30) * (Math.PI / 2)
      arco.puntos.push([0, 10 * Math.sin(a), 10 * Math.cos(a)])
      arco.normales.push([0, Math.sin(a), Math.cos(a)])
    }
    expect(prepararIncision(arco, 0.01, 2)!.tramos.length).toBe(30)
  })
})

describe('lo que se arrastra en hondo no salta de un vértice al vecino (P-015)', () => {
  // Un trazo recto con la normal cabeceando 20° a cada lado de un nodo al siguiente, como la de los clics del bisturí
  // hondo sobre el fondo de la herida, y una lámina 20 mm por debajo. Con el lateral medido al trazo crudo, el peso de
  // dos vértices a 1 mm uno de otro difería 0,24: a 12 mm de separador, 3 mm de diferencia en un milímetro.
  const trazo: IncisionSobreLaMalla = { puntos: [], normales: [] }
  for (let k = 0; k <= 50; k++) {
    const a = ((k % 2 ? 1 : -1) * 20 * Math.PI) / 180
    trazo.puntos.push([5 + k, 30.3, 0])
    trazo.normales.push([0, Math.sin(a), Math.cos(a)])
  }
  const corte = cortarMalla(rejilla(61, 60, -20), trazo, { profundidad: 30, alcance: 30, holgura: 4 })!

  it('el peso de dos vecinos casi no cambia, y al abrir 12 mm ningún triángulo se da la vuelta', () => {
    let salto = 0
    for (let j = 0; j < 61; j++) {
      if (Math.abs(j - 30.3) < 6) continue
      for (let i = 10; i < 50; i++) salto = Math.max(salto, Math.abs(corte.pesoLateral[j * 61 + i] - corte.pesoLateral[j * 61 + i + 1]))
    }
    expect(salto).toBeLessThan(0.02)
    const abierta = abrirHerida(corte, 12, 12)
    let vueltos = 0
    for (let t = 0; t < corte.indices.length; t += 3) {
      const [a, b, c] = [corte.indices[t], corte.indices[t + 1], corte.indices[t + 2]]
      const giro = (p: Float32Array) => (p[3 * b] - p[3 * a]) * (p[3 * c + 1] - p[3 * a + 1]) - (p[3 * b + 1] - p[3 * a + 1]) * (p[3 * c] - p[3 * a])
      if (giro(corte.posiciones) * giro(abierta) < 0) vueltos++
    }
    expect(vueltos).toBe(0)
  })
})

describe('un tubo cerrado, como una pierna', () => {
  /** Un cilindro de radio 10 y 40 de largo; la incisión va por arriba (y = +radio). */
  function tubo(): MallaPlana {
    const segmentosAngulo = 48
    const segmentosLargo = 40
    const posiciones: number[] = []
    for (let j = 0; j <= segmentosLargo; j++) {
      for (let i = 0; i < segmentosAngulo; i++) {
        const a = (i / segmentosAngulo) * Math.PI * 2
        posiciones.push((j * 40) / segmentosLargo, 10 * Math.sin(a), 10 * Math.cos(a))
      }
    }
    const indices: number[] = []
    for (let j = 0; j < segmentosLargo; j++) {
      for (let i = 0; i < segmentosAngulo; i++) {
        const a = j * segmentosAngulo + i
        const b = j * segmentosAngulo + ((i + 1) % segmentosAngulo)
        const c = a + segmentosAngulo
        const d = b + segmentosAngulo
        indices.push(a, c, b, b, c, d)
      }
    }
    return { posiciones: Float32Array.from(posiciones), indices: Uint32Array.from(indices) }
  }

  it('el corte de arriba no abre la piel de abajo', () => {
    const malla = tubo()
    // Incisión sobre z = +10 (la generatriz de arriba), de x = 10 a x = 30, con la normal hacia fuera (+z).
    const puntos: Vec3[] = []
    const normales: Vec3[] = []
    for (let x = 10; x <= 30; x += 1) {
      puntos.push([x, 0.37, 9.993])
      normales.push([0, 0.037, 1])
    }
    const corte = cortarMalla(malla, { puntos, normales }, { profundidad: 3, alcance: 8, holgura: 4 })!
    expect(corte).not.toBeNull()
    // Todos los vértices duplicados están en la cara de arriba (z > 5): ninguno en la de abajo.
    for (const i of [...corte.labios.mas, ...corte.labios.menos]) expect(corte.posiciones[3 * i + 2]).toBeGreaterThan(5)
    // Y la piel de abajo no se mueve al abrir.
    const abierta = abrirHerida(corte, 4, 4)
    for (let i = 0; i < corte.lado.length; i++) {
      if (corte.posiciones[3 * i + 2] < -5) {
        expect(abierta[3 * i]).toBe(corte.posiciones[3 * i])
        expect(abierta[3 * i + 1]).toBe(corte.posiciones[3 * i + 1])
      }
    }
  })
})

describe('componerCortes: una malla cortada varias veces (P-003 E4)', () => {
  /** La malla plana cortada dos veces: primero en y = 6, luego, sobre lo que dejó, en y = `y2`. */
  function dosCortes(y2: number) {
    const base = rejilla(21, 20)
    const c1 = cortarMalla(base, incisionRecta(4, 16, 6), OPCIONES)!
    const c2 = cortarMalla({ posiciones: c1.posiciones, indices: c1.indices }, incisionRecta(4, 16, y2), OPCIONES)!
    return { base, c1, c2 }
  }

  it('con un solo corte es exactamente abrirHerida', () => {
    const base = rejilla(21, 20)
    const c1 = cortarMalla(base, incisionRecta(4, 16, 6), OPCIONES)!
    const a = componerCortes([{ corte: c1, apertura: { mas: 1.2, menos: 0.7 } }])
    expect([...a]).toEqual([...abrirHerida(c1, 1.2, 0.7)])
  })

  it('el segundo corte conserva los vértices del primero y añade los suyos al final', () => {
    const { c1, c2 } = dosCortes(14)
    expect(c2.lado.length).toBeGreaterThan(c1.lado.length)
    // Los vértices que ya había no cambian de índice ni de sitio: es lo que permite componer.
    for (let i = 0; i < c1.lado.length * 3; i++) expect(c2.posiciones[i]).toBe(c1.posiciones[i])
    for (let i = 0; i < c1.lado.length; i++) expect(c2.origen[i]).toBe(i)
  })

  it('con el segundo cerrado, la malla abre lo del primero; con el primero cerrado, lo del segundo', () => {
    const { c1, c2 } = dosCortes(14)
    const n1 = c1.lado.length
    const soloPrimero = componerCortes([
      { corte: c1, apertura: { mas: 1.5, menos: 1.5 } },
      { corte: c2, apertura: { mas: 0, menos: 0 } },
    ])
    const abierta1 = abrirHerida(c1, 1.5, 1.5)
    for (let i = 0; i < n1 * 3; i++) expect(soloPrimero[i]).toBeCloseTo(abierta1[i], 6)

    const soloSegundo = componerCortes([
      { corte: c1, apertura: { mas: 0, menos: 0 } },
      { corte: c2, apertura: { mas: 2, menos: 1 } },
    ])
    expect([...soloSegundo]).toEqual([...abrirHerida(c2, 2, 1)])
  })

  it('dos heridas lejanas abren cada una lo suyo y no se estorban', () => {
    const { c1, c2 } = dosCortes(15)
    const n1 = c1.lado.length
    const juntas = componerCortes([
      { corte: c1, apertura: { mas: 1.5, menos: 1.5 } },
      { corte: c2, apertura: { mas: 2, menos: 2 } },
    ])
    const a1 = abrirHerida(c1, 1.5, 1.5)
    const a2 = abrirHerida(c2, 2, 2)
    for (let i = 0; i < n1; i++) {
      for (let k = 0; k < 3; k++) {
        // base + desplazamiento del primero + desplazamiento del segundo. A cinco decimales y no a seis: lo esperado
        // se arma aquí con restas de posiciones en simple precisión, y a esta distancia del origen el último bit
        // de un número de esos ya vale una millonésima.
        const esperado = a1[3 * i + k] + (a2[3 * i + k] - c2.posiciones[3 * i + k])
        expect(juntas[3 * i + k]).toBeCloseTo(esperado, 5)
      }
    }
  })

  it('un vértice nuevo del segundo corte dentro de la zona del primero va adonde lo lleva su arista (P-015)', () => {
    // A 3 mm del primero: dentro de su alcance (6), así que algunos vértices nuevos del segundo caen en su zona.
    const { c1, c2 } = dosCortes(9)
    const juntas = componerCortes([
      { corte: c1, apertura: { mas: 2, menos: 2 } },
      { corte: c2, apertura: { mas: 0, menos: 0 } },
    ])
    const n1 = c1.lado.length
    const a1 = abrirHerida(c1, 2, 2)
    // Lo que el primer corte arrastra a cada vértice del segundo: a los que ya estaban, lo suyo; a los nuevos, lo de
    // los dos vértices de que salen, cada uno en su parte. Hasta P-015 era lo de uno solo de los dos (`origen`), y
    // dos vecinos que heredaban de extremos distintos podían cruzarse.
    const arrastre: number[][] = []
    for (let v = 0; v < n1; v++) arrastre.push([0, 1, 2].map((k) => a1[3 * v + k] - c1.posiciones[3 * v + k]))
    const { desde, de, peso } = c2.mezcla
    expect(desde).toBe(n1)
    let comprobados = 0
    let entreDos = 0
    for (let v = n1; v < c2.lado.length; v++) {
      const j = v - desde
      const a = arrastre[de[2 * j]]
      const b = arrastre[de[2 * j + 1]]
      arrastre.push([0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * peso[j]))
      for (let k = 0; k < 3; k++) expect(juntas[3 * v + k]).toBeCloseTo(c2.posiciones[3 * v + k] + arrastre[v][k], 5)
      if (Math.hypot(...arrastre[v]) > 0) comprobados++
      // Y no es lo de un extremo: está de verdad entre los dos.
      if (Math.hypot(...arrastre[v].map((x, k) => x - a[k])) > 1e-3 && Math.hypot(...arrastre[v].map((x, k) => x - b[k])) > 1e-3) entreDos++
    }
    expect(comprobados).toBeGreaterThan(0)
    expect(entreDos).toBeGreaterThan(0)
  })

  it('no deja ningún número roto ni ningún triángulo vuelto del revés al abrir las dos', () => {
    const { c1, c2 } = dosCortes(14)
    const juntas = componerCortes([
      { corte: c1, apertura: { mas: 1, menos: 1 } },
      { corte: c2, apertura: { mas: 1, menos: 1 } },
    ])
    expect(juntas.every(Number.isFinite)).toBe(true)
    for (let t = 0; t < c2.indices.length; t += 3) {
      const [a, b, c] = [c2.indices[t], c2.indices[t + 1], c2.indices[t + 2]]
      const u = [0, 1, 2].map((k) => juntas[3 * b + k] - juntas[3 * a + k])
      const w = [0, 1, 2].map((k) => juntas[3 * c + k] - juntas[3 * a + k])
      // La malla plana mira a +Z: la normal de cada triángulo no puede darse la vuelta.
      expect(u[0] * w[1] - u[1] * w[0]).toBeGreaterThan(-1e-6)
    }
  })

  it('sin cortes no hay nada que componer', () => {
    expect(componerCortes([]).length).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import {
  alargarIncision,
  corredorDelRepasoMm,
  decidirElTrazo,
  incisionQueAlarga,
  rotuloDeLaIncision,
  UMBRAL_PARA_ALARGAR_MM,
  type Punto,
  type TrazoDeIncision,
} from '@/lib/incisiones'

/** Un trazo recto a lo largo de X, a la altura `y`, con la normal hacia +Z. */
function recta(de: number, a: number, y = 0): TrazoDeIncision {
  const puntos: Punto[] = []
  const normales: Punto[] = []
  const paso = de <= a ? 1 : -1
  for (let x = de; paso > 0 ? x <= a : x >= a; x += paso) {
    puntos.push([x, y, 0])
    normales.push([0, 0, 1])
  }
  return { puntos, normales }
}

describe('un trazo que empieza donde terminó otro lo alarga (P-003 E4.4)', () => {
  it('une el final de una con el inicio del trazo nuevo, sin repetir el punto de unión', () => {
    const base = recta(0, 10)
    const nuevo = recta(10, 20)
    const unida = alargarIncision(base, nuevo, 1)!
    expect(unida.puntos[0]).toEqual([0, 0, 0])
    expect(unida.puntos[unida.puntos.length - 1]).toEqual([20, 0, 0])
    expect(unida.puntos.length).toBe(21)
    // Cada punto con su normal.
    expect(unida.normales.length).toBe(unida.puntos.length)
  })

  it('acepta un trazo hecho en el otro sentido: se invierte para que la incisión siga siendo una sola línea', () => {
    const unida = alargarIncision(recta(0, 10), recta(20, 10), 1)!
    expect(unida.puntos.map((p) => p[0])).toEqual([...Array(21).keys()])
  })

  it('también se alarga por el inicio: un trazo que termina donde empieza la incisión va delante', () => {
    const unida = alargarIncision(recta(10, 20), recta(0, 10), 1)!
    expect(unida.puntos[0][0]).toBe(0)
    expect(unida.puntos[unida.puntos.length - 1][0]).toBe(20)
  })

  it('y por el inicio con el trazo en sentido contrario', () => {
    const unida = alargarIncision(recta(10, 20), recta(-5, 10), 1)!
    expect(unida.puntos[0][0]).toBe(-5)
    expect(unida.puntos[unida.puntos.length - 1][0]).toBe(20)
  })

  it('un trazo que no toca ningún extremo es otra incisión', () => {
    expect(alargarIncision(recta(0, 10), recta(0, 10, 15), UMBRAL_PARA_ALARGAR_MM)).toBeNull()
    // Aunque cruce la incisión por el medio: lo que cuenta son los extremos.
    expect(alargarIncision(recta(0, 10), { puntos: [[5, -10, 0], [5, 10, 0]], normales: [[0, 0, 1], [0, 0, 1]] }, 1)).toBeNull()
  })

  it('el umbral es el borde: a justo la distancia todavía alarga, un poco más ya no', () => {
    expect(alargarIncision(recta(0, 10), recta(14, 20), 5)).not.toBeNull()
    expect(alargarIncision(recta(0, 10), recta(16, 20), 5)).toBeNull()
  })

  it('no hace nada con menos de dos puntos', () => {
    const vacio: TrazoDeIncision = { puntos: [], normales: [] }
    expect(alargarIncision(vacio, recta(0, 10), 5)).toBeNull()
    expect(alargarIncision(recta(0, 10), vacio, 5)).toBeNull()
  })

  it('no modifica ni la incisión ni el trazo que se le dan', () => {
    const base = recta(0, 10)
    const nuevo = recta(20, 10)
    const copiaBase = JSON.stringify(base)
    const copiaNuevo = JSON.stringify(nuevo)
    alargarIncision(base, nuevo, 1)
    expect(JSON.stringify(base)).toBe(copiaBase)
    expect(JSON.stringify(nuevo)).toBe(copiaNuevo)
  })
})

describe('qué incisión alarga un trazo (P-003 E4.4)', () => {
  const existentes = [
    { id: 1, capa: 'piel', ...recta(0, 10) },
    { id: 2, capa: 'piel', ...recta(0, 10, 30) },
    { id: 3, capa: 'musculo', ...recta(0, 10, 60) },
  ]

  it('elige la de su capa cuyo extremo esté más cerca', () => {
    const r = incisionQueAlarga(existentes, 'piel', recta(10, 20, 30), 5)!
    expect(r.id).toBe(2)
    expect(r.unida.puntos[r.unida.puntos.length - 1]).toEqual([20, 30, 0])
  })

  it('ignora las de otra capa aunque estén al lado', () => {
    expect(incisionQueAlarga(existentes, 'piel', recta(10, 20, 60), 5)).toBeNull()
    expect(incisionQueAlarga(existentes, 'musculo', recta(10, 20, 60), 5)!.id).toBe(3)
  })

  it('un trazo lejos de todas es otra incisión', () => {
    expect(incisionQueAlarga(existentes, 'piel', recta(50, 70, 100), 5)).toBeNull()
  })
})

/** Un trazo por esos puntos, con un punto por milímetro en cada tramo y la normal hacia +Z. */
function por(...esquinas: Punto[]): TrazoDeIncision {
  const puntos: Punto[] = [esquinas[0]]
  for (let k = 1; k < esquinas.length; k++) {
    const a = esquinas[k - 1]
    const b = esquinas[k]
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])))
    for (let i = 1; i <= n; i++) puntos.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n, a[2] + ((b[2] - a[2]) * i) / n])
  }
  return { puntos, normales: puntos.map(() => [0, 0, 1] as Punto) }
}

const largo = (t: TrazoDeIncision) => t.puntos.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - t.puntos[i][0], p[1] - t.puntos[i][1], p[2] - t.puntos[i][2]), 0)

describe('repasar una incisión no la parte otra vez (D-410)', () => {
  // Una incisión de 90 mm sobre X, en milímetros, recién hecha: 7 mm de hueco.
  const incision = { id: 1, capa: 'piel', ...recta(0, 90) }
  const opciones = { umbral: UMBRAL_PARA_ALARGAR_MM, mm: 1, corredor: () => corredorDelRepasoMm(7) }
  const decidir = (nuevo: TrazoDeIncision, existentes = [incision]) => decidirElTrazo(existentes, 'piel', nuevo, opciones)

  it('pasar otra vez el bisturí por encima, sin tocar las puntas, no corta nada', () => {
    const d = decidir(recta(12, 78, 1.5))
    expect(d.tipo).toBe('repaso')
    expect(d.tipo === 'repaso' && d.id).toBe(1)
    expect(d.tipo === 'repaso' && d.repasado).toBeGreaterThan(60)
  })

  it('volver desde una punta por encima de la incisión es repasarla, no alargarla (la foto del dueño)', () => {
    // Lo de antes: la unía con el trazo vuelto, una línea que iba y volvía, y la incisión «medía» 126 mm.
    const antes = incisionQueAlarga([incision], 'piel', recta(0, 36, 1), UMBRAL_PARA_ALARGAR_MM)!
    expect(largo(antes.unida)).toBeGreaterThan(120)
    expect(decidir(recta(0, 36, 1)).tipo).toBe('repaso')
    expect(decidir(recta(36, 0, -1)).tipo).toBe('repaso')
    expect(decidir(recta(90, 50, 1)).tipo).toBe('repaso')
  })

  it('dentro de una herida abierta el trazo cae en el fondo, a un lado y más hondo, y sigue siendo repaso', () => {
    // Abierta 35 mm (los Farabeuf a 14): el fondo queda a 15 mm de la línea y 6 bajo la piel.
    const abierta = { ...opciones, corredor: () => corredorDelRepasoMm(35) }
    expect(decidirElTrazo([incision], 'piel', por([15, 15, -6], [75, 14, -6]), abierta).tipo).toBe('repaso')
    // Recién hecha, el mismo trazo cae fuera del corredor: no es el de esa herida.
    expect(decidir(por([15, 15, -6], [75, 14, -6])).tipo).toBe('nueva')
  })

  it('lo hondo se mide aparte de lo de lado: el fondo de una herida ya profundizada sigue siendo ella', () => {
    // Lo que vio el navegador en el caso 4: el repaso cayó en el fondo, de 8 a 12 mm bajo la línea, y como todo iba en
    // una sola distancia con 6 mm de hondura, volvía a ser otra incisión.
    expect(decidir(por([10, 1, -12], [80, -1, -12])).tipo).toBe('repaso')
    expect(decidir(por([10, 1, -22], [80, -1, -22])).tipo).toBe('repaso')
    // Mucho más hondo ya es otra superficie (el hueso, el otro lado de la pierna): no repasa nada.
    expect(decidir(por([10, 1, -40], [80, -1, -40])).tipo).toBe('nueva')
    // Y por encima de la piel tampoco.
    expect(decidir(por([10, 0, 8], [80, 0, 8])).tipo).toBe('nueva')
  })

  it('volver desde una punta y caer al fondo de la herida sigue siendo repaso: la caída no cuenta como trazo', () => {
    // La foto del dueño, tal como la midió el navegador: el trazo arranca en la punta, cae unos 10 mm al fondo en el
    // primer milímetro de incisión y sigue por el fondo. Contada la caída, el tramo «avanzaba» poco para lo que medía.
    expect(decidir(por([0, 0, 0], [1, 0, -12], [26, 0, -10])).tipo).toBe('repaso')
  })

  it('la hondura va por la normal de la piel en cada punto, no por un eje fijo', () => {
    // La misma incisión, en una piel que mira hacia +Y: lo hondo es −Y, y 12 mm hacia −Z es de lado, no de hondo.
    const deLado = { ...incision, normales: incision.normales.map(() => [0, 1, 0] as Punto) }
    expect(decidir(por([10, -12, 0], [80, -12, 0]), [deLado]).tipo).toBe('repaso')
    expect(decidir(por([10, 0, -12], [80, 0, -12]), [deLado]).tipo).toBe('nueva')
  })

  it('lo que pasa de una punta la alarga, y la unida no vuelve sobre sí misma', () => {
    const d = decidir(recta(50, 125, 1))
    expect(d.tipo).toBe('alarga')
    if (d.tipo !== 'alarga') return
    const xs = d.unida.puntos.map((p) => p[0])
    expect(xs[0]).toBe(0)
    expect(xs[xs.length - 1]).toBe(125)
    // Siempre hacia delante: ningún punto vuelve atrás. Donde se une, el trazo puede ir un milímetro a un lado.
    expect(xs.every((x, i) => i === 0 || x >= xs[i - 1])).toBe(true)
    expect(largo(d.unida)).toBeGreaterThan(125)
    expect(largo(d.unida)).toBeLessThan(128)
    expect(d.unida.normales.length).toBe(d.unida.puntos.length)
  })

  it('repasarla entera y pasarse por las dos puntas la alarga por las dos', () => {
    const d = decidir(recta(110, -20, 1))
    expect(d.tipo).toBe('alarga')
    if (d.tipo !== 'alarga') return
    const xs = d.unida.puntos.map((p) => p[0])
    expect(Math.min(...xs)).toBe(-20)
    expect(Math.max(...xs)).toBe(110)
    const sube = xs[xs.length - 1] > xs[0]
    expect(xs.every((x, i) => i === 0 || (sube ? x >= xs[i - 1] : x <= xs[i - 1]))).toBe(true)
    expect(largo(d.unida)).toBeLessThan(135)
  })

  it('una línea que baja al fondo de la herida y trepa por su pared sigue siendo un repaso, no otra incisión', () => {
    // Lo que vio el navegador: la recta tendida sobre la herida abierta sube y baja por la pared donde la pantalla la
    // lleva, y mirada punto a punto, cada subida parecía un trazo aparte.
    const d = decidir(por([12, 1, 0], [16, 3, -6], [30, -3, -6], [34, 3, -2], [60, -2, -6], [70, 3, 0], [78, 0, 0]))
    expect(d.tipo).toBe('repaso')
  })

  it('pasarse de la punta un par de milímetros sin querer no la alarga', () => {
    expect(decidir(recta(-3, 60, 1)).tipo).toBe('repaso')
  })

  it('alargar como siempre: empieza junto a la punta y se va', () => {
    const d = decidir(recta(92, 130))
    expect(d.tipo).toBe('alarga')
    expect(d.tipo === 'alarga' && d.repasado).toBe(0)
    expect(d.tipo === 'alarga' && d.unida.puntos[d.unida.puntos.length - 1]).toEqual([130, 0, 0])
  })

  it('un trazo que la cruza en ángulo es otra incisión, entero', () => {
    const cruce = por([45, -30, 0], [45, 30, 0])
    const d = decidir(cruce)
    expect(d).toEqual({ tipo: 'nueva', trazo: cruce })
    // Y en sesgo, a 50°, también.
    const sesgo = por([20, -25, 0], [40, 25 * Math.tan((50 * Math.PI) / 180) - 25, 0])
    expect(decidir(sesgo).tipo).toBe('nueva')
  })

  it('una paralela lejos de la incisión es otra', () => {
    expect(decidir(recta(0, 90, 25)).tipo).toBe('nueva')
  })

  it('lo que se sale por un lado, a media incisión, es otra que nace en ella; lo repasado no se vuelve a cortar', () => {
    const d = decidir(por([20, 1, 0], [50, 1, 0], [50, 40, 0]))
    expect(d.tipo).toBe('nueva')
    if (d.tipo !== 'nueva') return
    // Solo el tramo que sube: empieza junto a la incisión y llega arriba.
    expect(Math.abs(d.trazo.puntos[0][0] - 50)).toBeLessThanOrEqual(1.5)
    expect(d.trazo.puntos[0][1]).toBeLessThan(10)
    expect(d.trazo.puntos[d.trazo.puntos.length - 1]).toEqual([50, 40, 0])
  })

  it('mira la incisión de su capa que más pisa, y ninguna de otra capa', () => {
    const otras = [
      incision,
      { id: 2, capa: 'piel', ...recta(0, 90, 40) },
      { id: 3, capa: 'musculo', ...recta(0, 90, 41) },
    ]
    const d = decidir(recta(10, 80, 41), otras)
    expect(d.tipo === 'repaso' && d.id).toBe(2)
    expect(decidirElTrazo(otras, 'musculo', recta(10, 80, 41), opciones)).toMatchObject({ tipo: 'repaso', id: 3 })
  })

  it('un trazo sin incisiones en su capa es la primera', () => {
    const t = recta(0, 50)
    expect(decidirElTrazo([], 'piel', t, opciones)).toEqual({ tipo: 'nueva', trazo: t })
  })

  it('el corredor de lado crece con lo que la herida está abierta, y nunca baja del umbral de alargar', () => {
    expect(corredorDelRepasoMm(0)).toBe(UMBRAL_PARA_ALARGAR_MM)
    expect(corredorDelRepasoMm(7)).toBeCloseTo(5.5, 6)
    expect(corredorDelRepasoMm(35)).toBeCloseTo(19.5, 6)
    expect(corredorDelRepasoMm(-3)).toBe(UMBRAL_PARA_ALARGAR_MM)
  })
})

describe('el rótulo de cada incisión en el panel (P-003 E4.6)', () => {
  it('numera por orden y dice capa, largo y apertura si la hay', () => {
    expect(rotuloDeLaIncision(1, { capa: 'piel', largoMm: 42.4, aperturaMm: 0 })).toBe('Incisión 1 · piel · 42 mm')
    expect(rotuloDeLaIncision(2, { capa: 'musculo', largoMm: 30, aperturaMm: 12.6 })).toBe('Incisión 2 · músculo · 30 mm · abierta 13 mm')
  })
})

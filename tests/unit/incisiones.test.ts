import { describe, expect, it } from 'vitest'
import {
  alargarIncision,
  APARTE_DE_LA_LINEA_MM,
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

  it('un trazo que la cruza en ángulo no la repasa: es otra, que nace en ella (D-415)', () => {
    expect(decidir(por([45, -30, 0], [45, 30, 0])).tipo).toBe('nueva')
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
    // Y empieza junto a la línea de la incisión, a 1 mm (D-415): sin un puente de piel entre las dos, y sin tocar el labio
    // de enfrente.
    expect(d.trazo.puntos[0][1]).toBeCloseTo(APARTE_DE_LA_LINEA_MM, 6)
    expect(d.ramas).toBeUndefined()
  })

  it('si al repasar se sale por los dos lados, lo que sale por el otro es una rama, y no se pierde (D-415)', () => {
    // Un cruce en sesgo, a 25°: dentro del corredor va a lo largo, y es repaso; lo de fuera, a cada lado, nace en la línea.
    const tan = Math.tan((25 * Math.PI) / 180)
    const d = decidir(por([45 - 15 / tan, -15, 0], [45 + 15 / tan, 15, 0]))
    expect(d.tipo).toBe('nueva')
    if (d.tipo !== 'nueva') return
    expect(d.ramas).toHaveLength(1)
    const extremos = [d.trazo, d.ramas![0]].flatMap((t) => [t.puntos[0], t.puntos[t.puntos.length - 1]])
    // Cada pedazo nace junto a la línea, y donde la dejó cada uno: a 11,8 mm del cruce, antes y después.
    const enLaLinea = extremos.filter((p) => Math.abs(p[1]) <= APARTE_DE_LA_LINEA_MM + 1e-6).map((p) => p[0]).sort((a, b) => a - b)
    expect(enLaLinea).toHaveLength(2)
    expect(enLaLinea[0]).toBeCloseTo(45 - 5.5 / tan, 0)
    expect(enLaLinea[1]).toBeCloseTo(45 + 5.5 / tan, 0)
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

describe('dos cortes que se cruzan quedan unidos, y lejos, independientes (D-415)', () => {
  // La misma incisión de 90 mm sobre X, recién hecha (corredor de 5,5 mm a cada lado).
  const incision = { id: 1, capa: 'piel', ...recta(0, 90) }
  const opciones: Parameters<typeof decidirElTrazo>[3] = { umbral: UMBRAL_PARA_ALARGAR_MM, mm: 1, corredor: () => corredorDelRepasoMm(7) }
  const decidir = (nuevo: TrazoDeIncision, existentes = [incision], o = opciones) => decidirElTrazo(existentes, 'piel', nuevo, o)
  const primero = (t: TrazoDeIncision) => t.puntos[0]
  const ultimo = (t: TrazoDeIncision) => t.puntos[t.puntos.length - 1]

  it('un cruce en medio: no corta encima de la herida, y lo que sale a cada lado nace en su línea', () => {
    const d = decidir(por([45, -20, 0], [45, 30, 0]))
    expect(d.tipo).toBe('nueva')
    if (d.tipo !== 'nueva') return
    // La incisión es el pedazo más largo, de la línea hacia arriba; el de abajo es una rama que llega a la línea. Cada una
    // a 1 mm de ella, de su lado: tocándola, partía también el labio de enfrente.
    expect(primero(d.trazo)).toEqual([45, 1, 0])
    expect(ultimo(d.trazo)).toEqual([45, 30, 0])
    expect(d.ramas).toHaveLength(1)
    const rama = d.ramas![0]
    expect(primero(rama)).toEqual([45, -20, 0])
    expect(ultimo(rama)).toEqual([45, -1, 0])
    // Entre la línea y el borde del corredor no hay trazo: eso ya está cortado.
    for (const t of [d.trazo, rama]) for (const p of t.puntos) expect(Math.abs(p[1]) === 1 || Math.abs(p[1]) > 5.5).toBe(true)
    expect(d.trazo.normales).toHaveLength(d.trazo.puntos.length)
    expect(rama.normales).toHaveLength(rama.puntos.length)
  })

  it('cerca de una punta la incisión se acorta hasta el cruce y el trazo nuevo pasa entero: una T (la foto del dueño)', () => {
    const d = decidir(por([8, -25, 0], [8, 30, 0]))
    expect(d).toMatchObject({ tipo: 'alarga', id: 1, enElCruce: true, repasado: 0 })
    if (d.tipo !== 'alarga') return
    // La incisión, del cruce a su otra punta y en el sentido en que se hizo: los 8 mm del otro lado se cierran.
    expect(primero(d.unida)).toEqual([8, 0, 0])
    expect(ultimo(d.unida)).toEqual([90, 0, 0])
    expect(d.unida.puntos.every((p) => p[1] === 0 && p[0] >= 8)).toBe(true)
    expect(d.unida.normales).toHaveLength(d.unida.puntos.length)
    expect(d.tramo![0]).toBeCloseTo(8 / 90, 9)
    expect(d.tramo![1]).toBe(1)
    // El trazo nuevo, de punta a punta, recto por la nueva punta de la incisión y sin lo que cayó sobre la herida.
    expect(d.ramas).toHaveLength(1)
    const barra = d.ramas![0]
    expect(primero(barra)).toEqual([8, -25, 0])
    expect(ultimo(barra)).toEqual([8, 30, 0])
    expect(barra.puntos).toContainEqual([8, 0, 0])
    expect(barra.puntos.every((p) => p[0] === 8 && (p[1] === 0 || Math.abs(p[1]) > 5.5))).toBe(true)
    expect(barra.normales).toHaveLength(barra.puntos.length)
  })

  it('y por la punta del final igual, sin dar vuelta la incisión', () => {
    const d = decidir(por([84, -12, 0], [84, 30, 0]))
    expect(d).toMatchObject({ tipo: 'alarga', id: 1, enElCruce: true })
    if (d.tipo !== 'alarga') return
    expect(primero(d.unida)).toEqual([0, 0, 0])
    expect(ultimo(d.unida)).toEqual([84, 0, 0])
    expect(d.tramo![0]).toBe(0)
    expect(d.tramo![1]).toBeCloseTo(84 / 90, 9)
    expect(primero(d.ramas![0])).toEqual([84, -12, 0])
    expect(ultimo(d.ramas![0])).toEqual([84, 30, 0])
  })

  it('un trazo que llega a la punta por un solo lado no la acorta: es una T que nace en ella', () => {
    const d = decidir(por([8, 3, 0], [8, 30, 0]))
    expect(d.tipo).toBe('nueva')
    if (d.tipo !== 'nueva') return
    expect(primero(d.trazo)).toEqual([8, 1, 0])
    expect(d.ramas).toBeUndefined()
  })

  it('cerca de la punta es a menos de 2 cm, y nunca más de un tercio de la incisión', () => {
    expect(decidir(por([19, -25, 0], [19, 30, 0])).tipo).toBe('alarga')
    expect(decidir(por([22, -25, 0], [22, 30, 0])).tipo).toBe('nueva')
    // En una de 45 mm, a 18 de la punta ya es el medio (un tercio son 15).
    const corta = { id: 2, capa: 'piel', ...recta(0, 45) }
    expect(decidir(por([18, -25, 0], [18, 30, 0]), [corta]).tipo).toBe('nueva')
    expect(decidir(por([12, -25, 0], [12, 30, 0]), [corta]).tipo).toBe('alarga')
  })

  it('con la herida abierta, lo que cae sobre el labio, la pared o el fondo no se corta, y el cruce va en la línea', () => {
    // Abierta 35 mm (los Farabeuf): el corredor llega a 19,5. El trazo baja al fondo, 6 mm bajo la piel, y sube.
    const abierta = { ...opciones, corredor: () => corredorDelRepasoMm(35) }
    const d = decidir(por([45, -40, 0], [45, -17, 0], [45, -15, -6], [45, 15, -6], [45, 17, 0], [45, 40, 0]), [incision], abierta)
    expect(d.tipo).toBe('nueva')
    if (d.tipo !== 'nueva') return
    expect(d.ramas).toHaveLength(1)
    for (const t of [d.trazo, d.ramas![0]]) {
      const enElCruce = t.puntos.findIndex((p) => Math.abs(p[1]) <= 1)
      // Junto a la línea y a la altura de la piel —no en el fondo—, con la normal de la piel ahí.
      expect(t.puntos[enElCruce][0]).toBe(45)
      expect(Math.abs(t.puntos[enElCruce][1])).toBe(1)
      expect(t.puntos[enElCruce][2]).toBe(0)
      expect(t.normales[enElCruce]).toEqual([0, 0, 1])
      for (const p of t.puntos.filter((q) => Math.abs(q[1]) > 1)) {
        expect(Math.abs(p[1])).toBeGreaterThan(19.5)
        expect(p[2]).toBe(0)
      }
    }
  })

  it('el corredor es lo que la herida está abierta en cada sitio: junto a la punta, poco, aunque en medio esté abierta', () => {
    // Los Farabeuf la abren 35 mm en medio (19,5 de corredor), y a 10 mm de la punta solo 4.
    const porSitio = { ...opciones, corredor: (_: number, s?: number) => corredorDelRepasoMm(s === undefined ? 35 : s < 15 ? 4 : 35) }
    const d = decidir(por([8, -14, 0], [8, 14, 0]), [incision], porSitio)
    // Cruzó de lado a lado junto a la punta: la incisión se acorta y el trazo pasa entero.
    expect(d).toMatchObject({ tipo: 'alarga', enElCruce: true })
    expect(d.tipo === 'alarga' && d.ramas![0].puntos[0]).toEqual([8, -14, 0])
    // Con el corredor del medio en todas partes, los 14 mm a cada lado caían dentro: era «ya cortado» y no se cortaba nada.
    const comoAntes = { ...opciones, corredor: () => corredorDelRepasoMm(35) }
    expect(decidir(por([8, -14, 0], [8, 14, 0]), [incision], comoAntes).tipo).toBe('repaso')
  })

  it('una T que nace dentro del corredor empieza en la línea, sin ramas', () => {
    const d = decidir(por([45, 2, 0], [45, 40, 0]))
    expect(d.tipo).toBe('nueva')
    if (d.tipo !== 'nueva') return
    expect(primero(d.trazo)).toEqual([45, 1, 0])
    expect(ultimo(d.trazo)).toEqual([45, 40, 0])
    expect(d.ramas).toBeUndefined()
  })

  it('un trazo corto de labio a labio no corta nada: la herida ya está abierta ahí', () => {
    expect(decidir(por([45, -4, 0], [45, 4, 0]))).toMatchObject({ tipo: 'repaso', id: 1 })
  })

  it('un corte que no toca la incisión queda independiente, entero', () => {
    for (const lejos of [por([45, 10, 0], [45, 40, 0]), recta(0, 90, 8), por([100, -20, 0], [100, 20, 0])]) {
      expect(decidir(lejos)).toEqual({ tipo: 'nueva', trazo: lejos })
    }
  })

  it('un trazo que cruza dos incisiones nace en una y muere en la otra', () => {
    const otra = { id: 2, capa: 'piel', ...recta(0, 90, 30) }
    const d = decidir(por([45, -20, 0], [45, 50, 0]), [incision, otra])
    expect(d.tipo).toBe('nueva')
    if (d.tipo !== 'nueva') return
    // El puente entre las dos es lo más largo, de línea a línea; lo de fuera de cada una, ramas.
    expect(primero(d.trazo)).toEqual([45, 1, 0])
    expect(ultimo(d.trazo)).toEqual([45, 29, 0])
    expect(d.ramas).toHaveLength(2)
  })
})

describe('el rótulo de cada incisión en el panel (P-003 E4.6)', () => {
  it('numera por orden y dice capa, largo y apertura si la hay', () => {
    expect(rotuloDeLaIncision(1, { capa: 'piel', largoMm: 42.4, aperturaMm: 0 })).toBe('Incisión 1 · piel · 42 mm')
    expect(rotuloDeLaIncision(2, { capa: 'musculo', largoMm: 30, aperturaMm: 12.6 })).toBe('Incisión 2 · músculo · 30 mm · abierta 13 mm')
  })
})

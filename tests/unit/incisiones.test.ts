import { describe, expect, it } from 'vitest'
import {
  alargarIncision,
  ANGULO_DEL_CODO_GRADOS,
  codoEnLaPunta,
  corredorDelRepasoMm,
  cruzarLaLinea,
  decidirElTrazo,
  incisionQueAlarga,
  lasQueNacenEn,
  medidaDeLaIncision,
  PASADO_DEL_CODO_MM,
  puntasLibresDe,
  rotuloDeLaIncision,
  tramosDeLosTrazos,
  UMBRAL_PARA_ALARGAR_MM,
  unionesDe,
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
    // Y empieza en la línea de la incisión, y nace en ella (D-420): con ella es una sola. Lo de enfrente no se corta porque
    // se deja aparte al cortar, y no porque el trazo se quede a un milímetro.
    expect(d.trazo.puntos[0][1]).toBe(0)
    expect(d.trazo.nace).toEqual([{ en: 1, punto: d.trazo.puntos[0] }])
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
    // Cada pedazo nace en la línea, y donde la dejó cada uno: a 11,8 mm del cruce, antes y después.
    const enLaLinea = extremos.filter((p) => Math.abs(p[1]) <= 1e-6).map((p) => p[0]).sort((a, b) => a - b)
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
    // La incisión es el pedazo más largo, de la línea hacia arriba; el de abajo es una rama que llega a la línea. Los dos
    // nacen en ella, en el mismo punto (D-420): es una cruz, una sola incisión.
    expect(primero(d.trazo)).toEqual([45, 0, 0])
    expect(ultimo(d.trazo)).toEqual([45, 30, 0])
    expect(d.ramas).toHaveLength(1)
    const rama = d.ramas![0]
    expect(primero(rama)).toEqual([45, -20, 0])
    expect(ultimo(rama)).toEqual([45, 0, 0])
    expect(d.trazo.nace).toEqual([{ en: 1, punto: [45, 0, 0] }])
    expect(rama.nace).toEqual([{ en: 1, punto: [45, 0, 0] }])
    // Entre la línea y el borde del corredor no hay trazo: eso ya está cortado.
    for (const t of [d.trazo, rama]) for (const p of t.puntos) expect(p[1] === 0 || Math.abs(p[1]) > 5.5).toBe(true)
    expect(d.trazo.normales).toHaveLength(d.trazo.puntos.length)
    expect(rama.normales).toHaveLength(rama.puntos.length)
  })

  it('cerca de una punta la incisión se acorta hasta el cruce y el trazo nuevo pasa entero: una T (la foto del dueño)', () => {
    const d = decidir(por([8, -25, 0], [8, 30, 0]))
    expect(d).toMatchObject({ tipo: 'alarga', id: 1, enElCruce: true, repasado: 0 })
    if (d.tipo !== 'alarga') return
    // La incisión, del cruce a su otra punta y en el sentido en que se hizo: los 8 mm del otro lado se cierran. Queda un
    // milímetro pasado el cruce, por su propia línea, para que su grieta llegue al labio de la barra (D-420).
    expect(primero(d.unida)).toEqual([7, 0, 0])
    expect(ultimo(d.unida)).toEqual([90, 0, 0])
    expect(d.unida.puntos.every((p) => p[1] === 0 && p[0] >= 7)).toBe(true)
    expect(d.unida.normales).toHaveLength(d.unida.puntos.length)
    expect(d.tramo![0]).toBeCloseTo(7 / 90, 9)
    expect(d.tramo![1]).toBe(1)
    // Y nace en la barra, que se corta antes que ella.
    expect(d.unida.nace).toEqual([{ en: 'barra', punto: [8, 0, 0] }])
    // El trazo nuevo, de punta a punta, recto por la nueva punta de la incisión y sin lo que cayó sobre la herida.
    expect(d.ramas).toBeUndefined()
    const barra = d.barra!
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
    expect(ultimo(d.unida)).toEqual([85, 0, 0])
    expect(d.tramo![0]).toBe(0)
    expect(d.tramo![1]).toBeCloseTo(85 / 90, 9)
    expect(primero(d.barra!)).toEqual([84, -12, 0])
    expect(ultimo(d.barra!)).toEqual([84, 30, 0])
  })

  it('un trazo que llega a la punta por un solo lado no la acorta: es una T que nace en ella', () => {
    const d = decidir(por([8, 3, 0], [8, 30, 0]))
    expect(d.tipo).toBe('nueva')
    if (d.tipo !== 'nueva') return
    expect(primero(d.trazo)).toEqual([8, 0, 0])
    expect(d.trazo.nace).toEqual([{ en: 1, punto: [8, 0, 0] }])
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
      // En la línea y a la altura de la piel —no en el fondo—, con la normal de la piel ahí.
      expect(t.puntos[enElCruce][0]).toBe(45)
      expect(t.puntos[enElCruce][1]).toBe(0)
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
    expect(d.tipo === 'alarga' && d.barra!.puntos[0]).toEqual([8, -14, 0])
    // Con el corredor del medio en todas partes, los 14 mm a cada lado caían dentro: era «ya cortado» y no se cortaba nada.
    const comoAntes = { ...opciones, corredor: () => corredorDelRepasoMm(35) }
    expect(decidir(por([8, -14, 0], [8, 14, 0]), [incision], comoAntes).tipo).toBe('repaso')
  })

  it('una T que nace dentro del corredor empieza en la línea, sin ramas', () => {
    const d = decidir(por([45, 2, 0], [45, 40, 0]))
    expect(d.tipo).toBe('nueva')
    if (d.tipo !== 'nueva') return
    expect(primero(d.trazo)).toEqual([45, 0, 0])
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
    expect(primero(d.trazo)).toEqual([45, 0, 0])
    expect(ultimo(d.trazo)).toEqual([45, 30, 0])
    expect(d.trazo.nace).toEqual([
      { en: 1, punto: [45, 0, 0] },
      { en: 2, punto: [45, 30, 0] },
    ])
    expect(d.ramas).toHaveLength(2)
  })
})

describe('el rótulo de cada incisión en el panel (P-003 E4.6)', () => {
  it('numera por orden y dice capa, largo y apertura si la hay', () => {
    expect(rotuloDeLaIncision(1, { capa: 'piel', largoMm: 42.4, aperturaMm: 0 })).toBe('Incisión 1 · piel · 42 mm')
    expect(rotuloDeLaIncision(2, { capa: 'musculo', largoMm: 30, aperturaMm: 12.6 })).toBe('Incisión 2 · músculo · 30 mm · abierta 13 mm')
  })
})

describe('dos incisiones que se cruzan son una sola (D-420)', () => {
  const incision = { id: 1, capa: 'piel', ...recta(0, 90) }
  const opciones: Parameters<typeof decidirElTrazo>[3] = { umbral: UMBRAL_PARA_ALARGAR_MM, mm: 1, corredor: () => corredorDelRepasoMm(7) }

  it('cada pedazo que nace en otra pasa su línea un milímetro, en la dirección en que llega, y solo por ese lado', () => {
    const brazo = { ...por([45, 0, 0], [45, 30, 0]), nace: [{ en: 1, punto: [45, 0, 0] as Punto }] }
    const pasado = cruzarLaLinea(brazo, 1)
    expect(pasado.puntos[0]).toEqual([45, -1, 0])
    expect(pasado.puntos[pasado.puntos.length - 1]).toEqual([45, 30, 0])
    expect(pasado.normales).toHaveLength(pasado.puntos.length)
    expect(pasado.nace).toEqual(brazo.nace)
    // Uno que no nace en nada no cambia, y uno ya pasado no se pasa otra vez: su punta queda a un milímetro del punto.
    const suelto = por([45, 0, 0], [45, 30, 0])
    expect(cruzarLaLinea(suelto, 1)).toBe(suelto)
    expect(cruzarLaLinea(pasado, 1).puntos).toHaveLength(pasado.puntos.length)
  })

  it('una punta que da a otra incisión de la misma no se alarga, aunque el trazo empiece en ella', () => {
    // La 2 nace en la 1 por su inicio, en (45, 0); su final, arriba, es libre.
    const brazo = { id: 2, capa: 'piel', ...por([45, -1, 0], [45, 30, 0]) }
    const libres = { inicio: false, final: true }
    expect(incisionQueAlarga([{ ...brazo, libres }], 'piel', por([45, -1, 0], [45, -20, 0]), UMBRAL_PARA_ALARGAR_MM)).toBeNull()
    expect(incisionQueAlarga([{ ...brazo, libres }], 'piel', por([45, 30, 0], [45, 50, 0]), UMBRAL_PARA_ALARGAR_MM)?.id).toBe(2)
  })

  it('y un cruce junto a esa punta no la acorta: la separaría de la otra', () => {
    const corta = { id: 1, capa: 'piel', ...recta(0, 90), libres: { inicio: false, final: true } }
    expect(decidirElTrazo([corta], 'piel', por([8, -25, 0], [8, 30, 0]), opciones).tipo).toBe('nueva')
    expect(decidirElTrazo([incision], 'piel', por([8, -25, 0], [8, 30, 0]), opciones).tipo).toBe('alarga')
  })

  it('las que nacen unas en otras son un grupo, con el número de la primera, por mucho que se encadenen', () => {
    const grupos = unionesDe([
      { id: 1 },
      { id: 2 },
      { id: 3, nace: [{ incision: 1 }] },
      { id: 4, nace: [{ incision: 3 }] },
      { id: 5, nace: [{ incision: 9 }] },
    ])
    expect([...grupos.entries()]).toEqual([
      [1, 1],
      [2, 2],
      [3, 1],
      [4, 1],
      [5, 5],
    ])
    // La barra de la T junto a una punta tiene un número más alto que la incisión que nace en ella: el grupo es de la vieja.
    expect(unionesDe([{ id: 7 }, { id: 3, nace: [{ incision: 7 }] }]).get(7)).toBe(3)
  })

  it('las puntas libres son las que no dan a otra incisión del grupo: ni nacen ahí ni nace otra ahí', () => {
    const cortes = [
      { id: 1, puntos: [[0, 0, 0], [90, 0, 0]] as Punto[] },
      { id: 2, puntos: [[45, -1, 0], [45, 30, 0]] as Punto[], nace: [{ incision: 1, punto: [45, 0, 0] as Punto }] },
      { id: 3, puntos: [[89, 0, 0], [89, 30, 0]] as Punto[], nace: [{ incision: 1, punto: [89, 0, 0] as Punto }] },
    ]
    const libres = puntasLibresDe(cortes, 4)
    // La 1 tiene la 3 naciendo junto a su final: ese final ya no es punta.
    expect(libres.get(1)).toEqual({ inicio: true, final: false })
    expect(libres.get(2)).toEqual({ inicio: false, final: true })
    expect(libres.get(3)).toEqual({ inicio: false, final: true })
  })

  it('rehacer una incisión obliga a rehacer lo que nace en ella, en orden, y lo que nace en eso', () => {
    const cortes = [{ id: 1 }, { id: 2, nace: [{ incision: 1 }] }, { id: 3 }, { id: 4, nace: [{ incision: 2 }] }, { id: 5, nace: [{ incision: 3 }] }]
    expect(lasQueNacenEn(cortes, 1).map((c) => c.id)).toEqual([2, 4])
    expect(lasQueNacenEn(cortes, 3).map((c) => c.id)).toEqual([5])
    expect(lasQueNacenEn(cortes, 4)).toEqual([])
  })

  it('el panel dice de qué pedazos está hecha, el más largo primero, y con uno solo lo de siempre', () => {
    expect(medidaDeLaIncision({ largoMm: 145.4, tramosMm: [60.2, 85.2] })).toBe('85 + 60 mm')
    expect(medidaDeLaIncision({ largoMm: 92.4 })).toBe('92 mm')
    expect(medidaDeLaIncision({ largoMm: 92.4, tramosMm: [92.4] })).toBe('92 mm')
    expect(rotuloDeLaIncision(1, { capa: 'piel', largoMm: 145, aperturaMm: 20, tramosMm: [60, 85] })).toBe('Incisión 1 · piel · 85 + 60 mm · abierta 20 mm')
  })

  it('los dos brazos de un trazo que cruzó otra se leen como un tramo: la raya que se hizo, no sus mitades', () => {
    const cruce: Punto = [45, 0, 0]
    // La cruz: la incisión entera y los dos brazos que nacen en el mismo punto de ella, cada uno pasado su milímetro.
    const cruz = [
      { largoMm: 92 },
      { largoMm: 41, nace: [{ incision: 1, punto: [45, 0.6, 0] as Punto }] },
      { largoMm: 32, nace: [{ incision: 1, punto: [45, -0.6, 0] as Punto }] },
    ]
    expect(tramosDeLosTrazos(cruz, 4)).toEqual([92, 73])
    expect(medidaDeLaIncision({ largoMm: 165, tramosMm: tramosDeLosTrazos(cruz, 4) })).toBe('92 + 73 mm')
    // Dos T en la misma incisión pero en sitios distintos son dos trazos, y la T de una barra no se junta con su brazo.
    const dosT = [{ largoMm: 92 }, { largoMm: 30, nace: [{ incision: 1, punto: cruce }] }, { largoMm: 25, nace: [{ incision: 1, punto: [80, 0, 0] as Punto }] }]
    expect(tramosDeLosTrazos(dosT, 4)).toEqual([92, 30, 25])
    const tJuntoALaPunta = [{ largoMm: 85, nace: [{ incision: 2, punto: [3, 0, 0] as Punto }] }, { largoMm: 65 }]
    expect(tramosDeLosTrazos(tJuntoALaPunta, 4)).toEqual([85, 65])
    // El trazo que cruza dos paralelas: tres pedazos (fuera, entre las dos, fuera) y un solo tramo.
    const sobreDos = [
      { largoMm: 90 },
      { largoMm: 90 },
      { largoMm: 10, nace: [{ incision: 1, punto: [45, 0, 0] as Punto }] },
      { largoMm: 20, nace: [{ incision: 1, punto: [45, 0, 0] as Punto }, { incision: 2, punto: [45, 20, 0] as Punto }] },
      { largoMm: 10, nace: [{ incision: 2, punto: [45, 20, 0] as Punto }] },
    ]
    expect(tramosDeLosTrazos(sobreDos, 4)).toEqual([90, 90, 40])
  })

  it('el trazo que sale de una punta en ángulo es una L: la incisión pasa la esquina y la pierna nace donde estaba su punta', () => {
    const d = decidirElTrazo([incision], 'piel', por([91, 1, 0], [91, 40, 0]), opciones)
    expect(d.tipo).toBe('alarga')
    if (d.tipo !== 'alarga') return
    expect(d.codo).toBe(true)
    // La incisión, de frente y sin quebrarse: lo mismo y 3,5 mm más allá de la esquina, para que la pierna nazca en su grieta.
    expect(d.unida.puntos.every((p) => p[1] === 0)).toBe(true)
    expect(d.unida.puntos[d.unida.puntos.length - 1][0]).toBeCloseTo(90 + PASADO_DEL_CODO_MM, 6)
    expect(d.ramas).toHaveLength(1)
    const pierna = d.ramas![0]
    expect(pierna.nace).toEqual([{ en: 1, punto: [90, 0, 0] }])
    expect(pierna.puntos[0]).toEqual([90, 0, 0])
    expect(pierna.puntos[pierna.puntos.length - 1]).toEqual([91, 40, 0])
    // Recta de la punta a donde acabó la mano, sin el gancho hasta su primer punto, a 1,4 mm al lado (D-421).
    for (const p of pierna.puntos) expect(p[0] - 90).toBeCloseTo(p[1] / 40, 9)
  })

  it('el brazo que la mano empieza al lado de la punta sale de ella sin gancho, y acaba donde acabó la mano (D-421)', () => {
    // Como en la pierna del caso 86: la mano empieza 2 mm al lado y 1,5 por delante, y sigue recta, punto a punto.
    const puntos: Punto[] = []
    for (let y = 1.5; y <= 40; y += 1) puntos.push([92, y, 0])
    const d = decidirElTrazo([incision], 'piel', por(...puntos), opciones)
    if (d.tipo !== 'alarga' || !d.codo) throw new Error('debía ser una L')
    const pierna = d.ramas![0].puntos
    expect(pierna[0]).toEqual([90, 0, 0])
    expect(pierna[pierna.length - 1]).toEqual(puntos[puntos.length - 1])
    // Ningún tramo se tuerce más de 5° respecto de la pierna entera: el gancho de antes iba a 37°.
    const toda = [pierna[pierna.length - 1][0] - pierna[0][0], pierna[pierna.length - 1][1] - pierna[0][1]]
    for (let i = 1; i < pierna.length; i++) {
      const tramo = [pierna[i][0] - pierna[i - 1][0], pierna[i][1] - pierna[i - 1][1]]
      const coseno = (tramo[0] * toda[0] + tramo[1] * toda[1]) / (Math.hypot(...tramo) * Math.hypot(...toda))
      expect(coseno).toBeGreaterThan(Math.cos((5 * Math.PI) / 180))
    }
  })

  it('por la punta del inicio y con el trazo dibujado hacia la incisión, igual', () => {
    const d = decidirElTrazo([incision], 'piel', por([-30, -30, 0], [-1, -1, 0]), opciones)
    expect(d.tipo === 'alarga' && d.codo).toBe(true)
    if (d.tipo !== 'alarga') return
    expect(d.unida.puntos[0][0]).toBeCloseTo(-PASADO_DEL_CODO_MM, 6)
    expect(d.unida.puntos[d.unida.puntos.length - 1]).toEqual([90, 0, 0])
    // La pierna va de la punta hacia fuera, al revés de como se dibujó.
    expect(d.ramas![0].puntos[0]).toEqual([0, 0, 0])
    expect(d.ramas![0].puntos[d.ramas![0].puntos.length - 1]).toEqual([-30, -30, 0])
  })

  it('de frente, o girando menos que el umbral, la alarga como siempre', () => {
    const recto = decidirElTrazo([incision], 'piel', por([91, 0, 0], [130, 0, 0]), opciones)
    expect(recto.tipo === 'alarga' && !recto.codo).toBe(true)
    const giro = ((ANGULO_DEL_CODO_GRADOS - 5) * Math.PI) / 180
    const poco = decidirElTrazo([incision], 'piel', por([91, 0, 0], [91 + 40 * Math.cos(giro), 40 * Math.sin(giro), 0]), opciones)
    expect(poco.tipo === 'alarga' && !poco.codo).toBe(true)
    const mas = ((ANGULO_DEL_CODO_GRADOS + 5) * Math.PI) / 180
    const codo = decidirElTrazo([incision], 'piel', por([91, 0, 0], [91 + 40 * Math.cos(mas), 40 * Math.sin(mas), 0]), opciones)
    expect(codo.tipo === 'alarga' && codo.codo).toBe(true)
  })

  it('la punta que ya da a otra no hace codo, y el pulso de la mano no cuenta como giro', () => {
    const conLaFinalUnida = { ...incision, libres: { inicio: true, final: false } }
    expect(codoEnLaPunta(conLaFinalUnida, por([91, 1, 0], [91, 40, 0]), UMBRAL_PARA_ALARGAR_MM, 1)).toBeNull()
    // Un temblor de un milímetro en los primeros puntos de un trazo recto: la dirección se mide sobre 5 mm.
    const temblor = por([91, 0, 0], [92, 1, 0], [93, -0.5, 0], [130, 0, 0])
    expect(codoEnLaPunta(incision, temblor, UMBRAL_PARA_ALARGAR_MM, 1)).toBeNull()
  })

  it('la nueva punta de la L, la de la pasada, no es una punta libre: no se alarga desde la esquina', () => {
    const d = decidirElTrazo([incision], 'piel', por([91, 1, 0], [91, 40, 0]), opciones)
    if (d.tipo !== 'alarga') throw new Error('debía ser una L')
    const cortes = [
      { id: 1, puntos: d.unida.puntos, nace: undefined },
      { id: 2, puntos: d.ramas![0].puntos, nace: [{ incision: 1, punto: [90, 0, 0] as Punto }] },
    ]
    const libres = puntasLibresDe(cortes, 4)
    expect(libres.get(1)).toEqual({ inicio: true, final: false })
    expect(libres.get(2)).toEqual({ inicio: false, final: true })
  })
})

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { abrirCapa, cerrarCapa, cortarCapa, ladoDeLaHerida, sitioEnLaHerida } from '@/components/simulador/heridas'

/**
 * El pegamento entre el corte de mallas y la escena (D-167): `heridas.ts` pasa la
 * incisión al espacio de la malla, sustituye su geometría por la cortada y la
 * devuelve al cerrar. three funciona sin navegador mientras no se pida dibujar,
 * así que se prueba con mallas de verdad.
 */

/** Una «piel» plana de 20 × 20 unidades en el plano XY, con color y uv por vértice. */
function pielPlana(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(20, 20, 20, 20)
  const colores = new Uint8Array(g.attributes.position.count * 3).fill(200)
  g.setAttribute('color', new THREE.BufferAttribute(colores, 3, true))
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
  m.name = 'Piel'
  m.updateMatrixWorld(true)
  return m
}

/** Una incisión recta a lo largo de X, por encima de la piel (normal +Z). */
function incision(y = 0.3) {
  const puntos: THREE.Vector3[] = []
  const normales: THREE.Vector3[] = []
  for (let x = -5; x <= 5.001; x += 0.5) {
    puntos.push(new THREE.Vector3(x, y, 0))
    normales.push(new THREE.Vector3(0, 0, 1))
  }
  return { puntos, normales }
}

const PARAMETROS = { profundidad: 4, alcance: 6 }

describe('cortarCapa', () => {
  it('sustituye la geometría por la cortada y guarda la de antes', () => {
    const malla = pielPlana()
    const antes = malla.geometry
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, PARAMETROS)!
    expect(herida).not.toBeNull()
    expect(malla.geometry).not.toBe(antes)
    expect(herida.original).toBe(antes)
    expect(malla.geometry.getAttribute('position').count).toBeGreaterThan(antes.getAttribute('position').count)
  })

  it('conserva los atributos de cada vértice (el color y las uv) en los vértices nuevos', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    cortarCapa(malla, puntos, normales, PARAMETROS)
    const g = malla.geometry
    const n = g.getAttribute('position').count
    expect(g.getAttribute('color').count).toBe(n)
    expect(g.getAttribute('uv').count).toBe(n)
    expect(g.getAttribute('normal').count).toBe(n)
    // El color sigue siendo un entero normalizado: no se pasó a flotante.
    expect(g.getAttribute('color').normalized).toBe(true)
    expect((g.getAttribute('color').array as ArrayLike<number>)[0]).toBe(200)
  })

  it('una incisión que no toca la malla no la corta', () => {
    const malla = pielPlana()
    const lejos = incision(60)
    const antes = malla.geometry
    expect(cortarCapa(malla, lejos.puntos, lejos.normales, PARAMETROS)).toBeNull()
    expect(malla.geometry).toBe(antes)
  })

  it('una malla con varios materiales por grupos no se corta: reordenar sus triángulos los desordenaría', () => {
    const malla = pielPlana()
    malla.geometry.clearGroups()
    malla.geometry.addGroup(0, 600, 0)
    malla.geometry.addGroup(600, 1800, 1)
    const { puntos, normales } = incision()
    expect(cortarCapa(malla, puntos, normales, PARAMETROS)).toBeNull()
  })

  it('respeta la transformación de la malla: lo que se corta está donde se trazó en el mundo', () => {
    const malla = pielPlana()
    malla.position.set(100, 50, 0)
    malla.rotation.z = Math.PI / 2
    malla.scale.setScalar(2)
    malla.updateMatrixWorld(true)
    // La piel local de ±10 mide ±20 en el mundo; se traza sobre ella, rotada.
    const puntos: THREE.Vector3[] = []
    const normales: THREE.Vector3[] = []
    for (let k = -8; k <= 8; k += 1) {
      puntos.push(new THREE.Vector3(100 - 0.6, 50 + k, 0))
      normales.push(new THREE.Vector3(0, 0, 1))
    }
    const herida = cortarCapa(malla, puntos, normales, { profundidad: 8, alcance: 12 })!
    expect(herida).not.toBeNull()
    expect(herida.escala).toBeCloseTo(2, 5)
    expect(herida.corte.labios.mas.length).toBeGreaterThan(5)
    // El largo se mide en el mundo, no en el espacio de la malla.
    expect(herida.largo).toBeCloseTo(16, 3)
  })
})

describe('abrirCapa y cerrarCapa', () => {
  it('abrir separa los labios; con cero, la malla vuelve a lo que era', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, PARAMETROS)!
    const reposo = Float32Array.from(malla.geometry.getAttribute('position').array as Float32Array)
    abrirCapa(herida, 1.5, 1.5)
    const abierta = malla.geometry.getAttribute('position').array as Float32Array
    expect([...abierta]).not.toEqual([...reposo])
    expect(herida.mas).toBe(1.5)
    abrirCapa(herida, 0, 0)
    expect([...(malla.geometry.getAttribute('position').array as Float32Array)]).toEqual([...reposo])
  })

  it('el borde de la herida sigue a los labios', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, PARAMETROS)!
    const borde = herida.bordes.geometry.getAttribute('position') as THREE.BufferAttribute
    const antes = Float32Array.from(borde.array as Float32Array)
    abrirCapa(herida, 2, 2)
    expect([...(borde.array as Float32Array)]).not.toEqual([...antes])
    // El borde cuelga de la malla y no se pincha.
    expect(herida.bordes.parent).toBe(malla)
    expect(herida.bordes.raycast).toBeInstanceOf(Function)
  })

  it('cerrar devuelve la geometría original y quita el borde', () => {
    const malla = pielPlana()
    const original = malla.geometry
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, PARAMETROS)!
    abrirCapa(herida, 2, 2)
    cerrarCapa(herida)
    expect(malla.geometry).toBe(original)
    expect(herida.bordes.parent).toBeNull()
  })
})

describe('ladoDeLaHerida', () => {
  it('dice de qué labio es el punto más cercano y hacia dónde se aparta', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision(0)
    const herida = cortarCapa(malla, puntos, normales, PARAMETROS)!
    const arriba = ladoDeLaHerida(herida, new THREE.Vector3(0, 0.6, 0))!
    const abajo = ladoDeLaHerida(herida, new THREE.Vector3(0, -0.6, 0))!
    expect(arriba.lado).not.toBe(abajo.lado)
    // Cerca del borde: a menos de un milímetro de unidad.
    expect(arriba.cerca).toBeLessThan(1.2)
    // Las dos direcciones son unitarias y opuestas en su lado: el labio «más» se aparta hacia +direccion.
    expect(arriba.direccion.length()).toBeCloseTo(1, 5)
    expect(Math.abs(arriba.direccion.dot(new THREE.Vector3(0, 1, 0)))).toBeGreaterThan(0.9)
  })
})

describe('la cinta: una incisión recién hecha no desaparece', () => {
  // La piel de la prueba mide 20 unidades: se toma la unidad como milímetro para hablar en milímetros.
  const EN_MM = { ...PARAMETROS, unidadesPorMm: 1 }

  it('con la herida cerrada, la cinta existe, está a la vista y mide el ancho mínimo', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, EN_MM)!
    expect(herida.cinta.parent).toBe(malla)
    expect(herida.cinta.visible).toBe(true)
    // Es decoración: no se pincha ni compite con la piel al elegir qué se corta.
    expect(herida.cinta.raycast).toBeInstanceOf(Function)
    const cinta = herida.cinta.geometry.getAttribute('position') as THREE.BufferAttribute
    const ancho = (i: number) => Math.hypot(cinta.getX(2 * i) - cinta.getX(2 * i + 1), cinta.getY(2 * i) - cinta.getY(2 * i + 1))
    const medio = Math.floor(cinta.count / 4)
    expect(ancho(medio)).toBeCloseTo(2.4, 1)
  })

  it('al abrirse hasta el ancho mínimo se mantiene; al pasar de los 5 mm se aparta y deja ver el plano de debajo', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, EN_MM)!
    abrirCapa(herida, 1, 1)
    expect(herida.cinta.visible).toBe(true)
    abrirCapa(herida, 4, 4)
    expect(herida.cinta.visible).toBe(false)
    // Y al cerrar otra vez, vuelve: la incisión sigue ahí.
    abrirCapa(herida, 0, 0)
    expect(herida.cinta.visible).toBe(true)
  })

  it('cerrar la herida quita también la cinta de la malla', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, EN_MM)!
    cerrarCapa(herida)
    expect(herida.cinta.parent).toBeNull()
  })
})

describe('abrir según un perfil: el separador abre donde está puesto', () => {
  const EN_MM = { profundidad: 4, alcance: 6, unidadesPorMm: 1 }

  /** La separación entre los dos labios, medida donde la incisión pasa por el punto `t` (de 0 a 1). */
  function separacionEn(h: NonNullable<ReturnType<typeof cortarCapa>>, t: number) {
    const p = h.malla.geometry.getAttribute('position') as THREE.BufferAttribute
    let mejor = 0
    for (let k = 0; k < h.corte.labios.mas.length; k++) {
      const i = h.corte.labios.mas[k]
      if (Math.abs(h.corte.largoT[i] - t) < Math.abs(h.corte.largoT[h.corte.labios.mas[mejor]] - t)) mejor = k
    }
    const [a, b] = [h.corte.labios.mas[mejor], h.corte.labios.menos[mejor]]
    return Math.hypot(p.getX(a) - p.getX(b), p.getY(a) - p.getY(b), p.getZ(a) - p.getZ(b))
  }

  it('con un perfil que solo abre el primer tercio, ahí hay hueco y en el otro extremo no', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, EN_MM)!
    abrirCapa(herida, 3, 3, (t) => (t < 0.35 ? { mas: 3, menos: 3 } : { mas: 0, menos: 0 }))
    expect(separacionEn(herida, 0.3)).toBeGreaterThan(separacionEn(herida, 0.85) + 1)
    // El perfil se guarda para poder reaplicarlo cuando cambie algo (por ejemplo, otra capa que se corta).
    expect(herida.perfil).toBeInstanceOf(Function)
    expect(herida.mas).toBe(3)
  })

  it('sin perfil, abre parejo a lo largo (como siempre)', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, EN_MM)!
    abrirCapa(herida, 2, 2)
    expect(herida.perfil).toBeUndefined()
    expect(separacionEn(herida, 0.5)).toBeGreaterThan(3)
    expect(Math.abs(separacionEn(herida, 0.45) - separacionEn(herida, 0.55))).toBeLessThan(0.3)
  })
})

describe('ladoDeLaHerida también dice dónde está el punto a lo largo de la incisión', () => {
  it('t crece de un extremo al otro, para que cada separador se acuerde de su sitio', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision(0)
    const herida = cortarCapa(malla, puntos, normales, PARAMETROS)!
    const alPrincipio = ladoDeLaHerida(herida, new THREE.Vector3(-4, 0.3, 0))!
    const alMedio = ladoDeLaHerida(herida, new THREE.Vector3(0, 0.3, 0))!
    const alFinal = ladoDeLaHerida(herida, new THREE.Vector3(4, 0.3, 0))!
    expect(alPrincipio.t).toBeLessThan(alMedio.t)
    expect(alMedio.t).toBeLessThan(alFinal.t)
    expect(alMedio.t).toBeGreaterThan(0.35)
    expect(alMedio.t).toBeLessThan(0.65)
  })
})

describe('la cinta se tiende por el trazo, no por los vértices de los labios', () => {
  it('tiene un par de vértices por nodo del trazo y cada par queda junto al punto que se pinchó', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision(0.3)
    const herida = cortarCapa(malla, puntos, normales, { profundidad: 4, alcance: 6, unidadesPorMm: 1 })!
    const nodos = herida.corte.curva.tramos.length + 1
    const cinta = herida.cinta.geometry.getAttribute('position') as THREE.BufferAttribute
    expect(cinta.count).toBe(2 * nodos)
    // Los nodos están sobre la piel (z = 0) y la cinta va un milímetro por encima, centrada en el corte.
    for (let k = 0; k < nodos; k++) {
      const cz = (cinta.getZ(2 * k) + cinta.getZ(2 * k + 1)) / 2
      const cy = (cinta.getY(2 * k) + cinta.getY(2 * k + 1)) / 2
      expect(cz).toBeCloseTo(1, 3)
      expect(cy).toBeCloseTo(0.3, 3)
    }
  })

  it('con una malla de triángulos largos, la cinta sigue entera donde los vértices de los labios están lejos', () => {
    // Pocas filas y columnas: los vértices de los labios quedan a 10 unidades unos de otros, pero la cinta no se
    // parte porque sus nodos son los del trazo (a 0,5 unidades).
    const g = new THREE.PlaneGeometry(20, 20, 2, 2)
    const malla = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
    malla.updateMatrixWorld(true)
    const { puntos, normales } = incision(0.3)
    const herida = cortarCapa(malla, puntos, normales, { profundidad: 4, alcance: 6, unidadesPorMm: 1 })!
    expect(herida).not.toBeNull()
    const nodos = herida.corte.curva.tramos.length + 1
    expect(nodos).toBeGreaterThan(herida.corte.labios.mas.length)
    const cinta = herida.cinta.geometry.getAttribute('position') as THREE.BufferAttribute
    let mayorSalto = 0
    for (let k = 1; k < nodos; k++) {
      mayorSalto = Math.max(mayorSalto, Math.abs(cinta.getX(2 * k) - cinta.getX(2 * k - 2)))
    }
    expect(mayorSalto).toBeLessThan(1.5)
  })

  it('al abrir con perfil, la cinta se ensancha donde abre el separador y no en el otro extremo', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision(0.3)
    const herida = cortarCapa(malla, puntos, normales, { profundidad: 4, alcance: 6, unidadesPorMm: 1 })!
    // 4 mm de apertura al principio de la herida: la cinta sigue a la vista (menos de 5 mm), más ancha ahí.
    abrirCapa(herida, 4, 0, (t) => (t < 0.5 ? { mas: 4, menos: 0 } : { mas: 0, menos: 0 }))
    const cinta = herida.cinta.geometry.getAttribute('position') as THREE.BufferAttribute
    const ancho = (k: number) => Math.hypot(cinta.getX(2 * k) - cinta.getX(2 * k + 1), cinta.getY(2 * k) - cinta.getY(2 * k + 1))
    const nodos = cinta.count / 2
    expect(herida.cinta.visible).toBe(true)
    expect(ancho(Math.floor(nodos * 0.4))).toBeGreaterThan(ancho(Math.floor(nodos * 0.9)) + 0.5)
  })
})

describe('sitioEnLaHerida: el sitio a una fracción del largo (P-003 E3.2)', () => {
  it('recorre la incisión de un extremo al otro, sobre la piel y con su normal', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, PARAMETROS)!
    const inicio = sitioEnLaHerida(herida, 0, 1)!
    const medio = sitioEnLaHerida(herida, 0.5, 1)!
    const fin = sitioEnLaHerida(herida, 1, 1)!
    expect(inicio.punto.x).toBeCloseTo(-5, 1)
    expect(medio.punto.x).toBeCloseTo(0, 0)
    expect(fin.punto.x).toBeCloseTo(5, 1)
    for (const s of [inicio, medio, fin]) {
      expect(s.punto.z).toBeCloseTo(0, 5)
      expect(s.normal.z).toBeGreaterThan(0.99)
    }
  })

  it('el lado contrario mira al contrario, y los dos son perpendiculares a la incisión', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, PARAMETROS)!
    const mas = sitioEnLaHerida(herida, 0.5, 1)!
    const menos = sitioEnLaHerida(herida, 0.5, -1)!
    expect(mas.direccion.dot(menos.direccion)).toBeCloseTo(-1, 5)
    expect(Math.abs(mas.direccion.x)).toBeLessThan(1e-6)
    expect(Math.abs(mas.direccion.y)).toBeGreaterThan(0.99)
  })

  it('no suma la apertura: el separador ya la suma al posarse', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, PARAMETROS)!
    const cerrada = sitioEnLaHerida(herida, 0.5, 1)!
    abrirCapa(herida, 2, 2)
    const abierta = sitioEnLaHerida(herida, 0.5, 1)!
    expect(abierta.punto.distanceTo(cerrada.punto)).toBeLessThan(1e-6)
  })

  it('una fracción fuera de rango se acota a los extremos', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, PARAMETROS)!
    expect(sitioEnLaHerida(herida, -3, 1)!.punto.x).toBeCloseTo(-5, 1)
    expect(sitioEnLaHerida(herida, 9, 1)!.punto.x).toBeCloseTo(5, 1)
  })

  it('concuerda con lo que dice ladoDeLaHerida del mismo punto', () => {
    const malla = pielPlana()
    const { puntos, normales } = incision()
    const herida = cortarCapa(malla, puntos, normales, PARAMETROS)!
    const sitio = sitioEnLaHerida(herida, 0.5, 1)!
    const info = ladoDeLaHerida(herida, sitio.punto.clone().addScaledVector(sitio.direccion, 0.3))!
    expect(info.lado).toBe(1)
    expect(info.direccion.dot(sitio.direccion)).toBeGreaterThan(0.99)
    expect(info.t).toBeCloseTo(sitio.t, 1)
  })
})

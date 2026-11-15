import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  ABERTURA_QUE_YA_SE_VE_MM,
  ARISTA_JUNTO_AL_CORTE_MM,
  aberturaDe,
  abrirCapa,
  asentarHeridas,
  cadenaDeLaMalla,
  cerrarCapa,
  cortarCapa,
  reposoVigente,
  verticeEnReposo,
  type HeridaEnCapa,
} from '@/components/simulador/heridas'
import { aplicarSeparadoresALasHeridas, labioEnLaPosicion } from '@/components/simulador/exposicionEnLaEscena'
import { huso } from '@/lib/corteDeMalla'
import { topeDeLaRetraccionMm } from '@/lib/retraccionDelCorte'
import type { CapaDeLaHerida, SeparadorColocado } from '@/lib/exposicion'

/**
 * La herida que se abre sola, en la escena (P-015).
 *
 * Pedido del dueño: «cuando se corta la piel no parece un corte limpio sino que parece cristal; quiero que cuando se
 * corte piel, fascias, músculos se puedan retraer como en la realidad». `retraccionDelCorte.test.ts` prueba la cuenta
 * y la malla; aquí, lo que `heridas.ts` hace con ellas sobre mallas de verdad: la herida nace abierta, la cinta roja
 * deja de taparla, la sutura la cierra, y el color y la textura no se estropean al afinar la franja.
 *
 * Unidades de 1 mm: unidadesPorMm = 1.
 */

const ANCHO = 100

/** Una «piel» plana de 100 × 100 mm con triángulos de 4 mm, como la del atlas, con textura, color y una marca por vértice. */
function piel(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(ANCHO, ANCHO, 25, 25)
  const n = g.attributes.position.count
  const colores = new Uint8Array(n * 3)
  const marca = new Uint16Array(n)
  for (let i = 0; i < n; i++) {
    // El rojo cambia a lo ancho, de 0 en un borde a 250 en el otro: un color que se copie del vecino se nota.
    colores[3 * i] = Math.round((250 * (g.attributes.position.getX(i) + ANCHO / 2)) / ANCHO)
    colores[3 * i + 1] = 90
    colores[3 * i + 2] = 60
    marca[i] = 1000 + i
  }
  g.setAttribute('color', new THREE.BufferAttribute(colores, 3, true))
  g.setAttribute('marca', new THREE.BufferAttribute(marca, 1, false))
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
  m.name = 'Piel'
  m.updateMatrixWorld(true)
  return m
}

/** Una incisión recta a lo largo de X, de `2·mitad` milímetros, con un punto por milímetro. */
function trazo(mitad = 20, y = 0.3) {
  const puntos: THREE.Vector3[] = []
  const normales: THREE.Vector3[] = []
  for (let x = -mitad; x <= mitad + 0.001; x += 1) {
    puntos.push(new THREE.Vector3(x, y, 0))
    normales.push(new THREE.Vector3(0, 0, 1))
  }
  return { puntos, normales }
}

const PARAMETROS = { profundidad: 4, alcance: 30, unidadesPorMm: 1 }

function cortar(malla: THREE.Mesh, cambios: Partial<Parameters<typeof cortarCapa>[3]> = {}, mitad = 20, y = 0.3): HeridaEnCapa {
  const { puntos, normales } = trazo(mitad, y)
  return cortarCapa(malla, puntos, normales, { ...PARAMETROS, ...cambios })!
}

const posicionesDe = (h: HeridaEnCapa) => h.malla.geometry.getAttribute('position') as THREE.BufferAttribute

/** Cuántos triángulos miran ahora al revés de como miraban con la herida cerrada: el tejido plegado sobre sí mismo. */
const vueltos = (h: HeridaEnCapa) => {
  const antes = h.corte.posiciones
  const ahora = posicionesDe(h).array as Float32Array
  const ind = h.corte.indices
  const normal = (q: ArrayLike<number>, a: number, b: number, c: number) => {
    const u = [q[3 * b] - q[3 * a], q[3 * b + 1] - q[3 * a + 1], q[3 * b + 2] - q[3 * a + 2]]
    const v = [q[3 * c] - q[3 * a], q[3 * c + 1] - q[3 * a + 1], q[3 * c + 2] - q[3 * a + 2]]
    return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
  }
  let n = 0
  for (let t = 0; t + 2 < ind.length; t += 3) {
    const n0 = normal(antes, ind[t], ind[t + 1], ind[t + 2])
    const n1 = normal(ahora, ind[t], ind[t + 1], ind[t + 2])
    if (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2] < 0) n++
  }
  return n
}

/** El vértice de ese labio más cercano a la fracción `t` del largo. */
const enElLabio = (h: HeridaEnCapa, lado: 'mas' | 'menos', t: number) =>
  h.corte.labios[lado].reduce((m, i) => (Math.abs(h.corte.largoT[i] - t) < Math.abs(h.corte.largoT[m] - t) ? i : m))

/** Lo que mide el hueco entre los dos labios a esa fracción del largo, con la geometría de ahora. */
const hueco = (h: HeridaEnCapa, t: number) => {
  const p = posicionesDe(h)
  return Math.abs(p.getY(enElLabio(h, 'mas', t)) - p.getY(enElLabio(h, 'menos', t)))
}

describe('una herida con retracción nace abierta', () => {
  it('sin que nadie la abra, los labios quedan apartados lo que el tejido se retrae, y el panel lo cuenta', () => {
    const h = cortar(piel(), { retraccion: 2.1 })
    expect(h.reposo).toBe(2.1)
    expect(h.mas).toBe(0)
    expect(h.menos).toBe(0)
    expect(reposoVigente(h)).toBe(2.1)
    // Los dos labios: 4,2 mm en lo más ancho.
    expect(aberturaDe(h)).toBeCloseTo(4.2, 6)
    expect(hueco(h, 0.5)).toBeCloseTo(4.2, 1)
    // En huso: a un cuarto, tres cuartos; hacia la punta, casi nada.
    expect(hueco(h, 0.25)).toBeCloseTo(4.2 * 0.75, 0)
    expect(hueco(h, 0.02)).toBeLessThan(1)
    expect(hueco(h, 0.98)).toBeLessThan(1)
  })

  it('sin retracción el corte es el de siempre: labios juntos y la malla en su sitio', () => {
    const h = cortar(piel())
    expect(h.reposo).toBe(0)
    expect(aberturaDe(h)).toBe(0)
    expect(hueco(h, 0.5)).toBe(0)
    expect([...(posicionesDe(h).array as Float32Array)]).toEqual([...h.corte.posiciones])
  })

  it('una grieta corta se abre lo que aguanta y no lo que pide la incisión, y no se pliega', () => {
    // Un trazo de 4 mm en medio de la piel: la grieta se cierra por las dos puntas. Se le pide lo que pediría un corte
    // de cuatro centímetros a través de las fibras, como a la vena del caso 4.
    const h = cortar(piel(), { retraccion: 4.7, afinar: ARISTA_JUNTO_AL_CORTE_MM }, 2)
    const grietaMm = (h.corte.grieta.hasta - h.corte.grieta.desde) * h.corte.curva.largoTotal
    expect(h.corte.grieta.cerradaAlInicio && h.corte.grieta.cerradaAlFinal).toBe(true)
    expect(h.reposo).toBeCloseTo(topeDeLaRetraccionMm(grietaMm, true), 9)
    expect(h.reposo).toBeLessThan(1)
    expect(vueltos(h)).toBe(0)
  })

  it('una tira partida de lado a lado no tiene punta que la cierre: sus cabos se apartan enteros, sin tope', () => {
    // Una cinta de 10 mm de ancho —un tendón, un vaso— y un trazo de 40 mm que la cruza entera.
    const g = new THREE.PlaneGeometry(10, ANCHO, 5, 25)
    const tira = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
    tira.updateMatrixWorld(true)
    const h = cortar(tira, { retraccion: 4.7, afinar: ARISTA_JUNTO_AL_CORTE_MM })
    expect(h.corte.grieta.cerradaAlInicio || h.corte.grieta.cerradaAlFinal).toBe(false)
    expect(h.reposo).toBe(4.7)
    expect(vueltos(h)).toBe(0)
    // Cada cabo se aparta entero: lo mismo en el medio que en el borde de la tira.
    expect(hueco(h, 0.5)).toBeCloseTo(9.4, 1)
    const p = posicionesDe(h)
    const enElBorde = (lado: 'mas' | 'menos') =>
      h.corte.labios[lado].reduce((m, i) => (Math.abs(p.getX(i)) > Math.abs(p.getX(m)) ? i : m))
    expect(Math.abs(p.getY(enElBorde('mas')) - p.getY(enElBorde('menos')))).toBeCloseTo(9.4, 1)
  })

  it('una retracción negativa o sin número no abre nada hacia dentro', () => {
    expect(cortar(piel(), { retraccion: -3 }).reposo).toBe(0)
    expect(cortar(piel(), { retraccion: undefined }).reposo).toBe(0)
  })

  it('una incisión de hasta 6 cm es un solo arco; una más larga abre pareja en el medio', () => {
    expect(cortar(piel(), { retraccion: 2 }, 20).punta).toBe(0.5)
    const larga = cortar(piel(), { retraccion: 2 }, 45)
    // 90 mm de trazo, y la grieta unos milímetros menos (acaba en el último cruce con una arista): cada punta se
    // cierra en sus últimos 30, que es algo más de un tercio de ella.
    expect(larga.punta).toBeGreaterThanOrEqual(30 / 90)
    expect(larga.punta).toBeLessThan(30 / 80)
    expect(hueco(larga, 0.4)).toBeCloseTo(4, 1)
    expect(hueco(larga, 0.5)).toBeCloseTo(4, 1)
    expect(hueco(larga, 0.6)).toBeCloseTo(4, 1)
    expect(hueco(larga, 0.1)).toBeLessThan(3)
  })

  it('el sitio de reposo de cada vértice es el cerrado más lo que su labio se retrae', () => {
    const h = cortar(piel(), { retraccion: 2.1 })
    const p = posicionesDe(h)
    const v = new THREE.Vector3()
    for (const cadena of [h.corte.labios.mas, h.corte.labios.menos]) {
      for (const i of cadena) {
        verticeEnReposo(h, i, v)
        expect(v.x).toBeCloseTo(p.getX(i), 4)
        expect(v.y).toBeCloseTo(p.getY(i), 4)
        expect(v.z).toBeCloseTo(p.getZ(i), 4)
      }
    }
    // Y no cambia porque una hoja aparte el labio: es el «antes» contra el que se mide la hoja.
    const medio = enElLabio(h, 'mas', 0.5)
    const antes = verticeEnReposo(h, medio).clone()
    abrirCapa(h, 6, 0)
    expect(verticeEnReposo(h, medio).distanceTo(antes)).toBeLessThan(1e-6)
    expect(Math.abs(posicionesDe(h).getY(medio) - antes.y)).toBeCloseTo(6, 1)
  })
})

describe('lo que aparta una hoja se suma a lo que la herida ya se había abierto', () => {
  it('el labio que se sostiene se aparta lo de la hoja desde su reposo, y el de enfrente se queda donde descansaba', () => {
    const h = cortar(piel(), { retraccion: 2.1 })
    const mas = enElLabio(h, 'mas', 0.5)
    const menos = enElLabio(h, 'menos', 0.5)
    const cerrado = (i: number) => h.corte.posiciones[3 * i + 1]
    abrirCapa(h, 6, 0)
    const p = posicionesDe(h)
    expect(Math.abs(p.getY(mas) - cerrado(mas))).toBeCloseTo(6 + 2.1, 1)
    expect(Math.abs(p.getY(menos) - cerrado(menos))).toBeCloseTo(2.1, 1)
    expect(aberturaDe(h)).toBeCloseTo(6 + 4.2, 6)
  })

  const farabeuf = (cambios: Partial<SeparadorColocado> = {}): SeparadorColocado => ({
    id: 1,
    instrumentoId: 'farabeuf',
    nombre: 'Separador de Farabeuf',
    tipo: 'mano',
    plano: 'piel',
    lado: 1,
    posicion: 0.5,
    maximoMm: 30,
    aperturaMm: 12,
    incision: 1,
    ...cambios,
  })

  for (const apertura of [1, 6, 12]) {
    it(`un Farabeuf abierto ${apertura} mm aparta el borde ${apertura} mm desde donde descansaba: lo que dice la rueda es lo que se mueve`, () => {
      const h = cortar(piel(), { retraccion: 3.5, incision: 1 })
      const heridas = new Map<CapaDeLaHerida, HeridaEnCapa[]>([['piel', [h]]])
      aplicarSeparadoresALasHeridas(heridas, [farabeuf({ aperturaMm: apertura })], [], 1)
      const borde = labioEnLaPosicion(h, 1, 0.5)!
      expect(borde.ahora.distanceTo(borde.reposo)).toBeCloseTo(apertura, 1)
      // El de enfrente no lo sostiene nadie: sigue donde lo dejó la retracción.
      const enfrente = labioEnLaPosicion(h, -1, 0.5)!
      expect(enfrente.ahora.distanceTo(enfrente.reposo)).toBeLessThan(0.05)
      // Y el hueco es lo de la hoja más lo que la herida ya se abría por los dos lados.
      expect(hueco(h, 0.5)).toBeCloseTo(apertura + 2 * 3.5, 0)
    })
  }
})

describe('la cinta roja deja de tapar la herida en cuanto se ve sola', () => {
  it('una punción que apenas se abre conserva su cinta: sin ella no se vería', () => {
    const h = cortar(piel(), { retraccion: 0.5 })
    expect(aberturaDe(h)).toBeLessThan(ABERTURA_QUE_YA_SE_VE_MM)
    expect(h.cinta.visible).toBe(true)
    expect(h.bordes.visible).toBe(true)
  })

  it('una incisión que se abre de verdad ya no la lleva, y conserva el filo', () => {
    const h = cortar(piel(), { retraccion: 2.1 })
    expect(h.cinta.visible).toBe(false)
    expect(h.bordes.visible).toBe(true)
  })

  it('abierta con una hoja más allá de 5 mm, se va también el filo', () => {
    const h = cortar(piel(), { retraccion: 2.1 })
    abrirCapa(h, 4, 0)
    expect(h.cinta.visible).toBe(false)
    expect(h.bordes.visible).toBe(false)
  })

  it('una herida sin retracción sigue con la regla de antes: la cinta se queda hasta los 5 mm', () => {
    const h = cortar(piel())
    abrirCapa(h, 1, 1)
    expect(h.cinta.visible).toBe(true)
    abrirCapa(h, 3, 3)
    expect(h.cinta.visible).toBe(false)
  })

  it('mientras la herida se está abriendo, la cinta marca el sitio hasta que el hueco se distingue', () => {
    const h = cortar(piel(), { retraccion: 2.1 })
    asentarHeridas([h], 0)
    expect(h.cinta.visible).toBe(true)
    asentarHeridas([h], 0.2)
    expect(aberturaDe(h)).toBeLessThan(ABERTURA_QUE_YA_SE_VE_MM)
    expect(h.cinta.visible).toBe(true)
    asentarHeridas([h], 1)
    expect(h.cinta.visible).toBe(false)
  })
})

describe('la sutura cierra también lo que el tejido se había apartado solo', () => {
  it('con media tensión el hueco es la mitad; sin tensión, los labios vuelven a tocarse', () => {
    const h = cortar(piel(), { retraccion: 2.1 })
    abrirCapa(h, 0, 0, undefined, 0.5)
    expect(h.tension).toBe(0.5)
    expect(hueco(h, 0.5)).toBeCloseTo(2.1, 1)
    expect(aberturaDe(h)).toBeCloseTo(2.1, 6)

    abrirCapa(h, 0, 0, undefined, 0)
    expect(hueco(h, 0.5)).toBe(0)
    expect(aberturaDe(h)).toBe(0)
    expect([...(posicionesDe(h).array as Float32Array)]).toEqual([...h.corte.posiciones])
  })

  it('abrir sin decir la tensión conserva la que tenía: mover un separador no descose', () => {
    const h = cortar(piel(), { retraccion: 2.1 })
    abrirCapa(h, 0, 0, undefined, 0.25)
    abrirCapa(h, 3, 0)
    expect(h.tension).toBe(0.25)
    expect(aberturaDe(h)).toBeCloseTo(3 + 2 * 2.1 * 0.25, 6)
    // Y una tensión fuera de rango se acota.
    abrirCapa(h, 0, 0, undefined, 7)
    expect(h.tension).toBe(1)
    abrirCapa(h, 0, 0, undefined, -1)
    expect(h.tension).toBe(0)
  })
})

describe('asentarHeridas: el paso de la animación con que la herida se abre', () => {
  it('de cerrada a abierta del todo, y acotado entre las dos', () => {
    const h = cortar(piel(), { retraccion: 2.1 })
    asentarHeridas([h], 0)
    expect(hueco(h, 0.5)).toBe(0)
    asentarHeridas([h], 0.5)
    expect(hueco(h, 0.5)).toBeCloseTo(2.1, 1)
    asentarHeridas([h], 3)
    expect(h.asentada).toBe(1)
    expect(hueco(h, 0.5)).toBeCloseTo(4.2, 1)
    asentarHeridas([h], -2)
    expect(h.asentada).toBe(0)
  })

  it('una herida que ya se cerró —se deshizo el corte a media animación— se salta sin tocar la malla', () => {
    const malla = piel()
    const original = malla.geometry
    const h = cortar(malla, { retraccion: 2.1 })
    asentarHeridas([h], 0.3)
    cerrarCapa(h)
    expect(malla.geometry).toBe(original)
    const antes = Float32Array.from(original.getAttribute('position').array as Float32Array)
    expect(() => asentarHeridas([h], 0.8)).not.toThrow()
    expect(h.asentada).toBe(0.3)
    expect([...(original.getAttribute('position').array as Float32Array)]).toEqual([...antes])
  })

  it('dos heridas de la misma malla se asientan a la vez', () => {
    const malla = piel()
    const una = cortar(malla, { retraccion: 2 }, 15, 20.3)
    const otra = cortar(malla, { retraccion: 2 }, 15, -20.3)
    asentarHeridas([una, otra], 0.5)
    expect(hueco(una, 0.5)).toBeCloseTo(2, 1)
    expect(hueco(otra, 0.5)).toBeCloseTo(2, 1)
  })
})

describe('cerrar y volver a cortar', () => {
  it('cerrar una herida abierta sola devuelve la geometría de antes del corte', () => {
    const malla = piel()
    const original = malla.geometry
    const antes = Float32Array.from(original.getAttribute('position').array as Float32Array)
    const h = cortar(malla, { retraccion: 2.1, afinar: ARISTA_JUNTO_AL_CORTE_MM })
    expect(malla.geometry).not.toBe(original)
    cerrarCapa(h)
    expect(malla.geometry).toBe(original)
    expect([...(original.getAttribute('position').array as Float32Array)]).toEqual([...antes])
    expect(cadenaDeLaMalla(malla)).toEqual([])
  })

  it('una herida cosida no se vuelve a abrir porque se cierre otra hecha antes en la misma piel', () => {
    const malla = piel()
    const primera = cortar(malla, { retraccion: 2 }, 15, 20.3)
    const segunda = cortar(malla, { retraccion: 2 }, 15, -20.3)
    abrirCapa(segunda, 0, 0, undefined, 0.4)
    expect(hueco(segunda, 0.5)).toBeCloseTo(1.6, 1)
    // Deshacer la primera rehace la segunda sobre la piel sin cortar, en el mismo objeto.
    expect(cerrarCapa(primera)).toEqual([])
    expect(cadenaDeLaMalla(malla)).toEqual([segunda])
    expect(segunda.tension).toBe(0.4)
    expect(segunda.reposo).toBe(2)
    expect(hueco(segunda, 0.5)).toBeCloseTo(1.6, 1)
  })

  it('una segunda incisión no cierra lo que la primera se había abierto', () => {
    const malla = piel()
    const primera = cortar(malla, { retraccion: 2, afinar: ARISTA_JUNTO_AL_CORTE_MM }, 15, 20.3)
    expect(hueco(primera, 0.5)).toBeCloseTo(4, 1)
    const segunda = cortar(malla, { retraccion: 1, afinar: ARISTA_JUNTO_AL_CORTE_MM }, 15, -20.3)
    expect(hueco(primera, 0.5)).toBeCloseTo(4, 1)
    expect(hueco(segunda, 0.5)).toBeCloseTo(2, 1)
    // Ningún triángulo de la piel quedó del revés: la malla plana sigue mirando a +Z.
    const p = posicionesDe(segunda)
    const indices = malla.geometry.getIndex()!
    let vueltos = 0
    for (let t = 0; t < indices.count; t += 3) {
      const [a, b, c] = [indices.getX(t), indices.getX(t + 1), indices.getX(t + 2)]
      const area = (p.getX(b) - p.getX(a)) * (p.getY(c) - p.getY(a)) - (p.getY(b) - p.getY(a)) * (p.getX(c) - p.getX(a))
      if (area < -1e-6) vueltos++
    }
    expect(vueltos).toBe(0)
  })
})

describe('con la franja afinada, el color y la textura siguen donde estaban', () => {
  const uvDe = (x: number, y: number) => [(x + ANCHO / 2) / ANCHO, (y + ANCHO / 2) / ANCHO]

  it('la malla gana vértices junto al corte y todos sus atributos los acompañan', () => {
    const sin = cortar(piel(), { retraccion: 2.1 })
    const con = cortar(piel(), { retraccion: 2.1, afinar: ARISTA_JUNTO_AL_CORTE_MM })
    const n = con.malla.geometry.getAttribute('position').count
    expect(n).toBeGreaterThan(sin.malla.geometry.getAttribute('position').count)
    for (const nombre of ['uv', 'color', 'marca', 'normal']) expect(con.malla.geometry.getAttribute(nombre).count).toBe(n)
  })

  it('la textura de cada vértice nuevo es la del sitio en que está, no la de un vecino', () => {
    const h = cortar(piel(), { retraccion: 2.1, afinar: ARISTA_JUNTO_AL_CORTE_MM })
    const uv = h.malla.geometry.getAttribute('uv')
    const n = uv.count
    const originales = 26 * 26
    expect(n).toBeGreaterThan(originales + 100)
    for (let i = 0; i < n; i++) {
      // Con la herida cerrada: la textura va con la piel, no con lo que se aparta.
      const [u, v] = uvDe(h.corte.posiciones[3 * i], h.corte.posiciones[3 * i + 1])
      expect(uv.getX(i)).toBeCloseTo(u, 4)
      expect(uv.getY(i)).toBeCloseTo(v, 4)
    }
  })

  it('el color, en bytes, también: interpolado y redondeado, sin pasarse a flotante', () => {
    const h = cortar(piel(), { retraccion: 2.1, afinar: ARISTA_JUNTO_AL_CORTE_MM })
    const color = h.malla.geometry.getAttribute('color') as THREE.BufferAttribute
    expect(color.normalized).toBe(true)
    expect(color.array).toBeInstanceOf(Uint8Array)
    const crudo = color.array as Uint8Array
    for (let i = 0; i < color.count; i++) {
      const esperado = (250 * (h.corte.posiciones[3 * i] + ANCHO / 2)) / ANCHO
      // Un tono de margen por vértice: cada mitad redondea, y un vértice nuevo sale de otros que ya redondearon.
      expect(Math.abs(crudo[3 * i] - esperado)).toBeLessThanOrEqual(2)
      expect(crudo[3 * i + 1]).toBe(90)
      expect(crudo[3 * i + 2]).toBe(60)
    }
  })

  it('lo que no admite promedio —un entero sin normalizar— se copia de uno de los dos, entero', () => {
    const h = cortar(piel(), { retraccion: 2.1, afinar: ARISTA_JUNTO_AL_CORTE_MM })
    const marca = h.malla.geometry.getAttribute('marca') as THREE.BufferAttribute
    expect(marca.array).toBeInstanceOf(Uint16Array)
    const originales = 26 * 26
    const { desde, de } = h.corte.mezcla
    expect(desde).toBe(originales)
    for (let i = 0; i < originales; i++) expect(marca.getX(i)).toBe(1000 + i)
    for (let i = originales; i < marca.count; i++) {
      const j = i - desde
      expect([marca.getX(de[2 * j]), marca.getX(de[2 * j + 1])]).toContain(marca.getX(i))
      expect(marca.getX(i)).toBeGreaterThanOrEqual(1000)
      expect(marca.getX(i)).toBeLessThan(1000 + originales)
    }
  })

  it('el huso se reparte igual con la franja afinada: lo que cambia es con cuántos vértices se dobla', () => {
    const sin = cortar(piel(), { retraccion: 2.1 })
    const con = cortar(piel(), { retraccion: 2.1, afinar: ARISTA_JUNTO_AL_CORTE_MM })
    for (const t of [0.25, 0.5, 0.75]) expect(hueco(con, t)).toBeCloseTo(hueco(sin, t), 0)
    // A 6 mm del corte, en el medio de la herida, la piel afinada tiene vértices arrastrados a medias.
    const p = posicionesDe(con)
    let aMedias = 0
    for (let i = 0; i < p.count; i++) {
      const x = con.corte.posiciones[3 * i]
      const y = con.corte.posiciones[3 * i + 1] - 0.3
      if (Math.abs(x) > 6 || Math.abs(y) < 4 || Math.abs(y) > 8) continue
      const movido = Math.abs(p.getY(i) - con.corte.posiciones[3 * i + 1])
      if (movido > 0.2 * 2.1 && movido < 2.1 * huso(0.5)) aMedias++
    }
    expect(aMedias).toBeGreaterThan(8)
  })
})

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { anchoEnUnaDireccion, leerReduccion, puntosDeLaTapa, type EjesDeUnHueso } from '@/atlas/manipular'
import { describirLectura } from '@/atlas/lecturaClinica'
import { anchoDeLasSecciones, porcentajeDelDiametro, seccionesDelHueso } from '@/lib/reduccion'

/**
 * La lectura como la pidió Cristóbal (Q-010, D-258): varo y valgo por el fragmento distal, el plano sagital con su
 * ápice y el desplazamiento también en % del diámetro del hueso.
 */
describe('la lectura con ápice y % (Q-010)', () => {
  const base = { lateral: 0, anteroposterior: 0, axial: 0, valgo: 0, recurvatum: 0, rotacion: 0 }

  it('el plano sagital dice dónde queda el ápice; varo y valgo, como estaban', () => {
    expect(describirLectura({ ...base, recurvatum: -10 })).toBe('10° antecurvatum (ápice anterior)')
    expect(describirLectura({ ...base, recurvatum: 10 })).toBe('10° recurvatum (ápice posterior)')
    expect(describirLectura({ ...base, valgo: -8 })).toBe('8° varo')
  })

  it('con el ancho del hueso, el desplazamiento de través va también en % del diámetro', () => {
    expect(describirLectura({ ...base, lateral: 8, anchoLateralMm: 23 })).toBe('8 mm lateral (35 % del diámetro)')
    expect(
      describirLectura({ ...base, lateral: -3, anteroposterior: 12, anchoLateralMm: 24, anchoAnteroposteriorMm: 30 }),
    ).toBe('3 mm medial (13 % del diámetro) · 12 mm anterior (40 % del diámetro)')
    // La diástasis no: a lo largo, el hueso no tiene diámetro.
    expect(describirLectura({ ...base, axial: 6, anchoLateralMm: 24 })).toBe('6 mm de diástasis')
    // Sin ancho, solo los milímetros.
    expect(describirLectura({ ...base, lateral: 8, anchoLateralMm: null })).toBe('8 mm lateral')
  })

  it('el % va entero y sin signo, y sin un ancho de verdad no hay %', () => {
    expect(porcentajeDelDiametro(12.5, 24)).toBe(52)
    expect(porcentajeDelDiametro(-6, 24)).toBe(25)
    expect(porcentajeDelDiametro(6, 0)).toBeNull()
    expect(porcentajeDelDiametro(6, null)).toBeNull()
    expect(porcentajeDelDiametro(Number.NaN, 24)).toBeNull()
  })

  it('en el atlas, el ancho sale de la tapa del proximal: solo los puntos sobre el plano del corte', () => {
    // Una tapa elíptica a 0,35 m, de 24 mm de lado a lado y 30 de delante atrás, y una corona fuera del plano que no cuenta.
    const posiciones: number[] = []
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      posiciones.push(0.012 * Math.cos(a), 0.35, 0.015 * Math.sin(a))
      posiciones.push(0.05 * Math.cos(a), 0.2, 0.05 * Math.sin(a))
    }
    const tapa = puntosDeLaTapa(posiciones, [0, 0.35, 0], [0, 1, 0])!
    expect(tapa.length).toBe(16 * 3)
    expect(anchoEnUnaDireccion(tapa, [1, 0, 0])).toBeCloseTo(0.024, 6)
    expect(anchoEnUnaDireccion(tapa, [0, 0, 1])).toBeCloseTo(0.03, 6)
    expect(puntosDeLaTapa(posiciones, [0, 0.5, 0], [0, 1, 0])).toBeNull()

    // Una tibia derecha de pie, el distal 8 mm hacia fuera: un tercio del ancho de lado a lado.
    const derecha: EjesDeUnHueso = { largo: [0, -1, 0], delante: [0, 0, 1], fuera: [-1, 0, 0] }
    const centros = { distal: new THREE.Vector3(0, 0.2, 0), proximal: new THREE.Vector3(0, 0.5, 0) }
    const focos = { distal: new THREE.Vector3(0, 0.35, 0), proximal: new THREE.Vector3(0, 0.35, 0) }
    const l = leerReduccion(derecha, { mover: [-0.008, 0, 0], girar: [0, 0, 0, 1] }, null, centros, focos, tapa)
    expect(l.anchoLateralMm).toBeCloseTo(24, 3)
    expect(l.anchoAnteroposteriorMm).toBeCloseTo(30, 3)
    expect(describirLectura(l)).toBe('8 mm lateral (33 % del diámetro)')
    // Sin tapa, la lectura de siempre, y sin campos de más.
    const sinTapa = leerReduccion(derecha, { mover: [-0.008, 0, 0], girar: [0, 0, 0, 1] }, null, centros, focos)
    expect('anchoLateralMm' in sinTapa).toBe(false)
    expect(describirLectura(sinTapa)).toBe('8 mm lateral')
  })

  /**
   * Un tubo de 24 lados a lo largo de Y, con anillos en los `niveles` dados y triángulos entre anillos seguidos, como
   * una malla indexada. `radio(y)` da el radio de cada anillo.
   */
  function tubo(niveles: number[], radio: (y: number) => number) {
    const posiciones: number[] = []
    const indices: number[] = []
    niveles.forEach((y, n) => {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2
        posiciones.push(radio(y) * Math.cos(a), y, radio(y) * Math.sin(a))
        if (n === 0) continue
        const [p, q] = [(n - 1) * 24 + k, (n - 1) * 24 + ((k + 1) % 24)]
        indices.push(p, q, p + 24, q, q + 24, p + 24)
      }
    })
    return { posiciones, indices }
  }

  it('en el simulador, el ancho se mide en secciones junto al foco y de través al eje', () => {
    // Una diáfisis de 12 mm de radio de 0 a 100 y una metáfisis de 30 de 100 a 120, con anillos cada 2 mm.
    const niveles = Array.from({ length: 61 }, (_, k) => 2 * k)
    const { posiciones, indices } = tubo(niveles, (y) => (y > 100 ? 30 : 12))
    const ancho = (desde: number, hasta: number, d: { x: number; y: number; z: number }) =>
      anchoDeLasSecciones(seccionesDelHueso(posiciones, indices, 'y', desde, hasta), 'y', d)
    expect(ancho(5, 20, { x: 1, y: 0, z: 0 })).toBeCloseTo(24, 6)
    // Lo que la dirección tenga a lo largo del eje no cuenta: el ancho es de través.
    expect(ancho(5, 20, { x: 3, y: 9, z: 0 })).toBeCloseTo(24, 6)
    // En la metáfisis el hueso es más ancho: por eso se mide junto al foco y no con la caja del hueso entero.
    expect(ancho(104, 118, { x: 0, y: 0, z: 1 })).toBeCloseTo(60, 6)
    // Sin dirección de través, o sin hueso en las secciones, no hay ancho.
    expect(ancho(5, 20, { x: 0, y: 1, z: 0 })).toBeNull()
    expect(ancho(200, 220, { x: 1, y: 0, z: 0 })).toBeNull()
  })

  it('una diáfisis con pocos vértices se mide igual: se cortan los triángulos, no se esperan vértices en el sitio', () => {
    // Como la tibia de P-009: anillos solo en los extremos de la diáfisis, a 0 y a 100 mm. Entre 5 y 20 no cae ninguno,
    // y la rebanada de vértices de antes no daba ancho.
    const { posiciones, indices } = tubo([0, 100], () => 12)
    const secciones = seccionesDelHueso(posiciones, indices, 'y', 5, 20)
    expect(secciones.every((s) => s.length > 0)).toBe(true)
    // Los puntos salen de las aristas que cruzan cada plano: el ancho en X es el de la diáfisis.
    expect(anchoDeLasSecciones(secciones, 'y', { x: 1, y: 0, z: 0 })).toBeCloseTo(24, 0)
  })

  it('pasada la cuña del trazo oblicuo cuenta la sección entera, no la estrecha junto al extremo', () => {
    // El extremo en cuña: de 0 a 16 mm el tubo se va quedando sin la mitad de X positiva, como una oblicua de través.
    const niveles = Array.from({ length: 21 }, (_, k) => 2 * k)
    const radio = () => 12
    const { posiciones, indices } = tubo(niveles, radio)
    for (let n = 0; n < posiciones.length; n += 3) {
      const [x, y] = [posiciones[n], posiciones[n + 1]]
      // La cuña: la cara del trazo, que llega a x = −12 en el extremo y a x = 12 a 16 mm.
      const tope = -12 + (24 * Math.min(y, 16)) / 16
      if (x > tope) posiciones[n] = tope
    }
    // Junto al extremo la sección es estrecha; con las secciones hasta 40 mm, la más ancha es la diáfisis entera.
    expect(anchoDeLasSecciones(seccionesDelHueso(posiciones, indices, 'y', 5, 8, 2), 'y', { x: 1, y: 0, z: 0 })!).toBeLessThan(14)
    expect(anchoDeLasSecciones(seccionesDelHueso(posiciones, indices, 'y', 5, 40), 'y', { x: 1, y: 0, z: 0 })).toBeCloseTo(24, 0)
  })
})

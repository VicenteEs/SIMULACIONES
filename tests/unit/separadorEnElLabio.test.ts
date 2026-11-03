import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { cortarCapa, sitioEnLaHerida, type HeridaEnCapa } from '@/components/simulador/heridas'
import {
  aplicarSeparadoresALasHeridas,
  cercaDeLaHerida,
  labioDelSeparador,
  posarSeparador,
  type SeparadorEnEscena,
} from '@/components/simulador/exposicionEnLaEscena'
import { LIMITE_PARA_COLOCAR_MM } from '@/lib/abordajePorPlanos'
import type { CapaDeLaHerida, SeparadorColocado } from '@/lib/exposicion'

/**
 * El separador colocado y el tejido que sostiene (2026-11-03). Dos pedidos del dueño:
 * «que la herramienta se incruste en las estructuras, no que se muevan y la herramienta
 * se vea en el aire», y que la fascia se mueva como la piel y el músculo.
 *
 * Tres cosas que se rompían y que se miden aquí, sin navegador:
 *
 *  1. Un Farabeuf en la fascia abría la fascia y dejaba cerrada la piel de encima: cada
 *     plano se corta con su trazo, cada trazo es una incisión, y el filtro por incisión
 *     dejaba fuera al de la otra (D-222 lo apuntó como pendiente).
 *  2. La hoja se posaba donde **debería** estar el labio —el apoyo más toda la
 *     apertura— y el labio de verdad abre menos: quedaba milímetros en el aire.
 *  3. El Hohmann se trasladaba entero con la apertura y su punta dejaba el hueso.
 *
 * Unidades de 1 mm: unidadesPorMm = 1.
 */

/** Una capa plana de 100 × 100 mm a la altura `z`, con una incisión a lo largo de x. */
function capaCortada(nombre: string, z: number, mitad: number, incision: number, escena: THREE.Scene): HeridaEnCapa {
  const malla = new THREE.Mesh(new THREE.PlaneGeometry(100, 100, 50, 50), new THREE.MeshStandardMaterial())
  malla.name = nombre
  malla.position.z = z
  escena.add(malla)
  escena.updateMatrixWorld(true)
  const puntos: THREE.Vector3[] = []
  const normales: THREE.Vector3[] = []
  for (let x = -mitad; x <= mitad + 0.001; x += 1) {
    puntos.push(new THREE.Vector3(x, 0.3, z))
    normales.push(new THREE.Vector3(0, 0, 1))
  }
  return cortarCapa(malla, puntos, normales, { profundidad: 3, alcance: 10, unidadesPorMm: 1, incision })!
}

/** La piel cortada con la incisión 1 y la fascia de debajo, más corta, con la 2: como en el caso de la tibia. */
function pielYFascia() {
  const escena = new THREE.Scene()
  const piel = capaCortada('Piel', 0, 20, 1, escena)
  const fascia = capaCortada('Fascia', -5, 15, 2, escena)
  const heridas = new Map<CapaDeLaHerida, HeridaEnCapa[]>([
    ['piel', [piel]],
    ['fascia', [fascia]],
  ])
  return { escena, piel, fascia, heridas }
}

const farabeuf = (cambios: Partial<SeparadorColocado> = {}): SeparadorColocado => ({
  id: 1,
  instrumentoId: 'farabeuf',
  nombre: 'Separador de Farabeuf',
  tipo: 'mano',
  plano: 'fascia',
  lado: 1,
  posicion: 0.5,
  maximoMm: 30,
  aperturaMm: 12,
  incision: 2,
  ...cambios,
})

/** Lo que hace el lienzo (`reaplicarSeparadores`): dónde cae el separador en otra herida, si está a su alcance. */
function posicionEn(sitio: THREE.Vector3, alcanceMm = LIMITE_PARA_COLOCAR_MM) {
  return (_s: SeparadorColocado, h: HeridaEnCapa) => {
    const cerca = cercaDeLaHerida(h, sitio)
    return cerca && cerca.distancia <= alcanceMm ? cerca.t : null
  }
}

/** Un separador en la escena, sin modelo cargado: lo que importa es dónde queda su grupo. */
function enLaEscena(datos: SeparadorColocado, h: HeridaEnCapa): SeparadorEnEscena {
  const sitio = sitioEnLaHerida(h, datos.posicion, datos.lado)!
  return {
    datos,
    instrumento: { grupo: new THREE.Group(), herramienta: null },
    url: '',
    ajustes: null,
    punto: sitio.punto,
    normal: sitio.normal,
    direccion: sitio.direccion,
    mango: new THREE.Vector3(0, 0, 1),
    sitios: {},
  }
}

/** La distancia de un punto al borde del labio, con la geometría de ahora (la de la sonda del lienzo). */
function alLabio(h: HeridaEnCapa, lado: 1 | -1, punto: THREE.Vector3): number {
  const posiciones = h.malla.geometry.getAttribute('position') as THREE.BufferAttribute
  const cadena = lado > 0 ? h.corte.labios.mas : h.corte.labios.menos
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(posiciones, i).applyMatrix4(h.malla.matrixWorld)
  const tramo = new THREE.Line3()
  const enElTramo = new THREE.Vector3()
  let cerca = Infinity
  for (let k = 0; k + 1 < cadena.length; k++) {
    tramo.set(v(cadena[k]), v(cadena[k + 1])).closestPointToPoint(punto, true, enElTramo)
    cerca = Math.min(cerca, enElTramo.distanceTo(punto))
  }
  return cerca
}

describe('un separador de la fascia abre también la piel de encima', () => {
  it('con su sitio medido en la piel, la piel abre; sin él, como antes, solo la fascia', () => {
    const { piel, fascia, heridas } = pielYFascia()
    const s = farabeuf()
    const apoyo = sitioEnLaHerida(fascia, s.posicion, 1)!.punto

    aplicarSeparadoresALasHeridas(heridas, [s], [], 1)
    expect(fascia.mas).toBeGreaterThan(5)
    expect(piel.mas).toBe(0)

    aplicarSeparadoresALasHeridas(heridas, [s], [], 1, posicionEn(apoyo))
    expect(fascia.mas).toBeGreaterThan(5)
    expect(piel.mas).toBeCloseTo(fascia.mas, 5)
  })

  it('abre la piel en el sitio que el separador tiene sobre ella, no en el de su incisión', () => {
    // A un cuarto de la fascia: la piel es más larga, y ese punto cae en otro tanto por ciento de ella.
    const { piel, fascia, heridas } = pielYFascia()
    const s = farabeuf({ posicion: 0.25 })
    const apoyo = sitioEnLaHerida(fascia, 0.25, 1)!.punto
    const t = cercaDeLaHerida(piel, apoyo)!.t
    expect(Math.abs(t - 0.25)).toBeGreaterThan(0.05)

    aplicarSeparadoresALasHeridas(heridas, [s], [], 1, posicionEn(apoyo))
    // Donde está el separador sobre la piel abre lo más; en el sitio de la fascia, menos.
    expect(piel.perfil!(t).mas).toBeCloseTo(piel.mas, 5)
    expect(piel.perfil!(0.25).mas).toBeLessThan(piel.mas)
  })

  it('lejos de la piel no la abre, y un separador de la piel en otra incisión tampoco', () => {
    const { piel, heridas } = pielYFascia()
    aplicarSeparadoresALasHeridas(heridas, [farabeuf()], [], 1, () => null)
    expect(piel.mas).toBe(0)
    // Lo que P-003 E4 quería evitar: dos incisiones de la misma capa no se abren la una a la otra.
    aplicarSeparadoresALasHeridas(heridas, [farabeuf({ plano: 'piel', incision: 7 })], [], 1, () => 0.5)
    expect(piel.mas).toBe(0)
  })

  it('un separador de la piel no abre la fascia de debajo', () => {
    const { fascia, heridas } = pielYFascia()
    aplicarSeparadoresALasHeridas(heridas, [farabeuf({ plano: 'piel', incision: 1 })], [], 1, () => 0.5)
    expect(fascia.mas).toBe(0)
  })
})

describe('la hoja va con el labio que sostiene', () => {
  for (const apertura of [6, 12, 24]) {
    it(`abierta ${apertura} mm, la hoja está en el labio y no donde decía la cuenta de antes`, () => {
      const { piel, heridas } = pielYFascia()
      const s = enLaEscena(farabeuf({ plano: 'piel', incision: 1, aperturaMm: apertura }), piel)
      aplicarSeparadoresALasHeridas(heridas, [s.datos], [], 1)
      posarSeparador(s, 1, heridas)

      const ahora = alLabio(piel, 1, s.instrumento.grupo.position)
      const antes = alLabio(piel, 1, s.punto.clone().addScaledVector(s.direccion, apertura).addScaledVector(s.normal, 0.4))
      expect(ahora).toBeLessThan(1)
      expect(antes).toBeGreaterThan(ahora)
    })
  }

  it('el labio se busca una vez y se vuelve a buscar solo si el separador cambia de sitio', () => {
    const { piel, heridas } = pielYFascia()
    const s = enLaEscena(farabeuf({ plano: 'piel', incision: 1 }), piel)
    const primero = labioDelSeparador(s, heridas)
    expect(primero).not.toBeNull()
    expect(labioDelSeparador(s, heridas)).toBe(primero)
    s.punto = sitioEnLaHerida(piel, 0.8, 1)!.punto
    const segundo = labioDelSeparador(s, heridas)
    expect(segundo).not.toBe(primero)
    expect(segundo!.vertice).not.toBe(primero!.vertice)
  })

  it('sin herida que seguir —un autoestático, o lo puesto antes de cortar— se posa como antes', () => {
    const { piel, heridas } = pielYFascia()
    const s = enLaEscena(farabeuf({ plano: 'piel', incision: 1, tipo: 'autoestatico', lado: 0 }), piel)
    expect(labioDelSeparador(s, heridas)).toBeNull()
    posarSeparador(s, 1, heridas)
    expect(s.instrumento.grupo.position.distanceTo(s.punto.clone().addScaledVector(s.normal, 0.4))).toBeLessThan(1e-9)
  })
})

describe('el Hohmann apoyado en el hueso', () => {
  it('deja la punta donde está y bascula el mango hacia lo que aparta', () => {
    const { piel } = pielYFascia()
    const s = enLaEscena(farabeuf({ tipo: 'palanca', plano: 'hueso', incision: undefined, aperturaMm: 0 }), piel)
    posarSeparador(s, 1)
    const punta = s.instrumento.grupo.position.clone()
    const mango0 = new THREE.Vector3(0, 1, 0).applyQuaternion(s.instrumento.grupo.quaternion)

    s.datos.aperturaMm = s.datos.maximoMm
    posarSeparador(s, 1)
    expect(s.instrumento.grupo.position.distanceTo(punta)).toBeLessThan(1e-9)
    const mango = new THREE.Vector3(0, 1, 0).applyQuaternion(s.instrumento.grupo.quaternion)
    const grados = (mango.angleTo(mango0) * 180) / Math.PI
    expect(grados).toBeCloseTo(35, 0)
    expect(mango.dot(s.direccion)).toBeGreaterThan(0)
  })
})

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { cortarCapa, abrirCapa, type HeridaEnCapa } from '@/components/simulador/heridas'
import { crearSutura, mallasVisibles, reconstruirHilo, soltarSutura } from '@/components/simulador/hiloEnLaEscena'
import { refrescarSutura, type EstadoDeLaSutura, type Taller } from '@/components/simulador/LienzoQuirurgico'

/**
 * La sutura dentro de la escena (D-169): el hilo se apoya en la piel, cruzar la
 * herida la cierra, y deshacer la última puntada la reabre en lo que corresponda.
 * three funciona sin navegador mientras no se dibuje.
 */

/** Una piel plana de 100 × 100 mm (unidades de 1 mm: milimetrosPorUnidad = 1) con una incisión de 40 mm. */
function escenaConHerida() {
  const escena = new THREE.Scene()
  const raiz = new THREE.Group()
  const g = new THREE.PlaneGeometry(100, 100, 50, 50)
  const piel = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
  piel.name = 'Piel'
  raiz.add(piel)
  escena.add(raiz)
  escena.updateMatrixWorld(true)
  const puntos: THREE.Vector3[] = []
  const normales: THREE.Vector3[] = []
  for (let x = -20; x <= 20.001; x += 1) {
    puntos.push(new THREE.Vector3(x, 0.3, 0))
    normales.push(new THREE.Vector3(0, 0, 1))
  }
  const herida = cortarCapa(piel, puntos, normales, { profundidad: 6, alcance: 10 })!
  abrirCapa(herida, 4, 4)
  const taller: Taller = {
    escena,
    raiz,
    puntosDelTrazo: [],
    materialesOriginales: new Map(),
    rolesAplicados: new Map(),
    heridas: new Map<'piel' | 'musculo', HeridaEnCapa[]>([['piel', [herida]]]),
  }
  return { taller, herida }
}

const punto = (x: number, y: number, lado: 1 | -1 | 0, nuevaLinea = false) => ({
  punto: [x, y, 0.2] as [number, number, number],
  normal: [0, 0, 1] as [number, number, number],
  lado,
  nuevaLinea,
})

const HILO = { grosorMm: 0.7, color: 0x14141a, nombre: 'Nylon 3-0' }

describe('el hilo en la escena', () => {
  it('dibuja un tubo por línea y un nudo por puntada, fuera del modelo del paciente', () => {
    const { taller } = escenaConHerida()
    const sutura = crearSutura(taller.escena!, HILO)
    sutura.puntos.push(punto(-10, 5, 1, true), punto(-10, -5, -1), punto(0, -5, -1))
    reconstruirHilo(sutura, mallasVisibles(taller.raiz!), 1)
    const tubos = sutura.hechos.filter((o) => (o as THREE.Mesh).geometry instanceof THREE.TubeGeometry)
    const nudos = sutura.hechos.filter((o) => (o as THREE.Mesh).geometry instanceof THREE.SphereGeometry)
    expect(tubos).toHaveLength(1)
    expect(nudos).toHaveLength(3)
    // El hilo no es del modelo: el rayo del lienzo no lo toca.
    expect(sutura.grupo.parent).toBe(taller.escena)
    expect(taller.raiz!.getObjectByName('sutura')).toBeUndefined()
    soltarSutura(sutura)
    expect(sutura.grupo.parent).toBeNull()
  })

  it('dos líneas son dos tubos, sin unir el último punto de una con el primero de la otra', () => {
    const { taller } = escenaConHerida()
    const sutura = crearSutura(taller.escena!, HILO)
    sutura.puntos.push(punto(-10, 5, 1, true), punto(-10, -5, -1), punto(10, 5, 1, true), punto(10, -5, -1))
    reconstruirHilo(sutura, mallasVisibles(taller.raiz!), 1)
    expect(sutura.hechos.filter((o) => (o as THREE.Mesh).geometry instanceof THREE.TubeGeometry)).toHaveLength(2)
  })

  it('reconstruir no acumula tubos: los de antes se sueltan', () => {
    const { taller } = escenaConHerida()
    const sutura = crearSutura(taller.escena!, HILO)
    sutura.puntos.push(punto(-10, 5, 1, true), punto(-10, -5, -1))
    reconstruirHilo(sutura, mallasVisibles(taller.raiz!), 1)
    reconstruirHilo(sutura, mallasVisibles(taller.raiz!), 1)
    expect(sutura.grupo.children).toHaveLength(3)
  })
})

describe('coser una herida', () => {
  it('cada puntada que cruza cierra un tramo, y deshacerla lo reabre', () => {
    const { taller, herida } = escenaConHerida()
    const avisos: (EstadoDeLaSutura | null)[] = []
    const avisar = (e: EstadoDeLaSutura | null) => avisos.push(e)
    taller.sutura = crearSutura(taller.escena!, HILO)
    const s = taller.sutura

    // La herida mide 40 mm y está abierta 8 mm.
    expect(herida.mas + herida.menos).toBeCloseTo(8, 6)

    s.puntos.push(punto(-15, 4, 1, true), punto(-15, -4, -1))
    refrescarSutura(taller, 1, avisar, 'ultima')
    const una = avisos[avisos.length - 1]!
    expect(una.cruces).toBe(1)
    expect(una.cierre).toBeCloseTo(10 / 40, 6)
    expect(una.ultimaCruza).toBe(true)
    // La herida está menos abierta que antes.
    expect(herida.mas + herida.menos).toBeCloseTo(8 * (1 - 0.25), 6)

    s.puntos.push(punto(-5, -4, -1, false))
    s.puntos.push(punto(-5, 4, 1, false))
    refrescarSutura(taller, 1, avisar, 'ultima')
    expect(avisos[avisos.length - 1]!.cruces).toBe(2)

    // Deshacer las dos últimas devuelve la apertura que daba una sola cruzada.
    s.puntos.pop()
    s.puntos.pop()
    refrescarSutura(taller, 1, avisar, null)
    expect(herida.mas + herida.menos).toBeCloseTo(8 * (1 - 0.25), 6)

    // Quitar toda la sutura la deja como estaba antes de coser.
    s.puntos.length = 0
    refrescarSutura(taller, 1, avisar, null)
    expect(herida.mas + herida.menos).toBeCloseTo(8, 6)
    expect(avisos[avisos.length - 1]).toBeNull()
  })

  it('con cuatro puntadas que cruzan una herida de 40 mm queda cerrada', () => {
    const { taller, herida } = escenaConHerida()
    taller.sutura = crearSutura(taller.escena!, HILO)
    const s = taller.sutura
    let lado: 1 | -1 = 1
    for (let i = 0; i < 5; i += 1) {
      s.puntos.push(punto(-20 + i * 10, 4 * lado, lado, i === 0))
      lado = lado === 1 ? -1 : 1
    }
    refrescarSutura(taller, 1, undefined, null)
    expect(herida.mas + herida.menos).toBeCloseTo(0, 6)
  })

  it('sobre piel sin herida el hilo se dibuja y no hay nada que cerrar', () => {
    const escena = new THREE.Scene()
    const raiz = new THREE.Group()
    const piel = new THREE.Mesh(new THREE.PlaneGeometry(50, 50, 10, 10), new THREE.MeshStandardMaterial())
    raiz.add(piel)
    escena.add(raiz)
    escena.updateMatrixWorld(true)
    const taller: Taller = {
      escena,
      raiz,
      puntosDelTrazo: [],
      materialesOriginales: new Map(),
      rolesAplicados: new Map(),
    }
    taller.sutura = crearSutura(escena, HILO)
    taller.sutura.puntos.push(punto(0, 0, 0, true), punto(8, 0, 0))
    const avisos: (EstadoDeLaSutura | null)[] = []
    refrescarSutura(taller, 1, (e) => avisos.push(e), 'ultima')
    expect(avisos[0]).toMatchObject({ puntadas: 2, cruces: 0, cierre: 0 })
    expect(taller.sutura.hechos.length).toBeGreaterThan(0)
  })
})

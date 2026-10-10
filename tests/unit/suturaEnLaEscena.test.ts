import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { cortarCapa, abrirCapa, type HeridaEnCapa } from '@/components/simulador/heridas'
import { crearSutura, mallasVisibles, reconstruirHilo, soltarSutura } from '@/components/simulador/hiloEnLaEscena'
import { refrescarSutura, serializarSesion, type EstadoDeLaSutura, type Taller } from '@/components/simulador/LienzoQuirurgico'
import { TENSION_DE_CIERRE } from '@/lib/sutura'

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
  it('coser no cierra: el hilo está flojo hasta que se tira de él', () => {
    const { taller, herida } = escenaConHerida()
    const avisos: (EstadoDeLaSutura | null)[] = []
    taller.sutura = crearSutura(taller.escena!, HILO)
    taller.sutura.puntos.push(punto(-15, 4, 1, true), punto(-15, -4, -1), punto(-5, -4, -1), punto(-5, 4, 1))
    refrescarSutura(taller, 1, (e) => avisos.push(e), 'ultima')
    const estado = avisos[avisos.length - 1]!
    expect(estado.cruces).toBe(2)
    expect(estado.cierreMaximo).toBeCloseTo(20 / 40, 6)
    expect(estado.tension).toBe(0)
    expect(estado.cierre).toBe(0)
    expect(herida.mas + herida.menos).toBeCloseTo(8, 6)
  })

  it('tirar del hilo acerca los labios en proporción a la tensión, hasta lo que las puntadas permiten', () => {
    const { taller, herida } = escenaConHerida()
    const avisos: (EstadoDeLaSutura | null)[] = []
    taller.sutura = crearSutura(taller.escena!, HILO)
    const s = taller.sutura
    s.puntos.push(punto(-15, 4, 1, true), punto(-15, -4, -1), punto(-5, -4, -1), punto(-5, 4, 1))
    // Con la mitad de la tracción de cierre, la mitad de lo que las dos puntadas cierran (50 %): un 25 %.
    s.tension = TENSION_DE_CIERRE / 2
    refrescarSutura(taller, 1, (e) => avisos.push(e), null)
    expect(avisos[avisos.length - 1]!.cierre).toBeCloseTo(0.25, 6)
    expect(herida.mas + herida.menos).toBeCloseTo(8 * 0.75, 6)
    // Apretar más no cierra más de lo que las puntadas permiten: faltan puntadas, no fuerza.
    s.tension = 1
    refrescarSutura(taller, 1, (e) => avisos.push(e), null)
    const lleno = avisos[avisos.length - 1]!
    expect(lleno.cierre).toBeCloseTo(0.5, 6)
    expect(herida.mas + herida.menos).toBeCloseTo(4, 6)
    expect(lleno.juicioDeLaTension?.estrangula).toBe(true)
    // Aflojar devuelve la apertura.
    s.tension = 0
    refrescarSutura(taller, 1, undefined, null)
    expect(herida.mas + herida.menos).toBeCloseTo(8, 6)
  })

  it('las puntadas se van con el labio al que están cosidas', () => {
    const { taller, herida } = escenaConHerida()
    taller.sutura = crearSutura(taller.escena!, HILO)
    const s = taller.sutura
    // Dos puntadas cosidas a cada labio, con su referencia: el labio «más» se separa hacia +y.
    const ref = (lado: 1 | -1) => ({ malla: herida.malla.uuid, dir: [0, 1, 0] as [number, number, number], lado, peso: 1, mas0: herida.mas, menos0: herida.menos })
    const a = { ...punto(-15, 5, 1, true), base: [-15, 5, 0.2] as [number, number, number], ref: ref(1) }
    const b = { ...punto(-15, -5, -1), base: [-15, -5, 0.2] as [number, number, number], ref: ref(-1) }
    s.puntos.push(a, b, { ...punto(-5, -5, -1), base: [-5, -5, 0.2] as [number, number, number], ref: ref(-1) }, { ...punto(-5, 5, 1), base: [-5, 5, 0.2] as [number, number, number], ref: ref(1) })
    s.tension = TENSION_DE_CIERRE
    refrescarSutura(taller, 1, undefined, null)
    // Cerrada la mitad (2 cruces en 40 mm = 50 %): cada labio, abierto 4 mm, queda en 2 y ha avanzado 2 mm
    // hacia el otro, y la puntada con él.
    expect(a.punto[1]).toBeCloseTo(5 - 2, 5)
    expect(b.punto[1]).toBeCloseTo(-5 + 2, 5)
    // Las medidas siguen siendo las de donde se picó: no se juzgan «muy juntas» al apretar.
    expect(s.puntos[0].base![1]).toBe(5)
  })

  it('cada puntada que cruza suma al cierre posible, y deshacerla lo reduce', () => {
    const { taller, herida } = escenaConHerida()
    const avisos: (EstadoDeLaSutura | null)[] = []
    const avisar = (e: EstadoDeLaSutura | null) => avisos.push(e)
    taller.sutura = crearSutura(taller.escena!, HILO)
    const s = taller.sutura
    s.tension = TENSION_DE_CIERRE

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
    s.tension = TENSION_DE_CIERRE
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

describe('la sesión guardada (D-171)', () => {
  it('sin cortes ni puntadas no hay nada que recordar', () => {
    const { taller } = escenaConHerida()
    expect(serializarSesion(taller)).toBe('')
  })

  it('guarda los cortes y las puntadas con su lugar en la lista de heridas, no con identificadores que cambian', () => {
    const { taller, herida } = escenaConHerida()
    taller.cortes = [{ plano: 'piel', puntos: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], normales: [[0, 0, 1], [0, 0, 1], [0, 0, 1]] }]
    taller.sutura = crearSutura(taller.escena!, HILO)
    taller.sutura.tension = 0.6
    taller.sutura.puntos.push({
      ...punto(-10, 5, 1, true),
      base: [-10, 5, 0.2],
      ref: { malla: herida.malla.uuid, dir: [0, 1, 0], lado: 1, peso: 0.8, mas0: 4, menos0: 4 },
    })
    const guardado = JSON.parse(serializarSesion(taller))
    expect(guardado.v).toBe(1)
    expect(guardado.cortes).toHaveLength(1)
    expect(guardado.apertura).toEqual([{ mas: 4, menos: 4 }])
    expect(guardado.sutura.tension).toBe(0.6)
    expect(guardado.sutura.puntos[0].ref.herida).toBe(0)
    expect(JSON.stringify(guardado)).not.toContain(herida.malla.uuid)
  })
})

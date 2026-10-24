import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { abrirCapa, cortarCapa, type HeridaEnCapa } from '@/components/simulador/heridas'
import { crearSutura } from '@/components/simulador/hiloEnLaEscena'
import {
  refrescarSutura,
  serializarSesion,
  type EstadoDeLaSutura,
  type Taller,
} from '@/components/simulador/LienzoQuirurgico'
import type { PlanoBlando } from '@/lib/planosBlandos'
import { TENSION_DE_CIERRE, type PuntoDeSutura } from '@/lib/sutura'

/**
 * El cierre por planos dentro de la escena (P-006, E11): una piel y una fascia debajo, cada una con su herida de 40 mm. Con
 * fascia en el caso, cada plano se cierra con sus puntadas y con su tensión, y la herida entera está cerrada cuando lo están
 * los dos: es el cierre que alarmó a Cristóbal —la piel cosida y la fascia abierta— y que antes no se podía ni ver.
 */

/** Una lámina plana de 100 × 100 mm a la altura `z`, con una incisión de 40 mm, y su herida abierta 4 mm por labio. */
function lamina(nombre: string, z: number) {
  const g = new THREE.PlaneGeometry(100, 100, 50, 50)
  const malla = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
  malla.name = nombre
  malla.position.z = z
  return malla
}

function escenaConDosHeridas() {
  const escena = new THREE.Scene()
  const raiz = new THREE.Group()
  const piel = lamina('Piel', 0)
  const fascia = lamina('Fascia_profunda', -10)
  raiz.add(piel, fascia)
  escena.add(raiz)
  escena.updateMatrixWorld(true)
  const cortar = (malla: THREE.Mesh): HeridaEnCapa => {
    const puntos: THREE.Vector3[] = []
    const normales: THREE.Vector3[] = []
    for (let x = -20; x <= 20.001; x += 1) {
      puntos.push(new THREE.Vector3(x, 0.3, malla.position.z))
      normales.push(new THREE.Vector3(0, 0, 1))
    }
    const herida = cortarCapa(malla, puntos, normales, { profundidad: 6, alcance: 10 })!
    abrirCapa(herida, 4, 4)
    return herida
  }
  const heridaPiel = cortar(piel)
  const heridaFascia = cortar(fascia)
  const taller: Taller = {
    escena,
    raiz,
    puntosDelTrazo: [],
    materialesOriginales: new Map(),
    rolesAplicados: new Map(),
    heridas: new Map<PlanoBlando, HeridaEnCapa[]>([
      ['piel', [heridaPiel]],
      ['fascia', [heridaFascia]],
    ]),
    cierrePorPlanos: true,
  }
  return { taller, heridaPiel, heridaFascia }
}

const punto = (x: number, y: number, lado: 1 | -1 | 0, plano: PlanoBlando, nuevaLinea = false): PuntoDeSutura => ({
  punto: [x, y, plano === 'piel' ? 0.2 : -9.8],
  normal: [0, 0, 1],
  lado,
  nuevaLinea,
  plano,
})

const VICRYL = { grosorMm: 0.9, color: 0x6a4cb0, nombre: 'Vicryl 2-0', planos: ['fascia'] as PlanoBlando[] }

/** Cuatro puntadas que cruzan tres veces, a 10 mm: en 40 mm cierran 45 mm en la fascia (15 por cruce) y 30 en la piel (10). */
const cuatroPuntadas = (plano: PlanoBlando): PuntoDeSutura[] => [
  punto(-15, 4, 1, plano, true),
  punto(-15, -4, -1, plano),
  punto(-5, -4, -1, plano),
  punto(-5, 4, 1, plano),
  punto(5, 4, 1, plano),
  punto(5, -4, -1, plano),
]

describe('coser por planos', () => {
  it('la fascia se cierra con las puntadas de la fascia y no cierra la piel', () => {
    const { taller, heridaPiel, heridaFascia } = escenaConDosHeridas()
    const avisos: (EstadoDeLaSutura | null)[] = []
    taller.sutura = crearSutura(taller.escena!, VICRYL)
    const s = taller.sutura
    s.puntos.push(...cuatroPuntadas('fascia'))
    s.planoActivo = 'fascia'
    s.tensiones = { fascia: TENSION_DE_CIERRE }
    s.tension = TENSION_DE_CIERRE
    refrescarSutura(taller, 1, (e) => avisos.push(e), null)
    const estado = avisos[avisos.length - 1]!
    // Tres cruces de 15 mm cubren los 40 mm: la herida de la fascia queda cerrada y la de la piel, como estaba.
    expect(heridaFascia.mas + heridaFascia.menos).toBeCloseTo(0, 6)
    expect(heridaPiel.mas + heridaPiel.menos).toBeCloseTo(8, 6)
    const [dePiel, deFascia] = [estado.planos!.find((p) => p.plano === 'piel')!, estado.planos!.find((p) => p.plano === 'fascia')!]
    expect(deFascia).toMatchObject({ puntadas: 6, cruces: 3, conHerida: true })
    expect(deFascia.cierre).toBeCloseTo(1, 6)
    expect(dePiel).toMatchObject({ puntadas: 0, cruces: 0, conHerida: true, cierre: 0 })
    expect(estado.planoActivo).toBe('fascia')
  })

  it('con la fascia cosida y la piel abierta la herida no está cerrada: el cierre entero es el del plano menos cerrado', () => {
    const { taller } = escenaConDosHeridas()
    const avisos: (EstadoDeLaSutura | null)[] = []
    taller.sutura = crearSutura(taller.escena!, VICRYL)
    const s = taller.sutura
    s.puntos.push(...cuatroPuntadas('fascia'))
    s.planoActivo = 'fascia'
    s.tensiones = { fascia: TENSION_DE_CIERRE }
    s.tension = TENSION_DE_CIERRE
    refrescarSutura(taller, 1, (e) => avisos.push(e), null)
    expect(avisos[avisos.length - 1]!.cierre).toBe(0)
  })

  it('cada plano se aprieta por su cuenta: la tensión de uno no cierra el otro', () => {
    const { taller, heridaPiel, heridaFascia } = escenaConDosHeridas()
    const avisos: (EstadoDeLaSutura | null)[] = []
    taller.sutura = crearSutura(taller.escena!, VICRYL)
    const s = taller.sutura
    // Fascia cosida y apretada del todo; piel cosida con cuatro cruces (a 10 mm cubren los 40) pero floja.
    s.puntos.push(
      ...cuatroPuntadas('fascia'),
      punto(-15, 4, 1, 'piel', true),
      punto(-15, -4, -1, 'piel'),
      punto(-5, -4, -1, 'piel'),
      punto(-5, 4, 1, 'piel'),
      punto(5, 4, 1, 'piel'),
      punto(5, -4, -1, 'piel'),
      punto(15, -4, -1, 'piel'),
      punto(15, 4, 1, 'piel'),
    )
    s.planoActivo = 'piel'
    s.tensiones = { fascia: TENSION_DE_CIERRE, piel: 0 }
    s.tension = 0
    refrescarSutura(taller, 1, (e) => avisos.push(e), null)
    expect(heridaFascia.mas + heridaFascia.menos).toBeCloseTo(0, 6)
    expect(heridaPiel.mas + heridaPiel.menos).toBeCloseTo(8, 6)
    expect(avisos[avisos.length - 1]!.cierre).toBe(0)
    // Se aprieta la piel: ahora las dos están cerradas.
    s.tensiones.piel = TENSION_DE_CIERRE
    s.tension = TENSION_DE_CIERRE
    refrescarSutura(taller, 1, (e) => avisos.push(e), null)
    expect(heridaPiel.mas + heridaPiel.menos).toBeCloseTo(0, 6)
    expect(avisos[avisos.length - 1]!.cierre).toBeCloseTo(1, 6)
  })

  it('un cierre de fascia «muy distanciado» se ve: con pocas puntadas el plano dice cuánto cierra de verdad', () => {
    const { taller } = escenaConDosHeridas()
    const avisos: (EstadoDeLaSutura | null)[] = []
    taller.sutura = crearSutura(taller.escena!, VICRYL)
    const s = taller.sutura
    // Una sola puntada que cruza: 15 mm de 40.
    s.puntos.push(punto(0, 4, 1, 'fascia', true), punto(0, -4, -1, 'fascia'))
    s.planoActivo = 'fascia'
    s.tensiones = { fascia: TENSION_DE_CIERRE }
    s.tension = TENSION_DE_CIERRE
    refrescarSutura(taller, 1, (e) => avisos.push(e), null)
    const deFascia = avisos[avisos.length - 1]!.planos!.find((p) => p.plano === 'fascia')!
    expect(deFascia.cierreMaximo).toBeCloseTo(15 / 40, 6)
    expect(avisos[avisos.length - 1]!.juicioDeLaTension?.texto).toContain('solo se puede cerrar el 38 %')
  })

  it('la separación se juzga con el rango del plano: 12 mm es de fascia, y en piel sería de más', () => {
    const { taller } = escenaConDosHeridas()
    const avisos: (EstadoDeLaSutura | null)[] = []
    taller.sutura = crearSutura(taller.escena!, VICRYL)
    const s = taller.sutura
    s.puntos.push(punto(0, 4, 1, 'fascia', true), punto(12, -4, -1, 'fascia'))
    s.planoActivo = 'fascia'
    refrescarSutura(taller, 1, (e) => avisos.push(e), 'ultima')
    expect(avisos[avisos.length - 1]!.juicio).toBeNull()
    s.puntos.length = 0
    s.puntos.push(punto(0, 4, 1, 'piel', true), punto(12, -4, -1, 'piel'))
    s.planoActivo = 'piel'
    refrescarSutura(taller, 1, (e) => avisos.push(e), 'ultima')
    expect(avisos[avisos.length - 1]!.juicio).toContain('muy separada')
  })

  it('sin fascia en el caso, todas las puntadas cierran todas las heridas como siempre', () => {
    const { taller, heridaPiel, heridaFascia } = escenaConDosHeridas()
    taller.cierrePorPlanos = false
    const avisos: (EstadoDeLaSutura | null)[] = []
    taller.sutura = crearSutura(taller.escena!, VICRYL)
    const s = taller.sutura
    s.puntos.push(...cuatroPuntadas('piel'))
    s.tension = TENSION_DE_CIERRE
    refrescarSutura(taller, 1, (e) => avisos.push(e), null)
    expect(avisos[avisos.length - 1]!.planos).toBeUndefined()
    // Tres cruces de 10 mm en 40: tres cuartos, y las dos heridas.
    expect(heridaPiel.mas + heridaPiel.menos).toBeCloseTo(8 * 0.25, 6)
    expect(heridaFascia.mas + heridaFascia.menos).toBeCloseTo(8 * 0.25, 6)
  })
})

describe('guardar y recuperar la sutura por planos', () => {
  it('la sesión recuerda el plano de cada puntada y la tensión de cada plano', () => {
    const { taller } = escenaConDosHeridas()
    taller.sutura = crearSutura(taller.escena!, VICRYL)
    const s = taller.sutura
    s.puntos.push(...cuatroPuntadas('fascia'))
    s.tensiones = { fascia: 0.5, piel: 0.2 }
    s.tension = 0.5
    taller.cortes = [{ plano: 'fascia', puntos: [[0, 0, 0]], normales: [[0, 0, 1]] }]
    const guardado = JSON.parse(serializarSesion(taller)) as {
      cortes: { plano: string }[]
      sutura: { tensiones: Record<string, number>; puntos: { plano?: string }[] }
    }
    expect(guardado.cortes[0].plano).toBe('fascia')
    expect(guardado.sutura.tensiones).toEqual({ fascia: 0.5, piel: 0.2 })
    expect(guardado.sutura.puntos.every((p) => p.plano === 'fascia')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { abrirCapa, cerrarCapa, cortarCapa, ladoDeLaHerida } from '@/components/simulador/heridas'

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

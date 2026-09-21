import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  nombreDelOtroLado,
  parejasContralaterales,
  reflejarGiro,
  reflejarVector,
} from '@/atlas/espejo'
import { normalizarSeleccion } from '@/atlas/catalogo'
import type { CatalogoDelAtlas } from '@/atlas/formato'

/** El espejo al otro lado del cuerpo y los grupos de piezas (D-136). */

const real = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/atlas/catalogo.json'), 'utf8'),
) as CatalogoDelAtlas

describe('el otro lado', () => {
  it('cambia el lado del nombre respetando la mayúscula, y calla si no hay lado', () => {
    expect(nombreDelOtroLado('Right tibia')).toBe('Left tibia')
    expect(nombreDelOtroLado('Lateral head of left gastrocnemius')).toBe('Lateral head of right gastrocnemius')
    expect(nombreDelOtroLado('Sternum')).toBeNull()
    // «Upright» no es un lado.
    expect(nombreDelOtroLado('Upright thing')).toBeNull()
  })

  // Sobre el catálogo de verdad: es lo que el espejo promete, y un atlas
  // regenerado que dejase de ser simétrico tiene que cantarlo aquí.
  it('en el atlas real, los huesos largos tienen pareja y la pareja es recíproca', () => {
    const parejas = parejasContralaterales(real)
    const idDe = (nombre: string) => real.piezas.find((p) => p.nombre === nombre)!.id
    for (const hueso of ['tibia', 'femur', 'fibula', 'humerus', 'patella']) {
      const derecha = idDe(`Right ${hueso}`)
      const izquierda = idDe(`Left ${hueso}`)
      expect(parejas.get(derecha)).toBe(izquierda)
      expect(parejas.get(izquierda)).toBe(derecha)
    }
    expect(parejas.size).toBeGreaterThan(1200)
    // La línea media no tiene pareja, y por eso se queda donde está.
    expect(parejas.has(idDe('Body of sternum'))).toBe(false)
  })

  it('reflejar dos veces es no hacer nada, sin dejar «-0»', () => {
    expect(reflejarVector(reflejarVector([0.03, 1, -2]))).toEqual([0.03, 1, -2])
    expect(reflejarVector([0, 1, 2]).map(String)).toEqual(['0', '1', '2'])
    expect(reflejarGiro(reflejarGiro([0.1, 0.2, 0.3, 0.9]))).toEqual([0.1, 0.2, 0.3, 0.9])
  })

  // La definición de «giro reflejado»: reflejar un punto y girarlo con el giro
  // reflejado da lo mismo que girarlo y reflejar después.
  it('el giro reflejado conmuta con la reflexión', () => {
    const giro = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -0.7, 1.1)).normalize()
    const reflejado = new THREE.Quaternion(...reflejarGiro([giro.x, giro.y, giro.z, giro.w]))
    const punto = new THREE.Vector3(0.3, -0.2, 0.9)
    const primeroGirar = punto.clone().applyQuaternion(giro)
    const primeroReflejar = new THREE.Vector3(...reflejarVector([punto.x, punto.y, punto.z])).applyQuaternion(reflejado)
    expect(primeroReflejar.x).toBeCloseTo(-primeroGirar.x, 9)
    expect(primeroReflejar.y).toBeCloseTo(primeroGirar.y, 9)
    expect(primeroReflejar.z).toBeCloseTo(primeroGirar.z, 9)
  })
})

describe('los grupos que se dejan guardar', () => {
  const catalogo = { version: 'p', piezas: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } as unknown as CatalogoDelAtlas
  const guardar = (grupos: unknown, cortes: unknown = undefined) =>
    normalizarSeleccion(catalogo, ['a', 'b', 'c'], null, cortes, { grupos }).grupos

  it('dos miembros al menos, presentes en la preparación, y cada uno en un solo grupo', () => {
    expect(guardar([['a', 'b'], ['b', 'c']])).toEqual([['a', 'b']])
    expect(guardar([['a']])).toBeUndefined()
    expect(guardar([['a', 'zz']])).toBeUndefined()
    expect(guardar('no es una lista')).toBeUndefined()
  })

  // De un hueso partido se agrupan sus fragmentos, no él: entero ya no existe.
  it('de una pieza partida valen sus fragmentos y no la pieza', () => {
    const corte = [{ pieza: 'a', punto: [0, 0, 0], normal: [0, 1, 0] }]
    expect(guardar([['a#b', 'c']], corte)).toEqual([['a#b', 'c']])
    expect(guardar([['a', 'c']], corte)).toBeUndefined()
    expect(guardar([['b#a', 'c']], corte)).toBeUndefined()
  })
})

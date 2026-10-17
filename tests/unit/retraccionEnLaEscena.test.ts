import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { aplicarUnaRetraccion, estadoDeLasRetracciones, type RetraccionDeMusculo } from '@/components/simulador/LienzoQuirurgico'

/** Un «músculo»: una caja larga con vértices de sobra para que la campana tenga a quién mover. */
function musculo(): RetraccionDeMusculo {
  const malla = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.04, 20, 2, 2), new THREE.MeshStandardMaterial())
  malla.name = 'Tibial_anterior'
  const posiciones = malla.geometry.getAttribute('position') as THREE.BufferAttribute
  return {
    id: 1,
    nodo: malla.name,
    nombre: 'Farabeuf',
    malla,
    original: Float32Array.from(posiciones.array as ArrayLike<number>),
    // Apoyado en el extremo −x, tirando hacia +y.
    apoyo: new THREE.Vector3(-0.2, 0, 0),
    direccion: new THREE.Vector3(0, 1, 0),
    aperturaMm: 20,
    maximoMm: 40,
  }
}

describe('la retracción de un músculo en la escena (P-003 E10)', () => {
  it('mueve los vértices cercanos al apoyo y deja quietos los lejanos', () => {
    const r = musculo()
    // 1 unidad = 1 m, y el modelo está en metros: 1 mm = 0.001 unidades.
    expect(aplicarUnaRetraccion(r, 0.001)).toBe(true)
    const p = r.malla.geometry.getAttribute('position') as THREE.BufferAttribute
    let movidos = 0
    let quietos = 0
    for (let i = 0; i < p.count; i++) {
      const antes = r.original[i * 3 + 1]
      if (Math.abs(p.getY(i) - antes) > 1e-9) movidos += 1
      else quietos += 1
    }
    expect(movidos).toBeGreaterThan(0)
    // El extremo contrario está a 0,4 m = 400 mm, diez veces el radio: ni se entera.
    expect(quietos).toBeGreaterThan(0)
    const mejor = Math.max(...Array.from({ length: p.count }, (_, i) => p.getY(i) - r.original[i * 3 + 1]))
    expect(mejor).toBeCloseTo(0.02, 3)
  })

  it('cerrar (apertura 0) devuelve las posiciones de antes', () => {
    const r = musculo()
    aplicarUnaRetraccion(r, 0.001)
    r.aperturaMm = 0
    aplicarUnaRetraccion(r, 0.001)
    const p = r.malla.geometry.getAttribute('position') as THREE.BufferAttribute
    // `toEqual` distingue −0 de 0 y aquí da igual: se compara el valor.
    r.original.forEach((v, i) => expect(p.array[i]).toBeCloseTo(v, 9))
  })

  it('si la malla ya no es la de antes (un corte la partió) se da por perdida y no la toca', () => {
    const r = musculo()
    r.malla.geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1)
    const antes = Array.from((r.malla.geometry.getAttribute('position') as THREE.BufferAttribute).array)
    expect(aplicarUnaRetraccion(r, 0.001)).toBe(false)
    expect(Array.from((r.malla.geometry.getAttribute('position') as THREE.BufferAttribute).array)).toEqual(antes)
  })

  it('el estado lista lo que hay retraído', () => {
    const r = musculo()
    expect(estadoDeLasRetracciones({ retracciones: [r] })).toEqual({
      lista: [{ id: 1, nodo: 'Tibial_anterior', nombre: 'Farabeuf', aperturaMm: 20, maximoMm: 40 }],
    })
    expect(estadoDeLasRetracciones({})).toEqual({ lista: [] })
  })
})

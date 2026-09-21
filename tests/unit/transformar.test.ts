import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  desplazamientoDelArrastre,
  esReposo,
  giroDelArrastre,
  girarPiezas,
  moverPiezas,
} from '@/atlas/transformar'
import { aplicarTransformacion, ponerTransformacion, type TransformacionDePieza } from '@/atlas/cargador'
import { normalizarSeleccion } from '@/atlas/catalogo'
import type { CatalogoDelAtlas } from '@/atlas/formato'

/**
 * Mover y girar piezas (D-129): la cuenta del gesto, lo que se escribe en las
 * texturas y lo que se deja guardar.
 */

function camaraDeFrente() {
  const camara = new THREE.PerspectiveCamera(42, 1, 0.02, 60)
  camara.position.set(0, 0, 5)
  camara.lookAt(0, 0, 0)
  camara.updateMatrixWorld()
  return camara
}

const ORIGEN = new THREE.Vector3(0, 0, 0)

describe('desplazamientoDelArrastre', () => {
  it('arrastrar a la derecha mueve hacia +X y arrastrar hacia abajo, hacia −Y', () => {
    const d = desplazamientoDelArrastre(camaraDeFrente(), ORIGEN, 100, 50, 1000, null)
    expect(d.x).toBeGreaterThan(0)
    expect(d.y).toBeLessThan(0)
    expect(d.z).toBeCloseTo(0, 6)
  })

  // Recorrer el alto entero del lienzo es recorrer el alto de lo que se ve a
  // esa profundidad: es lo que hace que la pieza siga al cursor.
  it('un arrastre del alto del lienzo mide el alto del campo a la profundidad del pivote', () => {
    const d = desplazamientoDelArrastre(camaraDeFrente(), ORIGEN, 0, -1000, 1000, null)
    expect(d.y).toBeCloseTo(2 * 5 * Math.tan((42 * Math.PI) / 360), 5)
  })

  it('atado a un eje no se sale de él', () => {
    const d = desplazamientoDelArrastre(camaraDeFrente(), ORIGEN, 100, 50, 1000, 'x')
    expect(d.y).toBe(0)
    expect(d.z).toBe(0)
    expect(d.x).toBeGreaterThan(0)
  })
})

describe('giroDelArrastre', () => {
  // Visto de frente, rodear el pivote en el sentido del reloj tiene que llevar
  // lo que estaba arriba hacia la derecha de la pantalla.
  it('sin eje, la pieza rueda bajo el cursor', () => {
    const q = giroDelArrastre(camaraDeFrente(), ORIGEN, Math.PI / 2, null)
    const arriba = new THREE.Vector3(0, 1, 0).applyQuaternion(q)
    expect(arriba.x).toBeCloseTo(1, 5)
    expect(arriba.y).toBeCloseTo(0, 5)
  })

  it('sobre Z, desde delante y desde detrás, sigue al cursor en los dos casos', () => {
    const delante = giroDelArrastre(camaraDeFrente(), ORIGEN, Math.PI / 2, 'z')
    const detras = camaraDeFrente()
    detras.position.set(0, 0, -5)
    detras.lookAt(0, 0, 0)
    detras.updateMatrixWorld()
    const desdeDetras = giroDelArrastre(detras, ORIGEN, Math.PI / 2, 'z')
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(delante).x).toBeCloseTo(1, 5)
    // Desde detrás la derecha de la pantalla es −X.
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(desdeDetras).x).toBeCloseTo(-1, 5)
  })
})

describe('moverPiezas y girarPiezas', () => {
  const alEmpezar = new Map<string, TransformacionDePieza>([
    ['a', { mover: [1, 0, 0], girar: [0, 0, 0, 1] }],
  ])

  it('mover suma a lo que la pieza ya se había movido, y no toca el mapa de partida', () => {
    const tras = moverPiezas(alEmpezar, ['a', 'b'], new THREE.Vector3(0, 2, 0))
    expect(tras.get('a')?.mover).toEqual([1, 2, 0])
    expect(tras.get('b')?.mover).toEqual([0, 2, 0])
    expect(alEmpezar.get('a')?.mover).toEqual([1, 0, 0])
  })

  it('una pieza sola gira sobre su centro: no se desplaza', () => {
    const centros = new Map([['b', new THREE.Vector3(3, 4, 5)]])
    const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1)
    const tras = girarPiezas(new Map(), ['b'], centros, new THREE.Vector3(3, 4, 5), giro)
    expect(tras.get('b')?.mover.map((n) => Math.abs(n) < 1e-9)).toEqual([true, true, true])
    expect(esReposo(tras.get('b')!)).toBe(false)
  })

  // Un fragmento con sus músculos: si cada pieza rodase en su sitio, el
  // conjunto se desarmaría.
  it('varias piezas giran juntas alrededor del pivote común', () => {
    const centros = new Map([
      ['izq', new THREE.Vector3(-1, 0, 0)],
      ['der', new THREE.Vector3(1, 0, 0)],
    ])
    const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    const tras = girarPiezas(new Map(), ['izq', 'der'], centros, new THREE.Vector3(0, 0, 0), giro)
    // (1,0,0) pasa a (0,1,0): se movió (−1, 1, 0) desde su sitio.
    expect(tras.get('der')?.mover[0]).toBeCloseTo(-1, 6)
    expect(tras.get('der')?.mover[1]).toBeCloseTo(1, 6)
  })

  it('girar de ida y de vuelta deja la pieza como estaba', () => {
    const centros = new Map([['a', new THREE.Vector3(2, 0, 0)]])
    const pivote = new THREE.Vector3(0, 0, 0)
    const ida = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7)
    const mitad = girarPiezas(new Map(), ['a'], centros, pivote, ida)
    const fin = girarPiezas(mitad, ['a'], centros, pivote, ida.clone().invert())
    expect(esReposo(fin.get('a')!)).toBe(true)
  })
})

describe('ponerTransformacion', () => {
  function escenaDeUnaPieza(centro: [number, number, number]) {
    return {
      centros: new Float32Array(centro),
      giros: { needsUpdate: false } as THREE.DataTexture,
      datosDeGiros: new Float32Array([0, 0, 0, 1]),
      traslados: { needsUpdate: false } as THREE.DataTexture,
      datosDeTraslados: new Float32Array(4),
    }
  }

  // El sombreador gira cada vértice sobre el origen del atlas, que está en el
  // suelo. Lo que se escribe tiene que compensarlo para que la pieza gire sobre
  // su propio centro: si no, girar la rótula la mandaba a un metro de la rodilla.
  it('el centro de la pieza no se mueve al girarla, y sí con el traslado', () => {
    const escena = escenaDeUnaPieza([0.1, 0.5, 0])
    const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.2)
    ponerTransformacion(escena, 0, { mover: [0, 0, 0.25], girar: [giro.x, giro.y, giro.z, giro.w] })
    const donde = aplicarTransformacion(escena, 0, new THREE.Vector3(0.1, 0.5, 0))
    expect(donde.x).toBeCloseTo(0.1, 5)
    expect(donde.y).toBeCloseTo(0.5, 5)
    expect(donde.z).toBeCloseTo(0.25, 5)
    expect(escena.giros.needsUpdate).toBe(true)
  })

  it('con null la pieza vuelve exactamente a su sitio', () => {
    const escena = escenaDeUnaPieza([0.1, 0.5, 0])
    ponerTransformacion(escena, 0, { mover: [1, 1, 1], girar: [0, 0, 0.6, 0.8] })
    ponerTransformacion(escena, 0, null)
    expect([...escena.datosDeGiros]).toEqual([0, 0, 0, 1])
    expect([...escena.datosDeTraslados.slice(0, 3)]).toEqual([0, 0, 0])
  })
})

describe('lo que se deja guardar', () => {
  const catalogo = {
    version: 'prueba',
    piezas: [{ id: 'a' }, { id: 'b' }],
  } as unknown as CatalogoDelAtlas

  const guardar = (pieza: unknown) => normalizarSeleccion(catalogo, [pieza], null).piezas[0]

  it('guarda un traslado y un giro bien formados, con el giro normalizado', () => {
    const pieza = guardar({ id: 'a', mover: [0.01, 0, -0.02], girar: [0, 0, 3, 4] })
    expect(pieza.mover).toEqual([0.01, 0, -0.02])
    expect(pieza.girar).toEqual([0, 0, 0.6, 0.8])
  })

  it('no guarda lo que no mueve nada', () => {
    expect(guardar({ id: 'a', mover: [0, 0, 0], girar: [0, 0, 0, 1] })).toEqual({ id: 'a' })
  })

  // Llega del navegador: un NaN en el traslado deja la pieza sin dibujar.
  it('descarta lo mal formado y acota lo desmedido', () => {
    expect(guardar({ id: 'a', mover: [Number.NaN, 0, 0] })).toEqual({ id: 'a' })
    expect(guardar({ id: 'a', mover: ['1', 0, 0] })).toEqual({ id: 'a' })
    expect(guardar({ id: 'a', girar: [0, 0, 0, 0] })).toEqual({ id: 'a' })
    expect(guardar({ id: 'a', mover: [5000, 0, 0] }).mover).toEqual([2, 0, 0])
  })

  it('q y −q se guardan igual, porque son el mismo giro', () => {
    expect(guardar({ id: 'a', girar: [0, 0, -0.6, -0.8] }).girar).toEqual([0, 0, 0.6, 0.8])
  })
})

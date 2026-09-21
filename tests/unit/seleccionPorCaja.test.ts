import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ESTADO } from '@/atlas/cargador'
import { piezasEnElRectangulo, rectanguloNormalizado } from '@/atlas/seleccionPorCaja'
import { seleccionTras } from '@/atlas/seleccion'

/**
 * El marco de selección del taller (D-126).
 *
 * Lo que se prueba es la decisión, no three: entra la pieza cuyo CENTRO queda
 * dentro del marco, lo apagado y lo que está a la espalda no entran, y el marco
 * sigue a la pieza cuando el cuerpo está separado.
 */

/** Una escena mínima: solo lo que mira `piezasEnElRectangulo`. */
function escenaCon(centros: [number, number, number][], estados?: number[]) {
  const datos = new Float32Array(centros.length * 4)
  centros.forEach((_, i) => {
    datos[i * 4 + 3] = estados?.[i] ?? ESTADO.VISIBLE
  })
  return {
    rangos: new Map(centros.map((_, i) => [i, { malla: 0, inicio: 0, cuenta: 0 }])),
    datos,
    centros: new Float32Array(centros.flat()),
  }
}

function camaraDeFrente() {
  const camara = new THREE.PerspectiveCamera(42, 1, 0.02, 60)
  camara.position.set(0, 0, 5)
  camara.lookAt(0, 0, 0)
  camara.updateMatrixWorld()
  return camara
}

const TODO = { minX: -1, minY: -1, maxX: 1, maxY: 1 }
const MITAD_DERECHA = { minX: 0, minY: -1, maxX: 1, maxY: 1 }

describe('piezasEnElRectangulo', () => {
  it('se lleva las piezas cuyo centro cae dentro y deja las de fuera', () => {
    const escena = escenaCon([
      [0.5, 0, 0],
      [-0.5, 0, 0],
    ])
    expect(piezasEnElRectangulo(escena, camaraDeFrente(), MITAD_DERECHA)).toEqual([0])
  })

  it('no selecciona lo apagado, y sí lo resaltado y lo ya seleccionado', () => {
    const escena = escenaCon(
      [
        [0.1, 0, 0],
        [0.2, 0, 0],
        [0.3, 0, 0],
      ],
      [ESTADO.OCULTA, ESTADO.RESALTADA, ESTADO.SELECCIONADA],
    )
    expect(piezasEnElRectangulo(escena, camaraDeFrente(), TODO)).toEqual([1, 2])
  })

  // Un punto detrás de la cámara se proyecta dentro del marco con el signo
  // cambiado: sin el filtro de profundidad, un marco sobre la rodilla se llevaba
  // lo que quedaba a la espalda de quien mira.
  it('no selecciona lo que queda detrás de la cámara', () => {
    const escena = escenaCon([[0, 0, 9]])
    expect(piezasEnElRectangulo(escena, camaraDeFrente(), TODO)).toEqual([])
  })

  it('con el cuerpo separado busca la pieza donde se dibuja, no donde estaba', () => {
    const escena = escenaCon([[-0.5, 0, 0]])
    // La dirección de separación, en los tres primeros canales: hacia +X.
    escena.datos[0] = 1
    expect(piezasEnElRectangulo(escena, camaraDeFrente(), MITAD_DERECHA, 0)).toEqual([])
    expect(piezasEnElRectangulo(escena, camaraDeFrente(), MITAD_DERECHA, 1)).toEqual([0])
  })

  it('solo mira las piezas que se montaron en la malla', () => {
    const escena = escenaCon([
      [0, 0, 0],
      [0.1, 0, 0],
    ])
    escena.rangos.delete(1)
    expect(piezasEnElRectangulo(escena, camaraDeFrente(), TODO)).toEqual([0])
  })
})

describe('rectanguloNormalizado', () => {
  it('da lo mismo arrastrando en cualquier sentido, y pone la Y hacia arriba', () => {
    const ida = rectanguloNormalizado({ x: 0, y: 0 }, { x: 100, y: 50 }, 200, 100)
    const vuelta = rectanguloNormalizado({ x: 100, y: 50 }, { x: 0, y: 0 }, 200, 100)
    expect(ida).toEqual(vuelta)
    expect(ida).toEqual({ minX: -1, maxX: 0, minY: 0, maxY: 1 })
  })
})

describe('seleccionTras', () => {
  const actual = new Set(['a', 'b'])

  it('reemplaza, suma, quita y alterna', () => {
    expect([...seleccionTras(actual, ['c'], 'reemplazar')]).toEqual(['c'])
    expect([...seleccionTras(actual, ['c'], 'sumar')]).toEqual(['a', 'b', 'c'])
    expect([...seleccionTras(actual, ['a'], 'quitar')]).toEqual(['b'])
    expect([...seleccionTras(actual, ['a', 'c'], 'alternar')]).toEqual(['b', 'c'])
  })

  // El visor sabe que la selección cambió comparando por identidad.
  it('devuelve siempre un conjunto nuevo y no toca el que recibe', () => {
    const tras = seleccionTras(actual, [], 'sumar')
    expect(tras).not.toBe(actual)
    expect([...actual]).toEqual(['a', 'b'])
  })
})

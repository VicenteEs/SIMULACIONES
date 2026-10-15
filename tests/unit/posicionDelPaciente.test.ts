import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  derechaDeLaVista,
  ejesDelPaciente,
  girarLaVista,
  ortogonalizar,
  poseDeLaPosicion,
  rodarLaVista,
  type EjeDelHueso,
  type PoseDeLaVista,
  type Vec3,
} from '@/lib/posicionDelPaciente'
import { sincronizarElArriba } from '@/components/simulador/vistaDelPaciente'

/**
 * La posición del paciente es geometría de la cámara: se prueba con números, sin pantalla.
 *
 * Lo que importa es lo que Cristóbal pidió: poder «acostar» al paciente. Antes el orbitar solo daba la vuelta
 * con el arriba fijo y el miembro quedaba siempre vertical.
 */

const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norma = (a: Vec3) => Math.hypot(...a)
const EJES: EjeDelHueso[] = ['x', 'y', 'z']

/** Un elemento que `OrbitControls` acepta sin navegador: solo apunta los oyentes y los olvida. */
function elementoFalso(): HTMLElement {
  const documento = { addEventListener() {}, removeEventListener() {} }
  return {
    addEventListener() {},
    removeEventListener() {},
    style: {},
    getRootNode: () => documento,
    ownerDocument: documento,
  } as unknown as HTMLElement
}

function esUnaPoseValida(p: PoseDeLaVista) {
  expect(norma(p.direccion)).toBeCloseTo(1, 6)
  expect(norma(p.arriba)).toBeCloseTo(1, 6)
  expect(punto(p.direccion, p.arriba)).toBeCloseTo(0, 6)
}

describe('poseDeLaPosicion', () => {
  it.each(EJES)('de pie deja el hueso hacia arriba de la pantalla (eje %s)', (eje) => {
    const pose = poseDeLaPosicion('de-pie', eje)
    expect(norma(pose.direccion)).toBeCloseTo(1, 6)
    expect(pose.arriba).toEqual(ejesDelPaciente(eje).hueso)
    // Abre con un sesgo, así que su arriba no es perpendicular a la mirada; `ortogonalizar` lo arregla.
    esUnaPoseValida(ortogonalizar(pose))
  })

  it.each(EJES)('supino y prono tienden el hueso en horizontal en la pantalla (eje %s)', (eje) => {
    const { hueso } = ejesDelPaciente(eje)
    for (const posicion of ['supino', 'prono'] as const) {
      const pose = poseDeLaPosicion(posicion, eje)
      esUnaPoseValida(pose)
      // «Horizontal en la pantalla» es que el hueso no tenga componente a lo largo del arriba de la vista.
      expect(Math.abs(punto(hueso, pose.arriba))).toBeLessThan(1e-6)
    }
  })

  it.each(EJES)('supino se mira por delante y prono por detrás (eje %s)', (eje) => {
    const { frente } = ejesDelPaciente(eje)
    expect(punto(poseDeLaPosicion('supino', eje).direccion, frente)).toBeGreaterThan(0.9)
    expect(punto(poseDeLaPosicion('prono', eje).direccion, frente)).toBeLessThan(-0.9)
  })

  it.each(EJES)('en las dos el extremo proximal queda a la izquierda de la pantalla (eje %s)', (eje) => {
    const { hueso } = ejesDelPaciente(eje)
    for (const posicion of ['supino', 'prono'] as const) {
      const derecha = derechaDeLaVista(poseDeLaPosicion(posicion, eje))
      // La derecha de la pantalla apunta contra el hueso: lo proximal, que es «hacia el hueso», queda a la izquierda.
      expect(punto(derecha, hueso)).toBeLessThan(-0.99)
    }
  })

  it('no es la misma vista que de pie: acostar cambia el arriba, no solo la cámara', () => {
    const de = poseDeLaPosicion('de-pie', 'y').arriba
    const supino = poseDeLaPosicion('supino', 'y').arriba
    expect(punto(de, supino)).toBeCloseTo(0, 6)
  })
})

describe('girarLaVista (el giro libre)', () => {
  it('conserva una pose válida después de muchos arrastres seguidos', () => {
    let pose = poseDeLaPosicion('de-pie', 'y')
    for (let i = 0; i < 400; i++) pose = girarLaVista(pose, 7, -3)
    esUnaPoseValida(pose)
  })

  it('no tiene polos: arrastrando hacia abajo se pasa por encima de la cabeza y se sigue', () => {
    let pose = poseDeLaPosicion('de-pie', 'y')
    // Un cuarto de vuelta hacia abajo deja la cámara arriba del todo; el orbitar de siempre se paraba ahí.
    const unCuarto = 175
    pose = girarLaVista(pose, 0, unCuarto)
    pose = girarLaVista(pose, 0, unCuarto)
    esUnaPoseValida(pose)
    // La cámara pasó de largo el polo: ahora el «arriba» ya no es el del mundo.
    expect(pose.arriba[1]).toBeLessThan(0.9)
  })

  it('arrastrar hacia los lados gira alrededor del arriba y lo deja igual', () => {
    const antes = poseDeLaPosicion('supino', 'y')
    const despues = girarLaVista(antes, 120, 0)
    expect(despues.arriba[0]).toBeCloseTo(antes.arriba[0], 6)
    expect(despues.arriba[1]).toBeCloseTo(antes.arriba[1], 6)
    expect(despues.arriba[2]).toBeCloseTo(antes.arriba[2], 6)
    expect(punto(despues.direccion, antes.direccion)).toBeLessThan(0.99)
  })

  it('un arrastre a la derecha lleva la cámara hacia la izquierda del modelo (el modelo gira a la derecha)', () => {
    const antes = poseDeLaPosicion('de-pie', 'y')
    const derecha = derechaDeLaVista(antes)
    const despues = girarLaVista(antes, 80, 0)
    expect(punto(despues.direccion, derecha)).toBeLessThan(punto(antes.direccion, derecha))
  })

  it('sin movimiento no cambia nada', () => {
    const pose = poseDeLaPosicion('prono', 'y')
    const igual = girarLaVista(pose, 0, 0)
    for (let i = 0; i < 3; i++) {
      expect(igual.direccion[i]).toBeCloseTo(pose.direccion[i], 9)
      expect(igual.arriba[i]).toBeCloseTo(pose.arriba[i], 9)
    }
  })
})

describe('rodarLaVista', () => {
  it('un cuarto de vuelta tumba al paciente: lo vertical pasa a horizontal', () => {
    const de = poseDeLaPosicion('de-pie', 'y')
    const rodada = rodarLaVista(de, 90)
    esUnaPoseValida(rodada)
    // Lo que apuntaba hacia arriba de la pantalla ahora apunta hacia un lado.
    expect(punto(rodada.arriba, de.arriba)).toBeCloseTo(0, 6)
    expect(rodada.direccion).toEqual(de.direccion)
  })

  it('cuatro cuartos de vuelta vuelven a la misma vista', () => {
    const de = poseDeLaPosicion('supino', 'z')
    let p = de
    for (let i = 0; i < 4; i++) p = rodarLaVista(p, 90)
    for (let i = 0; i < 3; i++) expect(p.arriba[i]).toBeCloseTo(de.arriba[i], 6)
  })
})

describe('sincronizarElArriba', () => {
  it('OrbitControls guarda su arriba en un campo privado: si three lo renombra, esta prueba avisa', () => {
    const camara = new THREE.PerspectiveCamera(42, 1, 0.01, 100)
    const controles = new OrbitControls(camara, elementoFalso())
    const interno = controles as unknown as { _quat?: THREE.Quaternion; _quatInverse?: THREE.Quaternion }
    expect(interno._quat).toBeInstanceOf(THREE.Quaternion)
    expect(interno._quatInverse).toBeInstanceOf(THREE.Quaternion)
    controles.dispose()
  })

  it('después de cambiar el arriba, los controles orbitan alrededor del arriba nuevo', () => {
    const camara = new THREE.PerspectiveCamera(42, 1, 0.01, 100)
    const controles = new OrbitControls(camara, elementoFalso())
    const pose = poseDeLaPosicion('supino', 'y')
    camara.up.set(...pose.arriba)
    camara.position.set(...pose.direccion).multiplyScalar(2)
    camara.lookAt(0, 0, 0)
    sincronizarElArriba(controles, camara)

    const interno = controles as unknown as { _quat: THREE.Quaternion }
    // En el espacio de los controles el arriba del paciente es el +Y de siempre.
    const enElEspacioDeControles = new THREE.Vector3(...pose.arriba).applyQuaternion(interno._quat)
    expect(enElEspacioDeControles.x).toBeCloseTo(0, 6)
    expect(enElEspacioDeControles.y).toBeCloseTo(1, 6)
    expect(enElEspacioDeControles.z).toBeCloseTo(0, 6)

    // Y sin ninguna entrada, actualizar no mueve la cámara de donde la dejó la posición.
    const antes = camara.position.clone()
    controles.update()
    expect(camara.position.distanceTo(antes)).toBeLessThan(1e-6)
    controles.dispose()
  })
})

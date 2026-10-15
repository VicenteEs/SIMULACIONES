import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { largoVisibleDelAgujero } from '@/lib/simulador'
import { ajustarAlSalto, barridoEnPantalla, centroLocalDe, colocarEnElMundo } from '@/components/simulador/asasDelHueso'
import { crearGizmo } from '@/atlas/gizmo'

/**
 * Las asas del hueso (D-174) y el agujero de la broca.
 *
 * Cristóbal pidió poder corregir la angulación «de todos lados»: mover y girar un trozo en cada eje, no solo
 * arrastrarlo sobre la pantalla. La cuenta se prueba con números y sin WebGL; lo que importa es que el hueso quede
 * donde dice el asa **en el mundo**, aunque el nodo cuelgue de un padre movido, y que un giro sobre el centro no
 * mueva el centro.
 */

const cerca = (a: number, b: number, tolerancia = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(tolerancia)

/** Un nodo con su padre, listo para medir en el mundo. */
function nodoColgado(padre: THREE.Object3D, posicion: [number, number, number]) {
  const nodo = new THREE.Object3D()
  nodo.position.set(...posicion)
  padre.add(nodo)
  padre.updateMatrixWorld(true)
  return nodo
}

/** Aplica el resultado de `colocarEnElMundo` al nodo, como hace el lienzo, y devuelve su sitio en el mundo. */
function mover(
  nodo: THREE.Object3D,
  pivote: THREE.Vector3,
  traslacion: THREE.Vector3,
  giro: THREE.Quaternion,
) {
  nodo.updateMatrixWorld(true)
  const inicial = nodo.matrixWorld.clone()
  const inversaDelPadre = nodo.parent ? nodo.parent.matrixWorld.clone().invert() : new THREE.Matrix4()
  const { posicion, rotacion } = colocarEnElMundo(inicial, inversaDelPadre, pivote, traslacion, giro)
  nodo.position.copy(posicion)
  nodo.quaternion.copy(rotacion)
  nodo.updateMatrixWorld(true)
  return nodo.getWorldPosition(new THREE.Vector3())
}

const SIN_GIRO = new THREE.Quaternion()
const SIN_MOVER = new THREE.Vector3()

describe('colocarEnElMundo', () => {
  it('sin mover ni girar deja el nodo donde estaba', () => {
    const nodo = nodoColgado(new THREE.Object3D(), [3, 4, 5])
    const donde = mover(nodo, new THREE.Vector3(3, 4, 5), SIN_MOVER, SIN_GIRO)
    cerca(donde.x, 3)
    cerca(donde.y, 4)
    cerca(donde.z, 5)
  })

  it('trasladar es sumar al sitio del mundo lo que dice el asa', () => {
    const nodo = nodoColgado(new THREE.Object3D(), [1, 2, 3])
    const donde = mover(nodo, new THREE.Vector3(1, 2, 3), new THREE.Vector3(0.5, 0, -0.25), SIN_GIRO)
    cerca(donde.x, 1.5)
    cerca(donde.y, 2)
    cerca(donde.z, 2.75)
  })

  it('con un padre movido y girado, la traslación sigue siendo en el mundo y no en el espacio del padre', () => {
    // Sumar a `position` solo acierta con el padre en reposo: aquí gira un cuarto de vuelta y está corrido.
    const padre = new THREE.Object3D()
    padre.position.set(10, 0, 0)
    padre.rotation.y = Math.PI / 2
    const nodo = nodoColgado(padre, [1, 0, 0])
    const antes = nodo.getWorldPosition(new THREE.Vector3())
    const donde = mover(nodo, antes, new THREE.Vector3(2, 0, 0), SIN_GIRO)
    cerca(donde.x, antes.x + 2)
    cerca(donde.y, antes.y)
    cerca(donde.z, antes.z)
  })

  it('girar sobre el propio centro no mueve el centro', () => {
    const nodo = nodoColgado(new THREE.Object3D(), [2, 1, 0])
    const centro = new THREE.Vector3(2, 1, 0)
    const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 3)
    const donde = mover(nodo, centro, SIN_MOVER, giro)
    cerca(donde.x, 2)
    cerca(donde.y, 1)
    cerca(donde.z, 0)
    // Y el nodo giró de verdad: 60° sobre Y.
    cerca(nodo.quaternion.angleTo(new THREE.Quaternion()), Math.PI / 3, 1e-5)
  })

  it('girar sobre otro punto describe un arco: un cuarto de vuelta sobre Z lleva (1,0,0) a (0,1,0)', () => {
    const nodo = nodoColgado(new THREE.Object3D(), [1, 0, 0])
    const giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
    const donde = mover(nodo, new THREE.Vector3(0, 0, 0), SIN_MOVER, giro)
    cerca(donde.x, 0)
    cerca(donde.y, 1)
    cerca(donde.z, 0)
  })

  it('se mide desde el inicio del gesto: ir y volver deja el hueso en su sitio, sin acumular error', () => {
    const nodo = nodoColgado(new THREE.Object3D(), [0.3, -0.2, 0.7])
    nodo.updateMatrixWorld(true)
    const inicial = nodo.matrixWorld.clone()
    const pivote = nodo.getWorldPosition(new THREE.Vector3())
    // Cien movimientos del ratón que acaban donde empezaron: cada uno parte de `inicial`, no del anterior.
    let ultimo = { posicion: new THREE.Vector3(), rotacion: new THREE.Quaternion() }
    for (let i = 0; i <= 100; i++) {
      const angulo = Math.sin((i / 100) * Math.PI) * 1.3
      ultimo = colocarEnElMundo(
        inicial,
        new THREE.Matrix4(),
        pivote,
        new THREE.Vector3(Math.sin((i / 100) * Math.PI) * 0.4, 0, 0),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angulo),
      )
    }
    cerca(ultimo.posicion.x, 0.3, 1e-9)
    cerca(ultimo.posicion.y, -0.2, 1e-9)
    cerca(ultimo.posicion.z, 0.7, 1e-9)
    cerca(ultimo.rotacion.angleTo(new THREE.Quaternion()), 0, 1e-6)
  })

  it('compone con el giro que el hueso ya traía: el giro del asa es en el mundo, no sobre sus ejes propios', () => {
    const nodo = nodoColgado(new THREE.Object3D(), [0, 0, 0])
    nodo.rotation.z = Math.PI / 2
    nodo.updateMatrixWorld(true)
    // Un giro de 90° sobre el eje X del mundo, después del de 90° sobre Z que traía: el eje Y propio acaba en Z.
    mover(nodo, new THREE.Vector3(), SIN_MOVER, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2))
    const yPropio = new THREE.Vector3(0, 1, 0).applyQuaternion(nodo.quaternion)
    // Z(90°) lleva Y a −X; X(90°) deja −X donde está.
    cerca(yPropio.x, -1)
    cerca(yPropio.y, 0)
    cerca(yPropio.z, 0)
    const xPropio = new THREE.Vector3(1, 0, 0).applyQuaternion(nodo.quaternion)
    // Z(90°) lleva X a Y; X(90°) lleva Y a Z.
    cerca(xPropio.x, 0)
    cerca(xPropio.y, 0)
    cerca(xPropio.z, 1)
  })
})

describe('centroLocalDe', () => {
  it('es el centro de la geometría, en el espacio del nodo', () => {
    const geometria = new THREE.BoxGeometry(2, 4, 6)
    geometria.translate(10, 0, 0)
    const hueso = new THREE.Mesh(geometria)
    const centro = centroLocalDe(hueso)
    cerca(centro.x, 10)
    cerca(centro.y, 0)
    cerca(centro.z, 0)
  })

  it('acompaña al hueso rígidamente cuando este gira: el manipulador no baila durante el giro', () => {
    const geometria = new THREE.BoxGeometry(2, 4, 6)
    geometria.translate(10, 0, 0)
    const hueso = new THREE.Mesh(geometria)
    hueso.position.set(1, 2, 3)
    hueso.updateMatrixWorld(true)
    const antes = hueso.localToWorld(centroLocalDe(hueso))
    // Gira 90° sobre Z alrededor de su origen: el centro (10,0,0) local pasa a (0,10,0) más la posición.
    hueso.rotation.z = Math.PI / 2
    hueso.updateMatrixWorld(true)
    const despues = hueso.localToWorld(centroLocalDe(hueso))
    cerca(despues.x, 1)
    cerca(despues.y, 12)
    cerca(despues.z, 3)
    // El mismo punto del hueso, no un centro recalculado de una caja que crece al girar.
    expect(despues.distanceTo(new THREE.Vector3(1, 2, 3))).toBeCloseTo(antes.distanceTo(new THREE.Vector3(1, 2, 3)), 6)
  })

  it('un nodo sin geometría tiene el centro en su origen', () => {
    const centro = centroLocalDe(new THREE.Object3D())
    expect(centro.length()).toBe(0)
  })
})

describe('el giro con el cursor', () => {
  it('un cuarto de vuelta en el sentido de las agujas del reloj, en pantalla, es +90°', () => {
    // El pivote en (0,0); el cursor pasa de la derecha (1,0) a abajo (0,1): la Y de la pantalla crece hacia abajo.
    cerca(barridoEnPantalla(0, 0, 1, 0, 0, 1), Math.PI / 2)
  })

  it('en contra de las agujas del reloj es negativo, y no se parte al pasar por el lado opuesto', () => {
    cerca(barridoEnPantalla(0, 0, 1, 0, 0, -1), -Math.PI / 2)
    // Más de media vuelta sigue creciendo: un giro de 190° no se convierte en −170° a mitad del gesto.
    expect(barridoEnPantalla(0, 0, 1, 0.01, -1, -0.5)).toBeGreaterThan(-Math.PI)
  })

  it('con Ctrl salta de cinco en cinco grados', () => {
    const grados = (g: number) => (g * Math.PI) / 180
    cerca(ajustarAlSalto(grados(7)), grados(5))
    cerca(ajustarAlSalto(grados(8)), grados(10))
    cerca(ajustarAlSalto(grados(-12.4)), grados(-10))
    cerca(ajustarAlSalto(grados(31), 15), grados(30))
  })
})

describe('las asas', () => {
  it('son las del taller del atlas: tres flechas, tres aros y el aro de la vista', () => {
    const gizmo = crearGizmo()
    const asas = gizmo.asas.map((a) => a.userData.asa as { modo: string; eje: string })
    expect(asas.filter((a) => a.modo === 'mover').map((a) => a.eje).sort()).toEqual(['x', 'y', 'z'])
    expect(asas.filter((a) => a.modo === 'girar' && a.eje !== 'vista').map((a) => a.eje).sort()).toEqual(['x', 'y', 'z'])
    expect(asas.filter((a) => a.eje === 'vista')).toHaveLength(1)
    gizmo.liberar()
  })
})

describe('el agujero de la broca', () => {
  it('se dibuja hasta la cortical opuesta y ni un milímetro más', () => {
    // La broca avanzó 20 y el hueso termina a 14: el cilindro negro que asomaba por el otro lado medía 6 de más.
    expect(largoVisibleDelAgujero(20, 14)).toBe(14)
  })

  it('si no llegó a salir, se dibuja lo que avanzó', () => {
    expect(largoVisibleDelAgujero(9, 14)).toBe(9)
  })

  it('nunca es negativo, aunque la salida venga de un rayo que no cruzó nada', () => {
    expect(largoVisibleDelAgujero(5, -2)).toBe(0)
    expect(largoVisibleDelAgujero(0, 14)).toBe(0)
  })
})

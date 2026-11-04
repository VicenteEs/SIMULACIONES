import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  correrElOrigenDelArchivo,
  poseDelTrayecto,
  poseReducida,
  ponerPose,
  posesReducidasDe,
  registrarPosesDelArchivo,
  transformacionDesdeElArchivo,
  trayecto,
  trozosParaReducir,
} from '@/components/simulador/reduccionEnLaEscena'
import { matrizDe, transformacionDe } from '@/lib/reduccionAutomatica'

/** Un modelo como lo deja el cargador: la raíz corrida al centro y un trozo con el origen en el del cuerpo. */
function modelo() {
  const raiz = new THREE.Group()
  const trozo = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.02).translate(0.05, 0.1, -0.02))
  trozo.name = 'Tibia_1'
  raiz.add(trozo)
  raiz.position.set(-0.3, 0.2, 0.1)
  registrarPosesDelArchivo(raiz)
  return { raiz, trozo }
}

const verticesEnLaRaiz = (raiz: THREE.Object3D, trozo: THREE.Mesh) => {
  raiz.updateMatrixWorld(true)
  const a = raiz.matrixWorld.clone().invert().multiply(trozo.matrixWorld)
  const p = trozo.geometry.getAttribute('position')
  return Array.from({ length: p.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(a))
}

const giro = (grados: [number, number, number], mm: [number, number, number]) =>
  transformacionDe(
    new THREE.Matrix4().compose(
      new THREE.Vector3(...mm.map((n) => n / 1000)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...grados.map((g) => (g * Math.PI) / 180))),
      new THREE.Vector3(1, 1, 1),
    ),
  )

describe('la posición reducida en la escena (P-008 E5)', () => {
  it('los vértices de un trozo salen como en el archivo aunque se haya movido', () => {
    const { raiz, trozo } = modelo()
    const antes = trozosParaReducir(raiz, ['Tibia_1'])[0].posiciones
    trozo.position.set(0.01, -0.03, 0.02)
    trozo.rotation.set(0.3, 0.1, -0.2)
    const despues = trozosParaReducir(raiz, ['Tibia_1'])[0].posiciones
    for (let i = 0; i < antes.length; i++) expect(despues[i]).toBeCloseTo(antes[i], 9)
  })

  it('correr el origen del fragmento a su centro no cambia su pose del archivo, solo cómo se escribe', () => {
    const { raiz, trozo } = modelo()
    const antes = trozosParaReducir(raiz, ['Tibia_1'])[0].posiciones
    // Lo que hace `pivoteEnSuCentro`: la geometría retrocede lo que avanza el nodo.
    const centro = new THREE.Vector3(0.05, 0.1, -0.02)
    correrElOrigenDelArchivo(trozo, centro)
    trozo.geometry.translate(-centro.x, -centro.y, -centro.z)
    trozo.position.add(centro)
    const despues = trozosParaReducir(raiz, ['Tibia_1'])[0].posiciones
    for (let i = 0; i < antes.length; i++) expect(despues[i]).toBeCloseTo(antes[i], 9)
  })

  it('en su pose reducida, el trozo es el del archivo movido por la transformación guardada', () => {
    const { raiz, trozo } = modelo()
    const delArchivo = verticesEnLaRaiz(raiz, trozo)
    const t = giro([10, -25, 40], [7, -12, 3])
    ponerPose(trozo, poseReducida(raiz, trozo, t))
    const reducido = verticesEnLaRaiz(raiz, trozo)
    reducido.forEach((v, i) => expect(v.distanceTo(delArchivo[i].clone().applyMatrix4(matrizDe(t)))).toBeLessThan(1e-9))
    // Y medida de vuelta, la reducción hecha a mano es esa misma transformación.
    const medida = matrizDe(transformacionDesdeElArchivo(raiz, trozo))
    expect(medida.equals(matrizDe(t)) || medida.elements.every((e, i) => Math.abs(e - matrizDe(t).elements[i]) < 1e-9)).toBe(true)
  })

  it('las poses reducidas se piden por nombre, y un nodo que el modelo no trae no sale', () => {
    const { raiz, trozo } = modelo()
    const poses = posesReducidasDe(raiz, [
      ['Tibia_1', giro([0, 0, 0], [1, 0, 0])],
      ['No_esta', giro([0, 0, 0], [1, 0, 0])],
    ])
    expect([...poses.keys()]).toEqual([trozo])
  })

  it('el trayecto gira alrededor del centro del trozo: a mitad de camino, el centro está a mitad de camino', () => {
    const { raiz, trozo } = modelo()
    const t = giro([0, 0, 60], [20, 0, 0])
    const llegada = poseReducida(raiz, trozo, t)
    const tramo = trayecto(trozo, llegada)
    const centro = () => new THREE.Box3().setFromObject(trozo).getCenter(new THREE.Vector3())
    const salida = centro()
    ponerPose(trozo, llegada)
    const fin = centro()
    ponerPose(trozo, poseDelTrayecto(tramo, 0.5))
    expect(centro().distanceTo(salida.clone().lerp(fin, 0.5))).toBeLessThan(1e-6)
    ponerPose(trozo, poseDelTrayecto(tramo, 1))
    expect(centro().distanceTo(fin)).toBeLessThan(1e-9)
    ponerPose(trozo, poseDelTrayecto(tramo, 0))
    expect(centro().distanceTo(salida)).toBeLessThan(1e-9)
  })
})

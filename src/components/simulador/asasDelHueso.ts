/**
 * La cuenta de las asas con que se mueve y se gira un trozo de hueso en el modo Mover (D-174).
 *
 * Arrastrar el hueso con el ratón lo traslada en el plano de la pantalla y nada más: con eso no se corrige una
 * angulación ni se lleva un trozo hacia dentro o hacia fuera de la imagen. Las asas son las del taller del atlas
 * (`@/atlas/gizmo`: tres flechas, tres aros y el aro de la vista), y esta cuenta es lo único que hace falta para
 * llevarlas a un nodo del modelo del simulador.
 *
 * Va aparte del lienzo para poder probarla sin WebGL, y porque el error que más se paga aquí es de signo o de
 * sistema de coordenadas: un nodo cuelga de un padre que puede estar movido, y desplazarlo «en el mundo» sumando a
 * su `position` local solo acierta cuando el padre está en reposo.
 */

import * as THREE from 'three'
import { ejeFisicoDelMovimiento, vectorDelEje, type AccionDeMovimiento, type EjeAnatomico } from '@/lib/movimientoPorEjes'
import type { EjeDelHueso } from '@/lib/posicionDelPaciente'

/**
 * Dónde queda una pieza tras desplazarla `traslacion` y girarla `giro` alrededor de `pivote`, todo en el mundo.
 *
 * Parte de la matriz que la pieza tenía **al agarrar el asa** y no de la del fotograma anterior: sumando
 * incrementos, el error de cada movimiento del ratón se acumula y un giro de ida y vuelta no devuelve el hueso a su
 * sitio. Devuelve posición y orientación **locales**, que es lo que se escribe en el nodo; la escala no se toca.
 */
export function colocarEnElMundo(
  inicial: THREE.Matrix4,
  inversaDelPadre: THREE.Matrix4,
  pivote: THREE.Vector3,
  traslacion: THREE.Vector3,
  giro: THREE.Quaternion,
): { posicion: THREE.Vector3; rotacion: THREE.Quaternion } {
  const alOrigen = new THREE.Matrix4().makeTranslation(-pivote.x, -pivote.y, -pivote.z)
  const giroEnElMundo = new THREE.Matrix4().makeRotationFromQuaternion(giro)
  const deVuelta = new THREE.Matrix4().makeTranslation(
    pivote.x + traslacion.x,
    pivote.y + traslacion.y,
    pivote.z + traslacion.z,
  )
  const mundo = deVuelta.multiply(giroEnElMundo).multiply(alOrigen).multiply(inicial)
  const local = inversaDelPadre.clone().multiply(mundo)
  const posicion = new THREE.Vector3()
  const rotacion = new THREE.Quaternion()
  local.decompose(posicion, rotacion, new THREE.Vector3())
  return { posicion, rotacion }
}

/**
 * Mueve una pieza `valor` milímetros (trasladar) o grados (angular, rotar) por un eje del paciente, medido desde donde está
 * ahora (P-004 E7). Es lo que hace cada pulsación de flecha del menú de movimiento. El giro es alrededor del centro de la
 * pieza y a la derecha según el eje (regla de la mano derecha); la traslación, a lo largo del eje, sin girarla.
 *
 * Parte de la matriz del mundo de ahora y la lleva con `colocarEnElMundo`, así que acierta aunque el padre esté movido.
 * Aparte del lienzo para poder probarla sin WebGL: el error que se paga aquí es de signo y de eje.
 */
export function moverPiezaPorEje(
  pieza: THREE.Object3D,
  accion: AccionDeMovimiento,
  eje: EjeAnatomico,
  valor: number,
  ejeLargo: EjeDelHueso,
  unidadesPorMm: number,
): void {
  const v = vectorDelEje(ejeFisicoDelMovimiento(accion, eje), ejeLargo)
  const direccion = new THREE.Vector3(v[0], v[1], v[2])
  pieza.updateMatrixWorld(true)
  const pivote = pieza.localToWorld(centroLocalDe(pieza))
  const traslacion = accion === 'trasladar' ? direccion.clone().multiplyScalar(valor * unidadesPorMm) : new THREE.Vector3()
  const giro =
    accion === 'trasladar' ? new THREE.Quaternion() : new THREE.Quaternion().setFromAxisAngle(direccion, (valor * Math.PI) / 180)
  const { posicion, rotacion } = colocarEnElMundo(
    pieza.matrixWorld.clone(),
    pieza.parent ? pieza.parent.matrixWorld.clone().invert() : new THREE.Matrix4(),
    pivote,
    traslacion,
    giro,
  )
  pieza.position.copy(posicion)
  pieza.quaternion.copy(rotacion)
}

const centrosGuardados = new WeakMap<THREE.Object3D, THREE.Vector3>()

/**
 * El centro de la geometría de un nodo, en el espacio del propio nodo.
 *
 * Es donde se pone el manipulador y sobre lo que giran los aros. Está en el espacio local y no en el del mundo a
 * propósito: así el manipulador acompaña al hueso rígidamente cuando este gira. Con la caja del mundo, la caja de
 * un hueso girado crece, su centro se corre y el manipulador bailaba bajo el ratón durante el giro. Se mide una
 * vez por nodo: recorrer los vértices en cada fotograma no aporta nada.
 */
export function centroLocalDe(objeto: THREE.Object3D): THREE.Vector3 {
  const guardado = centrosGuardados.get(objeto)
  if (guardado) return guardado.clone()
  objeto.updateMatrixWorld(true)
  const inversa = objeto.matrixWorld.clone().invert()
  const caja = new THREE.Box3()
  objeto.traverse((hijo) => {
    const malla = hijo as THREE.Mesh
    if (!malla.isMesh || !malla.geometry) return
    malla.geometry.computeBoundingBox()
    if (!malla.geometry.boundingBox) return
    caja.union(malla.geometry.boundingBox.clone().applyMatrix4(malla.matrixWorld.clone().premultiply(inversa)))
  })
  const centro = caja.isEmpty() ? new THREE.Vector3() : caja.getCenter(new THREE.Vector3())
  centrosGuardados.set(objeto, centro)
  return centro.clone()
}

/**
 * Cuánto ha rodeado el cursor al pivote en pantalla, en radianes y en el sentido de las agujas del reloj.
 *
 * La Y de la pantalla crece hacia abajo, y por eso el signo que sale ya es el horario que espera `giroDelArrastre`.
 * No se normaliza a ±180°: un giro de 370° y uno de 10° son el mismo giro, y partir el ángulo por la mitad haría
 * saltar el hueso justo al pasar por el lado opuesto del pivote.
 */
export function barridoEnPantalla(
  pivoteX: number,
  pivoteY: number,
  inicioX: number,
  inicioY: number,
  x: number,
  y: number,
): number {
  return Math.atan2(y - pivoteY, x - pivoteX) - Math.atan2(inicioY - pivoteY, inicioX - pivoteX)
}

/** El ángulo llevado al múltiplo de `gradosDeSalto` más cercano: Ctrl mientras se gira, de cinco en cinco por omisión. */
export function ajustarAlSalto(angulo: number, gradosDeSalto = 5): number {
  const paso = (gradosDeSalto * Math.PI) / 180
  return Math.round(angulo / paso) * paso
}

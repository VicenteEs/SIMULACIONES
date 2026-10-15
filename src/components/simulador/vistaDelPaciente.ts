import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { unitario, type PoseDeLaVista, type Vec3 } from '@/lib/posicionDelPaciente'

/**
 * La cámara del simulador puesta en una posición del paciente, y el giro libre sobre ella.
 *
 * La geometría está en `@/lib/posicionDelPaciente` y se prueba con números; esto es lo que toca three: el
 * «arriba» de la cámara y el de los controles.
 */

/** Cómo abre el modelo al cargarlo: de frente con un poco de sesgo, y el eje Y hacia arriba. */
export const POSE_AL_CARGAR: PoseDeLaVista = { direccion: unitario([0.4, 0.15, 1]), arriba: [0, 1, 0] }

/**
 * Le dice a `OrbitControls` cuál es el «arriba» de ahora.
 *
 * `OrbitControls` orbita alrededor de `camera.up`, pero lo lee **una sola vez**, al construirse
 * (`_quat`, el giro que lleva ese arriba al +Y). Cambiar `camera.up` después no basta: la cámara se
 * mira con el arriba nuevo pero el arrastre sigue girando alrededor del viejo, y con el paciente tumbado el
 * orbitar iría de lado. No hay método público para recalcularlo, así que se escribe el campo; la prueba de
 * `posicionDelPaciente.test.ts` falla si una versión de three lo renombra.
 */
export function sincronizarElArriba(controles: OrbitControls, camara: THREE.Camera) {
  const interno = controles as unknown as { _quat?: THREE.Quaternion; _quatInverse?: THREE.Quaternion }
  if (!interno._quat || !interno._quatInverse) return
  interno._quat.setFromUnitVectors(camara.up.clone().normalize(), new THREE.Vector3(0, 1, 0))
  interno._quatInverse.copy(interno._quat).invert()
}

/**
 * Pone la cámara mirando a `centro` desde la dirección de la pose, a esa distancia, con su arriba. Es la
 * orden de «De pie», «Supino» y «Prono», y la de encuadrar.
 */
export function ponerLaPose(
  camara: THREE.PerspectiveCamera,
  controles: OrbitControls,
  centro: THREE.Vector3,
  distancia: number,
  pose: PoseDeLaVista,
) {
  camara.up.set(...pose.arriba)
  controles.target.copy(centro)
  camara.position.copy(centro).addScaledVector(new THREE.Vector3(...pose.direccion), distancia)
  sincronizarElArriba(controles, camara)
  controles.update()
}

/** La pose con que se mira ahora mismo, tal como la dejó el ratón. */
export function poseActual(camara: THREE.Camera, controles: OrbitControls): PoseDeLaVista {
  const direccion = camara.position.clone().sub(controles.target)
  if (direccion.lengthSq() === 0) return POSE_AL_CARGAR
  direccion.normalize()
  // `camera.up` no tiene por qué ser perpendicular a la mirada (el modelo abre con un sesgo): se ortogonaliza
  // para que el giro libre parta de ejes que de verdad lo son.
  const arriba = camara.up.clone().addScaledVector(direccion, -camara.up.dot(direccion))
  if (arriba.lengthSq() < 1e-8) arriba.set(0, 1, 0).addScaledVector(direccion, -direccion.y)
  arriba.normalize()
  return { direccion: direccion.toArray() as Vec3, arriba: arriba.toArray() as Vec3 }
}

/** Aplica una pose a la cámara sin cambiar a dónde mira ni a qué distancia. Lo usa el giro libre en cada arrastre. */
export function aplicarLaPose(camara: THREE.PerspectiveCamera, controles: OrbitControls, pose: PoseDeLaVista) {
  const distancia = camara.position.distanceTo(controles.target)
  camara.up.set(...pose.arriba)
  camara.position.copy(controles.target).addScaledVector(new THREE.Vector3(...pose.direccion), distancia)
  sincronizarElArriba(controles, camara)
  controles.update()
}

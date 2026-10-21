import * as THREE from 'three'

/**
 * Los injertos óseos dentro de la escena (P-005 E7): el esponjoso, una malla instanciada de trozos pálidos que se van acumulando en el defecto, y el bloque tricortical,
 * una caja que ocupa el hueco entre los fragmentos. Los dos son hueso: **la fluoroscopia los ve** (no son de interfaz). Las reglas —si el defecto está lleno, si el
 * bloque encaja— están en `src/lib/injertoOseo.ts`.
 */

export interface InjertoEnLaEscena {
  /** Cuánto esponjoso se depositó, en cc. */
  esponjosoCc: number
  trozos: THREE.InstancedMesh
  cuenta: number
  bloque: { malla: THREE.Mesh; largoMm: number } | null
}

/** Cuántos trozos caben en la malla: más de eso no cabe en la escena y ya es demasiado injerto para cualquier defecto. */
export const MAXIMO_DE_TROZOS = 700
const TROZOS_POR_PUNADO = 14

export function crearInjerto(escena: THREE.Scene): InjertoEnLaEscena {
  const trozos = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0xe6d9ba, roughness: 0.92, metalness: 0 }),
    MAXIMO_DE_TROZOS,
  )
  trozos.count = 0
  trozos.frustumCulled = false
  trozos.name = 'trozos-de-injerto'
  trozos.raycast = () => {}
  escena.add(trozos)
  return { esponjosoCc: 0, trozos, cuenta: 0, bloque: null }
}

const matriz = new THREE.Matrix4()
const rotacion = new THREE.Quaternion()
const euler = new THREE.Euler()

/** Deposita un puñado de trozos de 3 a 8 mm alrededor de `punto`, un poco por encima de la superficie. Devuelve `false` si ya no caben más. */
export function depositarPunado(inj: InjertoEnLaEscena, punto: THREE.Vector3, normal: THREE.Vector3, milimetrosPorUnidad: number): boolean {
  if (inj.cuenta + TROZOS_POR_PUNADO > MAXIMO_DE_TROZOS) return false
  const u = 1 / milimetrosPorUnidad
  for (let i = 0; i < TROZOS_POR_PUNADO; i++) {
    const radio = (1.5 + Math.random() * 2.5) * u
    const posicion = punto
      .clone()
      .addScaledVector(normal, (2 + Math.random() * 3) * u)
      .add(new THREE.Vector3((Math.random() - 0.5) * 12 * u, (Math.random() - 0.5) * 12 * u, (Math.random() - 0.5) * 12 * u))
    euler.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
    rotacion.setFromEuler(euler)
    matriz.compose(posicion, rotacion, new THREE.Vector3(radio, radio * (0.7 + Math.random() * 0.4), radio))
    inj.trozos.setMatrixAt(inj.cuenta++, matriz)
  }
  inj.trozos.count = inj.cuenta
  inj.trozos.instanceMatrix.needsUpdate = true
  return true
}

/** Corte del bloque de cresta, en mm: tricortical, más ancho que grueso. */
const ANCHO_DEL_BLOQUE_MM = 18
const GRUESO_DEL_BLOQUE_MM = 12

/** Pone el bloque tricortical centrado en `centro`, con su largo a lo largo del eje del hueso (`eje`, unitario). Reemplaza el anterior. */
export function colocarBloque(escena: THREE.Scene, inj: InjertoEnLaEscena, centro: THREE.Vector3, eje: THREE.Vector3, largoMm: number, milimetrosPorUnidad: number) {
  if (inj.bloque) quitarObjeto(inj.bloque.malla)
  const u = 1 / milimetrosPorUnidad
  const malla = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xf2e8cc, roughness: 0.85 }))
  malla.name = 'bloque-de-injerto'
  malla.raycast = () => {}
  malla.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eje)
  malla.scale.set(GRUESO_DEL_BLOQUE_MM * u, largoMm * u, ANCHO_DEL_BLOQUE_MM * u)
  malla.position.copy(centro)
  escena.add(malla)
  inj.bloque = { malla, largoMm }
}

function quitarObjeto(o: THREE.Object3D) {
  o.removeFromParent()
  o.traverse((x) => {
    const m = x as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((y) => y.dispose())
    else mat?.dispose()
  })
}

/** Quita todo el injerto de la escena. */
export function quitarInjerto(inj: InjertoEnLaEscena) {
  quitarObjeto(inj.trozos)
  inj.trozos.dispose()
  if (inj.bloque) quitarObjeto(inj.bloque.malla)
  inj.bloque = null
  inj.cuenta = 0
  inj.esponjosoCc = 0
}

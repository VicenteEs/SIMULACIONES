import * as THREE from 'three'
import { MAXIMO_DE_HUELLAS, areaExpuestaMm2, espaciadoEntreHuellasMm, type Huella } from '@/lib/periostio'

/**
 * El periostio despegado, dentro de la escena (P-005 E2): cada pasada del Freer o del periostótomo deja discos claros sobre la cortical —el hueso
 * desnudo, donde ya no hay periostio—. Son una sola malla instanciada (una por huella, hasta `MAXIMO_DE_HUELLAS`), pegada al hueso con un
 * adelanto de profundidad para que no parpadee contra él, y no entran en la fluoroscopia (`deInterfaz`): un periostio levantado no absorbe rayos.
 * Las reglas —cuánto se espacian las huellas, cuándo es demasiado— están en `src/lib/periostio.ts`.
 */

export interface PeriostioEnLaEscena {
  huellas: Huella[]
  malla: THREE.InstancedMesh
  /** Dónde cayó la última huella (en el mundo), para espaciar la siguiente. */
  ultima: THREE.Vector3 | null
}

/** Lo que la consola necesita saber para decir cuánto se despegó. */
export interface EstadoDelPeriostio {
  areaMm2: number
  huellas: number
  /** Ancho de la hoja con la que se despegó por última vez, en mm. */
  anchoMm: number
}

export function crearPeriostio(escena: THREE.Scene): PeriostioEnLaEscena {
  const geometria = new THREE.CircleGeometry(1, 24)
  const material = new THREE.MeshBasicMaterial({
    color: 0xffc766,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
    // Pegado al hueso: sin esto el disco y la cortical, que están a la misma profundidad, se pelean y parpadea.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const malla = new THREE.InstancedMesh(geometria, material, MAXIMO_DE_HUELLAS)
  malla.count = 0
  malla.frustumCulled = false
  malla.userData.deInterfaz = true
  malla.name = 'periostio-despegado'
  escena.add(malla)
  return { huellas: [], malla, ultima: null }
}

const haciaLaNormal = new THREE.Quaternion()
const ejeZ = new THREE.Vector3(0, 0, 1)
const matriz = new THREE.Matrix4()

/**
 * Suma una huella en `punto` (mundo) con la normal del hueso ahí. Se salta si cae demasiado cerca de la anterior de la misma pasada
 * (`espaciadoEntreHuellasMm`) o si ya no caben más. Devuelve `true` si la añadió.
 */
export function sembrarHuella(p: PeriostioEnLaEscena, punto: THREE.Vector3, normal: THREE.Vector3, radioMm: number, milimetrosPorUnidad: number): boolean {
  if (p.huellas.length >= MAXIMO_DE_HUELLAS) return false
  const unidadesPorMm = 1 / milimetrosPorUnidad
  if (p.ultima && p.ultima.distanceTo(punto) < espaciadoEntreHuellasMm(radioMm) * unidadesPorMm) return false
  const n = normal.clone().normalize()
  p.huellas.push({
    x: punto.x * milimetrosPorUnidad,
    y: punto.y * milimetrosPorUnidad,
    z: punto.z * milimetrosPorUnidad,
    nx: n.x,
    ny: n.y,
    nz: n.z,
    radioMm,
  })
  const radio = radioMm * unidadesPorMm
  haciaLaNormal.setFromUnitVectors(ejeZ, n)
  // Un poco por encima de la cortical, a lo largo de la normal: 0,08 mm.
  const encima = punto.clone().addScaledVector(n, 0.08 * unidadesPorMm)
  matriz.compose(encima, haciaLaNormal, new THREE.Vector3(radio, radio, 1))
  p.malla.setMatrixAt(p.huellas.length - 1, matriz)
  p.malla.count = p.huellas.length
  p.malla.instanceMatrix.needsUpdate = true
  p.ultima = punto.clone()
  return true
}

/** Termina la pasada: la próxima huella no se espacia respecto de la última de esta. */
export function terminarLaPasada(p: PeriostioEnLaEscena) {
  p.ultima = null
}

export function estadoDelPeriostio(p: PeriostioEnLaEscena, anchoMm: number): EstadoDelPeriostio {
  return { areaMm2: areaExpuestaMm2(p.huellas), huellas: p.huellas.length, anchoMm }
}

/** Vuelve a cubrir el hueso: quita todas las huellas. */
export function volverACubrir(p: PeriostioEnLaEscena) {
  p.huellas.length = 0
  p.malla.count = 0
  p.ultima = null
}

export function soltarElPeriostio(p: PeriostioEnLaEscena) {
  p.malla.removeFromParent()
  p.malla.geometry.dispose()
  ;(p.malla.material as THREE.Material).dispose()
  p.malla.dispose()
}

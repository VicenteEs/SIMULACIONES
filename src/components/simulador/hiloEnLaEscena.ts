import * as THREE from 'three'
import { type HiloDeSutura, type PuntoDeSutura } from '@/lib/sutura'

/**
 * El hilo de una sutura dentro de la escena (D-169).
 *
 * Cada línea de puntadas es un tubo delgado que sigue la piel de un punto al
 * siguiente, y cada puntada lleva un nudo pequeño. Se reconstruye entero con cada
 * clic —son unas decenas de puntos—, que es más simple que ir alargando un tubo y
 * deja deshacer la última puntada sin casos especiales.
 *
 * El hilo **no cuelga de la malla del paciente**: vive en su propio grupo de la
 * escena. Así el rayo del lienzo, que recorre el modelo, no choca con él (el
 * hilo no es una superficie donde se pueda volver a picar), y cortar o abrir la
 * herida —que cambia la geometría de la piel— no lo arrastra ni lo rompe.
 */

/** Cuántas puntadas admite una sola sutura: más no cabe en la pantalla ni en la paciencia. */
export const MAXIMO_DE_PUNTADAS = 120

export interface SuturaEnEscena {
  grupo: THREE.Group
  puntos: PuntoDeSutura[]
  hilo: HiloDeSutura
  /** Los tubos y los nudos que hay ahora, para soltarlos antes de rehacer. */
  hechos: THREE.Object3D[]
  /** La próxima puntada empieza una línea nueva. */
  siguienteEsNueva?: boolean
}

export function crearSutura(escena: THREE.Scene, hilo: HiloDeSutura): SuturaEnEscena {
  const grupo = new THREE.Group()
  grupo.name = 'sutura'
  escena.add(grupo)
  return { grupo, puntos: [], hilo, hechos: [] }
}

/** Las mallas visibles de un modelo, que es contra lo que se apoya el hilo. */
export function mallasVisibles(raiz: THREE.Object3D): THREE.Mesh[] {
  const mallas: THREE.Mesh[] = []
  raiz.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && m.visible && m.name !== 'borde-de-la-herida') mallas.push(m)
  })
  return mallas
}

const rayoAuxiliar = new THREE.Raycaster()

/**
 * Los puntos de un tramo de hilo entre dos puntadas, pegados a la superficie.
 *
 * Se baja un rayo desde cada muestra, contra la normal, y el hilo se apoya donde
 * toca. Donde no toca nada —el tramo que cruza la herida abierta, que es justo lo
 * que une los bordes— el hilo sigue recto entre sus dos extremos: un hilo tendido
 * sobre el hueco, que es como queda una sutura antes de apretar.
 */
export function tramoApoyado(
  desde: PuntoDeSutura,
  hasta: PuntoDeSutura,
  superficies: THREE.Object3D[],
  unidadesPorMm: number,
  levantar: number,
): THREE.Vector3[] {
  const a = new THREE.Vector3(...desde.punto)
  const b = new THREE.Vector3(...hasta.punto)
  const na = new THREE.Vector3(...desde.normal)
  const nb = new THREE.Vector3(...hasta.normal)
  const largoMm = a.distanceTo(b) / unidadesPorMm
  // Una muestra cada milímetro y medio, entre 2 y 40.
  const muestras = Math.max(2, Math.min(40, Math.ceil(largoMm / 1.5)))
  const salida: THREE.Vector3[] = []
  for (let i = 1; i < muestras; i += 1) {
    const t = i / muestras
    const base = a.clone().lerp(b, t)
    const n = na.clone().lerp(nb, t).normalize()
    if (!(n.lengthSq() > 0)) {
      salida.push(base)
      continue
    }
    rayoAuxiliar.set(base.clone().addScaledVector(n, 3 * unidadesPorMm), n.clone().negate())
    rayoAuxiliar.far = 6 * unidadesPorMm
    const golpe = rayoAuxiliar.intersectObjects(superficies, false)[0]
    if (golpe) {
      const normalDelGolpe = golpe.face
        ? golpe.face.normal.clone().transformDirection(golpe.object.matrixWorld)
        : n.clone()
      if (normalDelGolpe.dot(n) < 0) normalDelGolpe.negate()
      salida.push(golpe.point.clone().addScaledVector(normalDelGolpe, levantar))
    } else {
      // Sin superficie debajo: el hilo sigue tendido entre los dos puntos.
      salida.push(base.addScaledVector(n, levantar))
    }
  }
  return salida
}

/**
 * Rehace los tubos y los nudos de la sutura con los puntos que tiene.
 *
 * `levantar` separa el hilo de la piel lo justo para que no se hunda en ella: el
 * radio del hilo y un poco más.
 */
export function reconstruirHilo(sutura: SuturaEnEscena, superficies: THREE.Object3D[], unidadesPorMm: number) {
  for (const objeto of sutura.hechos) {
    sutura.grupo.remove(objeto)
    const malla = objeto as THREE.Mesh
    // Los nudos comparten geometría y material entre sí: se sueltan con `recursos`.
    if (malla.userData.propia) malla.geometry.dispose()
  }
  sutura.hechos = []
  // Lo de la pasada anterior: material y nudo se rehacen cada vez y no se acumulan.
  for (const r of (sutura.grupo.userData.recursos ?? []) as { dispose: () => void }[]) r.dispose()

  const radio = Math.max(0.2, sutura.hilo.grosorMm / 2) * unidadesPorMm
  const levantar = radio * 1.4
  const material = new THREE.MeshStandardMaterial({ color: sutura.hilo.color, roughness: 0.55, metalness: 0.05 })
  const nudo = new THREE.SphereGeometry(radio * 2, 10, 8)
  const materialDelNudo = new THREE.MeshStandardMaterial({
    color: new THREE.Color(sutura.hilo.color).multiplyScalar(0.7),
    roughness: 0.6,
  })
  const poner = (m: THREE.Mesh, propia: boolean) => {
    m.userData.propia = propia
    m.raycast = () => {}
    sutura.grupo.add(m)
    sutura.hechos.push(m)
  }

  // Una línea es una racha de puntos sin `nuevaLinea` entre ellos.
  let linea: PuntoDeSutura[] = []
  const cerrarLinea = () => {
    if (linea.length >= 2) {
      const curva: THREE.Vector3[] = []
      linea.forEach((p, i) => {
        const inicio = new THREE.Vector3(...p.punto).addScaledVector(new THREE.Vector3(...p.normal), levantar)
        curva.push(inicio)
        if (i + 1 < linea.length) curva.push(...tramoApoyado(p, linea[i + 1], superficies, unidadesPorMm, levantar))
      })
      const geometria = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(curva, false, 'centripetal'),
        Math.max(8, curva.length * 2),
        radio,
        6,
        false,
      )
      poner(new THREE.Mesh(geometria, material), true)
    }
    linea = []
  }
  for (const p of sutura.puntos) {
    if (p.nuevaLinea) cerrarLinea()
    linea.push(p)
    const bola = new THREE.Mesh(nudo, materialDelNudo)
    bola.position.set(...p.punto).addScaledVector(new THREE.Vector3(...p.normal), levantar)
    poner(bola, false)
  }
  cerrarLinea()
  // Los materiales y la geometría del nudo se sueltan con el grupo al quitar la sutura.
  sutura.grupo.userData.recursos = [material, materialDelNudo, nudo]
}

/** Suelta todo lo que la sutura tiene en la tarjeta gráfica y la quita de la escena. */
export function soltarSutura(sutura: SuturaEnEscena) {
  for (const objeto of sutura.hechos) {
    const malla = objeto as THREE.Mesh
    if (malla.userData.propia) malla.geometry.dispose()
  }
  const recursos = (sutura.grupo.userData.recursos ?? []) as { dispose: () => void }[]
  for (const r of recursos) r.dispose()
  sutura.grupo.removeFromParent()
  sutura.hechos = []
  sutura.puntos = []
}

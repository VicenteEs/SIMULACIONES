import * as THREE from 'three'
import { ABULTAMIENTO_MAXIMO_MM } from '@/lib/abultamientoDeLaPiel'
import type { PlanoBlando } from '@/lib/planosBlandos'
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
  /** Cuánto se ha tirado del hilo, de 0 (flojo) a 1 (apretado del todo). Cose primero y tira después (D-171). */
  tension: number
  /**
   * Con el cierre por planos (P-006, E11), cuánto se ha tirado del hilo **de cada plano**: cada uno se aprieta por su cuenta,
   * y `tension` es la del plano en que se está cosiendo (`planoActivo`). Sin planos, no se usa.
   */
  tensiones: Partial<Record<PlanoBlando, number>>
  /** El plano de la última puntada: el que se aprieta con el deslizador. */
  planoActivo?: PlanoBlando
}

export function crearSutura(escena: THREE.Scene, hilo: HiloDeSutura): SuturaEnEscena {
  const grupo = new THREE.Group()
  grupo.name = 'sutura'
  // El hilo no absorbe rayos X: la radiografía y la fluoroscopia lo esconden (`radiografiaEnLaEscena.ts`).
  grupo.userData.deInterfaz = true
  escena.add(grupo)
  return { grupo, puntos: [], hilo, hechos: [], tension: 0, tensiones: {} }
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
 * Hasta dónde por encima de la puntada se busca la piel cuando está abultada (P-013, pedidos 1 y 8): lo más que sube
 * (`ABULTAMIENTO_MAXIMO_MM`) y los 3 mm de siempre. Cerrada sobre una placa, la piel queda unos milímetros por encima de
 * donde se picó, y el rayo de siempre, que sale a 3 mm, nacía dentro de ella: el hilo quedaba enterrado bajo el bulto.
 */
const ALTO_DE_LA_PIEL_ABULTADA_MM = ABULTAMIENTO_MAXIMO_MM + 3

/**
 * El primer punto de la superficie bajo `desde` siguiendo `haciaAbajo`: primero desde arriba, si la piel está abultada ahí
 * (`abultada`, la caja de lo que subió), y si no hay nada más alto que los 3 mm de siempre, el rayo de siempre.
 */
function superficieDebajo(
  desde: THREE.Vector3,
  n: THREE.Vector3,
  superficies: THREE.Object3D[],
  unidadesPorMm: number,
  abultada: THREE.Box3 | null,
): THREE.Intersection | undefined {
  if (abultada?.containsPoint(desde)) {
    rayoAuxiliar.set(desde.clone().addScaledVector(n, ALTO_DE_LA_PIEL_ABULTADA_MM * unidadesPorMm), n.clone().negate())
    rayoAuxiliar.far = (ALTO_DE_LA_PIEL_ABULTADA_MM - 3) * unidadesPorMm
    const alto = rayoAuxiliar.intersectObjects(superficies, false)[0]
    if (alto) return alto
  }
  rayoAuxiliar.set(desde.clone().addScaledVector(n, 3 * unidadesPorMm), n.clone().negate())
  rayoAuxiliar.far = 6 * unidadesPorMm
  return rayoAuxiliar.intersectObjects(superficies, false)[0]
}

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
  abultada: THREE.Box3 | null = null,
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
    const golpe = superficieDebajo(base, n, superficies, unidadesPorMm, abultada)
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

/** Cómo se ve un hilo: su radio, cuánto se separa de la piel, y sus materiales. */
interface AspectoDelHilo {
  radio: number
  levantar: number
  material: THREE.MeshStandardMaterial
  nudo: THREE.SphereGeometry
  materialDelNudo: THREE.MeshStandardMaterial
  corchete: boolean
}

/** Lo que distingue a un hilo de otro al dibujarlo: dos con la misma clave se ven iguales. */
export function claveDelHilo(hilo: HiloDeSutura): string {
  return `${hilo.nombre}|${hilo.tipo ?? 'hilo'}|${hilo.color}|${hilo.grosorMm}`
}

/** Cuánto se hunden en la piel las patas de un corchete, en mm. */
const PATA_DEL_CORCHETE_MM = 1.6

/**
 * Rehace los tubos y los nudos de la sutura con los puntos que tiene.
 *
 * `levantar` separa el hilo de la piel lo justo para que no se hunda en ella: el
 * radio del hilo y un poco más.
 *
 * Cada línea va con **su** hilo (P-013, pedido 16): el de su primera puntada, o el de la sutura en lo guardado antes. Antes
 * todas iban con el de la sutura, que era el último elegido, y la fascia cosida con Vicryl se volvía negra al cerrar la piel
 * con nailon. Una línea de corchetes no es un hilo tendido: cada par de puntos es una grapa de acero que une los dos labios.
 *
 * `abultada` es la caja de la piel que subió sobre una placa o un trozo (P-013): dentro de ella, las puntadas y el hilo se
 * apoyan en la piel de ahora y no donde se picó, que quedó debajo.
 */
export function reconstruirHilo(sutura: SuturaEnEscena, superficies: THREE.Object3D[], unidadesPorMm: number, abultada: THREE.Box3 | null = null) {
  for (const objeto of sutura.hechos) {
    sutura.grupo.remove(objeto)
    const malla = objeto as THREE.Mesh
    // Los nudos comparten geometría y material entre sí: se sueltan con `recursos`.
    if (malla.userData.propia) malla.geometry.dispose()
  }
  sutura.hechos = []
  // Lo de la pasada anterior: material y nudo se rehacen cada vez y no se acumulan.
  for (const r of (sutura.grupo.userData.recursos ?? []) as { dispose: () => void }[]) r.dispose()

  const recursos: { dispose: () => void }[] = []
  const aspectos = new Map<string, AspectoDelHilo>()
  const aspectoDe = (hilo: HiloDeSutura): AspectoDelHilo => {
    const clave = claveDelHilo(hilo)
    const hecho = aspectos.get(clave)
    if (hecho) return hecho
    const corchete = hilo.tipo === 'corchete'
    const radio = Math.max(0.2, hilo.grosorMm / 2) * unidadesPorMm
    const material = new THREE.MeshStandardMaterial(
      corchete ? { color: hilo.color, roughness: 0.3, metalness: 0.85 } : { color: hilo.color, roughness: 0.55, metalness: 0.05 },
    )
    const nudo = new THREE.SphereGeometry(radio * 2, 10, 8)
    const materialDelNudo = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hilo.color).multiplyScalar(0.7),
      roughness: 0.6,
    })
    recursos.push(material, nudo, materialDelNudo)
    const aspecto = { radio, levantar: radio * 1.4, material, nudo, materialDelNudo, corchete }
    aspectos.set(clave, aspecto)
    return aspecto
  }
  // Dónde va cada puntada: donde se picó o, con la piel abultada encima, sobre ella.
  const sobreLaPiel = (p: PuntoDeSutura, levantar: number): THREE.Vector3 => {
    const punto = new THREE.Vector3(...p.punto)
    const n = new THREE.Vector3(...p.normal)
    if (abultada?.containsPoint(punto) && n.lengthSq() > 0) {
      const golpe = superficieDebajo(punto, n.normalize(), superficies, unidadesPorMm, abultada)
      if (golpe && golpe.point.clone().sub(punto).dot(n) > 0) return golpe.point.clone().addScaledVector(n, levantar)
    }
    return punto.addScaledVector(n, levantar)
  }
  const poner = (m: THREE.Mesh, propia: boolean) => {
    m.userData.propia = propia
    m.raycast = () => {}
    sutura.grupo.add(m)
    sutura.hechos.push(m)
  }

  /** Una grapa entre dos puntos, uno en cada labio: la corona sobre la piel y una pata hundida en cada lado. */
  const ponerCorchete = (a: PuntoDeSutura, b: PuntoDeSutura, aspecto: AspectoDelHilo) => {
    const na = new THREE.Vector3(...a.normal).normalize()
    const nb = new THREE.Vector3(...b.normal).normalize()
    const arribaA = sobreLaPiel(a, aspecto.levantar)
    const arribaB = sobreLaPiel(b, aspecto.levantar)
    const pata = PATA_DEL_CORCHETE_MM * unidadesPorMm
    const camino = new THREE.CurvePath<THREE.Vector3>()
    camino.add(new THREE.LineCurve3(arribaA.clone().addScaledVector(na, -pata), arribaA))
    camino.add(new THREE.LineCurve3(arribaA, arribaB))
    camino.add(new THREE.LineCurve3(arribaB, arribaB.clone().addScaledVector(nb, -pata)))
    poner(new THREE.Mesh(new THREE.TubeGeometry(camino, 24, aspecto.radio, 6, false), aspecto.material), true)
  }

  // Una línea es una racha de puntos sin `nuevaLinea` entre ellos.
  let linea: PuntoDeSutura[] = []
  const cerrarLinea = () => {
    const aspecto = linea.length > 0 ? aspectoDe(linea[0].hilo ?? sutura.hilo) : null
    if (aspecto?.corchete) {
      for (let i = 0; i + 1 < linea.length; i += 2) ponerCorchete(linea[i], linea[i + 1], aspecto)
    } else if (aspecto && linea.length >= 2) {
      const curva: THREE.Vector3[] = []
      linea.forEach((p, i) => {
        curva.push(sobreLaPiel(p, aspecto.levantar))
        if (i + 1 < linea.length) curva.push(...tramoApoyado(p, linea[i + 1], superficies, unidadesPorMm, aspecto.levantar, abultada))
      })
      const geometria = new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(curva, false, 'centripetal'),
        Math.max(8, curva.length * 2),
        aspecto.radio,
        6,
        false,
      )
      poner(new THREE.Mesh(geometria, aspecto.material), true)
    }
    if (aspecto && !aspecto.corchete) {
      for (const p of linea) {
        const bola = new THREE.Mesh(aspecto.nudo, aspecto.materialDelNudo)
        bola.position.copy(sobreLaPiel(p, aspecto.levantar))
        poner(bola, false)
      }
    }
    linea = []
  }
  for (const p of sutura.puntos) {
    // Un hilo distinto del de la línea en curso abre otra: una sutura continua no cambia de hilo a mitad. Se comparan por
    // lo que son y no por identidad: lo que vuelve de la sesión guardada trae un objeto por puntada.
    const deLaLinea = claveDelHilo(linea[0]?.hilo ?? sutura.hilo)
    if (p.nuevaLinea || (linea.length > 0 && claveDelHilo(p.hilo ?? sutura.hilo) !== deLaLinea)) cerrarLinea()
    linea.push(p)
  }
  cerrarLinea()
  // Los materiales y la geometría del nudo se sueltan con el grupo al quitar la sutura.
  sutura.grupo.userData.recursos = recursos
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

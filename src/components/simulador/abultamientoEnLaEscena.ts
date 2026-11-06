import * as THREE from 'three'
import { flotantesDe } from '@/atlas/canalDeLaGeometria'
import { triangulosHaciaDentro } from '@/lib/aspectoAnatomico'
import {
  ABULTAMIENTO_MAXIMO_MM,
  ALCANCE_MM,
  HOLGURA_DE_LA_CARA_DE_DENTRO_MM,
  HOLGURA_DE_LA_CARA_DE_FUERA_MM,
  PASO_DE_LAS_MUESTRAS_MM,
  RADIO_DEL_ABULTAMIENTO_MM,
  abultamientoMm,
  muestrasDeLaSuperficie,
  tenderLaPiel,
  verticesDeLaCaraDeDentro,
} from '@/lib/abultamientoDeLaPiel'
import { ATRIBUTO_DE_LA_PARED, cadenaDeLaMalla } from './heridas'

/**
 * La piel que se hincha sobre lo que tiene debajo, dentro de la escena (P-013, pedidos 1 y 8): la cuenta está en
 * `abultamientoDeLaPiel.ts`; esto la aplica a las mallas.
 *
 * **Es la última capa de lo que mueve la piel.** La herida que se abre y se cierra (`heridas.ts`) reescribe las posiciones
 * de la piel desde las de su corte, y no sabe nada de esto: el abultamiento se suma encima, antes de cada dibujo, y se
 * guarda la piel sin él para poder devolverla. Si alguien reescribió las posiciones —un separador que abre, una puntada que
 * cierra—, se nota en la versión del atributo y la piel de ahora pasa a ser la base. Así ninguno de los que mueven la piel
 * tuvo que cambiar, y el abultamiento no se queda pegado a una geometría que ya no está.
 *
 * Lo único que no puede ver una piel abultada es el corte: `cortarCapa` lee la piel de ahora como la base de la herida, y
 * con el bulto dentro la herida se cerraría abultada para siempre. Por eso `cortarCapa` llama antes a `quitarElAbultamiento`.
 *
 * Empujan la piel la placa y los tornillos puestos, y los trozos de hueso que se mueven: el fragmento, los que el caso
 * trae con posición reducida y cualquiera que se haya movido de donde estaba. El hueso quieto no: el modelo ya lo trae
 * cubierto, y mirarlo en cada cuadro costaría lo que cuesta la tibia entera. Las agujas de Kirschner y el clavo tampoco:
 * las agujas salen de la piel a propósito, y el clavo entra por su incisión con el arco montado.
 *
 * Se abulta solo la piel vestida como piel. El caso pone la fascia superficial con el papel de «piel», porque se corta con
 * ella (`aspectoDe`), pero está debajo: con la holgura de la piel saldría por encima de ella justo sobre la placa.
 */

/** Qué vértices son de la cara de dentro de la piel: 1 si lo son. Lo copian los cortes, como el resto de los atributos. */
export const ATRIBUTO_DE_LA_CARA_DE_DENTRO = 'aCaraDeDentro'

/** Lo que se le hizo a una piel: con qué posiciones estaba antes y qué se le sumó. */
interface PielAbultada {
  atributo: THREE.BufferAttribute
  /** La versión del atributo justo después de abultarlo: si cambia, alguien lo reescribió. */
  version: number
  /** La versión que tenía la base: lo que cuenta para saber si hay algo nuevo que mirar. */
  versionDeLaBase: number
  base: Float32Array
  normales: Float32Array
  /** Los vértices que se subieron y cuánto, en coordenadas de la malla. */
  vertices: Uint32Array
  desplazamientos: Float32Array
  /** Dónde subió, en el mundo: el hilo de la sutura se apoya de nuevo en la piel dentro de esta caja. */
  caja: THREE.Box3
  /**
   * La caja y la esfera de la piel sin abultar, en sus coordenadas. Con el bulto se agrandan con los vértices que subieron:
   * recalcularlas recorría la piel entera, que es el cuerpo entero, en cada cuadro de un arrastre.
   */
  cajaDeLaBase: THREE.Box3
  esferaDeLaBase: THREE.Sphere
}

const ABULTADAS = new WeakMap<THREE.Mesh, PielAbultada>()

/**
 * Marca la cara de dentro de una piel todavía sin cortar: se llama al vestirla (`vestirElModelo`), antes de que la sesión
 * devuelva sus heridas. Se separan las caras por conectividad (`triangulosHaciaDentro`), y eso ya no se puede después del
 * primer corte: la pared de la herida une las dos caras y quedarían en una sola pieza.
 */
export function marcarLaCaraDeDentro(malla: THREE.Mesh) {
  const g = malla.geometry
  const posicion = g.getAttribute('position')
  if (!posicion || g.getAttribute(ATRIBUTO_DE_LA_CARA_DE_DENTRO) || cadenaDeLaMalla(malla).length > 0) return
  const indices = g.getIndex()?.array ?? null
  const marca = verticesDeLaCaraDeDentro(triangulosHaciaDentro(flotantesDe(posicion), indices), indices, posicion.count)
  g.setAttribute(ATRIBUTO_DE_LA_CARA_DE_DENTRO, new THREE.BufferAttribute(Float32Array.from(marca), 1))
}

/** Devuelve la piel a como estaba sin abultar, si estaba abultada y nadie la tocó después. */
export function quitarElAbultamiento(malla: THREE.Mesh) {
  const previa = ABULTADAS.get(malla)
  ABULTADAS.delete(malla)
  if (!previa) return
  const atributo = malla.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (atributo !== previa.atributo || atributo.version !== previa.version) return
  ;(atributo.array as Float32Array).set(previa.base)
  atributo.needsUpdate = true
  const normal = malla.geometry.getAttribute('normal') as THREE.BufferAttribute | undefined
  if (normal && normal.count * 3 === previa.normales.length) {
    devolverNormales(normal, previa.normales, conSuAnillo(previa.vertices, vecindadDe(malla.geometry, atributo.count)))
  }
  malla.geometry.boundingBox = previa.cajaDeLaBase.clone()
  malla.geometry.boundingSphere = previa.esferaDeLaBase.clone()
}

/**
 * Las normales de esos vértices, de vuelta a las guardadas. Se escriben con `setXYZ` y no en el arreglo: las del atlas son
 * enteros de 16 bits normalizados (`glb.ts`), y un decimal puesto a mano en ellos se queda en cero. Leídas del arreglo,
 * además, valen hasta 32 767: la primera versión empujó así la piel casi un kilómetro.
 */
function devolverNormales(normal: THREE.BufferAttribute, guardadas: Float32Array, cuales: Iterable<number>) {
  for (const i of cuales) normal.setXYZ(i, guardadas[i * 3], guardadas[i * 3 + 1], guardadas[i * 3 + 2])
  normal.needsUpdate = true
}

/** Para cada vértice, los triángulos que lo tocan: para rehacer las normales solo donde la piel subió. */
interface Vecindad {
  inicio: Uint32Array
  triangulos: Uint32Array
  indices: ArrayLike<number> | null
}
const VECINDADES = new WeakMap<THREE.BufferGeometry, Vecindad>()

function vecindadDe(g: THREE.BufferGeometry, vertices: number): Vecindad {
  const guardada = VECINDADES.get(g)
  const indices = g.getIndex()?.array ?? null
  if (guardada && guardada.indices === indices && guardada.inicio.length === vertices + 1) return guardada
  const nt = indices ? Math.floor(indices.length / 3) : Math.floor(vertices / 3)
  const vertice = (t: number, k: number) => (indices ? indices[t * 3 + k] : t * 3 + k)
  const cuenta = new Uint32Array(vertices + 1)
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) cuenta[vertice(t, k) + 1]++
  for (let i = 0; i < vertices; i++) cuenta[i + 1] += cuenta[i]
  const triangulos = new Uint32Array(cuenta[vertices])
  const lleno = cuenta.slice(0, vertices)
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) triangulos[lleno[vertice(t, k)]++] = t
  const nueva = { inicio: cuenta, triangulos, indices }
  VECINDADES.set(g, nueva)
  return nueva
}

/**
 * Las normales de esos vértices, como las calcula `computeVertexNormals`: la suma de las caras que tocan, pesadas por su
 * área. Se escriben por `setXYZ`, por lo mismo que en `devolverNormales`.
 */
function rehacerNormales(posiciones: Float32Array, normal: THREE.BufferAttribute, v: Vecindad, cuales: Iterable<number>) {
  const vertice = (t: number, k: number) => (v.indices ? v.indices[t * 3 + k] : t * 3 + k)
  for (const i of cuales) {
    let nx = 0, ny = 0, nz = 0
    for (let j = v.inicio[i]; j < v.inicio[i + 1]; j++) {
      const t = v.triangulos[j]
      const a = vertice(t, 0) * 3, b = vertice(t, 1) * 3, c = vertice(t, 2) * 3
      const ux = posiciones[b] - posiciones[a], uy = posiciones[b + 1] - posiciones[a + 1], uz = posiciones[b + 2] - posiciones[a + 2]
      const wx = posiciones[c] - posiciones[a], wy = posiciones[c + 1] - posiciones[a + 1], wz = posiciones[c + 2] - posiciones[a + 2]
      nx += uy * wz - uz * wy
      ny += uz * wx - ux * wz
      nz += ux * wy - uy * wx
    }
    const largo = Math.hypot(nx, ny, nz) || 1
    normal.setXYZ(i, nx / largo, ny / largo, nz / largo)
  }
  normal.needsUpdate = true
}

/** Los vértices y los de su primer anillo: los que cambian de normal cuando ellos se mueven. */
function conSuAnillo(vertices: Iterable<number>, v: Vecindad): Set<number> {
  const vertice = (t: number, k: number) => (v.indices ? v.indices[t * 3 + k] : t * 3 + k)
  const salida = new Set<number>()
  for (const i of vertices) {
    for (let j = v.inicio[i]; j < v.inicio[i + 1]; j++) {
      const t = v.triangulos[j]
      salida.add(vertice(t, 0))
      salida.add(vertice(t, 1))
      salida.add(vertice(t, 2))
    }
  }
  return salida
}

/**
 * Para cada vértice de la piel, su lugar entre los que se miran, o -1: se guarda por geometría para no pedir en cada cuadro
 * un arreglo del tamaño del cuerpo entero, y se deja otra vez en -1 al terminar.
 */
const CANDIDATOS = new WeakMap<THREE.BufferGeometry, Int32Array>()
function candidatoDeCadaVertice(g: THREE.BufferGeometry, vertices: number): Int32Array {
  const guardado = CANDIDATOS.get(g)
  if (guardado && guardado.length === vertices) return guardado
  const nuevo = new Int32Array(vertices).fill(-1)
  CANDIDATOS.set(g, nuevo)
  return nuevo
}

/** Las muestras de la superficie de una malla, en sus coordenadas: se guardan por geometría mientras no cambie. */
const MUESTRAS = new WeakMap<THREE.BufferGeometry, { version: number; paso: number; puntos: Float32Array }>()

function muestrasDe(malla: THREE.Mesh, paso: number): Float32Array {
  const g = malla.geometry
  const posicion = g.getAttribute('position') as THREE.BufferAttribute | undefined
  if (!posicion) return new Float32Array(0)
  const guardadas = MUESTRAS.get(g)
  if (guardadas && guardadas.version === posicion.version && Math.abs(guardadas.paso - paso) < paso * 0.01) return guardadas.puntos
  const puntos = muestrasDeLaSuperficie(flotantesDe(posicion), g.getIndex()?.array ?? null, paso)
  MUESTRAS.set(g, { version: posicion.version, paso, puntos })
  return puntos
}

export interface AbultamientoDeLaPiel {
  /**
   * Pone la piel al día con lo que la empuja. Devuelve si cambió algo, para rehacer lo que se apoya en ella (el hilo).
   * Si nada se movió desde la última vez no hace nada: se llama antes de cada dibujo, también al girar la cámara.
   */
  alDia: (pieles: readonly THREE.Mesh[], empujan: readonly THREE.Mesh[], mmPorUnidad: number) => boolean
  /** Dónde está abultada la piel ahora, en el mundo, o `null` si en ninguna parte. */
  caja: THREE.Box3 | null
  /**
   * Lo que costó la última cuenta: se hace en cada cuadro mientras se arrastra un trozo, y la sonda lo enseña para ver
   * que cabe en un cuadro con la pierna de verdad.
   */
  ultimaCuenta: CuentaDeLaPiel | null
}

export interface CuentaDeLaPiel {
  ms: number
  /** Lo que de eso fue la cuenta misma (`abultamientoMm`); el resto es mirar la piel y escribirla. */
  msDeLaCuenta: number
  /** Puntos de lo que empuja, vértices que se miraron y vértices que subieron. */
  puntos: number
  candidatos: number
  subidos: number
}

/**
 * Apagado desde la sonda, en desarrollo: la misma escena con y sin abultamiento, para ver qué hace. En producción nadie lo
 * enciende, y `alDia` sigue igual.
 */
let apagado = false
export function apagarElAbultamiento(si: boolean) {
  apagado = si
}

/** La última cuenta de cualquier lienzo: hay uno solo a la vez, y así la sonda la lee sin que el lienzo se la pase. */
let ultimaDeTodas: CuentaDeLaPiel | null = null
export const ultimaCuentaDeLaPiel = (): CuentaDeLaPiel | null => (ultimaDeTodas ? { ...ultimaDeTodas } : null)

export function crearAbultamientoDeLaPiel(): AbultamientoDeLaPiel {
  let firmaAnterior = ''
  return {
    caja: null,
    ultimaCuenta: null,
    alDia(pieles, empujan, mmPorUnidad) {
      if (apagado) {
        let quitado = false
        for (const piel of pieles) {
          if (!ABULTADAS.has(piel)) continue
          quitarElAbultamiento(piel)
          quitado = true
        }
        this.caja = null
        firmaAnterior = ''
        return quitado
      }
      const firma = firmaDe(pieles, empujan, mmPorUnidad)
      if (firma === firmaAnterior) return false
      firmaAnterior = firma
      const inicio = performance.now()
      let cambio = false
      const puntos = puntosQueEmpujan(empujan, mmPorUnidad)
      const cuenta: CuentaDeLaPiel = { ms: 0, msDeLaCuenta: 0, puntos: puntos.length / 3, candidatos: 0, subidos: 0 }
      for (const piel of pieles) if (abultarUnaPiel(piel, puntos, mmPorUnidad, cuenta)) cambio = true
      let caja: THREE.Box3 | null = null
      for (const piel of pieles) {
        const a = ABULTADAS.get(piel)
        if (a) caja = caja ? caja.union(a.caja) : a.caja.clone()
      }
      this.caja = caja
      cuenta.ms = performance.now() - inicio
      this.ultimaCuenta = cuenta
      ultimaDeTodas = cuenta
      // Lo que se abultó y la firma de después: escribir la piel cambió la versión del atributo, y esa versión es la nuestra.
      firmaAnterior = firmaDe(pieles, empujan, mmPorUnidad)
      return cambio
    },
  }
}

/** Lo que hace falta mirar para saber si hay que volver a abultar: dónde está cada cosa que empuja y quién tocó la piel. */
function firmaDe(pieles: readonly THREE.Mesh[], empujan: readonly THREE.Mesh[], mmPorUnidad: number): string {
  const partes: string[] = [String(mmPorUnidad)]
  for (const m of empujan) {
    const posicion = m.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    m.updateWorldMatrix(true, false)
    partes.push(`${m.id}:${posicion?.version ?? -1}:${m.matrixWorld.elements.map((e) => e.toFixed(5)).join(',')}`)
  }
  for (const p of pieles) {
    const atributo = p.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
    const previa = ABULTADAS.get(p)
    const nuestra = previa && previa.atributo === atributo && previa.version === atributo?.version
    partes.push(`piel ${p.id}:${p.visible}:${p.geometry.uuid}:${nuestra ? previa.versionDeLaBase : (atributo?.version ?? -1)}`)
  }
  return partes.join('|')
}

/** Los puntos de lo que empuja, en el mundo y en milímetros. */
function puntosQueEmpujan(empujan: readonly THREE.Mesh[], mmPorUnidad: number): Float32Array {
  const lista: number[] = []
  const p = new THREE.Vector3()
  for (const m of empujan) {
    const escala = (m.matrixWorld.getMaxScaleOnAxis() || 1) * mmPorUnidad
    const muestras = muestrasDe(m, PASO_DE_LAS_MUESTRAS_MM / escala)
    for (let i = 0; i < muestras.length; i += 3) {
      p.set(muestras[i], muestras[i + 1], muestras[i + 2]).applyMatrix4(m.matrixWorld).multiplyScalar(mmPorUnidad)
      lista.push(p.x, p.y, p.z)
    }
  }
  return Float32Array.from(lista)
}

/** Abulta una piel con esos puntos, o la devuelve a su base si ya no hace falta. Devuelve si cambió. */
function abultarUnaPiel(malla: THREE.Mesh, puntos: Float32Array, mmPorUnidad: number, cuenta?: CuentaDeLaPiel): boolean {
  const g = malla.geometry
  const atributo = g.getAttribute('position') as THREE.BufferAttribute | undefined
  const normal = g.getAttribute('normal') as THREE.BufferAttribute | undefined
  const dentro = g.getAttribute(ATRIBUTO_DE_LA_CARA_DE_DENTRO) as THREE.BufferAttribute | undefined
  // Solo la piel vestida como piel, la que marcó `marcarLaCaraDeDentro`. La fascia superficial va con la piel en el caso
  // (se corta con ella) pero está debajo: subirla con la holgura de la piel la sacaría por encima de ella. Y las
  // posiciones tienen que ser decimales, como las escriben las heridas.
  if (!atributo || !normal || !dentro || atributo.itemSize !== 3 || !(atributo.array instanceof Float32Array)) return false
  const previa = ABULTADAS.get(malla)
  const sigue = previa && previa.atributo === atributo && previa.version === atributo.version ? previa : null
  if (previa && !sigue) ABULTADAS.delete(malla)
  if (!malla.visible || puntos.length === 0) {
    if (!sigue) return false
    quitarElAbultamiento(malla)
    return true
  }
  const base = sigue ? sigue.base : (atributo.array as Float32Array)
  const normalesBase = sigue ? sigue.normales : flotantesDe(normal)

  // La caja de lo que empuja, en coordenadas de la malla: solo los vértices de dentro pueden subir. Se agranda lo que puede
  // estar un vértice de un punto que todavía lo empuja: el alcance hacia fuera y el radio de lado.
  malla.updateWorldMatrix(true, false)
  const aLocal = malla.matrixWorld.clone().invert()
  const escala = (malla.matrixWorld.getMaxScaleOnAxis() || 1) * mmPorUnidad
  const caja = new THREE.Box3()
  const q = new THREE.Vector3()
  for (let i = 0; i < puntos.length; i += 3) caja.expandByPoint(q.set(puntos[i], puntos[i + 1], puntos[i + 2]))
  caja.expandByScalar(Math.hypot(ALCANCE_MM, RADIO_DEL_ABULTAMIENTO_MM))
  caja.min.divideScalar(mmPorUnidad)
  caja.max.divideScalar(mmPorUnidad)
  caja.applyMatrix4(aLocal)

  const pared = g.getAttribute(ATRIBUTO_DE_LA_PARED) as THREE.BufferAttribute | undefined
  const candidatos: number[] = []
  for (let i = 0; i < atributo.count; i++) {
    const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2]
    if (x < caja.min.x || x > caja.max.x || y < caja.min.y || y > caja.max.y || z < caja.min.z || z > caja.max.z) continue
    // La pared de una herida abierta mira de lado, a la herida: subirla la metería en el hueco.
    if (pared && pared.getX(i) > 0) continue
    candidatos.push(i)
  }

  let desplazamientos = new Float32Array(0)
  const vertices: number[] = []
  if (candidatos.length > 0) {
    const n = candidatos.length
    const posiciones = new Float32Array(n * 3)
    const haciaFuera = new Float32Array(n * 3)
    const holguras = new Float32Array(n)
    const v = new THREE.Vector3()
    const d = new THREE.Vector3()
    candidatos.forEach((i, k) => {
      v.set(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]).applyMatrix4(malla.matrixWorld).multiplyScalar(mmPorUnidad)
      posiciones[k * 3] = v.x
      posiciones[k * 3 + 1] = v.y
      posiciones[k * 3 + 2] = v.z
      const deDentro = dentro.getX(i) > 0.5
      d.set(normalesBase[i * 3], normalesBase[i * 3 + 1], normalesBase[i * 3 + 2]).transformDirection(malla.matrixWorld)
      if (deDentro) d.negate()
      haciaFuera[k * 3] = d.x
      haciaFuera[k * 3 + 1] = d.y
      haciaFuera[k * 3 + 2] = d.z
      holguras[k] = deDentro ? HOLGURA_DE_LA_CARA_DE_DENTRO_MM : HOLGURA_DE_LA_CARA_DE_FUERA_MM
    })
    const antes = performance.now()
    const sube = abultamientoMm({ posiciones, haciaFuera, holguras }, puntos, { maximoMm: ABULTAMIENTO_MAXIMO_MM })
    // Y se tiende alrededor, por las aristas de la piel: de un vértice a sus vecinos que también se miraron.
    const vecindad = vecindadDe(g, atributo.count)
    const candidatoDe = candidatoDeCadaVertice(g, atributo.count)
    candidatos.forEach((i, k) => (candidatoDe[i] = k))
    const verticeDe = (t: number, e: number) => (vecindad.indices ? vecindad.indices[t * 3 + e] : t * 3 + e)
    tenderLaPiel(sube, posiciones, (k, visitar) => {
      const i = candidatos[k]
      for (let j = vecindad.inicio[i]; j < vecindad.inicio[i + 1]; j++) {
        const t = vecindad.triangulos[j]
        for (let e = 0; e < 3; e++) {
          const otro = candidatoDe[verticeDe(t, e)]
          if (otro >= 0 && otro !== k) visitar(otro)
        }
      }
    })
    for (const i of candidatos) candidatoDe[i] = -1
    if (cuenta) {
      cuenta.candidatos += n
      cuenta.msDeLaCuenta += performance.now() - antes
    }
    const lista: number[] = []
    candidatos.forEach((i, k) => {
      // Menos de una décima de milímetro no se ve, y cada vértice de más es una normal que rehacer.
      if (sube[k] < 0.1) return
      const signo = dentro.getX(i) > 0.5 ? -1 : 1
      const largo = (sube[k] / escala) * signo
      vertices.push(i)
      lista.push(normalesBase[i * 3] * largo, normalesBase[i * 3 + 1] * largo, normalesBase[i * 3 + 2] * largo)
    })
    desplazamientos = Float32Array.from(lista)
  }

  if (cuenta) cuenta.subidos += vertices.length
  if (vertices.length === 0) {
    if (!sigue) return false
    quitarElAbultamiento(malla)
    return true
  }
  // La primera vez se guarda la piel tal como está: es la base, sin nada nuestro encima, con su caja y su esfera.
  if (!sigue) {
    g.computeBoundingBox()
    g.computeBoundingSphere()
  }
  const guardada = sigue ?? {
    atributo,
    version: atributo.version,
    versionDeLaBase: atributo.version,
    base: Float32Array.from(atributo.array as Float32Array),
    normales: normalesBase,
    vertices: new Uint32Array(0),
    desplazamientos: new Float32Array(0),
    caja: new THREE.Box3(),
    cajaDeLaBase: g.boundingBox?.clone() ?? new THREE.Box3(),
    esferaDeLaBase: g.boundingSphere?.clone() ?? new THREE.Sphere(),
  }
  const arreglo = atributo.array as Float32Array
  const vecindad = vecindadDe(g, atributo.count)
  // Lo de antes vuelve a la base, posiciones y normales; después se sube lo de ahora y se rehacen sus normales.
  for (const i of guardada.vertices) arreglo.set(guardada.base.subarray(i * 3, i * 3 + 3), i * 3)
  devolverNormales(normal, guardada.normales, conSuAnillo(guardada.vertices, vecindad))
  vertices.forEach((i, k) => {
    arreglo[i * 3] = guardada.base[i * 3] + desplazamientos[k * 3]
    arreglo[i * 3 + 1] = guardada.base[i * 3 + 1] + desplazamientos[k * 3 + 1]
    arreglo[i * 3 + 2] = guardada.base[i * 3 + 2] + desplazamientos[k * 3 + 2]
  })
  rehacerNormales(arreglo, normal, vecindad, conSuAnillo(vertices, vecindad))
  atributo.needsUpdate = true
  const cajaLocal = guardada.cajaDeLaBase.clone()
  const esferaLocal = guardada.esferaDeLaBase.clone()
  const local = new THREE.Vector3()
  for (const i of vertices) {
    local.set(arreglo[i * 3], arreglo[i * 3 + 1], arreglo[i * 3 + 2])
    cajaLocal.expandByPoint(local)
    esferaLocal.expandByPoint(local)
  }
  g.boundingBox = cajaLocal
  g.boundingSphere = esferaLocal
  // La caja de lo que subió, con lo que sube y un poco más: el hilo que cruza el borde del bulto también se apoya en él.
  const dondeSubio = new THREE.Box3()
  const w = new THREE.Vector3()
  for (const i of vertices) dondeSubio.expandByPoint(w.set(arreglo[i * 3], arreglo[i * 3 + 1], arreglo[i * 3 + 2]).applyMatrix4(malla.matrixWorld))
  dondeSubio.expandByScalar(RADIO_DEL_ABULTAMIENTO_MM / 2 / mmPorUnidad)
  ABULTADAS.set(malla, {
    ...guardada,
    version: atributo.version,
    vertices: Uint32Array.from(vertices),
    desplazamientos,
    caja: dondeSubio,
  })
  return true
}

/** Cuánto se abultó la piel, en mm, como mucho: para la sonda del lienzo y para las pruebas en el navegador. */
export function abultamientoMaximoMm(malla: THREE.Mesh, mmPorUnidad: number): number {
  const a = ABULTADAS.get(malla)
  if (!a) return 0
  const escala = (malla.matrixWorld.getMaxScaleOnAxis() || 1) * mmPorUnidad
  let mayor = 0
  for (let k = 0; k < a.desplazamientos.length; k += 3) {
    mayor = Math.max(mayor, Math.hypot(a.desplazamientos[k], a.desplazamientos[k + 1], a.desplazamientos[k + 2]) * escala)
  }
  return mayor
}

/**
 * Dónde subió más la piel, en el mundo: el punto ya subido y hacia dónde subió. Para la sonda, que encuadra ahí la cámara
 * y compara la piel con y sin el abultamiento.
 */
export function dondeSubioMas(malla: THREE.Mesh): { punto: THREE.Vector3; haciaFuera: THREE.Vector3 } | null {
  const a = ABULTADAS.get(malla)
  if (!a || a.vertices.length === 0) return null
  let mayor = -1
  let k = -1
  for (let j = 0; j < a.vertices.length; j++) {
    const largo = Math.hypot(a.desplazamientos[j * 3], a.desplazamientos[j * 3 + 1], a.desplazamientos[j * 3 + 2])
    if (largo > mayor) {
      mayor = largo
      k = j
    }
  }
  const i = a.vertices[k]
  const arreglo = a.atributo.array as Float32Array
  const punto = new THREE.Vector3(arreglo[i * 3], arreglo[i * 3 + 1], arreglo[i * 3 + 2]).applyMatrix4(malla.matrixWorld)
  const haciaFuera = new THREE.Vector3(a.desplazamientos[k * 3], a.desplazamientos[k * 3 + 1], a.desplazamientos[k * 3 + 2])
    .transformDirection(malla.matrixWorld)
  return { punto, haciaFuera }
}

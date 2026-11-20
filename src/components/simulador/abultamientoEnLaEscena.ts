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
  alisarLaTienda,
  tenderLaPiel,
  verticesDeLaCaraDeDentro,
} from '@/lib/abultamientoDeLaPiel'
import { enderezarPosiciones } from '@/lib/corteDeMalla'
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
 * La piel sin el bulto, si ahora lo lleva: lo que `quitarElAbultamiento` le devolvería, sin devolvérselo. `null` si no está
 * abultada o si alguien reescribió sus posiciones después (entonces lo de ahora ya no tiene bulto que quitar).
 *
 * La pide el trazo antes de cortar (D-421): se pincha en la piel que se ve, abultada sobre el trozo desplazado, y se corta
 * la de debajo. Sobre la tibia del caso 3 el bulto sube hasta 30 mm, más que la hondura del corte de la piel: el trazo
 * quedaba en el aire, la incisión salía corta o no salía («El trazo no atraviesa ninguna malla»), y lo que cortaba era el
 * tejido de al lado, plegado nada más abrirse.
 */
export function pielSinAbultar(malla: THREE.Mesh): Float32Array | null {
  const previa = ABULTADAS.get(malla)
  if (!previa) return null
  const atributo = malla.geometry.getAttribute('position') as THREE.BufferAttribute | undefined
  if (atributo !== previa.atributo || atributo.version !== previa.version) return null
  return previa.base
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
  /** Los vértices de la pared de una herida que se miraron, y los que subieron con la piel de al lado (D-421). */
  pared: number
  deLaPared: number
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
      const cuenta: CuentaDeLaPiel = { ms: 0, msDeLaCuenta: 0, puntos: puntos.length / 3, candidatos: 0, subidos: 0, pared: 0, deLaPared: 0 }
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

/**
 * La piel en reposo, cerrada y sin bulto (D-421): la de una piel cortada es la base de su último corte, con todas sus
 * heridas cerradas; la de una sin cortar, ella misma sin el bulto.
 */
function reposoDeLaPiel(malla: THREE.Mesh, base: Float32Array, vertices: number): Float32Array {
  const delCorte = cadenaDeLaMalla(malla).at(-1)?.corte.posiciones
  return delCorte && delCorte.length === vertices * 3 ? delCorte : base
}

/**
 * Cuántas veces se promedia la dirección en que sube cada vértice con la de sus vecinos. Cada pasada la reparte una
 * arista más allá: con aristas de 2 a 4 mm, cuatro pasadas son un centímetro, del orden del radio del bulto.
 */
const PASADAS_DE_LA_SABANA = 4
/** Lo que mide de lado cada celda con que se busca, en reposo, el vértice de la otra cara que queda más cerca. */
const CELDA_DE_LA_SABANA_MM = 3
/**
 * Hasta dónde, de lado, reparte la cara de fuera lo que sube entre los vértices de la de dentro que tiene debajo: la mitad
 * de una arista. Con el más cercano a secas, en la falda del bulto, donde la piel sube un milímetro por cada uno que se
 * aparta, tomar el vecino de al lado era subir 3 mm de más o de menos: lo bastante para asomar por la de fuera.
 */
const SIGMA_DE_LA_CARA_DE_DENTRO_MM = 1.5
/** A menos de esto, en reposo, dos vértices de la misma cara son el mismo punto partido por una herida. */
const GEMELOS_A_MENOS_DE_MM = 0.01
/**
 * Lo que la cara de dentro queda, como poco, por debajo de la de fuera cuando el bulto la aprieta: la dermis, que no se
 * aplasta. Es la diferencia de las dos holguras, la misma que deja el bulto sobre el hueso.
 */
const DERMIS_DE_LA_SABANA_MM = HOLGURA_DE_LA_CARA_DE_FUERA_MM - HOLGURA_DE_LA_CARA_DE_DENTRO_MM
/**
 * Lo que tiene que haberse apartado un vértice de su reposo para que lo que sube se lea en la sábana del sitio al que se
 * fue y no se tome lo suyo. Por debajo, la diferencia no se ve, y leer la sábana cuesta: solo se hace en la franja que
 * mueve una herida.
 */
const MOVIDO_PARA_LEER_LA_SABANA_MM = 0.05
/**
 * Hasta cuánto de lo que se apartó un vértice de su reposo se lee la sábana donde está; de ahí en adelante el bulto va
 * pegado a él. Lo que un labio se retrae solo al cortar es de 3 a 4 mm, y ahí leer donde está arregló la esquina de la L
 * (de 58 triángulos vueltos a 3). Un Farabeuf lo aparta 17 mm, y leída tan lejos, en la falda del bulto, la piel
 * retraída se arrugaba: 1019 aristas quebradas contra 485 llevándolo pegado.
 */
const LO_QUE_SE_LEE_DONDE_ESTA_MM = 5

/**
 * Cómo se abulta una piel como una sábana (D-421), una vez por geometría y reposo: hacia dónde sube cada vértice y cuál
 * de la cara de fuera tiene encima cada uno de la cara de dentro o de la pared.
 *
 * Antes cada vértice subía por su propia normal, tal como estaba la piel en ese momento. Sobre el trozo desplazado del
 * caso 3 la piel sube hasta 30 mm, y a esa distancia lo que se tuerce una normal se ve:
 * - Con la herida abierta, junto a los labios la piel está rizada por la retracción y sus normales miran de lado: el
 *   labio subía 23 mm de media hacia la herida o hacia fuera, y los triángulos de alrededor se daban la vuelta. Eran el
 *   «vidrio» del tobillo: 250 triángulos vueltos y 711 aristas quebradas en una incisión vertical recién hecha, y ninguno
 *   con el bulto apagado.
 * - Las dos caras de la piel subían cada una por su normal, que en una piel curva no son paralelas: la de dentro asomaba
 *   por la de fuera, en manchas grises, antes de cortar nada.
 * - La pared de la herida no subía: va de lado, y por su normal se metía en el hueco.
 *
 * Ahora la dirección sale de la cara de fuera **en reposo**, sin la pared, y promediada con la de sus vecinos
 * (`PASADAS_DE_LA_SABANA`) y con la de su gemelo del otro labio (`gemelos`). La cara de dentro cuelga de la de fuera
 * (`colgado`), con la dermis entre las dos como poco; la pared va con la piel que tiene al lado, y lo que sube cada
 * vértice se lee en el sitio al que lo llevó la herida (`encimaDe`). Abrir la herida, o apartarla con un Farabeuf, ya no
 * cambia hacia dónde se hincha la piel.
 */
interface SabanaDeLaPiel {
  reposo: Float32Array
  /** Hacia fuera en la cara de fuera (hacia dentro en la de dentro), unitaria y en coordenadas de la malla. */
  direccion: Float32Array
  /** El vértice de la cara de fuera más cercano en reposo, sin contar la pared; −1 si no hay. */
  cercano: (i: number) => number
  /**
   * De qué vértices de la cara de fuera cuelga uno de la de dentro, y con qué peso: los que tiene encima, por la recta de
   * la sábana, y el grosor de la piel entre las dos caras ahí, en mm. `null` si no hay ninguno de fuera a su alcance.
   */
  colgado: (i: number) => { de: Int32Array; pesos: Float32Array; grosor: number } | null
  /**
   * Los vértices de la misma cara que están, en reposo, donde él (él incluido), o ninguno: los de los dos labios de una
   * herida. La piel se tiende por sus aristas, y una herida las corta: sin unirlos, lo que sube un labio llegaba al otro
   * dando la vuelta por la punta, y en la esquina de una L junto al trozo desplazado los dos labios quedaban a alturas
   * distintas, con un escalón que los Farabeuf rompían en astillas. Se tienden juntos, como la piel sin cortar.
   */
  gemelos: (i: number) => readonly number[]
  /**
   * Lo que tiene encima, en reposo, el vértice `i` tal como está ahora en `punto` (las posiciones de la malla): los de la
   * cara de fuera alrededor de la recta de la sábana que pasa por él, con su peso. Con la herida abierta, un labio está
   * lejos de su reposo, y lo que sube es lo que pide la piel del sitio al que se fue.
   */
  encimaDe: (x: number, y: number, z: number, i: number) => { de: Int32Array; pesos: Float32Array; alto: number } | null
}
const SABANAS = new WeakMap<THREE.BufferGeometry, SabanaDeLaPiel>()

function sabanaDe(
  g: THREE.BufferGeometry,
  reposo: Float32Array,
  pared: THREE.BufferAttribute | undefined,
  dentro: THREE.BufferAttribute,
  mmPorLocal: number,
): SabanaDeLaPiel {
  const guardada = SABANAS.get(g)
  if (guardada && guardada.reposo === reposo) return guardada
  const n = Math.floor(reposo.length / 3)
  const indices = g.getIndex()?.array ?? null
  const nt = indices ? Math.floor(indices.length / 3) : Math.floor(n / 3)
  const vertice = (t: number, k: number) => (indices ? indices[t * 3 + k] : t * 3 + k)
  const esPared = (i: number) => pared !== undefined && pared.getX(i) > 0
  const esDentro = (i: number) => dentro.getX(i) > 0.5

  // La normal en reposo, pesada por el área, sin los triángulos de la pared.
  const direccion = new Float32Array(n * 3)
  for (let t = 0; t < nt; t++) {
    const a = vertice(t, 0), b = vertice(t, 1), c = vertice(t, 2)
    if (esPared(a) && esPared(b) && esPared(c)) continue
    const ux = reposo[b * 3] - reposo[a * 3], uy = reposo[b * 3 + 1] - reposo[a * 3 + 1], uz = reposo[b * 3 + 2] - reposo[a * 3 + 2]
    const wx = reposo[c * 3] - reposo[a * 3], wy = reposo[c * 3 + 1] - reposo[a * 3 + 1], wz = reposo[c * 3 + 2] - reposo[a * 3 + 2]
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    for (const v of [a, b, c]) {
      direccion[v * 3] += nx
      direccion[v * 3 + 1] += ny
      direccion[v * 3 + 2] += nz
    }
  }
  const normalizar = (d: Float32Array) => {
    for (let i = 0; i < n; i++) {
      const l = Math.hypot(d[i * 3], d[i * 3 + 1], d[i * 3 + 2])
      if (l > 0) {
        d[i * 3] /= l
        d[i * 3 + 1] /= l
        d[i * 3 + 2] /= l
      }
    }
  }
  normalizar(direccion)
  // Los gemelos: los vértices de la misma cara que una herida separó y en reposo están en el mismo sitio, los de un labio
  // y los del otro. Para la sábana son uno solo (ver `gemelos`).
  const juntos = new Map<string, number[]>()
  const q = GEMELOS_A_MENOS_DE_MM / mmPorLocal
  for (let i = 0; i < n; i++) {
    if (esPared(i)) continue
    const k = `${esDentro(i) ? 1 : 0}:${Math.round(reposo[i * 3] / q)}:${Math.round(reposo[i * 3 + 1] / q)}:${Math.round(reposo[i * 3 + 2] / q)}`
    const lista = juntos.get(k)
    if (lista) lista.push(i)
    else juntos.set(k, [i])
  }
  const grupos: number[][] = []
  const grupoDe = new Map<number, number[]>()
  for (const lista of juntos.values()) {
    if (lista.length < 2) continue
    grupos.push(lista)
    for (const i of lista) grupoDe.set(i, lista)
  }
  // Promediada con los vecinos de la misma cara, fuera de la pared, y con los gemelos.
  for (let pasada = 0; pasada < PASADAS_DE_LA_SABANA; pasada++) {
    const suma = direccion.slice()
    for (let t = 0; t < nt; t++) {
      const tri = [vertice(t, 0), vertice(t, 1), vertice(t, 2)]
      if (tri.some(esPared)) continue
      for (const u of tri) {
        for (const w of tri) {
          if (u === w || esDentro(u) !== esDentro(w)) continue
          suma[u * 3] += direccion[w * 3]
          suma[u * 3 + 1] += direccion[w * 3 + 1]
          suma[u * 3 + 2] += direccion[w * 3 + 2]
        }
      }
    }
    for (const grupo of grupos) {
      let x = 0, y = 0, z = 0
      for (const i of grupo) {
        x += suma[i * 3]
        y += suma[i * 3 + 1]
        z += suma[i * 3 + 2]
      }
      for (const i of grupo) suma.set([x, y, z], i * 3)
    }
    normalizar(suma)
    for (let i = 0; i < n; i++) if (!esPared(i)) direccion.set(suma.subarray(i * 3, i * 3 + 3), i * 3)
  }

  // Los vértices fuera de la pared, por celdas, para buscar los de fuera que tiene encima uno de dentro o un punto.
  const lado = CELDA_DE_LA_SABANA_MM / mmPorLocal
  const clave = (x: number, y: number, z: number) => x + 4096 * (y + 4096 * z)
  const celdas = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    if (esPared(i)) continue
    const k = clave(Math.floor(reposo[i * 3] / lado), Math.floor(reposo[i * 3 + 1] / lado), Math.floor(reposo[i * 3 + 2] / lado))
    const lista = celdas.get(k)
    if (lista) lista.push(i)
    else celdas.set(k, [i])
  }
  const memoria = new Int32Array(n).fill(-2)
  const cercano = (i: number): number => {
    if (memoria[i] !== -2) return memoria[i]
    const cx = Math.floor(reposo[i * 3] / lado), cy = Math.floor(reposo[i * 3 + 1] / lado), cz = Math.floor(reposo[i * 3 + 2] / lado)
    let mejor = -1
    let mejorD = Infinity
    // Dos celdas a cada lado: hasta 6 mm, el grosor máximo de la piel (`GROSOR_MAXIMO_DE_LA_PIEL_MM`).
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (const j of celdas.get(clave(cx + dx, cy + dy, cz + dz)) ?? []) {
            if (j === i || esDentro(j)) continue
            const d = Math.hypot(reposo[j * 3] - reposo[i * 3], reposo[j * 3 + 1] - reposo[i * 3 + 1], reposo[j * 3 + 2] - reposo[i * 3 + 2])
            if (d < mejorD) {
              mejorD = d
              mejor = j
            }
          }
        }
      }
    }
    memoria[i] = mejor
    return mejor
  }
  const sigma = SIGMA_DE_LA_CARA_DE_DENTRO_MM / mmPorLocal
  /**
   * Los vértices de la cara de fuera en reposo alrededor de la recta que pasa por (px, py, pz) con dirección (ex, ey, ez),
   * con su peso por lo que se separan de ella de lado, y lo que quedan por encima del punto a lo largo de ella, pesado.
   * `null` si no hay ninguno a su alcance.
   */
  const alrededorDe = (px: number, py: number, pz: number, ex: number, ey: number, ez: number) => {
    const cx = Math.floor(px / lado), cy = Math.floor(py / lado), cz = Math.floor(pz / lado)
    const de: number[] = []
    const pesos: number[] = []
    let total = 0
    let alto = 0
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          for (const j of celdas.get(clave(cx + dx, cy + dy, cz + dz)) ?? []) {
            if (esDentro(j)) continue
            const rx = reposo[j * 3] - px, ry = reposo[j * 3 + 1] - py, rz = reposo[j * 3 + 2] - pz
            const sobre = rx * ex + ry * ey + rz * ez
            // De lado, lo que se separa de esa recta: es lo que cuenta para repartir, no la distancia en el aire, que a 3 mm
            // de grosor es casi la misma para el de encima y para sus vecinos.
            const lado2 = rx * rx + ry * ry + rz * rz - sobre * sobre
            if (lado2 > 9 * sigma * sigma) continue
            const peso = Math.exp(-lado2 / (sigma * sigma))
            de.push(j)
            pesos.push(peso)
            total += peso
            alto += peso * sobre
          }
        }
      }
    }
    if (total <= 0) return null
    return { de: Int32Array.from(de), pesos: Float32Array.from(pesos, (p) => p / total), alto: (alto / total) * mmPorLocal }
  }
  const colgados = new Map<number, { de: Int32Array; pesos: Float32Array; grosor: number } | null>()
  const colgado = (i: number) => {
    if (colgados.has(i)) return colgados.get(i) ?? null
    const arriba = cercano(i)
    if (arriba < 0) {
      colgados.set(i, null)
      return null
    }
    // La recta que sube desde el vértice: la de la sábana en el de fuera que tiene más cerca.
    const ex = direccion[arriba * 3], ey = direccion[arriba * 3 + 1], ez = direccion[arriba * 3 + 2]
    const reparto = alrededorDe(reposo[i * 3], reposo[i * 3 + 1], reposo[i * 3 + 2], ex, ey, ez)
    const salida = reparto
      ? { de: reparto.de, pesos: reparto.pesos, grosor: reparto.alto }
      : {
          de: Int32Array.of(arriba),
          pesos: Float32Array.of(1),
          grosor:
            ((reposo[arriba * 3] - reposo[i * 3]) * ex + (reposo[arriba * 3 + 1] - reposo[i * 3 + 1]) * ey + (reposo[arriba * 3 + 2] - reposo[i * 3 + 2]) * ez) *
            mmPorLocal,
        }
    colgados.set(i, salida)
    return salida
  }
  const encimaDe = (x: number, y: number, z: number, i: number) => {
    const arriba = esDentro(i) || esPared(i) ? cercano(i) : i
    if (arriba < 0) return null
    return alrededorDe(x, y, z, direccion[arriba * 3], direccion[arriba * 3 + 1], direccion[arriba * 3 + 2])
  }
  const sinGemelos: readonly number[] = []
  const gemelos = (i: number): readonly number[] => grupoDe.get(i) ?? sinGemelos
  const sabana = { reposo, direccion, cercano, colgado, gemelos, encimaDe }
  SABANAS.set(g, sabana)
  return sabana
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
  // La piel se abulta como una sábana, desde su reposo (D-421): la cuenta se hace con la piel cerrada y sin bulto, y lo que
  // sube cada vértice se suma a donde esté ahora, con la herida abierta o apartada. Ver `sabanaDe`.
  const reposo = reposoDeLaPiel(malla, base, atributo.count)
  const sabana = sabanaDe(g, reposo, pared, dentro, escala)
  const candidatos: number[] = []
  const deLaPared: number[] = []
  for (let i = 0; i < atributo.count; i++) {
    const x = reposo[i * 3], y = reposo[i * 3 + 1], z = reposo[i * 3 + 2]
    if (x < caja.min.x || x > caja.max.x || y < caja.min.y || y > caja.max.y || z < caja.min.z || z > caja.max.z) continue
    // La pared de una herida mira de lado, a la herida: subirla por su normal la metería en el hueco. Va con la piel que
    // tiene encima o debajo, la de su labio.
    if (pared && pared.getX(i) > 0) {
      deLaPared.push(i)
      continue
    }
    candidatos.push(i)
  }

  let desplazamientos = new Float32Array(0)
  const vertices: number[] = []
  if (candidatos.length > 0) {
    const n = candidatos.length
    const posiciones = new Float32Array(n * 3)
    const haciaFuera = new Float32Array(n * 3)
    const direcciones = new Float32Array(n * 3)
    const holguras = new Float32Array(n)
    const v = new THREE.Vector3()
    const d = new THREE.Vector3()
    candidatos.forEach((i, k) => {
      v.set(reposo[i * 3], reposo[i * 3 + 1], reposo[i * 3 + 2]).applyMatrix4(malla.matrixWorld).multiplyScalar(mmPorUnidad)
      posiciones[k * 3] = v.x
      posiciones[k * 3 + 1] = v.y
      posiciones[k * 3 + 2] = v.z
      const deDentro = dentro.getX(i) > 0.5
      // La cara de dentro sube como la de fuera que tiene encima: por su propia normal, en una piel curva, las dos caras
      // no iban paralelas y la de dentro asomaba por la de fuera en manchas grises.
      const deFuera = deDentro ? sabana.cercano(i) : i
      if (deFuera >= 0) d.fromArray(sabana.direccion, deFuera * 3)
      else d.fromArray(sabana.direccion, i * 3).multiplyScalar(deDentro ? -1 : 1)
      direcciones[k * 3] = d.x
      direcciones[k * 3 + 1] = d.y
      direcciones[k * 3 + 2] = d.z
      d.transformDirection(malla.matrixWorld)
      haciaFuera[k * 3] = d.x
      haciaFuera[k * 3 + 1] = d.y
      haciaFuera[k * 3 + 2] = d.z
      holguras[k] = deDentro ? HOLGURA_DE_LA_CARA_DE_DENTRO_MM : HOLGURA_DE_LA_CARA_DE_FUERA_MM
    })
    const antes = performance.now()
    const sube = abultamientoMm({ posiciones, haciaFuera, holguras }, puntos, { maximoMm: ABULTAMIENTO_MAXIMO_MM })
    const vecindad = vecindadDe(g, atributo.count)
    const candidatoDe = candidatoDeCadaVertice(g, atributo.count)
    candidatos.forEach((i, k) => (candidatoDe[i] = k))
    const colgadoDe: ({ de: Int32Array; pesos: Float32Array; grosor: number } | null)[] = []
    const deLaCaraDeDentro: number[] = []
    candidatos.forEach((i, k) => {
      if (dentro.getX(i) <= 0.5) return
      deLaCaraDeDentro.push(k)
      colgadoDe.push(sabana.colgado(i))
    })
    // Y se tiende alrededor, por las aristas de la piel: de un vértice a sus vecinos que también se miraron.
    const verticeDe = (t: number, e: number) => (vecindad.indices ? vecindad.indices[t * 3 + e] : t * 3 + e)
    const vecinosDe = (k: number, visitar: (j: number) => void) => {
      const i = candidatos[k]
      for (let j = vecindad.inicio[i]; j < vecindad.inicio[i + 1]; j++) {
        const t = vecindad.triangulos[j]
        for (let e = 0; e < 3; e++) {
          const otro = candidatoDe[verticeDe(t, e)]
          if (otro >= 0 && otro !== k) visitar(otro)
        }
      }
      // Y a través de las heridas, como si no estuvieran: de un labio a su gemelo del otro (D-421).
      for (const j of sabana.gemelos(i)) {
        const otro = candidatoDe[j]
        if (otro >= 0 && otro !== k) visitar(otro)
      }
    }
    // Tendida, alisada y vuelta a tender (D-421): ver `alisarLaTienda`.
    const pide = Float32Array.from(sube)
    tenderLaPiel(sube, posiciones, vecinosDe)
    alisarLaTienda(sube, pide, vecinosDe)
    tenderLaPiel(sube, posiciones, vecinosDe)
    // Lo que sube cada vértice sale del sitio donde está ahora y no de donde estaba en reposo (D-421): con la herida
    // abierta, un labio está lejos de su reposo, y lo que sube es lo que pide la piel de ese sitio, leída en la sábana
    // ya tendida (`encimaDe`). Llevado pegado a cada vértice desde su reposo, la retracción de la esquina de una L junto
    // al trozo desplazado juntaba vértices que subían 25 mm con otros que subían 10: 58 triángulos vueltos en la L del
    // tobillo, 3 leyéndolo donde está. Solo los primeros milímetros (`LO_QUE_SE_LEE_DONDE_ESTA_MM`): lo que un Farabeuf
    // aparta más allá va pegado. Lo que no se movió de su reposo sube lo suyo.
    const ahora = base
    const movidoMinimo = MOVIDO_PARA_LEER_LA_SABANA_MM / escala
    const desplazamientos3 = new Float32Array(n * 3)
    const subeEn = (r: { de: Int32Array; pesos: Float32Array }): [number, number, number] => {
      let x = 0, y = 0, z = 0
      for (let e = 0; e < r.de.length; e++) {
        const j = r.de[e]
        const kj = candidatoDe[j]
        if (kj < 0) continue
        const largo = r.pesos[e] * sube[kj]
        x += sabana.direccion[j * 3] * largo
        y += sabana.direccion[j * 3 + 1] * largo
        z += sabana.direccion[j * 3 + 2] * largo
      }
      return [x, y, z]
    }
    const seMovio = (i: number) =>
      Math.hypot(ahora[i * 3] - reposo[i * 3], ahora[i * 3 + 1] - reposo[i * 3 + 1], ahora[i * 3 + 2] - reposo[i * 3 + 2]) > movidoMinimo
    const hastaDondeSeLee = LO_QUE_SE_LEE_DONDE_ESTA_MM / escala
    /** Dónde se lee la sábana para el vértice `i`: donde está, o a `LO_QUE_SE_LEE_DONDE_ESTA_MM` de su reposo hacia allí. */
    const leerEn = (i: number) => {
      const dx = ahora[i * 3] - reposo[i * 3], dy = ahora[i * 3 + 1] - reposo[i * 3 + 1], dz = ahora[i * 3 + 2] - reposo[i * 3 + 2]
      const largo = Math.hypot(dx, dy, dz)
      const k = largo > hastaDondeSeLee ? hastaDondeSeLee / largo : 1
      return sabana.encimaDe(reposo[i * 3] + dx * k, reposo[i * 3 + 1] + dy * k, reposo[i * 3 + 2] + dz * k, i)
    }
    // Primero la cara de fuera, que es la que manda; se guarda aparte para que la de dentro lea la de fuera sin mezclar.
    const finalDe = new Float32Array(n)
    candidatos.forEach((i, k) => {
      if (dentro.getX(i) > 0.5) return
      let v: [number, number, number] = [direcciones[k * 3] * sube[k], direcciones[k * 3 + 1] * sube[k], direcciones[k * 3 + 2] * sube[k]]
      if (seMovio(i)) {
        const r = leerEn(i)
        if (r) v = subeEn(r)
      }
      desplazamientos3.set([v[0] / escala, v[1] / escala, v[2] / escala], k * 3)
      finalDe[k] = Math.hypot(v[0], v[1], v[2])
    })
    // La cara de dentro, con techo: sube lo suyo —más que la de fuera sobre el hueso, porque está más cerca de él y la
    // grasa se aplasta (D-331)— o lo de la de fuera que tiene encima, lo que sea más, pero nunca tanto que quede a menos
    // de la dermis de ella. Cada cara se tiende por su lado, y en la falda del bulto la de dentro, que parte de una cima
    // más alta, se tendía más ancha; bajo una incisión recién hecha, que corta distinto los caminos de cada cara, quedaba
    // 4 mm por encima de la de fuera: una mancha gris de dos dedos, el «vidrio» que se veía a un lado del corte. Se probó
    // a pedirle a la de fuera lo que necesitaba la de dentro y tender las dos juntas: la de fuera se llenó de bultos de un
    // centímetro, uno por cada racimo de vértices que se subía de golpe.
    deLaCaraDeDentro.forEach((k, m) => {
      const c = colgadoDe[m]
      const i = candidatos[k]
      if (!c) {
        desplazamientos3.set([direcciones[k * 3] * (sube[k] / escala), direcciones[k * 3 + 1] * (sube[k] / escala), direcciones[k * 3 + 2] * (sube[k] / escala)], k * 3)
        finalDe[k] = sube[k]
        return
      }
      const r = seMovio(i) ? (leerEn(i) ?? c) : c
      const [x, y, z] = subeEn(r)
      const encima = Math.hypot(x, y, z)
      const techo = encima + c.grosor - DERMIS_DE_LA_SABANA_MM
      const final = Math.max(0, Math.min(Math.max(sube[k], encima), techo))
      // Hacia donde sube la de fuera que tiene encima; si esa no sube, por la suya, que es la misma de la sábana.
      if (encima > 1e-6) desplazamientos3.set([(x / encima) * (final / escala), (y / encima) * (final / escala), (z / encima) * (final / escala)], k * 3)
      else desplazamientos3.set([direcciones[k * 3] * (final / escala), direcciones[k * 3 + 1] * (final / escala), direcciones[k * 3 + 2] * (final / escala)], k * 3)
      finalDe[k] = final
    })
    for (const i of candidatos) candidatoDe[i] = -1
    if (cuenta) {
      cuenta.candidatos += n
      cuenta.msDeLaCuenta += performance.now() - antes
    }
    const lista: number[] = []
    candidatos.forEach((i, k) => {
      // Menos de una décima de milímetro no se ve, y cada vértice de más es una normal que rehacer.
      if (finalDe[k] < 0.1) return
      vertices.push(i)
      lista.push(desplazamientos3[k * 3], desplazamientos3[k * 3 + 1], desplazamientos3[k * 3 + 2])
    })
    // La pared, con su labio: lo que sube el vértice de la piel que tiene al lado **ahora**, que es el de su labio de arriba
    // o el de abajo. Antes se quedaba quieta mientras la piel de al lado subía hasta 30 mm. Y no el más cercano en reposo:
    // ahí los dos labios están en el mismo sitio, y con la herida abierta la mitad de la pared tomaba lo que sube el labio
    // de enfrente, a 35 mm, y cruzaba la herida como un hilo.
    let deLaParedSubidos = 0
    if (deLaPared.length > 0) {
      const ladoAhora = CELDA_DE_LA_SABANA_MM / escala
      const claveAhora = (x: number, y: number, z: number) => x + 4096 * (y + 4096 * z)
      const celdasAhora = new Map<number, number[]>()
      candidatos.forEach((i, k) => {
        const c = claveAhora(Math.floor(ahora[i * 3] / ladoAhora), Math.floor(ahora[i * 3 + 1] / ladoAhora), Math.floor(ahora[i * 3 + 2] / ladoAhora))
        const lista = celdasAhora.get(c)
        if (lista) lista.push(k)
        else celdasAhora.set(c, [k])
      })
      for (const i of deLaPared) {
        const cx = Math.floor(ahora[i * 3] / ladoAhora), cy = Math.floor(ahora[i * 3 + 1] / ladoAhora), cz = Math.floor(ahora[i * 3 + 2] / ladoAhora)
        let mejor = -1
        let mejorD = Infinity
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              for (const k of celdasAhora.get(claveAhora(cx + dx, cy + dy, cz + dz)) ?? []) {
                const j = candidatos[k]
                const d = Math.hypot(ahora[j * 3] - ahora[i * 3], ahora[j * 3 + 1] - ahora[i * 3 + 1], ahora[j * 3 + 2] - ahora[i * 3 + 2])
                if (d < mejorD) {
                  mejorD = d
                  mejor = k
                }
              }
            }
          }
        }
        if (mejor < 0 || finalDe[mejor] < 0.1) continue
        vertices.push(i)
        lista.push(desplazamientos3[mejor * 3], desplazamientos3[mejor * 3 + 1], desplazamientos3[mejor * 3 + 2])
        deLaParedSubidos++
      }
    }
    if (cuenta) {
      cuenta.pared += deLaPared.length
      cuenta.deLaPared += deLaParedSubidos
    }
    desplazamientos = Float32Array.from(lista)
  }

  // Lo que el bulto da vuelta junto a una herida abierta se endereza como lo que dan vuelta los arrastres (D-421): sube
  // cada vértice por la dirección de la sábana, la de reposo, y junto a un labio apartado eso cruzaba los triángulos.
  const cortes = cadenaDeLaMalla(malla).map((h) => h.corte)
  const corte = cortes.at(-1)
  if (corte && vertices.length > 0 && corte.posiciones.length === base.length) {
    const conBulto = Float32Array.from(base)
    vertices.forEach((i, k) => {
      conBulto[i * 3] += desplazamientos[k * 3]
      conBulto[i * 3 + 1] += desplazamientos[k * 3 + 1]
      conBulto[i * 3 + 2] += desplazamientos[k * 3 + 2]
    })
    if (enderezarPosiciones(cortes, conBulto)) {
      vertices.length = 0
      const lista: number[] = []
      for (let i = 0; i < base.length / 3; i++) {
        const dx = conBulto[i * 3] - base[i * 3]
        const dy = conBulto[i * 3 + 1] - base[i * 3 + 1]
        const dz = conBulto[i * 3 + 2] - base[i * 3 + 2]
        if (dx === 0 && dy === 0 && dz === 0) continue
        vertices.push(i)
        lista.push(dx, dy, dz)
      }
      desplazamientos = Float32Array.from(lista)
    }
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

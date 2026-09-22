'use client'

/**
 * El marco que corta (D-140): se arrastra un rectángulo, lo que queda dentro se
 * selecciona, y lo que cruza el borde se parte limpio por el borde, como con
 * un cuchillo.
 *
 * Un rectángulo en pantalla es, en el espacio, una pirámide con el vértice en
 * la cámara: cuatro planos, uno por lado, que pasan por el ojo. Cada pieza que
 * cruza alguno se parte por él con el mismo corte con tapa de siempre
 * (`crearFragmentos`), plano a plano, quedándose con lo de dentro para el
 * siguiente. Al final, el trozo de dentro queda seleccionado y los de fuera —uno
 * por plano que cruzó— quedan como fragmentos sueltos. Es el árbol de cortes
 * de D-137 sin nada nuevo en el formato: solo cortes encadenados, hasta cuatro
 * por pieza y marco.
 *
 * Aquí está la cuenta; el ratón y la selección están en `VisorAtlas.tsx`.
 */

import * as THREE from 'three'
import type { EscenaDelAtlas, TransformacionDePieza } from './cargador'
import {
  crearFragmentos,
  liberarFragmento,
  planoEnReposo,
  transformacionHeredada,
  type FragmentoDelAtlas,
} from './fragmentos'
import { PROFUNDIDAD_MAXIMA_DE_CORTE, type CorteDePieza } from './formato'
import type { MallaIndexada } from '@/lib/osteotomia'
import type { RectanguloNormalizado } from './seleccionPorCaja'
import { centroActual } from './transformar'

export interface PlanoDelMarco {
  punto: [number, number, number]
  normal: [number, number, number]
}

/**
 * Los cuatro planos de un rectángulo de pantalla, con la normal hacia dentro.
 *
 * Cada lado se lleva al espacio con dos puntos de su borde a media
 * profundidad, y el plano pasa por ellos y por la cámara. Vale también en la
 * vista ortográfica del taller, que sigue siendo una cámara de perspectiva
 * puesta lejos con el campo cerrado.
 */
export function planosDelRectangulo(
  camara: THREE.PerspectiveCamera,
  rectangulo: RectanguloNormalizado,
): PlanoDelMarco[] {
  const enElMundo = (x: number, y: number) => new THREE.Vector3(x, y, 0.5).unproject(camara)
  const centro = enElMundo(
    (rectangulo.minX + rectangulo.maxX) / 2,
    (rectangulo.minY + rectangulo.maxY) / 2,
  )
  const lados: [THREE.Vector3, THREE.Vector3][] = [
    [enElMundo(rectangulo.minX, rectangulo.minY), enElMundo(rectangulo.minX, rectangulo.maxY)],
    [enElMundo(rectangulo.maxX, rectangulo.minY), enElMundo(rectangulo.maxX, rectangulo.maxY)],
    [enElMundo(rectangulo.minX, rectangulo.minY), enElMundo(rectangulo.maxX, rectangulo.minY)],
    [enElMundo(rectangulo.minX, rectangulo.maxY), enElMundo(rectangulo.maxX, rectangulo.maxY)],
  ]
  const planos: PlanoDelMarco[] = []
  for (const [a, b] of lados) {
    const normal = a.clone().sub(camara.position).cross(b.clone().sub(camara.position))
    if (normal.lengthSq() < 1e-14) continue
    normal.normalize()
    // Hacia dentro: el centro del rectángulo tiene que quedar del lado positivo.
    if (centro.clone().sub(a).dot(normal) < 0) normal.negate()
    planos.push({ punto: [a.x, a.y, a.z], normal: [normal.x, normal.y, normal.z] })
  }
  return planos
}

/** Dónde cae la caja de una pieza respecto de un plano: entera dentro, entera fuera, o cruzándolo. */
function ladoDeLaCaja(
  esquinas: readonly THREE.Vector3[],
  plano: PlanoDelMarco,
): 'dentro' | 'fuera' | 'cruza' {
  const n = new THREE.Vector3(...plano.normal)
  const p = new THREE.Vector3(...plano.punto)
  let dentro = 0
  for (const esquina of esquinas) if (esquina.clone().sub(p).dot(n) >= 0) dentro += 1
  return dentro === esquinas.length ? 'dentro' : dentro === 0 ? 'fuera' : 'cruza'
}

/** Las ocho esquinas de una caja, llevadas a donde la pieza se dibuja. */
function esquinasEnElMundo(
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  centro: THREE.Vector3,
  transformacion: TransformacionDePieza | null,
): THREE.Vector3[] {
  const giro = new THREE.Quaternion(...(transformacion?.girar ?? [0, 0, 0, 1]))
  const mover = new THREE.Vector3(...(transformacion?.mover ?? [0, 0, 0]))
  const esquinas: THREE.Vector3[] = []
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]])
      for (const z of [min[2], max[2]]) {
        esquinas.push(
          new THREE.Vector3(x, y, z).sub(centro).applyQuaternion(giro).add(centro).add(mover),
        )
      }
  return esquinas
}

function cajaDeLaMalla(malla: MallaIndexada): [[number, number, number], [number, number, number]] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  const p = malla.posiciones
  for (let i = 0; i < p.length; i += 3) {
    for (let e = 0; e < 3; e += 1) {
      if (p[i + e] < min[e]) min[e] = p[i + e]
      if (p[i + e] > max[e]) max[e] = p[i + e]
    }
  }
  return [min, max]
}

/** Lo que hay que recortar: una pieza entera o un trozo, con dónde está ahora. */
export interface CandidataDelRecorte {
  id: string
  /** Índice en el catálogo de la pieza de la que viene. */
  indice: number
  centro: THREE.Vector3
  transformacion: TransformacionDePieza | null
  /** Su geometría en reposo si es un trozo; `undefined` si es la pieza entera. */
  enReposo?: MallaIndexada
  caja: [[number, number, number], [number, number, number]]
}

export interface ResultadoDelRecorte {
  /** En orden de árbol: cada uno detrás del que creó lo que parte. */
  cortes: CorteDePieza[]
  /** Con qué se queda cada trozo nuevo donde estaba su padre. */
  heredadas: Map<string, TransformacionDePieza>
  /** Lo que queda dentro del marco: piezas enteras y trozos de dentro. */
  dentro: string[]
  /** Cuántas cosas se quisieron partir y no se pudo, por el tope de cortes encadenados. */
  sinPartir: number
}

/** Candidata a partir de un trozo ya existente. */
export function candidataDeUnTrozo(
  trozo: FragmentoDelAtlas,
  indice: number,
  transformacion: TransformacionDePieza | null,
): CandidataDelRecorte {
  return {
    id: trozo.id,
    indice,
    centro: trozo.centro.clone(),
    transformacion,
    enReposo: trozo.enReposo,
    caja: cajaDeLaMalla(trozo.enReposo),
  }
}

/**
 * Recorta las candidatas por los planos del marco.
 *
 * Por cada una: si su caja cae entera dentro, se selecciona; entera fuera de
 * algún plano, se deja; si cruza, se parte por cada plano que cruce, en orden,
 * siguiendo siempre con el trozo de dentro. La caja decide por adelantado y la
 * geometría decide de verdad: un plano que la caja cruza y la malla no, no
 * corta y se salta.
 */
export function recortarPorElMarco(
  escena: EscenaDelAtlas,
  candidatas: readonly CandidataDelRecorte[],
  planos: readonly PlanoDelMarco[],
): ResultadoDelRecorte {
  const cortes: CorteDePieza[] = []
  const heredadas = new Map<string, TransformacionDePieza>()
  const dentro: string[] = []
  let sinPartir = 0

  for (const candidata of candidatas) {
    const esquinas = esquinasEnElMundo(
      candidata.caja[0],
      candidata.caja[1],
      candidata.centro,
      candidata.transformacion,
    )
    const lados = planos.map((plano) => ladoDeLaCaja(esquinas, plano))
    if (lados.includes('fuera')) continue
    if (lados.every((lado) => lado === 'dentro')) {
      dentro.push(candidata.id)
      continue
    }

    let actual = candidata
    let seQuedaFuera = false
    for (const [k, plano] of planos.entries()) {
      if (lados[k] === 'dentro') continue
      if (actual.id.split('#').length - 1 >= PROFUNDIDAD_MAXIMA_DE_CORTE) {
        sinPartir += 1
        break
      }
      const enReposo = planoEnReposo(plano, actual.centro, actual.transformacion)
      const corte: CorteDePieza = { pieza: actual.id, ...enReposo }
      const ensayo = crearFragmentos(escena, actual.indice, corte, actual.enReposo)
      if ('motivo' in ensayo) {
        // La caja cruzaba y la malla no: está entera de un lado. De cuál lo
        // dice su centro, que en una malla cerrada cae dentro de ella.
        const centroAhora = centroActual(actual.centro, actual.transformacion ?? undefined)
        const lado = centroAhora.sub(new THREE.Vector3(...plano.punto)).dot(new THREE.Vector3(...plano.normal))
        if (lado < 0) {
          seQuedaFuera = true
          break
        }
        continue
      }
      cortes.push(corte)
      const [a, b] = ensayo.fragmentos
      for (const trozo of [a, b]) {
        const suya = transformacionHeredada(actual.centro, actual.transformacion, trozo.centro)
        if (suya) heredadas.set(trozo.id, suya)
      }
      liberarFragmento(b)
      const siguiente: CandidataDelRecorte = {
        id: a.id,
        indice: actual.indice,
        centro: a.centro.clone(),
        transformacion: heredadas.get(a.id) ?? null,
        enReposo: a.enReposo,
        caja: cajaDeLaMalla(a.enReposo),
      }
      liberarFragmento(a)
      actual = siguiente
    }
    if (!seQuedaFuera) dentro.push(actual.id)
  }

  return { cortes, heredadas, dentro, sinPartir }
}

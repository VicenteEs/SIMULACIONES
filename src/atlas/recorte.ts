'use client'

/**
 * El marco que corta: se arrastra un rectángulo, lo que queda dentro se
 * selecciona, y lo que cruza el borde se parte limpio por el borde, como con
 * un cuchillo.
 *
 * Un rectángulo en pantalla es, en el espacio, una pirámide con el vértice en
 * la cámara: cuatro planos, uno por lado, que pasan por el ojo. Cada pieza que
 * cruza alguno se parte **una sola vez** por todos los que cruza
 * (`partirPorVariosPlanos`), y quedan exactamente dos piezas: `a`, lo de
 * dentro, que queda seleccionado —«_1» en pantalla—, y `b`, todo lo de fuera
 * en una sola malla —«_2»— (D-141).
 *
 * La primera versión (D-140) partía plano a plano y dejaba suelto cada trozo de
 * fuera: un músculo que cruzaba la esquina del marco salía en tres piezas, y
 * gastaba hasta cuatro cortes encadenados por pieza. Ahora un recorte es un
 * corte por pieza, con los planos que de verdad la cortan guardados juntos
 * (`CorteDePieza.otrosPlanos`), y un segundo marco sobre lo recortado es un
 * nivel más del árbol de D-137, no cuatro.
 *
 * Aquí está la cuenta; el ratón y la selección están en `VisorAtlas.tsx`.
 */

import * as THREE from 'three'
import type { EscenaDelAtlas, TransformacionDePieza } from './cargador'
import {
  fragmentosDeLasMitades,
  liberarFragmento,
  mallaDeLaPieza,
  planoEnReposo,
  transformacionHeredada,
  type FragmentoDelAtlas,
} from './fragmentos'
import {
  PROFUNDIDAD_MAXIMA_DE_CORTE,
  idDeFragmento,
  profundidadDe,
  type CorteDePieza,
} from './formato'
import { partirPorVariosPlanos, type MallaIndexada, type ParticionPorPlanos } from '@/lib/osteotomia'
import type { RectanguloNormalizado } from './seleccionPorCaja'

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
  /** Uno por pieza partida, en el orden de las candidatas: cada uno parte algo que ya existía. */
  cortes: CorteDePieza[]
  /** Con qué se queda cada trozo nuevo donde estaba su padre. */
  heredadas: Map<string, TransformacionDePieza>
  /** Lo que queda dentro del marco: piezas enteras y trozos de dentro (`#a`). */
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
 * algún plano, se deja; si cruza, se parte de una vez por los planos que su
 * caja cruza. La caja decide por adelantado y la geometría decide de verdad:
 * un plano que la caja cruza y la malla no, no corta y no se guarda; y una
 * malla que, mirada de cerca, queda entera dentro o entera fuera, se selecciona
 * o se deja sin cortar.
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
    if (profundidadDe(candidata.id) >= PROFUNDIDAD_MAXIMA_DE_CORTE) {
      // Se queda entera y seleccionada, como estaba: el marco la tocaba, y
      // dejarla fuera de la selección sin decir nada sería peor que avisar.
      sinPartir += 1
      dentro.push(candidata.id)
      continue
    }

    // Los planos que cruza, llevados al sitio anatómico de lo que se corta
    // (D-137): así vale también para lo que ya se había movido.
    const cruzados = planos
      .filter((_, k) => lados[k] === 'cruza')
      .map((plano) => planoEnReposo(plano, candidata.centro, candidata.transformacion))
    const geometria = candidata.enReposo ?? mallaDeLaPieza(escena, candidata.indice)
    if (!geometria) continue
    let particion: ParticionPorPlanos
    try {
      particion = partirPorVariosPlanos(geometria, cruzados)
    } catch {
      // Una malla que no se deja partir —un plano que la roza sin cortarla en
      // ningún intento— se queda como está. No se selecciona: no se sabe de
      // qué lado cae, y seleccionar de más es peor que de menos.
      continue
    }
    if (!particion.dentro) continue
    if (!particion.fuera) {
      dentro.push(candidata.id)
      continue
    }

    const efectivos = particion.planosQueCortan.map((k) => cruzados[k])
    const [primero, ...resto] = efectivos
    const corte: CorteDePieza = {
      pieza: candidata.id,
      punto: primero.punto,
      normal: primero.normal,
      ...(resto.length > 0 ? { otrosPlanos: resto } : {}),
    }
    const trozos = fragmentosDeLasMitades(escena, candidata.indice, candidata.id, [
      particion.dentro,
      particion.fuera,
    ])
    for (const trozo of trozos) {
      const suya = transformacionHeredada(candidata.centro, candidata.transformacion, trozo.centro)
      if (suya) heredadas.set(trozo.id, suya)
    }
    // Eran para medir los centros: los de verdad los crea el visor a partir de
    // la prop `cortes`, que es la única fuente de lo que hay partido.
    trozos.forEach(liberarFragmento)
    cortes.push(corte)
    dentro.push(idDeFragmento(candidata.id, 'a'))
  }

  return { cortes, heredadas, dentro, sinPartir }
}

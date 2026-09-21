'use client'

/**
 * Los dos trozos de un hueso partido, como mallas sueltas (D-130).
 *
 * El resto del atlas son quince mallas fusionadas en las que una pieza es un
 * rango de índices y su estado, un píxel de textura. Un hueso partido no cabe
 * ahí: su geometría ya no es la del paquete —tiene triángulos nuevos a lo largo
 * del corte y una tapa en cada trozo—, así que sale de la malla de su sistema,
 * donde se apaga, y entra en la escena como dos `Mesh` de las de siempre. Son
 * pocos (`MAXIMO_DE_CORTES`) y cada uno es una llamada de dibujo: no se nota.
 *
 * El corte lo hace `partirMalla`, el mismo que usa la exportación al simulador:
 * lo que se ve en la ficha y lo que se opera en la consola salen de la misma
 * cuenta.
 */

import * as THREE from 'three'
import { partirMalla, type MallaIndexada } from '@/lib/osteotomia'
import type { EscenaDelAtlas, TransformacionDePieza } from './cargador'
import { idDeFragmento, type CorteDePieza, type LadoDelCorte } from './formato'

export interface FragmentoDelAtlas {
  /** `FJ1234#a` o `FJ1234#b`. */
  id: string
  pieza: string
  lado: LadoDelCorte
  malla: THREE.Mesh
  /** Centro del trozo en su sitio anatómico: sobre él gira y desde él se mide lo movido. */
  centro: THREE.Vector3
  /** Color del sistema, para volver a él al deseleccionar. */
  colorBase: THREE.Color
}

/**
 * La geometría de una pieza, sacada de la malla fusionada de su sistema.
 *
 * Los índices del rango apuntan a vértices de la malla entera; aquí se rebasan
 * al primero de la pieza. Sirve porque el cargador copia los vértices de cada
 * pieza seguidos: el mínimo y el máximo del rango delimitan justo los suyos.
 */
export function mallaDeLaPieza(escena: EscenaDelAtlas, indice: number): MallaIndexada | null {
  const rango = escena.rangos.get(indice)
  if (!rango) return null
  const geometria = escena.mallas[rango.malla].geometry
  const posiciones = geometria.getAttribute('position').array as Float32Array
  const normales = geometria.getAttribute('normal').array as Int16Array
  const orden = geometria.getIndex()?.array
  if (!orden) return null

  let primero = Infinity
  let ultimo = -1
  for (let k = rango.inicio; k < rango.inicio + rango.cuenta; k += 1) {
    if (orden[k] < primero) primero = orden[k]
    if (orden[k] > ultimo) ultimo = orden[k]
  }
  if (ultimo < 0) return null

  const indices = new Uint32Array(rango.cuenta)
  for (let k = 0; k < rango.cuenta; k += 1) indices[k] = orden[rango.inicio + k] - primero
  return {
    posiciones: posiciones.slice(primero * 3, (ultimo + 1) * 3),
    normales: normales.slice(primero * 3, (ultimo + 1) * 3),
    indices,
  }
}

function aMalla(trozo: MallaIndexada, color: THREE.Color): { malla: THREE.Mesh; centro: THREE.Vector3 } {
  const geometria = new THREE.BufferGeometry()
  geometria.setAttribute('position', new THREE.BufferAttribute(trozo.posiciones, 3))
  geometria.setAttribute(
    'normal',
    new THREE.BufferAttribute(trozo.normales, 3, trozo.normales instanceof Int16Array),
  )
  geometria.setIndex(new THREE.BufferAttribute(trozo.indices, 1))
  geometria.computeBoundingBox()
  const centro = geometria.boundingBox!.getCenter(new THREE.Vector3())
  // La geometría se centra en el origen y la malla se coloca en el centro: así
  // girar la malla es girar el trozo sobre sí mismo, que es lo que se espera.
  geometria.translate(-centro.x, -centro.y, -centro.z)
  geometria.computeBoundingSphere()

  // El mismo material que las piezas enteras (`materialDelSistema`), para que
  // un trozo no se distinga del hueso del que salió más que por el corte.
  const material = new THREE.MeshStandardMaterial({
    color: color.clone(),
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  })
  const malla = new THREE.Mesh(geometria, material)
  malla.position.copy(centro)
  return { malla, centro }
}

/**
 * Parte una pieza y devuelve sus dos trozos, o un motivo legible si no se pudo.
 *
 * Un plano que no toca la pieza deja un lado vacío: no es un corte y se dice,
 * en vez de entregar un «fragmento» sin triángulos que no se puede señalar.
 */
export function crearFragmentos(
  escena: EscenaDelAtlas,
  indice: number,
  corte: Pick<CorteDePieza, 'pieza' | 'punto' | 'normal'>,
): { fragmentos: [FragmentoDelAtlas, FragmentoDelAtlas] } | { motivo: string } {
  const entera = mallaDeLaPieza(escena, indice)
  if (!entera) return { motivo: 'Esa pieza no está cargada en el visor.' }

  let partida
  try {
    partida = partirMalla(entera, { punto: corte.punto, normal: corte.normal })
  } catch (fallo) {
    return { motivo: fallo instanceof Error ? fallo.message : 'No se pudo partir la pieza.' }
  }
  if (partida.haciaLaNormal.indices.length === 0 || partida.contraLaNormal.indices.length === 0) {
    return { motivo: 'La línea de corte no atraviesa la pieza. Trácela de lado a lado del hueso.' }
  }

  const rango = escena.rangos.get(indice)!
  const material = escena.mallas[rango.malla].material as THREE.MeshStandardMaterial
  const lados: [LadoDelCorte, MallaIndexada][] = [
    ['a', partida.haciaLaNormal],
    ['b', partida.contraLaNormal],
  ]
  const fragmentos = lados.map(([lado, trozo]) => {
    const { malla, centro } = aMalla(trozo, material.color)
    malla.name = idDeFragmento(corte.pieza, lado)
    return {
      id: malla.name,
      pieza: corte.pieza,
      lado,
      malla,
      centro,
      colorBase: material.color.clone(),
    }
  }) as [FragmentoDelAtlas, FragmentoDelAtlas]
  return { fragmentos }
}

/** Coloca un trozo: su sitio anatómico más lo que se haya movido y girado. */
export function colocarFragmento(
  fragmento: FragmentoDelAtlas,
  transformacion: TransformacionDePieza | null | undefined,
) {
  const [x, y, z] = transformacion?.mover ?? [0, 0, 0]
  fragmento.malla.position.set(fragmento.centro.x + x, fragmento.centro.y + y, fragmento.centro.z + z)
  const [qx, qy, qz, qw] = transformacion?.girar ?? [0, 0, 0, 1]
  fragmento.malla.quaternion.set(qx, qy, qz, qw)
}

const NARANJA_DE_SELECCION = new THREE.Color(0.95, 0.38, 0.0)

/** El mismo naranja, y en la misma proporción, que el sombreador da a una pieza seleccionada. */
export function pintarFragmento(fragmento: FragmentoDelAtlas, seleccionado: boolean) {
  const material = fragmento.malla.material as THREE.MeshStandardMaterial
  material.color.copy(fragmento.colorBase)
  if (seleccionado) material.color.lerp(NARANJA_DE_SELECCION, 0.88)
}

export function liberarFragmento(fragmento: FragmentoDelAtlas) {
  fragmento.malla.geometry.dispose()
  ;(fragmento.malla.material as THREE.Material).dispose()
  fragmento.malla.removeFromParent()
}

/**
 * El plano que dibuja una línea trazada sobre la pantalla, como el «Bisect» de
 * Blender: contiene la línea y la dirección en la que se mira, de modo que
 * corta «hacia dentro» de la pantalla justo por donde se trazó.
 *
 * `desde` y `hasta` son los extremos de la línea ya llevados al espacio del
 * atlas, a la profundidad de la pieza. Devuelve `null` si la línea no tiene
 * largo o se mira justo a lo largo de ella.
 */
export function planoDeLaLinea(
  desde: THREE.Vector3,
  hasta: THREE.Vector3,
  haciaDondeSeMira: THREE.Vector3,
): { punto: [number, number, number]; normal: [number, number, number] } | null {
  const normal = hasta.clone().sub(desde).cross(haciaDondeSeMira)
  if (normal.lengthSq() < 1e-12) return null
  normal.normalize()
  const medio = desde.clone().add(hasta).multiplyScalar(0.5)
  return { punto: [medio.x, medio.y, medio.z], normal: [normal.x, normal.y, normal.z] }
}

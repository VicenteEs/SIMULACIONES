import * as THREE from 'three'
import { verticesDeLasTapas } from '@/lib/aspectoAnatomico'
import { verticesDelCanal } from '@/lib/canalMedular'

/**
 * El canal medular en una geometría de three (D-336): el atributo `aCanal`, 1 en los vértices de la cáscara del canal
 * y 0 en los demás. Lo leen el sombreador del hueso, que pinta de médula la pared del canal (D-337), la radiografía,
 * que no la suma, y el asiento de la placa, que no apoya en ella.
 *
 * Se calcula sobre la geometría que se dibuja, y no se lee del archivo, por lo que dice `triangulosDelCanal`: así vale
 * para un caso exportado antes de D-336 (no hay canal y todo queda a 0), para un trozo partido en la consola y para
 * uno partido en el taller.
 */
export const ATRIBUTO_DEL_CANAL = 'aCanal'

/**
 * Las tres componentes de un atributo como flotantes. Un modelo comprimido (Meshopt, cuantizado) trae las posiciones y
 * las normales en enteros normalizados: leer su arreglo tal cual daba normales de 32767 y ninguna tapa reconocida.
 */
export function flotantesDe(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const salida = new Float32Array(a.count * 3)
  for (let i = 0; i < a.count; i++) {
    salida[i * 3] = a.getX(i)
    salida[i * 3 + 1] = a.getY(i)
    salida[i * 3 + 2] = a.getZ(i)
  }
  return salida
}

/**
 * Pone el atributo del canal en la geometría si no lo tiene, y dice si hay canal. Se calcula una vez: después queda en
 * la geometría, y una geometría nueva —un trozo recién partido— se marca al vestirla.
 */
export function marcarElCanal(geometria: THREE.BufferGeometry): boolean {
  if (geometria.getAttribute(ATRIBUTO_DEL_CANAL)) return geometria.userData.conCanal === true
  const posicion = geometria.getAttribute('position')
  const marca = new Float32Array(posicion?.count ?? 0)
  let hay = false
  if (posicion) {
    const posiciones = flotantesDe(posicion)
    const normal = geometria.getAttribute('normal')
    // Las tapas de los cortes no cuentan: la de un anillo une el borde de fuera con el del canal (`triangulosDelCanal`).
    const excluir = normal ? verticesDeLasTapas(posiciones, flotantesDe(normal)) : null
    const delCanal = verticesDelCanal(posiciones, geometria.getIndex()?.array ?? null, { excluir })
    for (let i = 0; i < delCanal.length; i++) {
      if (!delCanal[i]) continue
      marca[i] = 1
      hay = true
    }
  }
  geometria.setAttribute(ATRIBUTO_DEL_CANAL, new THREE.BufferAttribute(marca, 1))
  geometria.userData.conCanal = hay
  return hay
}

/**
 * Lo que un material que lee `aCanal` toma cuando la geometría no lo trae: 0, nada de canal. Sin esto, WebGL no deja
 * el atributo en 0 sino en el último valor fijo que se puso en esa posición, que puede ser el de otro programa (el
 * blanco del color por vértice, por ejemplo), y una malla sin canal se dibujaría entera como si lo fuera.
 */
export const SIN_CANAL_POR_OMISION: Record<string, number[]> = { [ATRIBUTO_DEL_CANAL]: [0] }

/**
 * Mover y girar piezas con el ratón, a la manera de Blender (D-129).
 *
 * Aquí está solo la cuenta: de un gesto en píxeles a un desplazamiento o un
 * giro en el espacio del atlas, y de ahí a la transformación nueva de cada
 * pieza. Quién escucha el ratón y quién pinta está en `VisorAtlas.tsx`; separado
 * así se puede probar sin lienzo (`tests/unit/transformar.test.ts`).
 *
 * Todo gesto parte de la transformación que cada pieza tenía **al empezar** y
 * no de la del fotograma anterior: sumando incrementos, el error de cada
 * `pointermove` se acumulaba y un giro de ida y vuelta no devolvía la pieza a
 * su sitio.
 */

import * as THREE from 'three'
import type { TransformacionDePieza } from './cargador'

export type EjeDelGesto = 'x' | 'y' | 'z'

const EJES: Record<EjeDelGesto, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

export const EN_REPOSO: TransformacionDePieza = { mover: [0, 0, 0], girar: [0, 0, 0, 1] }

/** Si una transformación no mueve nada, con la holgura de lo que no se ve. */
export function esReposo(t: TransformacionDePieza): boolean {
  return (
    Math.hypot(t.mover[0], t.mover[1], t.mover[2]) < 1e-5 &&
    Math.hypot(t.girar[0], t.girar[1], t.girar[2]) < 1e-6
  )
}

/**
 * Cuánto mide un píxel a la profundidad del pivote, en metros.
 *
 * Con perspectiva, el mismo arrastre mueve más lo que está lejos; midiendo a la
 * profundidad de lo que se mueve, la pieza sigue al cursor en vez de adelantarlo
 * o quedarse atrás.
 */
export function metrosPorPixel(
  camara: THREE.PerspectiveCamera,
  pivote: THREE.Vector3,
  altoEnPixeles: number,
): number {
  const haciaDelante = camara.getWorldDirection(new THREE.Vector3())
  const profundidad = Math.max(
    0.01,
    pivote.clone().sub(camara.position).dot(haciaDelante),
  )
  return (2 * profundidad * Math.tan((camara.fov * Math.PI) / 360)) / Math.max(1, altoEnPixeles)
}

/**
 * El desplazamiento que corresponde a un arrastre de `dx`, `dy` píxeles.
 *
 * Sin eje, la pieza se mueve en el plano de la pantalla. Con eje, lo que se
 * arrastró se proyecta sobre él: es una aproximación —Blender cruza el rayo del
 * cursor con el eje— que se nota solo mirando casi a lo largo del eje, donde
 * además el gesto no tiene sentido.
 */
export function desplazamientoDelArrastre(
  camara: THREE.PerspectiveCamera,
  pivote: THREE.Vector3,
  dx: number,
  dy: number,
  altoEnPixeles: number,
  eje: EjeDelGesto | null,
): THREE.Vector3 {
  const escala = metrosPorPixel(camara, pivote, altoEnPixeles)
  const derecha = new THREE.Vector3().setFromMatrixColumn(camara.matrixWorld, 0)
  const arriba = new THREE.Vector3().setFromMatrixColumn(camara.matrixWorld, 1)
  // La Y de la pantalla crece hacia abajo.
  const libre = derecha.multiplyScalar(dx * escala).addScaledVector(arriba, -dy * escala)
  if (!eje) return libre
  return EJES[eje].clone().multiplyScalar(libre.dot(EJES[eje]))
}

/**
 * El giro que corresponde a haber rodeado el pivote `anguloHorario` radianes en
 * pantalla, en el sentido de las agujas del reloj.
 *
 * Sin eje se gira sobre la línea de visión, que es lo que hace que la pieza
 * ruede bajo el cursor. Con eje, sobre ese eje del atlas, y con el signo puesto
 * para que también entonces siga al cursor: visto desde el otro lado, el mismo
 * giro se ve al revés.
 */
export function giroDelArrastre(
  camara: THREE.PerspectiveCamera,
  pivote: THREE.Vector3,
  anguloHorario: number,
  eje: EjeDelGesto | null,
): THREE.Quaternion {
  const haciaLaCamara = camara.position.clone().sub(pivote).normalize()
  if (!eje) return new THREE.Quaternion().setFromAxisAngle(haciaLaCamara, -anguloHorario)
  const sentido = EJES[eje].dot(haciaLaCamara) < 0 ? -1 : 1
  return new THREE.Quaternion().setFromAxisAngle(EJES[eje], -anguloHorario * sentido)
}

/** Centro actual de una pieza: su centro anatómico más lo que se haya movido. */
export function centroActual(
  centroEnReposo: THREE.Vector3,
  transformacion: TransformacionDePieza | undefined,
): THREE.Vector3 {
  const [x, y, z] = transformacion?.mover ?? [0, 0, 0]
  return centroEnReposo.clone().add(new THREE.Vector3(x, y, z))
}

/** La transformación de cada pieza tras desplazarlas todas lo mismo. */
export function moverPiezas(
  alEmpezar: ReadonlyMap<string, TransformacionDePieza>,
  ids: readonly string[],
  desplazamiento: THREE.Vector3,
): Map<string, TransformacionDePieza> {
  const salida = new Map<string, TransformacionDePieza>()
  for (const id of ids) {
    const antes = alEmpezar.get(id) ?? EN_REPOSO
    salida.set(id, {
      mover: [
        antes.mover[0] + desplazamiento.x,
        antes.mover[1] + desplazamiento.y,
        antes.mover[2] + desplazamiento.z,
      ],
      girar: antes.girar,
    })
  }
  return salida
}

/**
 * La transformación de cada pieza tras girarlas todas sobre un pivote común.
 *
 * Cada pieza hace dos cosas a la vez: gira sobre sí misma y su centro describe
 * un arco alrededor del pivote. Con una sola pieza el pivote es su centro y el
 * arco se queda en nada; con varias —un fragmento con sus músculos— es lo que
 * las mantiene juntas en vez de dejar a cada una rodando en su sitio.
 */
export function girarPiezas(
  alEmpezar: ReadonlyMap<string, TransformacionDePieza>,
  ids: readonly string[],
  centrosEnReposo: ReadonlyMap<string, THREE.Vector3>,
  pivote: THREE.Vector3,
  giro: THREE.Quaternion,
): Map<string, TransformacionDePieza> {
  const salida = new Map<string, TransformacionDePieza>()
  for (const id of ids) {
    const reposo = centrosEnReposo.get(id)
    if (!reposo) continue
    const antes = alEmpezar.get(id) ?? EN_REPOSO
    const centro = centroActual(reposo, antes).sub(pivote).applyQuaternion(giro).add(pivote)
    const propio = giro.clone().multiply(new THREE.Quaternion(...antes.girar)).normalize()
    salida.set(id, {
      mover: [centro.x - reposo.x, centro.y - reposo.y, centro.z - reposo.z],
      girar: [propio.x, propio.y, propio.z, propio.w],
    })
  }
  return salida
}

/**
 * El desplazamiento tecleado: tantos milímetros a lo largo de un eje.
 *
 * Es el `G X 8 Intro` de Blender. Sin eje elegido se toma el X, como allí: un
 * número suelto tiene que ir hacia algún sitio, y que sea siempre el mismo se
 * aprende a la primera.
 */
export function desplazamientoTecleado(milimetros: number, eje: EjeDelGesto | null): THREE.Vector3 {
  return EJES[eje ?? 'x'].clone().multiplyScalar(milimetros / 1000)
}

/**
 * El giro tecleado, en grados. Con eje, sobre ese eje del atlas y con la regla
 * de la mano derecha, que es la convención de Blender y la de la bibliografía;
 * sin eje, sobre la línea de visión, positivo en contra de las agujas del reloj.
 */
export function giroTecleado(
  camara: THREE.PerspectiveCamera,
  pivote: THREE.Vector3,
  grados: number,
  eje: EjeDelGesto | null,
): THREE.Quaternion {
  const radianes = (grados * Math.PI) / 180
  if (eje) return new THREE.Quaternion().setFromAxisAngle(EJES[eje], radianes)
  const haciaLaCamara = camara.position.clone().sub(pivote).normalize()
  return new THREE.Quaternion().setFromAxisAngle(haciaLaCamara, radianes)
}

/**
 * Lo tecleado durante un gesto, como número. `null` mientras no sea uno:
 * «-», «.» o vacío son un número a medio escribir, no un cero.
 */
export function numeroTecleado(texto: string): number | null {
  if (!/^-?\d*\.?\d+$|^-?\d+\.?$/.test(texto)) return null
  const n = Number(texto)
  return Number.isFinite(n) ? n : null
}

/** Lo tecleado tras una tecla más: cifras, un solo punto, el signo alterna y Retroceso borra. */
export function teclearNumero(texto: string, tecla: string): string | null {
  if (/^[0-9]$/.test(tecla)) return texto.length < 9 ? texto + tecla : texto
  if (tecla === '.' || tecla === ',') return texto.includes('.') ? texto : `${texto}.`
  if (tecla === '-') return texto.startsWith('-') ? texto.slice(1) : `-${texto}`
  if (tecla === 'backspace') return texto.slice(0, -1)
  return null
}

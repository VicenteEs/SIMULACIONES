/**
 * La posición del paciente en la vista: de pie, decúbito supino y decúbito prono, y el giro libre (petición de
 * Cristóbal).
 *
 * Hasta ahora el simulador solo orbitaba con el «arriba» fijo: se podía dar la vuelta al miembro y mirarlo desde
 * la planta del pie, pero la pierna seguía vertical, como si el paciente estuviera de pie, y nadie opera así.
 * «Acostarlo» es **mover la vista, no el modelo**: la cámara pasa a mirar desde arriba con el eje largo del hueso
 * horizontal en la pantalla. Se hace así porque en la escena hay cosas que no son del modelo —separadores,
 * pinzas, hilo, placa, el trazo— y todas están en el mundo: girar el cuerpo las dejaría donde estaban, y girarlas
 * a ellas con él es una fuente de errores que mover la cámara no tiene. El mismo motivo que ya llevó a «Mover
 * todo junto» a mover la cámara y no las piezas.
 *
 * Es puro y sin three: lo lee el lienzo y se prueba con números.
 *
 * Convenio: el modelo trae el eje largo del hueso en `ejeLargo` y «de frente» (anterior) en la dirección que
 * ya usan las proyecciones de la fluoroscopia. Con el eje en Y —lo habitual—, el hueso va hacia +Y, el frente
 * hacia +Z y el lado hacia +X.
 */

export type PosicionDelPaciente = 'de-pie' | 'supino' | 'prono'

export const POSICIONES_DEL_PACIENTE: readonly { valor: PosicionDelPaciente; etiqueta: string; ayuda: string }[] = [
  { valor: 'de-pie', etiqueta: 'De pie', ayuda: 'Posición anatómica: el miembro vertical, visto de frente.' },
  {
    valor: 'supino',
    etiqueta: 'Supino',
    ayuda: 'Decúbito supino: el paciente boca arriba. Se le mira desde arriba, por delante, con el miembro horizontal.',
  },
  {
    valor: 'prono',
    etiqueta: 'Prono',
    ayuda: 'Decúbito prono: el paciente boca abajo. Se le mira desde arriba, por detrás, con el miembro horizontal.',
  },
]

export type Vec3 = [number, number, number]
export type EjeDelHueso = 'x' | 'y' | 'z'

/**
 * Cómo se mira: `direccion` va del centro del modelo a la cámara y `arriba` es lo que en la pantalla apunta hacia
 * arriba. Son unitarios y perpendiculares entre sí.
 */
export interface PoseDeLaVista {
  direccion: Vec3
  arriba: Vec3
}

const suma = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const escala = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const punto = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cruz = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const largo = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const unitario = (a: Vec3): Vec3 => {
  const l = largo(a)
  return l === 0 ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l]
}

/** Los tres ejes del paciente según el eje largo del archivo: el del hueso, el de «de frente» y el del lado. */
export function ejesDelPaciente(eje: EjeDelHueso): { hueso: Vec3; frente: Vec3; lado: Vec3 } {
  if (eje === 'x') return { hueso: [1, 0, 0], frente: [0, 0, 1], lado: [0, 1, 0] }
  if (eje === 'z') return { hueso: [0, 0, 1], frente: [0, 1, 0], lado: [1, 0, 0] }
  return { hueso: [0, 1, 0], frente: [0, 0, 1], lado: [1, 0, 0] }
}

/**
 * La vista de cada posición.
 *
 * - **De pie**: el hueso hacia arriba, mirando de frente con un poco de sesgo, que es como abre el modelo.
 * - **Supino**: la cámara está por delante del paciente y el hueso se tiende en horizontal, con el extremo
 *   proximal (la cabeza del paciente) a la izquierda. Se ve la cara anterior.
 * - **Prono**: la cámara está por detrás, con el mismo sentido en la pantalla: proximal a la izquierda. Se ve la
 *   cara posterior.
 *
 * En las dos tumbadas la cámara queda un poco inclinada hacia un lado: perfectamente cenital se pierde el
 * relieve y todo parece plano. La inclinación va **solo hacia el lado** y no hacia la cabeza, a propósito: así
 * el hueso sigue exactamente horizontal en la pantalla.
 */
export function poseDeLaPosicion(posicion: PosicionDelPaciente, eje: EjeDelHueso): PoseDeLaVista {
  const { hueso, frente, lado } = ejesDelPaciente(eje)
  if (posicion === 'de-pie') {
    return { direccion: unitario(suma(suma(frente, escala(lado, 0.4)), escala(hueso, 0.15))), arriba: hueso }
  }
  // Con el hueso a la izquierda de la pantalla: derecha = −hueso. Para `frente` como dirección de la cámara
  // (supino), el «arriba» que lo cumple es hueso × frente; para el lado contrario (prono), frente × hueso.
  const arriba: Vec3 = posicion === 'supino' ? cruz(hueso, frente) : cruz(frente, hueso)
  const mirada: Vec3 = posicion === 'supino' ? frente : escala(frente, -1)
  return ortogonalizar({ direccion: unitario(suma(mirada, escala(arriba, 0.22))), arriba })
}

/**
 * Deja el «arriba» perpendicular a la mirada. `direccion` manda: el arriba se corrige, no la mirada. La pose de
 * «De pie» abre con un sesgo (la cámara un poco por encima) y su arriba no es perpendicular; el giro libre
 * necesita ejes que lo sean, o cada arrastre arrastraría el error.
 */
export function ortogonalizar(pose: PoseDeLaVista): PoseDeLaVista {
  const direccion = unitario(pose.direccion)
  const arriba = suma(pose.arriba, escala(direccion, -punto(pose.arriba, direccion)))
  return { direccion, arriba: largo(arriba) < 1e-9 ? unitario(cruz(direccion, [1, 0, 0])) : unitario(arriba) }
}

/** Hacia la derecha de la pantalla: perpendicular a la dirección de la mirada y al «arriba». */
export function derechaDeLaVista(pose: PoseDeLaVista): Vec3 {
  // La cámara mira contra `direccion`; derecha = mirada × arriba.
  return unitario(cruz(escala(pose.direccion, -1), pose.arriba))
}

/** Gira `v` un ángulo alrededor de `eje` (unitario): la fórmula de Rodrigues. */
export function girarAlrededor(v: Vec3, eje: Vec3, radianes: number): Vec3 {
  const c = Math.cos(radianes)
  const s = Math.sin(radianes)
  const k = cruz(eje, v)
  const d = punto(eje, v) * (1 - c)
  return [v[0] * c + k[0] * s + eje[0] * d, v[1] * c + k[1] * s + eje[1] * d, v[2] * c + k[2] * s + eje[2] * d]
}

/** Cuántos radianes gira la vista por píxel arrastrado en el giro libre: una vuelta entera en unos 700 px. */
export const RADIANES_POR_PIXEL = (2 * Math.PI) / 700

/**
 * El giro libre: arrastrar a la derecha da la vuelta al paciente hacia la derecha, arrastrar hacia abajo lo
 * inclina hacia uno mismo. Gira la cámara alrededor del centro, **con sus ejes de la pantalla** —el vertical y el
 * horizontal—, y por eso no tiene polos ni tope: se puede dar la vuelta entera y acostar al paciente, que es lo
 * que el orbitar de siempre no deja (su «arriba» no se mueve).
 */
export function girarLaVista(entrada: PoseDeLaVista, dxPx: number, dyPx: number): PoseDeLaVista {
  const pose = ortogonalizar(entrada)
  const derecha = derechaDeLaVista(pose)
  let { direccion, arriba } = pose
  // Un arrastre hacia la derecha lleva la cámara hacia la izquierda del modelo: el modelo gira hacia la derecha.
  const guinada = -dxPx * RADIANES_POR_PIXEL
  direccion = girarAlrededor(direccion, arriba, guinada)
  const derechaNueva = girarAlrededor(derecha, arriba, guinada)
  // Un arrastre hacia abajo sube la cámara sobre el modelo.
  const cabeceo = -dyPx * RADIANES_POR_PIXEL
  direccion = girarAlrededor(direccion, derechaNueva, cabeceo)
  arriba = girarAlrededor(arriba, derechaNueva, cabeceo)
  return { direccion: unitario(direccion), arriba: unitario(arriba) }
}

/** Gira la vista sobre sí misma —el giro en el plano de la pantalla—: «acostar» a mano en pasos de 90°. */
export function rodarLaVista(entrada: PoseDeLaVista, grados: number): PoseDeLaVista {
  const pose = ortogonalizar(entrada)
  return {
    direccion: pose.direccion,
    arriba: unitario(girarAlrededor(pose.arriba, pose.direccion, (grados * Math.PI) / 180)),
  }
}

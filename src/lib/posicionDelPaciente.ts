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

/**
 * `ayudaEnLaCamilla` es lo que dice el botón cuando el caso lleva colchón y paño (P-014). Ahí «De pie» ya no es
 * verdad al pie de la letra —el paciente sigue acostado y solo cambia desde dónde se le mira— y «Prono» hace algo
 * que antes no hacía: darle la vuelta. Sin colchón el modelo es una pieza suelta y vale la ayuda de siempre.
 */
export const POSICIONES_DEL_PACIENTE: readonly { valor: PosicionDelPaciente; etiqueta: string; ayuda: string; ayudaEnLaCamilla: string }[] = [
  {
    valor: 'de-pie',
    etiqueta: 'De pie',
    ayuda: 'Posición anatómica: el miembro vertical, visto de frente.',
    ayudaEnLaCamilla: 'El paciente sigue acostado boca arriba en la camilla: solo cambia la vista, que lo enseña con el miembro vertical y de frente, como en la posición anatómica.',
  },
  {
    valor: 'supino',
    etiqueta: 'Supino',
    ayuda: 'Decúbito supino: el paciente boca arriba. Se le mira desde arriba, por delante, con el miembro horizontal.',
    ayudaEnLaCamilla: 'Decúbito supino: el paciente boca arriba en la camilla. Se le mira desde arriba, por delante, con el miembro horizontal.',
  },
  {
    valor: 'prono',
    etiqueta: 'Prono',
    ayuda: 'Decúbito prono: el paciente boca abajo. Se le mira desde arriba, por detrás, con el miembro horizontal.',
    ayudaEnLaCamilla: 'Decúbito prono: se le da la vuelta al paciente en la camilla y queda boca abajo. Se le mira desde arriba, por detrás, con el miembro horizontal.',
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
 *
 * Y va hacia el lado que queda **abajo** en la pantalla, como quien está de pie junto a la mesa y mira hacia el
 * otro lado. Antes iba hacia el de arriba: con doce grados no se notaba en la imagen, pero el horizonte de esa vista
 * quedaba cabeza abajo respecto de la sala, y la órbita de la sala (`orbitarEnLaSala`), que lo endereza, daba media
 * vuelta a la imagen en el primer arrastre.
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
  return ortogonalizar({ direccion: unitario(suma(mirada, escala(arriba, -0.22))), arriba })
}

/**
 * La vertical de la sala en cada decúbito, sin camilla: hacia donde queda la cámara de esa posición. Con camilla la
 * da el colchón (`campo.arriba()`), que además sigue a la vuelta del paciente. De pie no hay sala: el paciente se mira
 * como una pieza, y la órbita es la de siempre.
 */
export function verticalDeLaPosicion(posicion: PosicionDelPaciente, eje: EjeDelHueso): Vec3 | null {
  if (posicion === 'de-pie') return null
  const { frente } = ejesDelPaciente(eje)
  return posicion === 'supino' ? frente : escala(frente, -1)
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

// --- la órbita de la sala ------------------------------------------------------------------------------------

/**
 * Lo más alto que sube la cámara en la órbita de la sala: casi cenital. En el polo mismo no hay «hacia dónde» y el
 * horizonte se indetermina; a un grado de él la vista ya es la de quien se asoma por encima de la mesa.
 */
export const ELEVACION_MAXIMA = (89 * Math.PI) / 180

/**
 * Lo más bajo, con camilla: dos grados sobre el plano del colchón. Más abajo solo se vería el colchón por dentro, y
 * con él delante el cursor no toca nada (`queTapa`): quien llega ahí cree que el simulador se colgó.
 */
export const ELEVACION_MINIMA_CON_CAMILLA = (2 * Math.PI) / 180

/** Sin camilla no hay nada debajo que tape: se deja mirar casi desde abajo, para la cara posterior sin dar la vuelta. */
export const ELEVACION_MINIMA_SIN_CAMILLA = (-80 * Math.PI) / 180

/**
 * Cuánto se endereza el horizonte por píxel arrastrado: media vuelta en unos 240 px. Rápido para que la vista quede
 * a nivel en el primer gesto, y no de golpe, que es perder de vista lo que se miraba.
 */
export const NIVELADO_POR_PIXEL = Math.PI / 240

/**
 * El «arriba» de la pantalla con el horizonte a nivel: la vertical de la sala vista desde `direccion`. Con la
 * dirección escrita como `cos e · horizontal + sin e · vertical` es `cos e · vertical − sin e · horizontal`, que mide
 * uno siempre y no se indetermina ni mirando a plomo (ahí es −horizontal: lo de arriba de la pantalla es lo que queda
 * más allá).
 */
function arribaANivel(vertical: Vec3, horizontal: Vec3, elevacion: number): Vec3 {
  return suma(escala(vertical, Math.cos(elevacion)), escala(horizontal, -Math.sin(elevacion)))
}

/**
 * La órbita de quien opera (pedido del dueño: «no puedo ponerme en la posición de cirujano»): con el paciente
 * acostado, el arrastre lleva la cámara **alrededor de la mesa y de arriba abajo**, como se mueve un cirujano, y no
 * alrededor del arriba de la pantalla.
 *
 * El orbitar de siempre (`OrbitControls`) gira alrededor de `camera.up`, y en «Supino» ese arriba es el **lado** del
 * paciente, porque así el hueso queda horizontal en la pantalla. El lado era entonces el polo de la órbita, y el polo
 * es justo lo que no se alcanza: mirar el tobillo de lado y en diagonal, que es desde donde se opera, quedaba a un
 * grado del tope. Aquí el polo es la vertical de la sala, que nadie necesita alcanzar:
 *
 * - **A los lados**, la cámara rodea la mesa: gira alrededor de la vertical, sin tope.
 * - **Arriba y abajo**, cambia la altura de la mirada, entre casi a plomo (`ELEVACION_MAXIMA`) y a ras del colchón
 *   (`elevacionMinima`). Hacia abajo de la pantalla sube, como en el orbitar de siempre.
 * - **El horizonte se endereza** mientras se arrastra (`NIVELADO_POR_PIXEL`): de pie junto a la mesa, la cabeza va
 *   derecha y el suelo queda abajo. Una vista que llega torcida —el encuadre de un paso grabado antes de esto, «De
 *   pie» con camilla, «Girar 90°»— se pone a nivel en el primer gesto, poco a poco, y no de un salto.
 *
 * Una altura fuera de los límites (un encuadre antiguo desde debajo de la mesa) no salta a ellos: se deja volver hacia
 * dentro y no alejarse más.
 */
export function orbitarEnLaSala(
  entrada: PoseDeLaVista,
  verticalDeLaSala: Vec3,
  dxPx: number,
  dyPx: number,
  elevacionMinima: number,
): PoseDeLaVista {
  const vertical = unitario(verticalDeLaSala)
  const pose = ortogonalizar(entrada)
  const altura = Math.max(-1, Math.min(1, punto(pose.direccion, vertical)))
  const elevacion = Math.asin(altura)
  let horizontal = suma(pose.direccion, escala(vertical, -altura))
  if (largo(horizontal) < 1e-6) {
    // A plomo, el «hacia dónde» lo pone la pantalla: la cámara está del lado que queda abajo, y así el horizonte a
    // nivel es el arriba que ya tiene la imagen.
    horizontal = suma(escala(pose.arriba, -1), escala(vertical, punto(pose.arriba, vertical)))
    if (largo(horizontal) < 1e-6) horizontal = cruz(vertical, Math.abs(vertical[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])
  }
  horizontal = unitario(horizontal)

  // Cuánto está torcida ahora la imagen respecto de la sala: el ángulo, alrededor de la mirada, que lleva el arriba
  // a nivel al arriba de la pantalla.
  const nivel = arribaANivel(vertical, horizontal, elevacion)
  const torcido = Math.atan2(punto(cruz(nivel, pose.arriba), pose.direccion), punto(nivel, pose.arriba))

  // Un arrastre a la derecha lleva la cámara hacia la izquierda del modelo, como en el orbitar de siempre.
  const horizontalNueva = unitario(girarAlrededor(horizontal, vertical, -dxPx * RADIANES_POR_PIXEL))
  const deseada = elevacion + dyPx * RADIANES_POR_PIXEL
  const elevacionNueva =
    dyPx >= 0 ? Math.min(deseada, Math.max(ELEVACION_MAXIMA, elevacion)) : Math.max(deseada, Math.min(elevacionMinima, elevacion))

  const enderezado = Math.max(0, Math.abs(torcido) - NIVELADO_POR_PIXEL * Math.hypot(dxPx, dyPx))
  const torcidoNuevo = Math.sign(torcido) * enderezado
  const direccion = unitario(suma(escala(horizontalNueva, Math.cos(elevacionNueva)), escala(vertical, Math.sin(elevacionNueva))))
  const arriba = girarAlrededor(arribaANivel(vertical, horizontalNueva, elevacionNueva), direccion, torcidoNuevo)
  return ortogonalizar({ direccion, arriba })
}

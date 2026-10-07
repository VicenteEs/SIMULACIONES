/**
 * Manipular piezas y fragmentos con el ratón, a la manera de PowerPoint (D-160, E3).
 *
 * Aquí está solo la cuenta, igual que en `transformar.ts`: de un arrastre en la
 * pantalla a un desplazamiento o un giro en el espacio del atlas, de los ejes de
 * un hueso a un marco para el manipulador, y de dos fragmentos a las cifras con
 * que habla un traumatólogo («8 mm lateral · 10° varo»). Quién escucha el ratón
 * y quién pinta está en `VisorAtlas.tsx`; separado así se prueba sin lienzo
 * (`tests/unit/manipular.test.ts`).
 *
 * Tres ideas mandan:
 *
 * 1. **La pieza sigue al cursor.** Arrastrar no mide píxeles y los multiplica por
 *    una escala: cruza el rayo del cursor con el plano que pasa por el punto
 *    pinchado y es perpendicular a la cámara. Con perspectiva, el punto bajo el
 *    dedo sigue bajo el dedo; con la escala por píxel, se adelantaba o se quedaba
 *    atrás según la profundidad.
 * 2. **Los giros no pasan por ángulos de Euler.** Un fragmento se gira con
 *    cuaterniones y se lee con la descomposición en balanceo y torsión sobre su
 *    propio eje largo. Con Euler, 80° de rotación en un eje llevan a otro al
 *    bloqueo de cardán y las tres cifras dejan de significar lo que dicen (D-133).
 * 3. **Todo gesto parte de lo que había al empezar**, no del fotograma anterior:
 *    sumando incrementos el error de cada `pointermove` se acumulaba.
 */

import * as THREE from 'three'
import type { TransformacionDePieza } from './cargador'
import type { LecturaClinica } from './lecturaClinica'
import type { EjeDelGesto } from './transformar'

export { LECTURA_NULA, cifra, describirLectura, type LecturaClinica } from './lecturaClinica'

/** Tres ejes ortonormales: los del mundo, o los de un hueso. */
export interface EjesLocales {
  x: THREE.Vector3
  y: THREE.Vector3
  z: THREE.Vector3
}

export const EJES_DEL_MUNDO: Readonly<EjesLocales> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

/** El eje con nombre, sea del mundo o de un hueso. */
export function ejeDe(eje: EjeDelGesto, ejes: Readonly<EjesLocales> = EJES_DEL_MUNDO): THREE.Vector3 {
  return ejes[eje]
}

/** Los tres ejes de un hueso como los entrega `ejeDelHueso`, en el espacio del atlas. */
export interface EjesDeUnHueso {
  /** De proximal a distal. */
  largo: readonly [number, number, number]
  /** Hacia delante del cuerpo, perpendicular al largo. */
  delante: readonly [number, number, number]
  /** Hacia fuera del cuerpo en su lado (lateral), perpendicular a los dos. */
  fuera: readonly [number, number, number]
}

const aVector = (v: readonly [number, number, number]) => new THREE.Vector3(v[0], v[1], v[2])

/**
 * El marco del manipulador para un hueso: X hacia fuera (lateral), Y hacia
 * proximal —arriba, como el Y del mundo con el paciente de pie— y Z el que
 * completa una mano derecha.
 *
 * El tercer eje se calcula y no se copia de `delante`: `ejeDelHueso` orienta
 * `fuera` según el lado del cuerpo para que «fuera» sea lateral en las dos
 * piernas, y con eso la terna `(fuera, largo, delante)` es de mano derecha en un
 * lado y de mano izquierda en el otro. Un cuaternión no puede representar una
 * terna de mano izquierda, y el manipulador saldría reflejado.
 */
export function marcoDelHueso(ejes: EjesDeUnHueso): EjesLocales {
  const x = aVector(ejes.fuera).normalize()
  const y = aVector(ejes.largo).negate().normalize()
  const z = new THREE.Vector3().crossVectors(x, y).normalize()
  return { x, y, z }
}

/** La orientación que lleva los ejes del mundo a un marco, para colocar el manipulador. */
export function cuaternionDelMarco(marco: Readonly<EjesLocales>): THREE.Quaternion {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(marco.x, marco.y, marco.z))
}

// ---------------------------------------------------------------- arrastrar

/**
 * El rayo que sale de la cámara por un punto de la pantalla, con el punto en
 * píxeles del lienzo. Sin `Raycaster`: aquí solo hace falta el rayo.
 */
export function rayoDelPuntero(
  camara: THREE.PerspectiveCamera,
  x: number,
  y: number,
  ancho: number,
  alto: number,
): THREE.Ray {
  const ndc = new THREE.Vector3((x / Math.max(1, ancho)) * 2 - 1, -(y / Math.max(1, alto)) * 2 + 1, 0.5)
  ndc.unproject(camara)
  const origen = camara.getWorldPosition(new THREE.Vector3())
  return new THREE.Ray(origen, ndc.sub(origen).normalize())
}

/**
 * Cuánto hay que mover lo pinchado para que siga bajo el cursor: el rayo de
 * ahora cruza el plano que pasa por `agarre` y mira a la cámara; el
 * desplazamiento es de `agarre` a ese cruce.
 *
 * Devuelve cero si el rayo va paralelo al plano (no ocurre con una cámara de
 * perspectiva salvo en el borde del campo, y moverse a ciegas no sirve).
 */
export function desplazamientoEnElPlano(
  camara: THREE.PerspectiveCamera,
  agarre: THREE.Vector3,
  rayo: THREE.Ray,
): THREE.Vector3 {
  const haciaDelante = camara.getWorldDirection(new THREE.Vector3())
  const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(haciaDelante, agarre)
  const cruce = rayo.intersectPlane(plano, new THREE.Vector3())
  return cruce ? cruce.sub(agarre) : new THREE.Vector3()
}

/**
 * Lo mínimo que tiene que verse de un eje en la pantalla para poder atarse a
 * él: un eje que apunta casi a la cámara se ve como un punto, y arrastrar «a lo
 * largo» de él mandaría la pieza a kilómetros por un píxel de gesto.
 */
const VISTO_MINIMO = 0.2

/**
 * Ata un desplazamiento al eje cuya imagen en pantalla más se parece a la
 * dirección del gesto (Mayús + arrastre).
 *
 * `libre` ya está en el plano de la cámara. De cada eje se toma su imagen en ese
 * plano y se queda el que forma el menor ángulo con el gesto; el desplazamiento
 * es entonces el que, proyectado, deja la pieza lo más cerca posible del cursor
 * a lo largo de ese eje. Un gesto sin largo no ata a nada.
 */
export function atarAlEjeMasCercano(
  camara: THREE.PerspectiveCamera,
  libre: THREE.Vector3,
  ejes: Readonly<EjesLocales>,
): { desplazamiento: THREE.Vector3; eje: EjeDelGesto | null } {
  if (libre.length() < 1e-9) return { desplazamiento: libre.clone(), eje: null }
  const haciaDelante = camara.getWorldDirection(new THREE.Vector3())
  const gesto = libre.clone().normalize()
  let mejor: { eje: EjeDelGesto; coseno: number; imagen: THREE.Vector3 } | null = null
  for (const eje of ['x', 'y', 'z'] as const) {
    const a = ejes[eje]
    const imagen = a.clone().addScaledVector(haciaDelante, -a.dot(haciaDelante))
    const visto = imagen.length()
    if (visto < VISTO_MINIMO) continue
    const coseno = Math.abs(imagen.clone().divideScalar(visto).dot(gesto))
    if (!mejor || coseno > mejor.coseno) mejor = { eje, coseno, imagen }
  }
  if (!mejor) return { desplazamiento: libre.clone(), eje: null }
  const a = ejes[mejor.eje]
  const t = libre.dot(mejor.imagen) / mejor.imagen.lengthSq()
  return { desplazamiento: a.clone().multiplyScalar(t), eje: mejor.eje }
}

// ------------------------------------------------------------------- girar

/** Grados que gira la pieza por cada píxel que se arrastra con Alt (trackball). */
export const GRADOS_POR_PIXEL = 0.45

/**
 * El giro de arrastrar con Alt sobre la pieza, libre, como una bola: el
 * movimiento horizontal gira sobre el eje vertical de la pantalla y el vertical,
 * sobre su eje horizontal. Con los signos puestos para que la cara que mira al
 * usuario siga al cursor.
 */
export function giroLibre(camara: THREE.PerspectiveCamera, dx: number, dy: number): THREE.Quaternion {
  const derecha = new THREE.Vector3().setFromMatrixColumn(camara.matrixWorld, 0).normalize()
  const arriba = new THREE.Vector3().setFromMatrixColumn(camara.matrixWorld, 1).normalize()
  const k = (GRADOS_POR_PIXEL * Math.PI) / 180
  const sobreArriba = new THREE.Quaternion().setFromAxisAngle(arriba, dx * k)
  const sobreDerecha = new THREE.Quaternion().setFromAxisAngle(derecha, dy * k)
  return sobreArriba.multiply(sobreDerecha)
}

/** Cuánto salta un giro con Ctrl pulsado, en grados. */
export const PASO_DE_GIRO = 5

/** Un ángulo, en radianes, redondeado al paso más cercano. */
export function saltoDeAngulo(radianes: number, pasoEnGrados = PASO_DE_GIRO): number {
  const paso = (pasoEnGrados * Math.PI) / 180
  return Math.round(radianes / paso) * paso
}

/**
 * Un giro cuyo ángulo se redondea al paso, conservando el eje. Sirve para el
 * giro libre, donde no hay un ángulo del que partir.
 */
export function girarEnSaltos(giro: THREE.Quaternion, pasoEnGrados = PASO_DE_GIRO): THREE.Quaternion {
  const w = Math.min(1, Math.abs(giro.w))
  const angulo = 2 * Math.acos(w)
  const s = Math.sqrt(Math.max(0, 1 - w * w))
  if (s < 1e-9 || angulo < 1e-9) return new THREE.Quaternion()
  const signo = giro.w < 0 ? -1 : 1
  const eje = new THREE.Vector3(giro.x, giro.y, giro.z).multiplyScalar(signo / s)
  return new THREE.Quaternion().setFromAxisAngle(eje, saltoDeAngulo(angulo, pasoEnGrados))
}

// ------------------------------------------------------------------- pivote

/**
 * Dónde está AHORA un punto que pertenece a un fragmento: el punto se mueve con
 * el fragmento, que gira sobre su propio centro y después se desplaza.
 */
export function puntoActual(
  centro: THREE.Vector3,
  punto: THREE.Vector3,
  transformacion: TransformacionDePieza | undefined | null,
): THREE.Vector3 {
  if (!transformacion) return punto.clone()
  const giro = new THREE.Quaternion(...transformacion.girar)
  return punto
    .clone()
    .sub(centro)
    .applyQuaternion(giro)
    .add(centro)
    .add(new THREE.Vector3(...transformacion.mover))
}

/**
 * El centro de la tapa de un corte: el punto medio de los vértices que quedan
 * sobre el plano.
 *
 * Es sobre lo que gira un fragmento por omisión: reducir una fractura es girar
 * el fragmento sobre el foco, no sobre el centro de su caja, que para un trozo
 * largo está a decenas de milímetros y convierte cada grado en un
 * desplazamiento. `null` si ningún vértice está en el plano (un corte que no
 * dejó tapa, o el de un marco con varios planos).
 *
 * `holgura` en metros: lo que puede separarse del plano un vértice y contar como
 * tapa. Los vértices que `partirMalla` crea sobre el corte caen en él a un error
 * de coma flotante; diez micras sobran.
 */
export function focoDeLaTapa(
  posiciones: ArrayLike<number>,
  punto: readonly [number, number, number],
  normal: readonly [number, number, number],
  holgura = 1e-5,
): THREE.Vector3 | null {
  const n = new THREE.Vector3(...normal).normalize()
  const suma = new THREE.Vector3()
  let cuantos = 0
  for (let i = 0; i + 2 < posiciones.length; i += 3) {
    const d =
      (posiciones[i] - punto[0]) * n.x + (posiciones[i + 1] - punto[1]) * n.y + (posiciones[i + 2] - punto[2]) * n.z
    if (Math.abs(d) > holgura) continue
    suma.x += posiciones[i]
    suma.y += posiciones[i + 1]
    suma.z += posiciones[i + 2]
    cuantos += 1
  }
  return cuantos > 0 ? suma.divideScalar(cuantos) : null
}

// ----------------------------------------------------------- lectura clínica

const aGrados = (r: number) => (r * 180) / Math.PI

/** Un ángulo en (−180°, 180°]. */
function normalizarGrados(g: number): number {
  const v = (((g % 360) + 540) % 360) - 180
  return v === -180 ? 180 : v
}

/**
 * Cuánto está desplazado y angulado un fragmento distal respecto del proximal.
 *
 * `distal` y `proximal` son las transformaciones de cada uno (`null`: en su
 * sitio) y `focoDistal` y `focoProximal`, el punto de cada uno que en el hueso
 * entero era el mismo —el centro de la tapa del corte—. Reducido, los dos focos
 * coinciden y los dos giros son uno; cualquier separación entre ellos es el
 * desplazamiento, y el giro del distal visto desde el proximal es la angulación.
 * Sin focos (un trozo de marco) se miden los centros.
 *
 * La angulación sale de dónde apunta el eje largo del distal después del giro
 * relativo; la rotación, de la torsión sobre ese eje. Ninguna pasa por ángulos
 * de Euler. Valen igual cuando se mueve el proximal y el distal queda quieto:
 * lo que se lee es la posición relativa, no quién se movió.
 */
export function leerReduccion(
  ejes: EjesDeUnHueso,
  distal: TransformacionDePieza | null | undefined,
  proximal: TransformacionDePieza | null | undefined,
  centros: { distal: THREE.Vector3; proximal: THREE.Vector3 },
  focos: { distal: THREE.Vector3; proximal: THREE.Vector3 } | null = null,
): LecturaClinica {
  const largo = aVector(ejes.largo).normalize()
  const delante = aVector(ejes.delante).normalize()
  const fuera = aVector(ejes.fuera).normalize()

  const qDistal = new THREE.Quaternion(...(distal?.girar ?? [0, 0, 0, 1]))
  const qProximal = new THREE.Quaternion(...(proximal?.girar ?? [0, 0, 0, 1]))
  // Lo que el distal se ha movido de más respecto de como el proximal lo lleva.
  const relativo = qDistal.clone().multiply(qProximal.clone().invert()).normalize()

  const donde = focos ?? centros
  const pd = puntoActual(centros.distal, donde.distal, distal)
  const pp = puntoActual(centros.proximal, donde.proximal, proximal)
  // Sin foco, la diferencia de centros en reposo no es cero: se resta lo que ya había.
  const enReposo = donde.distal.clone().sub(donde.proximal)
  const separacion = pd.sub(pp).sub(enReposo)

  const apunta = largo.clone().applyQuaternion(relativo)

  // Torsión sobre el largo: la parte del giro que no cambia hacia dónde apunta el eje.
  const dot = relativo.x * largo.x + relativo.y * largo.y + relativo.z * largo.z
  const torsion = 2 * Math.atan2(dot, relativo.w)
  // La rotación se cuenta hacia fuera del cuerpo en cada lado: el sentido de la
  // regla de la mano derecha sobre el largo es hacia fuera en un lado y hacia
  // dentro en el otro, y `fuera` ya sabe cuál es cuál.
  const signoDelLado = Math.sign(new THREE.Vector3().crossVectors(largo, delante).dot(fuera)) || 1

  return {
    lateral: separacion.dot(fuera) * 1000,
    anteroposterior: separacion.dot(delante) * 1000,
    axial: separacion.dot(largo) * 1000,
    valgo: aGrados(Math.atan2(apunta.dot(fuera), apunta.dot(largo))),
    recurvatum: aGrados(Math.atan2(apunta.dot(delante), apunta.dot(largo))),
    rotacion: normalizarGrados(aGrados(torsion)) * signoDelLado,
  }
}

/**
 * De dos fragmentos hermanos, cuál es el distal: el que cae más hacia donde
 * apunta el largo del hueso. Un marco o una línea de corte no dicen qué lado es
 * proximal, y `lado` `a` o `b` no es una respuesta.
 */
export function distalDeLosDos(
  ejes: EjesDeUnHueso,
  centroDelHueso: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
): 'a' | 'b' {
  const largo = aVector(ejes.largo)
  return a.clone().sub(centroDelHueso).dot(largo) >= b.clone().sub(centroDelHueso).dot(largo) ? 'a' : 'b'
}

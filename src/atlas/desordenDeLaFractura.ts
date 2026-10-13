/**
 * El desorden con que nace una fractura en el taller anatómico (petición de Cristóbal).
 *
 * Al pulsar «Fracturar», los fragmentos aparecían todos en su sitio, como si el hueso
 * solo tuviera una grieta: no se parecía a una fractura. Una de verdad tiene los
 * fragmentos intermedios corridos y torcidos. Ahora, al fracturar:
 *
 * - **Con tres o más fragmentos**, los **intermedios** (todos menos los dos extremos del
 *   hueso, el proximal y el distal, que se quedan donde están) se desplazan al azar entre
 *   0,5 mm y 2 cm y se angulan entre 5° y 20°.
 * - **Con solo dos**, no hay intermedios: se angula **el más pequeño**, entre 5° y 20°,
 *   girándolo sobre el foco de la fractura —el centro de la cara por la que se rompió—, para
 *   que siga apoyado en el otro y no se despegue como si girara en el aire.
 *
 * Los extremos no se mueven porque son los que fijan «dónde está el hueso»: lo que se
 * reduce después se mide contra ellos.
 *
 * Es una cuenta: recibe los fragmentos medidos por el visor y devuelve la transformación
 * de cada uno. El azar se le pasa, para que las pruebas lo fijen y para que quien quiera
 * una fractura repetible (una receta con su semilla) la tenga.
 */

import * as THREE from 'three'
import type { EjeDelHueso } from '@/lib/planoDeCorte'
import type { TransformacionDePieza } from './cargador'

/** 0,5 mm, en metros: lo mínimo que se nota al mirar el modelo. */
export const DESPLAZAMIENTO_MINIMO_M = 0.0005
/** 2 cm, en metros: más es un hueso que ya no se reconoce. */
export const DESPLAZAMIENTO_MAXIMO_M = 0.02
export const ANGULO_MINIMO_GRADOS = 5
export const ANGULO_MAXIMO_GRADOS = 20

/** Un fragmento tal como lo mide el visor, en el sitio anatómico y en metros. */
export interface TrozoParaDesordenar {
  id: string
  centro: [number, number, number]
  /** El centro de la tapa del corte, si el trozo nació de un solo plano. */
  foco: [number, number, number] | null
  /** Cuánto es de grande, en lo que sea con tal de que sea comparable entre trozos. */
  tamano: number
}

const vec = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2])

/**
 * Un vector unitario al azar, perpendicular al eje del hueso con una inclinación hacia
 * él de hasta `inclinacionMaxima` grados: desplazar o torcer un fragmento de lado es lo
 * que hace una fractura, y hacerlo a lo largo del eje solo acorta o alarga.
 */
function direccionAlAzar(eje: THREE.Vector3, azar: () => number, inclinacionMaxima: number): THREE.Vector3 {
  // Una base perpendicular al eje.
  const auxiliar = Math.abs(eje.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(eje, auxiliar).normalize()
  const v = new THREE.Vector3().crossVectors(eje, u).normalize()
  const vuelta = azar() * Math.PI * 2
  const lateral = u.multiplyScalar(Math.cos(vuelta)).addScaledVector(v, Math.sin(vuelta))
  const inclinacion = ((azar() * 2 - 1) * inclinacionMaxima * Math.PI) / 180
  return lateral.multiplyScalar(Math.cos(inclinacion)).addScaledVector(eje, Math.sin(inclinacion)).normalize()
}

/** Un ángulo entre el mínimo y el máximo, en radianes. */
const anguloAlAzar = (azar: () => number): number =>
  ((ANGULO_MINIMO_GRADOS + azar() * (ANGULO_MAXIMO_GRADOS - ANGULO_MINIMO_GRADOS)) * Math.PI) / 180

/**
 * La distancia de un desplazamiento: entre el mínimo y el máximo, con más peso en lo corto.
 *
 * Uniforme, tres de cada cuatro desplazamientos pasaban de 1 cm, y una fractura con todos
 * los trozos a un centímetro del sitio se lee como un hueso explotado. Elevando el azar al
 * cuadrado se cubre el rango entero y lo corto es lo corriente.
 */
const distanciaAlAzar = (azar: () => number): number => {
  const u = azar()
  return DESPLAZAMIENTO_MINIMO_M + (DESPLAZAMIENTO_MAXIMO_M - DESPLAZAMIENTO_MINIMO_M) * u * u
}

/**
 * La transformación de cada fragmento que hay que mover. Los que no aparecen se quedan en
 * su sitio. Con menos de dos fragmentos no hay fractura que desordenar y sale vacío.
 */
export function desordenarLosFragmentos(
  trozos: readonly TrozoParaDesordenar[],
  eje: EjeDelHueso,
  azar: () => number = Math.random,
): Map<string, TransformacionDePieza> {
  const salida = new Map<string, TransformacionDePieza>()
  if (trozos.length < 2) return salida
  const direccion = vec(eje.direccion).normalize()
  const origen = vec(eje.centro)
  const alLargo = (t: TrozoParaDesordenar) => vec(t.centro).sub(origen).dot(direccion)

  if (trozos.length === 2) {
    // El más pequeño se angula sobre el foco de la fractura, sin desplazarse.
    const [a, b] = trozos
    const pequeno = a.tamano <= b.tamano ? a : b
    const centro = vec(pequeno.centro)
    // Sin foco (el trozo no nació de un solo plano) gira sobre su centro: es lo único que se sabe.
    const pivote = pequeno.foco ? vec(pequeno.foco) : centro.clone()
    const giro = new THREE.Quaternion().setFromAxisAngle(direccionAlAzar(direccion, azar, 0), anguloAlAzar(azar))
    const nuevoCentro = centro.clone().sub(pivote).applyQuaternion(giro).add(pivote)
    salida.set(pequeno.id, {
      mover: [nuevoCentro.x - centro.x, nuevoCentro.y - centro.y, nuevoCentro.z - centro.z],
      girar: [giro.x, giro.y, giro.z, giro.w],
    })
    return salida
  }

  // Tres o más: los dos extremos (el más proximal y el más distal) no se tocan, y el resto sí.
  const ordenados = [...trozos].sort((a, b) => alLargo(a) - alLargo(b))
  const intermedios = ordenados.slice(1, -1)
  for (const t of intermedios) {
    const desplazamiento = direccionAlAzar(direccion, azar, 30).multiplyScalar(distanciaAlAzar(azar))
    // El eje del giro es perpendicular al del hueso: es una angulación (varo, valgo, antecurvatum),
    // no una rotación sobre sí mismo, que se leería como un hueso que gira en el sitio.
    const ejeDelGiro = direccionAlAzar(direccion, azar, 0)
    const giro = new THREE.Quaternion().setFromAxisAngle(ejeDelGiro, anguloAlAzar(azar))
    salida.set(t.id, {
      mover: [desplazamiento.x, desplazamiento.y, desplazamiento.z],
      girar: [giro.x, giro.y, giro.z, giro.w],
    })
  }
  return salida
}

/** El ángulo de una transformación, en grados: lo que las pruebas y el aviso comparan. */
export function anguloDeLaTransformacion(t: TransformacionDePieza): number {
  const w = Math.min(1, Math.max(-1, Math.abs(t.girar[3])))
  return (2 * Math.acos(w) * 180) / Math.PI
}

/** La longitud del desplazamiento de una transformación, en metros. */
export const distanciaDeLaTransformacion = (t: TransformacionDePieza): number =>
  Math.hypot(t.mover[0], t.mover[1], t.mover[2])

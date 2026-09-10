import * as THREE from 'three'

/**
 * La aritmética del encuadre de un modelo 3D.
 *
 * Está aparte del visor porque es la parte que puede estar mal sin que se note:
 * un signo cambiado da un encuadre que parece razonable en el editor y enseña
 * el hueso del revés cuando el residente abre la ficha. Aquí se puede probar
 * sin navegador y sin lienzo.
 */

export interface Encuadre {
  escala?: number
  giroX?: number
  giroY?: number
  giroZ?: number
  distanciaCamara?: number
}

/** Ángulo de visión de la cámara, en grados. Lo comparten visor y cálculos. */
export const CAMPO_DE_VISION = 45

const EJE_Z = new THREE.Vector3(0, 0, 1)
const aGrados = (radianes: number) => Math.round((radianes * 180) / Math.PI)
const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * El encuadre que reproduce, desde la cámara frontal, lo que se ve ahora.
 *
 * El residente siempre mira desde el eje Z; lo que se guarda es cómo hay que
 * girar el modelo para que, mirado desde ahí, se vea como el traumatólogo lo
 * dejó.
 *
 * Girar el mundo entero con un cuaternión Q lleva la dirección de vista a
 * Q·dirección y la rotación del modelo a Q·rotación. Tomando Q como el giro que
 * lleva la dirección actual al eje Z, la vista pasa a ser la frontal y al
 * modelo le corresponde Q·rotación_actual. Se hace así, y no con ángulos
 * esféricos escritos a mano, porque las convenciones de signo se equivocan
 * solas y el error sería invisible hasta que alguien abriera la ficha.
 */
export function encuadreCapturado({
  posicionCamara,
  objetivo,
  rotacionActual,
  escala,
}: {
  posicionCamara: THREE.Vector3
  objetivo: THREE.Vector3
  /** Rotación que el modelo tiene puesta ahora mismo. */
  rotacionActual: THREE.Quaternion
  escala: number
}): Required<Encuadre> {
  const direccion = posicionCamara.clone().sub(objetivo).normalize()
  const giroAFrontal = new THREE.Quaternion().setFromUnitVectors(direccion, EJE_Z)
  const nueva = giroAFrontal.multiply(rotacionActual.clone())
  const euler = new THREE.Euler().setFromQuaternion(nueva, 'XYZ')

  return {
    escala,
    giroX: aGrados(euler.x),
    giroY: aGrados(euler.y),
    giroZ: aGrados(euler.z),
    distanciaCamara: redondear(posicionCamara.distanceTo(objetivo)),
  }
}

/**
 * Escala y distancia con las que un modelo se ve entero, venga en la unidad que
 * venga.
 *
 * Una malla salida de una segmentación puede estar en milímetros y otra en
 * metros: sin esto, la mitad de los modelos aparecen como un punto y la otra
 * mitad llenan la pantalla desde dentro. Se lleva el radio a uno y se pone la
 * cámara a la distancia justa para que una esfera de radio uno quepa en el
 * ángulo de visión, con un margen para no rozar los bordes.
 */
export function encuadreQueLoAbarca(radio: number): Pick<Encuadre, 'escala' | 'distanciaCamara'> | null {
  if (!Number.isFinite(radio) || radio <= 0) return null
  const distancia = (1 / Math.sin((CAMPO_DE_VISION * Math.PI) / 360)) * 1.15
  return {
    // La escala se redondea a cifras significativas y no a decimales. Un
    // modelo en milímetros necesita una escala de 0,002, y redondeado a dos
    // decimales eso es cero: el modelo desaparecía, y el botón que existe
    // precisamente para hacerlo visible lo hacía invisible.
    escala: Number((1 / radio).toPrecision(4)),
    distanciaCamara: redondear(distancia),
  }
}

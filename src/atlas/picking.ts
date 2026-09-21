'use client'

/**
 * Señalar una pieza con el ratón.
 *
 * El cuerpo entero tiene 2,29 millones de triángulos repartidos en quince
 * mallas fusionadas. Preguntarle a three.js «¿qué hay bajo el cursor?» le hace
 * recorrerlos todos en el hilo principal, y eso convierte el gesto más
 * frecuente del taller —hacer clic en una pieza para quitarla— en medio segundo
 * de congelación.
 *
 * Aquí se hace en dos etapas:
 *
 *   1. Se cruza el rayo contra la **caja envolvente** de cada pieza visible.
 *      Son 2.234 comparaciones aritméticas, sin tocar geometría, y dejan dos o
 *      tres candidatas.
 *   2. Solo a esas se les miran los triángulos, usando el rango que el cargador
 *      anotó al fusionar.
 *
 * El resultado es el mismo que el del método directo; el coste, dos órdenes de
 * magnitud menor.
 */

import * as THREE from 'three'
import type { CatalogoDelAtlas } from './formato'
import { ESTADO, estaEnSuSitio, type EscenaDelAtlas } from './cargador'

const cajaAuxiliar = new THREE.Box3()
const puntoAuxiliar = new THREE.Vector3()
const a = new THREE.Vector3()
const b = new THREE.Vector3()
const c = new THREE.Vector3()
const desplazamiento = new THREE.Vector3()
const rayoLocal = new THREE.Ray()
const giroInverso = new THREE.Quaternion()

/**
 * El rayo visto desde el sitio anatómico de la pieza.
 *
 * Una pieza movida o girada (D-129) no está donde dicen su caja ni sus
 * vértices: la mueve el sombreador. En vez de transformar la caja y cada
 * triángulo, se le aplica al rayo la transformación INVERSA y se cruza contra
 * la geometría en reposo, que es la que hay en memoria. Como la transformación
 * es rígida, las distancias a lo largo del rayo son las mismas en los dos
 * espacios y se pueden comparar entre piezas sin corregir nada.
 *
 * Con el cuerpo separado Y la pieza girada a la vez, esto se equivoca por poco:
 * el sombreador separa después de girar, y aquí la separación se suma a la
 * geometría en reposo, antes. Se deja así a sabiendas: el mando de separación
 * se retiró (D-125) y las dos cosas ya no coinciden en ninguna preparación.
 *
 * Para la pieza que está en su sitio —casi todas, casi siempre— devuelve el
 * mismo rayo y no cuesta más que cuatro comparaciones.
 */
function rayoParaLaPieza(rayo: THREE.Ray, escena: EscenaDelAtlas, indice: number): THREE.Ray {
  // Las escenas de algunas pruebas son anteriores a las transformaciones.
  if (!escena.datosDeGiros || estaEnSuSitio(escena, indice)) return rayo
  const base = indice * 4
  giroInverso
    .set(
      escena.datosDeGiros[base],
      escena.datosDeGiros[base + 1],
      escena.datosDeGiros[base + 2],
      escena.datosDeGiros[base + 3],
    )
    .invert()
  rayoLocal.origin
    .copy(rayo.origin)
    .sub(
      desplazamiento.set(
        escena.datosDeTraslados[base],
        escena.datosDeTraslados[base + 1],
        escena.datosDeTraslados[base + 2],
      ),
    )
    .applyQuaternion(giroInverso)
  rayoLocal.direction.copy(rayo.direction).applyQuaternion(giroInverso)
  return rayoLocal
}

interface Candidata {
  indice: number
  distancia: number
}

/**
 * Devuelve el índice de la pieza bajo el rayo, o −1.
 *
 * `separacion` importa: con el cuerpo separado, las piezas ya no están donde
 * dice su caja original, así que hay que desplazarla lo mismo que se desplazó
 * la geometría en el sombreador.
 */
export function piezaBajoElRayo(
  rayo: THREE.Raycaster,
  catalogo: CatalogoDelAtlas,
  escena: EscenaDelAtlas,
  separacion = 0,
): number {
  // --- etapa 1: cajas ------------------------------------------------------
  const candidatas: Candidata[] = []

  for (const indice of escena.rangos.keys()) {
    if (escena.datos[indice * 4 + 3] < ESTADO.VISIBLE) continue

    const pieza = catalogo.piezas[indice]
    const [min, max] = pieza.caja
    cajaAuxiliar.min.set(min[0], min[1], min[2])
    cajaAuxiliar.max.set(max[0], max[1], max[2])

    if (separacion > 0) {
      desplazamiento.set(
        escena.datos[indice * 4],
        escena.datos[indice * 4 + 1],
        escena.datos[indice * 4 + 2],
      )
      cajaAuxiliar.translate(desplazamiento.multiplyScalar(separacion))
    }

    // Después de la separación, que usa `desplazamiento` como auxiliar igual
    // que esta función.
    const suRayo = rayoParaLaPieza(rayo.ray, escena, indice)
    if (suRayo.intersectBox(cajaAuxiliar, puntoAuxiliar)) {
      // Con el origen del rayo dentro de la caja, `intersectBox` no devuelve la
      // entrada sino la SALIDA —three hace `this.at(tmin >= 0 ? tmin : tmax)`, y
      // con la cámara dentro `tmin` es negativo—, y esa distancia no acota por
      // abajo el impacto real: es mayor, a veces por decenas de centímetros. La
      // candidata se ordenaba entonces la última y el corte de la etapa 2 la
      // descartaba sin mirarle un triángulo. Pasa de verdad: `minDistance` son
      // 0,1 m y la caja del fémur mide 0,118 × 0,466 × 0,063, así que mirar la
      // diáfisis de cerca mete el ojo dentro del hueso y se señalaba el músculo
      // de al lado. Dentro de la caja la cota inferior correcta es 0.
      const distancia = cajaAuxiliar.containsPoint(suRayo.origin)
        ? 0
        : suRayo.origin.distanceTo(puntoAuxiliar)
      candidatas.push({ indice, distancia })
    }
  }

  if (candidatas.length === 0) return -1
  // De cerca a lejos: casi siempre acierta la primera y se puede parar.
  candidatas.sort((x, y) => x.distancia - y.distancia)

  // --- etapa 2: triángulos de las candidatas -------------------------------
  let mejor = -1
  let masCerca = Infinity

  for (const candidata of candidatas) {
    // Una caja más lejana que el mejor impacto real no puede contener nada más
    // cercano: se corta aquí.
    if (candidata.distancia > masCerca) break

    const distancia = distanciaAPieza(rayo, escena, candidata.indice, separacion)
    if (distancia !== null && distancia < masCerca) {
      masCerca = distancia
      mejor = candidata.indice
    }
  }

  return mejor
}

/** Distancia al triángulo más cercano de una pieza, o null si el rayo no la toca. */
function distanciaAPieza(
  rayo: THREE.Raycaster,
  escena: EscenaDelAtlas,
  indice: number,
  separacion: number,
): number | null {
  const rango = escena.rangos.get(indice)
  if (!rango) return null

  const malla = escena.mallas[rango.malla]
  const geometria = malla.geometry
  const posiciones = geometria.getAttribute('position') as THREE.BufferAttribute
  const orden = geometria.getIndex()
  if (!orden) return null

  desplazamiento.set(0, 0, 0)
  if (separacion > 0) {
    desplazamiento
      .set(
        escena.datos[indice * 4],
        escena.datos[indice * 4 + 1],
        escena.datos[indice * 4 + 2],
      )
      .multiplyScalar(separacion)
  }

  // Se copia: `rayoParaLaPieza` y el bloque de arriba comparten auxiliar, y el
  // rayo local tiene que sobrevivir al bucle.
  const separada = desplazamiento.clone()
  const suRayo = rayoParaLaPieza(rayo.ray, escena, indice)

  let masCerca: number | null = null
  const fin = rango.inicio + rango.cuenta

  for (let i = rango.inicio; i < fin; i += 3) {
    a.fromBufferAttribute(posiciones, orden.getX(i)).add(separada)
    b.fromBufferAttribute(posiciones, orden.getX(i + 1)).add(separada)
    c.fromBufferAttribute(posiciones, orden.getX(i + 2)).add(separada)

    // Las dos caras, con una sola llamada.
    //
    // El `false` es el descarte de caras traseras, y desactivarlo es lo que ya
    // cubre las dos orientaciones: three calcula la normal del triángulo y
    // acepta el rayo venga por donde venga. Aquí se llamaba además con los
    // vértices intercambiados, creyendo cubrir así la cara de dentro; esa
    // segunda llamada no podía acertar nunca cuando la primera fallaba, porque
    // invertir dos vértices invierte la normal y con ella el signo, los dos
    // cambios se cancelan en los coeficientes baricéntricos y las tres pruebas
    // de dentro-del-triángulo son simétricas. Era aritmética tirada en cada
    // triángulo que no acierta, que son casi todos, dentro del bucle más
    // caliente del visor.
    if (!suRayo.intersectTriangle(a, b, c, false, puntoAuxiliar)) continue

    const distancia = suRayo.origin.distanceTo(puntoAuxiliar)
    if (masCerca === null || distancia < masCerca) masCerca = distancia
  }

  return masCerca
}

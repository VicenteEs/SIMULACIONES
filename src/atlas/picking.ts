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
import { ESTADO, type EscenaDelAtlas } from './cargador'

const cajaAuxiliar = new THREE.Box3()
const puntoAuxiliar = new THREE.Vector3()
const a = new THREE.Vector3()
const b = new THREE.Vector3()
const c = new THREE.Vector3()
const desplazamiento = new THREE.Vector3()

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

  for (const [indice, rango] of escena.rangos) {
    if (escena.datos[indice * 4 + 3] < ESTADO.VISIBLE) continue
    void rango

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

    if (rayo.ray.intersectBox(cajaAuxiliar, puntoAuxiliar)) {
      candidatas.push({ indice, distancia: rayo.ray.origin.distanceTo(puntoAuxiliar) })
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

  let masCerca: number | null = null
  const fin = rango.inicio + rango.cuenta

  for (let i = rango.inicio; i < fin; i += 3) {
    a.fromBufferAttribute(posiciones, orden.getX(i)).add(desplazamiento)
    b.fromBufferAttribute(posiciones, orden.getX(i + 1)).add(desplazamiento)
    c.fromBufferAttribute(posiciones, orden.getX(i + 2)).add(desplazamiento)

    // Las dos caras: el material dibuja a doble cara, así que una pieza vista
    // desde dentro —una arteria seccionada, la cavidad de un hueso— tiene que
    // poder señalarse igual.
    const impacto =
      rayo.ray.intersectTriangle(a, b, c, false, puntoAuxiliar) ??
      rayo.ray.intersectTriangle(a, c, b, false, puntoAuxiliar)
    if (!impacto) continue

    const distancia = rayo.ray.origin.distanceTo(puntoAuxiliar)
    if (masCerca === null || distancia < masCerca) masCerca = distancia
  }

  return masCerca
}

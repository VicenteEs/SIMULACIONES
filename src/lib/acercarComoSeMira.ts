/**
 * Acercar como se mira (P-012 E5): la rueda, el doble clic y «Encuadrar la herida».
 *
 * En la auditoría (P-010) hicieron falta 25 vueltas de rueda para pasar de la pierna entera a una vista en la que trazar
 * 10 cm de incisión, y eran dos cosas a la vez. La rueda de `OrbitControls` acerca un 5 % por muesca, y lo hace hacia el
 * punto al que mira la cámara, que al cargar es el centro de la pierna: lo que se quería ver de cerca se iba saliendo del
 * lienzo mientras se acercaba, y había que desplazar la vista y volver a acercar.
 *
 * Ahora cada muesca acerca un 15 % hacia **lo que hay bajo el cursor**. Es una homotecia con centro en ese punto de la
 * superficie: el punto se queda quieto en la pantalla, la cámara y el punto que mira se le acercan en la misma proporción,
 * y la distancia baja en proporción a la que hay —mucho de lejos, poco de cerca—, de modo que se llega pronto y no se
 * atraviesa la piel, porque nunca se pasa de `MAS_CERCA_MM`. Las 25 muescas de la auditoría (0,95²⁵ = 0,28 de la
 * distancia) son ahora 8 (0,85⁸ = 0,27), y sin tener que desplazar la vista entre medias. Como el punto mirado también se
 * acerca, después la vista gira alrededor de lo que se estaba mirando y no del centro de la pierna.
 *
 * Puro y sin three, para probarlo sin lienzo.
 */

import type { EncuadreDelPaso } from './encuadreDelPaso'

type Vec3 = [number, number, number]

/** Por cuánto se multiplica la distancia en cada muesca hacia delante: un 15 % más cerca. */
export const FACTOR_POR_MUESCA = 0.85

/** Ni la rueda más rápida salta más de esto de una vez: algunas mandan una muesca de 300 píxeles. */
export const MUESCAS_POR_EVENTO = 3

/** Lo más cerca que se llega a la superficie: más cerca, la cámara empezaría a cortar la piel con su plano cercano. */
export const MAS_CERCA_MM = 20

/** Lo más lejos: sin tope, una rueda insistente deja la pierna en un punto del fondo. */
export const MAS_LEJOS_MM = 5000

/**
 * Cuántas muescas trae un evento de la rueda, positivas para acercar (la rueda hacia delante, que manda `deltaY`
 * negativo). Una muesca son 100 píxeles en Chrome, Edge y Firefox con el modo en píxeles, y 3 líneas con el modo en líneas.
 * El pellizco del panel táctil llega como rueda con Ctrl y unos pocos píxeles por evento: se multiplica por diez, como
 * hace `OrbitControls`, para que pellizcar acerque como la rueda.
 */
export function muescasDeLaRueda(e: { deltaY: number; deltaMode: number; ctrlKey: boolean }): number {
  if (!Number.isFinite(e.deltaY) || e.deltaY === 0) return 0
  const porMuesca = e.deltaMode === 1 ? 3 : e.deltaMode === 2 ? 1 : 100
  const delta = e.deltaMode === 0 && e.ctrlKey ? e.deltaY * 10 : e.deltaY
  const muescas = -delta / porMuesca
  return Math.max(-MUESCAS_POR_EVENTO, Math.min(MUESCAS_POR_EVENTO, muescas))
}

const resta = (a: readonly number[], b: readonly number[]): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const suma = (a: readonly number[], b: readonly number[]): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const por = (a: readonly number[], k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const largo = (a: readonly number[]) => Math.hypot(a[0], a[1], a[2])
const punto = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * La vista después de `muescas` de rueda hacia `foco` (el punto de la superficie bajo el cursor, o el punto mirado si
 * bajo el cursor no hay nada), o `null` si ya está en el tope y no se mueve.
 *
 * La distancia al foco se queda entre `minimo` y `maximo` (en unidades del mundo): la última muesca antes del tope
 * acerca lo que falta y no más.
 */
export function acercarHacia(
  vista: { camara: readonly number[]; mirado: readonly number[] },
  foco: readonly number[],
  muescas: number,
  limites: { minimo: number; maximo: number },
): { camara: Vec3; mirado: Vec3 } | null {
  if (muescas === 0) return null
  const desdeElFoco = resta(vista.camara, foco)
  const distancia = largo(desdeElFoco)
  if (!(distancia > 1e-9)) return null
  const deseada = distancia * Math.pow(FACTOR_POR_MUESCA, muescas)
  const nueva = Math.min(limites.maximo, Math.max(limites.minimo, deseada))
  // Acercando ya en el tope (o alejando ya en el otro), no se mueve: sin esto, la «última muesca» alejaría hasta el
  // mínimo a quien empezó más cerca que él.
  if (muescas > 0 ? nueva >= distancia : nueva <= distancia) return null
  const k = nueva / distancia
  return {
    camara: suma(foco, por(desdeElFoco, k)),
    mirado: suma(foco, por(resta(vista.mirado, foco), k)),
  }
}

/** Cuánto de lo estrecho del lienzo ocupa la herida al encuadrarla: lo demás es lo que la rodea. */
export const PARTE_DE_LA_HERIDA = 0.6

/** Una herida pequeña no se encuadra al microscopio: se encuadra como si midiera al menos esto de radio. */
export const RADIO_MINIMO_MM = 15

/**
 * El encuadre de «Encuadrar la herida» (tecla E): la herida en el centro, ocupando `PARTE_DE_LA_HERIDA` del lado más
 * estrecho del lienzo, mirada de frente —desde fuera de la piel, en la dirección de su normal media— y con el arriba de
 * la vista de ahora para que no dé una vuelta. `null` si no hay herida.
 *
 * Si las normales no se ponen de acuerdo (una incisión que rodea el miembro), se mira desde donde se estaba mirando.
 */
export function encuadreDeLaHerida(
  puntos: readonly (readonly number[])[],
  normales: readonly (readonly number[])[],
  ahora: { direccion: readonly number[]; arriba: readonly number[] },
  camara: { fovGrados: number; aspecto: number },
  unidadesPorMm: number,
): EncuadreDelPaso | null {
  if (puntos.length === 0) return null
  const minimo: Vec3 = [Infinity, Infinity, Infinity]
  const maximo: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of puntos) {
    for (let i = 0; i < 3; i++) {
      minimo[i] = Math.min(minimo[i], p[i])
      maximo[i] = Math.max(maximo[i], p[i])
    }
  }
  const centro = por(suma(minimo, maximo), 0.5)
  if (!centro.every(Number.isFinite)) return null
  const radio = Math.max(RADIO_MINIMO_MM * unidadesPorMm, ...puntos.map((p) => largo(resta(p, centro))))

  let suman: Vec3 = [0, 0, 0]
  for (const n of normales) {
    const l = largo(n)
    if (l > 1e-9) suman = suma(suman, por(n, 1 / l))
  }
  const acuerdo = normales.length > 0 ? largo(suman) / normales.length : 0
  const direccion = acuerdo > 0.3 ? por(suman, 1 / largo(suman)) : unitario(ahora.direccion) ?? ([0, 0, 1] as Vec3)

  // El arriba de ahora, sin la parte que cae en la dirección nueva; si son casi paralelos, el eje Y, y si tampoco, el Z.
  const arriba =
    [ahora.arriba, [0, 1, 0], [0, 0, 1]].map((a) => unitario(resta(a, por(direccion, punto(a, direccion))), 0.1)).find((a) => a !== null) ??
    ([0, 1, 0] as Vec3)

  const mitadVertical = (camara.fovGrados * Math.PI) / 360
  const mitadHorizontal = Math.atan(Math.tan(mitadVertical) * camara.aspecto)
  const mitad = Math.min(mitadVertical, mitadHorizontal)
  const distancia = Math.min(
    MAS_LEJOS_MM * unidadesPorMm,
    Math.max(3 * MAS_CERCA_MM * unidadesPorMm, radio / (PARTE_DE_LA_HERIDA * Math.tan(mitad))),
  )
  return { centro, direccion, arriba, distancia }
}

function unitario(v: readonly number[], minimo = 1e-9): Vec3 | null {
  const l = largo(v)
  return l > minimo ? por(v, 1 / l) : null
}

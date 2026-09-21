/**
 * Selección por caja: qué piezas caen dentro de un rectángulo arrastrado sobre
 * el lienzo.
 *
 * Es el gesto de Blender —arrastrar y soltar un marco— y se pidió con esas
 * palabras. Hasta aquí el taller solo sabía señalar una pieza cada vez, y dejar
 * sola una rodilla eran cuarenta clics o una búsqueda en un árbol de 2.234
 * filas.
 *
 * **Entra la pieza cuyo centro queda dentro del marco**, no la que lo roza. Es
 * lo que hace Blender con el origen de cada objeto cuando no puede mirar la
 * geometría, y aquí es una decisión y no una limitación: la piel, la fascia y
 * los grandes vasos tienen cajas que abarcan medio cuerpo, así que con «lo que
 * toque el marco» cualquier selección sobre la pierna se llevaba también la
 * piel entera, y quitarla después era justo el trabajo que el marco venía a
 * ahorrar. Con el centro, el marco se lleva lo que de verdad está ahí.
 *
 * No mira triángulos ni profundidad: se lleva también lo que queda detrás, como
 * el marco de Blender en modo alámbrico. Para quedarse solo con lo de delante
 * se apaga antes lo que estorba, que es como se trabaja en el taller.
 *
 * Aquí no hay React ni lienzo: recibe la cámara y devuelve índices, para poder
 * probarlo sin navegador (`tests/unit/seleccionPorCaja.test.ts`).
 */

import * as THREE from 'three'
import { ESTADO, type EscenaDelAtlas } from './cargador'

/**
 * Un rectángulo en coordenadas normalizadas del dispositivo: de −1 a 1 en los
 * dos ejes, con la Y hacia arriba. Es lo que entiende `Vector3.project`.
 */
export interface RectanguloNormalizado {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Convierte dos esquinas en píxeles del lienzo en un rectángulo normalizado.
 *
 * Las esquinas llegan en el orden en que se arrastró, que puede ser de abajo
 * arriba o de derecha a izquierda; y la Y de la pantalla crece hacia abajo,
 * al revés que la normalizada.
 */
export function rectanguloNormalizado(
  a: { x: number; y: number },
  b: { x: number; y: number },
  ancho: number,
  alto: number,
): RectanguloNormalizado {
  const aX = (a.x / ancho) * 2 - 1
  const bX = (b.x / ancho) * 2 - 1
  const aY = -(a.y / alto) * 2 + 1
  const bY = -(b.y / alto) * 2 + 1
  return {
    minX: Math.min(aX, bX),
    maxX: Math.max(aX, bX),
    minY: Math.min(aY, bY),
    maxY: Math.max(aY, bY),
  }
}

const centro = new THREE.Vector3()

/**
 * Índices, en el catálogo, de las piezas encendidas cuyo centro cae dentro del
 * rectángulo.
 *
 * Solo recorre `escena.rangos`, que son las piezas que de verdad se montaron
 * en la malla: una pieza apagada al cargar no tiene triángulos que enseñar y
 * seleccionarla sería seleccionar algo que no se ve.
 *
 * `separacion` desplaza el centro lo mismo que el sombreador desplaza la
 * geometría, por la misma razón que en `piezaBajoElRayo`.
 *
 * La cámara tiene que traer sus matrices al día. En el visor lo están, porque
 * se dibuja en cada cambio; una prueba tiene que llamar a `updateMatrixWorld`.
 */
export function piezasEnElRectangulo(
  escena: Pick<EscenaDelAtlas, 'rangos' | 'datos' | 'centros'>,
  camara: THREE.Camera,
  rectangulo: RectanguloNormalizado,
  separacion = 0,
): number[] {
  const dentro: number[] = []
  for (const indice of escena.rangos.keys()) {
    if (escena.datos[indice * 4 + 3] < ESTADO.VISIBLE) continue

    centro.set(
      escena.centros[indice * 3] + escena.datos[indice * 4] * separacion,
      escena.centros[indice * 3 + 1] + escena.datos[indice * 4 + 1] * separacion,
      escena.centros[indice * 3 + 2] + escena.datos[indice * 4 + 2] * separacion,
    )
    centro.project(camara)

    // Fuera de −1..1 en Z está detrás de la cámara o más allá del plano lejano.
    // Lo de detrás se proyecta igual, con el signo cambiado, y sin este filtro
    // un marco sobre la rodilla se llevaba piezas que están a la espalda del
    // que mira.
    if (centro.z < -1 || centro.z > 1) continue
    if (centro.x < rectangulo.minX || centro.x > rectangulo.maxX) continue
    if (centro.y < rectangulo.minY || centro.y > rectangulo.maxY) continue
    dentro.push(indice)
  }
  return dentro
}

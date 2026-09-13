import * as THREE from 'three'
import { VISTA_INICIAL, type CatalogoDelAtlas } from './formato'

/**
 * El punto sobre el que gira la cámara del atlas.
 *
 * OrbitControls gira y acerca siempre hacia `controles.target`, y ese punto no
 * lo movía nadie salvo «Encuadrar». Nacía en el objetivo de `VISTA_INICIAL`
 * —[0, 0.9, 0], el centro del cuerpo entero a la altura de la pelvis— y ahí se
 * quedaba mientras el traumatólogo apagaba piezas en el árbol. Con la pierna
 * sola encendida, la pierna giraba alrededor de un cuerpo que ya no se veía y
 * la rueda acercaba la cámara a un sitio vacío: en sus palabras, «no me toma el
 * centro de gravedad de la pierna sino todo el cuerpo aunque no se vea».
 *
 * Aquí vive el cálculo; quien lo aplica a la cámara es `VisorAtlas.tsx`. Está
 * en un módulo aparte y no dentro del componente porque las pruebas corren en
 * `node` sin jsdom (ver `vitest.config.ts`) y un componente no se puede montar:
 * separado, la regla se prueba con números de verdad y el visor solo tiene que
 * llamarla —cosa que vigila `tests/unit/pivoteDelAtlas.test.ts` leyendo su
 * fuente—.
 *
 * ## Por qué se traslada la cámara entera y no solo el objetivo
 *
 * Mover solo el objetivo con la cámara quieta cambia hacia dónde mira: la
 * imagen da un giro brusco. Acercar la cámara a lo visible —lo que hace
 * «Encuadrar»— cambia el tamaño. Los dos son saltos, y se producirían en cada
 * clic del árbol mientras se apagan piezas una a una. Trasladar cámara y
 * objetivo con el mismo desplazamiento conserva la dirección y la distancia: lo
 * visible se desliza al centro de la pantalla sin cambiar de tamaño, y a partir
 * de ahí el giro y el zoom van hacia ello.
 */

/**
 * Qué parte del tamaño de lo visible puede separarse el pivote de su centro sin
 * que se recoloque.
 *
 * Un cinco por ciento. Sin holgura, apagar una falange con la pierna entera
 * encendida movería la cámara un milímetro, y apagar veinte piezas serían
 * veinte deslizamientos que no enseñan nada. Con ella, girar alrededor de un
 * punto a cuatro centímetros del centro de una pierna de noventa es
 * indistinguible de girar sobre el centro.
 *
 * Y con ella el cuerpo completo no se recoloca nunca: el centro de su caja está
 * a 3,5 cm del objetivo de `VISTA_INICIAL`, dentro del 5 % de 1,73 m. Sin esa
 * coincidencia, abrir el taller —que fija `VISTA_INICIAL` como encuadre de
 * referencia— daría por movida la cámara nada más cargar, y el taller
 * preguntaría «¿continuar y perder los cambios?» sin que nadie hubiera tocado
 * nada.
 */
export const HOLGURA_RELATIVA_DEL_PIVOTE = 0.05

/**
 * Por debajo de un milímetro no se recoloca, sea cual sea el tamaño: con una
 * pieza diminuta el cinco por ciento se queda en décimas de milímetro y lo
 * único que se movería es la deriva de coma flotante.
 */
export const HOLGURA_MINIMA_DEL_PIVOTE = 0.001

/**
 * Cuánto se espera tras el último cambio antes de recolocar, en milisegundos.
 *
 * Agrupa los cambios seguidos —arrastrar el deslizador de separación, pulsar
 * varias casillas del árbol de corrido— en un solo deslizamiento. Más larga, el
 * pivote tarda en llegar y el primer giro después de apagar una pieza todavía
 * va alrededor de lo de antes.
 */
export const ESPERA_DEL_PIVOTE_MS = 250

/**
 * Lo que dura el deslizamiento. Corto a propósito: es para que el ojo siga a la
 * pieza, no una animación que haya que esperar.
 */
export const DURACION_DEL_PIVOTE_MS = 300

/**
 * La caja de lo que está encendido, en metros y ya con la separación aplicada.
 *
 * La usan «Encuadrar» y el pivote. Es una sola función para los dos porque si
 * cada uno tuviera su copia, un día uno centraría la cámara en un sitio y el
 * otro giraría en otro.
 *
 * `separacion` no es un adorno: la caja que trae el catálogo es la de la pieza
 * en su sitio, pero al separar el cuerpo la geometría se desplaza en el
 * sombreador (`cargador.ts`: `transformed += estado.xyz * separacion`) y la caja
 * se queda atrás. Sin trasladarla, «Encuadrar» situaba la cámara sobre el
 * volumen cerrado justo cuando más falta hace recolocar la vista —con el cuerpo
 * abierto— y dejaba fuera de pantalla las piezas más desplazadas.
 *
 * Es la misma traslación que hace `picking.ts` para saber qué hay bajo el
 * cursor, y son dos copias de la misma regla: si una cambia, la otra también, o
 * los dos módulos volverán a colocar la misma pieza en sitios distintos.
 *
 * `datos` son los de la textura de estado de la escena: las direcciones de
 * separación viven en sus tres primeros canales, indexados por el orden de la
 * pieza en el catálogo. Antes de que la escena esté montada no existen, y
 * entonces la caja sale sin separar; con el cuerpo cerrado da lo mismo.
 *
 * Devuelve `null` si no hay nada encendido: no hay centro al que ir, y
 * recolocar hacia una caja vacía mandaría la cámara al infinito.
 */
export function cajaDeLoVisible(
  catalogo: CatalogoDelAtlas,
  visibles: Set<string> | null,
  separacion: number,
  datos?: Float32Array,
): THREE.Box3 | null {
  const caja = new THREE.Box3()
  const extremo = new THREE.Vector3()
  const desplazamiento = new THREE.Vector3()
  const conDatos = separacion > 0 ? datos : undefined
  let hay = false
  catalogo.piezas.forEach((pieza, i) => {
    if (visibles && !visibles.has(pieza.id)) return
    const [min, max] = pieza.caja
    if (conDatos) {
      desplazamiento
        .set(conDatos[i * 4], conDatos[i * 4 + 1], conDatos[i * 4 + 2])
        .multiplyScalar(separacion)
    } else {
      desplazamiento.set(0, 0, 0)
    }
    caja.expandByPoint(extremo.set(min[0], min[1], min[2]).add(desplazamiento))
    caja.expandByPoint(extremo.set(max[0], max[1], max[2]).add(desplazamiento))
    hay = true
  })
  return hay ? caja : null
}

/**
 * Si el pivote ya está lo bastante cerca del centro de lo visible.
 *
 * Sin caja —nada encendido— se da por bueno: no hay a dónde llevarlo y dejarlo
 * quieto es lo único que no descoloca al que vuelve a encender algo.
 */
export function pivoteEnSitio(objetivo: THREE.Vector3, caja: THREE.Box3 | null): boolean {
  if (!caja) return true
  const tamano = caja.getSize(new THREE.Vector3())
  const lado = Math.max(tamano.x, tamano.y, tamano.z)
  const holgura = Math.max(HOLGURA_MINIMA_DEL_PIVOTE, lado * HOLGURA_RELATIVA_DEL_PIVOTE)
  return objetivo.distanceTo(caja.getCenter(new THREE.Vector3())) <= holgura
}

/**
 * Si un objetivo es el de `VISTA_INICIAL`, a dos milímetros —lo que redondea
 * `vistaActual()` y la misma holgura que usa el taller para dar la cámara por
 * quieta—.
 *
 * Sirve para reconocer las preparaciones guardadas antes de que el pivote
 * siguiera a lo visible. Todas las que se guardaron sin pulsar «Encuadrar» y
 * sin desplazar la vista con el botón derecho llevan exactamente ese objetivo,
 * y en la ficha del residente giran alrededor de un cuerpo que no se ve. Un
 * objetivo distinto, en cambio, es una decisión de quien preparó la vista —lo
 * dejó ahí «Encuadrar» o lo llevó a mano sobre el foco de fractura— y
 * recolocarlo al abrir desharía justo eso.
 */
export function esElObjetivoPorOmision(objetivo: THREE.Vector3): boolean {
  const [x, y, z] = VISTA_INICIAL.objetivo
  return (
    Math.abs(objetivo.x - x) <= 0.002 &&
    Math.abs(objetivo.y - y) <= 0.002 &&
    Math.abs(objetivo.z - z) <= 0.002
  )
}

/**
 * Un deslizamiento en curso de cámara y objetivo.
 *
 * Guarda cuánto se ha aplicado ya, y no la posición de partida, porque el
 * paso de cada fotograma se SUMA a lo que haya: si el traumatólogo sigue
 * girando mientras el pivote se desliza, OrbitControls mueve la cámara
 * alrededor del objetivo y la suma respeta ese giro. Escribiendo posiciones
 * absolutas, el deslizamiento se lo comería y la cámara volvería de golpe al
 * ángulo de antes de empezar a girar.
 */
export interface TraslacionDelPivote {
  total: THREE.Vector3
  aplicado: THREE.Vector3
  inicio: number
  duracion: number
}

export function crearTraslacion(
  total: THREE.Vector3,
  inicio: number,
  duracion: number,
): TraslacionDelPivote {
  return { total: total.clone(), aplicado: new THREE.Vector3(), inicio, duracion }
}

/**
 * Suave al llegar y rápida al salir: el ojo ve arrancar la pieza en cuanto
 * suelta el clic, y la ve frenar donde se va a quedar.
 */
function suavizar(avance: number): number {
  return 1 - (1 - avance) ** 3
}

/**
 * Lo que hay que sumar a cámara y objetivo en este fotograma.
 *
 * Con duración cero termina en el primer paso: es como se atiende
 * `prefers-reduced-motion`, sin una rama aparte que se pueda desincronizar.
 */
export function avanzarTraslacion(
  traslacion: TraslacionDelPivote,
  ahora: number,
): { paso: THREE.Vector3; terminada: boolean } {
  const avance =
    traslacion.duracion <= 0
      ? 1
      : Math.min(1, Math.max(0, (ahora - traslacion.inicio) / traslacion.duracion))
  const deseado = traslacion.total.clone().multiplyScalar(suavizar(avance))
  const paso = deseado.clone().sub(traslacion.aplicado)
  traslacion.aplicado.copy(deseado)
  return { paso, terminada: avance >= 1 }
}

/**
 * Lo que le falta por recorrer. Es lo que se suma a la cámara de ahora para
 * saber dónde va a quedar, y lo que se guarda si se pulsa «Guardar» a mitad del
 * deslizamiento.
 */
export function restoDeLaTraslacion(traslacion: TraslacionDelPivote | undefined): THREE.Vector3 {
  if (!traslacion) return new THREE.Vector3()
  return traslacion.total.clone().sub(traslacion.aplicado)
}

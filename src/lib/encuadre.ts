import * as THREE from 'three'

import { redondear, type Encuadre } from './aritmeticaDelEncuadre'

/**
 * La captura del encuadre de un modelo 3D, y la puerta de siempre al resto.
 *
 * Está aparte del visor porque es la parte que puede estar mal sin que se note:
 * un signo cambiado da un encuadre que parece razonable en el editor y enseña
 * el hueso del revés cuando el residente abre la ficha. Aquí se puede probar
 * sin navegador y sin lienzo.
 *
 * Lo que queda en este archivo es `encuadreCapturado`, que es **la única**
 * función del encuadre que necesita `three`. La forma de la pose, la pregunta
 * `tieneEncuadre`, la regla `encuadreVigente` y el encuadre automático se
 * mudaron a `./aritmeticaDelEncuadre`, y desde aquí se reexportan: quien ya
 * importaba de `@/lib/encuadre` —`Visor3D.tsx`, `Bloques.tsx`,
 * `tecnica-ao/[id]/page.tsx` y las pruebas— sigue igual y no tuvo que
 * cambiarse una línea.
 *
 * La mudanza no fue de orden. Este `import * as THREE` entra en el paquete de
 * quien importe **este** archivo, y desde que la regla la lee también un
 * componente de cliente —`ConsolaQuirurgica.tsx`— eso habría metido three
 * entero en lo que descarga el residente al abrir un caso del simulador,
 * incluido el caso sin un solo modelo, deshaciendo las importaciones dinámicas
 * con las que el motor 3D viaja aparte. La consola importa de
 * `./aritmeticaDelEncuadre`, que no sabe de three; los tres de servidor siguen
 * entrando por aquí, donde el peso no sale del paquete del servidor.
 *
 * Y la reexportación de aquí abajo no vale para librarse de three: un `export
 * … from` sigue siendo una arista del grafo, y sin `sideEffects: false` en el
 * `package.json` el empaquetador da por hecho que el módulo tiene efectos y lo
 * incluye entero. O sea, importar `encuadreVigente` desde `@/lib/encuadre` trae
 * three aunque `encuadreCapturado` no se use. Por eso la consola nombra el otro
 * archivo y no este, y por eso cambiarle la importación «para que quede
 * uniforme» le devolvería el megabyte sin ningún aviso.
 */

export type { Encuadre }
export {
  CAMPO_DE_VISION,
  encuadreQueLoAbarca,
  encuadreVigente,
  tieneEncuadre,
} from './aritmeticaDelEncuadre'

const EJE_Z = new THREE.Vector3(0, 0, 1)
const aGrados = (radianes: number) => Math.round((radianes * 180) / Math.PI)

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

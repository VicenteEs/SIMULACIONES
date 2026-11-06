import * as THREE from 'three'
import { ATRIBUTO_DEL_CANAL, SIN_CANAL_POR_OMISION } from './canalDeLaGeometria'

/**
 * El material de la radiografía, el mismo para el taller anatómico y para el simulador.
 *
 * Cada superficie suma luz blanca en proporción a lo que absorbe su tejido (`densidad`,
 * de `lib/radiografia`), y más cuanto más de refilón la cruza el rayo —ahí atraviesa más
 * material—; el fondo es negro y la mezcla es **aditiva**, de modo que lo más grueso sale
 * más blanco. Es lo que se pidió con «poner como si fuera radiografía: se ven distintas
 * densidades de grises, no se ven vasos ni esas cosas».
 *
 * En el atlas la radiografía de las piezas enteras va dentro del sombreador de su sistema
 * (`cargador.ts`, que parte del material estándar de three); esto es para lo que no pasa
 * por ahí: los trozos sueltos de un hueso partido y todo lo del simulador.
 *
 * La pared del canal medular (D-336, el atributo `aCanal`) no suma. Con superficies que solo
 * suman, el canal no puede restar lo que el hueso no absorbe ahí, y sumarlo era peor: la
 * diáfisis salía más blanca por el medio que por los bordes, y con una raya clara de más a
 * cada lado, en el borde del canal. Sin ella el hueso se ve como antes de tener canal.
 */

/**
 * Cuánto se amplifica la suma antes de pintarla. Un cuerpo o una pierna acumulan poco por
 * pasada y, sin este factor, todo sale casi negro y el hueso no se distingue del fondo. Se
 * calibró mirando la pierna de prueba y el esqueleto del atlas.
 */
export const GANANCIA_DE_LA_RADIOGRAFIA = 2.3

/**
 * `ganancia` es la de la toma. La radiografía del atlas usa la de siempre; la fluoroscopia del simulador captura con
 * menos (`GANANCIA_DE_LA_RADIOGRAFIA / FACTOR_DE_LA_TOMA`) y revela multiplicando, para que lo muy denso no se sature
 * en la propia captura —un búfer de 8 bits no guarda más de 1— y los kilovoltios altos tengan algo que enseñar.
 */
export function crearMaterialDeRadiografia(
  densidad: number,
  ganancia: number = GANANCIA_DE_LA_RADIOGRAFIA,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: { uDensidad: { value: densidad }, uGanancia: { value: ganancia } },
    vertexShader: /* glsl */ `
      attribute float ${ATRIBUTO_DEL_CANAL};
      varying vec3 vNormal;
      varying float vCanal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vCanal = ${ATRIBUTO_DEL_CANAL};
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDensidad;
      uniform float uGanancia;
      varying vec3 vNormal;
      varying float vCanal;
      void main() {
        if (vCanal > 0.5) discard;
        // 0 de frente, 1 rasante: un rayo rasante atraviesa más material (ver aporteDeLaSuperficie).
        float rasante = 1.0 - abs(normalize(vNormal).z);
        float aporte = uDensidad * (0.045 + 0.2 * pow(rasante, 1.5)) * uGanancia;
        gl_FragColor = vec4(vec3(1.0), clamp(aporte, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    // Suma, no mezcla: fondo + color × alfa. Es lo que hace que lo grueso sea más blanco.
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneFactor,
  })
  // Lo que no trae el atributo —la piel, el músculo, el metal— no tiene canal.
  material.defaultAttributeValues = { ...material.defaultAttributeValues, ...SIN_CANAL_POR_OMISION }
  return material
}

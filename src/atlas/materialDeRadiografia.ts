import * as THREE from 'three'

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
  return new THREE.ShaderMaterial({
    uniforms: { uDensidad: { value: densidad }, uGanancia: { value: ganancia } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uDensidad;
      uniform float uGanancia;
      varying vec3 vNormal;
      void main() {
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
}

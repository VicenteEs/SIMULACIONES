import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { CAMPO_DE_VISION, encuadreCapturado, encuadreQueLoAbarca } from '@/lib/encuadre'

/**
 * El encuadre capturado enseña lo que el traumatólogo estaba viendo.
 *
 * Esta es la parte que puede estar mal sin que nadie lo note: un signo cambiado
 * da números de aspecto razonable y le enseña al residente el hueso del revés.
 * Y no se descubre en el editor, porque allí el modelo está donde uno lo dejó.
 *
 * El invariante que se comprueba es exacto y no depende de cómo se pinte:
 *
 *   la dirección desde la que se mira, expresada en el sistema del modelo ya
 *   girado, tiene que ser la misma antes y después.
 *
 * Si lo es, las dos vistas enseñan la misma cara.
 */

const EJE_Z = new THREE.Vector3(0, 0, 1)

/** Desde dónde se ve el modelo, en su propio sistema de coordenadas. */
function direccionEnElModelo(rotacion: THREE.Quaternion, direccionMundo: THREE.Vector3) {
  return direccionMundo.clone().applyQuaternion(rotacion.clone().invert()).normalize()
}

/** Rehace la rotación a partir de los grados que se guardaron. */
function rotacionDe(encuadre: { giroX: number; giroY: number; giroZ: number }) {
  const rad = (g: number) => (g * Math.PI) / 180
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rad(encuadre.giroX), rad(encuadre.giroY), rad(encuadre.giroZ), 'XYZ'),
  )
}

describe('capturar el encuadre', () => {
  const objetivo = new THREE.Vector3(0, 0, 0)

  const casos: Array<{ nombre: string; camara: [number, number, number]; giroPrevio: THREE.Euler }> =
    [
      {
        nombre: 'de frente, sin nada girado',
        camara: [0, 0, 4],
        giroPrevio: new THREE.Euler(0, 0, 0),
      },
      {
        nombre: 'de lado, un cuarto de vuelta',
        camara: [4, 0, 0],
        giroPrevio: new THREE.Euler(0, 0, 0),
      },
      {
        nombre: 'desde arriba',
        camara: [0, 4, 0.001],
        giroPrevio: new THREE.Euler(0, 0, 0),
      },
      {
        nombre: 'en diagonal, sobre un modelo ya girado',
        camara: [2.5, 1.8, -3.1],
        giroPrevio: new THREE.Euler(0.4, -1.1, 0.25),
      },
      {
        nombre: 'desde abajo y detrás',
        camara: [-1.2, -2.4, -2.9],
        giroPrevio: new THREE.Euler(-0.9, 2.2, 0),
      },
    ]

  for (const caso of casos) {
    it(`${caso.nombre}: la vista frontal reproduce lo que se veía`, () => {
      const posicionCamara = new THREE.Vector3(...caso.camara)
      const rotacionActual = new THREE.Quaternion().setFromEuler(caso.giroPrevio)

      const capturado = encuadreCapturado({
        posicionCamara,
        objetivo,
        rotacionActual,
        escala: 1,
      })

      // Antes: se mira desde donde está la cámara, con el modelo como está.
      const antes = direccionEnElModelo(
        rotacionActual,
        posicionCamara.clone().sub(objetivo).normalize(),
      )
      // Después: se mira desde el frente, con el modelo ya girado.
      const despues = direccionEnElModelo(rotacionDe(capturado), EJE_Z)

      // Un grado de margen: los giros se guardan redondeados a grados enteros.
      expect(antes.angleTo(despues) * (180 / Math.PI)).toBeLessThan(1)
    })
  }

  it('guarda la distancia a la que estaba la cámara', () => {
    const capturado = encuadreCapturado({
      posicionCamara: new THREE.Vector3(0, 3, 4),
      objetivo,
      rotacionActual: new THREE.Quaternion(),
      escala: 2,
    })
    expect(capturado.distanciaCamara).toBe(5)
    expect(capturado.escala, 'la escala no la toca capturar').toBe(2)
  })

  it('mide la distancia desde el punto al que se mira, no desde el origen', () => {
    // Si el objetivo no fuera el origen y se midiera desde él, la distancia
    // guardada sería otra y el residente abriría el modelo demasiado lejos.
    const capturado = encuadreCapturado({
      posicionCamara: new THREE.Vector3(10, 0, 0),
      objetivo: new THREE.Vector3(7, 0, 0),
      rotacionActual: new THREE.Quaternion(),
      escala: 1,
    })
    expect(capturado.distanciaCamara).toBe(3)
  })
})

describe('ajustar al tamaño del modelo', () => {
  it('lleva cualquier unidad a un tamaño visible', () => {
    // Una malla en milímetros y otra en metros deben acabar viéndose igual.
    expect(encuadreQueLoAbarca(500)?.escala).toBeCloseTo(0.002, 5)
    expect(encuadreQueLoAbarca(0.5)?.escala).toBe(2)
  })

  it('la distancia deja el modelo entero dentro del ángulo de visión', () => {
    const ajuste = encuadreQueLoAbarca(1)!
    // Con el radio llevado a uno, el semiángulo visible a esa distancia tiene
    // que abarcarlo con holgura.
    const semiangulo = Math.asin(1 / ajuste.distanciaCamara!) * (180 / Math.PI)
    expect(semiangulo).toBeLessThan(CAMPO_DE_VISION / 2)
    expect(semiangulo).toBeGreaterThan(CAMPO_DE_VISION / 2 - 5)
  })

  it('no inventa nada ante un modelo sin tamaño', () => {
    expect(encuadreQueLoAbarca(0)).toBeNull()
    expect(encuadreQueLoAbarca(Number.NaN)).toBeNull()
  })
})

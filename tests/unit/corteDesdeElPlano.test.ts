import { describe, expect, it } from 'vitest'
import { corteDesdeElPlano, planoDelCorte, type EjeDelHueso } from '@/lib/planoDeCorte'

/**
 * Del plano trazado en el taller a los tres valores de la exportación (D-137).
 * Es la inversa de `planoDelCorte`, así que la prueba es ir y volver.
 */

// Un hueso vertical de 40 cm, con lo proximal arriba: el eje baja.
const eje: EjeDelHueso = {
  centro: [0.1, 0.5, 0],
  direccion: [0, -1, 0],
  proximal: -0.2,
  distal: 0.2,
  radio: 0.02,
  delante: [0, 0, 1],
  fuera: [1, 0, 0],
}

describe('corteDesdeElPlano', () => {
  it('va y vuelve: lo que sale de planoDelCorte se recupera', () => {
    for (const corte of [
      { posicion: 50, inclinacion: 0, giro: 0 },
      { posicion: 30, inclinacion: 25, giro: 90 },
      { posicion: 72.5, inclinacion: 45, giro: 200 },
    ]) {
      const vuelta = corteDesdeElPlano(eje, planoDelCorte(eje, corte))
      expect(vuelta.posicion).toBeCloseTo(corte.posicion, 1)
      expect(vuelta.inclinacion).toBeCloseTo(corte.inclinacion, 1)
      if (corte.inclinacion > 0) expect(vuelta.giro).toBe(corte.giro)
      expect(vuelta.acotado).toBe(false)
    }
  })

  // Un plano no tiene cara: la línea del taller puede dejar la normal mirando a
  // proximal, y tiene que dar el mismo corte.
  it('da lo mismo con la normal del revés', () => {
    const plano = planoDelCorte(eje, { posicion: 40, inclinacion: 20, giro: 45 })
    const delReves = { punto: plano.punto, normal: plano.normal.map((n) => -n) as [number, number, number] }
    expect(corteDesdeElPlano(eje, delReves)).toEqual(corteDesdeElPlano(eje, plano))
  })

  it('el punto del plano no tiene por qué estar en el eje', () => {
    // El taller guarda el punto medio de la línea trazada, que cae donde cae.
    const enElEje = planoDelCorte(eje, { posicion: 60, inclinacion: 0, giro: 0 })
    const aUnLado = { punto: [enElEje.punto[0] + 0.3, enElEje.punto[1], enElEje.punto[2] - 0.2] as [number, number, number], normal: enElEje.normal }
    expect(corteDesdeElPlano(eje, aUnLado).posicion).toBeCloseTo(60, 1)
  })

  it('lo que la exportación no admite se lleva al límite y se dice', () => {
    const longitudinal = corteDesdeElPlano(eje, { punto: [0.1, 0.5, 0], normal: [1, -0.1, 0] })
    expect(longitudinal.inclinacion).toBe(60)
    expect(longitudinal.acotado).toBe(true)
    const enLaEpifisis = corteDesdeElPlano(eje, { punto: [0.1, 0.699, 0], normal: [0, -1, 0] })
    expect(enLaEpifisis.posicion).toBe(5)
    expect(enLaEpifisis.acotado).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import {
  AREA_QUE_DEVITALIZA_MM2,
  CELDA_MM,
  agujerosSobrePeriostio,
  areaExpuestaMm2,
  espaciadoEntreHuellasMm,
  estaExpuesto,
  juicioDeLaExposicion,
  textoDeLaExposicion,
  type Huella,
} from '@/lib/periostio'

/** Despegar el periostio con el Freer y los periostótomos (P-005 E2). */

/** Una franja recta de huellas sobre el plano z = 0, del ancho de la hoja y `largoMm` de largo, como una pasada del instrumento. */
function franja(anchoMm: number, largoMm: number, x0 = 0): Huella[] {
  const radioMm = anchoMm / 2
  const paso = espaciadoEntreHuellasMm(radioMm)
  const huellas: Huella[] = []
  for (let y = 0; y <= largoMm; y += paso) huellas.push({ x: x0, y, z: 0, nx: 0, ny: 0, nz: 1, radioMm })
  return huellas
}

describe('el área expuesta', () => {
  it('sin huellas no hay nada expuesto', () => {
    expect(areaExpuestaMm2([])).toBe(0)
  })

  it('una pasada del ancho de la hoja y largo L expone algo cercano a ancho × largo', () => {
    // Una cuadrícula en 3D mide con un error de unos pocos por ciento en un disco plano: se acepta un margen amplio.
    const area = areaExpuestaMm2(franja(10, 40))
    expect(area).toBeGreaterThan(10 * 40 * 0.8)
    expect(area).toBeLessThan(10 * 40 * 1.5)
  })

  it('una hoja más ancha expone más en el mismo recorrido', () => {
    expect(areaExpuestaMm2(franja(14, 30))).toBeGreaterThan(areaExpuestaMm2(franja(4, 30)) * 2)
  })

  it('pasar dos veces por el mismo sitio no suma dos veces', () => {
    const una = areaExpuestaMm2(franja(8, 30))
    const dos = areaExpuestaMm2([...franja(8, 30), ...franja(8, 30)])
    expect(dos).toBeCloseTo(una, 6)
  })

  it('dos pasadas separadas suman las dos', () => {
    const a = areaExpuestaMm2(franja(6, 30, 0))
    const ambas = areaExpuestaMm2([...franja(6, 30, 0), ...franja(6, 30, 40)])
    // La cuadrícula cae distinto en cada franja (unos pocos por ciento): la suma es el doble, dentro de ese margen.
    expect(ambas / a).toBeGreaterThan(1.8)
    expect(ambas / a).toBeLessThan(2.2)
  })

  it('las huellas se espacian menos que su diámetro, para que la franja sea continua', () => {
    expect(espaciadoEntreHuellasMm(5)).toBeLessThan(10)
    expect(espaciadoEntreHuellasMm(0.1)).toBeGreaterThanOrEqual(0.6)
    expect(CELDA_MM).toBeGreaterThan(0)
  })
})

describe('qué agujeros quedan sobre hueso despegado', () => {
  const huellas = franja(10, 60)

  it('un punto dentro de una huella está expuesto; uno lejos, no', () => {
    expect(estaExpuesto(huellas, { x: 0, y: 30, z: 0 })).toBe(true)
    expect(estaExpuesto(huellas, { x: 40, y: 30, z: 0 })).toBe(false)
    // El margen deja pasar lo que sobresale un poco.
    expect(estaExpuesto(huellas, { x: 6, y: 30, z: 0 })).toBe(false)
    expect(estaExpuesto(huellas, { x: 6, y: 30, z: 0 }, 1.5)).toBe(true)
  })

  it('devuelve los agujeros (desde 0) que caen fuera de lo despegado', () => {
    const centros = [0, 13, 26, 39, 52, 65, 78].map((y) => ({ x: 0, y, z: 0 }))
    // Las huellas llegan hasta y = 60 con 5 mm de radio y 1,5 de margen: el agujero de y = 65 aún cae sobre hueso despegado; el de 78, no.
    expect(agujerosSobrePeriostio(huellas, centros)).toEqual([6])
    expect(agujerosSobrePeriostio([], centros)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})

describe('qué se le dice a quien despega', () => {
  it('sin nada despegado, que en pabellón se eleva antes de apoyar la placa', () => {
    const j = juicioDeLaExposicion({ areaMm2: 0, huellas: 0, agujerosTotal: 8, agujerosSinExponer: [0, 1, 2, 3, 4, 5, 6, 7] })
    expect(j.nada).toBe(true)
    expect(j.aviso).toMatch(/No se despegó el periostio/)
  })

  it('dice qué agujeros caen sobre periostio, en singular y en plural', () => {
    const uno = juicioDeLaExposicion({ areaMm2: 400, huellas: 40, agujerosTotal: 8, agujerosSinExponer: [7] })
    expect(uno.aviso).toBe('El agujero 8 cae sobre periostio sin despegar.')
    const varios = juicioDeLaExposicion({ areaMm2: 400, huellas: 40, agujerosTotal: 8, agujerosSinExponer: [5, 6, 7] })
    expect(varios.aviso).toMatch(/Los agujeros 6, 7 y 8 caen sobre periostio/)
  })

  it('despegar de más avisa de la irrigación, y bien despegado no dice nada', () => {
    const mucho = juicioDeLaExposicion({ areaMm2: AREA_QUE_DEVITALIZA_MM2 + 100, huellas: 500, agujerosTotal: 8, agujerosSinExponer: [] })
    expect(mucho.demasiado).toBe(true)
    expect(mucho.aviso).toMatch(/irrigación/)
    const bien = juicioDeLaExposicion({ areaMm2: 600, huellas: 60, agujerosTotal: 8, agujerosSinExponer: [] })
    expect(bien).toEqual({ aviso: null, demasiado: false, nada: false })
  })

  it('el texto del recuadro redondea y avisa si es mucho', () => {
    expect(textoDeLaExposicion(0, 0)).toMatch(/cubierto por su periostio/)
    expect(textoDeLaExposicion(417, 30)).toBe('Expuesto: unos 420 mm².')
    expect(textoDeLaExposicion(AREA_QUE_DEVITALIZA_MM2 + 200, 900)).toMatch(/se pierde irrigación/)
  })
})

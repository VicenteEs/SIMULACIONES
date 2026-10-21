import { describe, expect, it } from 'vitest'
import {
  FLEXION_MAXIMA_POR_SITIO,
  FLEXION_TOTAL_MAXIMA,
  INVERSIONES_QUE_FATIGAN,
  LARGO_DE_LA_FLEXION_MM,
  MARGEN_DEL_SITIO_MM,
  SIN_CONTORNO,
  TORSION_MAXIMA_POR_SITIO,
  crearMapaDelContorno,
  deshacerLaUltima,
  doblar,
  flechaDeLaCurva,
  inversionesEn,
  orificioBajoElDoblez,
  orificiosDeformados,
  sitiosFatigados,
  textoDelContorno,
} from '@/lib/contornoDeLaPlaca'

/** Doblar y torcer una placa fuera del hueso (P-005 E1). */

const hasta = (contorno: ReturnType<typeof doblar>['contorno'], ...pasos: [number, number, number?][]) => {
  let c = contorno
  for (const [s, flexion, torsion] of pasos) c = doblar(c, s, { flexionGrados: flexion, torsionGrados: torsion ?? 0 }).contorno
  return c
}

describe('doblar: las reglas', () => {
  it('una placa recta no tiene dobleces y su mapa no mueve nada', () => {
    expect(SIN_CONTORNO.dobleces).toEqual([])
    const mapa = crearMapaDelContorno(SIN_CONTORNO, 50)
    expect(mapa(3, 1, -20)).toEqual([3, 1, -20])
    expect(flechaDeLaCurva(SIN_CONTORNO, 50)).toBe(0)
    expect(textoDelContorno(SIN_CONTORNO, 50)).toMatch(/recta/i)
  })

  it('un doblez nuevo queda donde se hizo, con los grados pedidos', () => {
    const r = doblar(SIN_CONTORNO, 12, { flexionGrados: 10 })
    expect(r.contorno.dobleces).toEqual([{ sMm: 12, flexionGrados: 10, torsionGrados: 0 }])
    expect(r.aplicado).toEqual({ flexionGrados: 10, torsionGrados: 0 })
    expect(r.avisos).toEqual([])
  })

  it('no muta el contorno de partida', () => {
    const antes = JSON.stringify(SIN_CONTORNO)
    doblar(SIN_CONTORNO, 0, { flexionGrados: 10 })
    expect(JSON.stringify(SIN_CONTORNO)).toBe(antes)
  })

  it('dos dobleces a menos del margen son el mismo sitio y se suman', () => {
    const c = hasta(SIN_CONTORNO, [10, 10], [10 + MARGEN_DEL_SITIO_MM - 1, 8])
    expect(c.dobleces).toHaveLength(1)
    expect(c.dobleces[0].flexionGrados).toBe(18)
    // A más del margen, otro sitio.
    expect(hasta(SIN_CONTORNO, [10, 10], [10 + MARGEN_DEL_SITIO_MM + 1, 8]).dobleces).toHaveLength(2)
  })

  it('un sitio no cede más de su tope y lo dice', () => {
    const r = doblar(SIN_CONTORNO, 0, { flexionGrados: FLEXION_MAXIMA_POR_SITIO + 20 })
    expect(r.contorno.dobleces[0].flexionGrados).toBe(FLEXION_MAXIMA_POR_SITIO)
    expect(r.aplicado.flexionGrados).toBe(FLEXION_MAXIMA_POR_SITIO)
    expect(r.avisos.join(' ')).toMatch(/no cede más/)
    // Y la torsión tiene el suyo.
    const t = doblar(SIN_CONTORNO, 0, { torsionGrados: TORSION_MAXIMA_POR_SITIO + 10 })
    expect(t.contorno.dobleces[0].torsionGrados).toBe(TORSION_MAXIMA_POR_SITIO)
  })

  it('la placa entera tampoco cede sin fin: tope de flexión sumada', () => {
    let c = SIN_CONTORNO
    const puestos = [-60, -30, 0, 30, 60]
    for (const s of puestos) c = doblar(c, s, { flexionGrados: FLEXION_MAXIMA_POR_SITIO }).contorno
    const total = c.dobleces.reduce((suma, d) => suma + Math.abs(d.flexionGrados), 0)
    expect(total).toBeLessThanOrEqual(FLEXION_TOTAL_MAXIMA)
    const ultimo = doblar(c, 90, { flexionGrados: 10 })
    expect(ultimo.aplicado.flexionGrados).toBe(0)
    expect(ultimo.avisos.join(' ')).toMatch(/muy doblada/)
  })

  it('volver a cero quita el doblez: es una placa recta', () => {
    const c = hasta(SIN_CONTORNO, [5, 12], [5, -12])
    expect(c.dobleces).toEqual([])
  })

  it('deshacer quita lo último que se sumó', () => {
    const c = hasta(SIN_CONTORNO, [0, 10], [40, 6])
    const sin = deshacerLaUltima(c)
    expect(sin.dobleces).toEqual([{ sMm: 0, flexionGrados: 10, torsionGrados: 0 }])
    expect(deshacerLaUltima(deshacerLaUltima(c)).dobleces).toEqual([])
    expect(deshacerLaUltima(SIN_CONTORNO)).toBe(SIN_CONTORNO)
  })
})

describe('la fatiga y los orificios', () => {
  it('doblar de ida y vuelta en el mismo sitio fatiga el metal', () => {
    let c = hasta(SIN_CONTORNO, [0, 10])
    expect(inversionesEn(c, 0)).toBe(0)
    c = hasta(c, [0, -4])
    expect(inversionesEn(c, 0)).toBe(1)
    expect(sitiosFatigados(c)).toEqual([])
    c = hasta(c, [0, 8])
    expect(inversionesEn(c, 0)).toBe(INVERSIONES_QUE_FATIGAN)
    expect(sitiosFatigados(c)).toEqual([0])
    // En otro sitio no se contó nada.
    expect(inversionesEn(c, 60)).toBe(0)
  })

  it('seguir doblando hacia el mismo lado no fatiga', () => {
    const c = hasta(SIN_CONTORNO, [0, 5], [0, 5], [0, 5])
    expect(inversionesEn(c, 0)).toBe(0)
  })

  it('un orificio bajo el doblez queda deformado; entre orificios, no', () => {
    const orificios = [-30, -10, 10, 30]
    const entre = hasta(SIN_CONTORNO, [0, 15])
    expect(orificiosDeformados(entre, orificios)).toEqual([])
    const sobre = hasta(SIN_CONTORNO, [10, 15])
    expect(orificiosDeformados(sobre, orificios)).toEqual([2])
    // La torsión se reparte en más largo y alcanza más orificios.
    const torcida = hasta(SIN_CONTORNO, [0, 0, 20])
    expect(orificiosDeformados(torcida, orificios).length).toBeGreaterThan(0)
  })

  it('antes de doblar se sabe sobre qué orificio caería el doblez', () => {
    const orificios = [-30, -10, 10, 30]
    expect(orificioBajoElDoblez(orificios, 11)).toBe(2)
    expect(orificioBajoElDoblez(orificios, 0)).toBeNull()
    expect(orificioBajoElDoblez(orificios, 12)).toBe(2)
    // El alcance de la mordaza: media mordaza más el radio del orificio.
    expect(orificioBajoElDoblez(orificios, 10 + LARGO_DE_LA_FLEXION_MM / 2 + 3.6)).toBeNull()
  })
})

describe('la geometría del contorno', () => {
  const MITAD = 60

  it('una flexión inclina la placa más allá del doblez, y el centro no se mueve', () => {
    // El doblez a 20 mm del centro: el lado del centro sigue recto y el otro queda inclinado 30° hacia la cara de arriba.
    const c = hasta(SIN_CONTORNO, [20, 30])
    const mapa = crearMapaDelContorno(c, MITAD)
    expect(mapa(0, 0, 0)).toEqual([0, 0, 0])
    const direccion = (s0: number, s1: number) => {
      const a = mapa(0, 0, s0)
      const b = mapa(0, 0, s1)
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const largo = Math.hypot(...d)
      return d.map((x) => x / largo)
    }
    const lejos = direccion(40, 44)
    expect(lejos[1]).toBeCloseTo(Math.sin((30 * Math.PI) / 180), 2)
    expect(lejos[2]).toBeCloseTo(Math.cos((30 * Math.PI) / 180), 2)
    expect(lejos[0]).toBeCloseTo(0, 6)
    // Del centro hacia el otro extremo, y hasta antes del doblez, la placa sigue recta.
    const recto = direccion(-44, 10)
    expect(recto[1]).toBeCloseTo(0, 6)
    expect(recto[2]).toBeCloseTo(1, 6)
  })

  it('un doblez en el centro reparte el giro a los dos lados: el centro es el punto fijo', () => {
    const mapa = crearMapaDelContorno(hasta(SIN_CONTORNO, [0, 30]), MITAD)
    const lado = (s0: number, s1: number) => {
      const a = mapa(0, 0, s0)
      const b = mapa(0, 0, s1)
      return (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    }
    expect(lado(30, 40)).toBeCloseTo(Math.sin((15 * Math.PI) / 180), 2)
    expect(lado(-40, -30)).toBeCloseTo(-Math.sin((15 * Math.PI) / 180), 2)
  })

  it('la placa se dobla sin estirarse: el largo a lo largo del eje se conserva', () => {
    const c = hasta(SIN_CONTORNO, [0, 25], [30, -15])
    const mapa = crearMapaDelContorno(c, MITAD)
    let largo = 0
    let previo = mapa(0, 0, -MITAD)
    for (let s = -MITAD + 1; s <= MITAD; s += 1) {
      const p = mapa(0, 0, s)
      largo += Math.hypot(p[0] - previo[0], p[1] - previo[1], p[2] - previo[2])
      previo = p
    }
    expect(largo).toBeCloseTo(2 * MITAD, 0)
  })

  it('la flecha crece con la flexión y es cero sin ella', () => {
    const poca = flechaDeLaCurva(hasta(SIN_CONTORNO, [0, 10]), MITAD)
    const mucha = flechaDeLaCurva(hasta(SIN_CONTORNO, [0, 30]), MITAD)
    expect(poca).toBeGreaterThan(0)
    expect(mucha).toBeGreaterThan(poca * 2)
    expect(flechaDeLaCurva(SIN_CONTORNO, MITAD)).toBe(0)
  })

  it('la torsión hace girar el ancho de la placa alrededor de su eje', () => {
    const c = hasta(SIN_CONTORNO, [0, 0, 40])
    const mapa = crearMapaDelContorno(c, MITAD)
    // Lejos del doblez, el borde de la derecha (u = 5) se levantó en v por la torsión; el de la izquierda bajó.
    const derecha = mapa(5, 0, 40)
    const izquierda = mapa(-5, 0, 40)
    expect(derecha[1]).toBeGreaterThan(1)
    expect(izquierda[1]).toBeLessThan(-1)
    // Y el eje no se salió de la línea recta.
    const eje = mapa(0, 0, 40)
    expect(Math.hypot(eje[0], eje[1])).toBeLessThan(0.01)
  })

  it('doblar hacia un lado y hacia el otro es simétrico', () => {
    const arriba = crearMapaDelContorno(hasta(SIN_CONTORNO, [0, 20]), MITAD)(0, 0, 50)
    const abajo = crearMapaDelContorno(hasta(SIN_CONTORNO, [0, -20]), MITAD)(0, 0, 50)
    expect(arriba[1]).toBeCloseTo(-abajo[1], 6)
    expect(arriba[2]).toBeCloseTo(abajo[2], 6)
  })

  it('el texto dice cuántos dobleces, cuánta flexión y cuánta flecha', () => {
    const c = hasta(SIN_CONTORNO, [0, 15], [30, 10], [-30, 0, 12])
    const t = textoDelContorno(c, MITAD)
    expect(t).toMatch(/3 dobleces/)
    expect(t).toMatch(/flexión total 25°/)
    expect(t).toMatch(/torsión total 12°/)
    expect(t).toMatch(/flecha/)
    expect(textoDelContorno(hasta(SIN_CONTORNO, [0, 5]), MITAD)).toMatch(/1 doblez ·/)
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  desviosAlrededor,
  FONDO_PARA_PREFERIR_MM,
  MARGEN_PARA_ARRASTRAR_PX,
  RADIO_ALREDEDOR_PX,
  superaElMargen,
  trozoQueSeAgarra,
} from '@/lib/agarrarElTrozo'

/**
 * Qué trozo agarra el clic (P-013, pedido 6 de Cristóbal: «al intentar tomar el fragmento de fíbula, pesco el talo y
 * desarmo todo»). La escena del tobillo, con nombres: el peroné partido en dos trozos del foco, el astrágalo y la tibia,
 * que no lo son.
 */

const delFoco = new Set(['Perone_fragmento_distal', 'Perone_fragmento_proximal'])
const esDelFoco = (p: string) => delFoco.has(p)
const g = (pieza: string, distanciaMm: number) => ({ pieza, distanciaMm })

describe('el trozo que se agarra (P-013, pedido 6)', () => {
  it('el peroné tocado de frente se agarra, como siempre', () => {
    expect(trozoQueSeAgarra([g('Perone_fragmento_distal', 300), g('Astragalo', 308)], [], { elegida: null, esDelFoco })).toBe('Perone_fragmento_distal')
  })

  it('el astrágalo delante del peroné, a menos de 3 cm: gana el peroné', () => {
    expect(trozoQueSeAgarra([g('Astragalo', 300), g('Perone_fragmento_distal', 309)], [], { elegida: null, esDelFoco })).toBe('Perone_fragmento_distal')
  })

  it('un trozo del foco al otro lado de la pierna no se agarra a través del hueso', () => {
    const lejos = 300 + FONDO_PARA_PREFERIR_MM + 25
    expect(trozoQueSeAgarra([g('Astragalo', 300), g('Perone_fragmento_distal', lejos)], [], { elegida: null, esDelFoco })).toBe('Astragalo')
  })

  it('el clic cae en el astrágalo a un pelo del peroné: los rayos de alrededor lo encuentran', () => {
    const alrededor = [g('Perone_fragmento_distal', 299), g('Perone_fragmento_distal', 300), g('Astragalo', 305), g('Tibia', 320)]
    expect(trozoQueSeAgarra([g('Astragalo', 304)], alrededor, { elegida: null, esDelFoco })).toBe('Perone_fragmento_distal')
  })

  it('sin nada del foco cerca, el primer hueso: el astrágalo se sigue pudiendo mover apuntándole', () => {
    expect(trozoQueSeAgarra([g('Astragalo', 304), g('Tibia', 320)], [g('Astragalo', 303), g('Tibia', 321)], { elegida: null, esDelFoco })).toBe('Astragalo')
  })

  it('lo que se estaba moviendo gana a otro trozo del foco que esté delante', () => {
    expect(
      trozoQueSeAgarra([g('Perone_fragmento_proximal', 300), g('Tibia', 305)], [], { elegida: 'Tibia', esDelFoco }),
    ).toBe('Perone_fragmento_proximal')
    expect(trozoQueSeAgarra([g('Astragalo', 300), g('Tibia', 305), g('Perone_fragmento_distal', 310)], [], { elegida: 'Tibia', esDelFoco })).toBe('Tibia')
  })

  it('alrededor, empatados en rayos, gana el que se estaba moviendo', () => {
    const alrededor = [g('Perone_fragmento_distal', 300), g('Perone_fragmento_proximal', 299)]
    expect(trozoQueSeAgarra([g('Astragalo', 304)], alrededor, { elegida: 'Perone_fragmento_distal', esDelFoco })).toBe('Perone_fragmento_distal')
  })

  it('un clic en el vacío no agarra nada aunque haya un trozo al lado', () => {
    expect(trozoQueSeAgarra([], [g('Perone_fragmento_distal', 300)], { elegida: null, esDelFoco })).toBeNull()
  })
})

describe('el margen antes de arrastrar', () => {
  it('el temblor del clic no mueve el trozo; cinco píxeles más, sí', () => {
    expect(MARGEN_PARA_ARRASTRAR_PX).toBe(5)
    expect(superaElMargen(3, 3)).toBe(false)
    expect(superaElMargen(4, 3)).toBe(false)
    expect(superaElMargen(4, 4)).toBe(true)
  })

  it('ocho rayos de alrededor, todos a la misma distancia del cursor', () => {
    const desvios = desviosAlrededor()
    expect(desvios).toHaveLength(8)
    for (const [x, y] of desvios) expect(Math.hypot(x, y)).toBeCloseTo(RADIO_ALREDEDOR_PX, 1)
  })
})

describe('el lienzo', () => {
  const lienzo = readFileSync(join(process.cwd(), 'src/components/simulador/LienzoQuirurgico.tsx'), 'utf8')
  const consola = readFileSync(join(process.cwd(), 'src/components/simulador/ConsolaQuirurgica.tsx'), 'utf8')
  const instrumentos = readFileSync(join(process.cwd(), 'src/lib/comportamientoDelInstrumento.ts'), 'utf8')

  it('«Mover» y la pinza agarran por la regla, y el primer hueso del rayo sigue siendo para lo demás', () => {
    expect(lienzo).toContain('const golpe = trozoBajoElCursor()')
    expect(lienzo).toContain('trozoQueSeAgarra(')
    // `huesoBajoElCursor` no cambia: la broca, la placa y el medidor siguen apuntando al primer hueso.
    expect(lienzo).toContain('const huesoBajoElCursor = (): THREE.Intersection | null =>\n      rayo.intersectObjects(mallasDeHueso(), false).find((g) => g.object.visible) ?? null')
  })

  it('lo que se agarraría se resalta al pasar el cursor', () => {
    expect(lienzo).toContain("const NOMBRE_DEL_TINTE_DEL_AGARRE = 'tinte-del-agarre'")
    expect(lienzo).toContain('resaltarLoQueSeAgarra(')
  })

  it('el arrastre del trozo espera el margen', () => {
    expect(lienzo).toContain('superaElMargen(')
  })

  it('ningún texto manda ya a «las flechas y los aros», que desde D-250 salen solo con «Asas libres»', () => {
    for (const texto of [lienzo, consola, instrumentos]) expect(texto).not.toMatch(/con las flechas y los aros/)
  })
})

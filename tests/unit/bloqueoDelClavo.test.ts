import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comportamientoDelInstrumento } from '@/lib/comportamientoDelInstrumento'
import {
  PUNTERIA_QUE_ACIERTA_MM,
  PUNTERIA_QUE_ROZA_MM,
  destornilladorDelNombre,
  juzgarElApriete,
  juzgarElBloqueo,
  juzgarLaPunteria,
  orificiosDelClavo,
  posicionDelOrificioMm,
  tallaDeLaCabeza,
  torqueDelTornillo,
  torqueEnElNombre,
} from '@/lib/bloqueoDelClavo'

/** El bloqueo del clavo y el apriete de los tornillos (P-005 E6). */

describe('los orificios del clavo', () => {
  it('el tibial trae tres proximales, el del medio dinámico, y tres distales', () => {
    const o = orificiosDelClavo('Clavo tibial 9 × 330 mm')
    expect(o.map((x) => x.id)).toEqual(['P1', 'P2', 'P3', 'D1', 'D2', 'D3'])
    expect(o.filter((x) => x.dinamico).map((x) => x.id)).toEqual(['P2'])
  })

  it('el femoral trae dos proximales y tres distales', () => {
    expect(orificiosDelClavo('Clavo femoral 11 × 380 mm').map((x) => x.id)).toEqual(['P1', 'P2', 'D1', 'D2', 'D3'])
  })

  it('el cefalomedular se bloquea con su tornillo cefálico: no trae orificios', () => {
    expect(orificiosDelClavo('Clavo cefalomedular PFN 10 × 240 mm')).toEqual([])
  })

  it('uno que no se reconoce trae dos y dos', () => {
    expect(orificiosDelClavo('Clavo humeral 8 × 240 mm').map((x) => x.id)).toEqual(['P1', 'P2', 'D1', 'D2'])
  })

  it('cada zona se mide desde su extremo y se separa 15 mm', () => {
    const o = orificiosDelClavo('Clavo tibial 9 × 330 mm')
    expect(o.filter((x) => x.zona === 'distal').map((x) => x.desdeElExtremoMm)).toEqual([15, 30, 45])
  })
})

describe('dónde cae cada orificio', () => {
  it('los proximales se cuentan desde el extremo proximal del clavo y los distales desde la punta', () => {
    const clavo = { avanceMm: 336, largoMm: 330 }
    const o = orificiosDelClavo('Clavo tibial 9 × 330 mm')
    // El extremo proximal está a 6 mm de la entrada; la punta, a 336.
    expect(posicionDelOrificioMm(clavo, o[0])).toBe(21)
    expect(posicionDelOrificioMm(clavo, o[3])).toBe(321)
  })

  it('al avanzar el clavo los orificios avanzan con él', () => {
    const o = orificiosDelClavo('Clavo tibial 9 × 330 mm')[3]
    expect(posicionDelOrificioMm({ avanceMm: 346, largoMm: 330 }, o) - posicionDelOrificioMm({ avanceMm: 336, largoMm: 330 }, o)).toBe(10)
  })
})

describe('la puntería del tornillo de bloqueo', () => {
  it('con el arco montado acierta siempre', () => {
    expect(juzgarLaPunteria({ desviacionMm: 20, guiadoPorElArco: true, orificio: 'P1' })).toEqual({ punteria: 'acierta', bloquea: true, aviso: null })
  })

  it('a pulso, dentro de 2 mm acierta', () => {
    expect(juzgarLaPunteria({ desviacionMm: PUNTERIA_QUE_ACIERTA_MM, guiadoPorElArco: false, orificio: 'D1' }).punteria).toBe('acierta')
  })

  it('entre 2 y 4 mm roza el borde: traba, pero avisa', () => {
    const j = juzgarLaPunteria({ desviacionMm: 3, guiadoPorElArco: false, orificio: 'D2' })
    expect(j).toMatchObject({ punteria: 'roza', bloquea: true })
    expect(j.aviso).toMatch(/D2 roza el borde/)
  })

  it('a más de 4 mm pasa junto al clavo y no bloquea, aunque la desviación sea negativa', () => {
    const j = juzgarLaPunteria({ desviacionMm: -(PUNTERIA_QUE_ROZA_MM + 1), guiadoPorElArco: false, orificio: 'D3' })
    expect(j).toMatchObject({ punteria: 'falla', bloquea: false })
    expect(j.aviso).toMatch(/no lo bloquea/)
  })
})

describe('el bloqueo del clavo', () => {
  it('sin tornillos el clavo no está bloqueado', () => {
    expect(juzgarElBloqueo({ proximales: 0, distales: 0 })).toMatchObject({ suficiente: false })
  })

  it('falta uno de los dos lados, y un solo distal es débil', () => {
    expect(juzgarElBloqueo({ proximales: 1, distales: 0 }).aviso).toMatch(/Falta el bloqueo distal/)
    expect(juzgarElBloqueo({ proximales: 0, distales: 2 }).aviso).toMatch(/Falta el bloqueo proximal/)
    expect(juzgarElBloqueo({ proximales: 1, distales: 1 }).aviso).toMatch(/un solo tornillo distal/)
  })

  it('uno arriba y dos abajo es suficiente', () => {
    expect(juzgarElBloqueo({ proximales: 1, distales: 2 })).toEqual({ suficiente: true, aviso: null })
  })
})

describe('los destornilladores', () => {
  it('se reconocen por su nombre', () => {
    expect(destornilladorDelNombre('Destornillador hexagonal 2,5 con mango en T')).toEqual({ tipo: 'hexagonal', talla: null })
    expect(destornilladorDelNombre('Destornillador Stardrive T15')).toEqual({ tipo: 'stardrive', talla: 15 })
    expect(destornilladorDelNombre('Atornillador de bloqueo')).toEqual({ tipo: 'stardrive', talla: null })
  })

  it('el torque y la talla de la cabeza salen del diámetro', () => {
    expect([2.4, 3.5, 5].map(torqueDelTornillo)).toEqual([0.8, 1.5, 4])
    expect([2.4, 3.5, 5].map(tallaDeLaCabeza)).toEqual([8, 15, 25])
  })

  it('el limitador dice sus N·m en su nombre', () => {
    expect(torqueEnElNombre('Limitador de torque 1,5 N·m')).toBe(1.5)
    expect(torqueEnElNombre('Limitador de torque 4,0 N·m')).toBe(4)
    expect(torqueEnElNombre('Limitador de torque')).toBeNull()
  })
})

describe('apretar un tornillo', () => {
  const cortical = { bloqueado: false, diametroMm: 3.5, deClavo: false }
  const bloqueado = { bloqueado: true, diametroMm: 3.5, deClavo: false }
  const deClavo = { bloqueado: true, diametroMm: 5, deClavo: true }
  const hexagonal = { tipo: 'hexagonal' as const, talla: null }
  const stardrive = (talla: number | null) => ({ tipo: 'stardrive' as const, talla })

  it('una cabeza normal se aprieta con el hexagonal, sin avisos', () => {
    expect(juzgarElApriete({ tornillo: cortical, destornillador: hexagonal, limitadorNm: null })).toEqual({ apretado: true, aviso: null, texto: 'con hexagonal' })
  })

  it('el hexagonal no calza en una cabeza bloqueada ni el Stardrive en una normal', () => {
    expect(juzgarElApriete({ tornillo: bloqueado, destornillador: hexagonal, limitadorNm: 1.5 })).toMatchObject({ apretado: false })
    expect(juzgarElApriete({ tornillo: bloqueado, destornillador: hexagonal, limitadorNm: 1.5 }).aviso).toMatch(/Stardrive T15.*no calza/)
    expect(juzgarElApriete({ tornillo: cortical, destornillador: stardrive(15), limitadorNm: null }).aviso).toMatch(/hexagonal/)
  })

  it('una talla Stardrive que no es la de la cabeza no calza', () => {
    const j = juzgarElApriete({ tornillo: deClavo, destornillador: stardrive(15), limitadorNm: null })
    expect(j.apretado).toBe(false)
    expect(j.aviso).toMatch(/T15 no calza en una cabeza T25/)
  })

  it('una cabeza bloqueada de placa, con su limitador, queda bien apretada', () => {
    expect(juzgarElApriete({ tornillo: bloqueado, destornillador: stardrive(15), limitadorNm: 1.5 })).toEqual({
      apretado: true,
      aviso: null,
      texto: 'con Stardrive T15 y limitador de 1,5 N·m',
    })
  })

  it('sin limitador se aprieta pero avisa del sobre-apriete', () => {
    const j = juzgarElApriete({ tornillo: bloqueado, destornillador: stardrive(15), limitadorNm: null })
    expect(j.apretado).toBe(true)
    expect(j.aviso).toMatch(/sin limitador.*sobre-apretar.*1,5 N·m/)
  })

  it('un limitador flojo salta antes de apretar; uno fuerte deja barrer la rosca', () => {
    expect(juzgarElApriete({ tornillo: bloqueado, destornillador: stardrive(15), limitadorNm: 0.8 })).toMatchObject({ apretado: false })
    const fuerte = juzgarElApriete({ tornillo: bloqueado, destornillador: stardrive(15), limitadorNm: 4 })
    expect(fuerte.apretado).toBe(true)
    expect(fuerte.aviso).toMatch(/barrer la rosca/)
  })

  it('el tornillo de bloqueo del clavo no lleva limitador', () => {
    expect(juzgarElApriete({ tornillo: deClavo, destornillador: stardrive(25), limitadorNm: null })).toMatchObject({ apretado: true, aviso: null })
  })
})

describe('las herramientas de atornillar y su cableado', () => {
  it('los destornilladores y el limitador se reconocen por slug y por nombre', () => {
    const casos: [string | undefined, string, string][] = [
      ['destornillador-hexagonal', 'Destornillador hexagonal 2,5 con mango en T', 'destornillador'],
      ['destornillador-stardrive', 'Destornillador Stardrive T15', 'destornillador'],
      [undefined, 'Atornillador de bloqueo', 'destornillador'],
      ['limitador-torque', 'Limitador de torque 1,5 N·m', 'limitador'],
    ]
    for (const [slug, nombre, tipo] of casos) {
      expect(comportamientoDelInstrumento({ slug, nombre }).atornilla?.tipo, nombre).toBe(tipo)
    }
  })

  it('el limitador lleva sus N·m y una broca no atornilla', () => {
    expect(comportamientoDelInstrumento({ slug: 'limitador-torque', nombre: 'Limitador de torque 1,5 N·m' }).atornilla).toEqual({ tipo: 'limitador', torqueNm: 1.5 })
    expect(comportamientoDelInstrumento({ slug: 'broca-3-2', nombre: 'Broca AO 3,2 mm' }).atornilla).toBeNull()
  })

  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')

  it('el lienzo pone el tornillo de bloqueo por el orificio del clavo y aprieta con el destornillador', () => {
    const lienzo = leer('src/components/simulador/LienzoQuirurgico.tsx')
    expect(lienzo).toContain('posicionDelOrificioMm')
    expect(leer('src/components/simulador/enclavadoEnLaEscena.ts')).toContain('orificiosDelClavo')
    expect(lienzo).toContain('juzgarLaPunteria')
    expect(lienzo).toContain('juzgarElApriete')
    expect(lienzo).not.toContain('todavía no hay clavo en el hueso del simulador')
  })

  it('la consola ofrece el recuadro de apretar', () => {
    expect(leer('src/components/simulador/ConsolaQuirurgica.tsx')).toContain('bloqueDelAtornillado')
  })
})

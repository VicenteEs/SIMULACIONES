import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comportamientoDelInstrumento } from '@/lib/comportamientoDelInstrumento'
import {
  ANGULACION_QUE_PASA_GRADOS,
  CABEZAS_DE_FRESA_MM,
  DESPLAZAMIENTO_QUE_PASA_CON_DEDO_MM,
  DESPLAZAMIENTO_QUE_PASA_MM,
  ENCLAVADO_VACIO,
  ENTRADA_ACEPTABLE_DESDE_EL_EXTREMO_MM,
  MARGEN_DISTAL_DE_LA_GUIA_MM,
  avanceMaximoDeLaGuia,
  guiaPasada,
  juzgarElFresado,
  juzgarElPasoDeLaGuia,
  juzgarLaEntrada,
  listaDelEnclavado,
  loQueFaltaParaElClavo,
  clavoPrevisto,
  medidasDelClavoEnElNombre,
  siguienteCabeza,
  type EstadoDelEnclavado,
} from '@/lib/enclavado'

/** El enclavado endomedular: entrada, guía, dedo reductor, fresado y cambio de guía (P-005 E4). */

describe('el punto de entrada', () => {
  it('cerca del extremo, en línea con el canal y por delante es buena y no avisa', () => {
    const j = juzgarLaEntrada({ desdeElExtremoMm: 15, desviacionMm: 2, anteriorMm: 8 })
    expect(j).toEqual({ buena: true, aviso: null })
  })

  it('una entrada posterior no es una entrada', () => {
    const j = juzgarLaEntrada({ desdeElExtremoMm: 15, desviacionMm: 2, anteriorMm: -3 })
    expect(j.buena).toBe(false)
    expect(j.aviso).toMatch(/cara posterior/)
  })

  it('demasiado distal topa con la cortical posterior', () => {
    const j = juzgarLaEntrada({ desdeElExtremoMm: ENTRADA_ACEPTABLE_DESDE_EL_EXTREMO_MM + 5, desviacionMm: 0, anteriorMm: 8 })
    expect(j.buena).toBe(false)
    expect(j.aviso).toMatch(/demasiado distal/)
  })

  it('muy desviada de la línea del canal manda el clavo a un lado', () => {
    const j = juzgarLaEntrada({ desdeElExtremoMm: 15, desviacionMm: 12, anteriorMm: 8 })
    expect(j.buena).toBe(false)
    expect(j.aviso).toMatch(/valgo o en varo/)
  })

  it('entre lo ideal y lo aceptable sirve, pero lo dice', () => {
    const j = juzgarLaEntrada({ desdeElExtremoMm: 33, desviacionMm: 3, anteriorMm: 8 })
    expect(j.buena).toBe(true)
    expect(j.aviso).toMatch(/aceptable, pero no ideal/)
  })
})

describe('el paso de la guía por el foco', () => {
  it('con los canales alineados pasa', () => {
    expect(juzgarElPasoDeLaGuia({ desplazamientoMm: 2, angulacionGrados: 4 }, false)).toEqual({ pasa: true, aviso: null })
  })

  it('con los canales desalineados se atasca, y el aviso ofrece el dedo reductor', () => {
    const j = juzgarElPasoDeLaGuia({ desplazamientoMm: DESPLAZAMIENTO_QUE_PASA_MM + 2, angulacionGrados: 0 }, false)
    expect(j.pasa).toBe(false)
    expect(j.aviso).toMatch(/se atasca en el foco.*dedo reductor/)
  })

  it('el dedo reductor deja pasar un desplazamiento que sin él se atasca', () => {
    const r = { desplazamientoMm: DESPLAZAMIENTO_QUE_PASA_MM + 2, angulacionGrados: 0 }
    expect(juzgarElPasoDeLaGuia(r, false).pasa).toBe(false)
    expect(juzgarElPasoDeLaGuia(r, true).pasa).toBe(true)
    expect(juzgarElPasoDeLaGuia({ ...r, desplazamientoMm: DESPLAZAMIENTO_QUE_PASA_CON_DEDO_MM + 1 }, true).pasa).toBe(false)
  })

  it('un foco muy angulado tampoco se pasa, aunque esté centrado', () => {
    const j = juzgarElPasoDeLaGuia({ desplazamientoMm: 0, angulacionGrados: ANGULACION_QUE_PASA_GRADOS + 3 }, false)
    expect(j.pasa).toBe(false)
    expect(j.aviso).toMatch(/angulado/)
  })

  it('si no pasa, la guía se detiene en el foco; si pasa, llega cerca del extremo distal', () => {
    expect(avanceMaximoDeLaGuia({ largoDelCanalMm: 340, distanciaAlFocoMm: 150, pasa: false })).toBe(150)
    expect(avanceMaximoDeLaGuia({ largoDelCanalMm: 340, distanciaAlFocoMm: 150, pasa: true })).toBe(340 - MARGEN_DISTAL_DE_LA_GUIA_MM)
    // Sin saber dónde está el foco no hay con qué detenerla.
    expect(avanceMaximoDeLaGuia({ largoDelCanalMm: 340, distanciaAlFocoMm: null, pasa: false })).toBe(340 - MARGEN_DISTAL_DE_LA_GUIA_MM)
  })

  it('cruzar el foco y llegar al fondo son cosas distintas', () => {
    expect(guiaPasada({ avanceMm: 100, distanciaAlFocoMm: 150, largoDelCanalMm: 340 })).toEqual({ cruzaElFoco: false, llegaAlFondo: false })
    expect(guiaPasada({ avanceMm: 200, distanciaAlFocoMm: 150, largoDelCanalMm: 340 })).toEqual({ cruzaElFoco: true, llegaAlFondo: false })
    expect(guiaPasada({ avanceMm: 330, distanciaAlFocoMm: 150, largoDelCanalMm: 340 })).toEqual({ cruzaElFoco: true, llegaAlFondo: true })
  })
})

describe('el fresado', () => {
  it('sube de 0,5 en 0,5 hasta 1 mm sobre el clavo y queda listo', () => {
    const j = juzgarElFresado([8.5, 9, 9.5, 10], 9)
    expect(j).toMatchObject({ listo: true, mayorMm: 10, aviso: null })
  })

  it('un salto de más de 1 mm calienta el hueso', () => {
    const j = juzgarElFresado([8.5, 10.5], 9)
    expect(j.listo).toBe(false)
    expect(j.aviso).toMatch(/salto de más de 1 mm calienta el hueso/)
  })

  it('empezar con una cabeza demasiado grande para el istmo avisa', () => {
    expect(juzgarElFresado([11], 9).aviso).toMatch(/demasiado grande para el istmo/)
  })

  it('con menos de 1 mm sobre el clavo falta fresar, y con más de 2 se fresó de más', () => {
    expect(juzgarElFresado([8.5, 9], 9)).toMatchObject({ listo: false })
    expect(juzgarElFresado([8.5, 9], 9).aviso).toMatch(/Falta fresar.*10 mm/)
    const de_mas = juzgarElFresado([8.5, 9, 9.5, 10, 10.5, 11, 11.5], 9)
    expect(de_mas.listo).toBe(true)
    expect(de_mas.aviso).toMatch(/de más/)
  })

  it('sin clavo conocido no se puede dar por listo, pero el modo de subir sí se juzga', () => {
    expect(juzgarElFresado([8.5, 9], null)).toMatchObject({ listo: false, aviso: null })
    expect(juzgarElFresado([8.5, 11], null).aviso).toMatch(/salto/)
    expect(juzgarElFresado([], 9)).toEqual({ listo: false, mayorMm: 0, aviso: null })
  })

  it('la cabeza que sigue es la inmediata mayor; la primera si no pasó ninguna; ninguna si ya no hay', () => {
    expect(siguienteCabeza([])).toBe(CABEZAS_DE_FRESA_MM[0])
    expect(siguienteCabeza([8.5, 9])).toBe(9.5)
    expect(siguienteCabeza([CABEZAS_DE_FRESA_MM[CABEZAS_DE_FRESA_MM.length - 1]])).toBeNull()
  })
})

describe('las medidas del clavo en su nombre', () => {
  it('lee diámetro y largo', () => {
    expect(medidasDelClavoEnElNombre('Clavo tibial 9 × 330 mm')).toEqual({ diametroMm: 9, largoMm: 330 })
    expect(medidasDelClavoEnElNombre('Clavo femoral 11 x 380 mm')).toEqual({ diametroMm: 11, largoMm: 380 })
    expect(medidasDelClavoEnElNombre('Clavo cefalomedular PFN 10 × 240 mm')).toEqual({ diametroMm: 10, largoMm: 240 })
  })

  it('un nombre sin medidas, o con medidas absurdas, no da nada', () => {
    expect(medidasDelClavoEnElNombre('Clavo tibial')).toBeNull()
    expect(medidasDelClavoEnElNombre('Broca 2,5 × 30 mm')).toBeNull()
  })
})

describe('el clavo previsto', () => {
  const bandeja = ['Clavo cefalomedular PFN 10 × 240 mm', 'Clavo femoral 11 × 380 mm', 'Clavo tibial 9 × 330 mm', 'Broca AO 3,2 mm']

  it('es el del hueso del caso, no el primero de la bandeja', () => {
    expect(clavoPrevisto(bandeja, 'Tibia (diáfisis)')).toEqual({ diametroMm: 9, largoMm: 330 })
    expect(clavoPrevisto(bandeja, 'Fémur (diáfisis)')).toEqual({ diametroMm: 11, largoMm: 380 })
  })

  it('sin hueso conocido o sin clavo de ese hueso, el primero con medidas', () => {
    expect(clavoPrevisto(bandeja, null)).toEqual({ diametroMm: 10, largoMm: 240 })
    expect(clavoPrevisto(['Clavo femoral 11 × 380 mm'], 'Tibia')).toEqual({ diametroMm: 11, largoMm: 380 })
  })

  it('sin clavos con medidas, nada', () => {
    expect(clavoPrevisto(['Broca AO 3,2 mm', 'Clavo sin medidas'], 'Tibia')).toBeNull()
  })
})

describe('lo que falta para el clavo', () => {
  const completo: EstadoDelEnclavado = {
    entrada: { buena: true, aviso: null, desdeElExtremoMm: 12, desviacionMm: 1 },
    guia: { avanceMm: 330, largoDelCanalMm: 340, atascada: false, cruzaElFoco: true, llegaAlFondo: true, aviso: null },
    dedoPuesto: false,
    fresado: { listo: true, mayorMm: 10, aviso: null, cabezasMm: [8.5, 9, 9.5, 10] },
    guiaCambiada: true,
  }

  it('al principio falta todo, en el orden en que se hace', () => {
    expect(loQueFaltaParaElClavo(ENCLAVADO_VACIO)).toEqual([
      'el punto de entrada',
      'la guía pasada hasta el extremo distal',
      'el fresado',
      'el cambio de la guía con el tubo de intercambio',
    ])
  })

  it('con todo hecho no falta nada', () => {
    expect(loQueFaltaParaElClavo(completo)).toEqual([])
  })

  it('una entrada mala o una guía que no llegó al fondo siguen faltando', () => {
    expect(loQueFaltaParaElClavo({ ...completo, entrada: { ...completo.entrada!, buena: false } })).toEqual(['el punto de entrada'])
    expect(loQueFaltaParaElClavo({ ...completo, guia: { ...completo.guia!, llegaAlFondo: false } })).toEqual(['la guía pasada hasta el extremo distal'])
  })

  it('la lista dice una línea por paso con su estado', () => {
    const l = listaDelEnclavado(completo)
    expect(l.map((x) => x.paso)).toEqual(['Entrada', 'Guía', 'Fresado', 'Cambio de guía'])
    expect(l.every((x) => x.hecho)).toBe(true)
    expect(l[2].texto).toBe('hasta 10 mm (8,5 → 9 → 9,5 → 10)')
    const vacia = listaDelEnclavado(ENCLAVADO_VACIO)
    expect(vacia.map((x) => x.hecho)).toEqual([false, false, false, false])
    expect(vacia[0].texto).toBe('sin marcar')
  })

  it('una guía atascada se dice así', () => {
    const l = listaDelEnclavado({ ...completo, guia: { ...completo.guia!, atascada: true, cruzaElFoco: false, llegaAlFondo: false, avanceMm: 150 } })
    expect(l[1]).toMatchObject({ hecho: false, texto: 'atascada en el foco (150 mm)' })
  })
})

describe('las herramientas del enclavado hacen su paso', () => {
  it('cada una se reconoce por slug y por nombre', () => {
    const casos: [string, string, string][] = [
      ['punzon-iniciador', 'Punzón iniciador curvo (awl)', 'entrada'],
      ['guia-punta-oliva', 'Guía de punta de oliva', 'guia'],
      ['dedo-reductor', 'Dedo reductor endomedular', 'dedo'],
      ['fresa-flexible', 'Fresa flexible canulada', 'fresa'],
      ['tubo-intercambio', 'Tubo de intercambio', 'tubo'],
    ]
    for (const [slug, nombre, funcion] of casos) {
      expect(comportamientoDelInstrumento({ slug, nombre }).enclava, slug).toBe(funcion)
      expect(comportamientoDelInstrumento({ nombre }).enclava, nombre).toBe(funcion)
    }
  })

  it('la fresa canulada ya no es una broca: no perfora', () => {
    expect(comportamientoDelInstrumento({ slug: 'fresa-flexible', nombre: 'Fresa flexible canulada' }).perfora).toBeNull()
  })

  it('una broca o un punzón cualquiera no enclavan', () => {
    expect(comportamientoDelInstrumento({ slug: 'broca-3-2', nombre: 'Broca AO 3,2 mm' }).enclava).toBeNull()
  })

  const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8')
  const lienzo = leer('src/components/simulador/LienzoQuirurgico.tsx')
  const escena = leer('src/components/simulador/enclavadoEnLaEscena.ts')
  const consola = leer('src/components/simulador/ConsolaQuirurgica.tsx')

  it('el lienzo dibuja la guía y el canal fresado, y la fluoroscopia ve la guía y no el canal', () => {
    expect(lienzo).toContain("modo !== 'enclavar'")
    expect(escena).toContain('guia-de-punta-de-oliva')
    expect(escena).toMatch(/canal-fresado[\s\S]{0,400}deInterfaz/)
    expect(escena).not.toMatch(/guia-de-punta-de-oliva[\s\S]{0,300}deInterfaz = true/)
  })

  it('la consola tiene el modo, el recuadro y la manera de quitarlo todo', () => {
    expect(consola).toContain('MODO_ENCLAVAR')
    expect(consola).toContain('bloqueDelEnclavado')
    expect(consola).toContain('quitarElEnclavado')
  })
})

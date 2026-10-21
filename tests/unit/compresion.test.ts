import { describe, expect, it } from 'vitest'
import {
  COMPRESION_MAXIMA_POR_TORNILLO_MM,
  FRACCION_DEL_CENTRO,
  NOMBRE_DE_LA_TECNICA,
  calibresPorFragmento,
  compresionAplicable,
  formaDeLosAgujeros,
  ladoDeLaFractura,
  largoDelOvalMm,
  resultadoDeLaRoscaParcial,
  resultadoDelDeslizamiento,
  resultadoDelOval,
  sumarCompresion,
  zonaDelOval,
} from '@/lib/compresion'

/**
 * La compresión de una fractura (P-004 E10). Estas pruebas son la **especificación legible** de lo que se le asumió a Cristóbal
 * (S6, Q3): si él corrige una regla, se corrige aquí, a la vista, y no dentro del lienzo.
 */

describe('la forma de los orificios', () => {
  it('las de compresión dinámica (DCP, LC-DCP) llevan óvalos', () => {
    expect(formaDeLosAgujeros({ slug: 'placa-dcp-4-5', nombre: 'Placa DCP 4,5 mm estrecha' })).toBe('oval')
    expect(formaDeLosAgujeros({ slug: 'placa-lc-dcp-3-5', nombre: 'Placa LC-DCP 3,5 mm' })).toBe('oval')
  })

  it('las bloqueadas (LCP) llevan orificios combinados', () => {
    expect(formaDeLosAgujeros({ slug: 'placa-lcp-recta-3-5', nombre: 'Placa LCP recta 3,5 mm' })).toBe('combi')
    expect(formaDeLosAgujeros({ nombre: 'Placa LCP anatómica de tibia proximal' })).toBe('combi')
  })

  it('el resto, redondos', () => {
    expect(formaDeLosAgujeros({ slug: 'placa-tercio-de-cana', nombre: 'Placa de tercio de caña' })).toBe('redondo')
    expect(formaDeLosAgujeros({})).toBe('redondo')
  })

  it('el óvalo mide por omisión el doble del diámetro del tornillo', () => {
    expect(largoDelOvalMm(4.5)).toBe(9)
    expect(largoDelOvalMm(3.5)).toBe(7)
  })
})

describe('las tres zonas del óvalo', () => {
  const semilargo = 4.5 // un óvalo de 9 mm

  it('en el centro: a menos de un quinto del semilargo', () => {
    expect(FRACCION_DEL_CENTRO).toBe(0.2)
    expect(zonaDelOval(0, 1, semilargo)).toBe('centro')
    expect(zonaDelOval(0.5, 1, semilargo)).toBe('centro')
    expect(zonaDelOval(-0.9, 1, semilargo)).toBe('centro')
  })

  it('corrida hacia la fractura: cerca; corrida al lado contrario: lejos', () => {
    // La fractura está hacia el lado positivo del eje de la placa.
    expect(zonaDelOval(2, 1, semilargo)).toBe('cerca-de-la-fractura')
    expect(zonaDelOval(-2, 1, semilargo)).toBe('lejos-de-la-fractura')
  })

  it('con la fractura al otro lado, lo mismo con los signos al revés', () => {
    expect(zonaDelOval(2, -1, semilargo)).toBe('lejos-de-la-fractura')
    expect(zonaDelOval(-2, -1, semilargo)).toBe('cerca-de-la-fractura')
  })

  it('el lado de la fractura sale de dónde está respecto del orificio', () => {
    expect(ladoDeLaFractura(10, 30)).toBe(1)
    expect(ladoDeLaFractura(30, 10)).toBe(-1)
    // Justo encima: se toma el positivo.
    expect(ladoDeLaFractura(10, 10)).toBe(1)
  })
})

describe('el tornillo excéntrico', () => {
  const semilargo = 4.5

  it('lejos de la fractura comprime, con 1 mm de tope por tornillo', () => {
    const r = resultadoDelOval(-3, 1, semilargo)
    expect(r.tecnica).toBe('excentrico')
    expect(r.mm).toBe(COMPRESION_MAXIMA_POR_TORNILLO_MM)
    expect(r.texto).toContain('comprime 1,0 mm')
    expect(r.texto).toContain('excéntrico, lejos de la fractura')
  })

  it('con poca excentricidad comprime menos: 2 × la excentricidad, hasta el tope', () => {
    // 1 mm de desviación en un óvalo de 4,5 de semilargo ya es zona «lejos» (más de un quinto: 0,9).
    expect(resultadoDelOval(-1, 1, semilargo).mm).toBe(1)
    expect(resultadoDelOval(-0.95, 1, semilargo).mm).toBe(1)
    // En un óvalo más largo la misma desviación no sale del centro y no comprime.
    expect(resultadoDelOval(-1, 1, 10).mm).toBe(0)
  })

  it('céntrico no comprime y lo dice', () => {
    const r = resultadoDelOval(0, 1, semilargo)
    expect(r.mm).toBe(0)
    expect(r.tecnica).toBeNull()
    expect(r.texto).toContain('céntrico')
  })

  it('cerca de la fractura no comprime y avisa que tiende a separar', () => {
    const r = resultadoDelOval(3, 1, semilargo)
    expect(r.mm).toBe(0)
    expect(r.tecnica).toBeNull()
    expect(r.texto).toContain('tiende a separar')
    expect(r.texto).toContain('concéntrico hacia la fractura')
  })
})

describe('la broca de deslizamiento', () => {
  it('el cercano con un calibre igual o mayor que el exterior y el lejano con el núcleo comprime', () => {
    // Un tornillo cortical de 3,5: núcleo de 2,5.
    const r = resultadoDelDeslizamiento({ cercanoMm: 3.5, lejanoMm: 2.5, diametroExteriorMm: 3.5 })
    expect(r.tecnica).toBe('deslizamiento')
    expect(r.mm).toBe(1)
    expect(r.texto).toContain('desliza')
  })

  it('un cercano más grande que el exterior también sirve', () => {
    expect(resultadoDelDeslizamiento({ cercanoMm: 4.5, lejanoMm: 2.5, diametroExteriorMm: 3.5 }).mm).toBe(1)
  })

  it('con el cercano chico la rosca agarra en los dos y no comprime', () => {
    const r = resultadoDelDeslizamiento({ cercanoMm: 2.5, lejanoMm: 2.5, diametroExteriorMm: 3.5 })
    expect(r.mm).toBe(0)
    expect(r.texto).toContain('la rosca agarra ahí')
  })

  it('con el lejano ancho la rosca no agarra y no comprime', () => {
    const r = resultadoDelDeslizamiento({ cercanoMm: 3.5, lejanoMm: 3.5, diametroExteriorMm: 3.5 })
    expect(r.mm).toBe(0)
    expect(r.texto).toContain('la rosca no agarra')
  })

  it('si falta perforar un fragmento, lo dice', () => {
    expect(resultadoDelDeslizamiento({ cercanoMm: 3.5, lejanoMm: null, diametroExteriorMm: 3.5 }).texto).toContain('Falta perforar')
    expect(resultadoDelDeslizamiento({ cercanoMm: null, lejanoMm: 2.5, diametroExteriorMm: 3.5 }).mm).toBe(0)
  })

  it('el núcleo de un tornillo de 4,5 es 3,2 y el de 6,5 también', () => {
    expect(resultadoDelDeslizamiento({ cercanoMm: 4.5, lejanoMm: 3.2, diametroExteriorMm: 4.5 }).mm).toBe(1)
    expect(resultadoDelDeslizamiento({ cercanoMm: 6.5, lejanoMm: 3.2, diametroExteriorMm: 6.5 }).mm).toBe(1)
  })
})

describe('los calibres por fragmento', () => {
  it('una sola broca grande hasta la fractura: el cercano con ella y el lejano sin perforar', () => {
    const c = calibresPorFragmento([{ diametroMm: 3.5, profundidadMm: 12 }], 15)
    expect(c).toEqual({ cercanoMm: 3.5, lejanoMm: null })
  })

  it('dos tiempos: la grande en el cercano y la chica que pasa la fractura en el lejano', () => {
    const c = calibresPorFragmento(
      [
        { diametroMm: 3.5, profundidadMm: 14 },
        { diametroMm: 2.5, profundidadMm: 30 },
      ],
      15,
    )
    expect(c).toEqual({ cercanoMm: 3.5, lejanoMm: 2.5 })
  })

  it('una sola broca que atraviesa los dos: cercano y lejano con el mismo calibre', () => {
    expect(calibresPorFragmento([{ diametroMm: 2.5, profundidadMm: 30 }], 15)).toEqual({ cercanoMm: 2.5, lejanoMm: 2.5 })
  })

  it('sin perforaciones, nada', () => {
    expect(calibresPorFragmento([], 15)).toEqual({ cercanoMm: null, lejanoMm: null })
  })
})

describe('la rosca parcial', () => {
  it('con toda la rosca en el fragmento lejano comprime', () => {
    // Tornillo de 50 mm con 16 de rosca: la rosca empieza a los 34. La fractura a 25 mm: toda la rosca queda del otro lado.
    const r = resultadoDeLaRoscaParcial({ roscaMm: 16, largoMm: 50, distanciaALaFracturaMm: 25 })
    expect(r.tecnica).toBe('rosca-parcial')
    expect(r.mm).toBe(1)
    expect(r.texto).toContain('toda la rosca')
  })

  it('si la rosca cruza la fractura no comprime y dice por qué', () => {
    // La rosca empieza a los 34 y la fractura está a 40: la rosca la cruza.
    const r = resultadoDeLaRoscaParcial({ roscaMm: 16, largoMm: 50, distanciaALaFracturaMm: 40 })
    expect(r.mm).toBe(0)
    expect(r.texto).toContain('cruza la fractura')
    expect(r.texto).toContain('agarra en los dos fragmentos')
  })

  it('con la fractura justo donde empieza la rosca todavía comprime (medio milímetro de tolerancia)', () => {
    expect(resultadoDeLaRoscaParcial({ roscaMm: 16, largoMm: 50, distanciaALaFracturaMm: 34.4 }).mm).toBe(1)
    expect(resultadoDeLaRoscaParcial({ roscaMm: 16, largoMm: 50, distanciaALaFracturaMm: 35 }).mm).toBe(0)
  })

  it('un tornillo que no llega a la fractura no comprime', () => {
    const r = resultadoDeLaRoscaParcial({ roscaMm: 16, largoMm: 20, distanciaALaFracturaMm: 25 })
    expect(r.mm).toBe(0)
    expect(r.texto).toContain('demasiado corto')
  })
})

describe('sumar y aplicar la compresión', () => {
  it('suma lo que comprimió cada tornillo y recuerda con qué técnicas, sin repetirlas', () => {
    let total = { mm: 0, tecnicas: [] as ('excentrico' | 'deslizamiento' | 'rosca-parcial')[] }
    total = sumarCompresion(total, { mm: 1, tecnica: 'excentrico', texto: '' })
    total = sumarCompresion(total, { mm: 1, tecnica: 'excentrico', texto: '' })
    total = sumarCompresion(total, { mm: 1, tecnica: 'deslizamiento', texto: '' })
    expect(total).toEqual({ mm: 3, tecnicas: ['excentrico', 'deslizamiento'] })
  })

  it('un resultado que no comprime no cambia nada', () => {
    const antes = { mm: 1, tecnicas: ['excentrico' as const] }
    expect(sumarCompresion(antes, { mm: 0, tecnica: null, texto: '' })).toBe(antes)
  })

  it('no se comprime más de lo que hay separado', () => {
    expect(compresionAplicable(1, 3)).toBe(1)
    expect(compresionAplicable(1, 0.4)).toBe(0.4)
    expect(compresionAplicable(1, 0)).toBe(0)
    expect(compresionAplicable(1, -2)).toBe(0)
  })

  it('cada técnica tiene su nombre', () => {
    expect(NOMBRE_DE_LA_TECNICA.excentrico).toBe('tornillo excéntrico')
    expect(NOMBRE_DE_LA_TECNICA.deslizamiento).toBe('broca de deslizamiento')
    expect(NOMBRE_DE_LA_TECNICA['rosca-parcial']).toBe('rosca parcial')
  })
})

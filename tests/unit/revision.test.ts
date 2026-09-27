import { describe, expect, it } from 'vitest'
import { SLUGS_DE_MODULOS } from '@/collections'
import { Patologias } from '@/admin/esquema'
import { textoLlanoALexical } from '@/lib/textoRico'
import {
  MODULOS_EN_REVISION,
  RITMO_MAXIMO_DE_LECTURA,
  SEGUNDOS_MINIMOS_DE_REVISION,
  SEGUNDOS_PARA_DAR_POR_VISTA,
  duracionEnPalabras,
  evaluarValidacion,
  medirEdicion,
  palabrasDe,
  palabrasEnComun,
  palabrasPorSeccion,
  porcentajeEditado,
  ritmoDeRevision,
  seccionesVistas,
  sumarTiempos,
} from '@/lib/revision'

/**
 * Las cuentas de la revisión del contenido (D-142): cuánto se editó una ficha
 * respecto de como llegó y cuándo una validación parece hecha sin leer. Es lo
 * que el dueño va a usar para juzgar a los revisores, así que cada cifra tiene
 * que ser la que él calcularía a mano.
 */

const palabras = (texto: string) => texto.split(' ')

describe('la lista de módulos de la revisión', () => {
  // Está escrita dos veces por un ciclo de importaciones (ver su comentario):
  // esta prueba es la que impide que se separen.
  it('es la de los cinco módulos', () => {
    expect([...MODULOS_EN_REVISION]).toEqual([...SLUGS_DE_MODULOS])
  })
})

describe('palabrasDe', () => {
  it('separa por espacios y deja fuera lo que no tiene letras ni cifras', () => {
    expect(palabrasDe('Fractura  de tibia · 10 mg — (AO 42-A1).')).toEqual([
      'Fractura',
      'de',
      'tibia',
      '10',
      'mg',
      '(AO',
      '42-A1).',
    ])
    expect(palabrasDe('')).toEqual([])
    expect(palabrasDe(null)).toEqual([])
  })
})

describe('palabrasEnComun', () => {
  it('cuenta la subsecuencia común más larga', () => {
    expect(palabrasEnComun(palabras('a b c d'), palabras('a b c d'))).toBe(4)
    expect(palabrasEnComun(palabras('a b c d'), palabras('a x c d'))).toBe(3)
    expect(palabrasEnComun(palabras('a b c d'), palabras('a c d'))).toBe(3)
    expect(palabrasEnComun(palabras('a b c d'), palabras('a b y c d'))).toBe(4)
    expect(palabrasEnComun(palabras('a b c'), palabras('x y z'))).toBe(0)
    expect(palabrasEnComun([], palabras('x y'))).toBe(0)
  })

  it('respeta el orden: las mismas palabras cambiadas de sitio no son comunes todas', () => {
    expect(palabrasEnComun(palabras('a b c d'), palabras('d c b a'))).toBe(1)
  })

  it('un texto largo con pocos cambios se mide exacto y deprisa', () => {
    const original = Array.from({ length: 20_000 }, (_, i) => `p${i % 997}`)
    const revisado = [...original]
    for (const posicion of [10, 500, 7_000, 15_000, 19_990]) revisado[posicion] = 'CAMBIADA'
    revisado.splice(12_000, 0, 'nueva', 'frase')
    const inicio = performance.now()
    expect(palabrasEnComun(original, revisado)).toBe(20_000 - 5)
    expect(performance.now() - inicio).toBeLessThan(1_000)
  })

  it('un texto reescrito entero se aproxima sin mirar el orden, sin colgarse', () => {
    const a = Array.from({ length: 6_000 }, (_, i) => `a${i}`)
    const b = Array.from({ length: 6_000 }, (_, i) => `b${i}`)
    expect(palabrasEnComun(a, b)).toBe(0)
  })
})

describe('porcentajeEditado', () => {
  it('reescribir una de cada diez palabras es un 10 %', () => {
    expect(porcentajeEditado(1000, 1000, 100, 100)).toBe(10)
  })

  it('borrar la décima parte es un 10 %', () => {
    expect(porcentajeEditado(1000, 900, 100, 0)).toBe(10)
  })

  it('añadir lo que acaba siendo la undécima parte es un 9,1 %', () => {
    expect(porcentajeEditado(1000, 1100, 0, 100)).toBe(9.1)
  })

  it('nada que medir es un 0, no un NaN', () => {
    expect(porcentajeEditado(0, 0, 0, 0)).toBe(0)
  })
})

describe('medirEdicion', () => {
  it('mide cada sección y el total, y empareja las secciones por título', () => {
    const original = [
      { seccion: 'Definición', palabras: palabras('la fractura de tibia es frecuente en adultos jóvenes') },
      { seccion: 'Manejo', palabras: palabras('reducción y fijación con clavo endomedular') },
      { seccion: 'Retirada', palabras: palabras('esto ya no existe') },
    ]
    const actual = [
      { seccion: 'Definición', palabras: palabras('la fractura de tibia es frecuente en adultos jóvenes') },
      { seccion: 'Manejo', palabras: palabras('reducción y fijación con placa bloqueada') },
      { seccion: 'Nueva', palabras: palabras('dos palabras') },
    ]
    const medida = medirEdicion(original, actual)
    const de = (titulo: string) => medida.porSeccion.find((s) => s.seccion === titulo)!
    expect(de('Definición').porcentaje).toBe(0)
    // «clavo endomedular» por «placa bloqueada»: dos de seis.
    expect(de('Manejo').porcentaje).toBe(33.3)
    expect(de('Retirada')).toMatchObject({ original: 4, actual: 0, porcentaje: 100 })
    expect(de('Nueva')).toMatchObject({ original: 0, actual: 2, porcentaje: 100 })
    expect(medida.palabrasOriginales).toBe(19)
    expect(medida.palabrasActuales).toBe(17)
    expect(medida.palabrasQuitadas).toBe(6)
    expect(medida.palabrasNuevas).toBe(4)
    expect(medida.porcentaje).toBe(31.6)
  })

  it('una ficha sin tocar es un 0 %', () => {
    const texto = [{ seccion: 'A', palabras: palabras('uno dos tres') }]
    expect(medirEdicion(texto, texto).porcentaje).toBe(0)
  })
})

describe('palabrasPorSeccion', () => {
  it('lee cada pestaña del editor: texto, texto rico, selecciones, relaciones y bloques', () => {
    const documento = {
      nombre: 'Fractura de meseta tibial',
      segmento: 3,
      tipo: 'trauma',
      definicion: [
        {
          blockType: 'texto',
          titulo: 'Qué es',
          cuerpo: textoLlanoALexical('Una fractura articular de la tibia proximal.'),
        },
      ],
      fases: [{ cuando: '0-6 semanas', titulo: 'Proteger', contenido: 'Descarga total', criterio: null }],
    }
    const secciones = palabrasPorSeccion(Patologias, documento)
    expect(secciones.map((s) => s.seccion)).toEqual(Patologias.secciones.map((s) => s.titulo))
    const de = (titulo: string) => secciones.find((s) => s.seccion === titulo)!.palabras
    expect(de('Identificación')).toEqual(['Fractura', 'de', 'meseta', 'tibial', 'segmento=#3', 'tipo=trauma'])
    expect(de('Definición')).toEqual([
      '[texto]',
      'Qué',
      'es',
      'Una',
      'fractura',
      'articular',
      'de',
      'la',
      'tibia',
      'proximal.',
    ])
    expect(de('Rehabilitación')).toEqual(['0-6', 'semanas', 'Proteger', 'Descarga', 'total'])
    expect(de('Manejo')).toEqual([])
  })

  it('un documento vacío no tiene palabras en ninguna sección', () => {
    expect(palabrasPorSeccion(Patologias, null).every((s) => s.palabras.length === 0)).toBe(true)
  })
})

describe('el tiempo de revisión', () => {
  it('suma sesiones y da por vistas las secciones que se tuvieron delante lo bastante', () => {
    const total = sumarTiempos([
      { segundosAbiertos: 100, segundosActivos: 60, ediciones: 2, porSeccion: { Manejo: 3, Definición: 50 } },
      { segundosAbiertos: 20, segundosActivos: 20, ediciones: 1, porSeccion: { Manejo: 3 } },
    ])
    expect(total).toEqual({
      segundosAbiertos: 120,
      segundosActivos: 80,
      ediciones: 3,
      porSeccion: { Manejo: 6, Definición: 50 },
    })
    expect(SEGUNDOS_PARA_DAR_POR_VISTA).toBe(5)
    expect(seccionesVistas(total.porSeccion).sort()).toEqual(['Definición', 'Manejo'])
    expect(seccionesVistas({ Manejo: 4 })).toEqual([])
  })

  it('el ritmo son palabras por minuto de revisión activa', () => {
    expect(ritmoDeRevision(1000, 300)).toBe(200)
    expect(ritmoDeRevision(1000, 0)).toBeNull()
  })
})

describe('evaluarValidacion', () => {
  const secciones = ['Identificación', 'Definición', 'Manejo']

  it('una revisión a ritmo de lectura, con todo abierto, no se señala', () => {
    const juicio = evaluarValidacion({
      palabras: 1500,
      segundosActivos: 600,
      seccionesConContenido: secciones,
      vistas: secciones,
    })
    expect(juicio).toEqual({ rapida: false, ritmo: 150, motivos: [], sinVer: [] })
  })

  it('más deprisa de lo que se lee se señala, con la cifra', () => {
    const juicio = evaluarValidacion({
      palabras: 3000,
      segundosActivos: 120,
      seccionesConContenido: secciones,
      vistas: secciones,
    })
    expect(juicio.rapida).toBe(true)
    expect(juicio.ritmo).toBe(1500)
    expect(juicio.motivos.join(' ')).toMatch(/1500 palabras por minuto/)
    expect(juicio.motivos.join(' ')).toContain(String(RITMO_MAXIMO_DE_LECTURA))
  })

  it('casi sin tiempo se señala por el mínimo, no por el ritmo', () => {
    const juicio = evaluarValidacion({
      palabras: 40,
      segundosActivos: 10,
      seccionesConContenido: secciones,
      vistas: secciones,
    })
    expect(juicio.rapida).toBe(true)
    expect(juicio.motivos).toHaveLength(1)
    expect(juicio.motivos[0]).toContain(`${SEGUNDOS_MINIMOS_DE_REVISION} s`)
  })

  it('una sección con contenido sin abrir se señala y se nombra', () => {
    const juicio = evaluarValidacion({
      palabras: 500,
      segundosActivos: 600,
      seccionesConContenido: secciones,
      vistas: ['Identificación', 'Definición'],
    })
    expect(juicio.rapida).toBe(true)
    expect(juicio.sinVer).toEqual(['Manejo'])
    expect(juicio.motivos).toEqual(['sin abrir la sección «Manejo»'])
  })
})

describe('duracionEnPalabras', () => {
  it('dice segundos, minutos u horas según toque', () => {
    expect(duracionEnPalabras(45)).toBe('45 s')
    expect(duracionEnPalabras(180)).toBe('3 min')
    expect(duracionEnPalabras(3600)).toBe('1 h')
    expect(duracionEnPalabras(4800)).toBe('1 h 20 min')
  })
})

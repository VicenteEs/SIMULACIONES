import { describe, expect, it } from 'vitest'
import {
  diaDeLaSemana,
  franjaConMasUso,
  franjaEnPalabras,
  horaDeLaClave,
  mapaDeUso,
  parteEntreSemana,
  resumirLecturas,
} from '@/lib/tableroDeActividad'
import { iniciales } from '@/lib/iniciales'

/**
 * Las cuentas del tablero de Actividad (P-007 E5, D-238).
 *
 * Las fechas se arman en hora local y no con texto ISO fijo: las cuentas
 * deciden el día en la zona del servidor (`series.ts`), y una prueba escrita en
 * UTC pasaría en un sitio y fallaría en otro según dónde corra.
 */

const local = (anio: number, mes: number, dia: number, hora = 12) => new Date(anio, mes - 1, dia, hora).toISOString()

describe('las claves de porHora', () => {
  it('acepta la hora con y sin cero delante', () => {
    // El servidor escribe «08»; los datos de demostración, «8». Las dos son las ocho.
    expect(horaDeLaClave('08')).toBe(8)
    expect(horaDeLaClave('8')).toBe(8)
    expect(horaDeLaClave('0')).toBe(0)
    expect(horaDeLaClave('23')).toBe(23)
  })

  it('descarta lo que no es una hora, en vez de convertirlo en la medianoche', () => {
    for (const clave of ['', '24', '8.5', 'mañana', '-1', '008']) expect(horaDeLaClave(clave)).toBeNull()
  })
})

describe('el día de la semana', () => {
  it('empieza el lunes y lee «AAAA-MM-DD» como el día local', () => {
    // El 2 de noviembre de 2026 es lunes. Leído como medianoche UTC, en Chile
    // sería el domingo a las nueve de la noche.
    expect(diaDeLaSemana('2026-11-02')).toBe(0)
    expect(diaDeLaSemana('2026-11-08')).toBe(6)
    expect(diaDeLaSemana('no es una fecha')).toBeNull()
  })
})

describe('el mapa de uso', () => {
  const filas = [
    { dia: '2026-11-02', porHora: { '21': 600, '22': 300 } }, // lunes
    { dia: '2026-11-09', porHora: { '21': 1200 } }, // el lunes siguiente: se suma en la misma celda
    { dia: '2026-11-07', porHora: { '10': 900, '8': 60 } }, // sábado
    { dia: '2026-11-03', porHora: null },
    { dia: '2026-11-04', porHora: ['no', 'es', 'un', 'mapa'] },
    { dia: 'nunca', porHora: { '10': 500 } },
    { dia: '2026-11-05', porHora: { '10': '300', '11': -40, '25': 100 } },
  ]
  const mapa = mapaDeUso(filas)

  it('suma los segundos de cada día de la semana por hora', () => {
    expect(mapa).toHaveLength(7)
    expect(mapa.every((horas) => horas.length === 24)).toBe(true)
    expect(mapa[0][21]).toBe(1800)
    expect(mapa[0][22]).toBe(300)
    expect(mapa[5][10]).toBe(900)
    expect(mapa[5][8]).toBe(60)
  })

  it('no inventa uso con lo que no se puede leer', () => {
    // El texto «300», el negativo y la hora 25 se descartan: el jueves queda vacío.
    expect(mapa[3].every((s) => s === 0)).toBe(true)
    expect(mapa[1].every((s) => s === 0)).toBe(true)
    expect(mapa[2].every((s) => s === 0)).toBe(true)
  })

  it('dice dónde está el pico y qué parte cae entre semana', () => {
    const franja = franjaConMasUso(mapa)
    expect(franja).toEqual({ dia: 0, hora: 21, segundos: 1800 })
    expect(franjaEnPalabras(franja!)).toBe('los lunes de 21 a 22 h')
    expect(parteEntreSemana(mapa)).toBeCloseTo(2100 / 3060)
  })

  it('con el mapa vacío no hay pico ni proporción', () => {
    const vacio = mapaDeUso([])
    expect(franjaConMasUso(vacio)).toBeNull()
    expect(parteEntreSemana(vacio)).toBeNull()
  })
})

describe('las lecturas del periodo', () => {
  const hoy = new Date(2026, 10, 3, 15)
  const abrio = (usuario: unknown, dia: number, mes = 11, documentoId = '7', coleccion = 'patologias') => ({
    fecha: local(2026, mes, dia),
    usuario,
    coleccion,
    documentoId,
    detalle: 'la abrió',
  })

  it('cuenta las aperturas de los últimos 30 días y las de los 30 de antes por separado', () => {
    const r = resumirLecturas(
      [
        abrio(1, 3),
        abrio(1, 3),
        abrio(2, 20, 10),
        // Los 30 días acaban hoy, 3 de noviembre, y empiezan el 5 de octubre;
        // los 30 de antes van del 5 de septiembre al 4 de octubre.
        abrio(3, 5, 10),
        abrio(3, 4, 10),
        abrio(3, 5, 9),
        abrio(3, 4, 9),
      ],
      { hoy },
    )
    expect(r.aperturas).toBe(4)
    expect(r.aperturasAntes).toBe(2)
    expect([...r.personas].sort()).toEqual(['1', '2', '3'])
  })

  it('las aperturas sin detalle son de antes de que se escribiera «la abrió», y también cuentan', () => {
    const r = resumirLecturas([{ fecha: local(2026, 11, 2), usuario: 5, coleccion: 'maniobras', documentoId: 3 }], { hoy })
    expect(r.aperturas).toBe(1)
    expect(r.abiertas).toBe(1)
  })

  it('una marca de leída no es una apertura, y la proporción sale de lo abierto en el periodo', () => {
    const r = resumirLecturas(
      [
        abrio(1, 2, 11, '7'),
        abrio(1, 2, 11, '8'),
        { ...abrio(1, 2, 11, '7'), detalle: 'la marcó como leída' },
        // Marcada dos veces: es una ficha.
        { ...abrio(1, 3, 11, '7'), detalle: 'la marcó como leída' },
        // Marcada sin apertura en el periodo: cuenta como marcada, no como «de lo abierto».
        { ...abrio(1, 3, 11, '9'), detalle: 'la marcó como leída' },
      ],
      { hoy },
    )
    expect(r.aperturas).toBe(2)
    expect(r.abiertas).toBe(2)
    expect(r.marcadas).toBe(2)
    expect(r.marcadasDeLoAbierto).toBe(1)
  })

  it('una fila de una cuenta borrada es una apertura, pero no una persona', () => {
    const r = resumirLecturas([abrio(null, 3), abrio({ id: 4 }, 3)], { hoy })
    expect(r.aperturas).toBe(2)
    expect([...r.personas]).toEqual(['4'])
    expect(r.abiertas).toBe(1)
  })

  it('dibuja los últimos 14 días, del más antiguo a hoy, también por persona', () => {
    const r = resumirLecturas([abrio(1, 3), abrio(1, 3), abrio(2, 3), abrio(1, 21, 10), abrio(1, 20, 10)], { hoy })
    expect(r.aperturasPorDia).toHaveLength(14)
    expect(r.aperturasPorDia[13]).toBe(3)
    // El 21 de octubre es el primer día de los catorce; el 20 queda fuera del dibujo pero no del periodo.
    expect(r.aperturasPorDia[0]).toBe(1)
    expect(r.aperturas).toBe(5)
    expect(r.personasPorDia[13]).toBe(2)
    expect(r.aperturasDe.get('1')?.[13]).toBe(2)
    expect(r.aperturasDe.get('1')?.[0]).toBe(1)
    expect(r.aperturasDe.get('2')?.reduce((t, v) => t + v, 0)).toBe(1)
  })

  it('lo que no tiene fecha legible no cuenta en ningún lado', () => {
    const r = resumirLecturas([{ ...abrio(1, 3), fecha: 'ayer' }], { hoy })
    expect(r.aperturas).toBe(0)
    expect(r.personas.size).toBe(0)
  })
})

describe('las iniciales', () => {
  it('se salta el tratamiento y lo que no empieza por letra', () => {
    expect(iniciales('Docente revisor')).toBe('DR')
    expect(iniciales('Dra. Paula Riquelme')).toBe('PR')
    expect(iniciales('Dr Andrés Salinas Mora')).toBe('AS')
    expect(iniciales('Álvaro')).toBe('Á')
    expect(iniciales('123 456')).toBe('·')
  })
})

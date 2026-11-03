import { describe, it, expect } from 'vitest'
import {
  claveDeDia,
  claveDeMes,
  claveDeSemana,
  contarEn,
  diasEntre,
  haceCuanto,
  leerFecha,
  sumarEn,
  ultimasSemanas,
  ultimosDias,
  ultimosMeses,
  ultimosYAnteriores,
} from '@/lib/series'

/**
 * Las casillas de tiempo de los gráficos del panel (D-238).
 *
 * Lo que se cuida aquí no se ve en un gráfico: que cada fecha caiga en un solo
 * día y en el mismo en todas las pestañas, que el cambio de hora no repita ni
 * salte un día, y que lo que cae fuera no se sume a la primera barra.
 */

// Un martes a media tarde, hora local.
const HOY = new Date(2026, 10, 3, 16, 30)

describe('leer una fecha', () => {
  it('el «AAAA-MM-DD» de tiempo-activo es el día local, no la medianoche UTC', () => {
    const fecha = leerFecha('2026-11-03')
    expect(fecha?.getDate()).toBe(3)
    expect(fecha?.getHours()).toBe(0)
    expect(claveDeDia('2026-11-03')).toBe('2026-11-03')
  })

  it('lo que no es una fecha es null', () => {
    expect(leerFecha('ayer')).toBeNull()
    expect(leerFecha(null)).toBeNull()
    expect(leerFecha(new Date('x'))).toBeNull()
    expect(claveDeMes(42)).toBeNull()
  })
})

describe('las casillas', () => {
  it('treinta días terminan hoy, sin repetir ni saltar ninguno', () => {
    const dias = ultimosDias(30, HOY)
    expect(dias).toHaveLength(30)
    expect(dias[29].clave).toBe('2026-11-03')
    expect(dias[29].etiqueta).toBe('3 nov')
    expect(dias[0].clave).toBe('2026-10-05')
    expect(new Set(dias.map((d) => d.clave)).size).toBe(30)
  })

  it('cruzar un cambio de hora no repite días', () => {
    // Chile cambia de hora a comienzos de abril y de septiembre; sumando
    // milisegundos, uno de esos días salía dos veces.
    for (const mes of [3, 8]) {
      const dias = ultimosDias(20, new Date(2026, mes, 15, 0, 30))
      expect(new Set(dias.map((d) => d.clave)).size).toBe(20)
    }
  })

  it('las semanas empiezan el lunes y la última es la de hoy', () => {
    const semanas = ultimasSemanas(4, HOY)
    expect(semanas.map((s) => s.clave)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02'])
    expect(semanas[3].detalle).toBe('semana del 2 nov')
    // Un domingo es de la semana que empezó el lunes anterior.
    expect(claveDeSemana(new Date(2026, 10, 8, 23, 0))).toBe('2026-11-02')
  })

  it('los meses cruzan el año', () => {
    const meses = ultimosMeses(3, new Date(2026, 0, 10))
    expect(meses.map((m) => m.clave)).toEqual(['2025-11', '2025-12', '2026-01'])
    expect(meses[2].detalle).toBe('ene 2026')
  })
})

describe('contar y sumar', () => {
  const dias = ultimosDias(3, HOY)

  it('cuenta cada fecha en su día y deja fuera lo que no cae en ninguno', () => {
    const claves = ['2026-11-03', '2026-11-03', '2026-11-01', '2026-10-01', null, '2026-11-04']
    expect(contarEn(dias, claves)).toEqual([1, 0, 2])
  })

  it('suma valores por casilla e ignora los que no son números', () => {
    expect(sumarEn(dias, [['2026-11-02', 30], ['2026-11-02', 15], ['2026-11-03', Number.NaN]])).toEqual([0, 45, 0])
  })

  it('compara los últimos con los de antes solo si hay de antes', () => {
    expect(ultimosYAnteriores([1, 2, 3, 4], 2)).toEqual({ ultimos: 7, anteriores: 3 })
    expect(ultimosYAnteriores([5, 6], 2)).toEqual({ ultimos: 11, anteriores: null })
  })

  it('cuándo pasó algo, en palabras', () => {
    expect(haceCuanto(new Date(2026, 10, 3, 16, 18), HOY)).toBe('hace 12 min')
    expect(haceCuanto(new Date(2026, 10, 3, 14, 0), HOY)).toBe('hace 2 h')
    expect(haceCuanto(new Date(2026, 10, 3, 2, 5), HOY)).toBe('02:05')
    expect(haceCuanto(new Date(2026, 10, 2, 21, 40), HOY)).toBe('ayer, 21:40')
    expect(haceCuanto(new Date(2026, 9, 28, 9, 0), HOY)).toBe('28 oct')
    expect(haceCuanto(new Date(2025, 9, 28, 9, 0), HOY)).toBe('28 oct 2025')
    expect(haceCuanto('no', HOY)).toBe('—')
  })

  it('una fecha por delante del reloj dice su hora y no «recién»', () => {
    const despues = new Date(HOY.getTime() + 4 * 3_600_000)
    expect(haceCuanto(new Date(HOY.getTime() + 30_000), HOY)).toBe('recién')
    expect(haceCuanto(despues, HOY)).toBe(`${String(despues.getHours()).padStart(2, '0')}:${String(despues.getMinutes()).padStart(2, '0')}`)
  })

  it('los días enteros entre dos fechas se cuentan hacia abajo', () => {
    expect(diasEntre(new Date(2026, 10, 2, 23, 0), new Date(2026, 10, 3, 9, 0))).toBe(0)
    expect(diasEntre(new Date(2026, 9, 25, 9, 0), HOY)).toBe(9)
    expect(diasEntre('no es fecha', HOY)).toBeNull()
  })
})

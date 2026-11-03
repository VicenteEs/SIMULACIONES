import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PERIODO_POR_OMISION,
  lecturasPorModulo,
  lectoresEnElPeriodo,
  periodoDeLaConsulta,
  rutaDeEstadisticas,
} from '@/app/(frontend)/admin-panel/estadisticas/periodo'
import { lecturasPorMes } from '@/lib/seguimiento'

/**
 * El periodo de las estadísticas (P-007 E5, D-238): que cambie lo que se
 * cuenta y no solo lo que se enseña, y que las tarjetas que dependen de él no
 * puedan discrepar entre sí.
 */

const MESES = ['2026-09', '2026-10', '2026-11']
const fecha = (mes: number, dia: number) => new Date(2026, mes - 1, dia, 12).toISOString()

describe('periodoDeLaConsulta', () => {
  it('acepta los tres ofrecidos', () => {
    expect(periodoDeLaConsulta('3')).toBe(3)
    expect(periodoDeLaConsulta('12')).toBe(12)
    expect(periodoDeLaConsulta(['6', '12'])).toBe(6)
  })

  it('vuelve al de siempre con lo que no se ofrece, sin romper la página', () => {
    for (const valor of [undefined, '', '7', 'doce', '-6', '1e3']) {
      expect(periodoDeLaConsulta(valor)).toBe(PERIODO_POR_OMISION)
    }
  })
})

describe('rutaDeEstadisticas', () => {
  it('lleva el periodo y el «quién», sin los valores de siempre', () => {
    expect(rutaDeEstadisticas(PERIODO_POR_OMISION, 'todos')).toBe('/admin-panel/estadisticas')
    expect(rutaDeEstadisticas(12, 'todos')).toBe('/admin-panel/estadisticas?periodo=12')
    expect(rutaDeEstadisticas(3, 'residentes')).toBe('/admin-panel/estadisticas?periodo=3&quien=residentes')
    expect(rutaDeEstadisticas(PERIODO_POR_OMISION, 'equipo')).toBe('/admin-panel/estadisticas?quien=equipo')
  })
})

describe('lecturasPorModulo', () => {
  const eventos = [
    { usuario: 1, coleccion: 'patologias', documentoId: '10', fecha: fecha(10, 2) },
    // La misma ficha, la misma persona y el mismo mes: una lectura.
    { usuario: 1, coleccion: 'patologias', documentoId: '10', fecha: fecha(10, 20) },
    // El mes siguiente vuelve a contar.
    { usuario: 1, coleccion: 'patologias', documentoId: '10', fecha: fecha(11, 1) },
    { usuario: 2, coleccion: 'maniobras', documentoId: '5', fecha: fecha(9, 9) },
    // Fuera del periodo: no cuenta.
    { usuario: 2, coleccion: 'maniobras', documentoId: '5', fecha: fecha(6, 9) },
  ]
  const filas = [
    // Una lectura de antes del registro: su última visita, en un mes sin apertura de esa ficha.
    { usuario: { id: 3 }, coleccion: 'maniobras', documentoId: 7, ultimaVisita: fecha(9, 1) },
  ]

  it('cuenta en la unidad de «Lecturas por mes»: fichas distintas por persona y mes', () => {
    expect(lecturasPorModulo(MESES, eventos, filas, ['patologias', 'maniobras', 'casos-ao'])).toEqual([2, 2, 0])
  })

  it('suma lo mismo que la línea de lecturas, módulo a módulo', () => {
    const porModulo = lecturasPorModulo(MESES, eventos, filas, ['patologias', 'maniobras'])
    const linea = lecturasPorMes(MESES, eventos, filas)
    expect(porModulo.reduce((t, v) => t + v, 0)).toBe(linea.reduce((t, v) => t + v, 0))
  })
})

describe('lectoresEnElPeriodo', () => {
  it('una fila por persona y ficha leída dentro del periodo, venga del registro o de `actividad`', () => {
    const lectores = lectoresEnElPeriodo(
      MESES,
      [
        { usuario: 1, coleccion: 'patologias', documentoId: '10', fecha: fecha(10, 2) },
        { usuario: 1, coleccion: 'patologias', documentoId: '10', fecha: fecha(11, 2) },
        { usuario: 2, coleccion: 'patologias', documentoId: '10', fecha: fecha(5, 2) },
        // Sin colección o sin ficha no se puede rotular: fuera.
        { usuario: 4, coleccion: '', documentoId: '10', fecha: fecha(10, 2) },
        { usuario: 4, coleccion: 'patologias', fecha: fecha(10, 2) },
      ],
      [
        { usuario: { id: 1 }, coleccion: 'patologias', documentoId: 10, ultimaVisita: fecha(11, 3) },
        { usuario: 3, coleccion: 'maniobras', documentoId: '7', ultimaVisita: fecha(9, 1) },
        // La última visita cae antes del periodo: esa persona no la leyó en él.
        { usuario: 2, coleccion: 'maniobras', documentoId: '7', ultimaVisita: fecha(4, 1) },
      ],
    )
    expect(lectores).toEqual([
      { usuario: '1', coleccion: 'patologias', documentoId: '10' },
      { usuario: '3', coleccion: 'maniobras', documentoId: '7' },
    ])
  })
})

describe('la página de estadísticas', () => {
  const codigo = readFileSync(
    join(process.cwd(), 'src', 'app', '(frontend)', 'admin-panel', 'estadisticas', 'page.tsx'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ')

  it('pide a la base solo las aperturas del periodo elegido', () => {
    // Un selector que solo escondiera barras dejaría la consulta igual: el
    // periodo tiene que llegar hasta el `where`.
    expect(codigo).toContain('periodoDeLaConsulta(consulta.periodo)')
    expect(codigo).toMatch(/fecha: \{ greater_than_equal: inicioDelPeriodo \}/)
  })

  it('cuenta la lectura con `lecturasPorMes` y no con una cuenta propia', () => {
    expect(codigo).toContain('lecturasPorMes(claves,')
  })
})

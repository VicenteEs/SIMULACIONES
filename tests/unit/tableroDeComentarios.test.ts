import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resumirComentarios, SEMANAS_DEL_GRAFICO } from '@/app/(frontend)/admin-panel/comentarios/tablero'

/**
 * Las cifras de la cabecera de «Comentarios» (P-007 E5, D-238).
 *
 * Lo que se vigila es lo que se decidió no contar tanto como lo que se cuenta:
 * la colección no guarda cuándo se resolvió un comentario, y `updatedAt` no
 * sirve de sustituto —borrar una cuenta reescribe todos sus comentarios—. Una
 * cifra de «resueltos este mes» sacada de ahí compilaría, se vería bien y
 * contaría los comentarios de la cuenta borrada como resueltos ese día.
 */

const hoy = new Date(2026, 10, 3, 12, 0) // martes 3 de noviembre de 2026, hora local
const haceDias = (n: number) => new Date(2026, 10, 3 - n, 10, 0).toISOString()

describe('resumirComentarios', () => {
  it('separa pendientes y resueltos, y lo que no dice «resuelto» espera', () => {
    const r = resumirComentarios(
      [
        { estado: 'pendiente', coleccion: 'patologias', createdAt: haceDias(1) },
        { estado: 'resuelto', coleccion: 'patologias', createdAt: haceDias(2) },
        // Un estado que no se reconoce no se da por atendido: es lo que menos
        // engaña, y es lo que hace la tabla al pintarlo.
        { estado: undefined, coleccion: 'maniobras', createdAt: haceDias(3) },
      ],
      hoy,
    )
    expect(r.total).toBe(3)
    expect(r.pendientes).toBe(2)
    expect(r.resueltos).toBe(1)
  })

  it('dice cuánto lleva esperando el pendiente más antiguo, por fecha y no por orden', () => {
    const r = resumirComentarios(
      [
        { estado: 'pendiente', createdAt: haceDias(2) },
        { estado: 'pendiente', createdAt: haceDias(39) },
        // El resuelto más antiguo no cuenta: ya no espera a nadie.
        { estado: 'resuelto', createdAt: haceDias(90) },
        { estado: 'pendiente', createdAt: 'no es una fecha' },
      ],
      hoy,
    )
    expect(r.diasDelMasAntiguo).toBe(39)
  })

  it('sin pendientes no hay «más antiguo»', () => {
    expect(resumirComentarios([{ estado: 'resuelto', createdAt: haceDias(5) }], hoy).diasDelMasAntiguo).toBeNull()
    expect(resumirComentarios([], hoy).diasDelMasAntiguo).toBeNull()
  })

  it('compara los últimos 30 días con los 30 de antes, no el mes del calendario', () => {
    const r = resumirComentarios(
      [
        { estado: 'resuelto', createdAt: haceDias(1) },
        { estado: 'pendiente', createdAt: haceDias(10) },
        { estado: 'resuelto', createdAt: haceDias(29) },
        { estado: 'pendiente', createdAt: haceDias(31) },
        { estado: 'pendiente', createdAt: haceDias(59) },
        // Fuera de los sesenta días: no entra en ninguno de los dos lados.
        { estado: 'pendiente', createdAt: haceDias(61) },
      ],
      hoy,
    )
    expect(r.recibidos30).toBe(3)
    expect(r.recibidosAntes30).toBe(2)
    expect(r.resueltosDeLos30).toBe(2)
  })

  it('cuenta los recibidos de cada semana, de lunes a domingo', () => {
    const r = resumirComentarios(
      [
        { createdAt: new Date(2026, 10, 2, 9, 0).toISOString() }, // lunes 2 de noviembre
        { createdAt: new Date(2026, 10, 1, 23, 30).toISOString() }, // domingo 1: la semana anterior
        { createdAt: new Date(2026, 9, 27, 8, 0).toISOString() },
      ],
      hoy,
    )
    expect(r.semanas).toHaveLength(SEMANAS_DEL_GRAFICO)
    expect(r.porSemana.at(-1)).toBe(1)
    expect(r.porSemana.at(-2)).toBe(2)
    expect(r.porSemana.reduce((t, v) => t + v, 0)).toBe(3)
  })

  it('reparte por destino: cada módulo, el taller y los catálogos juntos', () => {
    const r = resumirComentarios(
      [
        { coleccion: 'patologias' },
        { coleccion: 'patologias' },
        { coleccion: 'instancias-atlas' },
        { coleccion: 'huesos-ao' },
        { coleccion: 'segmentos' },
      ],
      hoy,
    )
    const valor = (etiqueta: string) => r.porDestino.find((d) => d.etiqueta === etiqueta)?.valor
    expect(valor('Biblioteca de patologías')).toBe(2)
    expect(valor('Taller anatómico')).toBe(1)
    expect(valor('Catálogos')).toBe(2)
    // Ningún comentario se queda fuera ni cuenta dos veces.
    expect(r.porDestino.reduce((t, d) => t + d.valor, 0)).toBe(5)
  })
})

describe('lo que la cabecera no cuenta', () => {
  const codigo = readFileSync(
    join(process.cwd(), 'src', 'app', '(frontend)', 'admin-panel', 'comentarios', 'tablero.ts'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

  it('no saca la fecha de resolución de `updatedAt`', () => {
    // Borrar una cuenta deja sin autor todos sus comentarios, resueltos
    // incluidos, y con eso les cambia `updatedAt`: «resueltos este mes» contaría
    // el día de la baja como el día en que se resolvieron.
    expect(codigo).not.toContain('updatedAt')
  })

  it('devuelve `null` y deja rastro si la tabla no contesta', () => {
    expect(codigo).toMatch(/Promise<TableroDeComentarios \| null>/)
    expect(codigo).toMatch(/console\.error/)
  })
})

import { describe, it, expect, vi } from 'vitest'
import type { Payload } from 'payload'
import {
  leerTableroDeLaCola,
  resumirCola,
  SEMANAS_DEL_GRAFICO,
} from '@/app/(frontend)/admin-panel/revision/tablero'

/**
 * Las cifras de «Por revisar» (P-007 E5, D-238).
 *
 * Lo que se vigila son las dos fechas de las que sale todo —`createdAt`, cuando
 * la ficha llegó a la cola, y `listaEn`, cuando se validó— y las decisiones que
 * no se ven en la pantalla: que el tiempo en cola no se redondee a días
 * enteros, que «sin validadas» no se pinte como «cero días» y que una ficha
 * validada que alguna vez volvió cuente como devuelta.
 */

const hoy = new Date(2026, 10, 3, 16, 0) // martes 3 de noviembre de 2026, hora local
const haceDias = (n: number, hora = 10) => new Date(2026, 10, 3 - n, hora, 0).toISOString()
const MODULOS = ['patologias', 'maniobras']

describe('resumirCola', () => {
  it('la cola son las pendientes, en revisión y devueltas; lo validado o publicado ya salió', () => {
    const r = resumirCola(
      [
        { coleccion: 'patologias', estado: 'pendiente', createdAt: haceDias(1) },
        { coleccion: 'patologias', estado: 'en-revision', createdAt: haceDias(2) },
        { coleccion: 'maniobras', estado: 'devuelta', createdAt: haceDias(3) },
        { coleccion: 'maniobras', estado: 'lista', createdAt: haceDias(4), listaEn: haceDias(1) },
        { coleccion: 'maniobras', estado: 'publicada', createdAt: haceDias(9), listaEn: haceDias(5) },
      ],
      MODULOS,
      hoy,
    )
    expect(r.enCola).toBe(3)
    expect(r.devueltas).toBe(1)
  })

  it('reparte la cola en el orden de los módulos pedidos y no cuenta los ajenos', () => {
    const r = resumirCola(
      [
        { coleccion: 'maniobras', estado: 'pendiente', createdAt: haceDias(1) },
        { coleccion: 'maniobras', estado: 'pendiente', createdAt: haceDias(1) },
        // De un módulo que quien mira no edita: la consulta no lo traería, y
        // si se cuela no inventa una barra.
        { coleccion: 'cirugias', estado: 'pendiente', createdAt: haceDias(1) },
      ],
      MODULOS,
      hoy,
    )
    expect(r.porModulo).toEqual([
      { slug: 'patologias', enCola: 0 },
      { slug: 'maniobras', enCola: 2 },
    ])
  })

  it('atrasada es la que lleva siete días enteros o más en la cola', () => {
    const r = resumirCola(
      [
        { estado: 'pendiente', createdAt: haceDias(6) },
        { estado: 'pendiente', createdAt: haceDias(7) },
        { estado: 'devuelta', createdAt: haceDias(20) },
        // Validada hace mucho: no espera a nadie.
        { estado: 'lista', createdAt: haceDias(30), listaEn: haceDias(25) },
      ],
      MODULOS,
      hoy,
    )
    expect(r.atrasadas).toBe(2)
  })

  it('cuenta las entradas y las validadas de los últimos siete días, y las de los siete de antes', () => {
    const r = resumirCola(
      [
        { estado: 'pendiente', createdAt: haceDias(0) },
        { estado: 'pendiente', createdAt: haceDias(6, 0) },
        // Medianoche de hace siete días: ya es de la semana anterior, aunque
        // «ahora menos siete días» la dejaría dentro.
        { estado: 'pendiente', createdAt: haceDias(7, 18) },
        { estado: 'lista', createdAt: haceDias(10), listaEn: haceDias(2) },
        { estado: 'lista', createdAt: haceDias(12), listaEn: haceDias(8) },
        { estado: 'publicada', createdAt: haceDias(12), listaEn: haceDias(13) },
        { estado: 'publicada', createdAt: haceDias(20), listaEn: haceDias(14) },
      ],
      MODULOS,
      hoy,
    )
    expect(r.entradas7dias).toBe(2)
    expect(r.validadas7dias).toBe(1)
    expect(r.validadasAntes7dias).toBe(2)
  })

  it('dibuja ocho semanas que acaban en la de hoy, con las entradas y las validadas de cada una', () => {
    const r = resumirCola(
      [
        // Lunes 2 y martes 3 de noviembre: la semana en curso.
        { estado: 'pendiente', createdAt: haceDias(1) },
        { estado: 'lista', createdAt: haceDias(0), listaEn: haceDias(0, 12) },
        // Domingo 1: la semana anterior.
        { estado: 'lista', createdAt: haceDias(2), listaEn: haceDias(2, 20) },
        // Más de ocho semanas atrás: fuera del gráfico.
        { estado: 'pendiente', createdAt: haceDias(70) },
      ],
      MODULOS,
      hoy,
    )
    expect(r.semanas).toHaveLength(SEMANAS_DEL_GRAFICO)
    expect(r.semanas.at(-1)?.clave).toBe('2026-11-02')
    expect(r.entradasPorSemana.at(-1)).toBe(2)
    expect(r.entradasPorSemana.at(-2)).toBe(1)
    expect(r.entradasPorSemana.reduce((t, v) => t + v, 0)).toBe(3)
    expect(r.validadasPorSemana.at(-1)).toBe(1)
    expect(r.validadasPorSemana.at(-2)).toBe(1)
  })

  it('mide el tiempo en cola con decimales, de las validadas en los últimos treinta días', () => {
    const r = resumirCola(
      [
        // Un día y medio: con `diasEntre` sería «1 día».
        { estado: 'lista', createdAt: haceDias(3, 10), listaEn: haceDias(2, 22) },
        { estado: 'publicada', createdAt: haceDias(10), listaEn: haceDias(5) },
        // Entre treinta y sesenta días: el periodo con que se compara.
        { estado: 'publicada', createdAt: haceDias(45), listaEn: haceDias(40) },
        // Más de sesenta: no está en ninguno de los dos.
        { estado: 'publicada', createdAt: haceDias(90), listaEn: haceDias(70) },
        // En la cola: todavía no tiene tiempo que medir.
        { estado: 'pendiente', createdAt: haceDias(20) },
      ],
      MODULOS,
      hoy,
    )
    expect(r.diasMedios).toBeCloseTo(3.25)
    expect(r.validadasEnElPeriodo).toBe(2)
    expect(r.diasMediosAntes).toBeCloseTo(5)
  })

  it('sin validadas en el periodo no hay tiempo medio, que no es lo mismo que cero días', () => {
    const r = resumirCola([{ estado: 'pendiente', createdAt: haceDias(3) }], MODULOS, hoy)
    expect(r.diasMedios).toBeNull()
    expect(r.diasMediosAntes).toBeNull()
    expect(r.validadasEnElPeriodo).toBe(0)
  })

  it('devuelta alguna vez es la del contador o la que está devuelta; revisada, la validada o devuelta', () => {
    const r = resumirCola(
      [
        // Volvió una vez y después se validó: sigue contando como devuelta.
        { estado: 'lista', createdAt: haceDias(9), listaEn: haceDias(2), devoluciones: 1 },
        // Devuelta de antes de que existiera el contador.
        { estado: 'devuelta', createdAt: haceDias(5), devoluciones: 0 },
        { estado: 'publicada', createdAt: haceDias(9), listaEn: haceDias(4) },
        { estado: 'pendiente', createdAt: haceDias(1) },
      ],
      MODULOS,
      hoy,
    )
    expect(r.devueltasAlgunaVez).toBe(2)
    expect(r.revisadas).toBe(3)
    expect(r.devueltas).toBe(1)
  })

  it('una fecha que no se puede leer no cuenta en ninguna parte ni rompe el resto', () => {
    const r = resumirCola(
      [
        { estado: 'lista', createdAt: 'no es una fecha', listaEn: haceDias(1) },
        { estado: 'pendiente', createdAt: null },
      ],
      MODULOS,
      hoy,
    )
    expect(r.validadas7dias).toBe(1)
    expect(r.diasMedios).toBeNull()
    expect(r.entradas7dias).toBe(0)
    expect(r.enCola).toBe(1)
    expect(r.atrasadas).toBe(0)
  })
})

describe('leerTableroDeLaCola', () => {
  const payloadQueFalla = () =>
    ({
      count: vi.fn(async () => {
        throw new Error('la base no contesta')
      }),
      find: vi.fn(async () => {
        throw new Error('la base no contesta')
      }),
    }) as unknown as Payload & { count: ReturnType<typeof vi.fn>; find: ReturnType<typeof vi.fn> }

  it('sin módulos no pregunta a la base y devuelve la cola vacía', async () => {
    const payload = payloadQueFalla()
    const r = await leerTableroDeLaCola(payload, [])
    expect(r?.enCola).toBe(0)
    expect(r?.porModulo).toEqual([])
    expect(payload.count).not.toHaveBeenCalled()
  })

  it('si la tabla no contesta devuelve `null`, no una cola a cero', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await leerTableroDeLaCola(payloadQueFalla(), MODULOS)).toBeNull()
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })

  it('lee solo las revisiones de los módulos de quien mira', async () => {
    const filas = [
      { coleccion: 'patologias', estado: 'pendiente', createdAt: new Date().toISOString() },
      { coleccion: 'maniobras', estado: 'devuelta', createdAt: new Date().toISOString() },
    ]
    const find = vi.fn(async () => ({ docs: filas }))
    const payload = { count: vi.fn(async () => ({ totalDocs: filas.length })), find } as unknown as Payload
    const r = await leerTableroDeLaCola(payload, MODULOS)
    expect(r?.enCola).toBe(2)
    expect(r?.devueltas).toBe(1)
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'revisiones', where: { coleccion: { in: MODULOS } } }),
    )
  })
})

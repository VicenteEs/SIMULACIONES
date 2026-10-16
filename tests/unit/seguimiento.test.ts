import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import {
  claveDeMes,
  entraEnLoPedido,
  esDelEquipo,
  filasDeQuien,
  lecturasPorMes,
  quienDeLaConsulta,
} from '@/lib/seguimiento'
import { leerTodas } from '@/lib/leerTodas'
import { leerResumenDeCuentas } from '@/lib/registroPanel'

/**
 * El seguimiento del panel dice lo que pasó de verdad (D-175).
 *
 * Cuatro cosas que parecían exactas y no lo eran: el equipo contaba como residente, las lecturas de un mes se movían al
 * mes de la última visita, los recuentos se cortaban a las mil o dos mil filas más recientes, y la tarjeta de «los
 * últimos 7 días» presumía de marcas que eran las de siempre. Aquí se prueban las cuentas, sin base.
 */

describe('quién lee', () => {
  it('lo que no es una de las tres opciones vuelve a «todos»', () => {
    expect(quienDeLaConsulta('residentes')).toBe('residentes')
    expect(quienDeLaConsulta('equipo')).toBe('equipo')
    expect(quienDeLaConsulta('todos')).toBe('todos')
    expect(quienDeLaConsulta('admin')).toBe('todos')
    expect(quienDeLaConsulta(undefined)).toBe('todos')
    expect(quienDeLaConsulta(['equipo', 'residentes'])).toBe('equipo')
  })

  it('el equipo son administradores y editores; todo lo demás, residentes', () => {
    expect(esDelEquipo('admin')).toBe(true)
    expect(esDelEquipo('editor')).toBe(true)
    expect(esDelEquipo('lector')).toBe(false)
    // Un rol que no se conoce cuenta como residente: lo que sobra ahí se ve, lo que sobrara en «equipo» escondería gente.
    expect(esDelEquipo(undefined)).toBe(false)
    expect(esDelEquipo('')).toBe(false)
  })

  it('entra en lo pedido según el rol', () => {
    expect(entraEnLoPedido('todos', 'lector')).toBe(true)
    expect(entraEnLoPedido('residentes', 'lector')).toBe(true)
    expect(entraEnLoPedido('residentes', 'admin')).toBe(false)
    expect(entraEnLoPedido('equipo', 'editor')).toBe(true)
    expect(entraEnLoPedido('equipo', 'lector')).toBe(false)
  })

  it('separa las filas por el rol real de la cuenta, con una cuenta borrada como residente', () => {
    const roles = new Map([
      ['1', 'admin'],
      ['2', 'lector'],
    ])
    const filas = [{ usuario: 1 }, { usuario: 2 }, { usuario: 3 }, { usuario: { id: 2 } }]
    expect(filasDeQuien(filas, 'todos', roles)).toHaveLength(4)
    expect(filasDeQuien(filas, 'equipo', roles)).toEqual([{ usuario: 1 }])
    // El 3 no está en el mapa —la cuenta se borró— y se queda con los residentes.
    expect(filasDeQuien(filas, 'residentes', roles)).toEqual([{ usuario: 2 }, { usuario: 3 }, { usuario: { id: 2 } }])
  })
})

describe('claveDeMes', () => {
  it('es el año y el mes con dos cifras, y lo que no es una fecha es nulo', () => {
    expect(claveDeMes('2026-10-16T12:00:00')).toBe('2026-10')
    expect(claveDeMes('2026-02-03T12:00:00')).toBe('2026-02')
    expect(claveDeMes('no es una fecha')).toBeNull()
    expect(claveDeMes(undefined)).toBeNull()
    expect(claveDeMes(20261016)).toBeNull()
  })
})

describe('lecturasPorMes', () => {
  const meses = ['2026-08', '2026-09', '2026-10']

  it('una ficha abierta en dos meses cuenta en los dos, y no solo en el de su última visita', () => {
    const eventos = [
      { fecha: '2026-09-10T10:00:00', usuario: 1, coleccion: 'patologias', documentoId: '5' },
      { fecha: '2026-10-02T10:00:00', usuario: 1, coleccion: 'patologias', documentoId: '5' },
    ]
    // La tabla `actividad` solo recuerda la última: la de octubre. Con ella sola, septiembre quedaba en cero.
    const filas = [{ usuario: 1, coleccion: 'patologias', documentoId: '5', ultimaVisita: '2026-10-02T10:00:00' }]
    expect(lecturasPorMes(meses, eventos, filas)).toEqual([0, 1, 1])
  })

  it('varias aperturas de la misma ficha en un mes son una lectura; dos personas, dos', () => {
    const eventos = [
      { fecha: '2026-10-01T09:00:00', usuario: 1, coleccion: 'maniobras', documentoId: '2' },
      { fecha: '2026-10-01T09:00:05', usuario: 1, coleccion: 'maniobras', documentoId: '2' },
      { fecha: '2026-10-09T09:00:00', usuario: 1, coleccion: 'maniobras', documentoId: '2' },
      { fecha: '2026-10-09T09:00:00', usuario: 2, coleccion: 'maniobras', documentoId: '2' },
    ]
    expect(lecturasPorMes(meses, eventos, [])).toEqual([0, 0, 2])
  })

  it('una fila anterior al registro se cuenta en el mes de su última visita', () => {
    const filas = [{ usuario: 7, coleccion: 'casos-ao', documentoId: '1', ultimaVisita: '2026-08-20T10:00:00' }]
    expect(lecturasPorMes(meses, [], filas)).toEqual([1, 0, 0])
  })

  it('una fila con su apertura en el registro no se cuenta dos veces', () => {
    const eventos = [{ fecha: '2026-09-15T10:00:00', usuario: 1, coleccion: 'patologias', documentoId: '9' }]
    const filas = [{ usuario: 1, coleccion: 'patologias', documentoId: '9', ultimaVisita: '2026-09-15T10:00:00' }]
    expect(lecturasPorMes(meses, eventos, filas)).toEqual([0, 1, 0])
  })

  it('lo que cae fuera de los meses pedidos o no se entiende no cuenta', () => {
    const eventos = [
      { fecha: '2025-01-01T10:00:00', usuario: 1, coleccion: 'patologias', documentoId: '1' },
      { fecha: 'ayer', usuario: 1, coleccion: 'patologias', documentoId: '2' },
      { fecha: '2026-10-01T10:00:00', usuario: null, coleccion: 'patologias', documentoId: '3' },
      { fecha: '2026-10-01T10:00:00', usuario: 1, coleccion: '', documentoId: '4' },
    ]
    expect(lecturasPorMes(meses, eventos, [])).toEqual([0, 0, 0])
  })
})

describe('leerTodas', () => {
  /** Un Payload de mentira que tiene `total` filas y las entrega con el `limit` que se le pide. */
  function payloadCon(total: number) {
    const llamadas: Record<string, unknown>[] = []
    const payload = {
      count: async () => ({ totalDocs: total }),
      find: async (opciones: Record<string, unknown>) => {
        llamadas.push(opciones)
        const n = Math.min(total, Number(opciones.limit))
        return { docs: Array.from({ length: n }, (_, i) => ({ id: i + 1 })) }
      },
    } as unknown as Payload
    return { payload, llamadas }
  }

  it('trae todas las filas, también pasadas las mil y las dos mil de antes', async () => {
    const { payload, llamadas } = payloadCon(3500)
    const r = await leerTodas(payload, { coleccion: 'actividad', select: { usuario: true } })
    expect(r.docs).toHaveLength(3500)
    expect(r.total).toBe(3500)
    expect(r.completa).toBe(true)
    // Una sola consulta, sin paginar y con las columnas pedidas.
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].pagination).toBe(false)
    expect(llamadas[0].select).toEqual({ usuario: true })
    expect(llamadas[0].overrideAccess).toBe(true)
  })

  it('con el techo puesto dice que lo leído es una parte', async () => {
    const { payload } = payloadCon(500)
    const r = await leerTodas(payload, { coleccion: 'actividad', techo: 200 })
    expect(r.docs).toHaveLength(200)
    expect(r.total).toBe(500)
    expect(r.completa).toBe(false)
  })

  it('una tabla vacía no se consulta', async () => {
    const { payload, llamadas } = payloadCon(0)
    const r = await leerTodas(payload, { coleccion: 'actividad' })
    expect(r).toEqual({ docs: [], total: 0, completa: true })
    expect(llamadas).toHaveLength(0)
  })
})

describe('cuentas activas hoy', () => {
  const hoy = new Date(2026, 9, 16, 12, 0, 0)
  const dia = '2026-10-16'

  /** El Payload justo para `leerResumenDeCuentas`: cuentas, tiempo del día y ningún acto en el registro. */
  function payloadDelRegistro(tiempos: Record<string, unknown>[]) {
    return {
      find: async ({ collection }: { collection: string }) => {
        if (collection === 'usuarios') return { docs: [{ id: 10, nombre: 'Ana', email: 'ana@x.cl', rol: 'lector', activo: true }] }
        if (collection === 'tiempo-activo') return { docs: tiempos }
        return { docs: [] }
      },
      count: async () => ({ totalDocs: 0 }),
    } as unknown as Payload
  }

  it('la fila de tiempo de una cuenta borrada suma tiempo pero no cuenta como una cuenta activa', async () => {
    const r = await leerResumenDeCuentas(
      payloadDelRegistro([
        { usuario: 10, dia, segundos: 100, latidos: 3, ultimaRuta: '/biblioteca' },
        // La cuenta se borró: el usuario quedó a nulo y el tiempo se conserva.
        { usuario: null, dia, segundos: 50, latidos: 2, ultimaRuta: '/biblioteca' },
      ]),
      hoy,
    )
    expect(r.cuentasActivasHoy).toBe(1)
    expect(r.segundosHoy).toBe(150)
  })

  it('una cuenta con dos filas el mismo día cuenta una vez', async () => {
    const r = await leerResumenDeCuentas(
      payloadDelRegistro([
        { usuario: 10, dia, segundos: 60, latidos: 2, ultimaRuta: '/a' },
        { usuario: 10, dia, segundos: 30, latidos: 1, ultimaRuta: '/b' },
      ]),
      hoy,
    )
    expect(r.cuentasActivasHoy).toBe(1)
  })

  it('una cuenta con cero segundos no está activa', async () => {
    const r = await leerResumenDeCuentas(payloadDelRegistro([{ usuario: 10, dia, segundos: 0, latidos: 1, ultimaRuta: '/' }]), hoy)
    expect(r.cuentasActivasHoy).toBe(0)
  })
})

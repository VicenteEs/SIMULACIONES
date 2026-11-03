import { describe, expect, it } from 'vitest'
import { TIPOS_DE_ACCION, resumirActos, tiempoPorCasilla, tipoDeAccion, type TiempoPorDia } from '@/lib/registroPanel'
import { ultimosDias } from '@/lib/series'

/**
 * Las cuentas del tablero del Registro (P-007 E5, D-238): los minutos activos
 * por día y el reparto de «Qué se hace».
 */

const hoy = new Date(2026, 10, 3, 15)
const dias = ultimosDias(14, hoy)
const local = (mes: number, dia: number, hora = 12) => new Date(2026, mes - 1, dia, hora).toISOString()

const tiempo = (usuarioId: string, dia: string, segundos: number): TiempoPorDia => ({
  usuarioId,
  dia,
  segundos,
  latidos: 1,
  ultimaRuta: '/',
})

describe('el tiempo activo por día', () => {
  const filas = [
    tiempo('1', '2026-11-03', 1800),
    tiempo('2', '2026-11-03', 630),
    // Una cuenta borrada: su tiempo suma, pero no es una cuenta activa.
    tiempo('null', '2026-11-03', 600),
    // Una fila sin tiempo no hace activa a nadie.
    tiempo('3', '2026-11-03', 0),
    tiempo('1', '2026-10-21', 120),
    // Antes de los catorce días: fuera.
    tiempo('1', '2026-10-20', 9000),
  ]
  const r = tiempoPorCasilla(filas, dias, new Set(['1', '2', '3']))

  it('suma los minutos de todas las cuentas, también las borradas', () => {
    expect(r.minutos).toHaveLength(14)
    expect(r.minutos[13]).toBe(51)
    expect(r.minutos[0]).toBe(2)
    expect(r.minutos.reduce((t, v) => t + v, 0)).toBe(53)
  })

  it('cuenta cada cuenta que existe y tuvo tiempo, una vez por día', () => {
    expect(r.cuentas[13]).toBe(2)
    expect(r.cuentas[0]).toBe(1)
  })
})

describe('los tipos de acción', () => {
  it('abrir un caso del simulador no es leer una ficha más', () => {
    expect(tipoDeAccion('lectura', 'patologias')).toBe('leer')
    expect(tipoDeAccion('lectura', 'cirugias')).toBe('simulador')
  })

  it('lo de las cuentas es administrar, aunque el verbo sea «creó»', () => {
    expect(tipoDeAccion('creo', 'usuarios')).toBe('administrar')
    expect(tipoDeAccion('creo', 'patologias')).toBe('editar')
    expect(tipoDeAccion('publico', 'maniobras')).toBe('editar')
    expect(tipoDeAccion('creo', 'comentarios')).toBe('comentar')
    expect(tipoDeAccion('sesion-iniciada', '')).toBe('sesion')
    expect(tipoDeAccion('cambio-de-permisos', 'usuarios')).toBe('administrar')
  })

  it('una acción que no se conoce va a «Administrar» y no se pierde del total', () => {
    expect(tipoDeAccion('accion-del-futuro', 'patologias')).toBe('administrar')
  })

  it('caben en una dona', () => {
    expect(TIPOS_DE_ACCION.length).toBeLessThanOrEqual(6)
  })
})

describe('los actos del periodo', () => {
  const actos = [
    { fecha: local(11, 3), accion: 'lectura', coleccion: 'patologias' },
    { fecha: local(11, 3), accion: 'lectura', coleccion: 'cirugias' },
    { fecha: local(11, 2), accion: 'creo', coleccion: 'maniobras', origen: '' },
    // Lo que anota el servidor por su cuenta cuenta por día, pero no en el reparto.
    { fecha: local(11, 3), accion: 'creo', coleccion: 'patologias', origen: 'sistema' },
    // Hace diez días: en la línea de catorce, fuera del reparto de siete.
    { fecha: local(10, 24), accion: 'sesion-iniciada', coleccion: '' },
    { fecha: 'nunca', accion: 'lectura', coleccion: 'patologias' },
  ]
  const r = resumirActos(actos, dias)

  it('por día cuenta todos los actos, como «Acciones hoy»', () => {
    expect(r.porDia[13]).toBe(3)
    expect(r.porDia[12]).toBe(1)
    expect(r.porDia.reduce((t, v) => t + v, 0)).toBe(5)
  })

  it('el reparto es de las cuentas y de los últimos siete días', () => {
    expect(r.porTipo).toEqual({ leer: 1, simulador: 1, comentar: 0, editar: 1, sesion: 0, administrar: 0 })
  })
})

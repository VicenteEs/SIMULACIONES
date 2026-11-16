import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Payload } from 'payload'
import {
  codigosIguales,
  exigirCupoLibre,
  nuevoCodigoDeInvitacion,
  rutaDeInvitacion,
} from '@/lib/invitacionesServidor'

/**
 * El enlace de invitación de una institución y su cupo (P-016 E5.7, D-402),
 * sin base. Lo que pasa con una base de verdad —la solicitud con y sin enlace,
 * dos aprobaciones a la vez— está en `tests/integration/invitaciones.test.ts`.
 */

describe('el código de invitación', () => {
  it('es largo, cabe en una dirección y no se repite', () => {
    const codigos = new Set(Array.from({ length: 200 }, () => nuevoCodigoDeInvitacion()))
    expect(codigos.size).toBe(200)
    for (const codigo of codigos) expect(codigo).toMatch(/^[A-Za-z0-9_-]{20}$/)
    expect(rutaDeInvitacion('ab-c_1')).toBe('/registro?invitacion=ab-c_1')
  })

  it('vale solo el mismo, sin importar los espacios que traiga el pegado', () => {
    const codigo = nuevoCodigoDeInvitacion()
    expect(codigosIguales(codigo, codigo)).toBe(true)
    expect(codigosIguales(` ${codigo}\n`, codigo)).toBe(true)
    expect(codigosIguales(codigo.slice(0, -1), codigo)).toBe(false)
    // Distingue mayúsculas: base64url las usa, y una que cambia es otro código.
    expect(codigosIguales('ABCDEF', 'abcDEF')).toBe(false)
  })

  it('sin código guardado, o sin código dado, no vale ninguno', () => {
    expect(codigosIguales('', '')).toBe(false)
    expect(codigosIguales('algo', null)).toBe(false)
    expect(codigosIguales(undefined, 'algo')).toBe(false)
    expect(codigosIguales('   ', 'algo')).toBe(false)
  })
})

describe('el cupo', () => {
  /** Una base de mentira: la institución y cuántas cuentas activas tiene. */
  const base = (cupo: number, activas: number, existe = true) =>
    ({
      findByID: async () => (existe ? { nombre: 'Hospital Regional', cupo } : null),
      count: async () => ({ totalDocs: activas }),
    }) as unknown as Payload

  it('la central no tiene cupo', async () => {
    await expect(exigirCupoLibre(base(0, 99), null)).resolves.toBeUndefined()
  })

  it('con un lugar libre se activa; con el cupo lleno, no, y se dice cuánto y qué hacer', async () => {
    await expect(exigirCupoLibre(base(3, 2), '7')).resolves.toBeUndefined()
    await expect(exigirCupoLibre(base(3, 3), '7')).rejects.toThrow(/Hospital Regional llenó su cupo: 3 de 3/)
    // Bajar el cupo por debajo de las activas no desactiva a nadie (D-400), pero tampoco deja activar más.
    await expect(exigirCupoLibre(base(2, 5), '7')).rejects.toThrow(/5 de 2/)
  })

  it('una institución que no existe no deja activar', async () => {
    await expect(exigirCupoLibre(base(3, 0, false), '7')).rejects.toThrow(/No se encontró la institución/)
  })
})

describe('las acciones que activan una cuenta', () => {
  it('pasan las tres por el cupo', () => {
    const fuente = readFileSync('src/app/(frontend)/acciones/admin.ts', 'utf8')
    // Crear una cuenta activa, activarla desde su fila y aprobar una solicitud.
    // Una que deje de pasar por aquí deja pasarse del cupo, y la prueba de
    // integración solo lo notaría por la que cubre.
    const llamadas = fuente.match(/conLugarEnElCupo\(payload, lugar,/g) ?? []
    expect(llamadas).toHaveLength(3)
    for (const accion of ['crearUsuario', 'cambiarActivoUsuario', 'resolverSolicitud']) {
      const cuerpo = fuente.slice(fuente.indexOf(`export async function ${accion}(`))
      const hasta = cuerpo.indexOf('export async function ', 1)
      expect(cuerpo.slice(0, hasta), accion).toContain('conLugarEnElCupo(')
    }
  })
})

import { describe, it, expect } from 'vitest'
import {
  RECORRIDOS,
  destinoAlEntrar,
  esClaveDeRecorrido,
  necesitaBienvenida,
  recorridosDisponibles,
} from '@/lib/bienvenida'
import type { UsuarioSesion } from '@/access/reglas'

/**
 * La bienvenida del primer ingreso (D-237).
 *
 * Lo que tiene que sostenerse no se ve en una captura: que solo la vea el
 * residente y una vez, que al administrador no lo desvíe de su panel, y que no
 * ofrezca un recorrido hacia un módulo que la cuenta no puede abrir.
 */

const lector = (extra: Partial<UsuarioSesion> = {}): UsuarioSesion => ({
  id: '1',
  rol: 'lector',
  activo: true,
  ...extra,
})

describe('quién la ve', () => {
  it('el residente que todavía no la ha visto', () => {
    expect(necesitaBienvenida({ rol: 'lector' })).toBe(true)
    expect(necesitaBienvenida({ rol: 'lector', bienvenidaVistaEn: null })).toBe(true)
    expect(necesitaBienvenida({ rol: 'lector', bienvenidaVistaEn: '' })).toBe(true)
  })

  it('nadie más, y nunca dos veces', () => {
    expect(necesitaBienvenida({ rol: 'lector', bienvenidaVistaEn: '2026-11-03T10:00:00.000Z' })).toBe(false)
    expect(necesitaBienvenida({ rol: 'editor' })).toBe(false)
    expect(necesitaBienvenida({ rol: 'admin' })).toBe(false)
    expect(necesitaBienvenida(null)).toBe(false)
    expect(necesitaBienvenida(undefined)).toBe(false)
  })
})

describe('a dónde lleva entrar', () => {
  it('al administrador, a su panel, haya visto o no la bienvenida', () => {
    expect(destinoAlEntrar({ rol: 'admin' })).toBe('/admin-panel')
  })

  it('al residente nuevo, a la bienvenida; al que ya la vio, al inicio', () => {
    expect(destinoAlEntrar({ rol: 'lector' })).toBe('/bienvenida')
    expect(destinoAlEntrar({ rol: 'lector', bienvenidaVistaEn: '2026-11-03T10:00:00.000Z' })).toBe('/')
  })

  it('al editor, al inicio', () => {
    expect(destinoAlEntrar({ rol: 'editor' })).toBe('/')
  })
})

describe('los recorridos', () => {
  it('son cuatro, con clave única y la ruta de su módulo', () => {
    expect(RECORRIDOS).toHaveLength(4)
    expect(new Set(RECORRIDOS.map((r) => r.clave)).size).toBe(4)
    for (const r of RECORRIDOS) expect(r.ruta.startsWith('/')).toBe(true)
  })

  it('solo se aceptan las claves que existen', () => {
    expect(esClaveDeRecorrido('pabellon')).toBe(true)
    expect(esClaveDeRecorrido('admin-panel')).toBe(false)
    expect(esClaveDeRecorrido(null)).toBe(false)
  })

  it('se ofrecen los de los módulos que la cuenta ve', () => {
    expect(recorridosDisponibles(lector(), [])).toHaveLength(4)
    const soloDos = recorridosDisponibles(lector({ modulosVisibles: ['patologias', 'maniobras'] }), [])
    expect(soloDos.map((r) => r.clave)).toEqual(['examen', 'policlinico'])
  })

  it('un módulo en mantención no se ofrece al residente', () => {
    const sinSimulador = recorridosDisponibles(lector(), ['cirugias'])
    expect(sinSimulador.map((r) => r.clave)).not.toContain('pabellon')
  })

  it('una cuenta inactiva no tiene ninguno', () => {
    expect(recorridosDisponibles(lector({ activo: false }), [])).toEqual([])
    expect(recorridosDisponibles(null, [])).toEqual([])
  })
})

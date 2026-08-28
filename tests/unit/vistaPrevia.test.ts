import { describe, it, expect } from 'vitest'
import { rolEfectivo, puedeSimularRol, ROLES_SIMULABLES } from '@/lib/vistaPrevia'

describe('vista previa de rol', () => {
  it('sin simulación, el rol efectivo es el real', () => {
    expect(rolEfectivo('admin', null)).toBe('admin')
    expect(rolEfectivo('editor', undefined)).toBe('editor')
  })

  it('un administrador puede mirar la plataforma como lector', () => {
    expect(rolEfectivo('admin', 'lector')).toBe('lector')
  })

  it('un editor también puede, para revisar lo que verá el residente', () => {
    expect(rolEfectivo('editor', 'lector')).toBe('lector')
  })

  it('un lector no puede simular ser administrador: eso sería una escalada', () => {
    expect(rolEfectivo('lector', 'admin')).toBe('lector')
    expect(puedeSimularRol('lector', 'admin')).toBe(false)
  })

  it('un editor no puede simular ser administrador', () => {
    expect(rolEfectivo('editor', 'admin')).toBe('editor')
    expect(puedeSimularRol('editor', 'admin')).toBe(false)
  })

  it('solo se admiten roles conocidos; cualquier otro valor se ignora', () => {
    expect(rolEfectivo('admin', 'superusuario')).toBe('admin')
    expect(rolEfectivo('admin', '')).toBe('admin')
  })

  it('la simulación solo permite bajar de privilegios, nunca subir', () => {
    for (const desde of ['admin', 'editor', 'lector'] as const) {
      for (const hacia of ROLES_SIMULABLES) {
        if (puedeSimularRol(desde, hacia)) {
          const orden = { admin: 3, editor: 2, lector: 1 }
          expect(orden[hacia]).toBeLessThanOrEqual(orden[desde])
        }
      }
    }
  })
})

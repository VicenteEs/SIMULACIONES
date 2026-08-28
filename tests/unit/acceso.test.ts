import { describe, it, expect } from 'vitest'
import {
  puedeLeerContenido,
  puedeEditarContenido,
  puedeAdministrarUsuarios,
  filtroDeLectura,
  type UsuarioSesion,
} from '@/access/reglas'

const admin: UsuarioSesion = { rol: 'admin', activo: true }
const editor: UsuarioSesion = { rol: 'editor', activo: true }
const lector: UsuarioSesion = { rol: 'lector', activo: true }

describe('puedeLeerContenido', () => {
  it('niega el acceso cuando no hay sesión', () => {
    expect(puedeLeerContenido(null)).toBe(false)
  })

  it('niega el acceso a una cuenta que el administrador no ha activado', () => {
    expect(puedeLeerContenido({ rol: 'lector', activo: false })).toBe(false)
  })

  it('niega el acceso a un administrador desactivado', () => {
    expect(puedeLeerContenido({ rol: 'admin', activo: false })).toBe(false)
  })

  it('permite leer a un lector con la cuenta activa', () => {
    expect(puedeLeerContenido(lector)).toBe(true)
  })

  it('permite leer a editores y administradores activos', () => {
    expect(puedeLeerContenido(editor)).toBe(true)
    expect(puedeLeerContenido(admin)).toBe(true)
  })
})

describe('puedeEditarContenido', () => {
  it('niega la edición sin sesión', () => {
    expect(puedeEditarContenido(null)).toBe(false)
  })

  it('niega la edición a un lector, aunque esté activo', () => {
    expect(puedeEditarContenido(lector)).toBe(false)
  })

  it('niega la edición a un editor desactivado', () => {
    expect(puedeEditarContenido({ rol: 'editor', activo: false })).toBe(false)
  })

  it('permite editar al editor activo', () => {
    expect(puedeEditarContenido(editor)).toBe(true)
  })

  it('permite editar al administrador activo', () => {
    expect(puedeEditarContenido(admin)).toBe(true)
  })
})

describe('puedeAdministrarUsuarios', () => {
  it('niega la administración sin sesión', () => {
    expect(puedeAdministrarUsuarios(null)).toBe(false)
  })

  it('niega la administración al editor: el traumatólogo no crea cuentas', () => {
    expect(puedeAdministrarUsuarios(editor)).toBe(false)
  })

  it('niega la administración al lector', () => {
    expect(puedeAdministrarUsuarios(lector)).toBe(false)
  })

  it('niega la administración a un administrador desactivado', () => {
    expect(puedeAdministrarUsuarios({ rol: 'admin', activo: false })).toBe(false)
  })

  it('permite la administración al administrador activo', () => {
    expect(puedeAdministrarUsuarios(admin)).toBe(true)
  })
})

describe('filtroDeLectura', () => {
  it('no devuelve resultados cuando no hay sesión', () => {
    expect(filtroDeLectura(null)).toBe(false)
  })

  it('no devuelve resultados para una cuenta desactivada', () => {
    expect(filtroDeLectura({ rol: 'editor', activo: false })).toBe(false)
  })

  it('restringe al lector a lo publicado: un borrador no debe alcanzarle', () => {
    expect(filtroDeLectura(lector)).toEqual({ _status: { equals: 'published' } })
  })

  it('deja al editor ver también los borradores', () => {
    expect(filtroDeLectura(editor)).toBe(true)
  })

  it('deja al administrador ver todo', () => {
    expect(filtroDeLectura(admin)).toBe(true)
  })
})

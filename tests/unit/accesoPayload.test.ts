import { describe, it, expect } from 'vitest'
import {
  lecturaDeContenido,
  escrituraDeContenido,
  administracionDeUsuarios,
} from '@/access/payload'
import { SOLO_PUBLICADO } from '@/access/reglas'

/** Imita el objeto que Payload entrega a una función de acceso. */
const peticion = (usuario: unknown) => ({ req: { user: usuario } }) as never

const admin = { rol: 'admin', activo: true }
const editor = { rol: 'editor', activo: true }
const lector = { rol: 'lector', activo: true }

describe('adaptadores de acceso de Payload', () => {
  it('lecturaDeContenido niega cuando la petición no trae usuario', () => {
    expect(lecturaDeContenido(peticion(null))).toBe(false)
    expect(lecturaDeContenido(peticion(undefined))).toBe(false)
  })

  it('lecturaDeContenido devuelve el filtro de publicados para el lector', () => {
    expect(lecturaDeContenido(peticion(lector))).toEqual(SOLO_PUBLICADO)
  })

  it('lecturaDeContenido no restringe al editor ni al administrador', () => {
    expect(lecturaDeContenido(peticion(editor))).toBe(true)
    expect(lecturaDeContenido(peticion(admin))).toBe(true)
  })

  it('escrituraDeContenido solo admite a editores y administradores activos', () => {
    expect(escrituraDeContenido(peticion(null))).toBe(false)
    expect(escrituraDeContenido(peticion(lector))).toBe(false)
    expect(escrituraDeContenido(peticion({ rol: 'editor', activo: false }))).toBe(false)
    expect(escrituraDeContenido(peticion(editor))).toBe(true)
    expect(escrituraDeContenido(peticion(admin))).toBe(true)
  })

  it('administracionDeUsuarios solo admite al administrador activo', () => {
    expect(administracionDeUsuarios(peticion(editor))).toBe(false)
    expect(administracionDeUsuarios(peticion({ rol: 'admin', activo: false }))).toBe(false)
    expect(administracionDeUsuarios(peticion(admin))).toBe(true)
  })

  it('tolera un usuario con forma inesperada sin conceder acceso', () => {
    expect(lecturaDeContenido(peticion({}))).toBe(false)
    expect(escrituraDeContenido(peticion({ rol: 'otro', activo: true }))).toBe(false)
  })
})

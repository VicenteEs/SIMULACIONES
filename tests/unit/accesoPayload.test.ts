import { describe, it, expect } from 'vitest'
import {
  lecturaDeModulo,
  escrituraDeModulo,
  lecturaSimple,
  escrituraDeContenido,
  administracionDeUsuarios,
} from '@/access/payload'
import { SOLO_PUBLICADO } from '@/access/reglas'

/**
 * Los adaptadores que las colecciones declaran de verdad.
 *
 * Antes este archivo probaba `lecturaDeContenido`, que no usaba ninguna
 * colección, mientras que la capa de permisos por módulo —la que decide quién
 * ve y quién escribe cada uno de los cinco— no tenía ni una prueba. Se probaba
 * lo que no corría y no se probaba lo que sí.
 */

/** Imita el objeto que Payload entrega a una función de acceso. */
const peticion = (usuario: unknown) => ({ req: { user: usuario } }) as never

const admin = { rol: 'admin', activo: true }
const editor = { rol: 'editor', activo: true }
const lector = { rol: 'lector', activo: true }

describe('lectura por módulo', () => {
  const leerCirugias = lecturaDeModulo('cirugias')

  it('niega sin sesión', () => {
    expect(leerCirugias(peticion(null))).toBe(false)
    expect(leerCirugias(peticion(undefined))).toBe(false)
  })

  it('niega a una cuenta sin activar, aunque tenga el módulo', () => {
    expect(leerCirugias(peticion({ rol: 'lector', activo: false }))).toBe(false)
  })

  it('al lector le deja solo lo publicado', () => {
    expect(leerCirugias(peticion(lector))).toEqual(SOLO_PUBLICADO)
  })

  it('no restringe al editor ni al administrador', () => {
    expect(leerCirugias(peticion(editor))).toBe(true)
    expect(leerCirugias(peticion(admin))).toBe(true)
  })

  it('una lista de módulos vacía significa todos, no ninguno', () => {
    // Es la interpretación que evita el fallo más probable: crear una cuenta,
    // olvidar marcarle módulos y que no vea nada sin que se entienda por qué.
    expect(leerCirugias(peticion({ ...lector, modulosVisibles: [] }))).toEqual(SOLO_PUBLICADO)
  })

  it('con módulos marcados, solo esos', () => {
    const restringido = { ...lector, modulosVisibles: ['patologias'] }
    expect(leerCirugias(peticion(restringido))).toBe(false)
    expect(lecturaDeModulo('patologias')(peticion(restringido))).toEqual(SOLO_PUBLICADO)
  })

  it('el administrador ve todo aunque tenga módulos marcados', () => {
    expect(leerCirugias(peticion({ ...admin, modulosVisibles: ['patologias'] }))).toBe(true)
  })
})

describe('escritura por módulo', () => {
  const escribirCirugias = escrituraDeModulo('cirugias')

  it('el lector no escribe, tenga el módulo o no', () => {
    expect(escribirCirugias(peticion(lector))).toBe(false)
    expect(escribirCirugias(peticion({ ...lector, modulosEditables: ['cirugias'] }))).toBe(false)
  })

  it('el editor escribe donde le corresponde y solo ahí', () => {
    expect(escribirCirugias(peticion(editor))).toBe(true)
    const restringido = { ...editor, modulosEditables: ['patologias'] }
    expect(escribirCirugias(peticion(restringido))).toBe(false)
    expect(escrituraDeModulo('patologias')(peticion(restringido))).toBe(true)
  })

  it('el administrador escribe en todos', () => {
    expect(escribirCirugias(peticion({ ...admin, modulosEditables: ['patologias'] }))).toBe(true)
  })
})

describe('colecciones sin borradores ni permisos por módulo', () => {
  it('lecturaSimple responde con un booleano y no con un filtro', () => {
    // Devolver un filtro sobre `_status` aquí rompería la consulta con «Cannot
    // find field for path at _status»: esas colecciones no tienen esa columna.
    expect(lecturaSimple(peticion(lector))).toBe(true)
    expect(lecturaSimple(peticion(null))).toBe(false)
    expect(lecturaSimple(peticion({ rol: 'lector', activo: false }))).toBe(false)
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
    expect(lecturaSimple(peticion({}))).toBe(false)
    expect(lecturaDeModulo('cirugias')(peticion({}))).toBe(false)
    expect(escrituraDeContenido(peticion({ rol: 'otro', activo: true }))).toBe(false)
  })
})

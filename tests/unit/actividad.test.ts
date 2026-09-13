import { describe, it, expect } from 'vitest'
import type { Access, Field } from 'payload'
import { Actividad } from '@/collections/Actividad'

/**
 * El registro de lectura: una fila por usuario y ficha, y de un módulo suyo.
 *
 * Las dos reglas que se prueban aquí no se ven desde la aplicación, y esa es
 * justamente la razón de probarlas: el panel y `acciones/actividad.ts` escriben
 * por la API local, cuyo `overrideAccess` vale `true` por omisión, así que ni
 * pasan por las funciones de acceso ni provocan nunca el choque del índice. Lo
 * que se rompe aquí se rompe desde `curl` y desde dos pestañas abiertas a la
 * vez, que son dos sitios donde nadie mira.
 *
 * El índice se comprueba por su declaración y no por su efecto: crearlo de
 * verdad exige base de datos, y de eso se ocupa la migración
 * `20260913_033442_actividad_una_fila_por_ficha`, que además tiene que borrar
 * los duplicados antes o `CREATE UNIQUE INDEX` tumba el despliegue.
 */

const peticion = (usuario: unknown, datos: unknown) =>
  ({ req: { user: usuario }, data: datos }) as never

const crear = Actividad.access?.create as Access

const LECTOR = { id: 7, rol: 'lector', activo: true }
const LECTOR_RESTRINGIDO = { id: 7, rol: 'lector', activo: true, modulosVisibles: ['patologias'] }
const LECTOR_INACTIVO = { id: 8, rol: 'lector', activo: false }
const ADMIN_RESTRINGIDO = { id: 9, rol: 'admin', activo: true, modulosVisibles: ['patologias'] }

const FICHA_DE_CIRUGIA = { coleccion: 'cirugias', documentoId: '12' }

describe('crear un registro de lectura exige tener ese módulo', () => {
  it('la colección declara una regla de creación', () => {
    expect(typeof crear, 'sin regla propia basta una cuenta activa para cualquier módulo').toBe(
      'function',
    )
  })

  it('una cuenta sin restricciones registra cualquier módulo', () => {
    // Lista vacía o ausente significa «todos»: restringir tiene que ser un acto
    // deliberado, no el descuido de crear la cuenta sin marcar nada.
    expect(crear(peticion(LECTOR, FICHA_DE_CIRUGIA))).toBe(true)
  })

  it('el módulo vetado se niega, que es el agujero que esto cierra', () => {
    // `POST /api/actividad` con `{"coleccion":"cirugias","completado":true}`
    // hacía que las estadísticas del panel contaran como leída una ficha de un
    // módulo que esa cuenta ni siquiera puede abrir.
    expect(crear(peticion(LECTOR_RESTRINGIDO, FICHA_DE_CIRUGIA))).toBe(false)
  })

  it('el módulo propio sigue pasando', () => {
    expect(crear(peticion(LECTOR_RESTRINGIDO, { coleccion: 'patologias', documentoId: '3' }))).toBe(
      true,
    )
  })

  it('al administrador no lo restringe la lista, como en el resto de la plataforma', () => {
    expect(crear(peticion(ADMIN_RESTRINGIDO, FICHA_DE_CIRUGIA))).toBe(true)
  })

  it('la cuenta desactivada y la sesión ausente no escriben nada', () => {
    expect(crear(peticion(LECTOR_INACTIVO, FICHA_DE_CIRUGIA))).toBe(false)
    expect(crear(peticion(null, FICHA_DE_CIRUGIA))).toBe(false)
  })

  it('sin módulo declarado no hay nada que autorizar', () => {
    // `coleccion` es obligatorio y la fila no llegaría a guardarse; se niega
    // para no dejar pasar un `create` cuyo permiso nadie ha podido comprobar.
    expect(crear(peticion(LECTOR, { documentoId: '12' }))).toBe(false)
    expect(crear(peticion(LECTOR, undefined))).toBe(false)
  })
})

describe('la base garantiza una sola fila por usuario y ficha', () => {
  it('la colección declara el índice único compuesto', () => {
    expect(
      Actividad.indexes,
      'sin él, dos pestañas abiertas a la vez crean la fila gemela que deja una lectura marcada y la otra no',
    ).toEqual([{ fields: ['usuario', 'coleccion', 'documentoId'], unique: true }])
  })

  it('los tres campos del índice existen con ese nombre', () => {
    // Payload no avisa de un campo mal escrito aquí hasta que se construye el
    // esquema, y entonces el fallo sale en el arranque del servidor.
    const nombres = (Actividad.fields as Field[])
      .filter((c): c is Field & { name: string } => 'name' in c && typeof c.name === 'string')
      .map((c) => c.name)
    for (const campo of Actividad.indexes?.[0]?.fields ?? []) {
      expect(nombres, `el índice nombra «${campo}» y la colección no lo declara`).toContain(campo)
    }
  })
})

import { describe, it, expect } from 'vitest'
import type { Field, FieldAccess } from 'payload'
import { Comentarios } from '@/collections/Comentarios'
import { Actividad } from '@/collections/Actividad'

/**
 * Quién puede escribir qué campo de un comentario o de un registro de lectura.
 *
 * Estos dos son los únicos sitios donde un lector escribe en la base, y durante
 * un tiempo los campos que identifican la fila —autor, módulo y ficha— estaban
 * protegidos solo con `admin: { readOnly: true }`. Eso es una indicación para la
 * interfaz de Payload, que se retiró (D-038), y el servidor nunca la miró: lo
 * único que filtra campos en escritura es `field.access[operación]`, y Payload
 * se salta la comprobación entera cuando la operación en curso no está
 * declarada (`fields/hooks/beforeValidate/promise.js`).
 *
 * El agujero no se veía desde la aplicación porque el panel y las acciones de
 * servidor escriben por la API local, que lleva `overrideAccess` en cierto por
 * omisión. Se veía desde `curl`: la API REST sigue montada, y con ella un
 * residente reasignaba la autoría de su propio comentario a un compañero, o
 * movía su historial de lectura a la cuenta de otro.
 *
 * Estas pruebas miran la declaración, no el comportamiento de Payload: lo que
 * se rompió aquí fue siempre un campo al que se le olvidó el `access`.
 */

const campoDe = (campos: Field[], nombre: string): Field => {
  const campo = campos.find((c) => 'name' in c && c.name === nombre)
  if (!campo) throw new Error(`No existe el campo «${nombre}»`)
  return campo
}

/** El acceso declarado para una operación, o `undefined` si no lo hay. */
const accesoDe = (campo: Field, operacion: 'create' | 'update'): FieldAccess | undefined =>
  (campo as { access?: Partial<Record<'create' | 'update', FieldAccess>> }).access?.[operacion]

const peticion = (usuario: unknown) => ({ req: { user: usuario } }) as never

const LECTOR = { id: '7', rol: 'lector', activo: true }
const EDITOR = { id: '8', rol: 'editor', activo: true }
const ADMIN = { id: '9', rol: 'admin', activo: true }
const EDITOR_DESACTIVADO = { id: '10', rol: 'editor', activo: false }

describe('los campos que identifican la fila no se reescriben después', () => {
  const casos = [
    { nombre: 'comentarios', coleccion: Comentarios, campos: ['usuario', 'coleccion', 'documentoId'] },
    { nombre: 'actividad', coleccion: Actividad, campos: ['usuario', 'coleccion', 'documentoId'] },
  ]

  for (const { nombre, coleccion, campos } of casos) {
    for (const campoNombre of campos) {
      it(`${nombre}.${campoNombre} niega la modificación a todo el mundo`, async () => {
        const campo = campoDe(coleccion.fields, campoNombre)
        const regla = accesoDe(campo, 'update')
        expect(
          typeof regla,
          `${nombre}.${campoNombre} no declara access.update: la API REST lo deja escribir`,
        ).toBe('function')

        // A todo el mundo, no solo al lector: nada de la plataforma cambia
        // estos campos después de crear la fila, y el panel escribe por la API
        // local, donde el acceso de campo ni se evalúa.
        for (const quien of [LECTOR, EDITOR, ADMIN, null]) {
          expect(await regla!(peticion(quien))).toBe(false)
        }
      })
    }
  }
})

describe('el estado de un comentario lo decide quien mantiene el contenido', () => {
  const estado = campoDe(Comentarios.fields, 'estado')

  it('declara las dos operaciones, no solo la modificación', () => {
    // Sin `create`, un `POST /api/comentarios` con `{"estado": "resuelto"}`
    // desde una cuenta de lector nacía archivado: fuera del contador de
    // pendientes y fuera de la vista por omisión de la tabla. Nadie lo leía y
    // nada decía que se hubiera archivado solo.
    expect(typeof accesoDe(estado, 'create')).toBe('function')
    expect(typeof accesoDe(estado, 'update')).toBe('function')
  })

  it('se lo niega al lector en las dos', async () => {
    for (const operacion of ['create', 'update'] as const) {
      expect(await accesoDe(estado, operacion)!(peticion(LECTOR))).toBe(false)
      expect(await accesoDe(estado, operacion)!(peticion(null))).toBe(false)
    }
  })

  it('se lo concede al administrador y al editor', async () => {
    for (const operacion of ['create', 'update'] as const) {
      expect(await accesoDe(estado, operacion)!(peticion(ADMIN))).toBe(true)
      expect(await accesoDe(estado, operacion)!(peticion(EDITOR))).toBe(true)
    }
  })

  it('no le vale a un editor con la cuenta desactivada', async () => {
    // El acceso de colección ya lo exige, pero una regla de campo que no mira
    // `activo` es una divergencia con `habilitada()` esperando a que alguien
    // afloje la de arriba.
    for (const operacion of ['create', 'update'] as const) {
      expect(await accesoDe(estado, operacion)!(peticion(EDITOR_DESACTIVADO))).toBe(false)
    }
  })

  it('sigue naciendo pendiente: es el valor por omisión en el que cae lo rechazado', () => {
    // Cuando la regla rechaza el valor, Payload lo borra de los datos entrantes
    // y el campo cae en su `defaultValue`. Sin él, el comentario de un lector
    // nacería sin estado.
    expect((estado as { defaultValue?: unknown }).defaultValue).toBe('pendiente')
  })
})

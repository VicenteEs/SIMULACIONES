import { describe, it, expect } from 'vitest'
import type { Field, FieldAccess } from 'payload'
import { Usuarios } from '@/collections/Usuarios'

/**
 * Quién puede escribir `ultimoAcceso`.
 *
 * Esta fecha la anota `afterLogin` y nadie más, pero durante un tiempo estuvo
 * protegida solo con `admin: { readOnly: true }`, que es una indicación para la
 * interfaz de Payload —retirada en D-038— y el servidor nunca la miró. Lo único
 * que filtra campos en escritura es `field.access[operación]`, y Payload se
 * salta la comprobación entera cuando la operación en curso no está declarada
 * (`fields/hooks/beforeValidate/promise.js`).
 *
 * El agujero no se veía desde la aplicación: el panel escribe por la API local,
 * con `overrideAccess` en cierto por omisión. Se veía desde `curl`, porque la
 * API REST sigue montada: un `PATCH /api/usuarios/<id>` reescribía la fecha que
 * la pantalla de cuentas y las estadísticas miran para saber si una cuenta
 * sigue en uso antes de darla de baja.
 *
 * La prueba mira la declaración, no el comportamiento de Payload: lo que se
 * rompió aquí fue siempre un campo al que se le olvidó el `access`.
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

describe('el último acceso lo anota la plataforma y nadie más', () => {
  const ultimoAcceso = campoDe(Usuarios.fields, 'ultimoAcceso')

  it('declara las dos operaciones, no solo la modificación', () => {
    // Sin `create`, un `POST /api/usuarios` con la fecha puesta hacía nacer
    // «en uso» una cuenta que no ha entrado nunca, y el recuento de activos de
    // los últimos treinta días se la contaba.
    expect(
      typeof accesoDe(ultimoAcceso, 'create'),
      'ultimoAcceso no declara access.create: la API REST lo deja escribir al crear',
    ).toBe('function')
    expect(
      typeof accesoDe(ultimoAcceso, 'update'),
      'ultimoAcceso no declara access.update: la API REST lo deja reescribir',
    ).toBe('function')
  })

  it('se lo niega a todo el mundo, administrador incluido', async () => {
    // Al administrador también: el panel y el gancho `afterLogin` escriben por
    // la API local, donde el acceso de campo ni se evalúa. Quien llega hasta
    // esta regla viene por REST, y por REST nadie tiene que poder tocar la
    // fecha que decide si una cuenta se da de baja.
    for (const operacion of ['create', 'update'] as const) {
      for (const quien of [LECTOR, EDITOR, ADMIN, null]) {
        expect(await accesoDe(ultimoAcceso, operacion)!(peticion(quien))).toBe(false)
      }
    }
  })

  it('sigue siendo de solo lectura en la declaración del panel', () => {
    // Se conserva junto al acceso, no en su lugar: describe la intención para
    // quien lea el campo. La puerta real es la de arriba.
    expect((ultimoAcceso as { admin?: { readOnly?: boolean } }).admin?.readOnly).toBe(true)
  })
})

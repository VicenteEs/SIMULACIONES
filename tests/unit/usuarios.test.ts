import { afterEach, describe, it, expect } from 'vitest'
import type { Field, FieldAccess } from 'payload'
import {
  CuentaDesactivada,
  MENSAJE_CUENTA_DESACTIVADA,
  Usuarios,
  correoDeClaveNueva,
  enlaceDeClave,
} from '@/collections/Usuarios'

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

/**
 * La cuenta desactivada no entra, venga por donde venga.
 *
 * La regla de D-020 vivía solo en `entrar()`, la pantalla propia. Pero
 * `payload.login` también lo alcanza `POST /api/usuarios/login`, y por ahí una
 * cuenta dada de baja recibía un testigo firmado de ocho horas. Lo que la
 * salvaba después era el `activo` que comprueba cada guardia al resolver la
 * sesión, no el no tener sesión.
 *
 * El gancho se prueba llamándolo a secas: es una función pura sobre el usuario
 * que Payload le entrega y no toca la base ni la petición.
 */
const ganchoDeEntrada = () => {
  const ganchos = Usuarios.hooks?.beforeLogin
  if (!ganchos || ganchos.length !== 1) {
    throw new Error('Usuarios tiene que declarar exactamente un gancho beforeLogin')
  }
  return (usuario: unknown) => ganchos[0]({ user: usuario } as never)
}

describe('la cuenta desactivada no obtiene testigo', () => {
  const entrar = ganchoDeEntrada()

  it('rechaza la cuenta sin activar', () => {
    expect(() => entrar({ id: '3', email: 'r@h.cl', activo: false })).toThrow(CuentaDesactivada)
  })

  it('rechaza también la que no declara el campo, que es lo que manda un cliente a medias', () => {
    // `activo !== true` y no `!activo`: la comprobación es estricta a propósito,
    // porque lo que llega aquí puede venir de cualquier parte.
    for (const usuario of [{ id: '3' }, { id: '3', activo: null }, { id: '3', activo: 'sí' }]) {
      expect(() => entrar(usuario)).toThrow(CuentaDesactivada)
    }
  })

  it('deja pasar la cuenta activa y devuelve el usuario tal cual', () => {
    // Payload se queda con lo que devuelve el gancho (`user = await hook(…) || user`):
    // devolver otra cosa cambiaría el usuario que se firma en el testigo.
    const usuario = { id: '4', email: 'jefe@h.cl', activo: true }
    expect(entrar(usuario)).toBe(usuario)
  })

  it('el rechazo sale legible por REST y no como un 500 mudo', () => {
    // `isErrorPublic` mira el campo, no la clase: sin `isPublic`, `routeError`
    // sustituye el mensaje por «Something went wrong» y quien llama no sabe si
    // se equivocó de contraseña o si le dieron de baja.
    const fallo = new CuentaDesactivada()
    expect(fallo.isPublic).toBe(true)
    expect(fallo.status).toBe(403)
    expect(fallo.message).toBe(MENSAJE_CUENTA_DESACTIVADA)
    // `formatErrors` compone la respuesta desde `name` y `message`.
    expect(fallo.name).toBe('CuentaDesactivada')
  })
})

/**
 * El enlace de `/clave/<testigo>`, una sola vez.
 *
 * Lo arman el correo de recuperación y el panel, y cuando eran dos copias una
 * se dejó el recorte de la barra final: con `NEXT_PUBLIC_SERVER_URL` acabada en
 * `/`, el enlace salía con barra doble, no casaba con la ruta `/clave/[testigo]`
 * y lo atendía otra página del servidor compartido con un 404.
 */
describe('enlaceDeClave', () => {
  const original = process.env.NEXT_PUBLIC_SERVER_URL

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
    else process.env.NEXT_PUBLIC_SERVER_URL = original
  })

  it('lleva el prefijo, porque la dirección pública lo trae', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://ved.example.net:10000/traumahub'
    expect(enlaceDeClave('abc123')).toBe('https://ved.example.net:10000/traumahub/clave/abc123')
  })

  it('no deja una barra doble si la dirección trae barra final', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://ved.example.net:10000/traumahub/'
    expect(enlaceDeClave('abc123')).toBe('https://ved.example.net:10000/traumahub/clave/abc123')
  })

  it('es exactamente el que se pega en el correo: una sola regla para los dos sitios', () => {
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://ved.example.net:10000/traumahub/'
    expect(correoDeClaveNueva('abc123')).toContain(enlaceDeClave('abc123'))
  })
})

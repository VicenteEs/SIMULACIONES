import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { Payload } from 'payload'

/**
 * «Salir» tiene que matar el testigo, no solo la cookie (O-059).
 *
 * Es de integración y no unitaria porque lo que se comprueba no está en
 * `sesion.ts`: está en que la estrategia JWT de Payload rechace de verdad el
 * testigo cuyo `sid` ya no figura en `usuarios_sessions`, y en que el `update`
 * con `sessions` llegue a la fila. Con Payload simulado esta prueba pasaría
 * igual con el nombre del campo mal escrito, que era justo la duda.
 *
 * La guardia que impide que esto se omita en silencio es la de
 * `acceso.test.ts`: si la base no contesta, aquella falla en rojo y esta se
 * salta, que es lo mismo que hace `roles.test.ts`.
 */

// `salir` lee la petición con `next/headers`, que fuera de Next no existe. Se
// sustituye solo eso: Payload, la base y la acción son los de verdad.
const peticion = { cabeceras: new Headers(), borradas: [] as string[] }
vi.mock('next/headers', () => ({
  headers: async () => peticion.cabeceras,
  cookies: async () => ({
    delete: (cookie: { name: string }) => void peticion.borradas.push(cookie.name),
  }),
}))

const payload: Payload | null = await (async () => {
  try {
    const { getPayload } = await import('payload')
    const config = (await import('@payload-config')).default
    return await getPayload({ config })
  } catch {
    // Ver `acceso.test.ts`: el adaptador deja una promesa rechazada sin dueño.
    process.on('unhandledRejection', () => {})
    return null
  }
})()

describe.skipIf(payload === null)('salir da de baja la sesión en la base', () => {
  const base = payload as Payload
  const email = `salir-${randomBytes(6).toString('hex')}@prueba.invalid`
  const password = randomBytes(18).toString('base64url')
  let cuentaId: number | string

  const cabecerasCon = (testigo: string) =>
    new Headers({
      cookie: `${base.config.cookiePrefix}-token=${testigo}`,
      'sec-fetch-site': 'same-origin',
    })

  const entrar = async () =>
    (await base.login({ collection: 'usuarios', data: { email, password } })).token as string

  beforeAll(async () => {
    const cuenta = await base.create({
      collection: 'usuarios',
      data: { nombre: 'Prueba de salir', email, password, rol: 'lector', activo: true } as never,
      overrideAccess: true,
    })
    cuentaId = cuenta.id
  })

  afterAll(async () => {
    if (cuentaId) {
      await base.delete({ collection: 'usuarios', id: cuentaId, overrideAccess: true }).catch(() => {})
    }
  })

  it('el testigo copiado antes de salir deja de abrir sesión, y el de otro dispositivo no', async () => {
    const pabellon = await entrar()
    const telefono = await entrar()
    expect((await base.auth({ headers: cabecerasCon(pabellon) })).user).not.toBeNull()

    const { salir } = await import('@/app/(frontend)/acciones/sesion')
    peticion.cabeceras = cabecerasCon(pabellon)
    const respuesta = await salir()

    expect(respuesta.exito).toBe(true)
    expect(peticion.borradas).toContain(`${base.config.cookiePrefix}-token`)
    expect((await base.auth({ headers: cabecerasCon(pabellon) })).user).toBeNull()
    // Salir en el computador del pabellón no cierra la sesión del teléfono.
    expect((await base.auth({ headers: cabecerasCon(telefono) })).user).not.toBeNull()
  })
})

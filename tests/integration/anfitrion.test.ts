import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { CABECERA_DEL_SUBDOMINIO } from '@/lib/anfitrion'
import { olvidarInstituciones } from '@/lib/institucionesServidor'

/**
 * Una cuenta vale solo en el anfitrión de su institución (P-016 E5.2, D-396),
 * contra una base de verdad.
 *
 * Lo que se cuida es la entrada y la sesión, que son las dos puertas: una
 * cuenta de institución no entra en la central ni en otra, una central no entra
 * en una institución, y en un subdominio que no existe no entra nadie. Las
 * reglas puras están en `tests/unit/anfitrion.test.ts`; aquí, que el gancho
 * `beforeLogin` y `obtenerSesion` las aplican de verdad.
 */

// `entrar` y `obtenerSesion` leen la petición con `next/headers`, que fuera de
// Next no existe. La cabecera del subdominio es la que dejaría `proxy.ts`.
const peticion = { cabeceras: new Headers() }
vi.mock('next/headers', () => ({
  headers: async () => peticion.cabeceras,
  cookies: async () => ({ delete: () => {}, set: () => {}, get: () => undefined }),
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

const marca = randomBytes(4).toString('hex')

describe.skipIf(payload === null)('cada cuenta en su lugar (D-396)', () => {
  const base = payload as Payload
  const subdominio = `a${marca}`
  const otro = `b${marca}`
  const clave = randomBytes(18).toString('base64url')
  const correoDeLaInstitucion = `institucion-${marca}@prueba.invalid`
  const correoCentral = `central-${marca}@prueba.invalid`
  const creadas: { coleccion: 'instituciones' | 'usuarios'; id: number | string }[] = []

  const en = (sub: string) => {
    peticion.cabeceras = new Headers({ [CABECERA_DEL_SUBDOMINIO]: sub })
  }

  beforeAll(async () => {
    for (const sub of [subdominio, otro]) {
      const institucion = await base.create({
        collection: 'instituciones',
        data: { nombre: `Institución ${sub}`, subdominio: sub, modalidad: 'piloto', inicio: new Date().toISOString(), cupo: 5, correoDelAdministrador: `admin-${sub}@prueba.invalid` },
        overrideAccess: true,
      })
      creadas.push({ coleccion: 'instituciones', id: institucion.id })
      if (sub !== subdominio) continue
      const cuenta = await base.create({
        collection: 'usuarios',
        data: { nombre: 'De la institución', email: correoDeLaInstitucion, password: clave, rol: 'lector', activo: true, institucion: institucion.id } as never,
        overrideAccess: true,
      })
      creadas.push({ coleccion: 'usuarios', id: cuenta.id })
    }
    const central = await base.create({
      collection: 'usuarios',
      data: { nombre: 'Central', email: correoCentral, password: clave, rol: 'lector', activo: true } as never,
      overrideAccess: true,
    })
    creadas.push({ coleccion: 'usuarios', id: central.id })
    olvidarInstituciones()
  })

  afterAll(async () => {
    for (const { coleccion, id } of creadas.reverse()) {
      await base.delete({ collection: coleccion, id, overrideAccess: true }).catch(() => undefined)
    }
    olvidarInstituciones()
  })

  const idDe = async (sub: string) =>
    String(
      (await base.find({ collection: 'instituciones', where: { subdominio: { equals: sub } }, overrideAccess: true })).docs[0].id,
    )

  const entrarCon = async (correo: string) => {
    const { entrar } = await import('@/app/(frontend)/acciones/sesion')
    return entrar(correo, clave)
  }

  it('la cuenta de una institución entra en la suya, y en ninguna otra parte', async () => {
    en(subdominio)
    expect(await entrarCon(correoDeLaInstitucion)).toMatchObject({ exito: true })
    for (const lugar of ['', otro]) {
      en(lugar)
      // Lo mismo que una contraseña mala: decir otra cosa contaría de qué
      // institución es cada correo.
      expect(await entrarCon(correoDeLaInstitucion), lugar || 'central').toEqual({
        exito: false,
        mensaje: 'Correo o contraseña incorrectos.',
      })
    }
  })

  it('la central entra en la central, y no en una institución', async () => {
    en('')
    expect(await entrarCon(correoCentral)).toMatchObject({ exito: true })
    en(subdominio)
    expect(await entrarCon(correoCentral)).toEqual({ exito: false, mensaje: 'Correo o contraseña incorrectos.' })
  })

  it('en un subdominio sin institución no entra nadie', async () => {
    en(`nadie${marca}`)
    expect(await entrarCon(correoCentral)).toEqual({ exito: false, mensaje: 'Correo o contraseña incorrectos.' })
  })

  it('una llamada local que no dice el lugar queda en la central', async () => {
    await expect(
      base.login({ collection: 'usuarios', data: { email: correoDeLaInstitucion, password: clave } }),
    ).rejects.toThrow()
    await expect(base.login({ collection: 'usuarios', data: { email: correoCentral, password: clave } })).resolves.toMatchObject({
      token: expect.any(String),
    })
  })

  it('la sesión de una cuenta no vale fuera de su lugar', async () => {
    const { token } = await base.login({
      collection: 'usuarios',
      data: { email: correoDeLaInstitucion, password: clave },
      context: { institucionDelLugar: await idDe(subdominio) },
    })
    const { obtenerSesion } = await import('@/lib/sesion')
    const con = (sub: string) => {
      peticion.cabeceras = new Headers({
        [CABECERA_DEL_SUBDOMINIO]: sub,
        cookie: `${base.config.cookiePrefix}-token=${token}`,
        'sec-fetch-site': 'same-origin',
      })
    }
    con(subdominio)
    const enLaSuya = await obtenerSesion()
    expect(enLaSuya.usuario).not.toBeNull()
    expect(enLaSuya.lugar?.institucion?.subdominio).toBe(subdominio)
    for (const lugar of ['', otro, `nadie${marca}`]) {
      con(lugar)
      expect((await obtenerSesion()).usuario, lugar || 'central').toBeNull()
    }
  })

  it('Payload conserva la lista de orígenes que acepta los subdominios (csrf)', async () => {
    // Lo que se arriesga aquí es que Payload copiara la lista al sanear la
    // configuración: la copia sería un arreglo corriente, sin los subdominios,
    // y toda acción de servidor de una institución llegaría sin sesión. Las
    // reglas de la lista están en `tests/unit/anfitrion.test.ts`.
    const { OrigenesDeConfianza } = await import('@/lib/anfitrion')
    expect(base.config.csrf).toBeInstanceOf(OrigenesDeConfianza)
  })
})

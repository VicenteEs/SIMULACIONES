import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

/**
 * La matriz de roles cruzando instituciones (P-016 E5.3, D-396), contra una
 * base de verdad.
 *
 * `roles.test.ts` cruza cada rol con cada colección dentro de TraumaHub. Aquí,
 * cada rol de cada lugar —la central, la institución A y la B— con filas de
 * los tres: qué lee, qué borradores alcanza y qué puede escribir. Todo con
 * `overrideAccess: false`, que es como leen las páginas de los módulos y como
 * Payload sirve los archivos. Lo que el panel consulta saltándose las reglas
 * lo cuida la segunda barrera, en PostgreSQL (E5.4).
 */

// El aviso de un comentario. Las pruebas no tienen servidor de correo
// (`tests/setup.ts`): se finge que lo hay solo en la prueba del aviso, y el
// envío se queda en el espía. Igual que en `entradas.test.ts`.
const correo = vi.hoisted(() => ({ activo: false, enviar: vi.fn() }))
vi.mock('@/correo/enviar', async (original) => ({
  ...(await original<typeof import('@/correo/enviar')>()),
  hayCorreo: () => correo.activo,
  enviarSinEsperar: correo.enviar,
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

type Lugar = 'central' | 'A' | 'B'
type Actor = 'adminCentral' | 'lectorCentral' | 'adminA' | 'editorA' | 'lectorA' | 'lectorB' | 'editorB'

const ACTORES: Record<Actor, { lugar: Lugar; rol: 'admin' | 'editor' | 'lector' }> = {
  adminCentral: { lugar: 'central', rol: 'admin' },
  lectorCentral: { lugar: 'central', rol: 'lector' },
  adminA: { lugar: 'A', rol: 'admin' },
  editorA: { lugar: 'A', rol: 'editor' },
  lectorA: { lugar: 'A', rol: 'lector' },
  lectorB: { lugar: 'B', rol: 'lector' },
  editorB: { lugar: 'B', rol: 'editor' },
}

/** Las fichas de prueba: de qué lugar son y si están publicadas. */
type Ficha = 'centralPublicada' | 'centralBorrador' | 'aPublicada' | 'aBorrador' | 'bPublicada'
const FICHAS: Record<Ficha, { lugar: Lugar; publicada: boolean }> = {
  centralPublicada: { lugar: 'central', publicada: true },
  centralBorrador: { lugar: 'central', publicada: false },
  aPublicada: { lugar: 'A', publicada: true },
  aBorrador: { lugar: 'A', publicada: false },
  bPublicada: { lugar: 'B', publicada: true },
}

/** Lo que cada actor tiene que leer de las fichas; el resto, nada. */
const LEE: Record<Actor, Ficha[]> = {
  // La central ve solo lo central: lo de una institución no aparece allí.
  adminCentral: ['centralPublicada', 'centralBorrador'],
  lectorCentral: ['centralPublicada'],
  // La institución, lo central publicado y lo suyo, con las reglas de su rol.
  adminA: ['centralPublicada', 'aPublicada', 'aBorrador'],
  editorA: ['centralPublicada', 'aPublicada', 'aBorrador'],
  lectorA: ['centralPublicada', 'aPublicada'],
  lectorB: ['centralPublicada', 'bPublicada'],
  editorB: ['centralPublicada', 'bPublicada'],
}

/** Lo que puede reescribir: solo lo de su lugar, y solo con un rol que edita. */
const ESCRIBE: Record<Actor, Ficha[]> = {
  adminCentral: ['centralPublicada', 'centralBorrador'],
  lectorCentral: [],
  adminA: ['aPublicada', 'aBorrador'],
  editorA: ['aPublicada', 'aBorrador'],
  lectorA: [],
  lectorB: [],
  editorB: ['bPublicada'],
}

describe.skipIf(payload === null)('los roles entre instituciones (D-396)', () => {
  const base = payload as Payload
  const instituciones: Partial<Record<Lugar, number | string | null>> = { central: null }
  const usuarios = {} as Record<Actor, Record<string, unknown>>
  const fichas = {} as Record<Ficha, number | string>
  const borrar: {
    coleccion: 'instituciones' | 'usuarios' | 'patologias' | 'segmentos' | 'entradas' | 'comentarios'
    id: number | string
  }[] = []
  const entradas = {} as Record<Lugar, number | string>

  beforeAll(async () => {
    for (const lugar of ['A', 'B'] as const) {
      const fila = await base.create({
        collection: 'instituciones',
        data: {
          nombre: `Institución ${lugar} ${marca}`,
          subdominio: `${lugar.toLowerCase()}${marca}`,
          modalidad: 'piloto',
          inicio: new Date().toISOString(),
          cupo: 10,
          correoDelAdministrador: `admin-${lugar}-${marca}@prueba.invalid`,
        },
        overrideAccess: true,
      })
      instituciones[lugar] = fila.id
      borrar.push({ coleccion: 'instituciones', id: fila.id })
    }
    for (const [actor, { lugar, rol }] of Object.entries(ACTORES) as [Actor, (typeof ACTORES)[Actor]][]) {
      const cuenta = await base.create({
        collection: 'usuarios',
        data: {
          nombre: `${actor} ${marca}`,
          email: `${actor.toLowerCase()}-${marca}@prueba.invalid`,
          password: randomBytes(18).toString('base64url'),
          rol,
          activo: true,
          institucion: instituciones[lugar] ?? null,
        } as never,
        overrideAccess: true,
      })
      borrar.push({ coleccion: 'usuarios', id: cuenta.id })
      // Como lo deja la sesión: la fila con la institución poblada.
      usuarios[actor] = (await base.findByID({ collection: 'usuarios', id: cuenta.id, overrideAccess: true, depth: 1 })) as never
    }
    const segmento = await base.create({ collection: 'segmentos', data: { nombre: `Segmento ${marca}`, orden: 996 }, overrideAccess: true })
    borrar.push({ coleccion: 'segmentos', id: segmento.id })
    for (const [ficha, { lugar, publicada }] of Object.entries(FICHAS) as [Ficha, (typeof FICHAS)[Ficha]][]) {
      const fila = await base.create({
        collection: 'patologias',
        data: {
          nombre: `${ficha} ${marca}`,
          segmento: segmento.id,
          institucion: instituciones[lugar] ?? null,
          _status: publicada ? 'published' : 'draft',
        } as never,
        draft: !publicada,
        overrideAccess: true,
      })
      fichas[ficha] = fila.id
      borrar.push({ coleccion: 'patologias', id: fila.id })
    }
    for (const lugar of ['central', 'A', 'B'] as const) {
      const dueno = usuarios[lugar === 'central' ? 'lectorCentral' : lugar === 'A' ? 'lectorA' : 'lectorB']
      const fila = await base.create({
        collection: 'entradas',
        data: { fecha: new Date().toISOString(), usuario: dueno.id as number, equipo: `prueba ${marca}` },
        overrideAccess: true,
      })
      entradas[lugar] = fila.id
      borrar.push({ coleccion: 'entradas', id: fila.id })
    }
  }, 120_000)

  afterAll(async () => {
    for (const { coleccion, id } of borrar.reverse()) {
      await base.delete({ collection: coleccion, id, overrideAccess: true }).catch(() => undefined)
    }
  })

  const nombreDe = (id: number | string) => (Object.entries(fichas).find(([, valor]) => valor === id) ?? [])[0]

  describe.each(Object.keys(ACTORES) as Actor[])('%s', (actor) => {
    it('lee lo que le toca de las fichas, y nada más', async () => {
      // Como leen las páginas: el residente, lo publicado; quien edita, con
      // los borradores.
      const { docs } = await base.find({
        collection: 'patologias',
        where: { nombre: { contains: marca } },
        draft: ACTORES[actor].rol !== 'lector',
        limit: 50,
        depth: 0,
        overrideAccess: false,
        user: usuarios[actor] as never,
      })
      expect(docs.map((d) => nombreDe(d.id)).sort()).toEqual([...LEE[actor]].sort())
    })

    it('reescribe solo las fichas de su lugar', async () => {
      for (const ficha of Object.keys(FICHAS) as Ficha[]) {
        // Con el estado que ya tenía: guardar un borrador encima de lo
        // publicado lo dejaría como borrador para los que leen después.
        const { publicada } = FICHAS[ficha]
        const intento = base.update({
          collection: 'patologias',
          id: fichas[ficha],
          data: { resumen: `tocada por ${actor}`, _status: publicada ? 'published' : 'draft' } as never,
          draft: !publicada,
          depth: 0,
          overrideAccess: false,
          user: usuarios[actor] as never,
        })
        if (ESCRIBE[actor].includes(ficha)) await expect(intento, `${actor} → ${ficha}`).resolves.toBeTruthy()
        else await expect(intento, `${actor} → ${ficha}`).rejects.toThrow()
      }
    })

    it('alcanza los borradores de su lugar y no los de otro', async () => {
      const versiones = () =>
        base.findVersions({
          collection: 'patologias',
          where: { parent: { in: Object.values(fichas) } },
          limit: 200,
          depth: 0,
          overrideAccess: false,
          user: usuarios[actor] as never,
        })
      // A quien no edita, Payload le niega las versiones con un 403, como antes
      // de las instituciones (`lecturaDeBorradores`).
      if (ESCRIBE[actor].length === 0) return void (await expect(versiones()).rejects.toThrow())
      const { docs } = await versiones()
      const lugares = new Set(docs.map((v) => FICHAS[nombreDe(v.parent as number) as Ficha]?.lugar))
      expect([...lugares]).toEqual([ACTORES[actor].lugar])
    })
  })

  it('las cuentas: cada administrador lee solo las de su lugar', async () => {
    const lugaresQueLee = async (actor: Actor) => {
      const { docs } = await base.find({
        collection: 'usuarios',
        where: { email: { contains: marca } },
        limit: 50,
        depth: 0,
        overrideAccess: false,
        user: usuarios[actor] as never,
      })
      return [...new Set(docs.map((d) => (Object.entries(usuarios).find(([, u]) => u.id === d.id) ?? [])[0]).map((a) => ACTORES[a as Actor].lugar))]
    }
    expect(await lugaresQueLee('adminCentral')).toEqual(['central'])
    expect(await lugaresQueLee('adminA')).toEqual(['A'])
  })

  it('lo personal: cada administrador lee solo las entradas de su lugar', async () => {
    const leidas = async (actor: Actor) =>
      (
        await base.find({
          collection: 'entradas',
          where: { equipo: { equals: `prueba ${marca}` } },
          limit: 10,
          depth: 0,
          overrideAccess: false,
          user: usuarios[actor] as never,
        })
      ).docs.map((d) => d.id)
    expect(await leidas('adminCentral')).toEqual([entradas.central])
    expect(await leidas('adminA')).toEqual([entradas.A])
  })

  it('el aviso de un comentario va a los administradores de su lugar, con el enlace a su subdominio', async () => {
    const antes = { url: process.env.NEXT_PUBLIC_SERVER_URL, pruebas: process.env.SERVIDOR_DE_PRUEBAS }
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://traumahub.test'
    process.env.SERVIDOR_DE_PRUEBAS = ''
    correo.activo = true
    correo.enviar.mockClear()
    try {
      const comentario = await base.create({
        collection: 'comentarios',
        data: { coleccion: 'patologias', documentoId: String(fichas.aPublicada), texto: `Un comentario ${marca}` } as never,
        user: usuarios.lectorA as never,
        overrideAccess: true,
      })
      borrar.push({ coleccion: 'comentarios', id: comentario.id })
      expect(correo.enviar).toHaveBeenCalledTimes(1)
      const [, envio] = correo.enviar.mock.calls[0] as [unknown, { para: string[]; correo: { boton?: { enlace: string } } }]
      expect(envio.para).toEqual([usuarios.adminA.email])
      expect(envio.correo.boton?.enlace).toBe(`https://a${marca}.traumahub.test/admin-panel/comentarios`)
    } finally {
      correo.activo = false
      process.env.NEXT_PUBLIC_SERVER_URL = antes.url
      process.env.SERVIDOR_DE_PRUEBAS = antes.pruebas
      if (antes.url === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
      if (antes.pruebas === undefined) delete process.env.SERVIDOR_DE_PRUEBAS
    }
  })
})

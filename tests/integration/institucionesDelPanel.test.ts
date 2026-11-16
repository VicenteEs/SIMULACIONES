import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

/**
 * La pestaña «Instituciones» contra una base de verdad (P-016 E5.5, D-400):
 * crear una deja la institución, la cuenta de su administrador y la invitación
 * a su subdominio, o nada; y lo que se cambia después.
 *
 * Las guardias (solo el administrador de TraumaHub) las recorre
 * `tests/unit/accionesConGuardia.test.ts`.
 */

const estado = vi.hoisted(() => ({ sesion: null as unknown, enviados: [] as { para: string; enlace?: string }[] }))

vi.mock('@/lib/sesion', () => ({ obtenerSesion: async () => estado.sesion }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
// Un servidor de correo de mentira: el envío se queda aquí, con su botón.
vi.mock('@/correo/enviar', async (original) => ({
  ...(await original<typeof import('@/correo/enviar')>()),
  hayCorreo: () => true,
  enviarCorreo: async (_payload: unknown, envio: { para: string; correo: { boton?: { enlace: string } } }) => {
    estado.enviados.push({ para: envio.para, enlace: envio.correo.boton?.enlace })
  },
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

describe.skipIf(payload === null)('la pestaña «Instituciones»', () => {
  const base = payload as Payload
  const subdominio = `p${marca}`
  const correoDelAdmin = `admin-${marca}@prueba.invalid`
  const borrarCuentas: number[] = []
  const borrarInstituciones: number[] = []
  let acciones: typeof import('@/app/(frontend)/acciones/instituciones')

  const datos = (extra: Record<string, unknown> = {}) => ({
    nombre: `Hospital ${marca}`,
    subdominio,
    modalidad: 'piloto',
    inicio: '2026-11-16',
    vence: '2026-12-01',
    cupo: '20',
    correoDelAdministrador: correoDelAdmin,
    nombreDelAdministrador: 'Ana Prueba',
    ...extra,
  })

  const cuentaDe = async (email: string) =>
    (await base.find({ collection: 'usuarios', where: { email: { equals: email } }, depth: 0, limit: 1 })).docs[0] as unknown as
      | (Record<string, unknown> & { id: number })
      | undefined

  beforeAll(async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://traumahub.prueba')
    vi.stubEnv('SERVIDOR_DE_PRUEBAS', '')
    const central = await base.create({
      collection: 'usuarios',
      data: {
        nombre: `Central ${marca}`,
        email: `central-${marca}@prueba.invalid`,
        password: randomBytes(18).toString('base64url'),
        rol: 'admin',
        activo: true,
      } as never,
    })
    borrarCuentas.push(Number(central.id))
    estado.sesion = { usuario: central, activo: true, rolReal: 'admin', rol: 'admin' }
    acciones = await import('@/app/(frontend)/acciones/instituciones')
  }, 120_000)

  afterAll(async () => {
    vi.unstubAllEnvs()
    const admin = await cuentaDe(correoDelAdmin)
    if (admin) borrarCuentas.unshift(admin.id)
    for (const id of borrarCuentas) await base.delete({ collection: 'usuarios', id }).catch(() => undefined)
    for (const id of borrarInstituciones) await base.delete({ collection: 'instituciones', id }).catch(() => undefined)
  })

  it('crear deja la institución, su administrador y la invitación a su subdominio', async () => {
    const r = await acciones.crearInstitucion(datos())
    expect(r.exito, r.mensaje).toBe(true)
    if (!r.datos) return
    borrarInstituciones.push(Number(r.datos.id))

    const fila = await base.findByID({ collection: 'instituciones', id: r.datos.id, depth: 0 })
    expect(fila).toMatchObject({ subdominio, modalidad: 'piloto', cupo: 20, correoDelAdministrador: correoDelAdmin })
    // El último día entero en Chile: el 1 de diciembre aún vale.
    expect(new Date(fila.vence as string).toISOString()).toBe('2026-12-02T02:59:59.999Z')

    const admin = await cuentaDe(correoDelAdmin)
    expect(admin).toMatchObject({ rol: 'admin', activo: true, institucion: Number(r.datos.id) })

    expect(r.datos.invitacion.enviada).toBe(true)
    const enviado = estado.enviados.find((e) => e.para === correoDelAdmin)
    expect(enviado?.enlace).toMatch(new RegExp(`^https://${subdominio}\\.traumahub\\.prueba/clave/[^/]+$`))
  })

  it('el mismo subdominio, o un correo que ya tiene cuenta, no crean nada', async () => {
    const repetido = await acciones.crearInstitucion(datos({ correoDelAdministrador: `otro-${marca}@prueba.invalid` }))
    expect(repetido.exito).toBe(false)
    expect(repetido.mensaje).toMatch(/ya es de/)

    const otro = `q${marca}`
    const conCorreoUsado = await acciones.crearInstitucion(datos({ subdominio: otro, correoDelAdministrador: `central-${marca}@prueba.invalid` }))
    expect(conCorreoUsado.exito).toBe(false)
    expect(conCorreoUsado.mensaje).toMatch(/ya tiene una cuenta/)
    const { totalDocs } = await base.count({ collection: 'instituciones', where: { subdominio: { equals: otro } } })
    expect(totalDocs).toBe(0)
  })

  it('cambiar el plazo y el cupo, y saber cuántas cuentas activas hay', async () => {
    const id = borrarInstituciones[0]
    const r = await acciones.actualizarInstitucion(String(id), {
      nombre: `Hospital ${marca}`,
      modalidad: 'definitiva',
      vence: '',
      cupo: '1',
      correoDelAdministrador: correoDelAdmin,
    })
    expect(r.exito, r.mensaje).toBe(true)
    expect(r.datos).toEqual({ activas: 1, cupo: 1 })
    const fila = await base.findByID({ collection: 'instituciones', id, depth: 0 })
    expect(fila).toMatchObject({ modalidad: 'definitiva', cupo: 1, subdominio })
    expect(fila.vence ?? null).toBeNull()
  })

  it('la invitación de nuevo devuelve la llave al administrador que la institución perdió', async () => {
    const id = borrarInstituciones[0]
    const admin = await cuentaDe(correoDelAdmin)
    await base.update({ collection: 'usuarios', id: admin!.id, data: { activo: false } })
    estado.enviados.length = 0

    const r = await acciones.invitarAdministrador(String(id))
    expect(r.exito, r.mensaje).toBe(true)
    expect(await cuentaDe(correoDelAdmin)).toMatchObject({ activo: true, rol: 'admin', institucion: id })
    expect(estado.enviados.map((e) => e.para)).toEqual([correoDelAdmin])
  })

  it('pero no se lleva la cuenta de otro lugar', async () => {
    const id = borrarInstituciones[0]
    await base.update({ collection: 'instituciones', id, data: { correoDelAdministrador: `central-${marca}@prueba.invalid` } })
    const r = await acciones.invitarAdministrador(String(id))
    expect(r.exito).toBe(false)
    expect(r.mensaje).toMatch(/otro lugar/)
    const central = await cuentaDe(`central-${marca}@prueba.invalid`)
    expect(central?.institucion ?? null).toBeNull()
  })

  it('ni invita en una institución bloqueada: primero se extiende el plazo (D-403)', async () => {
    const id = borrarInstituciones[0]
    await base.update({
      collection: 'instituciones',
      id,
      data: { correoDelAdministrador: correoDelAdmin, vence: new Date(Date.now() - 86_400_000).toISOString() },
    })
    estado.enviados.length = 0
    const r = await acciones.invitarAdministrador(String(id))
    expect(r.exito).toBe(false)
    expect(r.mensaje).toMatch(/terminó.*Extienda el plazo/)
    expect(estado.enviados).toEqual([])
  })
})

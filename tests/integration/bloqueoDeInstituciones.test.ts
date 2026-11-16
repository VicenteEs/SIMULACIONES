import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import { CABECERA_DEL_SUBDOMINIO } from '@/lib/anfitrion'
import { olvidarInstituciones } from '@/lib/institucionesServidor'
import { leerZip, textoDe } from '../leerZip'

/**
 * El bloqueo de una institución vencida, sus doce meses y la exportación (P-016
 * E5.8, D-403), contra una base de verdad.
 *
 * Lo que se cuida: que nadie entre ni conserve la sesión, que el aviso salga
 * una vez y a quien tiene que salir, que el borrado se lleve las cuentas y deje
 * el contenido, y que la exportación lleve lo de la institución y nada más.
 *
 * La pasada corre con la hora de verdad: el aviso de 31 días atrás se escribe
 * en la fila en vez de adelantar el reloj. Así no alcanza a las instituciones
 * que otras pruebas tengan a medias en la misma base, que vencieron hace
 * minutos y no hace un año.
 */

const estado = vi.hoisted(() => ({
  cabeceras: new Headers(),
  correos: [] as { para: unknown; correo: { asunto?: string; boton?: { enlace?: string } } }[],
}))

// `entrar` y `obtenerSesion` leen la petición con `next/headers`, que fuera de
// Next no existe.
vi.mock('next/headers', () => ({
  headers: async () => estado.cabeceras,
  cookies: async () => ({ delete: () => {}, set: () => {}, get: () => undefined }),
}))
// Los correos se anotan en vez de salir, con servidor de correo «configurado»
// para que el aviso de borrado no se salte el envío.
vi.mock('@/correo/enviar', async (original) => ({
  ...(await original<typeof import('@/correo/enviar')>()),
  hayCorreo: () => true,
  enviarCorreo: async (_payload: unknown, envio: (typeof estado.correos)[number]) => {
    estado.correos.push(envio)
  },
  enviarSinEsperar: (_payload: unknown, envio: (typeof estado.correos)[number]) => {
    estado.correos.push(envio)
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
const DIA = 86_400_000

/** Hace `meses` meses de calendario. */
const haceMeses = (meses: number) => {
  const fecha = new Date()
  fecha.setUTCMonth(fecha.getUTCMonth() - meses)
  return fecha
}

describe.skipIf(payload === null)('el bloqueo de una institución vencida (D-403)', () => {
  const base = payload as Payload
  const clave = randomBytes(18).toString('base64url')
  const borrar: { coleccion: 'instituciones' | 'usuarios' | 'patologias' | 'segmentos'; id: number | string }[] = []
  const lugares = {} as Record<'vieja' | 'reciente' | 'vacia' | 'abierta', { id: number | string; subdominio: string; nombre: string }>
  const correos = {
    adminVieja: `admin-vieja-${marca}@prueba.invalid`,
    lectorVieja: `lector-vieja-${marca}@prueba.invalid`,
    contactoVieja: `contacto-vieja-${marca}@prueba.invalid`,
    deLaReciente: `reciente-${marca}@prueba.invalid`,
    deLaAbierta: `abierta-${marca}@prueba.invalid`,
    central: `central-${marca}@prueba.invalid`,
  }
  const fichas = {} as Record<'vieja' | 'reciente', number | string>
  let direccionAntes: string | undefined
  let pruebasAntes: string | undefined

  const en = (lugar: keyof typeof lugares | 'central') => {
    estado.cabeceras = new Headers(lugar === 'central' ? {} : { [CABECERA_DEL_SUBDOMINIO]: lugares[lugar].subdominio })
  }

  const fila = async (lugar: keyof typeof lugares) =>
    (await base.findByID({ collection: 'instituciones', id: lugares[lugar].id, depth: 0, overrideAccess: true })) as unknown as Record<
      string,
      unknown
    >

  const cuentasDe = async (lugar: keyof typeof lugares) =>
    (await base.count({ collection: 'usuarios', where: { institucion: { equals: lugares[lugar].id } }, overrideAccess: true })).totalDocs

  const cambiar = (lugar: keyof typeof lugares, data: Record<string, unknown>) =>
    base.update({ collection: 'instituciones', id: lugares[lugar].id, data, depth: 0, overrideAccess: true })

  beforeAll(async () => {
    direccionAntes = process.env.NEXT_PUBLIC_SERVER_URL
    pruebasAntes = process.env.SERVIDOR_DE_PRUEBAS
    process.env.NEXT_PUBLIC_SERVER_URL = 'https://traumahub.prueba.invalid'
    delete process.env.SERVIDOR_DE_PRUEBAS

    const plazos = {
      vieja: haceMeses(13),
      reciente: haceMeses(2),
      vacia: haceMeses(13),
      abierta: new Date(Date.now() + 30 * DIA),
    }
    for (const [lugar, vence] of Object.entries(plazos) as [keyof typeof lugares, Date][]) {
      const subdominio = `blq${lugar}${marca}`
      const nombre = `Hospital ${lugar} ${marca}`
      const creada = await base.create({
        collection: 'instituciones',
        data: {
          nombre,
          subdominio,
          modalidad: 'piloto',
          inicio: new Date(vence.getTime() - 60 * DIA).toISOString(),
          vence: vence.toISOString(),
          cupo: 10,
          correoDelAdministrador: lugar === 'vieja' ? correos.contactoVieja : `admin-${subdominio}@prueba.invalid`,
        },
        overrideAccess: true,
      })
      lugares[lugar] = { id: creada.id, subdominio, nombre }
      borrar.push({ coleccion: 'instituciones', id: creada.id })
    }

    const cuenta = async (email: string, rol: string, lugar: keyof typeof lugares | null) => {
      const creada = await base.create({
        collection: 'usuarios',
        data: {
          nombre: `Cuenta ${marca}`,
          email,
          password: clave,
          rol,
          activo: true,
          ...(lugar ? { institucion: lugares[lugar].id } : {}),
        } as never,
        overrideAccess: true,
      })
      borrar.push({ coleccion: 'usuarios', id: creada.id })
    }
    await cuenta(correos.adminVieja, 'admin', 'vieja')
    await cuenta(correos.lectorVieja, 'lector', 'vieja')
    await cuenta(correos.deLaReciente, 'lector', 'reciente')
    await cuenta(correos.deLaAbierta, 'lector', 'abierta')
    await cuenta(correos.central, 'admin', null)

    const segmento = await base.create({ collection: 'segmentos', data: { nombre: `Segmento ${marca}`, orden: 995 }, overrideAccess: true })
    borrar.push({ coleccion: 'segmentos', id: segmento.id })
    for (const lugar of ['vieja', 'reciente'] as const) {
      const ficha = await base.create({
        collection: 'patologias',
        data: { nombre: `Ficha de ${lugar} ${marca}`, segmento: segmento.id, institucion: lugares[lugar].id, _status: 'draft' } as never,
        draft: true,
        overrideAccess: true,
      })
      fichas[lugar] = ficha.id
      borrar.push({ coleccion: 'patologias', id: ficha.id })
    }
    olvidarInstituciones()
  }, 120_000)

  afterAll(async () => {
    for (const { coleccion, id } of borrar.reverse()) {
      await base.delete({ collection: coleccion, id, overrideAccess: true }).catch(() => undefined)
    }
    olvidarInstituciones()
    if (direccionAntes === undefined) delete process.env.NEXT_PUBLIC_SERVER_URL
    else process.env.NEXT_PUBLIC_SERVER_URL = direccionAntes
    if (pruebasAntes !== undefined) process.env.SERVIDOR_DE_PRUEBAS = pruebasAntes
  })

  it('nadie entra, ni con la contraseña buena; en la abierta, sí', async () => {
    const { entrar } = await import('@/app/(frontend)/acciones/sesion')
    const { MENSAJE_INSTITUCION_BLOQUEADA, InstitucionBloqueadaAlEntrar } = await import('@/collections/Usuarios')
    en('reciente')
    expect(await entrar(correos.deLaReciente, clave)).toEqual({ exito: false, mensaje: MENSAJE_INSTITUCION_BLOQUEADA })
    // Y el gancho, que es lo que cierra `resetPassword` y cualquier otra entrada.
    await expect(
      base.login({
        collection: 'usuarios',
        data: { email: correos.deLaReciente, password: clave },
        context: { institucionDelLugar: String(lugares.reciente.id) },
      }),
    ).rejects.toBeInstanceOf(InstitucionBloqueadaAlEntrar)
    en('abierta')
    expect(await entrar(correos.deLaAbierta, clave)).toMatchObject({ exito: true })
  })

  it('la sesión abierta antes de vencer deja de valer al vencer, y vuelve al extender el plazo', async () => {
    const { token } = await base.login({
      collection: 'usuarios',
      data: { email: correos.deLaAbierta, password: clave },
      context: { institucionDelLugar: String(lugares.abierta.id) },
    })
    const { obtenerSesion } = await import('@/lib/sesion')
    const conLaSesion = () => {
      estado.cabeceras = new Headers({
        [CABECERA_DEL_SUBDOMINIO]: lugares.abierta.subdominio,
        cookie: `${base.config.cookiePrefix}-token=${token}`,
        'sec-fetch-site': 'same-origin',
      })
    }
    const { vence } = await fila('abierta')
    try {
      conLaSesion()
      expect((await obtenerSesion()).usuario).not.toBeNull()
      // Guardar la institución borra lo que este proceso tenía guardado de ella.
      await cambiar('abierta', { vence: new Date(Date.now() - 60_000).toISOString() })
      conLaSesion()
      expect((await obtenerSesion()).usuario).toBeNull()
    } finally {
      await cambiar('abierta', { vence })
    }
    conLaSesion()
    expect((await obtenerSesion()).usuario).not.toBeNull()
  })

  it('pedir un enlace de clave nueva en una bloqueada no manda nada', async () => {
    const { pedirEnlaceDeClave } = await import('@/app/(frontend)/acciones/sesion')
    estado.correos.length = 0
    en('reciente')
    expect((await pedirEnlaceDeClave(correos.deLaReciente)).exito).toBe(true)
    expect(estado.correos).toEqual([])
  })

  it('a los doce meses avisa una vez, a la institución y a TraumaHub, y no borra nada', async () => {
    const { aplicarElBloqueo } = await import('@/lib/bloqueoDeInstitucionesServidor')
    estado.correos.length = 0
    const resultado = await aplicarElBloqueo(base)

    const avisadas = resultado.avisadas.map((a) => a.nombre)
    expect(avisadas).toContain(lugares.vieja.nombre)
    // La reciente lleva dos meses; la vacía, sin cuentas, no tiene a quién borrar.
    expect(avisadas).not.toContain(lugares.reciente.nombre)
    expect(avisadas).not.toContain(lugares.vacia.nombre)
    expect((await fila('vacia')).avisoDeBorradoEn ?? null).toBeNull()

    const aLaVieja = estado.correos.filter((c) => c.correo.asunto?.includes(lugares.vieja.nombre))
    const deLaInstitucion = aLaVieja.find((c) => !c.correo.boton)
    const deTraumaHub = aLaVieja.find((c) => c.correo.boton)
    expect(deLaInstitucion?.para).toEqual(expect.arrayContaining([correos.adminVieja, correos.contactoVieja]))
    expect(deLaInstitucion?.para).not.toContain(correos.lectorVieja)
    expect(deTraumaHub?.para).toContain(correos.central)
    expect(deTraumaHub?.correo.boton?.enlace).toBe('https://traumahub.prueba.invalid/admin-panel/instituciones')

    expect((await fila('vieja')).avisoDeBorradoEn).toBeTruthy()
    expect(await cuentasDe('vieja')).toBe(2)

    // La pasada de mañana no vuelve a avisar.
    estado.correos.length = 0
    const otra = await aplicarElBloqueo(base)
    expect(otra.avisadas.map((a) => a.nombre)).not.toContain(lugares.vieja.nombre)
    expect(estado.correos.filter((c) => c.correo.asunto?.includes(lugares.vieja.nombre))).toEqual([])
  })

  it('treinta días después del aviso borra sus cuentas y deja su contenido', async () => {
    const { aplicarElBloqueo } = await import('@/lib/bloqueoDeInstitucionesServidor')
    // A los 29 días, todavía nada.
    await cambiar('vieja', { avisoDeBorradoEn: new Date(Date.now() - 29 * DIA).toISOString() })
    expect((await aplicarElBloqueo(base)).borradas.map((b) => b.nombre)).not.toContain(lugares.vieja.nombre)
    expect(await cuentasDe('vieja')).toBe(2)

    await cambiar('vieja', { avisoDeBorradoEn: new Date(Date.now() - 31 * DIA).toISOString() })
    const resultado = await aplicarElBloqueo(base)
    expect(resultado.borradas).toContainEqual({ nombre: lugares.vieja.nombre, cuentas: 2 })
    expect(await cuentasDe('vieja')).toBe(0)
    expect((await fila('vieja')).cuentasBorradasEn).toBeTruthy()
    // La institución y su ficha siguen.
    const ficha = await base.findByID({ collection: 'patologias', id: fichas.vieja, draft: true, depth: 0, overrideAccess: true })
    expect(ficha.nombre).toBe(`Ficha de vieja ${marca}`)
    // Y las demás, intactas.
    expect(await cuentasDe('reciente')).toBe(1)
    expect(await cuentasDe('abierta')).toBe(1)
  })

  it('un plazo nuevo vacía el aviso, y guardar sin tocar el plazo no', async () => {
    await cambiar('reciente', { avisoDeBorradoEn: new Date().toISOString() })
    const { vence } = await fila('reciente')
    // La misma fecha escrita de otra forma no es un plazo nuevo.
    await cambiar('reciente', { vence: new Date(vence as string).toISOString().replace('Z', '+00:00'), cupo: 11 })
    expect((await fila('reciente')).avisoDeBorradoEn).toBeTruthy()
    await cambiar('reciente', { vence: new Date(Date.now() + 30 * DIA).toISOString() })
    const extendida = await fila('reciente')
    expect(extendida.avisoDeBorradoEn ?? null).toBeNull()
    expect(extendida.cuentasBorradasEn ?? null).toBeNull()
    await cambiar('reciente', { vence })
  })

  it('la exportación lleva lo de la institución, y nada de otra ni su código', async () => {
    const { exportarInstitucion } = await import('@/lib/exportarInstitucionServidor')
    const exportacion = await exportarInstitucion(base, Number(lugares.vieja.id))
    expect(exportacion).not.toBeNull()
    if (!exportacion) return
    expect(exportacion.documentos.patologias).toBe(1)
    const zip = leerZip(exportacion.zip)
    const patologias = JSON.parse(textoDe(zip, 'contenido/patologias.json') ?? '[]') as { nombre: string }[]
    expect(patologias.map((p) => p.nombre)).toEqual([`Ficha de vieja ${marca}`])
    const ficha = JSON.parse(textoDe(zip, 'institucion.json') ?? '{}') as Record<string, unknown>
    expect(ficha).toMatchObject({ nombre: lugares.vieja.nombre, subdominio: lugares.vieja.subdominio })
    expect(ficha).not.toHaveProperty('codigoDeInvitacion')
    expect(textoDe(zip, 'LEEME.txt')).toMatch(/- patologias: 1/)
    expect(await exportarInstitucion(base, 999_999_999)).toBeNull()
  })
})

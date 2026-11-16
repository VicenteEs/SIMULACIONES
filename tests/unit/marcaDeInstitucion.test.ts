import { describe, expect, it, vi } from 'vitest'
import type { CollectionConfig, Field, PayloadRequest } from 'payload'

// El lugar de la petición (D-399): lo que se crea sin sesión desde una
// institución es de ella. Aquí lo dice la prueba, no la cabecera de Next.
const { lugar } = vi.hoisted(() => ({ lugar: { subdominio: '', institucion: null as string | null } }))
vi.mock('@/lib/barreraDeInstitucion', async (original) => ({
  ...((await original()) as object),
  subdominioDeLaPeticionEnCurso: () => lugar.subdominio,
}))
vi.mock('@/lib/institucionesServidor', async (original) => ({
  ...((await original()) as object),
  institucionPorSubdominio: async (_payload: unknown, subdominio: string) =>
    subdominio && lugar.institucion ? { id: lugar.institucion, subdominio } : null,
}))
import { COLECCIONES } from '@/collections'
import {
  COLECCIONES_CON_INSTITUCION,
  SIN_MARCA_AUNQUE_TENGAN_CUENTA,
  marcarInstitucion,
} from '@/collections/hooks/marcaDeInstitucion'
import { esCentral, puedeAdministrarInstituciones } from '@/access/reglas'
import { idDeInstitucion, usuarioDeSesion } from '@/access/payload'
import {
  NOMBRES_RESERVADOS,
  motivoDeSubdominioInvalido,
  normalizarSubdominio,
  vencimientoDelPiloto,
} from '@/lib/instituciones'

// La marca de institución (P-016 E5.1, D-396): qué colecciones la llevan, quién
// la pone y que no se mueve.

const campos = (c: CollectionConfig): Field[] => c.fields
const nombreDe = (f: Field): string | undefined => ('name' in f ? f.name : undefined)
const tieneCuenta = (c: CollectionConfig) =>
  campos(c).some((f) => f.type === 'relationship' && 'relationTo' in f && f.relationTo === 'usuarios')

describe('qué colecciones llevan la marca', () => {
  it('toda colección con una cuenta está en una lista o en la otra, con su porqué', () => {
    const sinDecidir = COLECCIONES.filter(tieneCuenta)
      .map((c) => c.slug)
      .filter(
        (slug) =>
          !(COLECCIONES_CON_INSTITUCION as readonly string[]).includes(slug) && !(slug in SIN_MARCA_AUNQUE_TENGAN_CUENTA),
      )
    expect(sinDecidir).toEqual([])
  })

  it('las de la lista tienen el campo, una sola vez, y las demás no', () => {
    // Por la relación y no por el nombre: `cotizaciones` tiene un texto
    // `institucion`, el nombre que escribe quien pide la cotización.
    const esLaMarca = (f: Field) => nombreDe(f) === 'institucion' && 'relationTo' in f && f.relationTo === 'instituciones'
    for (const coleccion of COLECCIONES) {
      const cuantas = campos(coleccion).filter(esLaMarca).length
      const debe = (COLECCIONES_CON_INSTITUCION as readonly string[]).includes(coleccion.slug)
      expect({ slug: coleccion.slug, cuantas }).toEqual({ slug: coleccion.slug, cuantas: debe ? 1 : 0 })
    }
  })

  it('la marca va con su gancho, el primero de los de antes de guardar', () => {
    for (const slug of COLECCIONES_CON_INSTITUCION) {
      const coleccion = COLECCIONES.find((c) => c.slug === slug)
      expect(coleccion, slug).toBeDefined()
      expect(coleccion!.hooks?.beforeChange?.[0], slug).toBe(marcarInstitucion)
    }
  })

  it('las listas no se pisan, y todo lo que nombran existe', () => {
    const slugs = COLECCIONES.map((c) => c.slug)
    for (const slug of [...COLECCIONES_CON_INSTITUCION, ...Object.keys(SIN_MARCA_AUNQUE_TENGAN_CUENTA)]) {
      expect(slugs, slug).toContain(slug)
    }
    for (const slug of Object.keys(SIN_MARCA_AUNQUE_TENGAN_CUENTA)) {
      expect(COLECCIONES_CON_INSTITUCION as readonly string[]).not.toContain(slug)
    }
  })
})

/** Una petición de mentira: la cuenta de la sesión y la que se busca. */
function peticion(usuario: Record<string, unknown> | null, cuentas: Record<string, unknown> = {}) {
  const findByID = vi.fn(async ({ id }: { id: string }) => {
    if (!(id in cuentas)) throw new Error('no existe')
    return cuentas[id]
  })
  return { req: { user: usuario, payload: { findByID } } as unknown as PayloadRequest, findByID }
}

const docente = { id: 7, rol: 'editor', activo: true, institucion: 3 }
const central = { id: 1, rol: 'admin', activo: true, institucion: null }

const marcar = (args: Record<string, unknown>) =>
  marcarInstitucion(args as unknown as Parameters<typeof marcarInstitucion>[0]) as Promise<Record<string, unknown>>

describe('quién pone la marca al crear', () => {
  it('quien es de una institución escribe en la suya, aunque el dato diga otra', async () => {
    const { req } = peticion(docente)
    const datos = await marcar({ data: { titulo: 'x', institucion: 9 }, operation: 'create', req })
    expect(datos.institucion).toBe(3)
  })

  it('el administrador central elige la institución, para crear la cuenta de su administrador', async () => {
    const { req } = peticion(central)
    const datos = await marcar({ data: { email: 'a@b.cl', institucion: 4 }, operation: 'create', req })
    expect(datos.institucion).toBe(4)
  })

  it('sin sesión y sin dato, la de la cuenta dueña de la fila', async () => {
    const { req, findByID } = peticion(null, { '7': { institucion: { id: 3 } } })
    const datos = await marcar({ data: { usuario: 7, accion: 'sesion-iniciada' }, operation: 'create', req })
    expect(datos.institucion).toBe(3)
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: 'usuarios', id: '7', overrideAccess: true }))
  })

  it('una cuenta que no se encuentra deja la fila en la central, sin lanzar', async () => {
    const { req } = peticion(null)
    const datos = await marcar({ data: { usuario: 99 }, operation: 'create', req })
    expect(datos.institucion).toBeNull()
  })

  it('una fila sin cuenta, de TraumaHub o de un guion, queda en la central', async () => {
    const { req, findByID } = peticion(central)
    const datos = await marcar({ data: { alt: 'foto' }, operation: 'create', req })
    expect(datos.institucion).toBeNull()
    expect(findByID).not.toHaveBeenCalled()
  })

  it('sin sesión ni cuenta, desde el subdominio de una institución, la de ese lugar', async () => {
    // Una solicitud de cuenta, la línea del registro de una cotización: sin la
    // marca, la barrera de la base rechazaría la fila (D-399).
    Object.assign(lugar, { subdominio: 'uchile', institucion: '5' })
    try {
      const { req } = peticion(null)
      expect((await marcar({ data: { email: 'a@b.cl' }, operation: 'create', req })).institucion).toBe(5)
      expect((await marcar({ data: { usuario: null, accion: 'x' }, operation: 'create', req })).institucion).toBe(5)
      // Pero la fila de una cuenta es de la institución de la cuenta, esté
      // donde esté la petición: la de una cuenta central sigue central.
      const conCuenta = peticion(null, { '1': { institucion: null } })
      expect((await marcar({ data: { usuario: 1 }, operation: 'create', req: conCuenta.req })).institucion).toBeNull()
      // Y un subdominio sin institución no inventa ninguna.
      Object.assign(lugar, { subdominio: 'nadie', institucion: null })
      expect((await marcar({ data: { email: 'a@b.cl' }, operation: 'create', req })).institucion).toBeNull()
    } finally {
      Object.assign(lugar, { subdominio: '', institucion: null })
    }
  })
})

describe('la marca no se mueve', () => {
  it('al actualizar se repone la de la fila, aunque se mande otra', async () => {
    const { req } = peticion(central)
    const datos = await marcar({
      data: { titulo: 'nuevo', institucion: 8 },
      operation: 'update',
      originalDoc: { institucion: 3 },
      req,
    })
    expect(datos.institucion).toBe(3)
  })

  it('una fila central sigue central', async () => {
    const { req } = peticion(docente)
    const datos = await marcar({ data: { institucion: 3 }, operation: 'update', originalDoc: { institucion: null }, req })
    expect(datos.institucion).toBeNull()
  })
})

describe('la cuenta central y la de institución', () => {
  it('la institución llega a la sesión venga como venga', () => {
    expect(idDeInstitucion(3)).toBe('3')
    expect(idDeInstitucion('3')).toBe('3')
    expect(idDeInstitucion({ id: 3, nombre: 'U' })).toBe('3')
    expect(idDeInstitucion(null)).toBeNull()
    expect(idDeInstitucion(undefined)).toBeNull()
    expect(idDeInstitucion('')).toBeNull()
    expect(usuarioDeSesion({ ...docente, institucion: { id: 3 } })?.institucion).toBe('3')
  })

  it('solo el administrador de TraumaHub administra instituciones', () => {
    const sesion = (u: Record<string, unknown>) => usuarioDeSesion(u)
    expect(puedeAdministrarInstituciones(sesion(central))).toBe(true)
    expect(puedeAdministrarInstituciones(sesion({ ...central, institucion: 3 }))).toBe(false)
    expect(puedeAdministrarInstituciones(sesion({ ...central, rol: 'editor' }))).toBe(false)
    expect(puedeAdministrarInstituciones(sesion({ ...central, activo: false }))).toBe(false)
    expect(puedeAdministrarInstituciones(null)).toBe(false)
  })

  it('una cuenta de antes de las instituciones, sin el campo, es central', () => {
    expect(esCentral(usuarioDeSesion({ id: 2, rol: 'lector', activo: true }))).toBe(true)
    expect(esCentral(usuarioDeSesion(docente))).toBe(false)
  })
})

describe('el subdominio', () => {
  it('se guarda sin espacios y en minúsculas', () => {
    expect(normalizarSubdominio('  UChile ')).toBe('uchile')
  })

  it('sirve el que admite un nombre de DNS', () => {
    for (const bueno of ['uchile', 'hospital-sotero', 'u2', 'ab']) expect(motivoDeSubdominioInvalido(bueno), bueno).toBeNull()
  })

  it.each([
    ['a', 'entre'],
    ['x'.repeat(41), 'entre'],
    ['ñuñoa', 'letras sin tilde'],
    ['dos palabras', 'letras sin tilde'],
    ['punto.cl', 'letras sin tilde'],
    ['-uno', 'guion'],
    ['uno-', 'guion'],
  ])('«%s» no sirve', (malo, motivo) => {
    expect(motivoDeSubdominioInvalido(malo)).toContain(motivo)
  })

  it('ningún reservado sirve, tampoco los que pone D-371', () => {
    for (const nombre of ['www', 'mail', 'api', 'admin', 'traumahub', 'ved', 'pruebas', 'estado']) {
      expect(NOMBRES_RESERVADOS).toContain(nombre)
      expect(motivoDeSubdominioInvalido(nombre)).toContain('reservado')
    }
  })

  it('un piloto vence a los 15 días de empezar', () => {
    const inicio = new Date('2026-12-01T12:00:00.000Z')
    expect(vencimientoDelPiloto(inicio).toISOString()).toBe('2026-12-16T12:00:00.000Z')
  })
})

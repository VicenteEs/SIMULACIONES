import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Las tres salidas de la revisión del contenido (D-142) que encontró la
 * auditoría del 2026-10-02 (O-069, O-070, O-071), atadas para que no se
 * reabran.
 *
 * - El tiempo de revisión no puede pasar del reloj, invente el navegador las
 *   sesiones que invente (`techoDelLatido`).
 * - Una ficha en revisión no se escapa de ella duplicándola ni borrándola.
 * - «Publicar las validadas» cuenta lo que falla en vez de dejarlo a medias en
 *   silencio.
 *
 * Con dobles de la sesión y de Payload, como `accionesDeContenido.test.ts`: lo
 * que se fija aquí es lo que decide la acción, no la base.
 */

const { estado, payload, revisiones, registrar, anotarPublicacion } = vi.hoisted(() => ({
  estado: {
    usuario: null as Record<string, unknown> | null,
    rolReal: 'editor' as string,
  },
  payload: {
    findByID: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    find: vi.fn(),
  },
  /** La revisión de cada ficha, por `<colección>/<id>`. */
  revisiones: new Map<string, Record<string, unknown>>(),
  registrar: vi.fn(),
  anotarPublicacion: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: true,
    rolReal: estado.rolReal,
    rol: estado.rolReal,
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))
vi.mock('payload', () => ({ getPayload: async () => payload }))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/revisionServidor', async (original) => ({
  ...(await original<typeof import('@/lib/revisionServidor')>()),
  revisionDe: async (_p: unknown, coleccion: string, id: string) => revisiones.get(`${coleccion}/${id}`) ?? null,
  registrarParaRevision: registrar,
  anotarPublicacion,
  quitarDeRevision: async () => {},
}))

import { duplicarDocumento, eliminarDocumento } from '@/app/(frontend)/acciones/contenido'
import { publicarValidadas } from '@/app/(frontend)/acciones/revision'
import { techoDelLatido } from '@/lib/revisionServidor'

const EDITOR = { id: 7, rol: 'editor', activo: true }
const ADMIN = { id: 1, rol: 'admin', activo: true }

beforeEach(() => {
  for (const f of Object.values(payload)) f.mockReset()
  registrar.mockReset()
  anotarPublicacion.mockReset()
  revisiones.clear()
  estado.usuario = EDITOR
  estado.rolReal = 'editor'
  payload.findByID.mockResolvedValue({ id: 5, nombre: 'Fractura de tibia', _status: 'draft' })
  payload.create.mockResolvedValue({ id: 99 })
  payload.update.mockResolvedValue({ id: 5 })
  payload.delete.mockResolvedValue({ id: 5 })
  registrar.mockResolvedValue({ id: '1' })
})

describe('techoDelLatido: el tiempo de una cuenta no pasa del reloj', () => {
  const ahora = Date.parse('2026-10-02T12:00:00Z')
  const haceSegundos = (s: number) => new Date(ahora - s * 1000).toISOString()

  it('una sesión nueva ya no trae su minuto si la cuenta latió hace un segundo', () => {
    // Era la puerta: un identificador inventado por llamada, sesenta segundos
    // cada vez.
    expect(techoDelLatido(undefined, haceSegundos(1), ahora)).toBe(1)
  })

  it('sin latido anterior de la cuenta manda el de la sesión, como antes', () => {
    expect(techoDelLatido(undefined, undefined, ahora)).toBe(60)
    expect(techoDelLatido(haceSegundos(15), undefined, ahora)).toBe(20)
  })

  it('una cuenta que volvió tras una hora no se abona la hora en una sesión nueva', () => {
    expect(techoDelLatido(undefined, haceSegundos(3600), ahora)).toBe(60)
  })

  it('el techo de la cuenta va sin holgura: a ráfagas, la holgura se sumaría', () => {
    expect(techoDelLatido(haceSegundos(15), haceSegundos(15), ahora)).toBe(15)
  })
})

describe('eliminarDocumento con una ficha en revisión', () => {
  it('el editor no la borra, ni a ella ni su registro de revisión', async () => {
    revisiones.set('patologias/5', { id: 1, estado: 'en-revision' })
    const respuesta = await eliminarDocumento('patologias', '5')
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/en revisión/)
    expect(payload.delete).not.toHaveBeenCalled()
  })

  it('el administrador sí', async () => {
    estado.usuario = ADMIN
    estado.rolReal = 'admin'
    revisiones.set('patologias/5', { id: 1, estado: 'en-revision' })
    expect((await eliminarDocumento('patologias', '5')).exito).toBe(true)
    expect(payload.delete).toHaveBeenCalledTimes(1)
  })

  it('una ficha que no está en revisión la sigue borrando el editor', async () => {
    expect((await eliminarDocumento('patologias', '5')).exito).toBe(true)
  })
})

describe('duplicarDocumento con una ficha en revisión', () => {
  it('la copia entra en revisión con la procedencia y la original de la otra', async () => {
    const original = { nombre: 'Como llegó del modelo' }
    revisiones.set('patologias/5', {
      id: 1,
      estado: 'en-revision',
      origen: 'ia',
      libro: 'Rockwood y Green',
      lote: 'lote-1',
      asignadaA: 7,
      notasParaElRevisor: ['Revisar la clasificación'],
      original,
    })
    const respuesta = await duplicarDocumento('patologias', '5')
    expect(respuesta).toMatchObject({ exito: true, datos: { id: '99' } })
    expect(registrar).toHaveBeenCalledTimes(1)
    expect(registrar.mock.calls[0][1]).toMatchObject({
      coleccion: 'patologias',
      documentoId: '99',
      origen: 'ia',
      libro: 'Rockwood y Green',
      lote: 'lote-1',
      asignadaA: '7',
      notasParaElRevisor: ['Revisar la clasificación'],
      original,
      copiaDe: '5',
    })
  })

  it('si la copia no puede entrar en revisión, se borra y se dice', async () => {
    revisiones.set('patologias/5', { id: 1, estado: 'en-revision' })
    registrar.mockRejectedValue(new Error('la base no contesta'))
    const respuesta = await duplicarDocumento('patologias', '5')
    expect(respuesta.exito).toBe(false)
    expect(payload.delete).toHaveBeenCalledWith(expect.objectContaining({ collection: 'patologias', id: '99' }))
  })

  it('la copia de una ficha sin revisión nace como siempre', async () => {
    expect((await duplicarDocumento('patologias', '5')).exito).toBe(true)
    expect(registrar).not.toHaveBeenCalled()
  })
})

describe('publicarValidadas cuando una ficha falla', () => {
  beforeEach(() => {
    estado.usuario = ADMIN
    estado.rolReal = 'admin'
    for (const id of ['1', '2', '3']) revisiones.set(`patologias/${id}`, { id, estado: 'lista' })
    revisiones.set('patologias/4', { id: '4', estado: 'en-revision' })
  })

  it('sigue con las demás y cuenta la que falló', async () => {
    payload.update.mockImplementation(async ({ id }: { id: string }) => {
      if (id === '2') throw new Error('Falta «clasificación».')
      return { id }
    })
    const respuesta = await publicarValidadas(
      ['1', '2', '3', '4'].map((id) => ({ coleccion: 'patologias', id })),
    )
    expect(respuesta.exito).toBe(true)
    expect(respuesta.datos).toEqual({
      publicadas: 2,
      saltadas: 1,
      fallidas: [{ coleccion: 'patologias', id: '2', motivo: 'Falta «clasificación».' }],
    })
  })

  it('publicada y sin anotar no se cuenta como sin publicar', async () => {
    anotarPublicacion.mockRejectedValueOnce(new Error('sin tabla'))
    const respuesta = await publicarValidadas([{ coleccion: 'patologias', id: '1' }])
    expect(respuesta.datos?.publicadas).toBe(1)
    expect(respuesta.datos?.fallidas[0].motivo).toMatch(/^Se publicó/)
  })

  it('lo mal formado se rechaza entero, antes de publicar nada', async () => {
    const respuesta = await publicarValidadas([
      { coleccion: 'patologias', id: '1' },
      { coleccion: 'usuarios', id: '2' },
    ])
    expect(respuesta.exito).toBe(false)
    expect(payload.update).not.toHaveBeenCalled()
  })
})

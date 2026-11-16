import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La descarga del contenido de una institución (P-016 E5.8, D-403): quién la
 * alcanza y qué deja anotado.
 *
 * Es una ruta, y una ruta se alcanza sin pasar por la pantalla que la ofrece:
 * lo que la separa del administrador de otra institución es su guardia. Qué
 * lleva el ZIP se prueba en `bloqueoDeInstituciones.test.ts` y, contra
 * PostgreSQL, en `tests/integration/bloqueoDeInstituciones.test.ts`.
 */

const { estado, anotadas, pedidas } = vi.hoisted(() => ({
  estado: { usuario: null as Record<string, unknown> | null },
  anotadas: [] as Record<string, unknown>[],
  pedidas: [] as unknown[],
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: estado.usuario?.activo === true,
    rolReal: (estado.usuario?.rol as string) ?? null,
    rol: (estado.usuario?.rol as string) ?? null,
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))
vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: async () => ({}),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('@/lib/exportarInstitucionServidor', () => ({
  exportarInstitucion: async (_payload: unknown, id: number) => {
    pedidas.push(id)
    return id === 7
      ? {
          nombre: 'Hospital Uno',
          subdominio: 'uno',
          zip: new Uint8Array([0x50, 0x4b, 5, 6]),
          documentos: { patologias: 2, medios: 1 },
          archivos: 1,
          bytes: 1000,
          fuera: ['modelos-3d/grande.glb: no cupo (300,0 MB)'],
        }
      : null
  },
}))
vi.mock('@/lib/registroServidor', () => ({
  registrarAccion: async (_payload: unknown, entrada: Record<string, unknown>) => {
    anotadas.push(entrada)
  },
}))

import { GET } from '@/app/(frontend)/api/instituciones/[id]/contenido/route'

const como = (rol: string | null, institucion: number | null = null) => {
  estado.usuario = rol ? { id: 1, rol, activo: true, email: `${rol}@prueba.invalid`, nombre: 'Prueba', institucion } : null
}

const pedir = (id: string) =>
  GET(new Request(`http://localhost/api/instituciones/${id}/contenido`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  anotadas.length = 0
  pedidas.length = 0
})

describe('quién descarga el contenido de una institución', () => {
  it('nadie sin ser administrador de TraumaHub, ni el de una institución', async () => {
    for (const [rol, institucion] of [
      [null, null],
      ['lector', null],
      ['editor', null],
      ['admin', 3],
    ] as const) {
      como(rol, institucion)
      expect((await pedir('7')).status, `${rol ?? 'sin sesión'} ${institucion ?? ''}`).toBe(403)
    }
    expect(pedidas).toEqual([])
    expect(anotadas).toEqual([])
  })

  it('el de TraumaHub la recibe, y queda anotado a su nombre', async () => {
    como('admin')
    const respuesta = await pedir('7')
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get('Content-Type')).toBe('application/zip')
    expect(respuesta.headers.get('Content-Disposition')).toMatch(/^attachment; filename="traumahub-uno-contenido-\d{8}-\d{6}\.zip"$/)
    expect(respuesta.headers.get('Cache-Control')).toBe('no-store')
    expect(new Uint8Array(await respuesta.arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b, 5, 6]))
    expect(anotadas).toEqual([
      expect.objectContaining({
        accion: 'exportacion-de-institucion',
        coleccion: 'instituciones',
        documentoId: '7',
        titulo: 'Hospital Uno',
        detalle: 'Descargó su contenido: 3 documentos y 1 archivo. Quedaron fuera 1 archivo.',
        usuario: expect.objectContaining({ email: 'admin@prueba.invalid' }),
      }),
    ])
  })

  it('lo que no es un número, o no existe, no se busca ni se anota', async () => {
    como('admin')
    expect((await pedir('7;borrar')).status).toBe(404)
    expect(pedidas).toEqual([])
    expect((await pedir('8')).status).toBe(404)
    expect(anotadas).toEqual([])
  })
})

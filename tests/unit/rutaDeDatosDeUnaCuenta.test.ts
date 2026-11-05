import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La descarga de todos los datos de una cuenta (D-293): quién la alcanza y qué
 * deja anotado.
 *
 * Es una ruta, y una ruta se alcanza sin pasar por la pantalla que la ofrece:
 * lo único que la separa de un residente curioso es su guardia. Qué lleva el
 * archivo se prueba en `datosDeUnaCuenta.test.ts` y, contra PostgreSQL, en
 * `tests/integration/privacidad.test.ts`.
 */

const { estado, anotadas, pedidas } = vi.hoisted(() => ({
  estado: { usuario: null as Record<string, unknown> | null, rolReal: null as string | null },
  anotadas: [] as Record<string, unknown>[],
  pedidas: [] as unknown[],
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: estado.usuario?.activo === true,
    rolReal: estado.rolReal,
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
vi.mock('@/lib/datosDeUnaCuentaServidor', () => ({
  datosDeUnaCuenta: async (_payload: unknown, id: number) => {
    pedidas.push(id)
    return id === 5 ? { formato: 'traumahub/datos-de-una-cuenta', cuenta: { id: 5, nombre: 'Fulana' } } : null
  },
}))
vi.mock('@/lib/registroServidor', () => ({
  registrarAccion: async (_payload: unknown, entrada: Record<string, unknown>) => {
    anotadas.push(entrada)
  },
}))

import { GET } from '@/app/(frontend)/api/cuentas/[id]/datos/route'

const como = (rol: string | null, activo = true, rolReal: string | null = rol) => {
  estado.usuario = rol ? { id: 1, rol, activo, email: `${rol}@prueba.invalid`, nombre: 'Prueba' } : null
  estado.rolReal = rolReal
}

const pedir = (id: string) => GET(new Request(`http://localhost/api/cuentas/${id}/datos`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  anotadas.length = 0
  pedidas.length = 0
})

describe('quién descarga los datos de una cuenta', () => {
  it('nadie sin sesión, ni un lector, ni un editor', async () => {
    for (const rol of [null, 'lector', 'editor']) {
      como(rol)
      const respuesta = await pedir('5')
      expect(respuesta.status, String(rol)).toBe(403)
    }
    expect(pedidas).toEqual([])
    expect(anotadas).toEqual([])
  })

  it('ni un administrador desactivado', async () => {
    como('admin', false)
    expect((await pedir('5')).status).toBe(403)
    expect(pedidas).toEqual([])
  })

  it('ni un lector que se pinta de administrador: cuenta el rol real', async () => {
    como('admin', true, 'lector')
    expect((await pedir('5')).status).toBe(403)
    expect(pedidas).toEqual([])
  })

  it('el administrador recibe el archivo, sin caché, y la descarga queda a su nombre en el registro', async () => {
    como('admin')
    const respuesta = await pedir('5')
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get('Content-Type')).toContain('application/json')
    expect(respuesta.headers.get('Content-Disposition')).toMatch(/^attachment; filename="datos-de-la-cuenta-5-\d{8}-\d{6}\.json"$/)
    expect(respuesta.headers.get('Cache-Control')).toBe('no-store')
    expect(await respuesta.json()).toMatchObject({ cuenta: { id: 5 } })
    expect(anotadas).toEqual([
      expect.objectContaining({
        accion: 'exportacion-de-datos',
        coleccion: 'usuarios',
        documentoId: '5',
        usuario: expect.objectContaining({ id: 1 }),
      }),
    ])
  })
})

describe('qué cuenta se pide', () => {
  it('una que no existe es un 404, y no se anota nada', async () => {
    como('admin')
    expect((await pedir('99')).status).toBe(404)
    expect(pedidas).toEqual([99])
    expect(anotadas).toEqual([])
  })

  it('lo que no es un número no llega a la consulta', async () => {
    como('admin')
    for (const id of ['abc', '5;drop', '-1', '1.5', '1234567890123']) {
      expect((await pedir(id)).status, id).toBe(404)
    }
    expect(pedidas).toEqual([])
  })
})

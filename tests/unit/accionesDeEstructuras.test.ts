import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Las acciones del listado de estructuras (D-179, P-003 E8.4): quién puede
 * llamarlas y qué pasa con lo que mandan.
 *
 * Una acción de servidor es un extremo HTTP: lo que llega es lo que el navegador
 * quiso mandar. La lógica de guardar está probada aparte
 * (`guardarEstructura.test.ts`); aquí se mira la puerta.
 */

const { estado, lib } = vi.hoisted(() => ({
  estado: { usuario: null as Record<string, unknown> | null, rolReal: null as string | null },
  lib: {
    guardarFicha: vi.fn(),
    leerFicha: vi.fn(),
    leerVersiones: vi.fn(),
    restaurarVersion: vi.fn(),
    sincronizarConElAtlas: vi.fn(),
  },
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: Boolean(estado.usuario),
    rolReal: estado.rolReal,
    rol: estado.rolReal,
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))
vi.mock('payload', async (original) => ({
  ...(await original<typeof import('payload')>()),
  getPayload: async () => ({}),
}))
vi.mock('@payload-config', () => ({ default: {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/catalogoDelAtlas', () => ({ leerCatalogo: async () => ({ version: 'prueba', piezas: [] }) }))
vi.mock('@/lib/estructurasServidor', async (original) => ({
  ...(await original<typeof import('@/lib/estructurasServidor')>()),
  ...lib,
}))

import {
  cargarPiezasDelAtlas,
  guardarEstructura,
  leerEstructura,
  restaurarVersionDeEstructura,
} from '@/app/(frontend)/acciones/estructuras'

const como = (rol: string | null) => {
  estado.rolReal = rol
  estado.usuario = rol ? { id: 7, rol, activo: true, email: 'a@prueba.invalid' } : null
}

const FICHA = { atlasId: 'FJ1', nombre: 'Tibia derecha' }

beforeEach(() => {
  vi.clearAllMocks()
  lib.leerFicha.mockResolvedValue(FICHA)
  lib.leerVersiones.mockResolvedValue([])
  lib.guardarFicha.mockResolvedValue({ tipo: 'guardada', ficha: FICHA, cambiados: ['definicion'] })
  lib.sincronizarConElAtlas.mockResolvedValue({
    creadas: 2,
    yaEstaban: 0,
    actualizadas: 0,
    huerfanas: 0,
    recuperadas: 0,
    casadasPorNombre: 0,
  })
})

describe('quién puede', () => {
  it.each([
    ['sin sesión', null],
    ['un lector', 'lector'],
  ])('%s no lee, no guarda, no restaura ni carga', async (_nombre, rol) => {
    como(rol)
    const lectura = await leerEstructura('FJ1')
    const guardado = await guardarEstructura('FJ1', { campos: { definicion: 'x' }, base: {} })
    const restaurado = await restaurarVersionDeEstructura('FJ1', '3')
    const carga = await cargarPiezasDelAtlas()
    for (const respuesta of [lectura, guardado, restaurado, carga]) expect(respuesta.exito).toBe(false)
    expect(lib.guardarFicha).not.toHaveBeenCalled()
    expect(lib.restaurarVersion).not.toHaveBeenCalled()
    expect(lib.sincronizarConElAtlas).not.toHaveBeenCalled()
  })

  it('el editor lee, guarda y restaura, pero no carga las piezas del atlas', async () => {
    como('editor')
    expect((await leerEstructura('FJ1')).exito).toBe(true)
    expect((await guardarEstructura('FJ1', { campos: { definicion: 'x' }, base: {} })).exito).toBe(true)
    expect((await restaurarVersionDeEstructura('FJ1', '3')).exito).toBe(true)
    const carga = await cargarPiezasDelAtlas()
    expect(carga.exito).toBe(false)
    expect(carga.mensaje).toMatch(/administrador/)
    expect(lib.sincronizarConElAtlas).not.toHaveBeenCalled()
  })

  it('el administrador carga las piezas y recibe el resumen', async () => {
    como('admin')
    const carga = await cargarPiezasDelAtlas()
    expect(carga.exito).toBe(true)
    expect(carga.datos?.resumen).toContain('2 fichas nuevas')
    expect(lib.sincronizarConElAtlas).toHaveBeenCalledOnce()
  })
})

describe('lo que llega del navegador', () => {
  beforeEach(() => como('editor'))

  it('una pieza que no es un texto se rechaza antes de tocar nada', async () => {
    for (const malo of [undefined, null, {}, [], '', '   ']) {
      expect((await leerEstructura(malo)).exito, String(malo)).toBe(false)
    }
    expect(lib.leerFicha).not.toHaveBeenCalled()
  })

  it('los cambios tienen que ser un objeto con textos', async () => {
    for (const malo of [null, 'texto', 5, [], { campos: 'x', base: {} }, { campos: { definicion: 12 }, base: {} }, { campos: {} }]) {
      const respuesta = await guardarEstructura('FJ1', malo)
      expect(respuesta.exito, JSON.stringify(malo)).toBe(false)
    }
    expect(lib.guardarFicha).not.toHaveBeenCalled()
  })

  it('solo pasan los campos de la ficha: un identificador o un sistema colado se descarta', async () => {
    await guardarEstructura('FJ1', {
      campos: { definicion: 'Hueso.', atlasId: 'FJ99', sistema: 'muscular' },
      base: { definicion: '' },
      oculta: true,
      ocultaBase: false,
    })
    const [, , id, enviados, opciones] = lib.guardarFicha.mock.calls[0]
    expect(id).toBe('FJ1')
    expect(enviados.campos).toEqual({ definicion: 'Hueso.' })
    expect(enviados).toMatchObject({ oculta: true, ocultaBase: false })
    expect(opciones).toEqual({ forzar: false })
  })

  it('«forzar» solo vale si es exactamente verdadero', async () => {
    await guardarEstructura('FJ1', { campos: { definicion: 'x' }, base: {} }, 'true')
    expect(lib.guardarFicha.mock.calls[0][4]).toEqual({ forzar: false })
    await guardarEstructura('FJ1', { campos: { definicion: 'x' }, base: {} }, true)
    expect(lib.guardarFicha.mock.calls[1][4]).toEqual({ forzar: true })
  })

  it('un conflicto vuelve como respuesta y no como error, con la ficha actual', async () => {
    lib.guardarFicha.mockResolvedValue({ tipo: 'conflicto', campos: ['definicion'], actual: FICHA })
    const respuesta = await guardarEstructura('FJ1', { campos: { definicion: 'x' }, base: { definicion: '' } })
    expect(respuesta.exito).toBe(true)
    expect(respuesta.datos).toMatchObject({ tipo: 'conflicto', campos: ['definicion'] })
  })

  it('un fallo al guardar llega como mensaje, no como excepción', async () => {
    lib.guardarFicha.mockRejectedValue(new Error('«Definición» pasa de 3000 caracteres (tiene 3001).'))
    const respuesta = await guardarEstructura('FJ1', { campos: { definicion: 'x' }, base: {} })
    expect(respuesta).toMatchObject({ exito: false, mensaje: expect.stringContaining('pasa de 3000') })
  })

  it('una pieza que no existe en ningún sitio se dice', async () => {
    lib.leerFicha.mockResolvedValue(null)
    const respuesta = await leerEstructura('FJ-NADA')
    expect(respuesta).toMatchObject({ exito: false, mensaje: expect.stringContaining('no existe') })
  })
})

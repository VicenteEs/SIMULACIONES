import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Grabar la resolución de referencia de un caso (D-373).
 *
 * Lo que tiene que cumplirse: la nota que se guarda es la que rehace el
 * servidor con los pasos del caso, no la que diga el navegador; grabar otra vez
 * reemplaza la de antes en vez de abrir una segunda fila; y un recorrido mal
 * formado o vacío se rechaza antes de tocar la base. Quién puede llamarla lo
 * prueba `accionesConGuardia.test.ts`.
 */

const { estado, buscar, actualizar, crear, leerCaso } = vi.hoisted(() => ({
  estado: { anteriores: [] as Array<{ id: number }> },
  buscar: vi.fn(),
  actualizar: vi.fn(),
  crear: vi.fn(),
  leerCaso: vi.fn(),
}))

const EDITOR = { id: 4, rol: 'editor', activo: true }

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: EDITOR,
    activo: true,
    rolReal: 'editor',
    rol: 'editor',
    simulando: false,
    usuarioEfectivo: EDITOR,
  }),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({ find: buscar, update: actualizar, create: crear, findByID: leerCaso }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

import { grabarResolucionDeReferencia } from '@/app/(frontend)/acciones/resolucionDeReferencia'
import { borrarSuResolucionDeReferencia } from '@/collections/hooks/resolucionDeReferencia'
import { Cirugias } from '@/collections/Cirugias'

/** Dos pasos de 10, como los devuelve Payload con profundidad 0 (el mismo de `resultadoDeCirugia.test.ts`). */
const CASO = {
  id: 7,
  nombre: 'Caso de prueba',
  updatedAt: '2026-11-15T20:00:00.000Z',
  versionDelFormato: 1,
  pasos: [
    { id: 'p1', titulo: 'Coger el bisturí', objetivo: 'instrumento', instrumento: 3, puntos: 10 },
    { id: 'p2', titulo: 'Incisión', objetivo: 'trazo', instrumento: 3, trazoMinimo: 40, trazoMaximo: 60, puntos: 10 },
  ],
}

/** El primero a la primera, el segundo tras una incisión corta: 10 + 5 de 20. */
const RECORRIDO = {
  v: 1,
  pasos: [
    { paso: 'p1', intentos: [{ instrumento: '3' }] },
    { paso: 'p2', intentos: [{ instrumento: '3', trazo: 30 }, { instrumento: '3', trazo: 50 }] },
  ],
}

beforeEach(() => {
  vi.clearAllMocks()
  estado.anteriores = []
  leerCaso.mockResolvedValue(CASO)
  buscar.mockImplementation(async () => ({ docs: estado.anteriores }))
})

describe('grabarResolucionDeReferencia', () => {
  it('guarda el recorrido con la nota del servidor y lo que se sabía del caso', async () => {
    const respuesta = await grabarResolucionDeReferencia('7', RECORRIDO)
    expect(respuesta).toEqual({ exito: true, datos: { puntaje: 15, puntajeMaximo: 20, reemplazo: false } })
    expect(crear).toHaveBeenCalledTimes(1)
    expect(crear.mock.calls[0][0]).toMatchObject({
      collection: 'resoluciones-de-referencia',
      overrideAccess: false,
      data: {
        nombre: 'Referencia de «Caso de prueba»',
        cirugia: 7,
        puntaje: 15,
        puntajeMaximo: 20,
        versionDelFormato: 1,
        casoGuardadoEn: CASO.updatedAt,
      },
    })
    // El caso se lee como lo lee la nota del servidor: sin borrador, con el acceso de quien graba.
    expect(leerCaso.mock.calls[0][0]).toMatchObject({ collection: 'cirugias', id: '7', overrideAccess: false, depth: 0 })
  })

  it('grabar otra vez reemplaza la de antes', async () => {
    estado.anteriores = [{ id: 31 }]
    const respuesta = await grabarResolucionDeReferencia('7', RECORRIDO)
    expect(respuesta.datos?.reemplazo).toBe(true)
    expect(crear).not.toHaveBeenCalled()
    expect(actualizar.mock.calls[0][0]).toMatchObject({ collection: 'resoluciones-de-referencia', id: 31 })
  })

  it('un recorrido mal formado o vacío no toca la base', async () => {
    for (const malo of [null, { v: 2, pasos: [] }, { v: 1, pasos: 'todos' }, { v: 1, pasos: [] }]) {
      const respuesta = await grabarResolucionDeReferencia('7', malo)
      expect(respuesta.exito, JSON.stringify(malo)).toBe(false)
    }
    expect(leerCaso).not.toHaveBeenCalled()
    expect(crear).not.toHaveBeenCalled()
    expect(actualizar).not.toHaveBeenCalled()
  })
})

describe('al borrar el caso', () => {
  it('se borra su referencia, con la misma petición', async () => {
    expect(Cirugias.hooks?.beforeDelete).toContain(borrarSuResolucionDeReferencia)
    const borrar = vi.fn()
    const req = { payload: { delete: borrar } }
    await (borrarSuResolucionDeReferencia as unknown as (a: unknown) => Promise<void>)({ id: 7, req })
    expect(borrar).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'resoluciones-de-referencia', where: { cirugia: { equals: 7 } }, req }),
    )
  })
})

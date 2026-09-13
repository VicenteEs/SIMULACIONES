import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Qué pasa cuando el seguimiento de lectura no se puede escribir.
 *
 * Las dos acciones se comportan al revés a propósito y es justo lo que se fija
 * aquí: la visita se pierde en silencio, y la marca de «leída» sube el fallo
 * porque hay una casilla en pantalla afirmando lo contrario. Tragarse las dos
 * dejaba al residente con la ficha marcada y nada escrito.
 */

const { estado, buscar, actualizar, crear } = vi.hoisted(() => ({
  estado: {
    usuario: { id: 4, rol: 'lector', activo: true } as Record<string, unknown> | null,
    activo: true,
  },
  buscar: vi.fn(),
  actualizar: vi.fn(),
  crear: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: estado.activo,
    rolReal: 'lector',
    rol: 'lector',
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))

vi.mock('payload', () => ({
  getPayload: async () => ({ find: buscar, update: actualizar, create: crear }),
}))

vi.mock('@payload-config', () => ({ default: {} }))

import { marcarComoLeida, registrarVisita } from '@/app/(frontend)/acciones/actividad'

beforeEach(() => {
  buscar.mockReset()
  actualizar.mockReset()
  crear.mockReset()
  buscar.mockResolvedValue({ docs: [] })
  actualizar.mockResolvedValue({ id: 1 })
  crear.mockResolvedValue({ id: 1 })
  estado.usuario = { id: 4, rol: 'lector', activo: true }
  estado.activo = true
  // Las acciones registran el fallo antes de decidir qué hacer con él; sin
  // esto la salida de las pruebas se llena de pilas de errores esperados.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('marcarComoLeida', () => {
  it('propaga el fallo de escritura, que es lo que devuelve la casilla a su sitio', async () => {
    crear.mockRejectedValue(new Error('no queda espacio en disco'))
    await expect(marcarComoLeida('patologias', '12', true)).rejects.toThrow(/marca de lectura/i)
  })

  it('avisa cuando la sesión ya no está activa en lugar de resolver como si hubiera guardado', async () => {
    estado.activo = false
    await expect(marcarComoLeida('patologias', '12', true)).rejects.toThrow(/sesión/i)
    expect(crear).not.toHaveBeenCalled()
  })

  it('rechaza un módulo que no existe', async () => {
    await expect(marcarComoLeida('inventado', '12', true)).rejects.toThrow()
    expect(crear).not.toHaveBeenCalled()
  })

  it('escribe en todas las filas de la misma ficha, no solo en la primera', async () => {
    buscar.mockResolvedValue({ docs: [{ id: 1 }, { id: 2 }] })
    await marcarComoLeida('patologias', '12', true)
    expect(actualizar).toHaveBeenCalledTimes(2)
    expect(actualizar.mock.calls.map((llamada) => llamada[0].id)).toEqual([1, 2])
    expect(actualizar.mock.calls[0][0].data).toEqual({ completado: true })
  })

  it('se recupera cuando otra petición creó la fila entre la consulta y la escritura', async () => {
    buscar.mockResolvedValueOnce({ docs: [] }).mockResolvedValue({ docs: [{ id: 5 }] })
    crear.mockRejectedValue(new Error('índice único'))
    await expect(marcarComoLeida('patologias', '12', true)).resolves.toBeUndefined()
    expect(actualizar).toHaveBeenCalledTimes(1)
    expect(actualizar.mock.calls[0][0].id).toBe(5)
  })

  it('resuelve sin ruido cuando la escritura sale bien', async () => {
    await expect(marcarComoLeida('patologias', '12', false)).resolves.toBeUndefined()
    expect(crear.mock.calls[0][0].data).toMatchObject({ completado: false })
  })
})

describe('registrarVisita', () => {
  it('se traga el fallo: la visita es una comodidad y no debe estropear la ficha', async () => {
    crear.mockRejectedValue(new Error('no queda espacio en disco'))
    await expect(registrarVisita('patologias', '12')).resolves.toBeUndefined()
  })

  it('tampoco lanza sin sesión, porque se la llama sin recoger la promesa', async () => {
    estado.usuario = null
    await expect(registrarVisita('patologias', '12')).resolves.toBeUndefined()
  })

  it('deja el registro la primera vez que se abre la ficha', async () => {
    await registrarVisita('patologias', '12')
    expect(crear).toHaveBeenCalledTimes(1)
    expect(crear.mock.calls[0][0].data).toMatchObject({
      coleccion: 'patologias',
      documentoId: '12',
    })
  })
})

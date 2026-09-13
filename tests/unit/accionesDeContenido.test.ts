import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Permiso por módulo de las acciones de lectura del editor genérico.
 *
 * `TablaDocumentos` y `FormularioDocumento` son componentes de cliente, así que
 * el identificador de estas dos acciones ya viaja en el paquete que descarga
 * cualquier editor: se las puede llamar con el slug que se quiera sin pasar por
 * la página que las ofrece. La página para en la puerta con `exigirPanelPara`;
 * estas pruebas fijan que la acción repita la misma pregunta, porque leen con
 * `overrideAccess: true` y no queda nadie más que la haga.
 */

const { estado, buscar } = vi.hoisted(() => ({
  estado: {
    usuario: null as Record<string, unknown> | null,
    activo: true,
    rolReal: 'editor' as string | null,
  },
  buscar: vi.fn(),
}))

vi.mock('@/lib/sesion', () => ({
  obtenerSesion: async () => ({
    usuario: estado.usuario,
    activo: estado.activo,
    rolReal: estado.rolReal,
    rol: estado.rolReal,
    simulando: false,
    usuarioEfectivo: estado.usuario,
  }),
}))

vi.mock('payload', () => ({ getPayload: async () => ({ find: buscar }) }))

vi.mock('@payload-config', () => ({ default: {} }))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { listarDocumentos, opcionesDeRelacion } from '@/app/(frontend)/acciones/contenido'

beforeEach(() => {
  buscar.mockReset()
  buscar.mockResolvedValue({ docs: [], totalDocs: 0, page: 1, totalPages: 1 })
  estado.usuario = { id: 7, rol: 'editor', activo: true, modulosEditables: ['patologias'] }
  estado.activo = true
  estado.rolReal = 'editor'
})

describe('listarDocumentos', () => {
  it('no entrega el listado de un módulo que la cuenta no tiene asignado', async () => {
    const respuesta = await listarDocumentos('cirugias', {})
    expect(respuesta.exito).toBe(false)
    expect(respuesta.mensaje).toMatch(/permiso/i)
    // Que ni siquiera llegue a consultar: la consulta iría con
    // `overrideAccess: true` y devolvería también los borradores.
    expect(buscar).not.toHaveBeenCalled()
  })

  it('deja listar el módulo asignado', async () => {
    const respuesta = await listarDocumentos('patologias', {})
    expect(respuesta.exito).toBe(true)
    expect(buscar).toHaveBeenCalledTimes(1)
  })

  it('no restringe al administrador', async () => {
    estado.usuario = { id: 1, rol: 'admin', activo: true }
    estado.rolReal = 'admin'
    const respuesta = await listarDocumentos('cirugias', {})
    expect(respuesta.exito).toBe(true)
  })

  it('no restringe al editor sin módulos marcados, que es el caso normal', async () => {
    estado.usuario = { id: 8, rol: 'editor', activo: true, modulosEditables: [] }
    const respuesta = await listarDocumentos('cirugias', {})
    expect(respuesta.exito).toBe(true)
  })

  it('sigue negándose al lector', async () => {
    estado.usuario = { id: 9, rol: 'lector', activo: true }
    estado.rolReal = 'lector'
    const respuesta = await listarDocumentos('patologias', {})
    expect(respuesta.exito).toBe(false)
    expect(buscar).not.toHaveBeenCalled()
  })
})

describe('opcionesDeRelacion', () => {
  it('no llena un desplegable con un módulo ajeno', async () => {
    const respuesta = await opcionesDeRelacion('cirugias')
    expect(respuesta.exito).toBe(false)
    expect(buscar).not.toHaveBeenCalled()
  })

  it('sigue llenando los desplegables que no son módulos', async () => {
    // Ninguna relación del esquema apunta a uno de los cinco módulos, así que
    // la guardia nueva no estrecha ningún desplegable real. Si algún día una
    // sí apunta, esta prueba no se entera: la de arriba sí, y hará falta un
    // `exigirLecturaDe` que mire `modulosVisibles` en vez de `modulosEditables`.
    for (const coleccion of ['medios', 'modelos-3d', 'segmentos', 'instancias-atlas']) {
      buscar.mockClear()
      const respuesta = await opcionesDeRelacion(coleccion)
      expect(respuesta.exito, coleccion).toBe(true)
      expect(buscar).toHaveBeenCalledTimes(1)
    }
  })
})

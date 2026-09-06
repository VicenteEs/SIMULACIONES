import { describe, it, expect, vi } from 'vitest'
import { limpiarRastroDeUsuario } from '@/collections/hooks/bajaDeUsuario'

/**
 * Eliminar una cuenta que ya usó la plataforma fallaba con un error de la base
 * —las filas de actividad la referencian y la columna no admite nulos—, y el
 * panel se quedaba diciendo que no pudo, sin explicar por qué. El fallo salía
 * solo cuando la persona ya había leído algo, que es justo cuando se la quiere
 * dar de baja.
 */
describe('rastro de una cuenta eliminada', () => {
  it('borra la actividad y conserva los comentarios sin autor', async () => {
    const borrarActividad = vi.fn(async () => 12)
    const anonimizarComentarios = vi.fn(async () => 3)

    const resultado = await limpiarRastroDeUsuario({
      usuarioId: '7',
      borrarActividad,
      anonimizarComentarios,
    })

    expect(borrarActividad).toHaveBeenCalledWith('7')
    expect(anonimizarComentarios).toHaveBeenCalledWith('7')
    expect(resultado).toEqual({ actividadBorrada: 12, comentariosAnonimizados: 3 })
  })

  it('borra la actividad antes de tocar los comentarios', async () => {
    const orden: string[] = []
    await limpiarRastroDeUsuario({
      usuarioId: '7',
      borrarActividad: async () => {
        orden.push('actividad')
        return 0
      },
      anonimizarComentarios: async () => {
        orden.push('comentarios')
        return 0
      },
    })
    // Si algo falla a mitad, es preferible haber perdido el seguimiento de
    // lectura que dejar comentarios apuntando a una cuenta que va a desaparecer.
    expect(orden).toEqual(['actividad', 'comentarios'])
  })

  it('propaga el fallo en lugar de dejar la baja a medias', async () => {
    await expect(
      limpiarRastroDeUsuario({
        usuarioId: '7',
        borrarActividad: async () => {
          throw new Error('la base no responde')
        },
        anonimizarComentarios: async () => 0,
      }),
    ).rejects.toThrow('la base no responde')
  })

  it('no se queja con una cuenta que nunca usó la plataforma', async () => {
    const resultado = await limpiarRastroDeUsuario({
      usuarioId: '9',
      borrarActividad: async () => 0,
      anonimizarComentarios: async () => 0,
    })
    expect(resultado).toEqual({ actividadBorrada: 0, comentariosAnonimizados: 0 })
  })
})

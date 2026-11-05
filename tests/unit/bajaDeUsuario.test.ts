import { describe, it, expect, vi } from 'vitest'
import { limpiarRastroDeUsuario } from '@/collections/hooks/bajaDeUsuario'

/**
 * Eliminar una cuenta que ya usó la plataforma fallaba con un error de la base
 * —las filas de actividad la referencian y la columna no admite nulos—, y el
 * panel se quedaba diciendo que no pudo, sin explicar por qué. El fallo salía
 * solo cuando la persona ya había leído algo, que es justo cuando se la quiere
 * dar de baja.
 *
 * Desde D-291 la baja hace además una tercera cosa: deja sin nombre ni correo
 * lo que la cuenta dejó en el registro de acciones. Lo que eso escribe en la
 * base se prueba contra PostgreSQL en `tests/integration/privacidad.test.ts`;
 * aquí, el orden y que nada quede a medias.
 */
const sinNada = async () => 0

describe('rastro de una cuenta eliminada', () => {
  it('borra la actividad, conserva los comentarios sin autor y deja el registro sin nombre', async () => {
    const borrarActividad = vi.fn(async () => 12)
    const anonimizarComentarios = vi.fn(async () => 3)
    const anonimizarRegistro = vi.fn(async () => 40)

    const resultado = await limpiarRastroDeUsuario({
      usuarioId: '7',
      borrarActividad,
      anonimizarComentarios,
      anonimizarRegistro,
    })

    expect(borrarActividad).toHaveBeenCalledWith('7')
    expect(anonimizarComentarios).toHaveBeenCalledWith('7')
    expect(anonimizarRegistro).toHaveBeenCalledWith('7')
    expect(resultado).toEqual({ actividadBorrada: 12, comentariosAnonimizados: 3, entradasAnonimizadas: 40 })
  })

  it('borra la actividad antes de tocar los comentarios, y el registro al final', async () => {
    const orden: string[] = []
    const anotar = (paso: string) => async () => {
      orden.push(paso)
      return 0
    }
    await limpiarRastroDeUsuario({
      usuarioId: '7',
      borrarActividad: anotar('actividad'),
      anonimizarComentarios: anotar('comentarios'),
      anonimizarRegistro: anotar('registro'),
    })
    // Si algo falla a mitad, es preferible haber perdido el seguimiento de
    // lectura que dejar comentarios apuntando a una cuenta que va a desaparecer.
    // El registro va el último: borrar la actividad y retocar los comentarios
    // anotan sus propias entradas, que son de quien elimina y no se tocan.
    expect(orden).toEqual(['actividad', 'comentarios', 'registro'])
  })

  it('propaga el fallo en lugar de dejar la baja a medias', async () => {
    const anonimizarRegistro = vi.fn(sinNada)
    await expect(
      limpiarRastroDeUsuario({
        usuarioId: '7',
        borrarActividad: async () => {
          throw new Error('la base no responde')
        },
        anonimizarComentarios: sinNada,
        anonimizarRegistro,
      }),
    ).rejects.toThrow('la base no responde')
    expect(anonimizarRegistro).not.toHaveBeenCalled()
  })

  it('no se queja con una cuenta que nunca usó la plataforma', async () => {
    const resultado = await limpiarRastroDeUsuario({
      usuarioId: '9',
      borrarActividad: sinNada,
      anonimizarComentarios: sinNada,
      anonimizarRegistro: sinNada,
    })
    expect(resultado).toEqual({ actividadBorrada: 0, comentariosAnonimizados: 0, entradasAnonimizadas: 0 })
  })
})

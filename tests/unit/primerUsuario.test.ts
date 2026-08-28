import { describe, it, expect } from 'vitest'
import { ajustarPrimerUsuario } from '@/collections/hooks/primerUsuario'

/**
 * El primer usuario de la plataforma es un caso especial.
 *
 * Toda cuenta nace como lectora y desactivada (D-020), lo cual es correcto
 * salvo para la primera: si el administrador que instala la plataforma se
 * crea a sí mismo como lector inactivo, queda encerrado fuera de su propio
 * panel y no hay nadie que pueda activarlo.
 */
describe('ajustarPrimerUsuario', () => {
  it('convierte al primer usuario en administrador activo, sin importar lo que haya elegido', async () => {
    const resultado = await ajustarPrimerUsuario({
      data: { rol: 'lector', activo: false, email: 'yo@ejemplo.cl' },
      contarUsuarios: async () => 0,
      operacion: 'create',
    })
    expect(resultado.rol).toBe('admin')
    expect(resultado.activo).toBe(true)
  })

  it('no toca a los usuarios siguientes: el segundo nace lector e inactivo', async () => {
    const resultado = await ajustarPrimerUsuario({
      data: { rol: 'lector', activo: false, email: 'otro@ejemplo.cl' },
      contarUsuarios: async () => 1,
      operacion: 'create',
    })
    expect(resultado.rol).toBe('lector')
    expect(resultado.activo).toBe(false)
  })

  it('no interfiere al modificar una cuenta existente', async () => {
    const resultado = await ajustarPrimerUsuario({
      data: { rol: 'lector', activo: false },
      contarUsuarios: async () => 0,
      operacion: 'update',
    })
    expect(resultado.rol).toBe('lector')
    expect(resultado.activo).toBe(false)
  })

  it('respeta el resto de los campos', async () => {
    const resultado = await ajustarPrimerUsuario({
      data: { rol: 'lector', activo: false, nombre: 'Vicente', institucion: 'UTEM' },
      contarUsuarios: async () => 0,
      operacion: 'create',
    })
    expect(resultado.nombre).toBe('Vicente')
    expect(resultado.institucion).toBe('UTEM')
  })
})

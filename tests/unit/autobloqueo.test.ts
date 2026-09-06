import { describe, it, expect } from 'vitest'
import { impedirAutobloqueo } from '@/collections/hooks/autobloqueo'

/**
 * El fallo que este gancho impide es concreto y ya ha ocurrido en otras
 * instalaciones: el único administrador se quita el rol —o se desactiva— para
 * probar cómo se ve la plataforma desde otro papel, y se queda encerrado fuera
 * de su propio panel. La única salida es editar la tabla `usuarios` desde psql.
 */

const admin = { id: '1', rol: 'admin', activo: true }

const sinOtrosAdmins = async () => 0
const conOtrosAdmins = async () => 2

describe('impedir el autobloqueo del administrador', () => {
  it('no se mete en las creaciones', async () => {
    const data = { rol: 'lector' }
    await expect(
      impedirAutobloqueo({
        data,
        operacion: 'create',
        contarOtrosAdmins: sinOtrosAdmins,
      }),
    ).resolves.toBe(data)
  })

  it('deja pasar los cambios que no tocan el rol ni el acceso', async () => {
    const data = { nombre: 'Nombre nuevo' }
    await expect(
      impedirAutobloqueo({
        data,
        operacion: 'update',
        documentoOriginal: admin,
        idDeQuienEdita: '1',
        contarOtrosAdmins: sinOtrosAdmins,
      }),
    ).resolves.toBe(data)
  })

  it('impide que un administrador se quite el rol a sí mismo', async () => {
    await expect(
      impedirAutobloqueo({
        data: { rol: 'lector' },
        operacion: 'update',
        documentoOriginal: admin,
        idDeQuienEdita: '1',
        contarOtrosAdmins: conOtrosAdmins,
      }),
    ).rejects.toThrow(/sí mismo/)
  })

  it('impide que un administrador se desactive a sí mismo', async () => {
    await expect(
      impedirAutobloqueo({
        data: { activo: false },
        operacion: 'update',
        documentoOriginal: admin,
        idDeQuienEdita: '1',
        contarOtrosAdmins: conOtrosAdmins,
      }),
    ).rejects.toThrow(/sí mismo/)
  })

  it('impide dejar la plataforma sin ningún administrador activo', async () => {
    await expect(
      impedirAutobloqueo({
        data: { rol: 'editor' },
        operacion: 'update',
        documentoOriginal: admin,
        idDeQuienEdita: '9',
        contarOtrosAdmins: sinOtrosAdmins,
      }),
    ).rejects.toThrow(/único administrador/)
  })

  it('permite degradar a un administrador si queda otro', async () => {
    const data = { rol: 'editor' }
    await expect(
      impedirAutobloqueo({
        data,
        operacion: 'update',
        documentoOriginal: admin,
        idDeQuienEdita: '9',
        contarOtrosAdmins: conOtrosAdmins,
      }),
    ).resolves.toBe(data)
  })

  it('no estorba al editar a quien no era administrador activo', async () => {
    const data = { activo: false }
    for (const original of [
      { id: '2', rol: 'lector', activo: true },
      { id: '3', rol: 'admin', activo: false },
    ]) {
      await expect(
        impedirAutobloqueo({
          data,
          operacion: 'update',
          documentoOriginal: original,
          idDeQuienEdita: '1',
          contarOtrosAdmins: sinOtrosAdmins,
        }),
      ).resolves.toBe(data)
    }
  })

  it('sigue protegiendo cuando el cambio llega sin quien lo hace (script o migración)', async () => {
    await expect(
      impedirAutobloqueo({
        data: { activo: false },
        operacion: 'update',
        documentoOriginal: admin,
        contarOtrosAdmins: sinOtrosAdmins,
      }),
    ).rejects.toThrow(/único administrador/)
  })
})

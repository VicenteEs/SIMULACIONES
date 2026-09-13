import { describe, it, expect } from 'vitest'
import {
  impedirAutobloqueo,
  impedirBorradoDelUltimoAdmin,
} from '@/collections/hooks/autobloqueo'

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

/**
 * El borrado tenía una sola capa de defensa donde la modificación tenía dos.
 *
 * `eliminarUsuario` comprueba las dos cosas, pero no es el único camino:
 * `access.delete` deja pasar a cualquier administrador activo y la API REST de
 * Payload sigue montada. Un `DELETE /api/usuarios/<id>` —o un script de
 * limpieza que llame a `payload.delete`— se llevaba por delante al único
 * administrador que quedaba, y la salida era abrir la tabla con psql.
 */
describe('impedir el borrado del último administrador', () => {
  it('no estorba al borrar una cuenta que no es administrador activo', async () => {
    for (const original of [
      { id: '2', rol: 'lector', activo: true },
      { id: '3', rol: 'editor', activo: true },
      { id: '4', rol: 'admin', activo: false },
    ]) {
      await expect(
        impedirBorradoDelUltimoAdmin({
          documentoOriginal: original,
          idDeQuienEdita: '1',
          contarOtrosAdmins: sinOtrosAdmins,
        }),
      ).resolves.toBeUndefined()
    }
  })

  it('impide que un administrador se elimine a sí mismo', async () => {
    await expect(
      impedirBorradoDelUltimoAdmin({
        documentoOriginal: admin,
        idDeQuienEdita: '1',
        contarOtrosAdmins: conOtrosAdmins,
      }),
    ).rejects.toThrow(/su propia cuenta/)
  })

  it('impide eliminar al único administrador activo que queda', async () => {
    await expect(
      impedirBorradoDelUltimoAdmin({
        documentoOriginal: admin,
        idDeQuienEdita: '9',
        contarOtrosAdmins: sinOtrosAdmins,
      }),
    ).rejects.toThrow(/único administrador/)
  })

  it('permite eliminar a un administrador si queda otro', async () => {
    await expect(
      impedirBorradoDelUltimoAdmin({
        documentoOriginal: admin,
        idDeQuienEdita: '9',
        contarOtrosAdmins: conOtrosAdmins,
      }),
    ).resolves.toBeUndefined()
  })

  it('sigue protegiendo cuando el borrado llega sin quien lo hace (script o API)', async () => {
    // Este es el caso que el gancho existe para cubrir: la llamada directa a
    // `payload.delete` sin sesión, que no pasa por la acción del panel.
    await expect(
      impedirBorradoDelUltimoAdmin({
        documentoOriginal: admin,
        contarOtrosAdmins: sinOtrosAdmins,
      }),
    ).rejects.toThrow(/único administrador/)
  })

  it('deja pasar el borrado de una cuenta que ya no está', async () => {
    // Sin documento no hay nada que proteger, y rechazar aquí dejaría filas
    // imposibles de limpiar cuando dos borrados se cruzan.
    await expect(
      impedirBorradoDelUltimoAdmin({
        documentoOriginal: undefined,
        idDeQuienEdita: '1',
        contarOtrosAdmins: sinOtrosAdmins,
      }),
    ).resolves.toBeUndefined()
  })

  it('compara los identificadores como texto: la base los da como número', async () => {
    // `findByID` devuelve `id` numérico en Postgres y `req.user.id` llega
    // convertido a texto. Si la comparación no normaliza, el administrador se
    // borra a sí mismo sin que nada lo pare.
    await expect(
      impedirBorradoDelUltimoAdmin({
        documentoOriginal: { id: 1, rol: 'admin', activo: true },
        idDeQuienEdita: '1',
        contarOtrosAdmins: conOtrosAdmins,
      }),
    ).rejects.toThrow(/su propia cuenta/)
  })
})

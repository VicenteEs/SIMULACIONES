/**
 * Impide que la plataforma se quede sin administrador.
 *
 * El panel propio ya lo comprueba antes de llamar a Payload, pero no es el
 * único camino hasta la colección. Cuando esto se escribió, el que preocupaba
 * era el CMS nativo en `/admin`; esa interfaz se retiró (D-038), y el que queda
 * abierto es la API REST de Payload, que sigue montada en
 * `src/app/(payload)/api/[...slug]/route.ts` y acepta escrituras y borrados
 * directos de cualquier administrador con sesión. También llega ahí cualquier
 * script de mantenimiento que llame a `payload.update` o `payload.delete` sin
 * pasar por las acciones del panel.
 *
 * La regla tiene que vivir en la colección, o basta con desmarcar una casilla
 * en la pantalla equivocada —o mandar un `DELETE`— para dejar la instalación
 * sin nadie capaz de crear cuentas, y la única salida es editar la tabla
 * `usuarios` desde psql en un servidor compartido.
 *
 * Son dos funciones y no una porque Payload entrega los dos ganchos con datos
 * distintos: `beforeChange` trae `data`, `operation` y `originalDoc`, mientras
 * que `beforeDelete` solo trae `id` y `req` (`BeforeDeleteHook` en
 * `collections/config/types.d.ts`). Además borrar no admite el arreglo suave de
 * «lo dejo como estaba»: o se para antes, o no hay vuelta.
 *
 * La lógica se aísla de Payload para poder probarla sin base de datos.
 */

export interface ArgumentosAutobloqueo {
  data: Record<string, unknown>
  operacion?: string
  documentoOriginal?: Record<string, unknown>
  /** Quién está haciendo el cambio, para distinguir «a otro» de «a sí mismo». */
  idDeQuienEdita?: string
  /** Cuántos administradores activos quedan aparte del que se está editando. */
  contarOtrosAdmins: (exceptoId: string) => Promise<number>
}

export async function impedirAutobloqueo({
  data,
  operacion,
  documentoOriginal,
  idDeQuienEdita,
  contarOtrosAdmins,
}: ArgumentosAutobloqueo): Promise<Record<string, unknown>> {
  if (operacion !== 'update' || !documentoOriginal) return data

  const eraAdminActivo = documentoOriginal.rol === 'admin' && documentoOriginal.activo === true
  if (!eraAdminActivo) return data

  const rolNuevo = data.rol === undefined ? documentoOriginal.rol : data.rol
  const activoNuevo = data.activo === undefined ? documentoOriginal.activo : data.activo
  const sigueSiendoAdminActivo = rolNuevo === 'admin' && activoNuevo === true
  if (sigueSiendoAdminActivo) return data

  const id = String(documentoOriginal.id ?? '')

  if (idDeQuienEdita && id === idDeQuienEdita) {
    throw new Error(
      'No puede quitarse a sí mismo el rol de administrador ni desactivar su propia cuenta.',
    )
  }

  if ((await contarOtrosAdmins(id)) === 0) {
    throw new Error(
      'Es el único administrador activo: la plataforma quedaría sin nadie que pueda ' +
        'gestionar cuentas. Cree otro administrador antes de hacer este cambio.',
    )
  }

  return data
}

export interface ArgumentosBorradoDeAdmin {
  /** La cuenta que se va a eliminar, tal como está hoy en la base. */
  documentoOriginal?: Record<string, unknown>
  /** Quién está borrando, para distinguir «a otro» de «a sí mismo». */
  idDeQuienEdita?: string
  /** Cuántos administradores activos quedan aparte del que se elimina. */
  contarOtrosAdmins: (exceptoId: string) => Promise<number>
}

/**
 * Lo mismo que `impedirAutobloqueo`, para el borrado.
 *
 * La modificación tenía dos capas —la acción del panel y el gancho— y el
 * borrado solo una: `eliminarUsuario` comprueba las dos cosas, pero
 * `access.delete` deja pasar a cualquier administrador activo y la API REST
 * sigue expuesta. Un `DELETE /api/usuarios/<id>` a mano, o desde un script de
 * limpieza, se llevaba por delante la única cuenta de administrador que
 * quedaba: a partir de ahí nadie puede crear cuentas, activar a nadie ni entrar
 * al panel, porque todo eso exige `rol === 'admin'` y ya no hay ninguno.
 *
 * No devuelve nada: o deja seguir, o corta con un error. Un gancho
 * `beforeDelete` que lanza aborta la operación antes de tocar la base
 * (`collections/operations/deleteByID.js`: los ganchos corren en la línea 45 y
 * `db.deleteOne` en la 127).
 */
export async function impedirBorradoDelUltimoAdmin({
  documentoOriginal,
  idDeQuienEdita,
  contarOtrosAdmins,
}: ArgumentosBorradoDeAdmin): Promise<void> {
  // Sin el documento no se puede decidir nada. Se deja pasar a propósito en
  // lugar de cortar: la cuenta que no se encuentra es la que ya no está, y
  // rechazar el borrado ahí solo dejaría filas imposibles de limpiar.
  if (!documentoOriginal) return

  const eraAdminActivo = documentoOriginal.rol === 'admin' && documentoOriginal.activo === true
  if (!eraAdminActivo) return

  const id = String(documentoOriginal.id ?? '')

  if (idDeQuienEdita && id === idDeQuienEdita) {
    throw new Error('No puede eliminar su propia cuenta de administrador.')
  }

  if ((await contarOtrosAdmins(id)) === 0) {
    throw new Error(
      'Es el único administrador activo: la plataforma quedaría sin nadie que pueda ' +
        'gestionar cuentas. Cree otro administrador antes de eliminar esta cuenta.',
    )
  }
}

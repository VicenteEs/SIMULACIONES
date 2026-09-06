/**
 * Impide que la plataforma se quede sin administrador.
 *
 * El panel propio ya lo comprueba antes de llamar a Payload, pero el CMS nativo
 * en `/admin` escribe directamente sobre la colección y no pasa por ahí. La
 * regla tiene que vivir también en la colección, o basta con desmarcar una
 * casilla en la pantalla equivocada para dejar la instalación sin nadie capaz
 * de crear cuentas —y la única salida es editar la tabla desde psql.
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

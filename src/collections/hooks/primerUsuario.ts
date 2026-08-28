/**
 * Promoción del primer usuario de la plataforma.
 *
 * Toda cuenta nace lectora y desactivada (decisión D-020). Esa regla es
 * correcta salvo para la primera cuenta de todas: quien instala la plataforma
 * no tiene a nadie que lo active, de modo que si se crea a sí mismo como lector
 * inactivo queda encerrado fuera de su propio panel y hay que rescatarlo a mano
 * desde la base de datos.
 *
 * La lógica se aísla de Payload para poder probarla sin base de datos.
 */

export interface DatosUsuario {
  rol?: string
  activo?: boolean
  [clave: string]: unknown
}

export interface ArgumentosPrimerUsuario {
  data: DatosUsuario
  /** Cuántas cuentas existen ya. Se inyecta para poder probar sin base. */
  contarUsuarios: () => Promise<number>
  operacion?: string
}

export async function ajustarPrimerUsuario({
  data,
  contarUsuarios,
  operacion,
}: ArgumentosPrimerUsuario): Promise<DatosUsuario> {
  if (operacion !== 'create') return data
  const existentes = await contarUsuarios()
  if (existentes > 0) return data
  return { ...data, rol: 'admin', activo: true }
}

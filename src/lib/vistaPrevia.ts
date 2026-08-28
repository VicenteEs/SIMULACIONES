/**
 * Vista previa de rol: «ver como residente» sin cerrar sesión.
 *
 * Quien edita necesita comprobar qué verá realmente el residente antes de
 * publicar. La simulación **solo baja privilegios, nunca los sube**: si un
 * lector pudiera declararse administrador enviando un valor, el control de
 * acceso entero dejaría de valer.
 */

import type { Rol } from '@/access/reglas'

export const ROLES_SIMULABLES: readonly Rol[] = ['admin', 'editor', 'lector']

/** Cuanto mayor el número, más privilegios. */
const JERARQUIA: Record<Rol, number> = { admin: 3, editor: 2, lector: 1 }

const esRol = (valor: unknown): valor is Rol =>
  typeof valor === 'string' && (ROLES_SIMULABLES as readonly string[]).includes(valor)

/** Un rol solo puede simular otro de privilegio igual o menor. */
export function puedeSimularRol(real: Rol, simulado: unknown): boolean {
  if (!esRol(simulado)) return false
  return JERARQUIA[simulado] <= JERARQUIA[real]
}

/**
 * El rol con el que se resuelve esta petición.
 *
 * Ante cualquier valor inesperado se devuelve el rol real: la simulación es una
 * comodidad para el autor, nunca una vía para obtener permisos.
 */
export function rolEfectivo(real: Rol, simulado: unknown): Rol {
  return puedeSimularRol(real, simulado) ? (simulado as Rol) : real
}

/** Nombre de la cookie donde vive el rol simulado. */
export const COOKIE_VISTA_PREVIA = 'vista-previa-rol'

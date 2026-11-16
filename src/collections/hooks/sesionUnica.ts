import type { CollectionAfterLoginHook } from 'payload'
import { datosDelContexto } from '@/lib/entradas'
import { anotarLaEntrada } from '@/lib/entradasServidor'

/**
 * Una sola sesión abierta por cuenta (D-374, D-388): al entrar se cierran las
 * demás, se anota la entrada con su equipo y se avisa si no parece de una sola
 * persona. Lo hace `anotarLaEntrada`; aquí solo se le pasa lo que trae Payload.
 *
 * En la colección y no en `entrar()`, para que valga por cualquier puerta: hoy
 * solo esa acción llega a `payload.login`, porque `POST /api/usuarios/login`
 * contesta 403, pero el día que se reabra una cuenta seguirá teniendo una
 * sesión. Lo que sí pone `entrar()` es el equipo, en el `context` del login,
 * porque la API local no trae las cabeceras de la petición. Sin él la entrada
 * se anota igual, sin equipo, IP ni país.
 *
 * Va antes que el gancho del último acceso, que vuelve a leer la cuenta y la
 * escribe entera: así lee ya la lista de sesiones con una sola.
 */
export const unaSesionPorCuenta: CollectionAfterLoginHook = async ({ req, user, token, context }) => {
  await anotarLaEntrada(
    req.payload,
    { usuario: user as unknown as Record<string, unknown>, testigo: token, datos: datosDelContexto(context) },
    req,
  )
  return user
}

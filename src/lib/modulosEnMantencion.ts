/**
 * Los módulos en mantención, para las páginas y las acciones de servidor.
 *
 * Con `cache` de React, una vez por petición, por el mismo motivo que
 * `obtenerSesion`: la barra, la portada y la página de un módulo preguntan lo
 * mismo en el mismo pintado, y cada pregunta es una consulta. Dura lo que dura
 * la petición, así que el interruptor se nota en la siguiente.
 *
 * Los adaptadores de Payload no pasan por aquí: no pueden importar la
 * configuración (ver `mantencion.ts`) y la memorizan en `req.context`.
 */
import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { leerMantencion } from '@/lib/mantencion'

export const modulosEnMantencion = cache(async function modulosEnMantencion(): Promise<string[]> {
  return leerMantencion(await getPayload({ config }))
})

'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'

export async function crearComentario(coleccion: string, documentoId: string, texto: string) {
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo || !usuarioEfectivo) {
    throw new Error('Debe iniciar sesión para comentar')
  }

  const payload = await getPayload({ config })
  
  await payload.create({
    collection: 'comentarios',
    data: {
      coleccion: coleccion as any,
      documentoId,
      texto,
      estado: 'pendiente',
    },
    user: usuarioEfectivo as any,
  })
}

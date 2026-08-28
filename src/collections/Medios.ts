import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'

/** Imágenes y videos que el traumatólogo inserta en los bloques. */
export const Medios: CollectionConfig = {
  slug: 'medios',
  labels: { singular: 'Archivo', plural: 'Medios' },
  admin: { useAsTitle: 'alt', group: 'Estructura' },
  access: {
    read: lecturaSimple,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  upload: {
    staticDir: 'public/media',
    mimeTypes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
      'video/mp4',
      'video/webm',
    ],
    imageSizes: [
      { name: 'miniatura', width: 400, height: 300, position: 'centre' },
      { name: 'ancho', width: 1400 },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      label: 'Descripción para lectores de pantalla',
      admin: {
        description: 'Qué se ve en la imagen. Sin esto la plataforma no es accesible.',
      },
    },
  ],
}

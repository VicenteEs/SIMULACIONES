import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'
import { validarModelo3D } from '@/uploads/validarModelo3D'

/**
 * Modelos tridimensionales obtenidos de TC y RM segmentadas (decisión D-022).
 *
 * La validación mira el contenido real del archivo, no su extensión, y hace
 * cumplir el techo de peso: una malla sin reducir deja la plataforma
 * inservible en equipos modestos (observación O-008).
 */
export const Modelos3D: CollectionConfig = {
  slug: 'modelos-3d',
  labels: { singular: 'Modelo 3D', plural: 'Modelos 3D' },
  admin: { useAsTitle: 'nombre', defaultColumns: ['nombre', 'origen'], group: 'Estructura' },
  access: {
    read: lecturaSimple,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  upload: {
    staticDir: 'public/media/modelos',
    mimeTypes: ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream'],
  },
  hooks: {
    beforeValidate: [
      ({ req, data }) => {
        const archivo = req?.file
        if (!archivo) return data
        const resultado = validarModelo3D({
          nombre: archivo.name,
          contenido: archivo.data,
          bytes: archivo.size,
        })
        if (!resultado.valido) {
          throw new Error(resultado.motivo ?? 'El archivo no es un modelo 3D válido.')
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre del modelo' },
    {
      name: 'origen',
      type: 'select',
      required: true,
      defaultValue: 'tc',
      label: 'Origen',
      options: [
        { label: 'Tomografía computarizada', value: 'tc' },
        { label: 'Resonancia magnética', value: 'rm' },
        { label: 'Modelo sintético o de referencia', value: 'sintetico' },
      ],
    },
    {
      name: 'anonimizado',
      type: 'checkbox',
      defaultValue: false,
      label: 'Confirmo que el estudio de origen está anonimizado',
      admin: {
        description:
          'Los metadatos DICOM guardan nombre, identificador y fecha de nacimiento aunque la imagen se vea anónima. Ver Q-007 de la bitácora.',
      },
    },
    {
      name: 'triangulos',
      type: 'number',
      label: 'Triángulos de la malla',
      admin: {
        description: 'Referencia de rendimiento. El objetivo para navegador va de 50.000 a 150.000.',
      },
    },
    { name: 'notas', type: 'textarea', label: 'Notas del procesamiento' },
  ],
}

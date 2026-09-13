import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'
import { validarModelo3D } from '@/uploads/validarModelo3D'
import { cacheDeArchivoPrivado } from './hooks/cacheDeArchivos'

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
    // Fuera de `public/`, por lo mismo que los medios: ver Medios.ts. Se queda
    // como subcarpeta de `medios/` para que el volumen del servidor siga
    // siendo uno solo y los archivos ya subidos no haya que moverlos.
    staticDir: 'medios/modelos',
    // Privada y con `Vary: Cookie`: ver el comentario de la función.
    modifyResponseHeaders: cacheDeArchivoPrivado,
    // Solo glTF binario. `model/gltf+json` estuvo aquí anunciando un formato
    // que no se podía subir: un `.gltf` es JSON, no lleva la firma «glTF» que
    // exige `validarModelo3D`, y antes de llegar siquiera a esa comprobación
    // `checkFileRestrictions` lo rechaza porque `file-type` no reconoce JSON y
    // lo da por `text/plain`. Aparte del formato, el glTF de texto arrastra un
    // `.bin` y las texturas sueltas, y esta colección guarda un archivo por
    // documento: no habría dónde ponerlos.
    mimeTypes: ['model/gltf-binary', 'application/octet-stream'],
  },
  hooks: {
    // `beforeOperation` y no `beforeValidate`, y la diferencia no es de estilo.
    //
    // Payload prepara el archivo en `generateFileData`, que corre **antes** del
    // `beforeValidate` de la colección (`collections/operations/create.js`: la
    // llamada está por encima del bucle de ganchos). De ahí salían dos cosas:
    //
    // 1. El nombre del archivo ya estaba decidido cuando el gancho corría, así
    //    que `nombreSeguro` se calculaba, se probaba y no se aplicaba en
    //    ninguna subida real. Payload sanea por su cuenta el nombre base con
    //    `sanitize-filename`, pero no la extensión, que sale de un
    //    `split('.').pop()` sin tocar.
    // 2. `checkFileRestrictions`, dentro de `generateFileData`, rechazaba antes
    //    que nosotros y con su mensaje en inglés («The following field is
    //    invalid: file»); el motivo en español no llegaba nunca a la pantalla.
    //
    // `beforeOperation` es el único gancho anterior a todo eso. Cubre además la
    // otra vía de subida, `exportarComoModelo` del atlas, que llama a
    // `payload.create` con su propio `file`.
    beforeOperation: [
      ({ req }) => {
        const archivo = req?.file
        if (!archivo) return
        const resultado = validarModelo3D({
          nombre: archivo.name,
          contenido: archivo.data,
          bytes: archivo.size,
        })
        if (!resultado.valido) {
          throw new Error(resultado.motivo ?? 'El archivo no es un modelo 3D válido.')
        }
        if (resultado.nombreSeguro) archivo.name = resultado.nombreSeguro
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

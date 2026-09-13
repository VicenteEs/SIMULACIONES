import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'
import { cacheDeArchivoPrivado } from './hooks/cacheDeArchivos'

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
    // FUERA de `public/`, y esa es toda la diferencia entre un archivo con
    // sesión y uno sin ella.
    //
    // Payload ya sirve cada archivo por `<api>/medios/file/<nombre>`, y esa
    // ruta ejecuta el `access.read` de aquí arriba: sin sesión activa
    // responde 403. Pero mientras la carpeta estuvo dentro de `public/`, Next
    // servía además una copia idéntica en `/media/<nombre>` como recurso
    // estático, sin preguntar nada a nadie. Cualquiera con la dirección —y la
    // dirección se deduce del nombre del archivo— se descargaba la radiografía
    // sin entrar en la plataforma. La decisión D-020 dice que sin sesión no se
    // ve nada; esta carpeta era el agujero.
    //
    // Al moverla, las fichas ya escritas siguen funcionando sin tocar la base:
    // el campo `url` de Payload es virtual y se recalcula en cada lectura.
    //
    // Hasta aquí llega esta colección, y conviene no darlo por más de lo que
    // es. `lecturaSimple` devuelve el booleano `true` para cualquier cuenta
    // activa, y con un `true` a secas Payload no consulta la base en
    // `uploads/checkFileAccess.js` —la comprobación solo corre cuando el
    // resultado es un objeto de condiciones—, así que el archivo de una ficha
    // en borrador se sirve igual que el de una publicada. Apretar el `read` de
    // aquí NO es la salida: las páginas leen con `overrideAccess: false` y
    // Payload propaga ese valor al poblar relaciones, de modo que negarle la
    // lectura al lector le dejaría sin imágenes también las fichas publicadas.
    // Lo que hay que cerrar es el listado de la API REST, que el navegador no
    // usa; vive en `src/app/(payload)/api/[...slug]/route.ts`.
    staticDir: 'medios',
    // Privada y con `Vary: Cookie`: ver el comentario de la función.
    modifyResponseHeaders: cacheDeArchivoPrivado,
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

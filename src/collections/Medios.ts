import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'
import { cacheDeArchivoPrivado } from './hooks/cacheDeArchivos'

/**
 * Imágenes y videos que el traumatólogo inserta en los bloques.
 *
 * Aquí no hay ningún techo de peso escrito, y no es un olvido: el de esta
 * colección son 50 MB y vive en `TECHO_DE_MEDIOS_BYTES`
 * (`src/admin/esquema.ts`), declarado al lado del de los modelos 3D para que
 * quien mueva uno vea el otro. Lo hace cumplir la ruta de subida
 * (`src/app/(frontend)/api/subidas/[coleccion]/route.ts`), que cuenta los bytes
 * mientras los recibe. Repetirlo en esta colección sería exactamente la clase
 * de segunda cifra que ya prometió 50 MB mientras el marco cortaba en 8.
 *
 * Lo que sí cambia al aceptar vídeo de verdad —y no hay que tocar nada para que
 * pase, pero conviene saberlo antes de mover una línea de aquí abajo— es cómo
 * se sirve: Payload responde peticiones `Range` y manda el archivo en flujo
 * (`uploads/endpoints/getFile.js`), así que el navegador pide el vídeo por
 * tramos y el residente lo ve empezar sin haberlo descargado entero. Es lo que
 * hace soportable un archivo de 40 MB detrás de un túnel doméstico.
 */
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
    // La lista que decide, y se comprueba contra el tipo que Payload deduce del
    // **contenido** del archivo, no del que declare quien sube: la ruta de
    // subida entrega el archivo con `filePath`, y `getFileByPath` mira la firma
    // con `file-type`. Por eso renombrar un `.mov` a `.mp4` no lo cuela.
    //
    // Y por eso mismo la lista se queda en estos dos formatos de vídeo aunque
    // la cámara de pabellón grabe en otro: un QuickTime no se reproduce en
    // `<video>` fuera de Safari, así que admitirlo sería dejar subir un archivo
    // que la mitad de los residentes ve como un recuadro negro. La conversión
    // va antes de la subida, y de eso avisa la ayuda del panel.
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
        // El mismo texto que la ayuda del panel (`src/admin/esquema.ts`), y
        // nombra el vídeo porque esta colección guarda vídeo: para quien no ve
        // la pantalla, esta frase es todo lo que hay del gesto quirúrgico que
        // se está enseñando.
        description:
          'Qué se ve en la imagen, o qué gesto se hace en el video. Sin esto la plataforma no es accesible.',
      },
    },
  ],
}

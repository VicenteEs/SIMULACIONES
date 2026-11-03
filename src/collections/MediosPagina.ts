import { createHash } from 'node:crypto'
import type { CollectionBeforeOperationHook, CollectionConfig } from 'payload'
import { administracionDeUsuarios } from '@/access/payload'
import { TIPOS_DE_FOTO, espacioDeFoto, nombreDeFoto } from '@/lib/espaciosDeLaPagina'
import { cacheDeArchivoPrivado } from './hooks/cacheDeArchivos'

/**
 * El nombre del archivo sale de su contenido, no del que trajo quien lo subió.
 *
 * La ruta pública (`api/pagina/[archivo]`) sirve estas fotos con caché
 * inmutable de un año, y eso solo es verdad si un nombre nunca vuelve a señalar
 * otra imagen. Payload ya evita pisar un archivo que existe (le añade «-1»),
 * pero no que se reutilice el nombre de uno ya borrado: «portada.png» subida,
 * restaurada y vuelta a subir con otra foto llevaba el mismo nombre, y cada
 * navegador que había visto la primera la seguía viendo.
 *
 * Va en `beforeOperation` y no en `beforeChange` porque es el último momento
 * antes de que Payload tome el nombre de `req.file` para escribir el disco
 * (`generateFileData`). Sin espacio válido no se toca nada: la validación del
 * campo rechaza la subida un paso después, con su mensaje.
 */
const nombrarPorElContenido: CollectionBeforeOperationHook = ({ args, operation }) => {
  if (operation !== 'create') return args
  const archivo = args.req?.file
  const espacio = espacioDeFoto((args.data as Record<string, unknown> | undefined)?.espacio)
  if (!archivo?.data || !espacio) return args
  const huella = createHash('sha256').update(archivo.data).digest('hex')
  const nombre = nombreDeFoto(espacio, huella, archivo.mimetype)
  if (nombre) archivo.name = nombre
  return args
}

/**
 * Las fotos de las páginas públicas que el administrador cambió desde «Medios
 * de la página» (P-007 E2). En la base, la tabla `medios_pagina`.
 *
 * Aparte de `medios` por dos razones, y las dos importan. Una, que el dueño lo
 * pidió así para no confundir la pestaña con la de los medios del contenido.
 * La otra, que estas fotos se ven **sin sesión** y las de `medios` no (D-020):
 * meterlas allí habría obligado a abrir la lectura de una colección entera de
 * radiografías para enseñar la portada.
 *
 * La colección sigue siendo cerrada —la lee y la escribe solo el
 * administrador, y `tests/unit/colecciones.test.ts` lo vigila como en todas—.
 * Lo público es una ruta aparte, que entrega un archivo solo si su fila es la
 * vigente de un espacio de la página (`src/lib/mediosDeLaPagina.ts`). Así la
 * prueba de D-020 sigue diciendo la verdad: ninguna colección se lee sin sesión.
 *
 * Una fila por subida, y no una por espacio que se reescribe: la más reciente de
 * cada espacio es la que se pinta, y al terminar la subida la pestaña retira
 * las anteriores (`retirarFotosAnteriores`). Si eso no llega a pasar —se cortó
 * la conexión—, la página sigue mostrando la buena.
 */
export const MediosPagina: CollectionConfig = {
  slug: 'medios-pagina',
  labels: { singular: 'Foto de la página', plural: 'Medios de la página' },
  admin: { useAsTitle: 'alt', group: 'Administración' },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
  },
  hooks: { beforeOperation: [nombrarPorElContenido] },
  upload: {
    // Dentro de `medios/`, que es el volumen de Docker y lo que copia el
    // respaldo: una carpeta nueva fuera de ahí se perdería en el primer
    // despliegue y no estaría en ninguna copia.
    staticDir: 'medios/pagina',
    // La respuesta de la ruta de Payload, que exige sesión de administrador,
    // lleva las cabeceras de siempre. La pública pone las suyas.
    modifyResponseHeaders: cacheDeArchivoPrivado,
    // Sin SVG: ver `TIPOS_DE_FOTO`.
    mimeTypes: [...TIPOS_DE_FOTO],
    // Ni miniaturas ni tamaños: el `srcset` lo arma `next/image` a partir de la
    // original. Sí un techo, y de paso sharp vuelve a escribir la imagen sin
    // sus metadatos: la foto de un celular trae en el EXIF dónde se tomó, y
    // esta se sirve a cualquiera.
    resizeOptions: { width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true },
  },
  fields: [
    {
      name: 'espacio',
      type: 'text',
      required: true,
      index: true,
      label: 'Espacio de la página',
      // Texto y no `select`: la lista de espacios vive en
      // `src/lib/espaciosDeLaPagina.ts`, y como `select` cada espacio nuevo
      // pediría una migración del enum de PostgreSQL. La validación hace lo que
      // haría el enum, con un mensaje en español.
      validate: (valor: unknown) => (espacioDeFoto(valor) ? true : 'Ese espacio de la página no existe.'),
    },
    {
      name: 'alt',
      type: 'text',
      required: true,
      maxLength: 200,
      label: 'Descripción para lectores de pantalla',
      admin: { description: 'Qué se ve en la foto. Es lo único que llega de ella a quien no la ve.' },
    },
  ],
}

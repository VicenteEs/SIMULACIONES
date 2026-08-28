/**
 * Bloques de contenido (decisión D-011).
 *
 * El traumatólogo compone cada pestaña apilando y reordenando estos bloques sin
 * límite de cantidad. Lo que no puede es elegir colores ni tipografías: el
 * aspecto de cada bloque vive en el código, de modo que la plataforma se ve
 * igual en todas las fichas y él dedica su tiempo a escribir.
 */
import type { Block } from 'payload'
import {
  lexicalEditor,
  HeadingFeature,
  FixedToolbarFeature,
} from '@payloadcms/richtext-lexical'

/** Editor de texto acotado: estructura sí, decoración no. */
export const editorClinico = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures,
    FixedToolbarFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3', 'h4'] }),
  ],
})

export const BloqueTexto: Block = {
  slug: 'texto',
  labels: { singular: 'Texto', plural: 'Bloques de texto' },
  fields: [
    { name: 'titulo', type: 'text', label: 'Título de la sección (opcional)' },
    {
      name: 'cuerpo',
      type: 'richText',
      required: true,
      editor: editorClinico,
      label: 'Contenido',
    },
  ],
}

export const BloqueLista: Block = {
  slug: 'lista-clinica',
  labels: { singular: 'Lista clínica', plural: 'Listas clínicas' },
  fields: [
    { name: 'titulo', type: 'text', label: 'Encabezado de la lista' },
    {
      name: 'puntos',
      type: 'array',
      minRows: 1,
      label: 'Puntos',
      fields: [
        { name: 'destacado', type: 'text', label: 'Idea en negrita (opcional)' },
        { name: 'texto', type: 'textarea', required: true, label: 'Desarrollo' },
      ],
    },
  ],
}

export const BloqueClasificacion: Block = {
  slug: 'tabla-clasificacion',
  labels: { singular: 'Tabla de clasificación', plural: 'Tablas de clasificación' },
  fields: [
    { name: 'titulo', type: 'text', required: true, label: 'Nombre de la clasificación' },
    {
      name: 'filas',
      type: 'array',
      minRows: 1,
      label: 'Filas',
      fields: [
        { name: 'clave', type: 'text', required: true, label: 'Código o tipo' },
        { name: 'descripcion', type: 'textarea', required: true, label: 'Descripción' },
      ],
    },
  ],
}

export const BloqueAdvertencia: Block = {
  slug: 'advertencia',
  labels: { singular: 'Advertencia', plural: 'Advertencias' },
  fields: [
    {
      name: 'tono',
      type: 'select',
      required: true,
      defaultValue: 'atencion',
      label: 'Tipo',
      options: [
        { label: 'Atención', value: 'atencion' },
        { label: 'Error frecuente', value: 'error-frecuente' },
        { label: 'Perla clínica', value: 'perla' },
      ],
    },
    { name: 'texto', type: 'textarea', required: true, label: 'Texto' },
  ],
}

export const BloqueImagen: Block = {
  slug: 'imagen',
  labels: { singular: 'Imagen', plural: 'Imágenes' },
  fields: [
    { name: 'imagen', type: 'upload', relationTo: 'medios', required: true, label: 'Archivo' },
    { name: 'pie', type: 'text', label: 'Pie de imagen' },
    {
      name: 'ancho',
      type: 'select',
      defaultValue: 'completo',
      label: 'Ancho',
      options: [
        { label: 'Ancho completo', value: 'completo' },
        { label: 'Media columna', value: 'media' },
        { label: 'Pequeña, alineada a la derecha', value: 'pequena' },
      ],
    },
  ],
}

export const BloqueVideo: Block = {
  slug: 'video',
  labels: { singular: 'Video', plural: 'Videos' },
  fields: [
    { name: 'video', type: 'upload', relationTo: 'medios', required: true, label: 'Archivo de video' },
    { name: 'pie', type: 'text', label: 'Pie del video' },
  ],
}

export const BloqueModelo3D: Block = {
  slug: 'modelo-3d',
  labels: { singular: 'Modelo 3D', plural: 'Modelos 3D' },
  fields: [
    {
      name: 'modelo',
      type: 'relationship',
      relationTo: 'modelos-3d',
      required: true,
      label: 'Modelo',
    },
    { name: 'pie', type: 'text', label: 'Pie del visor' },
    {
      name: 'encuadre',
      type: 'group',
      label: 'Encuadre inicial',
      admin: {
        description:
          'Posición desde la que se ve el modelo al abrir la ficha. Se ajusta en el visor y se guarda aquí.',
      },
      fields: [
        { name: 'escala', type: 'number', defaultValue: 1, min: 0.01, max: 100, label: 'Escala' },
        { name: 'giroX', type: 'number', defaultValue: 0, label: 'Giro en X (grados)' },
        { name: 'giroY', type: 'number', defaultValue: 0, label: 'Giro en Y (grados)' },
        { name: 'giroZ', type: 'number', defaultValue: 0, label: 'Giro en Z (grados)' },
        {
          name: 'distanciaCamara',
          type: 'number',
          defaultValue: 3,
          min: 0.1,
          label: 'Distancia de la cámara',
        },
      ],
    },
  ],
}

/** Los bloques disponibles en cualquier pestaña de contenido. */
export const BLOQUES: Block[] = [
  BloqueTexto,
  BloqueLista,
  BloqueClasificacion,
  BloqueAdvertencia,
  BloqueImagen,
  BloqueVideo,
  BloqueModelo3D,
]

/**
 * Campo reutilizable: una pestaña es una pila libre de bloques.
 * Las pestañas son fijas; su contenido, no.
 */
export const pilaDeBloques = (nombre: string, etiqueta: string) => ({
  name: nombre,
  type: 'blocks' as const,
  label: etiqueta,
  blocks: BLOQUES,
  admin: {
    initCollapsed: false,
    description: 'Agregue los bloques que necesite y arrástrelos para reordenarlos.',
  },
})

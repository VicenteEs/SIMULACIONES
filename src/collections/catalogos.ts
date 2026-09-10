import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'

/**
 * Los catálogos del simulador quirúrgico.
 *
 * Cuatro listas cortas que describen el vocabulario de una cirugía: el hueso,
 * la clasificación de la fractura, la técnica de osteosíntesis, las fases del
 * acto quirúrgico y el instrumental.
 *
 * Son **colecciones** y no listas de opciones escritas en el código, y esa es
 * toda la decisión. Una opción de un `select` de Payload vive en el esquema:
 * añadir «fijador externo» exigiría editar un archivo, generar una migración y
 * desplegar, es decir, esperar al desarrollador. Una colección la edita el
 * traumatólogo desde el panel a las once de la noche, cuando se acuerda de que
 * le falta un separador. El coste es una tabla por catálogo; el beneficio es
 * que el vocabulario deja de depender de nadie.
 *
 * Todas se leen con `lecturaSimple` —cualquier cuenta activa las ve, porque el
 * residente necesita ver el nombre del instrumento que elige— y se escriben con
 * `escrituraDeContenido`, igual que los segmentos anatómicos.
 */

/** Cabecera común: se leen con sesión, las edita quien redacta contenido. */
const acceso = {
  read: lecturaSimple,
  create: escrituraDeContenido,
  update: escrituraDeContenido,
  delete: escrituraDeContenido,
} as const

/**
 * Huesos y segmentos óseos, con su número AO.
 *
 * El primer número del código AO identifica el hueso y su tercio: 42 es la
 * diáfisis de la tibia, 23 el extremo distal del radio. Se guarda aparte de la
 * clasificación de la fractura porque son dos ejes independientes: el mismo
 * trazo A2 existe en la tibia y en el fémur.
 */
export const HuesosAO: CollectionConfig = {
  slug: 'huesos-ao',
  labels: { singular: 'Hueso', plural: 'Huesos y segmentos' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'codigo', 'orden'],
    group: 'Catálogos del simulador',
    description: 'Hueso y tercio, con el número que le da la AO.',
  },
  access: acceso,
  defaultSort: 'orden',
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre', index: true },
    {
      name: 'codigo',
      type: 'text',
      label: 'Número AO',
      admin: { description: 'El primero del código. «42» para la diáfisis de la tibia.' },
    },
    { name: 'orden', type: 'number', defaultValue: 0, label: 'Orden de aparición' },
  ],
}

/**
 * Clasificación AO de la fractura: el tipo y el grupo.
 *
 * Es independiente del hueso a propósito. El código completo que ve el
 * residente —«42-A2»— se compone al mostrarlo, uniendo el número del hueso con
 * el de la clasificación. Guardarlo compuesto obligaría a crear una fila por
 * cada combinación posible.
 */
export const ClasificacionesAO: CollectionConfig = {
  slug: 'clasificaciones-ao',
  labels: { singular: 'Clasificación AO', plural: 'Clasificaciones AO' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['codigo', 'nombre', 'tipo', 'orden'],
    group: 'Catálogos del simulador',
    description: 'Tipo y grupo del trazo de fractura, sin el hueso.',
  },
  access: acceso,
  defaultSort: 'orden',
  fields: [
    {
      name: 'codigo',
      type: 'text',
      required: true,
      label: 'Código',
      index: true,
      admin: { description: '«A2», «B1», «C3». Sin el número del hueso.' },
    },
    { name: 'nombre', type: 'text', required: true, label: 'Nombre del trazo' },
    {
      name: 'tipo',
      type: 'select',
      label: 'Tipo',
      options: [
        { label: 'A · Simple', value: 'A' },
        { label: 'B · En cuña', value: 'B' },
        { label: 'C · Compleja', value: 'C' },
      ],
      admin: { description: 'Los tres tipos de la AO. Esta lista sí es cerrada: es la propia clasificación.' },
    },
    { name: 'descripcion', type: 'textarea', label: 'Qué la caracteriza' },
    { name: 'orden', type: 'number', defaultValue: 0, label: 'Orden de aparición' },
  ],
}

/** Técnicas de osteosíntesis. Determinan qué instrumental tiene sentido. */
export const TecnicasQuirurgicas: CollectionConfig = {
  slug: 'tecnicas-quirurgicas',
  labels: { singular: 'Técnica', plural: 'Técnicas quirúrgicas' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'orden'],
    group: 'Catálogos del simulador',
    description: 'Clavo endomedular, placa, tornillos, fijador externo.',
  },
  access: acceso,
  defaultSort: 'orden',
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre de la técnica', index: true },
    { name: 'descripcion', type: 'textarea', label: 'Cuándo se elige' },
    { name: 'orden', type: 'number', defaultValue: 0, label: 'Orden de aparición' },
  ],
}

/**
 * Fases del acto quirúrgico.
 *
 * Agrupan los pasos en la franja inferior de la consola. Son catálogo y no una
 * lista fija porque cada técnica ordena su acto de forma distinta, y porque
 * añadir «cierre por planos» no debería exigir un despliegue.
 */
export const FasesQuirurgicas: CollectionConfig = {
  slug: 'fases-quirurgicas',
  labels: { singular: 'Fase', plural: 'Fases quirúrgicas' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'orden'],
    group: 'Catálogos del simulador',
    description: 'Abordaje, reducción, fijación, cierre.',
  },
  access: acceso,
  defaultSort: 'orden',
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre de la fase', index: true },
    { name: 'orden', type: 'number', defaultValue: 0, label: 'Orden en el acto quirúrgico' },
  ],
}

/**
 * Instrumental quirúrgico.
 *
 * Cada paso de una cirugía declara cuál es el correcto, y la consola pinta la
 * bandeja con todos los del caso. Antes el instrumento era texto libre dentro
 * de cada paso y la bandeja se deducía juntando esos textos: bastaba escribir
 * «Separador de Hohmann» en un paso y «separador de hohmann» en otro para que
 * aparecieran dos instrumentos distintos y ninguno fuera nunca el correcto.
 *
 * El icono se elige de una lista dibujada en el código. Es la única parte que
 * el traumatólogo no puede añadir por su cuenta, y se acepta a cambio de que la
 * bandeja se vea igual siempre: un icono subido como archivo llegaría con
 * cualquier tamaño, cualquier grosor de trazo y cualquier color.
 */
export const Instrumental: CollectionConfig = {
  slug: 'instrumental',
  labels: { singular: 'Instrumento', plural: 'Instrumental' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'icono', 'orden'],
    group: 'Catálogos del simulador',
    description: 'La bandeja de la consola. Cada paso declara cuál es el correcto.',
  },
  access: acceso,
  defaultSort: 'orden',
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre del instrumento', index: true },
    {
      name: 'icono',
      type: 'select',
      defaultValue: 'generico',
      label: 'Icono',
      options: [
        { label: 'Genérico', value: 'generico' },
        { label: 'Bisturí', value: 'bisturi' },
        { label: 'Separador', value: 'separador' },
        { label: 'Pinza', value: 'pinza' },
        { label: 'Tijera', value: 'tijera' },
        { label: 'Punzón', value: 'punzon' },
        { label: 'Guía', value: 'guia' },
        { label: 'Fresa', value: 'fresa' },
        { label: 'Martillo', value: 'martillo' },
        { label: 'Atornillador', value: 'atornillador' },
        { label: 'Aguja', value: 'aguja' },
      ],
    },
    { name: 'descripcion', type: 'textarea', label: 'Para qué sirve' },
    {
      name: 'tecnicas',
      type: 'relationship',
      relationTo: 'tecnicas-quirurgicas',
      hasMany: true,
      label: 'Técnicas en las que se usa',
      admin: {
        description:
          'Solo para ordenar el catálogo. La bandeja de un caso la forman los instrumentos que sus pasos declaran, no esta lista.',
      },
    },
    { name: 'orden', type: 'number', defaultValue: 0, label: 'Orden en la bandeja' },
  ],
}

/** Los cinco catálogos, para registrarlos de una vez. */
export const CATALOGOS_DEL_SIMULADOR: CollectionConfig[] = [
  HuesosAO,
  ClasificacionesAO,
  TecnicasQuirurgicas,
  FasesQuirurgicas,
  Instrumental,
]

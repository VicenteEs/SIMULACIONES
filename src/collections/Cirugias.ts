import type { CollectionConfig } from 'payload'
import { avisarAlPublicar } from './hooks/avisarAlPublicar'
import { lecturaDeModulo, escrituraDeModulo } from '@/access/payload'
import { editorClinico, pilaDeBloques } from '@/blocks'

/**
 * Módulo 04 · Simulador quirúrgico.
 *
 * Un caso es una fractura concreta —hueso, clasificación AO y técnica— con su
 * guion de pasos. El residente lo recorre en la consola: elige instrumental,
 * traza la incisión, reduce los fragmentos y fija.
 *
 * Lo que hay que entender del diseño: **cada paso declara qué es lo que se
 * evalúa**. No todos los gestos quirúrgicos se miden igual, y forzarlos a un
 * único molde fue el error de la primera versión, donde cada paso exigía un
 * rango de fuerza en newtons aunque el gesto fuera trazar una incisión. Ahora
 * el paso elige su objetivo: el instrumento, la longitud del trazo, la calidad
 * de la reducción o la fuerza aplicada.
 *
 * Sobre el modelo 3D. El traumatólogo lo exporta desde Blender **ya partido**,
 * con cada trozo como un objeto con nombre. La plataforma no corta huesos: leer
 * el nombre de un nodo y moverlo es trivial, y cortar geometría en el navegador
 * es otro proyecto. Lo que sí hace es dejar que el autor diga qué es cada nodo,
 * en `piezas`, y qué hace cada nodo en cada paso.
 */
export const Cirugias: CollectionConfig = {
  slug: 'cirugias',
  labels: { singular: 'Cirugía simulada', plural: 'Cirugías simuladas' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'codigo', '_status'],
    group: 'Módulos',
    description: 'Caso quirúrgico con su modelo, su guion de pasos y su puntaje.',
  },
  access: {
    // Permisos por modulo: un editor puede tener asignados solo algunos.
    read: lecturaDeModulo('cirugias'),
    create: escrituraDeModulo('cirugias'),
    update: escrituraDeModulo('cirugias'),
    delete: escrituraDeModulo('cirugias'),
  },
  versions: { drafts: true, maxPerDoc: 50 },
  // Avisa a los navegadores conectados al publicar; el mismo gancho en los
  // cinco modulos.
  hooks: { afterChange: [avisarAlPublicar] },
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre del caso' },

    // --- el caso -----------------------------------------------------------
    {
      type: 'row',
      fields: [
        {
          name: 'hueso',
          type: 'relationship',
          relationTo: 'huesos-ao',
          label: 'Hueso',
        },
        {
          name: 'clasificacion',
          type: 'relationship',
          relationTo: 'clasificaciones-ao',
          label: 'Clasificación AO',
        },
        {
          name: 'tecnica',
          type: 'relationship',
          relationTo: 'tecnicas-quirurgicas',
          label: 'Técnica',
        },
      ],
    },
    {
      name: 'codigo',
      type: 'text',
      label: 'Código AO/OTA',
      admin: {
        description:
          'Se puede dejar vacío: la consola lo compone con el número del hueso y el de la clasificación. Rellénelo solo si este caso lleva uno distinto.',
      },
    },
    {
      name: 'resumen',
      type: 'richText',
      editor: editorClinico,
      label: 'Resumen del procedimiento',
    },

    // --- el modelo ---------------------------------------------------------
    {
      name: 'modelo',
      type: 'relationship',
      relationTo: 'modelos-3d',
      label: 'Modelo 3D del caso',
      admin: {
        description:
          'Archivo .glb exportado desde Blender con el hueso ya partido. Cada trozo, un objeto con nombre.',
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'milimetrosPorUnidad',
          type: 'number',
          defaultValue: 1000,
          label: 'Milímetros por unidad del archivo',
          admin: {
            description:
              'glTF trabaja en metros, así que 1000 es lo normal. Si exportó en milímetros, ponga 1. De este número dependen todas las medidas que ve el residente.',
          },
        },
        {
          name: 'ejeLargo',
          type: 'select',
          defaultValue: 'y',
          label: 'Eje largo del hueso',
          options: [
            { label: 'Y (vertical, lo habitual)', value: 'y' },
            { label: 'X', value: 'x' },
            { label: 'Z', value: 'z' },
          ],
          admin: {
            description:
              'Separa la diástasis del desplazamiento lateral: a lo largo del eje es hueco, de lado es desalineación.',
          },
        },
      ],
    },
    {
      name: 'piezas',
      type: 'array',
      label: 'Piezas del modelo',
      labels: { singular: 'Pieza', plural: 'Piezas' },
      admin: {
        description:
          'Qué es cada objeto del archivo. El nombre tiene que coincidir exactamente con el del objeto en Blender.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'nodo', type: 'text', required: true, label: 'Nombre del objeto' },
            { name: 'etiqueta', type: 'text', label: 'Cómo llamarlo en pantalla' },
          ],
        },
        {
          name: 'rol',
          type: 'select',
          required: true,
          defaultValue: 'hueso',
          label: 'Qué es',
          options: [
            { label: 'Piel', value: 'piel' },
            { label: 'Músculo', value: 'musculo' },
            { label: 'Hueso (fijo)', value: 'hueso' },
            { label: 'Fragmento móvil', value: 'fragmento' },
            { label: 'Implante', value: 'implante' },
          ],
          admin: {
            description:
              'Piel y músculo forman las capas que se encienden y apagan. El fragmento móvil es el que se reduce. El implante empieza oculto y aparece cuando el paso lo coloca.',
          },
        },
      ],
    },
    {
      name: 'desplazamientoInicial',
      type: 'group',
      label: 'Desplazamiento inicial de la fractura',
      admin: {
        description:
          'Exporte el hueso REDUCIDO, en su sitio anatómico, y describa aquí cuánto está desplazado al empezar. Así la reducción correcta es siempre volver al cero, y la consola puede medir cuánto falta.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'x', type: 'number', defaultValue: 0, label: 'Lateral (mm)' },
            { name: 'y', type: 'number', defaultValue: 0, label: 'Axial (mm)' },
            { name: 'z', type: 'number', defaultValue: 0, label: 'Anteroposterior (mm)' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'giroX', type: 'number', defaultValue: 0, label: 'Angulación X (°)' },
            { name: 'giroY', type: 'number', defaultValue: 0, label: 'Rotación Y (°)' },
            { name: 'giroZ', type: 'number', defaultValue: 0, label: 'Angulación Z (°)' },
          ],
        },
      ],
    },

    // --- el guion ----------------------------------------------------------
    {
      name: 'pasos',
      type: 'array',
      label: 'Pasos del guion quirúrgico',
      labels: { singular: 'Paso', plural: 'Pasos' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'titulo', type: 'text', required: true, label: 'Título del paso' },
            {
              name: 'fase',
              type: 'relationship',
              relationTo: 'fases-quirurgicas',
              label: 'Fase',
            },
          ],
        },
        {
          name: 'descripcion',
          type: 'richText',
          editor: editorClinico,
          label: 'Qué se hace',
        },
        {
          name: 'objetivo',
          type: 'select',
          required: true,
          defaultValue: 'instrumento',
          label: 'Qué se evalúa en este paso',
          options: [
            { label: 'Elegir el instrumento correcto', value: 'instrumento' },
            { label: 'Trazar una incisión de la longitud correcta', value: 'trazo' },
            { label: 'Reducir la fractura dentro de la tolerancia', value: 'reduccion' },
            { label: 'Aplicar la fuerza correcta', value: 'fuerza' },
          ],
        },
        {
          name: 'instrumento',
          type: 'relationship',
          relationTo: 'instrumental',
          label: 'Instrumento correcto',
          admin: {
            description: 'Se exige en todos los objetivos: sin el instrumento en la mano no hay gesto.',
          },
        },
        {
          name: 'puntos',
          type: 'number',
          defaultValue: 10,
          label: 'Puntos que vale',
        },
        // --- según el objetivo ---
        {
          type: 'row',
          fields: [
            { name: 'trazoMinimo', type: 'number', label: 'Incisión mínima (mm)' },
            { name: 'trazoMaximo', type: 'number', label: 'Incisión máxima (mm)' },
          ],
          admin: { condition: (_, hermanos) => hermanos?.objetivo === 'trazo' },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'toleranciaDesplazamiento',
              type: 'number',
              defaultValue: 5,
              label: 'Desplazamiento aceptable (mm)',
            },
            {
              // La consola enseña las tres medidas, así que las tres cuentan.
              // Una que se muestre y no se evalúe enseña que da igual.
              name: 'toleranciaDiastasis',
              type: 'number',
              defaultValue: 5,
              label: 'Diástasis aceptable (mm)',
            },
            {
              name: 'toleranciaAngulacion',
              type: 'number',
              defaultValue: 5,
              label: 'Angulación aceptable (°)',
            },
          ],
          admin: { condition: (_, hermanos) => hermanos?.objetivo === 'reduccion' },
        },
        {
          type: 'row',
          fields: [
            { name: 'fuerzaMinima', type: 'number', label: 'Fuerza mínima útil (N)' },
            { name: 'fuerzaMaxima', type: 'number', label: 'Fuerza máxima útil (N)' },
          ],
          admin: { condition: (_, hermanos) => hermanos?.objetivo === 'fuerza' },
        },
        // --- qué se ve ---
        {
          name: 'muestra',
          type: 'array',
          label: 'Piezas que se ven en este paso',
          labels: { singular: 'Pieza', plural: 'Piezas' },
          admin: {
            description:
              'Deje la lista vacía para que se vea lo mismo que en el paso anterior. El implante aparece en el paso que lo coloca.',
          },
          fields: [{ name: 'nodo', type: 'text', required: true, label: 'Nombre del objeto' }],
        },
        // --- qué se le dice al residente ---
        { name: 'exito', type: 'textarea', label: 'Si lo hace bien' },
        { name: 'insuficiente', type: 'textarea', label: 'Si se queda corto' },
        { name: 'excesivo', type: 'textarea', label: 'Si se pasa' },
        {
          name: 'riesgo',
          type: 'richText',
          editor: editorClinico,
          label: 'Estructura o principio en juego',
        },
      ],
    },
    pilaDeBloques('contenido', 'Material adicional'),
  ],
}

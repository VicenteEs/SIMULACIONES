import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'

/**
 * Segmentos anatómicos. Ordenan la biblioteca y agrupan las maniobras del
 * examen físico; los define el traumatólogo, no el código.
 *
 * El encabezado decía «y el mapa corporal del examen físico». No hay tal mapa:
 * `zonaMapa` se guarda desde la primera migración y no lo lee nadie —ver el
 * comentario del campo—, y `examen-fisico/page.tsx` agrupa por segmento en
 * secciones con su título, sin silueta ninguna.
 */
export const Segmentos: CollectionConfig = {
  slug: 'segmentos',
  labels: { singular: 'Segmento', plural: 'Segmentos' },
  admin: { useAsTitle: 'nombre', defaultColumns: ['nombre', 'orden'], group: 'Estructura' },
  access: {
    read: lecturaSimple,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  defaultSort: 'orden',
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre del segmento' },
    { name: 'orden', type: 'number', defaultValue: 0, label: 'Orden de aparición' },
    {
      // Reservado, y conviene que se sepa. La descripción anterior decía
      // «Recuadro sensible del mapa. Se ajusta visualmente y se guarda aquí», y
      // las dos mitades eran falsas: no hay mapa que reaccione —ningún archivo
      // de `src/` lee `zonaMapa` fuera de este y del esquema del panel— y no se
      // ajusta visualmente, son cuatro casillas de números. Adivinar
      // coordenadas para los veintitantos segmentos sin una silueta delante es
      // trabajo que hoy no se ve en ninguna página.
      //
      // Las cuatro columnas se quedan: existen desde la migración inicial y
      // soltarlas cuesta otra migración. Cuando el mapa se dibuje, esto ya está.
      name: 'zonaMapa',
      type: 'group',
      label: 'Zona en el mapa corporal',
      admin: {
        description:
          'Reservado para el mapa corporal: todavía no se dibuja en ninguna página, así que rellenarlo no cambia nada de lo que ve el residente.',
      },
      fields: [
        { name: 'x', type: 'number', label: 'X' },
        { name: 'y', type: 'number', label: 'Y' },
        { name: 'ancho', type: 'number', label: 'Ancho' },
        { name: 'alto', type: 'number', label: 'Alto' },
      ],
    },
  ],
}

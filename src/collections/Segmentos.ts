import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'

/**
 * Segmentos anatómicos. Ordenan la biblioteca y agrupan las maniobras del
 * examen físico; los define el traumatólogo, no el código.
 *
 * Aquí vivió `zonaMapa` —x, y, ancho y alto—, reservado desde la migración
 * inicial para un mapa corporal sensible que nunca se dibujó. El traumatólogo
 * ha decidido que no se va a dibujar, así que el grupo se retira y la migración
 * `20260913_111605_pose_del_modelo_complicaciones_y_fuera_el_mapa` suelta las
 * cuatro columnas. Lo que el campo costaba mientras tanto no era el espacio:
 * era que el panel pedía cuatro coordenadas por segmento —veintitantos— para
 * una pantalla que no existe, y adivinarlas sin una silueta delante no es
 * trabajo que nadie pueda hacer bien.
 *
 * Si el mapa vuelve algún día, vuelve con su pantalla y con su migración.
 * Declarar el hueco «por si acaso» es exactamente lo que mantuvo cuatro
 * casillas vivas todo este tiempo, y la advertencia de que no servían para nada
 * había que escribirla dos veces —aquí y en el esquema del panel— para que el
 * traumatólogo no las rellenara.
 *
 * Las coordenadas que hubiera guardadas se pierden al aplicar la migración, y
 * no se copian a ninguna parte a propósito: no las leía ningún archivo de
 * `src/` fuera de esta colección y del esquema del panel, de modo que no
 * describen nada que se pueda echar de menos.
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
  ],
}

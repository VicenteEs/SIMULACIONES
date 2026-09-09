import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'
import { MAXIMO_PIEZAS } from '@/atlas/formato'

/**
 * Preparaciones anatómicas hechas sobre el atlas (decisión D-048).
 *
 * Una preparación es lo que el traumatólogo arma en el taller: abre el cuerpo
 * completo, apaga lo que no le interesa y guarda lo que queda —«tibia derecha
 * con su peroné», «rodilla izquierda con ligamentos»—. Después esa preparación
 * se puede insertar en una ficha, en un caso AO o en una cirugía.
 *
 * **No guarda geometría.** Guarda qué piezas del atlas sobreviven. Esa
 * diferencia es la que hace que:
 *
 *  - el atlas original no se pueda estropear, porque ninguna acción de servidor
 *    escribe en él y una preparación no es una copia sino una lista;
 *  - borrar sea reversible: la pieza que se quitó sigue existiendo y se puede
 *    devolver, en vez de tener que rehacer la preparación entera;
 *  - preparar una tibia ocupe cinco identificadores y no treinta megabytes.
 *
 * No lleva borradores a propósito. Los borradores existen para prosa que se
 * escribe a lo largo de días y no debe leerse a medias (D-011); una preparación
 * no es prosa, y `tests/unit/colecciones.test.ts` solo obliga a versionar los
 * cinco módulos.
 */
export const InstanciasAtlas: CollectionConfig = {
  slug: 'instancias-atlas',
  labels: { singular: 'Preparación anatómica', plural: 'Preparaciones anatómicas' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'segmento', 'numeroDePiezas', 'updatedAt'],
    group: 'Estructura',
    description: 'Recortes del atlas listos para insertar en una ficha.',
  },
  access: {
    read: lecturaSimple,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data

        // PostgreSQL no mira dentro de una columna json: lo que se escriba mal
        // entra sin protestar y el visor se encuentra basura al abrir. Esta es
        // la única barrera, así que comprueba de verdad.
        const contenido = data.contenido as { piezas?: unknown } | undefined
        const piezas = contenido?.piezas

        if (!Array.isArray(piezas) || piezas.length === 0) {
          throw new Error(
            'La preparación no tiene ninguna pieza. Encienda al menos una antes de guardar.',
          )
        }
        if (piezas.length > MAXIMO_PIEZAS) {
          throw new Error(
            `Una preparación no puede tener más de ${MAXIMO_PIEZAS} piezas; llegaron ${piezas.length}.`,
          )
        }

        // Se recalcula siempre en el servidor: es un dato derivado y dejar que
        // lo mande el formulario permitiría que el listado mintiera.
        data.numeroDePiezas = piezas.length
        return data
      },
    ],
  },
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre de la preparación' },
    {
      name: 'descripcion',
      type: 'textarea',
      label: 'Para qué sirve',
      admin: { description: 'Qué muestra y en qué ficha se piensa usar.' },
    },
    {
      name: 'segmento',
      type: 'relationship',
      relationTo: 'segmentos',
      label: 'Segmento anatómico',
      admin: { description: 'Ordena las preparaciones junto al resto del contenido.' },
    },
    {
      name: 'numeroDePiezas',
      type: 'number',
      label: 'Piezas',
      admin: {
        readOnly: true,
        description: 'Lo calcula la plataforma al guardar.',
      },
    },
    {
      // Una columna jsonb. Frente a un arreglo de filas, que pondría hasta
      // 2.234 registros por preparación, esto es un solo valor; y frente a
      // campos sueltos, permite añadir mañana un color o una opacidad por pieza
      // sin tocar el esquema ni escribir una migración.
      name: 'contenido',
      type: 'json',
      required: true,
      label: 'Piezas y encuadre',
      admin: {
        readOnly: true,
        description: 'Lo escribe el taller del atlas. No se edita a mano.',
      },
    },
    {
      name: 'atlasVersion',
      type: 'text',
      label: 'Versión del atlas',
      admin: {
        readOnly: true,
        description:
          'Con qué preparación del atlas se creó. Si el atlas se regenera, sirve para avisar de las piezas que ya no existan.',
      },
    },
  ],
}

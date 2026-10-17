import type { CollectionConfig } from 'payload'
import { lecturaSimple, escrituraDeContenido } from '@/access/payload'

/**
 * Los tipos de una patología: «Trauma», «Ortopedia» y los que el equipo vaya agregando (D-177).
 *
 * Era un `select` con dos opciones fijas, y en PostgreSQL eso es un tipo enumerado: agregar «Oncología
 * ortopédica» pedía editar el código, generar una migración y desplegar. Cristóbal pidió poder agregar
 * tipos nuevos desde la propia ficha, como ya se hacía con huesos, técnicas y fases, así que pasa a ser un
 * catálogo. El filtro de la biblioteca lee de aquí.
 *
 * Es material de apoyo, igual que `segmentos`: lo usa el módulo de patologías pero se agrega desde cualquier
 * ficha que lo pida, y separarlo por permisos de módulo dejaría un editor sin poder escribir el tipo que acaba
 * de necesitar. Lo leen y lo escriben las mismas cuentas que los segmentos.
 */
export const TiposDeFicha: CollectionConfig = {
  slug: 'tipos-de-ficha',
  labels: { singular: 'Tipo de ficha', plural: 'Tipos de ficha' },
  admin: { useAsTitle: 'nombre', defaultColumns: ['nombre', 'orden'], group: 'Estructura' },
  access: {
    read: lecturaSimple,
    create: escrituraDeContenido,
    update: escrituraDeContenido,
    delete: escrituraDeContenido,
  },
  defaultSort: 'orden',
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre del tipo', index: true },
    { name: 'orden', type: 'number', defaultValue: 0, label: 'Orden de aparición' },
  ],
}

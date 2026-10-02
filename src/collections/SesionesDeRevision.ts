import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios } from '@/access/payload'
import { MODULOS_EN_REVISION } from '@/lib/revision'

/**
 * El tiempo que cada revisor pasa con cada ficha en revisión (D-142).
 *
 * Una fila por vez que se abre el editor de una ficha en revisión —una
 * «sesión»—, que el propio editor va sumando cada quince segundos: cuánto
 * estuvo la pestaña a la vista (`segundosAbiertos`), cuánto de eso con alguien
 * delante tocando algo (`segundosActivos`) y con qué sección abierta. Es lo que
 * responde a «¿cuánto tiempo pasó revisándola antes de darla por buena?», y a
 * la segunda pregunta del dueño: el tiempo con la ficha abierta no basta, porque
 * una pestaña olvidada también está abierta.
 *
 * Sesión y no fila por revisor y ficha: la tabla guarda cuándo empezó cada vez,
 * que es lo que deja ver si alguien revisó cuarenta fichas en una tarde.
 *
 * El servidor no se fía de lo que manda el navegador: cada suma se recorta al
 * tiempo que de verdad pasó desde el latido anterior de la sesión **y** de la
 * cuenta (`techoDelLatido`), así que ni dos pestañas ni un identificador
 * inventado por llamada suman más que el reloj. Se escribe solo
 * desde las acciones del panel; por REST, como `revisiones`, solo entra el
 * administrador.
 */
export const SesionesDeRevision: CollectionConfig = {
  slug: 'sesiones-de-revision',
  labels: { singular: 'Sesión de revisión', plural: 'Sesiones de revisión' },
  admin: {
    useAsTitle: 'sesion',
    defaultColumns: ['usuario', 'coleccion', 'documentoId', 'segundosActivos', 'ultimoLatido'],
    group: 'Administración',
  },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
  },
  hooks: {
    beforeChange: [
      // Como en `actividad`: quien la crea es su dueño si no se dice otro. Las
      // acciones del panel lo dicen siempre; esto cubre la escritura por REST.
      ({ req, data, operation }) =>
        operation === 'create' && !data?.usuario ? { ...data, usuario: req.user?.id } : data,
    ],
  },
  fields: [
    {
      // Sin `required`, a diferencia de `actividad`: al borrar la cuenta la base
      // lo deja a nulo (la clave foránea es `ON DELETE SET NULL`) y el tiempo
      // sigue contando para la ficha, que es lo que se revisó. Con `required`
      // la columna sería `NOT NULL` y borrar a un revisor fallaría en la base,
      // que es lo que `bajaDeUsuario.ts` tuvo que arreglar para `actividad`.
      name: 'usuario',
      type: 'relationship',
      relationTo: 'usuarios',
      index: true,
    },
    {
      name: 'coleccion',
      type: 'select',
      required: true,
      index: true,
      options: MODULOS_EN_REVISION.map((slug) => ({ label: slug, value: slug })),
    },
    { name: 'documentoId', type: 'text', required: true, index: true },
    {
      // Lo inventa el editor al abrirse, uno por pestaña; es lo que permite
      // sumar sobre la misma fila sin que el navegador sepa su número.
      name: 'sesion',
      type: 'text',
      required: true,
      unique: true,
    },
    { name: 'inicio', type: 'date' },
    { name: 'ultimoLatido', type: 'date', index: true },
    { name: 'segundosAbiertos', type: 'number', min: 0, defaultValue: 0 },
    { name: 'segundosActivos', type: 'number', min: 0, defaultValue: 0 },
    {
      // `{ [título de la sección]: segundos activos con ella delante }`.
      name: 'porSeccion',
      type: 'json',
    },
    // Cuántas veces se tocó un campo, y cuántas se guardó. No dicen cuánto se
    // cambió —eso lo dice la revisión, contra el original—, sino si hubo manos.
    { name: 'ediciones', type: 'number', min: 0, defaultValue: 0 },
    { name: 'guardados', type: 'number', min: 0, defaultValue: 0 },
  ],
}

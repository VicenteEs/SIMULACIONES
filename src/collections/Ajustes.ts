import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios } from '@/access/payload'
import { TEMAS, TEMA_POR_OMISION } from '@/lib/temas'
import { OPCIONES_DE_MODULO } from './opcionesDeModulo'

/**
 * Ajustes de la plataforma: hoy, qué módulos están en mantención (D-156).
 *
 * Una sola fila. El administrador marca un módulo y los residentes dejan de
 * verlo en todas partes; los editores lo siguen viendo, con la insignia «En
 * mantención», para poder arreglarlo (ver `puedeVerModulo`).
 *
 * Es una colección y no un *global* de Payload porque las colecciones entran en
 * `migraciones.test.ts`, en la matriz de `roles.test.ts` y en el registro de
 * acciones (D-145), y un global no entra en ninguno de los tres: un interruptor
 * que decide qué ve cada residente es justo lo que no debe quedar sin vigilar.
 *
 * Solo el administrador la lee y la escribe. La plataforma la consulta por su
 * cuenta (`leerMantencion`, con `overrideAccess`), de modo que el residente no
 * necesita permiso sobre ella para que se le apliquen sus efectos.
 *
 * No hay gancho que impida una segunda fila: solo el administrador la crea,
 * desde una acción que actualiza la primera, y la lectura toma siempre la más
 * antigua. Bloquearlo habría roto la matriz de roles, que crea y borra filas de
 * prueba de cada colección.
 */
export const Ajustes: CollectionConfig = {
  slug: 'ajustes',
  labels: { singular: 'Ajuste', plural: 'Ajustes' },
  admin: { useAsTitle: 'nombre', defaultColumns: ['nombre', 'updatedAt'], group: 'Administración' },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
  },
  fields: [
    {
      // Para que el registro de acciones tenga con qué titular lo que anota.
      name: 'nombre',
      type: 'text',
      defaultValue: 'Ajustes de la plataforma',
      label: 'Nombre',
    },
    {
      name: 'modulosEnMantencion',
      type: 'select',
      hasMany: true,
      label: 'Módulos en mantención',
      options: OPCIONES_DE_MODULO,
      admin: {
        description:
          'Los residentes los ven como «Próximamente», sin poder abrirlos. Los editores y administradores sí, con la insignia «En mantención».',
      },
    },
    {
      // La paleta de la consola del simulador y del taller (P-014 E7). Va aquí, en la fila única, y no en cada
      // cuenta: la elige el médico en el taller y la tienen que ver los residentes, que al taller no entran.
      // Quien la cambia no es solo el administrador —esta colección es suya—: lo hace la acción del taller, que
      // comprueba a quien la llama y escribe por su cuenta (`guardarElTema`).
      name: 'tema',
      type: 'select',
      defaultValue: TEMA_POR_OMISION,
      label: 'Paleta del simulador y del taller',
      options: TEMAS.map((t) => ({ label: t.etiqueta, value: t.valor })),
      admin: { description: 'Se elige desde el taller anatómico. Vale para toda la plataforma.' },
    },
  ],
}

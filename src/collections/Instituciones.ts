import type { CollectionConfig } from 'payload'
import { administracionCentral } from '@/access/payload'
import {
  MODALIDADES,
  motivoDeSubdominioInvalido,
  normalizarSubdominio,
  vencimientoDelPiloto,
} from '@/lib/instituciones'

/**
 * Las instituciones que usan la plataforma, cada una en su subdominio (D-371).
 *
 * Crear una es crear una fila: el comodín `*.traumahub.cl` en Cloudflare y en el
 * túnel se pone una sola vez, así que el subdominio funciona en cuanto la fila
 * existe. Todo lo que pertenece a una institución lleva su marca
 * (`marcaDeInstitucion.ts`), y lo que no la lleva es de TraumaHub.
 *
 * La administra solo el administrador de TraumaHub. El de cada institución lee
 * su fila por el servidor, para su nombre y su cupo, pero no la toca: el plazo
 * y el cupo son lo que se contrató.
 */
export const Instituciones: CollectionConfig = {
  slug: 'instituciones',
  labels: { singular: 'Institución', plural: 'Instituciones' },
  admin: {
    useAsTitle: 'nombre',
    defaultColumns: ['nombre', 'subdominio', 'modalidad', 'vence', 'cupo'],
    group: 'Administración',
  },
  access: {
    read: administracionCentral,
    create: administracionCentral,
    update: administracionCentral,
    delete: administracionCentral,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (typeof data.subdominio === 'string') data.subdominio = normalizarSubdominio(data.subdominio)
        // Un piloto sin fecha de término vence a los 15 días de empezar
        // (D-371). Se pone aquí y no como valor por omisión del campo, porque
        // depende de otro campo: el inicio que se haya elegido.
        if (data.modalidad !== 'definitiva' && !data.vence && data.inicio) {
          data.vence = vencimientoDelPiloto(new Date(data.inicio as string)).toISOString()
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'nombre', type: 'text', required: true, maxLength: 160, label: 'Nombre' },
    {
      name: 'subdominio',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: 'Subdominio',
      validate: (valor: unknown) => {
        if (typeof valor !== 'string') return 'Falta el subdominio.'
        return motivoDeSubdominioInvalido(valor) ?? true
      },
      admin: { description: 'La dirección será <subdominio>.traumahub.cl.' },
    },
    {
      name: 'modalidad',
      type: 'select',
      required: true,
      defaultValue: 'piloto',
      label: 'Modalidad',
      options: MODALIDADES.map((m) => ({ label: m === 'piloto' ? 'Piloto' : 'Definitiva', value: m })),
    },
    { name: 'inicio', type: 'date', required: true, label: 'Empieza' },
    {
      // Vacío solo en una definitiva sin término. Al pasar la fecha la
      // institución se bloquea: nadie entra y nada se borra (D-371).
      name: 'vence',
      type: 'date',
      index: true,
      label: 'Vence',
    },
    {
      // Cuenta cuentas activas: desactivar una libera su lugar (D-371).
      name: 'cupo',
      type: 'number',
      required: true,
      min: 1,
      label: 'Cupo de cuentas',
      validate: (valor: unknown) =>
        typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 ? true : 'El cupo es un número entero desde 1.',
    },
    {
      name: 'correoDelAdministrador',
      type: 'email',
      required: true,
      label: 'Correo del administrador de la institución',
    },
  ],
}

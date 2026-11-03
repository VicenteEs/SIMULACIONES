import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios } from '@/access/payload'
import {
  ESTADOS_DE_COTIZACION,
  LARGOS_DE_COTIZACION,
  MODULOS_COTIZABLES,
  TRAMOS_DE_RESIDENTES,
} from '@/lib/cotizaciones'

/**
 * Las solicitudes de cotización que llegan desde la portada pública (P-007 E3).
 *
 * Solo el administrador las lee y las cambia: traen el nombre y el correo de
 * alguien de fuera, y quién pide una propuesta es asunto comercial, no del
 * editor. El visitante no escribe aquí por REST —no tiene cuenta—, sino por la
 * acción `pedirCotizacion`, que valida, frena el abuso y crea la fila con
 * `overrideAccess`; la acción es la única puerta de entrada pública, como
 * `solicitarCuenta` lo es de `usuarios`.
 *
 * Lo que escribe quien pide no se toca después: el administrador cambia solo
 * el estado y sus notas. Si corrigiera el correo o el mensaje, la fila dejaría
 * de ser lo que se pidió, y es lo único que hay para contestarle.
 */
export const Cotizaciones: CollectionConfig = {
  slug: 'cotizaciones',
  labels: { singular: 'Cotización', plural: 'Cotizaciones' },
  admin: { useAsTitle: 'institucion', defaultColumns: ['institucion', 'nombre', 'estado', 'createdAt'], group: 'Administración' },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
  },
  defaultSort: '-createdAt',
  fields: [
    { name: 'nombre', type: 'text', required: true, maxLength: LARGOS_DE_COTIZACION.nombre, label: 'Nombre' },
    { name: 'correo', type: 'email', required: true, label: 'Correo' },
    { name: 'institucion', type: 'text', required: true, maxLength: LARGOS_DE_COTIZACION.institucion, label: 'Institución o servicio' },
    { name: 'cargo', type: 'text', maxLength: LARGOS_DE_COTIZACION.cargo, label: 'Cargo' },
    {
      name: 'residentes',
      type: 'select',
      required: true,
      label: 'Residentes a incorporar',
      options: TRAMOS_DE_RESIDENTES.map((tramo) => ({ label: tramo, value: tramo })),
    },
    {
      name: 'modulos',
      type: 'select',
      hasMany: true,
      label: 'Módulos de interés',
      options: MODULOS_COTIZABLES.map((m) => ({ label: m.nombre, value: m.slug })),
    },
    { name: 'mensaje', type: 'textarea', maxLength: LARGOS_DE_COTIZACION.mensaje, label: 'Mensaje' },
    {
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'nueva',
      index: true,
      label: 'Estado',
      options: ESTADOS_DE_COTIZACION.map((e) => ({ label: e.etiqueta, value: e.valor })),
    },
    { name: 'notas', type: 'textarea', maxLength: LARGOS_DE_COTIZACION.notas, label: 'Notas internas' },
  ],
}

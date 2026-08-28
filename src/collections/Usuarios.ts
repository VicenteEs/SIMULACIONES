import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios } from '@/access/payload'

/**
 * Cuentas de la plataforma (decisión D-020).
 *
 * No hay registro abierto: el administrador crea cada cuenta y la activa. Una
 * cuenta desactivada conserva su contraseña pero no ve absolutamente nada, lo
 * que permite dar de baja a alguien sin borrar su historial.
 */
export const Usuarios: CollectionConfig = {
  slug: 'usuarios',
  labels: { singular: 'Usuario', plural: 'Usuarios' },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'nombre', 'rol', 'activo'],
    group: 'Administración',
  },
  auth: {
    // Cinco intentos y diez minutos de bloqueo: frena la fuerza bruta sin
    // castigar a quien simplemente se equivocó de tecla.
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
    tokenExpiration: 8 * 60 * 60,
    cookies: { sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' },
  },
  access: {
    read: administracionDeUsuarios,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
    admin: administracionDeUsuarios,
  },
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre y apellido' },
    {
      name: 'rol',
      type: 'select',
      required: true,
      defaultValue: 'lector',
      label: 'Rol',
      options: [
        { label: 'Administrador', value: 'admin' },
        { label: 'Editor de contenido', value: 'editor' },
        { label: 'Lector', value: 'lector' },
      ],
      admin: {
        description: 'El editor redacta y publica contenido; no crea ni activa cuentas.',
      },
    },
    {
      name: 'activo',
      type: 'checkbox',
      defaultValue: false,
      label: 'Cuenta activa',
      admin: {
        description: 'Mientras esté desmarcada, la cuenta no puede ver nada de la plataforma.',
      },
    },
    { name: 'institucion', type: 'text', label: 'Institución o servicio' },
  ],
}

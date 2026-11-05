import type { CollectionConfig } from 'payload'
import { administracionDeUsuarios, lecturaSimple } from '@/access/payload'

/**
 * Las personas que llevan la plataforma, para la pestaña «Equipo» del inicio y
 * para «Sobre nosotros» de la portada pública.
 *
 * Una fila por colaborador, con su foto, su cargo y una descripción breve. Por
 * la API la lee cualquier cuenta activa y solo la escribe el administrador:
 * quién figura como parte del equipo no es contenido clínico y no se delega en
 * el editor.
 *
 * Desde D-277 lo guardado aquí, además, es público: la portada pinta cada fila
 * detrás de la tarjeta de Chesscore, sin sesión. No por esta regla de lectura,
 * que sigue cerrada, sino porque la plataforma la lee por su cuenta
 * (`src/lib/equipoPublico.ts`) y saca solo nombre, cargo, descripción y foto.
 * Abrir aquí la lectura le daría a cualquiera el listado entero por la API.
 *
 * Es una colección y no un campo de `ajustes` porque el panel propio edita
 * colecciones con su esquema (`src/admin/esquema.ts`) y la matriz de roles las
 * recorre todas; una lista metida dentro de otra fila no tendría ni su listado
 * ni su prueba de permisos.
 *
 * La foto es opcional a propósito: se puede dar de alta a alguien antes de
 * tener su retrato, y la tarjeta pinta sus iniciales mientras tanto.
 */
export const Equipo: CollectionConfig = {
  slug: 'equipo',
  labels: { singular: 'Colaborador', plural: 'Equipo' },
  admin: { useAsTitle: 'nombre', defaultColumns: ['nombre', 'cargo', 'orden'], group: 'Administración' },
  access: {
    read: lecturaSimple,
    create: administracionDeUsuarios,
    update: administracionDeUsuarios,
    delete: administracionDeUsuarios,
  },
  defaultSort: 'orden',
  fields: [
    { name: 'nombre', type: 'text', required: true, label: 'Nombre' },
    { name: 'cargo', type: 'text', required: true, label: 'Cargo' },
    { name: 'descripcion', type: 'textarea', label: 'Descripción breve' },
    { name: 'foto', type: 'upload', relationTo: 'medios', label: 'Foto' },
    { name: 'orden', type: 'number', defaultValue: 0, label: 'Orden de aparición' },
  ],
}

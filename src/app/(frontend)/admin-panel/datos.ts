import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { SLUGS_DE_MODULOS } from '@/collections'
import { MODULOS, NOMBRE_DE_MODULO, rutaPublica } from './modulos'

/**
 * Consultas de sólo lectura que alimentan el panel.
 *
 * Viven aquí, y no en `src/lib`, porque son propias del panel y usan
 * `overrideAccess`: quien llega hasta aquí ya pasó por la guardia de
 * administrador del layout y de cada página, y el panel necesita ver también lo
 * que un lector no vería —borradores, cuentas desactivadas, comentarios ajenos.
 *
 * Todos los conteos toleran el fallo: si una colección no responde se devuelve
 * cero en lugar de tumbar la página entera. Un panel que no abre es justo lo
 * contrario de lo que hace falta cuando algo va mal.
 */

export const clientePayload = (): Promise<Payload> => getPayload({ config })

async function contar(
  payload: Payload,
  coleccion: string,
  where?: Record<string, unknown>,
): Promise<number> {
  try {
    const { totalDocs } = await payload.count({
      collection: coleccion as never,
      ...(where ? { where: where as never } : {}),
      overrideAccess: true,
    })
    return totalDocs
  } catch {
    return 0
  }
}

export interface ConteoDeModulo {
  slug: string
  nombre: string
  ruta: string
  numero: string
  publicados: number
  borradores: number
  total: number
}

export async function conteosPorModulo(payload: Payload): Promise<ConteoDeModulo[]> {
  return Promise.all(
    MODULOS.map(async (m) => {
      const [publicados, borradores] = await Promise.all([
        contar(payload, m.slug, { _status: { equals: 'published' } }),
        contar(payload, m.slug, { _status: { equals: 'draft' } }),
      ])
      return { ...m, publicados, borradores, total: publicados + borradores }
    }),
  )
}

export interface ResumenDeUsuarios {
  total: number
  activos: number
  inactivos: number
  admins: number
  editores: number
  lectores: number
}

export async function resumenDeUsuarios(payload: Payload): Promise<ResumenDeUsuarios> {
  const [total, activos, admins, editores, lectores] = await Promise.all([
    contar(payload, 'usuarios'),
    contar(payload, 'usuarios', { activo: { equals: true } }),
    contar(payload, 'usuarios', { rol: { equals: 'admin' } }),
    contar(payload, 'usuarios', { rol: { equals: 'editor' } }),
    contar(payload, 'usuarios', { rol: { equals: 'lector' } }),
  ])
  return { total, activos, inactivos: total - activos, admins, editores, lectores }
}

export interface ResumenDeComentarios {
  total: number
  pendientes: number
  resueltos: number
}

export async function resumenDeComentarios(payload: Payload): Promise<ResumenDeComentarios> {
  const [total, pendientes] = await Promise.all([
    contar(payload, 'comentarios'),
    contar(payload, 'comentarios', { estado: { equals: 'pendiente' } }),
  ])
  return { total, pendientes, resueltos: total - pendientes }
}

export interface ResumenDeActividad {
  registros: number
  completados: number
  ultimos7dias: number
  lectoresActivos7dias: number
}

export async function resumenDeActividad(payload: Payload): Promise<ResumenDeActividad> {
  const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [registros, completados] = await Promise.all([
    contar(payload, 'actividad'),
    contar(payload, 'actividad', { completado: { equals: true } }),
  ])

  let ultimos7dias = 0
  let lectoresActivos7dias = 0
  try {
    const recientes = await payload.find({
      collection: 'actividad',
      where: { ultimaVisita: { greater_than: hace7dias } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    ultimos7dias = recientes.totalDocs
    // Se cuentan personas distintas, no visitas: diez fichas abiertas por una
    // sola persona no son diez residentes usando la plataforma.
    lectoresActivos7dias = new Set(
      recientes.docs.map((d) => String((d as { usuario?: unknown }).usuario)),
    ).size
  } catch {
    /* la actividad es accesoria: si falla, el resto del panel sigue en pie */
  }

  return { registros, completados, ultimos7dias, lectoresActivos7dias }
}

export { SLUGS_DE_MODULOS, MODULOS, NOMBRE_DE_MODULO, rutaPublica }

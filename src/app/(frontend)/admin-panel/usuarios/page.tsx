import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { clientePayload } from '../datos'
import { TablaUsuarios, type UsuarioDelPanel } from './TablaUsuarios'

export const dynamic = 'force-dynamic'

/**
 * Gestión de cuentas.
 *
 * La lista se resuelve en el servidor y llega ya construida, en lugar de que el
 * navegador pida `/api/usuarios` después de pintar: la página aparece con los
 * datos puestos y no hay un instante de tabla vacía en cada visita.
 *
 * Se envía además el identificador de quien mira, porque la interfaz debe
 * desactivar las acciones que uno no puede hacerse a sí mismo. El servidor las
 * rechaza igualmente —esa es la barrera real—, pero un botón que siempre falla
 * es un botón mal puesto.
 */
export default async function PaginaUsuarios() {
  const { sesion } = await exigirPanel('admin')

  const payload = await clientePayload()
  const { docs } = await payload.find({
    collection: 'usuarios',
    limit: 500,
    sort: 'email',
    depth: 0,
    overrideAccess: true,
  })

  const usuarios: UsuarioDelPanel[] = docs.map((d) => {
    const u = d as unknown as Record<string, unknown>
    return {
      id: String(u.id),
      email: String(u.email ?? ''),
      nombre: String(u.nombre ?? ''),
      rol: (u.rol as UsuarioDelPanel['rol']) ?? 'lector',
      activo: u.activo === true,
      institucion: (u.institucion as string) ?? '',
      // La nota del administrador sobre la cuenta. Sin esta línea la tabla la
      // escribe y no la lee: el modal se abre en blanco sobre una nota que sí
      // está guardada, y quien la vea vacía la reescribe encima. Esta es la
      // única función que arma `UsuarioDelPanel`, así que no hay otro sitio
      // donde pueda entrar.
      notas: (u.notas as string) ?? '',
      creado: String(u.createdAt ?? ''),
      ultimoAcceso: (u.ultimoAcceso as string) ?? null,
      modulosVisibles: Array.isArray(u.modulosVisibles) ? (u.modulosVisibles as string[]) : [],
      modulosEditables: Array.isArray(u.modulosEditables) ? (u.modulosEditables as string[]) : [],
    }
  })

  return (
    <TablaUsuarios
      usuarios={usuarios}
      idPropio={String(sesion.usuario.id)}
      hayCorreo={Boolean(process.env.SMTP_HOST)}
    />
  )
}

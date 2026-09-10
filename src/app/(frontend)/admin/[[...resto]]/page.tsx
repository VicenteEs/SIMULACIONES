import { permanentRedirect, redirect } from 'next/navigation'
import { faltaLaPrimeraCuenta } from '@/app/(frontend)/acciones/sesion'

/**
 * La antigua interfaz de Payload ya no existe en esta plataforma.
 *
 * El panel es propio (`/admin-panel`) y las pantallas de sesion tambien
 * (`/entrar`, `/clave`), de modo que la interfaz de Payload se retiro por
 * completo: no se compila, no se descarga y no hay dos administraciones que
 * puedan mostrar cosas distintas sobre los mismos datos.
 *
 * Esta ruta se conserva solo para que los enlaces y marcadores antiguos
 * —incluido el `/admin/reset/...` de algun correo ya enviado— lleguen a donde
 * corresponde en lugar de a un 404 sin explicacion.
 */
export default async function AdminAntiguo({
  params,
}: {
  params: Promise<{ resto?: string[] }>
}) {
  const { resto } = await params
  const [seccion] = resto ?? []

  // El caso de una instalacion nueva: quien busca /admin viene a crear la
  // primera cuenta, que antes se creaba justo ahi.
  if (await faltaLaPrimeraCuenta()) redirect('/instalar')

  // Aqui hubo una rama mas, para los enlaces de restablecimiento antiguos
  // (`/admin/reset/<testigo>`). Ya no puede alcanzarla ninguno: el correo se
  // arma ahora en `src/collections/Usuarios.ts` y apunta a `/clave/<testigo>`,
  // y los testigos caducan en una hora, asi que tampoco queda vivo ninguno de
  // los de antes.
  if (seccion === 'login' || seccion === 'logout') permanentRedirect('/entrar')

  permanentRedirect('/admin-panel')
}

import { redirect } from 'next/navigation'
import { puedeEditar } from '@/lib/guardias'
import { obtenerSesion } from '@/lib/sesion'

/**
 * Guardia de las páginas del panel.
 *
 * Existe porque la comprobación estaba copiada en las doce páginas y había
 * divergido. Casi todas exigían `rol === 'admin'`, incluidas las cuatro de la
 * sección «Trabajo» que la barra lateral le ofrece al editor: entraba al panel,
 * veía «Contenido», pulsaba y volvía al inicio sin una palabra de explicación.
 * El rol de editor —y con él todo el sistema de permisos por módulo— era
 * inalcanzable desde la interfaz, aunque las acciones de servidor lo aceptaran
 * perfectamente. Algunas copias, además, se habían olvidado de mirar `activo`.
 *
 * Dos niveles, que son los dos que la plataforma distingue:
 *
 *   `editor`  el traumatólogo que redacta: contenido, taller y comentarios.
 *   `admin`   además cuentas, respaldos, sistema y seguimiento.
 *
 * Se mira el **rol real** y nunca el efectivo: un administrador que está viendo
 * la plataforma «como residente» sigue siendo administrador, pero nadie debe
 * poder administrar desde una simulación.
 *
 * Redirige en vez de responder 403 porque quien llega aquí sin permiso casi
 * siempre es alguien que pulsó un enlace viejo, no un atacante; a un atacante
 * lo paran igual las acciones de servidor, que vuelven a comprobarlo todo.
 */
export async function exigirPanel(nivel: 'editor' | 'admin' = 'editor') {
  const sesion = await obtenerSesion()
  const rol = sesion.rolReal

  // En dos pasos y no en una condición sola: así el compilador sabe, de aquí en
  // adelante, que hay usuario, y quien llame puede leerlo sin comprobarlo otra
  // vez ni afirmar a mano que no es nulo.
  if (!sesion.usuario || !sesion.activo) redirect('/')

  const basta = nivel === 'admin' ? rol === 'admin' : rol === 'admin' || rol === 'editor'
  if (!basta) redirect('/')

  return { sesion: { ...sesion, usuario: sesion.usuario }, rol, esAdmin: rol === 'admin' }
}

/**
 * Igual, pero además para una colección concreta.
 *
 * Un editor puede tener asignados solo algunos módulos. Las acciones ya lo
 * comprobaban, pero las páginas no: el módulo ajeno se abría, la ficha se
 * rellenaba y el «no tiene permiso» llegaba al pulsar guardar, con el trabajo
 * ya hecho. Aquí se para en la puerta.
 *
 * Devuelve a «Contenido» y no al inicio: quien llega aquí sí trabaja en el
 * panel, solo que no en este módulo.
 */
export async function exigirPanelPara(coleccion: string) {
  const acceso = await exigirPanel()
  if (!puedeEditar(acceso.sesion.usuario, coleccion)) redirect('/admin-panel/contenido')
  return acceso
}

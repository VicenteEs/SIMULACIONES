import type React from 'react'
import { ruta } from '@/lib/rutas'

/**
 * Un enlace a una sección de la portada que sirve igual desde la portada y
 * desde `/planes`.
 *
 * En la portada va como `<a href="#id">`: el navegador baja sin recargar ni
 * pasar por el enrutador.
 *
 * Desde otra página es una carga entera de la portada, con `ruta()` para el
 * prefijo, y no un `<Link>`. Con `<Link href="/#id">` el enrutador cambiaba de
 * página y la dejaba arriba del todo: «Cotizar este plan» llevaba a la portada
 * y no al formulario, que está nueve mil píxeles más abajo (D-236). La carga
 * entera es la que hace el navegador con el ancla de siempre, y esa baja bien.
 * Se pierde la navegación sin recarga entre dos páginas públicas, que aquí no
 * compra nada.
 */
export function Ancla({
  id,
  enLaPortada,
  ...resto
}: { id: string; enLaPortada: boolean } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return <a href={enLaPortada ? `#${id}` : ruta(`/#${id}`)} {...resto} />
}

import type { Metadata } from 'next'
import { PaginaDePlanes } from '@/components/portada/PaginaDePlanes'
import { leerLaPaginaPublica } from '@/components/portada/datos'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Planes · TraumaHub' }

/**
 * Los planes (P-007 E3), sin sesión como la portada: es lo que lee quien
 * todavía no tiene cuenta y está decidiendo si pedirla (D-236 amplía la lista
 * de D-020). No enseña nada de la plataforma por dentro, solo lo que se
 * escribe en «Medios de la página».
 *
 * Quien ya tiene sesión la ve igual que un visitante: no hay una versión para
 * residentes, y la página no lleva a ningún sitio que su cuenta no tenga ya.
 */
export default async function Planes() {
  return <PaginaDePlanes pagina={await leerLaPaginaPublica()} />
}

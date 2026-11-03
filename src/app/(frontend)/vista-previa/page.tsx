import type { Metadata } from 'next'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { exigirPanel } from '@/app/(frontend)/admin-panel/acceso'
import { PaginaDePlanes } from '@/components/portada/PaginaDePlanes'
import { PortadaPublica } from '@/components/portada/PortadaPublica'
import { leerLaPaginaPublica } from '@/components/portada/datos'
import { PAGINAS_PUBLICAS } from '@/lib/espaciosDeLaPagina'
import { modulosEnMantencion } from '@/lib/modulosEnMantencion'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Vista previa · TraumaHub' }

/**
 * Las páginas públicas tal como las ve un visitante, para el administrador que
 * acaba de cambiar algo en «Medios de la página» (P-007 E3).
 *
 * Hace falta porque quien administra tiene sesión, y con sesión `/` le
 * enseña su inicio y no la portada: sin esta página, comprobar un titular
 * pedía abrir una ventana privada. Pinta con los mismos componentes y los
 * mismos datos que `/` y `/planes`, así que lo que se ve aquí es lo que ve el
 * visitante, no una imitación.
 *
 * Solo el administrador, como la pestaña desde la que se llega: la página no
 * enseña nada secreto, pero el aviso de abajo lleva al panel, y un editor que
 * llegara por un enlace viejo volvería a su inicio sin más (`exigirPanel`).
 */
export default async function VistaPrevia({ searchParams }: { searchParams: Promise<{ pagina?: string | string[] }> }) {
  await exigirPanel('admin')
  const { pagina } = await searchParams
  const cual = PAGINAS_PUBLICAS.find((p) => p.id === pagina) ?? PAGINAS_PUBLICAS[0]
  const [leida, enMantencion] = await Promise.all([leerLaPaginaPublica(), modulosEnMantencion()])

  const aviso = (
    <aside className="p-vista-previa" aria-label="Vista previa">
      <Eye size={16} aria-hidden />
      <span>Vista previa de {cual.nombre.toLowerCase()}: así la ve un visitante.</span>
      <Link href="/admin-panel/medios-pagina">Volver a Medios de la página</Link>
    </aside>
  )

  return cual.id === 'planes' ? (
    <PaginaDePlanes pagina={leida} vistaPrevia={aviso} />
  ) : (
    <PortadaPublica pagina={leida} enMantencion={enMantencion} vistaPrevia={aviso} />
  )
}

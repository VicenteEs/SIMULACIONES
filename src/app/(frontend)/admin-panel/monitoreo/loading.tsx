import { Cargando, EsqueletoCabecera, EsqueletoTarjetas } from '@/components/ui/Esqueleto'

/**
 * Mientras carga el monitoreo: tres bloques, uno por parte. La espera puede ser
 * larga la primera vez —Umami y Cloudflare se consultan en el momento—, y sin
 * esto la pestaña anterior se queda en pantalla como si el clic no hubiera
 * hecho nada.
 */
export default function CargandoMonitoreo() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTarjetas n={3} />
    </Cargando>
  )
}

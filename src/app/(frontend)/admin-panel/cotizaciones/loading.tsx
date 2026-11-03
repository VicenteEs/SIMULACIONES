import { Cargando, EsqueletoCabecera, EsqueletoTabla } from '@/components/ui/Esqueleto'

/** Mientras carga la lista de cotizaciones. */
export default function CargandoCotizaciones() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTabla filas={6} />
    </Cargando>
  )
}

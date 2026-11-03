import { Cargando, EsqueletoCabecera, EsqueletoTarjetas } from '@/components/ui/Esqueleto'

/** Mientras carga una cotización: la cabecera y sus dos tarjetas. */
export default function CargandoCotizacion() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTarjetas n={2} />
    </Cargando>
  )
}

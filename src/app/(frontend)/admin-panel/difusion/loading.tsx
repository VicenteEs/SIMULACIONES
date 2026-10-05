import { Cargando, EsqueletoCabecera, EsqueletoTabla, EsqueletoTarjetas } from '@/components/ui/Esqueleto'

/**
 * Mientras carga la difusión: el formulario de envío y el historial.
 */
export default function CargandoDifusion() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTarjetas n={2} />
      <EsqueletoTabla filas={8} />
    </Cargando>
  )
}

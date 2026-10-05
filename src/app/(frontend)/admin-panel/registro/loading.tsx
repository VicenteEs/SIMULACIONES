import { Cargando, EsqueletoCabecera, EsqueletoTabla, EsqueletoTarjetas } from '@/components/ui/Esqueleto'

/**
 * Mientras carga el registro de acciones.
 */
export default function CargandoRegistro() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTarjetas n={3} />
      <EsqueletoTabla filas={8} />
    </Cargando>
  )
}

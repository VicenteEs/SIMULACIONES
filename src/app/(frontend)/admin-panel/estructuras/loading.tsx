import { Cargando, EsqueletoCabecera, EsqueletoTabla } from '@/components/ui/Esqueleto'

/**
 * Mientras se arma el listado de estructuras.
 */
export default function CargandoEstructuras() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTabla filas={8} />
    </Cargando>
  )
}

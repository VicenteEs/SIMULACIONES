import { Cargando, EsqueletoCabecera, EsqueletoTabla } from '@/components/ui/Esqueleto'

/**
 * Mientras carga «Por revisar»: cabecera y una lista, que es la forma de lo que viene.
 */
export default function CargandoPorRevisar() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTabla filas={8} />
    </Cargando>
  )
}

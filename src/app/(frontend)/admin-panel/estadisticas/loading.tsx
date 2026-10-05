import { Cargando, EsqueletoCabecera, EsqueletoTarjetas } from '@/components/ui/Esqueleto'

/**
 * Mientras cargan las estadísticas: cuatro bloques de gráficos.
 */
export default function CargandoEstadisticas() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTarjetas n={4} />
    </Cargando>
  )
}

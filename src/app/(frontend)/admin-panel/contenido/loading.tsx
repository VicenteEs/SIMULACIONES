import { Cargando, EsqueletoCabecera, EsqueletoTarjetas } from '@/components/ui/Esqueleto'

/**
 * Mientras carga el índice de contenido: cabecera y rejillas de tarjetas de módulo, con la forma de lo que llega para que nada se mueva al aparecer.
 */
export default function CargandoContenido() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTarjetas n={4} />
      <EsqueletoTarjetas n={3} />
    </Cargando>
  )
}

import { Cargando, EsqueletoCabecera, EsqueletoTarjetas } from '@/components/ui/Esqueleto'

/**
 * Mientras carga «Medios de la página»: la cabecera y la rejilla de fotos, que
 * es la vista con que se abre.
 */
export default function CargandoMediosDeLaPagina() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTarjetas n={6} />
    </Cargando>
  )
}

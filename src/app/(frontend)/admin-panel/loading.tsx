import { Cargando, EsqueletoCabecera, EsqueletoTarjetas } from '@/components/ui/Esqueleto'

/**
 * Mientras carga el Resumen: la cabecera y dos rejillas de tarjetas, que es la
 * forma de lo que viene. La página hace seis consultas y es `force-dynamic`;
 * sin esto el clic en «Resumen» dejaba congelada la pantalla anterior sin
 * ninguna señal de que había llegado.
 */
export default function CargandoResumen() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTarjetas n={6} />
      <EsqueletoTarjetas n={3} />
    </Cargando>
  )
}

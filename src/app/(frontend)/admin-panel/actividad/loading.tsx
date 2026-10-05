import { Cargando, EsqueletoCabecera, EsqueletoTabla, EsqueletoTarjetas } from '@/components/ui/Esqueleto'

/**
 * Mientras carga la actividad: indicadores y las tablas por persona.
 */
export default function CargandoActividad() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTarjetas n={3} />
      <EsqueletoTabla filas={8} />
    </Cargando>
  )
}

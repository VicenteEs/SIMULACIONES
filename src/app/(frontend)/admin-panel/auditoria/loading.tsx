import { Cargando, EsqueletoCabecera, EsqueletoTabla, EsqueletoTarjetas } from '@/components/ui/Esqueleto'

/**
 * Mientras carga la auditoría: indicadores y la tabla de fichas, que son lo que más tarda (once columnas y cientos de filas).
 */
export default function CargandoAuditoria() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTarjetas n={6} />
      <EsqueletoTabla filas={8} />
    </Cargando>
  )
}

import { Cargando, EsqueletoCabecera, EsqueletoTarjetas } from '@/components/ui/Esqueleto'

/**
 * Mientras carga el estado del sistema: las comprobaciones (base de datos, correo, disco) son lo más lento del panel.
 */
export default function CargandoSistema() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTarjetas n={6} />
    </Cargando>
  )
}

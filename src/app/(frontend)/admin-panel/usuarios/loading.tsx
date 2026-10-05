import { Cargando, EsqueletoCabecera, EsqueletoTabla } from '@/components/ui/Esqueleto'

/**
 * Mientras carga la lista de cuentas.
 */
export default function CargandoUsuarios() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTabla filas={8} />
    </Cargando>
  )
}

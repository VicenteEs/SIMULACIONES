import { Cargando, EsqueletoCabecera, EsqueletoTabla } from '@/components/ui/Esqueleto'

/**
 * Mientras cargan los comentarios.
 */
export default function CargandoComentarios() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTabla filas={8} />
    </Cargando>
  )
}

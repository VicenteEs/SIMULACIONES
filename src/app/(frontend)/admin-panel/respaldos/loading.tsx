import { Cargando, EsqueletoCabecera, EsqueletoTabla } from '@/components/ui/Esqueleto'

/**
 * Mientras carga la lista de respaldos, que lee la carpeta del disco.
 */
export default function CargandoRespaldos() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTabla filas={4} />
    </Cargando>
  )
}

import { Cargando, EsqueletoCabecera, EsqueletoTabla } from '@/components/ui/Esqueleto'

/**
 * Mientras carga el listado de una colección. La tabla pide sus filas al servidor desde el cliente, así que esto cubre solo la comprobación de acceso; aun así evita la pantalla anterior congelada tras el clic.
 */
export default function CargandoListadoDeColeccion() {
  return (
    <Cargando>
      <EsqueletoCabecera />
      <EsqueletoTabla filas={8} />
    </Cargando>
  )
}

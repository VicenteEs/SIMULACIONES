import { Cargando, EsqueletoCabecera, EsqueletoTabla } from '@/components/ui/Esqueleto'

/**
 * Silueta de carga: sin ella la pantalla anterior se quedaba congelada mientras
 * las consultas de la página (todas `force-dynamic`) terminaban, sin señal de
 * que el clic había llegado.
 */
export default function Loading() {
  return (
    <main>
      <Cargando>
        <EsqueletoCabecera />
        <EsqueletoTabla filas={6} />
      </Cargando>
    </main>
  )
}

/**
 * Siluetas de carga para los `loading.tsx`.
 *
 * Todas las páginas son `force-dynamic` y hacen varias consultas: sin un
 * `loading.tsx` la pantalla anterior se quedaba congelada, sin ninguna señal
 * de que el clic había llegado. Las siluetas imitan la forma de lo que viene
 * —una cabecera, una rejilla de tarjetas, una tabla— para que el salto al
 * contenido no mueva nada de sitio. La animación se apaga con
 * `prefers-reduced-motion` (regla global de `estilos.css`).
 */
export function Linea({ ancho = '100%', alto = 12 }: { ancho?: string; alto?: number }) {
  return <span className="esqueleto" style={{ width: ancho, height: alto }} />
}

export function EsqueletoCabecera() {
  return (
    <div className="esqueleto-cabecera" aria-hidden>
      <Linea ancho="120px" alto={10} />
      <Linea ancho="46%" alto={30} />
      <Linea ancho="62%" alto={14} />
    </div>
  )
}

export function EsqueletoTarjetas({ n = 6 }: { n?: number }) {
  return (
    <div className="esqueleto-rejilla" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="esqueleto-tarjeta">
          <Linea ancho="40%" alto={10} />
          <Linea ancho="85%" alto={16} />
          <Linea ancho="65%" />
        </div>
      ))}
    </div>
  )
}

export function EsqueletoTabla({ filas = 8 }: { filas?: number }) {
  return (
    <div className="esqueleto-tabla" aria-hidden>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="esqueleto-fila">
          <Linea ancho="34%" />
          <Linea ancho="16%" />
          <Linea ancho="12%" />
          <Linea ancho="20%" />
        </div>
      ))}
    </div>
  )
}

/** Lo que dice el lector de pantalla mientras tanto. */
export function Cargando({ children }: { children: React.ReactNode }) {
  return (
    <div className="cargando" role="status" aria-live="polite">
      <span className="sr-only">Cargando…</span>
      {children}
    </div>
  )
}

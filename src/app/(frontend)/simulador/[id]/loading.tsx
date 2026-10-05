import { Cargando, EsqueletoCabecera, Linea } from '@/components/ui/Esqueleto'
import '../consola.css'

/**
 * La silueta de la consola mientras la página pide el caso.
 *
 * La página es `force-dynamic` y hace tres consultas (sesión, el caso con
 * profundidad 2 y la fila de actividad) antes de pintar nada. Sin esto, el
 * clic en un caso de la lista dejaba la lista congelada, sin ninguna señal de
 * que había llegado. La silueta tiene la forma oscura de la consola, con sus
 * tres columnas, para que el salto al caso de verdad no mueva nada de sitio.
 */
export default function CargandoCaso() {
  return (
    <main>
      <Cargando>
        <EsqueletoCabecera />
        <div className="consola consola-esqueleto" aria-hidden>
          <div className="consola-barra">
            <Linea ancho="260px" alto={18} />
            <Linea ancho="96px" alto={36} />
          </div>
          <div className="consola-pasos">
            <Linea ancho="70%" alto={28} />
          </div>
          <div className="consola-izq">
            <Linea ancho="100%" alto={56} />
            <Linea ancho="80%" />
            <Linea ancho="80%" />
          </div>
          <div className="consola-esqueleto-lienzo" />
          <div className="consola-der">
            <Linea ancho="60%" />
            <Linea ancho="100%" alto={48} />
            <Linea ancho="100%" alto={140} />
          </div>
        </div>
      </Cargando>
    </main>
  )
}

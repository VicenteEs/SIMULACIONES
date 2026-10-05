import { Cargando, Linea } from '@/components/ui/Esqueleto'

/**
 * El esqueleto del editor de una ficha: migas y título, la barra de acciones,
 * las pestañas y unos cuantos campos. Imita la forma de lo que viene para que
 * el salto al formulario no mueva nada de sitio; la barra va en el mismo lugar
 * que la fija del editor.
 */
export default function CargandoEditor() {
  return (
    <Cargando>
      <div className="editor-esqueleto" aria-hidden>
        <Linea ancho="180px" alto={11} />
        <Linea ancho="52%" alto={30} />
        <div className="editor-esqueleto-barra">
          <Linea ancho="110px" alto={24} />
          <Linea ancho="160px" alto={14} />
          <span className="editor-esqueleto-hueco" />
          <Linea ancho="130px" alto={36} />
          <Linea ancho="120px" alto={36} />
        </div>
        <div className="editor-esqueleto-pestanas">
          {[70, 90, 80, 100, 85, 75].map((ancho, i) => (
            <Linea key={i} ancho={`${ancho}px`} alto={20} />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="editor-esqueleto-campo">
            <Linea ancho="160px" alto={12} />
            <Linea alto={i === 2 ? 110 : 40} />
          </div>
        ))}
      </div>
    </Cargando>
  )
}

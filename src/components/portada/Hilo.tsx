/**
 * El hilo que baja por el centro de la portada y enlaza las secciones
 * (D-231: «algo que tenga continuidad y no sea de golpe»).
 *
 * Un SVG por sección y no uno para la página entera: en Penpot era una curva
 * de 10 000 px que había que rehacer cada vez que cambiaba la altura de un
 * capítulo. Aquí cada tramo se estira con su sección —`preserveAspectRatio`
 * a `none`— y el trazo no engorda al estirarse porque lleva
 * `vector-effect: non-scaling-stroke`. Se abomba hacia el lado del texto, que
 * es donde está el nodo con el número.
 *
 * Decorativo entero: lo que dice el hilo —el orden— ya lo dicen los números
 * de cada capítulo.
 */
export function Hilo({ forma }: { forma: 'derecha' | 'izquierda' | 'recto' | 'punteado' }) {
  const curva = forma === 'derecha' ? 'M60 0 Q 172 50 60 100' : forma === 'izquierda' ? 'M60 0 Q -52 50 60 100' : 'M60 0 L 60 100'
  return (
    <svg className={`p-hilo p-hilo-${forma}`} viewBox="0 0 120 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={curva} />
    </svg>
  )
}

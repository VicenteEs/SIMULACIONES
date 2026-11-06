/**
 * Qué trozo de hueso agarra un clic en «Mover» o con la pinza de reducción (P-013, pedido 6 de Cristóbal: «a veces al
 * intentar tomar el fragmento de fíbula, pesco el talo y desarmo todo»).
 *
 * D-171 dejó agarrar **cualquier** trozo que el rayo toque primero, a propósito: con una tibia partida en cuatro, el
 * residente quiere empujar el que sea. El precio se vio en el tobillo: el peroné distal es fino, el astrágalo está
 * pegado detrás y al lado, y un clic que cae un pelo fuera del peroné —o lo atraviesa por el borde— agarra el astrágalo
 * y lo saca de su sitio. Mover el astrágalo casi nunca es lo que se quiere, y deshacerlo a ojo es justo lo que desarma.
 *
 * La regla no prohíbe nada: prefiere. Primero, lo que se estaba moviendo (`elegida`) y los trozos del foco —el
 * fragmento que el caso mide y los trozos con su posición reducida—; solo si nada de eso está bajo el cursor o muy cerca
 * de él, lo de siempre, el primer hueso que el rayo toca. Así sigue pudiéndose mover el astrágalo, apuntándole donde no
 * haya peroné.
 *
 * Es pura y sin three: el lienzo le pasa lo que tocaron sus rayos, y aquí se decide.
 */

/** Un hueso que tocó un rayo: la pieza y a cuántos milímetros de la cámara. */
export interface GolpeDeHueso<T> {
  pieza: T
  distanciaMm: number
}

/**
 * Cuánto detrás del primer hueso tocado se busca todavía un trozo del foco, en milímetros. El peroné distal y el
 * astrágalo se tapan a menos de un centímetro; tres centímetros cubren el tobillo de canto sin llegar al maléolo del otro
 * lado, que está a cinco o más y tiraría del trozo equivocado.
 */
export const FONDO_PARA_PREFERIR_MM = 30

/**
 * A cuántos píxeles del cursor se miran los rayos de alrededor. Un clic con el ratón cae a dos o tres píxeles de donde
 * se quería; con el peroné de 12 a 15 píxeles de ancho en una vista entera de la pierna, nueve llegan a su borde desde
 * el astrágalo sin alcanzar la tibia de enfrente.
 */
export const RADIO_ALREDEDOR_PX = 9

/**
 * Lo que se mueve el cursor antes de que el clic se convierta en arrastre (P-013, pedido 6). Sin margen, el temblor de
 * la mano al pulsar ya desplazaba el trozo un milímetro: el clic para elegirlo lo sacaba de donde estaba. Cinco píxeles,
 * uno más que el clic del botón derecho (D-267), porque aquí lo que se pierde es una reducción.
 */
export const MARGEN_PARA_ARRASTRAR_PX = 5

/** ¿El cursor ya salió del margen del clic? */
export function superaElMargen(dx: number, dy: number, margenPx: number = MARGEN_PARA_ARRASTRAR_PX): boolean {
  return Math.hypot(dx, dy) > margenPx
}

/**
 * El trozo que se agarra.
 *
 * - `centro`: lo que tocó el rayo del cursor, de cerca a lejos.
 * - `alrededor`: lo primero que tocó cada uno de los rayos de alrededor (`RADIO_ALREDEDOR_PX`), sin orden.
 * - `elegida`: el trozo que se estaba moviendo, o `null`.
 * - `esDelFoco`: si una pieza es de la fractura.
 *
 * Sin nada bajo el cursor devuelve `null` aunque haya un trozo al lado: un clic en el vacío suelta el trozo elegido, y
 * eso no cambia.
 */
export function trozoQueSeAgarra<T>(
  centro: readonly GolpeDeHueso<T>[],
  alrededor: readonly GolpeDeHueso<T>[],
  { elegida, esDelFoco }: { elegida: T | null; esDelFoco: (pieza: T) => boolean },
): T | null {
  const primero = centro[0]
  if (!primero) return null
  const preferible = (pieza: T) => pieza === elegida || esDelFoco(pieza)
  if (preferible(primero.pieza)) return primero.pieza
  // Detrás del primero, a poca profundidad: el trozo del foco que asoma tras otro hueso.
  const detras = centro.filter((g) => g.distanciaMm - primero.distanciaMm <= FONDO_PARA_PREFERIR_MM)
  const elegidaDetras = elegida === null ? undefined : detras.find((g) => g.pieza === elegida)
  if (elegidaDetras) return elegidaDetras.pieza
  const delFocoDetras = detras.find((g) => esDelFoco(g.pieza))
  if (delFocoDetras) return delFocoDetras.pieza
  // Al lado del cursor: el clic cayó en el astrágalo, a un pelo del peroné. Gana el que tocan más rayos y, empatados, el
  // que se estaba moviendo y después el más cercano.
  const cuenta = new Map<T, { veces: number; distanciaMm: number }>()
  for (const g of alrededor) {
    if (!preferible(g.pieza)) continue
    const previo = cuenta.get(g.pieza)
    cuenta.set(g.pieza, { veces: (previo?.veces ?? 0) + 1, distanciaMm: Math.min(previo?.distanciaMm ?? Infinity, g.distanciaMm) })
  }
  let mejor: { pieza: T; veces: number; distanciaMm: number } | null = null
  for (const [pieza, { veces, distanciaMm }] of cuenta) {
    const gana =
      !mejor ||
      veces > mejor.veces ||
      (veces === mejor.veces && pieza === elegida && mejor.pieza !== elegida) ||
      (veces === mejor.veces && (pieza === elegida) === (mejor.pieza === elegida) && distanciaMm < mejor.distanciaMm)
    if (gana) mejor = { pieza, veces, distanciaMm }
  }
  return mejor ? mejor.pieza : primero.pieza
}

/** Las direcciones de los rayos de alrededor, en píxeles desde el cursor: ocho, a `RADIO_ALREDEDOR_PX`. */
export function desviosAlrededor(radioPx: number = RADIO_ALREDEDOR_PX): readonly [number, number][] {
  return Array.from({ length: 8 }, (_, i) => {
    const angulo = (i * Math.PI) / 4
    return [Math.round(Math.cos(angulo) * radioPx * 100) / 100, Math.round(Math.sin(angulo) * radioPx * 100) / 100] as [number, number]
  })
}

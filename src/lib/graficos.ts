/**
 * La aritmética de los gráficos del panel, sin React (P-007 E1).
 *
 * Los gráficos siguen sin biblioteca, por lo que dice la cabecera de
 * `src/components/admin/Graficos.tsx`: una dependencia de gráficos pesa más
 * que el panel entero y trae su propia paleta. Lo que una biblioteca resolvería
 * —las marcas del eje, los trazos, los arcos de una dona, a qué punto apunta el
 * ratón— vive aquí, separado del dibujo, porque es lo único de un gráfico que
 * se puede equivocar en silencio: un eje que acaba en 97 o una dona cuyos
 * sectores no suman la vuelta se dibujan igual de bonitos que los buenos. La
 * suite corre en Node y sin navegador (`vitest.config.ts`), así que esto es lo
 * que las pruebas alcanzan.
 */

export interface Coordenada {
  x: number
  y: number
}

/**
 * El techo «redondo» del eje y sus marcas: 0, 25, 50, 75, 100 para un máximo de
 * 83, y no 0, 20,75, 41,5… Se busca el paso más pequeño entre 1, 2, 2,5 y 5
 * por potencias de diez que, multiplicado por `cuantas`, cubre el máximo.
 *
 * Con todo en cero devuelve 0…4: un eje que no sube no dice nada, pero un eje
 * de una sola marca descoloca la rejilla y la tarjeta salta de alto.
 */
export function marcasDelEje(maximo: number, cuantas = 4, enteras = false): number[] {
  const tope = Number.isFinite(maximo) && maximo > 0 ? maximo : 0
  const divisiones = Math.max(1, Math.round(cuantas))
  if (tope === 0) return Array.from({ length: divisiones + 1 }, (_, i) => i)
  // Contando cosas, un eje de 0,25 en 0,25 se escribía «0 0 1 1 1» con cero
  // decimales (Auditoría, D-238). Con menos de un entero por división, una
  // marca por unidad hasta el tope.
  if (enteras && tope <= divisiones) return Array.from({ length: Math.ceil(tope) + 1 }, (_, i) => i)

  const bruto = tope / divisiones
  const magnitud = 10 ** Math.floor(Math.log10(bruto))
  const paso =
    [1, 2, 2.5, 5, 10]
      .map((m) => m * magnitud)
      .filter((p) => !enteras || Number.isInteger(p))
      .find((p) => p * divisiones >= tope) ?? 10 * magnitud
  // `toFixed` y vuelta a número: 0,1 × 3 no da 0,3 en coma flotante, y una
  // marca «0.30000000000000004» se escribe tal cual en el eje.
  return Array.from({ length: divisiones + 1 }, (_, i) => Number((paso * i).toFixed(10)))
}

/** Una escala lineal de `dominio` a `rango`; un dominio de ancho cero cae al centro. */
export function escalaLineal(
  [d0, d1]: readonly [number, number],
  [r0, r1]: readonly [number, number],
): (valor: number) => number {
  const ancho = d1 - d0
  if (ancho === 0) return () => (r0 + r1) / 2
  return (valor) => r0 + ((valor - d0) / ancho) * (r1 - r0)
}

/** La posición horizontal de cada punto de una serie de `n`, repartidos de borde a borde. */
export function posicionesX(n: number, desde: number, hasta: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [(desde + hasta) / 2]
  return Array.from({ length: n }, (_, i) => desde + (i * (hasta - desde)) / (n - 1))
}

const redondo = (v: number) => Math.round(v * 100) / 100

/** El trazo de una línea por los puntos, en el formato de `<path d>`. */
export function trazoDeLinea(puntos: Coordenada[]): string {
  return puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${redondo(p.x)} ${redondo(p.y)}`).join(' ')
}

/**
 * El área bajo la línea hasta `base`: la misma línea, bajada por los dos
 * extremos y cerrada. Sin puntos no hay área, y se devuelve vacío para que el
 * `<path>` no pinte nada en lugar de un triángulo suelto.
 */
export function trazoDeArea(puntos: Coordenada[], base: number): string {
  if (puntos.length === 0) return ''
  const primero = puntos[0]
  const ultimo = puntos[puntos.length - 1]
  return `${trazoDeLinea(puntos)} L${redondo(ultimo.x)} ${redondo(base)} L${redondo(primero.x)} ${redondo(base)} Z`
}

/** El índice del punto cuya `x` queda más cerca de `x`: a dónde apunta el ratón. */
export function indiceMasCercano(xs: number[], x: number): number {
  if (xs.length === 0) return -1
  let mejor = 0
  for (let i = 1; i < xs.length; i++) {
    if (Math.abs(xs[i] - x) < Math.abs(xs[mejor] - x)) mejor = i
  }
  return mejor
}

export interface Sector {
  /** El `d` del `<path>`. Vacío para un valor cero, que no ocupa arco. */
  d: string
  /** La fracción del total, de 0 a 1. */
  fraccion: number
}

function puntoDelCirculo(cx: number, cy: number, radio: number, angulo: number): Coordenada {
  // El ángulo cero arriba y en el sentido del reloj, como se lee una dona.
  return { x: cx + radio * Math.sin(angulo), y: cy - radio * Math.cos(angulo) }
}

/**
 * Los sectores de una dona, de radio interior `interior` a exterior `exterior`.
 *
 * Un sector que es la vuelta entera no se puede escribir con un solo arco (el
 * principio y el final coinciden y el navegador no dibuja nada), así que va
 * partido en dos medias vueltas. Los valores negativos cuentan como cero.
 */
export function sectoresDeDona(
  valores: number[],
  { cx, cy, exterior, interior }: { cx: number; cy: number; exterior: number; interior: number },
): Sector[] {
  const limpios = valores.map((v) => (Number.isFinite(v) && v > 0 ? v : 0))
  const total = limpios.reduce((t, v) => t + v, 0)
  if (total === 0) return limpios.map(() => ({ d: '', fraccion: 0 }))

  let angulo = 0
  return limpios.map((valor) => {
    const fraccion = valor / total
    if (fraccion === 0) return { d: '', fraccion }
    const desde = angulo
    const hasta = angulo + fraccion * 2 * Math.PI
    angulo = hasta

    const arco = (a0: number, a1: number) => {
      const grande = a1 - a0 > Math.PI ? 1 : 0
      const e0 = puntoDelCirculo(cx, cy, exterior, a0)
      const e1 = puntoDelCirculo(cx, cy, exterior, a1)
      const i1 = puntoDelCirculo(cx, cy, interior, a1)
      const i0 = puntoDelCirculo(cx, cy, interior, a0)
      return (
        `M${redondo(e0.x)} ${redondo(e0.y)} ` +
        `A${exterior} ${exterior} 0 ${grande} 1 ${redondo(e1.x)} ${redondo(e1.y)} ` +
        `L${redondo(i1.x)} ${redondo(i1.y)} ` +
        `A${interior} ${interior} 0 ${grande} 0 ${redondo(i0.x)} ${redondo(i0.y)} Z`
      )
    }

    if (fraccion >= 0.9999) {
      const medio = desde + Math.PI
      return { d: `${arco(desde, medio)} ${arco(medio, hasta)}`, fraccion }
    }
    return { d: arco(desde, hasta), fraccion }
  })
}

/**
 * En qué escalón de color cae una celda del mapa de calor: 0 si está vacía y
 * de 1 a `escalones` según su valor contra el máximo.
 *
 * Por escalones y no por una opacidad continua: cinco tonos se distinguen a
 * simple vista y se pueden explicar en la leyenda («menos · más»); cincuenta
 * matices no, y dos celdas casi iguales parecían distintas.
 */
export function escalonDeIntensidad(valor: number, maximo: number, escalones = 4): number {
  if (!(valor > 0) || !(maximo > 0)) return 0
  return Math.min(escalones, Math.max(1, Math.ceil((valor / maximo) * escalones)))
}

/**
 * Un número para leer, con el punto de miles de aquí: 1.284 y no 1284.
 *
 * `toLocaleString` depende del ICU del proceso, y un Node compilado sin datos
 * de idioma escribe «1,284» sin avisar; por eso se arma a mano.
 */
export function cifra(valor: number, decimales = 0): string {
  if (!Number.isFinite(valor)) return '—'
  const signo = valor < 0 ? '-' : ''
  const [entera, fraccion] = Math.abs(valor).toFixed(decimales).split('.')
  const conMiles = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${signo}${conMiles}${fraccion ? `,${fraccion}` : ''}`
}

/**
 * La variación de una cifra respecto de la anterior, para la flecha de las
 * tarjetas. `null` cuando no hay con qué comparar: sin periodo anterior, o con
 * el anterior en cero, una «subida del ∞ %» no le sirve a nadie.
 */
export function variacion(actual: number, anterior: number | null | undefined): number | null {
  if (anterior === null || anterior === undefined || !Number.isFinite(anterior) || anterior === 0) return null
  if (!Number.isFinite(actual)) return null
  return Math.round(((actual - anterior) / anterior) * 100)
}

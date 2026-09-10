/**
 * Las medidas de la reducción.
 *
 * El traumatólogo exporta el hueso **reducido**, en su sitio anatómico, y
 * declara en el caso cuánto está desplazado al empezar. De ahí sale todo lo
 * demás: la posición correcta es siempre el cero, y lo que la consola mide es
 * cuánto falta para llegar. Sin ese convenio habría que exportar dos estados
 * del modelo y hacerlos coincidir a mano, que es trabajo del médico para
 * resolver un problema del código.
 *
 * Las tres cifras que ve el residente no son sinónimos, y por eso se calculan
 * por separado:
 *
 *   desplazamiento  cuánto se ha ido el fragmento **de lado**, perpendicular al
 *                   eje del hueso. Es lo que rompe la alineación.
 *   diástasis       cuánto se ha separado **a lo largo** del eje. Es el hueco
 *                   entre los dos trozos, y consolida distinto.
 *   angulación      cuánto ha girado, en grados, por el camino más corto.
 *
 * Está aquí y no en el componente porque es aritmética que puede estar mal sin
 * que se note: un eje confundido da números creíbles y enseña a reducir al
 * revés. Aquí se prueba sin navegador.
 */

export type EjeLargo = 'x' | 'y' | 'z'

export interface Desplazamiento {
  x?: number | null
  y?: number | null
  z?: number | null
  giroX?: number | null
  giroY?: number | null
  giroZ?: number | null
}

export interface Medidas {
  /** Milímetros perpendiculares al eje del hueso. */
  desplazamiento: number
  /**
   * De qué lado viene ese desplazamiento, eje por eje.
   *
   * El número combinado dice cuánto falta pero no hacia dónde, y desde una sola
   * vista el residente no puede saber si lo que le queda está en el plano que
   * ve o en el que no. Con el desglose delante sabe cuándo tiene que girar la
   * cámara, que es exactamente lo que se hace en el pabellón al pedir la otra
   * proyección.
   */
  lateral: Array<{ eje: EjeLargo; mm: number }>
  /** Milímetros a lo largo del eje: el hueco entre fragmentos. */
  diastasis: number
  /** Grados del giro residual, por el camino más corto. */
  angulacion: number
}

const numero = (v: number | null | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const redondear1 = (n: number) => Math.round(n * 10) / 10

/** El desplazamiento del caso, con los huecos rellenos y en milímetros. */
export function desplazamientoCompleto(d: Desplazamiento | null | undefined): Required<{
  [K in keyof Desplazamiento]: number
}> {
  return {
    x: numero(d?.x),
    y: numero(d?.y),
    z: numero(d?.z),
    giroX: numero(d?.giroX),
    giroY: numero(d?.giroY),
    giroZ: numero(d?.giroZ),
  }
}

/**
 * ¿Está el fragmento en su sitio?
 *
 * `posicionMm` es lo que le falta al fragmento para volver al cero, ya en
 * milímetros. `girosGrados` es su rotación residual en grados por cada eje.
 */
export function medirReduccion(
  posicionMm: { x: number; y: number; z: number },
  girosGrados: { x: number; y: number; z: number },
  ejeLargo: EjeLargo = 'y',
): Medidas {
  // A lo largo del eje del hueso: la diástasis. En los otros dos: el
  // desplazamiento lateral, que se combina con Pitágoras porque irse 3 mm hacia
  // delante y 4 hacia el lado es irse 5, no 7.
  const alLargo = posicionMm[ejeLargo]
  const laterales = (['x', 'y', 'z'] as const)
    .filter((eje) => eje !== ejeLargo)
    .map((eje) => ({ eje, mm: posicionMm[eje] }))

  const desplazamiento = Math.hypot(...laterales.map((l) => l.mm))
  const diastasis = Math.abs(alLargo)

  return {
    desplazamiento: redondear1(desplazamiento),
    lateral: laterales.map(({ eje, mm }) => ({ eje, mm: redondear1(Math.abs(mm)) })),
    diastasis: redondear1(diastasis),
    angulacion: redondear1(anguloTotal(girosGrados)),
  }
}

/**
 * El giro residual, en grados, como un solo número.
 *
 * No es la suma de los tres ángulos: girar 90° en X y 90° en Y no son 180° de
 * desalineación. Se compone la rotación y se mide el ángulo del giro
 * equivalente, que es el camino más corto entre las dos orientaciones. Se hace
 * con cuaterniones y sin depender de three.js, para poder probarlo aquí.
 */
export function anguloTotal(giros: { x: number; y: number; z: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const [cx, sx] = [Math.cos(rad(giros.x) / 2), Math.sin(rad(giros.x) / 2)]
  const [cy, sy] = [Math.cos(rad(giros.y) / 2), Math.sin(rad(giros.y) / 2)]
  const [cz, sz] = [Math.cos(rad(giros.z) / 2), Math.sin(rad(giros.z) / 2)]

  // Cuaternión de la composición XYZ, la misma convención que usa el visor.
  const w = cx * cy * cz - sx * sy * sz

  // El ángulo del giro equivalente. Se acota por si la aritmética se pasa de 1.
  const coseno = Math.min(1, Math.max(-1, Math.abs(w)))
  return (2 * Math.acos(coseno) * 180) / Math.PI
}

/**
 * Longitud de un trazo dibujado sobre la superficie, en milímetros.
 *
 * El trazo son los puntos por los que pasó el cursor sobre el modelo. Su
 * longitud es la suma de los tramos, no la distancia entre el primero y el
 * último: una incisión curva es más larga que la línea recta que la cierra, y
 * es la curva la que hay que suturar después.
 */
export function largoDelTrazo(
  puntos: Array<{ x: number; y: number; z: number }>,
  milimetrosPorUnidad = 1000,
): number {
  let total = 0
  for (let i = 1; i < puntos.length; i++) {
    const a = puntos[i - 1]
    const b = puntos[i]
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
  }
  return redondear1(total * milimetrosPorUnidad)
}

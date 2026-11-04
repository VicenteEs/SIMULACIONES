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
  /**
   * El desplazamiento en % del ancho del hueso en esa dirección (Q-010, D-258). Lo pone la consola, que es la que puede
   * pedirle al lienzo que mida el hueso; `medirReduccion` no lo sabe y lo deja sin poner.
   */
  porcentaje?: number | null
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
 * Un desplazamiento en % del ancho del hueso (Q-010, D-258): «12 mm» no dice lo mismo en un radio que en un fémur, y
 * en la radiografía se lee así, con el 100 % como el sitio en que las corticales dejan de tocarse. Entero y sin
 * signo, porque el lado ya lo dicen las palabras. `null` sin un ancho con el que medir.
 */
export function porcentajeDelDiametro(desplazamientoMm: number, anchoMm: number | null | undefined): number | null {
  if (typeof anchoMm !== 'number' || !(anchoMm > 0) || !Number.isFinite(desplazamientoMm)) return null
  return Math.round((100 * Math.abs(desplazamientoMm)) / anchoMm)
}

/**
 * Las secciones de un hueso de través a su eje: los puntos donde sus triángulos cortan `cuantas` planos repartidos de
 * `desde` a `hasta`, en las unidades de `posiciones`. Cada sección es una lista plana de x, y, z.
 *
 * Es de donde sale el diámetro con que el simulador escribe el % del desplazamiento (`anchoDeLasSecciones`). Se mide
 * cerca del foco y no con la caja del hueso entero porque el hueso no es un cilindro: la caja de una tibia la da la
 * meseta, que es el doble de ancha que la diáfisis donde está la fractura, y el % salía a la mitad.
 *
 * Antes se miraban los vértices que caían en una rebanada de 5 a 20 mm, y en la tibia de P-009 dio 89 % donde había
 * 54. Por dos razones que se suman. La malla de un hueso recortado es pobre a lo largo de la diáfisis —la de esa
 * tibia tiene 253 vértices, dos o tres cada 20 mm—, y en la rebanada solo caían los del trazo. Y el trazo oblicuo deja
 * el extremo en cuña: junto a él la sección es parcial y más estrecha. Cortando los triángulos no hacen falta vértices
 * en el sitio, y con varias secciones alguna cae pasada la cuña.
 *
 * `indices` es el índice de la geometría; sin él, cada tres vértices seguidos son un triángulo.
 */
export function seccionesDelHueso(
  posiciones: ArrayLike<number>,
  indices: ArrayLike<number> | null,
  eje: EjeLargo,
  desde: number,
  hasta: number,
  cuantas = 7,
): number[][] {
  const i = eje === 'x' ? 0 : eje === 'z' ? 2 : 1
  const niveles = Array.from({ length: cuantas }, (_, k) => desde + ((hasta - desde) * k) / Math.max(1, cuantas - 1))
  const secciones: number[][] = niveles.map(() => [])
  const triangulos = Math.floor((indices ? indices.length : posiciones.length / 3) / 3)
  const vertice = (t: number, k: number) => (indices ? indices[3 * t + k] : 3 * t + k)
  for (let t = 0; t < triangulos; t++) {
    for (let k = 0; k < 3; k++) {
      const p = 3 * vertice(t, k)
      const q = 3 * vertice(t, (k + 1) % 3)
      const ap = posiciones[p + i]
      const aq = posiciones[q + i]
      // Una arista de través al eje no corta ningún plano en un punto: lo que tenga en él lo dan las otras dos.
      if (ap === aq || Math.max(ap, aq) < desde || Math.min(ap, aq) > hasta) continue
      for (let n = 0; n < niveles.length; n++) {
        const f = (niveles[n] - ap) / (aq - ap)
        if (f < 0 || f > 1) continue
        secciones[n].push(
          posiciones[p] + f * (posiciones[q] - posiciones[p]),
          posiciones[p + 1] + f * (posiciones[q + 1] - posiciones[p + 1]),
          posiciones[p + 2] + f * (posiciones[q + 2] - posiciones[p + 2]),
        )
      }
    }
  }
  return secciones
}

/**
 * Cuánto ocupa el hueso de través en una dirección: el ancho de la sección más ancha de `seccionesDelHueso`. La más
 * ancha porque las estrechas son las de la cuña del trazo, y por las secciones y no por la rebanada entera porque un
 * hueso un poco ladeado respecto del eje del modelo sumaría su inclinación al ancho. Lo que la dirección tenga a lo
 * largo del eje no cuenta. `null` si la dirección va a lo largo del eje o si ninguna sección cortó el hueso.
 */
export function anchoDeLasSecciones(
  secciones: readonly (readonly number[])[],
  eje: EjeLargo,
  direccion: { x: number; y: number; z: number },
): number | null {
  const i = eje === 'x' ? 0 : eje === 'z' ? 2 : 1
  const d = [direccion.x, direccion.y, direccion.z]
  d[i] = 0
  const largo = Math.hypot(d[0], d[1], d[2])
  if (!(largo > 1e-9)) return null
  let ancho: number | null = null
  for (const s of secciones) {
    if (s.length < 6) continue
    let minimo = Infinity
    let maximo = -Infinity
    for (let n = 0; n + 2 < s.length; n += 3) {
      const t = (s[n] * d[0] + s[n + 1] * d[1] + s[n + 2] * d[2]) / largo
      if (t < minimo) minimo = t
      if (t > maximo) maximo = t
    }
    if (ancho === null || maximo - minimo > ancho) ancho = maximo - minimo
  }
  return ancho
}

/**
 * El desplazamiento de un fragmento respecto de donde estaba al cargar.
 *
 * El caso guarda **cuánto se ha ido** el fragmento, no dónde está. La
 * diferencia solo se nota con un modelo de verdad: si la pieza sale de Blender
 * centrada en el origen, restar su sitio original o no restarlo da el mismo
 * número, y el error se esconde. Con una pierna entera, donde la tibia está
 * donde le toca, escribir la posición absoluta teletransporta el hueso al abrir
 * el caso y no hay ningún mensaje que lo explique.
 *
 * Vive aquí, y no en el visor, porque es aritmética que puede estar mal sin que
 * se note, y aquí se prueba sin navegador.
 */
export function desplazamientoDesde(
  origen: { x: number; y: number; z: number },
  actual: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return { x: actual.x - origen.x, y: actual.y - origen.y, z: actual.z - origen.z }
}

/** El camino de vuelta: dónde hay que poner la pieza para ese desplazamiento. */
export function posicionAbsoluta(
  origen: { x: number; y: number; z: number },
  desplazamiento: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return {
    x: origen.x + desplazamiento.x,
    y: origen.y + desplazamiento.y,
    z: origen.z + desplazamiento.z,
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

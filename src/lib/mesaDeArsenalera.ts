/**
 * Dónde va la mesa de la arsenalera (pedido del dueño): cuatro sitios fijos alrededor de la camilla y uno libre, que se
 * arrastra por el suelo.
 *
 * Es geometría pura y sin three, para probarla con números. Todo va en el **marco del colchón** (`colchon.glb`, ver
 * `public/pabellon/manifiesto.json`), en metros: el origen en el centro de su cara de arriba, X a lo ancho, Y hacia
 * arriba y la cabeza del paciente hacia −Z. La mesa cuelga del colchón en la escena y no del paciente, porque es
 * mobiliario de la sala: cuando al paciente se le da la vuelta, el colchón rueda con la cámara y la mesa con él, y en
 * la pantalla se queda donde estaba.
 *
 * El modelo de la mesa (`mesa-arsenalera.glb`, de `scripts/pabellon/mobiliario.py`) tiene el origen en el suelo, bajo
 * el centro de la bandeja; la bandeja a lo largo de su +X, con el poste en el extremo −X y la bandeja en voladizo hacia
 * +X, como una mesa de Mayo. Lo que sube al regular la altura cuelga de su nodo `elevable`.
 */

export type LugarDeLaMesa = 'derecha' | 'izquierda' | 'pies' | 'encima' | 'libre'
export type DecubitoDeLaMesa = 'supino' | 'prono'

export const LUGARES_DE_LA_MESA: readonly { valor: LugarDeLaMesa; etiqueta: string; ayuda: string }[] = [
  { valor: 'derecha', etiqueta: 'Derecha', ayuda: 'Junto a la camilla, al lado derecho del paciente y a la altura de lo que se opera.' },
  { valor: 'izquierda', etiqueta: 'Izquierda', ayuda: 'Junto a la camilla, al lado izquierdo del paciente y a la altura de lo que se opera.' },
  { valor: 'pies', etiqueta: 'A los pies', ayuda: 'Pasado el extremo de la camilla, de frente a quien opera desde los pies.' },
  {
    valor: 'encima',
    etiqueta: 'Sobre el paciente',
    ayuda: 'Como la mesa de Mayo: la base entra bajo la camilla y la bandeja queda sobre el paciente, un poco antes de lo que se opera.',
  },
  { valor: 'libre', etiqueta: 'Libre', ayuda: 'Se arrastra por el suelo a donde se quiera. Pincharla sin arrastrar pide un instrumento, como siempre.' },
]

/** Las medidas de la sala que dan los sitios. Las del colchón son las del manifiesto; lo demás, de un pabellón. */
export const MEDIDAS_DE_LA_SALA = {
  /** Medio ancho del colchón: 84 cm. */
  medioAnchoDelColchon: 0.42,
  /** Medio largo: 196 cm. Los pies, hacia +Z. */
  medioLargoDelColchon: 0.98,
  /** El suelo, bajo la cara de arriba del colchón: una camilla de pabellón a su altura de trabajo. */
  suelo: -0.95,
  /** La cara de arriba de la bandeja, desde el suelo, con la mesa sin subir: tres centímetros sobre el colchón. */
  alturaDeLaBandeja: 0.98,
  /** Del centro de la bandeja al poste, a lo largo de la bandeja. */
  delCentroAlPoste: 0.33,
  /** La bandeja: 60 × 40 cm. */
  medioLargoDeLaBandeja: 0.3,
  medioAnchoDeLaBandeja: 0.2,
  /** Lo que la base sobresale a cada lado de la bandeja, a lo ancho: las patas con sus ruedas. */
  medioAnchoDeLaBase: 0.26,
  /**
   * Cuánto se sube la bandeja para que pase sobre el paciente: el tope del poste del modelo (`mobiliario.py`). Un muslo
   * acostado llega a unos 20 cm sobre el colchón, y con el paño encima, a algo más. Con 30 cm la bandeja pasaba, pero la
   * funda cuelga hasta 25 cm bajo el borde en las esquinas y las dejaba a 10 cm del colchón, dentro del muslo.
   */
  subidaSobreElPaciente: 0.35,
  /** Lo más lejos del centro del colchón que se puede dejar en «Libre»: más allá ya no se vería desde la mesa. */
  alcanceLibre: 2.4,
} as const

/** Dónde queda la mesa, en el marco del colchón. */
export interface ColocacionDeLaMesa {
  /** El punto del suelo bajo el centro de la bandeja. */
  x: number
  z: number
  /** El giro alrededor de la vertical, en radianes, como el `rotation.y` de three: con 0 la bandeja va a lo ancho. */
  giro: number
  /** Cuánto sube lo `elevable` sobre su altura de fábrica, en metros. */
  subida: number
}

export interface DatosDelSitio {
  decubito: DecubitoDeLaMesa
  /**
   * Por dónde se opera, a lo largo del colchón: la Z del centro de lo que se ve del modelo. Los sitios de los lados
   * se ponen a su altura, para que el instrumental quede a mano de lo que se opera y no en la cabecera.
   */
  zDeLaZona: number
  /** El punto del suelo elegido en «Libre». */
  libre?: { x: number; z: number } | null
  /** El giro con que quedó en el último sitio fijo: en «Libre» se arrastra sin girarla. */
  giroAnterior?: number
}

const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * El lado derecho del paciente, en el X del colchón. Boca arriba, el +X del colchón es el +X del cuerpo, que en el atlas
 * es el lado izquierdo (la pierna derecha está en X negativa); boca abajo, el colchón se dio la vuelta y es al revés.
 * Por eso «Derecha» cambia de lado del colchón al darle la vuelta al paciente: sigue siendo su derecha.
 */
export function ladoDerecho(decubito: DecubitoDeLaMesa): 1 | -1 {
  return decubito === 'supino' ? -1 : 1
}

/** Con el giro dado, hacia dónde apunta el +X del modelo (la bandeja desde el poste) en el marco del colchón. */
export function haciaLaBandeja(giro: number): { x: number; z: number } {
  // `rotation.y` de three: el +X gira hacia −Z con un ángulo positivo.
  return { x: Math.cos(giro), z: -Math.sin(giro) }
}

/**
 * La colocación de cada sitio.
 *
 * - **Derecha / Izquierda**: a lo largo de la camilla, a la altura de lo que se opera, con la bandeja paralela al
 *   colchón y el poste hacia la cabeza: el instrumental queda a la mano de quien está de pie a ese lado. Entre el
 *   borde del colchón y la bandeja quedan trece centímetros, lo que ocupa quien opera de lado.
 * - **A los pies**: pasado el extremo de la camilla, con la bandeja a lo ancho.
 * - **Sobre el paciente**: la mesa de Mayo. El poste queda fuera del colchón, por la derecha, y la bandeja vuela sobre
 *   el paciente, subida para pasar sobre él. Va un poco antes de lo que se opera, hacia la cabeza, para no taparlo, y
 *   nunca más allá de la mitad de la camilla: ahí debajo está la columna de la camilla, y la base no entra.
 * - **Libre**: donde se arrastró, con el giro del último sitio. Si la bandeja cae sobre el colchón, sube para pasar
 *   sobre el paciente, como haría la arsenalera.
 */
export function colocarLaMesa(lugar: LugarDeLaMesa, datos: DatosDelSitio): ColocacionDeLaMesa {
  const m = MEDIDAS_DE_LA_SALA
  const derecha = ladoDerecho(datos.decubito)
  // A lo largo de la camilla, sin pasar de sus extremos: la bandeja entera tiene que caber junto al colchón.
  const aLoLargo = limitar(datos.zDeLaZona, -m.medioLargoDelColchon + m.medioLargoDeLaBandeja, m.medioLargoDelColchon - m.medioLargoDeLaBandeja)
  const deLado = m.medioAnchoDelColchon + 0.13 + m.medioAnchoDeLaBandeja
  // El poste hacia la cabeza (−Z): la bandeja apunta a los pies, +Z, que con `rotation.y` es −π/2.
  const aLoLargoDeLaCamilla = -Math.PI / 2
  switch (lugar) {
    case 'derecha':
      return { x: derecha * deLado, z: aLoLargo, giro: aLoLargoDeLaCamilla, subida: 0 }
    case 'izquierda':
      return { x: -derecha * deLado, z: aLoLargo, giro: aLoLargoDeLaCamilla, subida: 0 }
    case 'pies':
      return { x: 0, z: m.medioLargoDelColchon + 0.06 + m.medioAnchoDeLaBase, giro: 0, subida: 0 }
    case 'encima': {
      // La bandeja apunta desde la derecha del paciente hacia su izquierda: el poste, fuera del colchón por la derecha.
      const giro = derecha === -1 ? 0 : Math.PI
      const poste = derecha * (m.medioAnchoDelColchon + 0.05)
      const x = poste - derecha * m.delCentroAlPoste
      const z = limitar(datos.zDeLaZona - 0.45, 0.33, m.medioLargoDelColchon - m.medioAnchoDeLaBase)
      return { x, z, giro, subida: m.subidaSobreElPaciente }
    }
    case 'libre': {
      const punto = datos.libre ?? { x: derecha * deLado, z: aLoLargo }
      const lejos = Math.hypot(punto.x, punto.z)
      const k = lejos > m.alcanceLibre ? m.alcanceLibre / lejos : 1
      const x = punto.x * k
      const z = punto.z * k
      const sobreElColchon = Math.abs(x) < m.medioAnchoDelColchon + 0.05 && Math.abs(z) < m.medioLargoDelColchon + 0.05
      return { x, z, giro: datos.giroAnterior ?? aLoLargoDeLaCamilla, subida: sobreElColchon ? m.subidaSobreElPaciente : 0 }
    }
  }
}

/** Si un valor guardado es un sitio de la mesa. Lo que no lo es —una versión vieja, una mano en la consola— es «Derecha». */
export function lugarDeLaMesa(valor: unknown): LugarDeLaMesa {
  return LUGARES_DE_LA_MESA.some((l) => l.valor === valor) ? (valor as LugarDeLaMesa) : 'derecha'
}

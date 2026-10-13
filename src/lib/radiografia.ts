/**
 * Cómo se ve una radiografía y cómo se ve una fluoroscopia (petición de Cristóbal).
 *
 * Las dos son la misma física —cuánto atraviesa cada tejido— mostrada al revés, y
 * confundirlas es el error que el traumatólogo corrigió:
 *
 * - **Radiografía**: el vacío es negro y lo denso es blanco. Hueso blanco, partes
 *   blandas en grises, pulmón casi negro. No se ven vasos ni nervios: son
 *   tejido blando de la misma densidad que lo que los rodea.
 * - **Fluoroscopia** (el arco en C del pabellón): la pantalla enseña el negativo.
 *   Lo más denso se ve más **negro** —los tornillos, la placa, el hueso— sobre un
 *   fondo gris claro, y siempre dentro de un círculo, que es el intensificador.
 *
 * Antes la vista «Rayos X» de la plataforma era el cuerpo entero al 50 % de
 * opacidad y de color (D-139, D-166): se leía como una pieza anatómica
 * transparente, no como una imagen de rayos. Aquí se declara cuánto absorbe cada
 * cosa, y de eso salen las dos imágenes.
 *
 * Es puro y sin imports: lo leen el taller anatómico (sistemas), el simulador
 * (papeles de la pieza), el panel de la fluoroscopia y las pruebas.
 */

/**
 * Cuánto absorbe cada sistema del atlas, de 0 a 1 (el hueso compacto es 1).
 * `null` es «no se ve»: arterias, venas, nervios y linfáticos son tejido blando
 * de la misma densidad que su entorno, y en una placa simple no se distinguen.
 * Pintarlos era lo que hacía que la vista pareciera una lámina y no una imagen
 * de rayos.
 */
export const DENSIDAD_POR_SISTEMA: Readonly<Record<string, number | null>> = {
  skeletal: 1,
  muscular: 0.3,
  connective: 0.26,
  cardiac: 0.28,
  // El aire de los pulmones deja pasar casi todo: es lo más oscuro del tórax.
  respiratory: 0.06,
  digestive: 0.2,
  urinary: 0.22,
  reproductive: 0.2,
  endocrine: 0.2,
  sensory: 0.2,
  integumentary: 0.14,
  arterial: null,
  venous: null,
  nervous: null,
  lymphatic: null,
}

/** Lo que no se conoce se trata como tejido blando: ni invisible ni hueso. */
export const DENSIDAD_DEL_TEJIDO_BLANDO = 0.28

export const densidadDelSistema = (sistema: string): number | null =>
  Object.prototype.hasOwnProperty.call(DENSIDAD_POR_SISTEMA, sistema)
    ? DENSIDAD_POR_SISTEMA[sistema]
    : DENSIDAD_DEL_TEJIDO_BLANDO

/**
 * Lo mismo para las piezas de un caso del simulador, por el papel que les dio el
 * autor. El metal —implantes e instrumentos— absorbe más que el hueso compacto:
 * por eso un tornillo se ve más blanco que la tibia en una radiografía, y más
 * negro en la fluoroscopia.
 */
export const DENSIDAD_POR_PAPEL: Readonly<Record<string, number>> = {
  hueso: 1,
  fragmento: 1,
  musculo: 0.3,
  piel: 0.14,
  implante: 1.9,
}

export const DENSIDAD_DEL_METAL = 1.9

export const densidadDelPapel = (papel: string | undefined): number =>
  (papel !== undefined && DENSIDAD_POR_PAPEL[papel]) || DENSIDAD_DEL_TEJIDO_BLANDO

/**
 * Cuánta luz suma cada superficie al atravesarla, por el grosor aparente de lo
 * que cruza el rayo.
 *
 * Una malla es una cáscara, y con mezcla aditiva cada cara suma lo mismo sin
 * importar el grosor: un hueso entero sale como una silueta plana. El grosor se
 * aproxima con el borde: un rayo rasante atraviesa más material que uno de frente
 * —por eso en una placa de verdad el hueso se dibuja con la cortical clara y el
 * centro más oscuro—. `rasante` va de 0 (de frente) a 1 (tangente).
 */
export function aporteDeLaSuperficie(densidad: number, rasante: number): number {
  const r = Math.min(1, Math.max(0, rasante))
  return densidad * (0.045 + 0.2 * Math.pow(r, 1.5))
}

export interface OpcionesDeFluoroscopia {
  /** La ganancia: cuánto contraste da la imagen (0,5 a 2). Un arco real la ajusta solo. */
  ganancia?: number
  /** El grano del ruido, de 0 (limpia) a 1. */
  ruido?: number
  /** Un número cualquiera, para que el mismo cuadro dé siempre el mismo ruido. */
  semilla?: number
}

/**
 * Convierte lo que acumuló el dibujo aditivo —blanco donde hay mucha materia— en
 * la imagen de un arco en C: el negativo, dentro de un círculo.
 *
 * Trabaja sobre los píxeles ya leídos (RGBA, de abajo arriba como los entrega
 * WebGL) y los deja listos para `putImageData`. Se hace aquí y no en un
 * sombreador porque es lo que se prueba: que el círculo recorta, que lo denso
 * sale oscuro y que el vacío de fuera es negro son propiedades que se comprueban
 * con números, y un sombreador no tiene pruebas.
 *
 * - Fuera del círculo, negro: el intensificador no ve más allá.
 * - Dentro, fondo gris claro sin materia (215); cuanta más hay, más oscuro.
 * - Un oscurecimiento suave hacia el borde (viñeta) y grano: sin ellos la
 *   imagen se lee como un dibujo y no como una escopia.
 */
export function aFluoroscopia(
  pixeles: Uint8ClampedArray | Uint8Array,
  ancho: number,
  alto: number,
  opciones: OpcionesDeFluoroscopia = {},
): Uint8ClampedArray {
  const ganancia = opciones.ganancia ?? 1
  const ruido = opciones.ruido ?? 0.5
  let estado = ((opciones.semilla ?? 1) * 2654435761) >>> 0
  const azar = () => {
    // Congruencial lineal: no hace falta calidad, hace falta que sea barato y repetible.
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0
    return estado / 4294967296
  }
  const salida = new Uint8ClampedArray(ancho * alto * 4)
  const cx = (ancho - 1) / 2
  const cy = (alto - 1) / 2
  const radio = Math.min(ancho, alto) / 2
  for (let y = 0; y < alto; y++) {
    // WebGL entrega la fila 0 abajo; `ImageData` la espera arriba.
    const origenY = alto - 1 - y
    for (let x = 0; x < ancho; x++) {
      const destino = (y * ancho + x) * 4
      const d = Math.hypot(x - cx, y - cy) / radio
      if (d > 1) {
        salida[destino + 3] = 255
        continue
      }
      const origen = (origenY * ancho + x) * 4
      const materia = Math.min(1, ((pixeles[origen] + pixeles[origen + 1] + pixeles[origen + 2]) / (3 * 255)) * ganancia)
      // El negativo: sin materia, gris claro (215); con mucha, casi negro (20). Lineal a propósito: las partes blandas
      // quedan en gris claro y el hueso, que absorbe tres veces más, en gris oscuro, como en la pantalla del arco.
      const claridad = 1 - materia
      const vineta = 1 - 0.28 * Math.pow(d, 3)
      let valor = (20 + 195 * claridad) * vineta
      if (ruido > 0) valor += (azar() - 0.5) * 14 * ruido
      const v = Math.max(0, Math.min(255, valor))
      salida[destino] = v
      salida[destino + 1] = v
      salida[destino + 2] = Math.min(255, v + 3)
      salida[destino + 3] = 255
    }
  }
  return salida
}

/** Las tres proyecciones que ofrece el arco: de frente, de lado y oblicua. */
export type ProyeccionDeFluoroscopia = 'ap' | 'lateral' | 'oblicua'

export const PROYECCIONES_DE_FLUOROSCOPIA: readonly {
  valor: ProyeccionDeFluoroscopia
  etiqueta: string
  ayuda: string
}[] = [
  { valor: 'ap', etiqueta: 'AP', ayuda: 'Anteroposterior: de frente.' },
  { valor: 'lateral', etiqueta: 'Lateral', ayuda: 'De lado, a 90° de la AP.' },
  { valor: 'oblicua', etiqueta: 'Oblicua', ayuda: 'A medio camino entre la AP y la lateral (45°).' },
]

/** El ángulo, en grados desde la AP hacia la lateral, de cada proyección. */
export const ANGULO_DE_LA_PROYECCION: Readonly<Record<ProyeccionDeFluoroscopia, number>> = {
  ap: 0,
  oblicua: 45,
  lateral: 90,
}

/**
 * Cuántos segundos de escopia son «demasiados».
 *
 * La misma cifra que ya usaba el panel de los rayos X (20 s): en pabellón se
 * dispara en tomas cortas, se mira y se apaga. Está aquí y no en la consola para
 * que la fluoroscopia nueva y el aviso de la dosis lean el mismo número.
 */
export const SEGUNDOS_DE_ESCOPIA_ALTOS = 20

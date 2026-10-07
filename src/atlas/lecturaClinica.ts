/**
 * La lectura clínica de un fragmento, y cómo se escribe (D-160).
 *
 * Está aparte de `manipular.ts` para que el taller pueda mostrarla sin traer
 * three: aquí no hay ni un vector, solo seis números y las palabras con que se
 * dicen. El taller importa de forma estática lo que no pesa, y trae el visor, que
 * sí lo necesita, con `dynamic()`.
 */

/**
 * Lo que un traumatólogo lee de un fragmento distal respecto del proximal. Los
 * desplazamientos en milímetros y los ángulos en grados, con el signo escrito
 * en la propia cifra: lateral y valgo, anterior y recurvatum, rotación externa y
 * diástasis son positivos; medial, varo, posterior, antecurvatum, rotación
 * interna y acortamiento, negativos.
 */
export interface LecturaClinica {
  lateral: number
  anteroposterior: number
  /** Más: los fragmentos se separan (diástasis). Menos: cabalgan (acortamiento). */
  axial: number
  /** Más: el extremo distal se va hacia fuera (valgo). Menos: hacia dentro (varo). */
  valgo: number
  /** Más: el extremo distal se va hacia delante (recurvatum). Menos: hacia atrás (antecurvatum). */
  recurvatum: number
  /** Más: la cara anterior del distal gira hacia fuera (rotación externa). */
  rotacion: number
}

export const LECTURA_NULA: Readonly<LecturaClinica> = {
  lateral: 0,
  anteroposterior: 0,
  axial: 0,
  valgo: 0,
  recurvatum: 0,
  rotacion: 0,
}


/** Una cifra como se lee en español: coma decimal, sin ceros de más. */
export function cifra(n: number): string {
  const abs = Math.abs(n)
  const redondeada = abs >= 10 ? Math.round(abs) : Math.round(abs * 10) / 10
  return String(redondeada).replace('.', ',')
}

/** Por debajo de esto, una cifra no se escribe: es ruido de un arrastre que acaba de empezar. */
const MINIMO_QUE_SE_LEE = 0.5

/**
 * La lectura en una línea, en las palabras de la ficha: «8 mm lateral · 10°
 * varo». Solo lo que pasa de medio milímetro o medio grado. Si no hay nada que
 * leer, `null`: el fragmento está en su sitio.
 */
export function describirLectura(lectura: LecturaClinica): string | null {
  const partes: string[] = []
  const mm = (valor: number, mas: string, menos: string) => {
    if (Math.abs(valor) >= MINIMO_QUE_SE_LEE) partes.push(`${cifra(valor)} mm ${valor > 0 ? mas : menos}`)
  }
  const grados = (valor: number, mas: string, menos: string) => {
    if (Math.abs(valor) >= MINIMO_QUE_SE_LEE) partes.push(`${cifra(valor)}° ${valor > 0 ? mas : menos}`)
  }
  mm(lectura.lateral, 'lateral', 'medial')
  mm(lectura.anteroposterior, 'anterior', 'posterior')
  mm(lectura.axial, 'de diástasis', 'de acortamiento')
  grados(lectura.valgo, 'valgo', 'varo')
  grados(lectura.recurvatum, 'recurvatum', 'antecurvatum')
  grados(lectura.rotacion, 'de rotación externa', 'de rotación interna')
  return partes.length > 0 ? partes.join(' · ') : null
}

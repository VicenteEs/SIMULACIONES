/**
 * Las reglas de la lista de piezas de un caso.
 *
 * Están aquí y no dentro del taller porque son decisiones que pueden estar mal
 * sin que se note. Un caso con dos fragmentos móviles no da ningún error: se
 * abre, se juega, y el residente reduce uno mientras el otro se queda donde
 * estaba. Un desplazamiento convertido con la escala equivocada sale mil veces
 * grande y la consola lo mide contra sí mismo sin quejarse. Ninguna de las dos
 * cosas se ve mirando la pantalla, y las dos se ven mirando una prueba.
 */

export type RolDePieza = 'piel' | 'musculo' | 'hueso' | 'fragmento' | 'implante'

export interface PiezaEnEdicion {
  nodo?: unknown
  rol?: unknown
  etiqueta?: unknown
  [clave: string]: unknown
}

const nodoDe = (p: PiezaEnEdicion): string => (typeof p.nodo === 'string' ? p.nodo : '')

/** Los nombres de objeto ya declarados, sin los vacíos. */
export const nodosDeclarados = (piezas: PiezaEnEdicion[]): string[] =>
  piezas.map(nodoDe).filter(Boolean)

/** ¿Hay ya una pieza marcada como el fragmento que el residente reduce? */
export const hayFragmento = (piezas: PiezaEnEdicion[]): boolean =>
  piezas.some((p) => p.rol === 'fragmento')

/**
 * Añade una pieza señalada en el modelo.
 *
 * Si ya estaba, devuelve la lista igual: pinchar dos veces el mismo hueso es lo
 * más fácil del mundo y duplicar la fila dejaría dos entradas para un objeto,
 * con papeles distintos y sin manera de saber cuál manda.
 *
 * La primera que entra se propone como fragmento, porque es el papel que el
 * caso necesita sí o sí y el único que no se puede deducir del nombre.
 */
export function agregarPieza(piezas: PiezaEnEdicion[], nodo: string): PiezaEnEdicion[] {
  if (!nodo || nodosDeclarados(piezas).includes(nodo)) return piezas
  return [...piezas, { nodo, rol: hayFragmento(piezas) ? 'hueso' : 'fragmento', etiqueta: '' }]
}

/**
 * Cambia el papel de una pieza, manteniendo que haya **un solo** fragmento.
 *
 * Marcar un segundo fragmento desmarca el primero en vez de dejar dos. El visor
 * se queda con el primero que encuentra al recorrer el modelo, que no es el que
 * el autor marcó el último, así que dos fragmentos no son «uno de más»: son un
 * caso que se comporta al revés de como se escribió.
 */
export function cambiarRolDePieza(
  piezas: PiezaEnEdicion[],
  nodo: string,
  rol: RolDePieza,
): PiezaEnEdicion[] {
  return piezas.map((p) => {
    if (nodoDe(p) === nodo) return { ...p, rol }
    if (rol === 'fragmento' && p.rol === 'fragmento') return { ...p, rol: 'hueso' }
    return p
  })
}

/** Quita una pieza de la lista. */
export const quitarPieza = (piezas: PiezaEnEdicion[], nodo: string): PiezaEnEdicion[] =>
  piezas.filter((p) => nodoDe(p) !== nodo)

/**
 * Piezas que la lista nombra y el archivo no trae.
 *
 * Es el error silencioso que el taller existe para matar: una letra distinta
 * entre Blender y el formulario deja una capa que nunca aparece, sin aviso.
 * Con la lista del archivo delante se puede señalar cuáles sobran.
 */
export function piezasHuerfanas(piezas: PiezaEnEdicion[], enElArchivo: string[]): string[] {
  // Con el archivo aún sin cargar no se acusa a nadie: la lista vacía no
  // significa que el modelo no tenga objetos, significa que todavía no se sabe.
  if (enElArchivo.length === 0) return []
  return nodosDeclarados(piezas).filter((n) => !enElArchivo.includes(n))
}

/** Objetos del archivo que el caso todavía no usa. */
export function piezasSinUsar(piezas: PiezaEnEdicion[], enElArchivo: string[]): string[] {
  const ya = nodosDeclarados(piezas)
  return enElArchivo.filter((n) => !ya.includes(n))
}

const redondear1 = (n: number) => Math.round(n * 10) / 10

/**
 * El estado del fragmento en el visor, pasado a lo que guarda el caso.
 *
 * El visor trabaja en las unidades del archivo —glTF viene en metros— y el caso
 * se escribe en milímetros. La conversión usa el mismo número que el autor
 * declaró en el caso, así que con ese número mal puesto los seis valores salen
 * mil veces grandes o mil veces pequeños. Se redondea a un decimal porque
 * nadie reduce una fractura con precisión de micra y porque seis números
 * larguísimos en el formulario no se pueden repasar de un vistazo.
 */
export function desplazamientoEnMilimetros(
  estado: { posicion: { x: number; y: number; z: number }; giros: { x: number; y: number; z: number } },
  milimetrosPorUnidad: number,
): { x: number; y: number; z: number; giroX: number; giroY: number; giroZ: number } {
  const escala = milimetrosPorUnidad || 1000
  return {
    x: redondear1(estado.posicion.x * escala),
    y: redondear1(estado.posicion.y * escala),
    z: redondear1(estado.posicion.z * escala),
    giroX: redondear1(estado.giros.x),
    giroY: redondear1(estado.giros.y),
    giroZ: redondear1(estado.giros.z),
  }
}

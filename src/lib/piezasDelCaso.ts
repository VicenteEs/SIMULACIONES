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
 * Los cinco papeles que acepta el `select` de `rol` en `src/collections/Cirugias.ts`.
 *
 * Una copia, sí, y por eso vigilada: `tests/unit/exportarAlSimulador.test.ts`
 * la compara con las opciones de la colección. Sin esa prueba, un papel nuevo
 * añadido allí haría que el taller descartara en silencio las propuestas que
 * lo usen.
 */
export const ROLES_DE_PIEZA: readonly RolDePieza[] = [
  'piel',
  'musculo',
  'hueso',
  'fragmento',
  'implante',
]

const esRolDePieza = (valor: unknown): valor is RolDePieza =>
  typeof valor === 'string' && (ROLES_DE_PIEZA as readonly string[]).includes(valor)

/**
 * Lo que un objeto del modelo dice de sí mismo: qué papel le toca y cómo se
 * llama en pantalla.
 */
export interface PropuestaDelModelo {
  nodo: string
  rol: RolDePieza
  etiqueta: string
}

/**
 * Lee la propuesta que el exportador del atlas deja pegada a un objeto.
 *
 * Llega por `userData`, que es donde `GLTFLoader` copia los `extras` de glTF
 * (ver `src/lib/glb.ts`). Se exigen las dos cosas —un rol de los cinco y una
 * etiqueta con texto— y si falta cualquiera no hay propuesta. No es rigor por
 * rigor: un modelo que sale de Blender puede traer propiedades personalizadas
 * con esos mismos nombres y cualquier contenido, y un `rol: "Hueso"` con
 * mayúscula convertido en fila dejaría una pieza con un papel que ningún filtro
 * de la consola reconoce. Sin propuesta, el objeto se trata exactamente igual
 * que antes de que existiera esto.
 */
export function propuestaDelNodo(nodo: string, datos: unknown): PropuestaDelModelo | null {
  if (!nodo || !datos || typeof datos !== 'object') return null
  const { rol, etiqueta } = datos as { rol?: unknown; etiqueta?: unknown }
  if (!esRolDePieza(rol)) return null
  if (typeof etiqueta !== 'string' || !etiqueta.trim()) return null
  return { nodo, rol, etiqueta: etiqueta.trim() }
}

/** Las propuestas de un modelo entero, en el orden en que trae los objetos. */
export function propuestasDelModelo(
  nodos: { nodo: string; datos: unknown }[],
): PropuestaDelModelo[] {
  const vistos = new Set<string>()
  const salida: PropuestaDelModelo[] = []
  for (const { nodo, datos } of nodos) {
    const propuesta = propuestaDelNodo(nodo, datos)
    if (!propuesta || vistos.has(nodo)) continue
    vistos.add(nodo)
    salida.push(propuesta)
  }
  return salida
}

/**
 * Añade una pieza señalada en el modelo.
 *
 * Si ya estaba, devuelve la lista igual: pinchar dos veces el mismo hueso es lo
 * más fácil del mundo y duplicar la fila dejaría dos entradas para un objeto,
 * con papeles distintos y sin manera de saber cuál manda.
 *
 * Sin propuesta, la primera que entra se propone como fragmento, porque es el
 * papel que el caso necesita sí o sí y el único que no se puede deducir del
 * nombre.
 *
 * Con propuesta —el objeto viene del atlas y trae su rol dentro— manda la
 * propuesta. Si no, el primer clic sobre «Esqueleto», que en un modelo del
 * atlas es el esqueleto entero fundido en una malla, lo convertiría en el
 * fragmento que el residente arrastra. La regla de un solo fragmento se
 * respeta igual: una propuesta de fragmento con otro ya marcado entra como
 * hueso.
 */
export function agregarPieza(
  piezas: PiezaEnEdicion[],
  nodo: string,
  propuesta?: PropuestaDelModelo | null,
): PiezaEnEdicion[] {
  if (!nodo || nodosDeclarados(piezas).includes(nodo)) return piezas
  if (propuesta) {
    const rol = propuesta.rol === 'fragmento' && hayFragmento(piezas) ? 'hueso' : propuesta.rol
    return [...piezas, { nodo, rol, etiqueta: propuesta.etiqueta }]
  }
  return [...piezas, { nodo, rol: hayFragmento(piezas) ? 'hueso' : 'fragmento', etiqueta: '' }]
}

/**
 * Rellena la lista con lo que el modelo dice de cada objeto.
 *
 * Es el final del puente entre el atlas y la consola: el archivo exportado ya
 * sabe qué es cada objeto, y hacérselo escribir al médico fila a fila —nombre
 * exacto, papel, etiqueta— era pedirle que copiara a mano lo que el archivo
 * trae dentro. La consola apaga todo lo que el caso no declara, así que un
 * objeto que se quede fuera es una capa que no aparece.
 *
 * Tres reglas, y las tres protegen algo que el médico ya decidió:
 *
 *  - Una fila que ya existe **no se toca**: ni su nodo ni su papel. El papel
 *    siempre tiene valor, así que no hay forma de distinguir el que se eligió
 *    del que quedó por omisión, y en la duda gana el médico. Solo se le pone la
 *    etiqueta si la tenía vacía, que es como quedan las filas añadidas con un
 *    clic: una etiqueta en blanco no es algo escrito que se pueda pisar.
 *  - Un solo fragmento, como en `cambiarRolDePieza`: si ya lo hay, o si el
 *    modelo propone más de uno, los demás entran como hueso.
 *  - Los objetos sin propuesta no entran. Un modelo que no viene del atlas no
 *    trae ninguna, y la lista sale idéntica.
 *
 * Devuelve la misma lista, y no una copia, cuando no cambia nada: así quien
 * llama puede decir «no había nada que rellenar» comparando referencias, igual
 * que con `agregarPieza`.
 */
export function rellenarDesdeElModelo(
  piezas: PiezaEnEdicion[],
  propuestas: PropuestaDelModelo[],
): { piezas: PiezaEnEdicion[]; nuevas: number; etiquetadas: number } {
  const porNodo = new Map(propuestas.map((p) => [p.nodo, p]))
  let etiquetadas = 0
  const tocadas = piezas.map((fila) => {
    const propuesta = porNodo.get(nodoDe(fila))
    const vacia = typeof fila.etiqueta !== 'string' || !fila.etiqueta.trim()
    if (!propuesta || !vacia) return fila
    etiquetadas += 1
    return { ...fila, etiqueta: propuesta.etiqueta }
  })

  const ya = new Set(nodosDeclarados(piezas))
  let conFragmento = hayFragmento(piezas)
  const nuevas: PiezaEnEdicion[] = []
  for (const propuesta of propuestas) {
    if (ya.has(propuesta.nodo)) continue
    ya.add(propuesta.nodo)
    let rol = propuesta.rol
    if (rol === 'fragmento') {
      if (conFragmento) rol = 'hueso'
      conFragmento = true
    }
    nuevas.push({ nodo: propuesta.nodo, rol, etiqueta: propuesta.etiqueta })
  }

  if (nuevas.length === 0 && etiquetadas === 0) return { piezas, nuevas: 0, etiquetadas: 0 }
  return { piezas: [...tocadas, ...nuevas], nuevas: nuevas.length, etiquetadas }
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

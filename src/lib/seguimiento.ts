/**
 * Las cuentas de lo que mide el seguimiento del panel, sin tocar la base (D-175).
 *
 * El seguimiento (Estadísticas, Actividad, Resumen) se leía con tres defectos que sumaban el mismo daño —números que
 * parecen exactos y no lo son—, y las tres correcciones son cuentas puras que se prueban aquí, sin Payload:
 *
 * 1. **El equipo y los residentes se contaban juntos.** El administrador que abre una ficha para comprobarla, o que mira
 *    la plataforma «como residente», dejaba una fila de lectura igual que un residente; con cinco cuentas de equipo y
 *    ningún residente, todo el seguimiento era del equipo y nada lo decía. `quienEs` separa las dos cosas por el rol real
 *    de la cuenta, y las pantallas dejan elegir.
 * 2. **«Lecturas por mes» ponía cada ficha en el mes de su última visita.** La tabla `actividad` guarda una fila por
 *    persona y ficha, así que una ficha abierta en septiembre y otra vez en octubre contaba solo en octubre, y
 *    septiembre se vaciaba retroactivamente. El registro de acciones sí guarda cada apertura con su fecha, y de ahí sale
 *    el mes verdadero (`lecturasPorMes`).
 * 3. **Los recuentos se cortaban sin avisar** a las mil o dos mil filas más recientes. Eso se arregla leyendo todo
 *    (`leerTodas`), no aquí.
 */

export type QuienLee = 'todos' | 'residentes' | 'equipo'

export const OPCIONES_DE_QUIEN: { valor: QuienLee; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'residentes', etiqueta: 'Solo residentes' },
  { valor: 'equipo', etiqueta: 'Solo el equipo' },
]

/** El valor de `?quien=`, o `todos` si no es uno de los tres: un enlace viejo o escrito a mano no rompe la página. */
export function quienDeLaConsulta(valor: unknown): QuienLee {
  const v = Array.isArray(valor) ? valor[0] : valor
  return v === 'residentes' || v === 'equipo' ? v : 'todos'
}

/**
 * Si la cuenta es del equipo (administrador o editor) o un residente (lector).
 *
 * Por el **rol real** de la cuenta, el que está en su ficha, y no por el que se simule: el administrador que mira «como
 * residente» sigue siendo equipo. Un rol que no se conoce —una cuenta borrada, un dato que no llegó— cuenta como
 * residente, que es lo que menos distorsiona: lo que sobra en «residentes» se ve en seguida, y lo que sobra en «equipo»
 * escondería actividad de quien más importa.
 */
export function esDelEquipo(rol: unknown): boolean {
  return rol === 'admin' || rol === 'editor'
}

/** ¿Entra una cuenta de este rol en lo que se pidió ver? */
export function entraEnLoPedido(quien: QuienLee, rol: unknown): boolean {
  if (quien === 'todos') return true
  return quien === 'equipo' ? esDelEquipo(rol) : !esDelEquipo(rol)
}

/** El texto con que se nombra lo que se está viendo, para el subtítulo de las pantallas. */
export const QUIEN_EN_PALABRAS: Record<QuienLee, string> = {
  todos: 'todas las cuentas',
  residentes: 'solo los residentes',
  equipo: 'solo el equipo (administradores y editores)',
}

/** «2026-10», en la zona horaria del servidor, o `null` si no es una fecha. */
export function claveDeMes(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return null
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`
}

const idDe = (valor: unknown): string | null => {
  if (typeof valor === 'number' || typeof valor === 'string') return String(valor)
  if (valor && typeof valor === 'object' && 'id' in valor) return idDe((valor as { id: unknown }).id)
  return null
}

const claveDeLectura = (usuario: unknown, coleccion: unknown, documentoId: unknown): string | null => {
  const u = idDe(usuario)
  const d = idDe(documentoId)
  if (u === null || d === null || typeof coleccion !== 'string' || coleccion === '') return null
  return `${u}|${coleccion}|${d}`
}

/**
 * Cuántas fichas distintas abrió cada persona en cada mes, de todas las personas juntas.
 *
 * Sale de las **aperturas** del registro de acciones (`eventos`, las de acción «lectura»), que llevan la fecha de cada
 * una. Una ficha abierta tres veces en el mes cuenta una, y abierta en dos meses cuenta en los dos.
 *
 * Las filas de `actividad` (`filas`) cubren lo de antes de que el registro existiera: una fila cuya última visita cae en un
 * mes donde el registro no tiene ninguna apertura de esa ficha es una lectura anterior al registro, y se cuenta en el mes
 * de esa visita. Con registro, la fila no suma nada que no sume ya su evento.
 *
 * `meses` son las claves de los meses que se piden, de más antiguo a más reciente; lo que cae fuera no se cuenta.
 */
export function lecturasPorMes(
  meses: readonly string[],
  eventos: readonly Record<string, unknown>[],
  filas: readonly Record<string, unknown>[],
): number[] {
  const porMes = new Map<string, Set<string>>(meses.map((m) => [m, new Set<string>()]))
  for (const e of eventos) {
    const mes = claveDeMes(e.fecha)
    const clave = claveDeLectura(e.usuario, e.coleccion, e.documentoId)
    if (mes === null || clave === null) continue
    porMes.get(mes)?.add(clave)
  }
  for (const f of filas) {
    const mes = claveDeMes(f.ultimaVisita)
    const clave = claveDeLectura(f.usuario, f.coleccion, f.documentoId)
    if (mes === null || clave === null) continue
    const delMes = porMes.get(mes)
    if (delMes && !delMes.has(clave)) delMes.add(clave)
  }
  return meses.map((m) => porMes.get(m)?.size ?? 0)
}

/**
 * Las filas de `actividad` de las cuentas que entran en lo pedido.
 *
 * `rolDe` dice el rol de cada cuenta por su identificador; una fila cuya cuenta no está en el mapa —borrada— se trata
 * como de residente (`esDelEquipo`).
 */
export function filasDeQuien<T extends Record<string, unknown>>(
  filas: readonly T[],
  quien: QuienLee,
  rolDe: ReadonlyMap<string, string>,
): T[] {
  if (quien === 'todos') return [...filas]
  return filas.filter((f) => {
    const id = idDe(f.usuario)
    return entraEnLoPedido(quien, id === null ? undefined : rolDe.get(id))
  })
}

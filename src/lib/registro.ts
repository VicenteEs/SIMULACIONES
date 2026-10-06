/**
 * El registro de lo que hace cada cuenta (D-145): vocabulario y cuentas puras.
 *
 * Dos cosas se guardan y se miden aparte, y conviene no mezclarlas:
 *
 * - **Qué hizo y cuándo**: una fila por acto (`registro-de-acciones`). Entró,
 *   salió, creó una ficha, la publicó, cambió el rol de otra cuenta. Se guarda
 *   con una *foto* de quién era en ese momento —nombre, correo, rol y módulos—,
 *   porque el rol de hoy no explica lo que alguien pudo hacer hace un mes, y
 *   porque al borrar la cuenta la fila conserva de quién era.
 * - **Cuánto tiempo estuvo activa**: el navegador manda un latido cada minuto
 *   mientras la pestaña está a la vista y alguien la toca, y el servidor suma lo
 *   que de verdad pasó desde el anterior en una fila por cuenta y día
 *   (`tiempo-activo`). Medir el tiempo con las acciones no servía: un residente
 *   que lee una ficha durante una hora no crea, modifica ni borra nada.
 *
 * Todo lo de aquí es puro —no toca la base ni Next—, para poder probarlo sin
 * ninguna de las dos.
 */

/** Las cosas que se anotan, con la frase con que las lee el administrador. */
export const ACCIONES_DEL_REGISTRO = [
  { value: 'sesion-iniciada', label: 'Inició sesión' },
  { value: 'sesion-cerrada', label: 'Cerró sesión' },
  { value: 'creo', label: 'Creó' },
  { value: 'modifico', label: 'Modificó' },
  { value: 'publico', label: 'Publicó' },
  { value: 'retiro', label: 'Retiró de la publicación' },
  { value: 'elimino', label: 'Eliminó' },
  { value: 'lectura', label: 'Leyó' },
  { value: 'cambio-de-permisos', label: 'Cambió permisos o rol' },
  { value: 'mantencion-de-modulo', label: 'Cambió la mantención de un módulo' },
  { value: 'importacion', label: 'Importó contenido' },
] as const

export type AccionDelRegistro = (typeof ACCIONES_DEL_REGISTRO)[number]['value']

export const accionDelRegistroEnPalabras = (accion: unknown): string =>
  ACCIONES_DEL_REGISTRO.find((a) => a.value === accion)?.label ?? String(accion ?? '—')

/**
 * Las colecciones que no dejan huella en el registro.
 *
 * - el propio registro y el tiempo activo: anotar que se anotó no acaba nunca;
 * - `sesiones-de-revision`: se escribe cada quince segundos con el editor
 *   abierto, y su contenido —el tiempo de revisión— ya tiene su pantalla en
 *   Auditoría;
 * - `revisiones`: las escribe el servidor sin cuenta al lado, y su historial
 *   guarda cada cambio de estado con quién lo hizo.
 */
export const COLECCIONES_SIN_REGISTRO: readonly string[] = [
  'registro-de-acciones',
  'tiempo-activo',
  'sesiones-de-revision',
  'revisiones',
]

// ------------------------------------------------------ foto de la cuenta

/** Lo que se guarda de los permisos de la cuenta en el momento del acto. */
export interface FotoDePermisos {
  rol: string
  activo: boolean
  /** Vacío: todos (ver `permite` en `src/access/reglas.ts`). */
  modulosVisibles: string[]
  modulosEditables: string[]
}

const lista = (valor: unknown): string[] =>
  Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : []

export function fotoDePermisos(usuario: unknown): FotoDePermisos | null {
  if (!usuario || typeof usuario !== 'object') return null
  const u = usuario as Record<string, unknown>
  if (typeof u.rol !== 'string') return null
  return {
    rol: u.rol,
    activo: u.activo === true,
    modulosVisibles: lista(u.modulosVisibles),
    modulosEditables: lista(u.modulosEditables),
  }
}

// ---------------------------------------------- cambios de permisos

/** Los campos de una cuenta cuyo cambio es un cambio de permisos. */
export const CAMPOS_DE_PERMISOS = [
  'rol',
  'activo',
  'pendiente',
  'modulosVisibles',
  'modulosEditables',
] as const

export interface CambioDePermiso {
  campo: (typeof CAMPOS_DE_PERMISOS)[number]
  antes: unknown
  despues: unknown
}

const comoComparable = (valor: unknown): string =>
  Array.isArray(valor) ? JSON.stringify([...valor].map(String).sort()) : JSON.stringify(valor ?? null)

/**
 * Qué cambió de los permisos entre dos versiones de una cuenta.
 *
 * Solo esos cinco campos, y de ninguno más: la contraseña, el testigo de
 * recuperación y el resto de lo que lleva una cuenta no se copian al registro
 * ni por error. Las listas se comparan sin mirar el orden, porque marcar las
 * mismas casillas en otro orden no es un cambio.
 */
export function cambiosDePermisos(
  antes: Record<string, unknown> | null | undefined,
  despues: Record<string, unknown> | null | undefined,
): CambioDePermiso[] {
  if (!despues) return []
  const cambios: CambioDePermiso[] = []
  for (const campo of CAMPOS_DE_PERMISOS) {
    const a = antes?.[campo]
    const d = despues[campo]
    if (comoComparable(a) !== comoComparable(d)) cambios.push({ campo, antes: a ?? null, despues: d ?? null })
  }
  return cambios
}

const NOMBRE_DEL_CAMPO: Record<string, string> = {
  rol: 'rol',
  activo: 'cuenta activa',
  pendiente: 'solicitud pendiente',
  modulosVisibles: 'módulos que ve',
  modulosEditables: 'módulos que edita',
}

const valorEnPalabras = (valor: unknown): string => {
  if (Array.isArray(valor)) return valor.length === 0 ? 'todos' : valor.join(', ')
  if (valor === true) return 'sí'
  if (valor === false) return 'no'
  return valor === null || valor === undefined || valor === '' ? '—' : String(valor)
}

export const cambioEnPalabras = (c: CambioDePermiso): string =>
  `${NOMBRE_DEL_CAMPO[c.campo] ?? c.campo}: ${valorEnPalabras(c.antes)} → ${valorEnPalabras(c.despues)}`

// ------------------------------------------------ módulos en mantención

export interface CambioDeMantencion {
  modulo: string
  /** `true`: el módulo pasó a estar en mantención; `false`: volvió a estar visible. */
  enMantencion: boolean
}

/**
 * Qué módulos entraron o salieron de la mantención entre dos versiones de la
 * fila de ajustes. Una fila por módulo y no una por escritura: el registro se
 * lee preguntando «qué pasó con la Técnica AO», y marcar dos casillas a la vez
 * son dos actos distintos para quien los busca. El orden de la lista no es un
 * cambio.
 */
export function cambiosDeMantencion(
  antes: Record<string, unknown> | null | undefined,
  despues: Record<string, unknown> | null | undefined,
): CambioDeMantencion[] {
  if (!despues) return []
  const lista = (valor: unknown): string[] =>
    Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : []
  const eran = new Set(lista(antes?.modulosEnMantencion))
  const son = new Set(lista(despues.modulosEnMantencion))
  return [
    ...[...son].filter((m) => !eran.has(m)).map((modulo) => ({ modulo, enMantencion: true })),
    ...[...eran].filter((m) => !son.has(m)).map((modulo) => ({ modulo, enMantencion: false })),
  ]
}

// ------------------------------------------------------ tiempo activo

/** Cada cuánto manda el navegador su latido. */
export const LATIDO_DE_ACTIVIDAD_MS = 60_000

/**
 * Sin tocar nada durante este tiempo, la cuenta deja de contar como activa.
 *
 * Es el mismo umbral que usa la revisión (`INACTIVIDAD_QUE_NO_CUENTA_MS`):
 * quien lee con calma sin mover el ratón un minuto y medio sigue leyendo, y más
 * que eso es una pestaña olvidada.
 */
export const INACTIVIDAD_DE_LA_CUENTA_MS = 90_000

/**
 * Cuántos segundos se le abonan a un latido.
 *
 * El servidor no se fía del navegador, que podría mandar latidos a ráfagas: se
 * abona lo que de verdad pasó desde el anterior, con el techo de un latido más
 * la tolerancia de la red. Si el anterior es demasiado viejo —la persona se
 * fue y volvió—, el primer latido de la vuelta no abona nada: no se sabe cuánto
 * de ese hueco estuvo delante. Un latido sin anterior tampoco: es el primero de
 * la jornada.
 */
export function segundosDelLatido(ultimoMs: number | null, ahoraMs: number): number {
  if (ultimoMs === null || !Number.isFinite(ultimoMs)) return 0
  const pasado = ahoraMs - ultimoMs
  if (pasado <= 0) return 0
  if (pasado > LATIDO_DE_ACTIVIDAD_MS * 2) return 0
  return Math.min(Math.round(pasado / 1000), (LATIDO_DE_ACTIVIDAD_MS + 15_000) / 1000)
}

/** El día de una fecha en la zona horaria del servidor: «2026-09-30». */
export function diaLocal(fecha: Date): string {
  const a = fecha.getFullYear()
  const m = String(fecha.getMonth() + 1).padStart(2, '0')
  const d = String(fecha.getDate()).padStart(2, '0')
  return `${a}-${m}-${d}`
}

/** «2 h 05 min», «12 min», «45 s». */
export function duracionCorta(segundos: number): string {
  const s = Math.max(0, Math.round(segundos))
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  return `${h} h ${String(min % 60).padStart(2, '0')} min`
}

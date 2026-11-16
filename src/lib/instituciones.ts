/**
 * Lo que vale para una institución sin preguntarle a la base (D-371, D-396).
 *
 * Puro a propósito, como `reglas.ts`: lo usan la colección al validar, el proxy
 * al leer el anfitrión y el panel al crear una, y las tres tienen que decir lo
 * mismo de qué subdominio sirve.
 */

/** Días que dura un piloto si el administrador no pone otra fecha (D-371). */
export const DIAS_DEL_PILOTO = 15

/**
 * Cuánto dura el enlace con que el administrador de una institución nueva
 * elige su contraseña. Lo mismo que la invitación de una cuenta, y por lo
 * mismo (`HORAS_DE_INVITACION` en `acciones/admin.ts`, que no puede exportarlo
 * por ser `'use server'`). `tests/unit/solicitudesEnElPanel.test.ts` falla si
 * se separan.
 */
export const HORAS_DE_INVITACION = 72

export const MODALIDADES = ['piloto', 'definitiva'] as const
export type Modalidad = (typeof MODALIDADES)[number]

/**
 * Subdominios que ninguna institución puede tomar.
 *
 * - `www` y la raíz son la central: `www` lleva a `traumahub.cl` (E2 de P-016).
 * - `mail` tiene su propio registro hacia Freehost, que le gana al comodín
 *   `*.traumahub.cl`: una institución con ese nombre no llegaría nunca aquí.
 * - `api`, `admin` y `traumahub` se confundirían con la plataforma misma.
 * - `ved`, `pruebas` y `estado` quedan para el servidor de pruebas y para una
 *   futura página de estado.
 *
 * Se agregan los que hagan falta; quitar uno que ya esté en uso por algo fuera
 * de la plataforma rompería ese algo, y por eso solo crece.
 */
export const NOMBRES_RESERVADOS: readonly string[] = [
  'www',
  'mail',
  'api',
  'admin',
  'traumahub',
  'ved',
  'pruebas',
  'estado',
]

const LARGO_MINIMO = 2
const LARGO_MAXIMO = 40

/**
 * El subdominio tal como se guarda: sin espacios y en minúsculas. Lo que el
 * administrador escriba con mayúsculas o un espacio al final es el mismo
 * nombre, y el navegador lo manda siempre en minúsculas.
 */
export function normalizarSubdominio(texto: string): string {
  return texto.trim().toLowerCase()
}

/**
 * ¿Sirve como subdominio? Devuelve el motivo si no, o `null` si sirve.
 *
 * Solo letras sin tilde, números y guiones, y sin guion al principio ni al
 * final: es lo que admite un nombre de DNS (RFC 1123), y una `ñ` obligaría a
 * escribirlo en punycode (`xn--…`), que nadie reconoce. Se valida ya
 * normalizado.
 */
export function motivoDeSubdominioInvalido(subdominio: string): string | null {
  if (subdominio.length < LARGO_MINIMO || subdominio.length > LARGO_MAXIMO) {
    return `El subdominio tiene que tener entre ${LARGO_MINIMO} y ${LARGO_MAXIMO} caracteres.`
  }
  if (!/^[a-z0-9-]+$/.test(subdominio)) {
    return 'El subdominio solo puede llevar letras sin tilde, números y guiones.'
  }
  if (subdominio.startsWith('-') || subdominio.endsWith('-')) {
    return 'El subdominio no puede empezar ni terminar con un guion.'
  }
  if (NOMBRES_RESERVADOS.includes(subdominio)) {
    return `«${subdominio}» está reservado para la plataforma.`
  }
  return null
}

/**
 * El vencimiento de un piloto que empieza en `inicio`, si no se da otro.
 * Se cuenta en días enteros desde el inicio, a la misma hora.
 */
export function vencimientoDelPiloto(inicio: Date, dias: number = DIAS_DEL_PILOTO): Date {
  return new Date(inicio.getTime() + dias * 24 * 60 * 60 * 1000)
}

const DIA_MS = 24 * 60 * 60 * 1000

/** La zona de las fechas que se eligen en el panel: la de las instituciones. */
export const ZONA_DE_LAS_FECHAS = 'America/Santiago'

/** Cuántos minutos va la zona por delante de UTC en ese instante (Chile: −180 o −240). */
function desfaseDeLaZona(instante: Date, zona: string): number {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(instante)
      .map((p) => [p.type, p.value]),
  )
  const comoUtc = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute, +partes.second)
  return Math.round((comoUtc - Math.floor(instante.getTime() / 1000) * 1000) / 60_000)
}

/**
 * El último instante del día `AAAA-MM-DD` en Chile, o `null` si la fecha no
 * vale.
 *
 * El panel elige el plazo con un campo de fecha, sin hora, y «vence el 1 de
 * diciembre» se entiende como que el 1 todavía se trabaja. Se calcula con la
 * zona y no con la del proceso: en producción coinciden (`TZ` del contenedor),
 * pero en el equipo de quien prueba no tiene por qué, y el cambio de hora de
 * Chile movería el bloqueo una hora según dónde corriera.
 */
export function finDelDiaEnChile(fecha: string): Date | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (!partes) return null
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])]
  const comoUtc = Date.UTC(anio, mes - 1, dia, 23, 59, 59, 999)
  const comprobada = new Date(comoUtc)
  if (comprobada.getUTCMonth() !== mes - 1 || comprobada.getUTCDate() !== dia) return null
  // Dos vueltas: el desfase de la primera puede ser el del otro lado de un
  // cambio de hora, y la segunda lo corrige.
  let instante = comoUtc - desfaseDeLaZona(comprobada, ZONA_DE_LAS_FECHAS) * 60_000
  instante = comoUtc - desfaseDeLaZona(new Date(instante), ZONA_DE_LAS_FECHAS) * 60_000
  return new Date(instante)
}

/** El día `AAAA-MM-DD` de un instante, en Chile: lo que muestra un campo de fecha. */
export function diaEnChile(instante: Date | string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_DE_LAS_FECHAS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instante))
}

/** Días antes del vencimiento en que el panel empieza a avisar. */
export const DIAS_DE_AVISO = 5

export type EstadoDelPlazo = 'vigente' | 'por-vencer' | 'vencida' | 'sin-termino'

/**
 * En qué punto de su plazo está una institución.
 *
 * `dias` son los que le quedan, contados hacia arriba (le queda medio día: 1),
 * o los que lleva vencida, contados hacia abajo. Una definitiva sin término no
 * vence nunca.
 *
 * Una fecha que no se puede leer cuenta como vencida: de esto sale el bloqueo
 * (E5.8), y una fila estropeada no puede dejar una institución abierta para
 * siempre.
 */
export function estadoDelPlazo(
  vence: string | Date | null | undefined,
  ahora: Date = new Date(),
): { estado: EstadoDelPlazo; dias: number | null } {
  if (vence === null || vence === undefined || vence === '') return { estado: 'sin-termino', dias: null }
  const fin = new Date(vence).getTime()
  if (Number.isNaN(fin)) return { estado: 'vencida', dias: null }
  const falta = fin - ahora.getTime()
  if (falta <= 0) return { estado: 'vencida', dias: Math.floor(-falta / DIA_MS) }
  const dias = Math.ceil(falta / DIA_MS)
  return { estado: dias <= DIAS_DE_AVISO ? 'por-vencer' : 'vigente', dias }
}

/** El techo del cupo: más que esto es un error de tecleo, no un contrato. */
export const CUPO_MAXIMO = 100_000

/** Lo que el panel manda al crear o cambiar una institución, ya leído. */
export interface DatosDeInstitucion {
  nombre: string
  subdominio: string
  modalidad: Modalidad
  /** `AAAA-MM-DD`, el día en que empieza. */
  inicio: string
  /** `AAAA-MM-DD`, el último día, o `''` si no hay. */
  vence: string
  cupo: number
  correoDelAdministrador: string
  nombreDelAdministrador: string
}

export type CampoDeInstitucion = keyof DatosDeInstitucion
export type ProblemasDeInstitucion = Partial<Record<CampoDeInstitucion, string>>

/** Los campos que se cambian después de crearla. El subdominio y el inicio no. */
export const CAMPOS_QUE_CAMBIAN: readonly CampoDeInstitucion[] = [
  'nombre',
  'modalidad',
  'vence',
  'cupo',
  'correoDelAdministrador',
]

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '')

/**
 * Lee y valida lo que llega del formulario, campo a campo.
 *
 * La misma función la usan el formulario, para avisar antes de enviar, y la
 * acción, que no se fía del navegador. Devuelve los datos normalizados y un
 * motivo por cada campo que no sirve; si hay alguno, los datos no se usan.
 *
 * Al cambiar (`'cambiar'`) solo se miran `CAMPOS_QUE_CAMBIAN`: el subdominio
 * está en los enlaces que ya se repartieron, y el inicio, en lo que se firmó.
 */
export function leerDatosDeInstitucion(
  entrada: Partial<Record<CampoDeInstitucion, unknown>>,
  operacion: 'crear' | 'cambiar' = 'crear',
  hoy: string = diaEnChile(new Date()),
): { datos: DatosDeInstitucion; problemas: ProblemasDeInstitucion } {
  const problemas: ProblemasDeInstitucion = {}
  const alCrear = operacion === 'crear'

  const nombre = texto(entrada.nombre)
  if (nombre.length < 2 || nombre.length > 160) problemas.nombre = 'El nombre tiene que tener entre 2 y 160 caracteres.'

  const subdominio = normalizarSubdominio(texto(entrada.subdominio))
  if (alCrear) {
    const motivo = subdominio ? motivoDeSubdominioInvalido(subdominio) : 'Falta el subdominio.'
    if (motivo) problemas.subdominio = motivo
  }

  const modalidad = texto(entrada.modalidad) as Modalidad
  if (!MODALIDADES.includes(modalidad)) problemas.modalidad = 'Elija piloto o definitiva.'

  const inicio = texto(entrada.inicio) || hoy
  if (alCrear && !finDelDiaEnChile(inicio)) problemas.inicio = 'La fecha de inicio no es válida.'

  let vence = texto(entrada.vence)
  if (!vence && alCrear && modalidad === 'piloto' && finDelDiaEnChile(inicio)) {
    // Sin fecha, un piloto dura DIAS_DEL_PILOTO desde que empieza (D-371).
    vence = diaEnChile(vencimientoDelPiloto(new Date(`${inicio}T12:00:00Z`)))
  }
  if (vence && !finDelDiaEnChile(vence)) problemas.vence = 'La fecha de término no es válida.'
  else if (vence && alCrear && vence < inicio) problemas.vence = 'El término no puede ser antes del inicio.'
  else if (!vence && modalidad === 'piloto') problemas.vence = 'Un piloto necesita fecha de término.'

  const cupoLeido = typeof entrada.cupo === 'number' ? entrada.cupo : Number(texto(entrada.cupo))
  const cupo = Number.isInteger(cupoLeido) ? cupoLeido : NaN
  if (!(cupo >= 1 && cupo <= CUPO_MAXIMO)) problemas.cupo = `El cupo es un número entero entre 1 y ${CUPO_MAXIMO}.`

  const correoDelAdministrador = texto(entrada.correoDelAdministrador).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoDelAdministrador) || correoDelAdministrador.length > 254) {
    problemas.correoDelAdministrador = 'El correo no tiene un formato válido.'
  }

  const nombreDelAdministrador = texto(entrada.nombreDelAdministrador)
  if (alCrear && (nombreDelAdministrador.length < 2 || nombreDelAdministrador.length > 120)) {
    problemas.nombreDelAdministrador = 'El nombre tiene que tener entre 2 y 120 caracteres.'
  }

  return {
    datos: { nombre, subdominio, modalidad, inicio, vence, cupo, correoDelAdministrador, nombreDelAdministrador },
    problemas: alCrear
      ? problemas
      : Object.fromEntries(Object.entries(problemas).filter(([campo]) => CAMPOS_QUE_CAMBIAN.includes(campo as CampoDeInstitucion))),
  }
}

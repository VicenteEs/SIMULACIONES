/**
 * Lo que es una solicitud de cuenta (`/registro`, D-119), compartido por el
 * formulario de tres pasos y por `solicitarCuenta` (P-007 E3, D-236).
 *
 * Puro y sin Payload, como `cotizaciones.ts`: el formulario corre en el
 * navegador y avisa campo a campo con estas mismas reglas antes de dejar pasar
 * al paso siguiente. Si cada lado tuviera su copia, el día que una cambie el
 * formulario dejaría avanzar hasta el último paso a quien la acción rechaza al
 * final, cuando ya no se ve el campo que falló.
 *
 * La acción no confía en esto: vuelve a validar con `validacion.ts` y
 * `formularioPublico.ts`, que además rechazan los enlaces, cosa que aquí no se
 * avisa porque no es algo que una persona escriba sin querer.
 */

export const LARGOS_DE_SOLICITUD = {
  nombre: 120,
  correo: 254,
  /** La institución sola y también junto con el programa, que se guardan en la misma columna. */
  institucion: 160,
  programa: 80,
  motivo: 1000,
} as const

/** El mismo mínimo que `exigirContrasena`. */
export const CLAVE_MINIMA = 12

/**
 * La etapa de formación de quien pide la cuenta, el «Año de residencia» del
 * tablero «Registro» de Penpot.
 *
 * Kinesiología y docente no son años, pero van en la misma lista porque son la
 * respuesta de quien no es residente: el tablero las pone ahí, y un segundo
 * campo para ellas sería una pregunta que la mitad deja en blanco.
 *
 * El nombre del campo es `etapaDeFormacion` y no «año»: sin eñe en el código,
 * «año» se escribe de una forma que nadie quiere leer en una columna.
 */
export const ETAPAS_DE_FORMACION = [
  { valor: 'r1', corta: 'R1', larga: 'R1 · primer año' },
  { valor: 'r2', corta: 'R2', larga: 'R2 · segundo año' },
  { valor: 'r3', corta: 'R3', larga: 'R3 · tercer año' },
  { valor: 'r4', corta: 'R4', larga: 'R4 · cuarto año' },
  { valor: 'kinesiologia', corta: 'Kinesiología', larga: 'Kinesiología' },
  { valor: 'docente', corta: 'Docente', larga: 'Docente' },
] as const

export type EtapaDeFormacion = (typeof ETAPAS_DE_FORMACION)[number]['valor']

export const esEtapaDeFormacion = (valor: unknown): valor is EtapaDeFormacion => ETAPAS_DE_FORMACION.some((e) => e.valor === valor)

/** La etiqueta corta («R2», «Docente») para el panel; vacía si no la indicó. */
export const etiquetaDeEtapa = (valor: unknown): string => ETAPAS_DE_FORMACION.find((e) => e.valor === valor)?.corta ?? ''

/**
 * Las sugerencias del campo «Programa o servicio».
 *
 * El tablero propone elegir la institución de una lista. Esa lista solo podría
 * salir de las cuentas que ya existen, y enseñarla en una página sin sesión
 * sería decirle a cualquiera de qué hospitales viene la gente de la plataforma
 * (D-020). Los programas, en cambio, son de la especialidad y no de nadie: se
 * sugieren estos y se acepta cualquier otro escrito a mano.
 */
export const PROGRAMAS_CONOCIDOS = [
  'Traumatología y ortopedia',
  'Medicina física y rehabilitación',
  'Kinesiología',
  'Medicina de urgencia',
] as const

/**
 * La institución con su programa, como se guardan: en la misma columna.
 *
 * El programa no tiene columna propia porque el administrador lo lee junto a la
 * institución («Hospital Regional · Traumatología y ortopedia») y nada lo filtra
 * por separado. Por eso los dos juntos caben en el largo de la institución: es
 * el mismo tope con que el panel valida la columna al editar la cuenta
 * (`actualizarUsuario`), y pasarlo aquí dejaría una cuenta que el panel ya no
 * puede guardar sin recortarle la institución.
 */
export function institucionConPrograma(institucion: string, programa: string): string {
  const i = institucion.trim()
  const p = programa.trim()
  return p ? `${i} · ${p}` : i
}

export interface DatosDeSolicitud {
  nombre: string
  correo: string
  clave: string
  repetida: string
  institucion: string
  programa: string
  etapa: EtapaDeFormacion | ''
  motivo: string
}

export type CampoDeSolicitud = keyof DatosDeSolicitud
export type ProblemasDeSolicitud = Partial<Record<CampoDeSolicitud, string>>

/** Los tres pasos del tablero, con los campos que valida cada uno antes de dejar seguir. */
export const PASOS_DE_LA_SOLICITUD = [
  { titulo: 'Tus datos', campos: ['nombre', 'correo', 'clave', 'repetida'] },
  { titulo: 'Tu institución', campos: ['institucion', 'programa', 'etapa'] },
  { titulo: 'Confirmación', campos: ['motivo'] },
] as const satisfies readonly { titulo: string; campos: readonly CampoDeSolicitud[] }[]

// La misma laxitud que `exigirCorreo`: una arroba y un punto detrás.
const PARECE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function problemasDeLaSolicitud(datos: DatosDeSolicitud): ProblemasDeSolicitud {
  const problemas: ProblemasDeSolicitud = {}
  const largo = (texto: string) => [...texto.trim()].length

  if (!datos.nombre.trim()) problemas.nombre = 'Escribe tu nombre y apellido.'
  else if (largo(datos.nombre) > LARGOS_DE_SOLICITUD.nombre) problemas.nombre = `El nombre no puede pasar de ${LARGOS_DE_SOLICITUD.nombre} caracteres.`

  if (!datos.correo.trim()) problemas.correo = 'Escribe tu correo: ahí te avisamos cuando la cuenta esté activa.'
  else if (!PARECE_CORREO.test(datos.correo.trim()) || largo(datos.correo) > LARGOS_DE_SOLICITUD.correo)
    problemas.correo = 'Revisa el correo: le falta la arroba o el dominio.'

  // La contraseña se mide sin recortar, como la mide `exigirContrasena`: un
  // espacio al final es parte de ella.
  if (datos.clave.length < CLAVE_MINIMA) {
    problemas.clave = datos.clave ? `Faltan ${CLAVE_MINIMA - datos.clave.length} caracteres: el mínimo es ${CLAVE_MINIMA}.` : `Elige una contraseña de al menos ${CLAVE_MINIMA} caracteres.`
  }
  if (!problemas.clave && datos.repetida !== datos.clave) problemas.repetida = 'Las dos contraseñas no coinciden.'

  if (!datos.institucion.trim()) problemas.institucion = 'Escribe tu hospital, universidad o servicio.'
  else if (largo(datos.institucion) > LARGOS_DE_SOLICITUD.institucion)
    problemas.institucion = `La institución no puede pasar de ${LARGOS_DE_SOLICITUD.institucion} caracteres.`
  else if (largo(datos.programa) > LARGOS_DE_SOLICITUD.programa)
    problemas.programa = `El programa no puede pasar de ${LARGOS_DE_SOLICITUD.programa} caracteres.`
  else if (largo(institucionConPrograma(datos.institucion, datos.programa)) > LARGOS_DE_SOLICITUD.institucion)
    problemas.programa = `Entre la institución y el programa no pueden pasar de ${LARGOS_DE_SOLICITUD.institucion} caracteres.`

  if (datos.etapa && !esEtapaDeFormacion(datos.etapa)) problemas.etapa = 'Elige una opción de la lista.'

  if (largo(datos.motivo) > LARGOS_DE_SOLICITUD.motivo) problemas.motivo = `El mensaje no puede pasar de ${LARGOS_DE_SOLICITUD.motivo} caracteres.`

  return problemas
}

/** Los problemas de un paso solo: lo que impide pasar al siguiente. */
export function problemasDelPaso(paso: number, datos: DatosDeSolicitud): ProblemasDeSolicitud {
  const todos = problemasDeLaSolicitud(datos)
  const campos: readonly CampoDeSolicitud[] = PASOS_DE_LA_SOLICITUD[paso]?.campos ?? []
  return Object.fromEntries(campos.filter((c) => todos[c]).map((c) => [c, todos[c]]))
}

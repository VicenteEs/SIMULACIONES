import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'

/**
 * La bienvenida del primer ingreso (P-007 E4, D-237): a quién se le enseña y
 * qué recorridos le ofrece.
 *
 * Sin Payload ni React a propósito, como `solicitudDeCuenta.ts`: la usan
 * `entrar()`, la acción que la cierra y la página, y las tres tienen que estar
 * de acuerdo en lo mismo. Si la página ofreciera un recorrido que la acción
 * rechaza, el residente se quedaría en la pantalla sin saber por qué.
 */

export type ClaveDeRecorrido = 'pabellon' | 'examen' | 'policlinico' | 'imagenes'

export interface Recorrido {
  clave: ClaveDeRecorrido
  titulo: string
  bajada: string
  /** El módulo al que lleva: decide si se ofrece, porque una cuenta sin el módulo no puede entrar en él. */
  coleccion: 'cirugias' | 'patologias' | 'maniobras' | 'estudios-ia'
  ruta: string
}

/**
 * Los cuatro de Penpot, en su orden y con sus palabras: no se describen por el
 * módulo sino por lo que la persona tiene esta semana, que es lo que sabe
 * contestar el primer día. La técnica AO no tiene recorrido propio: Penpot la
 * pone «al lado» del simulador, y es desde el caso donde se llega a ella.
 */
export const RECORRIDOS: readonly Recorrido[] = [
  {
    clave: 'pabellon',
    titulo: 'Tengo pabellón pronto',
    bajada: 'Simulador del caso, con su técnica AO al lado',
    coleccion: 'cirugias',
    ruta: '/simulador',
  },
  {
    clave: 'examen',
    titulo: 'Estoy estudiando para un examen',
    bajada: 'Fichas y clasificaciones por segmento',
    coleccion: 'patologias',
    ruta: '/biblioteca',
  },
  {
    clave: 'policlinico',
    titulo: 'Tengo policlínico',
    bajada: 'Maniobras de examen físico por segmento',
    coleccion: 'maniobras',
    ruta: '/examen-fisico',
  },
  {
    clave: 'imagenes',
    titulo: 'Quiero practicar imágenes',
    bajada: 'Casos con clasificación propuesta',
    coleccion: 'estudios-ia',
    ruta: '/imagenes',
  },
]

export function esClaveDeRecorrido(valor: unknown): valor is ClaveDeRecorrido {
  return RECORRIDOS.some((r) => r.clave === valor)
}

/**
 * Los recorridos que esta cuenta puede empezar: los de los módulos que ve.
 *
 * Con la misma `puedeVerModulo` que recorta la barra y la portada, y con la
 * lista de mantención: un recorrido hacia un módulo apartado llevaría a la
 * pantalla de «no disponible» en el primer clic de la primera visita.
 */
export function recorridosDisponibles(
  usuario: UsuarioSesion | null,
  enMantencion: readonly string[],
): Recorrido[] {
  return RECORRIDOS.filter((r) => puedeVerModulo(usuario, r.coleccion, enMantencion))
}

/**
 * Si al entrar hay que pasar antes por la bienvenida.
 *
 * Solo al lector. El administrador va a su panel y el editor entra a escribir:
 * los cuatro recorridos son maneras de empezar a estudiar, y a quien hace las
 * fichas no le dicen nada. La cuenta que ya la cerró —o que había entrado antes
 * de que existiera, que la migración da por vista— va directa a la portada.
 */
export function necesitaBienvenida(usuario: { rol?: unknown; bienvenidaVistaEn?: unknown } | null | undefined): boolean {
  if (!usuario || usuario.rol !== 'lector') return false
  return typeof usuario.bienvenidaVistaEn !== 'string' || usuario.bienvenidaVistaEn === ''
}

/** A dónde manda `entrar()` a quien acaba de iniciar sesión. */
export function destinoAlEntrar(usuario: { rol?: unknown; bienvenidaVistaEn?: unknown } | null | undefined): string {
  if (usuario?.rol === 'admin') return '/admin-panel'
  return necesitaBienvenida(usuario) ? '/bienvenida' : '/'
}

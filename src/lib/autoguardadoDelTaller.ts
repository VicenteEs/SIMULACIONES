/**
 * Cuándo el taller anatómico se guarda solo.
 *
 * El taller guardaba únicamente con el botón, y apagar piezas hasta dejar la
 * tibia sola es media hora de trabajo que se iba con una pestaña cerrada o un
 * corte de internet. Cada veinte segundos se mira si hay algo que guardar y, si
 * lo hay y se puede, se guarda por el mismo camino que el botón.
 *
 * La decisión vive aquí, pura, y no dentro del componente: es lo que hay que
 * poder probar sin montar el visor 3D, y lo que cualquiera querrá ajustar el día
 * que veinte segundos sea poco o mucho.
 */

/**
 * Veinte segundos, que salieron de «cada 20 o 30» del dueño. La primera versión
 * guardaba cada cinco y era demasiado seguido: cada guardado escribe en la base
 * y, si la preparación ya está dentro de una ficha publicada, cambia lo que ve
 * el residente en ese momento (D-152). Veinte es poco trabajo que perder si se
 * corta el internet y mucho menos ruido; treinta sería más tranquilo y perdería
 * más. Se cambia aquí y en ningún otro sitio.
 */

export const INTERVALO_DE_AUTOGUARDADO_MS = 20_000

export interface EstadoParaAutoguardar {
  /** El catálogo ya cargó: antes de eso no hay nada que guardar. */
  listo: boolean
  /** Hay trabajo que el servidor no tiene (piezas, cortes, rótulos o encuadre). */
  hayCambios: boolean
  nombre: string
  /** Piezas encendidas: una preparación sin ninguna no se guarda. */
  piezas: number
  /** Ya hay un guardado o una exportación en curso. */
  ocupado: boolean
}

/**
 * Por qué NO se guarda ahora, o `null` si toca guardar.
 *
 * `sin-nombre` no es un fallo, es el estado del «Cuerpo» base recién tocado: el
 * taller le pide un nombre a quien edita y solo entonces empieza a guardar. Se
 * distingue de `sin-cambios` porque la pantalla enseña cosas distintas en cada
 * caso: en uno, nada; en el otro, el recuadro que pide el nombre.
 */
export type MotivoParaNoAutoguardar = 'sin-catalogo' | 'sin-cambios' | 'sin-nombre' | 'sin-piezas' | 'ocupado'

export function motivoParaNoAutoguardar(estado: EstadoParaAutoguardar): MotivoParaNoAutoguardar | null {
  if (!estado.listo) return 'sin-catalogo'
  if (!estado.hayCambios) return 'sin-cambios'
  // El nombre antes que las piezas: con el cuerpo recién modificado y sin
  // nombre, lo que hay que decirle a la persona es que lo ponga.
  if (estado.nombre.trim() === '') return 'sin-nombre'
  if (estado.piezas === 0) return 'sin-piezas'
  if (estado.ocupado) return 'ocupado'
  return null
}

/**
 * Si el guardado automático tiene que volver a refrescar la lista de
 * preparaciones guardadas.
 *
 * Cada veinte segundos pedir la lista entera de nuevo es ruido. Solo cambia lo
 * que la lista enseña cuando nace una preparación (el primer guardado de una
 * copia del «Cuerpo») o cuando se le cambia el nombre.
 */
export function debeRefrescarLaLista(
  eraNueva: boolean,
  nombreGuardado: string,
  nombreNuevo: string,
): boolean {
  return eraNueva || nombreGuardado.trim() !== nombreNuevo.trim()
}

/**
 * Un fallo se avisa una sola vez mientras siga fallando.
 *
 * El guardado automático reintenta cada veinte segundos; con un aviso por
 * intento, un corte de internet llenaba la pantalla de mensajes iguales. Se
 * avisa el primero, y el siguiente solo cuando antes hubo un éxito.
 */
export function debeAvisarDelFallo(yaAvisado: boolean): boolean {
  return !yaAvisado
}

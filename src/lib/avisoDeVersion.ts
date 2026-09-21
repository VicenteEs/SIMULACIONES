/**
 * Qué hacer con cada mensaje del flujo `/api/cambios`, sin React ni navegador.
 *
 * Está aparte de `AvisoActualizacion.tsx` para poder probarlo: son tres
 * decisiones encadenadas, y las tres se han roto ya una vez o se rompen sin que
 * se note —un aviso falso en cada reinicio, una recarga que se lleva una ficha
 * a medias—.
 */

export interface MensajeDeCambios {
  version: number
  modulo: string | null
  /** Identificador de la construcción. Un servidor anterior a D-127 no lo manda. */
  despliegue?: string
  /** Instante en que nació el proceso que contesta. Ídem. */
  arranque?: number
}

/** Lo que el aviso recuerda del primer mensaje, y va actualizando. */
export interface MemoriaDelAviso {
  version: number
  despliegue: string | null
  arranque: number | null
}

export type Decision =
  | { tipo: 'nada' }
  | { tipo: 'contenido-nuevo'; modulo: string | null }
  | { tipo: 'version-nueva' }

/**
 * Decide, y devuelve la memoria con la que hay que quedarse.
 *
 * El orden importa. Primero se mira si cambió el **proceso**: si cambió, la
 * cuenta de publicaciones es la de otro contador y no se compara con la
 * recordada —se adopta—, que es lo que evita el aviso falso de «contenido
 * nuevo» tras cada reinicio. Y solo si además cambió la **construcción** hay
 * versión nueva. Con el mismo proceso, una cuenta mayor es una publicación.
 */
export function decidir(
  memoria: MemoriaDelAviso | null,
  mensaje: MensajeDeCambios,
): { decision: Decision; memoria: MemoriaDelAviso } {
  const recibida: MemoriaDelAviso = {
    version: mensaje.version,
    despliegue: mensaje.despliegue ?? null,
    arranque: mensaje.arranque ?? null,
  }
  if (!memoria) return { decision: { tipo: 'nada' }, memoria: recibida }

  if (recibida.arranque !== memoria.arranque) {
    const hayCodigoNuevo = recibida.despliegue !== memoria.despliegue
    return { decision: hayCodigoNuevo ? { tipo: 'version-nueva' } : { tipo: 'nada' }, memoria: recibida }
  }

  if (recibida.version > memoria.version) {
    // La memoria NO avanza: el aviso de contenido se queda puesto hasta que la
    // persona recargue, y una segunda publicación no debe parecer la primera.
    return { decision: { tipo: 'contenido-nuevo', modulo: mensaje.modulo }, memoria }
  }
  return { decision: { tipo: 'nada' }, memoria }
}

/** Cuánto espera una pestaña a la vista antes de recargarse sola. */
export const SEGUNDOS_ANTES_DE_RECARGAR = 30

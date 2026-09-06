/**
 * Qué se hace con lo que deja una cuenta al eliminarla.
 *
 * Sin esto, eliminar a alguien que alguna vez abrió una ficha falla con un
 * error de la base —«null value in column usuario_id violates not-null
 * constraint»— y el panel se queda diciendo que no pudo, sin explicar por qué.
 * El fallo aparece solo cuando la persona ya usó la plataforma, que es
 * justamente cuando se la quiere dar de baja.
 *
 * Las dos cosas que deja no se tratan igual, y la diferencia es deliberada:
 *
 *  - **Actividad**: se borra. Es seguimiento de lectura de una persona
 *    concreta; sin esa persona no significa nada y solo abulta la tabla.
 *  - **Comentarios**: se conservan sin autor. Son observaciones sobre el
 *    contenido —«falta la vía de abordaje», «este esquema está al revés»— y
 *    valen por lo que dicen, no por quién las dijo. Borrarlas castigaría al
 *    contenido por un cambio en el personal.
 *
 * La lógica se aísla de Payload para poder probarla sin base de datos.
 */

export interface ArgumentosBaja {
  /** Identificador de la cuenta que se elimina. */
  usuarioId: string
  borrarActividad: (usuarioId: string) => Promise<number>
  anonimizarComentarios: (usuarioId: string) => Promise<number>
}

export interface ResultadoBaja {
  actividadBorrada: number
  comentariosAnonimizados: number
}

export async function limpiarRastroDeUsuario({
  usuarioId,
  borrarActividad,
  anonimizarComentarios,
}: ArgumentosBaja): Promise<ResultadoBaja> {
  // En este orden a propósito: si algo falla, es preferible haber perdido el
  // seguimiento de lectura que haber dejado comentarios apuntando a una cuenta
  // que está a punto de desaparecer.
  const actividadBorrada = await borrarActividad(usuarioId)
  const comentariosAnonimizados = await anonimizarComentarios(usuarioId)
  return { actividadBorrada, comentariosAnonimizados }
}

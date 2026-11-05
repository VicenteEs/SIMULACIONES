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
 *  - **El registro de acciones** (D-291): se conserva sin nombre ni correo.
 *    Queda que alguien con tal rol leyó tal ficha o cambió tal cosa, que es lo
 *    que la bitácora necesita, y deja de saberse quién. Lo mismo las entradas
 *    que la nombraban —su alta, sus cambios de permisos— y los envíos fallidos
 *    de una difusión, que guardan la dirección. Hasta D-291 el registro
 *    conservaba la foto entera de la cuenta para siempre, y el aviso de
 *    privacidad tenía que confesarlo.
 *
 * Rechazar una solicitud pasa por aquí igual que eliminar una cuenta: las dos
 * acaban en el mismo `payload.delete` (`borrarCuentaVigilada`, en
 * `acciones/admin.ts`).
 *
 * La lógica se aísla de Payload para poder probarla sin base de datos.
 */

export interface ArgumentosBaja {
  /** Identificador de la cuenta que se elimina. */
  usuarioId: string
  borrarActividad: (usuarioId: string) => Promise<number>
  anonimizarComentarios: (usuarioId: string) => Promise<number>
  /** Quita el nombre y el correo de lo que la cuenta deja en el registro y en las difusiones. */
  anonimizarRegistro: (usuarioId: string) => Promise<number>
}

export interface ResultadoBaja {
  actividadBorrada: number
  comentariosAnonimizados: number
  entradasAnonimizadas: number
}

export async function limpiarRastroDeUsuario({
  usuarioId,
  borrarActividad,
  anonimizarComentarios,
  anonimizarRegistro,
}: ArgumentosBaja): Promise<ResultadoBaja> {
  // En este orden a propósito: si algo falla, es preferible haber perdido el
  // seguimiento de lectura que haber dejado comentarios apuntando a una cuenta
  // que está a punto de desaparecer.
  const actividadBorrada = await borrarActividad(usuarioId)
  const comentariosAnonimizados = await anonimizarComentarios(usuarioId)
  // El registro, al final: borrar la actividad y retocar los comentarios anota
  // sus propias entradas, y esas son de quien elimina, no de la cuenta. Las que
  // hay que dejar sin nombre ya estaban todas antes de empezar.
  const entradasAnonimizadas = await anonimizarRegistro(usuarioId)
  return { actividadBorrada, comentariosAnonimizados, entradasAnonimizadas }
}

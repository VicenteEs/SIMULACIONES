'use server'

/**
 * Grabar la resolución de referencia de un caso (D-373, E3 de P-016).
 *
 * El editor termina el caso en la consola y lo guarda como la forma correcta de
 * resolverlo. El ensayo de los casos (`scripts/ensayar-casos.ts`) lo vuelve a
 * calificar antes de cada despliegue: si el código nuevo le da otra nota, algo
 * cambió en el motor y se ve antes de subirlo. El porqué de la colección, en
 * `ResolucionesDeReferencia.ts`.
 */
import { accion, exigirEdicionDe, type Respuesta } from '@/lib/guardias'
import { exigirIdentificador, ErrorDeValidacion } from '@/lib/validacion'
import { notaDelRecorrido, recorridoValido, type RecorridoDelCaso } from '@/lib/notaDelRecorrido'
import { casoParaLaConsola } from '@/lib/casoQuirurgico'
import { versionDelCaso } from '@/lib/formatoDelCaso'

export interface ReferenciaGrabada {
  puntaje: number
  puntajeMaximo: number
  /** Si ya había una y esta la reemplazó: la consola lo dice, para que no sorprenda. */
  reemplazo: boolean
}

/**
 * Guarda el recorrido como referencia del caso, o reemplaza la que hubiera.
 *
 * Con el permiso de editar el simulador y el rol real (`exigirEdicionDe`): un
 * residente no fija la solución de nadie, y quien mira «como residente» sigue
 * siendo el editor que es. La consola, de todos modos, no ofrece el botón en la
 * vista previa.
 *
 * La nota la pone el servidor, rehecha con los pasos del caso como en
 * `registrarResultadoDeCirugia` (D-310), y no la que diga el navegador: es la
 * que el ensayo va a volver a calcular con el mismo camino, y compararla con la
 * del navegador mediría otra cosa. El caso se lee como lo lee esa acción, sin
 * borrador y con el acceso del editor, que es lo que la consola acaba de jugar.
 */
export async function grabarResolucionDeReferencia(
  documentoId: unknown,
  recorridoRecibido: unknown,
): Promise<Respuesta<ReferenciaGrabada>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEdicionDe('cirugias')
    const id = exigirIdentificador(documentoId, 'El caso')
    let recorrido: RecorridoDelCaso
    try {
      recorrido = recorridoValido(recorridoRecibido)
    } catch (error) {
      throw new ErrorDeValidacion(error instanceof Error ? error.message : 'El recorrido no llegó como corresponde.')
    }
    if (recorrido.pasos.length === 0) throw new ErrorDeValidacion('El recorrido no tiene ningún paso hecho.')

    const cirugia = (await payload.findByID({
      collection: 'cirugias',
      id,
      overrideAccess: false,
      user: usuario as never,
      depth: 0,
    })) as unknown as Record<string, unknown>
    const nota = notaDelRecorrido(casoParaLaConsola(cirugia).pasos, recorrido)

    const datos = {
      nombre: `Referencia de «${typeof cirugia.nombre === 'string' ? cirugia.nombre : id}»`,
      cirugia: Number(id),
      recorrido,
      puntaje: nota.puntaje,
      puntajeMaximo: nota.puntajeMaximo,
      versionDelFormato: versionDelCaso(cirugia),
      casoGuardadoEn: typeof cirugia.updatedAt === 'string' ? cirugia.updatedAt : null,
    }
    const anterior = await payload.find({
      collection: 'resoluciones-de-referencia',
      where: { cirugia: { equals: id } },
      limit: 1,
      depth: 0,
      overrideAccess: false,
      user: usuario as never,
    })
    const existente = anterior.docs[0] as { id: number | string } | undefined
    if (existente) {
      await payload.update({
        collection: 'resoluciones-de-referencia',
        id: existente.id,
        data: datos as never,
        overrideAccess: false,
        user: usuario as never,
      })
    } else {
      await payload.create({
        collection: 'resoluciones-de-referencia',
        data: datos as never,
        overrideAccess: false,
        user: usuario as never,
      })
    }
    return { puntaje: nota.puntaje, puntajeMaximo: nota.puntajeMaximo, reemplazo: !!existente }
  })
}

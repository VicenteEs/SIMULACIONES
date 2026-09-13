'use server'

import { getPayload, type Where } from 'payload'
import config from '@payload-config'
import { obtenerSesion } from '@/lib/sesion'
import { exigirIdentificador, exigirSlugDeModulo } from '@/lib/validacion'

/**
 * Registro de lo que cada residente ha visitado y marcado como leído.
 *
 * Las dos acciones públicas —visitar y marcar— hacen lo mismo salvo por un
 * campo, así que comparten implementación: eran dos copias que ya habían
 * empezado a divergir.
 *
 * Lo que **no** comparten es qué hacer cuando falla, y por eso `anotar` ya no
 * captura nada: lo decide quien llama. La visita es una comodidad y su fallo se
 * sigue tragando, porque no debe estropear la lectura de una ficha. La casilla
 * de «leída», en cambio, tiene un control en pantalla que afirma lo contrario
 * de lo ocurrido: si el fallo no sube, `RastreadorActividad` deja la casilla
 * marcada sobre una escritura que nunca se hizo, el residente cierra la tarde
 * creyendo que quedó guardada y al recargar no hay nada. Con el disco lleno
 * —el escenario de `src/lib/espacioEnDisco.ts`— eso era una tarde entera de
 * lectura perdida sin un solo aviso.
 */

/**
 * Cuántas filas de la misma ficha se corrigen de una vez.
 *
 * Debería haber siempre una sola, que es el invariante que promete
 * `src/collections/Actividad.ts`. Cuando la tabla no lo sostenía, dos pestañas
 * abiertas a la vez podían crear dos, y tocando solo `docs[0]` la fila gemela se
 * quedaba con `completado: false` para siempre: la portada seguía ofreciendo en
 * «Continúa leyendo» una ficha que el residente marcaba como leída una vez y
 * otra sin entender por qué.
 *
 * La causa ya está cerrada: `src/collections/Actividad.ts` declara el índice
 * único sobre (usuario, coleccion, documentoId) y la migración
 * `20260913_033442_actividad_una_fila_por_ficha` lo crea, después de borrar los
 * duplicados que hubiera. Este bucle se queda porque las filas gemelas de antes
 * del índice pudieron sobrevivir en una base que aún no haya pasado esa
 * migración —en desarrollo manda el `push` de Drizzle y nadie aplica nada—, y
 * porque escribir todas las que haya no cuesta nada.
 */
const FILAS_A_CORREGIR = 10

/**
 * Deja constancia de la visita o de la marca de lectura.
 *
 * Devuelve si quedó escrito. `false` significa «no había sesión activa», no
 * «falló»: los fallos de verdad se lanzan para que quien llama elija.
 */
async function anotar(
  coleccion: unknown,
  documentoId: unknown,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const { activo, usuarioEfectivo } = await obtenerSesion()
  if (!activo || !usuarioEfectivo) return false

  const usuarioId = (usuarioEfectivo as { id?: unknown }).id
  if (!usuarioId) return false

  const modulo = exigirSlugDeModulo(coleccion)
  const documento = exigirIdentificador(documentoId, 'La ficha')
  const payload = await getPayload({ config })

  const dondeEstaLaFicha: Where = {
    and: [
      { usuario: { equals: usuarioId } },
      { coleccion: { equals: modulo } },
      { documentoId: { equals: documento } },
    ],
  }

  const filasDeLaFicha = async () =>
    (
      await payload.find({
        collection: 'actividad',
        where: dondeEstaLaFicha,
        user: usuarioEfectivo as never,
        limit: FILAS_A_CORREGIR,
        depth: 0,
      })
    ).docs

  const actualizar = async (filas: { id: number | string }[]) => {
    for (const fila of filas) {
      await payload.update({
        collection: 'actividad',
        id: fila.id,
        data: extra as never,
        user: usuarioEfectivo as never,
      })
    }
  }

  // `ultimaVisita` la fija el hook de la colección en cada escritura; aquí
  // solo se decide si hay que crear el registro o actualizarlo.
  const existentes = await filasDeLaFicha()
  if (existentes.length > 0) {
    await actualizar(existentes)
    return true
  }

  try {
    await payload.create({
      collection: 'actividad',
      data: { coleccion: modulo, documentoId: documento, ...extra } as never,
      user: usuarioEfectivo as never,
    })
  } catch (choque) {
    // Otra petición del mismo usuario creó la fila entre la consulta y este
    // `create`. Abrir una ficha y marcarla enseguida son dos llamadas que
    // viajan en paralelo, y entre dos pestañas ni siquiera las ordena la cola
    // de acciones del navegador. Se recupera escribiendo sobre lo que ya
    // existe en vez de devolver un error que el residente no puede resolver.
    //
    // Desde `20260913_033442_actividad_una_fila_por_ficha` la tabla tiene su
    // índice único, así que el choque (23505) llega hasta aquí de verdad: esto
    // dejó de ser código de reserva y es la diferencia entre una casilla que se
    // guarda y un error en pantalla.
    const otras = await filasDeLaFicha()
    if (otras.length === 0) throw choque
    await actualizar(otras)
  }
  return true
}

/**
 * Deja constancia de que se abrió la ficha.
 *
 * No propaga nada, ni siquiera un fallo de sesión: `RastreadorActividad` la
 * llama al montar, sin `await`, y una promesa rechazada que nadie recoge
 * termina en el registro de errores del navegador sin que el residente pueda
 * hacer nada al respecto. La visita se pierde, que es lo que menos cuesta.
 */
export async function registrarVisita(coleccion: unknown, documentoId: unknown): Promise<void> {
  try {
    await anotar(coleccion, documentoId)
  } catch (error) {
    console.error('[actividad] no se pudo registrar la visita:', error)
  }
}

/**
 * Marca o desmarca la ficha como leída.
 *
 * Lanza si no quedó escrita, y eso es deliberado: es lo que hace que el `catch`
 * de `RastreadorActividad` devuelva la casilla a su sitio. Callar aquí es
 * mentirle al residente sobre su propio progreso.
 */
export async function marcarComoLeida(
  coleccion: unknown,
  documentoId: unknown,
  completado: unknown,
): Promise<void> {
  let escrito = false
  try {
    escrito = await anotar(coleccion, documentoId, { completado: completado === true })
  } catch (error) {
    console.error('[actividad] no se pudo marcar como leída:', error)
    throw new Error('No se pudo guardar la marca de lectura. Vuelva a intentarlo.')
  }
  if (!escrito) {
    throw new Error('Su sesión ya no está activa. Vuelva a entrar para guardar su lectura.')
  }
}

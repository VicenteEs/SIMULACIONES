'use server'

/**
 * «Reemplazar por…» en la ficha de un modelo 3D (D-372, E3 de P-016).
 *
 * Un modelo en uso no se borra (`negarElBorradoDeUnModeloEnUso`). Lo que se
 * hace en cambio es pasar todo lo que lo usa a otro modelo de una vez —el caso,
 * el instrumento, el paso de técnica AO, el bloque de la ficha— y entonces
 * borrarlo. Hacerlo a mano era abrir cada sitio, y el que se olvidara se
 * quedaba sin modelo al borrar.
 */
import { revalidatePath } from 'next/cache'
import { accion, exigirEditor, puedeEditar, type Respuesta } from '@/lib/guardias'
import { exigirIdentificador, ErrorDeValidacion } from '@/lib/validacion'
import { registrarAccion } from '@/lib/registroServidor'
import { reemplazarModelo, usosDelModelo } from '@/lib/usosDeUnModeloServidor'

export interface ModeloReemplazado {
  /** Cuántos documentos cambiaron de modelo. */
  cambiados: number
}

const RUTA_DE_MODELOS = '/admin-panel/contenido/modelos-3d'

/**
 * Pasa a `hacia` todo lo que usa `desde`. No borra `desde`: eso queda para
 * después, con su confirmación, desde el menú de la ficha.
 *
 * Solo entre modelos de la misma carpeta: un caso no puede quedarse con una
 * tijera por modelo, ni un instrumento con un fémur, y los desplegables de cada
 * campo ya filtran por carpeta (P-004 E1). Y solo si quien lo pide edita todo lo
 * que va a cambiar: el reemplazo es de una vez, así que una ficha de un módulo
 * ajeno lo frena entero, en vez de dejar el modelo a medio quitar.
 */
export async function reemplazarModeloEnTodo(desdeId: unknown, haciaId: unknown): Promise<Respuesta<ModeloReemplazado>> {
  return accion(async () => {
    const { payload, usuario } = await exigirEditor()
    const desde = exigirIdentificador(desdeId, 'El modelo que se reemplaza')
    const hacia = exigirIdentificador(haciaId, 'El modelo nuevo')
    if (desde === hacia) throw new ErrorDeValidacion('Elija un modelo distinto del que se reemplaza.')

    const leer = (id: string) =>
      payload
        .findByID({ collection: 'modelos-3d', id, depth: 0, overrideAccess: true })
        .then((m) => m as unknown as { id: unknown; nombre?: unknown; clase?: unknown })
        .catch(() => null)
    const [viejo, nuevo] = await Promise.all([leer(desde), leer(hacia)])
    if (!viejo) throw new ErrorDeValidacion('El modelo que se reemplaza ya no existe.')
    if (!nuevo) throw new ErrorDeValidacion('El modelo elegido ya no existe: vuelva a abrir la lista.')
    if (viejo.clase !== nuevo.clase) {
      throw new ErrorDeValidacion('El modelo nuevo es de otra carpeta: un caso solo puede llevar un modelo del cuerpo, y un instrumento, una herramienta.')
    }

    const usos = await usosDelModelo(payload, desde)
    if (usos.length === 0) throw new ErrorDeValidacion('Nada usa este modelo: no hay nada que reemplazar.')
    const ajenos = usos.filter((u) => !puedeEditar(usuario, u.coleccion)).length
    if (ajenos > 0) {
      throw new ErrorDeValidacion(
        `No se reemplazó: ${ajenos === 1 ? 'uno de los que lo usan es' : `${ajenos} de los que lo usan son`} de módulos que usted no edita. Pídaselo a un administrador.`,
      )
    }

    const cambiados = await reemplazarModelo(payload, desde, hacia)

    // El cambio fue por SQL, sin los ganchos de cada colección: lo que el
    // gancho del registro anotaría al guardar cada ficha se anota aquí, una
    // línea por ficha, para que «¿quién tocó este caso?» lo encuentre.
    const nombre = (m: { id: unknown; nombre?: unknown }) => `«${typeof m.nombre === 'string' ? m.nombre : 'sin nombre'}» (#${String(m.id)})`
    for (const uso of cambiados) {
      await registrarAccion(payload, {
        accion: 'modifico',
        usuario,
        coleccion: uso.coleccion,
        documentoId: uso.id,
        titulo: uso.titulo,
        detalle: `Modelo 3D cambiado de ${nombre(viejo)} a ${nombre(nuevo)} con «Reemplazar por…».`,
      })
    }

    revalidatePath(RUTA_DE_MODELOS)
    for (const coleccion of new Set(cambiados.map((u) => u.coleccion))) revalidatePath(`/admin-panel/contenido/${coleccion}`)
    return { cambiados: cambiados.length }
  })
}

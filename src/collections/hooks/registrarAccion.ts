import type { CollectionAfterChangeHook, CollectionAfterDeleteHook, CollectionConfig } from 'payload'
import { actorDeLaPeticion, registrarAccion } from '@/lib/registroServidor'
import {
  cambiosDeMantencion,
  cambiosDePermisos,
  COLECCIONES_SIN_REGISTRO,
  cambioEnPalabras,
} from '@/lib/registro'
import { NOMBRE_DE_MODULO } from '@/app/(frontend)/admin-panel/modulos'

/**
 * Los ganchos que dejan constancia en el registro de acciones (D-145).
 *
 * Se añaden a **todas** las colecciones de una vez, en `src/collections/index.ts`,
 * y no una por una: la colección que alguien declare mañana queda anotada sin
 * que nadie se acuerde, que es lo que hace falta de una bitácora. Las que no se
 * anotan están nombradas, con su porqué, en `COLECCIONES_SIN_REGISTRO`.
 *
 * Un guion de mantenimiento que escribe miles de filas —la importación de los
 * libros— no quiere miles de anotaciones iguales, sino una que lo resuma: por
 * eso `context.sinRegistro` las silencia y el guion anota él su resumen.
 */

type Registro = Record<string, unknown>

const titulo = (doc: Registro): string | undefined => {
  for (const campo of ['nombre', 'titulo', 'asunto', 'alt', 'email', 'filename', 'texto']) {
    const valor = doc[campo]
    if (typeof valor === 'string' && valor.trim()) return valor.trim().slice(0, 200)
  }
  return doc.id === undefined ? undefined : `#${String(doc.id)}`
}

const silenciado = (req: { context?: unknown }): boolean =>
  Boolean((req.context as { sinRegistro?: boolean } | undefined)?.sinRegistro)

const despuesDeCambiar =
  (slug: string): CollectionAfterChangeHook =>
  async ({ doc, previousDoc, operation, req }) => {
    if (silenciado(req) || !req.payload) return doc
    const nuevo = doc as Registro
    const anterior = (previousDoc ?? null) as Registro | null

    // El seguimiento de lectura es de la cuenta a la que pertenece la fila, que
    // viene en la propia fila; lo demás, de quien hace la petición.
    const actor = slug === 'actividad' ? (nuevo.usuario ?? (await actorDeLaPeticion(req))) : await actorDeLaPeticion(req)
    const usuario = typeof actor === 'object' && actor !== null ? actor : actor ? { id: actor } : null

    if (slug === 'usuarios') {
      // Una cuenta se anota cuando nace o cuando cambian sus permisos. Sus
      // demás escrituras —el último acceso en cada inicio de sesión, la
      // contraseña— no son actos de nadie.
      if (operation === 'create') {
        await registrarAccion(
          req.payload,
          {
            accion: 'creo',
            usuario,
            coleccion: slug,
            documentoId: nuevo.id as number,
            titulo: titulo(nuevo),
            detalle: `rol ${String(nuevo.rol ?? '—')}, ${nuevo.activo === true ? 'activa' : 'sin activar'}`,
          },
          req,
        )
        return doc
      }
      const cambios = cambiosDePermisos(anterior, nuevo)
      if (cambios.length > 0) {
        await registrarAccion(
          req.payload,
          {
            accion: 'cambio-de-permisos',
            usuario,
            coleccion: slug,
            documentoId: nuevo.id as number,
            titulo: titulo(nuevo),
            detalle: cambios.map(cambioEnPalabras).join(' · '),
            cambios,
          },
          req,
        )
      }
      return doc
    }

    if (slug === 'ajustes') {
      // Lo que se anota es qué módulo entró o salió de la mantención, no que
      // «se modificó una fila de ajustes», que no le dice nada a nadie. Una
      // escritura que no mueve ningún módulo no deja huella.
      for (const cambio of cambiosDeMantencion(anterior, nuevo)) {
        await registrarAccion(
          req.payload,
          {
            accion: 'mantencion-de-modulo',
            usuario,
            coleccion: cambio.modulo,
            titulo: NOMBRE_DE_MODULO[cambio.modulo] ?? cambio.modulo,
            detalle: cambio.enMantencion
              ? 'lo puso en mantención: los residentes dejan de verlo'
              : 'lo devolvió a visible para los residentes',
          },
          req,
        )
      }
      return doc
    }

    if (slug === 'actividad') {
      await registrarAccion(
        req.payload,
        {
          accion: 'lectura',
          usuario,
          coleccion: typeof nuevo.coleccion === 'string' ? nuevo.coleccion : undefined,
          documentoId: typeof nuevo.documentoId === 'string' ? nuevo.documentoId : undefined,
          detalle: nuevo.completado === true ? 'la marcó como leída' : 'la abrió',
        },
        req,
      )
      return doc
    }

    let accion: Parameters<typeof registrarAccion>[1]['accion'] = operation === 'create' ? 'creo' : 'modifico'
    const estado = typeof nuevo._status === 'string' ? nuevo._status : null
    const estabaPublicada = anterior?._status === 'published'
    if (estado === 'published') accion = 'publico'
    else if (estado === 'draft' && estabaPublicada && operation === 'update') accion = 'retiro'

    await registrarAccion(
      req.payload,
      {
        accion,
        usuario,
        coleccion: slug,
        documentoId: nuevo.id as number,
        titulo: titulo(nuevo),
        detalle: estado ? `estado: ${estado === 'published' ? 'publicada' : 'borrador'}` : undefined,
      },
      req,
    )
    return doc
  }

const despuesDeEliminar =
  (slug: string): CollectionAfterDeleteHook =>
  async ({ doc, req }) => {
    if (silenciado(req) || !req.payload) return doc
    const actor = await actorDeLaPeticion(req)
    const usuario = typeof actor === 'object' && actor !== null ? actor : null
    await registrarAccion(
      req.payload,
      { accion: 'elimino', usuario, coleccion: slug, documentoId: (doc as Registro).id as number, titulo: titulo(doc as Registro) },
      req,
    )
    return doc
  }

/** La misma colección con los dos ganchos del registro añadidos al final. */
export function conRegistro(coleccion: CollectionConfig): CollectionConfig {
  if (COLECCIONES_SIN_REGISTRO.includes(coleccion.slug)) return coleccion
  return {
    ...coleccion,
    hooks: {
      ...coleccion.hooks,
      afterChange: [...(coleccion.hooks?.afterChange ?? []), despuesDeCambiar(coleccion.slug)],
      afterDelete: [...(coleccion.hooks?.afterDelete ?? []), despuesDeEliminar(coleccion.slug)],
    },
  }
}

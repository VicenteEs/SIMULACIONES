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

/**
 * Las colecciones cuyo título en el registro no es el primer campo que
 * encuentra la lista de abajo.
 *
 * Una cotización lleva primero `nombre`, que es el de la persona de fuera que
 * la pidió, y el registro guardaba ese nombre en cada «Creó» y cada «Modificó»
 * de la cotización. Al borrarla —porque lo pidió, o a los doce meses— el
 * nombre seguía en el registro, que es justo lo que el plazo existe para que no
 * pase (D-291). La institución dice lo mismo para quien lee el registro
 * —«llegó una cotización del Hospital X»— sin decir de quién.
 */
const CAMPO_DEL_TITULO: Record<string, string> = { cotizaciones: 'institucion' }

const titulo = (doc: Registro, slug?: string): string | undefined => {
  const propio = slug === undefined ? undefined : CAMPO_DEL_TITULO[slug]
  // `nombreOriginal` es el de la estructura anatómica (D-179): sin él, el registro diría «#1432».
  for (const campo of propio
    ? [propio]
    : ['nombre', 'titulo', 'asunto', 'alt', 'email', 'filename', 'texto', 'nombreOriginal']) {
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
              ? 'lo puso en mantención: los residentes lo ven como «Próximamente»'
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
        titulo: titulo(nuevo, slug),
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
    const borrado = doc as Registro
    // La cuenta que se elimina no deja su nombre en la entrada que cuenta que se
    // eliminó (D-291). Todo lo demás que la nombraba se acaba de anonimizar en
    // su `beforeDelete`; esta entrada se escribe después, y con el título de
    // siempre —el primer campo, `nombre`— habría vuelto a guardar el nombre en
    // el mismo instante en que se quitaba de todas las otras. Queda el rol, que
    // es lo que dice qué se dio de baja.
    const deLaCuenta = slug === 'usuarios'
    await registrarAccion(
      req.payload,
      {
        accion: 'elimino',
        usuario,
        coleccion: slug,
        documentoId: borrado.id as number,
        titulo: deLaCuenta ? undefined : titulo(borrado, slug),
        detalle: deLaCuenta ? `una cuenta de rol ${String(borrado.rol ?? '—')}` : undefined,
      },
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

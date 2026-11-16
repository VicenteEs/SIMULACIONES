import type { CollectionBeforeChangeHook, CollectionConfig, Field, PayloadRequest } from 'payload'
import { idDeInstitucion, usuarioDeSesion } from '@/access/payload'

/**
 * La marca de institución en cada fila que pertenece a una (D-371, D-396).
 *
 * Una fila sin marca es de TraumaHub. Todas las que hay antes de la primera
 * institución quedan así, y por eso nada cambia para la central al añadir la
 * columna.
 *
 * ## Quién la pone
 *
 * Nadie la escribe a mano. Al crear, la pone este gancho:
 *
 * - si quien escribe es de una institución, la suya, aunque el dato traiga otra.
 *   Un docente no puede crear contenido para otra institución mandando el campo;
 * - si es de TraumaHub, o no hay sesión (un guion, la conservación diaria), la
 *   que traiga el dato. Así el administrador central crea la cuenta del
 *   administrador de una institución nueva;
 * - si no trae ninguna y la fila es de una cuenta (`usuario`), la de esa cuenta.
 *   Es lo que pasa con el registro y las entradas que se escriben al entrar,
 *   cuando todavía no hay sesión.
 *
 * Al actualizar, la marca no cambia: se repone la que tenía la fila. Mover una
 * fila de institución partiría su historia en dos, y la segunda barrera de
 * PostgreSQL (D-396) la dejaría donde nadie de la nueva la ve.
 *
 * ## Por qué un gancho de colección y no el acceso del campo
 *
 * Payload aplica el acceso de un campo después de los ganchos de colección
 * (`collections/operations/create.js`): con `access.create: () => false`, la
 * marca que pone este gancho se borraría justo después, en toda escritura con
 * `overrideAccess: false`.
 */

/** Las colecciones que llevan la marca. Las demás son de TraumaHub. */
export const COLECCIONES_CON_INSTITUCION = [
  'usuarios',
  'patologias',
  'maniobras',
  'casos-ao',
  'cirugias',
  'estudios-ia',
  'medios',
  'modelos-3d',
  'actividad',
  'comentarios',
  'registro-de-acciones',
  'entradas',
  'tiempo-activo',
  'revisiones',
  'sesiones-de-revision',
] as const

/**
 * Las que tienen una relación con `usuarios` y no llevan la marca, cada una con
 * su porqué. `tests/unit/marcaDeInstitucion.test.ts` exige que toda colección
 * con una cuenta esté en una lista o en la otra.
 */
export const SIN_MARCA_AUNQUE_TENGAN_CUENTA: Record<string, string> = {
  requisitos: 'el buzón de requisitos es del equipo de TraumaHub',
  difusiones: 'las manda TraumaHub, y eligen sus instituciones en E6 (D-375)',
}

export const CAMPO_DE_INSTITUCION: Field = {
  name: 'institucion',
  type: 'relationship',
  relationTo: 'instituciones',
  index: true,
  label: 'Institución',
  admin: {
    readOnly: true,
    position: 'sidebar',
    description: 'Vacía si es de TraumaHub. La pone la plataforma al crear la fila y no cambia.',
  },
}

/** La institución de la cuenta con ese identificador, o `null`. No lanza. */
async function institucionDeLaCuenta(req: PayloadRequest, usuario: unknown): Promise<string | null> {
  const id = idDeInstitucion(usuario)
  if (!id) return null
  try {
    const cuenta = await req.payload.findByID({
      collection: 'usuarios',
      id,
      depth: 0,
      overrideAccess: true,
      select: { institucion: true },
      req,
    })
    return idDeInstitucion((cuenta as { institucion?: unknown }).institucion)
  } catch {
    return null
  }
}

/**
 * El identificador como lo guarda la base: un número. Payload valida el tipo
 * del identificador de una relación, y con la clave `serial` de PostgreSQL un
 * «3» de texto no pasa («El siguiente campo es inválido: Institución»).
 */
const comoGuardar = (id: string | null): number | string | null => (id && /^\d+$/.test(id) ? Number(id) : id)

export const marcarInstitucion: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  if (!data) return data
  if (operation === 'update') {
    data.institucion = comoGuardar(idDeInstitucion((originalDoc as { institucion?: unknown } | undefined)?.institucion))
    return data
  }
  const deLaSesion = usuarioDeSesion(req.user)?.institucion ?? null
  if (deLaSesion) {
    data.institucion = comoGuardar(deLaSesion)
    return data
  }
  const pedida = idDeInstitucion(data.institucion)
  if (pedida) {
    data.institucion = comoGuardar(pedida)
    return data
  }
  // `usuario` es la cuenta dueña de la fila en todas las colecciones de la
  // lista que tienen una. En `usuarios` no existe, y no se busca nada.
  data.institucion = 'usuario' in data ? comoGuardar(await institucionDeLaCuenta(req, data.usuario)) : null
  return data
}

/**
 * La colección con la marca puesta, si va en la lista. El campo se agrega al
 * final, para no mover nada de lo que el panel ya pinta.
 */
export function conMarcaDeInstitucion(coleccion: CollectionConfig): CollectionConfig {
  if (!(COLECCIONES_CON_INSTITUCION as readonly string[]).includes(coleccion.slug)) return coleccion
  return {
    ...coleccion,
    fields: [...coleccion.fields, CAMPO_DE_INSTITUCION],
    hooks: {
      ...coleccion.hooks,
      // Primero, para que los ganchos de la colección vean ya la marca.
      beforeChange: [marcarInstitucion, ...(coleccion.hooks?.beforeChange ?? [])],
    },
  }
}

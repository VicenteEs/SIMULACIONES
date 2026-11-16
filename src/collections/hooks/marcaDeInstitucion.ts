import type { Access, CollectionBeforeChangeHook, CollectionConfig, Field, PayloadRequest, Where } from 'payload'
import { idDeInstitucion, usuarioDeSesion } from '@/access/payload'
import { filtroDeInstitucion, type AlcanceDeInstitucion } from '@/access/reglas'
import { subdominioDeLaPeticionEnCurso } from '@/lib/barreraDeInstitucion'
import { institucionPorSubdominio } from '@/lib/institucionesServidor'

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
 *   cuando todavía no hay sesión;
 * - si no es de ninguna cuenta, la del lugar de la petición (D-399): lo que se
 *   crea sin sesión desde el subdominio de una institución —una solicitud de
 *   cuenta, la línea del registro de una cotización— es de ella. Sin esto, la
 *   segunda barrera de PostgreSQL rechazaría la fila, y con ella la
 *   transacción entera. Fuera de una petición (un guion), de TraumaHub.
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
 * Las que se comparten: el contenido y sus archivos. Lo central publicado lo
 * lee también la institución (D-396). Las demás de la lista son de cada una.
 */
export const COLECCIONES_COMPARTIDAS = [
  'patologias',
  'maniobras',
  'casos-ao',
  'cirugias',
  'estudios-ia',
  'medios',
  'modelos-3d',
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
 * La institución del lugar de la petición en curso, o `null` si es la central o
 * no hay petición. No lanza: sin poder leerla, la fila queda de TraumaHub, y
 * desde una institución la barrera de la base la rechaza en vez de dejarla
 * pasar.
 */
async function institucionDelLugar(req: PayloadRequest): Promise<string | null> {
  const subdominio = subdominioDeLaPeticionEnCurso()
  if (!subdominio) return null
  try {
    return (await institucionPorSubdominio(req.payload, subdominio))?.id ?? null
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
  // lista que tienen una. En `usuarios` no existe.
  if ('usuario' in data && data.usuario !== null && data.usuario !== undefined && data.usuario !== '') {
    data.institucion = comoGuardar(await institucionDeLaCuenta(req, data.usuario))
    return data
  }
  data.institucion = comoGuardar(await institucionDelLugar(req))
  return data
}

/**
 * El acceso de la colección con la institución sumada (P-016 E5.3).
 *
 * Lo que diga el acceso de siempre —el rol, los módulos, la mantención— sigue
 * mandando; la institución solo recorta, nunca amplía. Si el de siempre niega,
 * se niega sin preguntar más; si deja todo, queda el filtro de institución; y
 * si filtra, se juntan los dos con `and`.
 *
 * Esto cubre lo que se lee con `overrideAccess: false`: las páginas de los
 * módulos, la API que queda abierta y los archivos que sirve Payload
 * (`checkFileAccess` pregunta el `read` de la colección). Lo que el panel
 * consulta con `overrideAccess: true` no pasa por aquí: eso lo para la segunda
 * barrera, en PostgreSQL (E5.4).
 */
function conInstitucion(
  base: Access | undefined,
  opciones: Parameters<typeof filtroDeInstitucion>[1],
): Access {
  return async (args) => {
    // Sin acceso declarado, Payload deja pasar a cualquier sesión: lo mismo.
    const delRol = base ? await base(args) : Boolean(args.req?.user)
    if (delRol === false) return false
    const deLaInstitucion = filtroDeInstitucion(usuarioDeSesion(args.req?.user), opciones)
    if (deLaInstitucion === false) return false
    if (delRol === true) return deLaInstitucion as Where
    return { and: [delRol, deLaInstitucion as Where] }
  }
}

/**
 * La colección con la marca puesta, si va en la lista. El campo se agrega al
 * final, para no mover nada de lo que el panel ya pinta.
 */
export function conMarcaDeInstitucion(coleccion: CollectionConfig): CollectionConfig {
  if (!(COLECCIONES_CON_INSTITUCION as readonly string[]).includes(coleccion.slug)) return coleccion
  const alcance: AlcanceDeInstitucion = (COLECCIONES_COMPARTIDAS as readonly string[]).includes(coleccion.slug)
    ? 'compartido'
    : 'propio'
  const versionada = Boolean(coleccion.versions)
  const acceso = coleccion.access ?? {}
  return {
    ...coleccion,
    fields: [...coleccion.fields, CAMPO_DE_INSTITUCION],
    access: {
      ...acceso,
      read: conInstitucion(acceso.read, { alcance, operacion: 'leer', versionada }),
      update: conInstitucion(acceso.update, { alcance, operacion: 'escribir', versionada }),
      delete: conInstitucion(acceso.delete, { alcance, operacion: 'escribir', versionada }),
      // Las versiones, solo las propias: quien no puede editar lo central no
      // tiene por qué leer sus borradores. Sus campos viven en `version`.
      ...(versionada
        ? {
            readVersions: conInstitucion(acceso.readVersions, {
              alcance,
              operacion: 'escribir',
              versionada,
              campo: 'version.institucion',
              estado: 'version._status',
            }),
          }
        : {}),
    },
    hooks: {
      ...coleccion.hooks,
      // Primero, para que los ganchos de la colección vean ya la marca.
      beforeChange: [marcarInstitucion, ...(coleccion.hooks?.beforeChange ?? [])],
    },
  }
}

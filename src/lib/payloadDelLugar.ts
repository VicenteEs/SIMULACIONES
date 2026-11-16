import { NotFound, type Payload, type Where } from 'payload'
import { idDeInstitucion } from '@/access/payload'
import { filtroDelLugar } from '@/access/reglas'
import { COLECCIONES_CON_INSTITUCION } from '@/collections/hooks/marcaDeInstitucion'

/**
 * Payload como lo lee el panel de un lugar (P-016 E5.6, D-401): cada lectura
 * de una colección con marca de institución sale ya recortada a ese lugar.
 *
 * El panel lee con `overrideAccess: true` en más de doscientos sitios, así que
 * el filtro de `reglas.ts` no lo alcanza. Ponerlo a mano en cada consulta era
 * la forma segura de olvidar una. Aquí se pone en un solo sitio: la pantalla
 * pide este Payload en vez del de siempre, y todo lo que lee —también lo que
 * leen por ella `leerTodas` y los tableros— pasa por el filtro.
 *
 * - **Las cuentas, el contenido y lo personal**: solo lo del lugar. Para la
 *   central, lo que no tiene institución; para una institución, lo suyo. Una
 *   institución no lista a las cuentas de TraumaHub ni sus fichas, y la central
 *   no lista las de las instituciones (D-396).
 * - **Los medios y los modelos 3D**: lo del lugar y además lo de TraumaHub, si
 *   el lugar es una institución. Su contenido los enlaza: un docente que arma un
 *   caso quirúrgico elige entre los modelos del catálogo central.
 *
 * Las escrituras, más estrictas: `update` y `delete` solo alcanzan lo propio,
 * también en los medios y los modelos. Leer el catálogo de TraumaHub no es
 * poder cambiarlo. Por identificador, se lee antes la marca de la fila; con
 * `where`, se le junta el filtro. `create` pasa tal cual, porque la marca la
 * pone el gancho con la institución de quien crea (`marcaDeInstitucion.ts`).
 * En el subdominio de una institución la base repite todo esto (D-399); en la
 * central no hay segunda barrera, y esto es lo único que hay.
 *
 * Una fila de otro lugar se porta como si no existiera: `findByID` da `null`
 * con `disableErrors` y si no lanza `NotFound`, como Payload con una que falta.
 * Así la página que ya convierte el 404 en su «no existe» no necesita saber de
 * instituciones, y nadie aprende por el mensaje que la fila está en otra.
 */

const CON_MARCA: ReadonlySet<string> = new Set(COLECCIONES_CON_INSTITUCION)

/** Las que una institución lee también de TraumaHub: las enlaza su contenido. */
const REFERENCIAS_COMPARTIDAS: ReadonlySet<string> = new Set(['medios', 'modelos-3d'])

/** El filtro del lugar para una colección, o `null` si la colección no lleva marca. */
export function filtroDelPanel(coleccion: string, lugar: string | null, campo = 'institucion'): Where | null {
  if (!CON_MARCA.has(coleccion)) return null
  const propio = filtroDelLugar(lugar, campo) as Where
  if (lugar && REFERENCIAS_COMPARTIDAS.has(coleccion)) return { or: [propio, { [campo]: { exists: false } }] }
  return propio
}

/** ¿Puede el panel de ese lugar ver esta fila? Sobre la fila ya leída. */
export function esDelPanel(coleccion: string, fila: unknown, lugar: string | null): boolean {
  if (!CON_MARCA.has(coleccion)) return true
  const suya = idDeInstitucion((fila as { institucion?: unknown } | null)?.institucion)
  if (suya === lugar) return true
  return Boolean(lugar) && suya === null && REFERENCIAS_COMPARTIDAS.has(coleccion)
}

type Argumentos = {
  collection?: string
  id?: string | number
  where?: Where
  select?: Record<string, unknown>
  disableErrors?: boolean
  req?: unknown
}

/** Lo que se lanza ante una fila de otro lugar: el 404 de Payload, en español. */
function noEncontrada(): NotFound {
  const error = new NotFound()
  error.message = 'No se encontró.'
  return error
}

/**
 * La selección con la marca dentro, si se pidió una selección de campos: sin
 * el campo, toda fila parecería de TraumaHub. Una selección que excluye campos
 * (`{ campo: false }`) ya trae la marca, y mezclar los dos modos no se admite.
 */
function conLaMarca(select: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!select) return select
  const incluye = Object.values(select).some((v) => v !== false)
  if (!incluye) {
    const { institucion: _quitada, ...resto } = select
    return resto
  }
  return { ...select, institucion: true }
}

const juntar = (where: Where | undefined, filtro: Where | null): Where | undefined =>
  !filtro ? where : where ? { and: [where, filtro] } : filtro

/** Las lecturas que llevan `where`, y en qué campo está la marca en cada una. */
const LECTURAS_CON_WHERE: Record<string, string> = {
  find: 'institucion',
  count: 'institucion',
  findVersions: 'version.institucion',
  countVersions: 'version.institucion',
}

/**
 * El Payload del panel de ese lugar. `lugar` es la institución efectiva de la
 * sesión (`null`, la central).
 */
export function payloadDelLugar(payload: Payload, lugar: string | null): Payload {
  return new Proxy(payload, {
    get(objetivo, propiedad, receptor) {
      const original = Reflect.get(objetivo, propiedad, receptor) as unknown
      if (typeof original !== 'function' || typeof propiedad !== 'string') return original
      const metodo = original as (...a: unknown[]) => Promise<unknown>

      const campo = LECTURAS_CON_WHERE[propiedad]
      if (campo) {
        return (args: Argumentos, ...resto: unknown[]) =>
          metodo.call(
            objetivo,
            { ...args, where: juntar(args?.where, filtroDelPanel(String(args?.collection), lugar, campo)) },
            ...resto,
          )
      }

      if (propiedad === 'findByID') {
        return async (args: Argumentos, ...resto: unknown[]) => {
          const coleccion = String(args?.collection)
          if (!CON_MARCA.has(coleccion)) return metodo.call(objetivo, args, ...resto)
          const fila = await metodo.call(objetivo, { ...args, select: conLaMarca(args.select) }, ...resto)
          if (!fila || esDelPanel(coleccion, fila, lugar)) return fila
          if (args.disableErrors) return null
          throw noEncontrada()
        }
      }

      if (propiedad === 'update' || propiedad === 'delete') {
        return async (args: Argumentos, ...resto: unknown[]) => {
          const coleccion = String(args?.collection)
          if (!CON_MARCA.has(coleccion)) return metodo.call(objetivo, args, ...resto)
          if (args.id === undefined) {
            return metodo.call(objetivo, { ...args, where: juntar(args.where, filtroDelLugar(lugar) as Where) }, ...resto)
          }
          // Con la misma `req`, para leer dentro de la transacción de quien
          // escribe: fuera de ella, una fila recién creada en esa transacción
          // todavía no existiría.
          const fila = await objetivo.findByID({
            collection: coleccion as never,
            id: args.id,
            depth: 0,
            overrideAccess: true,
            disableErrors: true,
            select: { institucion: true } as never,
            ...(args.req ? { req: args.req as never } : {}),
          })
          if (!fila || idDeInstitucion((fila as { institucion?: unknown }).institucion) !== lugar) throw noEncontrada()
          return metodo.call(objetivo, args, ...resto)
        }
      }

      return metodo.bind(objetivo)
    },
  })
}

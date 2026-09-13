import type { Access, CollectionConfig, FieldAccess } from 'payload'
import { accesoDePropiedad, administracionDeUsuarios } from '@/access/payload'
import { puedeVerModulo, type UsuarioSesion } from '@/access/reglas'

/**
 * Los tres campos que identifican la fila: quién, qué módulo y qué ficha.
 *
 * Los fija el gancho o la acción al crear el registro, y a partir de ahí no se
 * tocan. `admin: { readOnly: true }` no lo impedía: es una indicación para la
 * interfaz de Payload —retirada en D-038— y el servidor nunca la miró. Lo único
 * que filtra campos en escritura es el acceso de campo, y solo sobre los que lo
 * declaran (`fields/hooks/beforeValidate/promise.js`:
 * `if (field.access && field.access[operation])`).
 *
 * El acceso de colección tampoco tapaba el hueco: `accesoDePropiedad` devuelve
 * `{ usuario: { equals: <id> } }`, y ese filtro decide **qué fila** se puede
 * tocar, no qué se escribe dentro. Así que un residente hacía
 * `PATCH /api/actividad/<fila-propia>` con `{"usuario": <otra cuenta>}` y movía
 * su historial de lectura a la cuenta de un compañero: las estadísticas del
 * panel —que el administrador usa para saber quién va al día— daban por leídas
 * fichas que ese compañero nunca abrió, y al residente por no haber leído nada.
 *
 * Solo se cierra la modificación: en la creación el gancho de abajo pone el
 * usuario. Y solo actúa por REST, porque el acceso de campo se salta con
 * `overrideAccess`, que es el valor por omisión de la API local con la que
 * escriben el panel y las acciones de servidor.
 */
const FIJADO_AL_CREAR: { update: FieldAccess } = { update: () => false }

/**
 * Crear una fila exige tener ese módulo entre los suyos.
 *
 * Antes bastaba con una cuenta activa, y eso deja a una kinesióloga con el
 * simulador vetado haciendo `POST /api/actividad` con
 * `{"coleccion":"cirugias","documentoId":"7","completado":true}`: las
 * estadísticas del panel —de donde el administrador saca quién va al día—
 * pasan a contarle como leída una ficha de un módulo que ni siquiera puede
 * abrir. La regla es la misma que gobierna la lectura de ese módulo, y por eso
 * se pregunta a `puedeVerModulo` y no se inventa otra.
 *
 * Sin `coleccion` no hay nada que autorizar, así que se niega: el campo es
 * obligatorio y un `create` sin él no llegaría a guardarse de todos modos.
 *
 * Solo actúa por REST. El panel y `anotar` escriben por la API local, cuyo
 * `overrideAccess` vale `true` por omisión, así que ni pasan por aquí ni se
 * ven afectados —y `anotar` ya valida el módulo con `exigirSlugDeModulo`.
 *
 * Vive aquí y no en `src/access/payload.ts`, que es donde este proyecto
 * promete tener junta toda la política, porque necesita `data` y ese archivo
 * no es de este lote. Queda declarado como pendiente, igual que estuvo
 * `mantenimientoDeContenido` en `Comentarios.ts` antes de mudarse.
 */
const CREACION_DEL_MODULO_PROPIO: Access = ({ req: { user }, data }) => {
  const modulo = (data as { coleccion?: unknown } | undefined)?.coleccion
  if (typeof modulo !== 'string' || !user) return false
  // Se rearma el usuario en lugar de convertirlo de golpe: el documento de
  // Payload trae `id: number` y `activo?: boolean | null`, y `UsuarioSesion`
  // pide `id: string` y `activo: boolean`, así que la conversión directa ni
  // compila ni diría la verdad. Es la misma normalización que hace
  // `src/access/payload.ts` para sus vecinas, y por eso esto se muda allí en
  // cuanto ese archivo se pueda tocar.
  const cuenta = user as {
    id?: unknown
    rol?: unknown
    activo?: unknown
    modulosVisibles?: unknown
  }
  const sesion: UsuarioSesion = {
    id: String(cuenta.id ?? ''),
    rol: cuenta.rol as UsuarioSesion['rol'],
    activo: cuenta.activo === true,
    modulosVisibles: Array.isArray(cuenta.modulosVisibles)
      ? (cuenta.modulosVisibles as string[])
      : undefined,
  }
  return puedeVerModulo(sesion, modulo)
}

/**
 * Seguimiento de lectura: qué ficha visitó cada usuario y cuál dio por leída.
 *
 * No es analítica de producto sino la base del progreso que ve el residente y
 * del panel de actividad del administrador. Un registro por usuario y ficha; se
 * actualiza en lugar de acumular filas, porque interesa el estado, no el
 * historial completo de visitas.
 */
export const Actividad: CollectionConfig = {
  slug: 'actividad',
  labels: { singular: 'Actividad', plural: 'Actividad' },
  admin: {
    useAsTitle: 'documentoId',
    defaultColumns: ['usuario', 'coleccion', 'completado', 'ultimaVisita'],
    group: 'Administración',
    description: 'Qué ha visitado y marcado como leído cada residente.',
  },
  access: {
    read: accesoDePropiedad,
    create: CREACION_DEL_MODULO_PROPIO,
    update: accesoDePropiedad,
    delete: administracionDeUsuarios,
  },
  /**
   * Una sola fila por usuario y ficha, y que lo garantice la base.
   *
   * El invariante lo prometía la cabecera de esta colección —«un registro por
   * usuario y ficha»— y no lo sostenía nadie: la migración inicial declara
   * índices sueltos sobre `usuario_id`, `documento_id` y `ultima_visita`, y
   * ninguno compuesto. `anotar` consulta y, si no hay fila, crea; entre esas
   * dos operaciones caben dos pestañas abiertas a la vez —abrir una ficha y
   * marcarla enseguida son dos llamadas que viajan en paralelo— y quedaban dos
   * filas. Entonces marcar como leída tocaba una y la otra se quedaba en
   * `completado: false` para siempre: la portada seguía ofreciendo en «Continúa
   * leyendo» una ficha que el residente marcaba una vez y otra sin entender por
   * qué, y `resumenDeActividad` contaba la lectura dos veces.
   *
   * El lado de la aplicación ya estaba puesto para esto: el `catch` del
   * `create` de `acciones/actividad.ts` reintenta sobre lo que ya existe, así
   * que el choque del índice no le llega al residente como un error.
   *
   * Ojo al tocarlo: cambiar estos tres campos —o el orden— no basta con
   * escribirlo aquí. Necesita su `npx payload migrate:create`, y la migración
   * tiene que empezar borrando los duplicados que ya haya o `CREATE UNIQUE
   * INDEX` falla y con él el despliegue entero.
   */
  indexes: [{ fields: ['usuario', 'coleccion', 'documentoId'], unique: true }],
  hooks: {
    beforeChange: [
      ({ req, data, operation }) => {
        const ahora = new Date().toISOString()
        if (operation === 'create') {
          return { ...data, usuario: req.user?.id, ultimaVisita: ahora }
        }
        if (operation === 'update') {
          return { ...data, ultimaVisita: ahora }
        }
        return data
      },
    ],
  },
  fields: [
    {
      name: 'usuario',
      type: 'relationship',
      relationTo: 'usuarios',
      required: true,
      access: FIJADO_AL_CREAR,
      admin: { readOnly: true },
    },
    {
      name: 'coleccion',
      type: 'select',
      required: true,
      options: [
        { label: 'patologias', value: 'patologias' },
        { label: 'maniobras', value: 'maniobras' },
        { label: 'casos-ao', value: 'casos-ao' },
        { label: 'cirugias', value: 'cirugias' },
        { label: 'estudios-ia', value: 'estudios-ia' },
      ],
      access: FIJADO_AL_CREAR,
      admin: { readOnly: true },
    },
    {
      name: 'documentoId',
      type: 'text',
      required: true,
      index: true,
      access: FIJADO_AL_CREAR,
      admin: { readOnly: true },
    },
    {
      // Este no lleva acceso de campo y no hace falta: el gancho de arriba lo
      // reescribe con la hora actual en cada creación y en cada modificación,
      // así que lo que mande el cliente se pierde de todos modos. Si algún día
      // el gancho deja de fijarlo, este campo necesita el mismo cierre que los
      // tres de arriba.
      name: 'ultimaVisita',
      type: 'date',
      index: true,
      admin: { readOnly: true },
    },
    {
      name: 'completado',
      type: 'checkbox',
      defaultValue: false,
    },
  ],
}

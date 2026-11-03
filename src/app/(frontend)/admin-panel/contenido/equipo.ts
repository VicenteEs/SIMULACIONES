import type { Payload } from 'payload'
import { puedeEditarModulo, type Rol } from '@/access/reglas'
import { leerTodas } from '@/lib/leerTodas'
import { diasEntre } from '@/lib/series'
import { MODULOS } from '../modulos'

/**
 * El tablero de «Equipo» (P-007 E5, D-238): quién revisa qué, cuánta revisión
 * tiene encima cada uno y qué módulos se quedan sin nadie si falta una persona.
 *
 * Sale de dos tablas que ya existen. De `usuarios`, quién es del equipo y qué
 * módulos puede editar —con `puedeEditarModulo`, la misma regla que gobierna la
 * base, para que «puede validar aquí» no diga otra cosa que el permiso—. De
 * `revisiones`, lo asignado a cada uno (`asignadaA`) y lo que validó
 * (`listaPor` con su `listaEn`). Las dos cifras se cuentan como en la
 * auditoría (`armarAuditoria`): validadas, las que firmó y siguen firmadas;
 * pendientes, las asignadas que no están validadas ni publicadas. Contadas de
 * otra manera, «Equipo» y «Auditoría» dirían dos números de la misma persona.
 *
 * **Lo que no se cuenta, y por qué.** Penpot pone bajo cada nombre un cargo y
 * una especialidad («Jefe de programa · Rodilla») y un estado «En pausa». La
 * cuenta no guarda ni cargo ni especialidad —el cargo de `equipo` es el de la
 * página pública y no está atado a ninguna cuenta—, y la única pausa que existe
 * es la cuenta desactivada. Se enseña la institución, que sí se guarda, y
 * «Desactivada» cuando lo está (E6).
 */

const EN_COLA = ['pendiente', 'en-revision', 'devuelta']

export interface PersonaDelEquipo {
  id: string
  nombre: string
  rol: Rol
  activa: boolean
  institucion: string
  /** Los módulos que puede editar, en el orden de siempre; un administrador, todos. */
  modulos: string[]
  /** Las que validó y siguen validadas por ella (`listaPor`). */
  validadas: number
  /** Las asignadas que llevan menos de una semana en la cola, y las que llevan una o más. */
  pendientesRecientes: number
  pendientesAntiguas: number
}

export interface TableroDelEquipo {
  personas: PersonaDelEquipo[]
  /** Las fichas en cola que nadie tiene asignadas. */
  sinAsignar: number
  /** Cuántos editores activos pueden validar en cada módulo. */
  cobertura: { slug: string; editores: number }[]
  /** Los administradores activos: pueden validar en todos, y no cuentan en la cobertura. */
  administradores: number
}

const idDe = (valor: unknown): string | null => {
  const crudo = typeof valor === 'object' && valor ? (valor as { id?: unknown }).id : valor
  return crudo === null || crudo === undefined || crudo === '' ? null : String(crudo)
}

const lista = (valor: unknown): string[] => (Array.isArray(valor) ? valor.map(String) : [])

/** Los módulos que la cuenta podría editar si estuviera activa: la tarjeta dice su encargo aunque esté desactivada. */
const modulosDe = (cuenta: Record<string, unknown>): string[] =>
  MODULOS.map((m) => m.slug).filter((slug) =>
    puedeEditarModulo(
      {
        id: String(cuenta.id),
        rol: cuenta.rol as Rol,
        activo: true,
        modulosVisibles: lista(cuenta.modulosVisibles),
        modulosEditables: lista(cuenta.modulosEditables),
      },
      slug,
    ),
  )

/**
 * El tablero a partir de las filas, sin base: lo que la prueba alcanza.
 *
 * Entra al equipo toda cuenta de editor —con o sin trabajo, porque un editor
 * sin nada asignado es justo lo que hay que ver— y la de cualquier otra cuenta
 * que tenga fichas asignadas o validadas: un administrador que revisa también
 * carga revisión. Las solicitudes sin resolver no: todavía no son de nadie.
 */
export function armarEquipo(
  cuentas: readonly Record<string, unknown>[],
  revisiones: readonly Record<string, unknown>[],
  hoy: Date = new Date(),
): TableroDelEquipo {
  const enCola = revisiones.filter((r) => EN_COLA.includes(String(r.estado)))
  const conTrabajo = new Set(
    revisiones.flatMap((r) => [
      EN_COLA.includes(String(r.estado)) ? idDe(r.asignadaA) : null,
      r.listaEn ? idDe(r.listaPor) : null,
    ]),
  )
  const delEquipo = cuentas.filter(
    (c) => c.pendiente !== true && (c.rol === 'editor' || conTrabajo.has(String(c.id))),
  )

  const personas = delEquipo.map((c): PersonaDelEquipo => {
    const id = String(c.id)
    const suyas = enCola.filter((r) => idDe(r.asignadaA) === id)
    const antiguas = suyas.filter((r) => (diasEntre(r.createdAt, hoy) ?? 0) >= 7).length
    return {
      id,
      nombre: String(c.nombre || c.email || `#${id}`),
      rol: c.rol as Rol,
      activa: c.activo === true,
      institucion: typeof c.institucion === 'string' ? c.institucion : '',
      modulos: modulosDe(c),
      validadas: revisiones.filter((r) => r.listaEn && idDe(r.listaPor) === id).length,
      pendientesRecientes: suyas.length - antiguas,
      pendientesAntiguas: antiguas,
    }
  })
  // Primero las activas y, entre ellas, quien más carga tiene: es a quien se
  // mira cuando la cola no avanza.
  personas.sort(
    (a, b) =>
      Number(b.activa) - Number(a.activa) ||
      b.pendientesRecientes + b.pendientesAntiguas - (a.pendientesRecientes + a.pendientesAntiguas) ||
      a.nombre.localeCompare(b.nombre, 'es'),
  )

  const activas = cuentas.filter((c) => c.activo === true && c.pendiente !== true)
  return {
    personas,
    sinAsignar: enCola.filter((r) => idDe(r.asignadaA) === null).length,
    cobertura: MODULOS.map((m) => ({
      slug: m.slug,
      editores: activas.filter((c) => c.rol === 'editor' && modulosDe(c).includes(m.slug)).length,
    })),
    administradores: activas.filter((c) => c.rol === 'admin').length,
  }
}

/** El tablero de «Equipo», o `null` si alguna de las dos tablas no contestó. */
export async function leerEquipo(payload: Payload): Promise<TableroDelEquipo | null> {
  try {
    const [cuentas, revisiones] = await Promise.all([
      leerTodas(payload, {
        coleccion: 'usuarios',
        where: { rol: { in: ['editor', 'admin'] } },
        select: {
          nombre: true,
          email: true,
          rol: true,
          activo: true,
          pendiente: true,
          institucion: true,
          modulosVisibles: true,
          modulosEditables: true,
        },
      }),
      leerTodas(payload, {
        coleccion: 'revisiones',
        select: { estado: true, asignadaA: true, listaPor: true, listaEn: true, createdAt: true },
      }),
    ])
    return armarEquipo(cuentas.docs, revisiones.docs)
  } catch (error) {
    console.error('[panel] no se pudo leer el tablero del equipo:', error)
    return null
  }
}

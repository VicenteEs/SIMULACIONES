import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { SLUGS_DE_MODULOS } from '@/collections'
import { resumirRecorridos, type ResumenDeRecorridos } from '@/lib/progresoDelSimulador'
import { leerTodas } from '@/lib/leerTodas'
import { esDelEquipo, filasDeQuien, type QuienLee } from '@/lib/seguimiento'
import { MODULOS, NOMBRE_DE_MODULO, rutaPublica } from './modulos'

/**
 * Consultas de sólo lectura que alimentan el panel.
 *
 * Viven aquí, y no en `src/lib`, porque son propias del panel y usan
 * `overrideAccess`: quien llega hasta aquí ya pasó por la guardia de
 * administrador del layout y de cada página, y el panel necesita ver también lo
 * que un lector no vería —borradores, cuentas desactivadas, comentarios ajenos.
 *
 * Todos los conteos toleran el fallo: si una colección no responde se sigue
 * adelante en lugar de tumbar la página entera. Un panel que no abre es justo
 * lo contrario de lo que hace falta cuando algo va mal. Lo que no se hace es
 * callarlo hacia dentro: el fallo queda en el registro del servidor y viaja en
 * `ilegible`, al lado de los ceros de relleno.
 *
 * `ilegible` lo consume `page.tsx` de este mismo directorio, y lo usa en tres
 * sitios: pinta «—» donde iría el cero de relleno, no dibuja la barra de
 * progreso de un módulo que no se pudo leer, y avisa arriba del todo nombrando
 * los módulos que faltan, porque cambia cómo se leen todos los números de esa
 * pantalla. Quien añada aquí un conteo nuevo tiene que propagarle su
 * `ilegible`: sin eso, esa tarjeta vuelve a enseñar un cero que parece un
 * recuento y no lo es.
 */

export const clientePayload = (): Promise<Payload> => getPayload({ config })

/**
 * Cuántos hay, o `null` si la base no supo responder.
 *
 * Devolver cero ante una excepción hacía que un módulo cuya tabla falta —el
 * caso que AGENTS.md advierte: desplegar un cambio de esquema sin su
 * migración— se viera exactamente igual que una instalación recién hecha, que
 * nace vacía por decisión (D-016): tarjeta a cero, barra al 0 % y «sin
 * contenido aún». Ninguna otra pantalla lo contradecía, así que lo razonable
 * era concluir que el contenido se había perdido y ponerse a restaurar un
 * respaldo sobre una base entera. Cero y «no se pudo leer» no son lo mismo.
 */
async function contar(
  payload: Payload,
  coleccion: string,
  where?: Record<string, unknown>,
): Promise<number | null> {
  try {
    const { totalDocs } = await payload.count({
      collection: coleccion as never,
      ...(where ? { where: where as never } : {}),
      overrideAccess: true,
    })
    return totalDocs
  } catch (error) {
    console.error(`[panel] no se pudo contar «${coleccion}»:`, error)
    return null
  }
}

/**
 * Resta dos conteos solo si los dos son números.
 *
 * Cada conteo de un `Promise.all` falla por su cuenta: si caía el total y no
 * el parcial, «inactivos» y «resueltos» salían negativos, que es un número que
 * nadie sabe interpretar y que no se parece a un error.
 */
const diferencia = (total: number | null, parte: number | null): number =>
  total === null || parte === null ? 0 : Math.max(0, total - parte)

export interface ConteoDeModulo {
  slug: string
  nombre: string
  ruta: string
  numero: string
  publicados: number
  borradores: number
  total: number
  /**
   * La base no supo responder por este módulo.
   *
   * Los números que acompañan a esto son ceros de relleno y no se pueden
   * enseñar como un recuento: quien pinte la tarjeta tiene que decir «no se
   * pudo leer» y no «sin contenido aún».
   */
  ilegible: boolean
}

export async function conteosPorModulo(payload: Payload): Promise<ConteoDeModulo[]> {
  return Promise.all(
    MODULOS.map(async (m) => {
      const [publicados, borradores] = await Promise.all([
        contar(payload, m.slug, { _status: { equals: 'published' } }),
        contar(payload, m.slug, { _status: { equals: 'draft' } }),
      ])
      return {
        ...m,
        publicados: publicados ?? 0,
        borradores: borradores ?? 0,
        total: (publicados ?? 0) + (borradores ?? 0),
        ilegible: publicados === null || borradores === null,
      }
    }),
  )
}

export interface ResumenDeUsuarios {
  total: number
  activos: number
  inactivos: number
  admins: number
  editores: number
  lectores: number
  /** Alguno de los conteos falló: los números son de relleno. */
  ilegible: boolean
}

export async function resumenDeUsuarios(payload: Payload): Promise<ResumenDeUsuarios> {
  const conteos = await Promise.all([
    contar(payload, 'usuarios'),
    contar(payload, 'usuarios', { activo: { equals: true } }),
    contar(payload, 'usuarios', { rol: { equals: 'admin' } }),
    contar(payload, 'usuarios', { rol: { equals: 'editor' } }),
    contar(payload, 'usuarios', { rol: { equals: 'lector' } }),
  ])
  const [total, activos, admins, editores, lectores] = conteos
  return {
    total: total ?? 0,
    activos: activos ?? 0,
    inactivos: diferencia(total, activos),
    admins: admins ?? 0,
    editores: editores ?? 0,
    lectores: lectores ?? 0,
    ilegible: conteos.some((n) => n === null),
  }
}

export interface ResumenDeComentarios {
  total: number
  pendientes: number
  resueltos: number
  /** Alguno de los conteos falló: los números son de relleno. */
  ilegible: boolean
}

export async function resumenDeComentarios(payload: Payload): Promise<ResumenDeComentarios> {
  const [total, pendientes] = await Promise.all([
    contar(payload, 'comentarios'),
    contar(payload, 'comentarios', { estado: { equals: 'pendiente' } }),
  ])
  return {
    total: total ?? 0,
    pendientes: pendientes ?? 0,
    resueltos: diferencia(total, pendientes),
    ilegible: total === null || pendientes === null,
  }
}

/**
 * Lo que el simulador lleva escrito, con su propio `ilegible`.
 *
 * Separado del `ilegible` de la actividad a propósito, y no por prolijidad:
 * son dos consultas distintas y la de aquí es la única que mira columnas
 * nuevas. Compartiendo bandera, una avería en el recuento de partidas pondría
 * «—» en las cifras de lectura, que se leyeron perfectamente, y un panel que
 * dice no saber lo que sabe es tan inútil como uno que se inventa lo que no.
 */
export interface ActividadDelSimulador extends ResumenDeRecorridos {
  /** No se pudieron leer los recorridos: los números son de relleno. */
  ilegible: boolean
}

export interface ResumenDeActividad {
  registros: number
  /** Fichas marcadas como leídas, en total y de siempre. Las de la semana están en `marcadas7dias`. */
  completados: number
  ultimos7dias: number
  lectoresActivos7dias: number
  /** De esas personas, cuántas son residentes y no equipo. */
  residentesActivos7dias: number
  /** Fichas que alguien marcó como leídas en los últimos 7 días (del registro de acciones, que lleva la fecha). */
  marcadas7dias: number
  /**
   * Puntajes y complicaciones del módulo 04.
   *
   * Lo pinta `admin-panel/actividad/page.tsx`, que es donde el profesor va a
   * ver en qué se atasca su gente. Está aquí y no en esa página —que ya se
   * trae la tabla entera y podría contarlo sola— porque lo que decide qué fila
   * es un caso jugado no puede vivir en una pantalla: en cuanto lo haga, la
   * segunda pantalla que lo pregunte contestará otro número.
   */
  simulador: ActividadDelSimulador
  /** Alguno de los conteos de lectura falló: esos números son de relleno. */
  ilegible: boolean
}

/**
 * El rol real de cada cuenta, por identificador; `null` si no se pudo leer.
 *
 * Con esto el seguimiento separa al equipo de los residentes (`src/lib/seguimiento.ts`). Se lee una vez por pantalla y se
 * le pasa a quien lo necesite, y solo la columna del rol: es el único dato de la cuenta que hace falta para decidir.
 */
export async function rolesDeLasCuentas(payload: Payload): Promise<Map<string, string> | null> {
  try {
    const { docs } = await leerTodas(payload, { coleccion: 'usuarios', select: { rol: true } })
    return new Map(docs.map((u) => [String(u.id), typeof u.rol === 'string' ? u.rol : '']))
  } catch (error) {
    console.error('[panel] no se pudieron leer los roles de las cuentas:', error)
    return null
  }
}

/** Una persona distinta por cuenta: lo que dice `Set` de los identificadores de las filas. */
const personasDe = (filas: readonly Record<string, unknown>[]): Set<string> =>
  new Set(filas.map((f) => String(typeof f.usuario === 'object' && f.usuario ? (f.usuario as { id?: unknown }).id : f.usuario)))

export async function resumenDeActividad(
  payload: Payload,
  quien: QuienLee = 'todos',
): Promise<ResumenDeActividad> {
  const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const roles = await rolesDeLasCuentas(payload)
  // Sin los roles no se puede separar a nadie: se avisa como cualquier otra lectura que falló, en vez de mostrar «todos»
  // bajo el rótulo «solo residentes».
  const rolesIlegibles = roles === null && quien !== 'todos'
  const rolDe = roles ?? new Map<string, string>()

  const [registros, completados] = await Promise.all([
    contar(payload, 'actividad'),
    contar(payload, 'actividad', { completado: { equals: true } }),
  ])

  let ultimos7dias = 0
  let lectoresActivos7dias = 0
  let residentesActivos7dias = 0
  let marcadas7dias = 0
  let fallo = rolesIlegibles
  try {
    // Todas las filas de la semana y no las mil más recientes: antes `ultimos7dias` salía de `totalDocs` y era exacto,
    // pero el número de personas salía de las mil filas traídas y se quedaba en un suelo (D-175).
    const recientes = await leerTodas(payload, {
      coleccion: 'actividad',
      where: { ultimaVisita: { greater_than: hace7dias } },
      select: { usuario: true },
    })
    const delPedido = filasDeQuien(recientes.docs, quien, rolDe)
    ultimos7dias = delPedido.length
    // Se cuentan personas distintas, no visitas: diez fichas abiertas por una sola persona no son diez residentes
    // usando la plataforma. Y cada ficha cuenta una vez: `actividad` tiene un índice único sobre (usuario, colección,
    // documento) (`20260913_033442_actividad_una_fila_por_ficha`).
    const personas = personasDe(delPedido)
    lectoresActivos7dias = personas.size
    residentesActivos7dias = [...personas].filter((id) => !esDelEquipo(rolDe.get(id))).length

    // «Marcadas como leídas» de la semana, de verdad: el contador de antes era `completados`, el total de siempre, y la
    // tarjeta lo presentaba junto a «los últimos 7 días». Las marcas con su fecha están en el registro de acciones.
    const marcas = await leerTodas(payload, {
      coleccion: 'registro-de-acciones',
      where: {
        and: [
          { accion: { equals: 'lectura' } },
          { detalle: { equals: 'la marcó como leída' } },
          { fecha: { greater_than: hace7dias } },
        ],
      },
      select: { usuario: true, coleccion: true, documentoId: true },
    })
    const claves = new Set<string>()
    for (const m of filasDeQuien(marcas.docs, quien, rolDe)) {
      claves.add(`${String(typeof m.usuario === 'object' && m.usuario ? (m.usuario as { id?: unknown }).id : m.usuario)}|${String(m.coleccion)}|${String(m.documentoId)}`)
    }
    marcadas7dias = claves.size
  } catch (error) {
    // La actividad es accesoria: si falla, el resto del panel sigue en pie.
    // Pero un cero silencioso aquí se lee como «nadie entró esta semana», que
    // es una conclusión sobre los residentes y no sobre la base.
    console.error('[panel] no se pudo leer la actividad reciente:', error)
    fallo = true
  }

  return {
    registros: registros ?? 0,
    completados: completados ?? 0,
    ultimos7dias,
    lectoresActivos7dias,
    residentesActivos7dias,
    marcadas7dias,
    simulador: await actividadDelSimulador(payload, quien, rolDe),
    ilegible: fallo || registros === null || completados === null,
  }
}

/**
 * Cuántos casos se han recorrido, cuántos terminaron en daño y en qué paso.
 *
 * Se acota a `cirugias` aunque `resumirRecorridos` descarte solo las filas de
 * los otros cuatro módulos: son la inmensa mayoría de la tabla —cinco módulos
 * escriben en ella y solo uno juega— y traérselas para tirarlas es gastarse el
 * tope en lo que no se va a contar.
 *
 * Ese tope es el mismo de la actividad reciente y tiene la misma letra
 * pequeña: pasadas las 1000 filas de simulador, esto se convierte en un suelo
 * y no en un recuento. Subirlo sin más es traerse la tabla a la memoria del
 * servidor; lo que hace falta el día que se llegue ahí es contar en la base, y
 * el agrupado por paso que necesita el panel no se pide con `count`.
 */
async function actividadDelSimulador(
  payload: Payload,
  quien: QuienLee = 'todos',
  rolDe: ReadonlyMap<string, string> = new Map(),
): Promise<ActividadDelSimulador> {
  try {
    // Todas las filas de simulador (D-175): con el tope de mil, pasadas mil filas esto era un suelo y no un recuento. El
    // usuario va como identificador —profundidad 0—: aquí se cuentan pasos, no personas, y solo hace falta para separar
    // al equipo de los residentes.
    const { docs } = await leerTodas(payload, {
      coleccion: 'actividad',
      where: { coleccion: { equals: 'cirugias' } },
    })
    return { ...resumirRecorridos(filasDeQuien(docs, quien, rolDe)), ilegible: false }
  } catch (error) {
    // Un cero aquí se lee como «nadie ha usado el simulador», que es una
    // conclusión sobre los residentes y no sobre la base. Es el mismo error que
    // `contar` dejó de cometer.
    console.error('[panel] no se pudieron leer los recorridos del simulador:', error)
    return { casos: 0, casosConComplicacion: 0, complicaciones: 0, atascos: [], ilegible: true }
  }
}

export { SLUGS_DE_MODULOS, MODULOS, NOMBRE_DE_MODULO, rutaPublica }

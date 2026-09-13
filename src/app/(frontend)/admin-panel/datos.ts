import { getPayload, type Payload } from 'payload'
import config from '@payload-config'
import { SLUGS_DE_MODULOS } from '@/collections'
import { resumirRecorridos, type ResumenDeRecorridos } from '@/lib/progresoDelSimulador'
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
  completados: number
  ultimos7dias: number
  lectoresActivos7dias: number
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

export async function resumenDeActividad(payload: Payload): Promise<ResumenDeActividad> {
  const hace7dias = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [registros, completados] = await Promise.all([
    contar(payload, 'actividad'),
    contar(payload, 'actividad', { completado: { equals: true } }),
  ])

  let ultimos7dias = 0
  let lectoresActivos7dias = 0
  let fallo = false
  try {
    const recientes = await payload.find({
      collection: 'actividad',
      where: { ultimaVisita: { greater_than: hace7dias } },
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    })
    ultimos7dias = recientes.totalDocs
    // Se cuentan personas distintas, no visitas: diez fichas abiertas por una
    // sola persona no son diez residentes usando la plataforma.
    //
    // Y cada ficha cuenta una vez: `src/collections/Actividad.ts` declara el
    // índice único sobre (usuario, coleccion, documentoId) y la migración
    // `20260913_033442_actividad_una_fila_por_ficha` lo crea, así que las dos
    // filas gemelas que antes dejaba `anotar` al abrir y marcar a la vez —y
    // que inflaban esta cifra— ya no pueden existir.
    //
    // Ojo con el tope: esto sale de los documentos traídos y no de un
    // `COUNT(DISTINCT …)`, que Payload no ofrece. Pasadas las 1000 filas en
    // una semana, `ultimos7dias` sigue exacto —es `totalDocs`— pero el número
    // de personas se queda en un suelo. Subir el tope sin más es traerse la
    // tabla a la memoria del servidor para contarla.
    lectoresActivos7dias = new Set(
      recientes.docs.map((d) => String((d as { usuario?: unknown }).usuario)),
    ).size
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
    simulador: await actividadDelSimulador(payload),
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
async function actividadDelSimulador(payload: Payload): Promise<ActividadDelSimulador> {
  try {
    const { docs } = await payload.find({
      collection: 'actividad',
      where: { coleccion: { equals: 'cirugias' } },
      limit: 1000,
      // Profundidad 0: de la fila se leen el puntaje y la lista de
      // complicaciones, que viven dentro del documento. El usuario no hace
      // falta —aquí se cuentan pasos, no personas— y poblarlo serían mil
      // consultas más.
      depth: 0,
      overrideAccess: true,
    })
    return { ...resumirRecorridos(docs), ilegible: false }
  } catch (error) {
    // Un cero aquí se lee como «nadie ha usado el simulador», que es una
    // conclusión sobre los residentes y no sobre la base. Es el mismo error que
    // `contar` dejó de cometer.
    console.error('[panel] no se pudieron leer los recorridos del simulador:', error)
    return { casos: 0, casosConComplicacion: 0, complicaciones: 0, atascos: [], ilegible: true }
  }
}

export { SLUGS_DE_MODULOS, MODULOS, NOMBRE_DE_MODULO, rutaPublica }

import type { Payload, Where } from 'payload'
import { leerTodas } from '@/lib/leerTodas'
import { quienEnElRegistro } from '@/lib/registro'
import { esDelEquipo } from '@/lib/seguimiento'
import { claveDeDia, claveDeMes, claveDeSemana, contarEn, diasEntre, ultimasSemanas, ultimosDias, ultimosMeses, type Casilla } from '@/lib/series'
import { MODULOS } from './datos'

/**
 * Lo que el Resumen dibuja además de los conteos de `datos.ts`: las series por
 * fecha, la cola de revisión por módulo y lo último que hizo el equipo (P-007
 * E5, D-238).
 *
 * Cada lectura devuelve `null` si su consulta falló, nunca ceros de relleno,
 * por lo mismo que `contar` en `datos.ts`: una línea plana de lecturas es una
 * afirmación sobre los residentes, y si la tabla no contestó no es verdad.
 */

const idDe = (valor: unknown): string =>
  String(typeof valor === 'object' && valor ? (valor as { id?: unknown }).id : valor)

/** Las aperturas de fichas día a día, separadas por quién lee. */
export interface LecturasPorDia {
  dias: Casilla[]
  residentes: number[]
  equipo: number[]
  /** Las de los últimos 7 días que hicieron residentes de primer año. */
  primerAno7dias: number
  /** Cuántos residentes distintos abrieron alguna ficha en los últimos 7 días. */
  residentesActivos7dias: number
}

/**
 * Las aperturas de fichas en el registro de acciones: la acción «lectura» con
 * detalle «la abrió», o sin detalle, que son las de antes de que se escribiera.
 *
 * Por lo que son y no por lo que no son: `not_equals` se vuelve un `!=` de SQL,
 * que deja fuera las filas sin detalle. La comparten el Resumen y Contenido,
 * que la tenía copiada: dos copias de un filtro acaban contando cosas
 * distintas con el mismo nombre (D-238).
 */
export const APERTURAS: Where[] = [
  { accion: { equals: 'lectura' } },
  { or: [{ detalle: { equals: 'la abrió' } }, { detalle: { exists: false } }] },
]

/**
 * Cuántas fichas se abrieron cada día de los últimos `n`.
 *
 * Sale del registro de acciones, que anota cada apertura con su fecha (acción
 * «lectura»), y no de `actividad`, que guarda una fila por persona y ficha con
 * la última visita: con ella, una ficha abierta lunes y jueves contaría solo el
 * jueves, y las semanas pasadas se irían vaciando a medida que la gente
 * vuelve. Las marcas de «leída» van en la misma acción con otro detalle, y no
 * son aperturas.
 *
 * El rol es el que la cuenta tenía al leer, el que guardó la fila: una
 * residente que después pasa a editora no convierte en lecturas del equipo lo
 * que leyó como residente.
 */
export async function lecturasPorDia(payload: Payload, n: number, etapaDe: ReadonlyMap<string, string>): Promise<LecturasPorDia | null> {
  const dias = ultimosDias(n)
  const desde = new Date()
  desde.setDate(desde.getDate() - n)
  try {
    const { docs } = await leerTodas(payload, {
      coleccion: 'registro-de-acciones',
      where: {
        and: [...APERTURAS, { fecha: { greater_than_equal: desde.toISOString() } }],
      },
      select: { fecha: true, rol: true, usuario: true },
    })
    return repartirLecturas(docs, dias, etapaDe)
  } catch (error) {
    console.error('[panel] no se pudieron leer las lecturas por día:', error)
    return null
  }
}

/**
 * Las aperturas ya leídas, repartidas por día y por quién leía. Aparte de la
 * consulta para poder probarla sin base (`tests/unit/resumenDelPanel.test.ts`).
 */
export function repartirLecturas(
  aperturas: readonly Record<string, unknown>[],
  dias: Casilla[],
  etapaDe: ReadonlyMap<string, string>,
): LecturasPorDia {
  const deResidentes = aperturas.filter((d) => !esDelEquipo(d.rol))
  const hace7 = new Set(dias.slice(-7).map((d) => d.clave))
  const deLaSemana = deResidentes.filter((d) => hace7.has(claveDeDia(d.fecha) ?? ''))
  return {
    dias,
    residentes: contarEn(dias, deResidentes.map((d) => claveDeDia(d.fecha))),
    equipo: contarEn(dias, aperturas.filter((d) => esDelEquipo(d.rol)).map((d) => claveDeDia(d.fecha))),
    primerAno7dias: deLaSemana.filter((d) => etapaDe.get(idDe(d.usuario)) === 'r1').length,
    // De las mismas aperturas y no de `actividad`: contadas de dos tablas, la
    // tarjeta llegó a decir «427 lecturas de residentes · 1 residente activo».
    residentesActivos7dias: new Set(deLaSemana.map((d) => idDe(d.usuario))).size,
  }
}

export interface CuentasDelResumen {
  activas: number
  lectores: number
  editores: number
  admins: number
  instituciones: number
  nuevasEsteMes: number
  /** Las cuentas activas al cierre de cada uno de los últimos seis meses. */
  activasPorMes: number[]
  /** La etapa de formación de cada cuenta, por identificador, para separar a los de primer año. */
  etapaDe: Map<string, string>
}

/**
 * Las cuentas activas por rol y cómo crecieron.
 *
 * «Activas al cierre de cada mes» se cuenta con las que siguen activas hoy y
 * su fecha de alta: una cuenta que se desactivó en septiembre desaparece
 * también de agosto. Es una aproximación —no se guarda cuándo se desactiva una
 * cuenta— y por eso la línea va sin ejes ni cifras, como tendencia de la
 * tarjeta y no como dato.
 */
export async function cuentasDelResumen(payload: Payload): Promise<CuentasDelResumen | null> {
  try {
    const { docs } = await leerTodas(payload, {
      coleccion: 'usuarios',
      select: { rol: true, activo: true, pendiente: true, institucion: true, etapaDeFormacion: true, createdAt: true },
    })
    const activas = docs.filter((u) => u.activo === true && u.pendiente !== true)
    const meses = ultimosMeses(6)
    const altasPorMes = contarEn(meses, activas.map((u) => claveDeMes(u.createdAt)))
    const anteriores = activas.length - altasPorMes.reduce((t, v) => t + v, 0)
    let acumulado = anteriores
    return {
      activas: activas.length,
      lectores: activas.filter((u) => u.rol === 'lector').length,
      editores: activas.filter((u) => u.rol === 'editor').length,
      admins: activas.filter((u) => u.rol === 'admin').length,
      instituciones: new Set(
        activas.map((u) => (typeof u.institucion === 'string' ? u.institucion.split('·')[0].trim().toLowerCase() : '')).filter(Boolean),
      ).size,
      nuevasEsteMes: altasPorMes[altasPorMes.length - 1],
      activasPorMes: altasPorMes.map((altas) => (acumulado += altas)),
      etapaDe: new Map(docs.map((u) => [String(u.id), typeof u.etapaDeFormacion === 'string' ? u.etapaDeFormacion : ''])),
    }
  } catch (error) {
    console.error('[panel] no se pudieron leer las cuentas del resumen:', error)
    return null
  }
}

const EN_COLA = ['pendiente', 'en-revision', 'devuelta']

export interface ColaDelResumen {
  /** Por módulo: cuántas validadas esperan publicarse y cuántas siguen en la cola. */
  porModulo: Map<string, { validadas: number; enCola: number }>
  enCola: number
  /** De las que están en cola, cuántas entraron hace más de una semana. */
  atrasadas: number
  /** Las que entraron a la cola en los últimos 7 días. */
  entradas7dias: number
  /** Las que entraron cada una de las últimas ocho semanas. */
  entradasPorSemana: number[]
}

/**
 * La cola de revisión (D-142) de los módulos de quien mira.
 *
 * La fecha de entrada es la de la fila de `revisiones`, que se crea cuando la
 * ficha llega para revisarse: es la que dice cuánto lleva esperando.
 */
export async function colaDelResumen(payload: Payload, modulos: readonly string[]): Promise<ColaDelResumen | null> {
  if (modulos.length === 0) {
    return { porModulo: new Map(), enCola: 0, atrasadas: 0, entradas7dias: 0, entradasPorSemana: [] }
  }
  try {
    const { docs } = await leerTodas(payload, {
      coleccion: 'revisiones',
      where: { coleccion: { in: [...modulos] } },
      select: { coleccion: true, estado: true, createdAt: true },
    })
    const porModulo = new Map(modulos.map((m) => [m, { validadas: 0, enCola: 0 }]))
    for (const r of docs) {
      const fila = porModulo.get(String(r.coleccion))
      if (!fila) continue
      if (r.estado === 'lista') fila.validadas++
      else if (EN_COLA.includes(String(r.estado))) fila.enCola++
    }
    const enCola = docs.filter((r) => EN_COLA.includes(String(r.estado)))
    const semanas = ultimasSemanas(8)
    const dias = ultimosDias(7)
    return {
      porModulo,
      enCola: enCola.length,
      atrasadas: enCola.filter((r) => (diasEntre(r.createdAt) ?? 0) >= 7).length,
      entradas7dias: contarEn(dias, docs.map((r) => claveDeDia(r.createdAt))).reduce((t, v) => t + v, 0),
      entradasPorSemana: contarEn(semanas, docs.map((r) => claveDeSemana(r.createdAt))),
    }
  } catch (error) {
    console.error('[panel] no se pudo leer la cola de revisión del resumen:', error)
    return null
  }
}

export interface AccionReciente {
  id: string
  quien: string
  accion: string
  coleccion: string
  titulo: string
  detalle: string
  fecha: string
}

/** Lo que el registro no cuenta como «trabajo del equipo»: entrar, salir y leer. */
const NO_ES_TRABAJO = ['lectura', 'sesion-iniciada', 'sesion-cerrada']

/** Las últimas `n` cosas que el equipo cambió, del registro de acciones (D-145). */
export async function actividadReciente(payload: Payload, n = 5): Promise<AccionReciente[] | null> {
  try {
    const { docs } = await payload.find({
      collection: 'registro-de-acciones',
      where: { accion: { not_in: NO_ES_TRABAJO } },
      sort: '-fecha',
      limit: n,
      depth: 0,
      overrideAccess: true,
      select: { usuarioNombre: true, origen: true, accion: true, coleccion: true, titulo: true, detalle: true, fecha: true },
    })
    return (docs as unknown as Record<string, unknown>[]).map((d) => ({
      id: String(d.id),
      // Lo que no hizo una cuenta lo anota el servidor con su origen en
      // minúscula («sistema», «importación»); en la tabla va como un nombre. Sin
      // nombre ni origen es de una cuenta eliminada (D-291), no del servidor.
      quien: quienEnElRegistro(d),
      accion: String(d.accion ?? ''),
      coleccion: String(d.coleccion ?? ''),
      titulo: String(d.titulo ?? ''),
      detalle: String(d.detalle ?? ''),
      fecha: String(d.fecha ?? ''),
    }))
  } catch (error) {
    console.error('[panel] no se pudo leer la actividad reciente:', error)
    return null
  }
}

/**
 * Cuántas fichas se publicaron **por primera vez** en los últimos 7 días.
 *
 * Contar los eventos «publicó» de la semana daba otra cosa: cada corrección de
 * una ficha ya publicada se vuelve a publicar y deja su evento, así que una
 * semana de arreglos sumaba cientos junto a una cifra de fichas que no se
 * había movido. Una ficha cuenta aquí si su primera publicación cae en la
 * semana y si sigue publicada hoy: el chip va junto al total de publicadas, y
 * una ficha publicada el lunes y borrada el martes no lo hace crecer. Si se
 * publicó, se retiró y se volvió a publicar, cuenta la primera.
 */
export async function publicadasEstaSemana(payload: Payload, suyos: readonly string[]): Promise<number | null> {
  // Los módulos de quien mira, como la cifra que acompaña: a un editor de dos
  // módulos el chip le decía «+10» junto a sus siete fichas publicadas, porque
  // contaba las de los cinco.
  const modulos = MODULOS.filter((m) => suyos.includes(m.slug))
  if (modulos.length === 0) return 0
  const desde = new Date()
  desde.setDate(desde.getDate() - 7)
  try {
    const [{ docs }, vigentes] = await Promise.all([
      leerTodas(payload, {
        coleccion: 'registro-de-acciones',
        where: { and: [{ accion: { equals: 'publico' } }, { coleccion: { in: modulos.map((m) => m.slug) } }] },
        select: { coleccion: true, documentoId: true, fecha: true },
      }),
      Promise.all(
        modulos.map(async (m) => {
          const { docs: publicadas } = await leerTodas(payload, {
            coleccion: m.slug,
            where: { _status: { equals: 'published' } },
            select: { _status: true },
          })
          return publicadas.map((d) => `${m.slug}/${String(d.id)}`)
        }),
      ).then((listas) => new Set(listas.flat())),
    ])
    return primerasPublicacionesDesde(docs, vigentes, desde)
  } catch (error) {
    console.error('[panel] no se pudieron contar las publicaciones de la semana:', error)
    return null
  }
}

/**
 * De los eventos «publicó», cuántas fichas que siguen publicadas (`vigentes`,
 * claves «colección/id») tuvieron su primera publicación en `desde` o después.
 */
export function primerasPublicacionesDesde(
  eventos: readonly Record<string, unknown>[],
  vigentes: ReadonlySet<string>,
  desde: Date,
): number {
  const primera = new Map<string, number>()
  for (const d of eventos) {
    const clave = `${String(d.coleccion)}/${String(d.documentoId)}`
    const cuando = new Date(String(d.fecha)).getTime()
    if (!Number.isFinite(cuando) || !vigentes.has(clave)) continue
    primera.set(clave, Math.min(primera.get(clave) ?? Infinity, cuando))
  }
  return [...primera.values()].filter((t) => t >= desde.getTime()).length
}

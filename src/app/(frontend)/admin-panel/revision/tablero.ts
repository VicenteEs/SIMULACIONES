import type { Payload } from 'payload'
import { leerTodas } from '@/lib/leerTodas'
import { claveDeDia, claveDeSemana, contarEn, diasEntre, leerFecha, ultimasSemanas, ultimosDias, type Casilla } from '@/lib/series'

/**
 * Las cifras y los gráficos de «Por revisar» (P-007 E5, D-238): cuántas fichas
 * entran a la cola y cuántas salen validadas cada semana, cuánto tardan en
 * salir y en qué módulo se acumulan.
 *
 * Todo sale de dos fechas que la fila de `revisiones` ya guarda: `createdAt`,
 * que es cuando la ficha llegó a la cola —la fila nace con ella, en
 * `registrarParaRevision`—, y `listaEn`, cuando alguien pulsó «Listo para
 * publicar». No se lee el `historial`, aunque anota cada paso con su fecha:
 * `listaEn` es lo que la auditoría llama «validada el» (`armarAuditoria`), y
 * contar las validaciones de otra columna dejaría dos pantallas del mismo
 * panel diciendo cifras distintas de la misma semana. El precio: una ficha
 * validada, reabierta y vuelta a validar cuenta una vez, en la semana de su
 * última firma.
 *
 * **Lo que no se cuenta, y por qué.** El tablero de Penpot pone una «meta del
 * equipo» bajo las validadas de la semana, y la base no guarda ninguna meta:
 * se queda fuera hasta que alguien la decida y tenga dónde escribirse (E6).
 */

/** Las semanas que dibuja «Entradas y salidas de la cola»: ocho, como el Resumen. */
export const SEMANAS_DEL_GRAFICO = 8

/** Los días que mide «Tiempo medio en cola», y los de antes con que se compara. */
export const DIAS_DEL_TIEMPO_MEDIO = 30

const EN_COLA = ['pendiente', 'en-revision', 'devuelta']
const DIA_MS = 86_400_000

export interface TableroDeLaCola {
  semanas: Casilla[]
  /** Las fichas que llegaron a la cola cada una de esas semanas. */
  entradasPorSemana: number[]
  /** Las que se validaron cada una de esas semanas (por su última validación). */
  validadasPorSemana: number[]
  /** Las que esperan hoy a un revisor: pendientes, en revisión o devueltas. */
  enCola: number
  /** De esas, las que llevan una semana o más esperando. */
  atrasadas: number
  /** Las que entraron en los últimos 7 días. */
  entradas7dias: number
  /** Las validadas en los últimos 7 días, y en los 7 de antes. */
  validadas7dias: number
  validadasAntes7dias: number
  /** La cola de hoy, módulo a módulo, en el orden de los módulos que se pidieron. */
  porModulo: { slug: string; enCola: number }[]
  /**
   * Los días medios entre llegar a la cola y validarse, de las validadas en los
   * últimos `DIAS_DEL_TIEMPO_MEDIO` días; `null` si en ese tiempo no se validó
   * ninguna, que no es lo mismo que cero días.
   */
  diasMedios: number | null
  validadasEnElPeriodo: number
  /** Lo mismo, de los `DIAS_DEL_TIEMPO_MEDIO` días anteriores. */
  diasMediosAntes: number | null
  /** Las que un administrador devolvió y esperan hoy la corrección del revisor. */
  devueltas: number
  /** Las que alguna vez se devolvieron, y las que alguna vez llegaron a revisarse (validadas o devueltas). */
  devueltasAlgunaVez: number
  revisadas: number
}

/** Una fila de `revisiones` con lo que el tablero lee de ella. */
export interface FilaDeLaCola {
  coleccion?: unknown
  estado?: unknown
  createdAt?: unknown
  listaEn?: unknown
  devoluciones?: unknown
}

const media = (valores: number[]): number | null =>
  valores.length === 0 ? null : valores.reduce((t, v) => t + v, 0) / valores.length

/**
 * El tablero a partir de las filas, sin base: lo que la prueba alcanza.
 *
 * `hoy` se recibe para que las semanas y los «últimos 7 días» de la prueba no
 * dependan del día en que corre.
 */
export function resumirCola(filas: readonly FilaDeLaCola[], modulos: readonly string[], hoy: Date = new Date()): TableroDeLaCola {
  const semanas = ultimasSemanas(SEMANAS_DEL_GRAFICO, hoy)
  // Catorce días para comparar dos semanas seguidas con las mismas casillas
  // que usa todo el panel: un «hace 7 días» calculado a mano con milisegundos
  // corta a la hora en que se mira, y la casilla del día no.
  const dias = ultimosDias(14, hoy)
  const ultimos7 = dias.slice(-7)
  const anteriores7 = dias.slice(0, 7)

  const enCola = filas.filter((f) => EN_COLA.includes(String(f.estado)))
  const validadas = filas.filter((f) => leerFecha(f.listaEn) !== null)

  const ahora = hoy.getTime()
  const periodo = DIAS_DEL_TIEMPO_MEDIO * DIA_MS
  // Días con decimales y no `diasEntre`, que redondea hacia abajo: «0 días»
  // para todo lo validado en menos de veinticuatro horas haría parecer
  // instantánea una cola que tarda medio día.
  const espera = (f: FilaDeLaCola) => {
    const llego = leerFecha(f.createdAt)
    const salio = leerFecha(f.listaEn)
    return llego && salio ? Math.max(0, (salio.getTime() - llego.getTime()) / DIA_MS) : null
  }
  const delTramo = (desde: number, hasta: number) =>
    validadas.filter((f) => {
      const t = leerFecha(f.listaEn)?.getTime() ?? Number.NaN
      return t > ahora - desde && t <= ahora - hasta
    })
  const recientes = delTramo(periodo, 0)
  const previas = delTramo(2 * periodo, periodo)
  const esperas = (lista: FilaDeLaCola[]) => lista.map(espera).filter((d): d is number => d !== null)

  const porModulo = new Map(modulos.map((m) => [m, 0]))
  for (const f of enCola) {
    const slug = String(f.coleccion)
    if (porModulo.has(slug)) porModulo.set(slug, (porModulo.get(slug) ?? 0) + 1)
  }

  // Una devuelta cuenta como devuelta alguna vez aunque su contador siga en
  // cero: el estado lo dice con más certeza que un número que pudo no
  // escribirse (las filas de antes de que existiera `devoluciones`).
  const fueDevuelta = (f: FilaDeLaCola) => Number(f.devoluciones ?? 0) > 0 || f.estado === 'devuelta'
  const suma = (valores: number[]) => valores.reduce((t, v) => t + v, 0)

  return {
    semanas,
    entradasPorSemana: contarEn(semanas, filas.map((f) => claveDeSemana(f.createdAt))),
    validadasPorSemana: contarEn(semanas, validadas.map((f) => claveDeSemana(f.listaEn))),
    enCola: enCola.length,
    atrasadas: enCola.filter((f) => (diasEntre(f.createdAt, hoy) ?? 0) >= 7).length,
    entradas7dias: suma(contarEn(ultimos7, filas.map((f) => claveDeDia(f.createdAt)))),
    validadas7dias: suma(contarEn(ultimos7, validadas.map((f) => claveDeDia(f.listaEn)))),
    validadasAntes7dias: suma(contarEn(anteriores7, validadas.map((f) => claveDeDia(f.listaEn)))),
    porModulo: [...porModulo].map(([slug, n]) => ({ slug, enCola: n })),
    diasMedios: media(esperas(recientes)),
    validadasEnElPeriodo: recientes.length,
    diasMediosAntes: media(esperas(previas)),
    devueltas: filas.filter((f) => f.estado === 'devuelta').length,
    devueltasAlgunaVez: filas.filter(fueDevuelta).length,
    revisadas: filas.filter((f) => leerFecha(f.listaEn) !== null || fueDevuelta(f)).length,
  }
}

/**
 * El tablero de la cola de los módulos de quien mira, o `null` si la tabla no
 * contestó: la página lo dice en cada tarjeta en vez de enseñar ceros.
 *
 * Toda la tabla y no la vista de abajo: las cifras hablan de la cola entera de
 * sus módulos, la mire entera o solo lo asignado a usted.
 */
export async function leerTableroDeLaCola(payload: Payload, modulos: readonly string[]): Promise<TableroDeLaCola | null> {
  // Sin módulos que editar no hay nada que leer, y un `in` vacío no se deja a
  // la interpretación de cada versión de Payload.
  if (modulos.length === 0) return resumirCola([], modulos)
  try {
    const { docs } = await leerTodas(payload, {
      coleccion: 'revisiones',
      where: { coleccion: { in: [...modulos] } },
      select: { coleccion: true, estado: true, createdAt: true, listaEn: true, devoluciones: true },
    })
    return resumirCola(docs, modulos)
  } catch (error) {
    console.error('[panel] no se pudo leer el tablero de la cola de revisión:', error)
    return null
  }
}

import { claveDeMes, lecturasPorMes, type QuienLee } from '@/lib/seguimiento'

/**
 * El periodo que miran las estadísticas, y las cuentas de lectura que cambian
 * con él (P-007 E5, D-238).
 *
 * El periodo va en la dirección (`?periodo=`), como el «quién lee» de D-175:
 * cambia lo que se pide a la base y no solo lo que se enseña, y un enlace
 * copiado abre la misma pantalla. Lo que depende de él es todo lo que tiene
 * fecha —las fichas creadas, las lecturas, las más leídas—; lo que es una foto
 * de hoy —cuántas fichas hay, cuántas cuentas— no cambia al moverlo, y su
 * bajada lo dice.
 *
 * Separado de `page.tsx` porque esa página abre Payload: estas cuentas se
 * prueban sin base, en `tests/unit/periodoDeEstadisticas.test.ts`.
 */

export const PERIODOS = [3, 6, 12] as const
export type Periodo = (typeof PERIODOS)[number]

/** Seis, como el tablero de Penpot: doce meses de barras apiladas ya no se leen en una fila. */
export const PERIODO_POR_OMISION: Periodo = 6

/** El valor de `?periodo=`, o el de siempre si no es uno de los ofrecidos: un enlace viejo no rompe la página. */
export function periodoDeLaConsulta(valor: unknown): Periodo {
  const v = Number(Array.isArray(valor) ? valor[0] : valor)
  return (PERIODOS as readonly number[]).includes(v) ? (v as Periodo) : PERIODO_POR_OMISION
}

/**
 * La dirección de la pantalla con un periodo y un «quién», sin los valores por
 * omisión: la de siempre sigue siendo `/admin-panel/estadisticas` a secas.
 */
export function rutaDeEstadisticas(periodo: Periodo, quien: QuienLee): string {
  const consulta = new URLSearchParams()
  if (periodo !== PERIODO_POR_OMISION) consulta.set('periodo', String(periodo))
  if (quien !== 'todos') consulta.set('quien', quien)
  const texto = consulta.toString()
  return `/admin-panel/estadisticas${texto ? `?${texto}` : ''}`
}

const idDe = (valor: unknown): string | null => {
  if (typeof valor === 'number' || typeof valor === 'string') return String(valor)
  if (valor && typeof valor === 'object' && 'id' in valor) return idDe((valor as { id: unknown }).id)
  return null
}

/**
 * Las lecturas de cada módulo en el periodo, en la misma unidad que «Lecturas
 * por mes»: fichas distintas que cada persona abrió cada mes, sumadas mes a mes.
 *
 * Es `lecturasPorMes` (D-175) módulo por módulo, y no una cuenta aparte, para
 * que las dos tarjetas no puedan discrepar: la suma de estas barras es la suma
 * de la línea. Antes salía de `actividad` sin fecha —una fila por persona y
 * ficha desde siempre—, y no cambiaba al mover el periodo.
 */
export function lecturasPorModulo(
  meses: readonly string[],
  eventos: readonly Record<string, unknown>[],
  filas: readonly Record<string, unknown>[],
  modulos: readonly string[],
): number[] {
  return modulos.map((modulo) =>
    lecturasPorMes(
      meses,
      eventos.filter((e) => e.coleccion === modulo),
      filas.filter((f) => f.coleccion === modulo),
    ).reduce((t, v) => t + v, 0),
  )
}

/**
 * Quién abrió qué ficha en el periodo: una fila por persona y ficha, sin
 * repetir, para «Fichas más leídas».
 *
 * La ficha cuenta personas, como contaba antes sobre `actividad`
 * (`fichasConMasLecturas`), pero ahora solo las que la abrieron dentro del
 * periodo: por una apertura del registro con su fecha, o por una fila de
 * `actividad` cuya última visita cae en él, que es lo que cubre lo leído antes
 * de que existiera el registro. Contadas desde siempre, las más leídas eran
 * las más antiguas, y no cambiaban nunca.
 */
export function lectoresEnElPeriodo(
  meses: readonly string[],
  eventos: readonly Record<string, unknown>[],
  filas: readonly Record<string, unknown>[],
): { usuario: string; coleccion: string; documentoId: string }[] {
  const dentro = new Set(meses)
  const vistos = new Map<string, { usuario: string; coleccion: string; documentoId: string }>()
  const anotar = (fecha: unknown, registro: Record<string, unknown>) => {
    const mes = claveDeMes(fecha)
    const usuario = idDe(registro.usuario)
    const documentoId = idDe(registro.documentoId)
    const coleccion = registro.coleccion
    if (mes === null || !dentro.has(mes) || usuario === null || documentoId === null) return
    if (typeof coleccion !== 'string' || coleccion === '') return
    const clave = `${usuario}|${coleccion}|${documentoId}`
    if (!vistos.has(clave)) vistos.set(clave, { usuario, coleccion, documentoId })
  }
  for (const e of eventos) anotar(e.fecha, e)
  for (const f of filas) anotar(f.ultimaVisita, f)
  return [...vistos.values()]
}

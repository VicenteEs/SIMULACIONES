/**
 * Las cifras de Umami para la pestaña «Monitoreo» (P-016 E7, D-408).
 *
 * Puro: lee las respuestas de la API de Umami y las deja como las pinta la
 * pestaña. Las consultas están en `visitasServidor.ts`.
 *
 * Se leen con holgura y no se exige una forma exacta. La API de Umami cambió
 * de forma entre la versión 2 y la 3 (el resumen traía `{ value, prev }` por
 * cifra y ahora trae números sueltos y una `comparison` aparte), y su
 * documentación no dice la forma de todas las respuestas. Aquí se aceptan las
 * dos, y lo que no se entiende queda en `null` en vez de romper la pestaña.
 */

export const PERIODOS_DE_VISITAS = ['24h', '7d', '30d'] as const
export type PeriodoDeVisitas = (typeof PERIODOS_DE_VISITAS)[number]
export const PERIODO_DE_VISITAS_POR_OMISION: PeriodoDeVisitas = '7d'

export const NOMBRE_DEL_PERIODO: Record<PeriodoDeVisitas, string> = {
  '24h': '24 horas',
  '7d': '7 días',
  '30d': '30 días',
}

/** «las últimas 24 horas», «los últimos 7 días»: las horas son femeninas, y la pestaña decía «los últimos 24 horas». */
export const periodoEnPalabras = (periodo: PeriodoDeVisitas): string =>
  periodo === '24h' ? `las últimas ${NOMBRE_DEL_PERIODO[periodo]}` : `los últimos ${NOMBRE_DEL_PERIODO[periodo]}`

export function periodoDeVisitas(valor: unknown): PeriodoDeVisitas {
  const v = Array.isArray(valor) ? valor[0] : valor
  return (PERIODOS_DE_VISITAS as readonly unknown[]).includes(v) ? (v as PeriodoDeVisitas) : PERIODO_DE_VISITAS_POR_OMISION
}

/**
 * Desde cuándo, y en qué unidad se agrupa la serie: por hora en 24 horas, por
 * día en lo demás.
 *
 * Desde el principio de una hora o de un día de Chile, y no justo 24 horas o
 * 7 días antes de ahora. Con el corte a la hora en punto de hace 7 días, el
 * gráfico pintaba ocho barras para «7 días», la primera con medio día dentro,
 * y el de 24 horas, veinticinco: la hora de hace un día, a medias, y la de
 * ahora. Así son siete días del calendario, el de hoy incluido aunque vaya a
 * medias, y las cifras de arriba cuentan exactamente lo que dibujan.
 */
export function intervaloDe(periodo: PeriodoDeVisitas, ahora: Date): { desde: Date; hasta: Date; unidad: 'hour' | 'day' } {
  if (periodo === '24h') {
    // Las horas de Chile empiezan a la vez que las universales: su
    // diferencia es siempre de horas enteras.
    const horaEnPunto = Math.floor(ahora.getTime() / 3_600_000) * 3_600_000
    return { desde: new Date(horaEnPunto - 23 * 3_600_000), hasta: ahora, unidad: 'hour' }
  }
  const dias = periodo === '7d' ? 7 : 30
  // Los días se cuentan en el calendario y no restando horas: restando 144
  // horas, la media noche siguiente al cambio de hora caía en el día de antes.
  // El mediodía universal es de mañana en Chile, y siempre el mismo día.
  const [ano, mes, dia] = llaveDe(ahora, 'day').split('-').map(Number)
  return { desde: inicioDelDia(new Date(Date.UTC(ano, mes - 1, dia - (dias - 1), 12))), hasta: ahora, unidad: 'day' }
}

/**
 * El primer instante del día de Chile en que cae `fecha`.
 *
 * La medianoche de Chile son las 03:00 universales en verano y las 04:00 en
 * invierno, y el día que se adelanta la hora, en septiembre, no existe: ese
 * día empieza a la 01:00. Se busca de hora en hora desde la medianoche
 * universal la primera que ya es ese día. Se intentó restar la diferencia con
 * la hora universal medida en la propia medianoche, y el día del cambio caía en
 * el día anterior.
 */
function inicioDelDia(fecha: Date): Date {
  const dia = llaveDe(fecha, 'day')
  const [ano, mes, numero] = dia.split('-').map(Number)
  const medianocheUniversal = Date.UTC(ano, mes - 1, numero)
  for (let hora = 0; hora < 24; hora++) {
    const instante = new Date(medianocheUniversal + hora * 3_600_000)
    if (llaveDe(instante, 'day') === dia) return instante
  }
  return new Date(medianocheUniversal)
}

export interface CifrasDeVisitas {
  /** Páginas vistas. */
  vistas: number
  /** Personas distintas, como las cuenta Umami: la misma persona en dos equipos son dos. */
  visitantes: number
  /** Visitas: lo que una persona recorre de una vez. */
  visitas: number
  /** Visitas de una sola página. */
  rebotes: number
  /** Segundos, sumados entre todas las visitas. */
  tiempoTotal: number
}

export interface ResumenDeVisitas {
  actual: CifrasDeVisitas
  /** El mismo largo de tiempo justo antes, para el «▲ +14 %». */
  anterior: CifrasDeVisitas | null
}

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Un número suelto (Umami 3) o `{ value }` (Umami 2). */
const valorDe = (v: unknown): number | null =>
  numero(v) ?? (v && typeof v === 'object' ? numero((v as { value?: unknown }).value) : null)

const previoDe = (v: unknown): number | null =>
  v && typeof v === 'object' ? numero((v as { prev?: unknown }).prev) : null

function cifras(o: Record<string, unknown>, leer: (v: unknown) => number | null): CifrasDeVisitas | null {
  const vistas = leer(o.pageviews)
  const visitantes = leer(o.visitors)
  if (vistas === null || visitantes === null) return null
  return {
    vistas,
    visitantes,
    visitas: leer(o.visits) ?? 0,
    rebotes: leer(o.bounces) ?? 0,
    tiempoTotal: leer(o.totaltime) ?? 0,
  }
}

export function leerResumen(crudo: unknown): ResumenDeVisitas | null {
  if (!crudo || typeof crudo !== 'object') return null
  const o = crudo as Record<string, unknown>
  const actual = cifras(o, valorDe)
  if (!actual) return null
  const comparacion = o.comparison
  const anterior =
    comparacion && typeof comparacion === 'object'
      ? cifras(comparacion as Record<string, unknown>, valorDe)
      : cifras(o, previoDe)
  return { actual, anterior }
}

export interface FilaDeVisitas {
  etiqueta: string
  valor: number
}

/** Las métricas por página, por sitio, por origen… `[{ x, y }]`, de mayor a menor. */
export function leerMetricas(crudo: unknown): FilaDeVisitas[] {
  if (!Array.isArray(crudo)) return []
  return crudo
    .flatMap((f) => {
      if (!f || typeof f !== 'object') return []
      const { x, y } = f as { x?: unknown; y?: unknown }
      const valor = numero(y)
      if (valor === null) return []
      return [{ etiqueta: typeof x === 'string' ? x : x === null || x === undefined ? '' : String(x), valor }]
    })
    .sort((a, b) => b.valor - a.valor)
}

/**
 * La serie de páginas vistas, sumada por día o por hora en la hora de Chile.
 * Umami escribe la fecha de cada punto como `2026-11-16 00:00:00` o en ISO;
 * lo que importa es el día y la hora, que van al principio en las dos.
 */
export function leerSerie(crudo: unknown, clave: 'pageviews' | 'sessions'): Map<string, number> {
  const puntos = crudo && typeof crudo === 'object' ? (crudo as Record<string, unknown>)[clave] : null
  const serie = new Map<string, number>()
  if (!Array.isArray(puntos)) return serie
  for (const p of puntos) {
    if (!p || typeof p !== 'object') continue
    const { x, y } = p as { x?: unknown; y?: unknown }
    const valor = numero(y)
    if (typeof x !== 'string' || valor === null) continue
    const llave = x.replace('T', ' ').slice(0, 13)
    serie.set(llave, (serie.get(llave) ?? 0) + valor)
  }
  return serie
}

/** Los activos de los últimos cinco minutos: `{ visitors }`, `{ x }` o un número. */
export function leerActivos(crudo: unknown): number | null {
  const directo = numero(crudo)
  if (directo !== null) return directo
  if (Array.isArray(crudo)) return leerActivos(crudo[0])
  if (!crudo || typeof crudo !== 'object') return null
  const o = crudo as Record<string, unknown>
  return numero(o.visitors) ?? numero(o.x) ?? null
}

const ZONA = 'America/Santiago'

/** `2026-11-16 09`: la llave de un punto de la serie, en la hora de Chile. */
function llaveDe(fecha: Date, unidad: 'hour' | 'day'): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value]),
  )
  const dia = `${partes.year}-${partes.month}-${partes.day}`
  return unidad === 'day' ? dia : `${dia} ${partes.hour}`
}

export interface PuntoDeLaSerie {
  etiqueta: string
  detalle: string
  valor: number
}

/**
 * Un punto por día o por hora del periodo, también los vacíos. Umami no
 * devuelve los días sin visitas, y un gráfico que se los salta junta el lunes
 * con el jueves como si fueran seguidos.
 */
export function serieCompleta(
  serie: Map<string, number>,
  desde: Date,
  hasta: Date,
  unidad: 'hour' | 'day',
): PuntoDeLaSerie[] {
  const paso = unidad === 'day' ? 86_400_000 : 3_600_000
  const vistas = new Set<string>()
  const puntos: PuntoDeLaSerie[] = []
  // De hora en hora aunque la unidad sea el día: con el cambio de hora de
  // Chile un día tiene 23 o 25, y sumar 24 horas justas se saltaría uno.
  for (let t = desde.getTime(); t <= hasta.getTime(); t += Math.min(paso, 3_600_000)) {
    const fecha = new Date(t)
    const llave = llaveDe(fecha, unidad)
    if (vistas.has(llave)) continue
    vistas.add(llave)
    const valor = unidad === 'day' ? (serie.get(llave) ?? sumaDelDia(serie, llave)) : (serie.get(llave) ?? 0)
    puntos.push({
      etiqueta:
        unidad === 'day'
          ? new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, day: 'numeric', month: 'short' }).format(fecha)
          : `${llave.slice(11, 13)}:00`,
      detalle:
        unidad === 'day'
          ? new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, weekday: 'long', day: 'numeric', month: 'long' }).format(fecha)
          : `${new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, day: 'numeric', month: 'long' }).format(fecha)}, ${llave.slice(11, 13)}:00`,
      valor,
    })
  }
  return puntos
}

/** Con la serie por hora y el gráfico por día, el día es la suma de sus horas. */
function sumaDelDia(serie: Map<string, number>, dia: string): number {
  let total = 0
  for (const [llave, valor] of serie) if (llave.startsWith(dia)) total += valor
  return total
}

/** Del sitio de cada visita, el nombre con que se reconoce: la central o la institución. */
export function lugarDelSitio(sitio: string, dominio: string): string {
  if (!sitio) return 'Sin sitio'
  if (sitio === dominio || sitio === `www.${dominio}`) return 'TraumaHub'
  return sitio.endsWith(`.${dominio}`) ? sitio.slice(0, -dominio.length - 1) : sitio
}

/** Nombre del país en español, de su código de dos letras. */
export function nombreDelPais(codigo: string): string {
  if (!/^[A-Z]{2}$/.test(codigo)) return codigo || 'Desconocido'
  try {
    return new Intl.DisplayNames(['es'], { type: 'region' }).of(codigo) ?? codigo
  } catch {
    return codigo
  }
}

const EQUIPOS: Record<string, string> = {
  desktop: 'Computador',
  laptop: 'Portátil',
  tablet: 'Tableta',
  mobile: 'Teléfono',
}

export const nombreDelEquipo = (equipo: string): string => EQUIPOS[equipo] ?? (equipo || 'Desconocido')

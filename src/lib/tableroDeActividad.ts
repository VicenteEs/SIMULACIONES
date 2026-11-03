import { claveDeDia, leerFecha, ultimosDias } from '@/lib/series'

/**
 * Las cuentas del tablero de la pestaña Actividad: cuándo se usa la plataforma
 * y cuánto se lee (P-007 E5, D-238).
 *
 * Puras, como `seguimiento.ts`: la página lee la base, separa las filas por
 * quién lee (`filasDeQuien`) y aquí solo se cuenta. Así lo que decide qué es
 * una apertura, a qué día cae una fila o qué hora es una clave de `porHora` se
 * prueba sin Payload, y el día que otra pantalla quiera la misma cifra la saca
 * de aquí en vez de volver a decidirlo a su manera.
 */

/** Las filas del mapa de calor, de lunes a domingo: la semana de aquí empieza el lunes, como en `series.ts`. */
export const DIAS_DE_LA_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'] as const

/** «los martes»: para decir en una frase cuándo se usa más. */
const LOS_DIAS = ['los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados', 'los domingos']

/**
 * La hora de una clave de `porHora`, o `null` si no es una hora.
 *
 * El servidor escribe «08» (`registrarLatido`, con `padStart`), pero la columna
 * es JSON y acepta cualquier cosa: los datos de demostración la escriben «8», y
 * una fila editada a mano puede traer «8.5» o «mañana». Se acepta la hora con
 * o sin cero delante y se descarta lo demás, en vez de dejar que `Number`
 * convierta «» en la medianoche.
 */
export function horaDeLaClave(clave: string): number | null {
  if (!/^\d{1,2}$/.test(clave)) return null
  const hora = Number(clave)
  return hora <= 23 ? hora : null
}

/** El día de la semana de una fecha, 0 el lunes y 6 el domingo; `null` si no es una fecha. */
export function diaDeLaSemana(valor: unknown): number | null {
  const fecha = leerFecha(valor)
  return fecha ? (fecha.getDay() + 6) % 7 : null
}

/**
 * Los segundos activos de cada día de la semana por hora: `mapa[dia][hora]`.
 *
 * Sale de `tiempo-activo` (una fila por cuenta y día con su `porHora`) y no de
 * las aperturas de fichas: una apertura es un instante, y quien abre una ficha
 * a las 22:58 y la lee hasta la una cuenta en una sola hora. Los segundos por
 * hora dicen cuánto rato hubo alguien delante, que es lo que importa para
 * saber cuándo se estudia.
 *
 * El día es el de la columna `dia` («AAAA-MM-DD», el día local del servidor) y
 * la hora, la de la clave, también local: las dos las escribe el mismo
 * `registrarLatido`, así que no hay zona horaria que reconciliar.
 */
export function mapaDeUso(filas: readonly { dia?: unknown; porHora?: unknown }[]): number[][] {
  const mapa = DIAS_DE_LA_SEMANA.map(() => Array.from({ length: 24 }, () => 0))
  for (const fila of filas) {
    const dia = diaDeLaSemana(fila.dia)
    const porHora = fila.porHora
    if (dia === null || !porHora || typeof porHora !== 'object' || Array.isArray(porHora)) continue
    for (const [clave, valor] of Object.entries(porHora as Record<string, unknown>)) {
      const hora = horaDeLaClave(clave)
      const segundos = typeof valor === 'number' ? valor : Number.NaN
      if (hora === null || !Number.isFinite(segundos) || segundos <= 0) continue
      mapa[dia][hora] += segundos
    }
  }
  return mapa
}

export interface FranjaConMasUso {
  dia: number
  hora: number
  segundos: number
}

/** La celda con más uso del mapa; `null` si está vacío. En empate, la primera de la semana. */
export function franjaConMasUso(mapa: readonly (readonly number[])[]): FranjaConMasUso | null {
  let mejor: FranjaConMasUso | null = null
  for (let dia = 0; dia < mapa.length; dia += 1) {
    for (let hora = 0; hora < mapa[dia].length; hora += 1) {
      const segundos = mapa[dia][hora]
      if (segundos > 0 && (mejor === null || segundos > mejor.segundos)) mejor = { dia, hora, segundos }
    }
  }
  return mejor
}

/** «los martes de 21 a 22 h». */
export const franjaEnPalabras = (franja: FranjaConMasUso): string =>
  `${LOS_DIAS[franja.dia]} de ${franja.hora} a ${franja.hora + 1} h`

/** Qué parte del tiempo cae de lunes a viernes, de 0 a 1; `null` si el mapa está vacío. */
export function parteEntreSemana(mapa: readonly (readonly number[])[]): number | null {
  const suma = (horas: readonly number[]) => horas.reduce((t, v) => t + v, 0)
  const total = mapa.reduce((t, horas) => t + suma(horas), 0)
  if (total === 0) return null
  return mapa.slice(0, 5).reduce((t, horas) => t + suma(horas), 0) / total
}

// ------------------------------------------------------------- las lecturas

const MARCA_DE_LEIDA = 'la marcó como leída'

const idDe = (valor: unknown): string | null => {
  if (typeof valor === 'number' || typeof valor === 'string') return valor === '' ? null : String(valor)
  if (valor && typeof valor === 'object' && 'id' in valor) return idDe((valor as { id: unknown }).id)
  return null
}

export interface LecturasDelPeriodo {
  /** Fichas abiertas en el periodo, contando cada apertura. */
  aperturas: number
  /** Las del periodo anterior de la misma longitud, para la flecha de la cifra. */
  aperturasAntes: number
  /** Las aperturas de cada uno de los últimos días dibujados, del más antiguo a hoy. */
  aperturasPorDia: number[]
  /** Personas distintas que abrieron algo cada uno de esos días. */
  personasPorDia: number[]
  /** Fichas marcadas como leídas cada uno de esos días. */
  marcasPorDia: number[]
  /** Quién abrió alguna ficha en el periodo, por identificador de cuenta. */
  personas: Set<string>
  /** Pares persona y ficha distintos que se abrieron en el periodo. */
  abiertas: number
  /** Pares persona y ficha distintos que se marcaron como leídos en el periodo. */
  marcadas: number
  /** De los abiertos en el periodo, cuántos se marcaron también como leídos en él. */
  marcadasDeLoAbierto: number
  /** Por persona, sus aperturas de cada uno de los días dibujados. */
  aperturasDe: Map<string, number[]>
}

/**
 * Cuánto se leyó en los últimos `dias` y en los `dias` de antes, de los
 * eventos «lectura» del registro de acciones.
 *
 * Del registro y no de `actividad`, por lo mismo que `lecturasPorDia` del
 * Resumen: `actividad` guarda una fila por persona y ficha con la última
 * visita, así que una ficha abierta el lunes y el jueves contaría solo el
 * jueves, y los días pasados se irían vaciando a medida que la gente vuelve.
 *
 * Un evento «lectura» es una apertura salvo que diga que se marcó como leída
 * (`registrarAccion` escribe «la abrió» o «la marcó como leída», y las de antes
 * de eso no traen detalle). Se clasifica aquí y no en la consulta para traer
 * las dos de una vez: la proporción de lo marcado sobre lo abierto necesita las
 * dos del mismo periodo.
 *
 * Una fila sin cuenta —borrada después— cuenta como apertura pero no como
 * persona: hubo lectura, pero no hay a quién contar.
 */
export function resumirLecturas(
  eventos: readonly Record<string, unknown>[],
  { dias = 30, dibujados = 14, hoy = new Date() }: { dias?: number; dibujados?: number; hoy?: Date } = {},
): LecturasDelPeriodo {
  const casillas = ultimosDias(2 * dias, hoy)
  const delPeriodo = new Set(casillas.slice(-dias).map((c) => c.clave))
  const deAntes = new Set(casillas.slice(0, dias).map((c) => c.clave))
  const dibujo = new Map(casillas.slice(-dibujados).map((c, i) => [c.clave, i]))
  const enCero = () => Array.from({ length: Math.min(dibujados, casillas.length) }, () => 0)

  let aperturas = 0
  let aperturasAntes = 0
  const aperturasPorDia = enCero()
  const marcasPorDia = enCero()
  const personasDelDia = aperturasPorDia.map(() => new Set<string>())
  const personas = new Set<string>()
  const abiertas = new Set<string>()
  const marcadas = new Set<string>()
  const aperturasDe = new Map<string, number[]>()

  for (const evento of eventos) {
    const dia = claveDeDia(evento.fecha)
    if (dia === null) continue
    const marca = evento.detalle === MARCA_DE_LEIDA
    if (deAntes.has(dia)) {
      if (!marca) aperturasAntes += 1
      continue
    }
    if (!delPeriodo.has(dia)) continue

    const persona = idDe(evento.usuario)
    const documento = idDe(evento.documentoId)
    const coleccion = typeof evento.coleccion === 'string' && evento.coleccion !== '' ? evento.coleccion : null
    const par = persona && documento && coleccion ? `${persona}|${coleccion}|${documento}` : null
    const i = dibujo.get(dia)

    if (marca) {
      if (par) marcadas.add(par)
      if (i !== undefined) marcasPorDia[i] += 1
      continue
    }
    aperturas += 1
    if (par) abiertas.add(par)
    if (i !== undefined) aperturasPorDia[i] += 1
    if (persona === null) continue
    personas.add(persona)
    if (i === undefined) continue
    personasDelDia[i].add(persona)
    const suya = aperturasDe.get(persona) ?? enCero()
    suya[i] += 1
    aperturasDe.set(persona, suya)
  }

  return {
    aperturas,
    aperturasAntes,
    aperturasPorDia,
    personasPorDia: personasDelDia.map((s) => s.size),
    marcasPorDia,
    personas,
    abiertas: abiertas.size,
    marcadas: marcadas.size,
    marcadasDeLoAbierto: [...marcadas].filter((par) => abiertas.has(par)).length,
    aperturasDe,
  }
}

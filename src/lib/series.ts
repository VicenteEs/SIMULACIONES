import { diaLocal } from '@/lib/registro'

/**
 * Las casillas de tiempo de los gráficos del panel: los últimos N días, semanas
 * o meses, y cuántas cosas caen en cada uno (P-007 E5, D-238).
 *
 * Antes cada pestaña armaba las suyas —`ultimosDoceMeses` en Estadísticas,
 * `claveDeMes` en el seguimiento, `diaLocal` en el registro—, y con dieciséis
 * pestañas que dibujan series se habrían armado dieciséis veces, cada una con
 * su manera de decidir a qué día pertenece una fecha. Dos maneras distintas
 * dejan una lectura de las once de la noche en dos días distintos según la
 * pestaña que se mire.
 *
 * Todo en la zona horaria del servidor, como `diaLocal`, que es como escribe
 * `tiempo-activo` su columna `dia`. En producción el contenedor corre con
 * `TZ=America/Santiago` (`docker-compose.prod.yml`): contar en UTC pondría en
 * el día siguiente todo lo de después de las nueve de la noche.
 *
 * Las etiquetas se arman a mano y no con `toLocaleDateString`, por lo mismo que
 * `cifra`: un Node sin datos de idioma escribe «Oct 5» sin avisar, y estas
 * etiquetas viajan al navegador dentro de un gráfico que se hidrata.
 */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIA_MS = 86_400_000

export interface Casilla {
  /** «2026-11-03» para un día y una semana (su lunes), «2026-11» para un mes. */
  clave: string
  /** Lo corto, para el eje: «3 nov», «nov». */
  etiqueta: string
  /** Lo largo, para el globo y la tabla: «3 nov 2026», «semana del 3 nov». */
  detalle: string
}

/**
 * Una fecha leída de lo que trae la base, o `null`. Acepta `Date`, el texto ISO
 * de Payload y el «AAAA-MM-DD» de `tiempo-activo`, que se lee como el día
 * local y no como la medianoche UTC: `new Date('2026-11-03')` es el 2 de
 * noviembre a las nueve de la noche en Chile.
 */
export function leerFecha(valor: unknown): Date | null {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor
  if (typeof valor !== 'string' || valor === '') return null
  const soloDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor)
  const fecha = soloDia ? new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3])) : new Date(valor)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

/** El lunes de la semana de una fecha, a medianoche local. */
function lunesDe(fecha: Date): Date {
  const lunes = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  // `getDay` cuenta desde el domingo; la semana de aquí empieza el lunes.
  lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
  return lunes
}

const claveDeMesDe = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`

export function claveDeDia(valor: unknown): string | null {
  const fecha = leerFecha(valor)
  return fecha ? diaLocal(fecha) : null
}

export function claveDeSemana(valor: unknown): string | null {
  const fecha = leerFecha(valor)
  return fecha ? diaLocal(lunesDe(fecha)) : null
}

export function claveDeMes(valor: unknown): string | null {
  const fecha = leerFecha(valor)
  return fecha ? claveDeMesDe(fecha) : null
}

/**
 * Los últimos `n` días hasta hoy, del más antiguo al de hoy.
 *
 * Se avanza con `setDate` y no sumando 86.400.000 ms: el día del cambio de
 * hora dura 23 o 25 horas, y sumando milisegundos se repite un día o se salta.
 */
export function ultimosDias(n: number, hoy: Date = new Date()): Casilla[] {
  return Array.from({ length: n }, (_, i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (n - 1 - i))
    const corto = `${fecha.getDate()} ${MESES[fecha.getMonth()]}`
    return { clave: diaLocal(fecha), etiqueta: corto, detalle: `${corto} ${fecha.getFullYear()}` }
  })
}

/** Las últimas `n` semanas, de lunes a domingo, hasta la que contiene hoy. */
export function ultimasSemanas(n: number, hoy: Date = new Date()): Casilla[] {
  const estaSemana = lunesDe(hoy)
  return Array.from({ length: n }, (_, i) => {
    const lunes = new Date(estaSemana.getFullYear(), estaSemana.getMonth(), estaSemana.getDate() - 7 * (n - 1 - i))
    const corto = `${lunes.getDate()} ${MESES[lunes.getMonth()]}`
    return { clave: diaLocal(lunes), etiqueta: corto, detalle: `semana del ${corto}` }
  })
}

/** Los últimos `n` meses hasta el actual. */
export function ultimosMeses(n: number, hoy: Date = new Date()): Casilla[] {
  return Array.from({ length: n }, (_, i) => {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - (n - 1 - i), 1)
    return { clave: claveDeMesDe(fecha), etiqueta: MESES[fecha.getMonth()], detalle: `${MESES[fecha.getMonth()]} ${fecha.getFullYear()}` }
  })
}

/**
 * Cuántas claves caen en cada casilla. Lo que queda fuera —antes de la
 * primera, después de hoy, o `null` porque la fecha no se pudo leer— no cuenta.
 */
export function contarEn(casillas: readonly Casilla[], claves: Iterable<string | null>): number[] {
  return sumarEn(
    casillas,
    Array.from(claves, (clave) => [clave, 1] as const),
  )
}

/** Lo mismo que `contarEn`, pero sumando un valor por clave: minutos, palabras. */
export function sumarEn(casillas: readonly Casilla[], pares: Iterable<readonly [string | null, number]>): number[] {
  const indice = new Map(casillas.map((c, i) => [c.clave, i]))
  const totales = casillas.map(() => 0)
  for (const [clave, valor] of pares) {
    if (clave === null || !Number.isFinite(valor)) continue
    const i = indice.get(clave)
    if (i !== undefined) totales[i] += valor
  }
  return totales
}

/**
 * Cuántos días enteros hay entre dos fechas, para «lleva 9 días en cola».
 * Redondeado hacia abajo: un documento de ayer a las once lleva cero días
 * enteros hoy a las nueve, y decir «1 día» lo envejece antes de tiempo.
 */
export function diasEntre(desde: unknown, hasta: Date = new Date()): number | null {
  const inicio = leerFecha(desde)
  if (!inicio) return null
  return Math.max(0, Math.floor((hasta.getTime() - inicio.getTime()) / DIA_MS))
}

/**
 * «hace 12 min», «hace 2 h», «ayer», «3 nov»: cuándo pasó algo, para las
 * tablas de actividad. Se pinta en el servidor y no se hidrata, así que no
 * tiene el problema de las fechas de D-236; pero una página que queda abierta
 * envejece, y por eso lo de más de dos días va con su fecha y no con «hace 9
 * días».
 */
export function haceCuanto(valor: unknown, ahora: Date = new Date()): string {
  const fecha = leerFecha(valor)
  if (!fecha) return '—'
  const minutos = Math.floor((ahora.getTime() - fecha.getTime()) / 60_000)
  // Una fecha por delante del reloj no es «recién»: pasa cuando quien la
  // escribió usa otra zona horaria (el respaldo de Windows nombra sus
  // archivos con la hora del sistema, D-238). Se dice la hora tal cual, que
  // es lo que permite notar el desfase.
  if (minutos >= -1) {
    if (minutos < 1) return 'recién'
    if (minutos < 60) return `hace ${minutos} min`
    if (minutos < 6 * 60) return `hace ${Math.floor(minutos / 60)} h`
  }
  const hoy = diaLocal(ahora)
  const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1)
  const hora = `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`
  if (diaLocal(fecha) === hoy) return hora
  if (diaLocal(fecha) === diaLocal(ayer)) return `ayer, ${hora}`
  return `${fecha.getDate()} ${MESES[fecha.getMonth()]}${fecha.getFullYear() === ahora.getFullYear() ? '' : ` ${fecha.getFullYear()}`}`
}

/** La suma de los últimos `n` valores de una serie, y la de los `n` de antes. */
export function ultimosYAnteriores(valores: readonly number[], n: number): { ultimos: number; anteriores: number | null } {
  const suma = (lista: readonly number[]) => lista.reduce((t, v) => t + v, 0)
  const ultimos = suma(valores.slice(-n))
  const antes = valores.slice(-2 * n, -n)
  return { ultimos, anteriores: antes.length === n ? suma(antes) : null }
}

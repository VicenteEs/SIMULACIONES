/**
 * El estado del servidor que deja `scripts/estado-del-servidor.sh` (P-016 E7,
 * D-408), leído para la pestaña «Monitoreo».
 *
 * Puro: recibe el texto de los dos archivos y devuelve lo que se pinta. La
 * lectura del disco está en `estadoDelServidorServidor.ts`. Todo se valida
 * campo por campo y lo que no se entiende queda en `null`: el archivo lo
 * escribe un guion del anfitrión que puede ir una versión por delante o por
 * detrás de la aplicación, y un campo de más o de menos no debe dejar la
 * pestaña en blanco.
 */

export interface Contenedor {
  nombre: string
  imagen: string
  /** `running`, `exited`, `restarting`… tal como lo dice Docker. */
  estado: string
  /** «Up 3 hours (healthy)», tal como lo dice Docker. */
  detalle: string
  /** Porcentaje de un núcleo: con cuatro núcleos llega a 400. */
  cpu: number | null
  memoria: number | null
  memoriaPct: number | null
}

export interface FotoDelServidor {
  fecha: Date
  nucleos: number | null
  carga: [number, number, number] | null
  /** Porcentaje del procesador entero ocupado en el segundo que se midió. */
  cpu: number | null
  encendidoSegundos: number | null
  memoria: { total: number; disponible: number } | null
  intercambio: { total: number; libre: number } | null
  discos: { punto: string; total: number; libre: number }[]
  contenedores: Contenedor[]
  /** Lo que respondió `docker` si falló: la foto sale sin contenedores. */
  errorDocker: string | null
}

export interface Muestra {
  fecha: Date
  cpu: number | null
  memoria: number | null
  disco: number | null
  carga: number | null
}

/**
 * Minutos sin foto nueva para dar el guion por detenido. El cron escribe cada
 * minuto; tres dejan pasar un minuto lento sin dar la alarma.
 */
export const MINUTOS_SIN_FOTO_PARA_AVISAR = 3

const numero = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')

function fecha(v: unknown): Date | null {
  if (typeof v !== 'string') return null
  const f = new Date(v)
  return Number.isNaN(f.getTime()) ? null : f
}

function contenedor(v: unknown): Contenedor | null {
  if (!v || typeof v !== 'object') return null
  const c = v as Record<string, unknown>
  const nombre = texto(c.nombre)
  if (!nombre) return null
  return {
    nombre,
    imagen: texto(c.imagen),
    estado: texto(c.estado),
    detalle: texto(c.detalle),
    cpu: numero(c.cpu),
    memoria: numero(c.memoria),
    memoriaPct: numero(c.memoriaPct),
  }
}

function parDe<T extends string>(v: unknown, a: T, b: T): Record<T, number> | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const x = numero(o[a])
  const y = numero(o[b])
  return x === null || y === null ? null : ({ [a]: x, [b]: y } as Record<T, number>)
}

/** La foto de `servidor.json`, o `null` si no es una foto que se entienda. */
export function leerFoto(contenido: string): FotoDelServidor | null {
  let crudo: unknown
  try {
    crudo = JSON.parse(contenido)
  } catch {
    return null
  }
  if (!crudo || typeof crudo !== 'object') return null
  const o = crudo as Record<string, unknown>
  if (o.formato !== 'traumahub/estado-del-servidor') return null
  const cuando = fecha(o.fecha)
  if (!cuando) return null

  const carga = Array.isArray(o.carga) && o.carga.length === 3 && o.carga.every((x) => numero(x) !== null)
    ? (o.carga as [number, number, number])
    : null
  const discos = Array.isArray(o.discos)
    ? o.discos.flatMap((d) => {
        const par = parDe(d, 'total', 'libre')
        const punto = texto((d as { punto?: unknown })?.punto)
        return par && punto ? [{ punto, ...par }] : []
      })
    : []

  return {
    fecha: cuando,
    nucleos: numero(o.nucleos),
    carga,
    cpu: numero(o.cpu),
    encendidoSegundos: numero(o.encendidoSegundos),
    memoria: parDe(o.memoria, 'total', 'disponible'),
    intercambio: parDe(o.intercambio, 'total', 'libre'),
    discos,
    contenedores: Array.isArray(o.contenedores)
      ? o.contenedores.map(contenedor).filter((c): c is Contenedor => c !== null)
      : [],
    errorDocker: texto(o.errorDocker) || null,
  }
}

const decimal = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Las muestras de `historial.csv`, en orden. Las líneas que no se entienden se saltan. */
export function leerHistorial(contenido: string): Muestra[] {
  return contenido
    .split('\n')
    .slice(1)
    .flatMap((linea) => {
      const [f, cpu, memoria, disco, carga] = linea.trim().split(',')
      const cuando = fecha(f)
      return cuando
        ? [{ fecha: cuando, cpu: decimal(cpu), memoria: decimal(memoria), disco: decimal(disco), carga: decimal(carga) }]
        : []
    })
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
}

/** ¿Hace cuánto que el guion no escribe? En minutos enteros. */
export const minutosDesde = (foto: Pick<FotoDelServidor, 'fecha'>, ahora: Date): number =>
  Math.max(0, Math.floor((ahora.getTime() - foto.fecha.getTime()) / 60_000))

export const fotoAtrasada = (foto: Pick<FotoDelServidor, 'fecha'>, ahora: Date): boolean =>
  minutosDesde(foto, ahora) >= MINUTOS_SIN_FOTO_PARA_AVISAR

/** Porcentaje de memoria ocupada: lo que el sistema no tiene disponible. */
export const memoriaOcupada = (m: { total: number; disponible: number }): number =>
  m.total > 0 ? Math.round(1000 * (1 - m.disponible / m.total)) / 10 : 0

export const discoOcupado = (d: { total: number; libre: number }): number =>
  d.total > 0 ? Math.round(1000 * (1 - d.libre / d.total)) / 10 : 0

export interface Tramo {
  inicio: Date
  cpu: number | null
  memoria: number | null
}

/**
 * Las muestras de un minuto, en tramos de `minutos` con su promedio: 1440
 * puntos no caben en un gráfico de la pestaña, y a esa escala un minuto suelto
 * no se distingue. Los tramos sin ninguna muestra —el servidor apagado, el
 * cron detenido— quedan con `null` y no con un cero, que diría que el
 * servidor estuvo ocioso: la pestaña se los salta y dice cuántos faltan.
 */
export function promedioPorTramos(muestras: Muestra[], desde: Date, hasta: Date, minutos = 10): Tramo[] {
  const ancho = minutos * 60_000
  const cuantos = Math.max(0, Math.ceil((hasta.getTime() - desde.getTime()) / ancho))
  const sumas = Array.from({ length: cuantos }, () => ({ cpu: 0, nCpu: 0, memoria: 0, nMemoria: 0 }))
  for (const m of muestras) {
    const i = Math.floor((m.fecha.getTime() - desde.getTime()) / ancho)
    if (i < 0 || i >= cuantos) continue
    if (m.cpu !== null) {
      sumas[i].cpu += m.cpu
      sumas[i].nCpu++
    }
    if (m.memoria !== null) {
      sumas[i].memoria += m.memoria
      sumas[i].nMemoria++
    }
  }
  const redondo = (v: number) => Math.round(v * 10) / 10
  return sumas.map((s, i) => ({
    inicio: new Date(desde.getTime() + i * ancho),
    cpu: s.nCpu ? redondo(s.cpu / s.nCpu) : null,
    memoria: s.nMemoria ? redondo(s.memoria / s.nMemoria) : null,
  }))
}

/** «3 días y 4 horas», «5 horas», «12 minutos». */
export function tiempoEncendido(segundos: number): string {
  const dias = Math.floor(segundos / 86_400)
  const horas = Math.floor((segundos % 86_400) / 3_600)
  const minutos = Math.floor((segundos % 3_600) / 60)
  const s = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
  if (dias > 0) return horas > 0 ? `${s(dias, 'día', 'días')} y ${s(horas, 'hora', 'horas')}` : s(dias, 'día', 'días')
  if (horas > 0) return s(horas, 'hora', 'horas')
  return s(minutos, 'minuto', 'minutos')
}

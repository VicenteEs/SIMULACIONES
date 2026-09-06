/**
 * Nombres, fechas y tamaños de los respaldos.
 *
 * Sin nada del sistema de archivos: el panel de respaldos es un componente de
 * cliente y necesita estas funciones para pintar la tabla. Si vivieran junto a
 * `pg_dump` y `node:fs`, el navegador acabaría intentando cargar medio Node.
 * Lo que toca el disco está en `respaldosServidor.ts`.
 *
 * La convención de nombres es la misma que usa `scripts/respaldar.sh` desde
 * cron —`base-20260906-030000.sql.gz`—, de modo que los respaldos creados desde
 * el panel y los automáticos son indistinguibles: una sola retención los limpia
 * y un solo script los restaura.
 */

export interface Respaldo {
  nombre: string
  bytes: number
  creado: string
  tipo: 'base' | 'medios'
}

const PATRON_NOMBRE = /^(base|medios)-\d{8}-\d{6}\.(sql\.gz|tar\.gz)$/

/**
 * Comprueba que el nombre sea uno de los nuestros.
 *
 * Es la única defensa contra que una petición de descarga o de borrado con
 * `../../.env` en el nombre salga del directorio de respaldos.
 */
export const esNombreDeRespaldo = (nombre: unknown): nombre is string =>
  typeof nombre === 'string' && PATRON_NOMBRE.test(nombre)

/** Marca de tiempo con la que se nombran los archivos: 20260906-143012. */
export function marcaDeTiempo(fecha: Date = new Date()): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return (
    `${fecha.getFullYear()}${dos(fecha.getMonth() + 1)}${dos(fecha.getDate())}` +
    `-${dos(fecha.getHours())}${dos(fecha.getMinutes())}${dos(fecha.getSeconds())}`
  )
}

/** Lee la fecha codificada en el nombre. `null` si el nombre no la lleva. */
export function fechaDeNombre(nombre: string): Date | null {
  const m = /-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\./.exec(nombre)
  if (!m) return null
  const [, a, me, d, h, mi, s] = m
  return new Date(Number(a), Number(me) - 1, Number(d), Number(h), Number(mi), Number(s))
}

/** Tamaño en unidades legibles. 1 048 576 → «1,0 MB». */
export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const unidades = ['KB', 'MB', 'GB', 'TB']
  let valor = bytes / 1024
  let i = 0
  while (valor >= 1024 && i < unidades.length - 1) {
    valor /= 1024
    i += 1
  }
  return `${valor.toFixed(1).replace('.', ',')} ${unidades[i]}`
}

/** Días transcurridos desde una fecha ISO. Negativos se tratan como cero. */
export function diasDesde(iso: string, ahora: number = Date.now()): number {
  return Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 86_400_000))
}

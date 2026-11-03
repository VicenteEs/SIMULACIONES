import type { Respaldo } from '@/lib/respaldos'
import { claveDeDia, haceCuanto, leerFecha, ultimosDias } from '@/lib/series'

/**
 * Los respaldos agrupados por la vez que se hicieron, para las cifras y el
 * gráfico de la pestaña (P-007 E5, D-238).
 *
 * Una noche deja dos archivos con la misma marca de tiempo —`base-…sql.gz` y
 * `medios-…tar.gz`, `scripts/respaldar.sh`—, y lo que el administrador quiere
 * saber es cuánto pesa *un respaldo*, no cada mitad. La marca del nombre es la
 * que une las dos, la misma con la que `restaurar.sh` busca los medios que
 * acompañan a un volcado.
 *
 * Todo sale de `listarRespaldos()`, es decir, del disco: nombre, tamaño y la
 * fecha que lleva el nombre. Lo que no está ahí —cuánto tardó, si se probó a
 * restaurar— no se dibuja.
 */

export interface Corrida {
  /** «20261102-033001», la marca del nombre de los archivos. */
  marca: string
  /** La fecha de la marca, en ISO. */
  fecha: string
  /** Bytes del volcado de la base. */
  base: number
  /** Bytes del paquete de archivos subidos, o `null` si esa vez no se hizo (los de «Respaldar ahora»). */
  medios: number | null
}

const marcaDe = (nombre: string): string | null => /-(\d{8}-\d{6})\./.exec(nombre)?.[1] ?? null

/**
 * Las corridas, de la más antigua a la más reciente, que es el orden de un eje
 * de tiempo.
 *
 * Una corrida sin volcado de la base no cuenta: unos medios sueltos no
 * restauran nada, porque `restaurar.sh` parte siempre de un `base-…`. Pasa si
 * el volcado se descartó por incompleto y los medios ya se habían escrito.
 */
export function corridasDe(respaldos: readonly Respaldo[]): Corrida[] {
  const porMarca = new Map<string, { fecha: string; base: number | null; medios: number | null }>()
  for (const r of respaldos) {
    const marca = marcaDe(r.nombre)
    if (!marca) continue
    const corrida = porMarca.get(marca) ?? { fecha: r.creado, base: null, medios: null }
    if (r.tipo === 'base') corrida.base = r.bytes
    else corrida.medios = r.bytes
    porMarca.set(marca, corrida)
  }
  return [...porMarca.entries()]
    .filter(([, c]) => c.base !== null)
    .map(([marca, c]) => ({ marca, fecha: c.fecha, base: c.base as number, medios: c.medios }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

export const totalDe = (c: Corrida): number => c.base + (c.medios ?? 0)

/**
 * Lo que dice la cifra «Último respaldo»: «hace 2 h», «hoy 03:30», «ayer,
 * 03:30».
 *
 * `haceCuanto` deja solo la hora para lo de hoy, que en una tarjeta suelta se
 * lee como una hora cualquiera; con «hoy» delante no hay duda.
 *
 * `delFuturo` cubre un desajuste que no es de esta pantalla. La fecha sale del
 * nombre del archivo, que el guion escribe con la hora de *su* máquina, y la
 * aplicación la lee con su `TZ`. Si no coinciden —la tarea programada de
 * `respaldar.ps1` en un Windows con otra zona que la de `.env`—, el respaldo de
 * esta noche queda horas por delante del reloj y `haceCuanto` lo daba por
 * «recién». Más de un minuto por delante no es un reloj que va justo: es eso,
 * y la tarjeta lo dice en vez de esconderlo.
 */
export function cuandoFue(fecha: string, ahora: Date = new Date()): { texto: string; delFuturo: boolean } {
  const momento = leerFecha(fecha)
  const delFuturo = momento !== null && momento.getTime() - ahora.getTime() > 60_000
  const texto = haceCuanto(fecha, ahora)
  return { texto: /^\d{2}:\d{2}$/.test(texto) ? `hoy ${texto}` : texto, delFuturo }
}

/** Un punto del gráfico: la etiqueta del eje, la del globo y los dos tamaños. */
export interface PuntoDeTamano {
  etiqueta: string
  detalle: string
  total: number
  base: number
}

const dos = (n: number) => String(n).padStart(2, '0')

/**
 * Las corridas de los últimos `dias` días como puntos del gráfico de tamaño.
 *
 * Un punto por respaldo y no por día: un día sin respaldo no pesa cero —no hay
 * dato—, y una línea que cae a cero esa noche se leería como un respaldo
 * vacío. Las etiquetas son las de `ultimosDias`, para que «2 nov» se escriba
 * aquí como en todos los demás gráficos del panel.
 *
 * `escala` divide los bytes (1.048.576 para MB): `Lineas` es de cliente y no
 * acepta una función de formato desde una página de servidor.
 */
export function puntosDeTamano(corridas: readonly Corrida[], dias: number, escala: number, hoy: Date = new Date()): PuntoDeTamano[] {
  const casillas = new Map(ultimosDias(dias, hoy).map((c) => [c.clave, c]))
  return corridas.flatMap((c) => {
    const casilla = casillas.get(claveDeDia(c.fecha) ?? '')
    const fecha = leerFecha(c.fecha)
    if (!casilla || !fecha) return []
    return [
      {
        etiqueta: casilla.etiqueta,
        detalle: `${casilla.detalle}, ${dos(fecha.getHours())}:${dos(fecha.getMinutes())}${c.medios === null ? ' · solo la base' : ''}`,
        total: totalDe(c) / escala,
        base: c.base / escala,
      },
    ]
  })
}

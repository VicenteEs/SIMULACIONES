import { configuracionDelContador, type ConfiguracionDelContador } from '@/lib/contador'
import { prepararUmami, type EstadoDeUmami } from '@/lib/visitasServidor'

/**
 * Dejar Umami listo al arrancar (P-016 E7, D-408): su clave propia en lugar
 * de la de fábrica, y el sitio que cuenta las visitas.
 *
 * La pestaña «Monitoreo» también lo hace al abrirse, pero eso no basta: hasta
 * que el sitio exista, Umami rechaza cada visita que le llega, y si nadie abre
 * la pestaña en una semana, es una semana sin contar. Además, mientras la clave
 * sea la de fábrica cualquiera dentro de la red de los contenedores entra con
 * ella. Así que lo intenta el proceso que programa las tareas, al poco de
 * arrancar.
 *
 * Con varios intentos y cada vez más espaciados, porque los dos contenedores
 * arrancan a la vez y Umami tarda: la primera vez aplica sus migraciones
 * antes de responder, y el primer intento suele encontrarlo todavía sin
 * escuchar. Después del último se rinde y lo deja escrito; la pestaña lo
 * vuelve a intentar al abrirse, y el error que salga allí es el mismo.
 */

/** Cuánto se espera antes de cada intento: medio minuto, uno, dos, cinco y diez. */
export const ESPERAS_DE_UMAMI_MS = [30_000, 60_000, 120_000, 300_000, 600_000]

const MARCA = Symbol.for('traumahub.umamiProgramado')

interface Reloj {
  setTimeout: (fn: () => void, ms: number) => { unref?: () => void }
}

interface Anotador {
  info: (mensaje: string) => void
  error: (mensaje: string) => void
}

/**
 * Programa los intentos. Devuelve si programó: no lo hace sin Umami
 * configurado (ved, desarrollo), ni dos veces en el mismo proceso.
 */
export function programarUmami({
  configuracion = configuracionDelContador(),
  preparar = prepararUmami,
  reloj = globalThis,
  anotar = console,
}: {
  configuracion?: ConfiguracionDelContador | null
  preparar?: (configuracion: ConfiguracionDelContador) => Promise<EstadoDeUmami>
  reloj?: Reloj
  anotar?: Anotador
} = {}): boolean {
  if (!configuracion) return false
  const global = globalThis as Record<symbol, unknown>
  if (global[MARCA]) return false
  global[MARCA] = true

  const intentar = async (numero: number): Promise<void> => {
    const resultado = await preparar(configuracion).catch(
      (error: Error): EstadoDeUmami => ({ estado: 'error', detalle: error.message }),
    )
    if (resultado.estado === 'listo') {
      anotar.info('[umami] Listo: con su clave propia y el sitio creado.')
      return
    }
    if (resultado.estado === 'sin-configurar') return
    const siguiente = numero + 1
    if (siguiente >= ESPERAS_DE_UMAMI_MS.length) {
      anotar.error(`[umami] No quedó listo tras ${siguiente} intentos: ${resultado.detalle}`)
      return
    }
    reloj.setTimeout(() => void intentar(siguiente), ESPERAS_DE_UMAMI_MS[siguiente]).unref?.()
  }

  reloj.setTimeout(() => void intentar(0), ESPERAS_DE_UMAMI_MS[0]).unref?.()
  return true
}

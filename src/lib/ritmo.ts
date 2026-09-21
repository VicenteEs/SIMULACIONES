/**
 * Cuántas veces se deja hacer algo en una ventana de tiempo.
 *
 * Existe por la solicitud de cuenta, que es la primera acción de la plataforma
 * que cualquiera puede llamar sin cuenta y que **escribe** en la base y **manda
 * correo**. Sin freno, un guion que la llame en bucle llena la tabla de cuentas
 * pendientes, inunda de avisos a los administradores y quema la cuota de envío
 * del hosting —que en cPanel es por hora y compartida con la recuperación de
 * contraseña—: el día del ataque, a quien olvidó su clave no le llega nada.
 *
 * Vive en la memoria del proceso y no en la base, a sabiendas. La plataforma
 * corre en un solo proceso (el servicio de Windows de `docs/SERVIDOR-WINDOWS.md`)
 * y un reinicio que vacíe el contador solo le regala a quien abusa una ventana
 * más. A cambio no añade una tabla ni una escritura por cada intento, que es
 * justo lo que se quiere frenar.
 *
 * El almacén cuelga de `globalThis` y no de una variable del módulo: Next puede
 * cargar el mismo módulo en más de un paquete de servidor, y dos copias del
 * contador son dos límites, es decir, ninguno.
 */

type Almacen = Map<string, number[]>

const LLAVE = Symbol.for('traumahub.ritmo')

function almacen(nombre: string): Almacen {
  const global = globalThis as unknown as { [LLAVE]?: Map<string, Almacen> }
  global[LLAVE] ??= new Map()
  let propio = global[LLAVE].get(nombre)
  if (!propio) {
    propio = new Map()
    global[LLAVE].set(nombre, propio)
  }
  return propio
}

export interface Limitador {
  /** Anota un intento y dice si cabe. Un intento rechazado no cuenta. */
  permitir(clave: string, ahora?: number): boolean
}

/**
 * Los dos topes del propio almacén.
 *
 * La clave casi siempre sale de `X-Forwarded-For`, que escribe quien llama: una
 * cabecera de varios kilobytes distinta en cada petición convertía el freno en
 * la avería, porque cada una dejaba su clave entera en memoria durante una
 * ventana. Recortada, dos cabeceras largas con el mismo principio comparten
 * cupo, y eso solo perjudica a quien las manda así.
 *
 * Y con el almacén lleno de claves todavía vigentes no se abre ninguna nueva:
 * se rechaza. Es fallar cerrando —quien llega en mitad de una inundación espera
 * una ventana— a cambio de que la memoria del proceso tenga techo. Las claves
 * ya conocidas siguen con su cuenta de siempre.
 */
const LARGO_MAXIMO_DE_CLAVE = 64
const MAXIMO_DE_CLAVES = 20_000

export function crearLimitador(nombre: string, { maximo, ventanaMs }: { maximo: number; ventanaMs: number }): Limitador {
  return {
    permitir(claveCruda, ahora = Date.now()) {
      const clave = claveCruda.slice(0, LARGO_MAXIMO_DE_CLAVE)
      const intentos = almacen(nombre)
      if (!intentos.has(clave) && intentos.size >= MAXIMO_DE_CLAVES) {
        for (const [k, v] of intentos) if (v.every((t) => ahora - t >= ventanaMs)) intentos.delete(k)
        if (intentos.size >= MAXIMO_DE_CLAVES) return false
      }
      const recientes = (intentos.get(clave) ?? []).filter((t) => ahora - t < ventanaMs)
      if (recientes.length >= maximo) {
        intentos.set(clave, recientes)
        return false
      }
      recientes.push(ahora)
      intentos.set(clave, recientes)
      // Sin limpieza, cada dirección que pasó una vez se queda en memoria para
      // siempre. Se barre de vez en cuando, no en cada llamada.
      if (intentos.size > 5000) {
        for (const [k, v] of intentos) if (v.every((t) => ahora - t >= ventanaMs)) intentos.delete(k)
      }
      return true
    },
  }
}

/**
 * La dirección de quien llama, tal como la dejan las cabeceras del proxy.
 *
 * Detrás de Tailscale Funnel la conexión llega desde el propio túnel, así que
 * la única pista es `X-Forwarded-For`. Se toma el primer valor. Un cliente puede
 * falsearlo si llega directo al puerto, y por eso este límite va acompañado de
 * uno global que no depende de quién dice ser nadie.
 */
export function direccionDeQuienLlama(cabeceras: Headers): string {
  const reenviada = cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim()
  return reenviada || cabeceras.get('x-real-ip') || 'desconocida'
}

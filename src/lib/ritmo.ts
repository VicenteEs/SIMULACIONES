import { createHmac } from 'node:crypto'
import type { Payload } from 'payload'

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
 * ## Dónde se cuenta
 *
 * Vivió en la memoria del proceso mientras la plataforma corrió en uno solo.
 * Desde D-393 corre en varios, y cada petición cae en cualquiera de ellos: con
 * un contador por proceso, quien insiste pasaría tantas veces el límite como
 * procesos haya. Así que en el servidor se cuenta en la base, en la tabla
 * `intentos` (`tablasInternas.ts`), con un candado por freno y clave para que
 * dos intentos a la vez no lean la misma cuenta y pasen los dos.
 *
 * Lo que costaba eso y era la razón para no hacerlo —una escritura por intento,
 * justo lo que se quiere frenar— sigue acotado: un intento rechazado no se
 * anota, así que la tabla crece solo con lo que el límite deja pasar.
 *
 * Bajo Vitest (`NODE_ENV=test`) se cuenta en memoria, como antes: las pruebas
 * de las acciones no levantan una base para comprobar un mensaje de error, y
 * las de la base prueban el almacén de la base aparte
 * (`tests/integration/estadoCompartido.test.ts`).
 */

/** Guarda los intentos y dice si uno más cabe. */
export interface AlmacenDeIntentos {
  /** Anota el intento si en la ventana hay menos de `maximo`, y dice si cupo. */
  anotar(freno: string, clave: string, maximo: number, ventanaMs: number, ahora: number): Promise<boolean>
}

export interface Limitador {
  /** Anota un intento y dice si cabe. Un intento rechazado no cuenta. */
  permitir(clave: string, ahora?: number): Promise<boolean>
}

/**
 * Los dos topes de la clave.
 *
 * La clave casi siempre sale de `X-Forwarded-For`, que escribe quien llama: una
 * cabecera de varios kilobytes distinta en cada petición convertía el freno en
 * la avería, porque cada una dejaba su clave entera guardada durante una
 * ventana. Recortada, dos cabeceras largas con el mismo principio comparten
 * cupo, y eso solo perjudica a quien las manda así.
 */
const LARGO_MAXIMO_DE_CLAVE = 64

/**
 * La ventana más larga que admite un freno. Lo que pasa de ella se borra de la
 * tabla, así que un freno con una ventana más larga se olvidaría de intentos
 * que aún le cuentan.
 */
export const VENTANA_MAXIMA_MS = 24 * 60 * 60 * 1000

export function crearLimitador(nombre: string, { maximo, ventanaMs }: { maximo: number; ventanaMs: number }): Limitador {
  if (ventanaMs > VENTANA_MAXIMA_MS) throw new Error(`El freno «${nombre}» pide una ventana mayor de un día.`)
  return {
    permitir(claveCruda, ahora = Date.now()) {
      return almacenDeIntentos().anotar(nombre, claveCruda.slice(0, LARGO_MAXIMO_DE_CLAVE), maximo, ventanaMs, ahora)
    },
  }
}

// ------------------------------------------------------------- en memoria

/**
 * El techo del almacén en memoria. Con él lleno de claves todavía vigentes no
 * se abre ninguna nueva: se rechaza. Es fallar cerrando —quien llega en mitad de
 * una inundación espera una ventana— a cambio de que la memoria del proceso
 * tenga techo. Las claves ya conocidas siguen con su cuenta de siempre.
 */
const MAXIMO_DE_CLAVES = 20_000

/**
 * El almacén en memoria cuelga de `globalThis` y no de una variable del módulo:
 * Next puede cargar el mismo módulo en más de un paquete de servidor, y dos
 * copias del contador son dos límites, es decir, ninguno.
 */
const LLAVE = Symbol.for('traumahub.ritmo')

function intentosEnMemoria(freno: string): Map<string, number[]> {
  const global = globalThis as unknown as { [LLAVE]?: Map<string, Map<string, number[]>> }
  global[LLAVE] ??= new Map()
  let propio = global[LLAVE].get(freno)
  if (!propio) {
    propio = new Map()
    global[LLAVE].set(freno, propio)
  }
  return propio
}

export const almacenEnMemoria = (): AlmacenDeIntentos => ({
  async anotar(freno, clave, maximo, ventanaMs, ahora) {
    const intentos = intentosEnMemoria(freno)
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
})

// --------------------------------------------------------------- en la base

/**
 * La huella de una clave: lo que se guarda en la base en lugar de la IP o el
 * correo de quien lo intentó. El freno solo necesita saber si dos intentos son
 * del mismo, y con la huella la tabla —y cada respaldo que la copie— no lleva
 * datos personales. Con `PAYLOAD_SECRET` de llave, para que no baste con
 * calcular la de cada dirección posible y compararlas.
 */
export function huellaDeLaClave(freno: string, clave: string, secreto = process.env.PAYLOAD_SECRET ?? ''): string {
  return createHmac('sha256', secreto).update(`${freno}\u0000${clave}`).digest('base64url').slice(0, 32)
}

/** De cada cuántos intentos permitidos, uno barre de paso lo que ya no cuenta. */
const BARRER_CADA = 200

export function almacenEnLaBase(conseguirPayload: () => Promise<Payload>): AlmacenDeIntentos {
  return {
    async anotar(freno, clave, maximo, ventanaMs) {
      const payload = await conseguirPayload()
      const [{ sql }, { conCandado, ejecutorDe }] = await Promise.all([
        import('@payloadcms/db-postgres'),
        import('./sqlDirecto'),
      ])
      const huella = huellaDeLaClave(freno, clave)
      // Con candado: dos intentos a la vez, en dos procesos, leerían la misma
      // cuenta y pasarían los dos. El reloj es el de la base, el mismo para todos
      // los procesos; `ahora` solo existe para las pruebas del de memoria.
      return conCandado(payload, `ritmo:${freno}:${huella}`, async (req) => {
        const bd = await ejecutorDe(payload, req)
        const { rows } = await bd.execute(sql`
          select count(*)::int as n from intentos
           where freno = ${freno} and clave = ${huella}
             and instante > now() - ${ventanaMs}::int * interval '1 millisecond'`)
        if (Number(rows[0]?.n ?? 0) >= maximo) return false
        await bd.execute(sql`insert into intentos (freno, clave) values (${freno}, ${huella})`)
        if (Math.random() * BARRER_CADA < 1) {
          await bd.execute(sql`delete from intentos where instante < now() - ${VENTANA_MAXIMA_MS}::int * interval '1 millisecond'`)
        }
        return true
      })
    },
  }
}

const ALMACEN = Symbol.for('traumahub.almacenDeIntentos')

async function payloadDeLaAplicacion(): Promise<Payload> {
  const [{ getPayload }, { default: config }] = await Promise.all([import('payload'), import('@payload-config')])
  return getPayload({ config })
}

/** El almacén de esta ejecución: la base en el servidor, la memoria en las pruebas. */
export function almacenDeIntentos(): AlmacenDeIntentos {
  const global = globalThis as unknown as { [ALMACEN]?: AlmacenDeIntentos }
  return (global[ALMACEN] ??=
    process.env.NODE_ENV === 'test' ? almacenEnMemoria() : almacenEnLaBase(payloadDeLaAplicacion))
}

/**
 * La dirección de quien llama, tal como la dejan las cabeceras del proxy.
 *
 * Detrás de Tailscale Funnel la conexión llega desde el propio túnel, así que
 * la única pista es `X-Forwarded-For`. Se toma el **último** valor, que es el
 * que añade el último salto de confianza —Funnel o cloudflared— con la
 * dirección que vio de verdad. Los de delante los escribe el visitante.
 *
 * Se tomaba el primero, y eso era la cabecera entera en manos de quien llama:
 * con un `X-Forwarded-For: 1.2.3.4` distinto en cada intento, el freno de
 * `entrar()`, que es solo por dirección, no frenaba nada (O-072). Con el último
 * hace falta que el proxy de delante reenvíe la cabecera del túnel tal cual; en
 * `ved` lo hace el fragmento de `/traumahub` de Nginx Proxy Manager
 * (`despliegue/paginas/LEEME.md`). Si un proxy la pisara con su `$remote_addr`,
 * el último valor sería la puerta de enlace de Docker y todo el mundo
 * compartiría cupo: falla cerrando, no abriendo.
 */
export function direccionDeQuienLlama(cabeceras: Headers): string {
  const reenviada = cabeceras.get('x-forwarded-for')?.split(',').at(-1)?.trim()
  return reenviada || cabeceras.get('x-real-ip') || 'desconocida'
}
